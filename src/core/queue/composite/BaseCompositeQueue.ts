/**
 * Base Composite Queue
 *
 * Core abstraction for all queue types.
 * Combines pluggable components: Scheduler, Sequencer, DataSource, and Traits.
 *
 * Architecture:
 * - Scheduler: Algorithm logic (FSRS, SM2, A-Factor, etc.)
 * - Sequencer: Ordering logic (Priority, Graph, List, etc.)
 * - DataSource: Storage backend (Riff API, Local Storage, etc.)
 * - Traits: Optional capabilities (Mutable, Removable, Prioritizable, etc.)
 * 
 * @deprecated Old architecture base class. Use src/queues/ implementations with IReviewQueue interface instead.
 * This class is part of the legacy queue architecture and will be removed in a future version.
 * New code should use the unified queue architecture in src/queues/.
 */

import type { QueueStats, QueueUIConfig, QueueItem } from '../types';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy';
import type { IScheduler, ISequencer, IQueueTrait } from '../abstraction/types';
import type { IDataSource } from '../datasource/IDataSource';
import { warnDeprecatedQueueUsage } from '../deprecation';

export type CompositeQueueConfig<TItem extends QueueItem> = {
  /**
   * Scheduler for algorithm logic (FSRS, SM2, A-Factor, etc.)
   * Optional - queues without scheduling (e.g., neural roam) can omit
   */
  scheduler?: IScheduler<TItem, number>;

  /**
   * Sequencer for ordering cards
   * Required - determines the next item to present
   */
  sequencer: ISequencer<TItem>;

  /**
   * Data source for item storage
   * Required - provides access to queue items
   */
  dataSource: IDataSource<TItem>;

  /**
   * Optional traits for additional capabilities
   * Examples: mutable, removable, prioritizable, auto-sortable
   */
  traits?: IQueueTrait[];

  /**
   * UI configuration
   * Optional - defaults will be provided
   */
  uiConfig?: QueueUIConfig;

  /**
   * Statistics label
   * Optional - used for display
   */
  statsLabel?: string;
};

/**
 * Base class for all queue types
 *
 * Provides standard implementation of IQueueStrategy by combining:
 * - Scheduler: Handles rating/feedback logic
 * - Sequencer: Determines next item order
 * - DataSource: Manages item storage
 * - Traits: Adds optional capabilities
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type managed by this queue (must extend QueueItem, defaults to QueueItem)
 * 
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 */
/**
 * @deprecated Old architecture base class. Use BaseReviewQueue in src/queues/ instead.
 */
export class BaseCompositeQueue<TItem extends QueueItem = QueueItem> implements IQueueStrategy<TItem> {
  protected readonly scheduler?: IScheduler<TItem, number>;
  protected readonly sequencer: ISequencer<TItem>;
  protected readonly dataSource: IDataSource<TItem>;
  protected readonly traits: Map<string, IQueueTrait>;
  protected readonly uiConfig: QueueUIConfig;
  protected readonly statsLabel: string;

  // Track current item for feedback
  protected currentItem: TItem | null = null;

  constructor(config: CompositeQueueConfig<TItem>) {
    warnDeprecatedQueueUsage(this.constructor.name);
    this.scheduler = config.scheduler;
    this.sequencer = config.sequencer;
    this.dataSource = config.dataSource;
    this.uiConfig = config.uiConfig || {
      statsType: 'queue-size',
      showRatingButtons: !!config.scheduler, // Only show rating buttons if scheduler exists
      allowSkip: true,
    };
    this.statsLabel = config.statsLabel || 'Queue';

    // Register traits
    this.traits = new Map();
    if (config.traits) {
      for (const trait of config.traits) {
        this.traits.set(trait.id, trait);
      }
    }
  }

  /**
   * Get UI configuration for this queue
   */
  getUIConfig(_currentItem: TItem | null): QueueUIConfig {
    return this.uiConfig;
  }

