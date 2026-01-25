import { Context, h } from 'koishi'
import { Renderer } from '../../render'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 帮助配置接口
 */
interface HelpCfg {
  title?: string
  subTitle?: string
  themeName?: string
  colWidth?: number
  colCount?: number
  twoColumnLayout?: boolean
  bgBlur?: boolean
}

/**
 * 帮助项接口
 */
interface HelpItem {
  icon?: number
  title: string
  desc: string
  css?: string
}

/**
 * 帮助组接口
 */
interface HelpGroup {
  group: string
  order?: number
  masterOnly?: boolean
  fullWidth?: boolean
  column?: 'left' | 'right'
  list?: HelpItem[]
}

/**
 * 帮助列表接口（新格式）
 */
interface HelpListNew {
  fullWidth?: HelpGroup[]
  left?: HelpGroup[]
  right?: HelpGroup[]
}

/**
 * 默认帮助配置
 */
const defaultHelpCfg: HelpCfg = {
  title: '三角洲行动 帮助',
  subTitle: 'DeltaForce-Plugin HELP',
  themeName: 'default',
  colWidth: 420,
  colCount: 2,
  twoColumnLayout: true,
  bgBlur: true
}

/**
 * 娱乐帮助配置
 */
const entertainmentHelpCfg: HelpCfg = {
  title: '三角洲娱乐 帮助',
  subTitle: 'DeltaForce-Plugin ENTERTAINMENT',
  themeName: 'default',
  colWidth: 280,
  colCount: 3,
  twoColumnLayout: false,
  bgBlur: true
}

/**
 * 娱乐帮助列表
 */
const entertainmentHelpList: HelpGroup[] = [
  { group: '所有命令统一使用 ^ 前缀，例如 ^娱乐帮助' },
  {
    group: '语音播放',
    list: [
      { icon: 87, title: '^语音', desc: '随机播放语音' },
      { icon: 87, title: '^语音 [角色名/标签]', desc: '播放指定角色/标签语音' },
      { icon: 87, title: '^语音 [角色] [场景]', desc: '播放指定场景语音' },
      { icon: 87, title: '^语音 [角色] [场景] [动作]', desc: '播放指定动作语音' },
      { icon: 78, title: '^语音列表 | ^语音分类', desc: '查看可用角色/分类信息' },
      { icon: 79, title: '^标签列表 | ^语音统计', desc: '查看特殊标签/音频统计' }
    ]
  },
  {
    group: '鼠鼠音乐',
    list: [
      { icon: 87, title: '^鼠鼠音乐 [关键词]', desc: '随机播放/搜索播放音乐' },
      { icon: 88, title: '^鼠鼠音乐列表 [页码]', desc: '查看热度排行榜' },
      { icon: 98, title: '^鼠鼠语音', desc: '播放鼠鼠语音' },
      { icon: 89, title: '^鼠鼠歌单 [名称]', desc: '查看指定歌单' },
      { icon: 90, title: '^点歌 [序号]', desc: '播放列表中的歌曲' },
      { icon: 45, title: '^歌词', desc: '查看鼠鼠音乐歌词' },
      { icon: 78, title: '^音乐缓存统计', desc: '查看音乐缓存统计' },
      { icon: 78, title: '^清理音乐缓存', desc: '清空所有音乐缓存（仅主人）' }
    ]
  },
  {
    group: 'TTS语音合成',
    list: [
      { icon: 87, title: '^tts [角色] [情感] 文本', desc: '合成并发送语音（角色、情感、文本用空格分隔）' },
      { icon: 87, title: '^tts 麦晓雯 开心 你好呀！', desc: '示例：使用指定角色和情感合成语音' },
      { icon: 78, title: '^tts状态', desc: '查看TTS服务状态和预设信息' },
      { icon: 78, title: '^tts角色列表 | ^tts预设列表', desc: '查看所有可用的角色预设列表' },
      { icon: 78, title: '^tts角色详情 [角色ID]', desc: '查看指定角色的详细信息' },
      { icon: 78, title: '^tts帮助', desc: '查看TTS功能详细使用说明' },
      { icon: 64, title: '^tts上传', desc: '上传上次合成的语音文件' }
    ]
  }
]

