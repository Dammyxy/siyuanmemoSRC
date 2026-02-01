/**
 * Data Source Interface for Queue Strategies
 *
 * Provides abstraction over where queue items are stored and retrieved.
 * Allows different storage backends (Riff API, Local Storage, Graph traversal, etc.)
 */

import type { IDataSourceObserver } from '../abstraction/types';
import type { QueueItem } from '../types';
import type { Result } from '@/types/result';

/**
 * Data Source for Queue Items
 *
 * Provides read/write access to a collection of queue items.
 * All queue operations go through this abstraction.
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type managed by this data source (must extend QueueItem)
 * 
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 */
export interface IDataSource<TItem extends QueueItem> {
  /**
   * Get all items from the data source
   *
   * @returns All items in the data source
   */
  getAll(): Promise<TItem[]>;

  /**
   * Add items to the data source (optional)
   *
   * @param items Items to add
   * @returns Result containing the number of items successfully added, or an error
   */
  add?(items: TItem[]): Promise<Result<number>>;

  /**
   * Remove items from the data source (optional)
   *
   * @param items Items to remove
   * @returns Result containing the number of items successfully removed, or an error
   */
  remove?(items: TItem[]): Promise<Result<number>>;

  /**
   * Get the size of the data source (optional)
   *
   * @returns Number of items in the data source
   */
  size?(): Promise<number> | number;

  /**
   * Check if the data source is empty (optional)
   *
   * @returns true if no items in the data source
   */
  isEmpty?(): Promise<boolean> | boolean;
}

/**
 * Options for creating data sources
 * 
 * @template TItem - The item type (must extend QueueItem)
 */
export type DataSourceOptions<TItem extends QueueItem> = {
  /**
   * Filter function for items (optional)
   */
  filter?: (item: TItem) => boolean;

  /**
   * Transform function for items (optional)
   */
  transform?: (item: TItem) => TItem | Promise<TItem>;

  /**
   * Maximum number of items to return (optional)
   */
  limit?: number;
};

/**
 * Hybrid data source combining multiple sources
 * 
 * @template TItem - The item type (must extend QueueItem)
 */
export interface IHybridDataSource<TItem extends QueueItem> extends IDataSource<TItem> {
  /**
   * Get items from a specific source
   *
   * @param sourceId Source identifier (e.g., 'riff', 'local', 'storage')
   * @returns Items from the specified source
   */
  getFromSource(sourceId: string): Promise<TItem[]>;

  /**
   * Get all source identifiers
   *
   * @returns Array of source IDs
   */
  getSourceIds(): string[];
}

/**
 * Observable Data Source Interface
 * 
 * Extends IDataSource with observer pattern support for automatic cache invalidation.
 * When data changes (via add/remove operations), all registered observers are notified.
 * 
 * This eliminates the need for manual reset() calls in sequencers and queues.
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type (must extend QueueItem)
 * 
 * @see ADR-002: Observer Pattern for Cache Invalidation
 * @see IDataSourceObserver
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * class RiffDataSource extends ObservableDataSource<ReviewCard> {
 *   async remove(items: ReviewCard[]): Promise<number> {
 *     const count = await this.doRemove(items);
 *     this.notifyObservers(); // Automatically notify observers
 *     return count;
 *   }
 * }
 * 
 * // Usage
 * const dataSource = new RiffDataSource();
 * const sequencer = new PrioritySequencer({ ... });
 * dataSource.addObserver(sequencer); // Sequencer will auto-invalidate on changes
 * ```
 */
export interface IObservableDataSource<TItem extends QueueItem> extends IDataSource<TItem> {
  /**
   * Register an observer to be notified of data changes
   * 
   * @param observer - The observer to register
   * 
   * @remarks
   * - Observers are notified when data is added or removed
   * - The same observer can only be registered once
   * - Observers should implement cache invalidation in onDataChanged()
   */
  addObserver(observer: IDataSourceObserver): void;
  
  /**
   * Unregister an observer
   * 
   * @param observer - The observer to remove
   * 
   * @remarks
   * - Safe to call even if the observer is not registered
   * - Useful for cleanup when a sequencer is destroyed
   */
  removeObserver(observer: IDataSourceObserver): void;
}
