// API 响应基础类型
export interface ApiResponse<T = unknown> {
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

// 日报数据类型
export interface DailyReportData {
  sol?: {
    data?: {
      data?: {
        solDetail?: {
          recentGainDate?: string
          recentGain?: number
          userCollectionTop?: {
            list?: Array<{
              objectName: string
              price: string
              count: number
            }>
          }
        }
      }
    }
  }
  mp?: {
    data?: {
      data?: {
        mpDetail?: {
          recentDate?: string
          totalFightNum?: number
          totalWinNum?: number
          totalKillNum?: number
          totalScore?: number
          mostUseForceType?: string
          bestMatch?: {
            mapID?: string
            dtEventTime?: string
            isWinner?: boolean
            killNum?: number
            death?: number
            assist?: number
            score?: number
          }
        }
      }
    }
  }
}

// 周报数据类型
export interface WeeklyReportData {
  sol?: {
    data?: {
      data?: {
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
        teammates?: Array<any>
      }
    }
  }
  mp?: {
    data?: {
      data?: {
        total_num?: number
        win_num?: number
        Rank_Match_Score?: number
        Kill_Num?: number
        continuous_Kill_Num?: number
        total_score?: number
        Consume_Bullet_Num?: number
        Hit_Bullet_Num?: number
        SBattle_Support_UseNum?: number
        SBattle_Support_CostScore?: number
        Rescue_Teammate_Count?: number
        by_Rescue_num?: number
        max_inum_mapid?: string
        max_inum_DeployArmedForceType?: string
        DeployArmedForceType_inum?: number
        DeployArmedForceType_KillNum?: number
        DeployArmedForceType_gametime?: number
        teammates?: Array<any>
      }
    }
  }
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

// 用户列表项类型
export interface UserListItem {
  frameworkToken: string
  tokenType: string
  isValid: boolean
  qqNumber?: string
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
  activeTokenQqWechat?: string
  activeTokenWegame?: string
  activeTokenQqsafe?: string
  createdAt: Date
  updatedAt: Date
}

export interface DeltaForceToken {
  id: number
  userId: string
  platform: string
  frameworkToken: string
  tokenType: string
  tokenGroup: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
