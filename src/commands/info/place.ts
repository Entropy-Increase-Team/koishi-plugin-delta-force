import { Context, h } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError, getUserDisplayInfo } from '../../utils'
import { Renderer } from '../../render'

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

// 场所类型图片映射
const TYPE_IMAGE_MAP: Record<string, string> = {
  'storage': '仓库.png',
  'control': '指挥中心.png',
  'workbench': '工作台.png',
  'tech': '技术中心.png',
  'shoot': '靶场.png',
  'training': '训练中心.png',
  'pharmacy': '制药台.png',
  'armory': '防具台.png',
  'collect': '收藏室.png',
  'diving': '潜水中心.png',
}

/**
 * 注册特勤处信息查询相关命令
 */
export function registerPlaceCommands(
  ctx: Context,
  api: ApiService,
  renderer: Renderer
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

        // 获取用户信息（用于模板）
        const userDisplayInfo = await getUserDisplayInfo(api, token, userId, session.username || '用户')

        // 如果指定了类型
        if (placeType) {
          return await renderPlacesByType(places, placeType, level, relateMap || {}, userDisplayInfo, renderer, session, logger)
        }

        // 查询所有类型 - 逐个发送每个类型的图片
        const groupedByType: Record<string, typeof places> = {}
        places.forEach(place => {
          const pType = place.placeType || 'unknown'
          if (!groupedByType[pType]) {
            groupedByType[pType] = []
          }
          groupedByType[pType].push(place)
        })

        const sortedTypes = Object.keys(groupedByType).sort((a, b) => {
          const indexA = PLACE_TYPE_ORDER.indexOf(a)
          const indexB = PLACE_TYPE_ORDER.indexOf(b)
          if (indexA === -1 && indexB === -1) return a.localeCompare(b)
          if (indexA === -1) return 1
          if (indexB === -1) return -1
          return indexA - indexB
        })

        for (const pType of sortedTypes) {
          const typePlaces = groupedByType[pType]
          if (typePlaces.length === 0) continue

          // 获取最高等级的设施
          const maxLevel = Math.max(...typePlaces.map(p => p.level || 0))
          const maxLevelPlace = typePlaces.find(p => p.level === maxLevel)
          if (!maxLevelPlace) continue

          const processedPlace = processPlace(maxLevelPlace, relateMap || {})
          const placeTypeName = PLACE_TYPE_NAMES[pType] || pType

          const templateData = {
            userName: userDisplayInfo.userName,
            userAvatar: userDisplayInfo.userAvatar || userDisplayInfo.qqAvatarUrl,
            qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
            placeTypeName,
            places: [processedPlace],
          }

          const imageResult = await renderer.renderToMessage('placeInfo', templateData)
          await session.send(imageResult)
        }
        return
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

// 设施信息接口
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

// 用户显示信息接口
interface UserDisplayInfo {
  userName: string
  userAvatar: string
  qqAvatarUrl: string
}

/**
 * 渲染指定类型的设施信息
 */
async function renderPlacesByType(
  places: PlaceInfo[],
  placeType: string,
  targetLevel: number | undefined,
  relateMap: Record<string, { objectName?: string; pic?: string }>,
  userDisplayInfo: UserDisplayInfo,
  renderer: Renderer,
  session: { send: (msg: unknown) => Promise<unknown> },
  logger: ReturnType<Context['logger']>
): Promise<h | string> {
  const typeName = PLACE_TYPE_NAMES[placeType] || placeType

  // 按等级分组
  const groupedByLevel: Record<number, PlaceInfo[]> = {}
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
    let needNotify = false

    // 如果指定等级不存在，返回最高等级
    if (!levelPlaces || levelPlaces.length === 0) {
      if (sortedLevels.length === 0) {
        return `未找到 ${typeName} 的设施信息`
      }
      const maxLevel = Math.max(...sortedLevels)
      levelPlaces = groupedByLevel[maxLevel]
      actualLevel = maxLevel
      needNotify = true

      if (!levelPlaces || levelPlaces.length === 0) {
        return `未找到 ${typeName} 的设施信息`
      }
    }

    const place = levelPlaces[0]
    const processedPlace = processPlace(place, relateMap)

    const templateData = {
      userName: userDisplayInfo.userName,
      userAvatar: userDisplayInfo.userAvatar || userDisplayInfo.qqAvatarUrl,
      qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
      placeTypeName: typeName,
      places: [processedPlace],
    }

    if (needNotify) {
      await session.send(`未找到 ${typeName} 等级 ${targetLevel}，已返回最高等级 ${actualLevel}。`)
    }

    return await renderer.renderToMessage('placeInfo', templateData)
  }

  // 没有指定等级，逐个发送每个等级的图片
  for (const level of sortedLevels) {
    const levelPlaces = groupedByLevel[level]
    if (levelPlaces.length === 0) continue

    const place = levelPlaces[0]
    const processedPlace = processPlace(place, relateMap)

    const templateData = {
      userName: userDisplayInfo.userName,
      userAvatar: userDisplayInfo.userAvatar || userDisplayInfo.qqAvatarUrl,
      qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
      placeTypeName: typeName,
      places: [processedPlace],
    }

    const imageResult = await renderer.renderToMessage('placeInfo', templateData)
    await session.send(imageResult)
  }

  return ''
}

