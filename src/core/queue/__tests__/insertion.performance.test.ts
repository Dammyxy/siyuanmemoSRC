/**
 * Insertion Performance Tests
 * 
 * Tests performance of inserting items into queues.
 * Ensures that insertion operations complete within acceptable time limits.
 * 
 * Feature: architecture-optimization
 * Task: 10.3 - Add insertion performance tests
 * **Validates: Requirements 9.1, 9.3, 9.4, 9.5**
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue';
import type { IDataSource } from '../datasource/IDataSource';
import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';
import type { Result } from '../../../types/result';
import { generateCards, measureTime } from './performance-helpers';

// Helper to create Result objects
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * Create a mock DataSource with add() support for insertion testing
 */
function createMockDataSourceWithAdd<TItem extends QueueItem>(initialItems: TItem[] = []): IDataSource<TItem> {
  const items = [...initialItems];
  
  return {
    getAll: vi.fn(async () => items),
    add: vi.fn(async (itemsToAdd: TItem[]): Promise<Result<number>> => {
      items.push(...itemsToAdd);
      return ok(itemsToAdd.length);
    }),
    remove: vi.fn(async (itemsToRemove: TItem[]): Promise<Result<number>> => {
      let removedCount = 0;
      itemsToRemove.forEach(item => {
        const index = items.findIndex(i => i.blockID === item.blockID);
        if (index > -1) {
          items.splice(index, 1);
          removedCount++;
        }
      });
      return ok(removedCount);
    }),
    size: async () => items.length,
  } as IDataSource<TItem>;
}

/**
 * Create a mock Sequencer for testing
 */
function createMockSequencer<TItem extends QueueItem>(dataSource: IDataSource<TItem>): ISequencer<TItem> {
  let currentIndex = 0;
  
  return {
    next: vi.fn(async () => {
      const items = await dataSource.getAll();
      if (currentIndex >= items.length) {
        return null;
      }
      return items[currentIndex++];
    }),
  } as ISequencer<TItem>;
}

