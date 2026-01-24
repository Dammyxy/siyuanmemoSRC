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

  async next(): Promise<TItem | null> {
    if (this.fetchNext) {
      return await this.fetchNext();
    }
    if (!this.fetchAll || !this.getDueMs || !this.getPriority) return null;
    if (!this.loaded) {
      this.loaded = true;
      const fetched = await this.fetchAll();
      if (!fetched || fetched.length === 0) {
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
      }
    }
    if (this.items.length === 0) return null;
    return this.items.shift() || null;
  }
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
