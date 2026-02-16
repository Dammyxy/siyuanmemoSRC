/**
 * Final Drill Queue (V2 - Composite Architecture)
 *
 * @deprecated 此文件属于旧队列架构，将在未来版本中移除。
 * 请使用 src/queues/ 中的新架构。
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
 *
 * New implementation using BaseCompositeQueue pattern.
 * Cards rated < 4 enter the queue, rating = 4 removes them.
 *
 * Features:
 * - Dynamic draw sequencing (or list traversal)
 * - Conditional scheduling (remove on rating = 4)
 * - Auto-sort functionality (daily)
 * - Persistence to storage
 */

import type { StorageManager } from '../../storage/StorageManager';
import type { PersistenceAdapter } from '../persistence';
import { StorageFileJsonAdapter } from '../adapters/storageFile';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types';
import { FinalDrillSequencer } from '../sequencers/FinalDrillSequencer';
import { ConditionalScheduler } from '../schedulers/ConditionalScheduler';
import { NullScheduler } from '../schedulers/NullScheduler';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue';
import type { IMutableTrait, IRemovableTrait, IPrioritizableTrait, IAutoSortableTrait } from '../abstraction/types';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority';

type FinalDrillItem = QueueItem & { priority: number };

type Snapshot = {
  items: FinalDrillItem[];
  lastAutoSortDay?: string;
};

/**
 * Final Drill Queue (V2)
 *
 * New implementation using composite architecture.
 * Maintains full compatibility with V1.
 */
/**
 * @deprecated Old architecture queue. Use src/queues/FinalDrillQueue instead.
 */
export class FinalDrillQueue extends BaseCompositeQueue<FinalDrillItem> {
  private readonly adapter: PersistenceAdapter<Snapshot> | null;
  // ⚠️ sequencer is already in BaseCompositeQueue, don't redeclare as private
  private readonly _localSequencer: FinalDrillSequencer<FinalDrillItem>;
  private lastAutoSortDay = '';

  constructor(storage?: StorageManager) {
    // Create persistence adapter
    const adapter = storage ? new StorageFileJsonAdapter<Snapshot>(storage, 'queue-final-drill.json') : null;

    // Create Final Drill sequencer with SuperMemo's FlipElement(5, 3, 6) algorithm
    const sequencer = new FinalDrillSequencer<FinalDrillItem>(undefined, {
      lowestPick: 5,
      lowestInsert: 3,
      highestInsert: 6,
    });

    // Create conditional scheduler (remove card when rating = 4)
    const scheduler = new ConditionalScheduler<FinalDrillItem, 1 | 2 | 3 | 4>({
      base: new NullScheduler<FinalDrillItem>(),
      condition: (_card, grade) => grade === 4, // Easy rating
      onCondition: async (card) => {
        console.log('[SiyuanMemo][FinalDrillQueue] Card removed (rating=4):', card.cardID);
        // Return null to signal removal
        return null;
      },
      removeOnCondition: true,
    });

    // ⚠️ MUST call super() FIRST before using 'this'
    // We'll use a placeholder for traits and assign them after super()
    super({
      scheduler,
      sequencer,
      dataSource: {
        getAll: async () => sequencer.getAll(),
        add: async () => 0, // Placeholder
        remove: async () => 0, // Placeholder
        size: () => sequencer.size(),
        isEmpty: () => sequencer.size() === 0,
      },
      traits: [], // Will be set after
      uiConfig: {
        statsType: 'queue-size',
        showRatingButtons: true,
        allowSkip: true,
      },
      statsLabel: '最终演练',
    });

    // Now safe to assign to 'this'
    this.adapter = adapter;
    this._localSequencer = sequencer;

    // Now create traits that can use 'this'
    const mutableTrait: IMutableTrait<FinalDrillItem> = {
      id: 'mutable',
      insertAt: async (items, index) => {
        await this.insertAtPhysicalMove(items, index);
        await this.save();
      },
    };

    const removableTrait: IRemovableTrait<FinalDrillItem> = {
      id: 'removable',
      remove: async (items) => {
        return await this.removeItems(items);
      },
    };

    const prioritizableTrait: IPrioritizableTrait<FinalDrillItem> = {
      id: 'prioritizable',
      setPriority: async (item, priority) => {
        const id = String(item.cardID || '');
        if (!id) return false;
        return await this.setPriority(id, priority);
      },
    };

    const autoSortableTrait: IAutoSortableTrait = {
      id: 'auto-sortable',
      sort: async () => {
        await this.sort();
      },
    };

    // Register traits - must be a Map, not an array
    (this as any).traits.set('mutable', mutableTrait);
    (this as any).traits.set('removable', removableTrait);
    (this as any).traits.set('prioritizable', prioritizableTrait);
    (this as any).traits.set('auto-sortable', autoSortableTrait);

    // Update dataSource methods that need 'this'
    const baseDataSource = (this as any).dataSource;
    baseDataSource.add = async (items: FinalDrillItem[]) => {
      return await this.addItemsToSequencer(items);
    };
    baseDataSource.remove = async (items: FinalDrillItem[]) => {
      return await this.removeItemsFromSequencer(items);
    };
  }

