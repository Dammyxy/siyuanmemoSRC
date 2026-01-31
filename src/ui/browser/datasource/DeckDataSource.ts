import type { BrowserCard } from '../types';
import { formatDate } from '../types';
import { loadCards, batchReset, batchSuspend } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  BASE_ACTIONS,
  buildAddToQueueAction,
  batchSetBlockPriority,
  adjustTime,
  addToQueue,
} from './MenuActions';
import { RescheduleService } from '@/core/scheduler/rescheduleService';

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
  retrievalQueue?: QueueLike;
  incrementalQueue?: QueueLike;  // ✅ 添加渐进学习队列
  finalDrillQueue?: QueueLike;  // ✅ 刻意练习队列（主属性名）
  deliberateQueue?: QueueLike;  // ⚠️ 向后兼容别名，指向 finalDrillQueue
  filterGroupQueue?: QueueLike;
  neuralQueue?: QueueLike;  // ✅ 添加神经漫游队列
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

  private readonly plugin?: FsrsPluginLike;
  private readonly options: DeckDataSourceOptions;

  constructor(plugin: FsrsPluginLike | undefined, options: DeckDataSourceOptions) {
    this.plugin = plugin;
    this.options = options;

    console.log('[DeckDataSource] Constructor - Plugin keys:', {
      hasPlugin: !!plugin,
      keys: plugin ? Object.keys(plugin).filter(k => k.includes('Queue')).sort() : [],
      incrementalQueueType: plugin?.incrementalQueue?.constructor?.name,
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
    let rows = await loadCards(this.options.preset, undefined, this.options.queryText, false, this.options.cardType);
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
    ];

    // 🔍 详细调试日志
    console.log('[DeckDataSource] ========== getSupportedActions 调试 ==========');
    console.log('[DeckDataSource] Plugin 对象:', this.plugin);
    console.log('[DeckDataSource] Plugin 类型:', this.plugin?.constructor?.name);
    console.log('[DeckDataSource] Plugin 所有属性:', this.plugin ? Object.keys(this.plugin) : []);
    console.log('[DeckDataSource] Plugin 所有属性（包括原型链）:', this.plugin ? Object.getOwnPropertyNames(Object.getPrototypeOf(this.plugin)) : []);
    
    console.log('[DeckDataSource] 队列检测结果:', {
      hasPlugin: !!this.plugin,
      hasRetrieval: !!this.plugin?.retrievalQueue,
      hasIncremental: !!this.plugin?.incrementalQueue,
      hasFinalDrill: !!(this.plugin as any)?.finalDrillQueue,
      hasFilterGroup: !!this.plugin?.filterGroupQueue,
      hasNeuralRoam: !!this.plugin?.neuralQueue,
    });

    // 尝试直接访问队列
    console.log('[DeckDataSource] 直接访问 finalDrillQueue:', (this.plugin as any)?.finalDrillQueue);

    // 添加"加入队列"子菜单
    const hasQueues = {
      retrieval: !!this.plugin?.retrievalQueue,
      incremental: !!this.plugin?.incrementalQueue,
      finalDrill: !!(this.plugin as any)?.finalDrillQueue,  // ✅ 使用 finalDrillQueue
      filterGroup: !!this.plugin?.filterGroupQueue,
      neuralRoam: !!this.plugin?.neuralQueue,
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

    // ========== 队列操作 ==========

    // 提取练习
    if (actionId === 'add-to-retrieval-queue') {
      console.log('[DeckDataSource] 处理：加入提取练习队列');
      if (this.plugin?.retrievalQueue) {
        return await addToQueue(this.plugin.retrievalQueue, selectedRows, 'retrieval');
      }
      return;
    }

    // 渐进学习
    if (actionId === 'add-to-incremental-queue') {
      console.log('[DeckDataSource] 处理：加入渐进学习队列');
      if (this.plugin?.incrementalQueue) {
        return await addToQueue(this.plugin.incrementalQueue, selectedRows, 'incremental');
      }
      console.error('[DeckDataSource] incrementalQueue not available!');
      return;
    }

    // 刻意练习（支持新旧两种 action ID）
    if (actionId === 'add-to-deliberate-queue' || actionId === 'add-to-final-drill-queue') {
      console.log('[DeckDataSource] 处理：加入刻意练习队列');
      console.log('[DeckDataSource] 检查队列:', {
        hasFinalDrill: !!(this.plugin as any)?.finalDrillQueue,
      });
      
      // ✅ 使用 finalDrillQueue
      const queue = (this.plugin as any)?.finalDrillQueue;
      console.log('[DeckDataSource] 获取到的队列:', queue);
      console.log('[DeckDataSource] 队列类型:', queue?.constructor?.name);
      console.log('[DeckDataSource] 队列有 addItems 方法:', typeof queue?.addItems === 'function');
      
      if (queue) {
        console.log('[DeckDataSource] ✅ 调用 addToQueue');
        const result = await addToQueue(queue, selectedRows, 'final-drill');
        console.log('[DeckDataSource] addToQueue 返回结果:', result);
        return result;
      }
      console.error('[DeckDataSource] ❌ finalDrillQueue not available!');
      return;
    }

    // 筛选复习
    if (actionId === 'add-to-filter-group-queue') {
      console.log('[DeckDataSource] 处理：加入筛选复习队列');
      console.log('[DeckDataSource] 检查队列:', {
        hasFilterGroup: !!this.plugin?.filterGroupQueue,
      });
      
      const queue = this.plugin?.filterGroupQueue;
      console.log('[DeckDataSource] 获取到的队列:', queue);
      console.log('[DeckDataSource] 队列类型:', queue?.constructor?.name);
      console.log('[DeckDataSource] 队列有 addItems 方法:', typeof queue?.addItems === 'function');
      
      if (queue) {
        console.log('[DeckDataSource] ✅ 调用 addToQueue');
        const result = await addToQueue(queue, selectedRows, 'filter-group');
        console.log('[DeckDataSource] addToQueue 返回结果:', result);
        return result;
      }
      console.error('[DeckDataSource] ❌ filterGroupQueue not available!');
      return;
    }

    // 神经漫游
    if (actionId === 'add-to-neural-roam-queue') {
      if (this.plugin?.neuralQueue) {
        return await addToQueue(this.plugin.neuralQueue, selectedRows, 'neural-roam');
      }
      return;
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
