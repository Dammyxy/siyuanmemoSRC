import type { BrowserCard } from '../types';
import { formatDate } from '../types';
import { loadCards, batchReset, batchSuspend, batchDelete } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  BASE_ACTIONS,
  buildAddToQueueAction,
  batchSetBlockPriority,
  adjustTime,
  addToQueue,
} from './MenuActions';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import type { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { QueueType } from '@/types/unified-data-source';

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

export class DeckDataSource implements ICardDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly manager: UnifiedDataSourceManager;  // 🆕 新架构
  private readonly plugin?: FsrsPluginLike;  // 🔧 保留用于特殊功能（Review Subset、神经漫游、时间调整）
  private readonly options: DeckDataSourceOptions;

  constructor(manager: UnifiedDataSourceManager, options: DeckDataSourceOptions, plugin?: FsrsPluginLike) {
    this.manager = manager;  // 🆕 直接接收 manager
    this.plugin = plugin;  // 🔧 可选的 plugin 对象
    this.options = options;

    console.log('[SiyuanMemo][DeckDataSource] Constructor - Using unified data source manager:', {
      hasManager: !!this.manager,
      hasPlugin: !!this.plugin,
      currentMode: 'advanced',
    });
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    console.log('[SiyuanMemo][DeckDataSource] fetchRows called with:', {
      preset: this.options.preset,
      currentDocId: this.options.currentDocId,
      queryText: this.options.queryText,
      cardType: this.options.cardType,
      currentMode: 'advanced',
    });

    // 使用统一数据源管理器（从本地存储获取）
    try {
      const allCards = await this.manager.getCards();
      console.log('[SiyuanMemo][DeckDataSource] manager.getCards returned:', allCards.length, 'cards (advanced mode)');
      
      // 转换为 BrowserCard 格式
      let rows = allCards.map(card => this.convertToBrowserCard(card));
      
      // 🔧 修复：对于概念卡，批量更新内容（文档标题）
      const conceptCards = rows.filter(r => {
        const originalCard = allCards.find(c => c.blockId === r.blockId);
        return originalCard?.type === 'concept';
      });
      
      if (conceptCards.length > 0) {
        console.log(`[SiyuanMemo][DeckDataSource] Found ${conceptCards.length} concept cards, fetching titles...`);
        const blockIds = conceptCards.map(c => c.blockId);
        
        // 批量查询文档标题
        const contentMap = await this.fetchBlockContent(blockIds);
        
        // 更新概念卡内容
        for (const card of conceptCards) {
          const dbContent = contentMap.get(card.blockId);
          if (dbContent) {
            card.fullContent = dbContent;
            card.content = this.truncateContent(dbContent, 100);
            console.log(`[SiyuanMemo][DeckDataSource] ✅ Updated concept card ${card.blockId}: "${card.content}"`);
          }
        }
      }
      
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
        if (this.options.currentDocId === '__lost__') {
          rows = rows.filter(c => !String((c as any)?.rootId || ''));
        } else if (this.options.preset === 'current-doc') {
          rows = rows.filter(c => c.rootId === this.options.currentDocId);
        } else {
          rows = rows.filter(c => c.rootId === this.options.currentDocId);
        }
      }

      const sorted = applySort(rows, params?.sortModel || []);
      return { rows: sorted, totalCount: sorted.length };
      } catch (error) {
        console.error('[SiyuanMemo][DeckDataSource] Failed to fetch from manager:', error);
        throw error;
      }
  }
  
  /**
   * 批量获取块内容（用于概念卡标题）
   */
  private async fetchBlockContent(blockIds: string[]): Promise<Map<string, string>> {
    const contentMap = new Map<string, string>();
    if (blockIds.length === 0) return contentMap;

    try {
      const { sql } = await import('@/core/siyuan/api');
      const BATCH_SIZE = 500;
      
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const inClause = batchIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
        
        const result = await sql(`SELECT id, content FROM blocks WHERE id IN (${inClause})`);
        
        for (const row of result || []) {
          const content = String(row.content || '').trim();
          if (content) {
            contentMap.set(row.id, content);
          }
        }
      }
    } catch (error) {
      console.error('[SiyuanMemo][DeckDataSource] Failed to fetch block content:', error);
    }
    
    return contentMap;
  }
  
  private escapeSQL(value: string): string {
    return String(value || '').replace(/'/g, "''");
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
    console.log('[SiyuanMemo][DeckDataSource] ========== getSupportedActions 调试 ==========');
    console.log('[SiyuanMemo][DeckDataSource] Manager:', this.manager);
    console.log('[SiyuanMemo][DeckDataSource] Current mode: advanced');
    
    const hasQueues = {
      retrieval: !!this.manager,  // 所有模式都支持提取练习
      incremental: !!this.manager,  // 所有模式都支持渐进学习
      finalDrill: !!this.manager,  // 所有模式都支持刻意练习
      filterGroup: !!this.manager,  // 所有模式都支持筛选复习
      neuralRoam: !!this.manager,  // 所有模式都支持神经漫游
    };
    
    console.log('[SiyuanMemo][DeckDataSource] buildAddToQueueAction 参数:', hasQueues);
    
    const addToQueueAction = buildAddToQueueAction(hasQueues);
    
    console.log('[SiyuanMemo][DeckDataSource] buildAddToQueueAction 返回值:', addToQueueAction);

    if (addToQueueAction) {
      actions.push(addToQueueAction);
      console.log('[SiyuanMemo][DeckDataSource] ✅ 已添加"加入队列"菜单');
    } else {
      console.log('[SiyuanMemo][DeckDataSource] ❌ 没有添加"加入队列"菜单（返回值为 null）');
    }
    
    console.log('[SiyuanMemo][DeckDataSource] ========== 调试结束 ==========');

    // 其他操作
    actions.push(
      BASE_ACTIONS.setPriority,
      BASE_ACTIONS.postpone,
      BASE_ACTIONS.advance,
      BASE_ACTIONS.spread,
      BASE_ACTIONS.reset,
      BASE_ACTIONS.suspend
    );

    if (this.plugin?.openSubsetReviewDialog) {
      actions.unshift({ id: 'review-subset', label: 'Review Subset', icon: 'iconPlay' });
      console.log('[SiyuanMemo][DeckDataSource] ✅ 已添加"选中复习"菜单');
    } else {
      console.log('[SiyuanMemo][DeckDataSource] ❌ 没有添加"选中复习"菜单', {
        hasPlugin: !!this.plugin,
        hasOpenSubsetReviewDialog: !!this.plugin?.openSubsetReviewDialog,
        pluginKeys: this.plugin ? Object.keys(this.plugin) : [],
      });
    }

    return actions;
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    console.log('[SiyuanMemo][DeckDataSource] ========== performAction 被调用 ==========');
    console.log('[SiyuanMemo][DeckDataSource] actionId:', actionId);
    console.log('[SiyuanMemo][DeckDataSource] selectedRows 数量:', selectedRows?.length);
    console.log('[SiyuanMemo][DeckDataSource] context:', context);
    
    // 打开操作
    if (actionId === 'open') return;

    // 🆕 删除卡片（支持强制删除）
    if (actionId === 'delete-card') {
      const blockIds = selectedRows.map(row => row.blockId);
      
      // 检查是否有 storage
      if (!this.plugin?.storage) {
        console.error('[SiyuanMemo][DeckDataSource] Storage not available!');
        return 0;
      }
      
      // 第一次尝试：常规删除
      let deleted = await batchDelete(blockIds, this.plugin.storage);
      
      // 如果删除失败，自动尝试强制删除
      if (deleted === 0 && blockIds.length > 0) {
        console.warn('[SiyuanMemo][DeckDataSource] 常规删除失败，自动尝试强制删除...');
        deleted = await batchDelete(blockIds, this.plugin.storage);
      }
      
      return deleted;
    }

    // ========== 队列操作（使用统一数据源管理器）==========

    if (!this.manager) {
      console.error('[SiyuanMemo][DeckDataSource] UnifiedDataSourceManager not available!');
      return;
    }

    // 提取练习
    if (actionId === 'add-to-retrieval-queue') {
      console.log('[SiyuanMemo][DeckDataSource] 处理：加入提取练习队列');
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      return await addToQueue(queue as any, selectedRows, 'retrieval');
    }

    // 渐进学习
    if (actionId === 'add-to-incremental-queue') {
      console.log('[SiyuanMemo][DeckDataSource] 处理：加入渐进学习队列');
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);
      return await addToQueue(queue as any, selectedRows, 'incremental');
    }

    // 刻意练习（支持新旧两种 action ID）
    if (actionId === 'add-to-deliberate-queue' || actionId === 'add-to-final-drill-queue') {
      console.log('[SiyuanMemo][DeckDataSource] 处理：加入刻意练习队列');
      const queue = this.manager.getQueue(QueueType.FinalDrill);
      console.log('[SiyuanMemo][DeckDataSource] ✅ 调用 addToQueue');
      const result = await addToQueue(queue as any, selectedRows, 'final-drill');
      console.log('[SiyuanMemo][DeckDataSource] addToQueue 返回结果:', result);
      return result;
    }

    // 筛选复习
    if (actionId === 'add-to-filter-group-queue') {
      console.log('[SiyuanMemo][DeckDataSource] 处理：加入筛选复习队列');
      const queue = this.manager.getQueue(QueueType.FilterGroup);
      console.log('[SiyuanMemo][DeckDataSource] ✅ 调用 addToQueue');
      const result = await addToQueue(queue as any, selectedRows, 'filter-group');
      console.log('[SiyuanMemo][DeckDataSource] addToQueue 返回结果:', result);
      return result;
    }

    // 神经漫游（使用新架构）
    if (actionId === 'add-to-neural-roam-queue') {
      console.log('[SiyuanMemo][DeckDataSource] 处理：加入神经漫游队列');
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
      
      // 分离普通卡片和修缘卡片
      const normalCards: BrowserCard[] = [];
      const xiuyuanCards: BrowserCard[] = [];
      
      for (const card of selectedRows) {
        if ((card as any).meta?.xiuyuanID) {
          xiuyuanCards.push(card);
        } else {
          normalCards.push(card);
        }
      }
      
      // 处理普通卡片：设置块属性 + 更新 FSRSCard
      if (normalCards.length > 0) {
        await batchSetBlockPriority(normalCards, priority);
        
        // ✅ 同时更新 FSRSCard.priority
        if (this.manager) {
          for (const card of normalCards) {
            try {
              const fsrsCard = await this.manager.getCard(card.fsrsCardId || card.id);
              if (fsrsCard) {
                fsrsCard.priority = priority;
                await this.manager.updateCard(fsrsCard);
              }
            } catch (err) {
              console.error('[SiyuanMemo][DeckDataSource] Failed to update FSRSCard priority:', card.id, err);
            }
          }
        }
      }
      
      // 处理修缘卡片：更新 FSRSCard.meta.priority
      if (xiuyuanCards.length > 0 && this.plugin?.storage) {
        for (const card of xiuyuanCards) {
          try {
            const fsrsCard = this.plugin.storage.getCard(card.id);
            if (fsrsCard) {
              fsrsCard.meta = fsrsCard.meta || {};
              fsrsCard.meta.priority = priority;
              await this.plugin.storage.updateCard(fsrsCard);
            }
            // 更新内存中的 priority
            (card as any).priority = priority;
          } catch (err) {
            console.error('[SiyuanMemo][DeckDataSource] Failed to set priority for Xiuyuan card:', card.id, err);
          }
        }
      }
      
      return { updated: selectedRows, skipped: [] };
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

    console.warn('[SiyuanMemo][DeckDataSource] Unknown action:', actionId);
  }
}
