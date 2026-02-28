import type { BrowserCard } from '../types';
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
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import {
  applyQueueFilters,
  type CardServicePluginLike,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortAndPaginateBrowserCards,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FilterGroupDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';

type FilterGroupActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type FilterGroupPluginLike = CardServicePluginLike & MenuActionPluginLike;

// 五重筛选：支持的筛选参数
export type FilterGroupDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isQueueDueAdjustAction(actionId: string): actionId is 'postpone' | 'advance' {
  return actionId === 'postpone' || actionId === 'advance';
}

export class FilterGroupDataSource implements ICardDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FilterGroupDataSourceOptions;
  private readonly plugin?: FilterGroupPluginLike;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FilterGroupDataSourceOptions,
    plugin?: FilterGroupPluginLike
  ) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    try {
      const queue = this.manager.getQueue(QueueType.FilterGroup);
      const cards = await queue.getCards();
      const browserCards = cards.map((card, index) => {
        return mapQueueFsrsCardToBrowserCard(card, { queueIndex: index + 1 });
      });

      const filtered = applyQueueFilters(browserCards, this.options, 'headline');
      const paged = sortAndPaginateBrowserCards(
        filtered,
        params?.sortModel || [],
        params?.startRow,
        params?.endRow
      );
      return { rows: paged.rows, totalCount: paged.totalCount };
    } catch (error) {
      logger.error('Failed to fetch rows', error);
      throw error;
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions({
      withInsert: true,
      withSort: false,
      withPriority: true,
      withTimeAdjust: true,
      withDelete: true,
    });
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserCard[],
    context?: FilterGroupActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    try {
      const queue = this.manager.getQueue(QueueType.FilterGroup);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
          scope: 'FilterGroupDataSource',
        });
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.plugin, selectedRows, {
          preferBatch: false,
          scope: 'FilterGroupDataSource',
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
          scope: 'FilterGroupDataSource',
        });
      }

      if (isQueueDueAdjustAction(actionId)) {
        const result = await adjustTime(this.plugin, selectedRows, actionId, context);
        if (!result) {
          throw new Error('RescheduleService unavailable');
        }
        return result;
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
