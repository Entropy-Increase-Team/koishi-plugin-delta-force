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
  download_url: string | null
  url: string
}

export interface DownloadProgress {
  total: number
  downloaded: number
  current: string
  failed: string[]
}

export type ResourceSource = 'github' | 'gitee'

export interface ResourceConfig {
  github: {
    owner: string
    repo: string
    branch: string
    basePath: string
  }
  gitee: {
    owner: string
    repo: string
    branch: string
    basePath: string
  }
}

const DEFAULT_RESOURCE_CONFIG: ResourceConfig = {
  github: {
    owner: 'Entropy-Increase-Team',
    repo: 'koishi-plugin-delta-force',
    branch: 'main',
    basePath: 'resources'
  },
  gitee: {
    owner: 'Dnyo666',
    repo: 'koishi-plugin-delta-force',
    branch: 'main',
    basePath: 'resources'
  }
}

export class ResourceManager {
  private resourcesPath: string
  private config: ResourceConfig
  private logger: ReturnType<Context['logger']>

  constructor(private ctx: Context, private pluginConfig: Config) {
    this.logger = ctx.logger('delta-force-resources')
    this.config = DEFAULT_RESOURCE_CONFIG
    // 使用 ctx.baseDir/data/delta-force/resources 作为资源目录
    this.resourcesPath = path.join(ctx.baseDir, 'data', 'delta-force', 'resources')
  }

  /**
   * 获取资源根目录路径
   */
  getResourcesPath(): string {
    return this.resourcesPath
  }

  /**
   * 检查资源是否已下载
   */
  isResourcesReady(): boolean {
    return fs.existsSync(this.resourcesPath) && 
           fs.existsSync(path.join(this.resourcesPath, 'Template'))
  }

  /**
   * 获取 API URL
   */
  private getApiUrl(source: ResourceSource, subPath: string = ''): string {
    const cfg = this.config[source]
    const fullPath = subPath ? `${cfg.basePath}/${subPath}` : cfg.basePath
    
    if (source === 'github') {
      return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${fullPath}?ref=${cfg.branch}`
    } else {
      return `https://gitee.com/api/v5/repos/${cfg.owner}/${cfg.repo}/contents/${fullPath}`
    }
  }

  /**
   * 获取下载 URL
   */
  private getDownloadUrl(source: ResourceSource, filePath: string): string {
    const cfg = this.config[source]
    
    if (source === 'github') {
      return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`
    } else {
      return `https://gitee.com/${cfg.owner}/${cfg.repo}/raw/${cfg.branch}/${filePath}`
    }
  }

  /**
   * 递归获取目录下所有文件列表
   */
  private async fetchFileList(
    source: ResourceSource,
    subPath: string = '',
    fileList: ResourceItem[] = []
  ): Promise<ResourceItem[]> {
    const url = this.getApiUrl(source, subPath)
    
    try {
      const response = await this.ctx.http.get<ResourceItem[]>(url, {
        headers: source === 'github' ? {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'koishi-plugin-delta-force'
        } : {}
      })

      for (const item of response) {
        if (item.type === 'dir') {
          // 递归获取子目录
          const relativePath = item.path.replace(`${this.config[source].basePath}/`, '')
          await this.fetchFileList(source, relativePath, fileList)
        } else if (item.type === 'file') {
          // 添加文件到列表
          fileList.push({
            ...item,
            download_url: item.download_url || this.getDownloadUrl(source, item.path)
          })
        }
      }

      return fileList
    } catch (error) {
      this.logger.error(`获取文件列表失败 (${source}): ${url}`, error)
      throw error
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
   * 下载所有资源
   */
  async downloadResources(
    source: ResourceSource = 'gitee',
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; downloaded: number; failed: string[] }> {
    this.logger.info(`开始从 ${source} 下载资源...`)

    const progress: DownloadProgress = {
      total: 0,
      downloaded: 0,
      current: '',
      failed: []
    }

    try {
      // 获取文件列表
      const fileList = await this.fetchFileList(source)
      progress.total = fileList.length
      this.logger.info(`共发现 ${fileList.length} 个文件`)

      // 确保资源目录存在
      if (!fs.existsSync(this.resourcesPath)) {
        fs.mkdirSync(this.resourcesPath, { recursive: true })
      }

      // 下载每个文件
      for (const file of fileList) {
        const relativePath = file.path.replace(`${this.config[source].basePath}/`, '')
        const localPath = path.join(this.resourcesPath, relativePath)
        progress.current = relativePath

        try {
          // 检查文件是否已存在且 SHA 相同（增量更新）
          if (await this.shouldSkipFile(localPath, file.sha)) {
            this.logger.debug(`跳过未变更文件: ${relativePath}`)
            progress.downloaded++
            onProgress?.(progress)
            continue
          }

          await this.downloadFile(file.download_url!, localPath)
          progress.downloaded++
          this.logger.debug(`下载成功: ${relativePath}`)
        } catch (error) {
          progress.failed.push(relativePath)
          this.logger.warn(`下载失败: ${relativePath}`, error)
        }

        onProgress?.(progress)
      }

      // 保存 manifest
      await this.saveManifest(source, fileList)

      this.logger.info(`资源下载完成: ${progress.downloaded}/${progress.total}, 失败: ${progress.failed.length}`)

      return {
        success: progress.failed.length === 0,
        downloaded: progress.downloaded,
        failed: progress.failed
      }
    } catch (error) {
      this.logger.error('资源下载失败:', error)
      throw error
    }
  }

  /**
   * 检查文件是否需要跳过（基于 SHA 比较）
   */
  private async shouldSkipFile(localPath: string, remoteSha: string): Promise<boolean> {
    if (!fs.existsSync(localPath)) return false

    const manifest = await this.loadManifest()
    if (!manifest) return false

    const fileInfo = manifest.files.find(f => 
      path.join(this.resourcesPath, f.relativePath) === localPath
    )

    return fileInfo?.sha === remoteSha
  }

  /**
   * 保存资源清单
   */
  private async saveManifest(source: ResourceSource, fileList: ResourceItem[]): Promise<void> {
    const manifest = {
      version: new Date().toISOString(),
      source,
      files: fileList.map(f => ({
        relativePath: f.path.replace(`${this.config[source].basePath}/`, ''),
        sha: f.sha,
        size: f.size
      }))
    }

    const manifestPath = path.join(this.resourcesPath, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }

  /**
   * 加载资源清单
   */
  private async loadManifest(): Promise<{
    version: string
    source: ResourceSource
    files: { relativePath: string; sha: string; size: number }[]
  } | null> {
    const manifestPath = path.join(this.resourcesPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return null

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8')
      return JSON.parse(content)
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
    source: ResourceSource | null
  }> {
    const manifest = await this.loadManifest()
    
    return {
      ready: this.isResourcesReady(),
      path: this.resourcesPath,
      fileCount: manifest?.files.length || 0,
      lastUpdate: manifest?.version || null,
      source: manifest?.source || null
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
    const source = this.pluginConfig.resourceSource || 'github'
    
    this.logger.info(`开始同步静态资源 (${source})...`)

    try {
      const result = await this.downloadResources(source)
      
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
