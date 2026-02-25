/**
 * Card Content Query Service
 * 卡片内容查询服务
 * 
 * 应用层服务，负责批量查询卡片的块内容。
 * 支持两种查询模式：
 * 1. 文档块：获取文档标题
 * 2. 普通块：获取块内容
 * 
 * @layer Application Layer
 * @see DDD Architecture: src/application/queries/
 */

import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import { QuerySiyuanAdapter } from '@/infrastructure/siyuan/QuerySiyuanAdapter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CardContentQueryService');

/**
 * 块内容结果
 */
export interface BlockContentResult {
  /** 块 ID */
  id: string;
  /** 块内容 */
  content: string;
  /** 块类型 */
  type: string;
  /** 是否为文档块 */
  isDocument: boolean;
}

/**
 * 卡片内容查询服务
 * 
 * 职责：
 * - 批量查询块内容
 * - 区分文档块和普通块
 * - 缓存查询结果（短期缓存）
 * - 处理查询错误
 * 
 * 依赖：
 * - 基础设施层：通过动态导入 siyuan API
 */
export class CardContentQueryService {
  constructor(
    private readonly siyuanApi: QuerySiyuanPort = new QuerySiyuanAdapter()
  ) {}

  /**
   * 内容缓存
   * 
   * 短期缓存（1 分钟），避免重复查询
   */
  private contentCache: Map<string, BlockContentResult> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 分钟
  
  /**
   * 批量获取块内容（简化版，只返回内容字符串）
   * 
   * @param blockIds 块 ID 数组
   * @returns 块 ID 到内容的映射
   * @deprecated 使用 getBlockContentsWithType 代替
   */
  async getBlockContents(blockIds: string[]): Promise<Map<string, string>> {
    const results = await this.getBlockContentsWithType(blockIds);
    const contentMap = new Map<string, string>();
    
    for (const [blockId, result] of results.entries()) {
      contentMap.set(blockId, result.content);
    }
    
    return contentMap;
  }
  
  /**
   * 批量获取块内容（带类型信息）
   * 
   * 智能处理：
   * - 文档块（type='d'）：返回文档标题
   * - 普通块：返回块内容
   * 
   * @param blockIds 块 ID 数组
   * @returns 块 ID 到内容结果的映射
   */
  async getBlockContentsWithType(blockIds: string[]): Promise<Map<string, BlockContentResult>> {
    if (blockIds.length === 0) {
      return new Map();
    }
    
    // 检查缓存
    const now = Date.now();
    const cacheValid = (now - this.cacheTimestamp) < this.CACHE_TTL;
    
    if (cacheValid) {
      // 从缓存中获取已有的内容
      const cachedResults = new Map<string, BlockContentResult>();
      const uncachedIds: string[] = [];
      
      for (const blockId of blockIds) {
        const cached = this.contentCache.get(blockId);
        if (cached) {
          cachedResults.set(blockId, cached);
        } else {
          uncachedIds.push(blockId);
        }
      }
      
      // 如果所有内容都在缓存中，直接返回
      if (uncachedIds.length === 0) {
        return cachedResults;
      }
      
      // 查询未缓存的内容
      const freshResults = await this.fetchBlockContentsFromDB(uncachedIds);
      
      // 合并结果
      for (const [blockId, result] of freshResults.entries()) {
        cachedResults.set(blockId, result);
        this.contentCache.set(blockId, result);
      }
      
      return cachedResults;
    }
    
    // 缓存过期，重新查询所有内容
    const results = await this.fetchBlockContentsFromDB(blockIds);
    
    // 更新缓存
    this.contentCache.clear();
    for (const [blockId, result] of results.entries()) {
      this.contentCache.set(blockId, result);
    }
    this.cacheTimestamp = now;
    
    return results;
  }
  
  /**
   * 从数据库批量查询块内容
   * 
   * 查询逻辑：
   * 1. 查询块的 type 和 content
   * 2. 如果是文档块（type='d'），content 就是文档标题
   * 3. 如果是普通块，content 就是块内容
   * 
   * @param blockIds 块 ID 数组
   * @returns 块 ID 到内容结果的映射
   */
  private async fetchBlockContentsFromDB(blockIds: string[]): Promise<Map<string, BlockContentResult>> {
    const contentMap = new Map<string, BlockContentResult>();
    
    if (blockIds.length === 0) {
      return contentMap;
    }
    
    try {
      // 批量查询（每批 500 个）
      const BATCH_SIZE = 500;
      
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const inClause = batchIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
        
        // 查询块的 id, type, content
        // 注意：对于文档块（type='d'），content 字段就是文档标题
        const result = await this.siyuanApi.sql(`SELECT id, type, content FROM blocks WHERE id IN (${inClause})`);
        
        for (const row of result || []) {
          const content = String(row.content || '').trim();
          const type = String(row.type || '');
          const isDocument = type === 'd';
          
          // ✅ 即使 content 为空也添加到 map（避免重复查询）
          contentMap.set(row.id, {
            id: row.id,
            content,
            type,
            isDocument,
          });
        }
      }
      
      logger.debug(`Fetched content for ${contentMap.size}/${blockIds.length} blocks`);
    } catch (error) {
      logger.error('Failed to fetch block contents:', error);
      throw error;
    }
    
    return contentMap;
  }
  
  /**
   * 转义 SQL 字符串
   * 
   * @param value 原始字符串
   * @returns 转义后的字符串
   */
  private escapeSQL(value: string): string {
    return String(value || '').replace(/'/g, "''");
  }
  
  /**
   * 清除缓存
   * 
   * 用于测试或强制刷新
   */
  clearCache(): void {
    this.contentCache.clear();
    this.cacheTimestamp = 0;
  }
}
