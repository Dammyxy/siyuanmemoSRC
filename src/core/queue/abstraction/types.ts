/**
 * Scheduler interface for updating card scheduling parameters
 * 
 * A scheduler is responsible for calculating the next review time and updating
 * card parameters (stability, difficulty, etc.) based on user feedback.
 * 
 * @template TCard - The card type to be scheduled
 * @template TGrade - The grading type (default: number)
 * 
 * @example
 * ```typescript
 * const scheduler: IScheduler<FSRSCard, number> = new FSRSScheduler();
 * const updatedCard = await scheduler.schedule(card, 3); // Grade: Good
 * ```
 */
export interface IScheduler<TCard, TGrade = number> {
  /**
   * Schedule a card based on user feedback
   * 
   * @param card - The card to schedule
   * @param grade - The user's rating/grade for this review
   * @returns The updated card with new scheduling parameters
   * 
   * @example
   * ```typescript
   * // Grade 1: Again, 2: Hard, 3: Good, 4: Easy
   * const updatedCard = await scheduler.schedule(card, 3);
   * console.log(updatedCard.due); // Next review timestamp
   * ```
   */
  schedule(card: TCard, grade: TGrade): Promise<TCard>;
}

/**
 * Sequencer interface for ordering and providing items from a data source
 * 
 * A sequencer manages the order in which items are presented to the user.
 * It typically maintains an internal cache and provides items one at a time
 * through the `next()` method.
 * 
 * **Cache Invalidation**: Sequencers should implement `IDataSourceObserver`
 * to automatically invalidate their cache when the underlying data changes.
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type to be sequenced (must extend QueueItem)
 * 
 * @see IDataSourceObserver for automatic cache invalidation
 * @see ADR-002: Observer Pattern for Cache Invalidation
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * import type { QueueItem } from '../types';
 * 
 * class PrioritySequencer<TItem extends QueueItem> implements ISequencer<TItem>, IDataSourceObserver {
 *   private items: TItem[] = [];
 *   private loaded = false;
 *   
 *   async next(): Promise<TItem | null> {
 *     if (!this.loaded) {
 *       this.items = await this.dataSource.fetchAll();
 *       this.loaded = true;
 *     }
 *     return this.items.shift() || null;
 *   }
 *   
 *   onDataChanged(): void {
 *     this.loaded = false;
 *     this.items = [];
 *   }
 * }
 * ```
 */
export interface ISequencer<TItem extends import('../types').QueueItem> {
  /**
   * Get the next item in the sequence
   * 
   * Returns `null` when no more items are available. Implementations should
   * handle cache loading transparently on first access.
   * 
   * @returns The next item, or null if the sequence is exhausted
   * 
   * @example
   * ```typescript
   * const item = await sequencer.next();
   * if (item !== null) {
   *   console.log('Processing item:', item);
   * } else {
   *   console.log('No more items');
   * }
   * ```
   */
  next(): Promise<TItem | null>;
  
  /**
   * Reorder items in the sequence (optional)
   * 
   * Allows external components to change the order of items.
   * Not all sequencers support reordering (e.g., priority-based sequencers
   * may ignore this method).
   * 
   * @param orderedItems - The new order of items
   * 
   * @example
   * ```typescript
   * // User manually reorders cards in the UI
   * const reorderedCards = [card3, card1, card2];
   * sequencer.reorder?.(reorderedCards);
   * ```
   */
  reorder?(orderedItems: TItem[]): void;
}

/**
 * Observer interface for data source changes
 * 
 * Implements the Observer pattern to automatically invalidate caches
 * when the underlying data source changes.
 * 
 * @see ADR-002: Observer Pattern for Cache Invalidation
 */
export interface IDataSourceObserver {
  /**
   * Called when the data source's data has changed
   * 
   * Observers should invalidate their caches and reload data
   * on the next access.
   * 
   * @example
   * ```typescript
   * class MySequencer implements IDataSourceObserver {
   *   private loaded = false;
   *   
   *   onDataChanged(): void {
   *     this.loaded = false;
   *     this.items.length = 0;
   *   }
   * }
   * ```
   */
  onDataChanged(): void;
}

