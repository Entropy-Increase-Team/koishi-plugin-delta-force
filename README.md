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
- [x] 多账号分组管理（QQ/微信、WeGame、QQ安全中心）
- [x] 账号切换与解绑
- [x] 角色绑定
- [x] 个人信息查询
- [x] UID 查询
- [ ] 日报/周报数据
- [ ] 战绩查询
- [x] 每日密码查询
- [ ] 战绩推送
- [ ] 藏品/资产查询
- [ ] 货币信息查询
- [ ] 封号记录查询
- [ ] 特勤处状态
- [ ] 日报/周报订阅推送

### 工具类功能

- [x] 每日密码查询
- [ ] 开黑房间创建与管理
- [ ] 官方文章&公告
- [ ] 社区改枪码
- [ ] 物品查询搜索
- [ ] 物品价格历史
- [ ] 特勤处利润计算
- [ ] 三角洲计算器（伤害、维修计算）

### 娱乐类功能

- [ ] 摸金模拟器
- [ ] 对局模拟器
- [ ] 随机音频
- [ ] 随机表情包

## 命令列表

| 命令 | 功能 | 示例 |
| --- | --- | --- |
| `df.login [平台]` | 登录账号 | `df.login qq` / `df.login wechat` / `df.login wegame` |
| `df.bind [token]` | 绑定游戏角色 | `df.bind` 或 `df.bind <token>` |
| `df.info` | 查询个人信息 | 显示昵称、等级、UID、资产等详情 |
| `df.uid` | 查询 UID | 快速查看角色 UID |
| `df.account` | 账号管理 | 查看已绑定账号列表 |
| `df.switch <序号>` | 切换账号 | 在多个绑定账号间切换 |
| `df.unbind <序号>` | 解绑账号 | 解绑指定账号 |
| `df.daily [类型]` | 查询日报 | `df.daily` / `df.daily 烽火` / `df.daily 全面` |
| `df.weekly [类型]` | 查询周报 | `df.weekly` / `df.weekly 烽火` / `df.weekly 全面` |
| `df.record [类型] [页码]` | 查询战绩 | `df.record 烽火 1` / `df.record 全面 2` |
| `df.password` | 每日密码 | 查询当日地图密码 |

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
