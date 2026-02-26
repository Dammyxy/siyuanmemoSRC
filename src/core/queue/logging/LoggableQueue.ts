/**
 * LoggableQueue - Queue Decorator with Operation Logging
 * 
 * This module implements a decorator pattern that wraps a queue implementation
 * to add automatic operation logging capabilities. It records all queue operations
 * with timestamps, durations, and contextual details for debugging and analysis.
 * 
 * ## Design Pattern: Decorator
 * 
 * The decorator pattern allows us to add logging functionality to existing queues
 * without modifying their implementation. This provides:
 * - **Separation of concerns**: Logging logic is isolated from queue logic
 * - **Flexibility**: Can wrap different queue implementations
 * - **Composability**: Can be combined with other decorators
 * 
 * ## Architecture
 * 
 * ```
 * ┌─────────────────────────────────────┐
 * │      LoggableQueue (Decorator)      │
 * │  - Wraps an IQueue implementation    │
 * │  - Records all operations           │
 * │  - Manages log size limits          │
 * └──────────────┬──────────────────────┘
 *                │ delegates to
 *                ▼
 * ┌─────────────────────────────────────┐
 * │     Wrapped Queue (Any IQueue)      │
 * │  - RetrievalPracticeQueue           │
 * │  - FilterGroupQueue                 │
 * │  - IncrementalLearningQueue         │
 * │  - etc.                             │
 * └─────────────────────────────────────┘
 * ```
 * 
 * ## Usage Examples
 * 
 * ### Basic Usage
 * ```typescript
 * // Wrap an existing queue
 * const baseQueue = new RetrievalPracticeQueue(cards);
 * const loggableQueue = new LoggableQueue(baseQueue);
 * 
 * // Use normally - operations are automatically logged
 * const card = await loggableQueue.next();
 * 
 * // Retrieve operation log
 * const recentOps = loggableQueue.getOperationLog(10);
 * console.log('Last 10 operations:', recentOps);
 * ```
 * 
 * ### With Custom Configuration
 * ```typescript
 * const loggableQueue = new LoggableQueue(baseQueue, {
 *   maxSize: 500,           // Keep only 500 most recent operations
 *   trackDuration: true,    // Measure operation duration
 *   includeDetails: true    // Include operation details
 * });
 * ```
 * 
 * ### Analyzing Performance
 * ```typescript
 * // Get all operations
 * const ops = loggableQueue.getOperationLog();
 * 
 * // Calculate average duration for 'next' operations
 * const nextOps = ops.filter(op => op.type === 'next');
 * const avgDuration = nextOps.reduce((sum, op) => sum + (op.duration || 0), 0) / nextOps.length;
 * console.log(`Average next() duration: ${avgDuration.toFixed(2)}ms`);
 * ```
 * 
 * ## Requirement Validation
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
 * - 11.1: THE System SHALL log all queue operations (next, insert, remove, rotate)
 * - 11.2: WHEN logging operations, THE System SHALL record operation type, timestamp, and relevant details
 * - 11.3: WHEN operations complete, THE System SHALL record operation duration
 * - 11.4: THE System SHALL provide a method to retrieve operation history
 * - 11.5: THE System SHALL limit log size to prevent memory issues with long-running sessions
 * 
 * @module LoggableQueue
 */

import type { QueueItem } from '../types';
import type { 
  ILoggableQueue, 
  QueueOperation, 
  OperationLogConfig
} from '../../../types/logging';

type QueueLoggableItem = QueueItem & { blockID?: string };

interface WrappedQueuePort<TItem extends QueueLoggableItem> {
  next(): Promise<TItem | null>;
  insertAt?(items: TItem[], index: number): Promise<void>;
  remove?(items: TItem[]): Promise<number>;
  rotateToEnd?(item: TItem): Promise<void>;
  reset?(): Promise<void>;
  getAllCards?(): Promise<TItem[]>;
}

function resolveItemId<TItem extends QueueLoggableItem>(item: TItem | null | undefined): string | undefined {
  if (!item) {
    return undefined;
  }
  return item.blockId ?? item.blockID;
}

