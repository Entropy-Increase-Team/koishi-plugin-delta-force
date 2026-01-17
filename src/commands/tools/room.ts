import { Context } from 'koishi'
import { Config } from '../../config'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError } from '../../utils'

/**
 * 注册开黑房间相关命令
 */
export function registerRoomCommands(
  ctx: Context,
  config: Config,
  api: ApiService,
  dataManager: DataManager
) {
  const logger = ctx.logger('delta-force')

  // 房间列表
  ctx.command('df.room.list [type:string]', '查看开黑房间列表')
    .alias('df.房间列表')
    .option('password', '-p <has:string> 是否有密码 (有/无)')
    .usage('type: sol(烽火) 或 mp(全面)')
    .action(async ({ session, options }, type) => {
      const gameType = parseGameMode(type)

      // 解析密码过滤
      let hasPassword: string | undefined
      if (options?.password === '有') {
        hasPassword = 'true'
      } else if (options?.password === '无') {
        hasPassword = 'false'
      }

      const filterDesc: string[] = []
      if (gameType) filterDesc.push(`模式: ${gameType === 'sol' ? '烽火' : '战场'}`)
      if (hasPassword !== undefined) filterDesc.push(hasPassword === 'true' ? '有密码' : '无密码')

      await session.send(`正在查询房间列表... ${filterDesc.length > 0 ? `[${filterDesc.join(', ')}]` : ''}`)

      try {
        const res = await api.getRoomList(config.clientID, gameType, hasPassword)

        if (await handleApiError(res, session)) return

        interface RoomInfo {
          roomId: string | number
          type?: string
          mapid?: string | number
          tagText?: string
          hasPassword?: boolean
          currentMemberCount?: number
          maxMemberCount?: number
          ownerNickname?: string
        }

        const rooms = res.data as RoomInfo[] | undefined

        if (!rooms || rooms.length === 0) {
          return '当前没有公开的开黑房间'
        }

        const lines: string[] = ['【开黑房间列表】']
        lines.push('━━━━━━━━━━━━━━━')

        rooms.slice(0, 10).forEach((room, index) => {
          const lock = room.hasPassword ? '🔒' : ''
          const mode = room.type === 'sol' ? '烽火' : '战场'
          const mapName = dataManager.getMapName(room.mapid) || String(room.mapid)
          const members = `${room.currentMemberCount || 0}/${room.maxMemberCount || 4}`

          lines.push('')
          lines.push(`#${index + 1} [${mode}] ${room.tagText || '无标题'} ${lock}`)
          lines.push(`ID: ${room.roomId} | 地图: ${mapName} | 人数: ${members}`)
          lines.push(`房主: ${room.ownerNickname || '未知'}`)
        })

        if (rooms.length > 10) {
          lines.push('')
          lines.push(`... 还有 ${rooms.length - 10} 个房间`)
        }

        lines.push('')
        lines.push('使用 df.room.join <房间ID> 加入房间')

        return lines.join('\n')
      } catch (error) {
        logger.error('查询房间列表失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 创建房间
  ctx.command('df.room.create <type:string>', '创建开黑房间')
    .alias('df.创建房间')
    .option('map', '-m <mapid:string> 地图ID')
    .option('tag', '-t <tagid:string> 标签ID')
    .option('password', '-p <pwd:string> 房间密码')
    .option('limit', '-l 仅限本客户端')
    .usage('type: sol(烽火) 或 mp(全面)\n示例: df.room.create sol -m 1902 -t 10001')
    .action(async ({ session, options }, type) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      const gameType = parseGameMode(type)
      if (!gameType) {
        return [
          '请指定房间模式 (sol/mp)',
          '',
          '格式: df.room.create <模式> [选项]',
          '选项:',
          '  -m <地图ID>  指定地图',
          '  -t <标签ID>  指定标签',
          '  -p <密码>    设置密码',
          '  -l           仅限本客户端',
          '',
          '示例: df.room.create sol -m 1902',
          '',
          '使用 df.room.maps 查看地图列表',
          '使用 df.room.tags 查看标签列表',
        ].join('\n')
      }

      const mapid = options?.map || '0'
      const tag = options?.tag || ''
      const password = options?.password || ''
      const onlyCurrentlyClient = options?.limit || false

      const mapName = dataManager.getMapName(mapid) || mapid

      await session.send(`正在创建房间... [模式: ${gameType === 'sol' ? '烽火' : '战场'}, 地图: ${mapName}]`)

      try {
        const res = await api.createRoom(
          token,
          config.clientID,
          gameType,
          mapid,
          tag,
          password,
          onlyCurrentlyClient
        )

        if (await handleApiError(res, session)) return

        interface RoomData {
          roomId?: string | number
        }

        const data = res.data as RoomData | undefined

        const lines: string[] = ['✅ 房间创建成功！']
        lines.push(`房间ID: ${data?.roomId || '未知'}`)
        
        if (password) {
          lines.push(`密码: ${password}`)
        }

        lines.push('')
        lines.push(`其他玩家请使用: df.room.join ${data?.roomId || ''} ${password ? password : ''}`)
        lines.push('')
        lines.push('注意: 创建或加入房间即代表您同意展示您的昵称、UID等公开信息')

        return lines.join('\n')
      } catch (error) {
        logger.error('创建房间失败:', error)
        return `创建失败: ${(error as Error).message}`
      }
    })

  // 加入房间
  ctx.command('df.room.join <roomId:string> [password:string]', '加入开黑房间')
    .alias('df.加入房间')
    .action(async ({ session }, roomId, password) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!roomId) {
        return '请提供房间ID'
      }

      await session.send(`正在加入房间: ${roomId}...`)

      try {
        const res = await api.joinRoom(token, config.clientID, roomId, password)

        if (await handleApiError(res, session)) return

        return [
          res.msg || '成功加入房间！',
          '',
          '注意: 创建或加入房间即代表您同意展示您的昵称、UID等公开信息',
        ].join('\n')
      } catch (error) {
        logger.error('加入房间失败:', error)
        return `加入失败: ${(error as Error).message}`
      }
    })

  // 退出/解散房间
  ctx.command('df.room.quit <roomId:string>', '退出或解散房间')
    .alias('df.退出房间')
    .alias('df.解散房间')
    .action(async ({ session }, roomId) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      if (!roomId) {
        return '请提供房间ID'
      }

      await session.send(`正在退出/解散房间: ${roomId}...`)

      try {
        const res = await api.quitRoom(token, config.clientID, roomId)

        if (await handleApiError(res, session)) return

        return res.msg || '成功退出或解散房间！'
      } catch (error) {
        logger.error('退出房间失败:', error)
        return `操作失败: ${(error as Error).message}`
      }
    })

  // 房间信息
  ctx.command('df.room.info', '查看当前所在房间信息')
    .alias('df.房间信息')
    .action(async ({ session }) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      await session.send('正在查询房间信息...')

      try {
        const res = await api.getRoomInfo(token, config.clientID)

        if (await handleApiError(res, session)) return

        interface RoomDetail {
          roomId?: string | number
          type?: string
          mapid?: string | number
          tag?: string
          tagText?: string
          currentMemberCount?: number
          maxMemberCount?: number
          members?: Array<{
            nickname?: string
            uid?: string
          }>
        }

        const room = res.data as RoomDetail | undefined

        if (!room) {
          return '您当前不在任何房间内'
        }

        const mapName = dataManager.getMapName(room.mapid) || String(room.mapid)
        const mode = room.type === 'sol' ? '烽火地带' : '全面战场'

        const lines: string[] = [`【房间信息】(ID: ${room.roomId})`]
        lines.push('━━━━━━━━━━━━━━━')
        lines.push(`模式: ${mode}`)
        lines.push(`标签: ${room.tagText || room.tag || '无'}`)
        lines.push(`地图: ${mapName}`)
        lines.push(`人数: ${room.currentMemberCount || 0}/${room.maxMemberCount || 4}`)

        if (room.members && room.members.length > 0) {
          lines.push('')
          lines.push('--- 成员列表 ---')
          room.members.forEach((member, index) => {
            lines.push(`${index + 1}. ${member.nickname || '未知'} (UID: ${member.uid || '未知'})`)
          })
        }

        return lines.join('\n')
      } catch (error) {
        logger.error('查询房间信息失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })

  // 地图列表
  ctx.command('df.room.maps', '查看房间可用地图列表')
    .alias('df.房间地图列表')
    .action(async ({ session }) => {
      await session.send('正在获取地图列表...')

      try {
        const res = await api.getMaps()

        if (await handleApiError(res, session)) return

        interface MapInfo {
          id: string | number
          name: string
        }

        const maps = res.data as MapInfo[] | undefined

        if (!maps || maps.length === 0) {
          return '暂无可用地图'
        }

        const lines: string[] = ['【房间可用地图列表】']
        lines.push('ID - 地图名称')
        lines.push('━━━━━━━━━━━━━━━')

        maps.forEach(map => {
          lines.push(`${map.id} - ${map.name}`)
        })

        return lines.join('\n')
      } catch (error) {
        logger.error('获取地图列表失败:', error)
        return `获取失败: ${(error as Error).message}`
      }
    })

  // 标签列表
  ctx.command('df.room.tags', '查看房间可用标签列表')
    .alias('df.房间标签列表')
    .action(async ({ session }) => {
      await session.send('正在获取标签列表...')

      try {
        const res = await api.getRoomTags()

        if (await handleApiError(res, session)) return

        interface TagInfo {
          id: string | number
          name: string
        }

        const tags = res.data as TagInfo[] | undefined

        if (!tags || tags.length === 0) {
          return '暂无可用标签'
        }

        const lines: string[] = ['【房间可用标签列表】']
        lines.push('ID - 标签名称')
        lines.push('━━━━━━━━━━━━━━━')

        tags.forEach(tag => {
          lines.push(`${tag.id} - ${tag.name}`)
        })

        return lines.join('\n')
      } catch (error) {
        logger.error('获取标签列表失败:', error)
        return `获取失败: ${(error as Error).message}`
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
