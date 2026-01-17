import { Context } from 'koishi'
import { ApiService } from '../../api'
import { handleApiError } from '../../utils'

interface PriceHistoryItem {
  objectID: number | string
  objectName?: string
  price: number
  time: string
}

interface PriceData {
  objectID: number | string
  objectName: string
  currentPrice?: number
  priceHistory?: PriceHistoryItem[]
}

interface ProfitItem {
  objectID: number | string
  objectName: string
  profit: number
  buyPrice: number
  sellPrice: number
  profitRate?: number
}

export function registerPriceCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 价格查询
  ctx.command('df.price <keyword:text>', '查询物品价格')
    .alias('df.价格')
    .alias('df.当前价格')
    .alias('df.最新价格')
    .action(async ({ session }, keyword) => {
      if (!keyword || keyword.trim() === '') {
        return '请输入要查询的物品名称或ID\n示例: df.price 腾龙'
      }

      await session.send('正在查询价格...')

      try {
        const objectIds = await parseItemQuery(api, keyword)
        if (objectIds.length === 0) {
          return `未找到与"${keyword}"相关的物品`
        }

        const res = await api.getCurrentPrice(objectIds)
        if (await handleApiError(res, session)) return

        const priceData = res.data as PriceData[] | PriceData
        const items = Array.isArray(priceData) ? priceData : [priceData]

        if (items.length === 0) {
          return '未获取到价格数据'
        }

        let message = '【物品价格查询】\n\n'
        for (const item of items) {
          message += `【${item.objectName || `物品${item.objectID}`}】\n`
          message += `  ID: ${item.objectID}\n`
          message += `  当前价格: ${formatPrice(item.currentPrice)}\n\n`
        }

        message += '使用 df.pricehistory <物品名/ID> 查看价格历史'

        return message.trim()
      } catch (error) {
        logger.error('查询价格失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 价格历史
  ctx.command('df.pricehistory <keyword:text>', '查询物品价格历史')
    .alias('df.价格历史')
    .alias('df.历史价格')
    .action(async ({ session }, keyword) => {
      if (!keyword || keyword.trim() === '') {
        return '请输入要查询的物品名称或ID\n示例: df.pricehistory 腾龙'
      }

      await session.send('正在查询价格历史...')

      try {
        const objectIds = await parseItemQuery(api, keyword)
        if (objectIds.length === 0) {
          return `未找到与"${keyword}"相关的物品`
        }

        const res = await api.getPriceHistoryV2(objectIds.slice(0, 5))
        if (await handleApiError(res, session)) return

        const historyData = res.data as PriceData[] | PriceData
        const items = Array.isArray(historyData) ? historyData : [historyData]

        if (items.length === 0) {
          return '未获取到价格历史数据'
        }

        let message = '【价格历史查询】\n'

        for (const item of items) {
          message += `\n【${item.objectName || `物品${item.objectID}`}】\n`
          
          if (item.priceHistory && item.priceHistory.length > 0) {
            const recentHistory = item.priceHistory.slice(0, 10)
            for (const record of recentHistory) {
              const time = formatTime(record.time)
              message += `  ${time}: ${formatPrice(record.price)}\n`
            }
            
            if (item.priceHistory.length > 10) {
              message += `  ... 还有 ${item.priceHistory.length - 10} 条记录\n`
            }
          } else {
            message += '  暂无价格历史记录\n'
          }
        }

        return message.trim()
      } catch (error) {
        logger.error('查询价格历史失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 利润排行
  ctx.command('df.profit [limit:number]', '查看利润排行')
    .alias('df.利润排行')
    .alias('df.利润榜')
    .action(async ({ session }, limit = 20) => {
      await session.send('正在查询利润排行...')

      try {
        const res = await api.getProfitRankV1({ type: 'hour', limit: Math.min(limit, 50) })
        if (await handleApiError(res, session)) return

        const items = (res.data as ProfitItem[]) || []

        if (items.length === 0) {
          return '暂无利润排行数据'
        }

        let message = '【利润排行榜】\n\n'
        
        items.forEach((item, index) => {
          const rank = index + 1
          const profitStr = formatProfit(item.profit)
          const rateStr = item.profitRate ? `(${(item.profitRate * 100).toFixed(1)}%)` : ''
          
          message += `${rank}. ${item.objectName}\n`
          message += `   利润: ${profitStr} ${rateStr}\n`
          message += `   买入: ${formatPrice(item.buyPrice)} → 卖出: ${formatPrice(item.sellPrice)}\n\n`
        })

        return message.trim()
      } catch (error) {
        logger.error('查询利润排行失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 特勤处利润
  ctx.command('df.specialprofit', '查看特勤处制造利润')
    .alias('df.特勤利润')
    .alias('df.制造利润')
    .action(async ({ session }) => {
      await session.send('正在查询特勤处利润...')

      try {
        const res = await api.getProfitRankV1({ type: 'hour', place: 'workbench', limit: 20 })
        if (await handleApiError(res, session)) return

        const items = (res.data as ProfitItem[]) || []

        if (items.length === 0) {
          return '暂无特勤处利润数据'
        }

        let message = '【特勤处制造利润】\n\n'
        
        items.forEach((item, index) => {
          const rank = index + 1
          const profitStr = formatProfit(item.profit)
          
          message += `${rank}. ${item.objectName}\n`
          message += `   利润: ${profitStr}\n`
          message += `   成本: ${formatPrice(item.buyPrice)} → 售价: ${formatPrice(item.sellPrice)}\n\n`
        })

        return message.trim()
      } catch (error) {
        logger.error('查询特勤处利润失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 材料价格
  ctx.command('df.material', '查看制造材料价格')
    .alias('df.材料价格')
    .alias('df.材料')
    .alias('df.制造材料')
    .action(async ({ session }) => {
      await session.send('正在查询材料价格...')

      try {
        const res = await api.getMaterialPrice()
        if (await handleApiError(res, session)) return

        interface MaterialItem {
          objectID: number | string
          objectName: string
          price: number
        }

        const items = (res.data as MaterialItem[]) || []

        if (items.length === 0) {
          return '暂无材料价格数据'
        }

        let message = '【制造材料价格】\n\n'
        
        for (const item of items) {
          message += `${item.objectName}: ${formatPrice(item.price)}\n`
        }

        return message.trim()
      } catch (error) {
        logger.error('查询材料价格失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

async function parseItemQuery(api: ApiService, query: string): Promise<string[]> {
  const objectIds: string[] = []
  
  const queries = query.split(/[,，]/).map(q => q.trim()).filter(Boolean)
  
  for (const singleQuery of queries) {
    if (/^\d+$/.test(singleQuery)) {
      objectIds.push(singleQuery)
    } else {
      try {
        const searchRes = await api.searchObject(singleQuery)
        interface SearchResult {
          keywords?: Array<{ objectID: number | string }>
        }
        const data = searchRes?.data as SearchResult
        if (data?.keywords?.length > 0) {
          objectIds.push(String(data.keywords[0].objectID))
        }
      } catch {
        // 忽略搜索错误
      }
    }
  }
  
  return objectIds
}

function formatPrice(price: number | string | undefined): string {
  if (price === null || price === undefined) return '-'
  const numPrice = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(numPrice)) return String(price)
  return numPrice.toLocaleString()
}

function formatProfit(profit: number | string | undefined): string {
  if (profit === null || profit === undefined) return '-'
  const numProfit = typeof profit === 'string' ? parseFloat(profit) : profit
  if (isNaN(numProfit)) return String(profit)
  const sign = numProfit >= 0 ? '+' : ''
  return `${sign}${numProfit.toLocaleString()}`
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '-'
  try {
    const date = new Date(timeStr)
    if (isNaN(date.getTime())) return timeStr
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  } catch {
    return timeStr
  }
}
