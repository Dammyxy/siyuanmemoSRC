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
  adjustBrowserCardsDue,
  applyQueueFilters,
  type CardServicePluginLike,
  type QueueDueAdjustAction,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FilterGroupDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

type FilterGroupActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

// 五重筛选：支持的筛选参数
export type FilterGroupDataSourceOptions = {
  docId?: string;
  preset?: string;
  queryText?: string;
  cardType?: QueueCardTypeFilter;
};

function isQueueDueAdjustAction(actionId: string): actionId is QueueDueAdjustAction {
  return actionId === 'postpone' || actionId === 'advance' || actionId === 'spread';
}

export class FilterGroupDataSource implements ICardDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: FilterGroupDataSourceOptions;
  private readonly plugin?: CardServicePluginLike;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: FilterGroupDataSourceOptions,
    plugin?: CardServicePluginLike
  ) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    try {
      const queue = this.manager.getQueue(QueueType.FilterGroup);
      const cards = await queue.getCards();
      const browserCards = cards.map((card, index) => {
        const browserCard = this.convertToBrowserCard(card);
        browserCard.queueIndex = index + 1;
        return browserCard;
      });

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
  ): Promise<any> {
    if (actionId === 'open') {
      return;
    }

    try {
      const queue = this.manager.getQueue(QueueType.FilterGroup);

      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue, selectedRows, {
          scope: 'FilterGroupDataSource',
        });
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

        if (deletion.failedCardIds.length > 0) {
          logger.error('Failed card IDs', { failedCardIds: deletion.failedCardIds });
        }
        return deletion.deletedCount;
      }

      if (actionId === 'set-priority') {
        return setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'FilterGroupDataSource',
        });
      }

      if (isQueueDueAdjustAction(actionId)) {
        return adjustBrowserCardsDue(this.manager, selectedRows, actionId, context, {
          scope: 'FilterGroupDataSource',
          postponeFromNow: false,
          allowSpread: true,
        });
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
      queueIndex: 0,
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
