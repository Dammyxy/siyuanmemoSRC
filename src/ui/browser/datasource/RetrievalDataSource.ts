import type { BrowserCard } from '../types';
import { CardState, calculateRetrievability, formatDueDate, formatHistoryDate, truncateContent } from '../types';
import { batchDelete } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  buildQueueActions,
} from './MenuActions';
import type { UnifiedDataSourceManager } from '../../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';

// ✅ 五重筛选：支持的筛选参数
export type RetrievalDataSourceOptions = {
  docId?: string;      // 文档筛选
  preset?: string;     // Preset 筛选
  queryText?: string;  // 搜索查询
  cardType?: 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';  // ✅ 卡片类型筛选
};

function applySort(rows: BrowserCard[], sortModel: SortModel[]): BrowserCard[] {
  if (!sortModel?.length) return rows;
  const [{ colId, sort }] = sortModel;
  const dir = sort === 'desc' ? -1 : 1;
  const key = String(colId || '');
  const copy = [...rows];
  copy.sort((a: any, b: any) => {
    const av = (a as any)?.[key];
    const bv = (b as any)?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * dir;
    if (bv == null) return 1 * dir;
    if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return copy;
}

export class RetrievalDataSource implements ICardDataSource {
  id = 'retrieval';
  label = 'Retrieval';

  private readonly manager: UnifiedDataSourceManager;
  private readonly options: RetrievalDataSourceOptions;
  private readonly storage?: any;  // 🆕 添加 storage 引用

  constructor(manager: UnifiedDataSourceManager, options?: RetrievalDataSourceOptions, storage?: any) {
    this.manager = manager;
    this.options = options || {};
    this.storage = storage;  // 🆕 保存 storage 引用
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    try {
      // 通过统一数据源管理器获取队列实例
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      
      // 获取队列中的所有卡片（FSRSCard 格式）
      const cards = await queue.getCards();
      
      // 🔍 调试：检查第一张卡片的原始数据
      if (cards.length > 0) {
        console.log('[SiyuanMemo][RetrievalDataSource] 📊 Sample FSRSCard data:', {
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
        console.log('[SiyuanMemo][RetrievalDataSource] 📊 All FSRSCard rootIds:', 
          cards.map(c => ({ blockId: c.blockId, metaRootId: c.meta?.rootId }))
        );
      }
      
      // 转换为 BrowserCard 格式
      const browserCards = cards.map(card => this.convertToBrowserCard(card));
      
      // 🔍 调试：检查转换后的数据
      if (browserCards.length > 0) {
        console.log('[SiyuanMemo][RetrievalDataSource] 📊 Sample BrowserCard data:', {
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
      const filtered = this.applyFilters(browserCards);
      
      // 应用排序
      const sorted = applySort(filtered, params?.sortModel || []);
      
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      console.error('[SiyuanMemo][RetrievalDataSource] Failed to fetch rows:', error);
      throw error;
    }
  }

  // ✅ 四重筛选：应用筛选条件
  private applyFilters(cards: BrowserCard[]): BrowserCard[] {
    let result = cards;

    // 文档筛选（使用 rootId 而非 boxId）
    if (this.options.docId) {
      result = result.filter(c => c.rootId === this.options.docId);
    }

    // Preset 筛选
    if (this.options.preset && this.options.preset !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      result = result.filter(c => {
        switch (this.options.preset) {
          case 'due':
            return c.due && new Date(c.due) <= today;
          case 'overdue':
            return c.due && new Date(c.due) < today;
          case 'new':
            return c.state === 0; // New
          case 'leech':
            return (c.lapses || 0) > 0;
          default:
            return true;
        }
      });
    }

    // 搜索筛选（简单关键词搜索）
    if (this.options.queryText) {
      const query = this.options.queryText.toLowerCase().trim();
      if (query && !query.startsWith('tag:') && !query.startsWith('deck:') && !query.startsWith('state:') && !query.startsWith('doc:')) {
        result = result.filter(c => {
          return c.content?.toLowerCase().includes(query) ||
                 (c as any).headline?.toLowerCase().includes(query);
        });
      }
    }

    // 卡片类型筛选
    if (this.options.cardType && this.options.cardType !== 'all') {
      result = result.filter(c => {
        switch (this.options.cardType) {
          case 'topic-only':
            // Topic 类型包括：topic（增量阅读）
            return c.cardType === 'topic';
          case 'item-only':
            // Item 类型包括：item（普通闪卡）、concept（概念卡）、descriptor（描述符卡）
            // 因为 concept 和 descriptor 都使用 FSRS 调度器，在功能上属于 item 类别
            return c.cardType === 'item' || c.cardType === 'concept' || c.cardType === 'descriptor';
          default:
            return true;
        }
      });
    }

    return result;
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
        for (const row of selectedRows) {
          await queue.removeCard(row.fsrsCardId || row.id);
        }
        return;
      }

      // 删除卡片（完全删除）
      if (actionId === 'delete-card') {
        if (!this.storage) {
          console.error('[SiyuanMemo][RetrievalDataSource] Storage not available!');
          return 0;
        }
        
        const blockIds = selectedRows.map(row => row.blockId);
        let deleted = await batchDelete(blockIds, this.storage);
        
        if (deleted === 0 && blockIds.length > 0) {
          console.warn('[SiyuanMemo][RetrievalDataSource] 常规删除失败，自动尝试强制删除...');
          deleted = await batchDelete(blockIds, this.storage);
        }
        return deleted;
      }

      // 设置优先级
      if (actionId === 'set-priority') {
        const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority))));
        for (const row of selectedRows) {
          const card = await this.manager.getCard(row.fsrsCardId || row.id);
          card.priority = priority;
          await this.manager.updateCard(card);
        }
        return;
      }

      // 时间调整
      if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
        const days = Math.floor(Number(context?.days || 1));
        for (let i = 0; i < selectedRows.length; i++) {
          const row = selectedRows[i];
          const card = await this.manager.getCard(row.fsrsCardId || row.id);
          
          let newDue = card.due;
          if (actionId === 'postpone') {
            newDue = card.due + days * 24 * 60 * 60 * 1000;
          } else if (actionId === 'advance') {
            newDue = card.due - days * 24 * 60 * 60 * 1000;
          } else if (actionId === 'spread') {
            const offset = Math.floor((i / selectedRows.length) * days * 24 * 60 * 60 * 1000);
            newDue = card.due + offset;
          }
          
          card.due = newDue;
          await this.manager.updateCard(card);
        }
        return;
      }
    } catch (error) {
      console.error('[SiyuanMemo][RetrievalDataSource] Failed to perform action:', error);
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
      console.warn('[SiyuanMemo][RetrievalDataSource] ⚠️ Card missing rootId:', {
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
}
