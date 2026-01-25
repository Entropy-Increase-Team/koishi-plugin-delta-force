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
 * 注册出红记录相关命令
 */
export function registerRedRecordCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  // 出红记录查询（指定物品）
  ctx.command('df.redrecord [itemName:text]', '查看藏品解锁记录')
    .alias('df.出红记录')
    .alias('df.大红记录')
    .alias('df.藏品记录')
    .usage('示例:\n  df.redrecord - 查看所有出红记录\n  df.redrecord 物品名 - 查看指定物品的记录')
    .action(async ({ session }, itemName) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 如果指定了物品名称，查询指定物品的记录
      if (itemName && itemName.trim()) {
        return await getRedByName(api, dataManager, renderer, token, itemName.trim(), userId, session, logger)
      }

      // 否则查询所有出红记录列表
      return await getRedRecordList(api, dataManager, renderer, token, userId, session, logger)
    })
}

/**
 * 查询指定物品的出红记录
 */
async function getRedByName(
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer,
  token: string,
  itemName: string,
  userId: string,
  session: { send: (msg: unknown) => Promise<unknown>; username?: string },
  logger: ReturnType<Context['logger']>
) {
  await session.send(`正在搜索物品"${itemName}"的藏品记录...`)

  try {
    // 1. 先搜索物品获取objectID
    const searchRes = await api.searchObject(itemName, '')

    if (!searchRes || searchRes.success === false) {
      return `搜索物品失败: ${searchRes?.message || '未知错误'}`
    }

    interface SearchItem {
      objectID: string | number
      objectName: string
      objectType?: string
      grade?: number
    }

    const items = (searchRes.data as { keywords?: SearchItem[] })?.keywords
    if (!Array.isArray(items) || items.length === 0) {
      return `未找到名为"${itemName}"的物品，请检查名称是否正确`
    }

    // 使用第一个匹配结果
    const targetItem = items[0]
    const objectId = String(targetItem.objectID)

    if (!objectId) {
      return '获取物品ID失败，无法查询记录'
    }

    // 2. 并行获取记录和用户信息
    const [recordRes, userDisplayInfo] = await Promise.all([
      api.getRedRecord(token, objectId),
      getUserDisplayInfo(api, token, userId, session.username || '用户')
    ])

    if (!recordRes || recordRes.success === false) {
      return `获取藏品记录失败: ${recordRes?.message || '数据格式错误'}`
    }

    interface RecordData {
      itemData?: {
        list?: Array<{ time: string; mapid: string; num?: number }>
        total?: number
      }
    }

    const recordData = recordRes.data as RecordData
    const itemData = recordData?.itemData
    if (!itemData || !itemData.list || itemData.list.length === 0) {
      return `物品"${targetItem.objectName}"暂无解锁记录`
    }

    // 按时间正序排列（最早的在前）
    const sortedRecords = itemData.list.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

    // 获取首次解锁记录
    const firstRecord = sortedRecords[0]
    const firstUnlockMapName = dataManager.getMapName(firstRecord.mapid)
    const firstUnlockMapBg = dataManager.getMapImagePath(firstUnlockMapName, 'sol') || ''

    // 取最新20条记录（按时间倒序，最新的在前）
    const latestRecords = sortedRecords.slice(-20).reverse()

    // 构建记录列表数据
    const records = latestRecords.map(record => {
      const mapName = dataManager.getMapName(record.mapid)
      return {
        time: record.time,
        map: mapName,
        count: record.num || 1
      }
    })

    // 物品图片URL
    const itemImageUrl = `https://playerhub.df.qq.com/playerhub/60004/object/${objectId}.png`

    // 构建渲染数据
    const renderData = {
      userName: userDisplayInfo.userName,
      userRank: '未知段位',
      userRankImage: null,
      userAvatar: userDisplayInfo.userAvatar,
      userId: userId,
      qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
      itemName: targetItem.objectName,
      itemType: targetItem.objectType || (targetItem.grade ? `GRADE ${targetItem.grade}` : ''),
      itemImageUrl: itemImageUrl,
      firstUnlockTime: firstRecord.time,
      firstUnlockMap: firstUnlockMapName,
      firstUnlockMapBg: firstUnlockMapBg,
      records: records,
      recordCount: itemData.total || records.length
    }

    const imageResult = await renderer.renderToMessage('redRecord', renderData, { width: 650 })
    return imageResult
  } catch (error) {
    logger.error('指定藏品记录查询失败:', error)
    return `查询失败: ${(error as Error).message}`
  }
}

/**
 * 查询所有出红记录列表
 */
