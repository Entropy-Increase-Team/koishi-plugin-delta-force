import { Context, h } from 'koishi'
import { Config } from './config'
import { ApiService } from './api'
import { DataManager } from './data'
import { extendDatabase, getActiveToken, setActiveToken, getUserTokens, deleteUserToken } from './database'
import { handleApiError, sleep, formatDuration } from './utils'

export const name = 'delta-force'
export { Config } from './config'

export const inject = {
  required: ['http', 'database'],
  optional: ['puppeteer', 'cron'],
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('delta-force')
  
  logger.info('三角洲行动插件正在加载...')

  // 扩展数据库
  extendDatabase(ctx)

  // 初始化 API 服务
  const api = new ApiService(ctx, config)
  
  // 初始化数据管理器
  const dataManager = new DataManager(ctx, api)
  
  // 异步初始化数据
  dataManager.init().catch(err => {
    logger.warn('数据管理器初始化失败:', err)
  })

  // 主指令
  const df = ctx.command('df', '三角洲行动')
    .alias('三角洲')

  // 帮助指令
  df.subcommand('.help', '查看帮助')
    .action(async () => {
      return `三角洲行动插件

可用指令：
• df.login - 登录账号
• df.info - 查看个人信息
• df.daily [类型] - 查看日报（sol/mp）
• df.weekly [类型] - 查看周报（sol/mp）
• df.record [类型] [页码] - 查看战绩（sol/mp）
• df.account - 账号管理
• df.password - 查看每日密码

更多功能开发中...`
    })

  // 登录指令
  df.subcommand('.login [平台:string]', '登录账号')
    .option('platform', '-p <platform:string> 登录平台（qq/wechat）', { fallback: 'qq' })
    .action(async ({ session, options }) => {
      const platform = options.platform || 'qq'
      const userId = session.userId
      const userPlatform = session.platform

      await session.send('正在获取登录二维码，请稍候...')

      try {
        // 获取二维码
        const qrRes = await api.getLoginQr(platform)
        
        if (qrRes.code !== 0 || !qrRes.qr_image) {
          return '获取二维码失败，请稍后重试'
        }

        const frameworkToken = qrRes.token || qrRes.frameworkToken
        let qrImage = qrRes.qr_image

        // 处理二维码图片
        if (platform !== 'wechat' && qrImage.startsWith('data:image/png;base64,')) {
          qrImage = qrImage.replace(/^data:image\/png;base64,/, '')
        }

        // 发送二维码
        await session.send(h('message', [
          h('text', `请使用${platform === 'qq' ? 'QQ' : '微信'}扫描二维码登录\n有效期约2分钟\n`),
          h('image', { url: `data:image/png;base64,${qrImage}` }),
        ]))

        // 轮询登录状态
        const startTime = Date.now()
        const timeout = 180000 // 3分钟超时
        let notifiedScanned = false

        while (Date.now() - startTime < timeout) {
          await sleep(2000) // 每2秒轮询一次

          const statusRes = await api.getLoginStatus(platform, frameworkToken)

          if (statusRes.code === 0) {
            // 登录成功
            const finalToken = (statusRes as any).token || (statusRes as any).frameworkToken || frameworkToken

            // 绑定用户
            await api.bindUser({
              platformID: userId,
              frameworkToken: finalToken,
              clientID: config.clientID,
              clientType: userPlatform,
            })

            // 保存到数据库
            await setActiveToken(ctx, userId, userPlatform, finalToken)

            // 尝试绑定角色
            if (platform === 'qq' || platform === 'wechat') {
              const bindRes = await api.bindCharacter(finalToken)
              if (bindRes.success && bindRes.roleInfo) {
                const { charac_name, level, tdmlevel } = bindRes.roleInfo
                return `登录成功！\n角色: ${charac_name}\n烽火等级: ${level}\n全面战场等级: ${tdmlevel}`
              }
            }

            return '登录成功！'
          } else if (statusRes.code === 2) {
            // 已扫码待确认
            if (!notifiedScanned) {
              notifiedScanned = true
              await session.send('二维码已扫描，请在手机上确认登录')
            }
          } else if (statusRes.code === -2) {
            // 二维码过期
            return '二维码已过期，请重新登录'
          }
        }

        return '登录超时，请重新尝试'
      } catch (error) {
        logger.error('登录失败:', error)
        return `登录失败: ${error.message}`
      }
    })

  // 信息查询指令
  df.subcommand('.info', '查看个人信息')
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

  // 日报指令
  df.subcommand('.daily [类型:string]', '查看日报')
    .action(async ({ session }, type = 'sol') => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询日报数据...')

      try {
        const res = await api.getDailyReport(token, type)
        
        if (await handleApiError(res, session)) return

        // TODO: 格式化日报数据
        return '日报功能开发中...'
      } catch (error) {
        logger.error('查询日报失败:', error)
        return `查询失败: ${error.message}`
      }
    })

  // 周报指令
  df.subcommand('.weekly [类型:string]', '查看周报')
    .action(async ({ session }, type = 'sol') => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询周报数据...')

      try {
        const res = await api.getWeeklyReport(token, type)
        
        if (await handleApiError(res, session)) return

        // TODO: 格式化周报数据
        return '周报功能开发中...'
      } catch (error) {
        logger.error('查询周报失败:', error)
        return `查询失败: ${error.message}`
      }
    })

  // 每日密码指令
  df.subcommand('.password', '查看每日密码')
    .alias('密码')
    .action(async ({ session }) => {
      try {
        const res = await api.getDailyKeyword()
        
        if (await handleApiError(res, session)) return

        if (res.data && res.data.keyword) {
          return `今日密码: ${res.data.keyword}`
        }

        return '暂无每日密码'
      } catch (error) {
        logger.error('查询每日密码失败:', error)
        return `查询失败: ${error.message}`
      }
    })

  // 战绩查询指令
  df.subcommand('.record [类型:string] [页码:number]', '查看战绩')
    .action(async ({ session }, type = 'sol', page = 1) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      const modeName = type === 'sol' ? '烽火地带' : '全面战场'
      await session.send(`正在查询 ${modeName} 的战绩 (第${page}页)，请稍候...`)

      try {
        const res = await api.getRecordList(token, type, page)
        
        if (await handleApiError(res, session)) return

        if (!res.data || !Array.isArray(res.data) || res.data.length === 0) {
          return `您在 ${modeName} (第${page}页) 没有更多战绩记录`
        }

        const records = res.data
        let message = `【${modeName}战绩 - 第${page}页】\n\n`

        if (type === 'sol') {
          // 烽火地带战绩
          const escapeReason: Record<string, string> = {
            '1': '撤离成功',
            '2': '被玩家击杀',
            '3': '被人机击杀'
          }

          records.forEach((r: any, i: number) => {
            const recordNum = (page - 1) * records.length + i + 1
            const mapName = dataManager.getMapName(r.MapId)
            const operator = dataManager.getOperatorName(r.ArmedForceId)
            const status = escapeReason[r.EscapeFailReason] || '撤离失败'
            const duration = formatDuration(r.DurationS)
            const value = Number(r.FinalPrice).toLocaleString()

            message += `#${recordNum}: ${r.dtEventTime}\n`
            message += `地图: ${mapName} | 干员: ${operator}\n`
            message += `状态: ${status} | 存活: ${duration}\n`
            message += `带出价值: ${value}\n`
            message += `击杀: 干员(${r.KillCount || 0}) / AI玩家(${r.KillPlayerAICount || 0}) / 其他AI(${r.KillAICount || 0})\n\n`
          })
        } else {
          // 全面战场战绩
          const mpResult: Record<string, string> = {
            '1': '胜利',
            '2': '失败',
            '3': '中途退出'
          }

          records.forEach((r: any, i: number) => {
            const recordNum = (page - 1) * records.length + i + 1
            const mapName = dataManager.getMapName(r.MapID)
            const operator = dataManager.getOperatorName(r.ArmedForceId)
            const result = mpResult[r.MatchResult] || '未知结果'
            const duration = formatDuration(r.gametime)

            message += `#${recordNum}: ${r.dtEventTime}\n`
            message += `地图: ${mapName} | 干员: ${operator}\n`
            message += `结果: ${result} | K/D/A: ${r.KillNum}/${r.Death}/${r.Assist}\n`
            message += `得分: ${r.TotalScore.toLocaleString()} | 时长: ${duration}\n`
            message += `救援: ${r.RescueTeammateCount}\n\n`
          })
        }

        return message.trim()
      } catch (error) {
        logger.error('查询战绩失败:', error)
        return `查询失败: ${error.message}`
      }
    })

  // 账号管理指令
  df.subcommand('.account', '账号管理')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      try {
        // 获取用户绑定的所有 token
        const tokens = await getUserTokens(ctx, userId, platform)

        if (tokens.length === 0) {
          return '您尚未绑定任何账号，请使用 df.login 登录'
        }

        const activeToken = await getActiveToken(ctx, userId, platform)

        let message = '【账号列表】\n\n'
        tokens.forEach((token, index) => {
          const isActive = token.frameworkToken === activeToken ? '✅ ' : ''
          const maskedToken = `${token.frameworkToken.substring(0, 4)}****${token.frameworkToken.slice(-4)}`
          const status = token.isActive ? '有效' : '失效'
          
          message += `${index + 1}. ${isActive}[${token.tokenType.toUpperCase()}] ${maskedToken} (${status})\n`
        })

        message += '\n使用 df.switch <序号> 切换账号'
        message += '\n使用 df.unbind <序号> 解绑账号'

        return message
      } catch (error) {
        logger.error('查询账号列表失败:', error)
        return `查询失败: ${error.message}`
      }
    })

  // 切换账号指令
  df.subcommand('.switch <序号:number>', '切换账号')
    .action(async ({ session }, index) => {
      const userId = session.userId
      const platform = session.platform

      try {
        const tokens = await getUserTokens(ctx, userId, platform)

        if (index < 1 || index > tokens.length) {
          return '序号无效，请使用 df.account 查看账号列表'
        }

        const targetToken = tokens[index - 1]
        await setActiveToken(ctx, userId, platform, targetToken.frameworkToken)

        const maskedToken = `${targetToken.frameworkToken.substring(0, 4)}****${targetToken.frameworkToken.slice(-4)}`
        return `账号切换成功！\n当前使用: [${targetToken.tokenType.toUpperCase()}] ${maskedToken}`
      } catch (error) {
        logger.error('切换账号失败:', error)
        return `切换失败: ${error.message}`
      }
    })

  // 解绑账号指令
  df.subcommand('.unbind <序号:number>', '解绑账号')
    .action(async ({ session }, index) => {
      const userId = session.userId
      const platform = session.platform

      try {
        const tokens = await getUserTokens(ctx, userId, platform)

        if (index < 1 || index > tokens.length) {
          return '序号无效，请使用 df.account 查看账号列表'
        }

        const targetToken = tokens[index - 1]
        
        // 调用 API 解绑
        const res = await api.bindUser({
          platformID: userId,
          frameworkToken: targetToken.frameworkToken,
          clientID: config.clientID,
          clientType: platform,
        })

        // 删除数据库记录
        await deleteUserToken(ctx, userId, platform, targetToken.frameworkToken)

        // 如果解绑的是当前激活账号，清除激活状态
        const activeToken = await getActiveToken(ctx, userId, platform)
        if (activeToken === targetToken.frameworkToken) {
          await setActiveToken(ctx, userId, platform, null)
        }

        return '账号解绑成功！'
      } catch (error) {
        logger.error('解绑账号失败:', error)
        return `解绑失败: ${error.message}`
      }
    })

  logger.info('三角洲行动插件加载完成')
}
