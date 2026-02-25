import type { ISequencer, IDataSourceObserver } from '../abstraction/types';
import type { QueueItem } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SortedSequencer');

/**
 * Configuration options for SortedSequencer
 * 
 * @template TItem - The type of items in the queue (must extend QueueItem)
 */
export interface SortedSequencerOptions<TItem extends QueueItem> {
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
   * 
   * @example
   * ```typescript
   * // Higher priority for older cards
   * getPriority: (card) => -card.createdAt
   * ```
   */
  getPriority?: (item: TItem) => number;
  
  /**
   * Initial items to populate the queue (optional)
   * 
   * If provided, these items will be sorted and added to the queue
   * during construction. This is useful for initializing the queue
   * with existing data.
   * 
   * @example
   * ```typescript
   * const sequencer = new SortedSequencer({
   *   getDueMs: (card) => card.due,
   *   getPriority: (card) => card.priority,
   *   initialItems: await dataSource.getAll()
   * });
   * ```
   */
  initialItems?: TItem[];
}

/**
 * SortedSequencer - SM-15 Style Sequencer with Binary Search Insertion
 * 
 * This sequencer maintains a sorted queue and supports efficient insertion
 * using binary search, similar to SuperMemo 15's `_findIndexToInsert` method.
 * Unlike PrioritySequencer which loads all items once and sorts them,
 * SortedSequencer maintains sorted order continuously through efficient insertions.
 * 
 * ## Key Features
 * 
 * - **O(log n) insertion** using binary search to find insertion point
 * - **O(1) next() operation** - just shift from the front
 * - **Maintains sorted order at all times** - no need to re-sort
 * - **No reset needed after insertion** - items are inserted in correct position
 * - **Memory efficient** - only stores items currently in the queue
 * 
 * ## Comparison with PrioritySequencer
 * 
 * | Feature | PrioritySequencer | SortedSequencer |
 * |---------|------------------|-----------------|
 * | Loading | Load all → Sort once | Insert one by one |
 * | Insertion | Not supported | O(log n) binary search |
 * | Next | O(1) shift | O(1) shift |
 * | Memory | All items cached | Only queued items |
 * | Use case | Static queues | Dynamic queues |
 * | Reset needed | Yes (after data change) | No (insert maintains order) |
 * 
 * ## Caching Mechanism
 * 
 * Unlike PrioritySequencer's lazy-loading cache, SortedSequencer maintains
 * items in memory at all times:
 * - Items are stored in a sorted array
 * - New items are inserted at the correct position using binary search
 * - Items are removed from the front via `next()`
 * - The cache is cleared when `onDataChanged()` is called
 * 
 * ## Observer Pattern
 * 
 * Implements `IDataSourceObserver` to receive notifications when the underlying
 * data source changes. When `onDataChanged()` is called:
 * 1. All items are cleared from the queue
 * 2. The queue needs to be explicitly repopulated (unlike PrioritySequencer's lazy reload)
 * 
 * **Note**: SortedSequencer doesn't have a lazy-loading mechanism like PrioritySequencer.
 * After `onDataChanged()`, you need to manually insert items or reload the queue.
 * 
 * ## Sorting Strategy
 * 
 * Items are sorted by:
 * 1. **Due time** (primary key) - Earlier due times come first
 * 2. **Priority** (secondary key) - Higher priority comes first (if provided)
 * 3. **Insertion order** (tertiary key) - For items with same due time and priority
 * 
 * ## Inspired by SuperMemo 15
 * 
 * This implementation is based on SM-15's approach:
 * ```javascript
 * SM.prototype.answer = function(grade, item, now) {
 *   this._update(grade, item, now);
 *   this.discard(item);
 *   return this.q.splice(this._findIndexToInsert(item), 0, item);
 * };
 * ```
 * 
 * The key insight: After updating a card's scheduling data, remove it from
 * the queue and re-insert it at the correct position using binary search.
 * 
 * @template TItem - The type of items in the queue
 * 
 * @see ISequencer
 * @see IDataSourceObserver
 * @see PrioritySequencer - For comparison
 * @see ADR-002: Observer Pattern for Cache Invalidation
 * 
 * @example Basic usage
 * ```typescript
 * // Create a sorted sequencer for review cards
 * const sequencer = new SortedSequencer<ReviewCard>({
 *   getDueMs: (card) => card.due,
 *   getPriority: (card) => card.lapses * 10,
 *   initialItems: await dataSource.getAll()
 * });
 * 
 * // Register for automatic cache invalidation
 * dataSource.addObserver(sequencer);
 * 
 * // Get next card
 * const card = await sequencer.next();
 * 
 * // After reviewing, update and re-insert
 * card.due = Date.now() + 86400000; // Due tomorrow
 * sequencer.remove((c) => c.cardID === card.cardID);
 * sequencer.insert(card); // Inserted at correct position
 * 
 * // No reset needed - queue maintains sorted order
 * const nextCard = await sequencer.next();
 * ```
 * 
 * @example Dynamic queue management
 * ```typescript
 * const sequencer = new SortedSequencer<ReviewCard>({
 *   getDueMs: (card) => card.due,
 *   getPriority: (card) => card.priority
 * });
 * 
 * // Add cards dynamically
 * sequencer.insert(card1); // O(log n)
 * sequencer.insert(card2); // O(log n)
 * sequencer.insert(card3); // O(log n)
 * 
 * // Queue is always sorted
 * const next = await sequencer.next(); // Gets earliest due card
 * ```
 */
