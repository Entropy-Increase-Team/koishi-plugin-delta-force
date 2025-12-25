import { Context } from 'koishi'
import { DeltaForceToken } from './types'

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
