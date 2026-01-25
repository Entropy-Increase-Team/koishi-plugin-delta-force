import { Context, h } from 'koishi'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { Renderer } from '../../render'

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
  api: ApiService,
  renderer: Renderer
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

      const isAll = options?.all || type?.toLowerCase() === 'all'
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
          return await renderFlowsByType(api, renderer, token, typeValue, pageNum, isAll, session, logger)
        }

        // 未指定类型，查询所有类型并逐个发送图片
        for (const [typeName, typeVal] of Object.entries(FLOW_TYPE_MAP)) {
          const result = await renderFlowsByType(api, renderer, token, typeVal, pageNum, false, session, logger)
          if (typeof result === 'string') {
            await session.send(`【${typeName}流水】\n${result}`)
          } else {
            await session.send(result)
          }
        }
        return
      } catch (error) {
        logger.error('查询流水失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

/**
 * 渲染指定类型的流水图片
 */
async function renderFlowsByType(
  api: ApiService,
  renderer: Renderer,
  token: string,
  typeValue: number,
  page: number,
  isAll: boolean,
  session: { send: (msg: unknown) => Promise<unknown> },
  logger: ReturnType<Context['logger']>
): Promise<h | string> {
  const typeName = FLOW_TYPE_NAMES[typeValue]

  // 获取数据
  let allRecords: unknown[] = []
  let totalPages = 1
  let playerInfo: { vRoleName?: string; Level?: string; loginDay?: string } | null = null

  if (isAll) {
    // 获取所有页数据
    let currentPage = 1
    while (true) {
      const res = await api.getFlows(token, typeValue, currentPage)
      // 与云崽版保持一致：检查 success 字段或 code 字段
      if (!res || (res.success === false && String(res.code) !== '0')) break

      const data = (res.data as unknown[])?.[0] as Record<string, unknown> | undefined
      if (!data) break

      // 保存玩家信息（仅设备流水）
      if (typeValue === 1 && currentPage === 1 && data.vRoleName) {
        playerInfo = {
          vRoleName: data.vRoleName as string,
          Level: data.Level as string,
          loginDay: data.loginDay as string,
        }
      }

      const arrKey = typeValue === 1 ? 'LoginArr' : typeValue === 2 ? 'itemArr' : 'iMoneyArr'
      const records = data[arrKey] as unknown[] | undefined
      if (!records || records.length === 0) break

      allRecords.push(...records)
      currentPage++
      if (currentPage > 50) break
    }
    totalPages = currentPage - 1
  } else {
    // 单页查询
    const res = await api.getFlows(token, typeValue, page)
    // 与云崽版保持一致：检查 success 字段或 code 字段
    if (!res || (res.success === false && String(res.code) !== '0')) {
      return `查询失败: ${res?.msg || res?.message || '未知错误'}`
    }

    const data = (res.data as unknown[])?.[0] as Record<string, unknown> | undefined
    if (!data) {
      return '暂无记录'
    }

    // 保存玩家信息（仅设备流水）
    if (typeValue === 1 && data.vRoleName) {
      playerInfo = {
        vRoleName: data.vRoleName as string,
        Level: data.Level as string,
        loginDay: data.loginDay as string,
      }
    }

    const arrKey = typeValue === 1 ? 'LoginArr' : typeValue === 2 ? 'itemArr' : 'iMoneyArr'
    const records = data[arrKey] as unknown[] | undefined
    if (!records || records.length === 0) {
      return '当前页无记录'
    }
    allRecords = records
  }

  if (allRecords.length === 0) {
    return '暂无记录'
  }

  // 准备模板数据
  const templateData = prepareTemplateData(allRecords, typeValue, isAll ? `全部` : page, typeName, playerInfo, isAll)

  // 渲染图片
  const imageResult = await renderer.renderToMessage('flows', templateData)
  return imageResult
}

/**
 * 准备模板数据（与云崽版保持一致）
 */
function prepareTemplateData(
  records: unknown[],
  typeValue: number,
  page: number | string,
  typeName: string,
  playerInfo: { vRoleName?: string; Level?: string; loginDay?: string } | null,
  isAllPages: boolean
): Record<string, unknown> {
  const templateData: Record<string, unknown> = {
    typeName,
    typeValue,
    page,
  }

  // 按列分组（5列布局）
  const groupByColumns = (arr: unknown[], itemsPerColumn: number, isAll = false) => {
    const columns: unknown[][] = [[], [], [], [], []]
    arr.forEach((item, index) => {
      const columnIndex = index % 5
      if (isAll || columns[columnIndex].length < itemsPerColumn) {
        columns[columnIndex].push(item)
      } else {
        for (let i = 0; i < 5; i++) {
          const col = columns[(columnIndex + i + 1) % 5]
          if (col.length < itemsPerColumn) {
            col.push(item)
            break
          }
        }
      }
    })
    return columns.filter(col => col.length > 0)
  }

  switch (typeValue) {
    case 1: // 设备流水
      if (playerInfo) {
        templateData.playerInfo = playerInfo
      }
      const loginRecords = records.map((r, i) => {
        const record = r as {
          indtEventTime?: string
          outdtEventTime?: string
          vClientIP?: string
          SystemHardware?: string
        }
        return {
          index: i + 1,
          indtEventTime: record.indtEventTime || '',
          outdtEventTime: record.outdtEventTime || '',
          vClientIP: record.vClientIP || '未知',
          SystemHardware: record.SystemHardware || '未知',
        }
      })
      templateData.loginColumns = groupByColumns(loginRecords, 5, isAllPages)

      // 统计设备和IP
      const deviceStats: Record<string, number> = {}
      const ipStats: Record<string, number> = {}
      records.forEach(r => {
        const record = r as { SystemHardware?: string; vClientIP?: string }
        const device = record.SystemHardware || '未知设备'
        const ip = record.vClientIP || '未知IP'
        deviceStats[device] = (deviceStats[device] || 0) + 1
        ipStats[ip] = (ipStats[ip] || 0) + 1
      })
      templateData.totalCount = records.length
      templateData.deviceStats = Object.entries(deviceStats)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
      templateData.ipStats = Object.entries(ipStats)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
      break

    case 2: // 道具流水
      const itemRecords = records.map((r, i) => {
        const record = r as {
          dtEventTime?: string
          Name?: string
          AddOrReduce?: string
          Reason?: string
        }
        const addOrReduce = String(record.AddOrReduce || '')
        return {
          index: i + 1,
          dtEventTime: record.dtEventTime || '',
          Name: record.Name || '未知物品',
          AddOrReduce: addOrReduce,
          Reason: decodeReason(record.Reason),
          changeType: addOrReduce.startsWith('+') ? 'positive' : 'negative',
        }
      })
      templateData.itemColumns = groupByColumns(itemRecords, 10, isAllPages)
      break

    case 3: // 货币流水
      const moneyRecords = records.map((r, i) => {
        const record = r as {
          dtEventTime?: string
          AddOrReduce?: string
          leftMoney?: string
          Reason?: string
        }
        const addOrReduce = String(record.AddOrReduce || '')
        return {
          index: i + 1,
          dtEventTime: record.dtEventTime || '',
          AddOrReduce: addOrReduce,
          leftMoney: record.leftMoney || '未知',
          Reason: decodeReason(record.Reason),
          changeType: addOrReduce.startsWith('+') ? 'positive' : 'negative',
        }
      })
      templateData.moneyColumns = groupByColumns(moneyRecords, 10, isAllPages)
      break
  }

  return templateData
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
