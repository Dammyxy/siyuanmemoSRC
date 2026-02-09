/**
 * QueryEngine - 神经队列查询引擎
 * 
 * 封装所有数据库查询操作，提供邻居节点查询、随机种子选择等功能。
 * 使用参数化查询防止 SQL 注入。
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 8.1, 8.4
 */

import * as api from '../../siyuan/api.ts';
import { ATTR_CARD_ID } from '../../siyuan/block.ts';
import { AssociationType, NeighborQueryResult, NeuralQueueConfig, NeuralBlockType } from './types.ts';

/**
 * 卡片数据接口
 */
export interface CardData {
  id: string;
  content: string;
  rootId: string;
  type: string; // 思源块类型
  blockType: NeuralBlockType; // 神经块类型：flashcard 或 topic
  hasFlashcard: boolean;
  [key: string]: any;
}

export class QueryEngine {
  /** 配置 */
  private readonly config: NeuralQueueConfig;

  constructor(config: NeuralQueueConfig) {
    this.config = config;
  }

  /**
   * 批量查询块内容
   *
   * @param blockIds 块 ID 列表
   * @returns Map<blockId, content>
   */
  async fetchBlockContents(blockIds: string[]): Promise<Map<string, string>> {
    if (blockIds.length === 0) return new Map();

    try {
      const escapedIds = blockIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
      const stmt = `
        SELECT id, content
        FROM blocks
        WHERE id IN (${escapedIds})
      `;

      const rows = await api.sql(stmt);
      const contentMap = new Map<string, string>();

      for (const row of rows) {
        // 提取纯文本内容（去除 Markdown 标记）
        const content = (row.content || '').replace(/[#*`\[\]()]/g, '').trim();
        // 限制长度为 50 字符
        const truncated = content.length > 50 ? content.substring(0, 50) + '...' : content;
        contentMap.set(row.id, truncated);
      }

      return contentMap;
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch block contents:', error);
      return new Map();
    }
  }

  /**
   * 获取所有邻居节点（聚合方法）
   *
   * @param currentCardId 当前卡片 ID
   * @returns 邻居节点列表
   * Requirements: 2.2, 3.1, 3.2, 3.3, 3.5
   */
  async fetchNeighbors(currentCardId: string): Promise<NeighborQueryResult[]> {
    const neighbors: NeighborQueryResult[] = [];

    try {
      // 1. 获取双向链接（引用和反向链接）
      const refLinks = await this.fetchRefLinks(currentCardId);
      neighbors.push(...refLinks);

      // 2. 获取同文档卡片
      const contextCards = await this.fetchContextCards(currentCardId);
      neighbors.push(...contextCards);

      // 3. 获取标签关联卡片（如果启用）
      if (this.config.features.enableTagAssociation) {
        const tagCards = await this.fetchTagRelatedCards(currentCardId);
        neighbors.push(...tagCards);
      }

      // 4. 获取兄弟块（如果启用）
      if (this.config.features.enableSiblingAssociation) {
        const siblingCards = await this.fetchSiblingCards(currentCardId);
        neighbors.push(...siblingCards);
      }

      // 去重（同一个卡片可能通过多种关联方式找到）
      const uniqueNeighbors = this.deduplicateNeighbors(neighbors);

      return uniqueNeighbors;
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch neighbors:', error);
      return [];
    }
  }

  /**
   * 获取双向链接（引用和反向链接）- 包含闪卡和主题
   * 
   * @param blockId 块 ID
   * @returns 引用链接的邻居节点
   * Requirements: 3.1
   */
  async fetchRefLinks(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      const topicModeEnabled = this.config.topicMode.enabled;
      const minLength = this.config.topicMode.minContentLength;
      const allowedTypes = this.config.topicMode.allowedBlockTypes.map(t => `'${t}'`).join(',');

      if (!topicModeEnabled) {
        // 仅查询闪卡（旧逻辑）
        const outgoingStmt = `
          SELECT DISTINCT r.def_block_id as id, 'ref' as type
          FROM refs r
          INNER JOIN attributes a ON r.def_block_id = a.block_id
          WHERE r.block_id = '${this.escapeSQL(blockId)}'
            AND a.name = '${ATTR_CARD_ID}'
            AND a.value != ''
        `;
        const incomingStmt = `
          SELECT DISTINCT r.block_id as id, 'ref' as type
          FROM refs r
          INNER JOIN attributes a ON r.block_id = a.block_id
          WHERE r.def_block_id = '${this.escapeSQL(blockId)}'
            AND a.name = '${ATTR_CARD_ID}'
            AND a.value != ''
        `;
        const outgoing = await api.sql(outgoingStmt);
        const incoming = await api.sql(incomingStmt);
        return [
          ...outgoing.map(row => ({ id: row.id, type: AssociationType.REF_LINK })),
          ...incoming.map(row => ({ id: row.id, type: AssociationType.REF_LINK })),
        ];
      }

      // 查询所有有意义的块（闪卡 + 主题）
      const outgoingStmt = `
        SELECT DISTINCT 
          r.def_block_id as id, 
          'ref' as type,
          b.type as block_type,
          b.content,
          CASE 
            WHEN a.value IS NOT NULL AND a.value != '' THEN 1
            ELSE 0
          END as has_flashcard
        FROM refs r
        INNER JOIN blocks b ON r.def_block_id = b.id
        LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
        WHERE r.block_id = '${this.escapeSQL(blockId)}'
          AND b.type IN (${allowedTypes})
          AND LENGTH(b.content) >= ${minLength}
      `;

      const incomingStmt = `
        SELECT DISTINCT 
          r.block_id as id, 
          'ref' as type,
          b.type as block_type,
          b.content,
          CASE 
            WHEN a.value IS NOT NULL AND a.value != '' THEN 1
            ELSE 0
          END as has_flashcard
        FROM refs r
        INNER JOIN blocks b ON r.block_id = b.id
        LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
        WHERE r.def_block_id = '${this.escapeSQL(blockId)}'
          AND b.type IN (${allowedTypes})
          AND LENGTH(b.content) >= ${minLength}
      `;

      const outgoing = await api.sql(outgoingStmt);
      const incoming = await api.sql(incomingStmt);

      return [
        ...outgoing.map(row => ({ id: row.id, type: AssociationType.REF_LINK })),
        ...incoming.map(row => ({ id: row.id, type: AssociationType.REF_LINK })),
      ];
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch ref links:', error);
      return [];
    }
  }

  /**
   * 获取同文档的卡片（上下文关联）- 包含闪卡和主题
   * 
   * @param blockId 块 ID
   * @returns 同文档的邻居节点
   * Requirements: 3.2, 3.4, 8.1
   */
  async fetchContextCards(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      // 获取当前块的文档 ID
      const rootId = await this.getRootId(blockId);
      if (!rootId) return [];

      const limit = this.config.queryLimits.contextCards;
      const topicModeEnabled = this.config.topicMode.enabled;
      const minLength = this.config.topicMode.minContentLength;
      const allowedTypes = this.config.topicMode.allowedBlockTypes.map(t => `'${t}'`).join(',');

      if (!topicModeEnabled) {
        // 仅查询闪卡（旧逻辑）
        const stmt = `
          SELECT DISTINCT b.id, 'context' as type
          FROM blocks b
          INNER JOIN attributes a ON b.id = a.block_id
          WHERE b.root_id = '${this.escapeSQL(rootId)}'
            AND b.id != '${this.escapeSQL(blockId)}'
            AND a.name = '${ATTR_CARD_ID}'
            AND a.value != ''
          LIMIT ${limit}
        `;
        const rows = await api.sql(stmt);
        return rows.map(row => ({ id: row.id, type: AssociationType.HIERARCHY }));
      }

      // 查询所有有意义的块（闪卡 + 主题）
      const stmt = `
        SELECT DISTINCT 
          b.id, 
          'context' as type,
          b.type as block_type,
          CASE 
            WHEN a.value IS NOT NULL AND a.value != '' THEN 1
            ELSE 0
          END as has_flashcard
        FROM blocks b
        LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
        WHERE b.root_id = '${this.escapeSQL(rootId)}'
          AND b.id != '${this.escapeSQL(blockId)}'
          AND b.type IN (${allowedTypes})
          AND LENGTH(b.content) >= ${minLength}
        LIMIT ${limit}
      `;

      const rows = await api.sql(stmt);
      return rows.map(row => ({ id: row.id, type: AssociationType.HIERARCHY }));
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch context cards:', error);
      return [];
    }
  }