  /**
   * Get the next item from the queue
   *
   * Delegates to the sequencer to determine the next item.
   */
  async next(): Promise<TItem | null> {
    const item = await this.sequencer.next();
    this.currentItem = item;
    return item;
  }

  /**
   * Handle user feedback (rating, skip, etc.)
   *
   * Delegates to scheduler for rating logic.
   * Removes item from data source if needed.
   */
  async onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void> {
    const item = currentItem || this.currentItem;
    if (!item) return;

    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating || !this.scheduler) {
        return;
      }

      // Apply scheduling algorithm with error handling
      try {
        await this.scheduler.schedule(item, rating);
      } catch (error) {
        console.error('[BaseCompositeQueue] Scheduler failed:', error);
        // Continue with queue operations even if scheduler fails
      }

      // Handle based on rating value
      if (rating >= 3) {
        // Rating 3-4: Remove from queue
        if (this.dataSource.remove) {
          const removeResult = await this.dataSource.remove([item]);
          if (!removeResult.ok) {
            console.error('[BaseCompositeQueue] Failed to remove item:', removeResult.error);
            // Continue anyway - item is already scheduled
          }
        }
        
        // Note: No manual reset() needed - the DataSource automatically notifies
        // observers (Sequencers) via the Observer pattern, which invalidates their caches.
        // See ADR-002: Observer Pattern for Cache Invalidation
      } else {
        // Rating 1-2: Rotate to end of queue
        await this.rotateToEnd(item);
      }

