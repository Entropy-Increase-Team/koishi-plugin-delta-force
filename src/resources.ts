import { Context } from 'koishi'
import * as fs from 'fs'
import * as path from 'path'
import { Config } from './config'

export interface ResourceItem {
  name: string
  path: string
  sha: string
  size: number
  type: 'file' | 'dir'
  download_url: string
  html_url?: string
}

export interface DownloadProgress {
  total: number
  downloaded: number
  current: string
  failed: string[]
}

// 后端 API 响应结构
interface ResourceTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  sha?: string
  download_url?: string
  html_url?: string
  children?: ResourceTreeNode[]
}

interface ResourceTreeResponse {
  code: string
  data: {
    repoKey: string
    syncedAt: string
    totalFiles: number
    totalDirs: number
    totalSize: number
    tree: ResourceTreeNode
  }
}

// Manifest 文件结构（支持断点续传）
interface ManifestFile {
  relativePath: string
  sha: string
  size: number
  downloaded: boolean  // 是否已下载完成
}

interface Manifest {
  version: string
  files: ManifestFile[]
}

const GH_PROXY_PREFIX = 'https://edgeone.gh-proxy.org/'

export class ResourceManager {
  private resourcesPath: string
  private logger: ReturnType<Context['logger']>
  private isDownloading = false
  private currentProgress: DownloadProgress | null = null

  constructor(private ctx: Context, private pluginConfig: Config) {
    this.logger = ctx.logger('delta-force-resources')
    // 使用 ctx.baseDir/data/delta-force/resources 作为资源目录
    this.resourcesPath = path.join(ctx.baseDir, 'data', 'delta-force', 'resources')
  }

  /**
   * 获取当前下载状态
   */
  getDownloadStatus(): { isDownloading: boolean; progress: DownloadProgress | null } {
    return {
      isDownloading: this.isDownloading,
      progress: this.currentProgress
    }
  }

