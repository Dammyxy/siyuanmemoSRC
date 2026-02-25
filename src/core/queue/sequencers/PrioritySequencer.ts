import type { ISequencer, IDataSourceObserver } from '../abstraction/types';
import type { QueueItem } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PrioritySequencer');

/**
 * PrioritySequencer - Lazy-loading sequencer with priority-based sorting
 * 
 * This sequencer loads all items once, sorts them by due time and priority,
 * then serves them one by one. It implements a caching mechanism with automatic
 * invalidation through the Observer pattern.
 * 
 * ## Caching Mechanism
 * 
 * The sequencer uses a lazy-loading cache:
 * - Items are loaded only when first accessed via `next()`
 * - Once loaded, items are cached in memory and sorted
 * - The cache is automatically invalidated when the data source changes
 * - After invalidation, items are reloaded on the next `next()` call
 * 
 * ## Observer Pattern
 * 
 * Implements `IDataSourceObserver` to receive notifications when the underlying
 * data source changes. When `onDataChanged()` is called:
 * 1. The `loaded` flag is set to `false`
 * 2. The cached items array is cleared
 * 3. On the next `next()` call, items are reloaded via `fetchAll()`
 * 
 * This eliminates the need for manual `reset()` calls and ensures the sequencer
 * always serves current data.
 * 
 * ## Sorting Strategy
 * 
 * Items are sorted by:
 * 1. **Due date** (primary key) - grouped by day
 * 2. **Priority** (secondary key) - within the same day
 * 3. **Due time** (tertiary key) - for items with same priority
 * 
 * ## Usage Modes
 * 
 * The sequencer supports two modes:
 * 
 * ### Mode 1: Simple delegation (no caching)
 * ```typescript
 * const sequencer = new PrioritySequencer(async () => {
 *   return await dataSource.next();
 * });
 * ```
 * 
 * ### Mode 2: Batch loading with caching (recommended)
 * ```typescript
 * const sequencer = new PrioritySequencer({
 *   fetchAll: async () => await dataSource.getAll(),
 *   getDueMs: (item) => item.due,
 *   getPriority: (item) => item.priority || 0
 * });
 * 
 * // Register as observer for automatic cache invalidation
 * dataSource.addObserver(sequencer);
 * ```
 * 
 * @template TItem - The type of items in the queue
 * 
 * @see ISequencer
 * @see IDataSourceObserver
 * @see ADR-002: Observer Pattern for Cache Invalidation
 * 
 * @example
 * ```typescript
 * // Create a priority sequencer for review cards
 * const sequencer = new PrioritySequencer<ReviewCard>({
 *   fetchAll: () => dataSource.getAll(),
 *   getDueMs: (card) => card.due,
 *   getPriority: (card) => {
 *     // Higher priority for cards with more lapses
 *     return card.lapses * 10;
 *   }
 * });
 * 
 * // Register for automatic cache invalidation
 * dataSource.addObserver(sequencer);
 * 
 * // Get next card (loads and sorts on first call)
 * const card = await sequencer.next();
 * 
 * // When data changes, cache is automatically invalidated
 * await dataSource.remove([card]); // sequencer.onDataChanged() is called
 * 
 * // Next call will reload data
 * const nextCard = await sequencer.next();
 * ```
 */
export class PrioritySequencer<TItem extends QueueItem> implements ISequencer<TItem>, IDataSourceObserver {
  private readonly fetchNext: (() => Promise<TItem | null>) | null = null;
  private readonly fetchAll: (() => Promise<TItem[]>) | null = null;
  private readonly getDueMs: ((item: TItem) => number) | null = null;
  private readonly getPriority: ((item: TItem) => number) | null = null;
  private readonly items: TItem[] = [];
  private loaded = false;

  /**
   * Creates a new PrioritySequencer
   * 
   * @param fetchNextOrOptions - Either:
   *   - A function that returns the next item (simple delegation mode)
   *   - An options object with fetchAll, getDueMs, and getPriority (caching mode)
   * 
   * @example Simple delegation mode
   * ```typescript
   * const sequencer = new PrioritySequencer(async () => {
   *   return await dataSource.next();
   * });
   * ```
   * 
   * @example Caching mode with priority
   * ```typescript
   * const sequencer = new PrioritySequencer({
   *   fetchAll: async () => await dataSource.getAll(),
   *   getDueMs: (item) => item.due,
   *   getPriority: (item) => item.lapses * 10
   * });
   * ```
   */
  constructor(
    fetchNextOrOptions:
      | (() => Promise<TItem | null>)
      | {
          fetchAll: () => Promise<TItem[]>;
          getDueMs: (item: TItem) => number;
          getPriority: (item: TItem) => number;
        },
  ) {
    if (typeof fetchNextOrOptions === 'function') {
      this.fetchNext = fetchNextOrOptions;
      return;
    }
    this.fetchAll = fetchNextOrOptions.fetchAll;
    this.getDueMs = fetchNextOrOptions.getDueMs;
    this.getPriority = fetchNextOrOptions.getPriority;
  }

