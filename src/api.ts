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
      // 定义 HTTP 错误响应接口
      interface HttpError {
        response?: {
          status: number
          statusText: string
          data?: string | { substring?: (length: number) => string }
        }
      }

      const err = error as Error & HttpError

      // HTTP 错误（如 502 Bad Gateway）
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

      // 其他错误
      this.ctx.logger('delta-force').error('API请求异常:', error)
      return {
        success: false,
        code: -1,
        message: err.message || '请求失败',
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

  // 获取日报数据
  async getDailyReport(frameworkToken: string, type?: string): Promise<ApiResponse> {
    const params: Record<string, string> = { frameworkToken }
    if (type) {
      params.type = type
    }
    return this.request('GET', '/df/person/dailyRecord', params)
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
    return this.request('GET', '/df/person/weeklyRecord', params)
  }

  // 获取战绩列表
  async getRecordList(
    frameworkToken: string,
    type: string = 'sol',
    page: number = 1
  ): Promise<ApiResponse> {
    // 将 sol/mp 转换为数字类型：4=烽火地带, 5=全面战场
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

  // 获取地图列表
  async getMaps(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/maps')
  }

  // 获取干员列表
  async getOperators(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/operator2')
  }

  // 获取每日密码
  async getDailyKeyword(): Promise<ApiResponse> {
    return this.request('GET', '/df/tools/dailykeyword')
  }

  // 获取排位分数对照表
  async getRankScore(): Promise<ApiResponse> {
    return this.request('GET', '/df/object/rankscore')
  }

  // 获取音频标签列表
  async getAudioTags(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/tags')
  }

  // 获取音频角色列表
  async getAudioCharacters(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/characters')
  }

  // 获取音频分类列表
  async getAudioCategories(): Promise<ApiResponse> {
    return this.request('GET', '/df/audio/categories')
  }
}
