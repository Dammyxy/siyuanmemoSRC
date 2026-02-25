import type { BrowserCard } from '../types';
import { CardState, calculateRetrievability, formatDueDate, formatHistoryDate, truncateContent } from '../types';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  buildQueueActions,
} from './MenuActions';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import {
  adjustBrowserCardsDue,
  applyQueueFilters,
  deleteBrowserCards,
  removeCardsFromQueue,
  setBrowserCardsPriority,
  sortBrowserCards,
} from './DataSourceUtils';

// ✅ 五重筛选：支持的筛选参数
export type RetrievalDataSourceOptions = {
  docId?: string;      // 文档筛选
  preset?: string;     // Preset 筛选
  queryText?: string;  // 搜索查询
  cardType?: 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';  // ✅ 卡片类型筛选
};

export class RetrievalDataSource implements ICardDataSource {
  id = 'retrieval';
  label = 'Retrieval';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: RetrievalDataSourceOptions;
  private readonly plugin?: any;  // 🆕 改为 plugin 引用以访问 ApplicationContext

  constructor(manager: IUnifiedDataSourceManagerFacade, options?: RetrievalDataSourceOptions, plugin?: any) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;  // 🆕 保存 plugin 引用
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    try {
      // 通过统一数据源管理器获取队列实例
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      
      // 获取队列中的所有卡片（FSRSCard 格式）
      const cards = await queue.getCards();
      
      // 🔍 调试：检查第一张卡片的原始数据
      if (cards.length > 0) {
        console.log('[SiYuanMemo][RetrievalDataSource] 📊 Sample FSRSCard data:', {
          id: cards[0].id,
          blockId: cards[0].blockId,
          scheduledDays: cards[0].scheduledDays,
          stability: cards[0].stability,
          difficulty: cards[0].difficulty,
          lastReview: cards[0].lastReview,
          lastReviewDate: cards[0].lastReview ? new Date(cards[0].lastReview) : null,
          due: cards[0].due,
          dueDate: new Date(cards[0].due),
          reps: cards[0].reps,
          lapses: cards[0].lapses,
          state: cards[0].state,
          elapsedDays: cards[0].elapsedDays,
          hasMeta: !!cards[0].meta,
          metaRootId: cards[0].meta?.rootId,
        });
        
        // 🔍 调试：显示所有卡片的 rootId
        console.log('[SiYuanMemo][RetrievalDataSource] 📊 All FSRSCard rootIds:', 
          cards.map(c => ({ blockId: c.blockId, metaRootId: c.meta?.rootId }))
        );
      }
      
      // 转换为 BrowserCard 格式
      const browserCards = cards.map(card => this.convertToBrowserCard(card));
      
      // 🔍 调试：检查转换后的数据
      if (browserCards.length > 0) {
        console.log('[SiYuanMemo][RetrievalDataSource] 📊 Sample BrowserCard data:', {
          blockId: browserCards[0].blockId,
          interval: browserCards[0].interval,
          stability: browserCards[0].stability,
          difficulty: browserCards[0].difficulty,
          retrievability: browserCards[0].retrievability,
          lastReview: browserCards[0].lastReview,
          lastReviewFormatted: browserCards[0].lastReviewFormatted,
          due: browserCards[0].due,
          dueFormatted: browserCards[0].dueFormatted,
          firstReviewFormatted: browserCards[0].firstReviewFormatted,
        });
      }
      
      // 应用筛选条件
      const filtered = applyQueueFilters(browserCards, this.options, 'headline');
      
      // 应用排序
      const sorted = sortBrowserCards(filtered, params?.sortModel || []);
      
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      console.error('[SiYuanMemo][RetrievalDataSource] Failed to fetch rows:', error);
      throw error;
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions({
      withInsert: true,
      withSort: false,
      withPriority: true,
      withTimeAdjust: true,
      withDelete: true,  // 🆕 启用删除操作
    });
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    if (actionId === 'open') return;

    try {
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);

      // 从队列移除
      if (actionId === 'remove-from-current-queue') {
        const result = await removeCardsFromQueue(queue as any, selectedRows, {
          scope: 'RetrievalDataSource',
        });
        return { updated: result.removedCount, skipped: result.failedCount };
      }

      // 删除卡片（使用 CardApplicationService 批量删除）
      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.plugin as any, selectedRows, {
          preferBatch: true,
          scope: 'RetrievalDataSource',
        });
        if (!deletion) {
          return 0;
        }

