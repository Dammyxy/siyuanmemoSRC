/**
 * 优化版概念卡查询引擎
 * 
 * 性能优化：
 * 1. 并行查询所有邻居类型
 * 2. 添加查询缓存
 * 3. 使用 Logger 替代 console
 * 4. 批量查询优化
 */

import * as api from '../../siyuan/api';
import { createLogger } from '@/utils/logger';
import { QueryCache } from '@/utils/queryCache';
import { PerformanceMonitor } from '@/utils/performance';

const logger = createLogger('ConceptQueryEngine');

export interface Neighbor {
  id: string;
  type: 'backlink' | 'outgoing' | 'descriptor';
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function pickBacklinkNodeId(node: UnknownRecord): string | null {
  if (typeof node.blockID === 'string' && node.blockID.length > 0) {
    return node.blockID;
  }
  if (typeof node.id === 'string' && node.id.length > 0) {
    return node.id;
  }
  return null;
}

function extractBacklinkIds(backlinks: unknown[], conceptId: string): string[] {
  const collectedIds: string[] = [];
  const seenIds = new Set<string>();

  const walk = (node: unknown): void => {
    if (!isRecord(node)) {
      return;
    }

    const nodeId = pickBacklinkNodeId(node);
    if (nodeId && nodeId !== conceptId && !seenIds.has(nodeId)) {
      seenIds.add(nodeId);
      collectedIds.push(nodeId);
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };

  for (const backlink of backlinks) {
    walk(backlink);
  }

  return collectedIds;
}

export class ConceptQueryEngineOptimized {
  // 查询缓存（5秒 TTL，最多缓存 50 个查询结果）
  private neighborsCache = new QueryCache<Neighbor[]>(5000, 50);
  private backlinksCache = new QueryCache<string[]>(10000, 100);
  private blockDataCache = new QueryCache<BlockData | null>(30000, 200);

  /**
   * 获取概念卡的所有邻居（优化版）
   * 
   * 性能优化：
   * - 并行查询所有类型
   * - 添加缓存
   * - 性能监控
   */
  async fetchNeighbors(conceptId: string): Promise<Neighbor[]> {
    // 检查缓存
    const cached = this.neighborsCache.get(conceptId);
    if (cached !== null) {
      logger.debug(`Cache hit for neighbors: ${conceptId}`);
      return cached;
    }

    return PerformanceMonitor.measure('fetchNeighbors', async () => {
      try {
        // 并行查询所有类型（性能提升 3倍）
        const [backlinks, outgoingLinks, descriptors] = await Promise.all([
          this.fetchBacklinks(conceptId),
          this.fetchOutgoingLinks(conceptId),
          this.fetchDescriptors(conceptId),
        ]);

        const neighbors: Neighbor[] = [
          ...backlinks.map(id => ({ id, type: 'backlink' as const, weight: 15 })),
          ...outgoingLinks.map(id => ({ id, type: 'outgoing' as const, weight: 8 })),
          ...descriptors.map(id => ({ id, type: 'descriptor' as const, weight: 3 })),
        ];

        // 去重
        const uniqueNeighbors = this.deduplicateNeighbors(neighbors);
        
        logger.log(`Found ${uniqueNeighbors.length} unique neighbors for ${conceptId}`);
        
        // 缓存结果
        this.neighborsCache.set(conceptId, uniqueNeighbors);
        
        return uniqueNeighbors;
      } catch (error) {
        logger.error('Failed to fetch neighbors:', error);
        return [];
      }
    });
  }

  /**
   * 查询反链（优化版）
   */
  async fetchBacklinks(conceptId: string): Promise<string[]> {
    // 检查缓存
    const cached = this.backlinksCache.get(conceptId);
    if (cached !== null) {
      return cached;
    }

    return PerformanceMonitor.measure('fetchBacklinks', async () => {
      try {
        logger.debug(`Fetching backlinks for: ${conceptId}`);
        
        const response = await fetch('/api/ref/getBacklink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: conceptId,
            k: '',
            mk: ''
          }),
        });

        if (!response.ok) {
          logger.error(`API request failed: ${response.status}`);
          return [];
        }

        const data: unknown = await response.json();
        if (!isRecord(data) || data.code !== 0) {
          const errorMessage = isRecord(data) && typeof data.msg === 'string' ? data.msg : 'unknown error';
          logger.error(`API error: ${errorMessage}`);
          return [];
        }

        const backlinks = isRecord(data.data) && Array.isArray(data.data.backlinks) ? data.data.backlinks : [];
        logger.debug(`Raw backlinks count: ${backlinks.length}`);

        const backlinkIds = extractBacklinkIds(backlinks, conceptId);

        logger.debug(`Found ${backlinkIds.length} backlink blocks`);
        
        // 缓存结果
        this.backlinksCache.set(conceptId, backlinkIds);
        
        return backlinkIds;
      } catch (error) {
        logger.error('Failed to fetch backlinks:', error);
        return [];
      }
    });
  }

  /**
   * 查询正链（优化版）
   * 
   * 优化：使用更高效的 SQL 查询
   */
  async fetchOutgoingLinks(conceptId: string): Promise<string[]> {
    return PerformanceMonitor.measure('fetchOutgoingLinks', async () => {
      try {
        // 优化的 SQL：先查子块，再查引用（避免递归 CTE）
        const stmt = `
          SELECT DISTINCT r.def_block_id as id
          FROM refs r
          WHERE r.block_id = '${this.escapeSQL(conceptId)}'
             OR r.block_id IN (
               SELECT id FROM blocks 
               WHERE root_id = (SELECT root_id FROM blocks WHERE id = '${this.escapeSQL(conceptId)}')
                 AND path LIKE '%${this.escapeSQL(conceptId)}%'
             )
        `;

        const rows = await api.sql(stmt);
        
        if (!rows || !Array.isArray(rows)) {
          logger.debug('No outgoing links found');
          return [];
        }

        const linkIds = rows.map(row => row.id);
        logger.debug(`Found ${linkIds.length} outgoing links`);
        return linkIds;
      } catch (error) {
        logger.error('Failed to fetch outgoing links:', error);
        return [];
      }
    });
  }

  /**
   * 查询描述符卡（优化版）
   */
  async fetchDescriptors(conceptId: string): Promise<string[]> {
    return PerformanceMonitor.measure('fetchDescriptors', async () => {
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
    });
  }

  /**
   * 批量检查块是否为概念卡（新增）
   * 
   * 性能优化：批量查询替代循环查询
   */
  async areConceptCards(blockIds: string[]): Promise<Map<string, boolean>> {
    if (blockIds.length === 0) return new Map();

    return PerformanceMonitor.measure('areConceptCards', async () => {
      try {
        const idsStr = blockIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
        const stmt = `
          SELECT block_id, value
          FROM attributes
          WHERE block_id IN (${idsStr})
            AND name = 'custom-fsrs-card-type'
        `;
        
        const rows = await api.sql(stmt);
        const result = new Map<string, boolean>();
        
        // 初始化所有为 false
        for (const id of blockIds) {
          result.set(id, false);
        }
        
        // 设置概念卡为 true
        for (const row of rows || []) {
          if (row.value === 'concept') {
            result.set(row.block_id, true);
          }
        }
        
        return result;
      } catch (error) {
        logger.error('Failed to check concept cards:', error);
        return new Map();
      }
    });
  }

  /**
   * 检查块是否为概念卡
   */
  async isConceptCard(blockId: string): Promise<boolean> {
    const result = await this.areConceptCards([blockId]);
    return result.get(blockId) || false;
  }

  /**
   * 批量获取块数据（新增）
   * 
   * 性能优化：批量查询
   */
  async fetchBlocksData(blockIds: string[]): Promise<Map<string, BlockData>> {
    if (blockIds.length === 0) return new Map();

    return PerformanceMonitor.measure('fetchBlocksData', async () => {
      try {
        const idsStr = blockIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
        const stmt = `
          SELECT 
            b.id,
            b.content,
            b.type,
            b.parent_id,
            b.root_id
          FROM blocks b
          WHERE b.id IN (${idsStr})
        `;

        const rows = await api.sql(stmt);
        const result = new Map<string, BlockData>();
        
        for (const row of rows || []) {
          const rowRecord = row as UnknownRecord;
          const blockId = typeof rowRecord.id === 'string' ? rowRecord.id : null;
          if (!blockId) {
            continue;
          }
          const blockData: BlockData = {
            id: blockId,
            content: typeof rowRecord.content === 'string' ? rowRecord.content : '',
            type: typeof rowRecord.type === 'string' ? rowRecord.type : '',
            parent_id: typeof rowRecord.parent_id === 'string' ? rowRecord.parent_id : undefined,
            root_id: typeof rowRecord.root_id === 'string' ? rowRecord.root_id : undefined,
          };
          result.set(blockId, blockData);
          // 缓存单个块数据
          this.blockDataCache.set(blockId, blockData);
        }
        
        return result;
      } catch (error) {
        logger.error('Failed to fetch blocks data:', error);
        return new Map();
      }
    });
  }

  /**
   * 获取块数据（优化版）
   */
  async fetchBlockData(blockId: string): Promise<BlockData | null> {
    // 检查缓存
    const cached = this.blockDataCache.get(blockId);
    if (cached !== null) {
      return cached;
    }

    const result = await this.fetchBlocksData([blockId]);
    return result.get(blockId) || null;
  }

  /**
   * 去重邻居列表
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
   */
  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.neighborsCache.clear();
    this.backlinksCache.clear();
    this.blockDataCache.clear();
    logger.log('Cache cleared');
  }

  /**
   * 清理过期缓存
   */
  cleanupCache(): void {
    this.neighborsCache.cleanup();
    this.backlinksCache.cleanup();
    this.blockDataCache.cleanup();
  }
}
