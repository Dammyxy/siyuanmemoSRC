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
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import { validateConsumerCardType } from '../../../diagnostics/type-guards';
import {
  applyQueueFilters,
  deleteBrowserCards,
  sortBrowserCards,
} from './DataSourceUtils';

export type IncrementalLearningDataSourceOptions = {
  docId?: string;      // 文档筛选
  preset?: string;     // Preset 筛选
  queryText?: string;  // 搜索查询
  cardType?: CardTypeFilter;  // 卡片类型筛选
};

type I18nDictionary = Record<string, string>;

export class IncrementalLearningDataSource implements ICardDataSource {
  id = 'incremental-learning';
  label = '渐进学习';

  private readonly manager: IUnifiedDataSourceManagerFacade;
  private readonly options: IncrementalLearningDataSourceOptions;
  private readonly plugin?: any;  // 🆕 改为 plugin 引用以访问 ApplicationContext
  private readonly i18n?: I18nDictionary;

  constructor(manager: IUnifiedDataSourceManagerFacade, options?: IncrementalLearningDataSourceOptions, plugin?: any) {
    this.manager = manager;
    this.options = options || {};
    this.plugin = plugin;  // 🆕 保存 plugin 引用
    this.i18n = this.plugin?.getContext?.()?.getI18n?.() || this.plugin?.i18n;
    
    console.log('[SiYuanMemo][IncrementalLearningDataSource] Initialized with unified data source manager');
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const startTime = Date.now();
    
    try {
      console.log('[SiYuanMemo][IncrementalLearningDataSource] Fetching rows from unified data source');
      
      // 通过统一数据源管理器获取队列实例
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);
      
      // 获取队列中的所有卡片（FSRSCard 格式）
      const cards = await queue.getCards();
      
      console.log(`[SiYuanMemo][IncrementalLearningDataSource] Loaded ${cards.length} cards from queue`);
      
      // 运行时类型验证（开发模式）
      validateConsumerCardType('IncrementalLearningDataSource', cards);
      
      // 转换为 BrowserCard 格式
      const browserCards = cards.map(card => this.convertToBrowserCard(card));
      
      // 应用筛选条件
      const filtered = applyQueueFilters(browserCards, this.options, 'fullContent');
      
      // 应用排序
      const sorted = sortBrowserCards(filtered, params?.sortModel || []);
      
      // 记录加载完成
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`[SiYuanMemo][IncrementalLearningDataSource] Fetched rows successfully:`, {
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
      
      console.error('[SiYuanMemo][IncrementalLearningDataSource] Failed to fetch rows:', {
        error: errorMessage,
        stack: errorStack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
      
      // 重新抛出错误，让调用者处理
      throw new Error(`加载渐进学习队列数据失败: ${errorMessage}`);
    }
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
      console.warn('[SiYuanMemo][IncrementalLearningDataSource] Converting incomplete FSRSCard:', {
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
    // CardType 枚举的值本身就是字符串 ('item', 'topic', 'concept', 'descriptor', 'incremental', 'webpage')
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    
    // 🔍 调试日志：检查 cardType 转换
    if (!cardType || (
      cardType !== 'item' && 
      cardType !== 'topic' && 
      cardType !== 'concept' && 
      cardType !== 'descriptor' && 
      cardType !== 'incremental' && 
      cardType !== 'webpage'
    )) {
      console.warn('[SiYuanMemo][IncrementalLearningDataSource] Invalid cardType:', {
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
      priority: card.priority ?? 50,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags,
      note: (card.meta?.note as string) || '',
      
      // Topic/Item 区分
      cardType,
      aFactor: card.aFactor,
      
      // 🆕 传递完整的 meta 字段（用于 Xiuyuan 卡片识别）
      meta: card.meta,
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

  private t(key: string, fallback: string): string {
    return this.i18n?.[key] || fallback;
  }

  getSupportedActions(): CardBrowserAction[] {
    // 渐进学习队列支持的操作：
    // - 打开
    // - 从队列移除
    // - 删除卡片
    // - 设置优先级
    // - 时间调整
    // 注意：不支持插入操作，因为渐进学习队列是动态队列
    return [
      {
        id: 'open',
        label: this.t('openInTab', 'Open'),
        icon: 'iconOpen',
      },
      {
        id: 'remove-from-current-queue',
        label: this.t('removeFromQueue', 'Remove from Queue'),
        icon: 'iconMin',
      },
      {
        id: 'delete-card',
        label: this.t('deleteCard', 'Remove Card'),
        icon: 'iconTrashcan',
        danger: true,
      },
      {
        id: 'set-priority',
        label: this.t('setPriority', 'Set Priority'),
        icon: 'iconSort',
      },
      {
        id: 'postpone',
        label: this.t('postpone', 'Postpone'),
        icon: 'iconForward',
      },
      {
        id: 'advance',
        label: this.t('advance', 'Advance'),
        icon: 'iconBack',
      },
      // ❌ 移除：分散功能已在工具栏上，不需要在右键菜单重复
      // {
      //   id: 'spread',
      //   label: '分散',
      //   icon: 'iconSpread',
      // },
    ];
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    if (actionId === 'open') return;

    try {
      console.log(`[SiYuanMemo][IncrementalLearningDataSource] Performing action: ${actionId} on ${selectedRows.length} cards`);
      
      // 获取队列实例
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);

      // 从队列移除
      if (actionId === 'remove-from-current-queue') {
        for (const row of selectedRows) {
          await queue.removeCard(row.fsrsCardId || row.id);
        }
        console.log(`[SiYuanMemo][IncrementalLearningDataSource] Removed ${selectedRows.length} cards from queue`);
        return;
      }

      // 删除卡片（使用 CardApplicationService）
      if (actionId === 'delete-card') {
        const deletion = await deleteBrowserCards(this.plugin as any, selectedRows, {
          preferBatch: false,
          scope: 'IncrementalLearningDataSource',
        });
        if (!deletion) {
          return 0;
        }

        console.log(
          `[SiYuanMemo][IncrementalLearningDataSource] Deleted ${deletion.deletedCount}/${deletion.attemptedCount} cards`
        );
        if (deletion.failedCardIds.length > 0) {
          console.error('[SiYuanMemo][IncrementalLearningDataSource] Failed card IDs:', deletion.failedCardIds);
        }
        return deletion.deletedCount;
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
        console.log(`[SiYuanMemo][IncrementalLearningDataSource] Set priority to ${priority} for ${selectedRows.length} cards`);
        return { updated: selectedRows, skipped: [] };
      }

      // 时间调整
      if (actionId === 'postpone' || actionId === 'advance') {
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
          }
          // ❌ 移除：spread 功能已在工具栏上，不需要在右键菜单重复
          
          card.due = newDue;
          await this.manager.updateCard(card);
        }
        
        console.log(`[SiYuanMemo][IncrementalLearningDataSource] ${actionId} ${selectedRows.length} cards by ${days} days`);
        return;
      }
      
      console.warn(`[SiYuanMemo][IncrementalLearningDataSource] Unknown action: ${actionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SiYuanMemo][IncrementalLearningDataSource] Failed to perform action ${actionId}:`, errorMessage);
      throw new Error(`执行操作失败 (${actionId}): ${errorMessage}`);
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
