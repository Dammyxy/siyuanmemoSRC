import type { BrowserCard } from '../types';
import {
  CardState,
  STATE_LABELS,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
} from '../types';
import {
  batchReset,
  batchSuspend,
  invalidateCardCache,
  loadBrowserCardProjectionsByBlockIds,
  runBrowserSql,
  type BrowserCardProjection,
} from '../browserService';
import type {
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  BrowserActionTarget,
  FetchRowsOptions,
  FetchRowsResult,
  SortModel,
} from './types';
import {
  deleteBrowserCards,
  setBrowserCardsPriority,
  sortBrowserRows,
} from './DataSourceUtils';
import { BrowserQuerySession } from './session/BrowserQuerySession';
import { resolveBrowserCardStableId } from '../utils/browserCardIdentity';
import {
  addToQueue,
  adjustTime,
  buildAddToQueueAction,
  getBaseActions,
  QUEUE_ADD_ROUTES,
  type PluginLike as MenuActionPluginLike,
  type QueueAddRoute,
} from './MenuActions';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueryDataSource');

type SqlRowLike = {
  id?: unknown;
  block_id?: unknown;
  blockId?: unknown;
};

type QueryActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type I18nContextLike = {
  getI18n?: () => Record<string, string> | undefined;
};

type BrowserServiceContextLike = {
  getBrowserService?: () => { getSiyuanApi?: () => BrowserSiyuanPort | undefined } | null | undefined;
};

type QueryPluginLike = Omit<MenuActionPluginLike, 'context' | 'getContext'> & {
  context?: NonNullable<MenuActionPluginLike['context']> & I18nContextLike & BrowserServiceContextLike;
  getContext?: () => (NonNullable<MenuActionPluginLike['context']> & I18nContextLike & BrowserServiceContextLike) | undefined;
  i18n?: Record<string, string>;
};

type QueryDataSourceBatchManager = {
  getCards: IUnifiedDataSourceManagerFacade['getCards'];
  updateCard: IUnifiedDataSourceManagerFacade['updateCard'];
  deleteCard: (cardId: string) => Promise<void>;
};

export type QueryDataSourceOptions = {
  manager?: IUnifiedDataSourceManagerFacade | null;
  plugin?: QueryPluginLike;
  siyuanApi?: BrowserSiyuanPort | null;
};

function isRescheduleAction(actionId: string): actionId is 'postpone' | 'advance' | 'spread' {
  return actionId === 'postpone' || actionId === 'advance' || actionId === 'spread';
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSqlRows(raw: unknown): SqlRowLike[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isObjectLike) as SqlRowLike[];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readBlockId(row: SqlRowLike): string {
  return readString(row.id || row.block_id || row.blockId);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function readNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  const normalized = readString(value).trim();
  return normalized || undefined;
}

function readTags(value: unknown, fallback?: string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag || '').trim()).filter(Boolean);
  }
  return fallback ? [...fallback] : [];
}

function readCardType(value: unknown): BrowserCardProjection['cardType'] {
  const normalized = readOptionalString(value);
  if (
    normalized === 'topic' ||
    normalized === 'item' ||
    normalized === 'concept' ||
    normalized === 'descriptor' ||
    normalized === 'incremental' ||
    normalized === 'webpage'
  ) {
    return normalized;
  }
  return undefined;
}

function groupCardsByBlockId(cards: FSRSCard[]): Map<string, FSRSCard[]> {
  const grouped = new Map<string, FSRSCard[]>();
  for (const card of cards) {
    const blockId = readString(card.blockId).trim();
    const cardId = readString(card.id).trim();
    if (!blockId || !cardId) {
      continue;
    }
    const group = grouped.get(blockId);
    if (group) {
      group.push(card);
    } else {
      grouped.set(blockId, [card]);
    }
  }
  return grouped;
}

/**
 * QueryDataSource - SQL 查询数据源实现
 */
