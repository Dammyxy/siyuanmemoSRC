/**
 * Test Helper Functions for Queue Tests
 * 
 * This module provides reusable helper functions to improve test readability
 * and reduce code duplication across test files.
 * 
 * Feature: architecture-optimization
 * Task: 17.1 - Create test helper functions
 */

import type { IQueue } from '../abstraction/types';

/**
 * Creates an empty queue for testing purposes
 * 
 * @template TItem - The type of items in the queue
 * @returns A queue that always returns null and has no items
 * 
 * @example
 * ```typescript
 * const emptyQueue = createEmptyQueue<ReviewCard>();
 * const card = await emptyQueue.next(); // null
 * const all = await emptyQueue.getAllCards(); // []
 * ```
 */
export function createEmptyQueue<TItem>(): IQueue<TItem> {
  return {
    async next() {
      return null;
    },
    async getAllCards() {
      return [];
    },
  };
}

/**
 * Creates a queue with predefined cards for testing
 * 
 * @template TItem - The type of items in the queue
 * @param items - Array of items to populate the queue with
 * @returns A queue that returns items in order
 * 
 * @example
 * ```typescript
 * const cards = [
 *   { blockID: 'A1', cardID: 'card-1', ... },
 *   { blockID: 'A2', cardID: 'card-2', ... },
 * ];
 * const queue = createQueueWithCards(cards);
 * const first = await queue.next(); // cards[0]
 * const second = await queue.next(); // cards[1]
 * ```
 */
export function createQueueWithCards<TItem>(items: TItem[]): IQueue<TItem> {
  let index = 0;
  const itemsCopy = [...items];

  return {
    async next() {
      if (index >= itemsCopy.length) {
        return null;
      }
      return itemsCopy[index++];
    },
    async getAllCards() {
      return itemsCopy;
    },
  };
}

/**
 * Consumes a specified number of cards from a queue
 * 
 * This helper function repeatedly calls queue.next() until either:
 * - The requested count is reached
 * - The queue returns null (no more cards)
 * 
 * @template TItem - The type of items in the queue
 * @param queue - The queue to consume cards from
 * @param count - Maximum number of cards to consume
 * @returns Array of consumed cards (may be shorter than count if queue is exhausted)
 * 
 * @example
 * ```typescript
 * const queue = createQueueWithCards([card1, card2, card3]);
 * const consumed = await consumeCards(queue, 2);
 * // consumed = [card1, card2]
 * 
 * const remaining = await consumeCards(queue, 10);
 * // remaining = [card3] (only 1 card left, even though we requested 10)
 * ```
 */
export async function consumeCards<TItem>(
  queue: IQueue<TItem>,
  count: number
): Promise<TItem[]> {
  const results: TItem[] = [];
  
  for (let i = 0; i < count; i++) {
    const card = await queue.next();
    if (card === null) {
      break;
    }
    results.push(card);
  }
  
  return results;
}

/**
 * Consumes all remaining cards from a queue
 * 
 * This helper function repeatedly calls queue.next() until the queue
 * returns null, collecting all returned cards.
 * 
 * @template TItem - The type of items in the queue
 * @param queue - The queue to consume all cards from
 * @param maxIterations - Safety limit to prevent infinite loops (default: 1000)
 * @returns Array of all consumed cards
 * 
 * @example
 * ```typescript
 * const queue = createQueueWithCards([card1, card2, card3]);
 * const all = await consumeAllCards(queue);
 * // all = [card1, card2, card3]
 * ```
 */
export async function consumeAllCards<TItem>(
  queue: IQueue<TItem>,
  maxIterations: number = 1000
): Promise<TItem[]> {
  const results: TItem[] = [];
  let iterations = 0;
  
  while (iterations < maxIterations) {
    const card = await queue.next();
    if (card === null) {
      break;
    }
    results.push(card);
    iterations++;
  }
  
  if (iterations >= maxIterations) {
    throw new Error(`consumeAllCards exceeded maximum iterations (${maxIterations}). Possible infinite loop.`);
  }
  
  return results;
}

