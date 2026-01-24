import type { ISequencer } from '../abstraction/types';

export class ListSequencer<TItem> implements ISequencer<TItem> {
  private items: TItem[];

  constructor(items?: TItem[]) {
    this.items = Array.isArray(items) ? [...items] : [];
  }

  getAll(): TItem[] {
    return [...this.items];
  }

  setAll(items: TItem[]): void {
    this.items = Array.isArray(items) ? [...items] : [];
  }

  size(): number {
    return this.items.length;
  }

  async next(): Promise<TItem | null> {
    const it = this.items[0];
    if (!it) return null;
    this.items = this.items.slice(1);
    return it;
  }

  insertAt(items: TItem[], index: number): void {
    const toInsert = Array.isArray(items) ? items.filter((x) => x != null) : [];
    if (toInsert.length === 0) return;
    const clamped = Math.max(0, Math.min(Math.floor(Number(index || 0)), this.items.length));
    this.items.splice(clamped, 0, ...toInsert);
  }
}
