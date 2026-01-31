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
 */

import type { IQueueStrategy, QueueFeedback, QueueStats, QueueUIConfig } from '../types';
import type { IScheduler, ISequencer, IQueueTrait } from '../abstraction/types';
import type { IDataSource } from '../datasource/IDataSource';

export type CompositeQueueConfig<TItem> = {
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
 */
export class BaseCompositeQueue<TItem = any> implements IQueueStrategy<TItem> {
  protected readonly scheduler?: IScheduler<TItem, number>;
  protected readonly sequencer: ISequencer<TItem>;
  protected readonly dataSource: IDataSource<TItem>;
  protected readonly traits: Map<string, IQueueTrait>;
  protected readonly uiConfig: QueueUIConfig;
  protected readonly statsLabel: string;

  // Track current item for feedback
  protected currentItem: TItem | null = null;

  constructor(config: CompositeQueueConfig<TItem>) {
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
          await this.dataSource.remove([item]);
        }
      } else {
        // Rating 1-2: Rotate to end of queue
        await this.rotateToEnd(item);
      }

      this.currentItem = null;
    } else if (feedback.action === 'skip') {
      // Skip: remove from data source without scheduling
      if (this.dataSource.remove) {
        await this.dataSource.remove([item]);
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
   * This method removes the item from the queue and re-adds it at the end.
   * Used for items that need to be reviewed again (e.g., rating < 3).
   * 
   * Note: This method relies on the DataSource's internal implementation
   * to persist changes. The DataSource should automatically save the
   * modified queue state after getAll() returns.
   * 
   * @param item - The item to rotate to the end
   * @protected
   */
  protected async rotateToEnd(item: TItem): Promise<void> {
    console.log('[BaseCompositeQueue] Rotating item to end of queue');
    
    // Remove the item from the queue
    if (this.dataSource.remove) {
      const removed = await this.dataSource.remove([item]);
      console.log(`[BaseCompositeQueue] Removed ${removed} item(s) from queue`);
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
