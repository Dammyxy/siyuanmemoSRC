/**
 * 概念卡查询引擎
 * 
 * 专门为概念卡神经漫游设计的查询引擎，提供：
 * - 反链查询
 * - 正链查询（所有出链）
 * - 描述符卡查询
 * - 块数据查询
 */

import * as api from '../../siyuan/api';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConceptQueryEngine');

export interface Neighbor {
  id: string;
  type: 'backlink' | 'outgoing-direct' | 'outgoing-indirect' | 'descriptor';
  weight: number;
}

export interface BlockData {
  id: string;
  content: string;
  type: string;
  [key: string]: any;
}

export class ConceptQueryEngine {
  /**
   * 获取概念卡的所有邻居
   * 
   * @param conceptId 概念卡 ID
   * @returns 邻居列表（已去重）
   */
  async fetchNeighbors(conceptId: string): Promise<Neighbor[]> {
    try {
      // 并行查询所有类型（性能提升 3 倍）
      const [backlinks, directOutgoing, indirectOutgoing, descriptors] = await Promise.all([
        this.fetchBacklinks(conceptId),
        this.fetchDirectOutgoingLinks(conceptId),
        this.fetchIndirectOutgoingLinks(conceptId),
        this.fetchDescriptors(conceptId),
      ]);

      const neighbors: Neighbor[] = [
        ...backlinks.map(id => ({ id, type: 'backlink' as const, weight: 15 })),
        ...directOutgoing.map(id => ({ id, type: 'outgoing-direct' as const, weight: 10 })),
        ...indirectOutgoing.map(id => ({ id, type: 'outgoing-indirect' as const, weight: 6 })),
        ...descriptors.map(id => ({ id, type: 'descriptor' as const, weight: 3 })),
      ];

      // 去重（同一个块可能同时是反链和正链）
      const uniqueNeighbors = this.deduplicateNeighbors(neighbors);
      
      logger.log(`Found ${uniqueNeighbors.length} unique neighbors for ${conceptId} (backlinks: ${backlinks.length}, direct: ${directOutgoing.length}, indirect: ${indirectOutgoing.length}, descriptors: ${descriptors.length})`);
      return uniqueNeighbors;
    } catch (error) {
      logger.error('Failed to fetch neighbors:', error);
      return [];
    }
  }

