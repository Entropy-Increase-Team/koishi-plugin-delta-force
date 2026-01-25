import { Context } from 'koishi'
import { ApiService } from '../../api'
import { Config } from '../../config'
import { handleApiError } from '../../utils'

/**
 * 注册用户统计相关命令（仅管理员可用）
 */
export function registerStatsCommands(
  ctx: Context,
  config: Config,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 用户统计查询
  ctx.command('df.stats', '查看用户统计信息（管理员）')
    .alias('df.用户统计')
    .action(async ({ session }) => {
      // 权限检查：只有管理员才能使用
      // Koishi 中使用 session.isDirect 和权限系统
      // 这里简单检查是否为私聊或特定用户
      
      await session.send('正在获取用户统计信息，请稍候...')

      try {
        const clientID = config.clientID
        if (!clientID) {
          return '系统配置错误：clientID未配置，请联系管理员。'
        }

        const res = await api.getUserStats(clientID)

        if (await handleApiError(res, session)) return

        if (!res.data) {
          return '获取统计信息失败：API返回数据为空'
        }

        interface StatsData {
          accessLevel?: string
          users?: {
            total: number
            emailVerified: number
            emailUnverified: number
          }
          api?: {
            totalKeys: number
            activeKeys: number
            inactiveKeys: number
          }
          subscription?: {
            proUsers: number
            freeUsers: number
            totalSubscriptions: number
          }
          loginMethods?: Record<string, { total: number; valid: number; invalid: number }>
          platform?: {
            totalBindings: number
            boundUsers: number
            unboundUsers: number
          }
          security?: {
            passwordResets24h: number
            passwordResets7d: number
            totalSecurityEvents: number
            recentSecurityEvents?: Array<{ severity: string; action: string; count: number }>
          }
          userInfo?: {
            totalAccounts: number
            boundAccounts: number
            unboundAccounts: number
          }
        }

        const { accessLevel, ...data } = res as { accessLevel?: string; data: StatsData }
        const statsData = res.data as StatsData

        if (accessLevel === 'admin') {
          return displayAdminStats(statsData)
        } else {
          return displayUserStats(statsData)
        }
      } catch (error) {
        logger.error('获取用户统计失败:', error)
        return `获取用户统计失败: ${(error as Error).message}`
      }
    })
}

/**
 * 显示管理员统计信息
 */
function displayAdminStats(data: {
  users?: { total: number; emailVerified: number; emailUnverified: number }
  api?: { totalKeys: number; activeKeys: number; inactiveKeys: number }
  subscription?: { proUsers: number; freeUsers: number; totalSubscriptions: number }
  loginMethods?: Record<string, { total: number; valid: number; invalid: number }>
  platform?: { totalBindings: number; boundUsers: number; unboundUsers: number }
  security?: {
    passwordResets24h: number
    passwordResets7d: number
    totalSecurityEvents: number
    recentSecurityEvents?: Array<{ severity: string; action: string; count: number }>
  }
}): string {
  const { users, api, subscription, loginMethods, platform, security } = data

  const lines: string[] = ['【三角洲行动 - 全站用户统计】']
  lines.push('权限级别：超级管理员')
  lines.push('')

  // 用户统计
  if (users) {
    lines.push('📊 用户统计')
    lines.push(`总用户数: ${users.total}`)
    lines.push(`邮箱已验证: ${users.emailVerified}`)
    lines.push(`邮箱未验证: ${users.emailUnverified}`)
    lines.push('')
  }

  // API密钥统计
  if (api) {
    lines.push('🔑 API密钥统计')
    lines.push(`总密钥数: ${api.totalKeys}`)
    lines.push(`活跃密钥: ${api.activeKeys}`)
    lines.push(`非活跃密钥: ${api.inactiveKeys}`)
    lines.push('')
  }

  // 订阅统计
  if (subscription) {
    lines.push('💎 订阅统计')
    lines.push(`专业用户: ${subscription.proUsers}`)
    lines.push(`免费用户: ${subscription.freeUsers}`)
    lines.push(`总订阅数: ${subscription.totalSubscriptions}`)
    lines.push('')
  }

  // 登录方式统计
  if (loginMethods) {
    lines.push('🔐 登录方式统计')
    Object.entries(loginMethods).forEach(([method, stats]) => {
      const methodName = getMethodDisplayName(method)
      lines.push(`${methodName}: ${stats.total} (有效: ${stats.valid}, 无效: ${stats.invalid})`)
    })
    lines.push('')
  }

  // 平台绑定统计
  if (platform) {
    lines.push('🔗 平台绑定统计')
    lines.push(`总绑定数: ${platform.totalBindings}`)
    lines.push(`已绑定用户: ${platform.boundUsers}`)
    lines.push(`未绑定用户: ${platform.unboundUsers}`)
    lines.push('')
  }

  // 安全统计
  if (security) {
    lines.push('🛡️ 安全统计')
    lines.push(`24小时内密码重置: ${security.passwordResets24h}`)
    lines.push(`7天内密码重置: ${security.passwordResets7d}`)
    lines.push(`总安全事件: ${security.totalSecurityEvents}`)

    if (security.recentSecurityEvents && security.recentSecurityEvents.length > 0) {
      lines.push('最近安全事件:')
      security.recentSecurityEvents.forEach(event => {
        const severity = getSeverityDisplayName(event.severity)
        const action = getActionDisplayName(event.action)
        lines.push(`  • ${action}: ${event.count}次 (${severity})`)
      })
    }
  }

  return lines.join('\n').trim()
}

