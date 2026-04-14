import type { SortModel } from '@/application/interfaces/ICardDataSource';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import { QuerySiyuanAdapter } from '@/infrastructure/siyuan/QuerySiyuanAdapter';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService, CardState } from '@/core/card/domain/services/CardScheduleService';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { batchDetectCardType } from '@/core/card-builder/detectCardType';
import type { BrowserCardStoragePort } from '@/core/storage/ports';
import type { FSRSCard } from '@/types';
import type { CardType } from '@/types/card';
import { ALL_CARD_QUERY_STATES, type StructuredCardQuery } from '@/types/card-query';
import { createLogger } from '@/utils/logger';
import { parseQuery } from '@/ui/browser/browserService';
import {
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  STATE_LABELS,
  truncateContent,
} from '@/ui/browser/types';
import {
  applyDocFilter,
  applySimpleQueryFilter,
  isMissingBlockCard,
  sortBrowserRows,
} from '@/ui/browser/datasource/DataSourceUtils';
import { resolveBrowserCardStableId } from '@/ui/browser/utils/browserCardIdentity';
import type { BrowserCard, BrowserStats, PresetFilter } from '../GetBrowserCardsQuery';
import type {
  BrowserDeckLiteRow,
  BrowserDeckSnapshotQuery,
  BrowserDeckSnapshotResult,
} from '../browser-deck-query';

const logger = createLogger('BrowserDeckQueryKernel');

interface RootIdRow extends Record<string, unknown> {
  id: string;
  root_id: string | null;
}

interface ContentRow extends Record<string, unknown> {
  id: string;
  content: string | null;
}

interface BlockInfoRow extends Record<string, unknown> {
  id: string;
  root_id: string | null;
  content: string | null;
  attrs: string | null;
}

interface BlockIdRow extends Record<string, unknown> {
  id: string;
}

interface ResolvedCandidateCards {
  cards: FSRSCard[];
  path: 'all-cards-query' | 'structured-query' | 'sql-candidate-query' | 'sql-fallback-getAllCards';
  sqlCandidateCount: number | null;
  usedFallback: boolean;
}

type BrowserDeckSnapshotRow = BrowserCard;

const STRUCTURED_CARD_TYPES = new Set([
  'topic',
  'item',
  'concept',
  'descriptor',
  'incremental',
  'webpage',
]);

export class BrowserDeckQueryKernel {
  private readonly snapshotCardCache = new Map<string, FSRSCard>();

  constructor(
    private readonly storageManager: BrowserCardStoragePort,
    private readonly cardScheduleService: CardScheduleService,
    private readonly cardFilterService: CardFilterService,
    private readonly siyuanApi: QuerySiyuanPort = new QuerySiyuanAdapter()
  ) {}

  async buildSnapshot(query: BrowserDeckSnapshotQuery = {}): Promise<BrowserDeckSnapshotResult> {
    const candidateResolution = await this.resolveCandidateCards(query);
    logger.debug('Browser deck snapshot route resolved:', {
      path: candidateResolution.path,
      sqlCandidateCount: candidateResolution.sqlCandidateCount,
      candidateCount: candidateResolution.cards.length,
      usedFallback: candidateResolution.usedFallback,
    });

    const candidateCards = candidateResolution.cards;
    if (this.shouldHydrateContentForQuery(query)) {
      await this.fillContentForSearch(candidateCards);
    }
    if (query.docId) {
      await this.fillRootIds(candidateCards.filter((card) => !this.readMetaString(card, 'rootId')));
    }

    let rows = await this.buildSnapshotRows(candidateCards);
    rows = this.applyPresetFilter(rows, query.preset);
    rows = this.applyExplicitStateFilter(rows, query.states);
    rows = this.applyExplicitCardTypeFilter(rows, query.cardTypes);
    rows = applySimpleQueryFilter(rows, query.searchText, { secondaryField: 'fullContent' });
    rows = applyDocFilter(rows, query.docId);
    rows = this.applyDeckAndTagFilter(rows, query);

    const sortedRows = sortBrowserRows(rows, query.sortModel || []);
    const candidateCardById = new Map<string, FSRSCard>();
    for (const card of candidateCards) {
      candidateCardById.set(String(card.id || '').trim(), card);
    }
    this.snapshotCardCache.clear();
    for (const row of sortedRows) {
      const stableId = resolveBrowserCardStableId(row);
      const matchedCard = candidateCardById.get(stableId);
      if (matchedCard) {
        this.snapshotCardCache.set(stableId, matchedCard);
      }
    }

    return {
      rows: sortedRows.map((row) => this.toLiteRow(row)),
      total: sortedRows.length,
    };
  }

