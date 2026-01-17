import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'
import { Renderer } from '../../render'

// URL 解码函数 (与云崽版保持一致)
function decode(str: string | undefined): string {
  try {
    return decodeURIComponent(str || '')
  } catch {
    return str || ''
  }
}

export function registerInfoCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
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

        if (!res.data || !res.roleInfo || !res.data.careerData) {
          return '查询失败: API 返回数据格式不正确'
        }

        const { userData, careerData } = res.data
        const { roleInfo } = res

        // 数据提取与格式化 (与云崽版保持一致)
        const nickName = decode((userData as { charac_name?: string })?.charac_name || roleInfo.charac_name) || '未知'
        
        // 处理头像 URL (与云崽版保持一致)
        let picUrl = decode((userData as { picurl?: string })?.picurl || roleInfo.picurl)
        if (picUrl && /^[0-9]+$/.test(picUrl)) {
          picUrl = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${picUrl}.webp`
        }

        const isBanUser = roleInfo.isbanuser === '1' ? '封禁' : '正常'
        const isBanSpeak = roleInfo.isbanspeak === '1' ? '禁言' : '正常'
        const isAdult = roleInfo.adultstatus === '0' ? '已成年' : '未成年'

        // 计算资产
        const propCapital = parseFloat(String(roleInfo.propcapital)) || 0
        const hafcoinNum = parseFloat(String(roleInfo.hafcoinnum)) || 0
        const totalAssets = (propCapital + hafcoinNum) / 1000000

        // 格式化时间
        const registerTime = formatDate(roleInfo.register_time)
        const lastLoginTime = formatDate(roleInfo.lastlogintime)

        // 段位信息处理 (与云崽版保持一致)
        const solRank = careerData.rankpoint ? dataManager.getRankByScore(careerData.rankpoint, 'sol') : '-'
        const tdmRank = careerData.tdmrankpoint ? dataManager.getRankByScore(careerData.tdmrankpoint, 'tdm') : '-'

        // 获取段位图片路径
        const solRankImage = dataManager.getRankImage(careerData.rankpoint || 0, 'sol')
        const tdmRankImage = dataManager.getRankImage(careerData.tdmrankpoint || 0, 'tdm')

        // 移除分数部分，保留完整段位名称
        const solRankName = solRank.replace(/\s*\(\d+\)/, '')
        const tdmRankName = tdmRank.replace(/\s*\(\d+\)/, '')

        // 构建渲染数据 (与云崽版保持一致)
        const qqAvatarUrl = `http://q.qlogo.cn/headimg_dl?dst_uin=${session.userId}&spec=640&img_type=jpg`
        const templateData = {
          // 背景和基础信息
          backgroundImage: dataManager.getRandomBackground(),
          userName: nickName,
          userAvatar: picUrl,
          userId: session.userId,
          qqAvatarUrl: qqAvatarUrl,
          registerTime,
          lastLoginTime,
          accountStatus: `账号封禁: ${isBanUser} | 禁言: ${isBanSpeak} | 防沉迷: ${isAdult}`,

          // 烽火地带信息
          solLevel: roleInfo.level || '-',
          solRankName: solRankName,
          solRankImage: solRankImage,
          solTotalFight: careerData.soltotalfght || '-',
          solTotalEscape: careerData.solttotalescape || '-',
          solEscapeRatio: careerData.solescaperatio || '-',
          solTotalKill: careerData.soltotalkill || '-',
          solDuration: formatDuration(careerData.solduration, 'seconds'),

          // 全面战场信息
          tdmLevel: roleInfo.tdmlevel || '-',
          tdmRankName: tdmRankName,
          tdmRankImage: tdmRankImage,
          tdmTotalFight: careerData.tdmtotalfight || '-',
          tdmTotalWin: careerData.totalwin || '-',
          tdmWinRatio: careerData.tdmsuccessratio || '-',
          tdmTotalKill: careerData.tdmtotalkill || '-',
          tdmDuration: formatDuration(careerData.tdmduration, 'minutes'),

          // 资产信息
          hafCoin: roleInfo.hafcoinnum?.toLocaleString() || '-',
          totalAssets: totalAssets > 0 ? totalAssets.toFixed(2) + 'M' : '-',
        }

        return renderer.renderToMessage('userInfo', templateData)
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

// 格式化时间戳 (与云崽版保持一致)
function formatDate(timestamp: number): string {
  if (!timestamp) return '未知'

  // 尝试转换为数字
  let ts = Number(timestamp)
  if (isNaN(ts)) return '未知'

  // 判断是秒还是毫秒时间戳（大于 10^12 认为是毫秒）
  if (ts < 10000000000) {
    ts = ts * 1000 // 秒转毫秒
  }

  try {
    const date = new Date(ts)
    if (isNaN(date.getTime())) return '未知'

    // 格式化为 MM/DD/YYYY, H:MM:SS AM/PM 格式
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    // 12小时制
    const hour12 = hours % 12 || 12
    const ampm = hours >= 12 ? 'PM' : 'AM'

    return `${month}/${day}/${year}, ${hour12}:${minutes}:${seconds} ${ampm}`
  } catch {
    return '未知'
  }
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
