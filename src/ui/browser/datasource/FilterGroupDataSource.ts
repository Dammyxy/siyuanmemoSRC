import type { BrowserCard } from '../types';
import { CardState, calculateRetrievability, formatDueDate, formatHistoryDate, truncateContent } from '../types';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  buildQueueActions,
} from './MenuActions';
import type { UnifiedDataSourceManager } from '../../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import { DeleteCardCommand } from '@/application/commands/card/DeleteCardCommand';

// ✅ 五重筛选：支持的筛选参数
export type FilterGroupDataSourceOptions = {
  docId?: string;      // 文档筛选
  preset?: string;     // Preset 筛选
  queryText?: string;  // 搜索查询
  cardType?: CardTypeFilter;  // ✅ 卡片类型筛选
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

export class FilterGroupDataSource implements ICardDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  private readonly manager: UnifiedDataSourceManager;
  private readonly options: FilterGroupDataSourceOptions;
  private readonly plugin?: any;  // 🆕 改为 plugin 引用以访问 ApplicationContext

  constructor(manager: UnifiedDataSourceManager, options?: FilterGroupDataSourceOptions, plugin?: any) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;  // 🆕 保存 plugin 引用
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    try {
      // 通过统一数据源管理器获取队列实例
      const queue = this.manager.getQueue(QueueType.FilterGroup);
      
      // 获取队列中的所有卡片（FSRSCard 格式）
      const cards = await queue.getCards();
      
      // 转换为 BrowserCard 格式
      const browserCards = cards.map((card, index) => {
        const browserCard = this.convertToBrowserCard(card);
        browserCard.queueIndex = index + 1;
        return browserCard;
      });
      
      // 应用筛选条件
      const filtered = this.applyFilters(browserCards);
      
      // 应用排序
      const sorted = applySort(filtered, params?.sortModel || []);
      
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      console.error('[FilterGroupDataSource] Failed to fetch rows:', error);
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
            // ✅ 修复：item-only 只显示 item 卡片，不包含 concept 和 descriptor
            return c.cardType === 'item' || !c.cardType;  // 缺失 cardType 的默认为 item
          case 'concept-only':
            return c.cardType === 'concept';
          case 'descriptor-only':
            return c.cardType === 'descriptor';
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
      const queue = this.manager.getQueue(QueueType.FilterGroup);

      // 从队列移除
      if (actionId === 'remove-from-current-queue') {
        for (const row of selectedRows) {
          await queue.removeCard(row.fsrsCardId || row.id);
        }
        return;
      }

      // 删除卡片（使用 CardApplicationService）
      if (actionId === 'delete-card') {
        if (!this.plugin) {
          console.error('[FilterGroupDataSource] Plugin not available!');
          return 0;
        }
        
        const cardService = this.plugin.context?.getCardService?.();
        if (!cardService) {
          console.error('[FilterGroupDataSource] CardApplicationService not available!');
          return 0;
        }
        
        const blockIds = selectedRows.map(row => row.blockId);
        let deletedCount = 0;
        
        for (const blockId of blockIds) {
          const command: DeleteCardCommand = { cardId: blockId };
          const result = await cardService.deleteCard(command);
          
          if (result.ok) {
            deletedCount++;
          } else {
            console.error(`[FilterGroupDataSource] Failed to delete card ${blockId}:`, result.error);
          }
        }
        
        console.log(`[FilterGroupDataSource] Deleted ${deletedCount}/${blockIds.length} cards`);
        return deletedCount;
      }

      // 设置优先级
      if (actionId === 'set-priority') {
        const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority))));
        for (const row of selectedRows) {
          const card = await this.manager.getCard(row.fsrsCardId || row.id);
          card.priority = priority;
          await this.manager.updateCard(card);
          // 更新内存中的 priority
          row.priority = priority;
        }
        return { updated: selectedRows, skipped: [] };
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
      console.error('[FilterGroupDataSource] Failed to perform action:', error);
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
    
    // 转换 CardType 枚举为字符串
    // CardType 枚举的值本身就是字符串 ('item', 'topic', 'concept', 'descriptor', 'incremental', 'webpage')
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    
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
      dueFormatted: formatDueDate(dueDate),  // ✅ 使用 formatDueDate
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability,
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays,
      lastReview: lastReviewDate,
      lastReviewFormatted: formatHistoryDate(lastReviewDate),  // ✅ 使用 formatHistoryDate
      interval: card.scheduledDays,
      firstReview: lastReviewDate,
      firstReviewFormatted: formatHistoryDate(lastReviewDate),  // ✅ 使用 formatHistoryDate
      priority: card.priority || 0,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags,
      note: (card.meta?.note as string) || '',
      cardType,
      aFactor: card.aFactor,
      queueIndex: 0, // 会在 fetchRows 中设置
      
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

