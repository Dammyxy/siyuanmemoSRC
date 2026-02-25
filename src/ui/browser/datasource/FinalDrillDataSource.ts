import type { BrowserCard } from '../types';
import {
  CardState,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
} from '../types';
import type {
  ICardDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
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
import { createLogger } from '@/utils/logger';

const logger = createLogger('FinalDrillDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

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

export class FinalDrillDataSource implements ICardDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FinalDrillDataSourceOptions;
  private readonly plugin?: CardServicePluginLike;

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
      const queue = this.manager.getQueue(QueueType.FinalDrill);
      const cards = await queue.getCards();
      const browserCards = cards.map((card) => this.convertToBrowserCard(card));
      const filtered = applyQueueFilters(browserCards, this.options, 'headline');
      const sorted = sortBrowserCards(filtered, params?.sortModel || []);
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      logger.error('Failed to fetch rows', error);
      throw error;
    }
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
  ): Promise<any> {
    if (actionId === 'open') {
      return;
    }

    try {
      const queue = this.manager.getQueue(QueueType.FinalDrill);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
          scope: 'FinalDrillDataSource',
        });
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

        if (deletion.failedCardIds.length > 0) {
          logger.error('Failed card IDs', { failedCardIds: deletion.failedCardIds });
        }
        return deletion.deletedCount;
      }

      if (actionId === 'set-priority') {
        return setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'FinalDrillDataSource',
        });
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

  private convertToBrowserCard(card: FSRSCard): BrowserCard {
    const now = Date.now();
    const elapsedDays = card.lastReview
      ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
      : 0;
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    const state = this.convertCardState(card.state);
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    const deckId = (card.meta?.deckId as string) || '';
    const cardType = card.type as
      | 'topic'
      | 'item'
      | 'concept'
      | 'descriptor'
      | 'incremental'
      | 'webpage'
      | undefined;

    return {
      id: card.riffCardId || card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      content,
      fullContent,
      rootId: (card.meta?.rootId as string) || '',
      state,
      stateLabel: this.getStateLabel(state),
      due: dueDate,
      dueFormatted: formatDueDate(dueDate),
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability,
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays,
      lastReview: lastReviewDate,
      lastReviewFormatted: formatHistoryDate(lastReviewDate),
      interval: card.scheduledDays,
      firstReview: lastReviewDate,
      firstReviewFormatted: formatHistoryDate(lastReviewDate),
      priority: card.priority ?? 50,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags,
      note: (card.meta?.note as string) || '',
      cardType,
      aFactor: card.aFactor,
      meta: card.meta,
    };
  }

  private convertCardState(state: number): CardState {
    switch (state) {
      case 0:
        return CardState.New;
      case 1:
        return CardState.Learning;
      case 2:
        return CardState.Review;
      case 3:
        return CardState.Relearning;
      default:
        return CardState.New;
    }
  }

  private getStateLabel(state: CardState): string {
    switch (state) {
      case CardState.New:
        return '新卡';
      case CardState.Learning:
        return '学习中';
      case CardState.Review:
        return '复习';
      case CardState.Relearning:
        return '重学';
      default:
        return '未知';
    }
  }
}
