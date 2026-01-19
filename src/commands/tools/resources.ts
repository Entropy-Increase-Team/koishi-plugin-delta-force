import { Context } from 'koishi'
import { Config } from '../../config'
import { ResourceManager } from '../../resources'

export function registerResourcesCommands(
  ctx: Context,
  config: Config,
  resourceManager: ResourceManager
) {
  const logger = ctx.logger('delta-force')

  // 资源管理命令需要管理员权限（权限等级 4）
  ctx.command('df.resources', '资源管理', { authority: 4 })
    .alias('df.资源')

  ctx.command('df.resources.status', '查看资源状态', { authority: 4 })
    .alias('df.资源状态')
    .action(async () => {
      const status = await resourceManager.getStatus()
      
      const lines = [
        '📦 资源状态',
        `状态: ${status.ready ? '✅ 已就绪' : '❌ 未下载'}`,
        `路径: ${status.path}`,
        `文件数: ${status.fileCount}`,
        `GH-Proxy 加速: ${status.useGhProxy ? '✅ 已开启' : '❌ 未开启'}`,
      ]

      if (status.lastUpdate) {
        lines.push(`最后更新: ${new Date(status.lastUpdate).toLocaleString('zh-CN')}`)
      }

      return lines.join('\n')
    })

  ctx.command('df.resources.download', '下载/更新资源', { authority: 4 })
    .alias('df.资源下载')
    .alias('df.下载资源')
    .alias('df.资源更新')
    .alias('df.更新资源')
    .option('force', '-f 强制重新下载所有文件')
    .action(async ({ session, options }) => {
      // 检查是否正在下载
      const status = resourceManager.getDownloadStatus()
      if (status.isDownloading && status.progress) {
        const percent = Math.round((status.progress.downloaded / status.progress.total) * 100)
        return `⏳ 资源正在下载中...\n` +
          `进度: ${status.progress.downloaded}/${status.progress.total} (${percent}%)\n` +
          `当前: ${status.progress.current || '准备中'}`
      }

      const useProxy = config.useGhProxy
      await session.send(`🔄 开始下载资源${useProxy ? ' (使用 GH-Proxy 加速)' : ''}，请稍候...`)

      if (options?.force) {
        await resourceManager.cleanResources()
      }

      try {
        const result = await resourceManager.downloadResources()

        if (result.success) {
          return `✅ 资源下载完成！\n本次共下载 ${result.downloaded} 个文件`
        } else {
          return `⚠️ 资源下载完成，但有 ${result.failed.length} 个文件失败\n` +
            `成功: ${result.downloaded} 个\n` +
            `失败文件:\n${result.failed.slice(0, 5).join('\n')}` +
            (result.failed.length > 5 ? `\n...等 ${result.failed.length} 个` : '')
        }
      } catch (error) {
        logger.error('资源下载失败:', error)
        return `❌ 资源下载失败: ${(error as Error).message}\n` +
          `请检查网络连接或尝试开启 GH-Proxy 加速`
      }
    })

  ctx.command('df.resources.clean', '清理资源目录', { authority: 4 })
    .alias('df.资源清理')
    .action(async ({ session }) => {
      await resourceManager.cleanResources()
      return '✅ 资源目录已清理，请使用 df.resources.download 重新下载'
    })

  ctx.command('df.resources.check', '检查资源完整性', { authority: 4 })
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
