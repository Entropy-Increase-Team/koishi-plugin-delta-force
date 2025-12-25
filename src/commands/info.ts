import { Context } from 'koishi'
import { ApiService } from '../api'
import { getActiveToken } from '../database'
import { handleApiError } from '../utils'

export function registerInfoCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.info', '查看个人信息')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询个人信息...')

      try {
        const res = await api.getPersonalInfo(token)
        
        if (await handleApiError(res, session)) return

        const { roleInfo, careerData } = res.data

        return `个人信息
━━━━━━━━━━━━━━━
昵称: ${roleInfo.charac_name}
UID: ${roleInfo.uid}
烽火等级: ${roleInfo.level}
全面战场等级: ${roleInfo.tdmlevel}
━━━━━━━━━━━━━━━
烽火地带:
  总场次: ${careerData.soltotalfght || 0}
  总击杀: ${careerData.soltotalkill || 0}
  逃生率: ${careerData.solescaperatio || '0%'}
━━━━━━━━━━━━━━━
全面战场:
  总场次: ${careerData.tdmtotalfight || 0}
  总击杀: ${careerData.tdmtotalkill || 0}
  胜率: ${careerData.tdmsuccessratio || '0%'}`
      } catch (error) {
        logger.error('查询信息失败:', error)
        return `查询失败: ${error.message}`
      }
    })
}
