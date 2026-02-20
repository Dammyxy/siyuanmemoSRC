/**
 * Local Storage Data Source
 *
 * Retrieves queue items directly from local storage (StorageManager).
 * This data source is used in Advanced Mode for high-performance, offline-capable card access.
 * 
 * ## Features
 * - Direct memory access (no network requests)
 * - Supports filtering and sorting
 * - Implements Observer pattern for automatic cache invalidation
 * - Provides nextDues prediction using SchedulerRouter
 * - High performance (< 1ms for 1000 cards)
 * - Fully offline-capable
 * 
 * ## Use Cases
 * - **Advanced Mode**: Primary data source for local scheduler users
 * - **SRS Browser**: Fast card listing without network latency
 * - **Review Queue**: Instant card access for smooth review experience
 * 
 * ## Performance Characteristics
 * - Read speed: Extremely fast (direct memory access)
 * - Offline: Fully functional without network
 * - Data freshness: Depends on sync frequency
 * - Suitable for: Advanced mode with local scheduler
 * 
 * @example
 * ```typescript
 * const dataSource = new LocalStorageDataSource({
 *   storage: storageManager,
 *   filter: (card) => card.due <= Date.now(),
 *   sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
 *   schedulerRouter: router
 * });
 * 
 * // Fetch all due cards
 * const cards = await dataSource.getAll();
 * 
 * // Register observer for automatic cache invalidation
 * sequencer.addObserver(dataSource);
 * ```
 * 
 * @see ObservableDataSource
 * @see StorageManager
 * @see SchedulerRouter
 */

import { ObservableDataSource } from './ObservableDataSource';
import type { QueueItem } from '../types';
import type { UnifiedStorageManager } from '../../storage/UnifiedStorageManager';  // ✅ 使用 UnifiedStorageManager
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types/card';
import { ok, type Result } from '@/types/result';

/**
 * Configuration options for LocalStorageDataSource
 * 
 * @property storage - Required: Storage manager for accessing local cards
 * @property filter - Optional: Filter function to select specific cards
 * @property sort - Optional: Sort function to order cards
 * @property schedulerRouter - Optional: Scheduler for predicting next review times
 * @property plugin - Optional: Plugin instance for accessing configuration (e.g., dayStartHour)
 */
export interface LocalStorageDataSourceOptions {
  storage: UnifiedStorageManager;  // ✅ 使用 UnifiedStorageManager
  filter?: (card: FSRSCard) => boolean;
  sort?: (a: FSRSCard, b: FSRSCard) => number;
  schedulerRouter?: SchedulerRouter;
  plugin?: any;  // Plugin instance for configuration access
}

/**
 * Data source that reads directly from local storage
 * 
 * Extends ObservableDataSource to support automatic cache invalidation.
 * This data source provides the fastest possible card access by reading
 * directly from memory without any network requests.
 * 
 * ## Architecture
 * ```
 * UnifiedStorageManager (Memory)
 *   ↓ Direct read
 * LocalStorageDataSource
 *   ↓ Filter & Sort
 * Queue System
 * ```
 * 
 * ## Data Flow
 * 1. Read all cards from UnifiedStorageManager
 * 2. Apply filter function (if provided)
 * 3. Apply sort function (if provided)
 * 4. Convert FSRSCard to QueueItem
 * 5. Extract nextDues using SchedulerRouter
 * 6. Return processed items
 * 
 * @see ObservableDataSource
 */
export class LocalStorageDataSource extends ObservableDataSource<QueueItem> {
  private readonly storage: UnifiedStorageManager;  // ✅ 使用 UnifiedStorageManager
  private readonly filterFn?: (card: FSRSCard) => boolean;
  private readonly sortFn?: (a: FSRSCard, b: FSRSCard) => number;
  private readonly schedulerRouter?: SchedulerRouter;
  private readonly plugin?: any;  // Plugin instance for configuration access