async function getRedRecordList(
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer,
  token: string,
  userId: string,
  session: { send: (msg: unknown) => Promise<unknown>; username?: string },
  logger: ReturnType<Context['logger']>
) {
  await session.send('正在获取您的藏品解锁记录，请稍候...')

  try {
    // 获取用户信息和出红记录列表
    const [userDisplayInfo, res] = await Promise.all([
      getUserDisplayInfo(api, token, userId, session.username || '用户'),
      api.getRedList(token)
    ])

    if (!res || res.success === false) {
      return `获取藏品记录失败: ${res?.message || '数据格式错误'}`
    }

    interface RedListData {
      records?: {
        list?: Array<{ itemId: string | number; num?: number }>
      }
    }

    const data = res.data as RedListData
    const records = data?.records
    if (!records?.list || records.list.length === 0) {
      return '您还没有任何藏品解锁记录'
    }

    // 获取物品名称和价格映射
    const itemIds = records.list.map(item => String(item.itemId))
    const [itemMap, priceMap] = await Promise.all([
      getItemNameMap(api, itemIds),
      getItemPriceMap(api, itemIds)
    ])

    // 统计数据
    const itemStats = new Map<string, { name: string; count: number; totalValue: number; imageUrl: string }>()

    records.list.forEach(record => {
      const itemId = String(record.itemId)
      const itemName = itemMap.get(itemId) || `未知物品(${itemId})`
      const itemPrice = priceMap.get(itemId) || 0
      const num = record.num || 1

      if (itemStats.has(itemId)) {
        const stat = itemStats.get(itemId)!
        stat.count += num
        stat.totalValue += itemPrice * num
      } else {
        itemStats.set(itemId, {
          name: itemName,
          count: num,
          totalValue: itemPrice * num,
          imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${itemId}.png`
        })
      }
    })

    // 计算总计
    const redGodCount = itemStats.size
    let redTotalCount = 0
    let redTotalValue = 0

    itemStats.forEach(stat => {
      redTotalCount += stat.count
      redTotalValue += stat.totalValue
    })

    // 按价值排序，生成记录列表（仅展示前6条）
    const allSortedRecords = Array.from(itemStats.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .map(item => ({
        name: item.name,
        count: item.count,
        value: formatNumber(item.totalValue),
        imageUrl: item.imageUrl
      }))

    const sortedRecords = allSortedRecords.slice(0, 6)

    // 获取未解锁藏品数量
    let unlockedCount = 0
    try {
      const allCollectionsRes = await api.getObjectList('props', 'collection')
      if (allCollectionsRes?.data) {
        const keywords = (allCollectionsRes.data as { keywords?: Array<{ grade: number; objectID: string | number }> })?.keywords
        if (keywords) {
          const allRedCollections = keywords.filter(item => item.grade === 6)
          const collectedIds = new Set(itemIds)
          const uncollectedItems = allRedCollections.filter(item => !collectedIds.has(String(item.objectID)))
          unlockedCount = uncollectedItems.length
        }
      }
    } catch (error) {
      // 静默处理
    }

    const renderData = {
      userName: userDisplayInfo.userName,
      userRank: '未知段位',
      userRankImage: null,
      userAvatar: userDisplayInfo.userAvatar,
      userId: userId,
      qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
      statistics: {
        redGodCount: redGodCount.toString(),
        redTotalCount: redTotalCount.toString(),
        redTotalValue: formatNumber(redTotalValue),
        unlockedCount: unlockedCount > 0 ? unlockedCount.toString() : ''
      },
      records: sortedRecords,
      totalRecords: allSortedRecords.length
    }

    const imageResult = await renderer.renderToMessage('redRecordList', renderData, { width: 650 })
    return imageResult
  } catch (error) {
    logger.error('藏品记录列表查询失败:', error)
    return `查询失败: ${(error as Error).message}`
  }
}

/**
 * 获取物品名称映射
 */
async function getItemNameMap(api: ApiService, itemIds: string[]): Promise<Map<string, string>> {
  const itemMap = new Map<string, string>()
  const uniqueIds = [...new Set(itemIds)]

  try {
    const batchRes = await api.searchObject('', uniqueIds.join(','))
    if (batchRes?.success && batchRes?.data) {
      const keywords = (batchRes.data as { keywords?: Array<{ objectID: string | number; objectName: string }> })?.keywords
      if (keywords) {
        keywords.forEach(item => {
          itemMap.set(String(item.objectID), item.objectName)
        })
      }
    }
  } catch (error) {
    // 静默处理
  }

  return itemMap
}

/**
 * 获取物品价格映射
 */
async function getItemPriceMap(api: ApiService, itemIds: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>()
  const uniqueIds = [...new Set(itemIds)]

  try {
    const batchRes = await api.searchObject('', uniqueIds.join(','))
    if (batchRes?.success && batchRes?.data) {
      const keywords = (batchRes.data as { keywords?: Array<{ objectID: string | number; avgPrice?: number }> })?.keywords
      if (keywords) {
        keywords.forEach(item => {
          priceMap.set(String(item.objectID), item.avgPrice || 0)
        })
      }
    }
  } catch (error) {
    // 静默处理
  }

  return priceMap
}