/**
 * LoggableQueue - Decorator that adds operation logging to a queue
 * 
 * This class wraps an existing queue implementation and automatically logs
 * all operations performed on it. The log includes operation type, timestamp,
 * duration, and contextual details.
 * 
 * ## Features
 * - **Automatic logging**: All operations are logged without manual intervention
 * - **Performance tracking**: Measures and records operation duration
 * - **Size limits**: Prevents memory issues with bounded log storage
 * - **Flexible configuration**: Customizable logging behavior
 * - **Type-safe**: Full TypeScript support with generic constraints
 * 
 * ## Implementation Details
 * 
 * ### Log Storage
 * Operations are stored in a circular buffer with a configurable maximum size.
 * When the buffer is full, the oldest entries are automatically removed.
 * 
 * ### Performance Measurement
 * Operation duration is measured using `performance.now()` for high precision.
 * This provides microsecond-level accuracy for performance analysis.
 * 
 * ### Error Handling
 * If the wrapped queue throws an error, the operation is still logged with
 * error details before re-throwing the error to the caller.
 * 
 * @template TItem - The item type managed by this queue (must extend QueueItem)
 * 
 * @example
 * ```typescript
 * // Create a loggable queue
 * const queue = new LoggableQueue(
 *   new RetrievalPracticeQueue(cards),
 *   { maxSize: 1000 }
 * );
 * 
 * // Operations are automatically logged
 * await queue.next();
 * await queue.insertAt([newCard], 0);
 * await queue.remove([oldCard]);
 * 
 * // Retrieve and analyze logs
 * const logs = queue.getOperationLog();
 * console.log(`Total operations: ${logs.length}`);
 * ```
 */
export class LoggableQueue<TItem extends QueueLoggableItem> implements ILoggableQueue<TItem> {
  /** The wrapped queue instance */
  private readonly wrappedQueue: WrappedQueuePort<TItem>;
  
  /** Operation log storage */
  private operationLog: QueueOperation[] = [];
  
  /** Logging configuration */
  private readonly config: Required<OperationLogConfig>;
  
  /**
   * Creates a new LoggableQueue decorator
   * 
   * @param wrappedQueue - The queue to wrap with logging functionality
   * @param config - Optional logging configuration
   * 
   * @example
   * ```typescript
   * const loggableQueue = new LoggableQueue(
   *   new RetrievalPracticeQueue(cards),
   *   { maxSize: 500, trackDuration: true }
   * );
   * ```
   */
  constructor(
    wrappedQueue: WrappedQueuePort<TItem>,
    config: Partial<OperationLogConfig> = {}
  ) {
    this.wrappedQueue = wrappedQueue;
    this.config = {
      maxSize: config.maxSize ?? 1000,
      trackDuration: config.trackDuration ?? true,
      includeDetails: config.includeDetails ?? true
    };
  }
  
