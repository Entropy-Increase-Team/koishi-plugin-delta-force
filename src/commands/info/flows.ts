import { Context } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

// 流水类型映射
const FLOW_TYPE_MAP: Record<string, number> = {
  '设备': 1,
  '道具': 2,
  '货币': 3,
}

const FLOW_TYPE_NAMES: Record<number, string> = {
  1: '设备',
  2: '道具',
  3: '货币',
}

/**
 * 注册流水查询相关命令
 */
export function registerFlowsCommands(
  ctx: Context,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 流水查询
  ctx.command('df.flows [type:string] [page:number]', '查看交易流水')
    .alias('df.流水')
    .option('all', '-a 查询所有页')
    .usage('类型: 设备、道具、货币\n示例: df.flows 货币 2')
    .action(async ({ session, options }, type, page) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      const isAll = options?.all || false
      const pageNum = page || 1

      // 解析类型
      let typeValue: number | undefined
      if (type && type.toLowerCase() !== 'all') {
        typeValue = FLOW_TYPE_MAP[type]
        if (!typeValue) {
          return `未知的流水类型: ${type}\n支持的类型: 设备、道具、货币`
        }
      }

      await session.send('正在查询流水记录，请稍候...')

      try {
        // 如果指定了类型，只查询该类型
        if (typeValue) {
          const result = await queryFlowsByType(api, token, typeValue, pageNum, isAll, logger)
          return result
        }

        // 未指定类型，查询所有类型
        const results: string[] = []
        for (const [typeName, typeVal] of Object.entries(FLOW_TYPE_MAP)) {
          const result = await queryFlowsByType(api, token, typeVal, pageNum, false, logger)
          results.push(`【${typeName}流水】\n${result}`)
        }

        return results.join('\n\n')
      } catch (error) {
        logger.error('查询流水失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

/**
 * 查询指定类型的流水
 */
async function queryFlowsByType(
  api: ApiService,
  token: string,
  typeValue: number,
  page: number,
  isAll: boolean,
  logger: ReturnType<Context['logger']>
): Promise<string> {
  const typeName = FLOW_TYPE_NAMES[typeValue]

  if (isAll) {
    // 获取所有页数据
    const allRecords: unknown[] = []
    let currentPage = 1
    
    while (true) {
      const res = await api.getFlows(token, typeValue, currentPage)
      if (!res || res.code !== 0) break
      
      const data = (res.data as unknown[])?.[0] as Record<string, unknown> | undefined
      if (!data) break

      const arrKey = typeValue === 1 ? 'LoginArr' : typeValue === 2 ? 'itemArr' : 'iMoneyArr'
      const records = data[arrKey] as unknown[] | undefined
      if (!records || records.length === 0) break

      allRecords.push(...records)
      currentPage++
      
      // 防止无限循环
      if (currentPage > 50) break
    }

    if (allRecords.length === 0) {
      return '暂无记录'
    }

    return formatFlowRecords(typeValue, allRecords, `全部 (${currentPage - 1}页)`)
  }

  // 单页查询
  const res = await api.getFlows(token, typeValue, page)
  
  if (!res || res.code !== 0) {
    return `查询失败: ${res?.msg || res?.message || '未知错误'}`
  }

  const data = (res.data as unknown[])?.[0] as Record<string, unknown> | undefined
  if (!data) {
    return '暂无记录'
  }

  const arrKey = typeValue === 1 ? 'LoginArr' : typeValue === 2 ? 'itemArr' : 'iMoneyArr'
  const records = data[arrKey] as unknown[] | undefined

  if (!records || records.length === 0) {
    return '当前页无记录'
  }

  return formatFlowRecords(typeValue, records, `第 ${page} 页`)
}

/**
 * 格式化流水记录
 */
function formatFlowRecords(typeValue: number, records: unknown[], pageInfo: string): string {
  const lines: string[] = [`${pageInfo} (共 ${records.length} 条)`]
  lines.push('━━━━━━━━━━━━━━━')

  // 限制显示数量
  const displayRecords = records.slice(0, 20)

  switch (typeValue) {
    case 1: // 设备登录记录
      displayRecords.forEach((record, index) => {
        const r = record as {
          indtEventTime?: string
          outdtEventTime?: string
          vClientIP?: string
          SystemHardware?: string
        }
        lines.push(`${index + 1}. ${r.indtEventTime || '未知时间'}`)
        lines.push(`   IP: ${r.vClientIP || '未知'} | 设备: ${r.SystemHardware || '未知'}`)
      })
      break

    case 2: // 道具记录
      displayRecords.forEach((record, index) => {
        const r = record as {
          dtEventTime?: string
          Name?: string
          AddOrReduce?: string
          Reason?: string
        }
        const change = r.AddOrReduce || ''
        const changeSymbol = change.startsWith('+') ? '📈' : '📉'
        lines.push(`${index + 1}. ${r.dtEventTime || '未知时间'}`)
        lines.push(`   ${changeSymbol} ${r.Name || '未知物品'} ${change}`)
        lines.push(`   原因: ${decodeReason(r.Reason)}`)
      })
      break

    case 3: // 货币记录
      displayRecords.forEach((record, index) => {
        const r = record as {
          dtEventTime?: string
          AddOrReduce?: string
          leftMoney?: string
          Reason?: string
        }
        const change = r.AddOrReduce || ''
        const changeSymbol = change.startsWith('+') ? '📈' : '📉'
        lines.push(`${index + 1}. ${r.dtEventTime || '未知时间'}`)
        lines.push(`   ${changeSymbol} ${change} | 余额: ${r.leftMoney || '未知'}`)
        lines.push(`   原因: ${decodeReason(r.Reason)}`)
      })
      break
  }

  if (records.length > 20) {
    lines.push(`\n... 还有 ${records.length - 20} 条记录未显示`)
  }

  return lines.join('\n')
}

/**
 * 解码原因字段
 */
function decodeReason(reason: string | undefined): string {
  if (!reason) return '未知原因'
  try {
    return decodeURIComponent(reason)
  } catch {
    return reason
  }
}
