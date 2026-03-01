import { Schema } from 'koishi'

export interface TtsConfig {
  enabled: boolean
  mode: 'blacklist' | 'whitelist'
  groupList: string[]
  userList: string[]
  maxLength: number
}

export interface Config {
  apiKey: string
  clientID: string
  apiBaseUrl: string
  useGhProxy: boolean
  tts: TtsConfig
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    apiKey: Schema.string()
      .required()
      .role('secret')
      .description('API密钥，在 https://df.shallow.ink/api-keys 创建'),

    clientID: Schema.string()
      .required()
      .description('客户端ID，从管理页面获取'),

    apiBaseUrl: Schema.union([
      Schema.const('https://df-api.shallow.ink').description('默认 CDN（推荐）'),
      Schema.const('https://df-api-eo.shallow.ink').description('EdgeOne CDN'),
      Schema.const('https://df-api-esa.shallow.ink').description('ESA CDN'),
      Schema.string(),
    ])
      .default('https://df-api.shallow.ink')
      .description('API 基础地址'),

    useGhProxy: Schema.boolean()
      .default(false)
      .description('使用 GH-Proxy 加速下载（国内用户推荐开启）'),
  }).description('基础配置'),

  Schema.object({
    tts: Schema.object({
      enabled: Schema.boolean()
        .default(true)
        .description('启用 TTS 语音合成功能'),
      mode: Schema.union([
        Schema.const('blacklist' as const).description('黑名单模式'),
        Schema.const('whitelist' as const).description('白名单模式'),
      ])
        .default('blacklist')
        .description('黑白名单模式（白名单：仅列表内可用；黑名单：列表内禁用）'),
      groupList: Schema.array(Schema.string())
        .default([])
        .description('群号列表（配合黑白名单模式使用）'),
      userList: Schema.array(Schema.string())
        .default([])
        .description('用户ID列表（配合黑白名单模式使用）'),
      maxLength: Schema.number()
        .default(800)
        .min(20)
        .max(800)
        .description('TTS 文本最大字数限制'),
    }).description('TTS 语音合成'),
  }).description('TTS 语音合成'),
]) as Schema<Config>
