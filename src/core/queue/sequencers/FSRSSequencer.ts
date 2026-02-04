import type { ISequencer, IDataSourceObserver } from '../abstraction/types';
import type { QueueItem } from '../types';

/**
 * Configuration options for FSRSSequencer
 * 
 * @template TItem - The type of items in the queue (must extend QueueItem)
 */
export interface FSRSSequencerOptions<TItem extends QueueItem> {
  /**
   * Function to get the due time (in milliseconds) for an item
   * 
   * This is used as the **primary sort key**. Items with earlier due times
   * will be served first.
   * 
   * @param item - The item to get due time for
   * @returns Due time in milliseconds since epoch
   * 
   * @example
   * ```typescript
   * getDueMs: (card) => card.due
   * ```
   */
  getDueMs: (item: TItem) => number;
  
  /**
   * Function to get the priority for an item (optional)
   * 
   * This is used as the **secondary sort key**. When two items have the same
   * due time, the one with higher priority will be served first.
   * 
   * If not provided, items with the same due time will be served in insertion order.
   * 
   * @param item - The item to get priority for
   * @returns Priority value (higher = more important)
   * 
   * @example
   * ```typescript
   * // Higher priority for cards with more lapses
   * getPriority: (card) => card.lapses * 10
   * ```
   */
  getPriority?: (item: TItem) => number;
  
  /**
   * Initial items to populate the queue (optional)
   * 
   * If provided, these items will be sorted and added to the queue
   * during construction.
   * 
   * @example
   * ```typescript
   * const sequencer = new FSRSSequencer({
   *   getDueMs: (card) => card.due,
   *   getPriority: (card) => card.priority,
   *   initialItems: await dataSource.getAll()
   * });
   * ```
   */
  initialItems?: TItem[];
}

/**
 * FSRSSequencer - FSRS-optimized Sequencer with Learning Queue Support
 * 
 * This sequencer is specifically designed for FSRS algorithm, supporting:
 * - **Precise due time sorting** (millisecond precision)
 * - **Learning steps** (1m, 5m, 10m intervals)
 * - **Dynamic insertion** (failed cards re-enter queue)
 * - **Priority support** (secondary sort key)
 * 
 * ## Key Differences from SortedSequencer
 * 
 * | Feature | SortedSequencer | FSRSSequencer |
 * |---------|----------------|---------------|
 * | Due time check | No | Yes (only returns due items) |
 * | Learning steps | Not optimized | Optimized for short intervals |
 * | Use case | General purpose | FSRS-specific |
 * 
 * ## FSRS Learning Steps Example
 * 
 * ```typescript
 * // FSRS configuration
 * learning_steps: ['1m', '10m']
 * 
 * // When user rates "Again"
 * card.due = now + 1 minute
 * sequencer.insert(card) // Card will appear in 1 minute
 * 
 * // When user rates "Good"
 * card.due = now + 10 minutes
 * sequencer.insert(card) // Card will appear in 10 minutes
 * ```
 * 
 * ## Sorting Strategy
 * 
 * Items are sorted by:
 * 1. **Due time** (primary key) - Earlier due times come first
 * 2. **Priority** (secondary key) - Higher priority comes first (if provided)
 * 3. **Insertion order** (tertiary key) - FIFO for items with same due time and priority
 * 
 * ## next() Behavior
 * 
 * Unlike SortedSequencer which always returns the first item, FSRSSequencer
 * only returns items that are **currently due** (due time <= now).
 * 
 * This is important for FSRS learning steps:
 * - If a card is due in 5 minutes, `next()` returns `null` now
 * - After 5 minutes, `next()` returns the card
 * 
 * ## Binary Search Insertion
 * 
 * Uses the same binary search algorithm as SortedSequencer for O(log n) insertion.
 * 
 * @template TItem - The type of items in the queue
 * 
 * @see ISequencer
 * @see IDataSourceObserver
 * @see SortedSequencer - For comparison
 * 
 * @example Basic usage with FSRS
 * ```typescript
 * const sequencer = new FSRSSequencer<QueueItem>({
 *   getDueMs: (card) => CardStorage.getDueTime(card),
 *   getPriority: (card) => card.priority ?? 50,
 *   initialItems: await dataSource.getAll()
 * });
 * 
 * // Register as observer
 * dataSource.addObserver(sequencer);
 * 
 * // Get next due card
 * const card = await sequencer.next(); // Only returns if due time <= now
 * 
 * // After rating "Again", card gets new due time (e.g., now + 1 minute)
 * card.due = Date.now() + 60000;
 * sequencer.insert(card); // Re-insert with binary search
 * 
 * // Card won't appear until 1 minute passes
 * await sequencer.next(); // null (not due yet)
 * 
 * // After 1 minute
 * await sequencer.next(); // Returns the card
 * ```
 * 
 * @example With priority
 * ```typescript
 * const sequencer = new FSRSSequencer<QueueItem>({
 *   getDueMs: (card) => card.due,
 *   getPriority: (card) => {
 *     // Higher priority for cards with more lapses
 *     return (card.lapses ?? 0) * 10;
 *   }
 * });
 * 
 * // Two cards due at the same time
 * card1.due = now;
 * card1.lapses = 5; // priority = 50
 * 
 * card2.due = now;
 * card2.lapses = 2; // priority = 20
 * 
 * sequencer.insert(card1);
 * sequencer.insert(card2);
 * 
 * await sequencer.next(); // Returns card1 (higher priority)
 * await sequencer.next(); // Returns card2
 * ```
 */
