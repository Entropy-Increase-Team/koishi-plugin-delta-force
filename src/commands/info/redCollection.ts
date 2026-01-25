import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError, decode, getUserDisplayInfo } from '../../utils'
import { Renderer } from '../../render'

/**
 * 格式化数字为 K/M/B 格式
 */
function formatNumber(num: number): string {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0'
  }
  
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  } else {
    return num.toString()
  }
}

/**
 * 注册大红收藏相关命令
 */
export function registerRedCollectionCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  // 大红收藏查询
  ctx.command('df.redcollection [season:number]', '查看大红收藏数据')
    .alias('df.大红收藏')
    .alias('df.大红藏品')
    .alias('df.大红海报')
    .alias('df.藏品海报')
    .usage('参数说明:\n  数字 - 指定赛季（如 7）\n  不填 - 查询所有赛季\n示例: df.redcollection 7')
    .action(async ({ session }, season) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 解析赛季参数
      let seasonId: string | number = 'all'
      let seasonDisplay = '所有赛季'

      if (season !== undefined && !isNaN(season)) {
        seasonId = season
        seasonDisplay = `S${season}赛季`
      }

      await session.send('正在获取大红收藏数据，请稍候...')

      try {
        // 获取用户信息
        const userDisplayInfo = await getUserDisplayInfo(api, token, userId, session.username || '用户')

        // 并行获取个人数据和大红称号
        const [personalDataRes, titleRes] = await Promise.all([
          api.getPersonalData(token, '', seasonId),
          api.getTitle(token)
        ])

        if (await handleApiError(personalDataRes, session)) return
        if (await handleApiError(titleRes, session)) return

        if (!personalDataRes.success || !personalDataRes.data) {
          return '获取个人数据失败：API返回数据格式异常'
        }

        if (!titleRes.success || !titleRes.data) {
          return '获取大红称号失败：API返回数据格式异常'
        }

        // 解析个人数据结构
        let solDetail: Record<string, unknown> | null = null
        const allModesData = personalDataRes.data as Record<string, unknown>
        const solData = allModesData?.sol as Record<string, unknown> | undefined
        if (solData?.data) {
          const solInner = (solData.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined
          if (solInner?.solDetail) {
            solDetail = solInner.solDetail as Record<string, unknown>
          }
        }

        if (!solDetail) {
          return '没有找到烽火地带游戏数据，请确保您已经在游戏中进行过烽火地带模式的对局。'
        }

        // 解析大红称号信息
        interface TitleData {
          title?: string
          subtitle?: string
          unlockDesc?: string
        }
        const titleData = titleRes.data as TitleData
        const title = titleData.title || '血色会计'
        const subtitle = titleData.subtitle || '"能把肾上腺素换算成子弹汇率的鬼才"'
        const unlockDesc = titleData.unlockDesc || '总价值突破800万且持有医疗/能源类大红收藏品'

        // 解析大红收藏数据
        const redTotalMoney = solDetail.redTotalMoney as number || 0
        const redTotalCount = solDetail.redTotalCount as number || 0
        const redCollectionDetail = (solDetail.redCollectionDetail || []) as Array<{
          objectID: string | number
          price?: number
          count?: number
        }>

        if (redCollectionDetail.length === 0) {
          return '您还没有任何大红收藏品，快去游戏中获取一些稀有收藏品吧！'
        }

        // 计算大红种类数量（去重）
        const uniqueObjectIds = new Set(redCollectionDetail.map(item => item.objectID))
        const redGodCount = uniqueObjectIds.size

        // 按价格排序，取前6个最贵的收藏品
        const sortedCollections = redCollectionDetail
          .sort((a, b) => (b.price || 0) - (a.price || 0))
          .slice(0, 6)

        // 获取所有需要查询名称的物品ID
        const objectIds = sortedCollections.map(item => String(item.objectID))

        // 批量查询物品名称
        const objectNames: Record<string, string> = {}
        if (objectIds.length > 0) {
          try {
            const searchRes = await api.searchObject('', objectIds.join(','))
            if (searchRes?.data) {
              const keywords = (searchRes.data as { keywords?: Array<{ objectID: string | number; objectName: string }> })?.keywords
              if (keywords) {
                keywords.forEach(obj => {
                  objectNames[String(obj.objectID)] = obj.objectName
                })
              }
            }
          } catch (error) {
            logger.warn('获取物品名称失败，将使用物品ID显示:', error)
          }
        }

        const topCollections = sortedCollections.map((item, index) => ({
          rank: index + 1,
          name: objectNames[String(item.objectID)] || `物品${item.objectID}`,
          count: item.count || 1,
          value: formatNumber(item.price || 0),
          imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${item.objectID}.png`
        }))

        // 获取所有藏品列表（grade=6的物品）
        let unlockedCollections: Array<{ name: string; objectID: string | number; price: string; imageUrl: string }> = []
        let unlockedCount = 0
        try {
          const allCollectionsRes = await api.getObjectList('props', 'collection')
          if (allCollectionsRes?.data) {
            const keywords = (allCollectionsRes.data as { keywords?: Array<{ grade: number; objectID: string | number; objectName: string; avgPrice?: number }> })?.keywords
            if (keywords) {
              // 筛选出grade=6的物品（大红藏品）
              const allRedCollections = keywords.filter(item => item.grade === 6)

              // 获取已收藏的物品ID集合
              const collectedIds = new Set(redCollectionDetail.map(item => item.objectID))

              // 找出未收藏的物品
              const uncollectedItems = allRedCollections.filter(item => !collectedIds.has(item.objectID))

              unlockedCount = uncollectedItems.length

              // 随机选择3个未收藏的物品展示
              if (uncollectedItems.length > 0) {
                const shuffled = uncollectedItems.sort(() => 0.5 - Math.random())
                unlockedCollections = shuffled.slice(0, 3).map(item => ({
                  name: item.objectName,
                  objectID: item.objectID,
                  price: formatNumber(item.avgPrice || 0),
                  imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${item.objectID}.png`
                }))
              }
            }
          }
        } catch (error) {
          logger.warn('获取未解锁藏品失败:', error)
          unlockedCount = 74 - redGodCount // 降级为原始计算方式
        }

        // 获取用户段位信息
        let userRank = '未知段位'
        let userRankImage: string | null = null
        try {
          const personalInfoRes = await api.getPersonalInfo(token)
          if (personalInfoRes?.data) {
            const careerData = (personalInfoRes.data as { careerData?: { rankpoint?: number } })?.careerData
            if (careerData?.rankpoint) {
              userRank = dataManager.getRankByScore(careerData.rankpoint, 'sol')
              userRankImage = dataManager.getRankImage(careerData.rankpoint, 'sol')
            }
          }
        } catch (error) {
          // 静默处理
        }

        const renderData = {
          userName: userDisplayInfo.userName,
          userRank: userRank,
          userRankImage: userRankImage,
          userAvatar: userDisplayInfo.userAvatar,
          userId: userId,
          qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
          title: title,
          subtitle: subtitle,
          unlockDesc: unlockDesc,
          seasonDisplay: seasonDisplay,
          statistics: {
            redGodCount: redGodCount.toString(),
            redTotalCount: redTotalCount.toString(),
            redTotalValue: formatNumber(redTotalMoney),
            unlockedCount: unlockedCount.toString()
          },
          topCollections: topCollections,
          unlockedCollections: unlockedCollections
        }

        const imageResult = await renderer.renderToMessage('redCollection', renderData, { width: 1145 })
        return imageResult
      } catch (error) {
        logger.error('查询大红收藏失败:', error)
        return `查询大红收藏失败: ${(error as Error).message}`
      }
    })
}
