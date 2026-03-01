import { Context, h } from 'koishi'
import { Config } from '../../config'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { Renderer } from '../../render'
import { handleApiError, sleep } from '../../utils'
import { resolve } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, rmSync } from 'fs'

// ==================== 类型定义 ====================

interface MusicDownload {
  url?: string
  expiresIn?: number
}

interface MusicMetadata {
  cover?: string
  hot?: string
  lrc?: string
}

interface MusicPlaylist {
  name?: string
  id?: string
}

interface MusicItem {
  fileName?: string
  artist?: string
  download?: MusicDownload
  metadata?: MusicMetadata
  playlist?: MusicPlaylist
  id?: string
  _id?: string
}

interface MusicMemoryEntry {
  music: MusicItem
  timestamp: number
}

interface MusicListMemoryEntry {
  list: MusicItem[]
  timestamp: number
  type: string
}

interface CacheMetadata {
  [key: string]: {
    fileName: string
    artist?: string
    cachedAt: number
    filePath: string
  }
}

// ==================== 音乐记忆存储（全局） ====================

const musicMemory = new Map<string, MusicMemoryEntry>()
const musicListMemory = new Map<string, MusicListMemoryEntry>()

// ==================== 缓存管理 ====================

class MusicCacheManager {
  private cacheDir: string
  private metadataPath: string
  private metadata: CacheMetadata = {}

  constructor(baseDir: string) {
    this.cacheDir = resolve(baseDir, 'music_cache')
    this.metadataPath = resolve(this.cacheDir, 'metadata.json')
    this.ensureCacheDir()
    this.loadMetadata()
  }

