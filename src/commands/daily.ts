import { Context } from 'koishi'
import { ApiService } from '../api'
import { DataManager } from '../data'
import { getActiveToken } from '../database'
import { handleApiError } from '../utils'
import { DailyReportData } from '../types'

export function registerDailyCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.daily [类型:string]', '查看日报')
    .action(async ({ session }, type) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询日报数据...')

      try {
        const res = await api.getDailyReport(token, type)
        
        if (await handleApiError(res, session)) return

        const formatted = formatDailyReport(res.data as DailyReportData, dataManager)
        return formatted
      } catch (error) {
        logger.error('查询日报失败:', error)
        return `查询失败: ${error.message}`
      }
    })
}

function formatDailyReport(data: DailyReportData, dataManager: DataManager): string {
  const solDetail = data.sol?.data?.data?.solDetail
  const mpDetail = data.mp?.data?.data?.mpDetail

  if (!solDetail && !mpDetail) {
    return '暂无日报数据，不打两把吗？'
  }

  let msg = '【三角洲行动日报】\n'

  if (mpDetail) {
    msg += '--- 全面战场 ---\n'
    msg += `日期: ${mpDetail.recentDate}\n`
    msg += `总对局: ${mpDetail.totalFightNum} | 胜利: ${mpDetail.totalWinNum}\n`
    msg += `总击杀: ${mpDetail.totalKillNum}\n`
    msg += `总得分: ${mpDetail.totalScore?.toLocaleString()}\n`
    
    if (mpDetail.mostUseForceType) {
      const mostUsedOperator = dataManager.getOperatorName(mpDetail.mostUseForceType)
      msg += `最常用干员: ${mostUsedOperator}\n`
    }

    if (mpDetail.bestMatch) {
      const best = mpDetail.bestMatch
      const bestMatchMap = dataManager.getMapName(best.mapID)
      msg += '--- 当日最佳 ---\n'
      msg += `地图: ${bestMatchMap} | 时间: ${best.dtEventTime}\n`
      msg += `结果: ${best.isWinner ? '胜利' : '失败'} | KDA: ${best.killNum}/${best.death}/${best.assist}\n`
      msg += `得分: ${best.score?.toLocaleString()}\n`
    }
  }

  if (solDetail && solDetail.recentGainDate) {
    if (mpDetail) msg += '\n'
    msg += '--- 烽火地带 ---\n'
    msg += `日期: ${solDetail.recentGainDate}\n`
    msg += `最近带出总价值: ${solDetail.recentGain?.toLocaleString()}\n`

    const topItems = solDetail.userCollectionTop?.list
    if (topItems && topItems.length > 0) {
      msg += '--- 近期高价值物资 ---\n'
      topItems.forEach(item => {
        const price = parseFloat(item.price).toLocaleString()
        msg += `${item.objectName}: ${price}\n`
      })
    }
  } else if (!mpDetail) {
    msg += '--- 烽火地带 ---\n最近没有对局'
  }

  return msg.trim()
}
