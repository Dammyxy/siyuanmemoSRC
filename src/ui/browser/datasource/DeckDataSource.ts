import type { BrowserCard } from '../types';
import { CardState as BrowserCardState } from '../types';
import {
  batchReset,
  batchSuspend,
  invalidateCardCache,
} from '../browserService';
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';
import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import type { BrowserDeckSnapshotQuery } from '@/application/queries/browser/browser-deck-query';
import type {
  BrowserActionTarget,
  CardBrowserAction,
  FetchRowsOptions,
  FetchRowsResult,
  IBrowserQueryableDataSource,
  SortModel,
} from './types';
import {
  addToQueue,
  adjustTime,
  buildAddToQueueAction,
  getBaseActions,
  type PluginLike as MenuActionPluginLike,
} from './MenuActions';
import {
  QueueType,
  type IUnifiedDataSourceManagerFacade,
  type QueueAddSource,
} from '@/types/unified-data-source';
import type { RescheduleService } from '@/core/scheduler/rescheduleService';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
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
import {
  reconcileBrowserCardTypes,
  type CardTypeConsistencyDependencies,
} from './cardTypeConsistency';
import { createLogger } from '@/utils/logger';
import { BrowserQuerySession, toLiteRowFromBrowserCard } from './session/BrowserQuerySession';

const logger = createLogger('DeckDataSource');

type DeckCardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only' | 'missing-block-only';

type DeckDataSourceOptions = {
  preset: string;
  currentDocId?: string;
  scopeDocIds?: string[] | null;
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
  source?: QueueAddSource;
};

type BrowserBatchManagerLike = {
  getCards: IUnifiedDataSourceManagerFacade['getCards'];
  updateCard: IUnifiedDataSourceManagerFacade['updateCard'];
  deleteCard: (cardId: string) => Promise<void>;
};

type DeckDataSourceDependencies = {
  reconcileBrowserCardTypes?: typeof reconcileBrowserCardTypes;
  cardTypeConsistencyDeps?: CardTypeConsistencyDependencies;
  browserService?: Pick<IBrowserApplicationService, 'getDeckQuerySnapshot' | 'getDeckRowsByIds'> | null;
};

type I18nContextLike = {
  getI18n?: () => Record<string, string> | undefined;
};

