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
import { validateConsumerCardType } from '../../../diagnostics/type-guards';
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
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
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

  protected async buildLegacyOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.IncrementalLearning);
    const cards = await queue.getCards();
    validateConsumerCardType('IncrementalLearningDataSource', cards);
    const browserCards = cards.map((card) => mapQueueFsrsCardToBrowserCard(card));
    const filtered = applyQueueFilters(browserCards, this.options, 'fullContent');
    return sortBrowserCards(filtered, sortModel);
  }
}
