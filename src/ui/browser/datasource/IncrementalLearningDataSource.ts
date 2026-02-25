/**
 * Incremental Learning Data Source
 * 渐进学习队列的浏览器数据源
 */

import type { BrowserCard } from '../types';
import type {
  ICardDataSource,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
} from './types';
import { buildQueueActions } from './MenuActions';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { validateConsumerCardType } from '../../../diagnostics/type-guards';
import {
  adjustBrowserCardsDue,
  applyQueueFilters,
  type CardServicePluginLike,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';
import { mapQueueFsrsCardToBrowserCard } from './QueueBrowserCardMapper';
import { createLogger } from '@/utils/logger';

const logger = createLogger('IncrementalLearningDataSource');

type QueueCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';
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
    | (CardServicePluginLike['context'] & {
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

export class IncrementalLearningDataSource implements ICardDataSource {
  id = 'incremental-learning';
  label = '渐进学习';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: IncrementalLearningDataSourceOptions;
  private readonly plugin?: IncrementalPluginLike;
  private readonly i18n?: I18nDictionary;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options?: IncrementalLearningDataSourceOptions,
    plugin?: IncrementalPluginLike
  ) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;
    this.i18n = plugin?.getContext?.()?.getI18n?.() || plugin?.i18n;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const startTime = Date.now();

    try {
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);
      const cards = await queue.getCards();
      validateConsumerCardType('IncrementalLearningDataSource', cards);

      const browserCards = cards.map((card) => mapQueueFsrsCardToBrowserCard(card));
      const filtered = applyQueueFilters(browserCards, this.options, 'fullContent');
      const sorted = sortBrowserCards(filtered, params?.sortModel || []);

      logger.debug('Fetched rows', {
        totalCards: cards.length,
        filteredCards: filtered.length,
        durationMs: Date.now() - startTime,
      });

      return { rows: sorted, totalCount: sorted.length };
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
        return {
          updated: deletion.deletedCount,
          skipped: deletion.failedCardIds.length,
        };
      }

      if (actionId === 'set-priority') {
        return setBrowserCardsPriority(this.manager, selectedRows, context?.priority ?? 50, {
          scope: 'IncrementalLearningDataSource',
        });
      }

      if (isIncrementalTimeAction(actionId)) {
        return adjustBrowserCardsDue(this.manager, selectedRows, actionId, context, {
          scope: 'IncrementalLearningDataSource',
          postponeFromNow: false,
          allowSpread: false,
        });
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
}
