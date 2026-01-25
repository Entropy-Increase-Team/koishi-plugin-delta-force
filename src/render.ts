import { Context, h, Service } from 'koishi'
import type { Page } from 'puppeteer-core'
import * as fs from 'fs'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const template = require('art-template')

declare module 'koishi' {
  interface Context {
    puppeteer: PuppeteerService
  }
}

interface PuppeteerService extends Service {
  page(): Promise<Page>
}

/**
 * 渲染器配置
 */
export interface RenderConfig {
  /** 视口宽度 (默认 1200) */
  width?: number
  /** 等待超时时间 (ms) */
  timeout?: number
}

/**
 * 模板渲染数据
 */
export interface TemplateData {
  [key: string]: unknown
}

/**
 * 渲染结果
 */
export interface RenderResult {
  /** 是否成功 */
  success: boolean
  /** 图片 Buffer (成功时) */
  image?: Buffer
  /** 错误信息 (失败时) */
  error?: string
}

/**
 * Koishi 渲染器类
 * 基于 Puppeteer 将 HTML 模板渲染为图片
 * 使用 art-template 处理模板语法
 */
export class Renderer {
  private resourcesPath: string
  private templatesPath: string

  constructor(private ctx: Context) {
    // 优先使用 ctx.baseDir/data/delta-force/resources（下载的资源）
    const downloadedResourcesPath = path.join(ctx.baseDir, 'data', 'delta-force', 'resources')
    // 备用路径：插件目录下的 resources（开发时使用）
    const localResourcesPath = path.resolve(__dirname, '../resources')

    // 检查下载的资源是否存在
    if (fs.existsSync(path.join(downloadedResourcesPath, 'Template'))) {
      this.resourcesPath = downloadedResourcesPath
      this.ctx.logger('delta-force').info('使用下载的资源路径:', downloadedResourcesPath)
    } else {
      this.resourcesPath = localResourcesPath
      this.ctx.logger('delta-force').info('使用本地资源路径:', localResourcesPath)
    }

    this.templatesPath = path.resolve(this.resourcesPath, 'Template')

    // 配置 art-template
    this.configureArtTemplate()
  }

  /**
   * 配置 art-template
   */
  private configureArtTemplate() {
    // 设置模板根目录
    template.defaults.root = this.resourcesPath

    // 设置扩展名
    template.defaults.extname = '.html'

    // 禁用缓存（开发时方便调试）
    template.defaults.cache = false
  }

  /**
   * 使用 art-template 渲染模板
   * 与云崽版保持一致：不将图片转换为 base64，直接使用 file:// 协议
   */
  private renderTemplate(htmlPath: string, data: TemplateData): string {
    // 添加资源路径 (Windows 路径需要特殊处理)
    const resPath = this.resourcesPath.replace(/\\/g, '/')
    const templateData = {
      ...data,
      // _res_path 不带末尾斜杠，模板中会自动添加
      _res_path: `file:///${resPath}`,
      // 布局路径 (与云崽版保持一致)
      commonLayout: path.join(this.templatesPath, 'common', 'common.html'),
      defaultLayout: path.join(this.resourcesPath, 'common', 'layout', 'default.html'),
      // 系统变量 (与云崽版保持一致)
      sys: {
        scale: 'style=transform:scale(1)',
        copyright: 'Created By Koishi & Delta-Force-Plugin',
        ...(data.sys as Record<string, unknown> || {})
      },
      copyright: (data as Record<string, unknown>).copyright || 'Created By Koishi & Delta-Force-Plugin',
    }

    this.ctx.logger('delta-force').info('渲染模板:', htmlPath)
    this.ctx.logger('delta-force').info('资源路径:', templateData._res_path)

    try {
      // 使用 art-template 渲染
      let html = template(htmlPath, templateData)
      
      // 内联 CSS 文件 (CSS 必须内联，否则 Puppeteer 无法加载)
      html = this.inlineCSS(html)
      
      // 不再将图片转换为 base64，与云崽版保持一致
      // 图片使用 file:// 协议，由 Puppeteer 直接加载
      
      this.ctx.logger('delta-force').info('渲染成功, HTML 长度:', html.length)
      return html
    } catch (error) {
      this.ctx.logger('delta-force').error('art-template 渲染失败:', error)
      throw error
    }
  }

