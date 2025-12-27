import { Context } from 'koishi'
import { DeltaForceToken } from './types'

// 定义静态缓存表接口
interface StaticCache {
  id: number
  key: string
  value: Record<string, unknown>
  updated_at: Date
}

declare module 'koishi' {
  interface Tables {
    delta_force_static_cache: StaticCache
  }
}

export function extendDatabase(ctx: Context) {
  // 扩展用户表 - 存储各分组的激活 token
  ctx.model.extend('delta_force_user', {
    id: 'unsigned',
    userId: 'string',
    platform: 'string',
    activeTokenQqWechat: 'string',  // QQ/微信分组激活token
    activeTokenWegame: 'string',     // WeGame分组激活token
    activeTokenQqsafe: 'string',     // QQ安全中心分组激活token
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // 扩展 Token 表
  ctx.model.extend('delta_force_token', {
    id: 'unsigned',
    userId: 'string',
    platform: 'string',
    frameworkToken: 'string',
    tokenType: 'string',
    tokenGroup: 'string',  // 账号分组: qq_wechat, wegame, qqsafe
    isActive: 'boolean',
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // 扩展静态缓存表 - 存储游戏静态数据（武器、护甲等）
  ctx.model.extend('delta_force_static_cache', {
    id: 'unsigned',
    key: { type: 'string', length: 255, initial: '' },
    value: 'json',
    updated_at: 'timestamp',
  }, {
    unique: ['key'],
  })
}

// 静态缓存管理器
export class StaticCacheManager {
  constructor(private ctx: Context) {}

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   */
  async set(key: string, value: Record<string, unknown>): Promise<void> {
    await this.ctx.database.upsert('delta_force_static_cache', [{
      key,
      value,
      updated_at: new Date(),
    }], ['key'])
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值或null
   */
  async get(key: string): Promise<Record<string, unknown> | null> {
    const [cache] = await this.ctx.database.get('delta_force_static_cache', { key })
    return cache?.value || null
  }

  /**
   * 检查缓存是否存在
   * @param key 缓存键
   * @returns 是否存在
   */
  async has(key: string): Promise<boolean> {
    const caches = await this.ctx.database.get('delta_force_static_cache', { key })
    return caches && caches.length > 0
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async delete(key: string): Promise<void> {
    await this.ctx.database.remove('delta_force_static_cache', { key })
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    await this.ctx.database.remove('delta_force_static_cache', {})
  }
}

// 确定账号所属分组
export function getTokenGroup(tokenType: string): string {
  const type = tokenType.toLowerCase()
  
  if (['qq', 'wechat'].includes(type)) {
    return 'qq_wechat'
  } else if (['wegame', 'wegame/wechat'].includes(type)) {
    return 'wegame'
  } else if (type === 'qqsafe') {
    return 'qqsafe'
  } else {
    return 'other'
  }
}

// 获取指定分组的激活 token
export async function getGroupActiveToken(
  ctx: Context,
  userId: string,
  platform: string,
  group: string
): Promise<string | null> {
  const user = await ctx.database.get('delta_force_user', { userId, platform })
  if (user.length === 0) return null
  
  const fieldMap: Record<string, keyof typeof user[0]> = {
    'qq_wechat': 'activeTokenQqWechat',
    'wegame': 'activeTokenWegame',
    'qqsafe': 'activeTokenQqsafe',
  }
  
  const field = fieldMap[group]
  return field ? (user[0][field] as string) || null : null
}

// 设置指定分组的激活 token
export async function setGroupActiveToken(
  ctx: Context,
  userId: string,
  platform: string,
  group: string,
  token: string | null
): Promise<void> {
  const existing = await ctx.database.get('delta_force_user', { userId, platform })
  
  const fieldMap: Record<string, string> = {
    'qq_wechat': 'activeTokenQqWechat',
    'wegame': 'activeTokenWegame',
    'qqsafe': 'activeTokenQqsafe',
  }
  
  const field = fieldMap[group]
  if (!field) return
  
  const updateData = {
    [field]: token,
    updatedAt: new Date(),
  }
  
  if (existing.length > 0) {
    await ctx.database.set('delta_force_user', { userId, platform }, updateData)
  } else {
    await ctx.database.create('delta_force_user', {
      userId,
      platform,
      ...updateData,
      createdAt: new Date(),
    })
  }
}

// 获取当前激活的 token（优先返回 qq_wechat 分组）
export async function getActiveToken(ctx: Context, userId: string, platform: string): Promise<string | null> {
  // 优先返回 qq_wechat 分组的激活 token
  const qqWechatToken = await getGroupActiveToken(ctx, userId, platform, 'qq_wechat')
  if (qqWechatToken) return qqWechatToken
  
  // 其次返回 wegame 分组
  const wegameToken = await getGroupActiveToken(ctx, userId, platform, 'wegame')
  if (wegameToken) return wegameToken
  
  // 最后返回 qqsafe 分组
  const qqsafeToken = await getGroupActiveToken(ctx, userId, platform, 'qqsafe')
  return qqsafeToken
}

// 兼容旧版 setActiveToken（设置 qq_wechat 分组）
export async function setActiveToken(
  ctx: Context,
  userId: string,
  platform: string,
  token: string | null
): Promise<void> {
  await setGroupActiveToken(ctx, userId, platform, 'qq_wechat', token)
}

// 保存 token 到数据库
export async function saveToken(
  ctx: Context,
  userId: string,
  platform: string,
  frameworkToken: string,
  tokenType: string
): Promise<void> {
  // 检查是否已存在
  const existing = await ctx.database.get('delta_force_token', {
    userId,
    platform,
    frameworkToken,
  })
  
  if (existing.length > 0) {
    // 已存在，更新状态
    await ctx.database.set('delta_force_token', { userId, platform, frameworkToken }, {
      isActive: true,
      tokenType,
      tokenGroup: getTokenGroup(tokenType),
      updatedAt: new Date(),
    })
  } else {
    // 不存在，创建新记录
    await ctx.database.create('delta_force_token', {
      userId,
      platform,
      frameworkToken,
      tokenType,
      tokenGroup: getTokenGroup(tokenType),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
}

// 获取用户所有 token
export async function getUserTokens(ctx: Context, userId: string, platform: string): Promise<DeltaForceToken[]> {
  return ctx.database.get('delta_force_token', { userId, platform, isActive: true })
}

// 删除 token
export async function deleteUserToken(
  ctx: Context,
  userId: string,
  platform: string,
  frameworkToken: string
): Promise<void> {
  await ctx.database.remove('delta_force_token', {
    userId,
    platform,
    frameworkToken,
  })
}
