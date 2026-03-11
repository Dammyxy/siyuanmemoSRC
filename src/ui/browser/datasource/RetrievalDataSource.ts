import type { BrowserCard } from '../types';
import type {
  BrowserActionTarget,
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  SortModel,
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
  toggleBrowserCardsSuspended,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';
import {
  BaseQueueSnapshotDataSource,
  type QueueSnapshotDataSourceDeps,
} from './shared/BaseQueueSnapshotDataSource';

const logger = createLogger('RetrievalDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';

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

export class RetrievalDataSource
  extends BaseQueueSnapshotDataSource<RetrievalPluginLike>
  implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'retrieval';
  label = 'Retrieval';

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: RetrievalDataSourceOptions,
    plugin?: RetrievalPluginLike,
    deps: QueueSnapshotDataSourceDeps = {},
  ) {
    super('RetrievalDataSource', manager, options, plugin, deps);
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions(
      {
        withInsert: true,
        withSort: false,
        withPriority: true,
        withTimeAdjust: true,
        withDelete: true,
        withSuspend: true,
        preset: this.options.preset,
      },
      undefined
    );
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserActionTarget[],
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
        this.invalidateQuerySession();
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
        this.invalidateQuerySession();
        return {
          updated: deletion.deletedCount,
          skipped: deletion.failedCardIds.length,
        };
      }

      if (actionId === 'set-priority') {
        const result = await setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'RetrievalDataSource',
        });
        this.invalidateQuerySession();
        return result;
      }

      if (actionId === 'suspend' || actionId === 'unsuspend') {
        await toggleBrowserCardsSuspended(this.manager, selectedRows, actionId === 'suspend', {
          scope: 'RetrievalDataSource',
        });
        this.invalidateQuerySession();
        return;
      }

      if (isQueueDueAdjustAction(actionId)) {
        const result = await adjustTime(this.plugin, selectedRows, actionId, context);
        if (!result) {
          throw new Error('RescheduleService unavailable');
        }
        this.invalidateQuerySession();
        return result;
      }
    } catch (error) {
      logger.error('Failed to perform action', { actionId, error });
      throw error;
    }
  }

  protected getQueueBrowserId() {
    return 'retrieval' as const;
  }

  protected async buildLegacyOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.RetrievalPractice);
    const cards = await queue.getCards();
    const browserCards = cards.map((card) =>
      mapQueueFsrsCardToBrowserCard(card, {
        firstReviewMode: 'created-or-last',
      })
    );
    const filtered = applyQueueFilters(browserCards, this.options, 'headline');
    return sortBrowserCards(filtered, sortModel);
  }
}
