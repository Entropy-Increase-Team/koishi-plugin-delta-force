import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'
import { Renderer } from '../../render'

const ESCAPE_REASONS: Record<string, string> = {
  '1': '撤离成功',
  '2': '被玩家击杀',
  '3': '被人机击杀',
  '10': '撤离失败'
}

const MP_RESULTS: Record<string, string> = {
  '1': '胜利',
  '2': '失败',
  '3': '中途退出'
}

// 格式化时长
function formatRecordDuration(seconds: number): string {
  if (!seconds && seconds !== 0) return '未知'
  if (seconds === 0) return '0秒'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) return `${hours}小时${minutes}分${secs}秒`
  if (minutes > 0) return `${minutes}分${secs}秒`
  return `${secs}秒`
}

export function registerRecordCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.record [...args:string]', '查看战绩')
    .alias('df.战绩')
    .action(async ({ session }, ...args) => {
      const userId = session.userId
      const platform = session.platform

      // 解析参数
      let mode: 'sol' | 'mp' = 'sol' // 默认模式为烽火地带
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
        const recordsPerPage = 5
        const pageRecords = records.slice(0, recordsPerPage)

        // 构建模板数据
        const templateRecords: TemplateRecord[] = []

        for (let i = 0; i < pageRecords.length; i++) {
          const r = pageRecords[i] as SolRecord | MpRecord
          const recordNum = (page - 1) * recordsPerPage + i + 1
          const mapName = mode === 'sol' 
            ? dataManager.getMapName((r as SolRecord).MapId) 
            : dataManager.getMapName((r as MpRecord).MapID)
          const operator = dataManager.getOperatorName(r.ArmedForceId)
          const operatorImgPath = dataManager.getOperatorImagePath(operator)
          const mapBgPath = dataManager.getMapImagePath(mapName, mode)

          const recordData: TemplateRecord = {
            recordNum,
            time: r.dtEventTime,
            map: mapName,
            operator,
            mapBg: mapBgPath,
            operatorImg: operatorImgPath
          }

          if (mode === 'sol') {
            const solRecord = r as SolRecord
            const escapeStatus = ESCAPE_REASONS[String(solRecord.EscapeFailReason)] || '撤离失败'
            const duration = formatRecordDuration(Number(solRecord.DurationS))
            let statusClass = 'fail'
            if (solRecord.EscapeFailReason === 1 || solRecord.EscapeFailReason === '1') {
              statusClass = 'success'
            } else if (solRecord.EscapeFailReason === 3 || solRecord.EscapeFailReason === '3') {
              statusClass = 'exit'
            }

            recordData.status = escapeStatus
            recordData.statusClass = statusClass
            recordData.duration = duration
            recordData.value = Number(solRecord.FinalPrice).toLocaleString()
            const incomeValue = solRecord.flowCalGainedPrice ? Number(solRecord.flowCalGainedPrice) : null
            recordData.income = incomeValue !== null ? incomeValue.toLocaleString() : '未知'
            recordData.incomeClass = incomeValue !== null ? (incomeValue >= 0 ? 'income-positive' : 'income-negative') : ''
            recordData.killsHtml = `<span class="kill-item kill-player">玩家 ${solRecord.KillCount || 0}</span><span class="kill-separator">/</span><span class="kill-item kill-ai-player">AI玩家 ${solRecord.KillPlayerAICount || 0}</span><span class="kill-separator">/</span><span class="kill-item kill-ai">AI ${solRecord.KillAICount || 0}</span>`

            // 处理队友信息
            if (solRecord.teammateArr && Array.isArray(solRecord.teammateArr) && solRecord.teammateArr.length > 0) {
              recordData.teammates = solRecord.teammateArr.map((teammate: TeammateData) => {
                const teammateOperator = dataManager.getOperatorName(teammate.ArmedForceId)
                const teammateStatus = ESCAPE_REASONS[String(teammate.EscapeFailReason)] || '撤离失败'
                let teammateStatusClass = 'fail'
                if (teammate.EscapeFailReason === 1 || teammate.EscapeFailReason === '1') {
                  teammateStatusClass = 'success'
                } else if (teammate.EscapeFailReason === 3 || teammate.EscapeFailReason === '3') {
                  teammateStatusClass = 'exit'
                }

                return {
                  operator: teammateOperator,
                  operatorImg: dataManager.getOperatorImagePath(teammateOperator),
                  status: teammateStatus,
                  statusClass: teammateStatusClass,
                  value: Number(teammate.FinalPrice || 0).toLocaleString(),
                  duration: formatRecordDuration(Number(teammate.DurationS || 0)),
                  kills: `${(teammate.KillCount || 0) + (teammate.KillPlayerAICount || 0) + (teammate.KillAICount || 0)}`,
                  rescue: teammate.Rescue || 0
                }
              })
            }
          } else {
            const mpRecord = r as MpRecord
            const result = MP_RESULTS[String(mpRecord.MatchResult)] || '未知结果'
            const duration = formatRecordDuration(Number(mpRecord.gametime))
            let statusClass = 'fail'
            if (mpRecord.MatchResult === 1 || mpRecord.MatchResult === '1') {
              statusClass = 'success'
            } else if (mpRecord.MatchResult === 3 || mpRecord.MatchResult === '3') {
              statusClass = 'exit'
            }

            recordData.status = result
            recordData.statusClass = statusClass
            recordData.duration = duration
            recordData.kda = `${mpRecord.KillNum}/${mpRecord.Death}/${mpRecord.Assist}`
            recordData.score = mpRecord.TotalScore.toLocaleString()
            if (mpRecord.RescueTeammateCount) {
              recordData.rescue = mpRecord.RescueTeammateCount
            }
            // 全面战场不显示队友信息，与云崽版保持一致
          }

          templateRecords.push(recordData)
        }

        // 渲染模板
        const templateData = {
          modeName,
          page,
          records: templateRecords
        }

        return renderer.renderToMessage('record', templateData)
      } catch (error) {
        logger.error('查询战绩失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

// 类型定义
interface TeammateData {
  ArmedForceId: string | number
  EscapeFailReason: string | number
  FinalPrice?: number
  DurationS?: number
  KillCount?: number
  KillPlayerAICount?: number
  KillAICount?: number
  Rescue?: number
}

interface SolRecord {
  dtEventTime: string
  MapId: string
  ArmedForceId: string
  EscapeFailReason: string | number
  DurationS: number
  FinalPrice: number
  flowCalGainedPrice?: number
  KillCount: number
  KillPlayerAICount: number
  KillAICount: number
  teammateArr?: TeammateData[]
}

interface MpRecord {
  dtEventTime: string
  MapID: string
  ArmedForceId: string
  MatchResult: string | number
  gametime: number
  KillNum: number
  Death: number
  Assist: number
  TotalScore: number
  RescueTeammateCount: number
}

interface TemplateTeammate {
  operator: string
  operatorImg: string | null
  status: string
  statusClass: string
  value?: string
  duration?: string
  kills?: string
  rescue?: number
  kda?: string
  score?: string
}

interface TemplateRecord {
  recordNum: number
  time: string
  map: string
  operator: string
  mapBg: string | null
  operatorImg: string | null
  status?: string
  statusClass?: string
  duration?: string
  value?: string
  income?: string
  incomeClass?: string
  killsHtml?: string
  kda?: string
  score?: string
  rescue?: number
  teammates?: TemplateTeammate[]
}
