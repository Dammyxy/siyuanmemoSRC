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
import { detectAnswerSyntaxReasons } from '@/core/card-type/detectionRules';
import {
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_PARENT_EXCERPT_ID,
  getLegacyProgressiveAttrName,
} from '@/core/siyuan/block';
import { createLogger } from '@/utils/logger';
import { QueryCache } from '@/utils/queryCache';
import type { NeuralRoamNodeType, NeuralRoamNodeTypeResolverPort } from '../domain/ports';
import { createDependencyUnavailableError } from '../dependencyErrors';
import {
  neuralGraphQueryFailed,
  resolveNeuralGraphQuery,
  type NeuralGraphQueryOperation,
  type NeuralGraphQueryPort,
} from './NeuralGraphQueryPort';

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

interface BacklinkCandidate {
  normalizedId: string;
  sourceId: string | null;
  sourceType: string | null;
  normalizedToParent: boolean;
}

interface ResolvedReviewBlockIds {
  ids: string[];
  hasResolvedRenderableNodes: boolean;
}

interface AttributeRow {
  name?: string;
  value?: string;
}

export interface ConceptQueryEngineOptions {
  nodeTypeResolver?: NeuralRoamNodeTypeResolverPort;
  graphQuery?: NeuralGraphQueryPort;
}

const SYNTAX_ITEM_REASONS = new Set([
  'separator-colon',
  'separator-semicolon',
  'direction-symbol',
  'cloze-double-brace',
  'cloze-latex-numbered',
]);

function isRenderableRoamNodeType(nodeType: NeuralRoamNodeType): boolean {
  return nodeType === 'item' || nodeType === 'descriptor' || nodeType === 'topic';
}

export class ConceptQueryEngine {
  private readonly neighborsCache = new QueryCache<Neighbor[]>(5000, 80);
  private readonly backlinksCache = new QueryCache<string[]>(10000, 120);
  private readonly blockDataCache = new QueryCache<BlockData>(30000, 300);
  private readonly nodeTypeCache = new QueryCache<NeuralRoamNodeType>(30000, 300);
  private readonly formalReviewCardCache = new QueryCache<boolean>(30000, 300);
  private readonly progressiveExcerptRootCache = new Map<string, string | null>();
  private fsrsCardsTableAvailable: boolean | null = null;
  private hasLoggedMissingFsrsCardsTable = false;

  constructor(private readonly options: ConceptQueryEngineOptions = {}) {}

  private async queryGraph<TData>(
    operation: NeuralGraphQueryOperation,
    blockId: string,
    fallback: TData,
    options?: Record<string, unknown>,
  ): Promise<{ handled: boolean; value: TData }> {
    const result = await resolveNeuralGraphQuery<TData>(this.options.graphQuery, {
      operation,
      blockId,
      options,
    });
    if (!result) {
      return { handled: false, value: fallback };
    }
    if (result.status === 'failed') {
      throw neuralGraphQueryFailed(result);
    }
    if (result.status === 'known-missing' || result.status === 'unknown') {
      return { handled: true, value: fallback };
    }
    return {
      handled: true,
      value: result.data == null ? fallback : result.data,
    };
  }

