import { Context } from 'koishi'
import { ApiService } from './api'
import { StaticCacheManager } from './database'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

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

interface AiPreset {
  code: string
  name: string
  isDefault?: boolean
}

// 数据缓存
let mapData: Map<string, string> | null = null
let operatorData: Map<string, string> | null = null
let rankScoreData: RankScoreData | null = null
let audioTagsData: AudioTagsData | null = null
let audioCharactersData: Record<string, string> | null = null
let audioCategoriesData: Record<string, string> | null = null
let aiPresetsData: AiPreset[] | null = null

// 数据库缓存键前缀
const CACHE_PREFIX = 'delta_force_'

export class DataManager {
  private cacheManager: StaticCacheManager
  private resourcesPath: string

  constructor(
    private ctx: Context,
    private api: ApiService
  ) {
    this.cacheManager = new StaticCacheManager(ctx)
    
    // 优先使用 ctx.baseDir/data/delta-force/resources（云端下载的资源）
    const cloudResourcesPath = join(ctx.baseDir, 'data', 'delta-force', 'resources')
    // 备用路径：插件目录下的 resources（开发时使用）
    const localResourcesPath = resolve(__dirname, '../resources')

    // 检查云端资源是否存在
    if (existsSync(join(cloudResourcesPath, 'data'))) {
      this.resourcesPath = cloudResourcesPath
    } else {
      this.resourcesPath = localResourcesPath
    }
  }

