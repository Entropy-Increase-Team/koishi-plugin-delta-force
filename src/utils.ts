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
 * 处理 API 错误响应
 */
export async function handleApiError(
  response: ApiResponse,
  session: Session
): Promise<boolean> {
  if (!response) {
    await session.send('请求失败，请稍后重试')
    return true
  }

  if (response.code !== 0 && !response.success) {
    const errorMsg = response.msg || response.message || '未知错误'
    
    if (response.code === 401 || response.code === 403) {
      await session.send('认证失败，请重新登录')
      return true
    }
    
    if (response.code === 404) {
      await session.send('未找到相关数据')
      return true
    }
    
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
