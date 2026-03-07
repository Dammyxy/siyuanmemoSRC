/**
 * Operation Logging Module
 * 
 * Provides interfaces and types for logging queue operations.
 * This module enables detailed operation tracking for debugging and analysis.
 * 
 * ## Design Principles
 * - **Comprehensive logging**: Record all queue operations with full context
 * - **Performance tracking**: Measure operation duration for performance analysis
 * - **Size limits**: Prevent memory issues with bounded log storage
 * - **Type safety**: Strongly typed operation records
 * 
 * ## Usage Examples
 * 
 * ### Basic Usage
 * ```typescript
 * class LoggableQueue<TItem extends QueueItem> implements ILoggableQueue<TItem> {
 *   private operationLog: QueueOperation[] = [];
 *   
 *   async next(): Promise<TItem | null> {
 *     const startTime = performance.now();
 *     const item = await this.doNext();
 *     const duration = performance.now() - startTime;
 *     
 *     this.operationLog.push({
 *       type: 'next',
 *       timestamp: Date.now(),
 *       duration,
 *       details: { itemReturned: item !== null }
 *     });
 *     
 *     return item;
 *   }
 *   
 *   getOperationLog(limit?: number): QueueOperation[] {
 *     return limit ? this.operationLog.slice(-limit) : this.operationLog;
 *   }
 * }
 * ```
 * 
 * ### With Size Limit
 * ```typescript
 * class BoundedLogQueue<TItem extends QueueItem> implements ILoggableQueue<TItem> {
 *   private operationLog: QueueOperation[] = [];
 *   private readonly MAX_LOG_SIZE = 1000;
 *   
 *   private addLog(operation: QueueOperation): void {
 *     this.operationLog.push(operation);
 *     
 *     // Keep only the most recent MAX_LOG_SIZE entries
 *     if (this.operationLog.length > this.MAX_LOG_SIZE) {
 *       this.operationLog.shift();
 *     }
 *   }
 * }
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
 * @module logging
 */

/**
 * Queue Operation Type
 * 
 * Defines the types of operations that can be performed on a queue.
 * Each operation type represents a distinct queue action that should be logged.
 * 
 * @remarks
 * - `next`: Retrieve the next item from the queue
 * - `insert`: Add items to the queue
 * - `remove`: Delete items from the queue
 * - `rotate`: Move items within the queue (e.g., rotate to end)
 * - `reset`: Clear and reload the queue
 * 
 * @example
 * ```typescript
 * const operation: QueueOperationType = 'next';
 * ```
 */
export type QueueOperationType = 'next' | 'insert' | 'remove' | 'rotate' | 'reset';

/**
 * Queue Operation Record
 * 
 * Represents a single logged operation with all relevant metadata.
 * Each operation record captures what happened, when it happened,
 * how long it took, and any additional context.
 * 
 * ## Fields
 * - `type`: The type of operation performed
 * - `timestamp`: When the operation occurred (milliseconds since epoch)
 * - `duration`: How long the operation took (milliseconds)
 * - `details`: Additional context specific to the operation
 * 
 * @example
 * ```typescript
 * const operation: QueueOperation = {
 *   type: 'next',
 *   timestamp: Date.now(),
 *   duration: 5.2,
 *   details: {
 *     itemReturned: true,
 *     queueSize: 42
 *   }
 * };
 * ```
 */
export interface QueueOperation {
  /** 
   * Operation type
   * 
   * Identifies what kind of operation was performed.
   */
  type: QueueOperationType;
  
  /** 
   * Operation timestamp (milliseconds since epoch)
   * 
   * Records when the operation occurred. Use `Date.now()` to capture.
   */
  timestamp: number;
  
  /** 
   * Operation duration (milliseconds)
   * 
   * Measures how long the operation took to complete.
   * Use `performance.now()` for high-precision timing.
   * 
   * @optional This field may be undefined for operations that don't measure duration
   */
  duration?: number;
  
  /** 
   * Operation details
   * 
   * Additional context specific to the operation type.
   * The structure depends on the operation:
   * 
   * - `next`: { itemReturned: boolean, queueSize?: number }
   * - `insert`: { itemCount: number, index: number }
   * - `remove`: { itemCount: number, removedCount: number }
   * - `rotate`: { itemId: string, fromIndex: number, toIndex: number }
   * - `reset`: { previousSize: number }
   */
  details: Record<string, unknown>;
}

/**
 * Loggable Queue Interface
 * 
 * Extends the basic queue interface with operation logging capabilities.
 * Queues implementing this interface automatically track all operations
 * and provide methods to retrieve and manage the operation log.
 * 
 * ## Usage Pattern
 * 1. Implement `ILoggableQueue<TItem>` in your queue class
 * 2. Log operations by creating `QueueOperation` records
 * 3. Store logs in an internal array with size limits
 * 4. Provide access via `getOperationLog()` and `clearOperationLog()`
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type managed by this queue (must extend QueueItem)
 * 
 * @see QueueOperation for the structure of log entries
 * @see Requirement 11.1, 11.2, 11.3, 11.4, 11.5
 * 
 * @example
 * ```typescript
 * class MyQueue<TItem extends QueueItem> implements ILoggableQueue<TItem> {
 *   private operationLog: QueueOperation[] = [];
 *   private readonly MAX_LOG_SIZE = 1000;
 *   
 *   async next(): Promise<TItem | null> {
 *     const start = performance.now();
 *     const item = await this.doNext();
 *     
 *     this.addLog({
 *       type: 'next',
 *       timestamp: Date.now(),
 *       duration: performance.now() - start,
 *       details: { itemReturned: item !== null }
 *     });
 *     
 *     return item;
 *   }
 *   
 *   getOperationLog(limit?: number): QueueOperation[] {
 *     return limit ? this.operationLog.slice(-limit) : [...this.operationLog];
 *   }
 *   
 *   clearOperationLog(): void {
 *     this.operationLog = [];
 *   }
 *   
 *   private addLog(operation: QueueOperation): void {
 *     this.operationLog.push(operation);
 *     if (this.operationLog.length > this.MAX_LOG_SIZE) {
 *       this.operationLog.shift();
 *     }
 *   }
 * }
 * ```
 */
export interface ILoggableQueue {
  /**
   * Get operation history
   * 
   * Retrieves the logged operations, optionally limited to the most recent entries.
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
   * ```
   */
  getOperationLog(limit?: number): QueueOperation[];
  
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
  clearOperationLog(): void;
}

/**
 * Operation Log Configuration
 * 
 * Configuration options for operation logging behavior.
 * 
 * @example
 * ```typescript
 * const config: OperationLogConfig = {
 *   maxSize: 1000,
 *   trackDuration: true,
 *   includeDetails: true
 * };
 * ```
 */
export interface OperationLogConfig {
  /** 
   * Maximum number of operations to keep in memory
   * 
   * When the log exceeds this size, oldest entries are removed.
   * Default: 1000
   */
  maxSize: number;
  
  /** 
   * Whether to track operation duration
   * 
   * If false, the `duration` field will be undefined.
   * Default: true
   */
  trackDuration?: boolean;
  
  /** 
   * Whether to include detailed operation context
   * 
   * If false, the `details` field will be an empty object.
   * Default: true
   */
  includeDetails?: boolean;
}

/**
 * Default operation log configuration
 */
export const DEFAULT_LOG_CONFIG: OperationLogConfig = {
  maxSize: 1000,
  trackDuration: true,
  includeDetails: true
};
