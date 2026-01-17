import { Context, h } from 'koishi'
import { ApiService } from '../../api'
import { handleApiError, sleep } from '../../utils'

/**
 * 注册TTS语音合成相关命令
 */
export function registerTtsCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // TTS状态
  ctx.command('df.tts.status', '查看TTS服务状态')
    .alias('df.tts状态')
    .action(async ({ session }) => {
      await session.send('正在检查TTS服务状态...')

      try {
        const res = await api.getTtsHealth()

        if (await handleApiError(res, session)) return

        interface TtsHealthData {
          message?: string
          presetsLoaded?: boolean
          presetCount?: number
          timestamp?: string
        }

        const data = res as unknown as { success?: boolean } & TtsHealthData

        if (!data.success) {
          return 'TTS服务异常，请稍后重试'
        }

        const lines: string[] = ['【TTS语音合成服务状态】']
        lines.push('━━━━━━━━━━━━━━━')
        lines.push(`状态: ${data.message || '正常'}`)
        lines.push(`预设加载: ${data.presetsLoaded ? '✅ 已加载' : '❌ 未加载'}`)
        lines.push(`预设数量: ${data.presetCount || 0} 个`)

        if (data.timestamp) {
          const time = new Date(data.timestamp).toLocaleString('zh-CN')
          lines.push(`检查时间: ${time}`)
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('获取TTS状态失败:', error)
        return '获取TTS状态失败，请稍后重试'
      }
    })

  // TTS角色列表
  ctx.command('df.tts.presets', '查看TTS角色预设列表')
    .alias('df.tts角色列表')
    .alias('df.tts预设列表')
    .action(async ({ session }) => {
      await session.send('正在获取TTS角色预设列表...')

      try {
        const res = await api.getTtsPresets()

        if (await handleApiError(res, session)) return

        interface TtsPreset {
          id: string
          name: string
          description?: string
          defaultEmotion?: string
          emotions?: Array<{ id: string; name: string; description?: string }>
        }

        interface TtsPresetsData {
          defaultPreset?: string
          presets?: TtsPreset[]
        }

        const data = res.data as TtsPresetsData | undefined

        if (!data?.presets) {
          return '获取角色预设列表失败'
        }

        const { defaultPreset, presets } = data

        const lines: string[] = [`【TTS角色预设列表】(${presets.length}个)`]
        lines.push(`默认角色: ${defaultPreset || '未设置'}`)
        lines.push('━━━━━━━━━━━━━━━')

        presets.forEach((preset, index) => {
          lines.push('')
          lines.push(`${index + 1}. 【${preset.name}】(${preset.id})`)
          if (preset.description) {
            lines.push(`   描述: ${preset.description}`)
          }
          lines.push(`   默认情感: ${preset.defaultEmotion || 'neutral'}`)

          if (preset.emotions && preset.emotions.length > 0) {
            const emotionNames = preset.emotions.map(e => e.name).join('、')
            lines.push(`   可用情感: ${emotionNames}`)
          }
        })

        lines.push('')
        lines.push('使用: df.tts <角色> [情感] <文本>')
        lines.push('示例: df.tts 麦晓雯 开心 你好呀！')

        return lines.join('\n')
      } catch (error) {
        logger.error('获取TTS角色预设列表失败:', error)
        return '获取角色预设列表失败，请稍后重试'
      }
    })

  // TTS角色详情
  ctx.command('df.tts.preset <characterId:string>', '查看TTS角色预设详情')
    .alias('df.tts角色详情')
    .action(async ({ session }, characterId) => {
      if (!characterId) {
        return '请指定角色ID\n例如: df.tts.preset maiXiaowen'
      }

      await session.send(`正在获取角色 "${characterId}" 的详情...`)

      try {
        const res = await api.getTtsPreset(characterId)

        if (await handleApiError(res, session)) return

        interface TtsPresetDetail {
          id: string
          name: string
          description?: string
          defaultEmotion?: string
          voiceFileExists?: boolean
          emotions?: Array<{ id: string; name: string; description?: string }>
        }

        const preset = res.data as TtsPresetDetail | undefined

        if (!preset) {
          return `未找到角色 "${characterId}"`
        }

        const lines: string[] = [`【${preset.name}】`]
        lines.push('━━━━━━━━━━━━━━━')
        lines.push(`ID: ${preset.id}`)
        lines.push(`描述: ${preset.description || '无'}`)
        lines.push(`默认情感: ${preset.defaultEmotion || 'neutral'}`)
        lines.push(`音色文件: ${preset.voiceFileExists ? '✅ 存在' : '❌ 缺失'}`)

        if (preset.emotions && preset.emotions.length > 0) {
          lines.push('')
          lines.push('【可用情感】')
          preset.emotions.forEach(emo => {
            let line = `• ${emo.name} (${emo.id})`
            if (emo.description) {
              line += ` - ${emo.description}`
            }
            lines.push(line)
          })
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('获取TTS角色详情失败:', error)
        return '获取角色详情失败，请稍后重试'
      }
    })

  // TTS语音合成
  ctx.command('df.tts <args:text>', 'TTS语音合成')
    .usage('格式: df.tts <角色> [情感] <文本>\n示例: df.tts 麦晓雯 开心 你好呀！')
    .action(async ({ session }, args) => {
      if (!args) {
        return '请输入要合成的内容\n格式: df.tts <角色> [情感] <文本>'
      }

      try {
        // 解析参数
        const parseResult = await parseTtsParams(args, api, logger)

        if (parseResult.error) {
          return parseResult.error
        }

        if (!parseResult.text) {
          return '请输入要合成的文本内容'
        }

        // 检查文本长度
        const maxLength = 800
        if (parseResult.text.length > maxLength) {
          return `文本过长（${parseResult.text.length}字），最多支持${maxLength}字符`
        }

        // 构建API请求参数
        const apiParams: { text: string; character: string; emotion?: string } = {
          text: parseResult.text,
          character: parseResult.character || 'maiXiaowen', // 默认角色
        }

        if (parseResult.emotion) {
          apiParams.emotion = parseResult.emotion
        }

        logger.debug('TTS请求参数:', apiParams)

        // 调用TTS合成API
        const res = await api.ttsSynthesize(apiParams)

        if (await handleApiError(res, session)) return

        interface TtsSynthesizeData {
          taskId?: string
          position?: number
          queueLength?: number
        }

        const synthData = res.data as TtsSynthesizeData | undefined

        if (!synthData?.taskId) {
          return `语音合成失败: ${res.message || '未知错误'}`
        }

        const { taskId, position, queueLength } = synthData

        // 发送队列提示
        let queueHint = '语音合成任务已提交'
        if (parseResult.characterName) {
          queueHint += `\n角色: ${parseResult.characterName}`
          if (parseResult.emotionName) {
            queueHint += ` | 情感: ${parseResult.emotionName}`
          }
        }
        if (position && queueLength) {
          queueHint += `\n队列位置: ${position}/${queueLength}`
        }
        queueHint += '\n正在处理中，请稍候...'

        await session.send(queueHint)

        // 轮询任务状态
        const result = await pollTaskStatus(taskId, api, logger)

        if (!result.success) {
          return result.message || '语音合成失败'
        }

        // 发送语音
        if (result.audio_url) {
          await session.send(h.audio(result.audio_url))
          logger.info(`TTS合成成功: ${result.filename}, 文本: ${parseResult.text.substring(0, 20)}...`)
        }
      } catch (error) {
        logger.error('TTS语音合成失败:', error)
        return '语音合成失败，请稍后重试'
      }
    })

  // TTS队列状态
  ctx.command('df.tts.queue', '查看TTS队列状态')
    .alias('df.tts队列')
    .action(async ({ session }) => {
      try {
        const res = await api.getTtsQueueStatus()

        if (await handleApiError(res, session)) return

        interface QueueData {
          queueLength?: number
          processing?: boolean
          currentTask?: string
        }

        const data = res.data as QueueData | undefined

        const lines: string[] = ['【TTS队列状态】']
        lines.push('━━━━━━━━━━━━━━━')
        lines.push(`队列长度: ${data?.queueLength || 0}`)
        lines.push(`处理中: ${data?.processing ? '是' : '否'}`)

        if (data?.currentTask) {
          lines.push(`当前任务: ${data.currentTask}`)
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('获取TTS队列状态失败:', error)
        return '获取队列状态失败，请稍后重试'
      }
    })
}

/**
 * 解析TTS参数
 */
async function parseTtsParams(
  params: string,
  api: ApiService,
  logger: ReturnType<Context['logger']>
): Promise<{
  character?: string
  characterName?: string
  emotion?: string
  emotionName?: string
  text?: string
  error?: string
}> {
  const result: {
    character?: string
    characterName?: string
    emotion?: string
    emotionName?: string
    text?: string
    error?: string
  } = {}

  // 获取预设列表
  let presetsRes
  try {
    presetsRes = await api.getTtsPresets()
  } catch (error) {
    logger.warn('获取TTS预设失败:', error)
    result.error = 'TTS预设数据不可用，请稍后重试'
    return result
  }

  interface TtsPreset {
    id: string
    name: string
    emotions?: Array<{ id: string; name: string }>
  }

  interface TtsPresetsData {
    presets?: TtsPreset[]
  }

  const presetsData = presetsRes.data as TtsPresetsData | undefined
  const presets = presetsData?.presets

  if (!presets || presets.length === 0) {
    result.error = 'TTS预设数据不可用，请稍后重试'
    return result
  }

  // 构建角色和情感映射
  const characterMap: Record<string, { id: string; name: string; emotions: Array<{ id: string; name: string }> }> = {}
  const emotionMap: Record<string, { id: string; name: string }> = {}

  for (const preset of presets) {
    const charInfo = {
      id: preset.id,
      name: preset.name,
      emotions: preset.emotions || [],
    }
    characterMap[preset.id.toLowerCase()] = charInfo
    characterMap[preset.name] = charInfo

    if (preset.emotions) {
      for (const emo of preset.emotions) {
        emotionMap[emo.id.toLowerCase()] = { id: emo.id, name: emo.name }
        emotionMap[emo.name] = { id: emo.id, name: emo.name }
      }
    }
  }

  // 按空格分隔解析参数
  const words = params.split(/\s+/)

  if (words.length < 2) {
    result.error = '格式错误，请使用空格分隔角色和文本\n正确格式: df.tts <角色> [情感] <文本>'
    return result
  }

  // 第一个词：必须匹配角色
  const firstWord = words[0]
  const matchedChar = characterMap[firstWord] || characterMap[firstWord.toLowerCase()]

  if (!matchedChar) {
    result.error = `未识别的角色: "${firstWord}"\n请使用 df.tts.presets 查看可用角色`
    return result
  }

  result.character = matchedChar.id
  result.characterName = matchedChar.name
  let consumedWords = 1

  // 第二个词：尝试匹配情感（可选）
  if (words.length > 2) {
    const secondWord = words[1]
    const matchedEmo = emotionMap[secondWord] || emotionMap[secondWord.toLowerCase()]

    if (matchedEmo) {
      result.emotion = matchedEmo.id
      result.emotionName = matchedEmo.name
      consumedWords = 2
    }
  }

  // 剩余部分作为文本
  result.text = words.slice(consumedWords).join(' ').trim()

  if (!result.text) {
    result.error = `请输入要合成的文本\n格式: df.tts ${matchedChar.name} [情感] <文本>`
    return result
  }

  return result
}

/**
 * 轮询TTS任务状态
 */
async function pollTaskStatus(
  taskId: string,
  api: ApiService,
  logger: ReturnType<Context['logger']>
): Promise<{
  success: boolean
  audio_url?: string
  filename?: string
  message?: string
}> {
  const maxAttempts = 90
  const pollInterval = 5000
  let lastStatus = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await api.getTtsTaskStatus(taskId)

      interface TaskStatusData {
        status?: string
        result?: {
          audio_url?: string
          filename?: string
          duration_ms?: number
          expires_in?: number
        }
        error?: string
        position?: number
        message?: string
      }

      const data = res.data as TaskStatusData | undefined

      if (!data) {
        logger.warn('TTS任务状态查询失败:', res.message)
        await sleep(pollInterval)
        continue
      }

      const { status, result, error } = data

      if (status !== lastStatus) {
        logger.debug(`TTS任务状态: ${status} (taskId: ${taskId})`)
        lastStatus = status || ''
      }

      switch (status) {
        case 'completed':
          if (result?.audio_url) {
            return {
              success: true,
              audio_url: result.audio_url,
              filename: result.filename,
            }
          }
          return { success: false, message: '任务完成但未获取到音频链接' }

        case 'failed':
          return { success: false, message: error || '语音合成失败' }

        case 'queued':
        case 'processing':
          break

        default:
          logger.warn(`未知的TTS任务状态: ${status}`)
      }

      await sleep(pollInterval)
    } catch (error) {
      logger.error('TTS任务状态轮询异常:', error)
      await sleep(pollInterval)
    }
  }

  return { success: false, message: '语音合成超时，请稍后重试' }
}
