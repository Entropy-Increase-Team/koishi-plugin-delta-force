import { Context } from 'koishi'
import { Config } from './config'
import { ApiService } from './api'
import { DataManager } from './data'
import { extendDatabase } from './database'
import { registerMiddleware } from './middleware'
import { Renderer, createRenderer } from './render'
import { ResourceManager, createResourceManager } from './resources'

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
  registerPersonalDataCommands,
  registerStatsCommands,
  registerRedRecordCommands,
  registerRedCollectionCommands,
} from './commands/info'

// Tools commands
import { 
  registerPriceCommands, 
  registerObjectCommands, 
  registerAiCommands, 
  registerPasswordCommands,
  registerSolutionCommands,
  registerRoomCommands,
  registerResourcesCommands,
} from './commands/tools'

// Entertainment commands
import { registerVoiceCommands, registerTtsCommands, registerMusicCommands } from './commands/entertainment'

// System commands
import { registerHelpCommands } from './commands/system'

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

  // 初始化资源管理器
  const resourceManager = createResourceManager(ctx, config)

  // 异步初始化数据
  dataManager.init().catch(error => {
    logger.warn('数据管理器初始化失败:', error)
  })

  // 检查资源是否已下载
  if (!resourceManager.isResourcesReady()) {
    logger.warn('静态资源未下载，请使用 df.resources.download 命令下载资源')
    logger.warn('国内用户推荐开启 useGhProxy 配置项以加速下载')
  }

  // 主指令
  ctx.command('df', '三角洲行动')
    .alias('三角洲')

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
  registerFlowsCommands(ctx, api, renderer)
  registerCollectionCommands(ctx, api, renderer)
  registerPlaceCommands(ctx, api, renderer)
  registerBanCommands(ctx, api)
  registerOperatorCommands(ctx, api, dataManager, renderer)
  registerHealthCommands(ctx, api)
  registerPersonalDataCommands(ctx, api, dataManager, renderer)
  registerStatsCommands(ctx, config, api)
  registerRedRecordCommands(ctx, api, dataManager, renderer)
  registerRedCollectionCommands(ctx, api, dataManager, renderer)
  
  // 新增 tools 模块命令
  registerSolutionCommands(ctx, config, api)
  registerRoomCommands(ctx, config, api, dataManager)
  
  // 新增 entertainment 模块命令
  registerVoiceCommands(ctx, api, dataManager)
  registerTtsCommands(ctx, config, api)
  registerMusicCommands(ctx, config, api, dataManager, renderer)

  // 资源管理命令
  registerResourcesCommands(ctx, config, resourceManager)

  // 系统命令
  registerHelpCommands(ctx, renderer)

  logger.info('三角洲行动插件加载完成')
}
