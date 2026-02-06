import type { BrowserCard } from '../types';
import { CardState, calculateRetrievability, formatDate, truncateContent } from '../types';
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
  cardType?: 'all' | 'topic-only' | 'item-only';  // ✅ 卡片类型筛选
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

  constructor(manager: UnifiedDataSourceManager, options?: RetrievalDataSourceOptions) {
    this.manager = manager;
    this.options = options || {};
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    try {
      // 通过统一数据源管理器获取队列实例
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      
      // 获取队列中的所有卡片（FSRSCard 格式）
      const cards = await queue.getCards();
      
      // 转换为 BrowserCard 格式
      const browserCards = cards.map(card => this.convertToBrowserCard(card));
      
      // 应用筛选条件
      const filtered = this.applyFilters(browserCards);
      
      // 应用排序
      const sorted = applySort(filtered, params?.sortModel || []);
      
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      console.error('[RetrievalDataSource] Failed to fetch rows:', error);
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

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
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
        const blockIds = selectedRows.map(row => row.blockId);
        
        let deleted = await batchDelete(blockIds);
        if (deleted === 0 && blockIds.length > 0) {
          console.warn('[RetrievalDataSource] 常规删除失败，自动尝试强制删除...');
          deleted = await batchDelete(blockIds, { force: true });
        }
        return;
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
      console.error('[RetrievalDataSource] Failed to perform action:', error);
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
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    const deckId = (card.meta?.deckId as string) || '';
    
    let cardType: 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
    if (typeof card.type === 'string') {
      cardType = card.type as any;
    }
    
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
      dueFormatted: formatDate(dueDate),
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability,
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays,
      lastReview: lastReviewDate,
      lastReviewFormatted: lastReviewDate ? formatDate(lastReviewDate) : '',
      interval: card.scheduledDays,
      firstReview: lastReviewDate,
      firstReviewFormatted: lastReviewDate ? formatDate(lastReviewDate) : '',
      priority: card.priority || 0,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags,
      note: (card.meta?.note as string) || '',
      cardType,
      aFactor: card.aFactor,
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
