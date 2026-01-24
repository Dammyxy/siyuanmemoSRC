import type { StorageManager } from '@/core/storage';
import type { QueueInterface, QueueItem } from '../types';

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

  size(): number {
    return this.getAllItems().length;
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }
}

