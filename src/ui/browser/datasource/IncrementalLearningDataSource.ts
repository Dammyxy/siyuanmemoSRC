/**
 * Incremental Learning Data Source
 */

import type { BrowserCard } from '../types';
import type {
  BrowserActionTarget,
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  FetchRowsOptions,
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
import { isQueueProjectionNotReadyError } from '../utils/projectionReadiness';

const logger = createLogger('IncrementalLearningDataSource');

type QueueCardTypeFilter =
  | 'all'
  | 'topic-only'
  | 'item-only'
  | 'concept-only'
  | 'descriptor-only'
  | 'missing-block-only';
type I18nDictionary = Record<string, string>;

type IncrementalLearningActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type IncrementalPluginLike = Omit<MenuActionPluginLike, 'context' | 'getContext'> & {
  i18n?: I18nDictionary;
  context?: NonNullable<MenuActionPluginLike['context']> & {
    getI18n?: () => I18nDictionary | undefined;
  };
  getContext?: () =>
    | (NonNullable<MenuActionPluginLike['context']> & {
        getI18n?: () => I18nDictionary | undefined;
      })
    | undefined;
};

export type IncrementalLearningDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isIncrementalTimeAction(actionId: string): actionId is 'postpone' | 'advance' {
  return actionId === 'postpone' || actionId === 'advance';
}

export class IncrementalLearningDataSource
  extends BaseQueueSnapshotDataSource<IncrementalPluginLike>
  implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'incremental-learning';
  label = 'Incremental Learning';
  private readonly i18n?: I18nDictionary;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: IncrementalLearningDataSourceOptions,
    plugin?: IncrementalPluginLike,
    deps: QueueSnapshotDataSourceDeps = {},
  ) {
    super('IncrementalLearningDataSource', manager, options, plugin, deps);
    const context = plugin?.getContext?.() as { getI18n?: () => I18nDictionary | undefined } | undefined;
    this.i18n = context?.getI18n?.() || plugin?.i18n;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const startTime = Date.now();

    try {
      const sortModel = (params?.sortModel || []) as SortModel[];
      this.lastSortModel = [...sortModel];
      const paged = await this.querySession.fetchRows({
        ...this.buildSessionOptions(sortModel),
        startRow: params?.startRow,
        endRow: params?.endRow,
      });

      logger.debug('Fetched rows', {
        totalCards: paged.totalCount,
        durationMs: Date.now() - startTime,
      });

      return paged;
    } catch (error) {
      if (isQueueProjectionNotReadyError(error)) {
        logger.info('Queue projection is still refreshing', {
          durationMs: Date.now() - startTime,
        });
        throw error;
      }
      logger.error('Failed to fetch rows', {
        error,
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions(
      {
        withInsert: false,
        withSort: false,
        withPriority: true,
        withTimeAdjust: true,
        withDelete: true,
        withSuspend: true,
        preset: this.options.preset,
      },
      (key, fallback) => this.t(key, fallback)
    );
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserActionTarget[],
    context?: IncrementalLearningActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    try {
      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(resolveQueueRemovalTarget(this.manager, QueueType.IncrementalLearning), selectedRows, {
          scope: 'IncrementalLearningDataSource',
        });
        this.invalidateQuerySession();
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.manager, selectedRows, {
          scope: 'IncrementalLearningDataSource',
        });
        this.invalidateQuerySession();
        return {
          updated: deletion.deletedCount,
          skipped: deletion.failedCardIds.length,
        };
      }

      if (actionId === 'set-priority') {
        const result = await setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'IncrementalLearningDataSource',
        });
        this.invalidateQuerySession();
        return result;
      }

      const relativePriorityDelta = getRelativePriorityDelta(actionId);
      if (relativePriorityDelta != null) {
        const result = await adjustBrowserCardsPriorityRelative(this.manager, selectedRows, relativePriorityDelta, {
          scope: 'IncrementalLearningDataSource',
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
          scope: 'IncrementalLearningDataSource',
        });
        this.invalidateQuerySession();
        return;
      }

      if (isIncrementalTimeAction(actionId)) {
        const result = await adjustTime(this.plugin, selectedRows, actionId, context);
        if (!result) {
          throw new Error('RescheduleService unavailable');
        }
        this.invalidateQuerySession();
        return result;
      }

      logger.warn('Unknown action', { actionId });
    } catch (error) {
      logger.error('Failed to perform action', { actionId, error });
      throw error;
    }
  }

  private t(key: string, fallback: string): string {
    return this.i18n?.[key] || fallback;
  }

  protected getQueueBrowserId() {
    return 'incremental-learning' as const;
  }

  protected override allowLegacyQueueFallback(): boolean {
    return false;
  }

  protected async buildLegacyOrderedRows(_sortModel: SortModel[]): Promise<BrowserCard[]> {
    throw new Error('QUEUE_PROJECTION_UNAVAILABLE: incremental-learning browser snapshot unavailable');
  }
}