/**
 * 默认帮助列表
 */
const defaultHelpList: HelpListNew = {
  fullWidth: [
    {
      order: 1,
      group: '所有命令统一使用 ^ 前缀，例如 ^帮助'
    },
    {
      order: 2,
      group: '此为基础菜单，其他功能请使用 ^娱乐帮助 查看娱乐菜单'
    }
  ],
  left: [
    {
      order: 1,
      group: '账号相关',
      list: [
        { icon: 80, title: '^账号', desc: '查看已绑定token列表' },
        { icon: 71, title: '^账号切换 [序号]', desc: '激活指定序号账号' },
        { icon: 86, title: '^绑定 [token]', desc: '绑定token' },
        { icon: 48, title: '^解绑 [序号]', desc: '解绑指定序号token' },
        { icon: 47, title: '^删除 [序号]', desc: '删除QQ/微信登录数据' },
        { icon: 49, title: '^(微信/QQ)刷新', desc: '刷新微信/QQ token' },
        { icon: 64, title: '^(QQ/微信)登陆', desc: '通过QQ/微信扫码登录' },
        { icon: 62, title: '^(WeGame/wegame微信)登陆', desc: '登录WeGame（QQ/微信扫码）' },
        { icon: 61, title: '^安全中心登陆', desc: '通过安全中心扫码登录' },
        { icon: 71, title: '^(QQ/微信)授权登陆 [code]', desc: '通过授权码登录' },
        { icon: 52, title: '^网页登陆', desc: '通过网页方式登录' },
        { icon: 80, title: '^ck登陆 [cookies]', desc: '通过cookie登录（^ck登陆查看帮助）' },
        { icon: 78, title: '^信息', desc: '查询个人详细信息' },
        { icon: 71, title: '^UID', desc: '查询个人UID' }
      ]
    },
    {
      order: 2,
      group: '游戏数据',
      list: [
        { icon: 41, title: '^藏品 [类型]', desc: '查询个人仓库中的皮肤、饰品等非货币资产（支持类型筛选：干员皮肤、喷漆、挂饰、典藏枪皮、枪皮、载具、头像、军牌）' },
        { icon: 48, title: '^货币', desc: '查询游戏内货币信息' },
        { icon: 55, title: '^数据 [模式] [赛季]', desc: '查询个人统计数据（支持模式和赛季）' },
        { icon: 66, title: '^战绩 [模式] [页码]', desc: '查询战绩（全面/烽火）' },
        { icon: 78, title: '^地图统计 [模式] [赛季/地图名]', desc: '查询地图统计数据（支持模式筛选、赛季查询、地图搜索）' },
        { icon: 53, title: '^流水 [类型/all] [页码/all]', desc: '查询交易流水（设备/道具/货币/all）' },
        { icon: 79, title: '^出红记录 [物品名]', desc: '查询藏品解锁记录（可指定物品）' },
        { icon: 42, title: '^昨日收益 [模式]', desc: '查询昨日收益和物资统计' }
      ]
    },
    {
      order: 3,
      group: '房间管理',
      list: [
        { icon: 28, title: '^房间列表', desc: '查询房间列表' },
        { icon: 23, title: '^创建房间', desc: '创建房间' },
        { icon: 26, title: '^加入房间 [房间号]', desc: '加入房间' },
        { icon: 37, title: '^退出房间 [房间号]', desc: '退出房间' },
        { icon: 56, title: '^踢人 [序号]', desc: '踢出房间成员' },
        { icon: 64, title: '^房间信息', desc: '查询当前房间信息' },
        { icon: 62, title: '^房间地图列表', desc: '查询房间地图列表' },
        { icon: 78, title: '^房间标签列表', desc: '查询房间标签列表' }
      ]
    },
    {
      order: 4,
      group: '价格/利润查询',
      list: [
        { icon: 61, title: '^价格历史 | ^当前价格 [物品名/ID]', desc: '查询物品历史/当前价格' },
        { icon: 61, title: '^材料价格 [物品ID]', desc: '查询制造材料最低价格' },
        { icon: 61, title: '^利润历史 [物品名/ID/场所]', desc: '查询制造利润历史记录' },
        { icon: 61, title: '^利润排行 [类型] [场所] [数量]', desc: '查询利润排行榜V1' },
        { icon: 61, title: '^最高利润 [类型] [场所] [物品ID]', desc: '查询最高利润排行榜V2' },
        { icon: 62, title: '^特勤处利润 [类型]', desc: '查询特勤处四个场所利润TOP3' }
      ]
    }
  ],
  right: [
    {
      order: 1,
      group: '战报与推送',
      list: [
        { icon: 86, title: '^日报 [模式]', desc: '查询日报数据（全面/烽火）' },
        { icon: 86, title: '^周报 [模式] [日期] [展示]', desc: '查询每周战报' },
        { icon: 46, title: '^每日密码', desc: '查询今日密码' },
        { icon: 86, title: '^开启/关闭日报推送', desc: '在本群开启/关闭日报推送' },
        { icon: 37, title: '^开启/关闭周报推送', desc: '在本群开启/关闭周报推送' },
        { icon: 86, title: '^开启/关闭每日密码推送', desc: '开启/关闭每日密码推送' },
        { icon: 86, title: '^开启/关闭特勤处推送', desc: '开启/关闭特勤处制造完成推送' },
        { icon: 86, title: '^订阅 战绩 [模式]', desc: '订阅战绩（sol/mp/both）' },
        { icon: 80, title: '^取消订阅 战绩', desc: '取消战绩订阅' },
        { icon: 78, title: '^订阅状态 战绩', desc: '查看订阅和推送状态' },
        { icon: 61, title: '^开启/关闭私信订阅推送 战绩 [筛选]', desc: '开启/关闭私信推送（可选筛选）' },
        { icon: 61, title: '^开启/关闭本群订阅推送 战绩 [筛选]', desc: '开启/关闭本群推送（可选筛选）' },
        { icon: 79, title: '筛选条件', desc: '百万撤离/百万战损/天才少年' }
      ]
    },
    {
      order: 2,
      group: '社区改枪码',
      list: [
        { icon: 86, title: '^改枪码上传 [改枪码] [描述] [模式] [是否公开] [配件信息]', desc: '上传改枪方案' },
        { icon: 86, title: '^改枪码列表 [武器名]', desc: '查询改枪方案列表' },
        { icon: 86, title: '^改枪码详情 [方案ID]', desc: '查询改枪方案详情' },
        { icon: 86, title: '^改枪码点赞 | ^改枪码点踩 [方案ID]', desc: '点赞/点踩改枪方案' },
        { icon: 86, title: '^改枪码收藏 | ^改枪码取消收藏 [方案ID]', desc: '收藏/取消收藏改枪方案' },
        { icon: 86, title: '^改枪码收藏列表', desc: '查看已收藏的改枪方案' },
        { icon: 86, title: '^改枪码更新 | ^改枪码删除 [方案ID] [参数]', desc: '更新/删除已上传的改枪方案' },
        { icon: 78, title: '网站上传修改', desc: 'https://df.shallow.ink/solutions' }
      ]
    },
    {
      order: 3,
      group: '实用工具',
      list: [
        { icon: 61, title: '^ai锐评 [模式]', desc: '使用AI锐评烽火地带和全面战场数据' },
        { icon: 61, title: '^ai评价 [模式] [预设] [音色]', desc: '使用其他AI预设来评价烽火地带和全面战场数据，音色可选' },
        { icon: 78, title: '^ai预设列表', desc: '查看所有可用的AI评价预设' },
        { icon: 41, title: '^违规记录', desc: '登录QQ安全中心后可查询历史违规' },
        { icon: 48, title: '^特勤处状态', desc: '查询特勤处制造状态' },
        { icon: 71, title: '^特勤处信息 [场所]', desc: '查询特勤处设施升级信息' },
        { icon: 71, title: '^物品列表 [一级分类] [二级分类] [页码]', desc: '获取物品列表（默认props/collection）' },
        { icon: 86, title: '^物品搜索 [名称/ID]', desc: '搜索游戏内物品' },
        { icon: 48, title: '^大红收藏 [赛季数字]', desc: '生成大红收集海报（支持赛季）' },
        { icon: 40, title: '^文章列表 | ^文章详情 [ID]', desc: '查看文章列表/详情' },
        { icon: 71, title: '^健康状态', desc: '查询游戏健康状态信息' },
        { icon: 78, title: '^干员 [名称]', desc: '查询干员详细信息' },
        { icon: 78, title: '^干员列表', desc: '查询所有干员列表（按兵种分组）' }
      ]
    }
  ]
}

