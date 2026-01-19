import { Context, Session } from 'koishi'
import { Config } from '../../config'
import { ApiService } from '../../api'
import { getGroupActiveToken, setGroupActiveToken, getTokenGroup } from '../../database'

export function registerAccountCommands(
  ctx: Context,
  config: Config,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  /**
   * 判断是否为私聊
   */
  const isPrivateSession = (session: Session): boolean => {
    return !!(session as { isDirect?: boolean }).isDirect || 
           (session as { channel?: { id?: string } }).channel?.id === 'private'
  }

  /**
   * 格式化 token 显示（私聊完整，群聊脱敏）
   */
  const formatToken = (token: string, isPrivate: boolean): string => {
    if (isPrivate) {
      return token
    }
    return `${token.substring(0, 4)}****${token.slice(-4)}`
  }

  /**
   * 按分组整理账号
   */
  interface AccountItem {
    tokenType: string
    frameworkToken: string
    isValid: boolean
    qqNumber?: string
  }

  const groupAccounts = (accounts: AccountItem[]) => {
    const grouped: Record<string, AccountItem[]> = {
      qq_wechat: [],
      wegame: [],
      qqsafe: [],
    }

    accounts.forEach(acc => {
      const type = acc.tokenType?.toLowerCase()
      if (type === 'qq' || type === 'wechat') {
        grouped.qq_wechat.push(acc)
      } else if (type === 'wegame' || type === 'wegame/wechat') {
        grouped.wegame.push(acc)
      } else if (type === 'qqsafe') {
        grouped.qqsafe.push(acc)
      }
    })

    return grouped
  }

  /**
   * 构建有序的账号列表
   */
  const buildOrderedAccountList = (grouped: Record<string, AccountItem[]>) => {
    return [
      ...grouped.qq_wechat,
      ...grouped.wegame,
      ...grouped.qqsafe,
    ]
  }

  // 账号列表
  ctx.command('df.account', '账号管理')
    .alias('df.账号')
    .alias('df.账号列表')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform
      const isPrivate = isPrivateSession(session)

      try {
        // 从云端 API 获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = (listRes.data || []) as AccountItem[]

        if (accounts.length === 0) {
          return '您尚未绑定任何账号，请使用 df.login 登录'
        }

        // 获取各分组的激活 token（从本地）
        const activeTokens = {
          qq_wechat: await getGroupActiveToken(ctx, userId, platform, 'qq_wechat'),
          wegame: await getGroupActiveToken(ctx, userId, platform, 'wegame'),
          qqsafe: await getGroupActiveToken(ctx, userId, platform, 'qqsafe'),
        }

        // 按分组整理账号
        const grouped = groupAccounts(accounts)

        // 构建显示消息
        let message = '【账号列表】\n\n'
        let overallIndex = 1

        const groupNames: Record<string, string> = {
          qq_wechat: 'QQ & 微信',
          wegame: 'WeGame',
          qqsafe: 'QQ安全中心',
        }

        for (const [groupKey, groupName] of Object.entries(groupNames)) {
          const groupTokens = grouped[groupKey]
          if (groupTokens.length > 0) {
            message += `--- ${groupName} ---\n`
            const groupActiveToken = activeTokens[groupKey as keyof typeof activeTokens]

            groupTokens.forEach(token => {
              const isActive = token.frameworkToken === groupActiveToken ? '✅ ' : ''
              const tokenDisplay = formatToken(token.frameworkToken, isPrivate)
              const status = token.isValid ? '有效' : '失效'
              const qqDisplay = token.qqNumber ? ` (${token.qqNumber.slice(0, 4)}****)` : ''

              message += `${overallIndex++}. ${isActive}[${token.tokenType.toUpperCase()}]${qqDisplay} ${tokenDisplay} (${status})\n`
            })
            message += '\n'
          }
        }

        message += '使用 df.switch <序号> 切换账号\n'
        message += '使用 df.unbind <序号> 解绑账号'

        return message
      } catch (error) {
        logger.error('查询账号列表失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 切换账号
  ctx.command('df.switch <序号:number>', '切换账号')
    .alias('df.切换')
    .alias('df.切换账号')
    .alias('df.账号切换')
    .action(async ({ session }, index) => {
      // 参数验证：必须提供序号
      if (index === undefined || index === null || isNaN(index)) {
        return '请提供要切换的账号序号\n用法: ^切换 <序号>\n例如: ^切换 1\n\n使用 ^账号 查看账号列表及序号'
      }

      const userId = session.userId
      const platform = session.platform
      const isPrivate = isPrivateSession(session)

      try {
        // 从云端获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0 || !listRes.data) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = listRes.data as AccountItem[]

        // 按分组整理并构建序号列表
        const grouped = groupAccounts(accounts)
        const allInOrder = buildOrderedAccountList(grouped)

        if (index < 1 || index > allInOrder.length) {
          return `序号无效，有效范围: 1-${allInOrder.length}\n请使用 ^账号 查看账号列表`
        }

        const targetToken = allInOrder[index - 1]

        if (!targetToken.isValid) {
          return '该账号已失效，无法切换'
        }

        // 确定目标账号所属分组
        const targetGroup = getTokenGroup(targetToken.tokenType)

        // 只更新该分组的激活账号（本地存储）
        await setGroupActiveToken(ctx, userId, platform, targetGroup, targetToken.frameworkToken)

        const groupNames: Record<string, string> = {
          qq_wechat: 'QQ/微信',
          wegame: 'WeGame',
          qqsafe: 'QQ安全中心',
          other: '其他',
        }

        const tokenDisplay = formatToken(targetToken.frameworkToken, isPrivate)
        const qqDisplay = targetToken.qqNumber ? ` (${targetToken.qqNumber.slice(0, 4)}****)` : ''
        return `账号切换成功！\n当前${groupNames[targetGroup] || targetGroup}分组使用:${qqDisplay} ${tokenDisplay}`
      } catch (error) {
        logger.error('切换账号失败:', error)
        return `切换失败: ${(error as Error).message}`
      }
    })

  // 解绑账号
  ctx.command('df.unbind <序号:number>', '解绑账号')
    .alias('df.解绑')
    .alias('df.删除')
    .action(async ({ session }, index) => {
      // 参数验证：必须提供序号
      if (index === undefined || index === null || isNaN(index)) {
        return '请提供要解绑的账号序号\n用法: ^解绑 <序号>\n例如: ^解绑 1\n\n使用 ^账号 查看账号列表及序号'
      }

      const userId = session.userId
      const platform = session.platform

      try {
        // 从云端获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0 || !listRes.data) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = listRes.data as AccountItem[]

        // 按分组整理并构建序号列表
        const grouped = groupAccounts(accounts)
        const allInOrder = buildOrderedAccountList(grouped)

        if (index < 1 || index > allInOrder.length) {
          return `序号无效，有效范围: 1-${allInOrder.length}\n请使用 ^账号 查看账号列表`
        }

        const targetToken = allInOrder[index - 1]

        // 调用 API 解绑（云端删除）
        await api.unbindUser({
          platformID: userId,
          frameworkToken: targetToken.frameworkToken,
          clientID: config.clientID,
          clientType: 'koishi',
        })

        // 如果解绑的是当前激活账号，清除该分组的激活状态（本地）
        const targetGroup = getTokenGroup(targetToken.tokenType)
        const groupActiveToken = await getGroupActiveToken(ctx, userId, platform, targetGroup)

        if (groupActiveToken === targetToken.frameworkToken) {
          await setGroupActiveToken(ctx, userId, platform, targetGroup, null)
        }

        return '账号解绑成功！'
      } catch (error) {
        logger.error('解绑账号失败:', error)
        return `解绑失败: ${(error as Error).message}`
      }
    })

  // 刷新微信登录
  ctx.command('df.refresh.wechat', '刷新微信登录状态')
    .alias('df.微信刷新')
    .alias('df.刷新微信')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const { getActiveToken } = await import('../../database')
      const token = await getActiveToken(ctx, userId, platform)

      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      try {
        const res = await api.refreshLogin('wechat', token)
        if (res.code === 0 || res.success) {
          return '微信登录状态刷新成功！'
        }
        return `刷新失败: ${res.msg || res.message || '未知错误'}`
      } catch (error) {
        logger.error('刷新微信登录失败:', error)
        return `刷新失败: ${(error as Error).message}`
      }
    })

  // 刷新QQ登录
  ctx.command('df.refresh.qq', '刷新QQ登录状态')
    .alias('df.qq刷新')
    .alias('df.QQ刷新')
    .alias('df.刷新qq')
    .alias('df.刷新QQ')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const { getActiveToken } = await import('../../database')
      const token = await getActiveToken(ctx, userId, platform)

      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      try {
        const res = await api.refreshLogin('qq', token)
        if (res.code === 0 || res.success) {
          return 'QQ登录状态刷新成功！'
        }
        return `刷新失败: ${res.msg || res.message || '未知错误'}`
      } catch (error) {
        logger.error('刷新QQ登录失败:', error)
        return `刷新失败: ${(error as Error).message}`
      }
    })

  // 手动绑定Token
  ctx.command('df.bindtoken <token:string>', '手动绑定Token')
    .alias('df.绑定')
    .action(async ({ session }, token) => {
      const userId = session.userId
      const platform = session.platform

      if (!token) {
        return '请提供要绑定的Token'
      }

      await session.send('正在尝试绑定 Token...')

      try {
        const res = await api.bindUser({
          platformID: userId,
          frameworkToken: token,
          clientID: config.clientID,
          clientType: 'koishi',
        })

        if (res && (res.code === 0 || res.success)) {
          // 获取账号列表并激活
          const listRes = await api.getUserList(userId, config.clientID)
          if (listRes && listRes.code === 0 && listRes.data) {
            const newlyBoundAccount = listRes.data.find(a => a.frameworkToken === token)
            if (newlyBoundAccount) {
              const newAccountGroupKey = getTokenGroup(newlyBoundAccount.tokenType)
              await setGroupActiveToken(ctx, userId, platform, newAccountGroupKey, token)
            }
          }
          return '账号手动绑定成功！'
        } else {
          return `绑定失败: ${res?.msg || res?.message || '未知错误'}`
        }
      } catch (error) {
        logger.error('手动绑定Token失败:', error)
        return `绑定失败: ${(error as Error).message}`
      }
    })

  // 删除账号（QQ/微信登录数据）
  ctx.command('df.delete <序号:number>', '删除账号登录数据')
    .alias('df.删除账号')
    .action(async ({ session }, index) => {
      // 参数验证：必须提供序号
      if (index === undefined || index === null || isNaN(index)) {
        return '请提供要删除的账号序号\n用法: ^删除账号 <序号>\n例如: ^删除账号 1\n\n使用 ^账号 查看账号列表及序号\n注意: 此操作仅支持删除QQ/微信登录数据'
      }

      const userId = session.userId
      const platform = session.platform

      try {
        // 从云端获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0 || !listRes.data) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = listRes.data as AccountItem[]

        // 按分组整理并构建序号列表
        const grouped = groupAccounts(accounts)
        const allInOrder = buildOrderedAccountList(grouped)

        if (index < 1 || index > allInOrder.length) {
          return `序号无效，有效范围: 1-${allInOrder.length}\n请使用 ^账号 查看账号列表`
        }

        const targetAccount = allInOrder[index - 1]
        const tokenType = targetAccount.tokenType?.toLowerCase()

        // 只支持删除QQ和微信登录数据
        if (!['qq', 'wechat'].includes(tokenType)) {
          return `该账号类型（${targetAccount.tokenType}）不支持删除操作。\n删除功能仅支持QQ和微信登录数据。`
        }

        const tokenToDelete = targetAccount.frameworkToken
        const maskedToken = `${tokenToDelete.substring(0, 4)}****${tokenToDelete.slice(-4)}`
        const qqDisplay = targetAccount.qqNumber ? ` (${targetAccount.qqNumber.slice(0, 4)}****)` : ''

        await session.send(`正在删除${targetAccount.tokenType.toUpperCase()}登录数据${qqDisplay} ${maskedToken}，请稍候...`)

        let deleteRes
        if (tokenType === 'qq') {
          deleteRes = await api.deleteQqLogin(tokenToDelete)
        } else if (tokenType === 'wechat') {
          deleteRes = await api.deleteWechatLogin(tokenToDelete)
        }

        if (deleteRes && (deleteRes.success || deleteRes.code === 0)) {
          // 删除成功后，同时解绑该账号
          const unbindRes = await api.unbindUser({
            platformID: userId,
            frameworkToken: tokenToDelete,
            clientID: config.clientID,
            clientType: 'koishi',
          })

          // 如果删除的是当前激活账号，清除该分组的激活状态
          const targetGroup = getTokenGroup(targetAccount.tokenType)
          const groupActiveToken = await getGroupActiveToken(ctx, userId, platform, targetGroup)

          if (groupActiveToken === tokenToDelete) {
            await setGroupActiveToken(ctx, userId, platform, targetGroup, null)
          }

          if (unbindRes && (unbindRes.code === 0 || unbindRes.success)) {
            return `${targetAccount.tokenType.toUpperCase()}登录数据删除成功！账号已自动解绑。`
          } else {
            return `${targetAccount.tokenType.toUpperCase()}登录数据删除成功！但账号解绑失败，请手动解绑。`
          }
        } else {
          return `删除${targetAccount.tokenType.toUpperCase()}登录数据失败: ${deleteRes?.message || deleteRes?.msg || '未知错误'}`
        }
      } catch (error) {
        logger.error('删除登录数据失败:', error)
        return `删除登录数据时发生错误: ${(error as Error).message}`
      }
    })
}