  /**
   * 获取标签关联的卡片
   * 
   * @param blockId 块 ID
   * @returns 标签关联的邻居节点
   * Requirements: 3.5, 3.6, 8.1
   */
  async fetchTagRelatedCards(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      // 获取当前块的标签
      const tags = await this.extractTags(blockId);
      if (tags.length === 0) return [];

      const limit = this.config.queryLimits.tagCards;

      // 查询具有相同标签的其他闪卡
      const stmt = `
        SELECT DISTINCT b.id, 'tag' as type
        FROM blocks b
        INNER JOIN attributes a ON b.id = a.block_id
        WHERE b.id != '${this.escapeSQL(blockId)}'
          AND b.ial LIKE '%#%'
          AND a.name = '${ATTR_CARD_ID}'
          AND a.value != ''
        LIMIT ${limit}
      `;

      const rows = await api.sql(stmt);
      return rows.map(row => ({ id: row.id, type: AssociationType.TAG }));
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch tag related cards:', error);
      return [];
    }
  }

  /**
   * 获取兄弟块（同一父块下的其他块）
   * 
   * @param blockId 块 ID
   * @returns 兄弟块邻居节点
   * Requirements: 3.3
   */
  async fetchSiblingCards(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      // 获取当前块的父块 ID
      const parentId = await this.getParentId(blockId);
      if (!parentId) return [];

      // 查询同一父块下的其他闪卡
      const stmt = `
        SELECT DISTINCT b.id, 'sibling' as type
        FROM blocks b
        INNER JOIN attributes a ON b.id = a.block_id
        WHERE b.parent_id = '${this.escapeSQL(parentId)}'
          AND b.id != '${this.escapeSQL(blockId)}'
          AND a.name = '${ATTR_CARD_ID}'
          AND a.value != ''
        LIMIT 10
      `;

      const rows = await api.sql(stmt);
      return rows.map(row => ({ id: row.id, type: AssociationType.SIBLING }));
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch sibling cards:', error);
      return [];
    }
  }

  /**
   * 随机选择一个种子卡片
   * 
   * @returns 随机卡片 ID，如果没有卡片则返回 null
   * Requirements: 4.1
   */
  async fetchRandomCard(): Promise<string | null> {
    try {
      const stmt = `
        SELECT DISTINCT b.id
        FROM blocks b
        INNER JOIN attributes a ON b.id = a.block_id
        WHERE a.name = '${ATTR_CARD_ID}'
          AND a.value != ''
        ORDER BY RANDOM()
        LIMIT 1
      `;

      const rows = await api.sql(stmt);
      return rows.length > 0 ? rows[0].id : null;
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch random card:', error);
      return null;
    }
  }

  /**
   * 获取卡片详细数据
   * 
   * @param cardId 卡片 ID
   * @returns 卡片数据，如果不存在则返回 null
   * Requirements: 3.7
   */
  async fetchCardData(cardId: string): Promise<CardData | null> {
    try {
      const stmt = `
        SELECT 
          b.*,
          a.value as card_id,
          CASE 
            WHEN a.value IS NOT NULL AND a.value != '' THEN 1
            ELSE 0
          END as has_flashcard
        FROM blocks b
        LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
        WHERE b.id = '${this.escapeSQL(cardId)}'
      `;

      const rows = await api.sql(stmt);
      if (rows.length === 0) return null;

      const row = rows[0];
      const hasFlashcard = row.has_flashcard === 1;
      const blockType = this.classifyBlock(row.type, hasFlashcard);

      return {
        id: row.id,
        content: row.content || '',
        rootId: row.root_id || '',
        type: row.type || '',
        blockType,
        hasFlashcard,
        ...row,
      };
    } catch (error) {
      console.error('[QueryEngine] Failed to fetch card data:', error);
      return null;
    }
  }

  /**
   * 分类块类型
   * 
   * @param siyuanBlockType 思源块类型
   * @param hasFlashcard 是否包含 FSRS 属性
   * @returns 神经块类型
   */
  classifyBlock(siyuanBlockType: string, hasFlashcard: boolean): NeuralBlockType {
    void siyuanBlockType;
    return hasFlashcard ? NeuralBlockType.FLASHCARD : NeuralBlockType.TOPIC;
  }

  /**
   * 计算块权重
   * 
   * @param blockType 神经块类型
   * @param siyuanBlockType 思源块类型
   * @returns 权重值
   */
  calculateBlockWeight(blockType: NeuralBlockType, siyuanBlockType: string): number {
    if (blockType === NeuralBlockType.FLASHCARD) {
      return this.config.blockWeights.flashcard;
    }

    // 根据思源块类型分配主题权重
    switch (siyuanBlockType) {
      case 'h':
        return this.config.blockWeights.topic.heading;
      case 'p':
        return this.config.blockWeights.topic.paragraph;
      case 'i':
      case 'l':
        return this.config.blockWeights.topic.listItem;
      default:
        return 1;
    }
  }

  /**
   * 获取块的文档 ID（root_id）
   * 
   * @param blockId 块 ID
   * @returns 文档 ID
   * @private
   */
  private async getRootId(blockId: string): Promise<string | null> {
    try {
      const stmt = `SELECT root_id FROM blocks WHERE id = '${this.escapeSQL(blockId)}'`;
      const rows = await api.sql(stmt);
      return rows.length > 0 ? rows[0].root_id : null;
    } catch (error) {
      console.error('[QueryEngine] Failed to get root_id:', error);
      return null;
    }
  }

  /**
   * 获取块的父块 ID
   * 
   * @param blockId 块 ID
   * @returns 父块 ID
   * @private
   */
  private async getParentId(blockId: string): Promise<string | null> {
    try {
      const stmt = `SELECT parent_id FROM blocks WHERE id = '${this.escapeSQL(blockId)}'`;
      const rows = await api.sql(stmt);
      return rows.length > 0 ? rows[0].parent_id : null;
    } catch (error) {
      console.error('[QueryEngine] Failed to get parent_id:', error);
      return null;
    }
  }

  /**
   * 从块中提取标签
   * 
   * @param blockId 块 ID
   * @returns 标签列表
   * @private
   */
  private async extractTags(blockId: string): Promise<string[]> {
    try {
      const stmt = `SELECT ial FROM blocks WHERE id = '${this.escapeSQL(blockId)}'`;
      const rows = await api.sql(stmt);
      if (rows.length === 0) return [];

      const ial = rows[0].ial || '';
      // 从 IAL 中提取标签（格式：#tag#）
      const tagMatches = ial.match(/#[^#\s]+#/g);
      if (!tagMatches) return [];

      return tagMatches.map(tag => tag.replace(/#/g, ''));
    } catch (error) {
      console.error('[QueryEngine] Failed to extract tags:', error);
      return [];
    }
  }

  /**
   * 去重邻居节点（保留第一次出现的关联类型）
   * 
   * @param neighbors 邻居节点列表
   * @returns 去重后的邻居节点列表
   * @private
   */
  private deduplicateNeighbors(neighbors: NeighborQueryResult[]): NeighborQueryResult[] {
    const seen = new Set<string>();
    const result: NeighborQueryResult[] = [];

    for (const neighbor of neighbors) {
      if (!seen.has(neighbor.id)) {
        seen.add(neighbor.id);
        result.push(neighbor);
      }
    }

    return result;
  }

  /**
   * 获取块的所有子块（递归查询）
   * 
   * 用于避免"一炮三响"问题：当展示父块时，将所有子块添加到历史记录。
   * 
   * @param blockId 块 ID
   * @returns 子块列表
   * @private
   */
  async fetchDescendants(blockId: string): Promise<{ id: string }[]> {
    try {
      // 使用递归 CTE 查询所有子块
      const stmt = `
        WITH RECURSIVE descendants AS (
          -- 基础查询：直接子块
          SELECT id, parent_id
          FROM blocks
          WHERE parent_id = '${this.escapeSQL(blockId)}'
          
          UNION ALL
          
          -- 递归查询：子块的子块
          SELECT b.id, b.parent_id
          FROM blocks b
          INNER JOIN descendants d ON b.parent_id = d.id
        )
        SELECT DISTINCT id FROM descendants
      `;
      
      const rows = await api.sql(stmt);
      return rows.map(row => ({ id: row.id }));
    } catch (error) {
      console.error(`[QueryEngine] Failed to fetch descendants for ${blockId}:`, error);
      return [];
    }
  }

  /**
   * SQL 转义（防止 SQL 注入）
   * 
   * @param value 要转义的值
   * @returns 转义后的值
   * @private
   * Requirements: 8.4
   */
  private escapeSQL(value: string): string {
    if (!value) return '';
    // 转义单引号
    return value.replace(/'/g, "''");
  }
}