  /**
   * Initialize queue from storage
   */
  async init(): Promise<void> {
    if (!this.adapter) return;

    const snap = await this.adapter.load();
    if (snap?.items && Array.isArray(snap.items)) {
      const items = snap.items.map((x) => ({
        ...x,
        priority: Number.isFinite(Number((x as any).priority)) ? Number((x as any).priority) : DEFAULT_PRIORITY,
      }));
      this.sequencer.setAll(items);
    }

    this.lastAutoSortDay = String((snap as any)?.lastAutoSortDay || '');
    await this.autoSortIfNeeded();
  }

  /**
   * Override onFeedback to handle rating = 4 removal
   */
  async onFeedback(currentItem: FinalDrillItem | null, feedback: any): Promise<void> {
    if (!currentItem) return;

    if (feedback.action === 'rate' && feedback.rating === 4) {
      // Rating = 4: Remove from queue
      const removed = await this.removeItems([currentItem]);
      console.log('[SiyuanMemo][FinalDrillQueue] Removed card (rating=4):', {
        cardID: currentItem.cardID,
        removed,
      });
      return;
    }

    // Other ratings: Keep in queue, call base implementation
    await super.onFeedback(currentItem, feedback);
  }

  /**
   * Override getStats to provide queue statistics
   */
  async getStats(): Promise<QueueStats> {
    return {
      size: this.sequencer.size(),
    };
  }

  /**
   * Get all items
   */
  getAllItems(): FinalDrillItem[] {
    return this.sequencer.getAll();
  }

  /**
   * Insert items at specific index
   */
  async insertAt(items: FinalDrillItem[], index: number): Promise<void> {
    const mutableTrait = this.getTrait<IMutableTrait<FinalDrillItem>>('mutable');
    if (mutableTrait) {
      await mutableTrait.insertAt(items, index);
    }
  }

  /**
   * Add items to queue
   */
  async addItems(items: FinalDrillItem[]): Promise<number> {
    return await this.addItemsToSequencer(items);
  }

  /**
   * Remove items from queue
   */
  async removeItems(items: FinalDrillItem[]): Promise<number> {
    return await this.removeItemsFromSequencer(items);
  }

  /**
   * Set priority of a card
   */
  async setPriority(cardID: string, priority: number): Promise<boolean> {
    const id = String(cardID || '');
    if (!id) return false;

    const p = Math.max(0, Math.min(100, Math.floor(Number(priority))));
    const current = this.sequencer.getAll();
    const it = current.find((x) => String(x.cardID) === id);

    if (!it) return false;

    it.priority = p;
    this.sequencer.setAll(current);
    await this.save();
    return true;
  }

  /**
   * Sort queue by priority
   */
  async sort(): Promise<void> {
    const current = this.sequencer.getAll();
    current.sort((a, b) => {
      const pa = Number(a.priority);
      const pb = Number(b.priority);
      if (pa !== pb) return pa - pb;
      return String(a.cardID).localeCompare(String(b.cardID));
    });
    this.sequencer.setAll(current);
    await this.save();
  }

  /**
   * Reorder queue
   */
  async reorder(orderedItems: FinalDrillItem[]): Promise<boolean> {
    try {
      const current = this.sequencer.getAll();
      if (orderedItems.length !== current.length) return false;

      const byId = new Map(current.map((x) => [String(x.cardID), x] as const));
      const next: FinalDrillItem[] = [];

      for (const it of orderedItems) {
        const id = String((it as any)?.cardID || '');
        if (!id) return false;

        const existing = byId.get(id);
        if (!existing) return false;

        const p = Number((it as any)?.priority);
        const priority = Number.isFinite(p)
          ? Math.max(0, Math.min(100, Math.floor(p)))
          : Number(existing.priority) || DEFAULT_PRIORITY;

        next.push({ ...existing, priority });
      }

      this.sequencer.reorder(next);
      await this.save();
      return true;
    } catch (err) {
      console.error('[SiyuanMemo][FinalDrillQueue] reorder failed:', err);
      return false;
    }
  }

