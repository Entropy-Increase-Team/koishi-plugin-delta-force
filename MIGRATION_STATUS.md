# Koishi 插件迁移状态

> 本文档记录从云崽版迁移到 Koishi 版的功能完成状态

## 功能完成状态

### ✅ 已完成（功能 + 渲染）

| 功能 | Koishi 文件 | 渲染 | 备注 |
|------|------------|------|------|
| 多平台登录 | `account/login.ts` | 无需 | QQ/微信/WeGame/OAuth |
| 账号管理 | `account/account.ts` | 无需 | 绑定/解绑/切换 |
| 个人信息 | `info/info.ts` | ✅ | `userInfo/userInfo.html` |
| 货币信息 | `info/money.ts` | 无需 | 文本输出 |
| 地图统计 | `info/mapstats.ts` | ✅ | `mapStats/mapStats.html` |
| 封号记录 | `info/ban.ts` | 无需 | 文本输出 |
| 日报 | `report/daily.ts` | ✅ | `dailyReport/dailyReport.html` |
| 周报 | `report/weekly.ts` | ✅ | `weeklyReport/weeklyReport.html` |
| 战绩查询 | `report/record.ts` | ✅ | `record/record.html` |
| 价格查询 | `tools/price.ts` | 无需 | 文本输出 |
| 物品搜索 | `tools/object.ts` | 无需 | 文本输出 |
| 每日密码 | `tools/password.ts` | 无需 | 文本输出 |
| 改枪方案 | `tools/solution.ts` | 无需 | 文本输出 |
| 开黑房间 | `tools/room.ts` | 无需 | 文本输出 |
| AI评价 | `tools/ai.ts` | 无需 | 文本输出 |
| 随机语音 | `entertainment/voice.ts` | 无需 | 音频输出 |
| TTS合成 | `entertainment/tts.ts` | 无需 | 音频输出 |
| 资源管理 | `tools/resources.ts` | 无需 | 文本输出 |
| 干员查询 | `info/operator.ts` | ✅ | `operator/operator.html` |
| 服务器状态 | `info/health.ts` | 无需 | 文本输出 |
| 交易流水 | `info/flows.ts` | ✅ | `flows/flows.html` |
| 藏品查询 | `info/collection.ts` | ✅ | `collection/collection.html` |
| 特勤处信息 | `info/place.ts` | ✅ | `placeInfo/placeInfo.html` |
| 个人数据 | `info/personalData.ts` | ✅ | `personalData/personalData.html` |
| 用户统计 | `info/stats.ts` | 无需 | 文本输出（管理员功能） |
| 出红记录 | `info/redRecord.ts` | ✅ | `redRecord/redRecord.html` + `redRecordList/redRecordList.html` |
| 大红收藏 | `info/redCollection.ts` | ✅ | `redCollection/redCollection.html` |
| 帮助菜单 | `system/help.ts` | ✅ | `help/index.html` |
| 娱乐帮助 | `system/help.ts` | ✅ | `help/index.html` |
| 鼠鼠音乐 | `entertainment/music.ts` | ✅ | `musicList/musicList.html` 搜索/播放/排行榜/歌单/点歌/歌词/缓存 |

### 🔄 进行中

| 功能 | Koishi 文件 | 状态 | 备注 |
|------|------------|------|------|
| 无 | - | - | - |

### ❌ 未迁移

| 功能 | 云崽文件 | 优先级 | 备注 |
|------|---------|--------|------|
| 健康状态(游戏内) | `info/HealthInfo.js` | 中 | 需渲染 |
| 战绩订阅 | `report/RecordSubscription.js` | 中 | WebSocket 推送 |
| 日报推送 | `push/DailyPush.js` | 低 | 需 cron 服务 |
| 周报推送 | `push/WeeklyPush.js` | 低 | 需 cron 服务 |
| 特勤处任务推送 | `push/PlaceTask.js` | 低 | 需 cron 服务 |
| 特勤处状态 | `push/placestatus.js` | 低 | 需 cron 服务 |
| 广播通知 | `push/Notification.js` | 低 | WebSocket |
| 定时任务 | `push/Task.js` | 低 | 需 cron 服务 |
| ~~音乐功能~~ | ~~`entertainment/Music.js`~~ | ~~低~~ | ✅ 已完成 |
| ~~帮助菜单(渲染版)~~ | ~~`system/Help.js`~~ | ~~低~~ | ✅ 已完成 |
| WebSocket客户端 | `system/WebSocketClient.js` | 中 | 价格推送等 |

