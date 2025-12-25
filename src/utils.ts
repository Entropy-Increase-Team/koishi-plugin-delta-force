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
