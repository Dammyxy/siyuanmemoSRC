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
  adjustBrowserCardsPriorityRelative,
  deleteBrowserCards,
  removeCardsFromQueue,
  resolveQueueRemovalTarget,
  setBrowserCardsPriority,
  toggleBrowserCardsSuspended,
} from './DataSourceUtils';
import { getRelativePriorityDelta } from '../browserActionFeedback';
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

type RetrievalPluginLike = MenuActionPluginLike;

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
      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(resolveQueueRemovalTarget(this.manager, QueueType.RetrievalPractice), selectedRows, {
          scope: 'RetrievalDataSource',
        });
        this.invalidateQuerySession();
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.manager, selectedRows, {
          scope: 'RetrievalDataSource',
        });
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

      const relativePriorityDelta = getRelativePriorityDelta(actionId);
      if (relativePriorityDelta != null) {
        const result = await adjustBrowserCardsPriorityRelative(this.manager, selectedRows, relativePriorityDelta, {
          scope: 'RetrievalDataSource',
        });
        this.invalidateQuerySession();
        return {
          ...result,
          updated: result.updated.length,
          skipped: result.skipped.length,
        };
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

  protected override allowLegacyQueueFallback(): boolean {
    return false;
  }

  protected async buildLegacyOrderedRows(_sortModel: SortModel[]): Promise<BrowserCard[]> {
    throw new Error('QUEUE_PROJECTION_UNAVAILABLE: retrieval browser snapshot unavailable');
  }
}