  /**
   * 获取概念卡的所有邻居
   * 
   * @param conceptId 概念卡 ID
   * @returns 邻居列表（已去重）
   */
  async fetchNeighbors(conceptId: string): Promise<Neighbor[]> {
    const graph = await this.queryGraph<Neighbor[]>('fetchNeighbors', conceptId, []);
    if (graph.handled) {
      return graph.value;
    }

    const cached = this.neighborsCache.get(conceptId);
    if (cached !== null) {
      logger.debug(`Cache hit for neighbors: ${conceptId}`);
      return cached;
    }

    try {
      const backlinksPromise = this.fetchBacklinks(conceptId);

      // 并行查询所有类型（性能提升 3 倍）
      const [backlinks, directOutgoing, indirectOutgoing] = await Promise.all([
        backlinksPromise,
        this.fetchDirectOutgoingLinks(conceptId),
        backlinksPromise.then((ids) => this.fetchIndirectOutgoingLinks(conceptId, ids)),
      ]);

      const neighbors = await this.filterFormalReviewNeighbors([
        ...backlinks.map(id => ({ id, type: 'backlink' as const, weight: 15 })),
        ...directOutgoing.map(id => ({ id, type: 'outgoing-direct' as const, weight: 10 })),
        ...indirectOutgoing.map(id => ({ id, type: 'outgoing-indirect' as const, weight: 6 })),
      ], conceptId);

      // 去重（同一个块可能同时是反链和正链）
      const uniqueNeighbors = this.deduplicateNeighbors(neighbors);

      this.neighborsCache.set(conceptId, uniqueNeighbors);
      
      logger.log(`Found ${uniqueNeighbors.length} unique neighbors for ${conceptId} (backlinks: ${backlinks.length}, direct: ${directOutgoing.length}, indirect: ${indirectOutgoing.length})`);
      return uniqueNeighbors;
    } catch (error) {
      logger.error('Failed to fetch neighbors:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch neighbors for ${conceptId}`, error);
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
    const graph = await this.queryGraph<string[]>('fetchBacklinks', conceptId, []);
    if (graph.handled) {
      return graph.value;
    }

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
          END AS id,
          b.id AS source_id,
          b.type AS source_type,
          CASE
            WHEN b.type != 'i'
              AND b.parent_id IN (
                SELECT li.id
                FROM blocks li
                WHERE li.type = 'i'
              ) THEN 1
            ELSE 0
          END AS normalized_to_parent
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
      const backlinkCandidates = this.extractBacklinkCandidates(rows, conceptId);
      const backlinkIds = await this.resolveBacklinkIds(backlinkCandidates);

      logger.debug(`Found ${backlinkIds.length} normalized backlink blocks`, backlinkIds.slice(0, 10));

      this.backlinksCache.set(conceptId, backlinkIds);
      
      return backlinkIds;
    } catch (error) {
      logger.error('Failed to fetch backlinks:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch backlinks for ${conceptId}`, error);
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
    const graph = await this.queryGraph<string[]>('fetchDirectOutgoingLinks', conceptId, []);
    if (graph.handled) {
      return graph.value;
    }

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
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch direct outgoing links for ${conceptId}`, error);
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
    const graph = await this.queryGraph<string[]>('fetchIndirectOutgoingLinks', conceptId, [], {
      backlinkIds: backlinkIds ?? null,
    });
    if (graph.handled) {
      return graph.value;
    }

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
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch indirect outgoing links for ${conceptId}`, error);
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
    const graph = await this.queryGraph<string[]>('fetchDescriptors', conceptId, []);
    if (graph.handled) {
      return graph.value;
    }

    try {
      const escapedConceptId = this.escapeSQL(conceptId);
      const descriptorScopeCte = `
        WITH RECURSIVE descriptor_scope AS (
          SELECT id, type
          FROM blocks
          WHERE parent_id = '${escapedConceptId}'
          UNION ALL
          SELECT child.id, child.type
          FROM blocks child
          INNER JOIN descriptor_scope scope ON child.parent_id = scope.id
          WHERE scope.type = 'i'
        )
      `;

      if (this.fsrsCardsTableAvailable !== false) {
        try {
        const localRows = await api.sql(`
          ${descriptorScopeCte}
          SELECT DISTINCT fc.block_id AS id
          FROM fsrs_cards fc
          WHERE fc.block_id IN (SELECT id FROM descriptor_scope)
            AND COALESCE(fc.type, '') NOT IN ('concept', 'topic')
            AND COALESCE(fc.card_type_marker, '') != 'concept'
        `);
        this.fsrsCardsTableAvailable = true;
        const descriptorIds = this.extractIds(localRows, conceptId);
        if (descriptorIds.length > 0) {
          logger.debug(`Found ${descriptorIds.length} descriptors from local cards`);
          return descriptorIds;
        }
        } catch (error) {
          if (this.isMissingFsrsCardsTableError(error)) {
            this.fsrsCardsTableAvailable = false;
            if (!this.hasLoggedMissingFsrsCardsTable) {
              this.hasLoggedMissingFsrsCardsTable = true;
              logger.warn('fsrs_cards table not found; descriptor SQL checks will skip local card lookup in this environment');
            }
          } else {
            logger.error('Failed to fetch descriptors from local cards:', error);
          }
        }
      }

      const syntaxRows = await api.sql(`
        ${descriptorScopeCte}
        SELECT DISTINCT b.id
        FROM blocks b
        WHERE b.id IN (SELECT id FROM descriptor_scope)
          AND (
            b.content LIKE '%;;%'
            OR b.content LIKE '%;<%'
            OR b.content LIKE '%;<>%'
          )
      `);
      const descriptorIds = this.extractIds(syntaxRows, conceptId);
      logger.debug(`Found ${descriptorIds.length} descriptors from syntax`);
      return descriptorIds;
    } catch (error) {
      logger.error('Failed to fetch descriptors:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch descriptors for ${conceptId}`, error);
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
    const graph = await this.queryGraph<boolean>('isConceptCard', blockId, false);
    if (graph.handled) {
      return graph.value;
    }

    const resolvedType = await this.resolveNodeTypeFromResolver(blockId);
    if (resolvedType !== 'unknown') {
      return resolvedType === 'concept';
    }

    if (this.fsrsCardsTableAvailable === false) {
      throw new Error('NEURAL_ROAM_SCHEMA_UNAVAILABLE: fsrs_cards is unavailable for concept checks');
    }

    try {
      const stmt = `
        SELECT COUNT(1) AS concept_count
        FROM fsrs_cards
        WHERE block_id = '${this.escapeSQL(blockId)}'
          AND (type = 'concept' OR card_type_marker = 'concept')
      `;

      const rows = await api.sql(stmt);
      this.fsrsCardsTableAvailable = true;
      if (!Array.isArray(rows) || rows.length === 0) {
        return false;
      }

      const row = rows[0] as UnknownRecord;
      const conceptCount = Number(row.concept_count);
      return Number.isFinite(conceptCount) && conceptCount > 0;
    } catch (error) {
      if (this.isFsrsCardsUnavailableError(error)) {
        this.fsrsCardsTableAvailable = false;
        if (!this.hasLoggedMissingFsrsCardsTable) {
          this.hasLoggedMissingFsrsCardsTable = true;
          logger.error('NEURAL_ROAM_SCHEMA_UNAVAILABLE: fsrs_cards SQL checks unavailable for concept checks');
        }
        throw new Error('NEURAL_ROAM_SCHEMA_UNAVAILABLE: fsrs_cards is unavailable for concept checks');
      }
      logger.error('Failed to check if concept card:', error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to check concept card ${blockId}`, error);
    }
  }

  private extractBacklinkCandidates(rows: unknown, excludeId?: string): BacklinkCandidate[] {
    if (!Array.isArray(rows)) {
      return [];
    }

    const candidates: BacklinkCandidate[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const rowRecord = row as UnknownRecord;
      const normalizedId = typeof rowRecord.id === 'string' ? rowRecord.id : '';
      if (!normalizedId || normalizedId === excludeId) {
        continue;
      }

      const sourceId = typeof rowRecord.source_id === 'string' && rowRecord.source_id.trim().length > 0
        ? rowRecord.source_id
        : null;
      const sourceType = typeof rowRecord.source_type === 'string' && rowRecord.source_type.trim().length > 0
        ? rowRecord.source_type
        : null;
      const normalizedToParent = Number(rowRecord.normalized_to_parent) === 1;
      const dedupeKey = `${normalizedId}::${sourceId ?? ''}::${sourceType ?? ''}::${normalizedToParent ? '1' : '0'}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      candidates.push({
        normalizedId,
        sourceId,
        sourceType,
        normalizedToParent,
      });
    }

    return candidates;
  }

  private async resolveBacklinkIds(candidates: BacklinkCandidate[]): Promise<string[]> {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const normalizedId = await this.resolveProgressiveExcerptBacklinkId(candidate)
        ?? String(candidate.normalizedId || '').trim();
      if (!normalizedId || seen.has(normalizedId)) {
        continue;
      }
      seen.add(normalizedId);
      ids.push(normalizedId);
    }

    return ids;
  }

  private async resolveProgressiveExcerptBacklinkId(candidate: BacklinkCandidate): Promise<string | null> {
    const sourceId = String(candidate.sourceId || '').trim();
    if (sourceId) {
      const fromSource = await this.resolveProgressiveExcerptRootFromBlock(sourceId);
      if (fromSource) {
        return fromSource;
      }
    }

    const normalizedId = String(candidate.normalizedId || '').trim();
    if (!normalizedId) {
      return null;
    }

    return this.resolveProgressiveExcerptRootFromBlock(normalizedId);
  }

  private async resolveProgressiveExcerptRootFromBlock(blockId: string): Promise<string | null> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return null;
    }

    if (this.progressiveExcerptRootCache.has(normalizedBlockId)) {
      return this.progressiveExcerptRootCache.get(normalizedBlockId) ?? null;
    }

    const directAttrs = await this.readProgressiveExcerptAttrs(normalizedBlockId);
    if (directAttrs.kind === 'excerpt-doc') {
      this.progressiveExcerptRootCache.set(normalizedBlockId, normalizedBlockId);
      return normalizedBlockId;
    }
    if (directAttrs.kind === 'daily-excerpt-ref' && directAttrs.parentExcerptId) {
      this.progressiveExcerptRootCache.set(normalizedBlockId, directAttrs.parentExcerptId);
      return directAttrs.parentExcerptId;
    }

    const blockData = await this.fetchBlockData(normalizedBlockId);
    const rootId = String(blockData?.root_id || '').trim();
    if (rootId && rootId !== normalizedBlockId) {
      const rootAttrs = await this.readProgressiveExcerptAttrs(rootId);
      if (rootAttrs.kind === 'excerpt-doc') {
        this.progressiveExcerptRootCache.set(normalizedBlockId, rootId);
        return rootId;
      }
    }

    this.progressiveExcerptRootCache.set(normalizedBlockId, null);
    return null;
  }

  private async readProgressiveExcerptAttrs(blockId: string): Promise<{
    kind?: string;
    parentExcerptId?: string;
  }> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return {};
    }

    const attrNames = [
      ATTR_PROGRESSIVE_KIND,
      getLegacyProgressiveAttrName(ATTR_PROGRESSIVE_KIND),
      ATTR_PROGRESSIVE_PARENT_EXCERPT_ID,
      getLegacyProgressiveAttrName(ATTR_PROGRESSIVE_PARENT_EXCERPT_ID),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (attrNames.length === 0) {
      return {};
    }

    try {
      const rows = await api.sql<AttributeRow>(`
        SELECT name, value
        FROM attributes
        WHERE block_id = '${this.escapeSQL(normalizedBlockId)}'
          AND name IN (${attrNames.map((name) => `'${this.escapeSQL(name)}'`).join(', ')})
      `);
      const values = new Map<string, string>();
      for (const row of rows) {
        const name = typeof row?.name === 'string' ? row.name : '';
        const value = typeof row?.value === 'string' ? row.value.trim() : '';
        if (!name || !value) {
          continue;
        }
        values.set(name, value);
      }

      const kind = values.get(ATTR_PROGRESSIVE_KIND)
        ?? values.get(getLegacyProgressiveAttrName(ATTR_PROGRESSIVE_KIND) ?? '');
      const parentExcerptId = values.get(ATTR_PROGRESSIVE_PARENT_EXCERPT_ID)
        ?? values.get(getLegacyProgressiveAttrName(ATTR_PROGRESSIVE_PARENT_EXCERPT_ID) ?? '');
      return {
        kind,
        parentExcerptId,
      };
    } catch (error) {
      logger.warn(`Failed to read progressive excerpt attrs for ${normalizedBlockId}:`, error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to read progressive excerpt attrs for ${normalizedBlockId}`, error);
    }
  }

  async fetchSubtreeBlockIds(blockId: string): Promise<string[]> {
    const graph = await this.queryGraph<string[]>('fetchSubtreeBlockIds', blockId, []);
    if (graph.handled) {
      return graph.value;
    }

    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return [];
    }

    try {
      const rows = await api.sql(`
        WITH RECURSIVE subtree AS (
          SELECT id
          FROM blocks
          WHERE id = '${this.escapeSQL(normalizedBlockId)}'
          UNION ALL
          SELECT child.id
          FROM blocks child
          INNER JOIN subtree scope ON child.parent_id = scope.id
        )
        SELECT id
        FROM subtree
      `);
      return this.extractIds(rows);
    } catch (error) {
      logger.error(`Failed to fetch subtree block ids for ${normalizedBlockId}:`, error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch subtree block ids for ${normalizedBlockId}`, error);
    }
  }

  private async filterFormalReviewNeighbors(neighbors: Neighbor[], excludeId?: string): Promise<Neighbor[]> {
    const filtered: Neighbor[] = [];
    for (const neighbor of neighbors) {
      const normalizedId = String(neighbor.id || '').trim();
      if (!normalizedId || normalizedId === excludeId) {
        continue;
      }
      if (await this.isExactFormalReviewCardBlock(normalizedId)) {
        continue;
      }
      filtered.push({
        ...neighbor,
        id: normalizedId,
      });
    }
    return filtered;
  }

  private async isExactFormalReviewCardBlock(blockId: string): Promise<boolean> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return false;
    }

