import { Context } from 'koishi'
import { ApiService } from '../../api'
import { DataManager } from '../../data'
import { getActiveToken } from '../../database'
import { handleApiError, decode, getUserDisplayInfo } from '../../utils'
import { Renderer } from '../../render'

/**
 * 注册个人数据查询相关命令
 */
export function registerPersonalDataCommands(
  ctx: Context,
  api: ApiService,
  dataManager: DataManager,
  renderer: Renderer
) {
  const logger = ctx.logger('delta-force')

  // 个人数据查询
  ctx.command('df.data [args:text]', '查看个人游戏数据统计')
    .alias('df.数据')
    .alias('df.个人数据')
    .usage('参数说明:\n  sol/烽火 - 仅查询烽火地带\n  mp/全面 - 仅查询全面战场\n  数字 - 指定赛季\n  all - 所有赛季\n示例: df.data sol 7')
    .action(async ({ session }, args) => {
      const userId = session.userId
      const platform = session.platform

      const token = await getActiveToken(ctx, userId, platform)
      if (!token) {
        return '您尚未登录，请先使用 df.login 登录'
      }

      // 解析参数
      let mode = ''
      let season: string | number = 7
      
      if (args) {
        const argList = args.split(' ').filter(Boolean)
        for (const arg of argList) {
          if (['烽火', '烽火地带', 'sol', '摸金'].includes(arg)) {
            mode = 'sol'
          } else if (['全面', '全面战场', '战场', 'mp'].includes(arg)) {
            mode = 'mp'
          } else if (['all', '全部'].includes(arg.toLowerCase())) {
            season = 'all'
          } else if (!isNaN(Number(arg))) {
            season = parseInt(arg)
          }
        }
      }

      await session.send('正在查询个人数据，请稍候...')

      try {
        const res = await api.getPersonalData(token, mode, season)

        if (!res) {
          return '查询数据失败，请检查网络或联系管理员。'
        }

        if (res.success === false) {
          return `查询数据失败: ${res.message || '未知API错误'}`
        }

        // 解析数据
        let solDetail = null
        let mpDetail = null

        if (mode) {
          const singleModeData = (res.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined
          const innerData = singleModeData?.data as Record<string, unknown> | undefined
          if (innerData?.solDetail) solDetail = innerData.solDetail
          if (innerData?.mpDetail) mpDetail = innerData.mpDetail
        } else {
          const allModesData = res.data as Record<string, unknown>
          const solData = allModesData?.sol as Record<string, unknown> | undefined
          const mpData = allModesData?.mp as Record<string, unknown> | undefined
          
          if (solData?.data) {
            const solInner = (solData.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined
            if (solInner?.solDetail) solDetail = solInner.solDetail
          }
          if (mpData?.data) {
            const mpInner = (mpData.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined
            if (mpInner?.mpDetail) mpDetail = mpInner.mpDetail
          }
        }

        if (!solDetail && !mpDetail) {
          return '暂未查询到该账号的游戏数据。'
        }

        // 获取用户信息
        const userDisplayInfo = await getUserDisplayInfo(api, token, userId, session.username || '用户')

        const now = new Date()
        const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

        const templateData: Record<string, unknown> = {
          nickname: userDisplayInfo.userName,
          userName: userDisplayInfo.userName,
          userAvatar: userDisplayInfo.userAvatar,
          userId: userId,
          qqAvatarUrl: userDisplayInfo.qqAvatarUrl,
          currentDate: currentDate,
          season: season === 'all' ? '全部' : season
        }

        // 处理烽火地带数据
        if ((!mode || mode === 'sol') && solDetail) {
          const solData = solDetail as Record<string, unknown>
          const solRank = solData.levelScore ? dataManager.getRankByScore(solData.levelScore as number, 'sol') : '-'
          const solRankImage = solRank !== '-' ? dataManager.getRankImage(solData.levelScore as number, 'sol') : null

          // 格式化函数
          const totalGameTime = (seconds: number) => {
            if (!seconds || isNaN(seconds)) return '0分钟'
            const hours = Math.floor(seconds / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            return `${hours}小时${minutes}分钟`
          }

          const formatGainedPrice = (price: number) => {
            if (!price || isNaN(price)) return '-'
            return `${(price / 1000000).toFixed(2)}M`
          }

          const formatKd = (kd: number) => {
            if (kd === null || kd === undefined || isNaN(kd)) return '-'
            return (kd / 100).toFixed(2)
          }

          const formatPrice = (price: number) => {
            if (!price || isNaN(price)) return '-'
            if (price >= 1000000000) {
              return (price / 1000000000).toFixed(2) + 'B'
            } else if (price >= 1000000) {
              return (price / 1000000).toFixed(2) + 'M'
            } else if (price >= 1000) {
              return (price / 1000).toFixed(1) + 'K'
            } else {
              return price.toFixed(0)
            }
          }

          // 处理地图列表
          const mapOrder = ['零号大坝', '长弓溪谷', '巴克什', '航天基地', '潮汐监狱']
          const solMapListRaw = ((solData.mapList || []) as Array<Record<string, unknown>>).map(map => {
            const mapName = dataManager.getMapName(map.mapID as string)
            const mapImage = dataManager.getMapImagePath(mapName, 'sol')
            const baseMapName = mapName.replace(/-?(常规|机密|绝密|水淹|适应)$/, '')
            return {
              mapID: map.mapID,
              totalCount: map.totalCount as number || 0,
              mapName,
              baseMapName,
              mapImage
            }
          })

          // 按基础地图名分组
          const mapGroups: Record<string, typeof solMapListRaw> = {}
          solMapListRaw.forEach(map => {
            if (!mapGroups[map.baseMapName]) {
              mapGroups[map.baseMapName] = []
            }
            mapGroups[map.baseMapName].push(map)
          })

          let solMapList = mapOrder
            .filter(baseName => mapGroups[baseName] && mapGroups[baseName].length > 0)
            .map(baseName => {
              const maps = mapGroups[baseName]
              maps.sort((a, b) => (b.totalCount as number || 0) - (a.totalCount as number || 0))
              return {
                baseMapName: baseName,
                maps: maps
              }
            })

          // 合并单个地图组
          const resultList: typeof solMapList = []
          let pendingSingleGroups: typeof solMapList = []

          const mergePendingGroups = () => {
            if (pendingSingleGroups.length > 1) {
              const mergedMaps = pendingSingleGroups.flatMap(sg => sg.maps)
              resultList.push({ baseMapName: 'merged', maps: mergedMaps })
              pendingSingleGroups = []
            } else if (pendingSingleGroups.length === 1) {
              resultList.push(pendingSingleGroups[0])
              pendingSingleGroups = []
            }
          }

          solMapList.forEach((group) => {
            if (group.maps && group.maps.length === 1) {
              pendingSingleGroups.push(group)
            } else {
              mergePendingGroups()
              resultList.push(group)
            }
          })
          mergePendingGroups()
          solMapList = resultList

          // 批量获取物品名称（与云崽版一致）
          const collectionIDs = ((solData.redCollectionDetail || []) as Array<Record<string, unknown>>).map(item => String(item.objectID))
          const weaponIDs = ((solData.gunPlayList || []) as Array<Record<string, unknown>>).map(weapon => String(weapon.objectID))
          const allObjectIDs = [...new Set([...collectionIDs, ...weaponIDs])]
          
          // 调用API批量获取物品名称
          const objectNameMap: Record<string, string> = {}
          if (allObjectIDs.length > 0) {
            try {
              const idsString = allObjectIDs.join(',')
              const searchRes = await api.searchObject('', idsString)
              if (searchRes?.success && searchRes?.data) {
                const keywords = (searchRes.data as { keywords?: Array<{ objectID: string | number; name?: string; objectName?: string }> })?.keywords
                if (keywords && Array.isArray(keywords)) {
                  keywords.forEach(item => {
                    if (item.objectID) {
                      const id = String(item.objectID)
                      const name = item.name || item.objectName
                      if (name) {
                        objectNameMap[id] = name
                      }
                    }
                  })
                  logger.debug(`成功获取 ${Object.keys(objectNameMap).length}/${allObjectIDs.length} 个物品名称`)
                }
              }
            } catch (error) {
              logger.warn('获取物品名称失败:', error)
            }
          }

          // 处理大红收藏
          const solRedCollection = ((solData.redCollectionDetail || []) as Array<Record<string, unknown>>)
            .map(item => ({
              objectID: item.objectID,
              objectName: objectNameMap[String(item.objectID)] || (item.objectName as string) || `物品(${item.objectID})`,
              imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${item.objectID}.png`,
              price: item.price as number || 0,
              priceFormatted: formatPrice(item.price as number)
            }))
            .sort((a, b) => b.price - a.price)
            .slice(0, 10)

          // 处理武器列表
          const solGunPlayList = ((solData.gunPlayList || []) as Array<Record<string, unknown>>)
            .map(weapon => ({
              objectID: weapon.objectID,
              weaponName: objectNameMap[String(weapon.objectID)] || `武器(${weapon.objectID})`,
              imageUrl: `https://playerhub.df.qq.com/playerhub/60004/object/${weapon.objectID}.png`,
              totalPrice: weapon.totalPrice as number || 0,
              totalPriceFormatted: weapon.totalPrice ? ((weapon.totalPrice as number) / 1000000).toFixed(2) + 'M' : '-',
              escapeRate: (weapon.fightCount as number) > 0 
                ? (((weapon.escapeCount as number) / (weapon.fightCount as number)) * 100).toFixed(1) + '%' 
                : '-'
            }))
            .sort((a, b) => b.totalPrice - a.totalPrice)
            .slice(0, 10)

          templateData.solDetail = {
            ...solData,
            totalGameTime: totalGameTime(solData.totalGameTime as number),
            totalGainedPriceFormatted: formatGainedPrice(solData.totalGainedPrice as number),
            profitLossRatioFormatted: solData.profitLossRatio 
              ? ((solData.profitLossRatio as number) / 100000).toFixed(1) + 'K' 
              : '-',
            lowKD: formatKd(solData.lowKillDeathRatio as number),
            medKD: formatKd(solData.medKillDeathRatio as number),
            highKD: formatKd(solData.highKillDeathRatio as number),
            totalFight: solData.totalFight || 0,
            totalKill: solData.totalKill || 0,
            userRank: solData.userRank || '-',
            mapList: solMapList,
            redCollectionList: solRedCollection,
            gunPlayList: solGunPlayList
          }
          templateData.solRank = solRank
          templateData.solRankImage = solRankImage
        }

        // 处理全面战场数据
        if ((!mode || mode === 'mp') && mpDetail) {
          const mpData = mpDetail as Record<string, unknown>
          const mpRank = mpData.levelScore ? dataManager.getRankByScore(mpData.levelScore as number, 'tdm') : '-'
          const mpRankImage = mpRank !== '-' ? dataManager.getRankImage(mpData.levelScore as number, 'tdm') : null

          const mpMapList = ((mpData.mapList || []) as Array<Record<string, unknown>>)
            .map(map => {
              const mapName = dataManager.getMapName(map.mapID as string)
              const mapImage = dataManager.getMapImagePath(mapName, 'mp')
              return {
                mapID: map.mapID,
                totalCount: map.totalCount as number || 0,
                mapName,
                mapImage
              }
            })
            .sort((a, b) => b.totalCount - a.totalCount)
            .slice(0, 10)

          const formatMPGameTime = (minutes: number) => {
            if (!minutes || isNaN(minutes)) return '0分钟'
            const hours = Math.floor(minutes / 60)
            const mins = minutes % 60
            return `${hours}小时${mins}分钟`
          }

          templateData.mpDetail = {
            ...mpData,
            totalGameTime: formatMPGameTime(mpData.totalGameTime as number),
            avgKillPerMinuteFormatted: mpData.avgKillPerMinute 
              ? ((mpData.avgKillPerMinute as number) / 100).toFixed(2) 
              : '-',
            avgScorePerMinuteFormatted: mpData.avgScorePerMinute 
              ? ((mpData.avgScorePerMinute as number) / 100).toFixed(2) 
              : '-',
            totalFight: mpData.totalFight || 0,
            totalWin: mpData.totalWin || 0,
            totalVehicleDestroyed: mpData.totalVehicleDestroyed || 0,
            mapList: mpMapList
          }
          templateData.mpRank = mpRank
          templateData.mpRankImage = mpRankImage
        }

        // 渲染图片
        const hasBothModes = templateData.solDetail && templateData.mpDetail

        if (hasBothModes) {
          // 分别渲染两个模式
          // 烽火地带
          const solTemplateData = {
            ...templateData,
            solDetail: templateData.solDetail,
            solRank: templateData.solRank,
            solRankImage: templateData.solRankImage,
            mpDetail: null
          }
          const solImage = await renderer.renderToMessage('personalData', solTemplateData, { width: 2000 })
          await session.send(solImage)

          // 全面战场
          const mpTemplateData = {
            ...templateData,
            mpDetail: templateData.mpDetail,
            mpRank: templateData.mpRank,
            mpRankImage: templateData.mpRankImage,
            solDetail: null
          }
          const mpImage = await renderer.renderToMessage('personalData', mpTemplateData, { width: 2000 })
          await session.send(mpImage)
          return
        } else {
          // 单模式渲染
          const imageResult = await renderer.renderToMessage('personalData', templateData, { width: 2000 })
          return imageResult
        }
      } catch (error) {
        logger.error('查询个人数据失败:', error)
        return `查询失败: ${(error as Error).message}`
      }
    })
}
