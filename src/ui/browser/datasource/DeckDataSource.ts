import type { CardBrowserAction, CardRow, ICardDataSource } from './types';
import { batchSetPriority, batchSuspend, loadCards } from '../browserService';
import { riff } from '@/core/siyuan';

export class DeckDataSource implements ICardDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly plugin: any;
  private readonly preset: string;
  private readonly currentDocId?: string;

  constructor(plugin: any, options?: { preset?: string; currentDocId?: string }) {
    this.plugin = plugin;
    this.preset = options?.preset || 'all';
    this.currentDocId = options?.currentDocId;
  }

  async fetchRows(): Promise<CardRow[]> {
    const cards = await loadCards(this.preset, this.currentDocId);
    return cards.map((c: any) => ({ ...c, originalItem: c }));
  }

  getSupportedActions(): CardBrowserAction[] {
    return [
      { id: 'add-to-outstanding', label: 'Add to Outstanding', icon: 'iconFlag' },
      { id: 'advance', label: 'Advance', icon: 'iconCalendar' },
      { id: 'postpone', label: 'Postpone', icon: 'iconCalendar' },
      { id: 'set-priority', label: 'Set Priority', icon: 'iconMark' },
      { id: 'suspend', label: 'Suspend', icon: 'iconPause' },
      { id: 'unsuspend', label: 'Unsuspend', icon: 'iconPlay' },
    ];
  }

  async performAction(actionId: string, rows: CardRow[], payload?: any): Promise<{ refresh?: boolean } | void> {
    if (actionId === 'add-to-outstanding') {
      const q = this.plugin?.finalDrillQueue;
      if (!q?.insertAt) throw new Error('finalDrillQueue.insertAt not implemented');

      for (const r of rows) {
        const cardID = String((r as any)?.fsrsCardId || (r as any)?.id || (r as any)?.blockId || '');
        const blockID = String((r as any)?.blockId || '');
        const deckID = String((r as any)?.deckId || riff.BUILTIN_DECK_ID);
        if (!cardID || !blockID) continue;
        const priority = typeof (r as any)?.priority === 'number' ? Math.min(100, Math.max(0, Math.round((r as any).priority))) : 0;
        await q.insertAt({ cardID, blockID, deckID, priority }, 'top');
      }

      return { refresh: false };
    }

    if (actionId === 'advance') {
      const maxDays = Math.max(1, Math.min(365, Math.floor(Number(payload?.maxDays || 0))));
      const missingBlockIds = rows
        .map((r: any) => ({ blockId: String(r?.blockId || r?.blockID || ''), cardId: String(r?.id || ''), currentDue: r?.due instanceof Date ? r.due : undefined }))
        .filter(x => x.blockId || x.cardId);

      const result = await this.plugin.rescheduleService.advance(missingBlockIds, maxDays, { source: 'browser' });

      // Optimistic Update
      for (const item of result.updated) {
        const row = rows.find(r => (r.id && r.id === item.cardId) || (r.blockId && r.blockId === item.blockId));
        if (row) {
          row.due = new Date(item.newDue); // Assuming formatSiyuanTime result needs parsing if we want Date object, but Row uses Date for display usually?
          // Wait, CardRow uses `due: Date`. RescheduleService returns formatted string.
          // I need to parse it back or RescheduleService returns Date?
          // Existing browserService `batchAdvance` returned `dueFormatted`.
          // `DeckDataSource` relied on `batchAdvance` creating `items` array but didn't update rows?
          // Wait, `batchAdvance` in `browserService.ts` DID mutate `rows` in place!
          // "r.due = due;" (line 535)
        }
      }
      // Re-apply in-place mutation here because Service is headless and doesn't mutate rows passed in (it takes structured input)
      // Actually my implementation of Service takes `rows: Array<{...}>`.
      // It returns result.updated with newDue string.
      // I should update the UI rows manually here.

      // Let's refine the update loop.
      const parseSiyuan = (s: string) => {
        const y = parseInt(s.slice(0, 4));
        const m = parseInt(s.slice(4, 6)) - 1;
        const d = parseInt(s.slice(6, 8));
        const h = parseInt(s.slice(8, 10));
        const min = parseInt(s.slice(10, 12));
        const s_ = parseInt(s.slice(12, 14));
        return new Date(y, m, d, h, min, s_);
      };

      for (const item of result.updated) {
        const row = rows.find(r => (r.id === item.cardId) || (r.blockId && r.blockId === item.blockId));
        if (row) {
          row.due = parseSiyuan(item.newDue);
          // Also update formatted string if needed
          // row.dueFormatted = ... (formatDate is imported?)
          // DeckDataSource doesn't seem to import formatDate or use it directly, CardBrowser uses it.
          // CardRow type has dueFormatted.
        }
      }

      return { refresh: true }; // Force refresh to be safe, or false if optimistic is perfect. 
    }

    if (actionId === 'postpone') {
      const days = Math.max(1, Math.min(365, Math.floor(Number(payload?.days || 0))));
      const missingBlockIds = rows
        .map((r: any) => ({ blockId: String(r?.blockId || r?.blockID || ''), cardId: String(r?.id || ''), currentDue: r?.due instanceof Date ? r.due : undefined }))
        .filter(x => x.blockId || x.cardId);

      const result = await this.plugin.rescheduleService.postpone(missingBlockIds, days, { source: 'browser' });

      const parseSiyuan = (s: string) => {
        const y = parseInt(s.slice(0, 4));
        const m = parseInt(s.slice(4, 6)) - 1;
        const d = parseInt(s.slice(6, 8));
        const h = parseInt(s.slice(8, 10));
        const min = parseInt(s.slice(10, 12));
        const s_ = parseInt(s.slice(12, 14));
        return new Date(y, m, d, h, min, s_);
      };

      for (const item of result.updated) {
        const row = rows.find(r => (r.id === item.cardId) || (r.blockId && r.blockId === item.blockId));
        if (row) {
          row.due = parseSiyuan(item.newDue);
        }
      }
      return { refresh: true };
    }

    if (actionId === 'set-priority') {
      const priority = Number(payload?.priority);
      if (!Number.isFinite(priority)) return;
      const clamped = Math.max(0, Math.min(100, Math.round(priority)));
      for (const r of rows as any[]) {
        r.priority = clamped;
      }
      const blockIds = rows.map((r: any) => String(r?.blockId || '')).filter(Boolean);
      if (blockIds.length > 0) {
        await batchSetPriority(blockIds, clamped);
      }
      return { refresh: false };
    }

    if (actionId === 'suspend' || actionId === 'unsuspend') {
      const suspend = actionId === 'suspend';
      for (const r of rows as any[]) {
        r.suspended = suspend;
      }
      const blockIds = rows.map((r: any) => String(r?.blockId || '')).filter(Boolean);
      if (blockIds.length > 0) {
        await batchSuspend(blockIds, suspend);
      }
      return { refresh: false };
    }
  }
}
