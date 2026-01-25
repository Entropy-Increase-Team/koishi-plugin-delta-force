import { Context } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'
import { Renderer } from '../../render'

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

// 类型背景图片映射
const CATEGORY_BG_MAP: Record<string, string> = {
  '干员皮肤': 'operator-skin',
  '喷漆': 'property-gx-li3.webp',
  '挂饰': 'property-gx-li2.webp',
  '典藏枪皮': 'property-jz-bg.webp',
  '枪皮': 'property-jz-bg.webp',
  '载具': 'property-qx-bg2.webp',
  '头像': 'property-gx-li3.webp',
  '军牌': 'property-jz-bg.webp',
  '其他资产': 'property-gx-li3.webp',
}

/**
 * 注册藏品查询相关命令
 */
export function registerCollectionCommands(
  ctx: Context,
  api: ApiService,
  renderer: Renderer
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

        // 与云崽版保持一致：检查 success 字段或 code 字段
        if (!collectionMapRes || (collectionMapRes.success === false && String(collectionMapRes.code) !== '0')) {
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

        // 按类型和品质分组（与云崽版保持一致）
        const categorizedItems: Record<string, Record<string, Array<{
          name: string
          id: string
          imageUrl: string
          qualityLevel: number
          category: string
        }>>> = {}

        const qualityOrder = ['传说', '史诗', '稀有', '普通', '其他']

        allUserItems.forEach(item => {
          const itemInfo = collectionMap.get(item.ItemId)
          if (!itemInfo) return

          const primaryCategory = itemInfo.type || '其他资产'

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
            imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${item.ItemId}.png`,
            qualityLevel: QUALITY_CONFIG[quality]?.level || 1,
            category: primaryCategory,
          })
        })

        if (typeFilter && Object.keys(categorizedItems).length === 0) {
          return `未找到类型"${typeFilter}"的藏品\n\n支持的查询类型: ${SUPPORTED_TYPES.join('、')}`
        }

        // 构建模板数据（与云崽版保持一致）
        const categories: Array<{
          name: string
          items: Array<{
            name: string
            id: string
            imageUrl: string
            qualityLevel: number
            category: string
          }>
          count: number
          bgImage: string
        }> = []

        const qualityStatsMap: Record<string, number> = {}
        let totalCount = 0

        for (const category in categorizedItems) {
          const categoryItems = categorizedItems[category]
          const categoryItemsList: Array<{
            name: string
            id: string
            imageUrl: string
            qualityLevel: number
            category: string
          }> = []
          let categoryCount = 0

          qualityOrder.forEach(quality => {
            if (categoryItems[quality] && categoryItems[quality].length > 0) {
              const qualityItems = categoryItems[quality]
              categoryCount += qualityItems.length
              totalCount += qualityItems.length

              if (!qualityStatsMap[quality]) {
                qualityStatsMap[quality] = 0
              }
              qualityStatsMap[quality] += qualityItems.length

              categoryItemsList.push(...qualityItems)
            }
          })

          if (categoryCount > 0) {
            categories.push({
              name: category,
              items: categoryItemsList,
              count: categoryCount,
              bgImage: CATEGORY_BG_MAP[category] || 'property-gx-li3.webp',
            })
          }
        }

        if (categories.length === 0) {
          return '未能解析到您的任何藏品信息'
        }

        // 生成品质统计数组
        const qualityStats = qualityOrder
          .filter(quality => qualityStatsMap[quality] && qualityStatsMap[quality] > 0)
          .map(quality => ({
            level: QUALITY_CONFIG[quality]?.level || 1,
            count: qualityStatsMap[quality],
          }))

        const typeName = typeFilter || '所有藏品'

        const templateData = {
          typeName,
          totalCount,
          qualityStats,
          categories,
        }

        // 使用渲染器渲染图片
        const imageResult = await renderer.renderToMessage('collection', templateData)
        return imageResult
      } catch (error) {
        logger.error('查询藏品失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}
