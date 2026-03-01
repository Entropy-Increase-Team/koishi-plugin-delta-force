import { Context, Session } from 'koishi'

interface CommandRule {
  pattern: RegExp
  command: string
  /** 参数提取函数，返回要追加到命令后的参数字符串 */
  args?: (match: RegExpMatchArray) => string
}

/**
 * 命令正则规则表
 * 使用 ^ 前缀触发，全框架统一
 */
const commandRules: CommandRule[] = [
  // ==================== 账号相关 ====================
  // 登录: ^\^(qq|QQ|微信|wx|WX|wegame|WEGAME|wegame微信|微信wegame|qqsafe|QQsafe|安全中心|qq安全中心)?(登陆|登录)$
  {
    pattern: /^\^(qq|QQ|微信|wx|WX|wegame|WEGAME|wegame微信|微信wegame|qqsafe|QQsafe|安全中心|qq安全中心)?(登陆|登录)$/i,
    command: 'df.login',
    args: (match) => {
      const platform = match[1]?.toLowerCase()
      if (!platform) return ''
      if (['微信', 'wx'].includes(platform)) return 'wechat'
      if (['安全中心', 'qq安全中心', 'qqsafe'].includes(platform)) return 'qqsafe'
      if (['wegame微信', '微信wegame'].includes(platform)) return 'wegame/wechat'
      if (['wegame'].includes(platform)) return 'wegame'
      if (['qq'].includes(platform)) return 'qq'
      return platform
    }
  },
  // 手动绑定Token: ^\^绑定\s+([a-zA-Z0-9\-]+)$ (必须有token参数)
  {
    pattern: /^\^绑定\s+([a-zA-Z0-9\-]+)$/i,
    command: 'df.bindtoken',
    args: (match) => match[1] || ''
  },
  // 角色绑定: ^\^(角色绑定|绑定角色|bind)$ (不带token参数)
  {
    pattern: /^\^(角色绑定|绑定角色|bind)$/i,
    command: 'df.bind'
  },
  // 账号列表: ^\^(账号|账号列表|account)$
  {
    pattern: /^\^(账号|账号列表|account)$/i,
    command: 'df.account'
  },
  // 切换账号: ^\^(切换|切换账号|账号切换|switch)\s*(\d+)?$
  {
    pattern: /^\^(切换|切换账号|账号切换|switch)\s*(\d+)?$/i,
    command: 'df.switch',
    args: (match) => match[2] || ''
  },
  // 解绑账号: ^\^(解绑|删除|unbind)\s*(\d+)?$
  {
    pattern: /^\^(解绑|删除|unbind)\s*(\d+)?$/i,
    command: 'df.unbind',
    args: (match) => match[2] || ''
  },
  // 刷新微信: ^\^(微信刷新|刷新微信)$
  {
    pattern: /^\^(微信刷新|刷新微信)$/i,
    command: 'df.refresh.wechat'
  },
  // 刷新QQ: ^\^(qq刷新|QQ刷新|刷新qq|刷新QQ)$
  {
    pattern: /^\^(qq刷新|QQ刷新|刷新qq|刷新QQ)$/i,
    command: 'df.refresh.qq'
  },
  // CK登录: ^\^ck(登陆|登录)\s*(.*)$
  {
    pattern: /^\^ck(登陆|登录)\s*(.*)$/i,
    command: 'df.cklogin',
    args: (match) => match[2]?.trim() || ''
  },
  // QQ OAuth登录: ^\^(qq|QQ)(授权|auth|oauth)(登陆|登录)\s*(.*)$
  {
    pattern: /^\^(qq|QQ)(授权|auth|oauth)(登陆|登录)\s*(.*)$/i,
    command: 'df.qqoauth',
    args: (match) => match[4]?.trim() || ''
  },
  // 微信OAuth登录: ^\^(微信|wx|WX)(授权|auth|oauth)(登陆|登录)\s*(.*)$
  {
    pattern: /^\^(微信|wx|WX)(授权|auth|oauth)(登陆|登录)\s*(.*)$/i,
    command: 'df.wxoauth',
    args: (match) => match[4]?.trim() || ''
  },
  // 网页登录: ^\^(网页|web|网站)(登陆|登录)$
  {
    pattern: /^\^(网页|web|网站)(登陆|登录)$/i,
    command: 'df.weblogin'
  },
  // 删除账号: ^\^删除账号\s*(\d+)$
  {
    pattern: /^\^删除账号\s*(\d+)$/i,
    command: 'df.delete',
    args: (match) => match[1] || ''
  },

  // ==================== 战报相关 ====================
  // 日报: ^\^(日报|daily)\s*(.*)$
  {
    pattern: /^\^(日报|daily)\s*(.*)$/i,
    command: 'df.daily',
    args: (match) => match[2]?.trim() || ''
  },
  // 开启/关闭日报推送: ^\^(开启|关闭)日报推送$
  {
    pattern: /^\^(开启|关闭)日报推送$/i,
    command: 'df.daily.push',
    args: (match) => match[1] === '开启' ? 'on' : 'off'
  },
  // 周报: ^\^(周报|weekly)\s*(.*)$
  {
    pattern: /^\^(周报|weekly)\s*(.*)$/i,
    command: 'df.weekly',
    args: (match) => match[2]?.trim() || ''
  },
  // 开启/关闭周报推送: ^\^(开启|关闭)周报推送$
  {
    pattern: /^\^(开启|关闭)周报推送$/i,
    command: 'df.weekly.push',
    args: (match) => match[1] === '开启' ? 'on' : 'off'
  },
  // 战绩: ^\^(战绩|record)\s*(.*)$
  {
    pattern: /^\^(战绩|record)\s*(.*)$/i,
    command: 'df.record',
    args: (match) => match[2]?.trim() || ''
  },

  // ==================== 信息查询 ====================
  // 个人信息: ^\^(信息|info|个人信息)$
  {
    pattern: /^\^(信息|info|个人信息)$/i,
    command: 'df.info'
  },
  // UID: ^\^uid$
  {
    pattern: /^\^uid$/i,
    command: 'df.uid'
  },
  // 地图统计: ^\^(地图统计|mapstats|地图数据)\s*(.*)$
  {
    pattern: /^\^(地图统计|mapstats|地图数据)\s*(.*)$/i,
    command: 'df.mapstats',
    args: (match) => match[2]?.trim() || ''
  },
  // 货币: ^\^(货币|money|余额)$
  {
    pattern: /^\^(货币|money|余额)$/i,
    command: 'df.money'
  },
  // 流水: ^\^(流水|flows)\s*(.*)$
  {
    pattern: /^\^(流水|flows)\s*(.*)$/i,
    command: 'df.flows',
    args: (match) => match[2]?.trim() || ''
  },
  // 藏品: ^\^(藏品|资产|collection)\s*(.*)$
  {
    pattern: /^\^(藏品|资产|collection)\s*(.*)$/i,
    command: 'df.collection',
    args: (match) => match[2]?.trim() || ''
  },
  // 特勤处信息: ^\^(特勤处信息|特勤处|placeinfo)\s*(.*)$
  {
    pattern: /^\^(特勤处信息|特勤处|placeinfo)\s*(.*)$/i,
    command: 'df.place',
    args: (match) => match[2]?.trim() || ''
  },
  // 特勤处状态: ^\^(特勤处状态|placestatus)$
  {
    pattern: /^\^(特勤处状态|placestatus)$/i,
    command: 'df.placestatus'
  },
  // 开启/关闭特勤处推送: ^\^(开启|关闭)特勤处推送$
  {
    pattern: /^\^(开启|关闭)特勤处推送$/i,
    command: 'df.place.push',
    args: (match) => match[1] === '开启' ? 'on' : 'off'
  },
  // 封号记录: ^\^(封号记录|违规记录|违规历史|封号历史)$
  {
    pattern: /^\^(封号记录|违规记录|违规历史|封号历史)$/i,
    command: 'df.ban'
  },
  // 干员列表: ^\^干员列表$
  {
    pattern: /^\^干员列表$/i,
    command: 'df.operators'
  },
  // 干员详情: ^\^干员\s+(.+)$
  {
    pattern: /^\^干员\s+(.+)$/i,
    command: 'df.operator',
    args: (match) => match[1]?.trim() || ''
  },
  // 服务器状态: ^\^(服务器状态|health)$
  {
    pattern: /^\^(服务器状态|health)$/i,
    command: 'df.health'
  },
  // 个人数据: ^\^(数据|data|个人数据)\s*(.*)$
  {
    pattern: /^\^(数据|data|个人数据)\s*(.*)$/i,
    command: 'df.data',
    args: (match) => match[2]?.trim() || ''
  },
  // 用户统计: ^\^用户统计$
  {
    pattern: /^\^用户统计$/i,
    command: 'df.stats'
  },
  // 出红记录: ^\^(出红记录|大红记录|藏品记录)\s*(.*)$
  {
    pattern: /^\^(出红记录|大红记录|藏品记录)\s*(.*)$/i,
    command: 'df.redrecord',
    args: (match) => match[2]?.trim() || ''
  },
  // 大红收藏: ^\^(大红收藏|大红藏品|大红海报|藏品海报)\s*(\d*)$
  {
    pattern: /^\^(大红收藏|大红藏品|大红海报|藏品海报)\s*(\d*)$/i,
    command: 'df.redcollection',
    args: (match) => match[2]?.trim() || ''
  },

  // ==================== 价格工具 ====================
  // 价格历史: ^\^(价格历史|历史价格)\s+(.+)$
  {
    pattern: /^\^(价格历史|历史价格)\s+(.+)$/i,
    command: 'df.pricehistory',
    args: (match) => match[2]?.trim() || ''
  },
  // 当前价格: ^\^(当前价格|最新价格|价格)\s+(.+)$
  {
    pattern: /^\^(当前价格|最新价格|价格)\s+(.+)$/i,
    command: 'df.price',
    args: (match) => match[2]?.trim() || ''
  },
  // 材料价格: ^\^(材料价格|制造材料|材料)$
  {
    pattern: /^\^(材料价格|制造材料|材料)$/i,
    command: 'df.material'
  },
  // 利润排行: ^\^(利润排行|利润榜|profit)\s*(.*)$
  {
    pattern: /^\^(利润排行|利润榜|profit)\s*(.*)$/i,
    command: 'df.profit',
    args: (match) => match[2]?.trim() || ''
  },
  // 特勤处利润: ^\^(特勤处利润|特勤利润)$
  {
    pattern: /^\^(特勤处利润|特勤利润)$/i,
    command: 'df.specialprofit'
  },
  // 物品列表: ^\^物品列表\s*(.*)$
  {
    pattern: /^\^物品列表\s*(.*)$/i,
    command: 'df.object',
    args: (match) => match[1]?.trim() || ''
  },
  // 物品搜索: ^\^(物品搜索|物品|搜索)\s+(.+)$
  {
    pattern: /^\^(物品搜索|物品|搜索)\s+(.+)$/i,
    command: 'df.object',
    args: (match) => match[2]?.trim() || ''
  },

  // ==================== AI功能 ====================
  // AI锐评: ^\^(ai|AI)(锐评|评价)\s*(.*)$
  {
    pattern: /^\^(ai|AI)(锐评|评价)\s*(.*)$/i,
    command: 'df.ai',
    args: (match) => match[3]?.trim() || ''
  },
  // AI预设列表: ^\^(ai|AI)预设列表$
  {
    pattern: /^\^(ai|AI)预设列表$/i,
    command: 'df.ai.presets'
  },

  // ==================== 工具 ====================
  // 每日密码: ^\^(每日密码|今日密码|密码)$
  {
    pattern: /^\^(每日密码|今日密码|密码)$/i,
    command: 'df.password'
  },
  // 开启/关闭每日密码推送: ^\^(开启|关闭)每日密码推送$
  {
    pattern: /^\^(开启|关闭)每日密码推送$/i,
    command: 'df.password.push',
    args: (match) => match[1] === '开启' ? 'on' : 'off'
  },

  // ==================== 帮助 ====================
  // 帮助: ^\^(帮助|菜单|功能|help)$
  {
    pattern: /^\^(帮助|菜单|功能|help)$/i,
    command: 'df.help'
  },
  // 娱乐帮助: ^\^娱乐(帮助|菜单|功能)$
  {
    pattern: /^\^娱乐(帮助|菜单|功能)$/i,
    command: 'df.entertainment'
  },

  // ==================== 资源管理 ====================
  // 资源状态: ^\^资源状态$
  {
    pattern: /^\^资源状态$/i,
    command: 'df.resources.status'
  },
  // 资源下载/更新: ^\^(资源下载|下载资源|资源更新|更新资源)$
  {
    pattern: /^\^(资源下载|下载资源|资源更新|更新资源)$/i,
    command: 'df.resources.download'
  },
  // 资源清理: ^\^(资源清理|清理资源)$
  {
    pattern: /^\^(资源清理|清理资源)$/i,
    command: 'df.resources.clean'
  },
  // 资源检查: ^\^(资源检查|检查资源)$
  {
    pattern: /^\^(资源检查|检查资源)$/i,
    command: 'df.resources.check'
  },

  // ==================== 改枪方案 ====================
  // 上传改枪码: ^\^上传(改枪方案|改枪码)\s*(.*)$
  {
    pattern: /^\^上传(改枪方案|改枪码)\s*(.*)$/i,
    command: 'df.solution.upload',
    args: (match) => match[2]?.trim() || ''
  },
  // 改枪码列表: ^\^(改枪方案|改枪码)列表\s*(.*)$
  {
    pattern: /^\^(改枪方案|改枪码)列表\s*(.*)$/i,
    command: 'df.solution.list',
    args: (match) => match[2]?.trim() || ''
  },
  // 改枪码详情: ^\^(改枪方案|改枪码)详情\s+(\d+)$
  {
    pattern: /^\^(改枪方案|改枪码)详情\s+(\d+)$/i,
    command: 'df.solution.detail',
    args: (match) => match[2] || ''
  },
  // 改枪码收藏: ^\^(改枪方案|改枪码)收藏(列表)?$
  {
    pattern: /^\^(改枪方案|改枪码)收藏(列表)?$/i,
    command: 'df.solution.favorites'
  },
  // 收藏改枪码: ^\^收藏(改枪方案|改枪码)\s+(\d+)$
  {
    pattern: /^\^收藏(改枪方案|改枪码)\s+(\d+)$/i,
    command: 'df.solution.collect',
    args: (match) => match[2] || ''
  },
  // 改枪码点赞: ^\^(改枪方案|改枪码)点赞\s+(\d+)$
  {
    pattern: /^\^(改枪方案|改枪码)点赞\s+(\d+)$/i,
    command: 'df.solution.vote',
    args: (match) => `${match[2]} like`
  },
  // 改枪码点踩: ^\^(改枪方案|改枪码)点踩\s+(\d+)$
  {
    pattern: /^\^(改枪方案|改枪码)点踩\s+(\d+)$/i,
    command: 'df.solution.vote',
    args: (match) => `${match[2]} dislike`
  },

  // ==================== 开黑房间 ====================
  // 房间列表: ^\^房间列表\s*(.*)$
  {
    pattern: /^\^房间列表\s*(.*)$/i,
    command: 'df.room.list',
    args: (match) => match[1]?.trim() || ''
  },
  // 创建房间: ^\^创建房间\s*(.*)$
  {
    pattern: /^\^创建房间\s*(.*)$/i,
    command: 'df.room.create',
    args: (match) => match[1]?.trim() || ''
  },
  // 加入房间: ^\^加入房间\s+(\d+)\s*(.*)$
  {
    pattern: /^\^加入房间\s+(\d+)\s*(.*)$/i,
    command: 'df.room.join',
    args: (match) => `${match[1]} ${match[2]?.trim() || ''}`.trim()
  },
  // 退出/解散房间: ^\^(退出|解散)房间\s+(\d+)$
  {
    pattern: /^\^(退出|解散)房间\s+(\d+)$/i,
    command: 'df.room.quit',
    args: (match) => match[2] || ''
  },
  // 房间信息: ^\^房间信息$
  {
    pattern: /^\^房间信息$/i,
    command: 'df.room.info'
  },
  // 房间地图列表: ^\^房间地图列表$
  {
    pattern: /^\^房间地图列表$/i,
    command: 'df.room.maps'
  },
  // 房间标签列表: ^\^房间标签列表$
  {
    pattern: /^\^房间标签列表$/i,
    command: 'df.room.tags'
  },

  // ==================== 语音功能 ====================
  // 语音列表: ^\^语音列表$
  {
    pattern: /^\^语音列表$/i,
    command: 'df.voice.list'
  },
  // 标签列表: ^\^标签列表$
  {
    pattern: /^\^标签列表$/i,
    command: 'df.voice.tags'
  },
  // 语音分类: ^\^语音分类$
  {
    pattern: /^\^语音分类$/i,
    command: 'df.voice.categories'
  },
  // 语音统计: ^\^语音统计$
  {
    pattern: /^\^语音统计$/i,
    command: 'df.voice.stats'
  },
  // 语音: ^\^语音\s*(.*)$
  {
    pattern: /^\^语音\s*(.*)$/i,
    command: 'df.voice',
    args: (match) => match[1]?.trim() || ''
  },

  // ==================== TTS语音合成 ====================
  // TTS状态: ^\^tts状态$
  {
    pattern: /^\^tts状态$/i,
    command: 'df.tts.status'
  },
  // TTS角色列表: ^\^tts(角色|预设)(列表)?$
  {
    pattern: /^\^tts(角色|预设)(列表)?$/i,
    command: 'df.tts.presets'
  },
  // TTS角色详情: ^\^tts角色详情\s+(.+)$
  {
    pattern: /^\^tts角色详情\s+(.+)$/i,
    command: 'df.tts.preset',
    args: (match) => match[1]?.trim() || ''
  },
  // TTS上传: ^\^tts上传$
  {
    pattern: /^\^tts上传$/i,
    command: 'df.tts.upload'
  },
  // TTS队列: ^\^tts队列$
  {
    pattern: /^\^tts队列$/i,
    command: 'df.tts.queue'
  },
  // TTS合成: ^\^tts\s+(.+)$
  {
    pattern: /^\^tts\s+(.+)$/i,
    command: 'df.tts',
    args: (match) => match[1]?.trim() || ''
  },

  // ==================== 鼠鼠音乐 ====================
  // 歌词: ^\^(歌词|鼠鼠歌词|鼠鼠音乐歌词)$
  {
    pattern: /^\^(歌词|鼠鼠歌词|鼠鼠音乐歌词)$/i,
    command: 'df.music.lyrics'
  },
  // 鼠鼠语音: ^\^鼠鼠语音$
  {
    pattern: /^\^鼠鼠语音$/i,
    command: 'df.music.voice'
  },
  // 音乐缓存状态: ^\^音乐缓存(状态|统计)$
  {
    pattern: /^\^音乐缓存(状态|统计)$/i,
    command: 'df.music.cache'
  },
  // 清理音乐缓存: ^\^清理音乐缓存$
  {
    pattern: /^\^清理音乐缓存$/i,
    command: 'df.music.cache.clean'
  },
  // 鼠鼠音乐排行榜: ^\^鼠鼠音乐(列表|排行榜)\s*(\d*)$
  {
    pattern: /^\^鼠鼠音乐(列表|排行榜)\s*(\d*)$/i,
    command: 'df.music.rank',
    args: (match) => match[2]?.trim() || ''
  },
  // 鼠鼠歌单: ^\^鼠鼠歌单\s*(.*)$
  {
    pattern: /^\^鼠鼠歌单\s*(.*)$/i,
    command: 'df.music.playlist',
    args: (match) => match[1]?.trim() || ''
  },
  // 点歌: ^\^(点歌|听|听歌|播放)\s*(\d+)$
  {
    pattern: /^\^(点歌|听|听歌|播放)\s*(\d+)$/i,
    command: 'df.music.play',
    args: (match) => match[2] || ''
  },
  // 鼠鼠音乐(搜索/随机): ^\^鼠鼠音乐\s*(.*)$ (放最后，避免被排行榜规则覆盖)
  {
    pattern: /^\^鼠鼠音乐\s*(.*)$/i,
    command: 'df.music',
    args: (match) => match[1]?.trim() || ''
  },
]

/**
 * 注册正则匹配中间件
 * 将 ^xxx 格式的消息转换为对应的 df.xxx 命令
 * 例如: ^微信登录 -> df.login wechat
 *       ^日报 sol -> df.daily sol
 */
export function registerMiddleware(ctx: Context) {
  const logger = ctx.logger('delta-force')

  ctx.middleware(async (session: Session, next) => {
    const content = session.content?.trim()
    if (!content) return next()

    // 检查是否匹配任何规则
    for (const rule of commandRules) {
      const match = content.match(rule.pattern)
      if (match) {
        // 构建命令
        let command = rule.command
        if (rule.args) {
          const args = rule.args(match)
          if (args) {
            command += ' ' + args
          }
        }

        logger.debug(`[regex-match] "${content}" -> "${command}"`)

        // 执行命令
        return session.execute(command)
      }
    }

    return next()
  }, true) // true 表示前置中间件，优先处理
}