/**
 * 显示普通用户统计信息
 */
function displayUserStats(data: {
  userInfo?: { totalAccounts: number; boundAccounts: number; unboundAccounts: number }
  loginMethods?: Record<string, { total: number; valid: number; invalid: number }>
  api?: { totalKeys: number; activeKeys: number; inactiveKeys: number }
}): string {
  const { userInfo, loginMethods, api } = data

  const lines: string[] = ['【三角洲行动 - 个人统计信息】']
  lines.push('权限级别：普通用户')
  lines.push('')

  // 账号统计
  if (userInfo) {
    lines.push('账号统计')
    lines.push(`总账号数: ${userInfo.totalAccounts}`)
    lines.push(`已绑定账号: ${userInfo.boundAccounts}`)
    lines.push(`未绑定账号: ${userInfo.unboundAccounts}`)
    lines.push('')
  }

  // 登录方式统计
  if (loginMethods) {
    lines.push('登录方式统计')
    Object.entries(loginMethods).forEach(([method, stats]) => {
      const methodName = getMethodDisplayName(method)
      lines.push(`${methodName}: ${stats.total} (有效: ${stats.valid}, 无效: ${stats.invalid})`)
    })
    lines.push('')
  }

  // API密钥统计
  if (api) {
    lines.push('API密钥统计')
    lines.push(`总密钥数: ${api.totalKeys}`)
    lines.push(`活跃密钥: ${api.activeKeys}`)
    lines.push(`非活跃密钥: ${api.inactiveKeys}`)
  }

  return lines.join('\n').trim()
}

function getMethodDisplayName(method: string): string {
  const methodNames: Record<string, string> = {
    'qq': 'QQ登录',
    'wechat': '微信登录',
    'wegame': 'WeGame登录',
    'wegameWechat': 'WeGame微信登录',
    'qqsafe': 'QQ安全中心',
    'qqCk': 'QQ Cookie登录'
  }
  return methodNames[method] || method
}

function getSeverityDisplayName(severity: string): string {
  const severityNames: Record<string, string> = {
    'low': '低',
    'medium': '中',
    'high': '高',
    'critical': '严重'
  }
  return severityNames[severity] || severity
}

function getActionDisplayName(action: string): string {
  const actionNames: Record<string, string> = {
    'password_reset': '密码重置',
    'login_failed': '登录失败',
    'account_locked': '账号锁定',
    'suspicious_activity': '可疑活动',
    'api_abuse': 'API滥用'
  }
  return actionNames[action] || action
}
