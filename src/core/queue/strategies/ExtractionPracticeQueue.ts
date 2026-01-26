import type { StorageManager } from '@/core/storage';
import type { QueueInterface, QueueItem } from '../types.ts';

export class ExtractionPracticeQueue implements QueueInterface<QueueItem> {
  private readonly storage: StorageManager;

  constructor(storage: StorageManager) {
    this.storage = storage;
  }

  async addItems(items: QueueItem[]): Promise<number> {
    return this.storage.addPracticeQueue(items);
  }

  getAllItems(): QueueItem[] {
    return (this.storage.getPracticeQueue() || []) as QueueItem[];
  }

  async clear(): Promise<void> {
    await this.storage.clearPracticeQueue();
  }

  async addItem(item: QueueItem): Promise<void> {
    await this.addItems([item]);
  }

  async getNextItem(): Promise<QueueItem | null> {
    const items = this.getAllItems();
    const next = items[0];
    if (!next) return null;
    const rest = items.slice(1);
    await this.storage.setPracticeQueue(rest);
    return next;
  }

  async removeItem(item: QueueItem): Promise<boolean> {
    const id = String(item?.cardID || '');
    if (!id) return false;
    const items = this.getAllItems();
    const next = items.filter((x) => String(x?.cardID || '') !== id);
    if (next.length === items.length) return false;
    await this.storage.setPracticeQueue(next);
    return true;
  }

  async reorder(orderedItems: QueueItem[]): Promise<boolean> {
    try {
      const currentItems = this.getAllItems();
      if (orderedItems.length !== currentItems.length) return false;

      const currentIds = new Set(currentItems.map((it) => String((it as any)?.cardID || '')).filter(Boolean));
      const orderedIds = new Set((orderedItems || []).map((it) => String((it as any)?.cardID || '')).filter(Boolean));
      if (currentIds.size !== orderedIds.size) return false;
      for (const id of orderedIds) {
        if (!currentIds.has(id)) return false;
      }

      const byId = new Map(currentItems.map((it) => [String((it as any)?.cardID || ''), it] as const));
      const next: QueueItem[] = [];
      const seen = new Set<string>();
      for (const it of orderedItems) {
        const id = String((it as any)?.cardID || '');
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        const existing = byId.get(id);
        if (!existing) return false;
        next.push(existing);
      }

      await this.storage.setPracticeQueue(next);
      return true;
    } catch (err) {
      console.error('[ExtractionPracticeQueue] reorder failed:', err);
      return false;
    }
  }

  size(): number {
    return this.getAllItems().length;
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }
}
