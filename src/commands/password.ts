import { Context } from 'koishi'
import { ApiService } from '../api'
import { handleApiError } from '../utils'

interface DailyKeywordItem {
  mapName: string
  secret: string
}

interface DailyKeywordData {
  list: DailyKeywordItem[]
}

export function registerPasswordCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.password', '查看每日密码')
    .alias('df.密码')
    .action(async ({ session }) => {
      try {
        const res = await api.getDailyKeyword()
        
        if (await handleApiError(res, session)) return

        const data = res.data as DailyKeywordData | undefined
        
        if (data && data.list && data.list.length > 0) {
          let message = '【每日密码】\n'
          data.list.forEach(item => {
            message += `【${item.mapName}】: ${item.secret}\n`
          })
          return message.trim()
        }

        return `获取每日密码失败: ${res.msg || res.message || '暂无数据'}`
      } catch (error) {
        logger.error('查询每日密码失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}
