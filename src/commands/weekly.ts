import { Context } from 'koishi'
import { ApiService } from '../api'
import { DataManager } from '../data'
import { getActiveToken } from '../database'
import { handleApiError, sleep } from '../utils'
import { WeeklyReportData } from '../types'

export function registerWeeklyCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.weekly [类型:string]', '查看周报')
    .action(async ({ session }, type) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询周报数据...')

      try {
        const res = await api.getWeeklyReport(token, type)
        
        if (await handleApiError(res, session)) return

        const messages = formatWeeklyReport(res.data as WeeklyReportData, dataManager)
        
        if (messages.length === 1) {
          return messages[0]
        }
        
        for (const msg of messages) {
          await session.send(msg)
          await sleep(500)
        }
        
        return
      } catch (error) {
        logger.error('查询周报失败:', error)
        return `查询失败: ${error.message}`
      }
    })
}

function formatWeeklyReport(data: WeeklyReportData, dataManager: DataManager): string[] {
  const solData = data.sol?.data?.data
  const mpData = data.mp?.data?.data

  if (!solData && !mpData) {
    return ['暂无周报数据，不打两把吗？']
  }

  const messages: string[] = []

  if (solData) {
    let solMsg = '--- 烽火地带 ---\n'
    solMsg += `总览: ${solData.total_sol_num || 0}场 | ${solData.total_exacuation_num || 0}撤离 | ${solData.GainedPrice_overmillion_num || 0}次百万撤离 | ${solData.total_Death_Count || 0}死亡\n`
    solMsg += `击杀: ${solData.total_Kill_Player || 0}玩家 | ${solData.total_Kill_AI || 0}AI | ${solData.total_Kill_Boss || 0}BOSS\n`
    
    if (solData.Rank_Score) {
      solMsg += `段位分数: ${solData.Rank_Score}\n`
    }
    
    solMsg += `资产净增: ${solData.rise_Price?.toLocaleString() || 0} (总收益 ${solData.Gained_Price?.toLocaleString() || 0} / 总消费 ${solData.consume_Price?.toLocaleString() || 0})\n`

    const profitRatio = solData.Gained_Price && solData.consume_Price ?
      (solData.Gained_Price / solData.consume_Price).toFixed(2) : '0'
    solMsg += `赚损比: ${profitRatio} (收益/消费)\n`

    if (solData.Total_Price) {
      const prices = solData.Total_Price.split(',')
      const monday = prices.find(p => p.startsWith('Monday'))
      const sunday = prices.find(p => p.startsWith('Sunday'))
      if (monday && sunday) {
        const startPrice = parseInt(monday.split('-')[2])
        const endPrice = parseInt(sunday.split('-')[2])
        solMsg += `资产趋势: ${startPrice.toLocaleString()} → ${endPrice.toLocaleString()}\n`
      }
    }

    solMsg += `局内行为: ${solData.total_Quest_num || 0}任务 | ${solData.use_Keycard_num || 0}用钥匙 | ${solData.Mandel_brick_num || 0}破译 | ${solData.search_Birdsnest_num || 0}搜鸟巢\n`
    solMsg += `其他: ${(solData.Total_Mileage / 100000).toFixed(2)}km里程 | ${solData.total_Rescue_num || 0}次救援 | ${solData.Kill_ByCrocodile_num || 0}次被鳄鱼偷袭\n`
    solMsg += `游戏时长: ${Math.floor((solData.total_Online_Time || 0) / 3600)}小时${Math.floor(((solData.total_Online_Time || 0) % 3600) / 60)}分钟\n`

    if (solData.total_mapid_num) {
      const mostUsedMap = parseAndGetName(solData.total_mapid_num, 'MapId', 'inum', (id) => dataManager.getMapName(id))
      solMsg += `常玩地图: ${mostUsedMap}\n`
    }

    if (solData.total_ArmedForceId_num) {
      const mostUsedOperator = parseAndGetName(solData.total_ArmedForceId_num, 'ArmedForceId', 'inum', (id) => dataManager.getOperatorName(id))
      solMsg += `常玩干员: ${mostUsedOperator}`
    }

    messages.push(solMsg)
  }

  if (mpData) {
    let mpMsg = '--- 全面战场 ---\n'
    const winRate = mpData.total_num > 0 ? (mpData.win_num / mpData.total_num * 100).toFixed(1) + '%' : '0%'
    mpMsg += `总览: ${mpData.total_num || 0}场 | ${mpData.win_num || 0}胜 | ${winRate}胜率\n`
    
    if (mpData.Rank_Match_Score) {
      mpMsg += `段位分数: ${mpData.Rank_Match_Score}\n`
    }
    
    mpMsg += `数据: ${mpData.Kill_Num || 0}击杀 | ${mpData.continuous_Kill_Num || 0}最高连杀 | ${mpData.total_score?.toLocaleString() || 0}总分\n`
    
    const hitRate = mpData.Consume_Bullet_Num > 0 ? (mpData.Hit_Bullet_Num / mpData.Consume_Bullet_Num * 100).toFixed(1) + '%' : '0%'
    mpMsg += `命中率: ${hitRate} (${mpData.Hit_Bullet_Num || 0}/${mpData.Consume_Bullet_Num || 0})\n`
    mpMsg += `支援: 呼叫${mpData.SBattle_Support_UseNum || 0}次 | 消耗${mpData.SBattle_Support_CostScore?.toLocaleString() || 0}分\n`
    mpMsg += `救援: ${mpData.Rescue_Teammate_Count || 0}次 | 被救: ${mpData.by_Rescue_num || 0}次\n`

    if (mpData.max_inum_mapid) {
      const mostUsedMap = parseAndGetName(mpData.max_inum_mapid, 'MapId', 'inum', (id) => dataManager.getMapName(id))
      mpMsg += `常玩地图: ${mostUsedMap}\n`
    }

    if (mpData.max_inum_DeployArmedForceType) {
      const operatorName = dataManager.getOperatorName(mpData.max_inum_DeployArmedForceType)
      let operatorStats = `常玩干员: ${operatorName}`
      if (mpData.DeployArmedForceType_inum) {
        operatorStats += ` (${mpData.DeployArmedForceType_inum}场 | ${mpData.DeployArmedForceType_KillNum}击杀)`
      }
      mpMsg += operatorStats
    }

    messages.push(mpMsg)
  }

  return messages
}

interface ParsedItem {
  [key: string]: string | number
}

function parseAndGetName(
  dataStr: string,
  idKey: string,
  countKey: string,
  getNameFunc: (id: string) => string
): string {
  if (!dataStr || typeof dataStr !== 'string') return '无'
  
  try {
    const items = dataStr.split('#').map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        return JSON.parse(correctedJSON) as ParsedItem
      } catch (e) {
        return null
      }
    }).filter((item): item is ParsedItem => item !== null)

    if (items.length === 0) return '无'

    const mostUsed = items.reduce((a, b) => 
      (Number(a[countKey]) > Number(b[countKey]) ? a : b)
    )
    return getNameFunc(String(mostUsed[idKey]))
  } catch (e) {
    return '无'
  }
}