  /**
   * 查询反链
   * 
   * 使用思源 API 获取反链，返回具体的引用块 ID
   * 
   * @param conceptId 概念卡 ID
   * @returns 反链块 ID 列表
   */
  async fetchBacklinks(conceptId: string): Promise<string[]> {
    try {
      logger.debug(`Fetching backlinks for: ${conceptId}`);
      
      // 使用 /api/ref/getBacklink API
      const response = await fetch('/api/ref/getBacklink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: conceptId,
          k: '',  // 关键词过滤（空表示不过滤）
          mk: ''  // 更多关键词（空表示不过滤）
        }),
      });

      if (!response.ok) {
        logger.error(`API request failed: ${response.status}`);
        return [];
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        logger.error(`API error: ${data.msg}`);
        return [];
      }

      // 解析反链数据
      const backlinks = data.data?.backlinks || [];
      logger.debug(`Raw backlinks count: ${backlinks.length}`);
      
      if (backlinks.length > 0) {
        logger.debug('First backlink sample:', backlinks[0]);
      }
      
      // 递归提取所有块 ID
      const backlinkIds: string[] = [];
      
      const extractBlockIds = (node: any) => {
        // 如果有 children，递归提取
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            // 提取子节点的 ID
            if (child.id && child.id !== conceptId) {
              backlinkIds.push(child.id);
            }
            // 递归处理子节点的 children
            extractBlockIds(child);
          }
        }
      };
      
      // 遍历所有反链节点
      for (const backlink of backlinks) {
        extractBlockIds(backlink);
      }

      logger.debug(`Found ${backlinkIds.length} backlink blocks`, backlinkIds.slice(0, 10));
      
      return backlinkIds;
    } catch (error) {
      logger.error('Failed to fetch backlinks:', error);
      return [];
    }
  }

  /**
   * 查询直接正链
   * 
   * 查询概念卡文档块里包含的正链（引用）
   * 
   * @param conceptId 概念卡 ID
   * @returns 直接出链块 ID 列表
   */
  async fetchDirectOutgoingLinks(conceptId: string): Promise<string[]> {
    try {
      const stmt = `
        SELECT DISTINCT r.def_block_id as id
        FROM refs r
        WHERE r.block_id = '${this.escapeSQL(conceptId)}'
          OR r.block_id IN (
            -- 查询所有子块
            WITH RECURSIVE descendants AS (
              SELECT id FROM blocks WHERE parent_id = '${this.escapeSQL(conceptId)}'
              UNION ALL
              SELECT b.id FROM blocks b
              INNER JOIN descendants d ON b.parent_id = d.id
            )
            SELECT id FROM descendants
          )
      `;

      const rows = await api.sql(stmt);
      
      if (!rows || !Array.isArray(rows)) {
        logger.debug('No direct outgoing links found');
        return [];
      }

      const linkIds = rows.map(row => row.id);
      logger.debug(`Found ${linkIds.length} direct outgoing links`);
      return linkIds;
    } catch (error) {
      logger.error('Failed to fetch direct outgoing links:', error);
      return [];
    }
  }

  /**
   * 查询间接正链
   * 
   * 查询概念卡反链里出现的正链（引用）
   * 
   * @param conceptId 概念卡 ID
   * @returns 间接出链块 ID 列表
   */
  async fetchIndirectOutgoingLinks(conceptId: string): Promise<string[]> {
    try {
      // 1. 先获取反链块 ID
      const backlinkIds = await this.fetchBacklinks(conceptId);
      
      if (backlinkIds.length === 0) {
        logger.debug('No backlinks, so no indirect outgoing links');
        return [];
      }

      // 2. 查询这些反链块中的所有出链
      const backlinkIdsStr = backlinkIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
      
      const stmt = `
        SELECT DISTINCT r.def_block_id as id
        FROM refs r
        WHERE r.block_id IN (${backlinkIdsStr})
          AND r.def_block_id != '${this.escapeSQL(conceptId)}'
      `;

      const rows = await api.sql(stmt);
      
      if (!rows || !Array.isArray(rows)) {
        logger.debug('No indirect outgoing links found');
        return [];
      }

      const linkIds = rows.map(row => row.id);
      logger.debug(`Found ${linkIds.length} indirect outgoing links from ${backlinkIds.length} backlinks`);
      return linkIds;
    } catch (error) {
      logger.error('Failed to fetch indirect outgoing links:', error);
      return [];
    }
  }

  /**
   * @deprecated 使用 fetchDirectOutgoingLinks 和 fetchIndirectOutgoingLinks 代替
   */
  async fetchOutgoingLinks(conceptId: string): Promise<string[]> {
    return this.fetchDirectOutgoingLinks(conceptId);
  }

  /**
   * 查询描述符卡
   * 
   * 查询概念卡的直接子块中标记为 descriptor 的卡片
   * 
   * @param conceptId 概念卡 ID
   * @returns 描述符卡 ID 列表
   */
  async fetchDescriptors(conceptId: string): Promise<string[]> {
    try {
      const stmt = `
        SELECT DISTINCT b.id
        FROM blocks b
        INNER JOIN attributes a ON b.id = a.block_id
        WHERE b.parent_id = '${this.escapeSQL(conceptId)}'
          AND a.name = 'custom-fsrs-card-type'
          AND a.value = 'descriptor'
      `;

      const rows = await api.sql(stmt);
      
      if (!rows || !Array.isArray(rows)) {
        return [];
      }

      const descriptorIds = rows.map(row => row.id);
      logger.debug(`Found ${descriptorIds.length} descriptors`);
      return descriptorIds;
    } catch (error) {
      logger.error('Failed to fetch descriptors:', error);
      return [];
    }
  }

  /**
   * 检查块是否为概念卡
   * 
   * 只检查块是否标记为 concept 类型，不要求卡片已创建
   * （神经漫游不需要 FSRS 数据，只需要知道这是概念块）
   * 
   * @param blockId 块 ID
   * @returns 是否为概念卡
   */
  async isConceptCard(blockId: string): Promise<boolean> {
    try {
      // 方法1：检查块属性（custom-fsrs-card-type）
      const stmt1 = `
        SELECT value as card_type
        FROM attributes
        WHERE block_id = '${this.escapeSQL(blockId)}'
          AND name = 'custom-fsrs-card-type'
      `;
      
      const rows1 = await api.sql(stmt1);
      
      logger.debug(`isConceptCard(${blockId}): 块属性查询结果 =`, rows1);
      
      if (rows1 && rows1.length > 0) {
        const isConceptType = rows1[0].card_type === 'concept';
        logger.debug(`isConceptCard(${blockId}): 从块属性判断 card_type=${rows1[0].card_type}, result=${isConceptType}`);
        
        if (isConceptType) {
          return true;
        }
      }
      
      // 方法2：如果块属性没有，查询 FSRSCard（Riff 数据源）
      const stmt2 = `
        SELECT 1
        FROM fsrs_cards
        WHERE block_id = '${this.escapeSQL(blockId)}'
          AND type = 'concept'
        LIMIT 1
      `;
      
      const rows2 = await api.sql(stmt2);
      
      logger.debug(`isConceptCard(${blockId}): FSRSCard 查询结果 =`, rows2);
      
      if (rows2 && rows2.length > 0) {
        logger.debug(`isConceptCard(${blockId}): 从 FSRSCard 判断为 concept 卡`);
        return true;
      }
      
      logger.debug(`isConceptCard(${blockId}): 不是 concept 卡`);
      return false;
    } catch (error) {
      logger.error('Failed to check if concept card:', error);
      return false;
    }
  }

  /**
   * 获取块数据
   * 
   * @param blockId 块 ID
   * @returns 块数据，如果不存在则返回 null
   */
  async fetchBlockData(blockId: string): Promise<BlockData | null> {
    try {
      const stmt = `
        SELECT 
          b.id,
          b.content,
          b.type,
          b.parent_id,
          b.root_id
        FROM blocks b
        WHERE b.id = '${this.escapeSQL(blockId)}'
      `;

      const rows = await api.sql(stmt);
      if (!rows || rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      logger.error('Failed to fetch block data:', error);
      return null;
    }
  }

  /**
   * 去重邻居列表
   * 
   * 如果同一个块有多个关联类型，保留权重最高的
   * 
   * @param neighbors 邻居列表
   * @returns 去重后的邻居列表
   */
  private deduplicateNeighbors(neighbors: Neighbor[]): Neighbor[] {
    const map = new Map<string, Neighbor>();

    for (const neighbor of neighbors) {
      const existing = map.get(neighbor.id);
      if (!existing || neighbor.weight > existing.weight) {
        map.set(neighbor.id, neighbor);
      }
    }

    return Array.from(map.values());
  }

  /**
   * SQL 转义
   * 
   * @param value 要转义的值
   * @returns 转义后的值
   */
  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}