/**
 * 处理单个设施数据，格式化供模板使用（与云崽版保持一致）
 */
function processPlace(
  place: PlaceInfo,
  relateMap: Record<string, { objectName?: string; pic?: string }>
): Record<string, unknown> {
  const placeTypeValue = place.placeType || ''
  let displayName = place.placeName || ''
  
  // 如果名称不包含中文，使用类型名称
  if (!/[\u4e00-\u9fa5]/.test(displayName)) {
    displayName = PLACE_TYPE_NAMES[placeTypeValue] || displayName || '未知设施'
  }

  // 获取设施图片路径
  const imageFileName = TYPE_IMAGE_MAP[placeTypeValue] || null
  const imageUrl = imageFileName ? `imgs/place/${imageFileName}` : null

  const processedPlace: Record<string, unknown> = {
    displayName,
    level: place.level || 0,
    imageUrl,
    upgradeInfo: null,
    upgradeRequired: [],
    unlockInfo: null,
    detail: place.detail || '',
  }

  // 处理升级信息
  if (place.upgradeInfo) {
    let conditionText = place.upgradeInfo.condition || '无'
    let conditions: string[] = []
    let levelCondition: string | null = null

    if (conditionText && conditionText !== '无' && conditionText !== '默认解锁') {
      const allConditions = conditionText.split(/[;；]/).map(c => c.trim()).filter(c => c.length > 0)
      allConditions.forEach(condition => {
        if (/解锁等级|等级\d+/.test(condition)) {
          levelCondition = condition
        } else {
          conditions.push(condition)
        }
      })
    }

    processedPlace.upgradeInfo = {
      condition: conditionText,
      conditions,
      levelCondition,
      hafCount: place.upgradeInfo.hafCount || 0,
      hafCountFormatted: place.upgradeInfo.hafCount && place.upgradeInfo.hafCount > 0 
        ? place.upgradeInfo.hafCount.toLocaleString() 
        : '0',
    }
  }

  // 处理升级所需物品
  if (place.upgradeRequired && place.upgradeRequired.length > 0) {
    processedPlace.upgradeRequired = place.upgradeRequired.map(req => {
      const itemInfo = relateMap[String(req.objectID)]
      const itemName = itemInfo ? itemInfo.objectName : `物品ID: ${req.objectID}`
      const imgUrl = itemInfo?.pic || (req.objectID ? `https://playerhub.df.qq.com/playerhub/60004/object/${req.objectID}.png` : null)
      return {
        objectName: itemName,
        count: req.count,
        imageUrl: imgUrl,
      }
    })
  }

  // 处理解锁信息
  if (place.unlockInfo) {
    const unlockData: { properties: string[]; props: Array<{ objectName: string; imageUrl: string | null; count: number | null }> } = {
      properties: [],
      props: [],
    }

    const properties = place.unlockInfo.properties?.list || []
    if (properties.length > 0) {
      unlockData.properties = properties.map(prop => {
        if (typeof prop === 'string') {
          return prop
        } else if (prop && typeof prop === 'object') {
          return (prop as { name?: string; objectName?: string; desc?: string }).name || 
                 (prop as { name?: string; objectName?: string; desc?: string }).objectName || 
                 (prop as { name?: string; objectName?: string; desc?: string }).desc || 
                 JSON.stringify(prop)
        }
        return String(prop)
      })
    }

    const props = place.unlockInfo.props || []
    if (props.length > 0) {
      unlockData.props = props.map(prop => {
        if (typeof prop === 'string') {
          return { objectName: prop, imageUrl: null, count: null }
        } else if (prop && typeof prop === 'object') {
          let objectName = '未知道具'
          let imgUrl: string | null = null

          if (prop.objectID) {
            const itemInfo = relateMap[String(prop.objectID)]
            objectName = itemInfo && itemInfo.objectName ? itemInfo.objectName : `物品ID: ${prop.objectID}`
            imgUrl = itemInfo?.pic || `https://playerhub.df.qq.com/playerhub/60004/object/${prop.objectID}.png`
          } else if (prop.name || prop.objectName) {
            objectName = prop.name || prop.objectName || '未知道具'
          }

          return {
            objectName,
            imageUrl: imgUrl,
            count: prop.count || null,
          }
        }
        return { objectName: String(prop), imageUrl: null, count: null }
      })
    }

    if (unlockData.properties.length > 0 || unlockData.props.length > 0) {
      processedPlace.unlockInfo = unlockData
    }
  }

  return processedPlace
}
