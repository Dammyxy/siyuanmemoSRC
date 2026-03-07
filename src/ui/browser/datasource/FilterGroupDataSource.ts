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
import { BrowserQuerySession, toLiteRowFromBrowserCard } from './session/BrowserQuerySession';

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

type FilterGroupPluginLike = CardServicePluginLike & MenuActionPluginLike;

export type FilterGroupDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isQueueDueAdjustAction(actionId: string): actionId is 'postpone' | 'advance' {
  return actionId === 'postpone' || actionId === 'advance';
}

export class FilterGroupDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FilterGroupDataSourceOptions;
  private readonly plugin?: FilterGroupPluginLike;
  private readonly querySession = new BrowserQuerySession('FilterGroupDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;

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
      const sortModel = (params?.sortModel || []) as SortModel[];
      this.lastSortModel = [...sortModel];
      return this.querySession.fetchRows({
        ...this.buildSessionOptions(sortModel),
        startRow: params?.startRow,
        endRow: params?.endRow,
      });
    } catch (error) {
      logger.error('Failed to fetch rows', error);
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
        this.invalidateQuerySession();
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
        this.invalidateQuerySession();

        if (deletion.failedCardIds.length > 0) {
          logger.error('Failed card IDs', { failedCardIds: deletion.failedCardIds });
        }
        return deletion.deletedCount;
      }

      if (actionId === 'set-priority') {
        const result = await setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'FilterGroupDataSource',
        });
        this.invalidateQuerySession();
        return result;
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

  getId(): string {
    return this.id;
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: 'filter-group',
      queueId: QueueType.FilterGroup,
      options: this.options,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.FilterGroup);
    const cards = await queue.getCards();
    const browserCards = cards.map((card, index) => mapQueueFsrsCardToBrowserCard(card, { queueIndex: index + 1 }));
    const filtered = applyQueueFilters(browserCards, this.options, 'headline');
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