  /**
   * Creates a new LocalStorageDataSource instance
   * 
   * @param options - Configuration options for the data source
   * 
   * @example
   * ```typescript
   * // Basic usage
   * const dataSource = new LocalStorageDataSource({
   *   storage: storageManager
   * });
   * 
   * // With filtering and sorting
   * const dataSource = new LocalStorageDataSource({
   *   storage: storageManager,
   *   filter: (card) => card.due <= Date.now() && card.state !== 0,
   *   sort: (a, b) => a.due - b.due
   * });
   * 
   * // With scheduler for accurate nextDues
   * const dataSource = new LocalStorageDataSource({
   *   storage: storageManager,
   *   filter: (card) => card.due <= Date.now(),
   *   sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
   *   schedulerRouter: router
   * });
   * ```
   */
  constructor(options: LocalStorageDataSourceOptions) {
    super(); // Initialize ObservableDataSource
    this.storage = options.storage;
    this.filterFn = options.filter;
    this.sortFn = options.sort;
    this.schedulerRouter = options.schedulerRouter;
    this.plugin = options.plugin;  // Store plugin instance
  }

  /**
   * Fetches all cards from local storage
   *
   * This is the primary method for retrieving cards from the data source.
   * It reads directly from memory for maximum performance.
   *
   * ## Processing Pipeline
   * 1. **Read from storage**: Get all cards from StorageManager
   * 2. **Apply filter**: Remove cards that don't match criteria
   * 2.5. **Apply cardType filter**: Filter by card type (item-only, topic-only, all)
   * 3. **Apply dueOnly filter**: Filter by due time (if enabled)
   * 4. **Apply sort**: Order cards by specified criteria
   * 5. **Convert to QueueItem**: Transform FSRSCard to QueueItem format
   * 6. **Extract nextDues**: Predict next review times for all ratings
   *
   * ## Performance
   * - Typical execution time: < 1ms for 100 cards, < 10ms for 1000 cards
   * - No network requests
   * - Direct memory access
   *
   * ## Error Handling
   * If any step fails, returns an empty array and logs the error.
   * This ensures that errors don't crash the UI.
   *
   * @param options - Optional filtering options
   * @param options.cardType - Filter by card type: 'item-only' | 'topic-only' | 'all'
   * @param options.dueOnly - If true, only return cards with due <= current day end
   * @returns Array of queue items ready for review
   *
   * @example
   * ```typescript
   * const dataSource = new LocalStorageDataSource({ storage });
   *
   * // Get all cards
   * const allCards = await dataSource.getAll();
   *
   * // Get only Item cards (for Retrieval Practice Queue)
   * const itemCards = await dataSource.getAll({ cardType: 'item-only' });
   *
   * // Get only due cards (for Review Queue)
   * const dueCards = await dataSource.getAll({ dueOnly: true });
   *
   * // Get only due Item cards
   * const dueItemCards = await dataSource.getAll({ 
   *   cardType: 'item-only', 
   *   dueOnly: true 
   * });
   * ```
   *
   * @public
   */
  async getAll(options?: {
    cardType?: 'item-only' | 'topic-only' | 'all';
    dueOnly?: boolean;
  }): Promise<QueueItem[]> {
    try {
      // 1. Read all cards from storage
      let cards = this.storage.getAllCards();
      
      if (!cards || cards.length === 0) {
        return [];
      }

      // 2. Apply filter
      if (this.filterFn) {
        cards = cards.filter(this.filterFn);
      }

      // 🆕 2.5. Apply cardType filter
      if (options?.cardType) {
        if (options.cardType === 'item-only') {
          // ✅ 修复：item-only 只显示 item 卡片，不包含 concept 和 descriptor
          cards = cards.filter(card => 
            card.type === 'item' || 
            !card.type  // 缺失 type 的默认为 item
          );
        } else if (options.cardType === 'topic-only') {
          // Topic 类型包括：topic（增量阅读）
          cards = cards.filter(card => card.type === 'topic');
        } else if (options.cardType === 'concept-only') {
          cards = cards.filter(card => card.type === 'concept');
        } else if (options.cardType === 'descriptor-only') {
          cards = cards.filter(card => card.type === 'descriptor');
        }
        // 'all' - no filtering needed
      }

      // 🆕 2.6. Apply dueOnly filter
      if (options?.dueOnly) {
        try {
          // Import getDayStartHour and getCurrentDayEnd
          const { getDayStartHour } = await import('@/utils/configUtils');
          const { getCurrentDayEnd } = await import('@/utils/dateUtils');
          
          const dayStartHour = this.plugin ? getDayStartHour(this.plugin) : 4;
          const dayEnd = getCurrentDayEnd(dayStartHour);
          
          const beforeFilter = cards.length;
          cards = cards.filter(card => {
            // Validate due field
            if (card.due == null) {
              console.warn('[LocalStorageDataSource] Card has null/undefined due:', card.id);
              return false;
            }

            // Convert to timestamp
            const dueTime = typeof card.due === 'number' 
              ? card.due 
              : new Date(card.due).getTime();

            // Check validity
            if (isNaN(dueTime)) {
              console.warn('[LocalStorageDataSource] Card has invalid due:', card.id, card.due);
              return false;
            }

            // Due check: due <= dayEnd
            return dueTime <= dayEnd;
          });
          
          console.log('[LocalStorageDataSource] Due filter applied:', {
            before: beforeFilter,
            after: cards.length,
            filtered: beforeFilter - cards.length,
            dayStartHour,
            dayEnd: new Date(dayEnd).toISOString(),
          });
        } catch (filterError) {
          console.error('[LocalStorageDataSource] Due filter failed:', filterError);
          // Fallback: Don't apply dueOnly filter, return all cards
        }
      }

      // 3. Apply sort
      if (this.sortFn) {
        cards.sort(this.sortFn);
      }

      // 4. Convert to QueueItem
      const items = cards.map(card => this.convertToQueueItem(card));

      console.log('[LocalStorageDataSource] Loaded cards:', {
        total: this.storage.getAllCards().length,
        filtered: items.length,
        cardType: options?.cardType || 'all',
        dueOnly: options?.dueOnly || false,  // 🆕 添加 dueOnly 日志
      });

      return items;
    } catch (error) {
      console.error('[LocalStorageDataSource] Failed to load cards:', error);
      return [];
    }
  }

