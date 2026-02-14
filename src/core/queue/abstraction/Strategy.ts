import type { QueueStats, QueueUIConfig } from '../types';

/**
 * Feedback from user interaction with a queue item
 * 
 * Represents the user's response to a review card, including:
 * - The action taken (rate, skip, or custom)
 * - The rating if applicable (1-4 scale)
 * - Custom action identifier for extensibility
 * - Duration of the review session
 */
export type QueueFeedback = {
  /** The type of action performed */
  action: 'rate' | 'skip' | 'custom';
  /** Rating on a 1-4 scale (1: Again, 2: Hard, 3: Good, 4: Easy) */
  rating?: 1 | 2 | 3 | 4;
  /** Identifier for custom actions */
  customActionId?: string;
  /** Time spent reviewing this item in milliseconds */
  durationMs?: number;
};

/**
 * Queue Strategy Interface - Defines the behavior of a review queue
 * 
 * A queue strategy encapsulates the logic for:
 * - Providing items to review (`next()`)
 * - Processing user feedback (`onFeedback()`)
 * - Configuring the UI (`getUIConfig()`)
 * - Reporting statistics (`getStats()`)
 * 
 * **Design Pattern**: Strategy pattern allows different queue behaviors
 * (e.g., retrieval practice, incremental learning) to be swapped at runtime.
 * 
 * **Trait Support**: Queues can optionally implement trait interfaces
 * (IMutableTrait, IRemovableTrait, etc.) to provide additional capabilities.
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking. This
 * satisfies Requirement 6.2: "WHEN defining IQueue interface, THE System SHALL
 * constrain TItem to extend QueueItem"
 * 
 * @template TItem - The item type managed by this queue (must extend QueueItem)
 * 
 * @see IMutableTrait for insertion capabilities
 * @see IRemovableTrait for deletion capabilities
 * @see ADR-001: Trait Pattern for Queue Capabilities
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * import type { QueueItem } from '../types';
 * 
 * class MyQueue implements IQueueStrategy<ReviewCard> {
 *   async next(): Promise<ReviewCard | null> {
 *     // Return the next card to review
 *     return this.sequencer.next();
 *   }
 *   
 *   async onFeedback(currentItem: ReviewCard | null, feedback: QueueFeedback): Promise<void> {
 *     if (feedback.action === 'rate' && currentItem) {
 *       // Update card based on rating
 *       const updated = await this.scheduler.schedule(currentItem, feedback.rating!);
 *       await this.dataSource.update(updated);
 *     }
 *   }
 *   
 *   getUIConfig(currentItem: ReviewCard | null): QueueUIConfig {
 *     return {
 *       showRating: true,
 *       showSkip: true,
 *       customActions: []
 *     };
 *   }
 * }
 * ```
 */
export interface IQueueStrategy<TItem extends import('../types').QueueItem = any> {
  /**
   * Get UI configuration for the current item
   * 
   * Determines what buttons and options should be shown in the review UI.
   * The configuration can change based on the current item's state.
   * 
   * @param currentItem - The item currently being reviewed, or null if none
   * @returns UI configuration object
   * 
   * @example
   * ```typescript
   * const config = queue.getUIConfig(currentCard);
   * if (config.showRating) {
   *   // Show rating buttons (Again, Hard, Good, Easy)
   * }
   * if (config.showSkip) {
   *   // Show skip button
   * }
   * ```
   */
  getUIConfig(currentItem: TItem | null): QueueUIConfig;
  
  /**
   * Get the next item to review
   * 
   * Returns the next item according to the queue's strategy (e.g., by due date,
   * priority, or custom logic). Returns `null` when no more items are available.
   * 
   * **Concurrency**: Implementations should handle concurrent calls safely,
   * ensuring that the same item is not returned multiple times.
   * 
   * @returns The next item to review, or null if the queue is empty
   * 
   * @example
   * ```typescript
   * const card = await queue.next();
   * if (card) {
   *   // Present card to user for review
   *   displayCard(card);
   * } else {
   *   // No more cards to review
   *   showCompletionMessage();
   * }
   * ```
   */
  next(): Promise<TItem | null>;
  
  /**
   * Process user feedback for the current item
   * 
   * Called after the user interacts with an item (rates it, skips it, etc.).
   * The queue should update the item's state and schedule accordingly.
   * 
   * **Side Effects**:
   * - Updates item scheduling parameters
   * - May trigger cache invalidation
   * - May update statistics
   * 
   * @param currentItem - The item that was reviewed, or null if none
   * @param feedback - The user's feedback
   * 
   * @example
   * ```typescript
   * // User rates a card as "Good" (3)
   * await queue.onFeedback(card, {
   *   action: 'rate',
   *   rating: 3,
   *   durationMs: 5000
   * });
   * 
   * // User skips a card
   * await queue.onFeedback(card, {
   *   action: 'skip'
   * });
   * ```
   */
  onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void>;
  
  /**
   * Get queue statistics (optional)
   * 
   * Returns information about the queue's state, such as:
   * - Total number of items
   * - Number of items due today
   * - Number of new items
   * - Average review time
   * 
   * @returns Queue statistics object
   * 
   * @example
   * ```typescript
   * const stats = await queue.getStats?.();
   * if (stats) {
   *   console.log(`${stats.dueToday} cards due today`);
   *   console.log(`${stats.total} total cards`);
   * }
   * ```
   */
  getStats?(): Promise<QueueStats>;
  
  /**
   * Reorder items in the queue (optional)
   * 
   * Allows external components to change the order of items.
   * Not all queues support reordering (e.g., priority-based queues
   * may ignore this method or return false).
   * 
   * @param orderedItems - The new order of items
   * @returns true if reordering was successful, false otherwise
   * 
   * @example
   * ```typescript
   * // User manually reorders cards in the UI
   * const reordered = [card3, card1, card2];
   * const success = await queue.reorder?.(reordered);
   * if (success) {
   *   console.log('Queue reordered successfully');
   * }
   * ```
   */
  reorder?(orderedItems: TItem[]): Promise<boolean>;
}