/**
 * 生成文字版帮助
 */
function generateTextHelp(): string {
  const lines: string[] = [
    '三角洲行动插件帮助',
    '使用 ^xxx 格式触发指令',
    '',
    '【账号相关】',
    '• ^登录 / ^QQ登录 / ^微信登录 / ^wegame登录',
    '• ^账号 - 账号列表',
    '• ^切换 <序号> - 切换账号',
    '• ^解绑 <序号> - 解绑账号',
    '',
    '【信息查询】',
    '• ^信息 - 查看个人信息',
    '• ^uid - 查看UID',
    '• ^货币 - 货币信息',
    '• ^藏品 [类型] - 个人藏品',
    '• ^数据 [模式] [赛季] - 个人数据',
    '• ^流水 [类型] [页码] - 交易流水',
    '• ^出红记录 [物品名] - 藏品解锁记录',
    '• ^大红收藏 [赛季] - 大红收藏海报',
    '',
    '【战报】',
    '• ^日报 [sol/mp] - 查看日报',
    '• ^周报 [sol/mp] - 查看周报',
    '• ^战绩 [sol/mp] [页码] - 查看战绩',
    '• ^地图统计 [模式] - 地图统计',
    '',
    '【工具】',
    '• ^每日密码 - 每日密码',
    '• ^物品搜索 <名称> - 搜索物品',
    '• ^价格 <名称> - 查询价格',
    '• ^干员 <名称> - 干员详情',
    '• ^特勤处 [设施] [等级] - 特勤处信息',
    '• ^AI锐评 [模式] - AI锐评战绩',
    '',
    '【娱乐】',
    '• ^语音 [角色] - 随机语音',
    '• ^tts <角色> <文本> - TTS合成',
    '• ^娱乐帮助 - 查看娱乐功能帮助',
    '',
    '提示: 请先使用 ^资源下载 下载资源以启用图片渲染'
  ]
  return lines.join('\n')
}

