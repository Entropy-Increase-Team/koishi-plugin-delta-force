# koishi-plugin-delta-force

[![npm](https://img.shields.io/npm/v/koishi-plugin-delta-force?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-delta-force)

三角洲行动游戏数据查询插件

## 📦 安装

在 Koishi 控制台的插件市场中搜索 `delta-force` 并安装。

或者使用命令行：

```bash
npm install koishi-plugin-delta-force
```

## 🎮 功能特性

### 已实现 ✅
- QQ/微信扫码登录
- 个人信息查询
- 日报/周报数据（框架）
- 战绩查询（烽火地带/全面战场）
- 账号管理（列表、切换、解绑）
- 每日密码查询

### 开发中 🚧
- 日报/周报数据格式化
- 图片渲染
- 藏品查询
- 货币查询
- 特勤处功能
- 房间系统
- 推送功能

## ⚙️ 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| apiKey | string | - | API密钥（必填） |
| clientID | string | - | 客户端ID（必填） |
| apiBaseUrl | string | https://df-api.shallow.ink | API基础地址 |

### API 地址选择

- `https://df-api.shallow.ink` - 默认 CDN（推荐）
- `https://df-api-eo.shallow.ink` - EdgeOne CDN
- `https://df-api-esa.shallow.ink` - ESA CDN

### 获取 API Key

1. 访问 [管理页面](https://df.shallow.ink/api-keys)
2. 注册并登录账号
3. 创建 API Key
4. 复制 API Key 和 Client ID 到配置中

## 📝 使用说明

### 基础指令

```
df.help              # 查看帮助
df.login             # QQ 扫码登录
df.login -p wechat   # 微信扫码登录
```

### 信息查询

```
df.info              # 查看个人信息
df.password          # 查看每日密码
df.daily sol         # 查看烽火地带日报
df.weekly mp         # 查看全面战场周报
```

### 战绩查询

```
df.record sol 1      # 查看烽火地带战绩（第1页）
df.record mp 1       # 查看全面战场战绩（第1页）
```

### 账号管理

```
df.account           # 查看账号列表
df.switch 1          # 切换到第1个账号
df.unbind 2          # 解绑第2个账号
```

### 登录流程

1. 发送 `df.login` 或 `df.login -p wechat`
2. 扫描返回的二维码
3. 在手机上确认登录
4. 等待绑定完成

## 📄 许可证

AGPL-3.0 License

## 🙏 鸣谢

- 原云崽插件：[delta-force-plugin](https://github.com/dnyo666/delta-force-plugin)
- API 提供：[@浅巷墨黎](https://github.com/dnyo666)
