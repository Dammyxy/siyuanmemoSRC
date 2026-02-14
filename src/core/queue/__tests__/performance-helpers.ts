/**
 * Performance Test Helpers
 * 
 * Provides utility functions for performance testing of queue operations.
 * These helpers are used to generate test data and measure execution time.
 * 
 * Feature: architecture-optimization
 * Task: 10.1 - Create performance test helper functions
 * **Validates: Requirement 9.1**
 */

import type { QueueItem } from '../types';

/**
 * Generate test cards for performance testing
 * 
 * Creates an array of QueueItem objects with realistic data for testing.
 * Each card has unique IDs and randomized FSRS scheduling parameters.
 * 
 * @param count - Number of cards to generate
 * @returns Array of QueueItem objects
 * 
 * @example
 * ```typescript
 * // Generate 1000 test cards
 * const cards = generateCards(1000);
 * console.log(cards.length); // 1000
 * ```
 */
export function generateCards(count: number): QueueItem[] {
  const cards: QueueItem[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const cardID = `card-${i.toString().padStart(6, '0')}`;
    const blockID = `block-${i.toString().padStart(6, '0')}`;
    
    cards.push({
      cardID,
      blockID,
      deckID: 'test-deck',
      priority: Math.floor(Math.random() * 100), // Random priority 0-99
      state: Math.floor(Math.random() * 4), // Random state 0-3
      stability: Math.random() * 100, // Random stability 0-100
      difficulty: 1 + Math.random() * 9, // Random difficulty 1-10
      reps: Math.floor(Math.random() * 20), // Random reps 0-19
      lapses: Math.floor(Math.random() * 5), // Random lapses 0-4
      lastReview: now - Math.floor(Math.random() * 86400000 * 30), // Random last review within 30 days
      elapsedDays: Math.floor(Math.random() * 30), // Random elapsed days 0-29
      scheduledDays: Math.floor(Math.random() * 30), // Random scheduled days 0-29
    });
  }

  return cards;
}

/**
 * Measure execution time of an async function
 * 
 * Executes the provided function and returns the elapsed time in milliseconds.
 * Useful for benchmarking queue operations and ensuring performance requirements.
 * 
 * @param fn - Async function to measure
 * @returns Elapsed time in milliseconds
 * 
 * @example
 * ```typescript
 * // Measure time to process 1000 cards
 * const duration = await measureTime(async () => {
 *   for (let i = 0; i < 1000; i++) {
 *     await queue.next();
 *   }
 * });
 * 
 * console.log(`Processed 1000 cards in ${duration}ms`);
 * expect(duration).toBeLessThan(1000); // Should complete in under 1 second
 * ```
 */
export async function measureTime(fn: () => Promise<void>): Promise<number> {
  const startTime = performance.now();
  await fn();
  const endTime = performance.now();
  return endTime - startTime;
}