  /**
   * Get the next item from the queue
   * 
   * Delegates to the wrapped queue and logs the operation.
   * 
   * @returns The next item, or null if the queue is empty
   * 
   * @example
   * ```typescript
   * const card = await queue.next();
   * if (card) {
   *   console.log('Got card:', card.blockID);
   * }
   * ```
   */
  async next(): Promise<TItem | null> {
    const startTime = this.config.trackDuration ? performance.now() : undefined;
    
    try {
      const item = await this.wrappedQueue.next();
      
      this.addLog({
        type: 'next',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemReturned: item !== null,
          itemId: resolveItemId(item)
        } : {}
      });
      
      return item;
    } catch (error) {
      this.addLog({
        type: 'next',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          error: error instanceof Error ? error.message : String(error)
        } : {}
      });
      throw error;
    }
  }
  
  /**
   * Insert items at a specific position
   * 
   * Delegates to the wrapped queue's insertAt method if available.
   * 
   * @param items - Items to insert
   * @param index - Position to insert at
   * 
   * @example
   * ```typescript
   * await queue.insertAt([card1, card2], 0); // Insert at beginning
   * ```
   */
  async insertAt(items: TItem[], index: number): Promise<void> {
    const startTime = this.config.trackDuration ? performance.now() : undefined;
    
    try {
      if (typeof this.wrappedQueue.insertAt === 'function') {
        await this.wrappedQueue.insertAt(items, index);
      }
      
      this.addLog({
        type: 'insert',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemCount: items.length,
          index,
          itemIds: items.map(item => resolveItemId(item))
        } : {}
      });
    } catch (error) {
      this.addLog({
        type: 'insert',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemCount: items.length,
          index,
          error: error instanceof Error ? error.message : String(error)
        } : {}
      });
      throw error;
    }
  }
  
  /**
   * Remove items from the queue
   * 
   * Delegates to the wrapped queue's remove method if available.
   * 
   * @param items - Items to remove
   * @returns Number of items actually removed
   * 
   * @example
   * ```typescript
   * const removed = await queue.remove([card1, card2]);
   * console.log(`Removed ${removed} cards`);
   * ```
   */
  async remove(items: TItem[]): Promise<number> {
    const startTime = this.config.trackDuration ? performance.now() : undefined;
    
    try {
      let removedCount = 0;
      if (typeof this.wrappedQueue.remove === 'function') {
        removedCount = await this.wrappedQueue.remove(items);
      }
      
      this.addLog({
        type: 'remove',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemCount: items.length,
          removedCount,
          itemIds: items.map(item => resolveItemId(item))
        } : {}
      });
      
      return removedCount;
    } catch (error) {
      this.addLog({
        type: 'remove',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemCount: items.length,
          error: error instanceof Error ? error.message : String(error)
        } : {}
      });
      throw error;
    }
  }
  
  /**
   * Rotate an item to the end of the queue
   * 
   * Delegates to the wrapped queue's rotateToEnd method if available.
   * 
   * @param item - Item to rotate
   * 
   * @example
   * ```typescript
   * await queue.rotateToEnd(currentCard);
   * ```
   */
  async rotateToEnd(item: TItem): Promise<void> {
    const startTime = this.config.trackDuration ? performance.now() : undefined;
    
    try {
      if (typeof this.wrappedQueue.rotateToEnd === 'function') {
        await this.wrappedQueue.rotateToEnd(item);
      }
      
      this.addLog({
        type: 'rotate',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemId: resolveItemId(item)
        } : {}
      });
    } catch (error) {
      this.addLog({
        type: 'rotate',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          itemId: resolveItemId(item),
          error: error instanceof Error ? error.message : String(error)
        } : {}
      });
      throw error;
    }
  }
  
  /**
   * Reset the queue
   * 
   * Delegates to the wrapped queue's reset method if available.
   * 
   * @example
   * ```typescript
   * await queue.reset();
   * ```
   */
  async reset(): Promise<void> {
    const startTime = this.config.trackDuration ? performance.now() : undefined;
    
    try {
      if (typeof this.wrappedQueue.reset === 'function') {
        await this.wrappedQueue.reset();
      }
      
      this.addLog({
        type: 'reset',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {} : {}
      });
    } catch (error) {
      this.addLog({
        type: 'reset',
        timestamp: Date.now(),
        duration: startTime ? performance.now() - startTime : undefined,
        details: this.config.includeDetails ? {
          error: error instanceof Error ? error.message : String(error)
        } : {}
      });
      throw error;
    }
  }
  
  /**
   * Get operation history
   * 
   * Retrieves the logged operations, optionally limited to the most recent entries.
   * 
   * **Validates: Requirement 11.4**
   * - THE System SHALL provide a method to retrieve operation history
   * 
   * @param limit - Maximum number of operations to return (most recent first)
   *                If omitted, returns all logged operations
   * @returns Array of operation records, ordered from oldest to newest
   * 
   * @example
   * ```typescript
   * // Get all operations
   * const allOps = queue.getOperationLog();
   * 
   * // Get last 10 operations
   * const recentOps = queue.getOperationLog(10);
   * 
   * // Analyze operation types
   * const nextOps = allOps.filter(op => op.type === 'next');
   * console.log(`next() called ${nextOps.length} times`);
   * ```
   */
  getOperationLog(limit?: number): QueueOperation[] {
    if (limit === undefined) {
      return [...this.operationLog];
    }
    
    // Return the most recent 'limit' entries
    const startIndex = Math.max(0, this.operationLog.length - limit);
    return this.operationLog.slice(startIndex);
  }
  
  /**
   * Clear operation log
   * 
   * Removes all logged operations from memory.
   * Use this to free memory or reset logging state.
   * 
   * @example
   * ```typescript
   * // Clear log after analysis
   * const ops = queue.getOperationLog();
   * analyzeOperations(ops);
   * queue.clearOperationLog();
   * ```
   */
  clearOperationLog(): void {
    this.operationLog = [];
  }
  
  /**
   * Add an operation to the log
   * 
   * Internal method that adds a new operation record and enforces size limits.
   * 
   * **Validates: Requirement 11.5**
   * - THE System SHALL limit log size to prevent memory issues with long-running sessions
   * 
   * @param operation - The operation to log
   * 
   * @remarks
   * This method implements a circular buffer pattern: when the log exceeds
   * the configured maximum size, the oldest entry is removed before adding
   * the new one. This ensures the log never grows beyond the size limit.
   */
  private addLog(operation: QueueOperation): void {
    this.operationLog.push(operation);
    
    // Enforce size limit by removing oldest entries
    if (this.operationLog.length > this.config.maxSize) {
      this.operationLog.shift();
    }
  }
  
  /**
   * Get all cards from the queue
   * 
   * Delegates to the wrapped queue's getAllCards method if available.
   * 
   * @returns All cards in the queue
   * 
   * @example
   * ```typescript
   * const allCards = await queue.getAllCards();
   * console.log(`Queue contains ${allCards.length} cards`);
   * ```
   */
  async getAllCards(): Promise<TItem[]> {
    if (typeof this.wrappedQueue.getAllCards === 'function') {
      return await this.wrappedQueue.getAllCards();
    }
    return [];
  }
}
