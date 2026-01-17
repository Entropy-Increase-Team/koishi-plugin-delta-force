import { Context } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

// 特勤处设施类型映射
const PLACE_TYPE_MAP: Record<string, string> = {
  '仓库': 'storage',
  '指挥中心': 'control',
  '工作台': 'workbench',
  '技术中心': 'tech',
  '靶场': 'shoot',
  '训练中心': 'training',
  '制药台': 'pharmacy',
  '防具台': 'armory',
  '收藏室': 'collect',
  '潜水中心': 'diving',
}

// 反向映射
const PLACE_TYPE_NAMES: Record<string, string> = {
  'storage': '仓库',
  'control': '指挥中心',
  'workbench': '工作台',
  'tech': '技术中心',
  'shoot': '靶场',
  'training': '训练中心',
  'pharmacy': '制药台',
  'armory': '防具台',
  'collect': '收藏室',
  'diving': '潜水中心',
}

// 设施显示顺序
const PLACE_TYPE_ORDER = ['storage', 'control', 'workbench', 'tech', 'shoot', 'training', 'pharmacy', 'armory', 'collect', 'diving']

/**
 * 注册特勤处信息查询相关命令
 */
export function registerPlaceCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 特勤处信息查询
  ctx.command('df.place [type:string] [level:number]', '查看特勤处设施信息')
    .alias('df.特勤处')
    .alias('df.特勤处信息')
    .usage(`支持的设施类型: ${Object.keys(PLACE_TYPE_MAP).join('、')}\n示例:\n  df.place all - 查询所有设施\n  df.place 仓库 - 查询仓库所有等级\n  df.place 仓库 3 - 查询仓库等级3`)
    .action(async ({ session }, type, level) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 如果没有参数，显示帮助
      if (!type) {
        return [
          '请使用以下命令格式：',
          '• df.place all - 查询所有设施',
          '• df.place 仓库 - 查询仓库所有等级',
          '• df.place 仓库 1 - 查询仓库等级1',
          '',
          '支持的设施类型：',
          Object.keys(PLACE_TYPE_MAP).join('、'),
        ].join('\n')
      }

      const isAll = type.toLowerCase() === 'all'
      const placeType = isAll ? '' : (PLACE_TYPE_MAP[type] || '')

      if (!isAll && !placeType) {
        return `未知的设施类型: ${type}\n支持的类型: ${Object.keys(PLACE_TYPE_MAP).join('、')}`
      }

      await session.send('正在查询特勤处信息，请稍候...')

      try {
        const res = await api.getPlaceInfo(token, placeType)

        if (await handleApiError(res, session)) return

        interface PlaceData {
          places?: PlaceInfo[]
          relateMap?: Record<string, { objectName?: string; pic?: string }>
        }

        interface PlaceInfo {
          placeType: string
          placeName?: string
          level?: number
          detail?: string
          upgradeInfo?: {
            condition?: string
            hafCount?: number
          }
          upgradeRequired?: Array<{
            objectID: string | number
            count: number
          }>
          unlockInfo?: {
            properties?: { list?: string[] }
            props?: Array<{
              objectID?: string | number
              name?: string
              objectName?: string
              count?: number
            }>
          }
        }

        const data = res.data as PlaceData | undefined
        if (!data?.places) {
          return `查询失败: ${res.msg || res.message || 'API 返回数据格式不正确'}`
        }

        const { places, relateMap } = data

        if (places.length === 0) {
          return '未能查询到任何特勤处设施信息'
        }

        // 如果指定了类型
        if (placeType) {
          return formatPlacesByType(places, placeType, level, relateMap || {})
        }

        // 查询所有类型
        return formatAllPlaces(places, relateMap || {})
      } catch (error) {
        logger.error('查询特勤处信息失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 特勤处状态查询
  ctx.command('df.placestatus', '查看特勤处当前状态')
    .alias('df.特勤处状态')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      try {
        const res = await api.getPlaceStatus(token)

        if (await handleApiError(res, session)) return

        interface PlaceStatusData {
          status?: string
          facilities?: Array<{
            name: string
            level: number
            status: string
          }>
        }

        const data = res.data as PlaceStatusData | undefined
        if (!data) {
          return '获取特勤处状态失败'
        }

        const lines: string[] = ['【特勤处状态】']
        lines.push('━━━━━━━━━━━━━━━')

        if (data.status) {
          lines.push(`总体状态: ${data.status}`)
        }

        if (data.facilities && Array.isArray(data.facilities)) {
          data.facilities.forEach(facility => {
            const statusIcon = facility.status === 'working' ? '🟢' : '⚪'
            lines.push(`${statusIcon} ${facility.name} Lv.${facility.level}`)
          })
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('查询特勤处状态失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

/**
 * 格式化指定类型的设施信息
 */
function formatPlacesByType(
  places: Array<{
    placeType: string
    placeName?: string
    level?: number
    detail?: string
    upgradeInfo?: {
      condition?: string
      hafCount?: number
    }
    upgradeRequired?: Array<{
      objectID: string | number
      count: number
    }>
    unlockInfo?: {
      properties?: { list?: string[] }
      props?: Array<{
        objectID?: string | number
        name?: string
        objectName?: string
        count?: number
      }>
    }
  }>,
  placeType: string,
  targetLevel: number | undefined,
  relateMap: Record<string, { objectName?: string; pic?: string }>
): string {
  const typeName = PLACE_TYPE_NAMES[placeType] || placeType

  // 按等级分组
  const groupedByLevel: Record<number, typeof places> = {}
  places.forEach(place => {
    const level = place.level || 0
    if (!groupedByLevel[level]) {
      groupedByLevel[level] = []
    }
    groupedByLevel[level].push(place)
  })

  const sortedLevels = Object.keys(groupedByLevel).map(Number).sort((a, b) => a - b)

  // 如果指定了等级
  if (targetLevel !== undefined) {
    let levelPlaces = groupedByLevel[targetLevel]
    let actualLevel = targetLevel

    // 如果指定等级不存在，返回最高等级
    if (!levelPlaces || levelPlaces.length === 0) {
      if (sortedLevels.length === 0) {
        return `未找到 ${typeName} 的设施信息`
      }
      const maxLevel = Math.max(...sortedLevels)
      levelPlaces = groupedByLevel[maxLevel]
      actualLevel = maxLevel

      if (!levelPlaces || levelPlaces.length === 0) {
        return `未找到 ${typeName} 的设施信息`
      }
    }

    const place = levelPlaces[0]
    const lines: string[] = []

    if (actualLevel !== targetLevel) {
      lines.push(`⚠️ 未找到等级 ${targetLevel}，显示最高等级 ${actualLevel}`)
      lines.push('')
    }

    lines.push(`【${typeName} - Lv.${actualLevel}】`)
    lines.push('━━━━━━━━━━━━━━━')
    lines.push(...formatPlaceDetail(place, relateMap))

    return lines.join('\n')
  }

  // 显示所有等级
  const lines: string[] = [`【${typeName}】`]
  lines.push(`共 ${places.length} 个设施，${sortedLevels.length} 个等级`)
  lines.push('━━━━━━━━━━━━━━━')

  sortedLevels.forEach(level => {
    const levelPlaces = groupedByLevel[level]
    if (levelPlaces.length === 0) return

    const place = levelPlaces[0]
    lines.push('')
    lines.push(`📍 Lv.${level}`)
    lines.push(...formatPlaceDetail(place, relateMap))
  })

  return lines.join('\n')
}

/**
 * 格式化所有设施信息
 */
function formatAllPlaces(
  places: Array<{
    placeType: string
    placeName?: string
    level?: number
  }>,
  relateMap: Record<string, { objectName?: string; pic?: string }>
): string {
  // 按类型分组
  const groupedByType: Record<string, typeof places> = {}
  places.forEach(place => {
    const type = place.placeType || 'unknown'
    if (!groupedByType[type]) {
      groupedByType[type] = []
    }
    groupedByType[type].push(place)
  })

  // 按顺序排列
  const sortedTypes = Object.keys(groupedByType).sort((a, b) => {
    const indexA = PLACE_TYPE_ORDER.indexOf(a)
    const indexB = PLACE_TYPE_ORDER.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  const lines: string[] = ['【特勤处设施总览】']
  lines.push('━━━━━━━━━━━━━━━')

  sortedTypes.forEach(type => {
    const typePlaces = groupedByType[type]
    const typeName = PLACE_TYPE_NAMES[type] || type

    // 获取最高等级
    const maxLevel = Math.max(...typePlaces.map(p => p.level || 0))
    const levelCount = new Set(typePlaces.map(p => p.level || 0)).size

    lines.push(`📍 ${typeName}: 最高 Lv.${maxLevel} (共 ${levelCount} 级)`)
  })

  lines.push('')
  lines.push('使用 df.place <设施名> 查看详细信息')

  return lines.join('\n')
}

/**
 * 格式化单个设施详情
 */
function formatPlaceDetail(
  place: {
    detail?: string
    upgradeInfo?: {
      condition?: string
      hafCount?: number
    }
    upgradeRequired?: Array<{
      objectID: string | number
      count: number
    }>
    unlockInfo?: {
      properties?: { list?: string[] }
      props?: Array<{
        objectID?: string | number
        name?: string
        objectName?: string
        count?: number
      }>
    }
  },
  relateMap: Record<string, { objectName?: string; pic?: string }>
): string[] {
  const lines: string[] = []

  // 升级信息
  if (place.upgradeInfo) {
    const { condition, hafCount } = place.upgradeInfo
    if (condition && condition !== '无' && condition !== '默认解锁') {
      lines.push(`升级条件: ${condition}`)
    }
    if (hafCount && hafCount > 0) {
      lines.push(`升级费用: ${hafCount.toLocaleString()} 烽火币`)
    }
  }

  // 升级所需物品
  if (place.upgradeRequired && place.upgradeRequired.length > 0) {
    lines.push('升级材料:')
    place.upgradeRequired.forEach(req => {
      const itemInfo = relateMap[String(req.objectID)]
      const itemName = itemInfo?.objectName || `物品(${req.objectID})`
      lines.push(`  • ${itemName} x${req.count}`)
    })
  }

  // 解锁内容
  if (place.unlockInfo) {
    const { properties, props } = place.unlockInfo

    if (properties?.list && properties.list.length > 0) {
      lines.push('解锁属性:')
      properties.list.forEach(prop => {
        lines.push(`  • ${prop}`)
      })
    }

    if (props && props.length > 0) {
      lines.push('解锁道具:')
      props.forEach(prop => {
        let itemName = '未知道具'
        if (prop.objectID) {
          const itemInfo = relateMap[String(prop.objectID)]
          itemName = itemInfo?.objectName || prop.name || prop.objectName || `物品(${prop.objectID})`
        } else if (prop.name || prop.objectName) {
          itemName = prop.name || prop.objectName || '未知道具'
        }
        const countStr = prop.count ? ` x${prop.count}` : ''
        lines.push(`  • ${itemName}${countStr}`)
      })
    }
  }

  if (lines.length === 0) {
    lines.push('暂无详细信息')
  }

  return lines
}