  /**
   * Reset the sequencer state
   * 
   * This forces the sequencer to reload items on the next call to `next()`.
   * 
   * **Note**: With the Observer pattern, manual reset is usually not needed.
   * The sequencer automatically invalidates its cache when the data source
   * changes via `onDataChanged()`. This method is kept for backward compatibility
   * and manual cache invalidation scenarios.
   * 
   * ## What it does:
   * - Sets `loaded = false` to trigger reload on next access
   * - Clears the items cache to free memory
   * 
   * ## When to use:
   * - When you need to force a reload without data source changes
   * - For testing purposes
   * - Legacy code that hasn't migrated to the Observer pattern
   * 
   * ## When NOT to use:
   * - After data source modifications (use Observer pattern instead)
   * - In normal queue operations (automatic invalidation handles this)
   * 
   * @see onDataChanged - Preferred method for cache invalidation
   * 
   * @example
   * ```typescript
   * // Manual reset (not recommended if using Observer pattern)
   * sequencer.reset();
   * const card = await sequencer.next(); // Will reload data
   * 
   * // Preferred: Let Observer pattern handle it
   * await dataSource.remove([card]); // Automatically calls onDataChanged()
   * const nextCard = await sequencer.next(); // Automatically reloads
   * ```
   */
  reset(): void {
    this.loaded = false;
    this.items.length = 0;
  }

  /**
   * Called when the data source's data has changed
   * 
   * Implements `IDataSourceObserver` to automatically invalidate cache
   * when the underlying data source changes. This is the **preferred method**
   * for cache invalidation in the Observer pattern.
   * 
   * ## How it works:
   * 1. Data source modifies its data (add/remove/update)
   * 2. Data source calls `notifyObservers()`
   * 3. This method is called on all registered observers
   * 4. Cache is invalidated (`loaded = false`, items cleared)
   * 5. Next `next()` call will reload data via `fetchAll()`
   * 
   * ## Benefits over manual reset:
   * - **Automatic**: No need to remember to call `reset()`
   * - **Reliable**: Can't forget to invalidate cache
   * - **Decoupled**: Data source doesn't need to know about sequencer internals
   * - **Multiple observers**: One data source can notify many sequencers
   * 
   * ## Implementation details:
   * - Sets `loaded = false` to trigger reload on next access
   * - Clears the items cache to free memory
   * - Logs the invalidation for debugging
   * 
   * @see IDataSourceObserver
   * @see IObservableDataSource
   * @see ADR-002: Observer Pattern for Cache Invalidation
   * 
   * @example
   * ```typescript
   * // Setup: Register sequencer as observer
   * const dataSource = new RiffDataSource();
   * const sequencer = new PrioritySequencer({
   *   fetchAll: () => dataSource.getAll(),
   *   getDueMs: (item) => item.due,
   *   getPriority: (item) => item.priority
   * });
   * dataSource.addObserver(sequencer);
   * 
   * // When data changes, onDataChanged() is automatically called
   * await dataSource.remove([card]); 
   * // → dataSource.notifyObservers()
   * // → sequencer.onDataChanged()
   * // → Cache invalidated
   * 
   * // Next access will reload data
   * const nextCard = await sequencer.next(); // Reloads from data source
   * ```
   */
  onDataChanged(): void {
    logger.debug('onDataChanged called - invalidating cache');
    this.loaded = false;
    this.items.length = 0;
  }