    const cached = this.formalReviewCardCache.get(normalizedBlockId);
    if (cached !== null) {
      return cached;
    }

    const resolved = await this.resolveNodeTypeFromFsrsCards(normalizedBlockId);
    const isFormalReviewCard = resolved === 'item' || resolved === 'descriptor';
    this.formalReviewCardCache.set(normalizedBlockId, isFormalReviewCard);
    return isFormalReviewCard;
  }

  private async resolvePreferredReviewBlockIds(candidate: BacklinkCandidate): Promise<string[]> {
    const preferredIds = new Set<string>();

    if (
      candidate.sourceId
      && candidate.sourceId !== candidate.normalizedId
      && isRenderableRoamNodeType(await this.resolveNodeType(candidate.sourceId))
    ) {
      preferredIds.add(candidate.sourceId);
    }

    const normalizedResolution = await this.resolveExpandedReviewBlockIds(candidate.normalizedId);
    if (normalizedResolution.hasResolvedRenderableNodes) {
      for (const id of normalizedResolution.ids) {
        preferredIds.add(id);
      }
    }

    if (preferredIds.size > 0) {
      return Array.from(preferredIds);
    }

    return normalizedResolution.ids;
  }

  private async findListItemDescendantBlockIds(listItemId: string): Promise<string[]> {
    try {
      const rows = await api.sql(`
        WITH RECURSIVE descendants AS (
          SELECT id
          FROM blocks
          WHERE parent_id = '${this.escapeSQL(listItemId)}'
          UNION ALL
          SELECT child.id
          FROM blocks child
          INNER JOIN descendants scope ON child.parent_id = scope.id
        )
        SELECT DISTINCT id
        FROM descendants
      `);
      return this.extractIds(rows, listItemId);
    } catch (error) {
      logger.error(`Failed to resolve descendant block ids for list item ${listItemId}:`, error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to resolve descendant block ids for list item ${listItemId}`, error);
    }
  }

  private async findListItemRenderableDescendants(listItemId: string): Promise<string[]> {
    const descendantIds = await this.findListItemDescendantBlockIds(listItemId);
    if (descendantIds.length === 0) {
      return [];
    }

    const resolvedIds: string[] = [];
    const seen = new Set<string>();

    for (const descendantId of descendantIds) {
      const resolution = await this.resolveExpandedReviewBlockIds(descendantId);
      if (!resolution.hasResolvedRenderableNodes) {
        continue;
      }

      for (const resolvedId of resolution.ids) {
        if (!resolvedId || resolvedId === listItemId || seen.has(resolvedId)) {
          continue;
        }
        seen.add(resolvedId);
        resolvedIds.push(resolvedId);
      }
    }

    return resolvedIds;
  }

  private async expandResolvedReviewBlockIds(blockIds: string[], excludeId?: string): Promise<string[]> {
    const expandedIds: string[] = [];
    const seen = new Set<string>();

    for (const blockId of blockIds) {
      const resolution = await this.resolveExpandedReviewBlockIds(blockId);
      for (const resolvedId of resolution.ids) {
        if (!resolvedId || resolvedId === excludeId || seen.has(resolvedId)) {
          continue;
        }
        seen.add(resolvedId);
        expandedIds.push(resolvedId);
      }
    }

    return expandedIds;
  }

  private async resolveExpandedReviewBlockIds(blockId: string): Promise<ResolvedReviewBlockIds> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return {
        ids: [],
        hasResolvedRenderableNodes: false,
      };
    }

    const blockData = await this.fetchBlockData(normalizedBlockId);
    if (blockData?.type === 'i') {
      const descendantIds = await this.findListItemRenderableDescendants(normalizedBlockId);
      if (descendantIds.length > 0) {
        return {
          ids: descendantIds,
          hasResolvedRenderableNodes: true,
        };
      }
    }

    if (isRenderableRoamNodeType(await this.resolveNodeType(normalizedBlockId))) {
      return {
        ids: [normalizedBlockId],
        hasResolvedRenderableNodes: true,
      };
    }

    return {
      ids: [normalizedBlockId],
      hasResolvedRenderableNodes: false,
    };
  }

  private async resolveNodeType(blockId: string): Promise<NeuralRoamNodeType> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return 'unknown';
    }

    const cached = this.nodeTypeCache.get(normalizedBlockId);
    if (cached !== null) {
      return cached;
    }

    let resolvedType = await this.resolveNodeTypeFromResolver(normalizedBlockId);
    if (resolvedType === 'unknown') {
      resolvedType = await this.resolveNodeTypeFromFsrsCards(normalizedBlockId);
    }
    if (resolvedType === 'unknown') {
      resolvedType = await this.resolveNodeTypeFromSyntax(normalizedBlockId);
    }

    this.nodeTypeCache.set(normalizedBlockId, resolvedType);
    return resolvedType;
  }

  private async resolveNodeTypeFromResolver(blockId: string): Promise<NeuralRoamNodeType> {
    if (!this.options.nodeTypeResolver) {
      return 'unknown';
    }

    try {
      return await this.options.nodeTypeResolver.resolveNodeType(blockId);
    } catch (error) {
      logger.warn(`Failed to resolve roam node type via injected resolver for ${blockId}:`, error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to resolve roam node type via injected resolver for ${blockId}`, error);
    }
  }

  private async resolveNodeTypeFromFsrsCards(blockId: string): Promise<NeuralRoamNodeType> {
    if (this.fsrsCardsTableAvailable === false) {
      throw new Error('NEURAL_ROAM_SCHEMA_UNAVAILABLE: fsrs_cards is unavailable for local roam-node type checks');
    }

    try {
      const rows = await api.sql(`
        SELECT type, card_type_marker
        FROM fsrs_cards
        WHERE block_id = '${this.escapeSQL(blockId)}'
        LIMIT 1
      `);
      this.fsrsCardsTableAvailable = true;

      if (!Array.isArray(rows) || rows.length === 0) {
        return 'unknown';
      }

      const row = rows[0] as UnknownRecord;
      const type = typeof row.type === 'string' ? row.type : '';
      const marker = typeof row.card_type_marker === 'string' ? row.card_type_marker : '';

      if (type === 'concept' || marker === 'concept') {
        return 'concept';
      }
      if (type === 'descriptor' || marker === 'descriptor') {
        return 'descriptor';
      }
      if (type === 'topic') {
        return 'topic';
      }
      if (type.length > 0) {
        return 'item';
      }

      return 'unknown';
    } catch (error) {
      if (this.isFsrsCardsUnavailableError(error)) {
        this.fsrsCardsTableAvailable = false;
        if (!this.hasLoggedMissingFsrsCardsTable) {
          this.hasLoggedMissingFsrsCardsTable = true;
          logger.error('NEURAL_ROAM_SCHEMA_UNAVAILABLE: fsrs_cards SQL checks unavailable for local roam-node type checks');
        }
        throw new Error('NEURAL_ROAM_SCHEMA_UNAVAILABLE: fsrs_cards is unavailable for local roam-node type checks');
      }
      logger.error(`Failed to resolve local roam node type for block ${blockId}:`, error);
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to resolve local roam node type for block ${blockId}`, error);
    }
  }

  private async resolveNodeTypeFromSyntax(blockId: string): Promise<NeuralRoamNodeType> {
    const blockData = await this.fetchBlockData(blockId);
    if (!blockData) {
      return 'unknown';
    }

    if (blockData.type === 'd') {
      return 'topic';
    }

    const syntaxReasons = detectAnswerSyntaxReasons('', blockData.content, 'extended');
    return syntaxReasons.some((reason) => SYNTAX_ITEM_REASONS.has(reason))
      ? 'item'
      : 'unknown';
  }

  /**
   * 获取块数据
   * 
   * @param blockId 块 ID
   * @returns 块数据，如果不存在则返回 null
   */
  async fetchBlockData(blockId: string): Promise<BlockData | null> {
    const graph = await this.queryGraph<BlockData | null>('fetchBlockData', blockId, null);
    if (graph.handled) {
      return graph.value;
    }

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
      throw createDependencyUnavailableError('NEURAL_ROAM_QUERY_UNAVAILABLE', `failed to fetch block data for ${blockId}`, error);
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

  private isMissingFsrsCardsTableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    return normalized.includes('no such table') && normalized.includes('fsrs_cards');
  }

  private isLegacyLocalCardSqlUnsupportedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    return normalized.includes('syntax error')
      && (normalized.includes('near "limit"') || normalized.includes("near 'limit'"));
  }

  private isFsrsCardsUnavailableError(error: unknown): boolean {
    return this.isMissingFsrsCardsTableError(error) || this.isLegacyLocalCardSqlUnsupportedError(error);
  }
}
