import type { BrowserCard } from '../types';
import { loadQueueCardsSimple } from '../browserService';
import type {
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
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
  QueueType,
  type IReviewQueue,
  type IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import {
  insertCardsIntoQueue,
  removeCardsFromQueue,
  resolveBrowserCardId,
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';
import { createLogger } from '@/utils/logger';
import { BrowserQuerySession, toLiteRowFromBrowserCard } from './session/BrowserQuerySession';

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

const QUEUE_TYPE_MAP: Record<string, QueueType> = {
  retrieval: QueueType.RetrievalPractice,
  'final-drill': QueueType.FinalDrill,
  'neural-roam': QueueType.NeuralRoam,
  'filter-group': QueueType.FilterGroup,
  'incremental-learning': QueueType.IncrementalLearning,
};

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
  private readonly querySession = new BrowserQuerySession('BlockIdsDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;

  constructor(options: {
    id: string;
    label: string;
    blockIds: string[];
    plugin?: BlockIdsPluginLike;
    queueId?: string;
    getBlockIdsFn?: () => string[];
  }) {
    this.id = options.id;
    this.label = options.label;
    this.blockIds = options.blockIds;
    this.plugin = options.plugin;
    this.queueId = options.queueId;
    this.getBlockIdsFn = options.getBlockIdsFn;
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

  getSupportedActions(): CardBrowserAction[] {
    if (this.queueId === 'neural-roam') {
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
    selectedRows: BrowserCard[],
    context?: BlockIdsActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    const queue = this.getQueueById(this.queueId);

    if (actionId === 'remove-from-current-queue') {
      if (!queue) {
        logger.error('Cannot remove: queue not found', { queueId: this.queueId });
        return { updated: 0, skipped: selectedRows.length };
      }

      const result = await removeCardsFromQueue(queue, selectedRows, {
        scope: 'BlockIdsDataSource',
        resolveId:
          this.queueId === 'neural-roam'
            ? (row) => String(row.blockId || resolveBrowserCardId(row))
            : undefined,
      });
      this.invalidateQuerySession();
      return { updated: result.removedCount, skipped: result.failedCount };
    }

    if (actionId === 'insert-at') {
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
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const blockIds = this.getBlockIdsFn ? this.getBlockIdsFn() : this.blockIds;
    const cards = await loadQueueCardsSimple(blockIds);
    return sortBrowserCards(cards, sortModel);
  }

  private buildSessionOptions(sortModel: SortModel[]) {
    return {
      queryFingerprint: this.buildQueryFingerprint(sortModel),
      buildLiteRows: async () => {
        const rows = await this.buildOrderedRows(sortModel);
        return rows.map(toLiteRowFromBrowserCard);
      },
    };
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
    this.querySession.invalidate();
  }

  private resolveManager(): IUnifiedDataSourceManagerFacade | undefined {
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

    if (queueId === 'neural-roam' && this.plugin?.neuralQueue) {
      return this.plugin.neuralQueue;
    }

    const manager = this.resolveManager();
    if (!manager) {
      logger.warn('UnifiedDataSourceManager unavailable', { queueId });
      return null;
    }

    const queueType = QUEUE_TYPE_MAP[queueId];
    if (!queueType) {
      logger.warn('Queue type mapping not found', { queueId });
      return null;
    }

    return manager.getQueue(queueType);
  }
}