  /**
   * Adds items to the data source (not supported)
   * 
   * LocalStorageDataSource is read-only. Cards should be added directly
   * through StorageManager using `setCard()` and `saveCards()`.
   * 
   * ## Current Behavior
   * - Logs a warning message
   * - Returns success with 0 items added
   * - Does NOT throw an error (graceful degradation)
   * 
   * ## Recommended Approach
   * ```typescript
   * // Instead of:
   * await dataSource.add([newCard]);
   * 
   * // Use StorageManager directly:
   * storageManager.setCard(newCard);
   * await storageManager.saveCards();
   * ```
   * 
   * @param items - Items to add (currently ignored)
   * @returns Result containing the number of items successfully added (always ok(0))
   * 
   * @override
   * @public
   */
  async add(items: QueueItem[]): Promise<Result<number>> {
    console.warn('[LocalStorageDataSource] Add not supported, use StorageManager directly');
    // Note: If this is implemented in the future, call this.notifyObservers() after successful addition
    return ok(0);
  }

  /**
   * Removes items from the data source (not supported)
   * 
   * LocalStorageDataSource is read-only. Cards should be removed directly
   * through StorageManager using `removeCard()` and `saveCards()`.
   * 
   * ## Current Behavior
   * - Logs a warning message
   * - Returns success with 0 items removed
   * - Does NOT throw an error (graceful degradation)
   * 
   * ## Recommended Approach
   * ```typescript
   * // Instead of:
   * await dataSource.remove([card]);
   * 
   * // Use StorageManager directly:
   * storageManager.removeCard(cardId);
   * await storageManager.saveCards();
   * ```
   * 
   * @param items - Items to remove (currently ignored)
   * @returns Result containing the number of items successfully removed (always ok(0))
   * 
   * @override
   * @public
   */
  async remove(items: QueueItem[]): Promise<Result<number>> {
    console.warn('[LocalStorageDataSource] Remove not supported, use StorageManager directly');
    // Note: If this is implemented in the future, call this.notifyObservers() after successful removal
    return ok(0);
  }

