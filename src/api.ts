import { Context } from 'koishi'
import { Config } from './config'
import { ApiResponse, LoginResponse, BindCharacterResponse, UserInfo, CareerData, UserListItem } from './types'

/**
 * Delta Force API 服务类
 */
export class ApiService {
  constructor(
    private ctx: Context,
    private config: Config
  ) {}

  // ==================== 基础请求方法 ====================

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.config.apiBaseUrl}${endpoint}`

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.config.apiKey}`,
      }

      this.ctx.logger('delta-force').debug(`API请求: ${method} ${url}`, data ? { params: data } : '')

      let response: unknown
      if (method === 'GET') {
        response = await this.ctx.http.get(url, {
          params: data,
          headers,
        })
      } else {
        response = await this.ctx.http.post(url, data, {
          headers,
        })
      }

      return response as ApiResponse<T>
    } catch (error) {
      interface HttpError {
        response?: {
          status: number
          statusText: string
          data?: string | { substring?: (length: number) => string }
        }
      }

      const err = error as Error & HttpError

      if (err.response) {
        const responseData = typeof err.response.data === 'string'
          ? err.response.data.substring(0, 200)
          : err.response.data

        this.ctx.logger('delta-force').error(
          `API请求失败: ${method} ${this.config.apiBaseUrl}${endpoint}`,
          `状态码: ${err.response.status}`,
          `响应: ${responseData}`
        )
        return {
          success: false,
          code: err.response.status,
          message: `HTTP ${err.response.status}: ${err.response.statusText}`,
        }
      }

      this.ctx.logger('delta-force').error('API请求异常:', error)
      return {
        success: false,
        code: -1,
        message: err.message || '请求失败',
      }
    }
  }

  // ==================== 登录相关接口 ====================

  /** 获取登录二维码 */
  async getLoginQr(platform: string = 'qq'): Promise<LoginResponse> {
    return this.request<LoginResponse>('GET', `/login/${platform}/qr`)
  }

  /** 获取登录状态 */
  async getLoginStatus(platform: string, frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', `/login/${platform}/status`, { frameworkToken })
  }

  /** 刷新登录状态 */
  async refreshLogin(platform: string, frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', `/login/${platform}/refresh`, { frameworkToken })
  }

  /** 删除QQ登录数据 */
  async deleteQqLogin(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/login/qq/delete', { frameworkToken })
  }

  /** 删除微信登录数据 */
  async deleteWechatLogin(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/login/wechat/delete', { frameworkToken })
  }

  /** 获取封禁历史 */
  async getBanHistory(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/login/qqsafe/ban', { frameworkToken })
  }

  // ==================== 用户账号相关接口 ====================

  /** 绑定用户 Token */
  async bindUser(data: {
    platformID: string
    frameworkToken: string
    clientID: string
    clientType: string
  }): Promise<ApiResponse> {
    return this.request('POST', '/user/bind', data)
  }

  /** 解绑用户 Token */
  async unbindUser(data: {
    platformID: string
    frameworkToken: string
    clientID: string
    clientType: string
  }): Promise<ApiResponse> {
    return this.request('POST', '/user/unbind', data)
  }

  /** 获取用户绑定的 Token 列表 */
  async getUserList(platformID: string, clientID: string): Promise<ApiResponse<UserListItem[]>> {
    return this.request('GET', '/user/list', {
      platformID,
      clientID,
      clientType: 'koishi',
    })
  }

  // ==================== 个人数据相关接口 ====================

  /** 绑定游戏内角色 */
  async bindCharacter(frameworkToken: string): Promise<BindCharacterResponse> {
    return this.request('GET', '/df/person/bind', {
      frameworkToken,
      method: 'bind',
    })
  }

  /** 获取个人信息 */
  async getPersonalInfo(frameworkToken: string): Promise<ApiResponse<{
    userData: unknown
    careerData: CareerData
  }> & {
    roleInfo: UserInfo
  }> {
    return this.request('GET', '/df/person/personalInfo', { frameworkToken }) as Promise<ApiResponse<{
      userData: unknown
      careerData: CareerData
    }> & {
      roleInfo: UserInfo
    }>
  }

  /** 获取个人数据（烽火地带和全面战场） */
  async getPersonalData(frameworkToken: string, type?: string, seasonid?: string | number): Promise<ApiResponse> {
    const params: Record<string, string | number> = { frameworkToken }
    if (type) params.type = type
    if (seasonid && seasonid !== 'all') params.seasonid = seasonid
    return this.request('GET', '/df/person/personalData', params)
  }

  /** 获取战绩记录 */
  async getRecordList(
    frameworkToken: string,
    type: string = 'sol',
    page: number = 1
  ): Promise<ApiResponse> {
    const typeMap: Record<string, number> = {
      'sol': 4,
      'mp': 5,
    }
    const numericType = typeMap[type] || 4

    return this.request('GET', '/df/person/record', {
      frameworkToken,
      type: numericType,
      page,
    })
  }

  /** 获取地图数据统计 */
  async getMapStats(
    frameworkToken: string,
    seasonid: string = 'all',
    type: string = 'sol',
    mapId?: string
  ): Promise<ApiResponse> {
    const params: Record<string, string> = {
      frameworkToken,
      type,
      serial: seasonid,
    }
    if (mapId) {
      params.mapId = mapId
    }
    return this.request('GET', '/df/person/mapStats', params)
  }

  /** 获取货币信息 */
  async getMoney(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/df/person/money', { frameworkToken })
  }

  /** 获取流水记录 */
  async getFlows(frameworkToken: string, type?: number, page?: number): Promise<ApiResponse> {
    const params: Record<string, string | number> = { frameworkToken }
    if (type) params.type = type
    if (page) params.page = page
    return this.request('GET', '/df/person/flows', params)
  }

  /** 获取个人藏品 */
  async getCollection(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/df/person/collection', { frameworkToken })
  }

  /** 获取大红称号 */
  async getTitle(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/df/person/title', { frameworkToken })
  }

  /** 获取藏品解锁记录列表 */
  async getRedList(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/df/person/redlist', { frameworkToken })
  }

  /** 获取指定藏品的详细记录 */
  async getRedRecord(frameworkToken: string, objectid: string): Promise<ApiResponse> {
    return this.request('GET', '/df/person/redone', { frameworkToken, objectid })
  }

  /** 获取好友信息 */
  async getFriendInfo(frameworkToken: string, openid: string): Promise<ApiResponse> {
    return this.request('GET', '/df/person/friendinfo', { frameworkToken, openid })
  }

  // ==================== 战报相关接口 ====================

  /** 获取日报 */
  async getDailyReport(frameworkToken: string, type?: string, date?: string): Promise<ApiResponse> {
    const params: Record<string, string> = { frameworkToken }
    if (type) params.type = type
    if (date) params.date = date
    return this.request('GET', '/df/person/dailyRecord', params)
  }

  /** 获取周报 */
  async getWeeklyReport(
    frameworkToken: string,
    type?: string,
    isShowNullFriend: boolean = true,
    date?: string
  ): Promise<ApiResponse> {
    const params: Record<string, string> = { 
      frameworkToken,
      isShowNullFriend: String(isShowNullFriend)
    }
    if (type) params.type = type
    if (date) params.date = date
    return this.request('GET', '/df/person/weeklyRecord', params)
  }

  /** AI评价战绩 */
  async getAiCommentary(
    frameworkToken: string,
    type: string = 'sol',
    preset?: string,
    conversationId?: string
  ): Promise<ApiResponse> {
    const params: Record<string, string> = {
      frameworkToken,
      type,
    }
    if (preset) params.preset = preset
    if (conversationId) params.conversation_id = conversationId
    return this.request('POST', '/df/person/ai', params)
  }

  /** 获取AI评价预设列表 */
  async getAiPresets(): Promise<ApiResponse> {
    return this.request('GET', '/df/person/ai/presets')
  }

  // ==================== 特勤处相关接口 ====================

  /** 获取特勤处状态 */
  async getPlaceStatus(frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', '/df/place/status', { frameworkToken })
  }

  /** 获取特勤处信息 */
  async getPlaceInfo(frameworkToken: string, place?: string): Promise<ApiResponse> {
    const params: Record<string, string> = { frameworkToken }
    if (place) params.place = place
    return this.request('GET', '/df/place/info', params)
  }

  /** 获取制造材料最低价格 */
  async getMaterialPrice(id?: string): Promise<ApiResponse> {
    const params: Record<string, string> = {}
    if (id) params.id = id
    return this.request('GET', '/df/place/materialPrice', params)
  }

  /** 获取利润历史 */
  async getProfitHistory(params: {
    objectId?: string
    objectName?: string
    place?: string
  }): Promise<ApiResponse> {
    return this.request('GET', '/df/place/profitHistory', params)
  }

  /** 获取利润排行榜 V1 */
  async getProfitRankV1(params: {
    type: string
    place?: string
    limit?: number
    timestamp?: number
  }): Promise<ApiResponse> {
    return this.request('GET', '/df/place/profitRank/v1', params)
  }

  /** 获取利润排行榜 V2 (最高利润) */
  async getProfitRankV2(params: {
    type: string
    place?: string
    id?: string
  }): Promise<ApiResponse> {
    return this.request('GET', '/df/place/profitRank/v2', params)
  }

  // ==================== 开黑房间接口 ====================

  /** 获取房间列表 */
  async getRoomList(clientID: string, type?: string, hasPassword?: string): Promise<ApiResponse> {
    const params: Record<string, string> = { clientID }
    if (type) params.type = type
    if (hasPassword !== undefined) params.hasPassword = hasPassword
    return this.request('GET', '/df/tools/Room/list', params)
  }

  /** 获取房间信息 */
  async getRoomInfo(frameworkToken: string, clientID: string): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/Room/info', { frameworkToken, clientID })
  }

  /** 创建房间 */
  async createRoom(
    frameworkToken: string,
    clientID: string,
    type: string,
    mapid?: string,
    tag?: string,
    password?: string,
    onlyCurrentlyClient?: boolean
  ): Promise<ApiResponse> {
    const data: Record<string, string | boolean> = {
      frameworkToken,
      clientID,
      type,
    }
    if (mapid) data.mapid = mapid
    if (tag) data.tag = tag
    if (password) data.password = password
    if (onlyCurrentlyClient !== undefined) data.onlyCurrentlyClient = String(onlyCurrentlyClient)
    return this.request('POST', '/df/tools/Room/creat', data)
  }

  /** 加入房间 */
  async joinRoom(frameworkToken: string, clientID: string, roomId: string, password?: string): Promise<ApiResponse> {
    const data: Record<string, string> = { frameworkToken, clientID, roomId }
    if (password) data.password = password
    return this.request('POST', '/df/tools/Room/join', data)
  }

  /** 退出房间 */
  async quitRoom(frameworkToken: string, clientID: string, roomId: string): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/Room/quit', { frameworkToken, clientID, roomId })
  }

  /** 踢人 */
  async kickMember(frameworkToken: string, clientID: string, roomId: string, targetFrameworkToken: string): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/Room/kick', { frameworkToken, clientID, roomId, targetFrameworkToken })
  }

  /** 获取房间标签 */
  async getRoomTags(): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/Room/tags')
  }

  // ==================== 物品相关接口 ====================

  /** 获取地图列表 */
  async getMaps(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/maps')
  }

  /** 获取干员列表（简化版） */
  async getOperators(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/operator2')
  }

  /** 获取所有干员信息 */
  async getOperator(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/operator')
  }

  /** 获取健康状态信息 */
  async getHealth(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/health')
  }

  /** 获取排位分数对照表 */
  async getRankScore(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/rankscore')
  }

  /** 获取物品列表 */
  async getObjectList(primary?: string, second?: string): Promise<ApiResponse> {
    const params: Record<string, string> = {}
    if (primary) params.primary = primary
    if (second) params.second = second
    return this.request('GET', '/df/object/list', params)
  }

  /** 搜索物品 */
  async searchObject(name?: string, ids?: string): Promise<ApiResponse> {
    const params: Record<string, string> = {}
    if (name) params.name = name
    if (ids) params.id = ids
    return this.request('GET', '/df/object/search', params)
  }

  /** 获取藏品信息对照表 */
  async getCollectionMap(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/collection')
  }

  // ==================== 价格相关接口 ====================

  /** 获取物品历史均价 (V1接口) */
  async getPriceHistoryV1(id: string): Promise<ApiResponse> {
    return this.request('GET', '/df/object/price/history/v1', { id })
  }

  /** 获取物品历史价格 (V2接口，半小时精度) */
  async getPriceHistoryV2(objectId: string | string[]): Promise<ApiResponse> {
    const id = Array.isArray(objectId) ? JSON.stringify(objectId) : objectId
    return this.request('GET', '/df/object/price/history/v2', { objectId: id })
  }

  /** 获取物品当前均价 */
  async getCurrentPrice(id: string | string[]): Promise<ApiResponse> {
    const idParam = Array.isArray(id) ? JSON.stringify(id) : id
    return this.request('GET', '/df/object/price/latest', { id: idParam })
  }

  // ==================== 改枪方案 V2 接口 ====================

  /** 上传改枪方案 */
  async uploadSolution(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionCode: string,
    desc?: string,
    isPublic?: boolean,
    type?: string,
    weaponId?: string,
    accessory?: string
  ): Promise<ApiResponse> {
    const data: Record<string, string | boolean> = {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionCode,
    }
    if (desc) data.desc = desc
    if (isPublic !== undefined) data.isPublic = isPublic
    if (type) data.type = type
    if (weaponId) data.weaponId = weaponId
    if (accessory) data.Accessory = accessory
    return this.request('POST', '/df/tools/solution/v2/upload', data)
  }

  /** 获取方案列表 */
  async getSolutionList(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    weaponId?: string,
    weaponName?: string,
    priceRange?: string,
    authorPlatformID?: string,
    type?: string
  ): Promise<ApiResponse> {
    const params: Record<string, string> = {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
    }
    if (weaponId) params.weaponId = weaponId
    if (weaponName) params.weaponName = weaponName
    if (priceRange) params.priceRange = priceRange
    if (authorPlatformID) params.authorPlatformID = authorPlatformID
    if (type) params.type = type
    return this.request('GET', '/df/tools/solution/v2/list', params)
  }

  /** 获取方案详情 */
  async getSolutionDetail(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionId: string
  ): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/solution/v2/detail', {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionId,
    })
  }

  /** 投票 */
  async voteSolution(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionId: string,
    voteType: string
  ): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/solution/v2/vote', {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionId,
      voteType,
    })
  }

  /** 更新方案 */
  async updateSolution(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionId: string,
    solutionCode?: string,
    desc?: string,
    isPublic?: boolean,
    type?: string,
    accessory?: string
  ): Promise<ApiResponse> {
    const data: Record<string, string | boolean> = {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionId,
    }
    if (solutionCode) data.solutionCode = solutionCode
    if (desc) data.desc = desc
    if (isPublic !== undefined) data.isPublic = isPublic
    if (type) data.type = type
    if (accessory) data.Accessory = accessory
    return this.request('POST', '/df/tools/solution/v2/update', data)
  }

  /** 删除方案 */
  async deleteSolution(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionId: string
  ): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/solution/v2/delete', {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionId,
    })
  }

  /** 收藏方案 */
  async collectSolution(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionId: string
  ): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/solution/v2/collect', {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionId,
    })
  }

  /** 取消收藏 */
  async discollectSolution(
    frameworkToken: string,
    clientID: string,
    platformID: string,
    solutionId: string
  ): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/solution/v2/discollect', {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
      solutionId,
    })
  }

  /** 收藏列表 */
  async getCollectList(
    frameworkToken: string,
    clientID: string,
    platformID: string
  ): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/solution/v2/collectlist', {
      clientID,
      clientType: 'koishi',
      platformID,
      frameworkToken,
    })
  }

  // ==================== 工具类接口 ====================

  /** 获取每日密码 */
  async getDailyKeyword(): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/dailykeyword')
  }

  /** 获取文章列表 */
  async getArticleList(): Promise<ApiResponse> {
    return this.request('POST', '/df/tools/article/list')
  }

  /** 获取文章详情 */
  async getArticleDetail(threadId: string): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/article/detail', { threadID: threadId })
  }

  // ==================== 音频语音接口 ====================

  /** 随机获取音频 */
  async getRandomAudio(params: {
    category?: string
    tag?: string
    character?: string
    scene?: string
    actionType?: string
    actionDetail?: string
    count?: number
  } = {}): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/random', params)
  }

  /** 获取角色随机音频 */
  async getCharacterAudio(params: {
    character?: string
    scene?: string
    actionType?: string
    actionDetail?: string
    count?: number
  } = {}): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/character', params)
  }

  /** 获取音频分类列表 */
  async getAudioCategories(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/categories')
  }

  /** 获取角色列表 */
  async getAudioCharacters(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/characters')
  }

  /** 获取音频统计信息 */
  async getAudioStats(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/stats')
  }

  /** 获取特殊标签列表 */
  async getAudioTags(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/tags')
  }

  /** 获取鼠鼠随机音乐 */
  async getShushuMusic(params: {
    count?: number
    playlist?: string
    artist?: string
    title?: string
  } = {}): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/shushu', params)
  }

  /** 获取鼠鼠音乐列表 */
  async getShushuMusicList(params: {
    sortBy?: string
    playlist?: string
    artist?: string
  } = {}): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/shushu/list', params)
  }

  // ==================== TTS 语音合成接口 ====================

  /** 检查TTS服务状态 */
  async getTtsHealth(): Promise<ApiResponse> {
    return this.request('GET', '/df/tts/health')
  }

  /** 获取TTS角色预设列表 */
  async getTtsPresets(): Promise<ApiResponse> {
    return this.request('GET', '/df/tts/presets')
  }

  /** 获取TTS角色预设详情 */
  async getTtsPreset(characterId: string): Promise<ApiResponse> {
    return this.request('GET', '/df/tts/preset', { characterId })
  }

  /** TTS语音合成（队列模式） */
  async ttsSynthesize(params: {
    text: string
    character: string
    emotion?: string
  }): Promise<ApiResponse> {
    return this.request('POST', '/df/tts/synthesize', params)
  }

  /** 查询TTS任务状态 */
  async getTtsTaskStatus(taskId: string): Promise<ApiResponse> {
    return this.request('GET', '/df/tts/task', { taskId })
  }

  /** 查询TTS队列状态 */
  async getTtsQueueStatus(): Promise<ApiResponse> {
    return this.request('GET', '/df/tts/queue')
  }
}
