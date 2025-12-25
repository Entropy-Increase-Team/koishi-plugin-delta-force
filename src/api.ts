import { Context } from 'koishi'
import { Config } from './config'
import { ApiResponse, LoginResponse, BindCharacterResponse, UserInfo, CareerData, UserListItem } from './types'

export class ApiService {
  constructor(
    private ctx: Context,
    private config: Config
  ) {}

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.config.apiBaseUrl}${endpoint}`
      
      // 添加认证头（使用 Bearer Token 方式）
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.config.apiKey}`,
      }
      
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
      this.ctx.logger('delta-force').error('API请求失败:', error)
      return {
        success: false,
        code: -1,
        message: (error as Error).message || '请求失败',
      }
    }
  }

  // 获取登录二维码
  async getLoginQr(platform: string = 'qq'): Promise<LoginResponse> {
    return this.request<LoginResponse>('GET', `/login/${platform}/qr`)
  }

  // 获取登录状态
  async getLoginStatus(platform: string, frameworkToken: string): Promise<ApiResponse> {
    return this.request('GET', `/login/${platform}/status`, { frameworkToken })
  }

  // 绑定用户
  async bindUser(data: {
    platformID: string
    frameworkToken: string
    clientID: string
    clientType: string
  }): Promise<ApiResponse> {
    return this.request('POST', '/user/bind', data)
  }

  // 获取用户列表
  async getUserList(platformID: string, clientID: string): Promise<ApiResponse<UserListItem[]>> {
    return this.request('GET', '/user/list', {
      platformID,
      clientID,
      clientType: 'koishi',
    })
  }

  // 绑定角色
  async bindCharacter(frameworkToken: string): Promise<BindCharacterResponse> {
    return this.request('GET', '/df/person/bind', {
      frameworkToken,
      method: 'bind',
    })
  }

  // 获取个人信息
  async getPersonalInfo(frameworkToken: string): Promise<ApiResponse<{
    userData: unknown
    careerData: CareerData
    roleInfo: UserInfo
  }>> {
    return this.request('GET', '/df/person/info', { frameworkToken })
  }

  // 获取日报数据
  async getDailyReport(frameworkToken: string, type?: string): Promise<ApiResponse> {
    const params: Record<string, string> = { frameworkToken }
    if (type) {
      params.type = type
    }
    return this.request('GET', '/df/person/daily', params)
  }

  // 获取周报数据
  async getWeeklyReport(
    frameworkToken: string,
    type?: string,
    isShowNullFriend?: boolean,
    date?: string
  ): Promise<ApiResponse> {
    const params: Record<string, string | boolean> = { frameworkToken }
    if (type) {
      params.type = type
    }
    if (typeof isShowNullFriend !== 'undefined') {
      params.isShowNullFriend = isShowNullFriend
    }
    if (date) {
      params.date = date
    }
    return this.request('GET', '/df/person/weekly', params)
  }

  // 获取战绩列表
  async getRecordList(
    frameworkToken: string,
    type: string = 'sol',
    page: number = 1
  ): Promise<ApiResponse> {
    return this.request('GET', '/df/person/record', {
      frameworkToken,
      type,
      page,
    })
  }

  // 获取地图列表
  async getMaps(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/maps')
  }

  // 获取干员列表
  async getOperators(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/operator')
  }

  // 获取每日密码
  async getDailyKeyword(): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/dailykeyword')
  }
}