/**
 * Base interface for Queue Traits
 * 
 * **Trait Pattern**: Traits provide optional capabilities to queues without
 * requiring inheritance. A queue can support multiple traits by implementing
 * the corresponding interfaces.
 * 
 * Each trait has a unique `id` that identifies its capability. Consumers can
 * check if a queue supports a trait and access it dynamically.
 * 
 * @see IMutableTrait for insertion capabilities
 * @see IRemovableTrait for deletion capabilities
 * @see IPrioritizableTrait for priority management
 * @see ADR-001: Trait Pattern for Queue Capabilities
 * 
 * @example
 * ```typescript
 * // Check if a queue supports the mutable trait
 * const mutableTrait = queue.getTrait?.('mutable') as IMutableTrait<TItem>;
 * if (mutableTrait) {
 *   await mutableTrait.insertAt([newCard], 0);
 * }
 * ```
 */
export interface IQueueTrait {
  /**
   * Unique identifier for this trait
   * 
   * Used to look up traits dynamically via `queue.getTrait(id)`
   */
  id: string;
}

/**
 * Mutable Trait - Provides insertion capabilities
 * 
 * Queues implementing this trait allow items to be inserted at specific positions.
 * This is useful for:
 * - Adding new cards to a review queue
 * - Inserting priority items at the front
 * - Implementing undo/redo functionality
 * 
 * **Usage Pattern**:
 * 1. Check if the queue supports the 'mutable' trait
 * 2. Cast to `IMutableTrait<TItem>`
 * 3. Call `insertAt()` with items and position
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type to be inserted (must extend QueueItem)
 * 
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * // Insert new cards at the beginning of the queue
 * const mutableTrait = queue.getTrait?.('mutable') as IMutableTrait<ReviewCard>;
 * if (mutableTrait) {
 *   await mutableTrait.insertAt([card1, card2], 0);
 *   console.log('Inserted 2 cards at position 0');
 * }
 * 
 * // Insert a card at the end
 * const allCards = await queue.getAllCards();
 * await mutableTrait.insertAt([newCard], allCards.length);
 * ```
 * 
 * @remarks
 * - Insertion may trigger cache invalidation in sequencers
 * - Position is 0-indexed
 * - Inserting beyond the current length appends to the end
 */
export interface IMutableTrait<TItem extends import('../types').QueueItem> extends IQueueTrait {
  id: 'mutable';
  
  /**
   * Insert items at a specific position in the queue
   * 
   * @param items - The items to insert
   * @param index - The position to insert at (0-indexed)
   * 
   * @throws {Error} If the index is negative
   * 
   * @example
   * ```typescript
   * // Insert at the front (highest priority)
   * await mutableTrait.insertAt([urgentCard], 0);
   * 
   * // Insert at position 5
   * await mutableTrait.insertAt([card], 5);
   * ```
   */
  insertAt(items: TItem[], index: number): Promise<void>;
}

/**
 * Interceptive Trait - Provides pre-processing hooks
 * 
 * Queues implementing this trait can intercept and modify items before
 * they are returned by `next()`. This is useful for:
 * - Filtering out invalid items
 * - Applying last-minute transformations
 * - Implementing conditional logic
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type to be intercepted (must extend QueueItem)
 * 
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * class FilteringQueue implements IInterceptiveTrait<ReviewCard> {
 *   id = 'interceptive' as const;
 *   
 *   async beforeNext(context: { candidate: ReviewCard | null }): Promise<ReviewCard | null> {
 *     const card = context.candidate;
 *     if (card && card.suspended) {
 *       return null; // Skip suspended cards
 *     }
 *     return card;
 *   }
 * }
 * ```
 */
export interface IInterceptiveTrait<TItem extends import('../types').QueueItem> extends IQueueTrait {
  id: 'interceptive';
  
  /**
   * Hook called before returning an item from `next()`
   * 
   * @param context - Context containing the candidate item
   * @returns The item to return (can be modified or replaced), or null to skip
   * 
   * @example
   * ```typescript
   * // Filter out items that don't meet criteria
   * async beforeNext(context: { candidate: TItem | null }): Promise<TItem | null> {
   *   if (context.candidate && !this.isValid(context.candidate)) {
   *     return null; // Skip this item
   *   }
   *   return context.candidate;
   * }
   * ```
   */
  beforeNext?(context: { candidate: TItem | null }): Promise<TItem | null>;
}

