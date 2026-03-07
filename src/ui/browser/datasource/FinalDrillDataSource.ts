import type { BrowserCard } from '../types';
import type {
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
  SortModel,
} from './types';
import { buildQueueActions } from './MenuActions';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
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

const logger = createLogger('FinalDrillDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';

type FinalDrillActionContext = {
  priority?: number;
};

type ReorderableQueueLike = {
  reorder?: (cards: FSRSCard[]) => Promise<unknown> | unknown;
};

// 五重筛选：支持的筛选参数
export type FinalDrillDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function hasReorder(value: unknown): value is Required<ReorderableQueueLike> {
  return typeof value === 'object' && value !== null && typeof (value as ReorderableQueueLike).reorder === 'function';
}

export class FinalDrillDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FinalDrillDataSourceOptions;
  private readonly plugin?: CardServicePluginLike;
  private readonly querySession = new BrowserQuerySession('FinalDrillDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FinalDrillDataSourceOptions,
    plugin?: CardServicePluginLike
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
      withSort: true,
      withPriority: true,
      withTimeAdjust: false,
      withDelete: true,
    });
  }

  async performAction(
    actionId: string,
    selectedRows: BrowserCard[],
    context?: FinalDrillActionContext
  ): Promise<unknown> {
    if (actionId === 'open') {
      return;
    }

    try {
      const queue = this.manager.getQueue(QueueType.FinalDrill);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.plugin, selectedRows, {
          preferBatch: false,
          scope: 'FinalDrillDataSource',
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
          scope: 'FinalDrillDataSource',
        });
        this.invalidateQuerySession();
        return result;
      }

      if (actionId === 'auto-sort') {
        const cards = await queue.getCards();
        const sorted = cards.sort((a, b) => {
          const priorityDiff = a.priority - b.priority;
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return a.due - b.due;
        });

        if (!hasReorder(queue)) {
          logger.warn('Queue reorder is unavailable');
          return;
        }

        await Promise.resolve(queue.reorder(sorted));
        this.invalidateQuerySession();
        return;
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
      dataSource: 'final-drill',
      queueId: QueueType.FinalDrill,
      options: this.options,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const queue = this.manager.getQueue(QueueType.FinalDrill);
    const cards = await queue.getCards();
    const browserCards = cards.map((card) => mapQueueFsrsCardToBrowserCard(card));
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
