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

const logger = createLogger('FilterGroupDataSource');

type QueueCardTypeFilter =
  | 'all'
  | 'topic-only'
  | 'item-only'
  | 'concept-only'
  | 'descriptor-only'
  | 'missing-block-only';

type FilterGroupActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type FilterGroupPluginLike = MenuActionPluginLike;

export type FilterGroupDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isQueueDueAdjustAction(actionId: string): actionId is 'postpone' | 'advance' {
  return actionId === 'postpone' || actionId === 'advance';
}

export class FilterGroupDataSource
  extends BaseQueueSnapshotDataSource<FilterGroupPluginLike>
  implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FilterGroupDataSourceOptions,
    plugin?: FilterGroupPluginLike,
    deps: QueueSnapshotDataSourceDeps = {},
  ) {
    super('FilterGroupDataSource', manager, options, plugin, deps);
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions({
      withInsert: true,
      withSort: false,
      withPriority: true,
      withTimeAdjust: true,
      withDelete: true,
      withSuspend: true,
      preset: this.options.preset,
    });
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserActionTarget[],
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
        this.invalidateQuerySession();
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.manager, selectedRows, {
          scope: 'FilterGroupDataSource',
        });
        this.invalidateQuerySession();

        if (deletion.failedCardIds.length > 0) {
          logger.error('Failed card IDs', { failedCardIds: deletion.failedCardIds });
        }
        return {
          updated: deletion.deletedCount,
          skipped: deletion.failedCardIds.length,
        };
      }

      if (actionId === 'set-priority') {
        const result = await setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'FilterGroupDataSource',
        });
        this.invalidateQuerySession();
        return result;
      }

      if (actionId === 'suspend' || actionId === 'unsuspend') {
        await toggleBrowserCardsSuspended(this.manager, selectedRows, actionId === 'suspend', {
          scope: 'FilterGroupDataSource',
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
    return 'filter-group' as const;
  }

  protected async buildLegacyOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.FilterGroup);
    const cards = await queue.getCards();
    const browserCards = cards.map((card, index) => mapQueueFsrsCardToBrowserCard(card, { queueIndex: index + 1 }));
    const filtered = applyQueueFilters(browserCards, this.options, 'headline');
    return sortBrowserCards(filtered, sortModel);
  }
}
