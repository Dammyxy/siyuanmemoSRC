import type { ICardDataSource, CardBrowserAction, CardRow } from './types';
import { loadQueueCards } from '../browserService';

export class FinalDrillDataSource implements ICardDataSource {
  id = 'final-drill';
  label = 'Final Drill';

  private readonly plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  async fetchRows(): Promise<CardRow[]> {
    const q = this.plugin?.finalDrillQueue;
    const items: any[] = q?.getAllItems?.() || [];
    const blockIds = items.map((it) => String(it?.blockID || '')).filter(Boolean);
    const cards = await loadQueueCards(blockIds);
    const priorityMap = new Map<string, number>();
    for (const it of items) {
      const id = String(it?.cardID || '');
      if (!id) continue;
      if (typeof it?.priority === 'number') priorityMap.set(id, it.priority);
    }
    return cards.map((c: any) => {
      const row: any = { ...c, originalItem: c };
      const k = String(c?.fsrsCardId || '');
      if (k && priorityMap.has(k)) {
        row.priority = priorityMap.get(k);
      }
      return row as CardRow;
    });
  }

  getSupportedActions(): CardBrowserAction[] {
    return [
      { id: 'remove-from-queue', label: 'Remove from Queue', icon: 'iconTrashcan' },
      { id: 'set-priority', label: 'Set Queue Priority', icon: 'iconMark' },
      { id: 'auto-sort', label: 'Auto-Sort Queue', icon: 'iconSort' },
    ];
  }

  async performAction(actionId: string, rows: CardRow[], payload?: any): Promise<{ refresh?: boolean } | void> {
    const q = this.plugin?.finalDrillQueue;
    if (!q) throw new Error('finalDrillQueue not available');

    if (actionId === 'remove-from-queue') {
      const items = rows.map((r: any) => ({
        cardID: r.fsrsCardId || r.id || r.blockId,
        blockID: r.blockId,
        deckID: r.deckId,
      }));
      if (q?.removeItems) {
        await q.removeItems(items);
      } else {
        for (const it of items) {
          await q.removeItem?.(it);
        }
      }
      return { refresh: true };
    }

    if (actionId === 'set-priority') {
      const p = Number(payload?.priority);
      if (!Number.isFinite(p)) return;
      const clamped = Math.max(0, Math.min(100, Math.round(p)));
      if (!q?.setPriority) throw new Error('finalDrillQueue.setPriority not implemented');
      let changed = 0;
      for (const r of rows) {
        const cardID = String((r as any)?.fsrsCardId || '');
        if (!cardID) continue;
        (r as any).priority = clamped;
        const ok = await q.setPriority(cardID, clamped);
        if (ok) changed++;
      }
      return { refresh: changed > 0 };
    }

    if (actionId === 'auto-sort') {
      await q.sort?.();
      return { refresh: true };
    }
  }
}
