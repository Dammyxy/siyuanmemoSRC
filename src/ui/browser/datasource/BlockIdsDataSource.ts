import type { BrowserCard } from '../types';
import { loadQueueCards } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  BASE_ACTIONS,
  buildQueueActions,
  cardsToQueueItems,
  removeFromQueue,
  insertAt,
  setPriority,
  batchSetBlockPriority,
  adjustTime,
} from './MenuActions';

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

export class BlockIdsDataSource implements ICardDataSource {
  id: string;
  label: string;

  private readonly blockIds: string[];
  private readonly plugin?: any;
  private readonly queueId?: string;

  constructor(options: {
    id: string;
    label: string;
    blockIds: string[];
    plugin?: any;
    queueId?: string;
  }) {
    this.id = options.id;
    this.label = options.label;
    this.blockIds = options.blockIds;
    this.plugin = options.plugin;
    this.queueId = options.queueId;
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const cards = await loadQueueCards(this.blockIds);
    const sorted = applySort(cards, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
  }

  getSupportedActions(): CardBrowserAction[] {
    return buildQueueActions({
      withInsert: true,
      withSort: false,
      withPriority: true,
      withTimeAdjust: true,
    });
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    if (actionId === 'open') return;

    const queue = this.getQueueById(this.queueId);

    // ========== 队列操作 ==========

    // 从当前队列移除
    if (actionId === 'remove-from-current-queue' && queue) {
      const removedCount = await removeFromQueue(queue, selectedRows);
      console.log('[BlockIdsDataSource] Removed', removedCount, 'cards from queue');
      return { removedCount };
    }

    // 插入到指定位置
    if (actionId === 'insert-at' && queue) {
      const index = Math.max(0, Math.floor(Number(context?.index ?? 0)));
      await insertAt(queue, selectedRows, index);
      return;
    }

    // 设置优先级
    if (actionId === 'set-priority') {
      const p = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));

      // 如果队列支持，使用队列的 setPriority
      if (queue) {
        await setPriority(queue, selectedRows, p);
      } else {
        // 降级到直接设置块属性
        await batchSetBlockPriority(selectedRows, p);
      }
      return;
    }

    // ========== 时间调整 ==========
    if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
      const result = await adjustTime(this.plugin, selectedRows, actionId as any, context);
      return result;
    }

    console.warn('[BlockIdsDataSource] Unknown action:', actionId);
  }

  private getQueueById(queueId: string) {
    if (queueId === 'retrieval') return this.plugin?.retrievalQueue;
    if (queueId === 'final-drill') return this.plugin?.finalDrillQueue;
    if (queueId === 'neural-roam') return this.plugin?.neuralQueue;
    if (queueId === 'filter-group') return this.plugin?.filterGroupQueue;
    if (queueId === 'incremental-learning') return this.plugin?.incrementalQueue;
    return null;
  }
}

