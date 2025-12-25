import { Context } from 'koishi'
import { ApiService } from './api'

// 地图和干员数据缓存
let mapData: Map<string, string> | null = null
let operatorData: Map<string, string> | null = null

export class DataManager {
  constructor(
    private ctx: Context,
    private api: ApiService
  ) {}

  async init() {
    this.ctx.logger('delta-force').info('正在初始化数据缓存...')
    
    try {
      // 获取地图数据
      const mapsRes = await this.api.getMaps()
      if (mapsRes.code === 0 && mapsRes.data) {
        mapData = new Map(mapsRes.data.map((item: any) => [String(item.id), item.name]))
        this.ctx.logger('delta-force').info(`地图数据加载成功 (${mapData.size}条记录)`)
      }

      // 获取干员数据
      const operatorsRes = await this.api.getOperators()
      if (operatorsRes.code === 0 && operatorsRes.data) {
        operatorData = new Map(operatorsRes.data.map((item: any) => [String(item.id), item.name]))
        this.ctx.logger('delta-force').info(`干员数据加载成功 (${operatorData.size}条记录)`)
      }
    } catch (error) {
      this.ctx.logger('delta-force').warn('数据缓存初始化失败:', error)
    }
  }

  getMapName(id: string | number): string {
    if (!mapData) return `地图(${id})`
    return mapData.get(String(id)) || `未知地图(${id})`
  }

  getOperatorName(id: string | number): string {
    if (!operatorData) return `干员(${id})`
    return operatorData.get(String(id)) || `未知干员(${id})`
  }
}
