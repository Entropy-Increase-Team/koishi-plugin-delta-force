import { Context } from 'koishi'
import { Config } from '../config'
import { ApiService } from '../api'
import { getGroupActiveToken, setGroupActiveToken, getTokenGroup } from '../database'

export function registerAccountCommands(
  ctx: Context,
  config: Config,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 账号列表
  ctx.command('df.account', '账号管理')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      try {
        // 从云端 API 获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = listRes.data || []

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
        const grouped: Record<string, typeof accounts> = {
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

        // 按照分组顺序构建完整列表（用于序号）
        const allInOrder = [
          ...grouped.qq_wechat,
          ...grouped.wegame,
          ...grouped.qqsafe,
        ]

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
              const maskedToken = `${token.frameworkToken.substring(0, 4)}****${token.frameworkToken.slice(-4)}`
              const status = token.isValid ? '有效' : '失效'
              const qqDisplay = token.qqNumber ? ` (${token.qqNumber.slice(0, 4)}****)` : ''
              
              message += `${overallIndex++}. ${isActive}[${token.tokenType.toUpperCase()}]${qqDisplay} ${maskedToken} (${status})\n`
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
    .action(async ({ session }, index) => {
      const userId = session.userId
      const platform = session.platform

      try {
        // 从云端获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0 || !listRes.data) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = listRes.data

        // 按分组整理并构建序号列表
        const grouped: Record<string, typeof accounts> = {
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

        const allInOrder = [
          ...grouped.qq_wechat,
          ...grouped.wegame,
          ...grouped.qqsafe,
        ]

        if (index < 1 || index > allInOrder.length) {
          return '序号无效，请使用 df.account 查看账号列表'
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

        const maskedToken = `${targetToken.frameworkToken.substring(0, 4)}****${targetToken.frameworkToken.slice(-4)}`
        const qqDisplay = targetToken.qqNumber ? ` (${targetToken.qqNumber.slice(0, 4)}****)` : ''
        return `账号切换成功！\n当前${groupNames[targetGroup] || targetGroup}分组使用:${qqDisplay} ${maskedToken}`
      } catch (error) {
        logger.error('切换账号失败:', error)
        return `切换失败: ${(error as Error).message}`
      }
    })

  // 解绑账号
  ctx.command('df.unbind <序号:number>', '解绑账号')
    .action(async ({ session }, index) => {
      const userId = session.userId
      const platform = session.platform

      try {
        // 从云端获取账号列表
        const listRes = await api.getUserList(userId, config.clientID)

        if (!listRes || listRes.code !== 0 || !listRes.data) {
          return `查询账号列表失败: ${listRes?.msg || listRes?.message || '未知错误'}`
        }

        const accounts = listRes.data

        // 按分组整理并构建序号列表
        const grouped: Record<string, typeof accounts> = {
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

        const allInOrder = [
          ...grouped.qq_wechat,
          ...grouped.wegame,
          ...grouped.qqsafe,
        ]

        if (index < 1 || index > allInOrder.length) {
          return '序号无效，请使用 df.account 查看账号列表'
        }

        const targetToken = allInOrder[index - 1]
        
        // 调用 API 解绑（云端删除）
        await api.bindUser({
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
}