export class FSRSSequencer<TItem extends QueueItem> implements ISequencer<TItem>, IDataSourceObserver {
  private readonly items: TItem[] = [];
  private readonly getDueMs: (item: TItem) => number;
  private readonly getPriority?: (item: TItem) => number;

  constructor(options: FSRSSequencerOptions<TItem>) {
    this.getDueMs = options.getDueMs;
    this.getPriority = options.getPriority;
    
    // Initialize with sorted items if provided
    if (options.initialItems && options.initialItems.length > 0) {
      this.items.push(...options.initialItems);
      this._sortAll();
    }
  }

  /**
   * Get the next due item from the queue
   * 
   * **Key Difference from SortedSequencer:**
   * This method only returns items that are **currently due** (due time <= now).
   * 
   * ## Behavior:
   * 1. Finds the first item where `due time <= now`
   * 2. Removes and returns that item
   * 3. Returns `null` if no items are due yet
   * 
   * ## Why this matters for FSRS:
   * 
   * FSRS uses short learning intervals (1m, 5m, 10m). If we always return
   * the first item (like SortedSequencer), users would see cards before
   * they're actually due.
   * 
   * With FSRSSequencer:
   * - Card due in 5 minutes → `next()` returns `null` now
   * - After 5 minutes → `next()` returns the card
   * 
   * ## Performance:
   * - **Time complexity**: O(n) in worst case (linear search for first due item)
   * - **Space complexity**: O(1)
   * 
   * ## Optimization opportunity:
   * Since items are sorted by due time, we could optimize this to O(1)
   * by checking if `items[0].due <= now`. However, we keep the current
   * implementation for clarity and to handle edge cases.
   * 
   * @returns The next due item, or `null` if no items are due
   * 
   * @example
   * ```typescript
   * const now = Date.now();
   * 
   * // Card due in 5 minutes
   * card1.due = now + 300000;
   * sequencer.insert(card1);
   * 
   * // Card due now
   * card2.due = now;
   * sequencer.insert(card2);
   * 
   * await sequencer.next(); // Returns card2 (due now)
   * await sequencer.next(); // Returns null (card1 not due yet)
   * 
   * // After 5 minutes
   * await sequencer.next(); // Returns card1
   * ```
   */
  async next(): Promise<TItem | null> {
    if (this.items.length === 0) {
      return null;
    }
    
    const now = Date.now();
    
    // Find the first item that is due
    // Since items are sorted by due time, we can optimize this
    // by checking the first item
    const firstItem = this.items[0];
    if (!firstItem) {
      return null;
    }
    
    const dueTime = this.getDueMs(firstItem);
    
    // Only return if the item is due
    if (dueTime <= now) {
      return this.items.shift() || null;
    }
    
    // No items are due yet
    return null;
  }

