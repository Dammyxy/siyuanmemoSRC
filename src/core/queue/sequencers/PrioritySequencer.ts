import type { ISequencer } from '../abstraction/types';

export class PrioritySequencer<TItem> implements ISequencer<TItem> {
  private readonly fetchNext: (() => Promise<TItem | null>) | null = null;
  private readonly fetchAll: (() => Promise<TItem[]>) | null = null;
  private readonly getDueMs: ((item: TItem) => number) | null = null;
  private readonly getPriority: ((item: TItem) => number) | null = null;
  private readonly items: TItem[] = [];
  private loaded = false;

  constructor(
    fetchNextOrOptions:
      | (() => Promise<TItem | null>)
      | {
          fetchAll: () => Promise<TItem[]>;
          getDueMs: (item: TItem) => number;
          getPriority: (item: TItem) => number;
        },
  ) {
    if (typeof fetchNextOrOptions === 'function') {
      this.fetchNext = fetchNextOrOptions;
      return;
    }
    this.fetchAll = fetchNextOrOptions.fetchAll;
    this.getDueMs = fetchNextOrOptions.getDueMs;
    this.getPriority = fetchNextOrOptions.getPriority;
  }

  /**
   * Reset the sequencer state
   * 
   * This forces the sequencer to reload items on the next call to next().
   * Useful when the underlying data source has changed (e.g., after rotateToEnd).
   */
  reset(): void {
    this.loaded = false;
    this.items.length = 0;
  }

  async next(): Promise<TItem | null> {
    console.log('[PrioritySequencer] next() called, loaded:', this.loaded, 'items.length:', this.items.length);
    
    if (this.fetchNext) {
      return await this.fetchNext();
    }
    if (!this.fetchAll || !this.getDueMs || !this.getPriority) return null;
    if (!this.loaded) {
      this.loaded = true;
      console.log('[PrioritySequencer] Loading items via fetchAll()...');
      const fetched = await this.fetchAll();
      console.log('[PrioritySequencer] fetchAll() returned:', {
        count: fetched?.length || 0,
        items: fetched?.slice(0, 3).map((it: any) => ({
          cardID: it?.cardID,
          nextDues: it?.nextDues,
        })),
      });
      if (!fetched || fetched.length === 0) {
        console.log('[PrioritySequencer] No items fetched, items array remains empty');
      } else {
        this.items.push(...fetched);
        this.items.sort((a, b) => {
          const da = this.getDueMs(a);
          const db = this.getDueMs(b);
          const dayA = dayKey(da);
          const dayB = dayKey(db);
          if (dayA !== dayB) return da - db;
          const pa = this.getPriority(a);
          const pb = this.getPriority(b);
          if (pa !== pb) return pa - pb;
          return da - db;
        });
        console.log('[PrioritySequencer] Items sorted, count:', this.items.length);
      }
    }
    if (this.items.length === 0) {
      console.log('[PrioritySequencer] No items available, returning null');
      return null;
    }
    const nextItem = this.items.shift() || null;
    console.log('[PrioritySequencer] Returning item:', {
      cardID: (nextItem as any)?.cardID,
      remainingCount: this.items.length,
    });
    return nextItem;
  }
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