const QUEUE_ADD_ROUTES: Record<string, QueueAddRoute> = {
  'add-to-retrieval-queue': {
    queueType: QueueType.RetrievalPractice,
    actionType: 'retrieval',
  },
  'add-to-retrieval-queue-all': {
    queueType: QueueType.RetrievalPractice,
    actionType: 'retrieval',
    source: 'manual-add-all',
  },
  'add-to-incremental-queue': {
    queueType: QueueType.IncrementalLearning,
    actionType: 'incremental',
  },
  'add-to-incremental-queue-all': {
    queueType: QueueType.IncrementalLearning,
    actionType: 'incremental',
    source: 'manual-add-all',
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

export class DeckDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly plugin?: DeckPluginLike;
  private readonly options: DeckDataSourceOptions;
  private readonly reconcileCardTypes: typeof reconcileBrowserCardTypes;
  private readonly cardTypeConsistencyDeps?: CardTypeConsistencyDependencies;
  private readonly browserService?: Pick<IBrowserApplicationService, 'getDeckQuerySnapshot' | 'getDeckRowsByIds'> | null;
  private readonly querySession = new BrowserQuerySession('DeckDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;

  constructor(
    manager: IUnifiedDataSourceManagerFacade,
    options: DeckDataSourceOptions,
    plugin?: DeckPluginLike,
    deps: DeckDataSourceDependencies = {}
  ) {
    this.manager = manager;
    this.options = options;
    this.plugin = plugin;
    this.reconcileCardTypes = deps.reconcileBrowserCardTypes ?? reconcileBrowserCardTypes;
    this.cardTypeConsistencyDeps = deps.cardTypeConsistencyDeps;
    this.browserService = deps.browserService ?? null;
  }

  private async reconcileBrowserRows<T extends { blockId: string; cardType?: string }>(rows: T[]): Promise<T[]> {
    const reconcile = this.reconcileCardTypes as <TRow extends { blockId: string; cardType?: string }>(
      value: TRow[],
      options?: { deps?: CardTypeConsistencyDependencies }
    ) => Promise<{ rows: TRow[] }>;
    return (await reconcile(rows, {
      deps: this.cardTypeConsistencyDeps,
    })).rows;
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
      logger.error('Failed to fetch deck rows', error);
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

  async getActionTargetsByIds(ids: string[]): Promise<BrowserActionTarget[]> {
    return this.querySession.getActionTargetsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  getSupportedActions(): CardBrowserAction[] {
    const baseActions = getBaseActions((key, fallback) => this.t(key, fallback));
    const actions: CardBrowserAction[] = [baseActions.open, baseActions.deleteCard];

    const addToQueueAction = buildAddToQueueAction({
      retrieval: true,
      incremental: true,
      finalDrill: true,
      filterGroup: true,
      neuralRoam: true,
    }, (key, fallback) => this.t(key, fallback));
    if (addToQueueAction) {
      actions.push(addToQueueAction);
    }

    actions.push(
      baseActions.setPriority,
      baseActions.postpone,
      baseActions.advance,
      baseActions.spread,
      baseActions.reset,
      this.options.preset === 'suspended' ? baseActions.unsuspend : baseActions.suspend,
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

  async performAction(actionId: string, selectedRows: BrowserActionTarget[], context?: DeckActionContext): Promise<unknown> {
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
      this.invalidateQuerySession();
      return;
    }

    if (actionId === 'suspend') {
      const blockIds = selectedRows.map((row) => row.blockId).filter(Boolean);
      await batchSuspend(blockIds, true, this.createBatchManager());
      this.invalidateQuerySession();
      return;
    }

    if (actionId === 'unsuspend') {
      const blockIds = selectedRows.map((row) => row.blockId).filter(Boolean);
      await batchSuspend(blockIds, false, this.createBatchManager());
      this.invalidateQuerySession();
      return;
    }

    if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
      const result = await adjustTime(this.plugin, selectedRows, actionId, context);
      this.invalidateQuerySession();
      return result;
    }

    logger.warn('Unknown action for DeckDataSource', { actionId });
  }

  getId(): string {
    return this.id;
  }

  private async handleDeleteCards(selectedRows: BrowserActionTarget[]): Promise<number> {
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
    this.invalidateQuerySession();
    return deletion.deletedCount;
  }

  private async handleQueueAddAction(route: QueueAddRoute, selectedRows: BrowserActionTarget[]): Promise<unknown> {
    const queue = this.manager.getQueue(route.queueType);
    const result = await addToQueue(queue, selectedRows, route.actionType, route.source ?? 'manual');
    this.invalidateQuerySession();
    return result;
  }

  private async handleReviewSubset(selectedRows: BrowserActionTarget[]): Promise<void> {
    const blockIds = selectedRows.map((row) => String(row.blockId || '')).filter(Boolean);
    if (blockIds.length === 0) {
      return;
    }

    await Promise.resolve(this.plugin?.openSubsetReviewDialog?.(blockIds));
  }

  private async handleSetPriority(selectedRows: BrowserActionTarget[], context?: DeckActionContext): Promise<unknown> {
    const priority = this.resolvePriority(context?.priority);

    const result = await setBrowserCardsPriority(this.manager, selectedRows, priority, {
      scope: 'DeckDataSource',
    });

    invalidateCardCache();
    this.invalidateQuerySession();
    return result;
  }

  private resolvePriority(priority: unknown): number {
    const value = Number(priority);
    if (!Number.isFinite(value)) {
      return 50;
    }
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: 'deck',
      options: this.options,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCard[]> {
    const allCards = await this.manager.getCards();
    let rows = allCards.map((card) => this.convertToBrowserCard(card as DeckCardRecord));
    rows = await this.reconcileBrowserRows(rows);

    rows = applyLegacyPresetFilter(rows, this.options.preset);
    rows = applyCardTypeFilter(rows, this.options.cardType);
    rows = applySimpleQueryFilter(rows, this.options.queryText, { secondaryField: 'fullContent' });

    rows = applyDocFilter(rows, this.options.currentDocId, this.options.scopeDocIds);

    return sortBrowserCards(rows, sortModel);
  }

  private buildBrowserServiceQuery(sortModel: SortModel[]): BrowserDeckSnapshotQuery {
    const cardTypes = this.mapCardTypeFilterToQueryCardTypes(this.options.cardType);
    return {
      preset: this.options.preset as BrowserDeckSnapshotQuery['preset'],
      docId: this.options.currentDocId,
      scopeDocIds: this.options.scopeDocIds,
      searchText: this.options.queryText,
      cardTypes,
      sortModel,
    };
  }

  private mapCardTypeFilterToQueryCardTypes(cardType?: DeckCardTypeFilter): string[] | undefined {
    switch (cardType) {
      case 'topic-only':
        return ['topic'];
      case 'item-only':
        return ['item'];
      case 'concept-only':
        return ['concept'];
      case 'descriptor-only':
        return ['descriptor'];
      case 'missing-block-only':
        return ['missing-block-only'];
      default:
        return undefined;
    }
  }

  private buildSessionOptions(sortModel: SortModel[]) {
    if (this.browserService?.getDeckQuerySnapshot && this.browserService?.getDeckRowsByIds) {
      return {
        queryFingerprint: this.buildQueryFingerprint(sortModel),
        buildLiteRows: async () => {
          const snapshot = await this.browserService!.getDeckQuerySnapshot(
            this.buildBrowserServiceQuery(sortModel)
          );
          return snapshot.rows;
        },
        hydrateRows: async (ids: string[]) => this.browserService!.getDeckRowsByIds(ids),
      };
    }

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

  private convertToBrowserCard(card: DeckCardRecord): BrowserCard {
    const now = Date.now();
    const elapsedDays = card.lastReview ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24)) : 0;
    const retrievability = this.calculateRetrievability(card.stability || 0, elapsedDays);
    const state = this.normalizeBrowserState(card.state);

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
      priority: card.priority ?? 50,
      suspended: isCardDismissed(card),
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

  private normalizeBrowserState(state: FSRSCard['state'] | undefined): BrowserCardState {
    switch (state) {
      case BrowserCardState.Learning:
      case BrowserCardState.Review:
      case BrowserCardState.Relearning:
        return state as BrowserCardState;
      case 4:
        return BrowserCardState.Review;
      default:
        return BrowserCardState.New;
    }
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
