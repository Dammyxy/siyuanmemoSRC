/**
 * Observable Data Source Base Class
 * 
 * Implements the Observer pattern for automatic cache invalidation.
 * When data changes (via add/remove operations), all registered observers are notified.
 * 
 * This eliminates the need for manual reset() calls in sequencers and queues.
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The type of items in the data source (must extend QueueItem)
 * 
 * @see ADR-002: Observer Pattern for Cache Invalidation
 * @see IObservableDataSource
 * @see IDataSourceObserver
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * class MyDataSource extends ObservableDataSource<MyItem> {
 *   async getAll(): Promise<MyItem[]> {
 *     // Fetch data from storage
 *     return await this.fetchFromStorage();
 *   }
 *   
 *   async remove(items: MyItem[]): Promise<number> {
 *     const count = await this.doRemove(items);
 *     // Automatically notify observers
 *     this.notifyObservers();
 *     return count;
 *   }
 * }
 * 
 * // Usage
 * const dataSource = new MyDataSource();
 * const sequencer = new MySequencer();
 * dataSource.addObserver(sequencer); // Sequencer will auto-invalidate on changes
 * ```
 */

import type { IObservableDataSource } from './IDataSource';
import type { IDataSourceObserver } from '../abstraction/types';
import type { QueueItem } from '../types';
import { ok, err, type Result } from '@/types/result';

/**
 * Abstract base class for observable data sources
 * 
 * Provides observer management functionality out of the box.
 * Subclasses only need to:
 * 1. Implement getAll() to fetch data
 * 2. Call notifyObservers() after data modifications
 * 
 * @template TItem - The type of items in the data source (must extend QueueItem)
 */
export abstract class ObservableDataSource<TItem extends QueueItem> implements IObservableDataSource<TItem> {
  /**
   * List of registered observers
   * @private
   */
  private observers: IDataSourceObserver[] = [];

  /**
   * Register an observer to be notified of data changes
   * 
   * @param observer - The observer to register
   * 
   * @remarks
   * - Observers are notified when data is added or removed
   * - The same observer can only be registered once
   * - Observers should implement cache invalidation in onDataChanged()
   * 
   * @example
   * ```typescript
   * const sequencer = new PrioritySequencer({ ... });
   * dataSource.addObserver(sequencer);
   * ```
   */
  addObserver(observer: IDataSourceObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  /**
   * Unregister an observer
   * 
   * @param observer - The observer to remove
   * 
   * @remarks
   * - Safe to call even if the observer is not registered
   * - Useful for cleanup when a sequencer is destroyed
   * 
   * @example
   * ```typescript
   * dataSource.removeObserver(sequencer);
   * ```
   */
  removeObserver(observer: IDataSourceObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Notify all registered observers of data changes
   * 
   * @protected
   * 
   * @remarks
   * - Call this method after any data modification (add, remove, update)
   * - Observers will invalidate their caches and reload data on next access
   * - Errors in observer notifications are caught and logged to prevent cascading failures
   * 
   * @example
   * ```typescript
   * async remove(items: TItem[]): Promise<number> {
   *   const count = await this.doRemove(items);
   *   this.notifyObservers(); // Notify after successful removal
   *   return count;
   * }
   * ```
   */
  protected notifyObservers(): void {
    for (const observer of this.observers) {
      try {
        observer.onDataChanged();
      } catch (error) {
        // Log error but don't throw - one observer's failure shouldn't affect others
        console.error('[ObservableDataSource] Observer notification failed:', error);
      }
    }
  }

  /**
   * Get all items from the data source
   * 
   * @abstract
   * @returns All items in the data source
   * 
   * @remarks
   * Subclasses must implement this method to fetch data from their storage backend.
   */
  abstract getAll(): Promise<TItem[]>;

  /**
   * Add items to the data source (optional)
   * 
   * @param items - Items to add
   * @returns Result containing the number of items successfully added, or an error
   * 
   * @remarks
   * Default implementation returns success with 0 items added.
   * Subclasses should override this method and call notifyObservers() after successful addition.
   * 
   * @example
   * ```typescript
   * async add(items: TItem[]): Promise<Result<number>> {
   *   try {
   *     const count = await this.doAdd(items);
   *     if (count > 0) {
   *       this.notifyObservers();
   *     }
   *     return ok(count);
   *   } catch (error) {
   *     return err(error as Error);
   *   }
   * }
   * ```
   */
  async add(items: TItem[]): Promise<Result<number>> {
    // Default implementation: no-op, returns success with 0
    return ok(0);
  }

  /**
   * Remove items from the data source (optional)
   * 
   * @param items - Items to remove
   * @returns Result containing the number of items successfully removed, or an error
   * 
   * @remarks
   * Default implementation returns success with 0 items removed.
   * Subclasses should override this method and call notifyObservers() after successful removal.
   * 
   * @example
   * ```typescript
   * async remove(items: TItem[]): Promise<Result<number>> {
   *   try {
   *     const count = await this.doRemove(items);
   *     if (count > 0) {
   *       this.notifyObservers();
   *     }
   *     return ok(count);
   *   } catch (error) {
   *     return err(error as Error);
   *   }
   * }
   * ```
   */
  async remove(items: TItem[]): Promise<Result<number>> {
    // Default implementation: no-op, returns success with 0
    return ok(0);
  }

  /**
   * Get the size of the data source (optional)
   * 
   * @returns Number of items in the data source
   * 
   * @remarks
   * Default implementation returns undefined.
   * Subclasses can override this for optimized size queries.
   */
  size?(): Promise<number> | number;

  /**
   * Check if the data source is empty (optional)
   * 
   * @returns true if no items in the data source
   * 
   * @remarks
   * Default implementation returns undefined.
   * Subclasses can override this for optimized empty checks.
   */
  isEmpty?(): Promise<boolean> | boolean;
}
