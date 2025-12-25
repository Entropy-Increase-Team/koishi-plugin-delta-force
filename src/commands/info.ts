import { Context } from 'koishi'
import { ApiService } from '../api'
import { DataManager } from '../data'
import { getActiveToken } from '../database'
import { handleApiError } from '../utils'

export function registerInfoCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  // 个人信息查询
  ctx.command('df.info', '查看个人信息')
    .alias('df.信息')
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

        if (!res.data || !res.data.careerData || !res.roleInfo) {
          return '查询失败: API 返回数据格式不正确'
        }

        const { userData, careerData } = res.data
        const { roleInfo } = res

        // 数据提取与格式化
        const nickName = decodeURIComponent((userData as { charac_name?: string })?.charac_name || roleInfo.charac_name || '未知')
        const uid = roleInfo.uid || '未知'
        const isBanUser = roleInfo.isbanuser === '1' ? '封禁' : '正常'
        const isBanSpeak = roleInfo.isbanspeak === '1' ? '禁言' : '正常'
        const isAdult = roleInfo.adultstatus === '0' ? '已成年' : '未成年'

        // 计算资产
        const propCapital = Number(roleInfo.propcapital) || 0
        const hafcoinNum = Number(roleInfo.hafcoinnum) || 0
        const totalAssets = ((propCapital + hafcoinNum) / 1000000).toFixed(2)

        // 格式化时间
        const registerTime = formatDate(roleInfo.register_time)
        const lastLoginTime = formatDate(roleInfo.lastlogintime)

        // 构建消息
        let message = '【个人信息】\n'
        message += '━━━━━━━━━━━━━━━\n'
        message += `昵称: ${nickName}\n`
        message += `UID: ${uid}\n`
        message += `注册时间: ${registerTime}\n`
        message += `最后登录: ${lastLoginTime}\n`
        message += `账号状态: ${isBanUser} | 禁言: ${isBanSpeak}\n`
        message += `防沉迷: ${isAdult}\n`
        message += `━━━━━━━━━━━━━━━\n`
        message += `【烽火地带】\n`
        message += `等级: ${roleInfo.level || '-'}\n`
        
        if (careerData.rankpoint) {
          message += `段位分数: ${careerData.rankpoint}\n`
        }
        
        message += `总场次: ${careerData.soltotalfght || 0}\n`
        message += `撤离次数: ${careerData.solttotalescape || 0}\n`
        message += `撤离率: ${careerData.solescaperatio || '0%'}\n`
        message += `总击杀: ${careerData.soltotalkill || 0}\n`
        message += `游戏时长: ${formatDuration(careerData.solduration, 'seconds')}\n`
        message += `━━━━━━━━━━━━━━━\n`
        message += `【全面战场】\n`
        message += `等级: ${roleInfo.tdmlevel || '-'}\n`
        
        if (careerData.tdmrankpoint) {
          message += `段位分数: ${careerData.tdmrankpoint}\n`
        }
        
        message += `总场次: ${careerData.tdmtotalfight || 0}\n`
        message += `胜利次数: ${careerData.totalwin || 0}\n`
        message += `胜率: ${careerData.tdmsuccessratio || '0%'}\n`
        message += `总击杀: ${careerData.tdmtotalkill || 0}\n`
        message += `游戏时长: ${formatDuration(careerData.tdmduration, 'minutes')}\n`
        message += `━━━━━━━━━━━━━━━\n`
        message += `【资产】\n`
        message += `烽火币: ${hafcoinNum.toLocaleString()}\n`
        message += `总资产: ${totalAssets}M`

        return message
      } catch (error) {
        logger.error('查询信息失败:', error)
        return `查询失败: ${(error as Error).message}\n\n请检查：\n1. 账号是否已登录或过期\n2. 是否已绑定游戏角色\n3. 网络连接是否正常`
      }
    })

  // UID 查询
  ctx.command('df.uid', '查看 UID')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未绑定账号，请使用 df.login 进行绑定。'
      }

      try {
        const res = await api.getPersonalInfo(token)

        if (await handleApiError(res, session)) return

        if (!res.roleInfo) {
          return '查询失败: API 返回数据格式不正确'
        }

        const { roleInfo } = res
        const nickName = roleInfo.charac_name || '未知'
        const uid = roleInfo.uid || '未获取到'

        return `昵称: ${nickName}\nUID: ${uid}`
      } catch (error) {
        logger.error('查询 UID 失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

// 格式化时间戳
function formatDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '未知'
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 格式化时长
function formatDuration(value: number, unit: 'seconds' | 'minutes' = 'seconds'): string {
  if (!value || isNaN(value)) return '未知'
  
  const numValue = Number(value)
  if (isNaN(numValue)) return '未知'

  let totalMinutes: number
  if (unit === 'seconds') {
    totalMinutes = Math.floor(numValue / 60)
  } else {
    totalMinutes = numValue
  }
  
  const h = Math.floor(totalMinutes / 60)
  const m = Math.floor(totalMinutes % 60)
  return `${h}小时${m}分钟`
}
