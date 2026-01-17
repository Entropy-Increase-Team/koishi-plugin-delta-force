import { Context, h } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { handleApiError } from '../../utils'

// 场景映射
const SCENE_MAP: Record<string, string> = {
  '局内': 'InGame',
  '局外': 'OutGame',
  'ingame': 'InGame',
  'outgame': 'OutGame',
}

// 动作类型映射
const ACTION_MAP: Record<string, string> = {
  '呼吸': 'Breath',
  '战斗': 'Combat',
  '死亡': 'Death',
  '受伤': 'Pain',
  'breath': 'Breath',
  'combat': 'Combat',
  'death': 'Death',
  'pain': 'Pain',
}

/**
 * 注册语音相关命令
 */
export function registerVoiceCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  // 随机语音
  ctx.command('df.voice [args:text]', '获取随机语音')
    .alias('df.语音')
    .usage('示例:\n  df.voice - 完全随机\n  df.voice 红狼 - 指定角色\n  df.voice 红狼 局内 - 指定角色和场景\n  df.voice 红狼 局内 战斗 - 指定角色、场景和动作')
    .action(async ({ session }, args) => {
      try {
        const queryParams = parseVoiceParams(args || '', dataManager)

        let hint = '正在获取'
        if (queryParams.hint) {
          hint += ` ${queryParams.hint}`
        }
        hint += ' 语音...'
        await session.send(hint)

        // 调用对应的API
        let res
        if (queryParams.category) {
          res = await api.getRandomAudio({ category: queryParams.category, count: 1 })
        } else if (queryParams.tag) {
          res = await api.getRandomAudio({ tag: queryParams.tag, count: 1 })
        } else if (queryParams.character || queryParams.scene || queryParams.actionType) {
          const apiParams: Record<string, string | number> = { count: 1 }
          if (queryParams.character) apiParams.character = queryParams.character
          if (queryParams.scene) apiParams.scene = queryParams.scene
          if (queryParams.actionType) apiParams.actionType = queryParams.actionType
          res = await api.getCharacterAudio(apiParams)
        } else {
          res = await api.getRandomAudio({ count: 1 })
        }

        if (await handleApiError(res, session)) return

        interface AudioData {
          audios?: Array<{
            download?: { url?: string; expiresIn?: number }
            character?: { name?: string; profession?: string }
            scene?: string
            actionType?: string
            fileName?: string
          }>
        }

        const data = res.data as AudioData | undefined
        if (!data?.audios || data.audios.length === 0) {
          return '未找到符合条件的语音\n使用 df.voice.list 查看所有可用角色'
        }

        const audio = data.audios[0]
        return await sendVoiceMessage(audio, session)
      } catch (error) {
        logger.error('获取语音失败:', error)
        return '获取语音失败，请稍后重试'
      }
    })

  // 角色列表
  ctx.command('df.voice.list', '查看语音角色列表')
    .alias('df.语音列表')
    .action(async ({ session }) => {
      await session.send('正在获取角色列表...')

      try {
        const res = await api.getAudioCharacters()

        if (await handleApiError(res, session)) return

        interface CharacterData {
          characters?: Array<{
            voiceId: string
            name?: string
            profession?: string
            skins?: Array<{ name?: string; voiceId: string }>
          }>
        }

        const data = res.data as CharacterData | undefined
        if (!data?.characters) {
          return '获取角色列表失败'
        }

        // 按职业分组
        const groups: Record<string, Array<{ voiceId: string; name: string; skins: string[] }>> = {
          '医疗': [],
          '侦查': [],
          '突击': [],
          '工程': [],
          '其他': [],
        }

        data.characters.forEach(char => {
          const profession = char.profession || '其他'
          const name = char.name || char.voiceId || '未知'
          const voiceId = char.voiceId

          let groupKey = profession
          if (!groups[profession]) {
            if (voiceId.startsWith('Voice_1')) groupKey = '医疗'
            else if (voiceId.startsWith('Voice_2')) groupKey = '侦查'
            else if (voiceId.startsWith('Voice_3')) groupKey = '突击'
            else if (voiceId.startsWith('Voice_4')) groupKey = '工程'
            else groupKey = '其他'
          }

          const skins = char.skins?.map(s => s.name || s.voiceId) || []
          groups[groupKey].push({ voiceId, name, skins })
        })

        const lines: string[] = [`【角色语音列表】(${data.characters.length}个角色)`]
        lines.push('━━━━━━━━━━━━━━━')

        for (const [category, characters] of Object.entries(groups)) {
          if (characters.length > 0) {
            lines.push('')
            lines.push(`【${category}】`)
            characters.forEach((char, index) => {
              let line = `${index + 1}. ${char.name}`
              if (char.skins.length > 0) {
                line += ` (皮肤: ${char.skins.slice(0, 3).join(', ')}${char.skins.length > 3 ? '...' : ''})`
              }
              lines.push(line)
            })
          }
        }

        lines.push('')
        lines.push('使用: df.voice <角色名> [场景] [动作]')

        return lines.join('\n')
      } catch (error) {
        logger.error('获取角色列表失败:', error)
        return '获取角色列表失败，请稍后重试'
      }
    })

  // 标签列表
  ctx.command('df.voice.tags', '查看语音标签列表')
    .alias('df.标签列表')
    .action(async ({ session }) => {
      await session.send('正在获取标签列表...')

      try {
        const res = await api.getAudioTags()

        if (await handleApiError(res, session)) return

        interface TagData {
          tags?: Array<{ tag: string; description?: string }>
        }

        const data = res.data as TagData | undefined
        if (!data?.tags) {
          return '获取标签列表失败'
        }

        // 按类型分组
        const groups: Record<string, Array<{ tag: string; desc: string }>> = {
          'Boss语音': [],
          '任务语音': [],
          '撤离语音': [],
          '彩蛋语音': [],
          '全面战场': [],
          '其他': [],
        }

        data.tags.forEach(tagInfo => {
          const tag = tagInfo.tag
          const desc = tagInfo.description || ''
          const item = { tag, desc }

          if (tag.startsWith('boss-')) groups['Boss语音'].push(item)
          else if (tag.startsWith('task-')) groups['任务语音'].push(item)
          else if (tag.startsWith('Evac-')) groups['撤离语音'].push(item)
          else if (tag.startsWith('eggs-')) groups['彩蛋语音'].push(item)
          else if (tag.startsWith('bf-') || tag.startsWith('BF_')) groups['全面战场'].push(item)
          else groups['其他'].push(item)
        })

        const lines: string[] = [`【特殊语音标签】(${data.tags.length}个)`]
        lines.push('━━━━━━━━━━━━━━━')

        for (const [category, tags] of Object.entries(groups)) {
          if (tags.length > 0) {
            lines.push('')
            lines.push(`【${category}】`)
            tags.slice(0, 10).forEach((item, index) => {
              let line = `${index + 1}. ${item.tag}`
              if (item.desc) line += ` - ${item.desc}`
              lines.push(line)
            })
            if (tags.length > 10) {
              lines.push(`... 还有 ${tags.length - 10} 个`)
            }
          }
        }

        lines.push('')
        lines.push('使用: df.voice <标签>')

        return lines.join('\n')
      } catch (error) {
        logger.error('获取标签列表失败:', error)
        return '获取标签列表失败，请稍后重试'
      }
    })

  // 语音分类
  ctx.command('df.voice.categories', '查看语音分类')
    .alias('df.语音分类')
    .action(async ({ session }) => {
      await session.send('正在获取分类列表...')

      try {
        const res = await api.getAudioCategories()

        if (await handleApiError(res, session)) return

        interface CategoryData {
          categories?: Array<{ category: string }>
        }

        const data = res.data as CategoryData | undefined
        if (!data?.categories) {
          return '获取分类列表失败'
        }

        const categoryNameMap: Record<string, string> = {
          'Voice': '角色语音',
          'CutScene': '过场动画',
          'Amb': '环境音效',
          'Music': '背景音乐',
          'SFX': '音效',
          'Festivel': '节日活动',
        }

        const lines: string[] = ['【音频分类】']
        lines.push('━━━━━━━━━━━━━━━')

        data.categories.forEach(cat => {
          const categoryName = categoryNameMap[cat.category] || cat.category
          lines.push(`• ${categoryName} (${cat.category})`)
        })

        lines.push('')
        lines.push('使用: df.voice <分类名>')

        return lines.join('\n')
      } catch (error) {
        logger.error('获取分类列表失败:', error)
        return '获取分类列表失败，请稍后重试'
      }
    })

  // 语音统计
  ctx.command('df.voice.stats', '查看语音统计')
    .alias('df.语音统计')
    .action(async ({ session }) => {
      await session.send('正在获取统计信息...')

      try {
        const res = await api.getAudioStats()

        if (await handleApiError(res, session)) return

        interface StatsData {
          totalFiles?: number
          categories?: Array<{ category: string; fileCount: number }>
        }

        const data = res.data as StatsData | undefined
        if (!data) {
          return '获取统计信息失败'
        }

        const categoryNameMap: Record<string, string> = {
          'Voice': '角色语音',
          'CutScene': '过场动画',
          'Amb': '环境音效',
          'Music': '背景音乐',
          'SFX': '音效',
          'Festivel': '节日活动',
        }

        const lines: string[] = ['【音频统计】']
        lines.push('━━━━━━━━━━━━━━━')
        lines.push(`总文件数: ${data.totalFiles || 0}`)

        if (data.categories && data.categories.length > 0) {
          lines.push('')
          lines.push('分类统计:')
          data.categories.forEach(cat => {
            const categoryName = categoryNameMap[cat.category] || cat.category
            lines.push(`• ${categoryName}: ${cat.fileCount} 个`)
          })
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('获取统计信息失败:', error)
        return '获取统计信息失败，请稍后重试'
      }
    })
}

