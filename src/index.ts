import { Context } from 'koishi'
import { Config } from './config'
import { ApiService } from './api'
import { DataManager } from './data'
import { extendDatabase } from './database'
import { registerMiddleware } from './middleware'
import { Renderer, createRenderer } from './render'

// Account commands
import { registerLoginCommands, registerAccountCommands } from './commands/account'

// Report commands
import { registerDailyCommands, registerWeeklyCommands, registerRecordCommands } from './commands/report'

// Info commands
import { 
  registerInfoCommands, 
  registerMapStatsCommands,
  registerMoneyCommands,
  registerFlowsCommands,
  registerCollectionCommands,
  registerPlaceCommands,
  registerBanCommands,
  registerOperatorCommands,
  registerHealthCommands,
} from './commands/info'

// Tools commands
import { 
  registerPriceCommands, 
  registerObjectCommands, 
  registerAiCommands, 
  registerPasswordCommands,
  registerSolutionCommands,
  registerRoomCommands,
} from './commands/tools'

// Entertainment commands
import { registerVoiceCommands, registerTtsCommands } from './commands/entertainment'

export const name = 'delta-force'
export { Config } from './config'

export const inject = {
  required: ['http', 'database', 'puppeteer'],
  optional: ['cron'],
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('delta-force')

  logger.info('三角洲行动插件正在加载...')

  // 扩展数据库
  extendDatabase(ctx)

  // 注册正则匹配中间件（支持 ^xxx 格式触发）
  registerMiddleware(ctx)

  // 初始化 API 服务
  const api = new ApiService(ctx, config)

  // 初始化数据管理器
  const dataManager = new DataManager(ctx, api)

  // 初始化渲染器
  const renderer = createRenderer(ctx)

  // 异步初始化数据
  Promise.all([
    dataManager.init(),
  ]).catch(err => {
    logger.warn('数据管理器初始化失败:', err)
  })

  // 主指令
  ctx.command('df', '三角洲行动')
    .alias('三角洲')

  // 帮助指令
  ctx.command('df.help', '查看帮助')
    .action(async () => {
      return `三角洲行动插件
使用 ^xxx 格式触发指令

【账号相关】
• ^登录 / ^QQ登录 / ^微信登录 / ^wegame登录
• ^账号 - 账号列表
• ^切换 <序号> - 切换账号
• ^解绑 <序号> - 解绑账号

【信息查询】
• ^信息 - 查看个人信息
• ^uid - 查看UID
• ^货币 - 货币信息
• ^流水 [类型] [页码] - 交易流水
• ^藏品 [类型] - 个人藏品
• ^日报 [sol/mp] - 查看日报
• ^周报 [sol/mp] - 查看周报
• ^战绩 [sol/mp] [页码] - 查看战绩
• ^地图统计 [模式] - 地图统计
• ^特勤处 [设施] [等级] - 特勤处信息
• ^封号记录 - 违规记录(需qqsafe)
• ^干员列表 - 干员列表
• ^干员 <名称> - 干员详情
• ^服务器状态 - API服务器状态

【物品价格】
• ^物品搜索 <名称> - 搜索物品
• ^价格 <名称> - 查询价格
• ^价格历史 <名称> - 价格历史
• ^利润排行 - 利润排行
• ^特勤利润 - 特勤处利润
• ^材料价格 - 材料价格

【AI功能】
• ^AI锐评 [模式] - AI锐评战绩
• ^AI预设列表 - 查看预设列表

【工具】
• ^每日密码 - 每日密码
• ^帮助 - 查看帮助

【改枪方案】
• ^改枪码列表 [武器名] - 方案列表
• ^改枪码详情 <ID> - 方案详情
• ^上传改枪码 <码> - 上传方案
• ^改枪码收藏 - 我的收藏

【开黑房间】
• ^房间列表 [模式] - 房间列表
• ^创建房间 <模式> - 创建房间
• ^加入房间 <ID> [密码] - 加入房间
• ^房间信息 - 当前房间信息

【语音功能】
• ^语音 [角色] [场景] - 随机语音
• ^语音列表 - 角色列表
• ^标签列表 - 特殊标签
• ^tts <角色> [情感] <文本> - TTS合成
• ^tts角色列表 - TTS角色`
    })

  // 注册各功能模块
  registerLoginCommands(ctx, config, api)
  registerInfoCommands(ctx, api, dataManager, renderer)
  registerDailyCommands(ctx, api, dataManager, renderer)
  registerWeeklyCommands(ctx, api, dataManager, renderer)
  registerRecordCommands(ctx, api, dataManager, renderer)
  registerAccountCommands(ctx, config, api)
  registerPasswordCommands(ctx, api)
  registerMapStatsCommands(ctx, api, dataManager, renderer)
  registerAiCommands(ctx, api, dataManager)
  registerObjectCommands(ctx, api)
  registerPriceCommands(ctx, api)
  
  // 新增 info 模块命令
  registerMoneyCommands(ctx, api)
  registerFlowsCommands(ctx, api)
  registerCollectionCommands(ctx, api)
  registerPlaceCommands(ctx, api)
  registerBanCommands(ctx, api)
  registerOperatorCommands(ctx, api, dataManager)
  registerHealthCommands(ctx, api)
  
  // 新增 tools 模块命令
  registerSolutionCommands(ctx, config, api)
  registerRoomCommands(ctx, config, api, dataManager)
  
  // 新增 entertainment 模块命令
  registerVoiceCommands(ctx, api, dataManager)
  registerTtsCommands(ctx, api)

  logger.info('三角洲行动插件加载完成')
}
