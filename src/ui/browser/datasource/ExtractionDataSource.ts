import type { BrowserCard } from '../types';
import { loadQueueCards } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';

type ExtractionQueueLike = {
  getAllItems?: () => any[];
  removeItem?: (item: any) => Promise<boolean> | boolean;
  removeItems?: (items: any[]) => Promise<number> | number;
};

type FsrsPluginLike = {
  extractionQueue?: ExtractionQueueLike;
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

export class ExtractionDataSource implements ICardDataSource {
  id = 'extraction';
  label = 'Extraction';

  private readonly plugin?: FsrsPluginLike;

  constructor(plugin: FsrsPluginLike | undefined) {
    this.plugin = plugin;
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const q = (this.plugin as any)?.extractionQueue as ExtractionQueueLike | undefined;
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
      const p = Number(it?.priority);
      if (Number.isFinite(p)) {
        (card as any).priority = p;
      }
      ordered.push(card);
    }

    const sorted = applySort(ordered, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
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
    const q = (this.plugin as any)?.extractionQueue as ExtractionQueueLike | undefined;
    if (!q) return;
    const items = (selectedRows || []).map((r) => ({
      cardID: r.id || r.fsrsCardId || r.blockId,  // 优先使用 id（Riff card ID），与队列存储保持一致
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