export class SortedSequencer<TItem extends QueueItem> implements ISequencer<TItem>, IDataSourceObserver {
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
   * Returns the item with the earliest due time (and highest priority if due times are equal).
   * This is an O(1) operation as items are already sorted.
   * 
   * ## Behavior:
   * - Removes and returns the first item from the sorted queue
   * - Returns `null` if the queue is empty
   * - Does not reload data (unlike PrioritySequencer)
   * 
   * ## Performance:
   * - **Time complexity**: O(1) - just shifts from array front
   * - **Space complexity**: O(1) - no additional memory needed
   * 
   * ## Edge cases:
   * - Returns `null` if queue is empty
   * - Returns `null` if all items have been consumed
   * 
   * @returns The next item in sorted order, or `null` if queue is empty
   * 
   * @example
   * ```typescript
   * const sequencer = new SortedSequencer({
   *   getDueMs: (card) => card.due,
   *   initialItems: [card1, card2, card3]
   * });
   * 
   * const first = await sequencer.next();  // Gets earliest due card
   * const second = await sequencer.next(); // Gets next earliest
   * const third = await sequencer.next();  // Gets last card
   * const fourth = await sequencer.next(); // null - queue empty
   * ```
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
   * Uses binary search to find the insertion point, then inserts the item
   * while maintaining sorted order. This is inspired by SuperMemo 15's approach
   * of removing and re-inserting items after updating their scheduling data.
   * 
   * ## Algorithm:
   * 1. Use binary search to find the correct insertion index - O(log n)
   * 2. Use `splice()` to insert the item at that index - O(n) due to array shifting
   * 3. Overall complexity: O(n) due to array shifting, but binary search minimizes comparisons
   * 
   * ## Sorting order:
   * Items are inserted to maintain sort by:
   * 1. Due time (primary key) - earlier times first
   * 2. Priority (secondary key) - higher priority first (if provided)
   * 3. Insertion order (tertiary key) - for items with same due time and priority
   * 
   * ## Performance:
   * - **Time complexity**: O(n) - O(log n) search + O(n) array shift
   * - **Space complexity**: O(1) - no additional memory needed
   * 
   * ## Comparison with SM-15:
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
   * The pattern: Update → Remove → Re-insert at correct position
   * 
   * @param item - The item to insert
   * 
   * @example Basic insertion
   * ```typescript
   * const sequencer = new SortedSequencer({
   *   getDueMs: (card) => card.due,
   *   getPriority: (card) => card.lapses
   * });
   * 
   * // Insert cards - they're automatically sorted
   * sequencer.insert(cardDueTomorrow);  // Inserted at correct position
   * sequencer.insert(cardDueToday);     // Inserted before tomorrow's card
   * sequencer.insert(cardDueNextWeek);  // Inserted after both
   * 
   * await sequencer.next(); // Returns cardDueToday
   * ```
   * 
   * @example SM-15 style update pattern
   * ```typescript
   * // Get a card and review it
   * const card = await sequencer.next();
   * 
   * // Update the card's scheduling data
   * card.due = Date.now() + 86400000; // Due tomorrow
   * card.lapses += 1;
   * 
   * // Re-insert at correct position (no need to remove first if already consumed)
   * sequencer.insert(card);
   * 
   * // Or if card is still in queue, remove then re-insert
   * sequencer.remove((c) => c.cardID === card.cardID);
   * sequencer.insert(card);
   * ```
   */
  insert(item: TItem): void {
    logger.debug('insert called', {
      cardID: item.id,
      blockID: item.blockId,
      dueTime: this.getDueMs(item),
      priority: this.getPriority ? this.getPriority(item) : undefined,
    });
    logger.debug('queue snapshot before insert', {
      size: this.items.length,
      topFive: this.items.slice(0, 5).map((i) => ({
      cardID: i.id,
      dueTime: this.getDueMs(i),
      })),
    });
    
    const index = this._findIndexToInsert(item);
    logger.debug('calculated insert index', { index });
    
    this.items.splice(index, 0, item);
    logger.debug('inserted by splice', { size: this.items.length });
    
    // 验证插入结果
    const insertedItem = this.items[index];
    if (insertedItem !== item) {
      logger.error('insert verification failed: item not at expected index', {
        expected: item.id,
        actualAtIndex: insertedItem.id,
      });
    } else {
      logger.debug('insert verification passed');
    }
    
    // 验证 cardID
    const expectedCardID = item.id;
    const actualCardID = insertedItem.id;
    if (expectedCardID !== actualCardID) {
      logger.error('critical: cardID mismatch after insert', {
        expected: expectedCardID,
        actual: actualCardID,
        index,
        itemBefore: index > 0 ? this.items[index - 1].id : null,
        itemAfter: index < this.items.length - 1 ? this.items[index + 1].id : null,
      });
    }
    
    logger.debug('insert completed', {
      index,
      cardID: item.id,
      dueTime: this.getDueMs(item),
      queueSize: this.items.length,
    });
  }

