import { Context, h } from 'koishi'
import { Config } from '../../config'
import { ApiService } from '../../api'
import { getGroupActiveToken, setGroupActiveToken, getTokenGroup } from '../../database'
import { sleep } from '../../utils'

export function registerLoginCommands(
  ctx: Context,
  config: Config,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.login [平台:string]', '登录账号')
    .alias('df.登录')
    .action(async ({ session, options }, platform) => {
      platform = platform || 'qq'
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

      // 记录需要撤回的消息ID（分两组）
      const qrMessages: string[] = []       // 二维码相关消息（提示+图片）
      const scannedMessages: string[] = []  // 已扫描提示消息

      const loadingMsgIds = await session.send('正在获取登录二维码，请稍候...')
      if (loadingMsgIds) qrMessages.push(...loadingMsgIds)

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

        // 构建图片元素（根据 qrImage 类型）
        // 使用 h.image() 快捷方法，确保 OneBot 等协议兼容
        let imageElement
        if (qrImage.startsWith('http')) {
          // URL 形式（微信）
          imageElement = h.image(qrImage)
        } else {
          // base64 形式（其他平台）- 使用 data: URL
          imageElement = h.image(`data:image/png;base64,${qrImage}`)
        }

        // 根据不同平台生成专属的登录提示（与云崽版保持一致）
        let loginTips: string
        switch (platform) {
          case 'qq':
            // QQ登录 - 强调长按识别登录QQ账号
            loginTips = `请使用【QQ】长按识别二维码登录QQ账号，有效期约2分钟。\n\n【免责声明】\n您将通过扫码授权本插件后端服务器获取您的游戏数据。\n扫码仅用于获取小程序数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。\n其他登陆方式请发送 ^帮助 查看菜单`
            break
          case 'qqsafe':
            // QQ安全中心登录 - 强调登录QQ安全中心
            loginTips = `请使用【QQ】长按识别二维码登录QQ安全中心账号，有效期约2分钟。\n\n【免责声明】\n您将通过扫码授权本插件后端服务器获取您的游戏数据。\n扫码仅用于获取小程序数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。\n其他登陆方式请发送 ^帮助 查看菜单`
            break
          case 'wechat':
            // 微信登录 - 强调使用微信扫描
            loginTips = `请使用【微信】扫描二维码登录微信账号，有效期约2分钟。\n\n【免责声明】\n您将通过扫码授权本插件后端服务器获取您的游戏数据。\n扫码仅用于获取小程序数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。\n如果无法扫码，请尝试使用其他方法登陆。`
            break
          case 'wegame':
            // WeGame登录 - 强调使用QQ扫描登录WeGame
            loginTips = `请使用【QQ】扫描二维码登录WeGame账号，有效期约2分钟。\n\n【免责声明】\n您将通过扫码授权本插件后端服务器获取您的游戏数据。\n扫码仅用于获取小程序数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。\n如果无法扫码，请尝试使用其他方法登陆。`
            break
          case 'wegame/wechat':
            // WeGame微信登录 - 强调使用微信扫描登录WeGame
            loginTips = `请使用【微信】扫描二维码登录WeGame账号，有效期约2分钟。\n\n【免责声明】\n您将通过扫码授权本插件后端服务器获取您的游戏数据。\n扫码仅用于获取小程序数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。\n如果无法扫码，请尝试使用其他方法登陆。`
            break
          default:
            // 其他未知平台 - 使用通用提示
            loginTips = `请扫描二维码登录${platform.toUpperCase()}账号，有效期约2分钟。\n\n【免责声明】\n您将通过扫码授权本插件后端服务器获取您的游戏数据。\n扫码仅用于获取小程序数据，不涉及登录游戏，如果出现盗号等问题与我方完全无关。\n如果无法扫码，请尝试使用其他方法登陆。`
            break
        }

        // 发送提示文本
        const tipsMsgIds = await session.send(loginTips)
        if (tipsMsgIds) qrMessages.push(...tipsMsgIds)
        // 单独发送图片，避免混合消息在某些平台上的兼容性问题
        const qrMsgIds = await session.send(imageElement)
        if (qrMsgIds) qrMessages.push(...qrMsgIds)

        // 撤回消息的辅助函数
        const deleteQrMessages = async () => {
          for (const msgId of qrMessages) {
            try {
              await session.bot.deleteMessage(session.channelId, msgId)
            } catch {}
          }
        }
        const deleteScannedMessages = async () => {
          for (const msgId of scannedMessages) {
            try {
              await session.bot.deleteMessage(session.channelId, msgId)
            } catch {}
          }
        }

        // 2. 轮询登录状态
        const startTime = Date.now()
        const timeout = 180000
        let notifiedScanned = false

        while (Date.now() - startTime < timeout) {
          await sleep(2000)

          const statusRes = await api.getLoginStatus(platform, frameworkToken)

          if (statusRes.code === 0) {
            // 登录成功，撤回已扫描提示
            await deleteScannedMessages()

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
              // 已扫描，撤回二维码和提示消息
              await deleteQrMessages()
              const scannedMsgIds = await session.send('二维码已扫描，请在手机上确认登录')
              if (scannedMsgIds) scannedMessages.push(...scannedMsgIds)
            }
          } else if (statusRes.code === -2) {
            await deleteQrMessages()
            await deleteScannedMessages()
            return '二维码已过期，请重新登录'
          }
        }

        await deleteQrMessages()
        await deleteScannedMessages()
        return '登录超时，请重新尝试'
      } catch (error) {
        logger.error('登录失败:', error)
        return `登录失败: ${(error as Error).message}`
      }
    })
  
  // 角色绑定指令（仅绑定游戏角色，不绑定用户）
  ctx.command('df.bind [token:string]', '绑定游戏角色')
    .alias('df.角色绑定')
    .action(async ({ session }, token) => {
      const userId = session.userId
      const userPlatform = session.platform

      // 如果没有提供 token，使用当前激活的 token
      if (!token) {
        const { getActiveToken } = await import('../../database')
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

  // CK登录（Cookie登录）
  ctx.command('df.cklogin [cookie:text]', 'Cookie登录')
    .alias('df.ck登录')
    .action(async ({ session }, cookie) => {
      const userId = session.userId
      const userPlatform = session.platform

      if (!cookie) {
        const helpMsg = [
          '三角洲CK登录教程：',
          '1. 准备via浏览器(或其他类似浏览器)，在浏览器中打开 https://pvp.qq.com/cp/a20161115tyf/page1.shtml',
          '2. 在网页中进行QQ登录',
          '3. 点击左上角的网页名左侧的盾图标',
          '4. 点击查看cookies，然后复制全部内容',
          '5. 返回聊天界面，私聊机器人，发送 df.cklogin 刚刚复制的cookies',
          '6. 成功登录'
        ].join('\n')
        return helpMsg
      }

      await session.send('正在尝试使用Cookie登录，请稍候...')

      try {
        const res = await api.loginWithCookie(cookie)

        if (!res || (res.code !== 0 && !res.success)) {
          return `Cookie登录失败: ${res?.msg || res?.message || '请检查Cookie是否有效'}`
        }

        const finalToken = (res as { frameworkToken?: string }).frameworkToken
        if (!finalToken) {
          return '未能获取到有效的Token'
        }

        // 绑定用户
        const bindRes = await api.bindUser({
          platformID: userId,
          frameworkToken: finalToken,
          clientID: config.clientID,
          clientType: 'koishi',
        })

        if (!bindRes || (bindRes.code !== 0 && !bindRes.success)) {
          return `登录失败: ${bindRes?.msg || bindRes?.message || '未知错误'}`
        }

        // 获取账号列表并激活
        const listRes = await api.getUserList(userId, config.clientID)
        if (listRes && listRes.code === 0 && listRes.data) {
          const newlyBoundAccount = listRes.data.find(a => a.frameworkToken === finalToken)
          if (newlyBoundAccount) {
            const newAccountGroupKey = getTokenGroup(newlyBoundAccount.tokenType)
            await setGroupActiveToken(ctx, userId, userPlatform, newAccountGroupKey, finalToken)
          }
        }

        // 自动绑定角色
        const characterBindRes = await api.bindCharacter(finalToken)
        if (characterBindRes && characterBindRes.success && characterBindRes.roleInfo) {
          const { charac_name, level, tdmlevel, adultstatus } = characterBindRes.roleInfo
          const isAdult = adultstatus === '0' ? '否' : '是'
          
          let charMsg = 'Cookie登录成功并角色信息已获取！\n'
          charMsg += '--- 角色信息 ---\n'
          charMsg += `昵称: ${charac_name}\n`
          charMsg += `烽火地带等级: ${level}\n`
          charMsg += `全面战场等级: ${tdmlevel}\n`
          charMsg += `防沉迷: ${isAdult}`
          
          return charMsg
        } else {
          return 'Cookie登录成功！\n自动绑定角色失败，您可以稍后使用 df.bind 手动绑定。'
        }
      } catch (error) {
        logger.error('Cookie登录失败:', error)
        return `Cookie登录失败: ${(error as Error).message}`
      }
    })

  // QQ OAuth授权登录
  ctx.command('df.qqoauth [authUrl:text]', 'QQ OAuth授权登录')
    .alias('df.qq授权登录')
    .action(async ({ session }, authUrl) => {
      const userId = session.userId
      const userPlatform = session.platform

      if (!authUrl) {
        // 没有提供授权链接，显示帮助信息
        try {
          const res = await api.getQqOAuthAuth(userId)
          
          if (!res || res.code !== 0) {
            return '获取授权链接失败，请稍后重试。'
          }

          const loginUrl = (res as { login_url?: string }).login_url
          if (!loginUrl) {
            return '获取授权链接失败，请稍后重试。'
          }

          const helpMsg = [
            '三角洲QQ OAuth授权登录教程：',
            `1. QQ内打开链接：${loginUrl}`,
            '2. 点击登录',
            '3. 登录成功后，点击右上角，选择复制链接',
            '4. 返回聊天界面，发送 df.qqoauth 刚刚复制的链接',
            '',
            '⚠️ 新版OAuth登录更安全稳定，推荐使用！'
          ].join('\n')

          return helpMsg
        } catch (error) {
          logger.error('QQ OAuth登录获取链接失败:', error)
          return '获取授权链接时发生错误，请稍后重试。'
        }
      }

      try {
        // 提交完整的授权URL
        const res = await api.submitQqOAuthAuth(authUrl)
        
        if (!res || res.code !== 0) {
          return `QQ OAuth授权提交失败: ${res?.msg || res?.message || '未知错误'}`
        }

        const finalToken = (res as { frameworkToken?: string }).frameworkToken
        if (!finalToken) {
          return '未能获取到有效的Token'
        }

        // 绑定用户
        const bindRes = await api.bindUser({
          platformID: userId,
          frameworkToken: finalToken,
          clientID: config.clientID,
          clientType: 'koishi',
        })

        if (!bindRes || (bindRes.code !== 0 && !bindRes.success)) {
          return `登录失败: ${bindRes?.msg || bindRes?.message || '未知错误'}`
        }

        // 获取账号列表并激活
        const listRes = await api.getUserList(userId, config.clientID)
        if (listRes && listRes.code === 0 && listRes.data) {
          const newlyBoundAccount = listRes.data.find(a => a.frameworkToken === finalToken)
          if (newlyBoundAccount) {
            const newAccountGroupKey = getTokenGroup(newlyBoundAccount.tokenType)
            await setGroupActiveToken(ctx, userId, userPlatform, newAccountGroupKey, finalToken)
          }
        }

        // 自动绑定角色
        const characterBindRes = await api.bindCharacter(finalToken)
        if (characterBindRes && characterBindRes.success && characterBindRes.roleInfo) {
          const { charac_name, level, tdmlevel, adultstatus } = characterBindRes.roleInfo
          const isAdult = adultstatus === '0' ? '否' : '是'
          
          let charMsg = 'QQ OAuth登录成功并角色信息已获取！\n'
          charMsg += '--- 角色信息 ---\n'
          charMsg += `昵称: ${charac_name}\n`
          charMsg += `烽火地带等级: ${level}\n`
          charMsg += `全面战场等级: ${tdmlevel}\n`
          charMsg += `防沉迷: ${isAdult}`
          
          return charMsg
        } else {
          return 'QQ OAuth登录成功！\n自动绑定角色失败，您可以稍后使用 df.bind 手动绑定。'
        }
      } catch (error) {
        logger.error('QQ OAuth登录失败:', error)
        return `QQ OAuth登录失败: ${(error as Error).message}`
      }
    })

  // 微信OAuth授权登录
  ctx.command('df.wxoauth [authUrl:text]', '微信OAuth授权登录')
    .alias('df.微信授权登录')
    .action(async ({ session }, authUrl) => {
      const userId = session.userId
      const userPlatform = session.platform

      if (!authUrl) {
        // 没有提供授权链接，显示帮助信息
        try {
          const res = await api.getWechatOAuthAuth(userId)
          
          if (!res || res.code !== 0) {
            return '获取微信授权链接失败，请稍后重试。'
          }

          const loginUrl = (res as { login_url?: string }).login_url
          if (!loginUrl) {
            return '获取微信授权链接失败，请稍后重试。'
          }

          const helpMsg = [
            '三角洲微信OAuth授权登录教程：',
            `1. 微信内打开链接：${loginUrl}`,
            '2. 点击登录',
            '3. 登录成功后，点击右上角，选择复制链接',
            '4. 返回聊天界面，发送 df.wxoauth 刚刚复制的链接',
          ].join('\n')

          return helpMsg
        } catch (error) {
          logger.error('微信OAuth登录获取链接失败:', error)
          return '获取微信授权链接时发生错误，请稍后重试。'
        }
      }

      try {
        // 提交完整的授权URL
        const res = await api.submitWechatOAuthAuth(authUrl)
        
        if (!res || res.code !== 0) {
          return `微信OAuth授权提交失败: ${res?.msg || res?.message || '未知错误'}`
        }

        const finalToken = (res as { frameworkToken?: string }).frameworkToken
        if (!finalToken) {
          return '未能获取到有效的Token'
        }

        // 绑定用户
        const bindRes = await api.bindUser({
          platformID: userId,
          frameworkToken: finalToken,
          clientID: config.clientID,
          clientType: 'koishi',
        })

        if (!bindRes || (bindRes.code !== 0 && !bindRes.success)) {
          return `登录失败: ${bindRes?.msg || bindRes?.message || '未知错误'}`
        }

        // 获取账号列表并激活
        const listRes = await api.getUserList(userId, config.clientID)
        if (listRes && listRes.code === 0 && listRes.data) {
          const newlyBoundAccount = listRes.data.find(a => a.frameworkToken === finalToken)
          if (newlyBoundAccount) {
            const newAccountGroupKey = getTokenGroup(newlyBoundAccount.tokenType)
            await setGroupActiveToken(ctx, userId, userPlatform, newAccountGroupKey, finalToken)
          }
        }

        // 自动绑定角色
        const characterBindRes = await api.bindCharacter(finalToken)
        if (characterBindRes && characterBindRes.success && characterBindRes.roleInfo) {
          const { charac_name, level, tdmlevel, adultstatus } = characterBindRes.roleInfo
          const isAdult = adultstatus === '0' ? '否' : '是'
          
          let charMsg = '微信OAuth登录成功并角色信息已获取！\n'
          charMsg += '--- 角色信息 ---\n'
          charMsg += `昵称: ${charac_name}\n`
          charMsg += `烽火地带等级: ${level}\n`
          charMsg += `全面战场等级: ${tdmlevel}\n`
          charMsg += `防沉迷: ${isAdult}`
          
          return charMsg
        } else {
          return '微信OAuth登录成功！\n自动绑定角色失败，您可以稍后使用 df.bind 手动绑定。'
        }
      } catch (error) {
        logger.error('微信OAuth登录失败:', error)
        return `微信OAuth登录失败: ${(error as Error).message}`
      }
    })

  // 网页登录
  ctx.command('df.weblogin', '网页登录')
    .alias('df.网页登录')
    .action(async ({ session }) => {
      const userId = session.userId
      const userPlatform = session.platform

      // 构建网页登录URL
      const webLoginUrl = `https://df.shallow.ink/oauth-login?platformID=${userId}`

      await session.send([
        '三角洲行动网页OAuth登录：',
        '请到浏览器打开：',
        webLoginUrl,
        '选择QQ或微信进行登录，三分钟内完成登录将会自动绑定'
      ].join('\n'))

      // 开始轮询登录状态
      const startTime = Date.now()
      const timeout = 180000 // 3分钟超时
      const pollInterval = 3000 // 3秒轮询一次

      let notifiedPending = false

      while (Date.now() - startTime < timeout) {
        await sleep(pollInterval)

        try {
          const statusRes = await api.getPlatformLoginStatus(userId)
          
          if (!statusRes || statusRes.code !== 0) {
            continue
          }

          const sessions = (statusRes as { sessions?: Array<{ frameworkToken: string; status: string; type: string }> }).sessions || []
          
          if (sessions.length === 0) {
            continue
          }

          // 检查是否有已完成的会话
          for (const sess of sessions) {
            if (!sess.frameworkToken || sess.status === 'expired') {
              continue
            }

            if (!notifiedPending) {
              await session.send('已检测到网页登录会话，正在等待您完成登录...')
              notifiedPending = true
            }

            // 检查登录状态
            const loginType = sess.type || 'qq'
            let loginStatusRes
            if (loginType === 'wechat') {
              loginStatusRes = await api.getWechatOAuthStatus(sess.frameworkToken)
            } else {
              loginStatusRes = await api.getQqOAuthStatus(sess.frameworkToken)
            }

            if (loginStatusRes && loginStatusRes.code === 0) {
              // 登录成功
              const finalToken = sess.frameworkToken

              // 绑定用户
              const bindRes = await api.bindUser({
                platformID: userId,
                frameworkToken: finalToken,
                clientID: config.clientID,
                clientType: 'koishi',
              })

              if (!bindRes || (bindRes.code !== 0 && !bindRes.success)) {
                return `登录失败: ${bindRes?.msg || bindRes?.message || '未知错误'}`
              }

              // 获取账号列表并激活
              const listRes = await api.getUserList(userId, config.clientID)
              if (listRes && listRes.code === 0 && listRes.data) {
                const newlyBoundAccount = listRes.data.find(a => a.frameworkToken === finalToken)
                if (newlyBoundAccount) {
                  const newAccountGroupKey = getTokenGroup(newlyBoundAccount.tokenType)
                  await setGroupActiveToken(ctx, userId, userPlatform, newAccountGroupKey, finalToken)
                }
              }

              // 自动绑定角色
              const characterBindRes = await api.bindCharacter(finalToken)
              if (characterBindRes && characterBindRes.success && characterBindRes.roleInfo) {
                const { charac_name, level, tdmlevel, adultstatus } = characterBindRes.roleInfo
                const isAdult = adultstatus === '0' ? '否' : '是'
                
                let charMsg = `网页${loginType === 'wechat' ? '微信' : 'QQ'}登录成功并角色信息已获取！\n`
                charMsg += '--- 角色信息 ---\n'
                charMsg += `昵称: ${charac_name}\n`
                charMsg += `烽火地带等级: ${level}\n`
                charMsg += `全面战场等级: ${tdmlevel}\n`
                charMsg += `防沉迷: ${isAdult}`
                
                return charMsg
              } else {
                return `网页${loginType === 'wechat' ? '微信' : 'QQ'}登录成功！\n自动绑定角色失败，您可以稍后使用 df.bind 手动绑定。`
              }
            }
          }
        } catch (error) {
          logger.error('网页登录轮询失败:', error)
        }
      }

      return '网页登录已超时，请重新尝试。'
    })
}
