import { Session } from 'koishi'
import { ApiResponse } from './types'

/**
 * 格式化时间戳
 */
export function formatDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '未知'
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

/**
 * 格式化时长（秒转小时分钟）
 */
export function formatDuration(value: number, unit: 'seconds' | 'minutes' = 'seconds'): string {
  if (!value || isNaN(value)) return '未知'
  
  let totalMinutes: number
  if (unit === 'seconds') {
    totalMinutes = Math.floor(value / 60)
  } else {
    totalMinutes = value
  }
  
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.floor(totalMinutes % 60)
  return `${hours}小时${minutes}分钟`
}

/**
 * URL 解码
 */
export function decode(str: string): string {
  try {
    return decodeURIComponent(str || '')
  } catch (e) {
    return str || ''
  }
}

/**
 * 处理 API 错误响应（与云崽版保持一致）
 */
export async function handleApiError(
  response: ApiResponse,
  session: Session
): Promise<boolean> {
  // Case 0: Null or non-object response
  if (!response || typeof response !== 'object') {
    await session.send('请求失败，API未返回任何数据或数据格式错误。')
    return true
  }

  // Case 1: API Key/Auth invalid (code: 1000 or 1001)
  if (String(response.code) === '1000' || String(response.code) === '1001') {
    await session.send('API Key无效或已过期，请联系机器人管理员检查配置。')
    return true
  }

  // Case 1.1: API Key permission insufficient (code: 1100)
  if (String(response.code) === '1100') {
    await session.send('APIKey权限不足，请机器人升级订阅后使用。')
    return true
  }

  // Case 2: Login session invalid
  const data = response.data as Record<string, unknown> | undefined
  if (data?.ret === 101) {
    await session.send('登录已失效，请重新登录。')
    return true
  }

  // Case 3: Region not bound
  if (data?.ret === 99998) {
    await session.send('您尚未绑定游戏大区，请先使用绑定命令进行绑定。')
    return true
  }

  // Case 4: Token not found or invalid
  if (response.success === false && (
    response.message?.includes('未找到有效token') || 
    response.message?.includes('缺少frameworkToken参数')
  )) {
    await session.send('当前激活的账号无效，请重新登陆账号或切换有效账号。')
    return true
  }

  // Generic failure catch-all
  if (response.success === false) {
    // 特殊处理：某些成功消息可能被错误标记为 success: false
    if (response.message && (
      response.message.includes('上传成功') ||
      response.message.includes('查询成功') ||
      response.message.includes('操作成功') ||
      response.message.includes('删除成功') ||
      response.message.includes('更新成功')
    )) {
      return false // 不处理为错误
    }

    const errorMsg = response.msg || response.message || '未知错误'
    await session.send(`操作失败: ${errorMsg}`)
    return true
  }

  return false
}

/**
 * 格式化数字（添加千分位）
 */
export function formatNumber(num: number): string {
  if (!num || isNaN(num)) return '0'
  return num.toLocaleString('zh-CN')
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 用户信息接口返回类型
 */
export interface UserDisplayInfo {
  userName: string
  userAvatar: string
  qqAvatarUrl: string
}

/**
 * 从 personalInfo 接口获取用户显示信息（用户名、头像）
 * 与云崽版保持一致：使用 userData.picurl 作为头像
 * @param api ApiService 实例
 * @param token 用户 token
 * @param sessionUserId 会话用户 ID（用于构建 QQ 头像 URL）
 * @param fallbackName 获取失败时的默认用户名
 */
export async function getUserDisplayInfo(
  api: { getPersonalInfo: (token: string) => Promise<{ data?: { userData?: { charac_name?: string; picurl?: string } }; roleInfo?: { charac_name?: string; picurl?: string } }> },
  token: string,
  sessionUserId: string,
  fallbackName: string
): Promise<UserDisplayInfo> {
  let userName = fallbackName
  let userAvatar = ''
  // QQ头像：与云崽版保持一致，使用 user_id 构建
  const qqAvatarUrl = `http://q.qlogo.cn/headimg_dl?dst_uin=${sessionUserId}&spec=640&img_type=jpg`

  try {
    const personalInfoRes = await api.getPersonalInfo(token)
    if (personalInfoRes?.data && personalInfoRes?.roleInfo) {
      const { userData } = personalInfoRes.data
      const { roleInfo } = personalInfoRes

      // 获取用户名
      const gameUserName = decode(userData?.charac_name || roleInfo?.charac_name || '')
      if (gameUserName) {
        userName = gameUserName
      }

      // 获取头像：与云崽版保持一致，使用 picurl
      // picurl 可能是 URL 编码的完整地址，或者是纯数字的皮肤 ID
      const picUrl = decode(userData?.picurl || roleInfo?.picurl || '')
      if (picUrl) {
        if (/^[0-9]+$/.test(picUrl)) {
          // 纯数字：转换为 wegame 皮肤 URL
          userAvatar = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${picUrl}.webp`
        } else {
          // 完整 URL
          userAvatar = picUrl
        }
      }
    }
  } catch {
    // 获取失败，使用默认值
  }

  return { userName, userAvatar, qqAvatarUrl }
}
