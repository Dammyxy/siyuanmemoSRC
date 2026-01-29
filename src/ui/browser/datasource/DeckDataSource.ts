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
  deliberateQueue?: QueueLike;
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

    // 调试日志
    console.log('[DeckDataSource] Checking plugin queues:', {
      hasPlugin: !!this.plugin,
      hasRetrieval: !!this.plugin?.retrievalQueue,
      hasIncremental: !!this.plugin?.incrementalQueue,
      hasDeliberate: !!this.plugin?.deliberateQueue,
      hasFilterGroup: !!this.plugin?.filterGroupQueue,
      hasNeuralRoam: !!this.plugin?.neuralQueue,
    });

    // 添加"加入队列"子菜单
    const addToQueueAction = buildAddToQueueAction({
      retrieval: !!this.plugin?.retrievalQueue,
      incremental: !!this.plugin?.incrementalQueue,
      deliberate: !!this.plugin?.deliberateQueue,
      filterGroup: !!this.plugin?.filterGroupQueue,
      neuralRoam: !!this.plugin?.neuralQueue,
    });

    if (addToQueueAction) {
      actions.push(addToQueueAction);
    }

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
    // 打开操作
    if (actionId === 'open') return;

    // ========== 队列操作 ==========

    // 提取练习
    if (actionId === 'add-to-retrieval-queue') {
      if (this.plugin?.retrievalQueue) {
        return await addToQueue(this.plugin.retrievalQueue, selectedRows, 'retrieval');
      }
      return;
    }

    // 渐进学习
    if (actionId === 'add-to-incremental-queue') {
      console.log('[DeckDataSource] Adding to incremental learning queue');
      if (this.plugin?.incrementalQueue) {
        return await addToQueue(this.plugin.incrementalQueue, selectedRows, 'incremental');
      }
      console.error('[DeckDataSource] incrementalQueue not available!');
      return;
    }

    // 刻意练习
    if (actionId === 'add-to-deliberate-queue') {
      if (this.plugin?.deliberateQueue) {
        return await addToQueue(this.plugin.deliberateQueue, selectedRows, 'deliberate');
      }
      return;
    }

    // 筛选复习
    if (actionId === 'add-to-filter-group-queue') {
      if (this.plugin?.filterGroupQueue) {
        return await addToQueue(this.plugin.filterGroupQueue, selectedRows, 'filter-group');
      }
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