  /**
   * Get the next item from the sequencer
   * 
   * This is the main method for retrieving items. It implements lazy loading
   * with caching:
   * 
   * ## Behavior:
   * 
   * ### Simple delegation mode:
   * - Directly calls the `fetchNext` function
   * - No caching or sorting
   * 
   * ### Caching mode (recommended):
   * 1. **First call**: Loads all items via `fetchAll()`, sorts them, caches them
   * 2. **Subsequent calls**: Returns items from cache (shift from front)
   * 3. **After cache invalidation**: Reloads and re-sorts items
   * 
   * ## Sorting algorithm:
   * 
   * Items are sorted by:
   * 1. **Day key** (primary) - Groups items by due date (YYYY-MM-DD)
   * 2. **Priority** (secondary) - Within same day, higher priority first
   * 3. **Due time** (tertiary) - For items with same priority
   * 
   * This ensures:
   * - Items due today are served before items due tomorrow
   * - Within the same day, high-priority items come first
   * - Items with same priority are served in due time order
   * 
   * ## Cache invalidation:
   * 
   * The cache is automatically invalidated when:
   * - `onDataChanged()` is called (Observer pattern)
   * - `reset()` is called manually
   * 
   * After invalidation, the next `next()` call will reload data.
   * 
   * ## Performance:
   * 
   * - **First call**: O(n log n) - loads and sorts all items
   * - **Subsequent calls**: O(1) - just shifts from array
   * - **Memory**: O(n) - stores all items in memory
   * 
   * ## Edge cases:
   * 
   * - Returns `null` if no items are available
   * - Returns `null` if `fetchAll()` returns empty array
   * - Returns `null` if all items have been consumed
   * 
   * @returns The next item in priority order, or `null` if no items available
   * 
   * @example Basic usage
   * ```typescript
   * const sequencer = new PrioritySequencer({
   *   fetchAll: () => dataSource.getAll(),
   *   getDueMs: (item) => item.due,
   *   getPriority: (item) => item.lapses * 10
   * });
   * 
   * // First call: loads and sorts all items
   * const card1 = await sequencer.next(); // O(n log n)
   * 
   * // Subsequent calls: returns from cache
   * const card2 = await sequencer.next(); // O(1)
   * const card3 = await sequencer.next(); // O(1)
   * 
   * // When all items consumed
   * const card4 = await sequencer.next(); // null
   * ```
   * 
   * @example With automatic cache invalidation
   * ```typescript
   * dataSource.addObserver(sequencer);
   * 
   * const card1 = await sequencer.next(); // Loads data
   * const card2 = await sequencer.next(); // From cache
   * 
   * // Data changes, cache invalidated automatically
   * await dataSource.remove([card1]);
   * 
   * // Next call reloads data
   * const card3 = await sequencer.next(); // Reloads and re-sorts
   * ```
   */
  async next(): Promise<TItem | null> {
    logger.debug('next called', { loaded: this.loaded, itemCount: this.items.length });
    
    if (this.fetchNext) {
      return await this.fetchNext();
    }
    if (!this.fetchAll || !this.getDueMs || !this.getPriority) return null;
    if (!this.loaded) {
      this.loaded = true;
      logger.debug('loading items via fetchAll');
      const fetched = await this.fetchAll();
      logger.debug('fetchAll returned', {
        count: fetched?.length || 0,
        items: fetched?.slice(0, 3).map((it: any) => ({
          cardID: it?.cardID,
          nextDues: it?.nextDues,
        })),
      });
      if (!fetched || fetched.length === 0) {
        logger.debug('no items fetched; queue remains empty');
      } else {
        this.items.push(...fetched);
        this.items.sort((a, b) => {
          const da = this.getDueMs(a);
          const db = this.getDueMs(b);
          const dayA = dayKey(da);
          const dayB = dayKey(db);
          if (dayA !== dayB) return da - db;
          const pa = this.getPriority(a);
          const pb = this.getPriority(b);
          if (pa !== pb) return pa - pb;
          return da - db;
        });
        logger.debug('items sorted', { count: this.items.length });
      }
    }
    if (this.items.length === 0) {
      logger.debug('no items available, returning null');
      return null;
    }
    const nextItem = this.items.shift() || null;
    logger.debug('returning item', {
      cardID: (nextItem as any)?.cardID,
      remainingCount: this.items.length,
    });
    return nextItem;
  }
}

/**
 * Convert a timestamp to a day key (YYYY-MM-DD format)
 * 
 * This helper function is used for grouping items by day in the sorting algorithm.
 * Items with the same day key are considered to be due on the same day, regardless
 * of the specific time.
 * 
 * @param ms - Timestamp in milliseconds since epoch
 * @returns Day key in ISO format (YYYY-MM-DD), or empty string if invalid
 * 
 * @example
 * ```typescript
 * dayKey(1704067200000); // "2024-01-01"
 * dayKey(1704153600000); // "2024-01-02"
 * dayKey(NaN);           // ""
 * dayKey(Infinity);      // ""
 * ```
 * 
 * @private
 */
function dayKey(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
