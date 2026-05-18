import type { BrowserCard } from '../types';
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
  adjustBrowserCardsPriorityRelative,
  deleteBrowserCards,
  setBrowserCardsPriority,
  sortBrowserRows,
} from './DataSourceUtils';
import { getRelativePriorityDelta } from '../browserActionFeedback';
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
import { resolveBrowserCardFullContent } from '@/types/browser';
import {
  buildTemplateBackedBrowserRowFromCard,
} from '@/types/memory-content-payload-seam';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueryDataSource');
const CARD_UNIVERSE_UNAVAILABLE_MESSAGE = 'SRS_BROWSER_CARD_UNIVERSE_UNAVAILABLE: UnifiedDataSourceManager required for SQL card-universe scoping';
const SQL_BACKEND_UNAVAILABLE_MESSAGE = 'BACKEND_UNAVAILABLE: Browser Siyuan API required for SQL mode';

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
  batchUpdateCards?: IUnifiedDataSourceManagerFacade['batchUpdateCards'];
  batchDeleteCards?: IUnifiedDataSourceManagerFacade['batchDeleteCards'];
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
      baseActions.priorityPlus10,
      baseActions.priorityMinus10,
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

    const relativePriorityDelta = getRelativePriorityDelta(actionId);
    if (relativePriorityDelta != null) {
      return this.handleAdjustPriorityRelative(selectedRows, relativePriorityDelta);
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
    const queueTarget = this.manager && typeof this.manager.batchAddToQueue === 'function'
      ? {
          addCards: (
            cards: unknown[],
            source?: Parameters<NonNullable<IUnifiedDataSourceManagerFacade['batchAddToQueue']>>[2]
          ) => this.manager!.batchAddToQueue!(
            route.queueType,
            cards as Parameters<NonNullable<IUnifiedDataSourceManagerFacade['batchAddToQueue']>>[1],
            source
          ),
        }
      : this.manager?.getQueue(route.queueType);
    const result = await addToQueue(queueTarget, selectedRows, route.actionType, route.source ?? 'manual');
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

  private async handleAdjustPriorityRelative(selectedRows: BrowserActionTarget[], delta: number): Promise<unknown> {
    const result = await adjustBrowserCardsPriorityRelative(this.manager!, selectedRows, delta, {
      scope: 'QueryDataSource',
    });

    invalidateCardCache();
    this.invalidateQuerySession();
    return {
      ...result,
      updated: result.updated.length,
      skipped: result.skipped.length,
    };
  }

  private resolvePriority(priority: unknown): number {
    const value = Number(priority);
    if (!Number.isFinite(value)) {
      return 50;
    }
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  private createBatchManager(): QueryDataSourceBatchManager {
    const batchManager: QueryDataSourceBatchManager = {
      getCards: (filter) => this.manager!.getCards(filter),
      updateCard: (card: FSRSCard) => this.manager!.updateCard(card),
      deleteCard: async (cardId: string) => {
        if (typeof this.manager!.deleteCard !== 'function') {
          throw new Error('UnifiedDataSourceManager.deleteCard is unavailable');
        }
        await this.manager!.deleteCard(cardId);
      },
    };
    if (typeof this.manager!.batchUpdateCards === 'function') {
      batchManager.batchUpdateCards = (cards) => this.manager!.batchUpdateCards!(cards);
    }
    if (typeof this.manager!.batchDeleteCards === 'function') {
      batchManager.batchDeleteCards = (cardIds, options) => this.manager!.batchDeleteCards!(cardIds, options);
    }
    return batchManager;
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
      logger.warn('SQL browser query unavailable because UnifiedDataSourceManager is unavailable');
      throw new Error(CARD_UNIVERSE_UNAVAILABLE_MESSAGE);
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
      manager: this.manager as unknown as NonNullable<Parameters<typeof loadBrowserCardProjectionsByBlockIds>[1]>['manager'],
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
    const meta = isObjectLike(card.meta) ? card.meta : {};
    const templateContent = readString(template?.fullContent || template?.content);
    const fullContent = resolveBrowserCardFullContent({
      meta,
      content: templateContent,
    });
    const priority = readNumber(card.priority, template?.priority ?? 50);
    const skipUntil = readNumber(card.skipUntil);
    return buildTemplateBackedBrowserRowFromCard({
      card,
      template,
      now,
      suspended: Boolean(card.skipped || (skipUntil > 0 && skipUntil > now) || template?.suspended),
      aFactor: card.aFactor ?? template?.aFactor,
      blockId: readString(card.blockId).trim(),
      deckId: readOptionalString(meta.deckId) || template?.deckId || '',
      rootId: readOptionalString(meta.rootId) || template?.rootId || '',
      fullContent,
      tags: readTags(card.tags, template?.tags),
      priority,
      cardType: readCardType(card.type) || template?.cardType,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCardProjection[]> {
    const siyuanApi = this.resolveSiyuanApi();
    if (!siyuanApi) {
      logger.error('QueryDataSource requires BrowserSiyuanPort for SQL mode');
      throw new Error(SQL_BACKEND_UNAVAILABLE_MESSAGE);
    }
    if (!this.manager) {
      logger.warn('SQL browser query unavailable because Browser Card Universe resolver is unavailable');
      throw new Error(CARD_UNIVERSE_UNAVAILABLE_MESSAGE);
    }
    const rawRows = toSqlRows(await runBrowserSql(this.stmt, siyuanApi));
    const sqlBlockIds = rawRows.map(readBlockId).filter(Boolean);
    const realCards = await this.loadRealCardsByBlockIds(sqlBlockIds);
    const cardsByBlockId = groupCardsByBlockId(realCards);
    const realBlockIds = Array.from(cardsByBlockId.keys());
    const uniqueSqlBlockCount = uniqueStrings(sqlBlockIds).length;
    const excludedBlockCount = Math.max(0, uniqueSqlBlockCount - realBlockIds.length);
    if (excludedBlockCount > 0) {
      logger.info('SQL browser query scoped to Browser Card Universe', {
        candidateBlockCount: uniqueSqlBlockCount,
        retainedBlockCount: realBlockIds.length,
        retainedCardCount: realCards.length,
        excludedBlockCount,
      });
    }
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
