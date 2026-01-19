import { Context } from 'koishi'
import { Config } from '../../config'
import { ResourceManager, ResourceSource } from '../../resources'

export function registerResourcesCommands(
  ctx: Context,
  config: Config,
  resourceManager: ResourceManager
) {
  const logger = ctx.logger('delta-force')

  ctx.command('df.resources', '资源管理')
    .alias('df.资源')

  ctx.command('df.resources.status', '查看资源状态')
    .alias('df.资源状态')
    .action(async () => {
      const status = await resourceManager.getStatus()
      
      const lines = [
        '📦 资源状态',
        `状态: ${status.ready ? '✅ 已就绪' : '❌ 未下载'}`,
        `路径: ${status.path}`,
        `文件数: ${status.fileCount}`,
        `默认源: ${config.resourceSource}`,
      ]

      if (status.lastUpdate) {
        lines.push(`最后更新: ${new Date(status.lastUpdate).toLocaleString('zh-CN')}`)
      }
      if (status.source) {
        lines.push(`下载源: ${status.source}`)
      }

      return lines.join('\n')
    })

  ctx.command('df.resources.download [source:string]', '下载/更新资源')
    .alias('df.资源下载')
    .alias('df.下载资源')
    .alias('df.资源更新')
    .alias('df.更新资源')
    .option('force', '-f 强制重新下载所有文件')
    .action(async ({ session, options }, source) => {
      const validSources: ResourceSource[] = ['github', 'gitee']
      // 优先使用命令参数，否则使用配置中的默认源
      const selectedSource: ResourceSource = validSources.includes(source as ResourceSource) 
        ? source as ResourceSource 
        : config.resourceSource

      await session.send(`🔄 开始从 ${selectedSource} 下载资源，请稍候...`)

      if (options?.force) {
        await resourceManager.cleanResources()
      }

      try {
        const result = await resourceManager.downloadResources(selectedSource)

        if (result.success) {
          return `✅ 资源下载完成！\n共下载 ${result.downloaded} 个文件`
        } else {
          return `⚠️ 资源下载完成，但有 ${result.failed.length} 个文件失败\n` +
            `成功: ${result.downloaded} 个\n` +
            `失败文件:\n${result.failed.slice(0, 5).join('\n')}` +
            (result.failed.length > 5 ? `\n...等 ${result.failed.length} 个` : '')
        }
      } catch (error) {
        logger.error('资源下载失败:', error)
        return `❌ 资源下载失败: ${(error as Error).message}\n` +
          `请尝试切换源: df.resources.download github 或 df.resources.download gitee`
      }
    })

  ctx.command('df.resources.clean', '清理资源目录')
    .alias('df.资源清理')
    .action(async ({ session }) => {
      await resourceManager.cleanResources()
      return '✅ 资源目录已清理，请使用 df.resources.download 重新下载'
    })

  ctx.command('df.resources.check', '检查资源完整性')
    .alias('df.资源检查')
    .action(async ({ session }) => {
      const status = await resourceManager.getStatus()
      
      if (!status.ready) {
        return '❌ 资源未下载，请先使用 df.resources.download 下载资源'
      }

      return `✅ 资源检查通过\n` +
        `文件数: ${status.fileCount}\n` +
        `最后更新: ${status.lastUpdate ? new Date(status.lastUpdate).toLocaleString('zh-CN') : '未知'}`
    })
}