/**
 * 生成文字版娱乐帮助
 */
function generateTextEntertainmentHelp(): string {
  const lines: string[] = [
    '三角洲娱乐帮助',
    '',
    '【语音播放】',
    '• ^语音 - 随机播放语音',
    '• ^语音 [角色名/标签] - 播放指定角色语音',
    '• ^语音列表 - 查看可用角色列表',
    '• ^标签列表 - 查看特殊标签',
    '',
    '【TTS语音合成】',
    '• ^tts [角色] [情感] 文本 - 合成语音',
    '• ^tts角色列表 - 查看TTS角色预设',
    '• ^tts状态 - 查看TTS服务状态',
    '',
    '【鼠鼠音乐】',
    '• ^鼠鼠音乐 [关键词] - 播放音乐',
    '• ^鼠鼠音乐列表 - 查看热度排行榜',
    '',
    '提示: 请先使用 ^资源下载 下载资源以启用图片渲染'
  ]
  return lines.join('\n')
}

/**
 * 检查帮助资源是否可用
 */
function isHelpResourcesReady(resourcesPath: string): boolean {
  const helpTemplatePath = path.join(resourcesPath, 'help', 'index.html')
  const helpImgsPath = path.join(resourcesPath, 'help', 'imgs')
  return fs.existsSync(helpTemplatePath) && fs.existsSync(helpImgsPath)
}

