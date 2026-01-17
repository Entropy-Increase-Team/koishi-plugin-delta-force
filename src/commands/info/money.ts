import { Context } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

/**
 * 注册货币查询相关命令
 */
export function registerMoneyCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 货币查询
  ctx.command('df.money', '查看货币信息')
    .alias('df.货币')
    .alias('df.余额')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      try {
        const res = await api.getMoney(token)

        if (await handleApiError(res, session)) return

        if (!res.data) {
          return '获取货币信息失败，API 未返回有效数据'
        }

        let msg = '【三角洲行动 - 货币信息】\n'
        msg += '━━━━━━━━━━━━━━━\n'

        if (Array.isArray(res.data) && res.data.length > 0) {
          interface MoneyItem {
            name: string
            totalMoney: number | string
          }
          (res.data as MoneyItem[]).forEach((item) => {
            const amount = typeof item.totalMoney === 'number' 
              ? item.totalMoney.toLocaleString() 
              : item.totalMoney
            msg += `${item.name}: ${amount}\n`
          })
        } else {
          msg += '未查询到任何货币信息'
        }

        return msg.trim()
      } catch (error) {
        logger.error('查询货币信息失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}
