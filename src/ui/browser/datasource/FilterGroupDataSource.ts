import type { BrowserCard } from '../types';
import { loadQueueCards } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';

type FilterGroupQueueLike = {
  getAllItems?: () => any[];
  removeItems?: (items: any[]) => Promise<number> | number;
  removeItem?: (item: any) => Promise<boolean> | boolean;
};

type FsrsPluginLike = {
  filterGroupQueue?: FilterGroupQueueLike;
};

// ✅ 四重筛选：支持的筛选参数
export type FilterGroupDataSourceOptions = {
  docId?: string;      // 文档筛选
  preset?: string;     // Preset 筛选
  queryText?: string;  // 搜索查询
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
    return [
      { id: 'open', label: 'Open', icon: 'iconOpen' },
      { id: 'remove-from-queue', label: 'Remove from Queue', icon: 'iconTrashcan' },
    ];
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
    void context;
    if (actionId === 'open') return;
    if (actionId !== 'remove-from-queue') return;
    const q = this.plugin?.filterGroupQueue;
    if (!q) return;
    const items = (selectedRows || []).map((r) => ({
      cardID: r.fsrsCardId || r.id || r.blockId,
      blockID: r.blockId,
      deckID: r.deckId,
      priority: typeof r.priority === 'number' ? r.priority : 50,
    }));
    if (q.removeItems) {
      await Promise.resolve(q.removeItems(items));
      return;
    }
    for (const it of items) {
      await Promise.resolve(q.removeItem?.(it));
    }
  }
}