export class QueryDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'query';
  label = 'Query';

  private readonly stmt: string;
  private readonly manager: IUnifiedDataSourceManagerFacade | null;
  private readonly plugin?: QueryPluginLike;
  private readonly siyuanApi: BrowserSiyuanPort | null;
  private readonly querySession = new BrowserQuerySession('QueryDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;
  private liteRowBlockIdById = new Map<string, string>();
  private liteRowFsrsCardIdById = new Map<string, string>();
  private liteRowProjectionById = new Map<string, BrowserCardProjection>();

  constructor(stmt: string, options: QueryDataSourceOptions = {}) {
    this.stmt = stmt;
    this.manager = options.manager ?? null;
    this.plugin = options.plugin;
    this.siyuanApi = options.siyuanApi ?? null;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const sortModel = (params?.sortModel || []) as SortModel[];
    this.lastSortModel = [...sortModel];
    return this.querySession.fetchRows({
      ...this.buildSessionOptions(sortModel),
      startRow: params?.startRow,
      endRow: params?.endRow,
    });
  }

  getQueryFingerprint(): string {
    return this.buildQueryFingerprint(this.lastSortModel);
  }

  async getAllMatchedIds(): Promise<string[]> {
    return this.querySession.getAllMatchedIds(this.buildSessionOptions(this.lastSortModel));
  }

  async getRowsByIds(ids: string[]): Promise<BrowserCard[]> {
    return this.querySession.getRowsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  async getActionTargetsByIds(ids: string[]): Promise<BrowserActionTarget[]> {
    return this.querySession.getActionTargetsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
    this.liteRowBlockIdById.clear();
    this.liteRowFsrsCardIdById.clear();
    this.liteRowProjectionById.clear();
    this.querySession.invalidate();
  }

  getSupportedActions(): CardBrowserAction[] {
    const baseActions = getBaseActions((key, fallback) => this.t(key, fallback));
    const actions: CardBrowserAction[] = [baseActions.open];

    if (!this.manager) {
      return actions;
    }

    actions.push(baseActions.deleteCard);

    const addToQueueAction = buildAddToQueueAction({
      retrieval: true,
      incremental: true,
      finalDrill: true,
      filterGroup: true,
      neuralRoam: true,
    }, (key, fallback) => this.t(key, fallback));
    if (addToQueueAction) {
      actions.push(addToQueueAction);
    }

    actions.push(
      baseActions.setPriority,
      baseActions.postpone,
      baseActions.advance,
      baseActions.spread,
      baseActions.reset,
      baseActions.suspend,
      baseActions.unsuspend,
    );

    return actions;
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserActionTarget[],
    context?: QueryActionContext
  ): Promise<unknown> {
    if (actionId === 'open') return;

    if (!this.manager) {
      throw new Error('QueryDataSource actions require UnifiedDataSourceManager');
    }

    if (actionId === 'delete-card') {
      return this.handleDeleteCards(selectedRows);
    }

    const queueRoute = QUEUE_ADD_ROUTES[actionId];
    if (queueRoute) {
      return this.handleQueueAddAction(queueRoute, selectedRows);
    }

    if (actionId === 'set-priority') {
      return this.handleSetPriority(selectedRows, context);
    }

    if (actionId === 'reset') {
      const blockIds = selectedRows.map((row) => row.blockId).filter(Boolean);
      const updated = await batchReset(blockIds, this.createBatchManager());
      this.invalidateQuerySession();
      return {
        updated,
        skipped: Math.max(0, selectedRows.length - updated),
      };
    }

    if (actionId === 'suspend' || actionId === 'unsuspend') {
      const blockIds = selectedRows.map((row) => row.blockId).filter(Boolean);
      const updated = await batchSuspend(blockIds, actionId === 'suspend', this.createBatchManager());
      this.invalidateQuerySession();
      return {
        updated,
        skipped: Math.max(0, selectedRows.length - updated),
      };
    }

    if (isRescheduleAction(actionId)) {
      const result = await adjustTime(this.plugin, selectedRows, actionId, context);
      if (!result) {
        throw new Error('RescheduleService unavailable');
      }
      this.invalidateQuerySession();
      return result;
    }

    logger.warn('Unknown action for QueryDataSource', { actionId });
  }

  getId(): string {
    return this.id;
  }

  private async handleDeleteCards(selectedRows: BrowserActionTarget[]): Promise<{ updated: number; skipped: number }> {
    const deletion = await deleteBrowserCards(this.manager ?? undefined, selectedRows, {
      scope: 'QueryDataSource',
    });
    if (deletion.failedCardIds.length > 0) {
      logger.error('Failed to delete partial SQL result cards', { failedCardIds: deletion.failedCardIds });
    }

    invalidateCardCache();
    this.invalidateQuerySession();
    return {
      updated: deletion.deletedCount,
      skipped: deletion.failedCardIds.length,
    };
  }

  private async handleQueueAddAction(route: QueueAddRoute, selectedRows: BrowserActionTarget[]): Promise<unknown> {
    const queue = this.manager?.getQueue(route.queueType);
    const result = await addToQueue(queue, selectedRows, route.actionType, route.source ?? 'manual');
    this.invalidateQuerySession();
    return result;
  }

  private async handleSetPriority(selectedRows: BrowserActionTarget[], context?: QueryActionContext): Promise<unknown> {
    const result = await setBrowserCardsPriority(this.manager!, selectedRows, this.resolvePriority(context?.priority), {
      scope: 'QueryDataSource',
    });

    invalidateCardCache();
    this.invalidateQuerySession();
    return result;
  }

  private resolvePriority(priority: unknown): number {
    const value = Number(priority);
    if (!Number.isFinite(value)) {
      return 50;
    }
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  private createBatchManager(): QueryDataSourceBatchManager {
    return {
      getCards: (filter) => this.manager!.getCards(filter),
      updateCard: (card: FSRSCard) => this.manager!.updateCard(card),
      deleteCard: async (cardId: string) => {
        if (typeof this.manager!.deleteCard !== 'function') {
          throw new Error('UnifiedDataSourceManager.deleteCard is unavailable');
        }
        await this.manager!.deleteCard(cardId);
      },
    };
  }

  private hasI18nContext(value: unknown): value is I18nContextLike {
    return typeof value === 'object' && value !== null && 'getI18n' in value;
  }

  private t(key: string, fallback: string): string {
    const context = this.plugin?.getContext?.();
    if (this.hasI18nContext(context)) {
      const i18n = context.getI18n?.();
      if (i18n?.[key]) {
        return i18n[key];
      }
    }

    return this.plugin?.i18n?.[key] || fallback;
  }

  private resolveSiyuanApi(): BrowserSiyuanPort | null {
    return this.siyuanApi
      ?? this.plugin?.getContext?.()?.getBrowserService?.()?.getSiyuanApi?.()
      ?? null;
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: 'query',
      stmt: this.stmt,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async loadRealCardsByBlockIds(blockIds: string[]): Promise<FSRSCard[]> {
    const uniqueBlockIds = uniqueStrings(blockIds);
    if (uniqueBlockIds.length === 0) {
      return [];
    }

    if (!this.manager) {
      logger.warn('SQL browser query skipped because UnifiedDataSourceManager is unavailable');
      return [];
    }

    return this.manager.getCards({ blockIds: uniqueBlockIds });
  }

  private async loadProjectionTemplatesByBlockId(
    blockIds: string[],
    siyuanApi: BrowserSiyuanPort,
  ): Promise<Map<string, BrowserCardProjection[]>> {
    const uniqueBlockIds = uniqueStrings(blockIds);
    const templates = new Map<string, BrowserCardProjection[]>();
    if (uniqueBlockIds.length === 0) {
      return templates;
    }

    const projections = await loadBrowserCardProjectionsByBlockIds(uniqueBlockIds, {
      applyQueryFilter: false,
      manager: this.manager || undefined,
      siyuanApi,
    });
    for (const projection of projections) {
      const blockId = readString(projection.blockId).trim();
      if (!blockId) {
        continue;
      }
      const group = templates.get(blockId);
      if (group) {
        group.push(projection);
      } else {
        templates.set(blockId, [projection]);
      }
    }
    return templates;
  }

  private selectTemplateForCard(
    card: FSRSCard,
    templatesByBlockId: Map<string, BrowserCardProjection[]>
  ): BrowserCardProjection | undefined {
    const blockTemplates = templatesByBlockId.get(readString(card.blockId).trim()) || [];
    const cardId = readString(card.id).trim();
    return blockTemplates.find((template) => {
      return readString(template.fsrsCardId || template.id).trim() === cardId;
    }) || blockTemplates[0];
  }

  private toBrowserCardProjectionFromFSRSCard(
    card: FSRSCard,
    template?: BrowserCardProjection
  ): BrowserCardProjection {
    const now = Date.now();
    const lastReviewTimestamp = readNumber(card.lastReview);
    const lastReview = lastReviewTimestamp > 0 ? new Date(lastReviewTimestamp) : null;
    const elapsedDays = lastReview
      ? Math.floor((now - lastReview.getTime()) / 86400000)
      : readNumber(card.elapsedDays);
    const due = new Date(readNumber(card.due, now));
    const stability = readNumber(card.stability);
    const state = readNumber(card.state, CardState.New) as CardState;
    const scheduledDays = readNumber(card.scheduledDays);
    const firstReviewTimestamp = readNumber(card.createdAt);
    const firstReview = readNumber(card.reps) > 0
      ? firstReviewTimestamp > 0
        ? new Date(firstReviewTimestamp)
        : lastReview
      : null;
    const meta = isObjectLike(card.meta) ? card.meta : {};
    const templateContent = readString(template?.fullContent || template?.content);
    const fullContent = readOptionalString(meta.content) || templateContent;
    const priority = readNumber(card.priority, template?.priority ?? 50);
    const skipUntil = readNumber(card.skipUntil);

    return {
      id: readString(card.id).trim(),
      fsrsCardId: readString(card.id).trim(),
      blockId: readString(card.blockId).trim(),
      deckId: readOptionalString(meta.deckId) || template?.deckId || '',
      content: truncateContent(fullContent, 100),
      fullContent,
      rootId: readOptionalString(meta.rootId) || template?.rootId || '',
      state,
      stateLabel: STATE_LABELS[state] || template?.stateLabel || '未知',
      due,
      dueFormatted: formatDueDate(due),
      stability,
      difficulty: readNumber(card.difficulty),
      retrievability: calculateRetrievability(stability, elapsedDays),
      reps: readNumber(card.reps),
      lapses: readNumber(card.lapses),
      elapsedDays,
      scheduledDays,
      lastReview,
      lastReviewFormatted: formatHistoryDate(lastReview),
      interval: scheduledDays,
      firstReview,
      firstReviewFormatted: formatHistoryDate(firstReview),
      priority,
      suspended: Boolean(card.skipped || (skipUntil > 0 && skipUntil > now) || template?.suspended),
      tags: readTags(card.tags, template?.tags),
      cardType: readCardType(card.type) || template?.cardType,
      aFactor: card.aFactor ?? template?.aFactor,
    };
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCardProjection[]> {
    const siyuanApi = this.resolveSiyuanApi();
    if (!siyuanApi) {
      logger.error('QueryDataSource requires BrowserSiyuanPort for SQL mode');
      return [];
    }
    const rawRows = toSqlRows(await runBrowserSql(this.stmt, siyuanApi));
    const sqlBlockIds = rawRows.map(readBlockId).filter(Boolean);
    const realCards = await this.loadRealCardsByBlockIds(sqlBlockIds);
    const cardsByBlockId = groupCardsByBlockId(realCards);
    const realBlockIds = Array.from(cardsByBlockId.keys());
    const templatesByBlockId = await this.loadProjectionTemplatesByBlockId(realBlockIds, siyuanApi);

    const rows: BrowserCardProjection[] = [];
    const seenCardIds = new Set<string>();
    for (const rawRow of rawRows) {
      const blockId = readBlockId(rawRow);
      const realCardsForBlock = blockId ? cardsByBlockId.get(blockId) || [] : [];
      for (const card of realCardsForBlock) {
        const cardId = readString(card.id).trim();
        if (!cardId || seenCardIds.has(cardId)) {
          continue;
        }
        const template = this.selectTemplateForCard(card, templatesByBlockId);
        rows.push(this.toBrowserCardProjectionFromFSRSCard(card, template));
        seenCardIds.add(cardId);
      }
    }

    return sortBrowserRows(rows, sortModel);
  }

  private buildSessionOptions(sortModel: SortModel[]) {
    return {
      queryFingerprint: this.buildQueryFingerprint(sortModel),
      buildLiteRows: async () => {
        const rows = await this.buildOrderedRows(sortModel);
        this.liteRowBlockIdById.clear();
        this.liteRowFsrsCardIdById.clear();
        this.liteRowProjectionById.clear();
        return rows.map((row) => {
          const id = resolveBrowserCardStableId(row as BrowserCard);
          this.liteRowBlockIdById.set(id, row.blockId);
          const fsrsCardId = row.fsrsCardId ? String(row.fsrsCardId) : String(row.id || '');
          if (fsrsCardId) {
            this.liteRowFsrsCardIdById.set(id, fsrsCardId);
          }
          this.liteRowProjectionById.set(id, row);
          return {
            id,
            blockId: row.blockId,
            fsrsCardId: fsrsCardId || undefined,
            actionTarget: {
              id: String(row.id || ''),
              blockId: row.blockId,
              fsrsCardId: fsrsCardId || undefined,
              cardType: row.cardType,
              priority: typeof row.priority === 'number' ? row.priority : undefined,
            },
          };
        });
      },
      hydrateRows: async (ids: string[]) => {
        const blockIds = ids
          .map((id) => this.liteRowBlockIdById.get(id))
          .filter((blockId): blockId is string => Boolean(blockId));
        const realCards = await this.loadRealCardsByBlockIds(blockIds);
        const cardById = new Map(realCards.map((card) => [readString(card.id).trim(), card]));
        return ids
          .map((id) => {
            const expectedCardId = this.liteRowFsrsCardIdById.get(id);
            if (!expectedCardId) {
              return undefined;
            }
            const card = cardById.get(expectedCardId);
            if (!card) {
              return undefined;
            }
            const template = this.liteRowProjectionById.get(id);
            return this.toBrowserCardProjectionFromFSRSCard(card, template) as BrowserCard;
          })
          .filter((row): row is BrowserCard => Boolean(row));
      },
    };
  }
}
