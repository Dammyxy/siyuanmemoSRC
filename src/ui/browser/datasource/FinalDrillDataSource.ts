import type { BrowserCard } from '../types';
import type {
  ICardDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
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
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FinalDrillDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

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

export class FinalDrillDataSource implements ICardDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FinalDrillDataSourceOptions;
  private readonly plugin?: CardServicePluginLike;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FinalDrillDataSourceOptions,
    plugin?: CardServicePluginLike
  ) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    try {
      const queue = this.manager.getQueue(QueueType.FinalDrill);
      const cards = await queue.getCards();
      const browserCards = cards.map((card) => mapQueueFsrsCardToBrowserCard(card));
      const filtered = applyQueueFilters(browserCards, this.options, 'headline');
      const sorted = sortBrowserCards(filtered, params?.sortModel || []);
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      logger.error('Failed to fetch rows', error);
      throw error;
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions({
      withInsert: true,
      withSort: true,
      withPriority: true,
      withTimeAdjust: false,
      withDelete: true,
    });
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserCard[],
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

        if (deletion.failedCardIds.length > 0) {
          logger.error('Failed card IDs', { failedCardIds: deletion.failedCardIds });
        }
        return deletion.deletedCount;
      }

      if (actionId === 'set-priority') {
        return setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'FinalDrillDataSource',
        });
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
        return;
      }
    } catch (error) {
      logger.error('Failed to perform action', { actionId, error });
      throw error;
    }
  }

  getId(): string {
    return this.id;
  }
}