/**
 * 注册帮助命令
 */
export function registerHelpCommands(ctx: Context, renderer: Renderer) {
  const logger = ctx.logger('delta-force')
  
  // 优先使用下载的资源路径，与渲染器保持一致
  const downloadedResourcesPath = path.join(ctx.baseDir, 'data', 'delta-force', 'resources')
  const localResourcesPath = path.resolve(__dirname, '../../resources')
  
  // 检查下载的资源是否存在
  let resourcesPath: string
  if (fs.existsSync(path.join(downloadedResourcesPath, 'help', 'index.html'))) {
    resourcesPath = downloadedResourcesPath
    logger.debug('帮助命令使用下载的资源路径:', downloadedResourcesPath)
  } else {
    resourcesPath = localResourcesPath
    logger.debug('帮助命令使用本地资源路径:', localResourcesPath)
  }

  /**
   * 处理帮助组：检查权限和处理图标
   */
  function processGroup(group: HelpGroup, isMaster: boolean): HelpGroup | null {
    if (group.masterOnly && !isMaster) {
      return null
    }

    if (group.list && Array.isArray(group.list)) {
      group.list.forEach((help) => {
        const icon = (help.icon || 0) * 1
        if (!icon) {
          help.css = 'display:none'
        } else {
          const x = (icon - 1) % 10
          const y = Math.floor((icon - x - 1) / 10)
          help.css = `background-position:-${x * 50}px -${y * 50}px`
        }
      })
    }

    return group
  }

  /**
   * 处理并排序帮助组数组
   */
  function processAndSortGroups(groups: HelpGroup[], isMaster: boolean): HelpGroup[] {
    const DEFAULT_ORDER = 999
    return groups
      .map(group => processGroup({ ...group }, isMaster))
      .filter((g): g is HelpGroup => g !== null)
      .sort((a, b) => (a.order || DEFAULT_ORDER) - (b.order || DEFAULT_ORDER))
  }

  /**
   * 获取组的排序值
   */
  function getGroupOrder(group: HelpGroup): number {
    return group.order || 999
  }

  /**
   * 处理帮助列表
   */
  function processHelpList(helpList: HelpListNew | HelpGroup[], helpCfg: HelpCfg, isMaster: boolean) {
    let leftGroups: HelpGroup[] = []
    let rightGroups: HelpGroup[] = []
    let topFullWidthGroups: HelpGroup[] = []
    let bottomFullWidthGroups: HelpGroup[] = []
    let helpGroup: HelpGroup[] = []
    const ORDER_THRESHOLD = 50

    if (helpList && typeof helpList === 'object' && !Array.isArray(helpList)) {
      // 新格式
      const newList = helpList as HelpListNew

      if (newList.fullWidth && Array.isArray(newList.fullWidth)) {
        const sorted = processAndSortGroups(newList.fullWidth, isMaster)
        sorted.forEach(group => {
          if (getGroupOrder(group) < ORDER_THRESHOLD) {
            topFullWidthGroups.push(group)
          } else {
            bottomFullWidthGroups.push(group)
          }
        })
      }

      if (newList.left && Array.isArray(newList.left)) {
        leftGroups.push(...processAndSortGroups(newList.left, isMaster))
      }

      if (newList.right && Array.isArray(newList.right)) {
        rightGroups.push(...processAndSortGroups(newList.right, isMaster))
      }

      helpGroup = [...topFullWidthGroups, ...bottomFullWidthGroups, ...leftGroups, ...rightGroups]
    } else if (Array.isArray(helpList)) {
      // 旧格式
      helpList.forEach((group) => {
        const processed = processGroup({ ...group }, isMaster)
        if (processed) {
          helpGroup.push(processed)
        }
      })

      if (helpCfg.twoColumnLayout) {
        const normalGroups: HelpGroup[] = []
        helpGroup.forEach((group) => {
          if (group.fullWidth) {
            if (getGroupOrder(group) < ORDER_THRESHOLD) {
              topFullWidthGroups.push(group)
            } else {
              bottomFullWidthGroups.push(group)
            }
          } else if (group.column === 'left') {
            leftGroups.push(group)
          } else if (group.column === 'right') {
            rightGroups.push(group)
          } else {
            normalGroups.push(group)
          }
        })

        if (normalGroups.length > 0) {
          const totalGroups = leftGroups.length + rightGroups.length + normalGroups.length
          const targetLeftCount = Math.ceil(totalGroups / 2)

          normalGroups.forEach((group) => {
            if (leftGroups.length < targetLeftCount) {
              leftGroups.push(group)
            } else {
              rightGroups.push(group)
            }
          })
        }
      }
    }

    return { leftGroups, rightGroups, topFullWidthGroups, bottomFullWidthGroups, helpGroup }
  }

  /**
   * 获取主题数据
   */
  async function getThemeData(helpCfg: HelpCfg) {
    const colCount = Math.min(5, Math.max(parseInt(String(helpCfg.colCount)) || 3, 2))
    const colWidth = Math.min(600, Math.max(200, parseInt(String(helpCfg.colWidth)) || 350))
    const twoColumnLayout = helpCfg.twoColumnLayout === true

    const themeName = helpCfg.themeName || 'default'
    const sidePadding = 30
    const columnGap = 20

    let width: number
    if (twoColumnLayout) {
      const tableWidth = colCount * colWidth
      width = tableWidth * 2 + columnGap + sidePadding
    } else {
      width = colCount * colWidth + sidePadding
    }

    const themePath = themeName
    const bgPath = path.join(resourcesPath, 'help', 'imgs', themePath, 'bg.jpg')
    const iconPath = path.join(resourcesPath, 'help', 'imgs', themePath, 'icon.png')

    let bgExists = false
    let iconExists = false

    try {
      await fs.promises.access(bgPath)
      bgExists = true
    } catch {
      logger.debug(`帮助背景图片不存在: ${bgPath}`)
    }

    try {
      await fs.promises.access(iconPath)
      iconExists = true
    } catch {
      logger.debug(`帮助图标图片不存在: ${iconPath}`)
    }

    const pathToFileUrl = (filePath: string) => {
      if (!filePath) return ''
      const normalizedPath = path.resolve(filePath).replace(/\\/g, '/')
      return `file:///${normalizedPath}`
    }

    const theme = {
      bg: bgExists ? pathToFileUrl(bgPath) : '',
      icon: iconExists ? pathToFileUrl(iconPath) : ''
    }

    const ret: string[] = []

    // body 样式
    const bodyFontFamily = 'Microsoft YaHei, SimHei, Arial, sans-serif'
    const bodyBgImage = theme.bg ? `background-image:url("${theme.bg}");background-repeat:no-repeat;background-size:cover;` : ''
    ret.push(`body{width:${width}px;font-family:${bodyFontFamily};${bodyBgImage}}`)

    // container 样式
    const containerBgImage = theme.bg ? `background-image:url("${theme.bg}");background-position:top left;background-repeat:no-repeat;background-size:100% auto;` : ''
    ret.push(`.container{width:${width}px;${containerBgImage}}`)

    // help-icon 样式
    const iconBgImage = theme.icon ? `background-image:url("${theme.icon}");background-size:500px auto;` : ''
    ret.push(`.help-icon{${iconBgImage}}`)

    // 表格宽度
    ret.push(`.help-table .td,.help-table .th{width:${100 / colCount}%}`)

    // 两列布局
    if (twoColumnLayout) {
      ret.push(`
        .help-content-wrapper{display:flex;gap:${columnGap}px;width:100%;}
        .help-column{flex:1;min-width:0;}
        .help-column .cont-box{width:100%;}
      `)
    }

    // 其他样式
    ret.push('.head-box .title{font-size:50px}')
    ret.push('.help-group{font-size:18px}')
    ret.push('.help-title{font-size:16px}')
    ret.push('.help-desc{font-size:13px}')
    ret.push('.help-table .td,.help-table .th{font-size:14px}')
    ret.push('.help-title,.help-group{color:#ceb78b}')
    ret.push('.help-desc{color:#eee}')
    ret.push('.cont-box{background:rgba(43, 52, 61, 0.8)}')
    ret.push(`.cont-box{backdrop-filter:${helpCfg.bgBlur !== false ? 'blur(3px)' : 'none'}}`)
    ret.push('.help-group{background:rgba(34, 41, 51, .4)}')
    ret.push('.help-table .tr:nth-child(odd){background:rgba(34, 41, 51, .2)}')
    ret.push('.help-table .tr:nth-child(even){background:rgba(34, 41, 51, .4)}')

    return {
      style: `<style>${ret.join('\n')}</style>`,
      colCount,
      width
    }
  }

  // 帮助命令
  ctx.command('df.help', '查看三角洲行动帮助')
    .alias('df.帮助')
    .alias('df.菜单')
    .action(async ({ session }) => {
      const isMaster = false

      // 检查资源是否已下载
      if (!isHelpResourcesReady(resourcesPath)) {
        logger.debug('帮助资源未下载，使用文字版')
        return generateTextHelp()
      }

      try {
        const helpCfg = defaultHelpCfg
        const helpList = defaultHelpList

        const { leftGroups, rightGroups, topFullWidthGroups, bottomFullWidthGroups, helpGroup } =
          processHelpList(helpList, helpCfg, isMaster)

        const themeData = await getThemeData(helpCfg)

        const templateData = {
          helpCfg,
          helpGroup,
          leftGroups,
          rightGroups,
          topFullWidthGroups,
          bottomFullWidthGroups,
          ...themeData,
          colCount: themeData.colCount,
          themePath: helpCfg.themeName || 'default',
          element: 'default',
          bgType: 1
        }

        const imageResult = await renderer.render('help', templateData, { width: themeData.width })

        if (imageResult.success && imageResult.image) {
          return h.image(imageResult.image, 'image/png')
        }

        return imageResult.error || '渲染帮助菜单失败'
      } catch (error) {
        logger.error('生成帮助菜单失败:', error)
        return `生成帮助菜单失败: ${(error as Error).message}`
      }
    })

  // 娱乐帮助命令
  ctx.command('df.entertainment', '查看娱乐功能帮助')
    .alias('df.娱乐帮助')
    .alias('df.娱乐菜单')
    .action(async ({ session }) => {
      const isMaster = false

      // 检查资源是否已下载
      if (!isHelpResourcesReady(resourcesPath)) {
        logger.debug('帮助资源未下载，使用文字版')
        return generateTextEntertainmentHelp()
      }


      try {
        const helpCfg = entertainmentHelpCfg

        // 处理娱乐帮助列表（旧格式数组）
        const helpGroup: HelpGroup[] = []
        entertainmentHelpList.forEach((group) => {
          const processed = processGroup({ ...group }, isMaster)
          if (processed) {
            helpGroup.push(processed)
          }
        })

        const themeData = await getThemeData(helpCfg)

        const templateData = {
          helpCfg,
          helpGroup,
          leftGroups: [],
          rightGroups: [],
          topFullWidthGroups: [],
          bottomFullWidthGroups: [],
          ...themeData,
          colCount: themeData.colCount,
          themePath: helpCfg.themeName || 'default',
          element: 'default',
          bgType: 1
        }

        const imageResult = await renderer.render('help', templateData, { width: themeData.width })

        if (imageResult.success && imageResult.image) {
          return h.image(imageResult.image, 'image/png')
        }

        return imageResult.error || '渲染娱乐帮助菜单失败'
      } catch (error) {
        logger.error('生成娱乐帮助菜单失败:', error)
        return `生成娱乐帮助菜单失败: ${(error as Error).message}`
      }
    })
}