/**
 * 解析语音参数
 */
function parseVoiceParams(
  params: string,
  dataManager: DataManager
): {
  character?: string
  scene?: string
  actionType?: string
  category?: string
  tag?: string
  hint: string
} {
  if (!params) {
    return { hint: '随机' }
  }

  const args = params.split(/\s+/).filter(arg => arg)
  const result: {
    character?: string
    scene?: string
    actionType?: string
    category?: string
    tag?: string
    hint: string
  } = { hint: '' }

  let hint = ''

  // 第一个参数
  if (args[0]) {
    const firstArg = args[0]

    // 1. 检查是否是音频分类
    const mappedCategory = dataManager.getAudioCategory(firstArg)
    if (mappedCategory) {
      result.category = mappedCategory
      result.hint = firstArg
      return result
    }

    // 2. 检查是否是特殊标签
    const mappedTag = dataManager.getAudioTag(firstArg)
    if (mappedTag) {
      result.tag = mappedTag
      result.hint = firstArg
      return result
    }

    // 3. 检查是否是场景
    if (SCENE_MAP[firstArg] || SCENE_MAP[firstArg.toLowerCase()]) {
      result.scene = SCENE_MAP[firstArg] || SCENE_MAP[firstArg.toLowerCase()]
      hint = firstArg
    }
    // 4. 检查是否是动作类型
    else if (ACTION_MAP[firstArg] || ACTION_MAP[firstArg.toLowerCase()]) {
      result.actionType = ACTION_MAP[firstArg] || ACTION_MAP[firstArg.toLowerCase()]
      hint = firstArg
    }
    // 5. 默认当作角色参数
    else {
      result.character = firstArg
      hint = firstArg
    }
  }

  // 第二个参数
  if (args[1]) {
    const secondArg = args[1]

    if (SCENE_MAP[secondArg] || SCENE_MAP[secondArg.toLowerCase()]) {
      result.scene = SCENE_MAP[secondArg] || SCENE_MAP[secondArg.toLowerCase()]
      hint += ` ${secondArg}`
    } else if (ACTION_MAP[secondArg] || ACTION_MAP[secondArg.toLowerCase()]) {
      result.actionType = ACTION_MAP[secondArg] || ACTION_MAP[secondArg.toLowerCase()]
      hint += ` ${secondArg}`
    }
  }

  // 第三个参数
  if (args[2]) {
    const thirdArg = args[2]

    if (ACTION_MAP[thirdArg] || ACTION_MAP[thirdArg.toLowerCase()]) {
      result.actionType = ACTION_MAP[thirdArg] || ACTION_MAP[thirdArg.toLowerCase()]
      hint += ` ${thirdArg}`
    }
  }

  result.hint = hint || '随机'
  return result
}

