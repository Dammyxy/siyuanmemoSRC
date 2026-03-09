/**
 * Incremental Learning Data Source
 */

import type { BrowserCard } from '../types';
import type {
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
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
  type CardServicePluginLike,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortBrowserCards,
  toggleBrowserCardsSuspended,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';
import { BrowserQuerySession, toLiteRowFromBrowserCard } from './session/BrowserQuerySession';

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

type IncrementalPluginLike = CardServicePluginLike & {
  i18n?: I18nDictionary;
  getContext?: () =>
    | (CardServicePluginLike['context'] &
      MenuActionPluginLike['context'] & {
        getI18n?: () => I18nDictionary | undefined;
      })
    | undefined;
} & MenuActionPluginLike;

export type IncrementalLearningDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isIncrementalTimeAction(actionId: string): actionId is 'postpone' | 'advance' {
  return actionId === 'postpone' || actionId === 'advance';
}

export class IncrementalLearningDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'incremental-learning';
  label = 'Incremental Learning';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: IncrementalLearningDataSourceOptions;
  private readonly plugin?: IncrementalPluginLike;
  private readonly i18n?: I18nDictionary;
  private readonly querySession = new BrowserQuerySession('IncrementalLearningDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: IncrementalLearningDataSourceOptions,
    plugin?: IncrementalPluginLike
  ) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
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

  getQueryFingerprint(): string {
    return this.buildQueryFingerprint(this.lastSortModel);
  }

  async getAllMatchedIds(): Promise<string[]> {
    return this.querySession.getAllMatchedIds(this.buildSessionOptions(this.lastSortModel));
  }

  async getRowsByIds(ids: string[]): Promise<BrowserCard[]> {
    return this.querySession.getRowsByIds(ids, this.buildSessionOptions(this.lastSortModel));
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
    selectedRows: BrowserCard[],
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
        const deletion = await deleteBrowserCards(this.plugin, selectedRows, {
          preferBatch: false,
          scope: 'IncrementalLearningDataSource',
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

  getId(): string {
    return this.id;
  }

  private t(key: string, fallback: string): string {
    return this.i18n?.[key] || fallback;
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: 'incremental-learning',
      queueId: QueueType.IncrementalLearning,
      options: this.options,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.IncrementalLearning);
    const cards = await queue.getCards();
    validateConsumerCardType('IncrementalLearningDataSource', cards);
    const browserCards = cards.map((card) => mapQueueFsrsCardToBrowserCard(card));
    const filtered = applyQueueFilters(browserCards, this.options, 'fullContent');
    return sortBrowserCards(filtered, sortModel);
  }

  private buildSessionOptions(sortModel: SortModel[]) {
    return {
      queryFingerprint: this.buildQueryFingerprint(sortModel),
      buildLiteRows: async () => {
        const rows = await this.buildOrderedRows(sortModel);
        return rows.map(toLiteRowFromBrowserCard);
      },
    };
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
    this.querySession.invalidate();
  }
}
