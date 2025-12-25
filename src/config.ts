import { Schema } from 'koishi'

export interface Config {
  apiKey: string
  clientID: string
  apiBaseUrl: string
}

export const Config: Schema<Config> = Schema.object({
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
})
