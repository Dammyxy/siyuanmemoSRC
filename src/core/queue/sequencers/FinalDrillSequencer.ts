/**
 * Final Drill Sequencer
 *
 * Implements SuperMemo's FlipElement(5, 3, 6) dynamic shuffle algorithm.
 * 
 * Algorithm:
 * - Before each review, randomly pick an item from position 5 or later
 * - Move it to a random position between 3 and 6
 * - This keeps the order fresh and prevents repetitive patterns
 * 
 * Reference: SuperMemo Final Drill Algorithm
 * https://supermemo.guru/wiki/Final_drill_algorithm
 */

import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';

export type FinalDrillSequencerConfig = {
  /**
   * Lowest position to pick from (default: 5)
   * Items at position >= lowestPick are candidates for shuffling
   */
  lowestPick?: number;

  /**
   * Lowest position to insert at (default: 3)
   */
  lowestInsert?: number;

  /**
   * Highest position to insert at (default: 6)
   */
  highestInsert?: number;
};

/**
 * Final Drill Sequencer
 * 
 * Implements SuperMemo's dynamic shuffle algorithm for Final Drill.
 * Each time next() is called, it performs a FlipElement operation before
 * returning the first item.
 */
export class FinalDrillSequencer<TItem extends QueueItem> implements ISequencer<TItem> {
  private items: TItem[];
  private readonly lowestPick: number;
  private readonly lowestInsert: number;
  private readonly highestInsert: number;

  constructor(items?: TItem[], config?: FinalDrillSequencerConfig) {
    this.items = Array.isArray(items) ? [...items] : [];
    this.lowestPick = config?.lowestPick ?? 5;
    this.lowestInsert = config?.lowestInsert ?? 3;
    this.highestInsert = config?.highestInsert ?? 6;
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

  /**
   * Get next item with FlipElement shuffle
   * 
   * Before returning the first item, performs FlipElement(lowestPick, lowestInsert, highestInsert)
   * to shuffle the queue dynamically.
   */
  async next(): Promise<TItem | null> {
    // Perform FlipElement shuffle before getting next item
    this.flipElement();

    // Return first item
    const it = this.items[0];
    if (!it) return null;
    
    // Remove from queue
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

  /**
   * FlipElement(lowestPick, lowestInsert, highestInsert)
   * 
   * SuperMemo's dynamic shuffle algorithm:
   * 1. Pick a random item from position >= lowestPick
   * 2. Move it to a random position between lowestInsert and highestInsert
   * 3. If original position == new position, shift by 1
   */
  private flipElement(): void {
    const queueSize = this.items.length;

    // Need at least lowestPick items to shuffle
    if (queueSize < this.lowestPick) {
      return;
    }

    // Pick random position from [lowestPick, queueSize)
    // Note: positions are 1-indexed in the spec, but 0-indexed in code
    const pickStart = this.lowestPick - 1; // Convert to 0-indexed
    const pickEnd = queueSize - 1;
    const pickPos = pickStart + Math.floor(Math.random() * (pickEnd - pickStart + 1));

    // Choose random insert position from [lowestInsert, highestInsert]
    // Note: positions are 1-indexed in the spec, but 0-indexed in code
    const insertStart = this.lowestInsert - 1; // Convert to 0-indexed
    const insertEnd = Math.min(this.highestInsert - 1, queueSize - 1); // Don't exceed queue size
    let insertPos = insertStart + Math.floor(Math.random() * (insertEnd - insertStart + 1));

    // Overlap check: if pick == insert, shift by 1
    if (pickPos === insertPos) {
      insertPos = pickPos + 1;
      // If shift exceeds queue size, stop
      if (insertPos >= queueSize) {
        return;
      }
    }

    // Perform the shuffle
    const item = this.items[pickPos];
    
    // Remove from original position
    this.items.splice(pickPos, 1);
    
    // Adjust insert position if needed (if we removed an item before the insert point)
    const adjustedInsertPos = pickPos < insertPos ? insertPos - 1 : insertPos;
    
    // Insert at new position
    this.items.splice(adjustedInsertPos, 0, item);

    console.log('[FinalDrillSequencer] FlipElement:', {
      queueSize,
      pickPos: pickPos + 1, // Log as 1-indexed for clarity
      insertPos: adjustedInsertPos + 1,
      itemId: this.getItemId(item),
    });
  }

  private getItemId(item: TItem): string {
    return String((item as any)?.cardID || (item as any)?.blockID || (item as any)?.id || '');
  }
}
