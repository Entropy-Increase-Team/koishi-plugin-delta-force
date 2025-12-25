import { Context } from 'koishi'
import { Config } from './config'
import { ApiService } from './api'
import { DataManager } from './data'
import { extendDatabase } from './database'
import { registerLoginCommands } from './commands/login'
import { registerInfoCommands } from './commands/info'
import { registerDailyCommands } from './commands/daily'
import { registerWeeklyCommands } from './commands/weekly'
import { registerRecordCommands } from './commands/record'
import { registerAccountCommands } from './commands/account'
import { registerPasswordCommands } from './commands/password'

export const name = 'delta-force'
export { Config } from './config'

export const inject = {
  required: ['http', 'database'],
  optional: ['puppeteer', 'cron'],
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('delta-force')
  
  logger.info('三角洲行动插件正在加载...')

  // 扩展数据库
  extendDatabase(ctx)

  // 初始化 API 服务
  const api = new ApiService(ctx, config)
  
  // 初始化数据管理器
  const dataManager = new DataManager(ctx, api)
  
  // 异步初始化数据
  dataManager.init().catch(err => {
    logger.warn('数据管理器初始化失败:', err)
  })

  // 主指令
  ctx.command('df', '三角洲行动')
    .alias('三角洲')

  // 帮助指令
  ctx.command('df.help', '查看帮助')
    .action(async () => {
      return `三角洲行动插件

可用指令：
• df.login - 登录账号
• df.info - 查看个人信息
• df.daily [类型] - 查看日报（sol/mp）
• df.weekly [类型] - 查看周报（sol/mp）
• df.record [类型] [页码] - 查看战绩（sol/mp）
• df.account - 账号管理
• df.switch <序号> - 切换账号
• df.unbind <序号> - 解绑账号
• df.password - 查看每日密码

更多功能开发中...`
    })

  // 注册各功能模块
  registerLoginCommands(ctx, config, api)
  registerInfoCommands(ctx, api, dataManager)
  registerDailyCommands(ctx, api, dataManager)
  registerWeeklyCommands(ctx, api, dataManager)
  registerRecordCommands(ctx, api, dataManager)
  registerAccountCommands(ctx, config, api)
  registerPasswordCommands(ctx, api)

  logger.info('三角洲行动插件加载完成')
}
