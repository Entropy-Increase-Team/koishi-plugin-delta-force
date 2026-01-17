import { Context } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

// 品质配置
const QUALITY_CONFIG: Record<string, { level: number; color: string | null }> = {
  '传说': { level: 5, color: '橙' },
  '史诗': { level: 4, color: '紫' },
  '稀有': { level: 3, color: '蓝' },
  '普通': { level: 2, color: '绿' },
  '其他': { level: 1, color: null },
}

// 颜色到品质的映射
const COLOR_TO_QUALITY: Record<string, string> = {
  '橙': '传说',
  '紫': '史诗',
  '蓝': '稀有',
  '绿': '普通',
}

// 支持的藏品类型
const SUPPORTED_TYPES = ['干员皮肤', '喷漆', '挂饰', '典藏枪皮', '枪皮', '载具', '头像', '军牌']

/**
 * 注册藏品查询相关命令
 */
export function registerCollectionCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 藏品查询
  ctx.command('df.collection [type:string]', '查看个人藏品')
    .alias('df.藏品')
    .alias('df.资产')
    .usage(`支持的类型: ${SUPPORTED_TYPES.join('、')}\n不指定类型则查询所有藏品`)
    .action(async ({ session }, typeFilter) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询藏品信息，请稍候...')

      try {
        // 并行获取藏品数据和对照表
        const [collectionRes, collectionMapRes] = await Promise.all([
          api.getCollection(token),
          api.getCollectionMap(),
        ])

        if (await handleApiError(collectionRes, session)) return

        if (!collectionMapRes || collectionMapRes.code !== 0) {
          logger.warn('获取藏品对照表失败:', collectionMapRes?.message)
          return '获取藏品基础信息失败，无法展示您的资产'
        }

        interface CollectionData {
          userData?: Array<{ ItemId: string }>
          weponData?: Array<{ ItemId: string }>
        }

        interface CollectionMapItem {
          id: string | number
          name: string
          type: string
          rare: string
        }

        const data = collectionRes.data as CollectionData | undefined
        const userItems = data?.userData || []
        const weaponItems = data?.weponData || []
        const allUserItems = [...userItems, ...weaponItems]

        if (allUserItems.length === 0) {
          return '您的藏品库为空'
        }

        // 构建对照表映射
        const collectionMap = new Map<string, CollectionMapItem>(
          (collectionMapRes.data as CollectionMapItem[]).map(item => [String(item.id), item])
        )

        // 按类型和品质分组
        const categorizedItems: Record<string, Record<string, Array<{
          name: string
          id: string
          quality: string
          qualityLevel: number
        }>>> = {}

        const availableTypes = new Set<string>()

        allUserItems.forEach(item => {
          const itemInfo = collectionMap.get(item.ItemId)
          if (!itemInfo) return

          const primaryCategory = itemInfo.type || '其他资产'
          availableTypes.add(primaryCategory)

          // 类型过滤
          if (typeFilter && !primaryCategory.includes(typeFilter) && !typeFilter.includes(primaryCategory)) {
            return
          }

          const quality = COLOR_TO_QUALITY[itemInfo.rare] || '其他'

          if (!categorizedItems[primaryCategory]) {
            categorizedItems[primaryCategory] = {}
          }
          if (!categorizedItems[primaryCategory][quality]) {
            categorizedItems[primaryCategory][quality] = []
          }

          categorizedItems[primaryCategory][quality].push({
            name: itemInfo.name,
            id: item.ItemId,
            quality,
            qualityLevel: QUALITY_CONFIG[quality]?.level || 1,
          })
        })

        if (typeFilter && Object.keys(categorizedItems).length === 0) {
          return `未找到类型"${typeFilter}"的藏品\n\n支持的查询类型: ${SUPPORTED_TYPES.join('、')}`
        }

        // 构建输出消息
        const typeName = typeFilter || '所有藏品'
        const lines: string[] = [`【${typeName}】`]
        lines.push('━━━━━━━━━━━━━━━')

        // 统计各品质数量
        const qualityStats: Record<string, number> = {}
        let totalCount = 0

        // 品质显示顺序
        const qualityOrder = ['传说', '史诗', '稀有', '普通', '其他']

        for (const category in categorizedItems) {
          const categoryItems = categorizedItems[category]
          let categoryCount = 0
          const categoryLines: string[] = []

          qualityOrder.forEach(quality => {
            const items = categoryItems[quality]
            if (items && items.length > 0) {
              categoryCount += items.length
              totalCount += items.length
              qualityStats[quality] = (qualityStats[quality] || 0) + items.length

              // 品质图标
              const qualityIcon = getQualityIcon(quality)
              categoryLines.push(`  ${qualityIcon} ${quality} (${items.length}件)`)
              
              // 显示前5个物品名称
              const displayItems = items.slice(0, 5)
              displayItems.forEach(item => {
                categoryLines.push(`    • ${item.name}`)
              })
              if (items.length > 5) {
                categoryLines.push(`    ... 还有 ${items.length - 5} 件`)
              }
            }
          })

          if (categoryCount > 0) {
            lines.push(`\n【${category}】(${categoryCount}件)`)
            lines.push(...categoryLines)
          }
        }

        // 添加统计信息
        lines.unshift(`总计: ${totalCount} 件藏品`)
        
        const statsLine = qualityOrder
          .filter(q => qualityStats[q])
          .map(q => `${getQualityIcon(q)}${qualityStats[q]}`)
          .join(' | ')
        
        if (statsLine) {
          lines.splice(2, 0, statsLine)
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('查询藏品失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

/**
 * 获取品质图标
 */
function getQualityIcon(quality: string): string {
  switch (quality) {
    case '传说': return '🟠'
    case '史诗': return '🟣'
    case '稀有': return '🔵'
    case '普通': return '🟢'
    default: return '⚪'
  }
}
