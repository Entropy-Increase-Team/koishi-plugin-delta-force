import { Context, h } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError, getUserDisplayInfo } from '../../utils'
import { WeeklyReportData } from '../../types'
import { Renderer } from '../../render'


export function registerWeeklyCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.weekly [...args:string]', '查看周报')
    .alias('df.周报')
    .usage('用法: df.周报 [模式] [日期]\n模式: 烽火/全面/sol/mp\n日期: 8位数字，如 20260111')
    .action(async ({ session }, ...args) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 解析参数（与云崽版保持一致）
      // 注意：从 middleware 执行时，参数可能是单个字符串，需要拆分
      let mode = ''
      let date = ''
      let showExtra = false
      const allArgs: string[] = []
      for (const arg of args) {
        // 将每个参数按空格拆分（处理 middleware 传递的情况）
        const parts = arg.split(/\s+/).filter(Boolean)
        allArgs.push(...parts)
      }
      for (const arg of allArgs) {
        if (['烽火', '烽火地带', 'sol', '摸金'].includes(arg)) {
          mode = 'sol'
        } else if (['全面', '全面战场', '战场', 'mp'].includes(arg)) {
          mode = 'mp'
        } else if (['详细', 'detail', 'extra'].includes(arg)) {
          showExtra = true
        } else if (/^\d{8}$/.test(arg)) {
          // 8位数字作为日期，如 20260111
          date = arg
        }
      }

      logger.info(`[weekly] 解析参数: mode=${mode}, date=${date}, showExtra=${showExtra}, allArgs=${JSON.stringify(allArgs)}`)
      await session.send('正在查询周报数据...')
      try {
        const res = await api.getWeeklyReport(token, mode, true, date, showExtra)
        logger.info(`[weekly] API 响应: ${JSON.stringify(res).slice(0, 500)}`)
        logger.info(`[weekly] reportDm 存在: ${!!(res.data as { reportDm?: unknown })?.reportDm}`)
        
        if (await handleApiError(res, session)) return

        // 解析数据
        let solData: WeeklySolData | undefined
        let mpData: WeeklyMpData | undefined

        if (mode) {
          const detailData = (res.data as { data?: { data?: WeeklySolData | WeeklyMpData } })?.data?.data
          if (mode === 'sol') {
            solData = detailData as WeeklySolData
          } else if (mode === 'mp') {
            mpData = detailData as WeeklyMpData
          }
        } else {
          const data = res.data as WeeklyReportData
          solData = data?.sol?.data?.data
          mpData = data?.mp?.data?.data
        }

        // 如果查询全部且两个模式都没有数据，才提示无数据
        if (!mode && !solData && !mpData) {
          return '暂无周报数据，不打两把吗？'
        }

        // 获取用户信息（使用统一函数，从 personalInfo 接口获取头像）
        const { userName, userAvatar, qqAvatarUrl } = await getUserDisplayInfo(
          api,
          token,
          session.userId,
          session.username || session.userId
        )

        // 如果没有提供日期，使用当前日期
        let displayDate = date
        if (!displayDate) {
          const now = new Date()
          const year = now.getFullYear()
          const month = String(now.getMonth() + 1).padStart(2, '0')
          const day = String(now.getDate()).padStart(2, '0')
          displayDate = `${year}${month}${day}`
        }

        // 提取所有队友的 OpenID 并获取昵称和头像
        const allTeammateOpenIDs = new Set<string>()
        if (solData?.teammates) {
          solData.teammates.forEach(t => allTeammateOpenIDs.add(t.friend_openid))
        }
        if (mpData?.teammates) {
          mpData.teammates.forEach(t => allTeammateOpenIDs.add(t.friend_openid))
        }

        const nicknameMap = new Map<string, string>()
        const avatarMap = new Map<string, string>()
        if (allTeammateOpenIDs.size > 0) {
          const promises = Array.from(allTeammateOpenIDs).map(openid => 
            api.getFriendInfo(token, openid)
          )
          const results = await Promise.allSettled(promises)
          
          results.forEach((result, index) => {
            const openid = Array.from(allTeammateOpenIDs)[index]
            if (result.status === 'fulfilled' && result.value?.success && result.value.data) {
              const data = result.value.data as { charac_name?: string; picurl?: string }
              if (data.charac_name) {
                nicknameMap.set(openid, data.charac_name)
              }
              // 处理头像
              if (data.picurl) {
                let avatarUrl = data.picurl
                if (/^[0-9]+$/.test(avatarUrl)) {
                  avatarUrl = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${avatarUrl}.webp`
                } else {
                  try {
                    avatarUrl = decodeURIComponent(avatarUrl)
                  } catch {
                    // 解码失败，使用原始 URL
                  }
                }
                avatarMap.set(openid, avatarUrl)
              }
            }
          })
        }

        // 构建模板数据
        const templateData: Record<string, unknown> = {
          userName: userName,
          userAvatar: userAvatar,
          userId: session.userId,
          qqAvatarUrl: qqAvatarUrl,
          date: displayDate
        }

        // 处理烽火地带数据
        if (!mode || mode === 'sol') {
          if (solData) {
            const hasValidData = solData.total_sol_num && Number(solData.total_sol_num) > 0
            
            if (!hasValidData) {
              templateData.solData = { isEmpty: true }
            } else {
              // 解析常用地图和干员
              const mostUsedMap = parseAndGetName(solData.total_mapid_num, 'MapId', 'inum', (id) => dataManager.getMapName(id))
              const mostUsedOperator = parseAndGetName(solData.total_ArmedForceId_num, 'ArmedForceId', 'inum', (id) => dataManager.getOperatorName(id))

              // 获取段位信息
              const solRank = solData.Rank_Score ? dataManager.getRankByScore(solData.Rank_Score, 'sol') : '-'
              const solRankImagePath = solRank !== '-' ? dataManager.getRankImage(solData.Rank_Score || 0, 'sol') : null

              // 计算赚损比
              const gainedPrice = Number(solData.Gained_Price) || 0
              const consumePrice = Number(solData.consume_Price) || 0
              let profitRatio = '0'
              if (gainedPrice > 0 && consumePrice > 0) {
                profitRatio = (gainedPrice / consumePrice).toFixed(2)
              } else if (gainedPrice > 0 && consumePrice === 0) {
                profitRatio = '∞'
              }

              // 解析资产趋势
              const assetTrend = parseAssetTrend(solData.Total_Price)

              templateData.solData = {
                total_sol_num: solData.total_sol_num || 0,
                total_exacuation_num: solData.total_exacuation_num || 0,
                GainedPrice_overmillion_num: solData.GainedPrice_overmillion_num || 0,
                total_Death_Count: solData.total_Death_Count || 0,
                total_Kill_Player: solData.total_Kill_Player || 0,
                total_Kill_AI: solData.total_Kill_AI || 0,
                total_Kill_Boss: solData.total_Kill_Boss || 0,
                rankName: solRank,
                rankImagePath: solRankImagePath,
                rise_Price: solData.rise_Price?.toLocaleString() || '0',
                Gained_Price: solData.Gained_Price?.toLocaleString() || '0',
                consume_Price: solData.consume_Price?.toLocaleString() || '0',
                profitRatio: profitRatio,
                assetTrend: assetTrend,
                total_Quest_num: solData.total_Quest_num || 0,
                use_Keycard_num: solData.use_Keycard_num || 0,
                Mandel_brick_num: solData.Mandel_brick_num || 0,
                search_Birdsnest_num: solData.search_Birdsnest_num || 0,
                mileage: solData.Total_Mileage ? (solData.Total_Mileage / 100000).toFixed(2) : '0',
                total_Rescue_num: solData.total_Rescue_num || 0,
                Kill_ByCrocodile_num: solData.Kill_ByCrocodile_num || 0,
                gameTime: `${Math.floor((solData.total_Online_Time || 0) / 3600)}小时${Math.floor(((solData.total_Online_Time || 0) % 3600) / 60)}分钟`,
                mostUsedMap: mostUsedMap,
                mostUsedMapImagePath: mostUsedMap && mostUsedMap !== '无' ? dataManager.getMapImagePath(mostUsedMap, 'sol') : null,
                mostUsedOperator: mostUsedOperator,
                mostUsedOperatorImagePath: mostUsedOperator && mostUsedOperator !== '无' ? dataManager.getOperatorImagePath(mostUsedOperator) : null,
                operators: parseOperators(solData.total_ArmedForceId_num, dataManager),
                maps: parseMaps(solData.total_mapid_num, dataManager, 'sol'),
                highPriceItems: parseHighPriceItems(solData.CarryOut_highprice_list),
                teammates: parseSolTeammates(solData.teammates || [], nicknameMap, avatarMap)
              }
            }
          } else {
            templateData.solData = { isEmpty: true }
          }
        }

        // 处理全面战场数据
        if (!mode || mode === 'mp') {
          if (mpData) {
            const hasValidData = mpData.total_num && Number(mpData.total_num) > 0
            
            if (!hasValidData) {
              templateData.mpData = { isEmpty: true }
            } else {
              // 计算胜率
              const totalNum = Number(mpData.total_num) || 0
              const winNum = Number(mpData.win_num) || 0
              const winRate = totalNum > 0 ? ((winNum / totalNum) * 100).toFixed(1) + '%' : '0%'

              // 获取段位信息
              const mpRank = mpData.Rank_Match_Score ? dataManager.getRankByScore(mpData.Rank_Match_Score, 'tdm') : '-'
              const mpRankImagePath = mpRank !== '-' ? dataManager.getRankImage(mpData.Rank_Match_Score || 0, 'tdm') : null

              // 计算命中率
              const consumeBullet = Number(mpData.Consume_Bullet_Num) || 0
              const hitBullet = Number(mpData.Hit_Bullet_Num) || 0
              const hitRate = consumeBullet > 0 ? ((hitBullet / consumeBullet) * 100).toFixed(1) + '%' : '0%'

              // 解析常用地图和干员
              const mostUsedMap = parseAndGetName(mpData.max_inum_mapid, 'MapId', 'inum', (id) => dataManager.getMapName(id))
              const mostUsedOperator = mpData.max_inum_DeployArmedForceType ? dataManager.getOperatorName(mpData.max_inum_DeployArmedForceType) : '无'

              templateData.mpData = {
                total_num: mpData.total_num || 0,
                win_num: mpData.win_num || 0,
                winRate: winRate,
                rankName: mpRank,
                rankImagePath: mpRankImagePath,
                Kill_Num: mpData.Kill_Num || 0,
                continuous_Kill_Num: mpData.continuous_Kill_Num || 0,
                total_score: mpData.total_score?.toLocaleString() || '0',
                hitRate: hitRate,
                Hit_Bullet_Num: mpData.Hit_Bullet_Num || 0,
                Consume_Bullet_Num: mpData.Consume_Bullet_Num || 0,
                SBattle_Support_UseNum: mpData.SBattle_Support_UseNum || 0,
                SBattle_Support_CostScore: mpData.SBattle_Support_CostScore?.toLocaleString() || '0',
                Rescue_Teammate_Count: mpData.Rescue_Teammate_Count || 0,
                by_Rescue_num: mpData.by_Rescue_num || 0,
                mostUsedMap: mostUsedMap,
                mostUsedMapImagePath: mostUsedMap && mostUsedMap !== '无' ? dataManager.getMapImagePath(mostUsedMap, 'mp') : null,
                mostUsedOperator: mostUsedOperator,
                mostUsedOperatorImagePath: mostUsedOperator && mostUsedOperator !== '无' ? dataManager.getOperatorImagePath(mostUsedOperator) : null,
                maps: parseMaps(mpData.max_inum_mapid, dataManager, 'mp'),
                operatorStats: mpData.max_inum_DeployArmedForceType ? {
                  name: mostUsedOperator,
                  imagePath: dataManager.getOperatorImagePath(mostUsedOperator),
                  games: mpData.DeployArmedForceType_inum || 0,
                  kills: mpData.DeployArmedForceType_KillNum || 0,
                  gameTime: `${Math.floor((mpData.DeployArmedForceType_gametime || 0) / 3600)}小时${Math.floor(((mpData.DeployArmedForceType_gametime || 0) % 3600) / 60)}分钟`
                } : null,
                teammates: parseMpTeammates(mpData.teammates || [], nicknameMap, avatarMap)
              }
            }
          } else {
            templateData.mpData = { isEmpty: true }
          }
        }

        // 处理 reportDm 补充数据（与云崽版保持一致）
        const reportDm = (res.data as { reportDm?: ReportDmData })?.reportDm
        if (reportDm) {
          // 处理好友 TOP10 数据（烽火数据）
          if (reportDm.wbn?.friends && Array.isArray(reportDm.wbn.friends)) {
            const friendsData = reportDm.wbn.friends
            // 按 total_gained_price 排序，取前10名
            const sortedFriends = friendsData
              .filter(f => f.total_gained_price && Number(f.total_gained_price) > 0)
              .sort((a, b) => Number(b.total_gained_price) - Number(a.total_gained_price))
              .slice(0, 10)

            if (sortedFriends.length > 0) {
              // 获取好友的昵称和头像
              const friendOpenIDs = sortedFriends.map(f => f.Friendopenid)
              const friendNicknameMap = new Map<string, string>()
              const friendAvatarMap = new Map<string, string>()

              const friendPromises = friendOpenIDs.map(openid =>
                api.getFriendInfo(token, openid)
              )
              const friendResults = await Promise.allSettled(friendPromises)

              friendResults.forEach((result, index) => {
                const openid = friendOpenIDs[index]
                if (result.status === 'fulfilled' && result.value?.success && result.value.data) {
                  const data = result.value.data as { charac_name?: string; picurl?: string }
                  if (data.charac_name) {
                    friendNicknameMap.set(openid, data.charac_name)
                  }
                  if (data.picurl) {
                    let avatarUrl = data.picurl
                    if (/^[0-9]+$/.test(avatarUrl)) {
                      avatarUrl = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${avatarUrl}.webp`
                    } else {
                      try {
                        avatarUrl = decodeURIComponent(avatarUrl)
                      } catch {
                        // 解码失败，使用原始 URL
                      }
                    }
                    friendAvatarMap.set(openid, avatarUrl)
                  }
                }
              })

              // 收集所有物品ID
              const allItemIDs = new Set<string>()
              sortedFriends.forEach(friend => {
                if (friend.CarryOut_highprice_list && Array.isArray(friend.CarryOut_highprice_list)) {
                  friend.CarryOut_highprice_list.forEach(item => {
                    if (item.itemid) {
                      allItemIDs.add(String(item.itemid))
                    }
                  })
                }
                if (friend.CarryOut_top2_highprice_list && Array.isArray(friend.CarryOut_top2_highprice_list)) {
                  friend.CarryOut_top2_highprice_list.forEach(item => {
                    if (item.itemid) {
                      allItemIDs.add(String(item.itemid))
                    }
                  })
                }
              })

              // 获取物品名称
              const itemNameMap: Record<string, string> = {}
              if (allItemIDs.size > 0) {
                try {
                  const itemIDsArray = Array.from(allItemIDs)
                  const itemIDsString = itemIDsArray.join(',')
                  const itemRes = await api.searchObject('', itemIDsString)

                  if (itemRes && itemRes.success && itemRes.data) {
                    const keywords = (itemRes.data as { keywords?: Array<{ objectID?: string; name?: string; objectName?: string }> }).keywords
                    if (keywords && Array.isArray(keywords)) {
                      keywords.forEach(item => {
                        if (item.objectID) {
                          const id = String(item.objectID)
                          const name = item.name || item.objectName
                          if (name) {
                            itemNameMap[id] = name
                          }
                        }
                      })
                    }
                  }
                } catch (error) {
                  logger.warn('[weekly] 获取物品名称失败:', error)
                }
              }

              // 格式化价格
              const formatPrice = (price: number | string | undefined): string => {
                if (!price || isNaN(Number(price))) return '0'
                const numPrice = Number(price)
                if (numPrice >= 1000000) {
                  return (numPrice / 1000000).toFixed(2) + 'M'
                } else if (numPrice >= 1000) {
                  return (numPrice / 1000).toFixed(1) + 'K'
                } else {
                  return numPrice.toLocaleString()
                }
              }

              templateData.topFriends = sortedFriends.map((friend, index) => {
                const friendName = friendNicknameMap.get(friend.Friendopenid) || `...${String(friend.Friendopenid).slice(-6)}`
                const friendAvatar = friendAvatarMap.get(friend.Friendopenid) || ''

                // 处理物品列表
                const items: Array<{
                  itemid: string
                  name: string
                  imageUrl: string
                  price: string
                  rawPrice: number
                  inum: number
                  quality: number
                }> = []
                const addedItemIds = new Set<string>()

                // 优先显示 CarryOut_highprice_list
                if (friend.CarryOut_highprice_list && Array.isArray(friend.CarryOut_highprice_list)) {
                  friend.CarryOut_highprice_list.forEach(item => {
                    if (item.itemid && !addedItemIds.has(String(item.itemid))) {
                      const itemId = String(item.itemid)
                      const rawPrice = Number(item.iPrice || 0)
                      addedItemIds.add(itemId)
                      items.push({
                        itemid: itemId,
                        name: itemNameMap[itemId] || `物品${item.itemid}`,
                        imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${item.itemid}.png`,
                        price: formatPrice(rawPrice),
                        rawPrice: rawPrice,
                        inum: item.inum || 1,
                        quality: item.quality || 0
                      })
                    }
                  })
                }

                // 补充显示 CarryOut_top2_highprice_list
                if (friend.CarryOut_top2_highprice_list && Array.isArray(friend.CarryOut_top2_highprice_list)) {
                  friend.CarryOut_top2_highprice_list.forEach(item => {
                    if (item.itemid && !addedItemIds.has(String(item.itemid)) && items.length < 3) {
                      const itemId = String(item.itemid)
                      const rawPrice = Number(item.iPrice || 0)
                      addedItemIds.add(itemId)
                      items.push({
                        itemid: itemId,
                        name: itemNameMap[itemId] || `物品${item.itemid}`,
                        imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${item.itemid}.png`,
                        price: formatPrice(rawPrice),
                        rawPrice: rawPrice,
                        inum: item.inum || 1,
                        quality: item.quality || 0
                      })
                    }
                  })
                }

                // 按价格从高到低排序
                items.sort((a, b) => b.rawPrice - a.rawPrice)

                return {
                  rank: index + 1,
                  name: friendName,
                  avatar: friendAvatar,
                  total_gained_price: Number(friend.total_gained_price || 0).toLocaleString(),
                  total_GainedPrice: formatPrice(friend.total_GainedPrice || 0),
                  max_GainedPrice: formatPrice(friend.max_GainedPrice || 0),
                  win_num: friend.win_num || 0,
                  lose_num: friend.lose_num || 0,
                  intimacy: friend.FriendIntimacy || 0,
                  items: items.slice(0, 3)
                }
              })
            } else {
              templateData.topFriends = []
            }
          } else {
            templateData.topFriends = []
          }

          // 处理 report1 - 烽火地带收益统计
          if (reportDm.report1) {
            templateData.report1 = {
              total_sell_price: Number(reportDm.report1.total_sell_price || 0).toLocaleString()
            }
          }

          // 处理 report3 - 全面战场详细统计
          if (reportDm.report3) {
            const r3 = reportDm.report3
            const maxScoreMapId = r3.max_score_mapid ? dataManager.getMapName(r3.max_score_mapid) : '无'
            const maxScoreOperator = r3.max_mpmatch_num_deployarmedforcetype ? dataManager.getOperatorName(r3.max_mpmatch_num_deployarmedforcetype) : '无'
            const maxVehicleOperator = r3.max_vehicle_usedtime_vehicleid ? `载具ID: ${r3.max_vehicle_usedtime_vehicleid}` : '无'

            templateData.report3 = {
              max_mpmatch_num: r3.max_mpmatch_num || 0,
              max_vehicle_usedtime: r3.max_vehicle_usedtime ? `${Math.floor(Number(r3.max_vehicle_usedtime) / 60)}分钟` : '0',
              total_killvehicle: r3.total_killvehicle || 0,
              total_vehicle_usedtime: r3.total_vehicle_usedtime ? `${Math.floor(Number(r3.total_vehicle_usedtime) / 60)}分钟` : '0',
              total_vehicle_inum: r3.total_vehicle_inum || 0,
              max_score_killnum: r3.max_score_killnum || 0,
              max_score_death: r3.max_score_death || 0,
              win_mpmatch_num: r3.win_mpmatch_num || 0,
              max_score_assist: r3.max_score_assist || 0,
              total_mpmatch_num: r3.total_mpmatch_num || 0,
              max_score_mapid: maxScoreMapId,
              max_score_mapid_image: r3.max_score_mapid ? dataManager.getMapImagePath(maxScoreMapId, 'mp') : null,
              max_mpmatch_num_Rescue: r3.max_mpmatch_num_Rescue || 0,
              max_mpmatch_num_deployarmedforcetype: maxScoreOperator,
              max_mpmatch_num_deployarmedforcetype_image: r3.max_mpmatch_num_deployarmedforcetype ? dataManager.getOperatorImagePath(maxScoreOperator) : null,
              max_score_dteventtime: r3.max_score_dteventtime || '-',
              total_killnum: r3.total_killnum || 0,
              max_vehicle_usedtime_vehicleid: maxVehicleOperator,
              total_score: Number(r3.total_score || 0).toLocaleString(),
              max_mpmatch_num_GameTime: r3.max_mpmatch_num_GameTime ? `${Math.floor(Number(r3.max_mpmatch_num_GameTime) / 3600)}小时${Math.floor((Number(r3.max_mpmatch_num_GameTime) % 3600) / 60)}分钟` : '0',
              total_vehicle_killnum: r3.total_vehicle_killnum || 0,
              max_vehicle_usedtime_killplayer: r3.max_vehicle_usedtime_killplayer || 0,
              max_mpmatch_num_Score: Number(r3.max_mpmatch_num_Score || 0).toLocaleString()
            }
          }

          // 处理 report4 - 全面战场队友统计
          if (reportDm.report4) {
            const r4 = reportDm.report4
            const bestTeammateId = r4.max_mpwinnum_memberid
            const worstTeammateId = r4.max_mplosenum_memberid

            let bestTeammateName = '未知'
            let bestTeammateAvatar = ''
            let worstTeammateName = '未知'
            let worstTeammateAvatar = ''

            // 并行获取两个队友的信息
            const teammatePromises: Promise<{ type: string; info: unknown }>[] = []
            if (bestTeammateId) {
              teammatePromises.push(
                api.getFriendInfo(token, bestTeammateId)
                  .then(info => ({ type: 'best', info }))
                  .catch(() => ({ type: 'best', info: null }))
              )
            } else {
              teammatePromises.push(Promise.resolve({ type: 'best', info: null }))
            }

            if (worstTeammateId) {
              teammatePromises.push(
                api.getFriendInfo(token, worstTeammateId)
                  .then(info => ({ type: 'worst', info }))
                  .catch(() => ({ type: 'worst', info: null }))
              )
            } else {
              teammatePromises.push(Promise.resolve({ type: 'worst', info: null }))
            }

            const teammateResults = await Promise.all(teammatePromises)

            teammateResults.forEach(result => {
              const info = result.info as { success?: boolean; data?: { charac_name?: string; picurl?: string } } | null
              if (result.type === 'best' && info?.success && info.data) {
                const data = info.data
                bestTeammateName = data.charac_name || '未知'
                if (data.picurl) {
                  let avatarUrl = data.picurl
                  if (/^[0-9]+$/.test(avatarUrl)) {
                    avatarUrl = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${avatarUrl}.webp`
                  } else {
                    try {
                      avatarUrl = decodeURIComponent(avatarUrl)
                    } catch {
                      // 解码失败
                    }
                  }
                  bestTeammateAvatar = avatarUrl
                }
              } else if (result.type === 'worst' && info?.success && info.data) {
                const data = info.data
                worstTeammateName = data.charac_name || '未知'
                if (data.picurl) {
                  let avatarUrl = data.picurl
                  if (/^[0-9]+$/.test(avatarUrl)) {
                    avatarUrl = `https://wegame.gtimg.com/g.2001918-r.ea725/helper/df/skin/${avatarUrl}.webp`
                  } else {
                    try {
                      avatarUrl = decodeURIComponent(avatarUrl)
                    } catch {
                      // 解码失败
                    }
                  }
                  worstTeammateAvatar = avatarUrl
                }
              }
            })

            const bestOperator = r4.max_mpwinnum_member_deployarmedforcetype ? dataManager.getOperatorName(r4.max_mpwinnum_member_deployarmedforcetype) : '无'
            const worstOperator = r4.max_mplosenum_member_deployarmedforcetype ? dataManager.getOperatorName(r4.max_mplosenum_member_deployarmedforcetype) : '无'

            templateData.report4 = {
              best_teammate: {
                name: bestTeammateName,
                avatar: bestTeammateAvatar,
                intimacy: r4.max_mpwinnum_member_friendintimacy || 0,
                win_num: r4.max_mpwinnum_player_winmun || 0,
                lose_num: r4.max_mpwinnum_player_wlosemun || 0,
                kill_num: r4.max_mpwinnum_player_killnum || 0,
                assist: r4.max_mpwinnum_player_assist || 0,
                score: Number(r4.max_mpwinnum_player_score || 0).toLocaleString(),
                operator: bestOperator,
                operator_image: r4.max_mpwinnum_member_deployarmedforcetype ? dataManager.getOperatorImagePath(bestOperator) : null
              },
              worst_teammate: {
                name: worstTeammateName,
                avatar: worstTeammateAvatar,
                intimacy: r4.max_mplosenum_member_friendintimacy || 0,
                win_num: r4.max_mplosenum_player_winmun || 0,
                lose_num: r4.max_mplosenum_player_wlosemun || 0,
                kill_num: r4.max_mplosenum_player_killnum || 0,
                assist: r4.max_mplosenum_player_assist || 0,
                score: Number(r4.max_mplosenum_player_score || 0).toLocaleString(),
                operator: worstOperator,
                operator_image: r4.max_mplosenum_member_deployarmedforcetype ? dataManager.getOperatorImagePath(worstOperator) : null
              }
            }
          }

          // 处理 bk - 全面战场载具统计
          if (reportDm.bk) {
            const bk = reportDm.bk
            if (bk.mp_vehicleid_list && Array.isArray(bk.mp_vehicleid_list)) {
              templateData.bk = {
                vehicles: bk.mp_vehicleid_list.map(v => ({
                  vehicleid: v.vehicleid,
                  inum: v.inum || 0,
                  vehicle_name: `载具${v.vehicleid}`
                })).sort((a, b) => b.inum - a.inum),
                avg_score: Number(bk.mp_avgscore || 0).toFixed(1),
                support_count: bk.mp_supportcount || 0,
                support_details: {
                  '1001012': bk.mp_supportcount_1001012 || 0,
                  '1001011': bk.mp_supportcount_1001011 || 0,
                  '1001014': bk.mp_supportcount_1001014 || 0,
                  '1001015': bk.mp_supportcount_1001015 || 0
                }
              }
            } else {
              templateData.bk = {
                vehicles: [],
                avg_score: '0',
                support_count: 0,
                support_details: {}
              }
            }
          }
        } else {
          templateData.topFriends = []
        }

        // 渲染模板（与云崽版保持一致：两个模式都有数据时分开渲染）
        if (mode === 'sol') {
          if (!templateData.solData || (templateData.solData as { isEmpty?: boolean }).isEmpty) {
            return '暂无烽火地带周报数据，不打两把吗？'
          }
          return renderer.renderToMessage('weeklyReport', {
            ...templateData,
            mpData: null
          })
        }

        if (mode === 'mp') {
          if (!templateData.mpData || (templateData.mpData as { isEmpty?: boolean }).isEmpty) {
            return '暂无全面战场周报数据，不打两把吗？'
          }
          return renderer.renderToMessage('weeklyReport', {
            ...templateData,
            solData: null
          })
        }

        // 未指定模式时
        const hasSolData = templateData.solData && !(templateData.solData as { isEmpty?: boolean }).isEmpty
        const hasMpData = templateData.mpData && !(templateData.mpData as { isEmpty?: boolean }).isEmpty

        if (!hasSolData && !hasMpData) {
          return '暂无周报数据，不打两把吗？'
        }

        // 两个模式都有数据时，分开渲染并连续发送（与云崽版保持一致）
        if (hasSolData && hasMpData) {
          // 渲染烽火地带
          const solImage = await renderer.renderToMessage('weeklyReport', {
            ...templateData,
            mpData: null
          })
          if (solImage && typeof solImage !== 'string') {
            await session.send(h('message', [h.text('【烽火地带周报】\n'), solImage]))
          }

          // 渲染全面战场
          const mpImage = await renderer.renderToMessage('weeklyReport', {
            ...templateData,
            solData: null
          })
          if (mpImage && typeof mpImage !== 'string') {
            await session.send(h('message', [h.text('【全面战场周报】\n'), mpImage]))
          }
          return
        }

        // 只有一个模式有数据
        if (hasSolData) {
          return renderer.renderToMessage('weeklyReport', {
            ...templateData,
            mpData: null
          })
        } else {
          return renderer.renderToMessage('weeklyReport', {
            ...templateData,
            solData: null
          })
        }
      } catch (error) {
        logger.error('查询周报失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}

// 类型定义
interface WeeklySolData {
  total_sol_num?: number
  total_exacuation_num?: number
  GainedPrice_overmillion_num?: number
  total_Death_Count?: number
  total_Kill_Player?: number
  total_Kill_AI?: number
  total_Kill_Boss?: number
  Rank_Score?: number
  rise_Price?: number
  Gained_Price?: number
  consume_Price?: number
  Total_Price?: string
  total_Quest_num?: number
  use_Keycard_num?: number
  Mandel_brick_num?: number
  search_Birdsnest_num?: number
  Total_Mileage?: number
  total_Rescue_num?: number
  Kill_ByCrocodile_num?: number
  total_Online_Time?: number
  total_mapid_num?: string
  total_ArmedForceId_num?: string
  CarryOut_highprice_list?: string
  teammates?: SolTeammate[]
}

interface SolTeammate {
  friend_openid: string
  Friend_total_sol_num?: number
  Friend_is_Escape1_num?: number
  Friend_is_Escape2_num?: number
  Friend_total_sol_KillPlayer?: number
  Friend_total_sol_DeathCount?: number
  Friend_Sum_Gained_Price?: number
  Friend_Sum_Escape1_Gained_Price?: number
  Friend_Sum_Escape2_Gained_Price?: number
  Friend_consume_Price?: number
  Friend_Escape1_consume_Price?: number
  Friend_Escape2_consume_Price?: number
  Friend_total_sol_AssistCnt?: number
}

interface WeeklyMpData {
  total_num?: number
  win_num?: number
  Rank_Match_Score?: number
  Kill_Num?: number
  continuous_Kill_Num?: number
  total_score?: number
  Hit_Bullet_Num?: number
  Consume_Bullet_Num?: number
  SBattle_Support_UseNum?: number
  SBattle_Support_CostScore?: number
  Rescue_Teammate_Count?: number
  by_Rescue_num?: number
  max_inum_mapid?: string
  max_inum_DeployArmedForceType?: string | number
  DeployArmedForceType_inum?: number
  DeployArmedForceType_KillNum?: number
  DeployArmedForceType_gametime?: number
  teammates?: MpTeammate[]
}

interface MpTeammate {
  friend_openid: string
  Friend_mp_total_num?: number
  Friend_mp_win_num?: number
  Friend_mp_KillNum?: number
  Friend_mp_Death?: number
  Friend_mp_Assist?: number
  Friend_Sum_Score?: number
  Friend_Max_Score?: number
}

interface ParsedItem {
  [key: string]: string | number
}

interface AssetTrendPoint {
  dayName: string
  price: string
  rawPrice: number
  x: string
  y: string
  xPercent: string
  yPercent: string
}

interface AssetTrend {
  startPrice: string
  endPrice: string
  maxPrice: string
  minPrice: string
  chartWidth: number
  chartHeight: number
  pathData: string
  allDays: AssetTrendPoint[]
}

// 解析资产趋势数据
function parseAssetTrend(totalPrice?: string): AssetTrend | null {
  if (!totalPrice) return null

  const prices = totalPrice.split(',')
  const dayMap: Record<string, string> = {
    'Monday': '周一',
    'Tuesday': '周二',
    'Wednesday': '周三',
    'Thursday': '周四',
    'Friday': '周五',
    'Saturday': '周六',
    'Sunday': '周日'
  }

  // 解析所有7天的数据
  const dailyPrices: Record<string, number> = {}
  prices.forEach(priceStr => {
    const parts = priceStr.split('-')
    if (parts.length >= 3) {
      const dayName = parts[0]
      const price = parseInt(parts[2])
      if (!isNaN(price)) {
        dailyPrices[dayName] = price
      }
    }
  })

  const monday = dailyPrices['Monday']
  const sunday = dailyPrices['Sunday']

  if (monday === undefined || sunday === undefined) return null

  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const allPrices = allDays.map(day => dailyPrices[day]).filter(p => p !== undefined)

  if (allPrices.length === 0) return null

  const maxPrice = Math.max(...allPrices)
  const minPrice = Math.min(...allPrices)
  const priceRange = maxPrice - minPrice || 1

  // 资产趋势图加宽
  const chartWidth = 2000
  const chartHeight = 200
  const padding = { top: 20, right: 10, bottom: 30, left: 10 }
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom

  const points: AssetTrendPoint[] = allDays.map((day, index) => {
    const price = dailyPrices[day] || 0
    const x = padding.left + (index / (allDays.length - 1)) * plotWidth
    const y = padding.top + plotHeight - ((price - minPrice) / priceRange) * plotHeight

    return {
      dayName: dayMap[day] || day,
      price: price ? price.toLocaleString() : '-',
      rawPrice: price || 0,
      x: x.toFixed(1),
      y: y.toFixed(1),
      xPercent: ((x / chartWidth) * 100).toFixed(2),
      yPercent: ((y / chartHeight) * 100).toFixed(2)
    }
  })

  // 生成折线路径
  let pathData = ''
  if (points.length > 0) {
    pathData = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      pathData += ` L ${points[i].x},${points[i].y}`
    }
  }

  return {
    startPrice: monday.toLocaleString(),
    endPrice: sunday.toLocaleString(),
    maxPrice: maxPrice.toLocaleString(),
    minPrice: minPrice.toLocaleString(),
    chartWidth,
    chartHeight,
    pathData,
    allDays: points
  }
}

// 解析干员使用数据
function parseOperators(dataStr: string | undefined, dataManager: DataManager): Array<{ id: string; count: number; name: string; imagePath: string | null }> {
  if (!dataStr || typeof dataStr !== 'string') return []

  try {
    const opStrings = dataStr.includes('#') ? dataStr.split('#') : [dataStr]
    return opStrings.map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        const parsed = JSON.parse(correctedJSON)
        const operatorId = parsed.ArmedForceId
        const operatorName = dataManager.getOperatorName(operatorId)
        return {
          id: operatorId,
          count: parsed.inum,
          name: operatorName,
          imagePath: dataManager.getOperatorImagePath(operatorName)
        }
      } catch {
        return null
      }
    }).filter((item): item is { id: string; count: number; name: string; imagePath: string | null } => item !== null)
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

