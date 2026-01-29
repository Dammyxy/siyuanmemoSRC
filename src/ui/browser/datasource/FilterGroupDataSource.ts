import type { BrowserCard } from '../types';
import { loadQueueCards } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import {
  buildQueueActions,
  removeFromQueue,
  insertAt,
  setPriority,
  adjustTime,
} from './MenuActions';

type FilterGroupQueueLike = {
  getAllItems?: () => any[];
  removeItems?: (items: any[]) => Promise<number> | number;
  removeItem?: (item: any) => Promise<boolean> | boolean;
};

type FsrsPluginLike = {
  filterGroupQueue?: FilterGroupQueueLike;
};

// ✅ 五重筛选：支持的筛选参数
export type FilterGroupDataSourceOptions = {
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

export class FilterGroupDataSource implements ICardDataSource {
  id = 'filter-group';
  label = 'Filter Group';

  private readonly plugin?: FsrsPluginLike;
  private readonly options: FilterGroupDataSourceOptions;

  constructor(plugin: FsrsPluginLike | undefined, options?: FilterGroupDataSourceOptions) {
    this.plugin = plugin;
    this.options = options || {};
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const q = this.plugin?.filterGroupQueue;
    const items = q?.getAllItems?.() || [];
    const blockIds = (items || []).map((it: any) => String(it?.blockID || it?.blockId || '')).filter(Boolean);
    const cards = await loadQueueCards(blockIds);
    const byBlockId = new Map(cards.map((c) => [c.blockId, c]));

    const ordered: BrowserCard[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const bid = String(it?.blockID || it?.blockId || '');
      const card = byBlockId.get(bid);
      if (!card) continue;
      card.queueIndex = i + 1;
      const p = Number(it?.priority);
      if (Number.isFinite(p)) {
        (card as any).priority = p;
      }
      ordered.push(card);
    }

    // ✅ 四重筛选：应用文档、Preset、搜索筛选
    let filtered = this.applyFilters(ordered);

    const sorted = applySort(filtered, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
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
    });
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
    if (actionId === 'open') return;

    const q = this.plugin?.filterGroupQueue;
    if (!q) return;

    // 从队列移除
    if (actionId === 'remove-from-current-queue') {
      await removeFromQueue(q, selectedRows);
      return;
    }

    // 插入到指定位置
    if (actionId === 'insert-at') {
      const index = Math.max(0, Math.floor(Number(context?.index ?? 0)));
      await insertAt(q, selectedRows, index);
      return;
    }

    // 设置优先级
    if (actionId === 'set-priority') {
      const priority = Math.max(0, Math.min(100, Math.floor(Number(context?.priority))));
      await setPriority(q, selectedRows, priority);
      return;
    }

    // 时间调整
    if (actionId === 'postpone' || actionId === 'advance' || actionId === 'spread') {
      await adjustTime(this.plugin, selectedRows, actionId as any, context);
      return;
    }
  }
}

