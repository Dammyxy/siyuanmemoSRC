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

const logger = createLogger('FinalDrillDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';

type FinalDrillActionContext = {
  priority?: number;
};

// 五重筛选：支持的筛选参数
export type FinalDrillDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

export class FinalDrillDataSource
  extends BaseQueueSnapshotDataSource<unknown>
  implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FinalDrillDataSourceOptions,
    plugin?: unknown,
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
      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(resolveQueueRemovalTarget(this.manager, QueueType.FinalDrill), selectedRows, {
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.manager, selectedRows, {
          scope: 'FinalDrillDataSource',
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
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return result;
      }

      const relativePriorityDelta = getRelativePriorityDelta(actionId);
      if (relativePriorityDelta != null) {
        const result = await adjustBrowserCardsPriorityRelative(this.manager, selectedRows, relativePriorityDelta, {
          scope: 'FinalDrillDataSource',
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
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return;
      }

      if (actionId === 'auto-sort') {
        logger.warn('FinalDrill auto-sort unavailable without an application reorder command');
        this.invalidateQuerySession();
        return { updated: 0, skipped: selectedRows.length };
      }
    } catch (error) {
      logger.error('Failed to perform action', { actionId, error });
      throw error;
    }
  }

  protected getQueueBrowserId() {
    return 'final-drill' as const;
  }

  protected allowLegacyQueueFallback(): boolean {
    return false;
  }

  protected async buildLegacyOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    throw new Error('QUEUE_PROJECTION_UNAVAILABLE: final-drill browser snapshot unavailable');
  }
}