// 解析地图使用数据
function parseMaps(dataStr: string | undefined, dataManager: DataManager, mode: 'sol' | 'mp'): Array<{ id: string; count: number; name: string; imagePath: string | null }> {
  if (!dataStr || typeof dataStr !== 'string') return []

  try {
    const mapStrings = dataStr.includes('#') ? dataStr.split('#') : [dataStr]
    return mapStrings.map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        const parsed = JSON.parse(correctedJSON)
        const mapName = dataManager.getMapName(parsed.MapId)
        return {
          id: parsed.MapId,
          count: parsed.inum,
          name: mapName,
          imagePath: dataManager.getMapImagePath(mapName, mode)
        }
      } catch {
        return null
      }
    }).filter((item): item is { id: string; count: number; name: string; imagePath: string | null } => item !== null)
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

// 解析高价值物资数据
function parseHighPriceItems(dataStr: string | undefined): Array<{ name: string; price: string }> {
  if (!dataStr || typeof dataStr !== 'string') return []

  try {
    const items = dataStr.split('#').map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        return JSON.parse(correctedJSON)
      } catch {
        return null
      }
    }).filter(Boolean)

    items.sort((a, b) => b.iPrice - a.iPrice)
    return items.slice(0, 5).map(item => ({
      name: item.auctontype || '物品',
      price: item.iPrice.toLocaleString()
    }))
  } catch {
    return []
  }
}