/**
 * 发送语音消息
 */
async function sendVoiceMessage(
  audio: {
    download?: { url?: string; expiresIn?: number }
    character?: { name?: string; profession?: string }
    scene?: string
    actionType?: string
    fileName?: string
  },
  session: { send: (msg: unknown) => Promise<unknown> }
): Promise<string | void> {
  if (!audio.download?.url) {
    return '音频数据异常，请稍后重试'
  }

  const infoMsg: string[] = []

  // 角色名称
  if (audio.character?.name) {
    let charInfo = `【${audio.character.name}】`
    if (audio.character.profession) {
      charInfo += ` (${audio.character.profession})`
    }
    infoMsg.push(charInfo)
  }

  // 场景和动作
  if (audio.scene || audio.actionType) {
    let detail = ''
    if (audio.scene === 'InGame') detail += '局内'
    else if (audio.scene === 'OutGame') detail += '局外'

    if (audio.actionType) {
      if (detail) detail += ' - '
      detail += audio.actionType
    }

    if (detail) {
      infoMsg.push(detail)
    }
  }

  // 链接有效期提示
  if (audio.download.expiresIn) {
    const minutes = Math.floor(audio.download.expiresIn / 60)
    const seconds = audio.download.expiresIn % 60
    infoMsg.push(`(链接${minutes}分${seconds}秒后失效)`)
  }

  // 发送语音
  const textPart = infoMsg.length > 0 ? infoMsg.join(' ') + '\n' : ''
  await session.send(textPart + h.audio(audio.download.url))
}
