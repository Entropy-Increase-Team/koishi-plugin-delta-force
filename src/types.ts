// API 响应基础类型
export interface ApiResponse<T = any> {
  success?: boolean
  code: number
  msg?: string
  message?: string
  data?: T
}

// 用户信息类型
export interface UserInfo {
  charac_name: string
  picurl: string
  uid: string
  level: string
  tdmlevel: string
  register_time: number
  lastlogintime: number
  isbanuser: string
  isbanspeak: string
  adultstatus: string
  propcapital: number
  hafcoinnum: number
}

// 战绩数据类型
export interface CareerData {
  rankpoint?: number
  tdmrankpoint?: number
  soltotalfght?: number
  solttotalescape?: number
  solescaperatio?: string
  soltotalkill?: number
  solduration?: number
  tdmtotalfight?: number
  totalwin?: number
  tdmsuccessratio?: string
  tdmtotalkill?: number
  tdmduration?: number
}

// 登录响应类型
export interface LoginResponse extends ApiResponse {
  token?: string
  frameworkToken?: string
  qr_image?: string
  expire?: number
  status?: number
}

// 角色绑定响应类型
export interface BindCharacterResponse extends ApiResponse {
  roleInfo?: {
    charac_name: string
    level: string
    tdmlevel: string
    adultstatus: string
  }
}

// 账号绑定类型
export interface UserBinding {
  platformID: string
  frameworkToken: string
  clientID: string
  clientType: string
}

declare module 'koishi' {
  interface Tables {
    delta_force_user: DeltaForceUser
    delta_force_token: DeltaForceToken
  }
}

// 数据库表结构
export interface DeltaForceUser {
  id: number
  userId: string
  platform: string
  activeToken?: string
  createdAt: Date
  updatedAt: Date
}

export interface DeltaForceToken {
  id: number
  userId: string
  platform: string
  frameworkToken: string
  tokenType: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
