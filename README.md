# koishi-plugin-delta-force

[![npm](https://img.shields.io/npm/v/koishi-plugin-delta-force?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-delta-force)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](https://github.com/Dnyo666/koishi-plugin-delta-force/blob/main/LICENSE)

一个适用于 [Koishi](https://koishi.chat/) 的三角洲行动游戏数据查询插件

支持 QQ/微信/WeGame 扫码登录或 Token 手动绑定，支持查询个人信息、日报、周报、战绩等游戏数据

**使用中遇到问题请加 QQ 群咨询：932459332**

## 简介

三角洲行动是一款由腾讯琳琅天上工作室开发的 FPS 游戏，本插件旨在帮助玩家更方便地查询游戏数据，提升游戏体验。支持烽火地带和全面战场两种模式的数据查询。

插件当前处于正式运营阶段，欢迎加入 [932459332](https://qm.qq.com/q/CrYiAQxJPW) 交流反馈，同时也欢迎各位提交 ISSUE

插件采用统一后端处理，使用插件请前往 [管理页面](https://df.shallow.ink) 进行注册登录并获取 API Key，如果需要部分功能，可选择订阅专业版（4.5元/月），费用仅供服务器维护

## 安装

### 使用 Koishi 插件市场（推荐）

在 Koishi 控制台的插件市场中搜索 `delta-force` 并安装

### 使用 npm

```bash
npm install koishi-plugin-delta-force
```

### 使用 yarn

```bash
yarn add koishi-plugin-delta-force
```

## 配置

在 Koishi 控制台中配置以下必需项：

- `apiKey`: API 密钥，在 [管理页面](https://df.shallow.ink/api-keys) 创建
- `clientID`: 客户端 ID，在 [管理页面](https://df.shallow.ink/) 的个人信息获取（用户 ID）
- `apiBaseUrl`: API 服务器地址（可选，默认使用官方服务器）

## 功能列表

### 个人类功能

- [x] QQ/微信/WeGame/QQ安全中心 扫码登录
- [x] Cookie 登录 / QQ OAuth / 微信 OAuth / 网页登录
- [x] 多账号分组管理（QQ/微信、WeGame、QQ安全中心）
- [x] 账号切换与解绑
- [x] 角色绑定 / 手动绑定 Token
- [x] 个人信息查询 / UID 查询
- [x] 日报/周报数据（图片渲染）
- [x] 战绩查询（图片渲染）
- [x] 个人数据统计（图片渲染）
- [x] 藏品/资产查询（图片渲染）
- [x] 货币信息查询
- [x] 交易流水查询（图片渲染）
- [x] 封号/违规记录查询
- [x] 地图统计（图片渲染）
- [x] 特勤处信息（图片渲染）
- [x] 干员查询（图片渲染）
- [x] 出红记录 / 大红收藏（图片渲染）
- [ ] 战绩订阅推送
- [ ] 日报/周报定时推送

### 工具类功能

- [x] 每日密码查询
- [x] 开黑房间创建与管理
- [x] 社区改枪码（上传/列表/详情/收藏/投票）
- [x] 物品查询搜索
- [x] 物品价格 / 价格历史 / 利润排行
- [x] AI 战绩评价
- [x] 服务器状态查询
- [x] 静态资源管理（下载/更新/检查）

### 娱乐类功能

- [x] 随机语音（角色/场景/标签）
- [x] TTS 语音合成
- [x] 鼠鼠音乐（搜索/播放/排行榜/歌单/点歌/歌词/缓存）

## 命令列表

所有命令均支持 `^` 前缀快捷触发（如 `^登录`、`^日报`），与云崽版保持一致。

### 账号管理

| 命令 | 功能 | 示例 |
| --- | --- | --- |
| `df.login [平台]` | 扫码登录 | `df.login qq` / `df.login wechat` / `df.login wegame` |
| `df.cklogin [cookie]` | Cookie 登录 | `df.cklogin <cookie>` |
| `df.qqoauth [url]` | QQ OAuth 登录 | `df.qqoauth` |
| `df.wxoauth [url]` | 微信 OAuth 登录 | `df.wxoauth` |
| `df.weblogin` | 网页登录 | `df.weblogin` |
| `df.bind` | 绑定游戏角色 | `df.bind` |
| `df.bindtoken <token>` | 手动绑定 Token | `df.bindtoken xxx-xxx` |
| `df.account` | 账号列表 | `df.account` |
| `df.switch <序号>` | 切换账号 | `df.switch 2` |
| `df.unbind <序号>` | 解绑账号 | `df.unbind 1` |
| `df.delete <序号>` | 删除登录数据 | `df.delete 1` |

### 个人数据

| 命令 | 功能 | 示例 |
| --- | --- | --- |
| `df.info` | 个人信息 | 显示昵称、等级、UID、资产等 |
| `df.uid` | 查询 UID | 快速查看角色 UID |
| `df.daily [类型]` | 查询日报 | `df.daily` / `df.daily 烽火` / `df.daily 全面` |
| `df.weekly [类型]` | 查询周报 | `df.weekly` / `df.weekly 烽火 20260111` |
| `df.record [类型] [页码]` | 查询战绩 | `df.record 烽火 1` / `df.record 全面 2` |
| `df.data [参数]` | 个人数据统计 | `df.data sol` / `df.data mp s8` |
| `df.money` | 货币信息 | 查询货币详情 |
| `df.flows [类型] [页码]` | 交易流水 | `df.flows` / `df.flows 设备` |
| `df.collection [类型]` | 藏品查询 | `df.collection` |
| `df.redrecord [物品名]` | 出红记录 | `df.redrecord` / `df.redrecord 火麒麟` |
| `df.redcollection [赛季]` | 大红收藏 | `df.redcollection` / `df.redcollection s8` |
| `df.mapstats [模式]` | 地图统计 | `df.mapstats` / `df.mapstats 烽火` |
| `df.ban` | 封号记录 | 查询封号/违规历史 |
| `df.place [设施] [等级]` | 特勤处信息 | `df.place` / `df.place 原料厂 3` |
| `df.operator <名称>` | 干员查询 | `df.operator 红狼` |

### 工具功能

| 命令 | 功能 | 示例 |
| --- | --- | --- |
| `df.password` | 每日密码 | 查询当日地图密码 |
| `df.price <名称>` | 价格查询 | `df.price 腾龙` |
| `df.object <名称>` | 物品搜索 | `df.object M4A1` |
| `df.ai [模式]` | AI 评价 | `df.ai` / `df.ai mp` |
| `df.solution.list [武器]` | 改枨码列表 | `df.solution.list M4A1` |
| `df.room.list [模式]` | 开黑房间 | `df.room.list` / `df.room.create 烽火` |
| `df.health` | 服务器状态 | 查看 API 服务状态 |
| `df.resources.download` | 资源管理 | 下载/更新静态资源 |

### 娱乐功能

| 命令 | 功能 | 示例 |
| --- | --- | --- |
| `df.voice [参数]` | 随机语音 | `df.voice` / `df.voice 红狼 局内 战斗` |
| `df.tts <角色> [情感] <文本>` | TTS 语音合成 | `df.tts 麦晓雯 开心 你好呀！` |
| `df.music [关键词]` | 鼠鼠音乐 | `df.music` / `df.music 曼波` |
| `df.music.rank [页码]` | 音乐排行榜 | `df.music.rank` / `df.music.rank 2` |
| `df.music.playlist [名称]` | 鼠鼠歌单 | `df.music.playlist 曼波` |
| `df.music.play <序号>` | 点歌 | `df.music.play 3` |
| `df.music.lyrics` | 查看歌词 | 获取当前歌曲歌词 |
| `df.music.voice` | 语音播放 | 强制语音格式播放 |
| `df.help` | 帮助菜单 | 图片渲染帮助 |

### 快捷触发示例

```
^登录 / ^QQ登录 / ^微信登录 / ^wegame登录
^信息 / ^日报 / ^周报 / ^战绩 / ^数据
^价格 腾龙 / ^物品搜索 M4A1
^鼠鼠音乐 / ^鼠鼠音乐列表 / ^点歌 3 / ^歌词
^鼠鼠语音 / ^语音 红狼 / ^tts 麦晓雯 你好
^帮助 / ^娱乐帮助
```

### 登录平台说明

- `qq` - QQ 扫码登录
- `wechat` / `wx` / `微信` - 微信扫码登录
- `wegame` - WeGame（使用 QQ 扫描）
- `wegame/wechat` / `wegame微信` - WeGame（使用微信扫描）
- `qqsafe` / `安全中心` - QQ 安全中心

### 账号分组管理

插件支持多账号分组管理，不同平台的账号会自动分组：

- **QQ & 微信分组**：QQ 和微信登录的账号
- **WeGame 分组**：WeGame 登录的账号
- **QQ 安全中心分组**：QQ 安全中心登录的账号

每个分组可以独立激活一个账号，切换账号时只会影响对应分组的激活状态。

## 鸣谢

- **API 支持**：感谢 [浅巷墨黎](https://github.com/dnyo666) 整理并提供的三角洲行动 API 接口文档及后端
- **代码贡献**：
  - [@浅巷墨黎（Dnyo666）](https://github.com/dnyo666)：项目主要开发者
  - [@MapleLeaf](https://github.com/MapleLeaf2007)：后端基础架构开发
  - [@Admilk](https://github.com/Admilkk)：后端基础架构开发
- **特别鸣谢**：
  - [云崽版三角洲插件](https://github.com/dnyo666/delta-force-plugin)：本插件基于云崽版本重构而来
  - [Koishi](https://koishi.chat/)：优秀的跨平台机器人框架
  - [三角洲行动官方](https://df.qq.com)：感谢官方的数据
  - [繁星攻略组](https://space.bilibili.com/3546853731731919)：授权提供计算器算法和数据

## 其他框架

- **云崽**:[delta-force-plugin](https://github.com/Dnyo666/delta-force-plugin)
- **Nonebot2**：[nonebot-plugin-delta-force](https://github.com/Entropy-Increase-Team/nonebot-plugin-delta-force)
- **Koishi**：[koishi-plugin-delta-force](https://github.com/Entropy-Increase-Team/koishi-plugin-delta-force)

## 支持与贡献

如果你喜欢这个项目，请不妨点个 Star🌟，这是对开发者最大的动力。

有意见或者建议也欢迎提交 [Issues](https://github.com/dnyo666/koishi-plugin-delta-force/issues) 和 [Pull requests](https://github.com/dnyo666/koishi-plugin-delta-force/pulls)。

## 许可证

本项目使用 [GNU AGPLv3](https://choosealicense.com/licenses/agpl-3.0/) 作为开源许可证。
