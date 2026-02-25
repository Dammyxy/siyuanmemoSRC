import type { BrowserCard } from '../types';
import type {
  ICardDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
} from './types';
import { buildQueueActions } from './MenuActions';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import {
  adjustBrowserCardsDue,
  applyQueueFilters,
  type CardServicePluginLike,
  type QueueDueAdjustAction,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FilterGroupDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

type FilterGroupActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

// 五重筛选：支持的筛选参数
export type FilterGroupDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isQueueDueAdjustAction(actionId: string): actionId is QueueDueAdjustAction {
  return actionId === 'postpone' || actionId === 'advance' || actionId === 'spread';
}

export class FilterGroupDataSource implements ICardDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FilterGroupDataSourceOptions;
  private readonly plugin?: CardServicePluginLike;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FilterGroupDataSourceOptions,
    plugin?: CardServicePluginLike
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
        return adjustBrowserCardsDue(this.manager, selectedRows, actionId, context, {
          scope: 'FilterGroupDataSource',
          postponeFromNow: false,
          allowSpread: true,
        });
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
