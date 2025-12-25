import { Context } from 'koishi'

export function extendDatabase(ctx: Context) {
  // 扩展用户表
  ctx.model.extend('delta_force_user', {
    id: 'unsigned',
    userId: 'string',
    platform: 'string',
    activeToken: 'string',
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
    isActive: 'boolean',
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })
}

// 数据库操作辅助函数
export async function getActiveToken(ctx: Context, userId: string, platform: string): Promise<string | null> {
  const user = await ctx.database.get('delta_force_user', { userId, platform })
  return user[0]?.activeToken || null
}

export async function setActiveToken(
  ctx: Context,
  userId: string,
  platform: string,
  token: string
): Promise<void> {
  const existing = await ctx.database.get('delta_force_user', { userId, platform })
  
  if (existing.length > 0) {
    await ctx.database.set('delta_force_user', { userId, platform }, {
      activeToken: token,
      updatedAt: new Date(),
    })
  } else {
    await ctx.database.create('delta_force_user', {
      userId,
      platform,
      activeToken: token,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
}

export async function saveToken(
  ctx: Context,
  userId: string,
  platform: string,
  frameworkToken: string,
  tokenType: string
): Promise<void> {
  await ctx.database.create('delta_force_token', {
    userId,
    platform,
    frameworkToken,
    tokenType,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

export async function getUserTokens(ctx: Context, userId: string, platform: string) {
  return ctx.database.get('delta_force_token', { userId, platform, isActive: true })
}

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
