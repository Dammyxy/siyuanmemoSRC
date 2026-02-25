import type { BrowserCard } from '../types';
import { formatDate } from '../types';
import { loadCards, batchReset, batchSuspend } from '../browserService';
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';
import type { CardBrowserAction, SortModel } from './types';
import {
  BASE_ACTIONS,
  buildAddToQueueAction,
  adjustTime,
  addToQueue,
} from './MenuActions';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { DeleteCardCommand } from '@/application/commands/card/DeleteCardCommand';

type DeckDataSourceOptions = {
  preset: string;
  currentDocId?: string;
  queryText?: string;  // 添加查询文本参数
  cardType?: 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';  // ✅ 卡片类型筛选参数
};

type QueueLike = {
  addItems?: (items: any[]) => Promise<number> | number;
  addItem?: (item: any) => Promise<void> | void;
};

type FsrsPluginLike = {
  storage?: any;
  rescheduleService?: RescheduleService;
  openSubsetReviewDialog?: (blockIds: string[]) => Promise<void> | void;
};

type CardApplicationServiceLike = {
  batchUpdateCardsWithoutEvents?: (cards: any[]) => Promise<{ ok: boolean; value?: { updatedCount: number; failedCount: number }; error?: Error }>;
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

function parseSiyuanTime14(timeStr: string | undefined): Date | null {
  if (!timeStr) return null;
  if (/^\d{14}$/.test(timeStr)) {
    const y = parseInt(timeStr.slice(0, 4));
    const m = parseInt(timeStr.slice(4, 6)) - 1;
    const d = parseInt(timeStr.slice(6, 8));
    const h = parseInt(timeStr.slice(8, 10));
    const min = parseInt(timeStr.slice(10, 12));
    const s = parseInt(timeStr.slice(12, 14));
    return new Date(Date.UTC(y, m, d, h, min, s));
  }
  const isoParsed = new Date(timeStr);
  if (!Number.isNaN(isoParsed.getTime())) return isoParsed;
  return null;
}

/**
 * DeckDataSource - Deck 数据源实现
 * 
 * @implements {ICardDataSource}
 */
export class DeckDataSource implements ICardDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly manager: IUnifiedDataSourceManagerFacade;  // 🆕 新架构
  private readonly plugin?: FsrsPluginLike;  // 🔧 保留用于特殊功能（Review Subset、神经漫游、时间调整）
  private readonly cardApplicationService?: CardApplicationServiceLike;  // ✅ Phase 9: 卡片应用服务
  private readonly options: DeckDataSourceOptions;

  constructor(
    manager: IUnifiedDataSourceManagerFacade, 
    options: DeckDataSourceOptions, 
    plugin?: FsrsPluginLike,
    cardApplicationService?: CardApplicationServiceLike  // ✅ Phase 9: 注入卡片应用服务
  ) {
    this.manager = manager;  // 🆕 直接接收 manager
    this.plugin = plugin;  // 🔧 可选的 plugin 对象
    this.cardApplicationService = cardApplicationService;  // ✅ Phase 9
    this.options = options;

    console.log('[SiYuanMemo][DeckDataSource] Constructor - Using unified data source manager:', {
      hasManager: !!this.manager,
      hasPlugin: !!this.plugin,
      hasCardApplicationService: !!this.cardApplicationService,
      currentMode: 'advanced',
    });
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    console.log('[SiYuanMemo][DeckDataSource] fetchRows called with:', {
      preset: this.options.preset,
      currentDocId: this.options.currentDocId,
      queryText: this.options.queryText,
      cardType: this.options.cardType,
      currentMode: 'advanced',
    });

    // 使用统一数据源管理器（从本地存储获取）
    try {
      const allCards = await this.manager.getCards();
      console.log('[SiYuanMemo][DeckDataSource] manager.getCards returned:', allCards.length, 'cards (advanced mode)');
      
      // 🔍 调试：检查 rootId 填充情况
      const cardsWithRootId = allCards.filter(c => c.meta?.rootId).length;
      console.log('[SiYuanMemo][DeckDataSource] 🔍 Cards with rootId:', {
        total: allCards.length,
        withRootId: cardsWithRootId,
        sampleRootIds: allCards.slice(0, 5).map(c => ({ blockId: c.blockId, rootId: c.meta?.rootId })),
      });
      
      // 转换为 BrowserCard 格式
      // ✅ 注意：卡片内容（title）已由 DataAccessFacade.fillMissingRootIds() 统一填充
      // 无需在此处重复获取
      let rows = allCards.map(card => this.convertToBrowserCard(card));
      
      // 🔍 调试：检查转换后的 rootId
      const rowsWithRootId = rows.filter(r => r.rootId).length;
      console.log('[SiYuanMemo][DeckDataSource] 🔍 After conversion:', {
        total: rows.length,
        withRootId: rowsWithRootId,
        sampleRootIds: rows.slice(0, 5).map(r => ({ blockId: r.blockId, rootId: r.rootId })),
      });
      
      // 应用 preset 筛选
      rows = this.applyPresetFilter(rows);
      
      // 应用 cardType 筛选
      if (this.options.cardType && this.options.cardType !== 'all') {
        if (this.options.cardType === 'topic-only') {
          // Topic 类型包括：topic（增量阅读）
          rows = rows.filter(c => c.cardType === 'topic');
        } else if (this.options.cardType === 'item-only') {
          // ✅ 修复：item-only 只显示 item 卡片，不包含 concept 和 descriptor
          rows = rows.filter(c => c.cardType === 'item' || !c.cardType);  // 缺失 cardType 的默认为 item
        } else if (this.options.cardType === 'concept-only') {
          rows = rows.filter(c => c.cardType === 'concept');
        } else if (this.options.cardType === 'descriptor-only') {
          rows = rows.filter(c => c.cardType === 'descriptor');
        }
      }
      
      // 应用搜索筛选
      if (this.options.queryText) {
        const query = this.options.queryText.toLowerCase().trim();
        if (query && !query.startsWith('tag:') && !query.startsWith('deck:') && !query.startsWith('state:') && !query.startsWith('doc:')) {
          rows = rows.filter(c => {
            return c.content?.toLowerCase().includes(query) ||
                   c.fullContent?.toLowerCase().includes(query);
          });
        }
      }
      
      // ✅ 四重筛选：应用文档筛选
      if (this.options.currentDocId) {
        console.log('[SiYuanMemo][DeckDataSource] 🔍 Applying document filter:', {
          currentDocId: this.options.currentDocId,
          totalRows: rows.length,
          rowsWithRootId: rows.filter(r => r.rootId).length,
        });
        
        if (this.options.currentDocId === '__lost__') {
          rows = rows.filter(c => !String((c as any)?.rootId || ''));
        } else if (this.options.preset === 'current-doc') {
          rows = rows.filter(c => c.rootId === this.options.currentDocId);
        } else {
          rows = rows.filter(c => c.rootId === this.options.currentDocId);
        }
        
        console.log('[SiYuanMemo][DeckDataSource] 🔍 After document filter:', {
          filteredRows: rows.length,
        });
      }

      const sorted = applySort(rows, params?.sortModel || []);
      return { rows: sorted, totalCount: sorted.length };
      } catch (error) {
        console.error('[SiYuanMemo][DeckDataSource] Failed to fetch from manager:', error);
        throw error;
      }
  }
  
  private applyPresetFilter(cards: BrowserCard[]): BrowserCard[] {
    if (!this.options.preset || this.options.preset === 'all') {
      return cards;
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return cards.filter(c => {
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
  
  private convertToBrowserCard(card: any): BrowserCard {
    const now = Date.now();
    const elapsedDays = card.lastReview 
      ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
      : 0;
    const retrievability = this.calculateRetrievability(card.stability || 0, elapsedDays);
    const state = card.state || 0;
    
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    let firstReviewDate: Date | null = null;
    if (card.reps > 0) {
      if (card.createdAt) {
        firstReviewDate = new Date(card.createdAt);
      } else if (lastReviewDate) {
        firstReviewDate = lastReviewDate;
      }
    }
    
    const fullContent = (card.meta?.content as string) || card.content || '';
    const content = this.truncateContent(fullContent, 100);
    const deckId = (card.meta?.deckId as string) || card.deckId || '';
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    const extractedRootId = (card.meta?.rootId as string) || card.rootId || '';
    
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
      meta: card.meta,  // ✅ 传递 meta 属性，包含 xiuyuanID 等信息
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
  
  /**
   * 格式化到期日期（显示具体日期，与 SuperMemo 一致）
   * 
   * SuperMemo 的 NextRep 显示具体日期，而 Intrv 显示间隔天数。
   * 这样可以避免信息重复。
   */
  private formatDueDate(date: Date): string {
    if (!date || isNaN(date.getTime())) return '-';
    
    // 始终显示具体日期（包含年份）
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  
  private formatHistoryDate(date: Date | null): string {
    if (!date || isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  
  private getStateLabel(state: number): string {
    switch (state) {
      case 0: return '新卡';
      case 1: return '学习中';
      case 2: return '复习';
      case 3: return '重学';
      default: return '未知';
    }
  }

  getSupportedActions(): CardBrowserAction[] {
    const actions: CardBrowserAction[] = [
      BASE_ACTIONS.open,
      BASE_ACTIONS.deleteCard,  // 🆕 添加删除操作
    ];

    // 🆕 使用统一数据源管理器检测可用队列
    console.log('[SiYuanMemo][DeckDataSource] ========== getSupportedActions 调试 ==========');
    console.log('[SiYuanMemo][DeckDataSource] Manager:', this.manager);
    console.log('[SiYuanMemo][DeckDataSource] Current mode: advanced');
    
    const hasQueues = {
      retrieval: !!this.manager,  // 所有模式都支持提取练习
      incremental: !!this.manager,  // 所有模式都支持渐进学习
      finalDrill: !!this.manager,  // 所有模式都支持刻意练习
      filterGroup: !!this.manager,  // 所有模式都支持筛选复习
      neuralRoam: !!this.manager,  // 所有模式都支持神经漫游
    };
    
    console.log('[SiYuanMemo][DeckDataSource] buildAddToQueueAction 参数:', hasQueues);
    
    const addToQueueAction = buildAddToQueueAction(hasQueues);
    
    console.log('[SiYuanMemo][DeckDataSource] buildAddToQueueAction 返回值:', addToQueueAction);

    if (addToQueueAction) {
      actions.push(addToQueueAction);
      console.log('[SiYuanMemo][DeckDataSource] ✅ 已添加"加入队列"菜单');
    } else {
      console.log('[SiYuanMemo][DeckDataSource] ❌ 没有添加"加入队列"菜单（返回值为 null）');
    }
    
    console.log('[SiYuanMemo][DeckDataSource] ========== 调试结束 ==========');

    // 其他操作
    actions.push(
      BASE_ACTIONS.setPriority,
      BASE_ACTIONS.postpone,
      BASE_ACTIONS.advance,
      BASE_ACTIONS.spread,
      BASE_ACTIONS.reset
      // 🆕 移除暂停按钮：暂停功能已不再使用
    );

    if (this.plugin?.openSubsetReviewDialog) {
      actions.unshift({ id: 'review-subset', label: (this.plugin as any)?.i18n?.reviewSubset || 'Review Subset', icon: 'iconPlay' });
      console.log('[SiYuanMemo][DeckDataSource] ✅ 已添加"选中复习"菜单');
    } else {
      console.log('[SiYuanMemo][DeckDataSource] ❌ 没有添加"选中复习"菜单', {
        hasPlugin: !!this.plugin,
        hasOpenSubsetReviewDialog: !!this.plugin?.openSubsetReviewDialog,
        pluginKeys: this.plugin ? Object.keys(this.plugin) : [],
      });
    }

    return actions;
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    console.log('[SiYuanMemo][DeckDataSource] ========== performAction 被调用 ==========');
    console.log('[SiYuanMemo][DeckDataSource] actionId:', actionId);
    console.log('[SiYuanMemo][DeckDataSource] selectedRows 数量:', selectedRows?.length);
    console.log('[SiYuanMemo][DeckDataSource] context:', context);
    
    // 打开操作
    if (actionId === 'open') return;

    // 🆕 删除卡片（使用 CardApplicationService）
    if (actionId === 'delete-card') {
      // 检查是否有 plugin 和 ApplicationContext
      if (!this.plugin) {
        console.error('[SiYuanMemo][DeckDataSource] Plugin not available!');
        return 0;
      }
      
      const cardService = (this.plugin as any).context?.getCardService?.();
      if (!cardService) {
        console.error('[SiYuanMemo][DeckDataSource] CardApplicationService not available!');
        return 0;
      }
      
      // 使用 CardApplicationService.deleteCard() 逐个删除卡片
      let deletedCount = 0;
      for (const row of selectedRows) {
        // ✅ 修复：直接使用 fsrsCardId（Xiuyuan 卡片的真实 cardId）
        const cardId = row.fsrsCardId || row.id;
        
        console.log(`[SiYuanMemo][DeckDataSource] Deleting card: ${cardId} (blockId: ${row.blockId})`);
        
        const command: DeleteCardCommand = { cardId };
        const result = await cardService.deleteCard(command);
        
        if (result.ok) {
          deletedCount++;
          console.log(`[SiYuanMemo][DeckDataSource] ✅ Deleted card: ${cardId}`);
        } else {
          console.error(`[SiYuanMemo][DeckDataSource] ❌ Failed to delete card ${cardId}:`, result.error);
        }
      }
      
      console.log(`[SiYuanMemo][DeckDataSource] Deleted ${deletedCount}/${selectedRows.length} cards`);
      return deletedCount;
    }

    // ========== 队列操作（使用统一数据源管理器）==========

    if (!this.manager) {
      console.error('[SiYuanMemo][DeckDataSource] UnifiedDataSourceManager not available!');
      return;
    }

    // 提取练习
    if (actionId === 'add-to-retrieval-queue') {
      console.log('[SiYuanMemo][DeckDataSource] 处理：加入提取练习队列');
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      return await addToQueue(queue as any, selectedRows, 'retrieval');
    }

    // 渐进学习
    if (actionId === 'add-to-incremental-queue') {
      console.log('[SiYuanMemo][DeckDataSource] 处理：加入渐进学习队列');
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);
      return await addToQueue(queue as any, selectedRows, 'incremental');
    }

    // 刻意练习（支持新旧两种 action ID）
    if (actionId === 'add-to-deliberate-queue' || actionId === 'add-to-final-drill-queue') {
      console.log('[SiYuanMemo][DeckDataSource] 处理：加入刻意练习队列');
      const queue = this.manager.getQueue(QueueType.FinalDrill);
      console.log('[SiYuanMemo][DeckDataSource] ✅ 调用 addToQueue');
      const result = await addToQueue(queue as any, selectedRows, 'final-drill');
      console.log('[SiYuanMemo][DeckDataSource] addToQueue 返回结果:', result);
      return result;
    }

    // 筛选复习
    if (actionId === 'add-to-filter-group-queue') {
      console.log('[SiYuanMemo][DeckDataSource] 处理：加入筛选复习队列');
      const queue = this.manager.getQueue(QueueType.FilterGroup);
      console.log('[SiYuanMemo][DeckDataSource] ✅ 调用 addToQueue');
      const result = await addToQueue(queue as any, selectedRows, 'filter-group');
      console.log('[SiYuanMemo][DeckDataSource] addToQueue 返回结果:', result);
      return result;
    }

    // 神经漫游（使用新架构）
    if (actionId === 'add-to-neural-roam-queue') {
      console.log('[SiYuanMemo][DeckDataSource] 处理：加入神经漫游队列');
      const queue = this.manager.getQueue(QueueType.NeuralRoam);
      return await addToQueue(queue as any, selectedRows, 'neural-roam');
    }

    // Review Subset
    if (actionId === 'review-subset') {
      const blockIds = (selectedRows || []).map((r) => String(r?.blockId || '')).filter(Boolean);
      if (blockIds.length === 0) return;
      await Promise.resolve(this.plugin?.openSubsetReviewDialog?.(blockIds));
      return;
    }

    // ========== 优先级操作 ==========

    if (actionId === 'set-priority') {
      const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
      
      // ✅ 使用新架构：直接通过 UnifiedDataSourceManager 更新所有卡片
      console.log(`[SiYuanMemo][DeckDataSource] ========== SET PRIORITY START ==========`);
      console.log(`[SiYuanMemo][DeckDataSource] Setting priority to ${priority} for ${selectedRows.length} cards`);
      console.log(`[SiYuanMemo][DeckDataSource] Manager:`, this.manager);
      console.log(`[SiYuanMemo][DeckDataSource] Selected cards:`, selectedRows.map(c => ({ id: c.id, blockId: c.blockId, currentPriority: c.priority })));
      
      const updated: BrowserCard[] = [];
      const failed: BrowserCard[] = [];
      
      for (const card of selectedRows) {
        try {
          console.log(`[SiYuanMemo][DeckDataSource] Processing card: ${card.id}`);
          
          // 获取 FSRSCard
          const fsrsCard = await this.manager.getCard(card.fsrsCardId || card.id);
          console.log(`[SiYuanMemo][DeckDataSource] Got FSRSCard:`, {
            id: fsrsCard.id,
            blockId: fsrsCard.blockId,
            oldPriority: fsrsCard.priority,
            newPriority: priority
          });
          
          if (fsrsCard) {
            // 更新优先级
            fsrsCard.priority = priority;
            
            // 持久化到存储
            console.log(`[SiYuanMemo][DeckDataSource] Calling manager.updateCard()...`);
            await this.manager.updateCard(fsrsCard);
            console.log(`[SiYuanMemo][DeckDataSource] ✅ manager.updateCard() completed`);
            
            // ✅ 更新块属性（确保刷新后显示正确的优先级）
            const { setBlockAttrs } = await import('@/core/siyuan/api');
            const { ATTR_PRIORITY } = await import('@/core/siyuan/block');
            await setBlockAttrs(card.blockId, { [ATTR_PRIORITY]: String(priority) });
            console.log(`[SiYuanMemo][DeckDataSource] ✅ Block attribute updated for ${card.blockId}`);
            
            // 更新内存中的值（用于 UI 显示）
            card.priority = priority;
            
            updated.push(card);
            console.log(`[SiYuanMemo][DeckDataSource] ✅ Updated priority for card: ${card.id}`);
          } else {
            console.warn(`[SiYuanMemo][DeckDataSource] Card not found: ${card.id}`);
            failed.push(card);
          }
        } catch (err) {
          console.error(`[SiYuanMemo][DeckDataSource] ❌ Failed to update priority for card ${card.id}:`, err);
          failed.push(card);
        }
      }
      
      console.log(`[SiYuanMemo][DeckDataSource] ========== SET PRIORITY END ==========`);
      console.log(`[SiYuanMemo][DeckDataSource] Updated: ${updated.length}, Failed: ${failed.length}`);
      
      // ✅ 清除缓存，确保刷新后显示最新数据
      const { invalidateCardCache } = await import('../browserService');
      invalidateCardCache();
      console.log(`[SiYuanMemo][DeckDataSource] ✅ Cache invalidated after priority update`);
      
      return { updated, skipped: failed };
    }

    // ========== 卡片操作 ==========

    if (actionId === 'reset') {
      const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);
      await batchReset(blockIds);
      return;
    }

    if (actionId === 'suspend') {
      const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);
      await batchSuspend(blockIds, true);
      return;
    }

    // ========== 时间调整 ==========

    if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
      return await adjustTime(this.plugin, selectedRows, actionId as any, context);
    }

    console.warn('[SiYuanMemo][DeckDataSource] Unknown action:', actionId);
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
