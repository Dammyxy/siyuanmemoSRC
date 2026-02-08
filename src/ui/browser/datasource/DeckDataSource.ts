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
  cardType?: 'all' | 'topic-only' | 'item-only';  // ✅ 添加卡片类型筛选参数
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

    console.log('[DeckDataSource] Constructor - Using unified data source manager:', {
      hasManager: !!this.manager,
      hasPlugin: !!this.plugin,
      currentMode: this.manager?.getCurrentMode(),
    });
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    console.log('[DeckDataSource] fetchRows called with:', {
      preset: this.options.preset,
      currentDocId: this.options.currentDocId,
      queryText: this.options.queryText,
      cardType: this.options.cardType,  // ✅ 添加卡片类型参数到日志
    });

    // 传递 queryText 和 cardType 参数以支持筛选，使用缓存优化
    let rows = await loadCards(this.options.preset, undefined, this.options.queryText, false, this.options.cardType, this.plugin as any);
    console.log('[DeckDataSource] loadCards returned:', rows.length, 'cards');

    // ✅ 四重筛选：应用文档筛选
    if (this.options.currentDocId) {
      // 特殊处理：丢失闪卡（rootId 为空的卡片）
      if (this.options.currentDocId === '__lost__') {
        console.log('[DeckDataSource] Filtering for lost cards (no rootId)');
        const beforeCount = rows.length;
        rows = rows.filter(c => !String((c as any)?.rootId || ''));
        console.log('[DeckDataSource] Lost cards filter:', beforeCount, '->', rows.length);
      }
      // 当前文档筛选
      else if (this.options.preset === 'current-doc') {
        rows = rows.filter(c => c.rootId === this.options.currentDocId);
      }
      // 其他文档筛选
      else {
        rows = rows.filter(c => c.rootId === this.options.currentDocId);
      }
    }

    // 【全部闪卡】模式下不设置 queueIndex，NO 列将显示数组索引
    // 只有在【复习队列】模式下，数据源才会设置 queueIndex
    const sorted = applySort(rows, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
  }

  getSupportedActions(): CardBrowserAction[] {
    const actions: CardBrowserAction[] = [
      BASE_ACTIONS.open,
      BASE_ACTIONS.deleteCard,  // 🆕 添加删除操作
    ];

    // 🆕 使用统一数据源管理器检测可用队列
    console.log('[DeckDataSource] ========== getSupportedActions 调试 ==========');
    console.log('[DeckDataSource] Manager:', this.manager);
    console.log('[DeckDataSource] Current mode:', this.manager?.getCurrentMode());
    
    const hasQueues = {
      retrieval: !!this.manager,  // 所有模式都支持提取练习
      incremental: !!this.manager,  // 所有模式都支持渐进学习
      finalDrill: !!this.manager,  // 所有模式都支持刻意练习
      filterGroup: !!this.manager,  // 所有模式都支持筛选复习
      neuralRoam: !!this.manager,  // 所有模式都支持神经漫游
    };
    
    console.log('[DeckDataSource] buildAddToQueueAction 参数:', hasQueues);
    
    const addToQueueAction = buildAddToQueueAction(hasQueues);
    
    console.log('[DeckDataSource] buildAddToQueueAction 返回值:', addToQueueAction);

    if (addToQueueAction) {
      actions.push(addToQueueAction);
      console.log('[DeckDataSource] ✅ 已添加"加入队列"菜单');
    } else {
      console.log('[DeckDataSource] ❌ 没有添加"加入队列"菜单（返回值为 null）');
    }
    
    console.log('[DeckDataSource] ========== 调试结束 ==========');

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
      console.log('[DeckDataSource] ✅ 已添加"选中复习"菜单');
    } else {
      console.log('[DeckDataSource] ❌ 没有添加"选中复习"菜单', {
        hasPlugin: !!this.plugin,
        hasOpenSubsetReviewDialog: !!this.plugin?.openSubsetReviewDialog,
        pluginKeys: this.plugin ? Object.keys(this.plugin) : [],
      });
    }

    return actions;
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    console.log('[DeckDataSource] ========== performAction 被调用 ==========');
    console.log('[DeckDataSource] actionId:', actionId);
    console.log('[DeckDataSource] selectedRows 数量:', selectedRows?.length);
    console.log('[DeckDataSource] context:', context);
    
    // 打开操作
    if (actionId === 'open') return;

    // 🆕 删除卡片（支持强制删除）
    if (actionId === 'delete-card') {
      const blockIds = selectedRows.map(row => row.blockId);
      
      // 第一次尝试：常规删除
      let deleted = await batchDelete(blockIds);
      
      // 如果删除失败，自动尝试强制删除
      if (deleted === 0 && blockIds.length > 0) {
        console.warn('[DeckDataSource] 常规删除失败，自动尝试强制删除...');
        deleted = await batchDelete(blockIds, { force: true });
      }
      
      return deleted;
    }

    // ========== 队列操作（使用统一数据源管理器）==========

    if (!this.manager) {
      console.error('[DeckDataSource] UnifiedDataSourceManager not available!');
      return;
    }

    // 提取练习
    if (actionId === 'add-to-retrieval-queue') {
      console.log('[DeckDataSource] 处理：加入提取练习队列');
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      return await addToQueue(queue as any, selectedRows, 'retrieval');
    }

    // 渐进学习
    if (actionId === 'add-to-incremental-queue') {
      console.log('[DeckDataSource] 处理：加入渐进学习队列');
      const queue = this.manager.getQueue(QueueType.IncrementalLearning);
      return await addToQueue(queue as any, selectedRows, 'incremental');
    }

    // 刻意练习（支持新旧两种 action ID）
    if (actionId === 'add-to-deliberate-queue' || actionId === 'add-to-final-drill-queue') {
      console.log('[DeckDataSource] 处理：加入刻意练习队列');
      const queue = this.manager.getQueue(QueueType.FinalDrill);
      console.log('[DeckDataSource] ✅ 调用 addToQueue');
      const result = await addToQueue(queue as any, selectedRows, 'final-drill');
      console.log('[DeckDataSource] addToQueue 返回结果:', result);
      return result;
    }

    // 筛选复习
    if (actionId === 'add-to-filter-group-queue') {
      console.log('[DeckDataSource] 处理：加入筛选复习队列');
      const queue = this.manager.getQueue(QueueType.FilterGroup);
      console.log('[DeckDataSource] ✅ 调用 addToQueue');
      const result = await addToQueue(queue as any, selectedRows, 'filter-group');
      console.log('[DeckDataSource] addToQueue 返回结果:', result);
      return result;
    }

    // 神经漫游（使用新架构）
    if (actionId === 'add-to-neural-roam-queue') {
      console.log('[DeckDataSource] 处理：加入神经漫游队列');
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
      await batchSetBlockPriority(selectedRows, Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50)))));
      return;
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

    console.warn('[DeckDataSource] Unknown action:', actionId);
  }
}