  /**
   * 内联 CSS 文件
   */
  private inlineCSS(html: string): string {
    // 匹配 <link rel="stylesheet" href="file:///...">
    const linkRegex = /<link\s+rel=["']stylesheet["']\s+type=["']text\/css["']\s+href=["']file:\/\/\/([^"']+)["']\s*\/?>/gi
    
    return html.replace(linkRegex, (match, filePath) => {
      try {
        const cssPath = filePath.replace(/\//g, path.sep)
        if (fs.existsSync(cssPath)) {
          const cssContent = fs.readFileSync(cssPath, 'utf-8')
          return `<style>${cssContent}</style>`
        }
      } catch (error) {
        this.ctx.logger('delta-force').warn('无法内联 CSS:', filePath, error)
      }
      return match
    })
  }

  /**
   * Puppeteer 是必选依赖，始终可用
   */
  get available(): boolean {
    return true
  }

  /**
   * 渲染模板为图片
   * @param templateName 模板名称 (如 'userInfo', 'dailyReport')
   * @param data 模板数据
   * @param config 渲染配置
   */
  async render(
    templateName: string,
    data: TemplateData,
    config: RenderConfig = {}
  ): Promise<RenderResult> {

    try {
      // 构建模板路径
      // 特殊处理：help 模板在 resources/help/index.html，而不是 Template/help/help.html
      let templateDir: string
      let htmlPath: string
      
      if (templateName === 'help') {
        // 帮助模板使用 resources/help/index.html
        templateDir = path.join(this.resourcesPath, 'help')
        htmlPath = path.join(templateDir, 'index.html')
      } else {
        // 其他模板使用 Template/{name}/{name}.html
        templateDir = path.join(this.templatesPath, templateName)
        htmlPath = path.join(templateDir, `${templateName}.html`)
      }

      if (!fs.existsSync(htmlPath)) {
        return {
          success: false,
          error: `模板文件不存在: ${templateName} (${htmlPath})`,
        }
      }

      // 使用 art-template 渲染模板
      const html = this.renderTemplate(htmlPath, data)

      // 渲染配置 (与云崽版保持一致)
      const {
        width = 1200,
        timeout = 60000,
      } = config

      // 使用 Puppeteer 渲染
      const page = await this.ctx.puppeteer.page()

      // 将 HTML 写入临时文件，然后用 file:// 协议加载
      // 这样可以让 Puppeteer 正确加载 file:// 协议的图片资源
      const tempHtmlPath = path.join(templateDir, `_temp_${Date.now()}.html`)
      fs.writeFileSync(tempHtmlPath, html, 'utf-8')

      try {
        // 设置视口 (高度设置足够大，后续通过 boundingBox 自动截取)
        await page.setViewport({
          width,
          height: 5000,
          deviceScaleFactor: 1,
        })

        // 使用 file:// 协议加载临时 HTML 文件
        const fileUrl = `file:///${tempHtmlPath.replace(/\\/g, '/')}`
        await page.goto(fileUrl, {
          waitUntil: 'networkidle2',
          timeout,
        })

        // 等待页面渲染完成
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)))

        // 截取 .container 元素 (与云崽版一致，通过 boundingBox 自动截取)
        const container = await page.$('.container')
        let screenshot: Uint8Array

        if (container) {
          // 获取元素的 boundingBox 并截取
          const boundingBox = await container.boundingBox()
          if (boundingBox) {
            screenshot = await page.screenshot({
              type: 'png',
              clip: {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              },
            })
          } else {
            screenshot = await container.screenshot({ type: 'png' })
          }
        } else {
          // 如果没有 .container，截取 body
          const body = await page.$('body')
          if (body) {
            const boundingBox = await body.boundingBox()
            if (boundingBox) {
              screenshot = await page.screenshot({
                type: 'png',
                clip: {
                  x: boundingBox.x,
                  y: boundingBox.y,
                  width: boundingBox.width,
                  height: boundingBox.height,
                },
              })
            } else {
              screenshot = await page.screenshot({ type: 'png', fullPage: true })
            }
          } else {
            screenshot = await page.screenshot({ type: 'png', fullPage: true })
          }
        }

        return {
          success: true,
          image: Buffer.from(screenshot),
        }
      } finally {
        // 清理临时文件和关闭页面
        await page.close()
        try {
          fs.unlinkSync(tempHtmlPath)
        } catch {
          // 忽略删除临时文件的错误
        }
      }
    } catch (error) {
      this.ctx.logger('delta-force').error('渲染失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '渲染失败',
      }
    }
  }

  /**
   * 渲染并返回 Koishi 消息元素
   * @param templateName 模板名称
   * @param data 模板数据
   * @param config 渲染配置
   * @param fallbackText 降级文本 (Puppeteer 不可用时返回)
   */
  async renderToMessage(
    templateName: string,
    data: TemplateData,
    config: RenderConfig = {}
  ): Promise<h | string> {
    const result = await this.render(templateName, data, config)

    if (result.success && result.image) {
      return h.image(result.image, 'image/png')
    }

    return result.error || '渲染失败'
  }
}

/**
 * 创建渲染器实例
 */
export function createRenderer(ctx: Context): Renderer {
  return new Renderer(ctx)
}
