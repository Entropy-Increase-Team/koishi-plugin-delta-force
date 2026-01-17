import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

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
  dataManager: DataManager
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

      for (const arg of args) {
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

        if (shouldMerge) {
          return formatMergedMapStats(solData, mpData, dataManager, type)
        } else {
          return formatMapStats(solData, mpData, dataManager, type)
        }
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

function formatMapStats(
  solData: MapStatsData[],
  mpData: MapStatsData[],
  dataManager: DataManager,
  type: string
): string {
  let message = '【地图统计数据】\n'

  if (solData.length > 0 && (!type || type === 'sol')) {
    message += '\n━━━ 烽火地带 ━━━\n'
    for (const item of solData) {
      const mapName = item.mapName || dataManager.getMapName(item.mapId)
      const d = item.data
      const totalGames = d.zdj || d.cs || 0
      const escapeRate = calculateRate(d.isescapednum, totalGames)

      message += `\n【${mapName}】\n`
      message += `净收益: ${formatProfit(d.a1)}\n`
      message += `总对局: ${formatNumber(totalGames)} | 撤离: ${formatNumber(d.isescapednum)} (${escapeRate})\n`
      message += `击杀: ${formatNumber(d.killnum)} | 失败: ${formatNumber(d.nums)}\n`
    }
  }

  if (mpData.length > 0 && (!type || type === 'mp')) {
    message += '\n━━━ 全面战场 ━━━\n'
    for (const item of mpData) {
      const mapName = item.mapName || dataManager.getMapName(item.mapId)
      const d = item.data
      const winRate = calculateRate(d.winnum, d.zdjnum)
      const kda = calculateKDA(d.killnum, d.assist, d.death)

      message += `\n【${mapName}】\n`
      message += `胜利: ${formatNumber(d.winnum)}/${formatNumber(d.zdjnum)} (${winRate})\n`
      message += `得分: ${formatNumber(d.score)} | 时长: ${formatDuration(d.gametime || 0)}\n`
      message += `K/A/D: ${formatNumber(d.killnum)}/${formatNumber(d.assist)}/${formatNumber(d.death)} (KDA: ${kda})\n`
    }
  }

  return message.trim()
}

interface MergedMapData {
  baseName: string
  sol?: {
    profit: number
    totalGames: number
    escaped: number
    kill: number
    failed: number
  }
  mp?: {
    win: number
    totalGames: number
    score: number
    gameTime: number
    kill: number
    assist: number
    death: number
  }
}

function formatMergedMapStats(
  solData: MapStatsData[],
  mpData: MapStatsData[],
  dataManager: DataManager,
  type: string
): string {
  const mergedMap = new Map<string, MergedMapData>()

  for (const item of solData) {
    const mapName = item.mapName || dataManager.getMapName(item.mapId)
    const baseName = getMapBaseName(mapName)
    const d = item.data

    if (!mergedMap.has(baseName)) {
      mergedMap.set(baseName, { baseName })
    }

    const merged = mergedMap.get(baseName)!
    if (!merged.sol) {
      merged.sol = { profit: 0, totalGames: 0, escaped: 0, kill: 0, failed: 0 }
    }

    merged.sol.profit += d.a1 || 0
    merged.sol.totalGames += d.zdj || d.cs || 0
    merged.sol.escaped += d.isescapednum || 0
    merged.sol.kill += d.killnum || 0
    merged.sol.failed += d.nums || 0
  }

  for (const item of mpData) {
    const mapName = item.mapName || dataManager.getMapName(item.mapId)
    const baseName = getMapBaseName(mapName)
    const d = item.data

    if (!mergedMap.has(baseName)) {
      mergedMap.set(baseName, { baseName })
    }

    const merged = mergedMap.get(baseName)!
    if (!merged.mp) {
      merged.mp = { win: 0, totalGames: 0, score: 0, gameTime: 0, kill: 0, assist: 0, death: 0 }
    }

    merged.mp.win += d.winnum || 0
    merged.mp.totalGames += d.zdjnum || 0
    merged.mp.score += d.score || 0
    merged.mp.gameTime += d.gametime || 0
    merged.mp.kill += d.killnum || 0
    merged.mp.assist += d.assist || 0
    merged.mp.death += d.death || 0
  }

  let message = '【地图统计数据（合并）】\n'

  const sortedMaps = Array.from(mergedMap.values()).sort((a, b) => {
    const aTotal = (a.sol?.totalGames || 0) + (a.mp?.totalGames || 0)
    const bTotal = (b.sol?.totalGames || 0) + (b.mp?.totalGames || 0)
    return bTotal - aTotal
  })

  for (const map of sortedMaps) {
    message += `\n【${map.baseName}】\n`

    if (map.sol && (!type || type === 'sol')) {
      const escapeRate = calculateRate(map.sol.escaped, map.sol.totalGames)
      message += `烽火: ${formatNumber(map.sol.totalGames)}局 | 撤离${formatNumber(map.sol.escaped)}(${escapeRate}) | 净收益${formatProfit(map.sol.profit)}\n`
    }

    if (map.mp && (!type || type === 'mp')) {
      const winRate = calculateRate(map.mp.win, map.mp.totalGames)
      const kda = calculateKDA(map.mp.kill, map.mp.assist, map.mp.death)
      message += `全面: ${formatNumber(map.mp.totalGames)}局 | 胜${formatNumber(map.mp.win)}(${winRate}) | KDA ${kda}\n`
    }
  }

  return message.trim()
}
