import {
  batchReset,
  batchSuspend,
  invalidateCardCache,
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
} from './DataSourceUtils';
import { getRelativePriorityDelta } from '../browserActionFeedback';
import type { BrowserDeckFullUniverseReason } from '@/application/queries/browser/browser-deck-query';
import type { BrowserReadModel } from '@/application/queries/browser/browser-read-model';
import {
  addToQueue,
  adjustTime,
  buildAddToQueueAction,
  getBaseActions,
  QUEUE_ADD_ROUTES,
  type PluginLike as MenuActionPluginLike,
  type QueueAddRoute,
} from './MenuActions';
import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
import type { NeuralRoamEntryActionService } from '@/application/services/NeuralRoamEntryActionService';
import { createLogger } from '@/utils/logger';
import { BrowserReadModelStateError } from '../utils/browserReadModelStateError';

const logger = createLogger('QueryDataSource');
const SQL_READ_MODEL_UNAVAILABLE_MESSAGE = 'BACKEND_UNAVAILABLE: BrowserReadModel required for SQL mode';

type QueryActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type I18nContextLike = {
  getI18n?: () => Record<string, string> | undefined;
};

type QueryPluginLike = Omit<MenuActionPluginLike, 'context' | 'getContext'> & {
  context?: NonNullable<MenuActionPluginLike['context']> & I18nContextLike & QueryPluginContextLike;
  getContext?: () => (NonNullable<MenuActionPluginLike['context']> & I18nContextLike & QueryPluginContextLike) | undefined;
  i18n?: Record<string, string>;
};

type QueryPluginContextLike = {
  getNeuralRoamEntryActionService?: () => Pick<NeuralRoamEntryActionService, 'addConceptBlocksToCurrentRoute'> | null | undefined;
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
  browserService?: Pick<IBrowserApplicationService, 'getBrowserReadModel'> | null;
};

function isRescheduleAction(actionId: string): actionId is 'postpone' | 'advance' | 'spread' {
  return actionId === 'postpone' || actionId === 'advance' || actionId === 'spread';
}

function normalizeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
}

/**
 * Advanced SQL datasource. SQL execution is owned by BrowserReadModel; UI only
 * forwards query intent and consumes read-model rows/ids.
 */
export class QueryDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'query';
  label = 'Query';

  private readonly stmt: string;
  private readonly manager: IUnifiedDataSourceManagerFacade | null;
  private readonly plugin?: QueryPluginLike;
  private readonly browserService: Pick<IBrowserApplicationService, 'getBrowserReadModel'> | null;
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;

  constructor(stmt: string, options: QueryDataSourceOptions = {}) {
    this.stmt = stmt;
    this.manager = options.manager ?? null;
    this.plugin = options.plugin;
    this.browserService = options.browserService ?? null;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const sortModel = (params?.sortModel || []) as SortModel[];
    this.lastSortModel = [...sortModel];
    const result = await this.requireReadModel().page({
      source: 'advanced-sql',
      statement: this.stmt,
    }, {
      startRow: params?.startRow,
      endRow: params?.endRow,
    });
    if (result.status !== 'ready') {
      throw new BrowserReadModelStateError(result.status, result.reason);
    }
    return {
      rows: result.rows,
      totalCount: result.total,
      queryFingerprint: result.queryFingerprint,
      generation: result.generation,
      readOwner: result.readOwner,
    };
  }

  getQueryFingerprint(): string {
    return this.buildQueryFingerprint(this.lastSortModel);
  }

  async getAllMatchedIds(reason: BrowserDeckFullUniverseReason = 'matched-ids'): Promise<string[]> {
    return this.requireReadModel().matchedIds({
      source: 'advanced-sql',
      statement: this.stmt,
    }, {
      reason,
    });
  }

  async getRowsByIds(ids: string[]): Promise<import('../types').BrowserCard[]> {
    return this.requireReadModel().rowsByIds(normalizeIds(ids), { source: 'deck' });
  }

  async getActionTargetsByIds(
    ids: string[],
    reason: BrowserDeckFullUniverseReason = 'action-targets',
  ): Promise<BrowserActionTarget[]> {
    return this.requireReadModel().actionTargetsByIds(normalizeIds(ids), {
      source: 'deck',
      reason,
    });
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
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

  private requireReadModel(): BrowserReadModel {
    const readModel = this.browserService?.getBrowserReadModel?.();
    if (!readModel) {
      throw new Error(SQL_READ_MODEL_UNAVAILABLE_MESSAGE);
    }
    return readModel;
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
    const source = route.actionType === 'neural-roam' ? 'browser' : route.source ?? 'manual';
    const queueTarget = route.actionType === 'neural-roam'
      ? this.getNeuralRoamEntryActionService()
      : this.manager && typeof this.manager.batchAddToQueue === 'function'
      ? {
          addCards: (
            cards: unknown[],
            addSource?: Parameters<NonNullable<IUnifiedDataSourceManagerFacade['batchAddToQueue']>>[2]
          ) => this.manager!.batchAddToQueue!(
            route.queueType,
            cards as Parameters<NonNullable<IUnifiedDataSourceManagerFacade['batchAddToQueue']>>[1],
            addSource
          ),
        }
      : undefined;
    const result = await addToQueue(queueTarget, selectedRows, route.actionType, source);
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

  private getNeuralRoamEntryActionService(): Pick<NeuralRoamEntryActionService, 'addConceptBlocksToCurrentRoute'> | null {
    const context = this.plugin?.getContext?.();
    return context?.getNeuralRoamEntryActionService?.() ?? null;
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: 'query',
      stmt: this.stmt,
      sortModel,
      generation: this.dataGeneration,
    });
  }
}
