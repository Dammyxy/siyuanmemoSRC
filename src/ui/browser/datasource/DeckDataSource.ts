import type { BrowserCard } from '../types';
import {
  batchReset,
  batchSuspend,
  invalidateCardCache,
  setBrowserCardPriority,
} from '../browserService';
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';
import type { CardBrowserAction, FetchRowsOptions, FetchRowsResult } from './types';
import {
  BASE_ACTIONS,
  addToQueue,
  adjustTime,
  buildAddToQueueAction,
  type PluginLike as MenuActionPluginLike,
} from './MenuActions';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { RescheduleService } from '@/core/scheduler/rescheduleService';
import type { FSRSCard } from '@/types/card';
import {
  applyCardTypeFilter,
  applyDocFilter,
  applyLegacyPresetFilter,
  applySimpleQueryFilter,
  type CardServicePluginLike,
  deleteBrowserCards,
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DeckDataSource');

type DeckCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

type DeckDataSourceOptions = {
  preset: string;
  currentDocId?: string;
  queryText?: string;
  cardType?: DeckCardTypeFilter;
};

type DeckActionContext = {
  priority?: number;
  days?: number;
  maxDays?: number;
  config?: unknown;
};

type DeckCardRecord = FSRSCard & {
  content?: string;
  deckId?: string;
  rootId?: string;
  riffCardId?: string;
};

type DeckPluginLike = MenuActionPluginLike &
  CardServicePluginLike & {
  i18n?: Record<string, string>;
  storage?: unknown;
  rescheduleService?: RescheduleService;
  openSubsetReviewDialog?: (blockIds: string[]) => Promise<void> | void;
};

type QueueAddActionType = 'retrieval' | 'incremental' | 'final-drill' | 'filter-group' | 'neural-roam';

type QueueAddRoute = {
  queueType: QueueType;
  actionType: QueueAddActionType;
};

type BrowserBatchManagerLike = {
  getCards: IUnifiedDataSourceManagerFacade['getCards'];
  updateCard: IUnifiedDataSourceManagerFacade['updateCard'];
  deleteCard: (cardId: string) => Promise<void>;
};

type I18nContextLike = {
  getI18n?: () => Record<string, string> | undefined;
};

const QUEUE_ADD_ROUTES: Record<string, QueueAddRoute> = {
  'add-to-retrieval-queue': {
    queueType: QueueType.RetrievalPractice,
    actionType: 'retrieval',
  },
  'add-to-incremental-queue': {
    queueType: QueueType.IncrementalLearning,
    actionType: 'incremental',
  },
  'add-to-deliberate-queue': {
    queueType: QueueType.FinalDrill,
    actionType: 'final-drill',
  },
  'add-to-final-drill-queue': {
    queueType: QueueType.FinalDrill,
    actionType: 'final-drill',
  },
  'add-to-filter-group-queue': {
    queueType: QueueType.FilterGroup,
    actionType: 'filter-group',
  },
  'add-to-neural-roam-queue': {
    queueType: QueueType.NeuralRoam,
    actionType: 'neural-roam',
  },
};

export class DeckDataSource implements ICardDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly plugin?: DeckPluginLike;
  private readonly options: DeckDataSourceOptions;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options: DeckDataSourceOptions,
    plugin?: DeckPluginLike
  ) {
    this.manager = manager;
    this.options = options;
    this.plugin = plugin;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    try {
      const allCards = await this.manager.getCards();
      let rows = allCards.map((card) => this.convertToBrowserCard(card as DeckCardRecord));

      rows = applyLegacyPresetFilter(rows, this.options.preset);
      rows = applyCardTypeFilter(rows, this.options.cardType);
      rows = applySimpleQueryFilter(rows, this.options.queryText, { secondaryField: 'fullContent' });

      if (this.options.currentDocId === '__lost__') {
        rows = rows.filter((card) => !String(card.rootId || ''));
      } else {
        rows = applyDocFilter(rows, this.options.currentDocId);
      }

      const sorted = sortBrowserCards(rows, params?.sortModel || []);
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      logger.error('Failed to fetch deck rows', error);
      throw error;
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    const actions: CardBrowserAction[] = [BASE_ACTIONS.open, BASE_ACTIONS.deleteCard];

    const addToQueueAction = buildAddToQueueAction({
      retrieval: true,
      incremental: true,
      finalDrill: true,
      filterGroup: true,
      neuralRoam: true,
    });
    if (addToQueueAction) {
      actions.push(addToQueueAction);
    }

    actions.push(
      BASE_ACTIONS.setPriority,
      BASE_ACTIONS.postpone,
      BASE_ACTIONS.advance,
      BASE_ACTIONS.spread,
      BASE_ACTIONS.reset
    );

    if (this.plugin?.openSubsetReviewDialog) {
      actions.unshift({
        id: 'review-subset',
        label: this.t('reviewSubset', 'Review Subset'),
        icon: 'iconPlay',
      });
    }

    return actions;
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: DeckActionContext): Promise<any> {
    if (actionId === 'open') {
      return;
    }

    if (actionId === 'delete-card') {
      return this.handleDeleteCards(selectedRows);
    }

    const queueRoute = QUEUE_ADD_ROUTES[actionId];
    if (queueRoute) {
      return this.handleQueueAddAction(queueRoute, selectedRows);
    }

    if (actionId === 'review-subset') {
      return this.handleReviewSubset(selectedRows);
    }

    if (actionId === 'set-priority') {
      return this.handleSetPriority(selectedRows, context);
    }

    if (actionId === 'reset') {
      const blockIds = selectedRows.map((row) => row.blockId).filter(Boolean);
      await batchReset(blockIds, this.createBatchManager());
      return;
    }

    if (actionId === 'suspend') {
      const blockIds = selectedRows.map((row) => row.blockId).filter(Boolean);
      await batchSuspend(blockIds, true, this.createBatchManager());
      return;
    }

    if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
      return adjustTime(this.plugin, selectedRows, actionId, context);
    }

    logger.warn('Unknown action for DeckDataSource', { actionId });
  }

  getId(): string {
    return this.id;
  }

  private async handleDeleteCards(selectedRows: BrowserCard[]): Promise<number> {
    const deletion = await deleteBrowserCards(this.plugin, selectedRows, {
      preferBatch: false,
      scope: 'DeckDataSource',
    });
    if (!deletion) {
      return 0;
    }

    if (deletion.failedCardIds.length > 0) {
      logger.error('Failed to delete partial cards', { failedCardIds: deletion.failedCardIds });
    }
    return deletion.deletedCount;
  }

  private async handleQueueAddAction(route: QueueAddRoute, selectedRows: BrowserCard[]): Promise<any> {
    const queue = this.manager.getQueue(route.queueType);
    return addToQueue(queue, selectedRows, route.actionType);
  }

  private async handleReviewSubset(selectedRows: BrowserCard[]): Promise<void> {
    const blockIds = selectedRows.map((row) => String(row.blockId || '')).filter(Boolean);
    if (blockIds.length === 0) {
      return;
    }

    await Promise.resolve(this.plugin?.openSubsetReviewDialog?.(blockIds));
  }

  private async handleSetPriority(selectedRows: BrowserCard[], context?: DeckActionContext): Promise<any> {
    const priority = this.resolvePriority(context?.priority);

    const result = await setBrowserCardsPriority(this.manager, selectedRows, priority, {
      scope: 'DeckDataSource',
    });

    await Promise.all(
      result.updated
        .map((row) => String(row.blockId || ''))
        .filter(Boolean)
        .map((blockId) => setBrowserCardPriority(blockId, priority))
    );

    invalidateCardCache();
    return result;
  }

  private resolvePriority(priority: unknown): number {
    const value = Number(priority);
    if (!Number.isFinite(value)) {
      return 50;
    }
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  private convertToBrowserCard(card: DeckCardRecord): BrowserCard {
    const now = Date.now();
    const elapsedDays = card.lastReview ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24)) : 0;
    const retrievability = this.calculateRetrievability(card.stability || 0, elapsedDays);
    const state = card.state || 0;

    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    let firstReviewDate: Date | null = null;
    if ((card.reps || 0) > 0) {
      if (card.createdAt) {
        firstReviewDate = new Date(card.createdAt);
      } else if (lastReviewDate) {
        firstReviewDate = lastReviewDate;
      }
    }

    const fullContent = (card.meta?.content as string) || card.content || '';
    const content = this.truncateContent(fullContent, 100);
    const deckId = (card.meta?.deckId as string) || card.deckId || '';
    const cardType = card.type as
      | 'topic'
      | 'item'
      | 'concept'
      | 'descriptor'
      | 'incremental'
      | 'webpage'
      | undefined;
    const rootId = (card.meta?.rootId as string) || card.rootId || '';

    return {
      id: card.riffCardId || card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      content,
      fullContent,
      rootId,
      state,
      stateLabel: this.getStateLabel(state),
      due: dueDate,
      dueFormatted: this.formatDueDate(dueDate),
      stability: card.stability || 0,
      difficulty: card.difficulty || 0,
      retrievability: retrievability || 0,
      reps: card.reps || 0,
      lapses: card.lapses || 0,
      elapsedDays,
      scheduledDays: card.scheduledDays || 0,
      lastReview: lastReviewDate,
      lastReviewFormatted: this.formatHistoryDate(lastReviewDate),
      interval: card.scheduledDays || 0,
      firstReview: firstReviewDate,
      firstReviewFormatted: this.formatHistoryDate(firstReviewDate),
      priority: card.priority || 50,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags || [],
      note: (card.meta?.note as string) || '',
      cardType,
      aFactor: card.aFactor,
      meta: card.meta,
    };
  }

  private calculateRetrievability(stability: number, elapsedDays: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + elapsedDays / (9 * stability), -1);
  }

  private truncateContent(content: string, maxLength: number): string {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  private formatDueDate(date: Date): string {
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatHistoryDate(date: Date | null): string {
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private getStateLabel(state: number): string {
    switch (state) {
      case 0:
        return '新卡';
      case 1:
        return '学习中';
      case 2:
        return '复习';
      case 3:
        return '重学';
      default:
        return '未知';
    }
  }

  private createBatchManager(): BrowserBatchManagerLike {
    return {
      getCards: (filter) => this.manager.getCards(filter),
      updateCard: (card) => this.manager.updateCard(card),
      deleteCard: async (cardId: string) => {
        if (typeof this.manager.deleteCard !== 'function') {
          throw new Error('UnifiedDataSourceManager.deleteCard is unavailable');
        }
        await this.manager.deleteCard(cardId);
      },
    };
  }

  private hasI18nContext(value: unknown): value is I18nContextLike {
    return typeof value === 'object' && value !== null && 'getI18n' in value;
  }

  private t(key: string, fallback: string): string {
    const context = this.plugin?.getContext?.();
    if (this.hasI18nContext(context)) {
      const i18n = context.getI18n?.();
      if (i18n?.[key]) {
        return i18n[key];
      }
    }

    return this.plugin?.i18n?.[key] || fallback;
  }
}
