import { Context } from 'koishi'
import { ApiService } from '../../api'
import { handleApiError } from '../../utils'

interface ObjectItem {
  objectID: number | string
  objectName: string
  objectType?: string
  objectRarity?: string
  price?: number
  priceTime?: string
}

interface SearchResult {
  keywords?: ObjectItem[]
  total?: number
}

export function registerObjectCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 物品搜索
  ctx.command('df.object <keyword:text>', '搜索物品')
    .alias('df.物品搜索')
    .alias('df.物品')
    .alias('df.搜索')
    .action(async ({ session }, keyword) => {
      if (!keyword || keyword.trim() === '') {
        return '请输入要搜索的物品名称或ID\n示例: df.object 腾龙'
      }

      await session.send('正在搜索物品...')

      try {
        let res
        if (/^\d+$/.test(keyword.trim())) {
          res = await api.searchObject(undefined, keyword.trim())
        } else {
          res = await api.searchObject(keyword.trim())
        }

        if (await handleApiError(res, session)) return

        const data = res.data as SearchResult
        const items = data?.keywords || []

        if (items.length === 0) {
          return `未找到与"${keyword}"相关的物品`
        }

        let message = `【物品搜索结果】关键词: ${keyword}\n`
        message += `共找到 ${items.length} 个物品\n\n`

        const displayItems = items.slice(0, 10)
        for (const item of displayItems) {
          message += `【${item.objectName}】\n`
          message += `  ID: ${item.objectID}`
          if (item.objectType) {
            message += ` | 类型: ${item.objectType}`
          }
          if (item.objectRarity) {
            message += ` | 稀有度: ${item.objectRarity}`
          }
          if (item.price !== undefined) {
            message += `\n  当前价格: ${formatPrice(item.price)}`
          }
          message += '\n'
        }

        if (items.length > 10) {
          message += `\n... 还有 ${items.length - 10} 个结果未显示`
        }

        message += '\n使用 df.price <物品名/ID> 查看价格历史'

        return message.trim()
      } catch (error) {
        logger.error('搜索物品失败:', error)
        return `搜索失败: ${(error as Error).message}`
      }
    })
}

function formatPrice(price: number | string | undefined): string {
  if (price === null || price === undefined) return '-'
  const numPrice = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(numPrice)) return String(price)
  return numPrice.toLocaleString()
}