  /**
   * 将相对路径转换为完整的 file:// URL
   * 用于模板中不使用 _res_path 拼接的字段（如 record 模板的 mapBg）
   * @param relativePath 相对于 resources 目录的路径
   * @returns 完整的 file:// URL
   */
  getFullFileUrl(relativePath: string | null): string | null {
    if (!relativePath) return null
    const fullPath = join(this.resourcesPath, relativePath).replace(/\\/g, '/')
    return `file:///${fullPath}`
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
   * 根据分数获取对应的段位图片路径
   * @param score 分数
   * @param mode 模式 ('sol' 或 'tdm')
   * @returns 段位图片路径 (相对于 resources 目录)
   */
  getRankImage(score: string | number, mode: 'sol' | 'tdm' = 'sol'): string {
    // 先获取段位名称
    const rankName = this.getRankByScore(score, mode)
    if (!rankName || rankName.includes('分数无效') || rankName.includes('未知')) {
      return ''
    }

    // 清理段位名称，移除分数和星级信息
    const cleanRankName = rankName.replace(/\s*\(\d+\)/, '').replace(/\d+星/, '').trim()

    // 段位映射表
    const rankMappings: Record<string, Record<string, string>> = {
      sol: {
        '青铜 V': '1_5', '青铜 IV': '1_4', '青铜 III': '1_3', '青铜 II': '1_2', '青铜 I': '1_1',
        '白银 V': '2_5', '白银 IV': '2_4', '白银 III': '2_3', '白银 II': '2_2', '白银 I': '2_1',
        '黄金 V': '3_5', '黄金 IV': '3_4', '黄金 III': '3_3', '黄金 II': '3_2', '黄金 I': '3_1',
        '铂金 V': '4_5', '铂金 IV': '4_4', '铂金 III': '4_3', '铂金 II': '4_2', '铂金 I': '4_1',
        '钻石 V': '5_5', '钻石 IV': '5_4', '钻石 III': '5_3', '钻石 II': '5_2', '钻石 I': '5_1',
        '黑鹰 V': '6_5', '黑鹰 IV': '6_4', '黑鹰 III': '6_3', '黑鹰 II': '6_2', '黑鹰 I': '6_1',
        '三角洲巅峰': '7',
      },
      tdm: {
        '列兵 V': '1_5', '列兵 IV': '1_4', '列兵 III': '1_3', '列兵 II': '1_2', '列兵 I': '1_1',
        '上等兵 V': '2_5', '上等兵 IV': '2_4', '上等兵 III': '2_3', '上等兵 II': '2_2', '上等兵 I': '2_1',
        '军士长 V': '3_5', '军士长 IV': '3_4', '军士长 III': '3_3', '军士长 II': '3_2', '军士长 I': '3_1',
        '尉官 V': '4_5', '尉官 IV': '4_4', '尉官 III': '4_3', '尉官 II': '4_2', '尉官 I': '4_1',
        '校官 V': '5_5', '校官 IV': '5_4', '校官 III': '5_3', '校官 II': '5_2', '校官 I': '5_1',
        '将军 V': '6_5', '将军 IV': '6_4', '将军 III': '6_3', '将军 II': '6_2', '将军 I': '6_1',
        '统帅': '7',
      },
    }

    // 统一模式名称
    const modeKey = mode === 'tdm' ? 'mp' : mode
    const mappings = rankMappings[mode] || rankMappings.sol

    const rankCode = mappings[cleanRankName]
    if (!rankCode) {
      this.ctx.logger('delta-force').warn(`未找到段位映射: ${cleanRankName} (模式: ${mode})`)
      return ''
    }

    return `imgs/rank/${modeKey}/${rankCode}.webp`
  }

  /**
   * 随机选择一张背景图片
   * @returns 背景图片路径 (相对于 resources 目录)
   */
  getRandomBackground(): string {
    const backgrounds = [
      'bg2-1.webp', 'bg2-2.webp', 'bg2-3.webp', 'bg2-4.webp',
      'bg2-5.webp', 'bg2-6.webp', 'bg2-7.webp',
    ]
    const randomIndex = Math.floor(Math.random() * backgrounds.length)
    return `imgs/background/${backgrounds[randomIndex]}`
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

  /**
   * 获取AI评价预设列表
   * @returns AI预设列表
   */
  getAiPresets(): AiPreset[] {
    return aiPresetsData || []
  }

  /**
   * 设置AI评价预设列表（供外部更新）
   * @param presets 预设列表
   */
  setAiPresets(presets: AiPreset[]): void {
    aiPresetsData = presets
  }

  /**
   * 查找AI预设（按code或name）
   * @param input 预设code或name
   * @returns 匹配的预设或null
   */
  findAiPreset(input: string): AiPreset | null {
    if (!aiPresetsData) return null
    return aiPresetsData.find(p => p.code === input || p.name === input) || null
  }

  /**
   * 根据干员名称获取干员图片路径
   * @param operatorName 干员名称
   * @returns 干员图片相对路径（相对于 resources 目录，供模板使用）
   */
  getOperatorImagePath(operatorName: string): string | null {
    if (!operatorName || operatorName.includes('未知') || operatorName.includes('无')) {
      return null
    }
    // 清理干员名称，移除可能的括号内容
    const cleanName = operatorName.replace(/\s*\([^)]*\)/, '').trim()
    if (!cleanName) {
      return null
    }
    
    // 返回相对路径，供模板与 _res_path 拼接使用
    return `imgs/operator/${cleanName}.png`
  }

  /**
   * 根据地图名称获取地图图片路径
   * @param mapName 地图名称
   * @param mode 模式 ('sol' 烽火地带 或 'mp' 全面战场)
   * @returns 地图图片相对路径（相对于 resources 目录，供模板使用）
   */
  getMapImagePath(mapName: string, mode: 'sol' | 'mp' = 'sol'): string | null {
    if (!mapName || mapName.includes('未知') || mapName.includes('无')) {
      return null
    }
    // 清理地图名称，移除可能的括号内容
    let cleanName = mapName.trim().replace(/\s*\([^)]*\)/, '')
    
    // 根据模式构建路径
    const prefix = mode === 'sol' ? '烽火-' : '全面-'
    
    // 全面战场模式：从地图名称中提取"-"前面的部分
    if (mode === 'mp') {
      if (cleanName.includes('-')) {
        cleanName = cleanName.split('-')[0].trim()
      }
      // 返回相对路径，供模板与 _res_path 拼接使用
      return `imgs/map/${prefix}${cleanName}.jpg`
    } else {
      // 烽火地带模式：提取基础地图名称和难度
      let baseName = cleanName
      let difficulty = '常规'
      if (cleanName.includes('-')) {
        const parts = cleanName.split('-')
        baseName = parts[0].trim()
        if (parts[1]) {
          difficulty = parts[1].replace(/[（(].*$/, '').trim()
        }
      }
      // 返回相对路径，供模板与 _res_path 拼接使用
      return `imgs/map/${prefix}${baseName}-${difficulty}.png`
    }
  }
}