// 解析并获取名称
function parseAndGetName(
  dataStr: string | undefined,
  idKey: string,
  countKey: string,
  getNameFunc: (id: string) => string
): string {
  if (!dataStr || typeof dataStr !== 'string') return '无'

  try {
    const items = dataStr.split('#').map(s => {
      try {
        const correctedJSON = s.replace(/'/g, '"').replace(/([a-zA-Z0-9_]+):/g, '"$1":')
        return JSON.parse(correctedJSON) as ParsedItem
      } catch {
        return null
      }
    }).filter((item): item is ParsedItem => item !== null)

    if (items.length === 0) return '无'

    const mostUsed = items.reduce((a, b) =>
      (Number(a[countKey]) > Number(b[countKey]) ? a : b)
    )
    return getNameFunc(String(mostUsed[idKey]))
  } catch {
    return '无'
  }
}

// 解析烽火地带队友数据（与云崽版保持一致）
function parseSolTeammates(
  teammates: SolTeammate[],
  nicknameMap: Map<string, string>,
  avatarMap: Map<string, string>
): Array<{
  name: string
  avatar: string
  total_sol_num: number
  escape1: number
  escape2: number
  killPlayer: number
  death: number
  totalGained: string
  successGain: string
  failGain: string
  totalCost: string
  successCost: string
  failCost: string
  assistCnt: number
}> {
  // 过滤有效队友（有对局数的）
  const activeTeammates = teammates.filter(t => (t.Friend_total_sol_num || 0) > 0)
  
  return activeTeammates.map(t => {
    const teammateName = nicknameMap.get(t.friend_openid) || `...${t.friend_openid.slice(-6)}`
    const teammateAvatar = avatarMap.get(t.friend_openid) || ''
    const sumGained = t.Friend_Sum_Gained_Price
    const totalGained = Number(sumGained) ||
      (Number(t.Friend_Sum_Escape1_Gained_Price || 0) +
        Number(t.Friend_Sum_Escape2_Gained_Price || 0))
    
    return {
      name: teammateName,
      avatar: teammateAvatar,
      total_sol_num: t.Friend_total_sol_num || 0,
      escape1: t.Friend_is_Escape1_num || 0,
      escape2: t.Friend_is_Escape2_num || 0,
      killPlayer: t.Friend_total_sol_KillPlayer || 0,
      death: t.Friend_total_sol_DeathCount || 0,
      totalGained: totalGained.toLocaleString(),
      successGain: Number(t.Friend_Sum_Escape1_Gained_Price || 0).toLocaleString(),
      failGain: Number(t.Friend_Sum_Escape2_Gained_Price || 0).toLocaleString(),
      totalCost: Number(t.Friend_consume_Price || 0).toLocaleString(),
      successCost: Number(t.Friend_Escape1_consume_Price || 0).toLocaleString(),
      failCost: Number(t.Friend_Escape2_consume_Price || 0).toLocaleString(),
      assistCnt: t.Friend_total_sol_AssistCnt || 0
    }
  })
}

// 解析全面战场队友数据（与云崽版保持一致）
function parseMpTeammates(
  teammates: MpTeammate[],
  nicknameMap: Map<string, string>,
  avatarMap: Map<string, string>
): Array<{
  name: string
  avatar: string
  total_num: number
  win_num: number
  winRate: string
  kda: string
  sumScore: string
  maxScore: string
}> {
  // 过滤有效队友
  const activeTeammates = teammates.filter(t => 
    (t.Friend_mp_total_num || 0) > 0 || 
    (t.Friend_mp_win_num || 0) > 0 || 
    (t.Friend_mp_KillNum || 0) > 0
  )
  
  return activeTeammates.map(t => {
    const teammateName = nicknameMap.get(t.friend_openid) || `...${t.friend_openid.slice(-6)}`
    const teammateAvatar = avatarMap.get(t.friend_openid) || ''
    const totalGames = t.Friend_mp_total_num || 0
    const winGames = t.Friend_mp_win_num || 0
    const winRate = totalGames > 0 ? `${((winGames / totalGames) * 100).toFixed(1)}%` : '0%'
    
    return {
      name: teammateName,
      avatar: teammateAvatar,
      total_num: totalGames,
      win_num: winGames,
      winRate: winRate,
      kda: `${t.Friend_mp_KillNum || 0}/${t.Friend_mp_Death || 0}/${t.Friend_mp_Assist || 0}`,
      sumScore: (t.Friend_Sum_Score || 0).toLocaleString(),
      maxScore: (t.Friend_Max_Score || 0).toLocaleString()
    }
  })
}

// reportDm 数据类型定义（与云崽版保持一致）
interface ReportDmData {
  wbn?: {
    friends?: WbnFriend[]
  }
  report1?: {
    total_sell_price?: number | string
  }
  report3?: Report3Data
  report4?: Report4Data
  bk?: BkData
}

interface WbnFriend {
  Friendopenid: string
  total_gained_price?: number | string
  total_GainedPrice?: number | string
  max_GainedPrice?: number | string
  win_num?: number
  lose_num?: number
  FriendIntimacy?: number
  CarryOut_highprice_list?: Array<{ itemid?: string | number; iPrice?: number; inum?: number; quality?: number }>
  CarryOut_top2_highprice_list?: Array<{ itemid?: string | number; iPrice?: number; inum?: number; quality?: number }>
}

interface Report3Data {
  max_mpmatch_num?: number
  max_vehicle_usedtime?: number | string
  total_killvehicle?: number
  total_vehicle_usedtime?: number | string
  total_vehicle_inum?: number
  max_score_killnum?: number
  max_score_death?: number
  win_mpmatch_num?: number
  max_score_assist?: number
  total_mpmatch_num?: number
  max_score_mapid?: string | number
  max_mpmatch_num_Rescue?: number
  max_mpmatch_num_deployarmedforcetype?: string | number
  max_score_dteventtime?: string
  total_killnum?: number
  max_vehicle_usedtime_vehicleid?: string | number
  total_score?: number | string
  max_mpmatch_num_GameTime?: number | string
  total_vehicle_killnum?: number
  max_vehicle_usedtime_killplayer?: number
  max_mpmatch_num_Score?: number | string
}

interface Report4Data {
  max_mpwinnum_memberid?: string
  max_mplosenum_memberid?: string
  max_mpwinnum_member_friendintimacy?: number
  max_mpwinnum_player_winmun?: number
  max_mpwinnum_player_wlosemun?: number
  max_mpwinnum_player_killnum?: number
  max_mpwinnum_player_assist?: number
  max_mpwinnum_player_score?: number | string
  max_mpwinnum_member_deployarmedforcetype?: string | number
  max_mplosenum_member_friendintimacy?: number
  max_mplosenum_player_winmun?: number
  max_mplosenum_player_wlosemun?: number
  max_mplosenum_player_killnum?: number
  max_mplosenum_player_assist?: number
  max_mplosenum_player_score?: number | string
  max_mplosenum_member_deployarmedforcetype?: string | number
}

interface BkData {
  mp_vehicleid_list?: Array<{ vehicleid: string | number; inum?: number }>
  mp_avgscore?: number | string
  mp_supportcount?: number
  mp_supportcount_1001012?: number
  mp_supportcount_1001011?: number
  mp_supportcount_1001014?: number
  mp_supportcount_1001015?: number
}
