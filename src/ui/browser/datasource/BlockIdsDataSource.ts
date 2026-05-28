import type { BrowserCard } from '../types';
import {
  loadBrowserCardProjectionsByBlockIds,
  loadBrowserCardsByBlockIds,
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
  buildQueueActions,
  adjustTime,
  type PluginLike as MenuActionPluginLike,
} from './MenuActions';
import {
  type IReviewQueue,
  type IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import {
  isNeuralBrowserQueue,
  resolveQueueTypeForBrowserQueueId,
} from '@/types/browser-queue-identity';
import {
  adjustBrowserCardsPriorityRelative,
  insertCardsIntoQueue,
  removeCardsFromQueue,
  resolveBrowserCardId,
  resolveQueueRemovalTarget,
  setBrowserCardsPriority,
  sortBrowserRows,
} from './DataSourceUtils';
import { getRelativePriorityDelta } from '../browserActionFeedback';
import { createLogger } from '@/utils/logger';
import { BrowserQuerySession } from './session/BrowserQuerySession';
import { resolveBrowserCardStableId } from '../utils/browserCardIdentity';
import type { BrowserSiyuanPort } from '@/application/ports/BrowserSiyuanPort';
import { toBrowserReadModelLiteIdentity } from '@/application/queries/browser/browser-read-model';

const logger = createLogger('BlockIdsDataSource');

type QueueMutationLike = Pick<IReviewQueue, 'removeCard'> & {
  insertAt?: (cardId: string, position: number) => Promise<void> | void;
};

type BlockIdsActionContext = {
  index?: number;
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type BlockIdsPluginLike = MenuActionPluginLike & {
  neuralQueue?: QueueMutationLike;
};

type ManagerContextLike = {
  getUnifiedDataSourceManager?: () => IUnifiedDataSourceManagerFacade | undefined;
};

type RescheduleActionId = Parameters<typeof adjustTime>[2];

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasManagerContext(value: unknown): value is ManagerContextLike {
  return isObjectLike(value) && 'getUnifiedDataSourceManager' in value;
}

function isRescheduleAction(actionId: string): actionId is RescheduleActionId {
  return actionId === 'postpone' || actionId === 'advance' || actionId === 'spread';
}

export class BlockIdsDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id: string;
  label: string;

  private readonly blockIds: string[];
  private readonly plugin?: BlockIdsPluginLike;
  private readonly queueId?: string;
  private readonly getBlockIdsFn?: () => string[];
  private readonly queryText?: string;
  private readonly manager?: IUnifiedDataSourceManagerFacade;
  private readonly siyuanApi?: BrowserSiyuanPort | null;
  private readonly querySession = new BrowserQuerySession('BlockIdsDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;
  private liteRowBlockIdById = new Map<string, string>();

  constructor(options: {
    id: string;
    label: string;
    blockIds: string[];
    plugin?: BlockIdsPluginLike;
    queueId?: string;
    getBlockIdsFn?: () => string[];
    queryText?: string;
    manager?: IUnifiedDataSourceManagerFacade;
    siyuanApi?: BrowserSiyuanPort | null;
  }) {
    this.id = options.id;
    this.label = options.label;
    this.blockIds = options.blockIds;
    this.plugin = options.plugin;
    this.queueId = options.queueId;
    this.getBlockIdsFn = options.getBlockIdsFn;
    this.queryText = options.queryText;
    this.manager = options.manager;
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

  getSupportedActions(): CardBrowserAction[] {
    if (isNeuralBrowserQueue(this.queueId)) {
      return buildQueueActions({
        withInsert: false,
        withSort: false,
        withPriority: false,
        withTimeAdjust: false,
      });
    }

    return buildQueueActions({
      withInsert: true,
      withSort: false,
      withPriority: true,
      withTimeAdjust: true,
    });
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserActionTarget[],
    context?: BlockIdsActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    if (actionId === 'remove-from-current-queue') {
      const manager = this.resolveManager();
      const queueType = resolveQueueTypeForBrowserQueueId(this.queueId);
      const queue = manager && queueType
        ? resolveQueueRemovalTarget(manager, queueType)
        : this.getQueueById(this.queueId);
      if (!queue) {
        logger.error('Cannot remove: queue not found', { queueId: this.queueId });
        return { updated: 0, skipped: selectedRows.length };
      }

      const result = await removeCardsFromQueue(queue, selectedRows, {
        scope: 'BlockIdsDataSource',
        resolveId:
          isNeuralBrowserQueue(this.queueId)
            ? (row) => String(row.blockId || resolveBrowserCardId(row))
            : undefined,
      });
      this.invalidateQuerySession();
      return { updated: result.removedCount, skipped: result.failedCount };
    }

    if (actionId === 'insert-at') {
      const queue = this.getQueueById(this.queueId);
      if (!queue) {
        logger.error('Cannot insert: queue not found', { queueId: this.queueId });
        return { updated: 0, skipped: selectedRows.length };
      }

      const index = Math.max(0, Math.floor(Number(context?.index ?? 0)));
      const result = await insertCardsIntoQueue(queue, selectedRows, index, {
        scope: 'BlockIdsDataSource',
      });
      this.invalidateQuerySession();
      return { updated: result.insertedCount, skipped: result.failedCount };
    }

    if (actionId === 'set-priority') {
      const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
      const manager = this.resolveManager();
      if (!manager) {
        throw new Error('set-priority requires UnifiedDataSourceManager');
      }
      const result = await setBrowserCardsPriority(manager, selectedRows, priority, {
        scope: 'BlockIdsDataSource',
      });
      this.invalidateQuerySession();
      return result;
    }

    const relativePriorityDelta = getRelativePriorityDelta(actionId);
    if (relativePriorityDelta != null) {
      const manager = this.resolveManager();
      if (!manager) {
        throw new Error(`${actionId} requires UnifiedDataSourceManager`);
      }
      const result = await adjustBrowserCardsPriorityRelative(manager, selectedRows, relativePriorityDelta, {
        scope: 'BlockIdsDataSource',
      });
      this.invalidateQuerySession();
      return {
        ...result,
        updated: result.updated.length,
        skipped: result.skipped.length,
      };
    }

    if (isRescheduleAction(actionId)) {
      const result = await adjustTime(this.plugin, selectedRows, actionId, context);
      this.invalidateQuerySession();
      return result;
    }

    logger.warn('Unknown action', { actionId, queueId: this.queueId });
  }

  getId(): string {
    return this.id;
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    const liveBlockIds = this.getBlockIdsFn ? this.getBlockIdsFn() : this.blockIds;
    return JSON.stringify({
      dataSource: 'block-ids',
      id: this.id,
      queueId: this.queueId || '',
      blockCount: liveBlockIds.length,
      queryText: this.queryText || '',
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCardProjection[]> {
    const blockIds = this.getBlockIdsFn ? this.getBlockIdsFn() : this.blockIds;
    const options: Parameters<typeof loadBrowserCardProjectionsByBlockIds>[1] = {
      queryText: this.queryText,
      applyQueryFilter: true,
    };
    const manager = this.resolveManager();
    if (manager) {
      options.manager = manager as never;
    }
    if (this.siyuanApi) {
      options.siyuanApi = this.siyuanApi;
    }
    const rows = await loadBrowserCardProjectionsByBlockIds(blockIds, options);
    return sortBrowserRows(rows, sortModel);
  }

  private buildSessionOptions(sortModel: SortModel[]) {
    return {
      queryFingerprint: this.buildQueryFingerprint(sortModel),
      buildLiteRows: async () => {
        const rows = await this.buildOrderedRows(sortModel);
        this.liteRowBlockIdById.clear();
        return rows.map((row) => {
          const id = resolveBrowserCardStableId(row as BrowserCard);
          this.liteRowBlockIdById.set(id, row.blockId);
          return {
            ...toBrowserReadModelLiteIdentity({
              id: row.id,
              blockId: row.blockId,
              fsrsCardId: row.fsrsCardId ? String(row.fsrsCardId) : undefined,
              cardType: row.cardType,
              priority: row.priority,
            }),
          };
        });
      },
      hydrateRows: async (ids: string[]) => {
        const blockIds = Array.from(new Set(ids
          .map((id) => this.liteRowBlockIdById.get(id))
          .filter((blockId): blockId is string => Boolean(blockId))));
        const options: Parameters<typeof loadBrowserCardsByBlockIds>[1] = {
          applyQueryFilter: false,
        };
        const manager = this.resolveManager();
        if (manager) {
          options.manager = manager as never;
        }
        if (this.siyuanApi) {
          options.siyuanApi = this.siyuanApi;
        }
        const rows = await loadBrowserCardsByBlockIds(blockIds, options);
        const rowByStableId = new Map(rows.map((row) => [resolveBrowserCardStableId(row), row]));
        return ids
          .map((id) => rowByStableId.get(id))
          .filter((row): row is BrowserCard => Boolean(row));
      },
    };
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
    this.liteRowBlockIdById.clear();
    this.querySession.invalidate();
  }

  private resolveManager(): IUnifiedDataSourceManagerFacade | undefined {
    if (this.manager) {
      return this.manager;
    }
    const context = this.plugin?.getContext?.();
    if (!hasManagerContext(context)) {
      return undefined;
    }
    return context.getUnifiedDataSourceManager?.();
  }

  private getQueueById(queueId: string | undefined): QueueMutationLike | null {
    if (!queueId) {
      return null;
    }

    if (isNeuralBrowserQueue(queueId) && this.plugin?.neuralQueue) {
      return this.plugin.neuralQueue;
    }

    const manager = this.resolveManager();
    if (!manager) {
      logger.warn('UnifiedDataSourceManager unavailable', { queueId });
      return null;
    }

    const queueType = resolveQueueTypeForBrowserQueueId(queueId);
    if (!queueType) {
      logger.warn('Queue type mapping not found', { queueId });
      return null;
    }

    return manager.getQueue(queueType);
  }
}
