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

      // 调试：打印基本信息
      console.log('[ExtractionPracticeQueue] reorder - Step 0: Basic info:', {
        currentCount: currentItems.length,
        orderedCount: orderedItems.length,
        countsMatch: orderedItems.length === currentItems.length,
      });

      if (orderedItems.length !== currentItems.length) {
        console.error('[ExtractionPracticeQueue] reorder - FAIL: Count mismatch');
        return false;
      }

      const currentIds = new Set(currentItems.map((it) => String((it as any)?.cardID || '')).filter(Boolean));
      const orderedIds = new Set((orderedItems || []).map((it) => String((it as any)?.cardID || '')).filter(Boolean));

      // 调试：打印 ID 集合信息
      console.log('[ExtractionPracticeQueue] reorder - Step 1: ID sets:', {
        currentIdsSize: currentIds.size,
        orderedIdsSize: orderedIds.size,
        sizesMatch: currentIds.size === orderedIds.size,
        firstFewCurrentIds: Array.from(currentIds).slice(0, 3),
        firstFewOrderedIds: Array.from(orderedIds).slice(0, 3),
      });

      if (currentIds.size !== orderedIds.size) {
        console.error('[ExtractionPracticeQueue] reorder - FAIL: ID set size mismatch');
        return false;
      }

      // 调试：检查所有 orderedIds 是否都在 currentIds 中
      let notFoundCount = 0;
      const notFoundIds: string[] = [];
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          notFoundCount++;
          notFoundIds.push(id);
        }
      }

      console.log('[ExtractionPracticeQueue] reorder - Step 2: ID existence check:', {
        notFoundCount,
        notFoundIds: notFoundIds.slice(0, 5),
        allCurrentIds: Array.from(currentIds),
        allOrderedIds: Array.from(orderedIds),
      });

      if (notFoundCount > 0) {
        console.error('[ExtractionPracticeQueue] reorder - FAIL: Some ordered IDs not in current items');
        console.error('[ExtractionPracticeQueue] Missing IDs:', notFoundIds);
        console.error('[ExtractionPracticeQueue] Current items:', currentItems.map((it: any) => ({
          cardID: it.cardID,
          blockID: it.blockID,
          deckID: it.deckID,
        })));
        return false;
      }

      const byId = new Map(currentItems.map((it) => [String((it as any)?.cardID || ''), it] as const));
      const next: QueueItem[] = [];
      const seen = new Set<string>();

      // 调试：检查循环中的每一步
      let emptyIdCount = 0;
      let duplicateCount = 0;
      let notInMapCount = 0;

      for (const it of orderedItems) {
        const id = String((it as any)?.cardID || '');
        if (!id) {
          emptyIdCount++;
          continue;
        }
        if (seen.has(id)) {
          duplicateCount++;
          continue;
        }
        seen.add(id);
        const existing = byId.get(id);
        if (!existing) {
          notInMapCount++;
          console.warn('[ExtractionPracticeQueue] ID not in map:', id);
          continue;
        }
        next.push(existing);
      }

      console.log('[ExtractionPracticeQueue] reorder - Step 3: Loop validation:', {
        emptyIdCount,
        duplicateCount,
        notInMapCount,
        nextLength: next.length,
        expectedLength: orderedItems.length,
      });

      if (emptyIdCount > 0 || duplicateCount > 0 || notInMapCount > 0) {
        console.error('[ExtractionPracticeQueue] reorder - FAIL: Loop validation failed');
        return false;
      }

      await this.storage.setPracticeQueue(next);
      console.log('[ExtractionPracticeQueue] reorder - SUCCESS: Queue reordered');
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
