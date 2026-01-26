import type { BrowserCard } from '../types';
import { loadQueueCards } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import { AutoSortCommand, InsertAtCommand, RemoveItemsCommand, SetPriorityCommand } from '@/core/queue/commands';

type FinalDrillQueueLike = {
  getAllItems?: () => any[];
  removeItems?: (items: any[]) => Promise<number> | number;
  removeItem?: (item: any) => Promise<boolean> | boolean;
  setPriority?: (cardID: string, priority: number) => Promise<boolean> | boolean;
  sort?: () => Promise<void> | void;
  insertAt?: (items: any[], index: number) => Promise<void> | void;
  getMutableTrait?: () => any;
  getRemovableTrait?: () => any;
  getPrioritizableTrait?: () => any;
  getAutoSortableTrait?: () => any;
};

type FsrsPluginLike = {
  finalDrillQueue?: FinalDrillQueueLike;
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

export class FinalDrillDataSource implements ICardDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  private readonly plugin?: FsrsPluginLike;

  constructor(plugin: FsrsPluginLike | undefined) {
    this.plugin = plugin;
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const q = this.plugin?.finalDrillQueue;
    const items = q?.getAllItems?.() || [];
    const blockIds = (items || []).map((it: any) => String(it?.blockID || '')).filter(Boolean);
    const cards = await loadQueueCards(blockIds);
    const byBlockId = new Map(cards.map((c) => [c.blockId, c]));

    const ordered: BrowserCard[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const bid = String(it?.blockID || '');
      const card = byBlockId.get(bid);
      if (!card) continue;
      card.queueIndex = i + 1;
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
      { id: 'insert-at', label: 'Insert at', icon: 'iconAlignLeft' },
      { id: 'set-priority', label: 'Set Priority', icon: 'iconMark' },
      { id: 'auto-sort', label: 'Auto Sort', icon: 'iconSort' },
    ];
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
    if (actionId === 'open') return;
    const q = this.plugin?.finalDrillQueue;
    if (!q) return;
    const items = (selectedRows || []).map((r) => ({
      cardID: r.fsrsCardId || r.id || r.blockId,
      blockID: r.blockId,
      deckID: r.deckId,
      priority: typeof r.priority === 'number' ? r.priority : 50,
    }));

    if (actionId === 'remove-from-queue') {
      const trait = q.getRemovableTrait?.();
      if (trait) {
        const cmd = new RemoveItemsCommand<any>();
        await cmd.execute({ trait, items });
        return;
      }
      if (q.removeItems) {
        await Promise.resolve(q.removeItems(items));
        return;
      }
      for (const it of items) await Promise.resolve(q.removeItem?.(it));
      return;
    }

    if (actionId === 'insert-at') {
      const idx = Math.max(0, Math.floor(Number(context?.index ?? 0)));
      const trait = q.getMutableTrait?.();
      if (trait) {
        const cmd = new InsertAtCommand<any>();
        await cmd.execute({ trait, items, index: idx });
        return;
      }
      await Promise.resolve(q.insertAt?.(items, idx));
      return;
    }

    if (actionId === 'set-priority') {
      const p = Math.max(0, Math.min(100, Math.floor(Number(context?.priority))));
      for (const r of selectedRows as any[]) {
        r.priority = p;
      }
      const trait = q.getPrioritizableTrait?.();
      if (trait) {
        const cmd = new SetPriorityCommand<any>();
        await cmd.execute({ trait, items, priority: p });
        return;
      }
      for (const it of items) {
        const id = String((it as any)?.cardID || '');
        if (!id) continue;
        await Promise.resolve(q.setPriority?.(id, p));
      }
      return;
    }

    if (actionId === 'auto-sort') {
      const trait = q.getAutoSortableTrait?.();
      if (trait) {
        const cmd = new AutoSortCommand();
        await cmd.execute({ trait });
        return;
      }
      await Promise.resolve(q.sort?.());
      return;
    }
  }
}
