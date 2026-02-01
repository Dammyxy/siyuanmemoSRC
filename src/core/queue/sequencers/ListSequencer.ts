import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';

export class ListSequencer<TItem extends QueueItem> implements ISequencer<TItem> {
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

  reorder(orderedItems: TItem[]): void {
    if (!Array.isArray(orderedItems)) {
      throw new Error('Reorder failed: orderedItems is not an array');
    }
    if (orderedItems.length !== this.items.length) {
      throw new Error(`Reorder failed: expected ${this.items.length} items, got ${orderedItems.length}`);
    }

    const currentIds = new Set(this.items.map((item) => this.getItemId(item)));
    const orderedIds = new Set(orderedItems.map((item) => this.getItemId(item)));

    for (const id of orderedIds) {
      if (!currentIds.has(id)) {
        throw new Error(`Reorder failed: item ${id} not found in current queue`);
      }
    }

    if (currentIds.size !== orderedIds.size) {
      throw new Error('Reorder failed: item count mismatch');
    }

    this.items = [...orderedItems];
  }

  private getItemId(item: TItem): string {
    return String((item as any)?.cardID || (item as any)?.blockID || (item as any)?.id || '');
  }
}