  /**
   * 获取资源根目录路径
   */
  getResourcesPath(): string {
    return this.resourcesPath
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 检查资源是否已下载
   */
  isResourcesReady(): boolean {
    return fs.existsSync(this.resourcesPath) && 
           fs.existsSync(path.join(this.resourcesPath, 'Template'))
  }

  /**
   * 获取后端 API 基础地址
   */
  private getApiBaseUrl(): string {
    return this.pluginConfig.apiBaseUrl || 'https://df-api.shallow.ink'
  }

  /**
   * 应用 gh-proxy 加速到下载 URL
   */
  private applyGhProxy(url: string): string {
    if (!this.pluginConfig.useGhProxy) return url
    // 只对 raw.githubusercontent.com 的 URL 应用代理
    if (url.includes('raw.githubusercontent.com')) {
      return `${GH_PROXY_PREFIX}${url}`
    }
    return url
  }

  /**
   * 从后端 API 获取文件列表
   */
  private async fetchFileList(): Promise<ResourceItem[]> {
    const apiUrl = `${this.getApiBaseUrl()}/koishi/resources/tree`
    
    try {
      const response = await this.ctx.http.get<ResourceTreeResponse>(apiUrl, {
        headers: {
          'User-Agent': 'koishi-plugin-delta-force',
          'Authorization': `Bearer ${this.pluginConfig.apiKey}`
        }
      })

      if (response.code !== 'SUCCESS') {
        throw new Error(`API 返回错误: ${response.code}`)
      }

      // 递归提取所有文件
      const fileList: ResourceItem[] = []
      this.extractFiles(response.data.tree, fileList)
      
      return fileList
    } catch (error) {
      this.logger.error(`获取文件列表失败: ${apiUrl}`, error)
      throw error
    }
  }

  /**
   * 递归提取树形结构中的所有文件
   */
  private extractFiles(node: ResourceTreeNode, fileList: ResourceItem[]): void {
    if (node.type === 'file' && node.download_url) {
      fileList.push({
        name: node.name,
        path: node.path,
        sha: node.sha || '',
        size: node.size || 0,
        type: 'file',
        download_url: node.download_url,
        html_url: node.html_url
      })
    } else if (node.type === 'dir' && node.children) {
      for (const child of node.children) {
        this.extractFiles(child, fileList)
      }
    }
  }

  /**
   * 下载单个文件
   */
  private async downloadFile(url: string, localPath: string): Promise<void> {
    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const response = await this.ctx.http.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'koishi-plugin-delta-force'
      }
    })

    fs.writeFileSync(localPath, Buffer.from(response))
  }

  /**
   * 下载所有资源（支持断点续传）
   */
  async downloadResources(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; downloaded: number; failed: string[] }> {
    // 检查是否正在下载
    if (this.isDownloading) {
      const status = this.getDownloadStatus()
      if (status.progress) {
        const percent = Math.round((status.progress.downloaded / status.progress.total) * 100)
        this.logger.warn(`资源正在下载中: ${status.progress.downloaded}/${status.progress.total} (${percent}%)`)
      }
      return {
        success: false,
        downloaded: 0,
        failed: ['下载正在进行中']
      }
    }

    this.isDownloading = true
    const useProxy = this.pluginConfig.useGhProxy
    this.logger.info(`开始下载资源${useProxy ? ' (使用 GH-Proxy 加速)' : ''}...`)

    const progress: DownloadProgress = {
      total: 0,
      downloaded: 0,
      current: '',
      failed: []
    }
    this.currentProgress = progress

    try {
      // 从后端 API 获取文件列表
      const fileList = await this.fetchFileList()
      progress.total = fileList.length
      this.logger.info(`共发现 ${fileList.length} 个文件`)

      // 确保资源目录存在
      if (!fs.existsSync(this.resourcesPath)) {
        fs.mkdirSync(this.resourcesPath, { recursive: true })
      }

      // 加载现有 manifest 或创建新的
      let manifest = await this.loadManifest()
      const existingManifest = manifest
      
      // 创建新的 manifest（包含所有文件，初始 downloaded = false）
      manifest = {
        version: new Date().toISOString(),
        files: fileList.map(f => {
          const relativePath = f.path.replace(/^resources\//, '')
          // 检查旧 manifest 中是否已下载且 SHA 相同
          const existingFile = existingManifest?.files.find(
            ef => ef.relativePath === relativePath && ef.sha === f.sha && ef.downloaded
          )
          return {
            relativePath,
            sha: f.sha,
            size: f.size,
            downloaded: !!existingFile  // 如果旧文件已下载且 SHA 相同，标记为已下载
          }
        })
      }
      
      // 立即保存 manifest（支持断点续传）
      await this.writeManifest(manifest)
      this.logger.info('已保存资源清单，支持断点续传')

      const downloadDelay = 100
      const progressInterval = 20
      let skippedCount = 0
      let actualDownloaded = 0
      
      for (let i = 0; i < manifest.files.length; i++) {
        const fileInfo = manifest.files[i]
        const relativePath = fileInfo.relativePath
        const localPath = path.join(this.resourcesPath, relativePath)
        progress.current = relativePath

        // 如果已下载且文件存在，跳过
        if (fileInfo.downloaded && fs.existsSync(localPath)) {
          skippedCount++
          progress.downloaded++
          onProgress?.(progress)
          continue
        }

        // 获取对应的原始文件信息
        const file = fileList.find(f => f.path.replace(/^resources\//, '') === relativePath)
        if (!file) {
          progress.failed.push(relativePath)
          continue
        }

        try {
          const downloadUrl = this.applyGhProxy(file.download_url)
          await this.downloadFile(downloadUrl, localPath)
          
          // 更新 manifest 中该文件的下载状态
          manifest.files[i].downloaded = true
          await this.writeManifest(manifest)
          
          progress.downloaded++
          actualDownloaded++
          
          if (progress.downloaded % progressInterval === 0) {
            const percent = Math.round((progress.downloaded / progress.total) * 100)
            this.logger.info(`下载进度: ${progress.downloaded}/${progress.total} (${percent}%)`)
          }
          
          await this.sleep(downloadDelay)
        } catch (error) {
          progress.failed.push(relativePath)
          this.logger.warn(`下载失败: ${relativePath}`, error)
        }

        onProgress?.(progress)
      }
      
      if (skippedCount > 0) {
        this.logger.info(`跳过 ${skippedCount} 个已下载文件`)
      }

      this.logger.info(`资源下载完成: 新下载 ${actualDownloaded} 个, 跳过 ${skippedCount} 个, 失败 ${progress.failed.length} 个`)

      this.isDownloading = false
      this.currentProgress = null

      return {
        success: progress.failed.length === 0,
        downloaded: actualDownloaded,
        failed: progress.failed
      }
    } catch (error) {
      this.isDownloading = false
      this.currentProgress = null
      this.logger.error('资源下载失败:', error)
      throw error
    }
  }

  /**
   * 写入 manifest 文件
   */
  private async writeManifest(manifest: Manifest): Promise<void> {
    const manifestPath = path.join(this.resourcesPath, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }

  /**
   * 加载资源清单
   */
  private async loadManifest(): Promise<Manifest | null> {
    const manifestPath = path.join(this.resourcesPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return null

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(content) as Manifest
      // 兼容旧版 manifest（没有 downloaded 字段）
      manifest.files = manifest.files.map(f => ({
        ...f,
        downloaded: f.downloaded ?? true  // 旧版默认认为已下载
      }))
      return manifest
    } catch {
      return null
    }
  }

  /**
   * 获取资源状态信息
   */
  async getStatus(): Promise<{
    ready: boolean
    path: string
    fileCount: number
    lastUpdate: string | null
    useGhProxy: boolean
  }> {
    const manifest = await this.loadManifest()
    
    return {
      ready: this.isResourcesReady(),
      path: this.resourcesPath,
      fileCount: manifest?.files.length || 0,
      lastUpdate: manifest?.version || null,
      useGhProxy: this.pluginConfig.useGhProxy
    }
  }

  /**
   * 清理资源目录
   */
  async cleanResources(): Promise<void> {
    if (fs.existsSync(this.resourcesPath)) {
      fs.rmSync(this.resourcesPath, { recursive: true, force: true })
      this.logger.info('资源目录已清理')
    }
  }

  /**
   * 同步资源（启动时自动调用）
   * 类似 DataManager.init()，自动检查并更新资源
   */
  async syncResources(): Promise<void> {
    const useProxy = this.pluginConfig.useGhProxy
    this.logger.info(`开始同步静态资源${useProxy ? ' (使用 GH-Proxy 加速)' : ''}...`)

    try {
      const result = await this.downloadResources()
      
      if (result.success) {
        if (result.downloaded > 0) {
          this.logger.info(`资源同步完成，更新了 ${result.downloaded} 个文件`)
        } else {
          this.logger.info('资源已是最新，无需更新')
        }
      } else {
        this.logger.warn(`资源同步完成，但有 ${result.failed.length} 个文件失败`)
      }
    } catch (error) {
      this.logger.error('资源同步失败:', error)
      
      // 如果资源不存在，抛出错误；如果已有资源，只是更新失败，则继续使用现有资源
      if (!this.isResourcesReady()) {
        throw new Error(`资源同步失败且无本地资源: ${(error as Error).message}`)
      }
      
      this.logger.warn('将使用现有本地资源')
    }
  }
}

/**
 * 创建资源管理器实例
 */
export function createResourceManager(ctx: Context, config: Config): ResourceManager {
  return new ResourceManager(ctx, config)
}
