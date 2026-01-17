import { Context } from 'koishi'
import { ApiService } from '../../api'
import { getGroupActiveToken } from '../../database'
import { handleApiError } from '../../utils'

/**
 * 注册封号记录查询相关命令
 */
export function registerBanCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 封号记录查询
  ctx.command('df.ban', '查看违规/封号记录')
    .alias('df.封号记录')
    .alias('df.违规记录')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      // 优先获取 QQ 安全中心的 token
      const token = await getGroupActiveToken(ctx, userId, platform, 'qqsafe')
      if (!token) {
        return '您尚未绑定或激活 QQ 安全中心账号，请使用 df.login qqsafe 进行绑定'
      }

      await session.send('正在查询违规记录，请稍候...')

      try {
        const res = await api.getBanHistory(token)

        if (await handleApiError(res, session)) return

        if (!res.data || !Array.isArray(res.data)) {
          return `查询失败: ${res.msg || 'API 返回数据格式不正确'}`
        }

        interface BanRecord {
          game_name?: string
          zone?: string
          type?: string
          reason?: string
          strategy_desc?: string
          start_stmp?: number
          duration?: number
          cheat_date?: number
        }

        const banList = res.data as BanRecord[]

        if (banList.length === 0) {
          return '🎉 该账号暂无违规记录'
        }

        const lines: string[] = ['【违规记录查询】']
        lines.push(`共 ${banList.length} 条记录`)
        lines.push('━━━━━━━━━━━━━━━')

        banList.forEach((ban, index) => {
          lines.push('')
          lines.push(`📌 记录 ${index + 1}`)
          lines.push(`游戏: ${ban.game_name || '未知'} (${ban.zone || '未知'})`)
          lines.push(`类型: ${ban.type || '未知'}`)
          lines.push(`原因: ${ban.reason || '未知'}`)
          lines.push(`分类: ${ban.strategy_desc || '未知'}`)
          lines.push(`开始时间: ${formatTimestamp(ban.start_stmp)}`)
          lines.push(`持续时间: ${formatDuration(ban.duration)}`)
          
          if (ban.cheat_date) {
            lines.push(`作弊时间: ${formatTimestamp(ban.cheat_date)}`)
          }
        })

        return lines.join('\n')
      } catch (error) {
        logger.error('查询违规记录失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp || isNaN(timestamp)) return 'N/A'
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

/**
 * 格式化持续时间
 */
function formatDuration(duration: number | undefined): string {
  if (!duration || isNaN(duration)) return 'N/A'

  const days = Math.floor(duration / (3600 * 24))
  
  // 超过 9 年视为永久
  if (days > 365 * 9) {
    return '永久'
  }

  const hours = Math.floor((duration % (3600 * 24)) / 3600)
  return `${days}天${hours}小时`
}