  async getStats(): Promise<BrowserStats> {
    const allCards = await this.loadAllCards();
    return this.calculateStats(allCards);
  }

  async getBrowserCardsByIds(ids: string[]): Promise<BrowserCard[]> {
    const orderedIds = ids
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (orderedIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(orderedIds));
    const cards = uniqueIds
      .map((id) => this.resolveCardById(id))
      .filter((card): card is FSRSCard => Boolean(card));

    if (cards.length === 0) {
      return [];
    }

    const browserCards = await this.transformToBrowserCards(cards);
    const rowById = new Map<string, BrowserCard>();
    for (const row of browserCards) {
      rowById.set(resolveBrowserCardStableId(row), row);
    }

    return orderedIds
      .map((id) => rowById.get(id))
      .filter((row): row is BrowserCard => Boolean(row));
  }

  transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    const elapsedDays = card.lastReview
      ? Math.floor((now - card.lastReview) / MS_PER_DAY)
      : 0;

    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    const state = card.state as CardState;

    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;

    const dueFormatted = formatDueDate(dueDate);
    const lastReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
    const firstReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';

    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);

    const deckId = (card.meta?.deckId as string) || '';
    const rootId = (card.meta?.rootId as string) || '';

    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    const finalCardType = cardType || customAttrs[this.siyuanApi.ATTR_CARD_TYPE];

    return {
      id: card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      rootId,
      content,
      fullContent,

      state,
      stateLabel: STATE_LABELS[state] || '未知',
      due: dueDate,
      dueFormatted,
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability,
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays || 0,
      lastReview: lastReviewDate,
      lastReviewFormatted,

      interval: card.scheduledDays || 0,
      firstReview: lastReviewDate,
      firstReviewFormatted,

      priority: card.priority ?? 50,
      suspended: isCardDismissed(card),

      cardType: finalCardType,
      aFactor: card.aFactor,

      tags: [],
      meta: card.meta,
    };
  }

  private async buildSnapshotRows(cards: FSRSCard[]): Promise<BrowserDeckSnapshotRow[]> {
    const rows = cards.map((card) => this.transformCardToSnapshotRow(card));
    return this.reconcileRowCardTypes(rows);
  }

  private async reconcileRowCardTypes(rows: BrowserDeckSnapshotRow[]): Promise<BrowserDeckSnapshotRow[]> {
    const unresolvedBlockIds = Array.from(new Set(
      rows
        .filter((row) => !row.cardType && row.blockId)
        .map((row) => String(row.blockId || '').trim())
        .filter(Boolean)
    ));
    if (unresolvedBlockIds.length === 0) {
      return rows;
    }

    try {
      const detected = await batchDetectCardType(unresolvedBlockIds);
      if (detected.size === 0) {
        return rows;
      }

      return rows.map((row) => {
        const detectedType = detected.get(String(row.blockId || '').trim());
        if (!detectedType || row.cardType) {
          return row;
        }
        return {
          ...row,
          cardType: detectedType,
        };
      });
    } catch (error) {
      logger.warn('Failed to reconcile browser deck card types', error);
      return rows;
    }
  }

  private transformCardToSnapshotRow(card: FSRSCard): BrowserDeckSnapshotRow {
    const now = Date.now();
    const elapsedDays = card.lastReview
      ? Math.floor((now - card.lastReview) / 86400000)
      : 0;
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    const firstReviewDate = (card.reps || 0) > 0
      ? (card.createdAt ? new Date(card.createdAt) : lastReviewDate)
      : null;
    const fullContent = (card.meta?.content as string) || '';
    const tags = Array.isArray(card.meta?.tags)
      ? (card.meta?.tags as string[]).map((tag) => String(tag || '').trim()).filter(Boolean)
      : [];

    return {
      id: card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId: (card.meta?.deckId as string) || '',
      rootId: (card.meta?.rootId as string) || '',
      content: truncateContent(fullContent, 100),
      fullContent,
      state: card.state as CardState,
      stateLabel: STATE_LABELS[card.state as CardState] || '未知',
      suspended: isCardDismissed(card),
      due: dueDate,
      dueFormatted: '',
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability: calculateRetrievability(card.stability, elapsedDays),
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays || 0,
      interval: card.scheduledDays || 0,
      lastReview: lastReviewDate,
      lastReviewFormatted: '',
      firstReview: firstReviewDate,
      firstReviewFormatted: '',
      priority: card.priority ?? 50,
      tags,
      cardType: typeof card.type === 'string' ? card.type : undefined,
      aFactor: card.aFactor,
      meta: card.meta,
    };
  }

  private toLiteRow(row: BrowserDeckSnapshotRow): BrowserDeckLiteRow {
    const id = resolveBrowserCardStableId(row);
    return {
      id,
      blockId: String(row.blockId || ''),
      fsrsCardId: String(row.fsrsCardId || '') || undefined,
      actionTarget: {
        id: String(row.id || ''),
        blockId: String(row.blockId || ''),
        fsrsCardId: String(row.fsrsCardId || '') || undefined,
        cardType: row.cardType,
        priority: typeof row.priority === 'number' ? row.priority : undefined,
      },
    };
  }

  private applyPresetFilter(rows: BrowserDeckSnapshotRow[], preset?: PresetFilter): BrowserDeckSnapshotRow[] {
    if (!preset || preset === 'all' || preset === 'current-doc') {
      return rows;
    }

    const now = Date.now();
    return rows.filter((row) => {
      switch (preset) {
        case 'due':
          return row.due.getTime() <= now;
        case 'overdue':
          return row.due.getTime() < now && row.state !== CardState.New;
        case 'new':
          return row.state === CardState.New;
        case 'learning':
          return row.state === CardState.Learning;
        case 'review':
          return row.state === CardState.Review;
        case 'leech':
          return (row.lapses ?? 0) > 0;
        case 'suspended':
          return row.suspended === true;
        default:
          return true;
      }
    });
  }

  private applyExplicitStateFilter(rows: BrowserDeckSnapshotRow[], states?: CardState[]): BrowserDeckSnapshotRow[] {
    if (!states?.length) {
      return rows;
    }

    const stateSet = new Set(states.map((state) => Number(state)));
    return rows.filter((row) => stateSet.has(Number(row.state)));
  }

  private applyExplicitCardTypeFilter(rows: BrowserDeckSnapshotRow[], cardTypes?: string[]): BrowserDeckSnapshotRow[] {
    if (!cardTypes?.length) {
      return rows;
    }

    const normalized = new Set(cardTypes.map((value) => String(value || '').trim()).filter(Boolean));
    return rows.filter((row) => {
      if (normalized.has('missing-block-only') && isMissingBlockCard(row)) {
        return true;
      }
      if (normalized.has('item')) {
        if (!row.cardType || row.cardType === 'item') {
          return true;
        }
      }

      return normalized.has(String(row.cardType || '').trim());
    });
  }

  private applyDeckAndTagFilter(rows: BrowserDeckSnapshotRow[], query: BrowserDeckSnapshotQuery): BrowserDeckSnapshotRow[] {
    let result = rows;

    if (query.deckIds?.length) {
      const deckIdSet = new Set(query.deckIds.map((deckId) => String(deckId || '').trim()).filter(Boolean));
      result = result.filter((row) => deckIdSet.has(String(row.deckId || '').trim()));
    }

    if (query.tags?.length) {
      const requiredTags = query.tags.map((tag) => String(tag || '').trim()).filter(Boolean);
      result = result.filter((row) => {
        const rowTags = Array.isArray(row.tags) ? row.tags : [];
        return requiredTags.every((tag) => rowTags.includes(tag));
      });
    }

    return result;
  }

  private async loadAllCards(): Promise<FSRSCard[]> {
    return this.storageManager.queryCards({ states: ALL_CARD_QUERY_STATES });
  }

  private async loadAllCardsFromFallback(): Promise<FSRSCard[]> {
    return this.storageManager.getAllCards();
  }

  private shouldUsePureStructuredQueryPath(query: BrowserDeckSnapshotQuery): boolean {
    const simpleSearchText = this.resolveSimpleSearchText(query.searchText);
    return !simpleSearchText && !query.docId;
  }

  private async resolveCandidateCards(query: BrowserDeckSnapshotQuery): Promise<ResolvedCandidateCards> {
    const structuredQuery = this.buildStructuredQueryFromBrowserQuery(query);

    if (this.shouldUsePureStructuredQueryPath(query)) {
      if (!structuredQuery) {
        return {
          cards: await this.loadAllCards(),
          path: 'all-cards-query',
          sqlCandidateCount: null,
          usedFallback: false,
        };
      }

      return {
        cards: this.storageManager.queryCards(structuredQuery),
        path: 'structured-query',
        sqlCandidateCount: null,
        usedFallback: false,
      };
    }

    try {
      const sqlCandidateSets: string[][] = [];

      if (query.docId) {
        sqlCandidateSets.push(await this.loadBlockIdsByDocId(query.docId));
      }

      const simpleSearchText = this.resolveSimpleSearchText(query.searchText);
      if (simpleSearchText) {
        sqlCandidateSets.push(await this.loadBlockIdsBySearchText(simpleSearchText));
      }

      if (sqlCandidateSets.length > 0) {
        const sqlCandidateBlockIds = this.intersectBlockIdCandidateSets(sqlCandidateSets);
        if (sqlCandidateBlockIds.length === 0) {
          return {
            cards: [],
            path: 'sql-candidate-query',
            sqlCandidateCount: 0,
            usedFallback: false,
          };
        }

        return {
          cards: this.storageManager.queryCards({
            ...structuredQuery,
            blockIds: sqlCandidateBlockIds,
          }),
          path: 'sql-candidate-query',
          sqlCandidateCount: sqlCandidateBlockIds.length,
          usedFallback: false,
        };
      }

      if (structuredQuery) {
        return {
          cards: this.storageManager.queryCards(structuredQuery),
          path: 'structured-query',
          sqlCandidateCount: null,
          usedFallback: false,
        };
      }
    } catch (error) {
      logger.warn('SQL candidate prefilter failed, falling back to all-cards path', error);
      return {
        cards: await this.loadAllCardsFromFallback(),
        path: 'sql-fallback-getAllCards',
        sqlCandidateCount: null,
        usedFallback: true,
      };
    }

    return {
      cards: await this.loadAllCards(),
      path: 'all-cards-query',
      sqlCandidateCount: null,
      usedFallback: false,
    };
  }

  private buildStructuredQueryFromBrowserQuery(query: BrowserDeckSnapshotQuery): StructuredCardQuery | undefined {
    const structuredQuery: StructuredCardQuery = {};
    const stateFilters = this.resolveStructuredStates(query);
    if (stateFilters.length > 0) {
      structuredQuery.states = stateFilters;
    }

    const cardTypes = this.resolveStructuredCardTypes(query.cardTypes);
    if (cardTypes.length > 0) {
      structuredQuery.cardTypes = cardTypes;
    }

    if (query.preset === 'due') {
      structuredQuery.dueDate = {
        ...(structuredQuery.dueDate || {}),
        lte: Date.now(),
      };
    }

    if (query.preset === 'suspended') {
      structuredQuery.suspended = true;
    }

    if (
      !structuredQuery.cardTypes
      && !structuredQuery.states
      && !structuredQuery.dueDate
      && structuredQuery.suspended === undefined
    ) {
      return undefined;
    }

    return structuredQuery;
  }

  private resolveStructuredStates(query: BrowserDeckSnapshotQuery): number[] {
    const stateSet = new Set<number>((query.states || []).map((state) => Number(state)));

    switch (query.preset) {
      case 'new':
        stateSet.add(CardState.New);
        break;
      case 'learning':
        stateSet.add(CardState.Learning);
        break;
      case 'review':
        stateSet.add(CardState.Review);
        break;
      default:
        break;
    }

    return Array.from(stateSet);
  }

  private resolveStructuredCardTypes(cardTypes?: string[]): CardType[] {
    if (!cardTypes?.length) {
      return [];
    }

    return cardTypes
      .map((value) => String(value || '').trim())
      .filter((value): value is CardType => STRUCTURED_CARD_TYPES.has(value));
  }

  private calculateStats(cards: FSRSCard[]): BrowserStats {
    return {
      totalCards: cards.length,
      dueCards: this.cardScheduleService.countDueCards(cards),
      newCards: this.cardFilterService.countByState(cards, CardState.New),
      learningCards: this.cardFilterService.countByState(cards, CardState.Learning),
      reviewCards: this.cardFilterService.countByState(cards, CardState.Review),
      suspendedCards: cards.filter((card) => isCardDismissed(card)).length,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private ensureMetaObject(card: FSRSCard): Record<string, unknown> {
    if (!this.isRecord(card.meta)) {
      card.meta = {};
    }
    return card.meta as Record<string, unknown>;
  }

  private readMetaString(card: FSRSCard, key: string): string | undefined {
    if (!this.isRecord(card.meta)) {
      return undefined;
    }
    const value = card.meta[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private async loadBlockIdsByDocId(docId: string): Promise<string[]> {
    const normalizedDocId = this.escapeSqlString(docId.trim());
    if (!normalizedDocId) {
      return [];
    }

    const query = `
      SELECT id
      FROM blocks
      WHERE root_id = '${normalizedDocId}'
    `;

    const rows = await this.siyuanApi.sql<BlockIdRow>(query);
    return this.normalizeBlockIds(rows.map((row) => row.id));
  }

  private async loadBlockIdsBySearchText(searchText: string): Promise<string[]> {
    const keyword = this.escapeSqlString(searchText.trim());
    if (!keyword) {
      return [];
    }

    const query = `
      SELECT id
      FROM blocks
      WHERE content LIKE '%${keyword}%'
         OR id LIKE '%${keyword}%'
    `;

    const rows = await this.siyuanApi.sql<BlockIdRow>(query);
    return this.normalizeBlockIds(rows.map((row) => row.id));
  }

  private intersectBlockIdCandidateSets(candidateSets: string[][]): string[] {
    const normalizedSets = candidateSets
      .map((candidateSet) => this.normalizeBlockIds(candidateSet))
      .sort((left, right) => left.length - right.length);

    if (normalizedSets.length === 0) {
      return [];
    }

    let intersection = new Set(normalizedSets[0]);
    for (const candidateSet of normalizedSets.slice(1)) {
      const candidateIds = new Set(candidateSet);
      intersection = new Set([...intersection].filter((blockId) => candidateIds.has(blockId)));
      if (intersection.size === 0) {
        return [];
      }
    }

    return [...intersection];
  }

  private normalizeBlockIds(blockIds: string[]): string[] {
    return [...new Set(
      blockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean)
    )];
  }

  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private toSqlQuotedValues(values: string[]): string {
    return values
      .map((value) => `'${this.escapeSqlString(value)}'`)
      .join(',');
  }

  private async fillRootIds(cards: FSRSCard[]): Promise<void> {
    if (cards.length === 0) {
      return;
    }

    const blockIds = cards.map((card) => card.blockId);

    try {
      const BATCH_SIZE = 500;
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const idsStr = this.toSqlQuotedValues(batchIds);

        const query = `
          SELECT id, root_id
          FROM blocks
          WHERE id IN (${idsStr})
        `;

        const result = await this.siyuanApi.sql<RootIdRow>(query);
        const rootIdMap = new Map<string, string>();
        for (const row of result) {
          rootIdMap.set(row.id, row.root_id || '');
        }

        for (const card of cards) {
          const rootId = rootIdMap.get(card.blockId);
          if (rootId) {
            const meta = this.ensureMetaObject(card);
            meta.rootId = rootId;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to fill rootIds:', error);
    }
  }

  private async fillContentForSearch(cards: FSRSCard[]): Promise<void> {
    if (cards.length === 0) {
      return;
    }

    const cardsNeedingContent = cards.filter((card) => {
      const content = (card.meta?.content as string || '').trim();
      return !content;
    });

    if (cardsNeedingContent.length === 0) {
      return;
    }

    const blockIds = cardsNeedingContent.map((card) => card.blockId);

    try {
      const BATCH_SIZE = 500;
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const idsStr = this.toSqlQuotedValues(batchIds);

        const query = `
          SELECT id, content
          FROM blocks
          WHERE id IN (${idsStr})
        `;

        const result = await this.siyuanApi.sql<ContentRow>(query);
        const contentMap = new Map<string, string>();
        for (const row of result) {
          contentMap.set(row.id, row.content || '');
        }

        for (const card of cardsNeedingContent) {
          const content = contentMap.get(card.blockId);
          if (content) {
            const meta = this.ensureMetaObject(card);
            meta.content = content;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to fill content:', error);
    }
  }

  private async transformToBrowserCards(cards: FSRSCard[]): Promise<BrowserCard[]> {
    if (cards.length === 0) {
      return [];
    }

    const blockIds = cards.map((card) => card.blockId);
    const { attrsMap, rootIdMap, tagsMap, contentMap } = await this.fetchBlockInfoBatched(blockIds);

    return cards.map((card) => {
      const customAttrs = attrsMap.get(card.blockId) || {};
      const browserCard = this.transformFSRSCard(card, customAttrs);
      browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
      browserCard.tags = tagsMap.get(card.blockId) || [];

      const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
      const dbContent = contentMap.get(card.blockId);
      if (!currentContent && dbContent) {
        browserCard.fullContent = dbContent;
        browserCard.content = truncateContent(dbContent, 100);
      }

      return browserCard;
    });
  }

  private async fetchBlockInfoBatched(
    blockIds: string[]
  ): Promise<{
    attrsMap: Map<string, Record<string, string>>;
    rootIdMap: Map<string, string>;
    tagsMap: Map<string, string[]>;
    contentMap: Map<string, string>;
  }> {
    if (blockIds.length === 0) {
      return {
        attrsMap: new Map(),
        rootIdMap: new Map(),
        tagsMap: new Map(),
        contentMap: new Map(),
      };
    }

    const attrsMap = new Map<string, Record<string, string>>();
    const rootIdMap = new Map<string, string>();
    const tagsMap = new Map<string, string[]>();
    const contentMap = new Map<string, string>();

    try {
      const BATCH_SIZE = 500;
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const idsStr = this.toSqlQuotedValues(batchIds);

        const query = `
          SELECT
            b.id,
            b.root_id,
            b.content,
            GROUP_CONCAT(a.name || '=' || a.value, '|||') as attrs
          FROM blocks b
          LEFT JOIN attributes a ON b.id = a.block_id
          WHERE b.id IN (${idsStr})
          GROUP BY b.id
        `;

        const result = await this.siyuanApi.sql<BlockInfoRow>(query);

        for (const row of result) {
          const blockId = row.id;
          rootIdMap.set(blockId, row.root_id || '');
          contentMap.set(blockId, row.content || '');

          const attrs: Record<string, string> = {};
          if (row.attrs) {
            const attrPairs = row.attrs.split('|||');
            for (const pair of attrPairs) {
              const [name, value] = pair.split('=');
              if (name && value !== undefined) {
                attrs[name] = value;
              }
            }
          }
          attrsMap.set(blockId, attrs);

          const tags: string[] = [];
          const tagRegex = /#([^\s#]+)/g;
          let match: RegExpExecArray | null;
          while ((match = tagRegex.exec(row.content || '')) !== null) {
            tags.push(match[1]);
          }
          tagsMap.set(blockId, tags);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch block info:', error);
    }

    return { attrsMap, rootIdMap, tagsMap, contentMap };
  }

  private shouldHydrateContentForQuery(query: BrowserDeckSnapshotQuery): boolean {
    const normalizedSearch = String(query.searchText || '').trim();
    if (normalizedSearch) {
      const parsed = parseQuery(normalizedSearch);
      if (parsed.text) {
        return true;
      }
    }

    return (query.sortModel || []).some((sort) => {
      const colId = String(sort?.colId || '').trim();
      return colId === 'content' || colId === 'fullContent';
    });
  }

  private resolveSimpleSearchText(searchText?: string): string | null {
    const query = String(searchText || '').trim();
    if (!query) {
      return null;
    }

    const lower = query.toLowerCase();
    if (
      lower.startsWith('tag:')
      || lower.startsWith('deck:')
      || lower.startsWith('state:')
      || lower.startsWith('doc:')
    ) {
      return null;
    }

    const parsed = parseQuery(query);
    return parsed.text ? query : null;
  }

  private resolveCardById(id: string): FSRSCard | undefined {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return undefined;
    }

    return this.snapshotCardCache.get(normalizedId)
      || this.storageManager.getCard(normalizedId)
      || this.storageManager.getCardByBlockId?.(normalizedId);
  }
}
