import { Context } from 'koishi'
import { ApiService } from './api'
import { StaticCacheManager } from './database'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

interface MapItem {
  id: string | number
  name: string
}

interface OperatorItem {
  id: string | number
  name: string
}

// 数据缓存接口
interface RankScoreData {
  sol?: Record<string, string>
  tdm?: Record<string, string>
}

interface AudioTagsData {
  _tags: Record<string, string>        // tag -> description
  _keywords: Record<string, string>    // 中文关键词 -> tag
}

interface AudioData {
  tags: Record<string, string>
  keywords: Record<string, string>
  characters: Record<string, string>
  categories: Record<string, string>
}

// 数据缓存
let mapData: Map<string, string> | null = null
let operatorData: Map<string, string> | null = null
let rankScoreData: RankScoreData | null = null
let audioTagsData: AudioTagsData | null = null
let audioCharactersData: Record<string, string> | null = null
let audioCategoriesData: Record<string, string> | null = null

// 数据库缓存键前缀
const CACHE_PREFIX = 'delta_force_'

export class DataManager {
  private cacheManager: StaticCacheManager

  constructor(
    private ctx: Context,
    private api: ApiService
  ) {
    this.cacheManager = new StaticCacheManager(ctx)
  }

  async init() {
    this.ctx.logger('delta-force').info('正在初始化数据缓存...')

    // 先尝试从数据库加载本地缓存作为初始数据
    await this.loadLocalCache()

    // 然后尝试从API获取最新数据（使用 Promise.allSettled 确保即使API失败也不影响插件加载）
    const results = await Promise.allSettled([
      this.fetchAndCacheMaps(),
      this.fetchAndCacheOperators(),
      this.fetchAndCacheRankScore(),
      this.fetchAndCacheAudioData(),
    ])

    // 检查每个结果，记录失败的任务
    const taskNames = ['地图', '干员', '排位分数', '音频数据']
    const failedTasks: string[] = []

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedTasks.push(taskNames[index])
        this.ctx.logger('delta-force').warn(`${taskNames[index]}同步失败:`, result.reason)
      }
    })

    if (failedTasks.length === 0) {
      this.ctx.logger('delta-force').info('数据缓存初始化完成')
    } else {
      this.ctx.logger('delta-force').info(`数据缓存初始化完成（${failedTasks.length}个任务失败，已使用本地缓存）`)
    }
  }

  /**
   * 从数据库加载本地缓存
   */
  private async loadLocalCache() {
    try {
      const [maps, operators, rankScore, audioData] = await Promise.all([
        this.cacheManager.get(`${CACHE_PREFIX}maps`),
        this.cacheManager.get(`${CACHE_PREFIX}operators`),
        this.cacheManager.get(`${CACHE_PREFIX}rankscore`),
        this.cacheManager.get(`${CACHE_PREFIX}audiodata`),
      ])

      // 加载地图数据
      if (maps && maps.data) {
        mapData = new Map(Object.entries(maps.data as Record<string, string>) as [string, string][])
        this.ctx.logger('delta-force').debug(`已从数据库加载地图数据 (${mapData.size}条记录)`)
      }

      // 加载干员数据
      if (operators && operators.data) {
        operatorData = new Map(Object.entries(operators.data as Record<string, string>) as [string, string][])
        this.ctx.logger('delta-force').debug(`已从数据库加载干员数据 (${operatorData.size}条记录)`)
      }

      // 加载排位分数数据
      if (rankScore && rankScore.data) {
        rankScoreData = rankScore.data as RankScoreData
        this.ctx.logger('delta-force').debug(`已从数据库加载排位分数数据`)
      }

      // 加载音频数据
      if (audioData && audioData.data) {
        const data = audioData.data as AudioData
        if (data.tags && data.keywords) {
          audioTagsData = { _tags: data.tags, _keywords: data.keywords }
        }
        if (data.characters) {
          audioCharactersData = data.characters
        }
        if (data.categories) {
          audioCategoriesData = data.categories
        }
        this.ctx.logger('delta-force').debug(`已从数据库加载音频数据`)
      }
    } catch (error) {
      this.ctx.logger('delta-force').warn('从数据库加载本地缓存失败:', (error as Error).message)
    }
  }

  /**
   * 保存数据到数据库缓存
   */
  private async saveToDatabase(key: string, data: Record<string, unknown>) {
    try {
      await this.cacheManager.set(`${CACHE_PREFIX}${key}`, data)
    } catch (error) {
      this.ctx.logger('delta-force').warn(`保存${key}到数据库失败:`, (error as Error).message)
    }
  }

  private async fetchAndCacheMaps() {
    try {
      const res = await this.api.getMaps()
      if (res && (res.success || res.code === 0) && res.data) {
        const data: [string, string][] = (res.data as MapItem[]).map(item => [String(item.id), item.name])
        mapData = new Map(data)
        // 保存到数据库
        await this.saveToDatabase('maps', { data: Object.fromEntries(data) })
        this.ctx.logger('delta-force').debug(`地图数据同步成功 (${mapData.size}条记录)`)
      } else {
        throw new Error('API返回失败状态')
      }
    } catch (error) {
      this.ctx.logger('delta-force').warn('获取地图数据失败，使用本地缓存:', (error as Error).message)
      if (!mapData) {
        throw error
      }
    }
  }

  private async fetchAndCacheOperators() {
    try {
      const res = await this.api.getOperators()
      if (res && (res.success || res.code === 0) && res.data) {
        const data: [string, string][] = (res.data as OperatorItem[]).map(item => [String(item.id), item.name])
        operatorData = new Map(data)
        // 保存到数据库
        await this.saveToDatabase('operators', { data: Object.fromEntries(data) })
        this.ctx.logger('delta-force').debug(`干员数据同步成功 (${operatorData.size}条记录)`)
      } else {
        throw new Error('API返回失败状态')
      }
    } catch (error) {
      this.ctx.logger('delta-force').warn('获取干员数据失败，使用本地缓存:', (error as Error).message)
      if (!operatorData) {
        throw error
      }
    }
  }

  private async fetchAndCacheRankScore() {
    try {
      const res = await this.api.getRankScore()
      if (res && (res.success || res.code === 0) && res.data) {
        // 处理排位分数数据结构
        const processedData: RankScoreData = {}
        const data = res.data as Record<string, unknown>
        for (const mode in data) {
          processedData[mode] = {}
          const modeData = data[mode]
          if (Array.isArray(modeData)) {
            modeData.forEach((item: { score: string | number; name: string }) => {
              processedData[mode][String(item.score)] = item.name
            })
          }
        }
        rankScoreData = processedData
        // 保存到数据库
        await this.saveToDatabase('rankscore', { data: processedData })
        this.ctx.logger('delta-force').debug('排位分数数据同步成功')
      } else {
        throw new Error('API返回失败状态')
      }
    } catch (error) {
      this.ctx.logger('delta-force').warn('获取排位分数数据失败，使用本地缓存:', (error as Error).message)
      if (!rankScoreData) {
        throw error
      }
    }
  }

  private async fetchAndCacheAudioData() {
    try {
      const [tagsRes, charactersRes, categoriesRes] = await Promise.all([
        this.api.getAudioTags().catch(err => {
          this.ctx.logger('delta-force').warn('获取音频标签API失败:', (err as Error).message)
          return null
        }),
        this.api.getAudioCharacters().catch(err => {
          this.ctx.logger('delta-force').warn('获取音频角色API失败:', (err as Error).message)
          return null
        }),
        this.api.getAudioCategories().catch(err => {
          this.ctx.logger('delta-force').warn('获取音频分类API失败:', (err as Error).message)
          return null
        })
      ])

      const audioData: AudioData = {
        tags: {} as Record<string, string>,
        keywords: {} as Record<string, string>,
        characters: {} as Record<string, string>,
        categories: {} as Record<string, string>
      }

      let hasAnyData = false

      // 处理音频标签数据
      if (tagsRes && (tagsRes.success || tagsRes.code === 0)) {
        if (tagsRes.data && Array.isArray(tagsRes.data.tags)) {
          tagsRes.data.tags.forEach((tagInfo: { tag: string; description?: string }) => {
            const tag = tagInfo.tag
            const desc = tagInfo.description || ''

            audioData.tags[tag] = desc

            // 根据描述自动生成中文关键词映射
            if (desc) {
              const keywords = desc.split(/[\/、]/).map(k => k.trim())
              keywords.forEach((keyword: string) => {
                if (keyword && keyword.length > 0 && keyword.length < 20) {
                  audioData.keywords[keyword] = tag
                }
              })
            }
          })
          this.ctx.logger('delta-force').debug(`音频标签: ${Object.keys(audioData.tags).length}个tag, ${Object.keys(audioData.keywords).length}个关键词`)
          hasAnyData = true
        }
      }

      // 处理音频角色数据
      if (charactersRes && (charactersRes.success || charactersRes.code === 0)) {
        if (charactersRes.data && Array.isArray(charactersRes.data.characters)) {
          charactersRes.data.characters.forEach((char: { voiceId: string; name?: string; operatorId?: string; skins?: Array<{ name?: string; voiceId: string }> }) => {
            const voiceId = char.voiceId
            const name = char.name

            if (name) {
              audioData.characters[name] = voiceId
            }

            // 如果有皮肤，也添加皮肤名映射
            if (char.skins && Array.isArray(char.skins)) {
              char.skins.forEach((skin: { name?: string; voiceId: string }) => {
                if (skin.name) {
                  audioData.characters[skin.name] = skin.voiceId
                }
              })
            }
          })
          this.ctx.logger('delta-force').debug(`音频角色: ${Object.keys(audioData.characters).length}个映射`)
          hasAnyData = true
        }
      }

      // 处理音频分类数据
      if (categoriesRes && (categoriesRes.success || categoriesRes.code === 0)) {
        if (categoriesRes.data && Array.isArray(categoriesRes.data.categories)) {
          const categoryNames: Record<string, string> = {
            'Voice': '角色语音',
            'CutScene': '过场动画',
            'Amb': '环境音效',
            'Music': '背景音乐',
            'SFX': '音效',
            'Festivel': '节日活动',
            'Intro': '介绍',
            'UI': '界面',
            'Voice_SOL_MS': '单人模式'
          }

          categoriesRes.data.categories.forEach((catInfo: { category: string }) => {
            const category = catInfo.category
            const cnName = categoryNames[category] || category

            audioData.categories[category] = category
            audioData.categories[cnName] = category
            audioData.categories[category.toLowerCase()] = category
          })
          this.ctx.logger('delta-force').debug(`音频分类: ${categoriesRes.data.categories.length}个分类`)
          hasAnyData = true
        }
      }

      // 只有成功获取到至少一项数据时才更新
      if (hasAnyData) {
        if (Object.keys(audioData.tags).length > 0 || Object.keys(audioData.keywords).length > 0) {
          audioTagsData = { _tags: audioData.tags, _keywords: audioData.keywords }
        }
        if (Object.keys(audioData.characters).length > 0) {
          audioCharactersData = audioData.characters
        }
        if (Object.keys(audioData.categories).length > 0) {
          audioCategoriesData = audioData.categories
        }
        // 保存到数据库
        await this.saveToDatabase('audiodata', { data: audioData })
        const tagCount = Object.keys(audioData.tags).length || 0
        const keywordCount = Object.keys(audioData.keywords).length || 0
        const charCount = Object.keys(audioData.characters).length || 0
        const catCount = Object.keys(audioData.categories).length || 0
        this.ctx.logger('delta-force').debug(`音频数据同步完成 (标签${tagCount}/${keywordCount}, 角色${charCount}, 分类${catCount})`)
      }
    } catch (error) {
      this.ctx.logger('delta-force').error('音频数据API请求异常:', (error as Error).message)
      if (!audioTagsData && !audioCharactersData && !audioCategoriesData) {
        throw error
      }
    }
  }

  // ============ 数据访问方法 ============

  getMapName(id: string | number): string {
    if (!mapData) return `地图(${id})`
    return mapData.get(String(id)) || `未知地图(${id})`
  }

  getOperatorName(id: string | number): string {
    if (!operatorData) return `干员(${id})`
    return operatorData.get(String(id)) || `未知干员(${id})`
  }

  /**
   * 根据分数获取对应的段位名称
   * @param score 分数
   * @param mode 模式 ('sol' 或 'tdm')
   * @returns 段位名称
   */
  getRankByScore(score: string | number, mode: 'sol' | 'tdm' = 'sol'): string {
    if (!rankScoreData) return `${score}分`

    const numScore = typeof score === 'string' ? parseInt(score) : score
    if (isNaN(numScore)) {
      return `分数无效(${score})`
    }

    const modeData = rankScoreData[mode]
    if (!modeData) {
      return `${score}分 (${mode}模式)`
    }

    // 获取所有分数阈值并排序
    const thresholds = Object.keys(modeData).map(s => parseInt(s)).sort((a, b) => b - a)

    // 找到第一个小于等于目标分数的阈值
    for (const threshold of thresholds) {
      if (numScore >= threshold) {
        const rankName = modeData[String(threshold)]

        // 检查是否是最高段位需要计算星级
        const isHighestRank = (mode === 'sol' && threshold === 6000) || (mode === 'tdm' && threshold === 5000)

        if (isHighestRank && numScore > threshold) {
          // 计算星级：超出部分每50分一颗星
          const extraScore = numScore - threshold
          const stars = Math.floor(extraScore / 50)
          if (stars > 0) {
            return `${rankName}${stars}星 (${numScore})`
          }
        }

        return `${rankName} (${numScore})`
      }
    }

    // 如果分数低于所有阈值，返回最低段位
    const lowestThreshold = thresholds[thresholds.length - 1]
    const lowestRank = modeData[String(lowestThreshold)]
    return `${lowestRank} (${numScore})`
  }

  /**
   * 根据中文名或tag获取音频标签
   * @param keyword 关键词（中文名或tag）
   * @returns tag值
   */
  getAudioTag(keyword: string): string | null {
    if (!audioTagsData) return null

    // 先检查是否是tag本身
    if (audioTagsData._tags[keyword]) {
      return keyword
    }
    // 再检查是否是中文关键词
    if (audioTagsData._keywords[keyword]) {
      return audioTagsData._keywords[keyword]
    }

    return null
  }

  /**
   * 判断字符串是否是tag格式
   * @param str 字符串
   * @returns 是否是tag格式
   */
  isTagFormat(str: string): boolean {
    if (!str || typeof str !== 'string') return false

    return str.startsWith('boss-') ||
           str.startsWith('task-') ||
           str.startsWith('Evac-') ||
           str.startsWith('eggs-') ||
           str.startsWith('bf-') ||
           str.startsWith('BF_') ||
           ['haavk', 'commander', 'babel', 'Beginner'].includes(str)
  }

  /**
   * 根据中文名或voiceId获取角色ID
   * @param keyword 关键词（中文名或voiceId）
   * @returns voiceId值
   */
  getAudioCharacter(keyword: string): string | null {
    if (!audioCharactersData) return null
    return audioCharactersData[keyword] || null
  }

  /**
   * 根据中文名或英文名获取音频分类
   * @param keyword 关键词（中文名或英文名）
   * @returns category值
   */
  getAudioCategory(keyword: string): string | null {
    if (!audioCategoriesData) return null
    return audioCategoriesData[keyword] || null
  }

  /**
   * 检查是否是有效的音频标签
   * @param keyword 关键词
   * @returns 是否是有效标签
   */
  isValidAudioTag(keyword: string): boolean {
    return this.getAudioTag(keyword) !== null
  }

  /**
   * 检查是否是有效的角色名
   * @param keyword 关键词
   * @returns 是否是有效角色
   */
  isValidAudioCharacter(keyword: string): boolean {
    return this.getAudioCharacter(keyword) !== null
  }
}
