/**
 * BlockRepository - 块数据仓储
 * 
 * 职责:
 * - 封装对思源笔记 blocks 表的 SQL 查询
 * - 提供块数据的批量查询接口
 * - 处理 SQL 注入防护
 * 
 * DDD 架构:
 * - 基础设施层:封装数据访问细节
 * - 不包含业务逻辑
 * - 提供类型安全的查询接口
 */

import { sql } from '@/core/siyuan/api';

/**
 * BlockRepository 类
 * 
 * 封装对思源笔记 blocks 表的查询操作。
 */
export class BlockRepository {
  /**
   * 批量查询块的 root_id
   * 
   * 使用 SQL 查询 blocks 表的 root_id 字段,分批查询以提高性能。
   * 
   * @param blockIds 块 ID 数组
   * @returns Map<blockId, rootId>
   */
  async batchQueryRootIds(blockIds: string[]): Promise<Map<string, string>> {
    const rootIdMap = new Map<string, string>();
    
    if (blockIds.length === 0) {
      return rootIdMap;
    }
    
    // 分批查询(每批 500 个)
    const BATCH_SIZE = 500;
    for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
      const batchIds = blockIds.slice(i, i + BATCH_SIZE);
      const inClause = batchIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
      
      try {
        const result = await sql(`SELECT id, root_id FROM blocks WHERE id IN (${inClause})`);
        
        for (const row of result || []) {
          rootIdMap.set(row.id, row.root_id || '');
        }
      } catch (error) {
        console.error('[BlockRepository] Failed to query rootIds:', error);
        // 为失败的批次设置空字符串
        for (const blockId of batchIds) {
          if (!rootIdMap.has(blockId)) {
            rootIdMap.set(blockId, '');
          }
        }
      }
    }
    
    return rootIdMap;
  }
  
  /**
   * 转义 SQL 字符串
   * 
   * 转义 SQL 字符串中的单引号,防止 SQL 注入。
   * 
   * @param str 待转义的字符串
   * @returns 转义后的字符串
   */
  private escapeSQL(str: string): string {
    return str.replace(/'/g, "''");
  }
}