### ⚫ 不迁移

| 功能 | 云崽文件 | 原因 |
|------|---------|------|
| 计算器 | `tools/Calculator.js` | 伤害/维修计算，复杂度高 |
| 更新功能 | `system/Update.js` | Koishi 有自己的更新机制 |

---

## 当前任务

- [x] 干员查询 - 添加渲染支持 ✅
- [x] 服务器状态 - 完善功能 ✅
- [x] 交易流水 - 添加渲染 + 完善功能 ✅
- [x] 藏品查询 - 添加渲染 + 完善功能 ✅
- [x] 特勤处信息 - 添加渲染 + 完善功能 ✅
- [x] 个人数据 - 添加渲染 + 完善功能 ✅
- [x] 用户统计 - 完善功能（文本输出）✅
- [x] 出红记录 - 添加渲染 + 完善功能 ✅
- [x] 大红收藏 - 添加渲染 + 完善功能 ✅
- [x] 帮助菜单 - 图片渲染版 ✅
- [x] 娱乐帮助 - 图片渲染版 ✅

---

## 更新日志

### 2026-03-01
- 完成鼠鼠音乐全功能迁移 (`entertainment/music.ts`)
  - 搜索/随机播放: `df.music [keyword]` / `^鼠鼠音乐 [keyword]`
  - 语音版: `df.music.voice` / `^鼠鼠语音`
  - 歌词: `df.music.lyrics` / `^歌词`
  - 排行榜: `df.music.rank [page]` / `^鼠鼠音乐列表`
  - 歌单: `df.music.playlist [name]` / `^鼠鼠歌单 [name]`
  - 点歌: `df.music.play [n]` / `^点歌 [n]`
  - 缓存管理: `df.music.cache` / `df.music.cache.clean`
  - 音乐卡片: 尝试 OneBot 卡片，失败回退 `h.audio()` 语音
  - 音乐记忆系统 + 列表记忆系统 (2分钟 TTL)
  - 本地文件缓存 (MusicCacheManager)
  - 音乐列表图片渲染 (`musicList/musicList.html`)
- 登录流程优化: 扫码后自动撤回二维码和提示消息

### 2026-01-26
- 完成帮助菜单图片渲染功能 (`system/help.ts` + `help/index.html`)
  - 主帮助菜单：两列布局，包含账号、游戏数据、房间管理、价格查询、战报推送、改枪码、实用工具等分组
  - 娱乐帮助菜单：三列布局，包含语音播放、鼠鼠音乐、TTS语音合成等分组
  - 支持资源未下载时降级为文字版帮助
  - 修复渲染器 sys.scale 和 copyright 默认变量
  - 修复帮助模板路径（resources/help/index.html）
- 完成个人数据渲染功能 (`personalData.ts` + `personalData/personalData.html`)
  - 支持烽火地带/全面战场数据查询
  - 支持赛季参数和模式参数
  - 批量获取物品名称映射（大红收藏、武器列表）
- 完成用户统计功能 (`stats.ts`) - 文本输出（管理员功能）
- 完成出红记录渲染功能 (`redRecord.ts`)
  - 支持查询所有出红记录列表 (`redRecordList/redRecordList.html`)
  - 支持查询指定物品的详细记录 (`redRecord/redRecord.html`)
- 完成大红收藏渲染功能 (`redCollection.ts` + `redCollection/redCollection.html`)
  - 支持赛季参数
  - 显示大红称号、收藏统计、TOP收藏品、未解锁藏品
- 更新 middleware.ts 添加新命令的正则规则

### 2026-01-25
- 创建迁移状态文档
- 完成干员查询渲染功能 (`operator.ts` + `operator/operator.html`)
- 完善服务器状态功能 (`health.ts`)
- 完成交易流水渲染功能 (`flows.ts` + `flows/flows.html`)
- 完成藏品查询渲染功能 (`collection.ts` + `collection/collection.html`)
- 完成特勤处信息渲染功能 (`place.ts` + `placeInfo/placeInfo.html`)