  /**
   * Insert multiple items into the queue
   * 
   * Convenience method for inserting multiple items. Each item is inserted
   * individually using the `insert()` method, maintaining sorted order.
   * 
   * ## Performance:
   * - **Time complexity**: O(n * m) where n = queue size, m = items to insert
   * - Each insert is O(n), and we do m inserts
   * - For large batches, consider using `initialItems` in constructor instead
   * 
   * ## Note:
   * If you're initializing a queue with many items, it's more efficient to
   * use the `initialItems` option in the constructor, which sorts once
   * instead of inserting one by one.
   * 
   * @param items - The items to insert
   * 
   * @example
   * ```typescript
   * const sequencer = new SortedSequencer({
   *   getDueMs: (card) => card.due
   * });
   * 
   * // Insert multiple cards
   * sequencer.insertMany([card1, card2, card3]);
   * 
   * // More efficient for initialization:
   * const sequencer2 = new SortedSequencer({
   *   getDueMs: (card) => card.due,
   *   initialItems: [card1, card2, card3] // Sorted once, not inserted one by one
   * });
   * ```
   */
  insertMany(items: TItem[]): void {
    logger.debug('insertMany called', {
      inputCount: items.length,
      queueSize: this.items.length,
      items: items.map((item) => ({
      cardID: item.id,
      blockID: item.blockId,
      dueTime: this.getDueMs(item),
      priority: this.getPriority ? this.getPriority(item) : undefined,
      })),
    });
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.debug('insertMany inserting item', { current: i + 1, total: items.length });
      this.insert(item);
    }
    
