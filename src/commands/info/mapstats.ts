import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError, getUserDisplayInfo } from '../../utils'
import { Renderer } from '../../render'

interface MapStatsData {
  mapId: string
  mapName?: string
  data: {
    a1?: number
    cs?: number
    zdj?: number
    isescapednum?: number
    killnum?: number
    nums?: number
    winnum?: number
    zdjnum?: number
    score?: number
    gametime?: number
    assist?: number
    death?: number
  }
}


export function registerMapStatsCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.mapstats [...args:string]', '查看地图统计')
    .alias('df.地图统计')
    .alias('df.地图数据')
    .action(async ({ session }, ...args) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      let type = ''
      let seasonid = 'all'
      let mapKeyword = ''
      let shouldMerge = false
      let hasSeasonId = false

      // 处理 middleware 传递的参数（可能是单个字符串，需要拆分）
      const allArgs: string[] = []
      for (const arg of args) {
        const parts = arg.split(/\s+/).filter(Boolean)
        allArgs.push(...parts)
      }

      for (const arg of allArgs) {
        if (['烽火', '烽火地带', 'sol', '摸金'].includes(arg)) {
          type = 'sol'
        } else if (['全面', '全面战场', '战场', 'mp', 'tdm'].includes(arg)) {
          type = 'mp'
        } else if (['all', '全部'].includes(arg.toLowerCase())) {
          seasonid = 'all'
          hasSeasonId = true
        } else if (!isNaN(parseInt(arg))) {
          seasonid = arg
          hasSeasonId = true
        } else {
          mapKeyword = arg
        }
      }

      if (mapKeyword) {
        shouldMerge = false
        if (!type) type = ''
      } else if (hasSeasonId) {
        shouldMerge = false
        if (!type) {
          return '请指定游戏模式：\n' +
            '格式：\n' +
            '  df.mapstats                    # 合并所有基础地图数据（烽火+全面）\n' +
            '  df.mapstats 烽火               # 合并显示所有烽火地图数据\n' +
            '  df.mapstats 全面               # 合并显示所有全面地图数据\n' +
            '  df.mapstats 烽火 5             # 查询烽火地带第5赛季（不合并）\n' +
            '  df.mapstats 全面 all           # 查询全面战场所有赛季（不合并）\n' +
            '  df.mapstats 大坝               # 搜索包含"大坝"的地图（不合并）'
        }
      } else if (type) {
        shouldMerge = true
        seasonid = 'all'
      } else {
        shouldMerge = true
        type = ''
        seasonid = 'all'
      }

      const queryTypeText = shouldMerge
        ? (type === 'sol' ? '（烽火地带-合并）' : type === 'mp' ? '（全面战场-合并）' : '（烽火地带 + 全面战场-合并）')
        : (type ? `（${type === 'sol' ? '烽火地带' : '全面战场'}）` : '（烽火地带 + 全面战场）')

      await session.send(`正在查询地图统计数据${queryTypeText}，请稍候...`)

      try {
        let solRes = null
        let mpRes = null

        if (!type || type === 'sol') {
          solRes = await api.getMapStats(token, seasonid, 'sol', mapKeyword || undefined)
          if (await handleApiError(solRes, session)) return
        }
        if (!type || type === 'mp') {
          mpRes = await api.getMapStats(token, seasonid, 'mp', mapKeyword || undefined)
          if (await handleApiError(mpRes, session)) return
        }

        const solData = (solRes?.data as MapStatsData[]) || []
        const mpData = (mpRes?.data as MapStatsData[]) || []

        if (solData.length === 0 && mpData.length === 0) {
          return '暂无地图统计数据'
        }

        // 获取用户信息（使用统一函数，从 personalInfo 接口获取头像）
        const { userName, userAvatar, qqAvatarUrl } = await getUserDisplayInfo(
          api,
          token,
          session.userId,
          session.username || session.userId
        )

        // 获取当前日期
        const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

        // 与云崽版保持一致：分开渲染烽火和全面两张图片
        const seasonText = seasonid === 'all' ? '全部赛季' : `第${seasonid}赛季`
        const messages: (string | import('koishi').h)[] = []

        // 构建烽火地带数据
        if ((!type || type === 'sol') && solData.length > 0) {
          const solMapStatsList = buildMapStatsListForMode(solData, dataManager, 'sol', shouldMerge)
          if (solMapStatsList.length > 0) {
            const solTemplateData = {
              userName,
              userAvatar,
              qqAvatarUrl,
              currentDate,
              backgroundImage: dataManager.getRandomBackground(),
              type: 'sol',
              typeName: '烽火地带',
              seasonid: seasonText,
              totalMaps: solMapStatsList.length,
              mapStatsList: solMapStatsList
            }
            const solImage = await renderer.renderToMessage('mapStats', solTemplateData)
            messages.push(solImage)
          }
        }

        // 构建全面战场数据
        if ((!type || type === 'mp') && mpData.length > 0) {
          const mpMapStatsList = buildMapStatsListForMode(mpData, dataManager, 'mp', shouldMerge)
          if (mpMapStatsList.length > 0) {
            const mpTemplateData = {
              userName,
              userAvatar,
              qqAvatarUrl,
              currentDate,
              backgroundImage: dataManager.getRandomBackground(),
              type: 'mp',
              typeName: '全面战场',
              seasonid: seasonText,
              totalMaps: mpMapStatsList.length,
              mapStatsList: mpMapStatsList
            }
            const mpImage = await renderer.renderToMessage('mapStats', mpTemplateData)
            messages.push(mpImage)
          }
        }

        if (messages.length === 0) {
          return '暂无地图统计数据'
        }

        // 与云崽版保持一致：连续发送多张图片
        for (const msg of messages) {
          await session.send(msg)
        }
        return
      } catch (error) {
        logger.error('查询地图统计失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0分钟'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`
}

function formatNumber(num: number | string | undefined): string {
  if (num === null || num === undefined || num === '') return '-'
  const numValue = typeof num === 'string' ? parseFloat(num) : num
  return isNaN(numValue) ? String(num) : numValue.toLocaleString()
}

function formatProfit(profit: number | string | undefined): string {
  if (profit === null || profit === undefined || profit === '') return '-'
  const profitValue = typeof profit === 'string' ? parseFloat(profit) : profit
  if (isNaN(profitValue)) return String(profit)
  const absValue = Math.abs(profitValue)
  const sign = profitValue >= 0 ? '+' : '-'
  if (absValue >= 1000000000) return `${sign}${(absValue / 1000000000).toFixed(2)}B`
  if (absValue >= 1000000) return `${sign}${(absValue / 1000000).toFixed(2)}M`
  if (absValue >= 1000) return `${sign}${(absValue / 1000).toFixed(2)}K`
  return `${sign}${absValue.toLocaleString()}`
}

function calculateRate(numerator: number | undefined, denominator: number | undefined): string {
  if (!numerator || !denominator || denominator === 0) return '0%'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function calculateKDA(kill: number | undefined, assist: number | undefined, death: number | undefined): string {
  const k = kill || 0
  const a = assist || 0
  const d = death || 0
  if (d === 0) return k > 0 ? k.toFixed(2) : '0.00'
  return ((k + a) / d).toFixed(2)
}

function getMapBaseName(mapName: string): string {
  return mapName ? mapName.replace(/[-（(].*$/, '').trim() : ''
}

// 获取地图图片的相对路径（供模板拼接 _res_path）
function getMapImageRelativePath(mapName: string, mode: 'sol' | 'mp'): string | null {
  if (!mapName || mapName.includes('未知') || mapName.includes('无')) {
    return null
  }
  // 清理地图名称，移除可能的括号内容
  let cleanName = mapName.trim().replace(/\s*\([^)]*\)/, '')
  
  // 根据模式构建路径
  const prefix = mode === 'sol' ? '烽火-' : '全面-'
  
  // 全面战场模式：从地图名称中提取"-"前面的部分
  if (mode === 'mp') {
    if (cleanName.includes('-')) {
      cleanName = cleanName.split('-')[0].trim()
    }
    return `imgs/map/${prefix}${cleanName}.jpg`
  } else {
    // 烽火地带模式：提取基础地图名称
    let baseName = cleanName
    if (cleanName.includes('-')) {
      baseName = cleanName.split('-')[0].trim()
    }
    return `imgs/map/${prefix}${baseName}-常规.png`
  }
}

// 模板数据接口
interface TemplateMapStat {
  mapName: string
  mapImage: string | null
  sol?: {
    profit: string
    totalGames: string
    escaped: string
    escapeRate: string
    kill: string
    failed: string
  }
  mp?: {
    win: string
    totalGames: string
    winRate: string
    score: string
    gameTime: string
    kill: string
    assist: string
    death: string
    kda: string
  }
}

// 构建单一模式的地图统计列表（与云崽版一致：分开渲染烽火和全面）
function buildMapStatsListForMode(
  data: MapStatsData[],
  dataManager: DataManager,
  mode: 'sol' | 'mp',
  shouldMerge: boolean
): TemplateMapStat[] {
  // 过滤掉 data 为 null 的项目（与云崽版保持一致）
  const validData = data.filter(item => item.data !== null && item.data !== undefined)
  
  if (validData.length === 0) {
    return []
  }

  if (shouldMerge) {
    return buildMergedMapStatsListForMode(validData, dataManager, mode)
  } else {
    return buildNormalMapStatsListForMode(validData, dataManager, mode)
  }
}

// 构建单一模式的非合并地图统计列表
function buildNormalMapStatsListForMode(
  data: MapStatsData[],
  dataManager: DataManager,
  mode: 'sol' | 'mp'
): TemplateMapStat[] {
  const result: TemplateMapStat[] = []

  for (const item of data) {
    const mapName = item.mapName || dataManager.getMapName(item.mapId)
    const d = item.data
    const mapImage = getMapImageRelativePath(mapName, mode)

    if (mode === 'sol') {
      const totalGames = d.zdj || d.cs || 0
      result.push({
        mapName,
        mapImage,
        sol: {
          profit: formatProfit(d.a1),
          totalGames: formatNumber(totalGames),
          escaped: formatNumber(d.isescapednum),
          escapeRate: calculateRate(d.isescapednum, totalGames),
          kill: formatNumber(d.killnum),
          failed: formatNumber(d.nums)
        }
      })
    } else {
      result.push({
        mapName,
        mapImage,
        mp: {
          win: formatNumber(d.winnum),
          totalGames: formatNumber(d.zdjnum),
          winRate: calculateRate(d.winnum, d.zdjnum),
          score: formatNumber(d.score),
          gameTime: formatDuration(d.gametime || 0),
          kill: formatNumber(d.killnum),
          assist: formatNumber(d.assist),
          death: formatNumber(d.death),
          kda: calculateKDA(d.killnum, d.assist, d.death)
        }
      })
    }
  }

  return result
}

// 构建单一模式的合并地图统计列表
function buildMergedMapStatsListForMode(
  data: MapStatsData[],
  dataManager: DataManager,
  mode: 'sol' | 'mp'
): TemplateMapStat[] {
  interface MergedSolData {
    baseName: string
    mapImage: string | null
    profit: number
    totalGames: number
    escaped: number
    kill: number
    failed: number
  }
  
  interface MergedMpData {
    baseName: string
    mapImage: string | null
    win: number
    totalGames: number
    score: number
    gameTime: number
    kill: number
    assist: number
    death: number
  }

  if (mode === 'sol') {
    const mergedMap = new Map<string, MergedSolData>()
    
    for (const item of data) {
      const mapName = item.mapName || dataManager.getMapName(item.mapId)
      const baseName = getMapBaseName(mapName)
      const d = item.data
      const mapImage = getMapImageRelativePath(mapName, 'sol')

      if (!mergedMap.has(baseName)) {
        mergedMap.set(baseName, {
          baseName,
          mapImage,
          profit: 0,
          totalGames: 0,
          escaped: 0,
          kill: 0,
          failed: 0
        })
      }

      const merged = mergedMap.get(baseName)!
      merged.profit += d.a1 || 0
      merged.totalGames += d.zdj || d.cs || 0
      merged.escaped += d.isescapednum || 0
      merged.kill += d.killnum || 0
      merged.failed += d.nums || 0
    }

    // 按总对局数排序
    const sortedMaps = Array.from(mergedMap.values()).sort((a, b) => b.totalGames - a.totalGames)

    return sortedMaps.map(map => ({
      mapName: map.baseName,
      mapImage: map.mapImage,
      sol: {
        profit: formatProfit(map.profit),
        totalGames: formatNumber(map.totalGames),
        escaped: formatNumber(map.escaped),
        escapeRate: calculateRate(map.escaped, map.totalGames),
        kill: formatNumber(map.kill),
        failed: formatNumber(map.failed)
      }
    }))
  } else {
    const mergedMap = new Map<string, MergedMpData>()
    
    for (const item of data) {
      const mapName = item.mapName || dataManager.getMapName(item.mapId)
      const baseName = getMapBaseName(mapName)
      const d = item.data
      const mapImage = getMapImageRelativePath(mapName, 'mp')

      if (!mergedMap.has(baseName)) {
        mergedMap.set(baseName, {
          baseName,
          mapImage,
          win: 0,
          totalGames: 0,
          score: 0,
          gameTime: 0,
          kill: 0,
          assist: 0,
          death: 0
        })
      }

      const merged = mergedMap.get(baseName)!
      merged.win += d.winnum || 0
      merged.totalGames += d.zdjnum || 0
      merged.score += d.score || 0
      merged.gameTime += d.gametime || 0
      merged.kill += d.killnum || 0
      merged.assist += d.assist || 0
      merged.death += d.death || 0
    }

    // 按总对局数排序
    const sortedMaps = Array.from(mergedMap.values()).sort((a, b) => b.totalGames - a.totalGames)

    return sortedMaps.map(map => ({
      mapName: map.baseName,
      mapImage: map.mapImage,
      mp: {
        win: formatNumber(map.win),
        totalGames: formatNumber(map.totalGames),
        winRate: calculateRate(map.win, map.totalGames),
        score: formatNumber(map.score),
        gameTime: formatDuration(map.gameTime),
        kill: formatNumber(map.kill),
        assist: formatNumber(map.assist),
        death: formatNumber(map.death),
        kda: calculateKDA(map.kill, map.assist, map.death)
      }
    }))
  }
}

