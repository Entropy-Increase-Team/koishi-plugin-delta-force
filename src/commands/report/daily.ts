import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError, getUserDisplayInfo } from '../../utils'
import { DailyReportData } from '../../types'
import { Renderer } from '../../render'


export function registerDailyCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.daily [类型:string]', '查看日报')
    .alias('df.日报')
    .action(async ({ session }, type) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 解析模式参数
      let mode = ''
      if (type) {
        if (['烽火', '烽火地带', 'sol', '摸金'].includes(type)) {
          mode = 'sol'
        } else if (['全面', '全面战场', '战场', 'mp'].includes(type)) {
          mode = 'mp'
        }
      }

      await session.send('正在查询日报数据...')

      // 获取当前日期
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const currentDateStr = `${year}-${month}-${day}`

      try {
        const res = await api.getDailyReport(token, mode)
        
        if (await handleApiError(res, session)) return

        let solDetail: DailySolDetail | undefined
        let mpDetail: DailyMpDetail | undefined

        if (mode) {
          const detailData = (res.data as { data?: { data?: { solDetail?: DailySolDetail; mpDetail?: DailyMpDetail } } })?.data?.data
          if (mode === 'sol') {
            solDetail = detailData?.solDetail
          } else if (mode === 'mp') {
            mpDetail = detailData?.mpDetail
          }
        } else {
          const data = res.data as DailyReportData
          solDetail = data?.sol?.data?.data?.solDetail
          mpDetail = data?.mp?.data?.data?.mpDetail
        }

        // 如果查询全部且两个模式都没有数据，才提示无数据
        if (!mode && !solDetail && !mpDetail) {
          return '暂无日报数据，不打两把吗？'
        }

        // 获取用户信息（使用统一函数，从 personalInfo 接口获取头像）
        const { userName, userAvatar, qqAvatarUrl } = await getUserDisplayInfo(
          api,
          token,
          session.userId,
          session.username || session.userId
        )

        // 构建模板数据
        const templateData: Record<string, unknown> = {
          type: 'daily',
          mode: mode,
          userName: userName,
          userAvatar: userAvatar,
          userId: session.userId,
          qqAvatarUrl: qqAvatarUrl,
          currentDate: currentDateStr
        }

        // 处理全面战场数据
        if (!mode || mode === 'mp') {
          const hasValidData = mpDetail && mpDetail.recentDate && mpDetail.recentDate.trim() !== ''
          
          if (hasValidData) {
            const mostUsedOperator = dataManager.getOperatorName(mpDetail.mostUseForceType)
            const operatorImagePath = mostUsedOperator ? dataManager.getOperatorImagePath(mostUsedOperator) : null

            templateData.mpDetail = {
              recentDate: mpDetail.recentDate || '-',
              totalFightNum: mpDetail.totalFightNum || 0,
              totalWinNum: mpDetail.totalWinNum || 0,
              totalKillNum: mpDetail.totalKillNum || 0,
              totalScore: mpDetail.totalScore?.toLocaleString() || '0',
              mostUsedOperator: mostUsedOperator || '无',
              operatorImage: operatorImagePath
            }

            // 处理最佳对局
            if (mpDetail.bestMatch) {
              const best = mpDetail.bestMatch
              const bestMatchMapName = best.mapID ? dataManager.getMapName(best.mapID) : '未知地图'
              let bestMatchMapImage: string | null = null
              if (bestMatchMapName && bestMatchMapName !== '未知地图') {
                bestMatchMapImage = dataManager.getMapImagePath(bestMatchMapName, 'mp')
              }

              (templateData.mpDetail as Record<string, unknown>).bestMatch = {
                mapID: best.mapID,
                mapName: bestMatchMapName,
                mapImage: bestMatchMapImage,
                dtEventTime: best.dtEventTime || '-',
                isWinner: best.isWinner || false,
                killNum: best.killNum || 0,
                death: best.death || 0,
                assist: best.assist || 0,
                score: best.score?.toLocaleString() || '0'
              }
            }
          } else {
            templateData.mpDetail = { isEmpty: true }
          }
        }

        // 处理烽火地带数据
        if (!mode || mode === 'sol') {
          const hasValidData = solDetail && solDetail.recentGainDate && solDetail.recentGainDate.trim() !== ''
          
          if (hasValidData) {
            const topItems = solDetail.userCollectionTop?.list || []
            
            // 为物品添加图片URL
            const itemsWithImages = topItems.map((item: TopItem) => {
              let imageUrl: string | null = null
              if (item.pic) {
                imageUrl = item.pic
              } else {
                const objectID = item.objectID || item.itemId || item.objectId
                if (objectID) {
                  imageUrl = `https://playerhub.df.qq.com/playerhub/60004/object/${String(objectID)}.png`
                }
              }
              
              return {
                objectName: item.objectName || '未知物品',
                price: parseFloat(String(item.price || 0)).toLocaleString(),
                count: item.count || 0,
                imageUrl: imageUrl
              }
            })

            templateData.solDetail = {
              recentGainDate: solDetail.recentGainDate || '-',
              recentGain: solDetail.recentGain?.toLocaleString() || '0',
              topItems: itemsWithImages
            }
          } else {
            templateData.solDetail = { isEmpty: true }
          }
        }

        // 渲染模板
        return renderer.renderToMessage('dailyReport', templateData)
      } catch (error) {
        logger.error('查询日报失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

// 类型定义
interface TopItem {
  objectName?: string
  price?: string | number
  count?: number
  pic?: string
  objectID?: string
  itemId?: string
  objectId?: string
}

interface DailySolDetail {
  recentGainDate?: string
  recentGain?: number
  userCollectionTop?: {
    list?: TopItem[]
  }
}

interface DailyMpDetail {
  recentDate?: string
  totalFightNum?: number
  totalWinNum?: number
  totalKillNum?: number
  totalScore?: number
  mostUseForceType?: string | number
  bestMatch?: {
    mapID?: string | number
    dtEventTime?: string
    isWinner?: boolean
    killNum?: number
    death?: number
    assist?: number
    score?: number
    ArmedForceId?: string | number
  }
}
