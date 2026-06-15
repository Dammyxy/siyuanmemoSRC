import type { SortModel } from '@/application/interfaces/ICardDataSource';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService, CardState } from '@/core/card/domain/services/CardScheduleService';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { batchDetectCardType } from '@/core/card-builder/detectCardType';
import type { BrowserCardStoragePort } from '@/core/storage/ports';
import type { FSRSCard } from '@/types';
import type { CardType } from '@/types/card';
import { ALL_CARD_QUERY_STATES, type StructuredCardQuery } from '@/types/card-query';
import {
  type BrowserCard,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  resolveBrowserCardStableId,
  resolveBrowserCardFullContent,
  STATE_LABELS,
  truncateContent,
  parseQuery,
} from '@/types/browser';
import { createLogger } from '@/utils/logger';
import {
  applyDeckPresetFilter,
  applyDocFilter,
  applyExplicitCardTypesFilter,
  applySimpleQueryFilter,
  sortBrowserRows,
} from './BrowserRowUtils';
import { BrowserDeckBlockQuerySource } from './BrowserDeckBlockQuerySource';
import type { BrowserStats, PresetFilter } from '../GetBrowserCardsQuery';
import type {
  BrowserDeckLiteRow,
  BrowserDeckSnapshotQuery,
  BrowserDeckSnapshotResult,
} from '../browser-deck-query';
import { applyBrowserCdfDiagnosticVisibility } from './CdfBrowserDiagnostics';

const logger = createLogger('BrowserDeckQueryKernel');

