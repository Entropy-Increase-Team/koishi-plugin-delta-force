import { Context } from 'koishi'
import { ApiService } from '../../api'

/**
 * 注册服务器状态查询相关命令
 */
export function registerHealthCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 服务器状态查询
  ctx.command('df.health', '查看服务器状态')
    .alias('df.服务器状态')
    .action(async ({ session }) => {
      try {
        const res = await api.getHealth()

        // 如果能获取到响应且格式正确，显示详细状态
        const healthData = res as unknown as HealthResponse
        if (res && typeof res === 'object' && healthData.status) {
          return formatHealthStatus(healthData)
        }

        // 如果响应格式不正确但有数据，显示简单状态
        if (res && typeof res === 'object') {
          return formatSimpleStatus(res as unknown as SimpleHealthResponse)
        }

        // 如果没有响应，显示离线状态
        return formatOfflineStatus('无响应')
      } catch (error) {
        logger.error('服务器状态查询异常:', error)

        // 解析错误信息
        let errorInfo = '未知错误'
        const err = error as Error

        if (err.message) {
          if (err.message.includes('502')) {
            errorInfo = '502 Bad Gateway'
          } else if (err.message.includes('503')) {
            errorInfo = '503 Service Unavailable'
          } else if (err.message.includes('500')) {
            errorInfo = '500 Internal Server Error'
          } else if (err.message.includes('404')) {
            errorInfo = '404 Not Found'
          } else if (err.message.includes('timeout')) {
            errorInfo = '请求超时'
          } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
            errorInfo = '连接被拒绝'
          } else {
            errorInfo = err.message
          }
        }

        return formatOfflineStatus(errorInfo)
      }
    })
}

// 类型定义
interface HealthResponse {
  status: string
  cluster?: {
    nodeId?: string
    nodeType?: string
  }
  system?: {
    uptime?: number
    platform?: string
    memory?: {
      rss?: number
      heapUsed?: number
      heapTotal?: number
    }
  }
  dependencies?: {
    mongodb?: { status?: string }
    redis?: { status?: string }
  }
}

interface SimpleHealthResponse {
  status?: string
  message?: string
  timestamp?: string
}

/**
 * 格式化详细健康状态
 */
function formatHealthStatus(data: HealthResponse): string {
  const status = data.status || 'unknown'
  const cluster = data.cluster || {}
  const system = data.system || {}
  const dependencies = data.dependencies || {}

  // 状态转换
  const statusText = status === 'healthy' ? '✅ 在线' :
                    status === 'unhealthy' ? '❌ 离线' :
                    '⚠️ 未知'

  const nodeTypeName = cluster.nodeType === 'master' ? '主节点' :
                      cluster.nodeType === 'worker' ? '从节点' :
                      '未知节点'

  // 运行时间转换
  const uptime = system.uptime || 0
  const uptimeHours = uptime > 0 ? (uptime / 3600).toFixed(1) : '0'

  // 内存使用
  const memory = system.memory || {}
  const memoryInfo = memory.rss && memory.heapUsed && memory.heapTotal
    ? `RSS ${memory.rss}MB，堆内存 ${memory.heapUsed}/${memory.heapTotal}MB`
    : '内存信息不可用'

  // 依赖服务状态
  const mongoStatus = dependencies.mongodb?.status === 'connected' ? '✅ 正常' : '❌ 异常'
  const redisStatus = dependencies.redis?.status === 'connected' ? '✅ 正常' : '❌ 异常'

  const lines: string[] = ['【三角洲插件 - 服务器状态】']
  lines.push(`服务状态: ${statusText}`)

  if (cluster.nodeId) {
    lines.push(`节点信息: ${cluster.nodeId} (${nodeTypeName})`)
  } else {
    lines.push(`节点信息: ${nodeTypeName}`)
  }

  lines.push(`运行时间: ${uptimeHours}小时`)

  if (system.platform) {
    lines.push(`系统平台: ${system.platform}`)
  }

  lines.push(`内存使用: ${memoryInfo}`)

  // 只有在有依赖信息时才显示
  if (dependencies.mongodb || dependencies.redis) {
    lines.push(`数据库连接: MongoDB ${mongoStatus}，Redis ${redisStatus}`)
  } else {
    lines.push(`数据库连接: 状态信息不可用`)
  }

  return lines.join('\n')
}

/**
 * 格式化简单状态
 */
function formatSimpleStatus(data: SimpleHealthResponse): string {
  const status = data.status || 'unknown'
  const statusText = status === 'healthy' ? '✅ 在线' :
                    status === 'unhealthy' ? '❌ 离线' :
                    '⚠️ 未知'

  const lines: string[] = ['【三角洲插件 - 服务器状态】']
  lines.push(`服务状态: ${statusText}`)

  if (data.message) {
    lines.push(`消息: ${data.message}`)
  }

  if (data.timestamp) {
    const time = new Date(data.timestamp).toLocaleString('zh-CN')
    lines.push(`检查时间: ${time}`)
  }

  return lines.join('\n')
}

/**
 * 格式化离线状态
 */
function formatOfflineStatus(errorInfo: string): string {
  const currentTime = new Date().toLocaleString('zh-CN')
  return [
    '【三角洲插件 - 服务器状态】',
    '服务状态: ❌ 离线',
    `错误信息: ${errorInfo}`,
    `检查时间: ${currentTime}`,
  ].join('\n')
}