      this.currentItem = null;
    } else if (feedback.action === 'skip') {
      // Skip: remove from data source without scheduling
      if (this.dataSource.remove) {
        const removeResult = await this.dataSource.remove([item]);
        if (!removeResult.ok) {
          console.error('[BaseCompositeQueue] Failed to remove skipped item:', removeResult.error);
          // Continue anyway - user has skipped the item
        }
      }

      this.currentItem = null;
    }
  }

  /**
   * Get queue statistics
   *
   * Returns size and label information.
   */
  async getStats(): Promise<QueueStats> {
    const size = await this.getSize();

    return {
      size,
      label: this.statsLabel,
    };
  }

  /**
   * Reorder the queue (optional)
   *
   * Delegates to the sequencer if it supports reordering.
   */
  async reorder?(orderedItems: TItem[]): Promise<boolean> {
    if (this.sequencer.reorder) {
      this.sequencer.reorder(orderedItems);
      return true;
    }
    return false;
  }

  /**
   * Get a trait by ID
   *
   * Allows access to optional capabilities.
   */
  getTrait<T extends IQueueTrait>(id: string): T | undefined {
    return this.traits.get(id) as T;
  }

  /**
   * Check if a trait is available
   */
  hasTrait(id: string): boolean {
    return this.traits.has(id);
  }

  /**
   * Get all cards from the queue
   * 
   * **Purpose:**
   * Retrieves all items currently in the queue, regardless of their state or position.
   * This is useful for operations that need to inspect or manipulate the entire queue,
   * such as card browsers, bulk operations, or queue analysis.
   * 
   * **Default Implementation:**
   * The base implementation simply delegates to `dataSource.getAll()`, which returns
   * all items from the underlying data source. This works for most queue types.
   * 
   * **Subclass Override:**
   * Subclasses can override this method if they need custom behavior, such as:
   * - Merging items from multiple sources (e.g., Riff + local storage)
   * - Filtering items based on queue-specific criteria
   * - Transforming items before returning
   * 
   * **Usage Example:**
   * ```typescript
   * // Get all cards for display in a card browser
   * const allCards = await queue.getAllCards();
   * console.log(`Queue contains ${allCards.length} cards`);
   * ```
   * 
   * **Performance Note:**
   * This method may be expensive for large queues as it loads all items into memory.
   * Consider using pagination or streaming for very large datasets.
   * 
   * @returns A promise that resolves to an array of all queue items
   * @public
   * 
   * @see {@link IDataSource.getAll} - The underlying data source method
   * @see Requirement 14.1 - Extract common implementations to base class
   * @see Requirement 14.2 - Use Promise.all() for concurrent operations
   */
  async getAllCards(): Promise<TItem[]> {
    // Default implementation: delegate to data source
    return await this.dataSource.getAll();
  }

  /**
   * Helper: Get the size of the queue
   */
  protected async getSize(): Promise<number> {
    if (this.dataSource.size) {
      const size = this.dataSource.size;
      // ✅ 保持 this 上下文
      return typeof size === 'function' ? await size.call(this.dataSource) : size;
    }

    // Fallback: get all items and count
    const items = await this.dataSource.getAll();
    return items.length;
  }

  /**
   * Rotate an item to the end of the queue
   * 
   * **Purpose:**
   * This method handles cards that received low ratings (1-2) by moving them to the end
   * of the queue for later review. This implements spaced repetition principles where
   * difficult cards are reviewed again in the same session but after other cards.
   * 
   * **How it works:**
   * 1. Removes the item from the queue using `dataSource.remove()`
   * 2. Retrieves all remaining items via `dataSource.getAll()`
   * 3. Appends the item to the end of the returned array
   * 4. The DataSource persists changes automatically (implementation-dependent)
   * 
   * **Important Design Notes:**
   * - This method does NOT manually call `sequencer.reset()` or invalidate caches
   * - Cache invalidation happens automatically via the Observer Pattern (see ADR-002)
   * - When `dataSource.remove()` is called, it notifies all registered observers
   * - The Sequencer (as an observer) automatically invalidates its cache on notification
   * - On the next `next()` call, the Sequencer reloads data with the rotated item at the end
   * 
   * **DataSource Contract:**
   * This method relies on the DataSource's behavior:
   * - `getAll()` must return a reference to the internal array (not a copy)
   * - Modifications to the returned array must be persisted by the DataSource
   * - `remove()` must trigger observer notifications for cache invalidation
   * 
   * **Usage Example:**
   * ```typescript
   * // In onFeedback() when user rates a card 1 or 2
   * if (rating < 3) {
   *   await this.rotateToEnd(currentItem);
   *   // Card will appear again later in the session
   * }
   * ```
   * 
   * **Edge Cases:**
   * - If DataSource doesn't support `remove()`, logs a warning and returns early
   * - If the queue is empty after removal, the item becomes the only item
   * - Thread-safe: Observer pattern ensures cache consistency across concurrent operations
   * 
   * @param item - The queue item to rotate to the end (typically a card with rating 1-2)
   * @returns A promise that resolves when the rotation is complete
   * @protected
   * 
   * @see {@link onFeedback} - Calls this method for ratings 1-2
   * @see ADR-002 - Observer Pattern for Cache Invalidation
   * @see {@link IDataSource.remove} - Triggers observer notifications
   * @see {@link IDataSourceObserver.onDataChanged} - Sequencer cache invalidation
   */
  protected async rotateToEnd(item: TItem): Promise<void> {
    console.log('[BaseCompositeQueue] Rotating item to end of queue');
    
    // Remove the item from the queue
    if (this.dataSource.remove) {
      const removeResult = await this.dataSource.remove([item]);
      if (removeResult.ok) {
        console.log(`[BaseCompositeQueue] Removed ${removeResult.value} item(s) from queue`);
      } else {
        console.error('[BaseCompositeQueue] Failed to remove item for rotation:', removeResult.error);
        // Continue anyway - we'll try to add it back
      }
    } else {
      console.warn('[BaseCompositeQueue] DataSource does not support remove operation');
      return;
    }

    // Get all items (this returns a reference to the internal array)
    const allItems = await this.dataSource.getAll();
    console.log(`[BaseCompositeQueue] Current queue size: ${allItems.length}`);

    // Add the item to the end
    allItems.push(item);
    console.log(`[BaseCompositeQueue] Item rotated to end, new queue size: ${allItems.length}`);
  }
}
