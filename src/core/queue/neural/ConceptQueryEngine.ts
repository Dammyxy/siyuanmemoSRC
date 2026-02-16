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

export interface Neighbor {
  id: string;
  type: 'backlink' | 'outgoing' | 'descriptor';
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
    const neighbors: Neighbor[] = [];

    try {
      // 1. 查询反链（权重 15）
      const backlinks = await this.fetchBacklinks(conceptId);
      neighbors.push(...backlinks.map(id => ({
        id,
        type: 'backlink' as const,
        weight: 15,
      })));

      // 2. 查询正链（权重 8）
      const outgoingLinks = await this.fetchOutgoingLinks(conceptId);
      neighbors.push(...outgoingLinks.map(id => ({
        id,
        type: 'outgoing' as const,
        weight: 8,
      })));

      // 3. 查询描述符卡（权重 3）
      const descriptors = await this.fetchDescriptors(conceptId);
      neighbors.push(...descriptors.map(id => ({
        id,
        type: 'descriptor' as const,
        weight: 3,
      })));

      // 去重（同一个块可能同时是反链和正链）
      const uniqueNeighbors = this.deduplicateNeighbors(neighbors);
      
      console.log(`[SiyuanMemo] ConceptQueryEngine: Found ${uniqueNeighbors.length} unique neighbors for ${conceptId}`);
      return uniqueNeighbors;
    } catch (error) {
      console.error('[SiyuanMemo][ConceptQueryEngine] Failed to fetch neighbors:', error);
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
      console.log(`[SiyuanMemo] ConceptQueryEngine: Fetching backlinks for: ${conceptId}`);
      
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
        console.error(`[SiyuanMemo][ConceptQueryEngine] API request failed: ${response.status}`);
        return [];
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        console.error(`[SiyuanMemo][ConceptQueryEngine] API error: ${data.msg}`);
        return [];
      }

      // 解析反链数据
      const backlinks = data.data?.backlinks || [];
      console.log(`[SiyuanMemo] ConceptQueryEngine: Raw backlinks count:`, backlinks.length);
      
      if (backlinks.length > 0) {
        console.log(`[SiyuanMemo] ConceptQueryEngine: First backlink sample:`, backlinks[0]);
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

      console.log(`[SiyuanMemo] ConceptQueryEngine: Found ${backlinkIds.length} backlink blocks:`, backlinkIds.slice(0, 10));
      
      return backlinkIds;
    } catch (error) {
      console.error('[SiyuanMemo][ConceptQueryEngine] Failed to fetch backlinks:', error);
      return [];
    }
  }

  /**
   * 查询正链（所有出链）
   * 
   * 查询概念卡及其子块中的所有出链
   * 
   * @param conceptId 概念卡 ID
   * @returns 出链块 ID 列表
   */
  async fetchOutgoingLinks(conceptId: string): Promise<string[]> {
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
        console.log(`[SiyuanMemo] ConceptQueryEngine: No outgoing links found`);
        return [];
      }

      const linkIds = rows.map(row => row.id);
      console.log(`[SiyuanMemo] ConceptQueryEngine: Found ${linkIds.length} outgoing links`);
      return linkIds;
    } catch (error) {
      console.error('[SiyuanMemo][ConceptQueryEngine] Failed to fetch outgoing links:', error);
      return [];
    }
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
      console.log(`[SiyuanMemo] ConceptQueryEngine: Found ${descriptorIds.length} descriptors`);
      return descriptorIds;
    } catch (error) {
      console.error('[SiyuanMemo][ConceptQueryEngine] Failed to fetch descriptors:', error);
      return [];
    }
  }

  /**
   * 检查块是否为概念卡
   * 
   * @param blockId 块 ID
   * @returns 是否为概念卡
   */
  async isConceptCard(blockId: string): Promise<boolean> {
    try {
      const stmt = `
        SELECT value
        FROM attributes
        WHERE block_id = '${this.escapeSQL(blockId)}'
          AND name = 'custom-fsrs-card-type'
      `;
      
      const rows = await api.sql(stmt);
      return rows && rows.length > 0 && rows[0].value === 'concept';
    } catch (error) {
      console.error('[SiyuanMemo][ConceptQueryEngine] Failed to check if concept card:', error);
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
      console.error('[SiyuanMemo][ConceptQueryEngine] Failed to fetch block data:', error);
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
