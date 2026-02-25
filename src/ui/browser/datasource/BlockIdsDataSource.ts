import type { BrowserCard } from '../types';
import { loadQueueCardsSimple } from '../browserService';
import type {
  ICardDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
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
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';
import { createLogger } from '@/utils/logger';

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

export class BlockIdsDataSource implements ICardDataSource {
  id: string;
  label: string;

  private readonly blockIds: string[];
  private readonly plugin?: BlockIdsPluginLike;
  private readonly queueId?: string;
  private readonly getBlockIdsFn?: () => string[];

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
    const blockIds = this.getBlockIdsFn ? this.getBlockIdsFn() : this.blockIds;
    const cards = await loadQueueCardsSimple(blockIds);
    const sorted = sortBrowserCards(cards, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
  }

  getSupportedActions(): CardBrowserAction[] {
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
      });
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
      return { updated: result.insertedCount, skipped: result.failedCount };
    }

    if (actionId === 'set-priority') {
      const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
      const manager = this.resolveManager();
      if (!manager) {
        throw new Error('set-priority requires UnifiedDataSourceManager');
      }
      return setBrowserCardsPriority(manager, selectedRows, priority, {
        scope: 'BlockIdsDataSource',
      });
    }

    if (isRescheduleAction(actionId)) {
      return adjustTime(this.plugin, selectedRows, actionId, context);
    }

    logger.warn('Unknown action', { actionId, queueId: this.queueId });
  }

  getId(): string {
    return this.id;
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
