import { Context, h } from 'koishi'
import { Config } from '../config'
import { ApiService } from '../api'
import { getGroupActiveToken, setGroupActiveToken, getTokenGroup } from '../database'
import { sleep } from '../utils'

export function registerLoginCommands(
  ctx: Context,
  config: Config,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.login [平台:string]', '登录账号')
    .option('platform', '-p <platform:string> 登录平台（qq/wechat/wegame/qqsafe/wegame/wechat）', { fallback: 'qq' })
    .action(async ({ session, options }) => {
      let platform = options.platform || 'qq'
      const userId = session.userId
      const userPlatform = session.platform

      // 统一转为小写处理
      platform = platform.toLowerCase()

      // 处理各种登录平台的别名
      if (['wx', '微信'].includes(platform)) platform = 'wechat'
      if (['安全中心', 'qq安全中心'].includes(platform)) platform = 'qqsafe'
      if (['wegame微信', '微信wegame'].includes(platform)) platform = 'wegame/wechat'

      // 验证平台是否有效
      const validPlatforms = ['qq', 'wechat', 'wegame', 'qqsafe', 'wegame/wechat']
      if (!validPlatforms.includes(platform)) {
        return `不支持的平台: ${platform}\n支持的登录平台: qq, wechat, wegame, qqsafe, wegame/wechat`
      }

      // 记录原始平台类型，用于后续判断是否进行角色绑定
      const originalPlatform = platform

      await session.send('正在获取登录二维码，请稍候...')

      try {
        // 1. 获取二维码
        const qrRes = await api.getLoginQr(platform)

        if (!qrRes || qrRes.code !== 0 || !qrRes.qr_image) {
          const errorMsg = qrRes?.msg || qrRes?.message || '获取二维码失败，请稍后重试'
          logger.error(`获取${platform}登录二维码失败:`, errorMsg)
          return `获取二维码失败: ${errorMsg}`
        }

        const frameworkToken = qrRes.token || qrRes.frameworkToken
        if (!frameworkToken) {
          return '获取登录凭证失败，请稍后重试'
        }

        let qrImage = qrRes.qr_image

        if (platform === 'wechat') {
          // 微信的二维码是 URL，直接使用
          if (!qrImage.startsWith('http')) {
            // 如果返回的不是 URL，可能是其他格式，尝试按 base64 处理
            if (qrImage.startsWith('data:image/png;base64,')) {
              qrImage = qrImage.replace(/^data:image\/png;base64,/, '')
            }
          }
        } else {
          // 其他平台去除 base64 前缀
          if (qrImage.startsWith('data:image/png;base64,')) {
            qrImage = qrImage.replace(/^data:image\/png;base64,/, '')
          }
        }

        // 根据不同平台生成专属的登录提示
        let platformName: string
        switch (platform) {
          case 'qq':
            platformName = 'QQ'
            break
          case 'wechat':
            platformName = '微信'
            break
          case 'wegame':
            platformName = 'WeGame（使用QQ扫描）'
            break
          case 'wegame/wechat':
            platformName = 'WeGame（使用微信扫描）'
            break
          case 'qqsafe':
            platformName = 'QQ安全中心'
            break
          default:
            platformName = platform.toUpperCase()
        }

        // 构建图片元素（根据 qrImage 类型）
        let imageElement
        if (qrImage.startsWith('http')) {
          // URL 形式（微信）
          imageElement = h('image', { url: qrImage })
        } else {
          // base64 形式（其他平台）
          imageElement = h('image', { url: `data:image/png;base64,${qrImage}` })
        }

        await session.send(h('message', [
          h('text', `请使用【${platformName}】扫描二维码登录\n有效期约2分钟\n`),
          imageElement,
        ]))

        // 2. 轮询登录状态
        const startTime = Date.now()
        const timeout = 180000
        let notifiedScanned = false

        while (Date.now() - startTime < timeout) {
          await sleep(2000)

          const statusRes = await api.getLoginStatus(platform, frameworkToken)

          if (statusRes.code === 0) {
            // 登录成功
            const finalToken = (statusRes as { token?: string; frameworkToken?: string }).token || 
                             (statusRes as { token?: string; frameworkToken?: string }).frameworkToken || 
                             frameworkToken

            logger.info(`[delta-force] ${platform}登录成功，获取到token: ${finalToken.substring(0, 4)}****`)

            // 3. 绑定用户到后端
            const bindRes = await api.bindUser({
              platformID: userId,
              frameworkToken: finalToken,
              clientID: config.clientID,
              clientType: 'koishi',
            })

            if (!bindRes || (bindRes.code !== 0 && !bindRes.success)) {
              return `登录失败: ${bindRes?.msg || bindRes?.message || '未知错误'}`
            }

            logger.info(`[delta-force] 用户绑定成功`)

            // 4. 获取用户账号列表（从 API）
            const listRes = await api.getUserList(userId, config.clientID)

            if (!listRes || listRes.code !== 0 || !listRes.data) {
              await session.send('获取账号列表失败，无法为您自动激活。请手动切换。')
              return
            }

            const newAccounts = listRes.data
            const newlyBoundAccount = newAccounts.find(a => a.frameworkToken === finalToken)

            if (!newlyBoundAccount) {
              await session.send('绑定成功，但未能从账号列表中确认，请手动切换。')
              return
            }

            logger.info(`[delta-force] 找到新绑定账号，类型: ${newlyBoundAccount.tokenType}`)

            // 5. 确定新账号所属分组
            const newAccountType = newlyBoundAccount.tokenType.toLowerCase()
            const newAccountGroupKey = getTokenGroup(newAccountType)
            
            // 6. 判断是否应该激活新账号
            let shouldActivateNewToken = false
            
            // 获取该分组当前的激活 token
            const oldActiveToken = await getGroupActiveToken(ctx, userId, userPlatform, newAccountGroupKey)
            
            if (!oldActiveToken) {
              // Case 1: 该分组没有激活账号，直接激活新账号
              shouldActivateNewToken = true
              logger.info(`[delta-force] 分组 ${newAccountGroupKey} 无激活账号，激活新账号`)
            } else {
              // Case 2: 该分组已有激活账号，查找该账号信息
              const oldActiveAccount = newAccounts.find(acc => acc.frameworkToken === oldActiveToken)
              
              if (!oldActiveAccount) {
                // 原激活账号已失效或已被删除，激活新账号
                shouldActivateNewToken = true
                logger.info(`[delta-force] 分组 ${newAccountGroupKey} 原激活账号已失效，激活新账号`)
              } else {
                // 获取原账号的类型分组
                const oldAccountType = oldActiveAccount.tokenType.toLowerCase()
                const oldAccountGroupKey = getTokenGroup(oldAccountType)
                
                // 只有在同一分组内才更新激活账号
                if (oldAccountGroupKey === newAccountGroupKey) {
                  shouldActivateNewToken = true
                  logger.info(`[delta-force] 在同一分组(${newAccountGroupKey})内更新激活账号`)
                } else {
                  logger.info(`[delta-force] 不同分组账号(${oldAccountGroupKey}->${newAccountGroupKey})，保持原激活账号不变`)
                }
              }
            }

            // 7. 激活新账号
            if (shouldActivateNewToken) {
              await setGroupActiveToken(ctx, userId, userPlatform, newAccountGroupKey, finalToken)
              logger.info(`[delta-force] 已激活${newAccountGroupKey}分组新账号: ${finalToken.substring(0, 4)}****${finalToken.slice(-4)}`)
            } else {
              logger.info(`[delta-force] 保持原激活账号不变: ${oldActiveToken.substring(0, 4)}****${oldActiveToken.slice(-4)}`)
            }

            // 8. 自动绑定角色（仅 QQ 和微信）
            if (['qq', 'wechat'].includes(originalPlatform)) {
              const characterBindRes = await api.bindCharacter(finalToken)
              
              if (characterBindRes && characterBindRes.success && characterBindRes.roleInfo) {
                const { charac_name, level, tdmlevel, adultstatus } = characterBindRes.roleInfo
                const isAdult = adultstatus === '0' ? '否' : '是'
                
                let charMsg = '登录绑定成功并角色信息已获取！\n'
                charMsg += '--- 角色信息 ---\n'
                charMsg += `昵称: ${charac_name}\n`
                charMsg += `烽火地带等级: ${level}\n`
                charMsg += `全面战场等级: ${tdmlevel}\n`
                charMsg += `防沉迷: ${isAdult}`
                
                return charMsg
              } else {
                const apiMsg = characterBindRes?.msg || characterBindRes?.message || '未知错误'
                return `登录成功！\n自动绑定角色失败: ${apiMsg}。\n您可以稍后使用 df.bind 手动绑定。`
              }
            } else {
              return '登录成功！'
            }
          } else if (statusRes.code === 2) {
            if (!notifiedScanned) {
              notifiedScanned = true
              await session.send('二维码已扫描，请在手机上确认登录')
            }
          } else if (statusRes.code === -2) {
            return '二维码已过期，请重新登录'
          }
        }

        return '登录超时，请重新尝试'
      } catch (error) {
        logger.error('登录失败:', error)
        return `登录失败: ${(error as Error).message}`
      }
    })
  
  // 角色绑定指令
  ctx.command('df.bind [token:string]', '绑定游戏角色')
    .action(async ({ session }, token) => {
      const userId = session.userId
      const userPlatform = session.platform

      // 如果没有提供 token，使用当前激活的 token
      if (!token) {
        const { getActiveToken } = await import('../database')
        token = await getActiveToken(ctx, userId, userPlatform)
      }

      if (!token) {
        return '您尚未登录或激活任何账号，请先使用 df.login 登录，或提供一个有效的Token。'
      }

      await session.send('正在为您绑定游戏内角色，请稍候...')

      try {
        const res = await api.bindCharacter(token)
        
        if (res && res.success && res.roleInfo) {
          const { charac_name, level, tdmlevel, adultstatus } = res.roleInfo
          const isAdult = adultstatus === '0' ? '否' : '是'

          let msg = '角色绑定成功！\n'
          msg += '--- 角色信息 ---\n'
          msg += `昵称: ${charac_name}\n`
          msg += `烽火地带等级: ${level}\n`
          msg += `全面战场等级: ${tdmlevel}\n`
          msg += `防沉迷: ${isAdult}`
          
          return msg
        } else {
          const apiMsg = res?.msg || res?.message || '未知错误'
          return `角色绑定失败: ${apiMsg}`
        }
      } catch (error) {
        logger.error('角色绑定失败:', error)
        return `角色绑定失败: ${(error as Error).message}`
      }
    })
}