interface ResolvedCandidateCards {
  cards: FSRSCard[];
  path: 'all-cards-query' | 'structured-query' | 'sql-candidate-query';
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
    private readonly blockQuerySource: BrowserDeckBlockQuerySource,
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
      await this.blockQuerySource.hydrateContentForSearch(candidateCards);
    }
    if (query.docId || query.scopeDocIds?.length) {
      await this.blockQuerySource.hydrateMissingRootIds(candidateCards.filter((card) => !this.readMetaString(card, 'rootId')));
    }

    let rows = await this.buildSnapshotRows(candidateCards);
    if (candidateResolution.path !== 'sql-candidate-query') {
      rows = await this.blockQuerySource.markMissingBlockRows(rows);
    }
    rows = applyBrowserCdfDiagnosticVisibility(rows, query.preset);
    rows = applyDocFilter(rows, query.docId, query.scopeDocIds);
    rows = applyDeckPresetFilter(rows, query.preset);
    rows = this.applyExplicitStateFilter(rows, query.states);
    rows = applyExplicitCardTypesFilter(rows, query.cardTypes);
    rows = applySimpleQueryFilter(rows, query.searchText, { secondaryField: 'fullContent' });
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
    const lostCards = await this.blockQuerySource.countMissingBlockCards(allCards);
    return this.calculateStats(allCards, lostCards);
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

    const browserCards = await this.blockQuerySource.markMissingBlockRows(
      await this.transformToBrowserCards(cards),
    );
    const rowById = new Map<string, BrowserCard>();
    for (const row of browserCards) {
      rowById.set(resolveBrowserCardStableId(row), row);
    }

    return orderedIds
      .map((id) => rowById.get(id))
      .filter((row): row is BrowserCard => Boolean(row));
  }

  async getBrowserCardsFromCards(
    cards: FSRSCard[],
    options: { markMissing?: boolean } = {},
  ): Promise<BrowserCard[]> {
    const browserCards = await this.transformToBrowserCards(cards);
    if (options.markMissing === false) {
      return browserCards;
    }
    return this.blockQuerySource.markMissingBlockRows(browserCards);
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

    const fullContent = resolveBrowserCardFullContent({ meta: card.meta });
    const content = truncateContent(fullContent, 100);

    const deckId = (card.meta?.deckId as string) || '';
    const rootId = (card.meta?.rootId as string) || '';

    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
      const finalCardType = cardType || customAttrs[this.blockQuerySource.ATTR_CARD_TYPE];

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
    const fullContent = resolveBrowserCardFullContent({ meta: card.meta });
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

  private applyExplicitStateFilter(rows: BrowserDeckSnapshotRow[], states?: CardState[]): BrowserDeckSnapshotRow[] {
    if (!states?.length) {
      return rows;
    }

    const stateSet = new Set(states.map((state) => Number(state)));
    return rows.filter((row) => stateSet.has(Number(row.state)));
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

  private shouldUsePureStructuredQueryPath(query: BrowserDeckSnapshotQuery): boolean {
    const simpleSearchText = this.resolveSimpleSearchText(query.searchText);
    return !simpleSearchText && !query.docId && !(query.scopeDocIds?.length);
  }

  private async resolveCandidateCards(query: BrowserDeckSnapshotQuery): Promise<ResolvedCandidateCards> {
    const structuredQuery = this.buildStructuredQueryFromBrowserQuery(query);
    const isMissingBlockScope = String(query.docId || '').trim() === '__lost__';

    if (isMissingBlockScope) {
      if (structuredQuery) {
        return {
          cards: this.storageManager.queryCards(structuredQuery),
          path: 'structured-query',
          sqlCandidateCount: null,
          usedFallback: false,
        };
      }

      return {
        cards: await this.loadAllCards(),
        path: 'all-cards-query',
        sqlCandidateCount: null,
        usedFallback: false,
      };
    }

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

      if (query.scopeDocIds?.length) {
        sqlCandidateSets.push(await this.blockQuerySource.loadBlockIdsByDocIds(query.scopeDocIds));
      }

      if (query.docId) {
        sqlCandidateSets.push(await this.blockQuerySource.loadBlockIdsByDocId(query.docId));
      }

      const simpleSearchText = this.resolveSimpleSearchText(query.searchText);
      if (simpleSearchText) {
        sqlCandidateSets.push(await this.blockQuerySource.loadBlockIdsBySearchText(simpleSearchText));
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
      logger.warn('SQL candidate prefilter failed, using structured/all-cards query path', error);
      if (structuredQuery) {
        return {
          cards: this.storageManager.queryCards(structuredQuery),
          path: 'structured-query',
          sqlCandidateCount: null,
          usedFallback: false,
        };
      }
      return {
        cards: await this.loadAllCards(),
        path: 'all-cards-query',
        sqlCandidateCount: null,
        usedFallback: false,
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

  private calculateStats(cards: FSRSCard[], lostCards = 0): BrowserStats {
    return {
      totalCards: cards.length,
      dueCards: this.cardScheduleService.countDueCards(cards),
      newCards: this.cardFilterService.countByState(cards, CardState.New),
      learningCards: this.cardFilterService.countByState(cards, CardState.Learning),
      reviewCards: this.cardFilterService.countByState(cards, CardState.Review),
      suspendedCards: cards.filter((card) => isCardDismissed(card)).length,
      lostCards,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readMetaString(card: FSRSCard, key: string): string | undefined {
    if (!this.isRecord(card.meta)) {
      return undefined;
    }
    const value = card.meta[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private intersectBlockIdCandidateSets(candidateSets: string[][]): string[] {
    const normalizeBlockIds = (blockIds: string[]) => Array.from(new Set(
      blockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean),
    ));

    const normalizedSets = candidateSets
      .map(normalizeBlockIds)
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

  private async transformToBrowserCards(cards: FSRSCard[]): Promise<BrowserCard[]> {
    if (cards.length === 0) {
      return [];
    }

    const blockIds = Array.from(new Set(
      cards.flatMap((card) => [
        String(card.blockId || '').trim(),
        String(card.riffCardId || '').trim(),
      ].filter(Boolean)),
    ));
    const { attrsMap, rootIdMap, tagsMap, contentMap } = await this.blockQuerySource.loadBlockInfoByIds(blockIds);

    return cards.map((card) => {
      const sourceIds = [
        String(card.blockId || '').trim(),
        String(card.riffCardId || '').trim(),
      ].filter(Boolean);
      const primaryId = sourceIds[0] || String(card.blockId || '').trim();
      const fallbackId = sourceIds[1] || '';
      const customAttrs = attrsMap.get(primaryId) || (fallbackId ? attrsMap.get(fallbackId) || {} : {});
      const browserCard = this.transformFSRSCard(card, customAttrs);
      const rootId = rootIdMap.get(primaryId) || (fallbackId ? rootIdMap.get(fallbackId) || '' : '');
      const tags = tagsMap.get(primaryId) || (fallbackId ? tagsMap.get(fallbackId) || [] : []);
      browserCard.rootId = rootId || browserCard.rootId || '';
      browserCard.tags = tags;

      const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
      const dbContent = contentMap.get(primaryId) || (fallbackId ? contentMap.get(fallbackId) || '' : '');
      if (!currentContent && dbContent) {
        browserCard.fullContent = dbContent;
        browserCard.content = truncateContent(dbContent, 100);
        browserCard.meta = {
          ...(browserCard.meta || {}),
          content: dbContent,
          rootId: browserCard.rootId || undefined,
        };
      }

      return browserCard;
    });
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