    logger.debug('insertMany completed', { queueSize: this.items.length });
  }

  /**
   * Remove an item from the queue
   * 
   * Searches for an item matching the predicate and removes it from the queue.
   * This is useful for removing a card that was updated externally or needs
   * to be re-inserted at a different position.
   * 
   * ## Performance:
   * - **Time complexity**: O(n) - linear search through the queue
   * - **Space complexity**: O(1) - no additional memory needed
   * 
   * ## Common pattern:
   * Remove → Update → Re-insert (SM-15 style)
   * 
   * @param predicate - Function to identify the item to remove
   * @returns `true` if item was found and removed, `false` otherwise
   * 
   * @example Remove by ID
   * ```typescript
   * const removed = sequencer.remove((card) => card.cardID === '123');
   * if (removed) {
   *   console.log('Card removed successfully');
   * }
   * ```
   * 
   * @example Remove and re-insert pattern
   * ```typescript
   * // Find and remove the card
   * const removed = sequencer.remove((c) => c.cardID === card.cardID);
   * 
   * if (removed) {
   *   // Update the card
   *   card.due = Date.now() + 86400000;
   *   card.lapses += 1;
   *   
   *   // Re-insert at correct position
   *   sequencer.insert(card);
   * }
   * ```
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
   * 
   * @example
   * ```typescript
   * console.log(`Queue has ${sequencer.size()} items`);
   * 
   * if (sequencer.size() > 100) {
   *   console.warn('Queue is getting large');
   * }
   * ```
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Check if the queue is empty
   * 
   * @returns `true` if the queue has no items, `false` otherwise
   * 
   * @example
   * ```typescript
   * if (sequencer.isEmpty()) {
   *   console.log('No more cards to review');
   * } else {
   *   const card = await sequencer.next();
   * }
   * ```
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Clear all items from the queue
   * 
   * Removes all items from the queue, resetting it to an empty state.
   * This is useful for resetting the queue or when switching contexts.
   * 
   * @example
   * ```typescript
   * // Clear the queue
   * sequencer.clear();
   * console.log(sequencer.size()); // 0
   * 
   * // Repopulate with new items
   * sequencer.insertMany(newCards);
   * ```
   */
  clear(): void {
    this.items.length = 0;
  }

  /**
   * Called when the data source's data has changed
   * 
   * Implements `IDataSourceObserver` to receive notifications when the underlying
   * data source changes. Unlike PrioritySequencer which has lazy-loading,
   * SortedSequencer simply clears all items and requires manual repopulation.
   * 
   * ## Behavior:
   * - Clears all items from the queue
   * - Does NOT automatically reload data
   * - You must manually repopulate the queue after this is called
   * 
   * ## Difference from PrioritySequencer:
   * - **PrioritySequencer**: Sets `loaded = false`, reloads on next `next()` call
   * - **SortedSequencer**: Clears items, requires manual repopulation
   * 
   * ## Why the difference?
   * SortedSequencer is designed for dynamic queues where items are inserted
   * individually. It doesn't have a `fetchAll()` function to reload from,
   * so it can't automatically repopulate like PrioritySequencer.
   * 
   * ## Usage pattern:
   * ```typescript
   * // Setup observer
   * dataSource.addObserver(sequencer);
   * 
   * // When data changes
   * await dataSource.remove([card]); // Triggers onDataChanged()
   * 
   * // Manually repopulate if needed
   * const newCards = await dataSource.getAll();
   * sequencer.insertMany(newCards);
   * ```
   * 
   * @see IDataSourceObserver
   * @see IObservableDataSource
   * @see ADR-002: Observer Pattern for Cache Invalidation
   * 
   * @example
   * ```typescript
   * const dataSource = new RiffDataSource();
   * const sequencer = new SortedSequencer({
   *   getDueMs: (card) => card.due,
   *   initialItems: await dataSource.getAll()
   * });
   * 
   * // Register as observer
   * dataSource.addObserver(sequencer);
   * 
   * // When data changes, queue is cleared
   * await dataSource.remove([card]); 
   * // → sequencer.onDataChanged() called
   * // → sequencer is now empty
   * 
   * // Repopulate if needed
   * const remaining = await dataSource.getAll();
   * sequencer.insertMany(remaining);
   * ```
   */
  onDataChanged(): void {
    logger.debug('onDataChanged called - clearing cache');
    this.items.length = 0;
  }

  /**
   * Get all items in the queue (for debugging/testing)
   * 
   * Returns a copy of the internal items array. This is useful for:
   * - Debugging: Inspecting the current queue state
   * - Testing: Verifying sort order and queue contents
   * - Monitoring: Checking what items are pending
   * 
   * **Note**: Returns a copy, so modifications won't affect the queue.
   * 
   * @returns A copy of the items array in sorted order
   * 
   * @example Debugging
   * ```typescript
   * const items = sequencer.getAll();
   * console.log('Queue contents:', items.map(c => ({
   *   id: c.cardID,
   *   due: new Date(c.due).toISOString()
   * })));
   * ```
   * 
   * @example Testing sort order
   * ```typescript
   * const items = sequencer.getAll();
   * for (let i = 1; i < items.length; i++) {
   *   expect(items[i].due).toBeGreaterThanOrEqual(items[i-1].due);
   * }
   * ```
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