/**
 * Creates a mock queue with custom behavior for testing
 * 
 * @template TItem - The type of items in the queue
 * @param options - Configuration options for the mock queue
 * @returns A queue with the specified behavior
 * 
 * @example
 * ```typescript
 * // Queue that returns specific sequence then null
 * const queue = createMockQueue({
 *   nextSequence: [card1, card2, null, card3],
 *   allCards: [card1, card2, card3],
 * });
 * 
 * // Queue that throws an error
 * const errorQueue = createMockQueue({
 *   nextBehavior: async () => { throw new Error('Database error'); },
 * });
 * ```
 */
export function createMockQueue<TItem>(options: {
  nextSequence?: Array<TItem | null>;
  nextBehavior?: () => Promise<TItem | null>;
  allCards?: TItem[];
  getAllBehavior?: () => Promise<TItem[]>;
}): IQueue<TItem> {
  let sequenceIndex = 0;

  return {
    async next() {
      if (options.nextBehavior) {
        return options.nextBehavior();
      }
      if (options.nextSequence) {
        if (sequenceIndex >= options.nextSequence.length) {
          return null;
        }
        return options.nextSequence[sequenceIndex++];
      }
      return null;
    },
    async getAllCards() {
      if (options.getAllBehavior) {
        return options.getAllBehavior();
      }
      return options.allCards || [];
    },
  };
}

/**
 * Asserts that a queue is empty
 * 
 * @template TItem - The type of items in the queue
 * @param queue - The queue to check
 * @throws Error if the queue is not empty
 * 
 * @example
 * ```typescript
 * const queue = createEmptyQueue();
 * await assertQueueEmpty(queue); // passes
 * 
 * const nonEmptyQueue = createQueueWithCards([card1]);
 * await assertQueueEmpty(nonEmptyQueue); // throws error
 * ```
 */
export async function assertQueueEmpty<TItem>(queue: IQueue<TItem>): Promise<void> {
  const card = await queue.next();
  if (card !== null) {
    throw new Error(`Expected queue to be empty, but got card: ${JSON.stringify(card)}`);
  }
}

/**
 * Asserts that a queue has a specific number of cards
 * 
 * @template TItem - The type of items in the queue
 * @param queue - The queue to check
 * @param expectedCount - Expected number of cards
 * @throws Error if the queue doesn't have the expected count
 * 
 * @example
 * ```typescript
 * const queue = createQueueWithCards([card1, card2, card3]);
 * await assertQueueSize(queue, 3); // passes
 * await assertQueueSize(queue, 5); // throws error
 * ```
 */
export async function assertQueueSize<TItem>(
  queue: IQueue<TItem>,
  expectedCount: number
): Promise<void> {
  const cards = await queue.getAllCards();
  if (cards.length !== expectedCount) {
    throw new Error(
      `Expected queue to have ${expectedCount} cards, but got ${cards.length}`
    );
  }
}

/**
 * Creates a simple test item with minimal required fields
 * 
 * @param id - Unique identifier for the item
 * @param overrides - Additional fields to override defaults
 * @returns A test item with the specified properties
 * 
 * @example
 * ```typescript
 * const item1 = createTestItem('item-1');
 * const item2 = createTestItem('item-2', { priority: 5 });
 * ```
 */
export function createTestItem(
  id: string,
  overrides?: Record<string, any>
): any {
  return {
    id,
    blockID: `block-${id}`,
    cardID: `card-${id}`,
    ...overrides,
  };
}

/**
 * Creates multiple test items with sequential IDs
 * 
 * @param count - Number of items to create
 * @param prefix - Prefix for item IDs (default: 'item')
 * @param overrides - Additional fields to apply to all items
 * @returns Array of test items
 * 
 * @example
 * ```typescript
 * const items = createTestItems(3);
 * // [
 * //   { id: 'item-0', blockID: 'block-item-0', ... },
 * //   { id: 'item-1', blockID: 'block-item-1', ... },
 * //   { id: 'item-2', blockID: 'block-item-2', ... },
 * // ]
 * 
 * const cards = createTestItems(5, 'card', { deckID: 'deck-1' });
 * ```
 */
export function createTestItems(
  count: number,
  prefix: string = 'item',
  overrides?: Record<string, any>
): any[] {
  return Array.from({ length: count }, (_, i) =>
    createTestItem(`${prefix}-${i}`, overrides)
  );
}
