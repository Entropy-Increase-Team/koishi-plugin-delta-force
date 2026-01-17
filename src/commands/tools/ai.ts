import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

interface AiPreset {
  code: string
  name: string
  isDefault?: boolean
}

const userCooldowns = new Map<string, number>()

export function registerAiCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  // AI锐评（默认预设）
  ctx.command('df.ai [mode:string]', 'AI评价战绩')
    .alias('df.ai锐评')
    .alias('df.锐评')
    .action(async ({ session }, mode) => {
      const userId = session.userId
      const platform = session.platform

      const gameMode = parseGameMode(mode)
      if (!gameMode) {
        return '无法识别的游戏模式，请使用以下格式：\n' +
          '• df.ai sol/烽火/烽火地带/摸金 (烽火地带)\n' +
          '• df.ai mp/战场/全面战场 (全面战场)\n' +
          '• df.ai (默认烽火地带)'
      }

      const cdKey = `${userId}:${platform}:${gameMode.type}`
      const lastUse = userCooldowns.get(cdKey) || 0
      const now = Date.now()
      const cdTime = 3600 * 1000

      if (now - lastUse < cdTime) {
        const remaining = Math.ceil((cdTime - (now - lastUse)) / 60000)
        return `${gameMode.name}模式的AI大脑正在冷却中，请在 ${remaining} 分钟后重试~`
      }

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      userCooldowns.set(cdKey, now)

      await session.send(`正在分析您的${gameMode.name}近期战绩，请耐心等待...`)

      try {
        const res = await api.getAiCommentary(token, gameMode.type)

        if (!res || !res.success || !res.data) {
          userCooldowns.delete(cdKey)
          return `AI评价失败: ${res?.message || res?.msg || '请求失败或未返回有效数据'}`
        }

        const fullAnswer = parseStreamResponse(res.data as string)

        if (fullAnswer.trim()) {
          return `【${gameMode.name}模式 AI锐评】\n${fullAnswer}`
        } else {
          userCooldowns.delete(cdKey)
          return `${gameMode.name}模式AI锐评失败，未能生成有效内容。`
        }
      } catch (error) {
        userCooldowns.delete(cdKey)
        logger.error('AI评价失败:', error)
        return `AI评价出错: ${(error as Error).message}`
      }
    })

  // AI评价（指定预设）
  ctx.command('df.ai.preset <mode:string> <preset:string>', 'AI评价（指定预设）')
    .alias('df.ai评价')
    .action(async ({ session }, mode, preset) => {
      if (!mode || !preset) {
        return '请指定游戏模式和预设：\n' +
          '格式: df.ai.preset <模式> <预设>\n' +
          '示例: df.ai.preset sol 锐评\n' +
          '示例: df.ai.preset mp cxg\n\n' +
          '使用 df.ai.presets 查看可用预设'
      }

      const userId = session.userId
      const platform = session.platform

      const gameMode = parseGameMode(mode)
      if (!gameMode) {
        return '无法识别的游戏模式，支持: sol/烽火, mp/战场'
      }

      const presetInfo = await findPreset(api, preset, dataManager)
      if (!presetInfo) {
        const presets = dataManager.getAiPresets()
        let hint = ''
        if (presets.length > 0) {
          hint = '\n可用预设: ' + presets.map((p: AiPreset) => `${p.name}(${p.code})`).join(', ')
        }
        return `无效的预设: ${preset}${hint}\n\n使用 df.ai.presets 查看可用预设`
      }

      const cdKey = `${userId}:${platform}:${gameMode.type}:${presetInfo.code}`
      const lastUse = userCooldowns.get(cdKey) || 0
      const now = Date.now()
      const cdTime = 3600 * 1000

      if (now - lastUse < cdTime) {
        const remaining = Math.ceil((cdTime - (now - lastUse)) / 60000)
        return `${gameMode.name}模式的${presetInfo.name}正在冷却中，请在 ${remaining} 分钟后重试~`
      }

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      userCooldowns.set(cdKey, now)

      await session.send(`正在使用【${presetInfo.name}】分析您的${gameMode.name}战绩，请耐心等待...`)

      try {
        const res = await api.getAiCommentary(token, gameMode.type, presetInfo.code)

        if (!res || !res.success || !res.data) {
          userCooldowns.delete(cdKey)
          return `AI评价失败: ${res?.message || res?.msg || '请求失败'}`
        }

        const fullAnswer = parseStreamResponse(res.data as string)

        if (fullAnswer.trim()) {
          return `【${gameMode.name} - ${presetInfo.name}】\n${fullAnswer}`
        } else {
          userCooldowns.delete(cdKey)
          return `AI评价失败，未能生成有效内容。`
        }
      } catch (error) {
        userCooldowns.delete(cdKey)
        logger.error('AI评价失败:', error)
        return `AI评价出错: ${(error as Error).message}`
      }
    })

  // 查看AI预设列表
  ctx.command('df.ai.presets', '查看AI评价预设列表')
    .alias('df.ai预设')
    .alias('df.ai预设列表')
    .action(async ({ session }) => {
      try {
        const res = await api.getAiPresets()

        if (await handleApiError(res, session)) return

        const presets = (res.data as AiPreset[]) || []

        if (presets.length === 0) {
          return '暂无可用的AI评价预设'
        }

        let message = '【AI评价预设列表】\n\n'
        for (const preset of presets) {
          const defaultMark = preset.isDefault ? ' (默认)' : ''
          message += `• ${preset.name} (${preset.code})${defaultMark}\n`
        }

        message += '\n使用方法：\n'
        message += '• df.ai [模式] - 使用默认预设\n'
        message += '• df.ai.preset <模式> <预设> - 使用指定预设\n'
        message += '\n示例: df.ai.preset sol 锐评'

        return message
      } catch (error) {
        logger.error('获取AI预设列表失败:', error)
        return `获取预设列表失败: ${(error as Error).message}`
      }
    })
}

function parseGameMode(modeStr?: string): { type: string; name: string } | null {
  if (!modeStr || modeStr.trim() === '') {
    return { type: 'sol', name: '烽火地带' }
  }

  const mode = modeStr.trim().toLowerCase()

  const solAliases = ['sol', '烽火', '烽火地带', '摸金', '4']
  const mpAliases = ['mp', '战场', '大战场', '全面战场', '5', 'tdm']

  if (solAliases.includes(mode)) {
    return { type: 'sol', name: '烽火地带' }
  } else if (mpAliases.includes(mode)) {
    return { type: 'mp', name: '全面战场' }
  }

  return null
}

function parseStreamResponse(streamContent: string): string {
  let fullAnswer = ''

  if (typeof streamContent !== 'string') {
    return ''
  }

  const lines = streamContent.split('\n').filter(line => line.trim().startsWith('data:'))

  for (const line of lines) {
    const jsonData = line.substring(6).trim()
    try {
      const parsedData = JSON.parse(jsonData)
      if (parsedData.answer) {
        fullAnswer += parsedData.answer
      }
    } catch {
      // 忽略解析失败的行
    }
  }

  return fullAnswer
}

async function findPreset(
  api: ApiService,
  input: string,
  dataManager: DataManager
): Promise<AiPreset | null> {
  const cachedPresets = dataManager.getAiPresets()
  let preset = cachedPresets.find(
    (p: AiPreset) => p.code === input || p.name === input
  )

  if (preset) {
    return preset
  }

  try {
    const res = await api.getAiPresets()
    if (res.success && res.data) {
      const presets = res.data as AiPreset[]
      preset = presets.find(p => p.code === input || p.name === input)
      return preset || null
    }
  } catch {
    // 忽略错误
  }

  return null
}