/**
 * Prioritizable Trait - Provides priority management
 * 
 * Queues implementing this trait allow items to have their priority changed
 * dynamically. This is useful for:
 * - User-initiated priority changes
 * - Automatic priority adjustments based on performance
 * - Implementing "study this first" functionality
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type with priority (must extend QueueItem)
 * 
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * const priorityTrait = queue.getTrait?.('prioritizable') as IPrioritizableTrait<ReviewCard>;
 * if (priorityTrait) {
 *   // Increase priority of a difficult card
 *   const success = await priorityTrait.setPriority(card, 100);
 *   if (success) {
 *     console.log('Priority updated');
 *   }
 * }
 * ```
 */
export interface IPrioritizableTrait<TItem extends import('../types').QueueItem> extends IQueueTrait {
  id: 'prioritizable';
  
  /**
   * Set the priority of an item
   * 
   * Higher priority values typically mean the item will be presented sooner.
   * The exact behavior depends on the queue implementation.
   * 
   * @param item - The item to update
   * @param priority - The new priority value (higher = more urgent)
   * @returns true if the priority was updated, false if the item was not found
   * 
   * @example
   * ```typescript
   * // Set high priority (will be shown soon)
   * await priorityTrait.setPriority(card, 1000);
   * 
   * // Set low priority (will be shown later)
   * await priorityTrait.setPriority(card, 1);
   * ```
   */
  setPriority(item: TItem, priority: number): Promise<boolean>;
}

/**
 * Removable Trait - Provides deletion capabilities
 * 
 * Queues implementing this trait allow items to be removed. This is useful for:
 * - Deleting cards the user no longer wants to review
 * - Removing completed items from the queue
 * - Implementing bulk deletion operations
 * 
 * **Usage Pattern**:
 * 1. Check if the queue supports the 'removable' trait
 * 2. Cast to `IRemovableTrait<TItem>`
 * 3. Call `remove()` with items to delete
 * 
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking.
 * 
 * @template TItem - The item type to be removed (must extend QueueItem)
 * 
 * @see Requirement 6.2 - Generic type constraints for IQueue interface
 * 
 * @example
 * ```typescript
 * const removableTrait = queue.getTrait?.('removable') as IRemovableTrait<ReviewCard>;
 * if (removableTrait) {
 *   const removed = await removableTrait.remove([card1, card2]);
 *   console.log(`Removed ${removed} cards`);
 * }
 * ```
 * 
 * @remarks
 * - Removal triggers cache invalidation via the Observer pattern
 * - Items are matched by identity (typically by ID field)
 * - Removing non-existent items is not an error
 */
export interface IRemovableTrait<TItem extends import('../types').QueueItem> extends IQueueTrait {
  id: 'removable';
  
  /**
   * Remove items from the queue
   * 
   * @param items - The items to remove
   * @returns The number of items actually removed
   * 
   * @example
   * ```typescript
   * // Remove specific cards
   * const removed = await removableTrait.remove([card1, card2, card3]);
   * console.log(`Removed ${removed} out of 3 cards`);
   * 
   * // Remove all cards matching a condition
   * const allCards = await queue.getAllCards();
   * const toRemove = allCards.filter(card => card.suspended);
   * await removableTrait.remove(toRemove);
   * ```
   */
  remove(items: TItem[]): Promise<number>;
}

/**
 * Auto-Sortable Trait - Provides automatic sorting
 * 
 * Queues implementing this trait can re-sort their items on demand.
 * This is useful for:
 * - Updating sort order after priority changes
 * - Re-sorting after bulk insertions
 * - Implementing "refresh" functionality
 * 
 * @example
 * ```typescript
 * const sortableTrait = queue.getTrait?.('auto-sortable') as IAutoSortableTrait;
 * if (sortableTrait) {
 *   await sortableTrait.sort();
 *   console.log('Queue re-sorted');
 * }
 * ```
 */
export interface IAutoSortableTrait extends IQueueTrait {
  id: 'auto-sortable';
  
  /**
   * Re-sort all items in the queue
   * 
   * The sorting criteria depends on the queue implementation
   * (e.g., by due date, priority, difficulty).
   * 
   * @example
   * ```typescript
   * // After changing priorities, re-sort the queue
   * await priorityTrait.setPriority(card, 100);
   * await sortableTrait.sort();
   * ```
   */
  sort(): Promise<void>;
}