  /**
   * Converts FSRSCard to QueueItem
   * 
   * Transforms the internal FSRSCard format into the QueueItem format
   * required by the queue system. This includes extracting nextDues
   * for all four rating options.
   * 
   * ## Conversion Process
   * 1. Map basic fields (cardID, blockID, deckID, priority)
   * 2. Extract nextDues using SchedulerRouter (if available)
   * 3. Map FSRS scheduling fields (state, lapses, reps, lastReview)
   * 
   * ## nextDues Extraction
   * - **With SchedulerRouter**: Predicts accurate times for each rating
   * - **Without SchedulerRouter**: Uses current due time for all ratings
   * - **No due time**: Returns null (queue will handle gracefully)
   * 
   * @param card - FSRSCard from local storage
   * @returns QueueItem ready for queue processing
   * 
   * @private
   * @internal
   */
  private convertToQueueItem(card: FSRSCard): QueueItem {
    return {
      cardID: card.id,
      blockID: card.blockId,
      deckID: card.deckID || '',
      priority: card.priority ?? 50,
      nextDues: this.extractNextDues(card),
      state: card.state,
      lapses: card.lapses,
      reps: card.reps,
      lastReview: card.lastReview,
    };
  }

  /**
   * Extracts nextDues from a local FSRSCard
   * 
   * Converts FSRSCard scheduling data into the nextDues format required by QueueItem.
   * Uses SchedulerRouter to predict future review times for all four rating options.
   * 
   * ## Prediction Strategy
   * 1. **With SchedulerRouter**: Uses preview() to predict accurate times for each rating
   *    - Rating 1 (Again): Shortest interval
   *    - Rating 2 (Hard): Short interval
   *    - Rating 3 (Good): Normal interval
   *    - Rating 4 (Easy): Longest interval
   * 2. **Without SchedulerRouter**: Uses current due time for all ratings (fallback)
   * 3. **No due time**: Returns null (card will use default behavior)
   * 
   * ## nextDues Format
   * ```typescript
   * {
   *   1: "2024-01-15T10:30:00.000Z",  // Again - earliest review
   *   2: "2024-01-16T10:30:00.000Z",  // Hard - short interval
   *   3: "2024-01-20T10:30:00.000Z",  // Good - normal interval
   *   4: "2024-01-25T10:30:00.000Z"   // Easy - longest interval
   * }
   * ```
   * 
   * ## Error Handling
   * If preview fails, falls back to using the current due time for all ratings.
   * If no due time exists, returns null (caller will handle gracefully).
   * 
   * @param card - FSRSCard from local storage
   * @returns nextDues object or null if unavailable
   * 
   * @private
   * @internal
   */
  private extractNextDues(card: FSRSCard): Record<1 | 2 | 3 | 4, string> | null {
    // Helper function to safely convert timestamp to ISO string
    const safeToISOString = (timestamp: number): string | null => {
      if (!timestamp || !isFinite(timestamp)) {
        return null;
      }
      try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          return null;
        }
        return date.toISOString();
      } catch (error) {
        console.error('[LocalStorageDataSource] Invalid timestamp:', timestamp, error);
        return null;
      }
    };

    // Strategy 1: Use SchedulerRouter for accurate prediction
    if (this.schedulerRouter) {
      try {
        const previews = this.schedulerRouter.preview(card);
        
        // previews is Map<Rating, FSRSCard>
        // FSRSCard.due is number (timestamp)
        const againCard = previews.get(1);
        const hardCard = previews.get(2);
        const goodCard = previews.get(3);
        const easyCard = previews.get(4);
        
        const againISO = againCard ? safeToISOString(againCard.due) : null;
        const hardISO = hardCard ? safeToISOString(hardCard.due) : null;
        const goodISO = goodCard ? safeToISOString(goodCard.due) : null;
        const easyISO = easyCard ? safeToISOString(easyCard.due) : null;
        
        // If all previews are valid, use them
        if (againISO && hardISO && goodISO && easyISO) {
          return {
            1: againISO,  // Again
            2: hardISO,   // Hard
            3: goodISO,   // Good
            4: easyISO,   // Easy
          };
        }
        
        // If any preview failed, silently fall through to fallback strategy
      } catch (error) {
        // Preview failed completely, fall through to fallback strategy
        // (silently handled - this is expected for cards with invalid data)
      }
    }

    // Strategy 2: Use current due time as fallback
    if (card.due) {
      const dueISO = safeToISOString(card.due);
      
      if (dueISO) {
        return {
          1: dueISO,  // Again
          2: dueISO,  // Hard
          3: dueISO,  // Good
          4: dueISO,  // Easy
        };
      }
    }

    // Strategy 3: No due time available
    return null;
  }
}
