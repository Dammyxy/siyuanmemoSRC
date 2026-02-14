/**
 * Incremental Learning Data Source
 * 渐进学习队列的浏览器数据源
 * 
 * 使用统一数据源架构，通过 UnifiedDataSourceManager 访问队列数据。
 * 防止数据污染问题。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md
 */

import type { BrowserCard } from '../types';
import { CardState, calculateRetrievability, formatDueDate, formatHistoryDate, truncateContent } from '../types';
import { batchDelete } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import type { UnifiedDataSourceManager } from '../../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import { validateConsumerCardType } from '../../../diagnostics/type-guards';

export type IncrementalLearningDataSourceOptions = {
  docId?: string;      // 文档筛选
  preset?: string;     // Preset 筛选
  queryText?: string;  // 搜索查询
  cardType?: 'all' | 'topic-only' | 'item-only';  // 卡片类型筛选
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

export class IncrementalLearningDataSource implements ICardDataSource {
  id = 'incremental-learning';
  label = '渐进学习';

  private readonly manager: UnifiedDataSourceManager;
  private readonly options: IncrementalLearningDataSourceOptions;

  constructor(manager: UnifiedDataSourceManager, options?: IncrementalLearningDataSourceOptions) {
    this.manager = manager;
    this.options = options || {};
    
    console.log('[IncrementalLearningDataSource] Initialized with unified data source manager');
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const startTime = Date.now();
    
    try {
      console.log('[IncrementalLearningDataSource] Fetching rows from unified data source');
      
      // 通过统一数据源管理器获取队列实例
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);
      
      // 获取队列中的所有卡片（FSRSCard 格式）
      const cards = await queue.getCards();
      
      console.log(`[IncrementalLearningDataSource] Loaded ${cards.length} cards from queue`);
      
      // 运行时类型验证（开发模式）
      validateConsumerCardType('IncrementalLearningDataSource', cards);
      
      // 转换为 BrowserCard 格式
      const browserCards = cards.map(card => this.convertToBrowserCard(card));
      
      // 应用筛选条件
      const filtered = this.applyFilters(browserCards);
      
      // 应用排序
      const sorted = applySort(filtered, params?.sortModel || []);
      
      // 记录加载完成
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`[IncrementalLearningDataSource] Fetched rows successfully:`, {
        totalCards: cards.length,
        filteredCards: filtered.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
      
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      // 记录详细的错误日志
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.error('[IncrementalLearningDataSource] Failed to fetch rows:', {
        error: errorMessage,
        stack: errorStack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
      
      // 重新抛出错误，让调用者处理
      throw new Error(`加载渐进学习队列数据失败: ${errorMessage}`);
    }
  }

  // 应用筛选条件
  private applyFilters(cards: BrowserCard[]): BrowserCard[] {
    let result = cards;

    // 文档筛选（使用 rootId）
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
            return c.state === CardState.New;
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
                 c.fullContent?.toLowerCase().includes(query);
        });
      }
    }

    // 卡片类型筛选
    if (this.options.cardType && this.options.cardType !== 'all') {
      console.log(`[IncrementalLearningDataSource] Applying cardType filter: ${this.options.cardType}`);
      console.log(`[IncrementalLearningDataSource] Sample cardTypes before filter:`, result.slice(0, 5).map(c => ({ blockId: c.blockId, cardType: c.cardType })));
      
      result = result.filter(c => {
        switch (this.options.cardType) {
          case 'topic-only':
            return c.cardType === 'topic';
          case 'item-only':
            return c.cardType === 'item';
          default:
            return true;
        }
      });
      
      console.log(`[IncrementalLearningDataSource] After cardType filter: ${result.length} cards`);
      console.log(`[IncrementalLearningDataSource] Sample cardTypes after filter:`, result.slice(0, 5).map(c => ({ blockId: c.blockId, cardType: c.cardType })));
    }

    return result;
  }
  
  /**
   * 将 FSRSCard 转换为 BrowserCard
   * 
   * @param card FSRS 卡片
   * @returns 浏览器卡片
   */
  private convertToBrowserCard(card: FSRSCard): BrowserCard {
    // 检查数据完整性
    const isIncomplete = card.meta?.isIncomplete === true;
    if (isIncomplete) {
      console.warn('[IncrementalLearningDataSource] Converting incomplete FSRSCard:', {
        id: card.id,
        blockId: card.blockId,
        hasRiffCardId: !!card.riffCardId,
      });
    }
    
    // 计算经过的天数
    const now = Date.now();
    const elapsedDays = card.lastReview 
      ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
      : 0;
    
    // 计算 Retrievability
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    
    // 转换卡片状态
    const state = this.convertCardState(card.state);
    
    // 将时间戳转换为 Date 对象
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    // 格式化日期
    const dueFormatted = formatDueDate(dueDate);  // ✅ 使用 formatDueDate
    const lastReviewFormatted = formatHistoryDate(lastReviewDate);  // ✅ 使用 formatHistoryDate
    const firstReviewFormatted = formatHistoryDate(lastReviewDate);  // ✅ 使用 formatHistoryDate
    
    // 从 meta 字段获取内容
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    
    // 从 meta 字段获取 deckId
    const deckId = (card.meta?.deckId as string) || '';
    
    // 转换 CardType 枚举为字符串
    // CardType 枚举的值本身就是字符串 ('item', 'topic', 'incremental', 'webpage')
    const cardType = card.type as 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
    
    // 🔍 调试日志：检查 cardType 转换
    if (!cardType || (cardType !== 'item' && cardType !== 'topic' && cardType !== 'incremental' && cardType !== 'webpage')) {
      console.warn('[IncrementalLearningDataSource] Invalid cardType:', {
        blockId: card.blockId,
        originalType: card.type,
        convertedType: cardType,
        typeOfOriginal: typeof card.type,
      });
    }
    
    return {
      id: card.riffCardId || card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      content,
      fullContent,
      rootId: (card.meta?.rootId as string) || '',
      
      // FSRS 状态
      state,
      stateLabel: this.getStateLabel(state),
      due: dueDate,
      dueFormatted,
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability,
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays,
      lastReview: lastReviewDate,
      lastReviewFormatted,
      
      // 新增字段
      interval: card.scheduledDays,
      firstReview: lastReviewDate,
      firstReviewFormatted,
      
      // 自定义属性
      priority: card.priority || 0,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags,
      note: (card.meta?.note as string) || '',
      
      // Topic/Item 区分
      cardType,
      aFactor: card.aFactor,
    };
  }
  
  /**
   * 转换卡片状态
   * 
   * @param state FSRS 卡片状态
   * @returns 浏览器卡片状态
   */
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
  
  /**
   * 获取状态标签
   * 
   * @param state 卡片状态
   * @returns 状态标签
   */
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

  getSupportedActions(): CardBrowserAction[] {
    // 渐进学习队列支持的操作：
    // - 从队列移除
    // - 删除卡片
    // - 设置优先级
    // - 时间调整
    // 注意：不支持插入操作，因为渐进学习队列是动态队列
    return [
      {
        id: 'remove-from-current-queue',
        label: '从队列移除',
        icon: 'iconMin',
      },
      {
        id: 'delete-card',
        label: '删除卡片',
        icon: 'iconTrashcan',
        danger: true,
      },
      {
        id: 'set-priority',
        label: '设置优先级',
        icon: 'iconSort',
      },
      {
        id: 'postpone',
        label: '推迟',
        icon: 'iconForward',
      },
      {
        id: 'advance',
        label: '提前',
        icon: 'iconBack',
      },
      {
        id: 'spread',
        label: '分散',
        icon: 'iconSpread',
      },
    ];
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
    if (actionId === 'open') return;

    try {
      console.log(`[IncrementalLearningDataSource] Performing action: ${actionId} on ${selectedRows.length} cards`);
      
      // 获取队列实例
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);

      // 从队列移除
      if (actionId === 'remove-from-current-queue') {
        for (const row of selectedRows) {
          await queue.removeCard(row.fsrsCardId || row.id);
        }
        console.log(`[IncrementalLearningDataSource] Removed ${selectedRows.length} cards from queue`);
        return;
      }

      // 删除卡片（完全删除）
      if (actionId === 'delete-card') {
        const blockIds = selectedRows.map(row => row.blockId);
        
        // 第一次尝试：常规删除
        let deleted = await batchDelete(blockIds);
        
        // 如果删除失败，自动尝试强制删除
        if (deleted === 0 && blockIds.length > 0) {
          console.warn('[IncrementalLearningDataSource] 常规删除失败，自动尝试强制删除...');
          deleted = await batchDelete(blockIds, { force: true });
        }
        
        console.log(`[IncrementalLearningDataSource] Deleted ${deleted} cards`);
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
        console.log(`[IncrementalLearningDataSource] Set priority to ${priority} for ${selectedRows.length} cards`);
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
            // 推迟：增加到期日期
            newDue = card.due + days * 24 * 60 * 60 * 1000;
          } else if (actionId === 'advance') {
            // 提前：减少到期日期
            newDue = card.due - days * 24 * 60 * 60 * 1000;
          } else if (actionId === 'spread') {
            // 分散：在指定天数范围内均匀分布
            const offset = Math.floor((i / selectedRows.length) * days * 24 * 60 * 60 * 1000);
            newDue = card.due + offset;
          }
          
          card.due = newDue;
          await this.manager.updateCard(card);
        }
        
        console.log(`[IncrementalLearningDataSource] ${actionId} ${selectedRows.length} cards by ${days} days`);
        return;
      }
      
      console.warn(`[IncrementalLearningDataSource] Unknown action: ${actionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IncrementalLearningDataSource] Failed to perform action ${actionId}:`, errorMessage);
      throw new Error(`执行操作失败 (${actionId}): ${errorMessage}`);
    }
  }
}