        if (deletion.failedCardIds.length > 0) {
          console.warn('[SiYuanMemo][RetrievalDataSource] 部分卡片删除失败:', deletion.failedCardIds);
        }
        return {
          updated: deletion.deletedCardIds.map((id) => ({ id })),
          skipped: deletion.failedCardIds.map((id) => ({ id })),
        };
      }

      // 设置优先级
      if (actionId === 'set-priority') {
        return setBrowserCardsPriority(this.manager as any, selectedRows, context?.priority, {
          scope: 'RetrievalDataSource',
        });
      }

      // 时间调整
      if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
        return adjustBrowserCardsDue(this.manager as any, selectedRows, actionId, context, {
          scope: 'RetrievalDataSource',
          postponeFromNow: true,
          allowSpread: true,
        });
      }
    } catch (error) {
      console.error('[SiYuanMemo][RetrievalDataSource] Failed to perform action:', error);
      throw error;
    }
  }

  private convertToBrowserCard(card: FSRSCard): BrowserCard {
    const now = Date.now();
    const elapsedDays = card.lastReview 
      ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
      : 0;
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    const state = this.convertCardState(card.state);
    
    // ✅ 修复：正确处理时间戳（FSRSCard 的时间字段是 number 类型的时间戳）
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    // ✅ 修复：首次复习应该从 createdAt 获取（如果 reps > 0 但没有 createdAt，使用 lastReview）
    let firstReviewDate: Date | null = null;
    if (card.reps > 0) {
      if (card.createdAt) {
        firstReviewDate = new Date(card.createdAt);
      } else if (lastReviewDate) {
        // 降级：如果没有 createdAt，使用 lastReview（不准确但总比没有好）
        firstReviewDate = lastReviewDate;
      }
    }
    
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    const deckId = (card.meta?.deckId as string) || '';
    
    // 转换 CardType 枚举为字符串
    // CardType 枚举的值本身就是字符串 ('item', 'topic', 'concept', 'descriptor', 'incremental', 'webpage')
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    
    // 🔍 调试：检查 rootId 提取
    const extractedRootId = (card.meta?.rootId as string) || '';
    if (!extractedRootId) {
      console.warn('[SiYuanMemo][RetrievalDataSource] ⚠️ Card missing rootId:', {
        blockId: card.blockId,
        hasMeta: !!card.meta,
        metaRootId: card.meta?.rootId,
        metaKeys: card.meta ? Object.keys(card.meta) : [],
      });
    }
    
    return {
      id: card.riffCardId || card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      content,
      fullContent,
      rootId: extractedRootId,
      state,
      stateLabel: this.getStateLabel(state),
      
      // ✅ 到期时间（始终显示具体日期）
      due: dueDate,
      dueFormatted: formatDueDate(dueDate),
      
      // ✅ FSRS 参数（确保有默认值）
      stability: card.stability || 0,
      difficulty: card.difficulty || 0,
      retrievability: retrievability || 0,
      reps: card.reps || 0,
      lapses: card.lapses || 0,
      elapsedDays,
      scheduledDays: card.scheduledDays || 0,
      
      // ✅ 历史时间（始终显示具体日期）
      lastReview: lastReviewDate,
      lastReviewFormatted: formatHistoryDate(lastReviewDate),
      
      // ✅ 间隔天数
      interval: card.scheduledDays || 0,
      
      // ✅ 首次复习（修复：不再使用 lastReview）
      firstReview: firstReviewDate,
      firstReviewFormatted: formatHistoryDate(firstReviewDate),
      
      priority: card.priority || 50,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags || [],
      note: (card.meta?.note as string) || '',
      cardType,
      aFactor: card.aFactor,
      
      // 🆕 传递完整的 meta 字段（用于 Xiuyuan 卡片识别）
      meta: card.meta,
    };
  }

  private convertCardState(state: number): CardState {
    switch (state) {
      case 0: return CardState.New;
      case 1: return CardState.Learning;
      case 2: return CardState.Review;
      case 3: return CardState.Relearning;
      default: return CardState.New;
    }
  }

  private getStateLabel(state: CardState): string {
    switch (state) {
      case CardState.New: return '新卡';
      case CardState.Learning: return '学习中';
      case CardState.Review: return '复习';
      case CardState.Relearning: return '重学';
      default: return '未知';
    }
  }
  
  /**
   * 获取数据源 ID
   * 
   * @returns 数据源 ID
   */
  getId(): string {
    return this.id;
  }
}
