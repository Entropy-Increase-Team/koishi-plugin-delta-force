import { Context } from 'koishi'
import { Config } from '../../config'
import { ApiService } from '../../api'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

/**
 * 注册改枪方案相关命令
 */
export function registerSolutionCommands(
  ctx: Context,
  config: Config,
  api: ApiService
) {
  const logger = ctx.logger('delta-force')

  // 上传改枪方案
  ctx.command('df.solution.upload <code:text>', '上传改枪方案')
    .alias('df.上传改枪码')
    .option('desc', '-d <desc:string> 方案描述')
    .option('type', '-t <type:string> 模式 (sol/mp)')
    .option('public', '-p 公开作者信息')
    .usage('示例: df.solution.upload 腾龙突击步枪-烽火地带-6GQIU4800CIEH22G8UEHS -d "56W满配" -t sol')
    .action(async ({ session, options }, code) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!code) {
        return [
          '请提供改枪码',
          '',
          '格式: df.solution.upload <改枪码> [选项]',
          '选项:',
          '  -d <描述>  方案描述',
          '  -t <模式>  sol(烽火) 或 mp(全面)',
          '  -p         公开作者信息',
          '',
          '示例: df.solution.upload 腾龙突击步枪-烽火地带-6GQIU4800CIEH22G8UEHS -d "56W满配"',
        ].join('\n')
      }

      const desc = options?.desc || ''
      const type = parseGameMode(options?.type) || 'sol'
      const isPublic = options?.public || false

      await session.send('正在上传改枪方案...')

      try {
        const res = await api.uploadSolution(
          token,
          config.clientID,
          userId,
          code,
          desc,
          isPublic,
          type
        )

        if (await handleApiError(res, session)) return

        interface SolutionData {
          solutionId?: string | number
        }

        const data = res.data as SolutionData | undefined
        const modeDisplay = type === 'sol' ? '烽火地带' : '全面战场'
        const publicDisplay = isPublic ? '公开' : '私有'

        return [
          '✅ 改枪码上传成功！',
          `方案ID: ${data?.solutionId || '未知'}`,
          `模式: ${modeDisplay}`,
          `状态: ${publicDisplay}`,
          '',
          '注意: 新上传的方案需要通过审核后才会在列表中显示',
        ].join('\n')
      } catch (error) {
        logger.error('上传改枪方案失败:', error)
        return `上传失败: ${(error as Error).message}`
      }
    })

  // 改枪方案列表
  ctx.command('df.solution.list [weapon:string]', '查看改枪方案列表')
    .alias('df.改枪码列表')
    .option('price', '-p <range:string> 价格范围 (如: 10000,50000)')
    .usage('示例: df.solution.list 腾龙 -p 10000,50000')
    .action(async ({ session, options }, weapon) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      const priceRange = options?.price || ''

      const filterDesc: string[] = []
      if (weapon) filterDesc.push(`武器: ${weapon}`)
      if (priceRange) filterDesc.push(`价格: ${priceRange.replace(',', '-')}`)

      await session.send(`正在查询改枪方案列表... ${filterDesc.length > 0 ? `[${filterDesc.join(', ')}]` : ''}`)

      try {
        const res = await api.getSolutionList(
          token,
          config.clientID,
          userId,
          undefined,
          weapon,
          priceRange
        )

        if (await handleApiError(res, session)) return

        interface SolutionItem {
          id?: string | number
          solutionId?: string | number
          solutionCode?: string
          weaponName?: string
          type?: string
          totalPrice?: number
          authorNickname?: string
          author?: string
          views?: number
          likes?: number
          likeCount?: number
          dislikes?: number
          dislikeCount?: number
          description?: string
          desc?: string
        }

        // 处理不同的数据结构
        let solutions: SolutionItem[] = []
        const data = res.data as SolutionItem[] | { list?: SolutionItem[]; keywords?: SolutionItem[] } | undefined
        
        if (Array.isArray(data)) {
          solutions = data
        } else if (data?.list) {
          solutions = data.list
        } else if (data?.keywords) {
          solutions = data.keywords
        }

        if (solutions.length === 0) {
          return '未找到符合条件的改枪方案'
        }

        const lines: string[] = [`【改枪方案列表】(${solutions.length}个)`]
        lines.push('━━━━━━━━━━━━━━━')

        solutions.slice(0, 10).forEach((solution, index) => {
          const id = solution.id || solution.solutionId
          const mode = solution.type === 'sol' ? '烽火' : '战场'
          const price = solution.totalPrice ? solution.totalPrice.toLocaleString() : '未知'
          const author = solution.authorNickname || solution.author || '匿名'
          const likes = solution.likes || solution.likeCount || 0
          const dislikes = solution.dislikes || solution.dislikeCount || 0

          lines.push('')
          lines.push(`#${index + 1} [${mode}] ${solution.weaponName || '未知武器'}`)
          lines.push(`ID: ${id} | 价格: ${price}`)
          lines.push(`作者: ${author} | 👍${likes} 👎${dislikes}`)
          
          if (solution.description || solution.desc) {
            const desc = (solution.description || solution.desc || '').slice(0, 30)
            lines.push(`描述: ${desc}${desc.length >= 30 ? '...' : ''}`)
          }
        })

        if (solutions.length > 10) {
          lines.push('')
          lines.push(`... 还有 ${solutions.length - 10} 个方案`)
        }

        lines.push('')
        lines.push('使用 df.solution.detail <ID> 查看详情')

        return lines.join('\n')
      } catch (error) {
        logger.error('查询改枪方案列表失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 改枪方案详情
  ctx.command('df.solution.detail <id:string>', '查看改枪方案详情')
    .alias('df.改枪码详情')
    .action(async ({ session }, id) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!id) {
        return '请提供方案ID'
      }

      await session.send(`正在查询方案详情 (ID: ${id})...`)

      try {
        const res = await api.getSolutionDetail(token, config.clientID, userId, id)

        if (await handleApiError(res, session)) return

        interface SolutionDetail {
          id?: string | number
          solutionId?: string | number
          solutionCode?: string
          weapon?: { objectName?: string }
          metadata?: { type?: string; createdAt?: string }
          statistics?: { totalPrice?: number; views?: number; likes?: number; dislikes?: number }
          author?: { platformID?: string }
          description?: string
          attachments?: Array<{ objectName?: string; objectID?: string; price?: number }>
        }

        const solution = res.data as SolutionDetail | undefined
        if (!solution) {
          return '方案不存在或无权限查看'
        }

        const solutionId = solution.id || solution.solutionId || id
        const mode = solution.metadata?.type === 'sol' ? '烽火地带' : '全面战场'
        const price = solution.statistics?.totalPrice?.toLocaleString() || '未知'

        const lines: string[] = ['=== 改枪方案详情 ===']
        lines.push(`方案ID: ${solutionId}`)
        lines.push(`改枪码: ${solution.solutionCode || '未知'}`)
        lines.push(`武器: ${solution.weapon?.objectName || '未知'}`)
        lines.push(`模式: ${mode}`)
        lines.push(`总价格: ${price}`)
        lines.push(`作者: ${solution.author?.platformID || '匿名'}`)
        lines.push(`创建时间: ${solution.metadata?.createdAt || '未知'}`)
        lines.push(`浏览量: ${solution.statistics?.views || 0}`)
        lines.push(`👍 ${solution.statistics?.likes || 0} 👎 ${solution.statistics?.dislikes || 0}`)

        if (solution.description) {
          lines.push(`描述: ${solution.description}`)
        }

        if (solution.attachments && solution.attachments.length > 0) {
          lines.push('')
          lines.push('=== 配件列表 ===')
          solution.attachments.forEach((acc, index) => {
            const accPrice = acc.price ? acc.price.toLocaleString() : '未知'
            lines.push(`${index + 1}. ${acc.objectName || acc.objectID} - ${accPrice}`)
          })
        }

        lines.push('')
        lines.push('操作指令:')
        lines.push(`df.solution.vote ${solutionId} like - 点赞`)
        lines.push(`df.solution.vote ${solutionId} dislike - 点踩`)
        lines.push(`df.solution.collect ${solutionId} - 收藏`)

        return lines.join('\n')
      } catch (error) {
        logger.error('查询改枪方案详情失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 投票
  ctx.command('df.solution.vote <id:string> <type:string>', '为改枪方案投票')
    .alias('df.改枪码投票')
    .usage('type: like(点赞) 或 dislike(点踩)')
    .action(async ({ session }, id, type) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!id || !type) {
        return '请提供方案ID和投票类型 (like/dislike)'
      }

      const voteType = type === 'like' || type === '点赞' ? 'like' : 'dislike'
      const voteAction = voteType === 'like' ? '点赞' : '点踩'

      try {
        const res = await api.voteSolution(token, config.clientID, userId, id, voteType)

        if (await handleApiError(res, session)) return

        return res.msg || `${voteAction}成功！`
      } catch (error) {
        logger.error('投票失败:', error)
        return `操作失败: ${(error as Error).message}`
      }
    })

  // 收藏/取消收藏
  ctx.command('df.solution.collect <id:string>', '收藏改枪方案')
    .alias('df.收藏改枪码')
    .option('cancel', '-c 取消收藏')
    .action(async ({ session, options }, id) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!id) {
        return '请提供方案ID'
      }

      const isCancel = options?.cancel || false

      try {
        const res = isCancel
          ? await api.discollectSolution(token, config.clientID, userId, id)
          : await api.collectSolution(token, config.clientID, userId, id)

        if (await handleApiError(res, session)) return

        return res.msg || (isCancel ? '取消收藏成功！' : '收藏成功！')
      } catch (error) {
        logger.error('收藏操作失败:', error)
        return `操作失败: ${(error as Error).message}`
      }
    })

  // 收藏列表
  ctx.command('df.solution.favorites', '查看收藏的改枪方案')
    .alias('df.改枪码收藏')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询收藏列表...')

      try {
        const res = await api.getCollectList(token, config.clientID, userId)

        if (await handleApiError(res, session)) return

        interface SolutionItem {
          id?: string | number
          solutionId?: string | number
          solutionCode?: string
          weaponName?: string
          type?: string
          totalPrice?: number
          authorNickname?: string
          author?: string
          likes?: number
          dislikes?: number
          description?: string
          desc?: string
        }

        let collections: SolutionItem[] = []
        const data = res.data as SolutionItem[] | { list?: SolutionItem[] } | undefined
        
        if (Array.isArray(data)) {
          collections = data
        } else if (data?.list) {
          collections = data.list
        }

        if (collections.length === 0) {
          return '您还没有收藏任何改枪方案'
        }

        const lines: string[] = [`【我的收藏】(${collections.length}个)`]
        lines.push('━━━━━━━━━━━━━━━')

        collections.forEach((solution, index) => {
          const id = solution.id || solution.solutionId
          const mode = solution.type === 'sol' ? '烽火' : '战场'
          const price = solution.totalPrice ? solution.totalPrice.toLocaleString() : '未知'

          lines.push('')
          lines.push(`#${index + 1} [${mode}] ${solution.weaponName || '未知武器'}`)
          lines.push(`ID: ${id} | 价格: ${price}`)
          lines.push(`👍${solution.likes || 0} 👎${solution.dislikes || 0}`)
        })

        return lines.join('\n')
      } catch (error) {
        logger.error('查询收藏列表失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 删除方案
  ctx.command('df.solution.delete <id:string>', '删除改枪方案')
    .alias('df.删除改枪码')
    .action(async ({ session }, id) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!id) {
        return '请提供方案ID'
      }

      try {
        const res = await api.deleteSolution(token, config.clientID, userId, id)

        if (await handleApiError(res, session)) return

        return '方案删除成功！注意: 删除后无法恢复'
      } catch (error) {
        logger.error('删除方案失败:', error)
        return `删除失败: ${(error as Error).message}`
      }
    })
}

/**
 * 解析游戏模式
 */
function parseGameMode(input: string | undefined): string {
  if (!input) return ''
  const lower = input.toLowerCase()
  if (['sol', '烽火', '烽火地带', '摸金'].includes(lower)) return 'sol'
  if (['mp', '全面', '战场', '全面战场'].includes(lower)) return 'mp'
  return ''
}