  private ensureCacheDir() {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private loadMetadata() {
    try {
      if (existsSync(this.metadataPath)) {
        this.metadata = JSON.parse(readFileSync(this.metadataPath, 'utf-8'))
      }
    } catch {
      this.metadata = {}
    }
  }

  private saveMetadata() {
    try {
      writeFileSync(this.metadataPath, JSON.stringify(this.metadata, null, 2))
    } catch { /* ignore */ }
  }

  /** 获取缓存的音乐文件路径 */
  getCachedMusicPath(music: MusicItem): string | null {
    const key = this.getMusicKey(music)
    if (!key) return null
    const entry = this.metadata[key]
    if (entry && existsSync(entry.filePath)) {
      return entry.filePath
    }
    return null
  }

  /** 下载并缓存音乐文件 */
  async downloadAndCache(music: MusicItem, ctx: Context): Promise<string | null> {
    const key = this.getMusicKey(music)
    if (!key || !music.download?.url) return null

    try {
      const ext = this.getExtFromUrl(music.download.url)
      const fileName = `${key}${ext}`
      const filePath = resolve(this.cacheDir, fileName)

      const buffer = await ctx.http.get<ArrayBuffer>(music.download.url, {
        responseType: 'arraybuffer',
      })

      writeFileSync(filePath, Buffer.from(buffer))

      this.metadata[key] = {
        fileName: music.fileName || 'unknown',
        artist: music.artist,
        cachedAt: Date.now(),
        filePath,
      }
      this.saveMetadata()

      return filePath
    } catch {
      return null
    }
  }

  /** 获取缓存统计信息 */
  getCacheStats(): { totalFiles: number; totalSizeMB: string; metadataCount: number } {
    let totalFiles = 0
    let totalSize = 0

    try {
      const files = readdirSync(this.cacheDir).filter(f => f !== 'metadata.json')
      totalFiles = files.length
      for (const file of files) {
        const filePath = resolve(this.cacheDir, file)
        const stat = statSync(filePath)
        totalSize += stat.size
      }
    } catch { /* ignore */ }

    return {
      totalFiles,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      metadataCount: Object.keys(this.metadata).length,
    }
  }

  /** 清空所有缓存 */
  clearAllCache() {
    try {
      if (existsSync(this.cacheDir)) {
        rmSync(this.cacheDir, { recursive: true, force: true })
      }
      this.metadata = {}
      this.ensureCacheDir()
      this.saveMetadata()
    } catch { /* ignore */ }
  }

  private getMusicKey(music: MusicItem): string | null {
    const id = music.id || music._id
    if (id) return id
    if (music.fileName) return music.fileName.replace(/[^\w\u4e00-\u9fa5-]/g, '_')
    return null
  }

  private getExtFromUrl(url: string): string {
    const match = url.match(/\.(\w+)(\?|$)/)
    return match ? `.${match[1]}` : '.mp3'
  }
}

// ==================== 记忆系统 ====================

function saveMusicMemory(userId: string, music: MusicItem) {
  musicMemory.set(userId, { music, timestamp: Date.now() })
  setTimeout(() => musicMemory.delete(userId), 2 * 60 * 1000)
}

function getMusicMemory(userId: string): MusicItem | null {
  const entry = musicMemory.get(userId)
  if (!entry) return null
  if (Date.now() - entry.timestamp > 2 * 60 * 1000) {
    musicMemory.delete(userId)
    return null
  }
  return entry.music
}

function saveMusicListMemory(userId: string, list: MusicItem[], type: string) {
  musicListMemory.set(userId, { list, timestamp: Date.now(), type })
  setTimeout(() => musicListMemory.delete(userId), 2 * 60 * 1000)
}

function getMusicListMemory(userId: string): MusicListMemoryEntry | null {
  const entry = musicListMemory.get(userId)
  if (!entry) return null
  if (Date.now() - entry.timestamp > 2 * 60 * 1000) {
    musicListMemory.delete(userId)
    return null
  }
  return entry
}

// ==================== 音乐卡片发送 ====================

/**
 * 尝试通过 OneBot 适配器发送音乐卡片
 * 返回 true 表示成功，false 表示失败需要回退
 */
async function trySendMusicCard(
  session: any,
  music: MusicItem,
  musicUrl: string,
  logger: ReturnType<Context['logger']>
): Promise<boolean> {
  try {
    const title = music.fileName || '未知歌曲'
    const singer = music.artist || '未知艺术家'
    const preview = music.metadata?.cover || ''
    const jumpUrl = 'https://sjz.hengj.cn'

    // 检测是否为 OneBot 适配器（通过 session.onebot 判断，与 link2card 插件一致）
    if (!session.onebot) return false

    const musicSegment = [{
      type: 'music',
      data: {
        type: 'custom',
        url: jumpUrl,
        audio: musicUrl,
        title: title,
        image: preview,
        singer: singer,
      }
    }]

    let res
    if (session.guildId) {
      res = await session.onebot.sendGroupMsg(session.guildId, musicSegment)
    } else {
      res = await session.onebot.sendPrivateMsg(session.userId, musicSegment)
    }

    if (res) {
      logger.info(`[鼠鼠音乐] 音乐卡片发送成功: ${title} - ${singer}`)
      return true
    }

    return false
  } catch (error) {
    logger.debug('[鼠鼠音乐] 音乐卡片发送失败，将回退到语音方案:', error)
    return false
  }
}

/**
 * 以语音+文字方式发送音乐（备用方案）
 */
async function sendMusicAsAudio(
  session: any,
  music: MusicItem,
  musicUrl: string,
  fromCache: boolean,
  logger: ReturnType<Context['logger']>
) {
  const msgParts: string[] = []

  if (music.fileName && music.artist) {
    msgParts.push(`♪ ${music.fileName} - ${music.artist}`)
  } else if (music.fileName) {
    msgParts.push(`♪ ${music.fileName}`)
  }

  if (music.playlist?.name) {
    msgParts.push(`歌单: ${music.playlist.name}`)
  }

  if (music.metadata?.hot) {
    msgParts.push(`🔥 ${music.metadata.hot}`)
  }

  // 发送语音
  await session.send(h.audio(musicUrl))

  // 发送文字信息
  if (msgParts.length > 0) {
    await session.send(msgParts.join('\n'))
  }

  const cacheStatus = fromCache ? '[本地缓存]' : '[直链]'
  logger.info(`[鼠鼠音乐] 发送语音: ${music.fileName} - ${music.artist} ${cacheStatus}`)
}

/**
 * 发送音乐消息的核心方法
 * 先尝试卡片，失败回退语音
 */
async function sendMusicMessage(
  ctx: Context,
  session: any,
  music: MusicItem,
  cache: MusicCacheManager,
  logger: ReturnType<Context['logger']>,
  options: { useCache?: boolean } = {}
) {
  const { useCache = false } = options

  if (!music.download?.url) {
    await session.send('音乐数据异常，请稍后重试。')
    return
  }

  const musicUrl = music.download.url

  // 1. 先尝试发送音乐卡片
  const cardSent = await trySendMusicCard(session, music, musicUrl, logger)

  if (!cardSent) {
    // 2. 卡片失败，回退到语音方案
    logger.info('[鼠鼠音乐] 音乐卡片不可用，使用语音方案')

    let finalUrl = musicUrl
    let fromCache = false

    if (useCache) {
      const cachedPath = cache.getCachedMusicPath(music)
      if (cachedPath) {
        finalUrl = `file:///${cachedPath.replace(/\\/g, '/')}`
        fromCache = true
        logger.info(`[鼠鼠音乐] 使用本地缓存: ${music.fileName}`)
      } else {
        // 后台下载缓存，不阻塞
        cache.downloadAndCache(music, ctx).catch(err => {
          logger.warn(`[鼠鼠音乐] 后台缓存失败: ${err?.message}`)
        })
      }
    }

    await sendMusicAsAudio(session, music, finalUrl, fromCache, logger)
  }

  // 保存音乐记忆
  saveMusicMemory(session.userId, music)
}

// ==================== LRC 歌词解析 ====================

function parseLRC(lrcContent: string): string {
  const lines = lrcContent.split('\n')
  const lyrics: string[] = []

  for (const line of lines) {
    const match = line.match(/\[(\d+):(\d+)\.(\d+)\](.*)/)
    if (match && match[4].trim()) {
      lyrics.push(match[4].trim())
    } else {
      const metaMatch = line.match(/\[(ti|ar|al|by):(.+)\]/)
      if (!metaMatch && line.trim() && !line.startsWith('[')) {
        lyrics.push(line.trim())
      }
    }
  }

  return lyrics.length > 0 ? lyrics.join('\n') : '（暂无歌词内容）'
}

// ==================== 音乐列表渲染 ====================

async function renderMusicList(
  session: any,
  renderer: Renderer,
  musicList: MusicItem[],
  title: string,
  subtitle: string,
  page: number,
  logger: ReturnType<Context['logger']>
) {
  const pageSize = 10
  const totalPages = Math.ceil(musicList.length / pageSize)

  if (page < 1 || page > totalPages) {
    await session.send(`页码超出范围，共 ${totalPages} 页\n使用 df.music.rank [页码] 查看`)
    return
  }

  const startIndex = (page - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, musicList.length)
  const displayList = musicList.slice(startIndex, endIndex)

  const musicListWithCovers = displayList.map((music, index) => ({
    index: startIndex + index + 1,
    cover: music.metadata?.cover || null,
    name: music.fileName || '未知歌曲',
    artist: music.artist || '未知艺术家',
    playlist: music.playlist?.name || null,
    hot: music.metadata?.hot || null,
  }))

  const templateData = {
    listTitle: title,
    subtitle: `${subtitle} · 第 ${page}/${totalPages} 页`,
    totalCount: musicList.length,
    musicList: musicListWithCovers,
  }

  try {
    const imageResult = await renderer.renderToMessage('musicList', templateData, { width: 1200 })
    await session.send(imageResult)
  } catch (error) {
    logger.warn('[鼠鼠音乐] 渲染音乐列表失败，使用文字备用:', error)

    // 文字备用方案
    let fallbackMsg = `【${title}】\n${subtitle} · 第 ${page}/${totalPages} 页\n共 ${musicList.length} 首歌曲\n\n`

    displayList.forEach((music, index) => {
      fallbackMsg += `${startIndex + index + 1}. ${music.fileName || '未知'}`
      if (music.artist) fallbackMsg += ` - ${music.artist}`
      if (music.metadata?.hot) fallbackMsg += ` 🔥${music.metadata.hot}`
      fallbackMsg += '\n'
    })

    fallbackMsg += `\n使用 df.music.play [序号] 播放歌曲`
    await session.send(fallbackMsg)
  }
}

// ==================== 注册命令 ====================

export function registerMusicCommands(
  ctx: Context,
  config: Config,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')
  const cache = new MusicCacheManager(resolve(ctx.baseDir, 'cache', 'delta-force'))

  // ==================== df.music [关键词] ====================
  ctx.command('df.music [keyword:text]', '鼠鼠音乐')
    .alias('df.鼠鼠音乐')
    .usage('示例:\n  df.music - 随机播放\n  df.music 曼波 - 搜索播放')
    .action(async ({ session }, keyword) => {
      try {
        // 无参数：随机播放
        if (!keyword || !keyword.trim()) {
          await session.send('正在获取随机鼠鼠音乐...')

          const res = await api.getShushuMusic({ count: 1 })
          if (await handleApiError(res, session)) return

          const data = res.data as { musics?: MusicItem[] }
          if (!data?.musics || data.musics.length === 0) {
            return '未找到符合条件的音乐'
          }

          await sendMusicMessage(ctx, session, data.musics[0], cache, logger, { useCache: true })
          return
        }

        // 有参数：智能回退搜索
        const params = keyword.trim()
        await session.send(`正在搜索 "${params}"...`)

        const searchStrategies = [
          { param: 'playlist', label: '歌单' },
          { param: 'artist', label: '艺术家' },
          { param: 'title', label: '歌曲名' },
        ]

        let foundMusic: MusicItem | null = null

        for (const strategy of searchStrategies) {
          logger.debug(`[鼠鼠音乐] 尝试按${strategy.label}搜索: ${params}`)

          const apiParams: Record<string, string | number> = { count: 1 }
          apiParams[strategy.param] = params

          const res = await api.getShushuMusic(apiParams)

          const data = res.data as { musics?: MusicItem[] }
          if (res.success && data?.musics && data.musics.length > 0) {
            foundMusic = data.musics[0]
            logger.info(`[鼠鼠音乐] ${strategy.label}搜索成功: ${params}`)
            break
          }

          logger.debug(`[鼠鼠音乐] ${strategy.label}搜索无结果，尝试下一个...`)
        }

        if (!foundMusic) {
          return `未找到与 "${params}" 相关的音乐\n已尝试搜索：歌单、艺术家、歌曲名`
        }

        await sendMusicMessage(ctx, session, foundMusic, cache, logger, { useCache: true })
      } catch (error) {
        logger.error('[鼠鼠音乐] 发送鼠鼠音乐失败:', error)
        return '发送鼠鼠音乐失败，请稍后重试。'
      }
    })

  // ==================== df.music.voice ====================
  ctx.command('df.music.voice', '鼠鼠音乐语音版')
    .alias('df.鼠鼠语音')
    .action(async ({ session }) => {
      try {
        const userId = session.userId
        const memory = getMusicMemory(userId)

        let music: MusicItem

        if (!memory) {
          // 无记忆，随机获取
          await session.send('正在获取随机鼠鼠音乐（语音版）...')

          const res = await api.getShushuMusic({ count: 1 })
          if (await handleApiError(res, session)) return

          const data = res.data as { musics?: MusicItem[] }
          if (!data?.musics || data.musics.length === 0) {
            return '未找到符合条件的音乐'
          }

          music = data.musics[0]
        } else {
          music = memory
          await session.send('正在转换为语音...')
        }

        if (!music.download?.url) {
          return '音乐数据异常，无法发送语音。'
        }

        // 优先使用本地缓存
        let musicUrl = music.download.url
        let fromCache = false

        const cachedPath = cache.getCachedMusicPath(music)
        if (cachedPath) {
          musicUrl = `file:///${cachedPath.replace(/\\/g, '/')}`
          fromCache = true
        } else {
          // 下载并缓存
          try {
            const downloadedPath = await cache.downloadAndCache(music, ctx)
            if (downloadedPath) {
              musicUrl = `file:///${downloadedPath.replace(/\\/g, '/')}`
              fromCache = true
            }
          } catch {
            // 下载失败则使用直链
          }
        }

        // 强制语音发送
        await sendMusicAsAudio(session, music, musicUrl, fromCache, logger)
        saveMusicMemory(userId, music)
      } catch (error) {
        logger.error('[鼠鼠音乐] 发送语音失败:', error)
        return '发送语音失败，请稍后重试。'
      }
    })

  // ==================== df.music.lyrics ====================
  ctx.command('df.music.lyrics', '获取歌词')
    .alias('df.歌词')
    .alias('df.鼠鼠歌词')
    .action(async ({ session }) => {
      try {
        const userId = session.userId
        const music = getMusicMemory(userId)

        if (!music) {
          return '暂无最近播放的音乐记录\n请先使用 df.music 播放一首歌曲'
        }

        if (!music.metadata?.lrc) {
          return `歌曲「${music.fileName}」暂无歌词`
        }

        await session.send(`正在获取「${music.fileName}」的歌词...`)

        // 下载歌词
        let lrcContent: string
        try {
          lrcContent = await ctx.http.get<string>(music.metadata.lrc, { responseType: 'text' })
        } catch {
          return '获取歌词失败，请稍后重试'
        }

        if (!lrcContent) {
          return '获取歌词失败，请稍后重试'
        }

        const parsedLyrics = parseLRC(lrcContent)

        // 使用合并转发发送歌词
        const header = `【${music.fileName}】${music.artist ? `\n演唱：${music.artist}` : ''}`
        const footer = '鼠鼠音乐由 @Liusy 提供'

        // 尝试合并转发
        try {
          const forwardContent = h('message', { forward: true },
            h('message', header),
            h('message', parsedLyrics),
            h('message', footer)
          )
          await session.send(forwardContent)
        } catch {
          // 合并转发失败，直接发送
          await session.send(`${header}\n\n${parsedLyrics}\n\n${footer}`)
        }
      } catch (error) {
        logger.error('[鼠鼠音乐] 获取歌词失败:', error)
        return '获取歌词失败，请稍后重试。'
      }
    })

  // ==================== df.music.rank [页码] ====================
  ctx.command('df.music.rank [page:number]', '鼠鼠音乐排行榜')
    .alias('df.鼠鼠音乐列表')
    .alias('df.鼠鼠音乐排行榜')
    .action(async ({ session }, page) => {
      try {
        const pageNum = page || 1

        await session.send('正在获取热度排行榜...')

        const res = await api.getShushuMusicList({ sortBy: 'hot' })
        if (await handleApiError(res, session)) return

        const musicList = res.data as MusicItem[]
        if (!musicList || musicList.length === 0) {
          return '未找到音乐数据'
        }

        // 保存列表记忆
        saveMusicListMemory(session.userId, musicList, 'rank')

        // 渲染音乐列表
        await renderMusicList(session, renderer, musicList, '鼠鼠音乐热度排行榜', '最受欢迎的歌曲', pageNum, logger)
      } catch (error) {
        logger.error('[鼠鼠音乐] 获取排行榜失败:', error)
        return '获取排行榜失败，请稍后重试。'
      }
    })

  // ==================== df.music.playlist [名称] ====================
  ctx.command('df.music.playlist [name:text]', '鼠鼠歌单')
    .alias('df.鼠鼠歌单')
    .action(async ({ session }, name) => {
      try {
        if (!name || !name.trim()) {
          return '请指定歌单名称、ID或艺术家\n例如：df.music.playlist 曼波'
        }

        const params = name.trim()
        await session.send(`正在获取歌单 "${params}"...`)

        // 先尝试按歌单搜索
        let res = await api.getShushuMusicList({ playlist: params, sortBy: 'default' })
        let searchType = ''

        let musicList = res.data as MusicItem[]
        if (res.success && musicList && musicList.length > 0) {
          searchType = 'playlist'
        } else {
          // 再尝试按艺术家搜索
          res = await api.getShushuMusicList({ artist: params, sortBy: 'default' })
          musicList = res.data as MusicItem[]
          if (res.success && musicList && musicList.length > 0) {
            searchType = 'artist'
          }
        }

        if (!musicList || musicList.length === 0) {
          return `未找到与 "${params}" 相关的歌单或艺术家`
        }

        // 保存列表记忆
        saveMusicListMemory(session.userId, musicList, 'playlist')

        const title = searchType === 'playlist'
          ? (musicList[0].playlist?.name || params)
          : `${params} 的歌曲`

        const subtitle = searchType === 'playlist'
          ? `歌单 · ${params}`
          : `艺术家 · ${params}`

        await renderMusicList(session, renderer, musicList, title, subtitle, 1, logger)
      } catch (error) {
        logger.error('[鼠鼠音乐] 获取歌单失败:', error)
        return '获取歌单失败，请稍后重试。'
      }
    })

  // ==================== df.music.play [序号] ====================
  ctx.command('df.music.play <number:number>', '点歌')
    .alias('df.点歌')
    .action(async ({ session }, number) => {
      try {
        if (!number || number < 1) {
          return '请输入有效的序号\n例如: df.music.play 1'
        }

        const userId = session.userId
        const listMemory = getMusicListMemory(userId)

        if (!listMemory) {
          return '您还没有获取音乐列表\n请先使用：\n• df.music.rank\n• df.music.playlist [歌单名]'
        }

        if (number > listMemory.list.length) {
          return `序号超出范围\n请输入 1-${listMemory.list.length} 之间的数字`
        }

        const music = listMemory.list[number - 1]
        await sendMusicMessage(ctx, session, music, cache, logger, { useCache: true })
      } catch (error) {
        logger.error('[鼠鼠音乐] 点歌失败:', error)
        return '点歌失败，请稍后重试。'
      }
    })

  // ==================== df.music.cache ====================
  ctx.command('df.music.cache', '音乐缓存状态')
    .alias('df.音乐缓存状态')
    .action(async () => {
      const stats = cache.getCacheStats()

      let message = '【鼠鼠音乐缓存统计】\n\n'
      message += `缓存文件数: ${stats.totalFiles}\n`
      message += `总缓存大小: ${stats.totalSizeMB} MB\n`
      message += `元数据记录: ${stats.metadataCount}\n\n`
      message += `使用 df.music.cache.clean 可清空所有缓存`

      return message
    })

  // ==================== df.music.cache.clean ====================
  ctx.command('df.music.cache.clean', '清理音乐缓存')
    .alias('df.清理音乐缓存')
    .userFields(['authority'])
    .action(async ({ session }) => {
      // 需要机器人主人权限 (authority >= 5)
      if ((session.user?.authority ?? 0) < 5) {
        return '只有机器人主人可以清理音乐缓存'
      }
      const beforeStats = cache.getCacheStats()
      await session.send('正在清理音乐缓存...')

      cache.clearAllCache()

      let message = '音乐缓存已清空\n\n'
      message += `清理文件: ${beforeStats.totalFiles} 个\n`
      message += `释放空间: ${beforeStats.totalSizeMB} MB`

      return message
    })
}