  /**
   * Clear queue
   */
  async clear(): Promise<void> {
    this.sequencer.setAll([]);
    await this.save();
  }

  /**
   * Get trait accessors
   */
  getMutableTrait(): IMutableTrait<FinalDrillItem> {
    return this.getTrait<IMutableTrait<FinalDrillItem>>('mutable')!;
  }

  getRemovableTrait(): IRemovableTrait<FinalDrillItem> {
    return this.getTrait<IRemovableTrait<FinalDrillItem>>('removable')!;
  }

  getPrioritizableTrait(): IPrioritizableTrait<FinalDrillItem> {
    return this.getTrait<IPrioritizableTrait<FinalDrillItem>>('prioritizable')!;
  }

  getAutoSortableTrait(): IAutoSortableTrait {
    return this.getTrait<IAutoSortableTrait>('auto-sortable')!;
  }

  /**
   * Save queue state to storage
   */
  private async save(): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.save({
      items: this.sequencer.getAll(),
      lastAutoSortDay: this.lastAutoSortDay,
    });
  }

  /**
   * Insert items at specific index (physical move)
   */
  private async insertAtPhysicalMove(items: FinalDrillItem[], index: number): Promise<void> {
    const toInsert: FinalDrillItem[] = [];

    for (const it of items || []) {
      const cardID = String((it as any)?.cardID || '');
      const blockID = String((it as any)?.blockID || '');
      const deckID = String((it as any)?.deckID || '');

      if (!cardID || !blockID || !deckID) continue;

      const priority = Number.isFinite(Number((it as any)?.priority))
        ? Number((it as any).priority)
        : DEFAULT_PRIORITY;

      toInsert.push({ ...(it as any), cardID, blockID, deckID, priority } as FinalDrillItem);
    }

    if (toInsert.length === 0) return;

    const removeSet = new Set(toInsert.map((x) => String(x.cardID)));
    const current = this.sequencer.getAll().filter((x) => !removeSet.has(String(x.cardID)));

    const clamped = Math.max(0, Math.min(Math.floor(Number(index || 0)), current.length));
    current.splice(clamped, 0, ...toInsert);

    this.sequencer.setAll(current);
  }

  /**
   * Auto-sort if needed (once per day)
   */
  private async autoSortIfNeeded(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (today === this.lastAutoSortDay) return;

    this.lastAutoSortDay = today;

    if (this.sequencer.size() <= 1) {
      await this.save();
      return;
    }

    await this.sort();
  }

  /**
   * Add items to sequencer
   */
  private async addItemsToSequencer(items: FinalDrillItem[]): Promise<number> {
    const current = this.sequencer.getAll();
    const existing = new Set(current.map((x) => String(x.cardID)));

    let added = 0;
    const toAppend: FinalDrillItem[] = [];

    for (const it of items || []) {
      const cardID = String((it as any)?.cardID || '');
      const blockID = String((it as any)?.blockID || '');
      const deckID = String((it as any)?.deckID || '');

      if (!cardID || !blockID || !deckID) continue;
      if (existing.has(cardID)) continue;

      existing.add(cardID);
      const priority = Number.isFinite(Number((it as any)?.priority))
        ? Number((it as any).priority)
        : DEFAULT_PRIORITY;

      toAppend.push({ ...(it as any), cardID, blockID, deckID, priority } as FinalDrillItem);
      added++;
    }

    if (added > 0) {
      const next = current.concat(toAppend);
      this.sequencer.setAll(next);
      await this.save();
    }

    return added;
  }

  /**
   * Remove items from sequencer
   */
  private async removeItemsFromSequencer(items: FinalDrillItem[]): Promise<number> {
    const removeSet = new Set((items || []).map((x) => String((x as any)?.cardID || '')).filter(Boolean));

    if (removeSet.size === 0) return 0;

    const current = this.sequencer.getAll();
    const next = current.filter((x) => !removeSet.has(String(x.cardID)));

    const removed = current.length - next.length;
    this.sequencer.setAll(next);

    if (removed > 0) await this.save();

    return removed;
  }
}
