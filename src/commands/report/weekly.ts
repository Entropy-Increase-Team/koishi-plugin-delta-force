import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError, getUserDisplayInfo } from '../../utils'
import { WeeklyReportData } from '../../types'
import { Renderer } from '../../render'


export function registerWeeklyCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.weekly [...args:string]', '查看周报')
    .alias('df.周报')
    .usage('用法: df.周报 [模式] [日期]\n模式: 烽火/全面/sol/mp\n日期: 8位数字，如 20260111')
    .action(async ({ session }, ...args) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 解析参数（与云崽版保持一致）
      // 注意：从 middleware 执行时，参数可能是单个字符串，需要拆分
      let mode = ''
      let date = ''
      const allArgs: string[] = []
      for (const arg of args) {
        // 将每个参数按空格拆分（处理 middleware 传递的情况）
        const parts = arg.split(/\s+/).filter(Boolean)
        allArgs.push(...parts)
      }
      for (const arg of allArgs) {
        if (['烽火', '烽火地带', 'sol', '摸金'].includes(arg)) {
          mode = 'sol'
        } else if (['全面', '全面战场', '战场', 'mp'].includes(arg)) {
          mode = 'mp'
        } else if (/^\d{8}$/.test(arg)) {
          // 8位数字作为日期，如 20260111
          date = arg
        }
      }

      await session.send('正在查询周报数据...')
      try {
        const res = await api.getWeeklyReport(token, mode, true, date)
        logger.debug(`[weekly] API 响应: ${JSON.stringify(res).slice(0, 500)}`)
        
        if (await handleApiError(res, session)) return

        // 解析数据
        let solData: WeeklySolData | undefined
        let mpData: WeeklyMpData | undefined

        if (mode) {
          const detailData = (res.data as { data?: { data?: WeeklySolData | WeeklyMpData } })?.data?.data
          if (mode === 'sol') {
            solData = detailData as WeeklySolData
          } else if (mode === 'mp') {
            mpData = detailData as WeeklyMpData
          }
        } else {
          const data = res.data as WeeklyReportData
          solData = data?.sol?.data?.data
          mpData = data?.mp?.data?.data
        }

        // 如果查询全部且两个模式都没有数据，才提示无数据
        if (!mode && !solData && !mpData) {
          return '暂无周报数据，不打两把吗？'
        }

        // 获取用户信息（使用统一函数，从 personalInfo 接口获取头像）
        const { userName, userAvatar, qqAvatarUrl } = await getUserDisplayInfo(
          api,
          token,
          session.userId,
          session.username || session.userId
        )

        // 如果没有提供日期，使用当前日期
        let displayDate = date
        if (!displayDate) {
          const now = new Date()
          const year = now.getFullYear()
          const month = String(now.getMonth() + 1).padStart(2, '0')
          const day = String(now.getDate()).padStart(2, '0')
          displayDate = `${year}${month}${day}`
        }

        // 提取所有队友的 OpenID 并获取昵称和头像
        const allTeammateOpenIDs = new Set<string>()
        if (solData?.teammates) {
          solData.teammates.forEach(t => allTeammateOpenIDs.add(t.friend_openid))
        }
        if (mpData?.teammates) {
          mpData.teammates.forEach(t => allTeammateOpenIDs.add(t.friend_openid))
        }

        const nicknameMap = new Map<string, string>()
        const avatarMap = new Map<string, string>()
        if (allTeammateOpenIDs.size > 0) {
          const promises = Array.from(allTeammateOpenIDs).map(openid => 
            api.getFriendInfo(token, openid)
          )
          const results = await Promise.allSettled(promises)
          
          results.forEach((result, index) => {
            const openid = Array.from(allTeammateOpenIDs)[index]
            if (result.status === 'fulfilled' && result.value?.success && result.value.data) {
              const data = result.value.data as { charac_name?: string; picurl?: string }
              if (data.charac_name) {
                nicknameMap.set(openid, data.charac_name)
              }
              // 处理头像
              if (data.picurl) {
                let avatarUrl = data.picurl
                if (/^[0-9]+$/.test(avatarUrl)) {
                  avatarUrl = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${avatarUrl}.webp`
                } else {
                  try {
                    avatarUrl = decodeURIComponent(avatarUrl)
                  } catch {
                    // 解码失败，使用原始 URL
                  }
                }
                avatarMap.set(openid, avatarUrl)
              }
            }
          })
        }

        // 构建模板数据
        const templateData: Record<string, unknown> = {
          userName: userName,
          userAvatar: userAvatar,
          userId: session.userId,
          qqAvatarUrl: qqAvatarUrl,
          date: displayDate
        }

        // 处理烽火地带数据
        if (!mode || mode === 'sol') {
          if (solData) {
            const hasValidData = solData.total_sol_num && Number(solData.total_sol_num) > 0
            
            if (!hasValidData) {
              templateData.solData = { isEmpty: true }
            } else {
              // 解析常用地图和干员
              const mostUsedMap = parseAndGetName(solData.total_mapid_num, 'MapId', 'inum', (id) => dataManager.getMapName(id))
              const mostUsedOperator = parseAndGetName(solData.total_ArmedForceId_num, 'ArmedForceId', 'inum', (id) => dataManager.getOperatorName(id))

              // 获取段位信息
              const solRank = solData.Rank_Score ? dataManager.getRankByScore(solData.Rank_Score, 'sol') : '-'
              const solRankImagePath = solRank !== '-' ? dataManager.getRankImage(solData.Rank_Score || 0, 'sol') : null

              // 计算赚损比
              const gainedPrice = Number(solData.Gained_Price) || 0
              const consumePrice = Number(solData.consume_Price) || 0
              let profitRatio = '0'
              if (gainedPrice > 0 && consumePrice > 0) {
                profitRatio = (gainedPrice / consumePrice).toFixed(2)
              } else if (gainedPrice > 0 && consumePrice === 0) {
                profitRatio = '∞'
              }

              // 解析资产趋势
              const assetTrend = parseAssetTrend(solData.Total_Price)

              templateData.solData = {
                total_sol_num: solData.total_sol_num || 0,
                total_exacuation_num: solData.total_exacuation_num || 0,
                GainedPrice_overmillion_num: solData.GainedPrice_overmillion_num || 0,
                total_Death_Count: solData.total_Death_Count || 0,
                total_Kill_Player: solData.total_Kill_Player || 0,
                total_Kill_AI: solData.total_Kill_AI || 0,
                total_Kill_Boss: solData.total_Kill_Boss || 0,
                rankName: solRank,
                rankImagePath: solRankImagePath,
                rise_Price: solData.rise_Price?.toLocaleString() || '0',
                Gained_Price: solData.Gained_Price?.toLocaleString() || '0',
                consume_Price: solData.consume_Price?.toLocaleString() || '0',
                profitRatio: profitRatio,
                assetTrend: assetTrend,
                total_Quest_num: solData.total_Quest_num || 0,
                use_Keycard_num: solData.use_Keycard_num || 0,
                Mandel_brick_num: solData.Mandel_brick_num || 0,
                search_Birdsnest_num: solData.search_Birdsnest_num || 0,
                mileage: solData.Total_Mileage ? (solData.Total_Mileage / 100000).toFixed(2) : '0',
                total_Rescue_num: solData.total_Rescue_num || 0,
                Kill_ByCrocodile_num: solData.Kill_ByCrocodile_num || 0,
                gameTime: `${Math.floor((solData.total_Online_Time || 0) / 3600)}小时${Math.floor(((solData.total_Online_Time || 0) % 3600) / 60)}分钟`,
                mostUsedMap: mostUsedMap,
                mostUsedMapImagePath: mostUsedMap && mostUsedMap !== '无' ? dataManager.getMapImagePath(mostUsedMap, 'sol') : null,
                mostUsedOperator: mostUsedOperator,
                mostUsedOperatorImagePath: mostUsedOperator && mostUsedOperator !== '无' ? dataManager.getOperatorImagePath(mostUsedOperator) : null,
                operators: parseOperators(solData.total_ArmedForceId_num, dataManager),
                maps: parseMaps(solData.total_mapid_num, dataManager, 'sol'),
                highPriceItems: parseHighPriceItems(solData.CarryOut_highprice_list),
                teammates: parseSolTeammates(solData.teammates || [], nicknameMap, avatarMap)
              }
            }
          } else {
            templateData.solData = { isEmpty: true }
          }
        }

        // 处理全面战场数据
        if (!mode || mode === 'mp') {
          if (mpData) {
            const hasValidData = mpData.total_num && Number(mpData.total_num) > 0
            
            if (!hasValidData) {
              templateData.mpData = { isEmpty: true }
            } else {
              // 计算胜率
              const totalNum = Number(mpData.total_num) || 0
              const winNum = Number(mpData.win_num) || 0
              const winRate = totalNum > 0 ? ((winNum / totalNum) * 100).toFixed(1) + '%' : '0%'

              // 获取段位信息
              const mpRank = mpData.Rank_Match_Score ? dataManager.getRankByScore(mpData.Rank_Match_Score, 'tdm') : '-'
              const mpRankImagePath = mpRank !== '-' ? dataManager.getRankImage(mpData.Rank_Match_Score || 0, 'tdm') : null

              // 计算命中率
              const consumeBullet = Number(mpData.Consume_Bullet_Num) || 0
              const hitBullet = Number(mpData.Hit_Bullet_Num) || 0
              const hitRate = consumeBullet > 0 ? ((hitBullet / consumeBullet) * 100).toFixed(1) + '%' : '0%'

              // 解析常用地图和干员
              const mostUsedMap = parseAndGetName(mpData.max_inum_mapid, 'MapId', 'inum', (id) => dataManager.getMapName(id))
              const mostUsedOperator = mpData.max_inum_DeployArmedForceType ? dataManager.getOperatorName(mpData.max_inum_DeployArmedForceType) : '无'

              templateData.mpData = {
                total_num: mpData.total_num || 0,
                win_num: mpData.win_num || 0,
                winRate: winRate,
                rankName: mpRank,
                rankImagePath: mpRankImagePath,
                Kill_Num: mpData.Kill_Num || 0,
                continuous_Kill_Num: mpData.continuous_Kill_Num || 0,
                total_score: mpData.total_score?.toLocaleString() || '0',
                hitRate: hitRate,
                Hit_Bullet_Num: mpData.Hit_Bullet_Num || 0,
                Consume_Bullet_Num: mpData.Consume_Bullet_Num || 0,
                SBattle_Support_UseNum: mpData.SBattle_Support_UseNum || 0,
                SBattle_Support_CostScore: mpData.SBattle_Support_CostScore?.toLocaleString() || '0',
                Rescue_Teammate_Count: mpData.Rescue_Teammate_Count || 0,
                by_Rescue_num: mpData.by_Rescue_num || 0,
                mostUsedMap: mostUsedMap,
                mostUsedMapImagePath: mostUsedMap && mostUsedMap !== '无' ? dataManager.getMapImagePath(mostUsedMap, 'mp') : null,
                mostUsedOperator: mostUsedOperator,
                mostUsedOperatorImagePath: mostUsedOperator && mostUsedOperator !== '无' ? dataManager.getOperatorImagePath(mostUsedOperator) : null,
                maps: parseMaps(mpData.max_inum_mapid, dataManager, 'mp'),
                operatorStats: mpData.max_inum_DeployArmedForceType ? {
                  name: mostUsedOperator,
                  imagePath: dataManager.getOperatorImagePath(mostUsedOperator),
                  games: mpData.DeployArmedForceType_inum || 0,
                  kills: mpData.DeployArmedForceType_KillNum || 0,
                  gameTime: `${Math.floor((mpData.DeployArmedForceType_gametime || 0) / 3600)}小时${Math.floor(((mpData.DeployArmedForceType_gametime || 0) % 3600) / 60)}分钟`
                } : null,
                teammates: parseMpTeammates(mpData.teammates || [], nicknameMap, avatarMap)
              }
            }
          } else {
            templateData.mpData = { isEmpty: true }
          }
        }

        // 渲染模板
        return renderer.renderToMessage('weeklyReport', templateData)
      } catch (error) {
        logger.error('查询周报失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

// 类型定义
interface WeeklySolData {
  total_sol_num?: number
  total_exacuation_num?: number
  GainedPrice_overmillion_num?: number
  total_Death_Count?: number
  total_Kill_Player?: number
  total_Kill_AI?: number
  total_Kill_Boss?: number
  Rank_Score?: number
  rise_Price?: number
  Gained_Price?: number
  consume_Price?: number
  Total_Price?: string
  total_Quest_num?: number
  use_Keycard_num?: number
  Mandel_brick_num?: number
  search_Birdsnest_num?: number
  Total_Mileage?: number
  total_Rescue_num?: number
  Kill_ByCrocodile_num?: number
  total_Online_Time?: number
  total_mapid_num?: string
  total_ArmedForceId_num?: string
  CarryOut_highprice_list?: string
  teammates?: SolTeammate[]
}

interface SolTeammate {
  friend_openid: string
  Friend_total_sol_num?: number
  Friend_is_Escape1_num?: number
  Friend_is_Escape2_num?: number
  Friend_total_sol_KillPlayer?: number
  Friend_total_sol_DeathCount?: number
  Friend_Sum_Gained_Price?: number
  Friend_Sum_Escape1_Gained_Price?: number
  Friend_Sum_Escape2_Gained_Price?: number
  Friend_consume_Price?: number
  Friend_Escape1_consume_Price?: number
  Friend_Escape2_consume_Price?: number
  Friend_total_sol_AssistCnt?: number
}

interface WeeklyMpData {
  total_num?: number
  win_num?: number
  Rank_Match_Score?: number
  Kill_Num?: number
  continuous_Kill_Num?: number
  total_score?: number
  Hit_Bullet_Num?: number
  Consume_Bullet_Num?: number
  SBattle_Support_UseNum?: number
  SBattle_Support_CostScore?: number
  Rescue_Teammate_Count?: number
  by_Rescue_num?: number
  max_inum_mapid?: string
  max_inum_DeployArmedForceType?: string | number
  DeployArmedForceType_inum?: number
  DeployArmedForceType_KillNum?: number
  DeployArmedForceType_gametime?: number
  teammates?: MpTeammate[]
}

interface MpTeammate {
  friend_openid: string
  Friend_mp_total_num?: number
  Friend_mp_win_num?: number
  Friend_mp_KillNum?: number
  Friend_mp_Death?: number
  Friend_mp_Assist?: number
  Friend_Sum_Score?: number
  Friend_Max_Score?: number
}

interface ParsedItem {
  [key: string]: string | number
}

interface AssetTrendPoint {
  dayName: string
  price: string
  rawPrice: number
  x: string
  y: string
  xPercent: string
  yPercent: string
}

interface AssetTrend {
  startPrice: string
  endPrice: string
  maxPrice: string
  minPrice: string
  chartWidth: number
  chartHeight: number
  pathData: string
  allDays: AssetTrendPoint[]
}

// 解析资产趋势数据
function parseAssetTrend(totalPrice?: string): AssetTrend | null {
  if (!totalPrice) return null

  const prices = totalPrice.split(',')
  const dayMap: Record<string, string> = {
    'Monday': '周一',
    'Tuesday': '周二',
    'Wednesday': '周三',
    'Thursday': '周四',
    'Friday': '周五',
    'Saturday': '周六',
    'Sunday': '周日'
  }

  // 解析所有7天的数据
  const dailyPrices: Record<string, number> = {}
  prices.forEach(priceStr => {
    const parts = priceStr.split('-')
    if (parts.length >= 3) {
      const dayName = parts[0]
      const price = parseInt(parts[2])
      if (!isNaN(price)) {
        dailyPrices[dayName] = price
      }
    }
  })

  const monday = dailyPrices['Monday']
  const sunday = dailyPrices['Sunday']

  if (monday === undefined || sunday === undefined) return null

  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const allPrices = allDays.map(day => dailyPrices[day]).filter(p => p !== undefined)

  if (allPrices.length === 0) return null

  const maxPrice = Math.max(...allPrices)
  const minPrice = Math.min(...allPrices)
  const priceRange = maxPrice - minPrice || 1

  const chartWidth = 600
  const chartHeight = 120
  const padding = { top: 20, right: 10, bottom: 30, left: 10 }
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom

  const points: AssetTrendPoint[] = allDays.map((day, index) => {
    const price = dailyPrices[day] || 0
    const x = padding.left + (index / (allDays.length - 1)) * plotWidth
    const y = padding.top + plotHeight - ((price - minPrice) / priceRange) * plotHeight

    return {
      dayName: dayMap[day] || day,
      price: price ? price.toLocaleString() : '-',
      rawPrice: price || 0,
      x: x.toFixed(1),
      y: y.toFixed(1),
      xPercent: ((x / chartWidth) * 100).toFixed(2),
      yPercent: ((y / chartHeight) * 100).toFixed(2)
    }
  })

  // 生成折线路径
  let pathData = ''
  if (points.length > 0) {
    pathData = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      pathData += ` L ${points[i].x},${points[i].y}`
    }
  }

  return {
    startPrice: monday.toLocaleString(),
    endPrice: sunday.toLocaleString(),
    maxPrice: maxPrice.toLocaleString(),
    minPrice: minPrice.toLocaleString(),
    chartWidth,
    chartHeight,
    pathData,
    allDays: points
  }
}

// 解析干员使用数据
function parseOperators(dataStr: string | undefined, dataManager: DataManager): Array<{ id: string; count: number; name: string; imagePath: string | null }> {
  if (!dataStr || typeof dataStr !== 'string') return []

  try {
    const opStrings = dataStr.includes('#') ? dataStr.split('#') : [dataStr]
    return opStrings.map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        const parsed = JSON.parse(correctedJSON)
        const operatorId = parsed.ArmedForceId
        const operatorName = dataManager.getOperatorName(operatorId)
        return {
          id: operatorId,
          count: parsed.inum,
          name: operatorName,
          imagePath: dataManager.getOperatorImagePath(operatorName)
        }
      } catch {
        return null
      }
    }).filter((item): item is { id: string; count: number; name: string; imagePath: string | null } => item !== null)
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

// 解析地图使用数据
function parseMaps(dataStr: string | undefined, dataManager: DataManager, mode: 'sol' | 'mp'): Array<{ id: string; count: number; name: string; imagePath: string | null }> {
  if (!dataStr || typeof dataStr !== 'string') return []

  try {
    const mapStrings = dataStr.includes('#') ? dataStr.split('#') : [dataStr]
    return mapStrings.map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        const parsed = JSON.parse(correctedJSON)
        const mapName = dataManager.getMapName(parsed.MapId)
        return {
          id: parsed.MapId,
          count: parsed.inum,
          name: mapName,
          imagePath: dataManager.getMapImagePath(mapName, mode)
        }
      } catch {
        return null
      }
    }).filter((item): item is { id: string; count: number; name: string; imagePath: string | null } => item !== null)
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

// 解析高价值物资数据
function parseHighPriceItems(dataStr: string | undefined): Array<{ name: string; price: string }> {
  if (!dataStr || typeof dataStr !== 'string') return []

  try {
    const items = dataStr.split('#').map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        return JSON.parse(correctedJSON)
      } catch {
        return null
      }
    }).filter(Boolean)

    items.sort((a, b) => b.iPrice - a.iPrice)
    return items.slice(0, 5).map(item => ({
      name: item.auctontype || '物品',
      price: item.iPrice.toLocaleString()
    }))
  } catch {
    return []
  }
}

// 解析并获取名称
function parseAndGetName(
  dataStr: string | undefined,
  idKey: string,
  countKey: string,
  getNameFunc: (id: string) => string
): string {
  if (!dataStr || typeof dataStr !== 'string') return '无'

  try {
    const items = dataStr.split('#').map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        return JSON.parse(correctedJSON) as ParsedItem
      } catch {
        return null
      }
    }).filter((item): item is ParsedItem => item !== null)

    if (items.length === 0) return '无'

    const mostUsed = items.reduce((a, b) =>
      (Number(a[countKey]) > Number(b[countKey]) ? a : b)
    )
    return getNameFunc(String(mostUsed[idKey]))
  } catch {
    return '无'
  }
}

// 解析烽火地带队友数据（与云崽版保持一致）
function parseSolTeammates(
  teammates: SolTeammate[],
  nicknameMap: Map<string, string>,
  avatarMap: Map<string, string>
): Array<{
  name: string
  avatar: string
  total_sol_num: number
  escape1: number
  escape2: number
  killPlayer: number
  death: number
  totalGained: string
  successGain: string
  failGain: string
  totalCost: string
  successCost: string
  failCost: string
  assistCnt: number
}> {
  // 过滤有效队友（有对局数的）
  const activeTeammates = teammates.filter(t => (t.Friend_total_sol_num || 0) > 0)
  
  return activeTeammates.map(t => {
    const teammateName = nicknameMap.get(t.friend_openid) || `...${t.friend_openid.slice(-6)}`
    const teammateAvatar = avatarMap.get(t.friend_openid) || ''
    const sumGained = t.Friend_Sum_Gained_Price
    const totalGained = Number(sumGained) ||
      (Number(t.Friend_Sum_Escape1_Gained_Price || 0) +
        Number(t.Friend_Sum_Escape2_Gained_Price || 0))
    
    return {
      name: teammateName,
      avatar: teammateAvatar,
      total_sol_num: t.Friend_total_sol_num || 0,
      escape1: t.Friend_is_Escape1_num || 0,
      escape2: t.Friend_is_Escape2_num || 0,
      killPlayer: t.Friend_total_sol_KillPlayer || 0,
      death: t.Friend_total_sol_DeathCount || 0,
      totalGained: totalGained.toLocaleString(),
      successGain: Number(t.Friend_Sum_Escape1_Gained_Price || 0).toLocaleString(),
      failGain: Number(t.Friend_Sum_Escape2_Gained_Price || 0).toLocaleString(),
      totalCost: Number(t.Friend_consume_Price || 0).toLocaleString(),
      successCost: Number(t.Friend_Escape1_consume_Price || 0).toLocaleString(),
      failCost: Number(t.Friend_Escape2_consume_Price || 0).toLocaleString(),
      assistCnt: t.Friend_total_sol_AssistCnt || 0
    }
  })
}

// 解析全面战场队友数据（与云崽版保持一致）
function parseMpTeammates(
  teammates: MpTeammate[],
  nicknameMap: Map<string, string>,
  avatarMap: Map<string, string>
): Array<{
  name: string
  avatar: string
  total_num: number
  win_num: number
  winRate: string
  kda: string
  sumScore: string
  maxScore: string
}> {
  // 过滤有效队友
  const activeTeammates = teammates.filter(t => 
    (t.Friend_mp_total_num || 0) > 0 || 
    (t.Friend_mp_win_num || 0) > 0 || 
    (t.Friend_mp_KillNum || 0) > 0
  )
  
  return activeTeammates.map(t => {
    const teammateName = nicknameMap.get(t.friend_openid) || `...${t.friend_openid.slice(-6)}`
    const teammateAvatar = avatarMap.get(t.friend_openid) || ''
    const totalGames = t.Friend_mp_total_num || 0
    const winGames = t.Friend_mp_win_num || 0
    const winRate = totalGames > 0 ? `${((winGames / totalGames) * 100).toFixed(1)}%` : '0%'
    
    return {
      name: teammateName,
      avatar: teammateAvatar,
      total_num: totalGames,
      win_num: winGames,
      winRate: winRate,
      kda: `${t.Friend_mp_KillNum || 0}/${t.Friend_mp_Death || 0}/${t.Friend_mp_Assist || 0}`,
      sumScore: (t.Friend_Sum_Score || 0).toLocaleString(),
      maxScore: (t.Friend_Max_Score || 0).toLocaleString()
    }
  })
}
