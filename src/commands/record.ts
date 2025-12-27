import { Context } from 'koishi'
import { ApiService } from '../api'
import { DataManager } from '../data'
import { getActiveToken } from '../database'
import { handleApiError, formatDuration } from '../utils'

export function registerRecordCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  // 主战绩命令 - 支持多种别名
  ctx.command('df.record [...args:string]', '查看战绩')
    .alias('战绩')
    .action(async ({ session }, ...args) => {
      const userId = session.userId
      const platform = session.platform

      // 解析参数
      let mode = 'sol' // 默认模式为烽火地带
      let page = 1      // 默认页数为1
      let modeName = '烽火地带'

      for (const arg of args) {
        if (['全面', '全面战场', '战场', 'mp'].includes(arg)) {
          mode = 'mp'
          modeName = '全面战场'
        } else if (['烽火', '烽火地带', 'sol', '摸金'].includes(arg)) {
          mode = 'sol'
          modeName = '烽火地带'
        } else if (!isNaN(parseInt(arg))) {
          page = parseInt(arg) > 0 ? parseInt(arg) : 1
        }
      }

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send(`正在查询 ${modeName} 的战绩 (第${page}页)，请稍候...`)

      try {
        const res = await api.getRecordList(token, mode, page)

        if (await handleApiError(res, session)) return

        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
          return `您在 ${modeName} (第${page}页) 没有更多战绩记录`
        }

        const records = res.data
        let message = `【${modeName}战绩 - 第${page}页】\n\n`

        if (mode === 'sol') {
          message += formatSolRecords(records, page, dataManager)
        } else {
          message += formatMpRecords(records, page, dataManager)
        }

        return message.trim()
      } catch (error) {
        logger.error('查询战绩失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

interface SolRecord {
  dtEventTime: string
  MapId: string
  ArmedForceId: string
  EscapeFailReason: string
  DurationS: number
  FinalPrice: number
  flowCalGainedPrice?: number
  KillCount: number
  KillPlayerAICount: number
  KillAICount: number
}

interface MpRecord {
  dtEventTime: string
  MapID: string
  ArmedForceId: string
  MatchResult: string
  gametime: number
  KillNum: number
  Death: number
  Assist: number
  TotalScore: number
  RescueTeammateCount: number
}

function formatSolRecords(records: SolRecord[], page: number, dataManager: DataManager): string {
  const escapeReason: Record<string, string> = {
    '1': '撤离成功',
    '2': '被玩家击杀',
    '3': '被人机击杀'
  }

  let message = ''
  records.forEach((r, i) => {
    const recordNum = (page - 1) * records.length + i + 1
    const mapName = dataManager.getMapName(r.MapId)
    const operator = dataManager.getOperatorName(r.ArmedForceId)
    const status = escapeReason[r.EscapeFailReason] || '撤离失败'
    const duration = formatDuration(r.DurationS)
    const value = Number(r.FinalPrice).toLocaleString()
    const income = r.flowCalGainedPrice ? Number(r.flowCalGainedPrice).toLocaleString() : '未知'

    message += `#${recordNum}: ${r.dtEventTime}\n`
    message += `地图: ${mapName} | 干员: ${operator}\n`
    message += `状态: ${status} | 存活: ${duration}\n`
    message += `带出价值: ${value} | 净收益: ${income}\n`
    message += `击杀: 干员(${r.KillCount || 0}) / AI玩家(${r.KillPlayerAICount || 0}) / 其他AI(${r.KillAICount || 0})\n\n`
  })

  return message
}

function formatMpRecords(records: MpRecord[], page: number, dataManager: DataManager): string {
  const mpResult: Record<string, string> = {
    '1': '胜利',
    '2': '失败',
    '3': '中途退出'
  }

  let message = ''
  records.forEach((r, i) => {
    const recordNum = (page - 1) * records.length + i + 1
    const mapName = dataManager.getMapName(r.MapID)
    const operator = dataManager.getOperatorName(r.ArmedForceId)
    const result = mpResult[r.MatchResult] || '未知结果'
    const duration = formatDuration(r.gametime)

    message += `#${recordNum}: ${r.dtEventTime}\n`
    message += `地图: ${mapName} | 干员: ${operator}\n`
    message += `结果: ${result} | K/D/A: ${r.KillNum}/${r.Death}/${r.Assist}\n`
    message += `得分: ${r.TotalScore.toLocaleString()} | 时长: ${duration}\n`
    message += `救援: ${r.RescueTeammateCount}\n\n`
  })

  return message
}