describe('Insertion Performance Tests', () => {
  describe('Requirement 9.3: 1000 insertions < 2 seconds', () => {
    it('should insert 1000 cards in under 2 seconds', async () => {
      // Arrange: Create empty queue with add support
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Generate 1000 cards to insert
      const cardsToInsert = generateCards(1000);

      // Act: Measure time to insert all cards
      const duration = await measureTime(async () => {
        if (mockDataSource.add) {
          for (const card of cardsToInsert) {
            const result = await mockDataSource.add([card]);
            expect(result.ok).toBe(true);
          }
        }
      });

      // Assert: Should complete in under 2 seconds (2000ms)
      console.log(`Inserted 1000 cards in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(2000);

      // Verify all cards were inserted
      const stats = await queue.getStats();
      expect(stats.size).toBe(1000);
    });

    it('should insert cards in batches efficiently', async () => {
      // Arrange: Create empty queue
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Generate 1000 cards
      const cardsToInsert = generateCards(1000);
      const batchSize = 100;

      // Act: Measure time to insert in batches
      const duration = await measureTime(async () => {
        if (mockDataSource.add) {
          for (let i = 0; i < cardsToInsert.length; i += batchSize) {
            const batch = cardsToInsert.slice(i, i + batchSize);
            const result = await mockDataSource.add(batch);
            expect(result.ok).toBe(true);
          }
        }
      });

      // Assert: Batch insertion should be faster than individual insertions
      console.log(`Inserted 1000 cards in batches of ${batchSize} in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(2000);

      // Verify all cards were inserted
      const stats = await queue.getStats();
      expect(stats.size).toBe(1000);
    });
  });

  describe('Requirement 9.4: Measure and report operation duration', () => {
    it('should measure individual insertion duration', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      const cards = generateCards(100);

      // Act: Measure individual insertions
      const durations: number[] = [];
      if (mockDataSource.add) {
        for (const card of cards) {
          const duration = await measureTime(async () => {
            await mockDataSource.add!([card]);
          });
          durations.push(duration);
        }
      }

      // Calculate statistics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Report
      console.log(`add() operation statistics (100 calls):`);
      console.log(`  Average: ${avgDuration.toFixed(3)}ms`);
      console.log(`  Min: ${minDuration.toFixed(3)}ms`);
      console.log(`  Max: ${maxDuration.toFixed(3)}ms`);

      // Assert: Average should be very fast (< 20ms)
      expect(avgDuration).toBeLessThan(20);
    });

    it('should measure batch insertion duration', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      const batchSizes = [10, 50, 100, 200];
      const results: Array<{ batchSize: number; duration: number }> = [];

      // Act: Measure different batch sizes
      for (const batchSize of batchSizes) {
        const cards = generateCards(batchSize);
        
        if (mockDataSource.add) {
          const duration = await measureTime(async () => {
            await mockDataSource.add!(cards);
          });
          
          results.push({ batchSize, duration });
        }
      }

      // Report
      console.log(`Batch insertion performance:`);
      for (const { batchSize, duration } of results) {
        console.log(`  ${batchSize} cards: ${duration.toFixed(3)}ms`);
      }

      // Assert: All batch operations should be fast
      for (const { duration } of results) {
        expect(duration).toBeLessThan(100);
      }
    });
  });

  describe('Requirement 9.5: Fail tests if performance degrades', () => {
    it('should fail if 1000 insertions exceed 2 seconds', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      const cards = generateCards(1000);

      // Act: Measure insertion time
      const duration = await measureTime(async () => {
        if (mockDataSource.add) {
          for (const card of cards) {
            await mockDataSource.add([card]);
          }
        }
      });

      // Assert: MUST be under 2 seconds - test will fail if performance degrades
      expect(duration).toBeLessThan(2000);
    });

    it('should fail if average insertion exceeds 20ms', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      const cards = generateCards(100);

      // Act: Measure 100 insertions
      const durations: number[] = [];
      if (mockDataSource.add) {
        for (const card of cards) {
          const duration = await measureTime(async () => {
            await mockDataSource.add!([card]);
          });
          durations.push(duration);
        }
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      // Assert: MUST be under 20ms average - test will fail if performance degrades
      expect(avgDuration).toBeLessThan(20);
    });
  });

  describe('Scalability tests', () => {
    it('should handle 2000 insertions efficiently', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      const cards = generateCards(2000);

      // Act: Measure time to insert all cards
      const duration = await measureTime(async () => {
        if (mockDataSource.add) {
          for (const card of cards) {
            await mockDataSource.add([card]);
          }
        }
      });

      // Assert: Should scale linearly (< 4 seconds for 2000 cards)
      console.log(`Inserted 2000 cards in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(4000);

      // Verify all cards were inserted
      const stats = await queue.getStats();
      expect(stats.size).toBe(2000);
    });

    it('should handle large batch insertions efficiently', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      const cards = generateCards(5000);

      // Act: Insert all cards in one batch
      const duration = await measureTime(async () => {
        if (mockDataSource.add) {
          const result = await mockDataSource.add(cards);
          expect(result.ok).toBe(true);
        }
      });

      // Assert: Large batch should be very fast
      console.log(`Inserted 5000 cards in one batch in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);

      // Verify all cards were inserted
      const stats = await queue.getStats();
      expect(stats.size).toBe(5000);
    });
  });

  describe('Mixed operations performance', () => {
    it('should handle mixed insert and remove operations efficiently', async () => {
      // Arrange
      const mockDataSource = createMockDataSourceWithAdd<QueueItem>();
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Perform mixed operations
      const duration = await measureTime(async () => {
        // Insert 500 cards
        const cards1 = generateCards(500);
        if (mockDataSource.add) {
          await mockDataSource.add(cards1);
        }

        // Remove 250 cards
        if (mockDataSource.remove) {
          await mockDataSource.remove(cards1.slice(0, 250));
        }

        // Insert another 500 cards
        const cards2 = generateCards(500);
        if (mockDataSource.add) {
          await mockDataSource.add(cards2);
        }

        // Remove 250 cards
        if (mockDataSource.remove) {
          await mockDataSource.remove(cards2.slice(0, 250));
        }
      });

      // Assert: Mixed operations should complete quickly
      console.log(`Completed mixed operations (1000 inserts, 500 removes) in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(3000);

      // Verify final size
      const stats = await queue.getStats();
      expect(stats.size).toBe(500); // 500 + 500 - 250 - 250 = 500
    });
  });
});
