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
import { QueryCache } from '@/utils/queryCache';
import { hasConceptDefinitionSyntax } from '@/core/xiuyuan/cardMeta';

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
  parent_id?: string;
  root_id?: string;
}

type UnknownRecord = Record<string, unknown>;

export class ConceptQueryEngine {
  private readonly neighborsCache = new QueryCache<Neighbor[]>(5000, 80);
  private readonly backlinksCache = new QueryCache<string[]>(10000, 120);
  private readonly blockDataCache = new QueryCache<BlockData>(30000, 300);

  /**
   * 获取概念卡的所有邻居
   * 
   * @param conceptId 概念卡 ID
   * @returns 邻居列表（已去重）
   */
  async fetchNeighbors(conceptId: string): Promise<Neighbor[]> {
    const cached = this.neighborsCache.get(conceptId);
    if (cached !== null) {
      logger.debug(`Cache hit for neighbors: ${conceptId}`);
      return cached;
    }

    try {
      const backlinksPromise = this.fetchBacklinks(conceptId);

      // 并行查询所有类型（性能提升 3 倍）
      const [backlinks, directOutgoing, indirectOutgoing, descriptors] = await Promise.all([
        backlinksPromise,
        this.fetchDirectOutgoingLinks(conceptId),
        backlinksPromise.then((ids) => this.fetchIndirectOutgoingLinks(conceptId, ids)),
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

      this.neighborsCache.set(conceptId, uniqueNeighbors);
      
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
   * 规则对齐嵌入块 SQL：
   * - 引用位于列表项内部时，展示该列表项块（type = 'i'）
   * - 非列表项上下文下，展示原引用块（h/p/t/i）
   * - 过滤列表容器等无意义块，避免展示整个列表块
   * 
   * @param conceptId 概念卡 ID
   * @returns 反链块 ID 列表
   */
  async fetchBacklinks(conceptId: string): Promise<string[]> {
    const cached = this.backlinksCache.get(conceptId);
    if (cached !== null) {
      logger.debug(`Cache hit for backlinks: ${conceptId}`);
      return cached;
    }

    try {
      logger.debug(`Fetching backlinks for: ${conceptId}`);

      const escapedConceptId = this.escapeSQL(conceptId);
      const stmt = `
        SELECT DISTINCT
          CASE
            WHEN b.type = 'i' THEN b.id
            WHEN b.parent_id IN (
              SELECT li.id
              FROM blocks li
              WHERE li.type = 'i'
            ) THEN b.parent_id
            WHEN b.type IN ('h', 'p', 't') THEN b.id
            ELSE NULL
          END AS id
        FROM refs r
        INNER JOIN blocks b ON b.id = r.block_id
        WHERE r.def_block_id = '${escapedConceptId}'
          AND (
            b.type IN ('h', 'p', 't', 'i')
            OR b.parent_id IN (
              SELECT li.id
              FROM blocks li
              WHERE li.type = 'i'
            )
          )
      `;

      const rows = await api.sql(stmt);
      const backlinkIds = this.extractIds(rows, conceptId);

      logger.debug(`Found ${backlinkIds.length} normalized backlink blocks`, backlinkIds.slice(0, 10));

      this.backlinksCache.set(conceptId, backlinkIds);
      
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
      const linkIds = this.extractIds(rows, conceptId);
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
   * @param backlinkIds 已查询到的反链 ID（可选，避免重复请求）
   * @returns 间接出链块 ID 列表
   */
  async fetchIndirectOutgoingLinks(conceptId: string, backlinkIds?: string[]): Promise<string[]> {
    try {
      // 1. 先获取反链块 ID
      const resolvedBacklinkIds = backlinkIds ?? await this.fetchBacklinks(conceptId);
      
      if (resolvedBacklinkIds.length === 0) {
        logger.debug('No backlinks, so no indirect outgoing links');
        return [];
      }

      // 2. 查询这些反链块及其子块中的所有出链（避免列表项归一化后丢失子块引用）
      const backlinkIdsStr = resolvedBacklinkIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
      
      const stmt = `
        WITH RECURSIVE backlink_scope AS (
          SELECT b.id
          FROM blocks b
          WHERE b.id IN (${backlinkIdsStr})
          UNION ALL
          SELECT child.id
          FROM blocks child
          INNER JOIN backlink_scope s ON child.parent_id = s.id
        )
        SELECT DISTINCT r.def_block_id as id
        FROM refs r
        WHERE r.block_id IN (SELECT id FROM backlink_scope)
          AND r.def_block_id != '${this.escapeSQL(conceptId)}'
      `;

      const rows = await api.sql(stmt);
      const linkIds = this.extractIds(rows, conceptId);
      logger.debug(`Found ${linkIds.length} indirect outgoing links from ${resolvedBacklinkIds.length} backlinks`);
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
      const escapedConceptId = this.escapeSQL(conceptId);
      const childRows = await api.sql(`
        SELECT DISTINCT id
        FROM blocks
        WHERE parent_id = '${escapedConceptId}'
      `);
      const childIds = this.extractIds(childRows);
      if (childIds.length === 0) {
        return [];
      }

      try {
        const childIdsStr = childIds.map((id) => `'${this.escapeSQL(id)}'`).join(',');
        const localRows = await api.sql(`
          SELECT DISTINCT block_id AS id
          FROM fsrs_cards
          WHERE block_id IN (${childIdsStr})
            AND (type = 'descriptor' OR card_type_marker = 'descriptor')
        `);
        const descriptorIds = this.extractIds(localRows, conceptId);
        if (descriptorIds.length > 0) {
          logger.debug(`Found ${descriptorIds.length} descriptors from local cards`);
          return descriptorIds;
        }
      } catch {
        // fsrs_cards table may be unavailable in some environments
      }

      const syntaxRows = await api.sql(`
        SELECT DISTINCT id
        FROM blocks
        WHERE parent_id = '${escapedConceptId}'
          AND (
            content LIKE '%;;%'
            OR content LIKE '%;<%'
            OR content LIKE '%;<>%'
          )
      `);
      const descriptorIds = this.extractIds(syntaxRows, conceptId);
      logger.debug(`Found ${descriptorIds.length} descriptors from syntax`);
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
      try {
        const stmt = `
          SELECT block_id
          FROM fsrs_cards
          WHERE block_id = '${this.escapeSQL(blockId)}'
            AND (type = 'concept' OR card_type_marker = 'concept')
          LIMIT 1
        `;

        const rows = await api.sql(stmt);
        if (rows && rows.length > 0) {
          return true;
        }
      } catch {
        // fsrs_cards table may be unavailable in some environments
      }

      const rows = await api.sql(`
        SELECT content
        FROM blocks
        WHERE id = '${this.escapeSQL(blockId)}'
        LIMIT 1
      `);
      const content = typeof rows?.[0]?.content === 'string' ? rows[0].content : '';
      return hasConceptDefinitionSyntax(content);
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
    const cached = this.blockDataCache.get(blockId);
    if (cached !== null) {
      logger.debug(`Cache hit for block data: ${blockId}`);
      return cached;
    }

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

      const row = rows[0] as UnknownRecord;
      const blockData: BlockData = {
        id: typeof row.id === 'string' ? row.id : blockId,
        content: typeof row.content === 'string' ? row.content : '',
        type: typeof row.type === 'string' ? row.type : '',
        parent_id: typeof row.parent_id === 'string' ? row.parent_id : undefined,
        root_id: typeof row.root_id === 'string' ? row.root_id : undefined,
      };

      this.blockDataCache.set(blockId, blockData);
      return blockData;
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

  private extractIds(rows: unknown, excludeId?: string): string[] {
    if (!Array.isArray(rows)) {
      return [];
    }

    const ids: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const rowRecord = row as UnknownRecord;
      const id = typeof rowRecord.id === 'string' ? rowRecord.id : '';
      if (!id || id === excludeId || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }

    return ids;
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
