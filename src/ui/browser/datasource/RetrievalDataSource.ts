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
  sortBrowserCards,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RetrievalDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

type RetrievalActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type RetrievalPluginLike = CardServicePluginLike & MenuActionPluginLike;

export type RetrievalDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isQueueDueAdjustAction(actionId: string): actionId is 'postpone' | 'advance' {
  return actionId === 'postpone' || actionId === 'advance';
}

export class RetrievalDataSource implements ICardDataSource {
  id = 'retrieval';
  label = 'Retrieval';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: RetrievalDataSourceOptions;
  private readonly plugin?: RetrievalPluginLike;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: RetrievalDataSourceOptions,
    plugin?: RetrievalPluginLike
  ) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    try {
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      const cards = await queue.getCards();
      const browserCards = cards.map((card) =>
        mapQueueFsrsCardToBrowserCard(card, {
          firstReviewMode: 'created-or-last',
        })
      );
      const filtered = applyQueueFilters(browserCards, this.options, 'headline');
      const sorted = sortBrowserCards(filtered, params?.sortModel || []);
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      logger.error('Failed to fetch rows', error);
      throw error;
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions(
      {
        withInsert: true,
        withSort: false,
        withPriority: true,
        withTimeAdjust: true,
        withDelete: true,
      },
      undefined
    );
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserCard[],
    context?: RetrievalActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    try {
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
          scope: 'RetrievalDataSource',
        });
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.plugin, selectedRows, {
          preferBatch: true,
          scope: 'RetrievalDataSource',
        });
        if (!deletion) {
          return { updated: 0, skipped: selectedRows.length };
        }
        return {
          updated: deletion.deletedCount,
          skipped: deletion.failedCardIds.length,
        };
      }

      if (actionId === 'set-priority') {
        return setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'RetrievalDataSource',
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
