/**
 * QueryEngine - 神经队列查询引擎
 * 
 * 封装所有数据库查询操作，提供邻居节点查询、随机种子选择等功能。
 * 使用参数化查询防止 SQL 注入。
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 8.1, 8.4
 */

import * as api from '../../siyuan/api.ts';
import { AssociationType, NeighborQueryResult, NeuralQueueConfig, NeuralBlockType } from './types.ts';
import { createLogger } from '@/utils/logger';
import { hasConceptDefinitionSyntax } from '@/core/xiuyuan/cardMeta';
import { createDependencyUnavailableError } from '../dependencyErrors';

const logger = createLogger('QueryEngine');

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
}

type UnknownRecord = Record<string, unknown>;
type IdRow = { id?: string };
type BlockContentRow = { id?: string; content?: string };
type LocalCardRow = { type?: string; card_type_marker?: string; block_id?: string; id?: string };
type RootIdRow = { root_id?: string };
type ParentIdRow = { parent_id?: string };
type IalRow = { ial?: string };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getBacklinkId(backlink: unknown): string | null {
  if (!isRecord(backlink)) {
    return null;
  }
  return toNonEmptyString(backlink.blockID) ?? toNonEmptyString(backlink.id);
}

function toNeighborResults(rows: Array<{ id?: string }>, type: AssociationType): NeighborQueryResult[] {
  return rows
    .map((row) => toNonEmptyString(row.id))
    .filter((id): id is string => typeof id === 'string')
    .map((id) => ({ id, type }));
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

      const rows = await api.sql<BlockContentRow>(stmt);
      const contentMap = new Map<string, string>();

      for (const row of rows) {
        // 提取纯文本内容（去除 Markdown 标记）
        const content = (typeof row.content === 'string' ? row.content : '').replace(/[#*`\[\]()]/g, '').trim();
        // 限制长度为 50 字符
        const truncated = content.length > 50 ? content.substring(0, 50) + '...' : content;
        const id = toNonEmptyString(row.id);
        if (!id) {
          continue;
        }
        contentMap.set(id, truncated);
      }

      return contentMap;
    } catch (error) {
      logger.error('Failed to fetch block contents:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch block contents', error);
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
    try {
      // 🆕 检查是否为概念卡，使用专门的查询逻辑
      const isConceptCard = await this.isConceptCard(currentCardId);
      if (isConceptCard) {
        return await this.fetchConceptNeighbors(currentCardId);
      }

      // 🔒 非概念卡不支持神经漫游，返回空数组
      logger.info(`Non-concept card ${currentCardId} is not supported in neural roaming`);
      return [];
    } catch (error) {
      logger.error('Failed to fetch neighbors:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch neighbors', error);
    }
  }

  /**
   * 🆕 获取概念卡的邻居节点（专门的查询逻辑）
   *
   * 概念卡使用特殊的神经漫游增强机制：
   * 1. 反向链接（BACKLINK）- 权重 15，隐式定义
   * 2. 概念卡子块的出链（CONCEPT_LINK）- 权重 8
   * 3. 描述符卡（DESCRIPTOR）- 权重 3，显式定义
   *
   * @param conceptBlockId 概念卡块 ID
   * @returns 邻居节点列表
   * Requirements: 3.2, 3.3, 3.4
   */
  async fetchConceptNeighbors(conceptBlockId: string): Promise<NeighborQueryResult[]> {
    const neighbors: NeighborQueryResult[] = [];

    try {
      logger.info(`Fetching concept neighbors for ${conceptBlockId}`);

      // 1. 查询反向链接（最高优先级）
      const backlinks = await this.fetchBacklinks(conceptBlockId);
      neighbors.push(...backlinks);
      logger.info(`Found ${backlinks.length} backlinks`);

      // 2. 查询概念卡子块的出链
      const conceptLinks = await this.fetchConceptLinks(conceptBlockId);
      neighbors.push(...conceptLinks);
      logger.info(`Found ${conceptLinks.length} concept links`);

      // 3. 查询描述符卡
      const descriptors = await this.fetchDescriptorCards(conceptBlockId);
      neighbors.push(...descriptors);
      logger.info(`Found ${descriptors.length} descriptor cards`);

      // 去重
      const uniqueNeighbors = this.deduplicateNeighbors(neighbors);
      logger.info(`Total unique concept neighbors: ${uniqueNeighbors.length}`);

      return uniqueNeighbors;
    } catch (error) {
      logger.error('Failed to fetch concept neighbors:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch concept neighbors', error);
    }
  }

  /**
   * 🆕 检查块是否为概念卡
   *
   * @param blockId 块 ID
   * @returns 是否为概念卡
   */
  async isConceptCard(blockId: string): Promise<boolean> {
    try {
      const escapedId = this.escapeSQL(blockId);
      try {
        const localRows = await api.sql<LocalCardRow>(`
          SELECT type, card_type_marker
          FROM fsrs_cards
          WHERE block_id = '${escapedId}'
          LIMIT 5
        `);
        if (Array.isArray(localRows) && localRows.length > 0) {
          return localRows.some((row) =>
            row?.type === 'concept' || row?.card_type_marker === 'concept'
          );
        }
      } catch {
        // fsrs_cards table may be unavailable in some environments
      }

      const blockRows = await api.sql<BlockContentRow>(`
        SELECT content
        FROM blocks
        WHERE id = '${escapedId}'
        LIMIT 1
      `);
      const content = typeof blockRows?.[0]?.content === 'string' ? blockRows[0].content : '';
      return hasConceptDefinitionSyntax(content);
    } catch (error) {
      logger.error('Failed to check if concept card:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to check concept card ${blockId}`, error);
    }
  }

  /**
   * 🆕 查询反向链接（使用 /api/ref/getBacklink2）
   *
   * 反向链接是概念卡神经漫游的核心，权重最高（15）。
   * 表示"谁引用了这个概念"，提供隐式定义。
   *
   * @param blockId 块 ID
   * @returns 反向链接邻居节点
   * Requirements: 3.2
   */
  async fetchBacklinks(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      // 使用思源 API 获取反向链接
      const response = await fetch('/api/ref/getBacklink2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data: unknown = await response.json();
      if (!isRecord(data) || data.code !== 0) {
        const message = isRecord(data) && typeof data.msg === 'string' ? data.msg : 'unknown error';
        throw new Error(`API error: ${message}`);
      }

      const backlinks = isRecord(data.data) && Array.isArray(data.data.backlinks) ? data.data.backlinks : [];
      const backlinkIds = backlinks
        .map(getBacklinkId)
        .filter((id): id is string => typeof id === 'string');

      logger.info(`Fetched ${backlinkIds.length} backlinks from API`);

      // 返回所有反向链接节点（包括普通块，会创建虚拟卡）
      return backlinkIds.map((id: string) => ({
        id,
        type: AssociationType.BACKLINK,
      }));
    } catch (error) {
      logger.error('Failed to fetch backlinks:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch backlinks', error);
    }
  }

  /**
   * 🆕 查询概念卡子块的出链（指向其他概念卡）
   *
   * 查询当前概念卡及其子块中的所有出链，
   * 筛选出指向其他概念卡的链接。
   * 权重：8
   *
   * @param blockId 块 ID
   * @returns 概念链接邻居节点
   * Requirements: 3.3
   */
  async fetchConceptLinks(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      // 查询当前块及其子块中的所有出链
      const stmt = `
        SELECT DISTINCT r.def_block_id as id
        FROM refs r
        WHERE r.block_id = '${this.escapeSQL(blockId)}'
          OR r.block_id IN (
            -- 查询所有子块
            WITH RECURSIVE descendants AS (
              SELECT id FROM blocks WHERE parent_id = '${this.escapeSQL(blockId)}'
              UNION ALL
              SELECT b.id FROM blocks b
              INNER JOIN descendants d ON b.parent_id = d.id
            )
            SELECT id FROM descendants
          )
      `;

      const rows = await api.sql<IdRow>(stmt);
      
      // 🔧 修复：检查 rows 是否为 null
      if (!rows || !Array.isArray(rows)) {
        logger.info('No concept links found (empty result)');
        return [];
      }
      
      // 🔧 返回所有出链（包括普通块，会创建虚拟卡）
      // 概念卡的邻居包括：反链、正链（所有出链）、描述符卡
      const conceptLinks = toNeighborResults(rows, AssociationType.CONCEPT_LINK);

      logger.info(`Found ${conceptLinks.length} concept links (all outgoing links)`);
      return conceptLinks;
    } catch (error) {
      logger.error('Failed to fetch concept links:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch concept links', error);
    }
  }

  /**
   * 🆕 查询描述符卡（概念的子块）
   *
   * 查询当前概念卡的子块，筛选出标记为 descriptor 的卡片。
   * 权重：3（最低，显式定义）
   *
   * @param blockId 块 ID
   * @returns 描述符卡邻居节点
   * Requirements: 3.4
   */
  async fetchDescriptorCards(blockId: string): Promise<NeighborQueryResult[]> {
    try {
      const escapedId = this.escapeSQL(blockId);
      const childRows = await api.sql<IdRow>(`
        SELECT DISTINCT b.id
        FROM blocks b
        WHERE b.parent_id = '${escapedId}'
      `);
      const childIds = childRows
        .map((row) => (typeof row?.id === 'string' ? row.id : ''))
        .filter((id): id is string => id.length > 0);

      if (childIds.length === 0) {
        return [];
      }

      try {
        const idList = childIds.map((id) => `'${this.escapeSQL(id)}'`).join(',');
        const localRows = await api.sql<LocalCardRow>(`
          SELECT DISTINCT block_id
          FROM fsrs_cards
          WHERE block_id IN (${idList})
            AND (type = 'descriptor' OR card_type_marker = 'descriptor')
        `);
        const descriptorIds = localRows
          .map((row) => (typeof row?.block_id === 'string' ? row.block_id : ''))
          .filter((id): id is string => id.length > 0);

        if (descriptorIds.length > 0) {
          return descriptorIds.map((id) => ({
            id,
            type: AssociationType.DESCRIPTOR,
          }));
        }
      } catch {
        // fsrs_cards table may be unavailable in some environments
      }

      // Syntax fallback: treat descriptor-like lines as descriptor cards.
      const syntaxRows = await api.sql<IdRow>(`
        SELECT DISTINCT b.id
        FROM blocks b
        WHERE b.parent_id = '${escapedId}'
          AND (
            b.content LIKE '%;;%'
            OR b.content LIKE '%;<%'
            OR b.content LIKE '%;<>%'
          )
      `);
      return toNeighborResults(syntaxRows, AssociationType.DESCRIPTOR);
    } catch (error) {
      logger.error('Failed to fetch descriptor cards:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch descriptor cards', error);
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
        // Local-card source only.
        const outgoingStmt = `
          SELECT DISTINCT r.def_block_id as id, 'ref' as type
          FROM refs r
          INNER JOIN fsrs_cards c ON r.def_block_id = c.block_id
          WHERE r.block_id = '${this.escapeSQL(blockId)}'
        `;
        const incomingStmt = `
          SELECT DISTINCT r.block_id as id, 'ref' as type
          FROM refs r
          INNER JOIN fsrs_cards c ON r.block_id = c.block_id
          WHERE r.def_block_id = '${this.escapeSQL(blockId)}'
        `;
        const outgoing = await api.sql<IdRow>(outgoingStmt);
        const incoming = await api.sql<IdRow>(incomingStmt);
        return [
          ...toNeighborResults(outgoing, AssociationType.REF_LINK),
          ...toNeighborResults(incoming, AssociationType.REF_LINK),
        ];
      }

      // Query meaningful blocks (local cards + topics).
      const outgoingStmt = `
        SELECT DISTINCT 
          r.def_block_id as id, 
          'ref' as type,
          b.type as block_type,
          b.content,
          CASE 
            WHEN fc.block_id IS NOT NULL THEN 1
            ELSE 0
          END as has_flashcard
        FROM refs r
        INNER JOIN blocks b ON r.def_block_id = b.id
        LEFT JOIN (
          SELECT DISTINCT block_id
          FROM fsrs_cards
        ) fc ON b.id = fc.block_id
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
            WHEN fc.block_id IS NOT NULL THEN 1
            ELSE 0
          END as has_flashcard
        FROM refs r
        INNER JOIN blocks b ON r.block_id = b.id
        LEFT JOIN (
          SELECT DISTINCT block_id
          FROM fsrs_cards
        ) fc ON b.id = fc.block_id
        WHERE r.def_block_id = '${this.escapeSQL(blockId)}'
          AND b.type IN (${allowedTypes})
          AND LENGTH(b.content) >= ${minLength}
      `;

      const outgoing = await api.sql<IdRow>(outgoingStmt);
      const incoming = await api.sql<IdRow>(incomingStmt);

      return [
        ...toNeighborResults(outgoing, AssociationType.REF_LINK),
        ...toNeighborResults(incoming, AssociationType.REF_LINK),
      ];
    } catch (error) {
      logger.error('Failed to fetch ref links:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch ref links', error);
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
        // Local-card source only.
        const stmt = `
          SELECT DISTINCT b.id, 'context' as type
          FROM blocks b
          INNER JOIN fsrs_cards c ON b.id = c.block_id
          WHERE b.root_id = '${this.escapeSQL(rootId)}'
            AND b.id != '${this.escapeSQL(blockId)}'
          LIMIT ${limit}
        `;
        const rows = await api.sql<IdRow>(stmt);
        return toNeighborResults(rows, AssociationType.HIERARCHY);
      }

      // 查询所有有意义的块（闪卡 + 主题）
      const stmt = `
        SELECT DISTINCT 
          b.id, 
          'context' as type,
          b.type as block_type,
          CASE 
            WHEN fc.block_id IS NOT NULL THEN 1
            ELSE 0
          END as has_flashcard
        FROM blocks b
        LEFT JOIN (
          SELECT DISTINCT block_id
          FROM fsrs_cards
        ) fc ON b.id = fc.block_id
        WHERE b.root_id = '${this.escapeSQL(rootId)}'
          AND b.id != '${this.escapeSQL(blockId)}'
          AND b.type IN (${allowedTypes})
          AND LENGTH(b.content) >= ${minLength}
        LIMIT ${limit}
      `;

      const rows = await api.sql<IdRow>(stmt);
      return toNeighborResults(rows, AssociationType.HIERARCHY);
    } catch (error) {
      logger.error('Failed to fetch context cards:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch context cards', error);
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

      // Query local cards with similar tags.
      const stmt = `
        SELECT DISTINCT b.id, 'tag' as type
        FROM blocks b
        INNER JOIN fsrs_cards c ON b.id = c.block_id
        WHERE b.id != '${this.escapeSQL(blockId)}'
          AND b.ial LIKE '%#%'
        LIMIT ${limit}
      `;

      const rows = await api.sql<IdRow>(stmt);
      return toNeighborResults(rows, AssociationType.TAG);
    } catch (error) {
      logger.error('Failed to fetch tag related cards:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch tag related cards', error);
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

      // Query sibling local cards.
      const stmt = `
        SELECT DISTINCT b.id, 'sibling' as type
        FROM blocks b
        INNER JOIN fsrs_cards c ON b.id = c.block_id
        WHERE b.parent_id = '${this.escapeSQL(parentId)}'
          AND b.id != '${this.escapeSQL(blockId)}'
        LIMIT 10
      `;

      const rows = await api.sql<IdRow>(stmt);
      return toNeighborResults(rows, AssociationType.SIBLING);
    } catch (error) {
      logger.error('Failed to fetch sibling cards:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch sibling cards', error);
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
      try {
        const localRows = await api.sql<IdRow>(`
          SELECT DISTINCT block_id AS id
          FROM fsrs_cards
          WHERE type = 'concept' OR card_type_marker = 'concept'
          ORDER BY RANDOM()
          LIMIT 1
        `);
        if (Array.isArray(localRows) && localRows.length > 0 && typeof localRows[0].id === 'string') {
          return localRows[0].id;
        }
      } catch {
        // fsrs_cards table may be unavailable in some environments
      }

      const syntaxRows = await api.sql<IdRow>(`
        SELECT id
        FROM blocks
        WHERE content LIKE '%::%' OR content LIKE '%：：%'
        ORDER BY RANDOM()
        LIMIT 1
      `);
      if (!syntaxRows || syntaxRows.length === 0) {
        logger.warn('No concept cards found for neural roaming seed');
        return null;
      }
      return toNonEmptyString(syntaxRows[0]?.id);
    } catch (error) {
      logger.error('Failed to fetch random card:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch random card', error);
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
          CASE 
            WHEN fc.block_id IS NOT NULL THEN 1
            ELSE 0
          END as has_flashcard
        FROM blocks b
        LEFT JOIN (
          SELECT DISTINCT block_id
          FROM fsrs_cards
        ) fc ON b.id = fc.block_id
        WHERE b.id = '${this.escapeSQL(cardId)}'
      `;

      const rows = await api.sql(stmt);
      if (rows.length === 0) return null;

      const row = rows[0] as UnknownRecord;
      const hasFlashcard = row.has_flashcard === 1;
      const siyuanBlockType = typeof row.type === 'string' ? row.type : '';
      const blockType = this.classifyBlock(siyuanBlockType, hasFlashcard);

      return {
        id: typeof row.id === 'string' ? row.id : cardId,
        content: typeof row.content === 'string' ? row.content : '',
        rootId: typeof row.root_id === 'string' ? row.root_id : '',
        type: siyuanBlockType,
        blockType,
        hasFlashcard,
      };
    } catch (error) {
      logger.error('Failed to fetch card data:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', 'failed to fetch card data', error);
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
      const rows = await api.sql<RootIdRow>(stmt);
      return toNonEmptyString(rows[0]?.root_id);
    } catch (error) {
      logger.error('Failed to get root_id:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to get root_id for ${blockId}`, error);
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
      const rows = await api.sql<ParentIdRow>(stmt);
      return toNonEmptyString(rows[0]?.parent_id);
    } catch (error) {
      logger.error('Failed to get parent_id:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to get parent_id for ${blockId}`, error);
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
      const rows = await api.sql<IalRow>(stmt);
      if (rows.length === 0) return [];

      const ial = typeof rows[0]?.ial === 'string' ? rows[0].ial : '';
      // 从 IAL 中提取标签（格式：#tag#）
      const tagMatches = ial.match(/#[^#\s]+#/g);
      if (!tagMatches) return [];

      return tagMatches.map(tag => tag.replace(/#/g, ''));
    } catch (error) {
      logger.error('Failed to extract tags:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to extract tags for ${blockId}`, error);
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
      
      const rows = await api.sql<IdRow>(stmt);
      return rows
        .map((row) => toNonEmptyString(row.id))
        .filter((id): id is string => typeof id === 'string')
        .map((id) => ({ id }));
    } catch (error) {
      logger.error(`Failed to fetch descendants for ${blockId}:`, error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch descendants for ${blockId}`, error);
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
