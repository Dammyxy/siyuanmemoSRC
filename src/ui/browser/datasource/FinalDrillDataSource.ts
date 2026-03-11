import type { BrowserCard } from '../types';
import type {
  BrowserActionTarget,
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  SortModel,
} from './types';
import { buildQueueActions } from './MenuActions';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import {
  applyQueueFilters,
  type CardServicePluginLike,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortBrowserCards,
  toggleBrowserCardsSuspended,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';
import {
  BaseQueueSnapshotDataSource,
  type QueueSnapshotDataSourceDeps,
} from './shared/BaseQueueSnapshotDataSource';

const logger = createLogger('FinalDrillDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';

type FinalDrillActionContext = {
  priority?: number;
};

type ReorderableQueueLike = {
  reorder?: (cards: FSRSCard[]) => Promise<unknown> | unknown;
};

// 五重筛选：支持的筛选参数
export type FinalDrillDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function hasReorder(value: unknown): value is Required<ReorderableQueueLike> {
  return typeof value === 'object' && value !== null && typeof (value as ReorderableQueueLike).reorder === 'function';
}

export class FinalDrillDataSource
  extends BaseQueueSnapshotDataSource<CardServicePluginLike>
  implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FinalDrillDataSourceOptions,
    plugin?: CardServicePluginLike,
    deps: QueueSnapshotDataSourceDeps = {},
  ) {
    super('FinalDrillDataSource', manager, options, plugin, deps);
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions({
      withInsert: true,
      withSort: true,
      withPriority: true,
      withTimeAdjust: false,
      withDelete: true,
      withSuspend: true,
      preset: this.options.preset,
    });
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserActionTarget[],
    context?: FinalDrillActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    try {
      const queue = this.manager.getQueue(QueueType.FinalDrill);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.plugin, selectedRows, {
          preferBatch: false,
          scope: 'FinalDrillDataSource',
        });
        if (!deletion) {
          return 0;
        }
        this.invalidateQuerySession();

        if (deletion.failedCardIds.length > 0) {
          logger.error('Failed card IDs', { failedCardIds: deletion.failedCardIds });
        }
        return deletion.deletedCount;
      }

      if (actionId === 'set-priority') {
        const result = await setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return result;
      }

      if (actionId === 'suspend' || actionId === 'unsuspend') {
        await toggleBrowserCardsSuspended(this.manager, selectedRows, actionId === 'suspend', {
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return;
      }

      if (actionId === 'auto-sort') {
        const cards = await queue.getCards();
        const sorted = cards.sort((a, b) => {
          const priorityDiff = a.priority - b.priority;
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return a.due - b.due;
        });

        if (!hasReorder(queue)) {
          logger.warn('Queue reorder is unavailable');
          return;
        }

        await Promise.resolve(queue.reorder(sorted));
        this.invalidateQuerySession();
        return;
      }
    } catch (error) {
      logger.error('Failed to perform action', { actionId, error });
      throw error;
    }
  }

  protected getQueueBrowserId() {
    return 'final-drill' as const;
  }

  protected async buildLegacyOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.FinalDrill);
    const cards = await queue.getCards();
    const browserCards = cards.map((card) => mapQueueFsrsCardToBrowserCard(card));
    const filtered = applyQueueFilters(browserCards, this.options, 'headline');
    return sortBrowserCards(filtered, sortModel);
  }
}
