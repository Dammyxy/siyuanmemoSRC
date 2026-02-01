/**
 * SortedSequencer - SM-15 Style Sequencer with Binary Search Insertion
 * 
 * This sequencer maintains a sorted queue and supports efficient insertion
 * using binary search, similar to SM-15's _findIndexToInsert method.
 * 
 * Key features:
 * - O(log n) insertion using binary search
 * - O(1) next() operation
 * - Maintains sorted order at all times
 * - No need to reset() after insertion
 * 
 * Comparison with PrioritySequencer:
 * - PrioritySequencer: Load all → Sort once → Shift items → Reset when changed
 * - SortedSequencer: Maintain sorted order → Insert with binary search → No reset needed
 */

import type { ISequencer } from '../abstraction/types';

export interface SortedSequencerOptions<TItem> {
  /**
   * Function to get the due time (in milliseconds) for an item
   * Used as the primary sort key
   */
  getDueMs: (item: TItem) => number;
  
  /**
   * Function to get the priority for an item
   * Used as the secondary sort key (when due times are equal)
   */
  getPriority?: (item: TItem) => number;
  
  /**
   * Initial items to populate the queue
   * Will be sorted on construction
   */
  initialItems?: TItem[];
}

/**
 * SortedSequencer maintains a sorted queue of items
 * 
 * Items are sorted by:
 * 1. Due time (primary key)
 * 2. Priority (secondary key, if provided)
 * 
 * Insertion uses binary search to find the correct position (O(log n))
 * Next operation is O(1) (just shift from the front)
 */
export class SortedSequencer<TItem> implements ISequencer<TItem> {
  private readonly items: TItem[] = [];
  private readonly getDueMs: (item: TItem) => number;
  private readonly getPriority?: (item: TItem) => number;

  constructor(options: SortedSequencerOptions<TItem>) {
    this.getDueMs = options.getDueMs;
    this.getPriority = options.getPriority;
    
    // Initialize with sorted items if provided
    if (options.initialItems && options.initialItems.length > 0) {
      this.items.push(...options.initialItems);
      this._sortAll();
    }
  }

  /**
   * Get the next item from the queue
   * 
   * @returns The next item, or null if queue is empty
   */
  async next(): Promise<TItem | null> {
    if (this.items.length === 0) {
      return null;
    }
    return this.items.shift() || null;
  }

  /**
   * Insert an item into the queue at the correct sorted position
   * 
   * Uses binary search to find the insertion point (O(log n))
   * Then uses splice to insert (O(n) due to array shifting)
   * 
   * This is similar to SM-15's approach:
   * ```javascript
   * SM.prototype.answer = function(grade, item, now) {
   *   this._update(grade, item, now);
   *   this.discard(item);
   *   return this.q.splice(this._findIndexToInsert(item), 0, item);
   * };
   * ```
   * 
   * @param item - The item to insert
   */
  insert(item: TItem): void {
    const index = this._findIndexToInsert(item);
    this.items.splice(index, 0, item);
    
    console.log('[SortedSequencer] Inserted item at index', index, {
      cardID: (item as any)?.cardID,
      dueTime: this.getDueMs(item),
      queueSize: this.items.length,
    });
  }

  /**
   * Insert multiple items into the queue
   * 
   * @param items - The items to insert
   */
  insertMany(items: TItem[]): void {
    for (const item of items) {
      this.insert(item);
    }
  }

  /**
   * Remove an item from the queue
   * 
   * @param predicate - Function to identify the item to remove
   * @returns true if item was found and removed, false otherwise
   */
  remove(predicate: (item: TItem) => boolean): boolean {
    const index = this.items.findIndex(predicate);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get the current size of the queue
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Clear all items from the queue
   */
  clear(): void {
    this.items.length = 0;
  }

  /**
   * Get all items in the queue (for debugging/testing)
   * 
   * @returns A copy of the items array
   */
  getAll(): TItem[] {
    return [...this.items];
  }

  /**
   * Find the correct insertion index for an item using binary search
   * 
   * This is based on SM-15's _findIndexToInsert method:
   * ```javascript
   * SM.prototype._findIndexToInsert = function(item, r) {
   *   if (r.length === 0) return 0;
   *   v = item.dueDate;
   *   i = Math.floor(r.length / 2);
   *   if (r.length === 1) {
   *     if (v < this.q[r[i]].dueDate) {
   *       return r[i];
   *     } else {
   *       return r[i] + 1;
   *     }
   *   }
   *   return this._findIndexToInsert(item, 
   *     v < this.q[r[i]].dueDate ? r.slice(0, i) : r.slice(i)
   *   );
   * };
   * ```
   * 
   * Our implementation uses an iterative approach instead of recursive
   * for better performance and to avoid stack overflow on large queues.
   * 
   * @param item - The item to find insertion index for
   * @returns The index where the item should be inserted
   * @private
   */
  private _findIndexToInsert(item: TItem): number {
    if (this.items.length === 0) {
      return 0;
    }

    const targetDueTime = this.getDueMs(item);
    const targetPriority = this.getPriority ? this.getPriority(item) : 0;
    
    let left = 0;
    let right = this.items.length;

    // Binary search to find insertion point
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midItem = this.items[mid];
      const midDueTime = this.getDueMs(midItem);
      const midPriority = this.getPriority ? this.getPriority(midItem) : 0;

      // Compare by due time first
      if (targetDueTime < midDueTime) {
        right = mid;
      } else if (targetDueTime > midDueTime) {
        left = mid + 1;
      } else {
        // Due times are equal, compare by priority
        if (this.getPriority) {
          if (targetPriority < midPriority) {
            right = mid;
          } else if (targetPriority > midPriority) {
            left = mid + 1;
          } else {
            // Both due time and priority are equal, insert after
            left = mid + 1;
          }
        } else {
          // No priority function, insert after
          left = mid + 1;
        }
      }
    }

    return left;
  }

  /**
   * Sort all items in the queue
   * 
   * This is only used during initialization.
   * After that, items are inserted in sorted order using binary search.
   * 
   * @private
   */
  private _sortAll(): void {
    this.items.sort((a, b) => {
      const da = this.getDueMs(a);
      const db = this.getDueMs(b);
      
      // Compare by due time first
      if (da !== db) {
        return da - db;
      }
      
      // If due times are equal, compare by priority
      if (this.getPriority) {
        const pa = this.getPriority(a);
        const pb = this.getPriority(b);
        if (pa !== pb) {
          return pa - pb;
        }
      }
      
      // If both are equal, maintain original order
      return 0;
    });
  }
}