  /**
   * Insert an item into the queue at the correct sorted position
   * 
   * Uses binary search to find the insertion point, maintaining sorted order.
   * This is the same algorithm as SortedSequencer.
   * 
   * ## Algorithm:
   * 1. Use binary search to find the correct insertion index - O(log n)
   * 2. Use `splice()` to insert the item at that index - O(n) due to array shifting
   * 3. Overall complexity: O(n) due to array shifting
   * 
   * ## Sorting order:
   * Items are inserted to maintain sort by:
   * 1. Due time (primary key) - earlier times first
   * 2. Priority (secondary key) - higher priority first (if provided)
   * 3. Insertion order (tertiary key) - FIFO
   * 
   * @param item - The item to insert
   * 
   * @example FSRS learning step pattern
   * ```typescript
   * // User rates "Again" on a card
   * const card = await sequencer.next();
   * 
   * // FSRS calculates new due time (e.g., 1 minute later)
   * card.due = Date.now() + 60000;
   * 
   * // Re-insert at correct position
   * sequencer.insert(card);
   * 
   * // Card will appear again in 1 minute
   * ```
   */
  insert(item: TItem): void {
    const index = this._findIndexToInsert(item);
    this.items.splice(index, 0, item);
  }

  /**
   * Insert multiple items into the queue
   * 
   * Convenience method for inserting multiple items. Each item is inserted
   * individually using the `insert()` method.
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
   * Searches for an item matching the predicate and removes it.
   * 
   * @param predicate - Function to identify the item to remove
   * @returns `true` if item was found and removed, `false` otherwise
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
   * 
   * @returns The number of items currently in the queue
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Check if the queue is empty
   * 
   * @returns `true` if the queue has no items, `false` otherwise
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Clear all items from the queue
   * 
   * Removes all items from the queue, resetting it to an empty state.
   */
  clear(): void {
    this.items.length = 0;
  }

  /**
   * Called when the data source's data has changed
   * 
   * Implements `IDataSourceObserver` to receive notifications when the underlying
   * data source changes.
   * 
   * ## Behavior:
   * - Clears all items from the queue
   * - Does NOT automatically reload data
   * - You must manually repopulate the queue after this is called
   * 
   * @see IDataSourceObserver
   * @see IObservableDataSource
   */
  onDataChanged(): void {
    this.items.length = 0;
  }

  /**
   * Get all items in the queue (for debugging/testing)
   * 
   * Returns a copy of the internal items array.
   * 
   * @returns A copy of the items array in sorted order
   */
  getAll(): TItem[] {
    return [...this.items];
  }

  /**
   * Get the number of items that are currently due
   * 
   * This is useful for displaying "X cards due now" in the UI.
   * 
   * @returns The number of items with due time <= now
   * 
   * @example
   * ```typescript
   * const dueCount = sequencer.getDueCount();
   * console.log(`${dueCount} cards due now`);
   * ```
   */
  getDueCount(): number {
    const now = Date.now();
    let count = 0;
    
    // Since items are sorted by due time, we can stop at the first non-due item
    for (const item of this.items) {
      if (this.getDueMs(item) <= now) {
        count++;
      } else {
        break; // All remaining items are not due yet
      }
    }
    
    return count;
  }

  /**
   * Get the next due time
   * 
   * Returns the due time of the next item in the queue, or `null` if empty.
   * This is useful for displaying "Next card in X minutes" in the UI.
   * 
   * @returns The due time in milliseconds, or `null` if queue is empty
   * 
   * @example
   * ```typescript
   * const nextDue = sequencer.getNextDueTime();
   * if (nextDue) {
   *   const minutesUntilDue = Math.ceil((nextDue - Date.now()) / 60000);
   *   console.log(`Next card in ${minutesUntilDue} minutes`);
   * }
   * ```
   */
  getNextDueTime(): number | null {
    if (this.items.length === 0) {
      return null;
    }
    
    return this.getDueMs(this.items[0]);
  }

  /**
   * Find the correct insertion index for an item using binary search
   * 
   * This is the same algorithm as SortedSequencer.
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
          if (targetPriority > midPriority) {
            // Higher priority comes first
            right = mid;
          } else if (targetPriority < midPriority) {
            left = mid + 1;
          } else {
            // Both due time and priority are equal, insert after (FIFO)
            left = mid + 1;
          }
        } else {
          // No priority function, insert after (FIFO)
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
          return pb - pa; // Higher priority first
        }
      }
      
      // If both are equal, maintain original order
      return 0;
    });
  }
}
