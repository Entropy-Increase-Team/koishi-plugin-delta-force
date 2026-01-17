import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'

// 兵种 ID 范围映射
function getArmyTypeById(id: number): string {
  if (id >= 10000 && id < 20000) return '突击'
  if (id >= 20000 && id < 30000) return '支援'
  if (id >= 30000 && id < 40000) return '工程'
  if (id >= 40000 && id < 50000) return '侦察'
  return '未知'
}

// 兵种显示顺序
const ARMY_TYPE_ORDER = ['突击', '工程', '支援', '侦察']

/**
 * 注册干员查询相关命令
 */
export function registerOperatorCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  // 干员列表查询
  ctx.command('df.operators', '查看干员列表')
    .alias('df.干员列表')
    .action(async ({ session }) => {
      await session.send('正在查询干员列表，请稍候...')

      try {
        const res = await api.getOperators()

        if (!res || res.code !== 0) {
          return `查询失败: ${res?.msg || res?.message || '未知错误'}`
        }

        interface OperatorInfo {
          id: number
          name?: string
          operator?: string
          fullName?: string
          armyType?: string
        }

        const operators = res.data as OperatorInfo[] | undefined

        if (!operators || !Array.isArray(operators) || operators.length === 0) {
          return '未能查询到任何干员信息'
        }

        // 按兵种分组
        const groupedByArmyType: Record<string, OperatorInfo[]> = {}
        operators.forEach(operator => {
          const armyType = operator.armyType || getArmyTypeById(operator.id)
          if (!groupedByArmyType[armyType]) {
            groupedByArmyType[armyType] = []
          }
          groupedByArmyType[armyType].push(operator)
        })

        // 按顺序排列
        const sortedArmyTypes = Object.keys(groupedByArmyType).sort((a, b) => {
          const indexA = ARMY_TYPE_ORDER.indexOf(a)
          const indexB = ARMY_TYPE_ORDER.indexOf(b)
          if (indexA === -1 && indexB === -1) return a.localeCompare(b)
          if (indexA === -1) return 1
          if (indexB === -1) return -1
          return indexA - indexB
        })

        const lines: string[] = ['【干员列表】']
        lines.push(`共 ${operators.length} 个干员`)
        lines.push('━━━━━━━━━━━━━━━')

        sortedArmyTypes.forEach((armyType, index) => {
          const typeOperators = groupedByArmyType[armyType]
          lines.push('')
          lines.push(`【${armyType}】(${typeOperators.length}人)`)
          typeOperators.forEach(operator => {
            const name = operator.name || operator.operator || operator.fullName || '未知'
            lines.push(`  • ${name}`)
          })
        })

        return lines.join('\n')
      } catch (error) {
        logger.error('查询干员列表失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 干员详情查询
  ctx.command('df.operator <name:text>', '查看干员详细信息')
    .alias('df.干员')
    .usage('示例: df.operator 乌鲁鲁')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请输入干员名称，例如: df.operator 乌鲁鲁'
      }

      const operatorName = name.trim()
      await session.send(`正在查询干员「${operatorName}」的信息，请稍候...`)

      try {
        const res = await api.getOperator()

        if (!res || res.code !== 0) {
          return `查询失败: ${res?.msg || res?.message || '未知错误'}`
        }

        interface OperatorDetail {
          operator?: string
          fullName?: string
          pic?: string
          armyType?: string
          armyTypeDesc?: string
          abilitiesList?: Array<{
            abilityName?: string
            abilityType?: string
            abilityTypeCN?: string
            abilityDesc?: string
            abilityPic?: string
          }>
        }

        const operators = res.data as OperatorDetail[] | undefined

        if (!operators || !Array.isArray(operators) || operators.length === 0) {
          return '未找到任何干员信息'
        }

        // 根据名称过滤干员
        const matchedOperators = operators.filter(op => {
          const opName = op.operator || ''
          const fullName = op.fullName || ''
          return opName.includes(operatorName) || fullName.includes(operatorName) ||
                 operatorName.includes(opName) || operatorName.includes(fullName)
        })

        if (matchedOperators.length === 0) {
          return `未找到干员「${operatorName}」的信息，请检查干员名称是否正确`
        }

        // 优先选择完全匹配的
        let operator = matchedOperators.find(op =>
          op.operator === operatorName || op.fullName === operatorName
        ) || matchedOperators[0]

        // 如果匹配到多个，提示用户
        let multiMatchHint = ''
        if (matchedOperators.length > 1) {
          const names = matchedOperators.map(op => op.operator || op.fullName).join('、')
          multiMatchHint = `⚠️ 找到多个匹配: ${names}\n显示第一个匹配结果\n\n`
        }

        // 构建输出
        const lines: string[] = []
        
        if (multiMatchHint) {
          lines.push(multiMatchHint)
        }

        lines.push(`【${operator.operator || '未知干员'}】`)
        
        if (operator.fullName) {
          lines.push(`全名: ${operator.fullName}`)
        }
        
        if (operator.armyType) {
          lines.push(`兵种: ${operator.armyType}`)
        }
        
        if (operator.armyTypeDesc) {
          lines.push(`兵种描述: ${operator.armyTypeDesc}`)
        }

        // 技能列表
        if (operator.abilitiesList && operator.abilitiesList.length > 0) {
          lines.push('')
          lines.push('━━━ 技能列表 ━━━')
          
          operator.abilitiesList.forEach((ability, index) => {
            lines.push('')
            lines.push(`【${ability.abilityName || '未知技能'}】`)
            
            if (ability.abilityTypeCN || ability.abilityType) {
              lines.push(`类型: ${ability.abilityTypeCN || ability.abilityType}`)
            }
            
            if (ability.abilityDesc) {
              lines.push(`描述: ${ability.abilityDesc}`)
            }
          })
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('查询干员信息失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}
