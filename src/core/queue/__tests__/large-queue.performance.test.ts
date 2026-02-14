/**
 * Large Queue Performance Tests
 * 
 * Tests performance of queue operations with large datasets (1000+ cards).
 * Ensures that queue operations complete within acceptable time limits.
 * 
 * Feature: architecture-optimization
 * Task: 10.2 - Add large queue performance tests
 * **Validates: Requirements 9.1, 9.2, 9.4, 9.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseCompositeQueue } from '../composite/BaseCompositeQueue';
import type { IDataSource } from '../datasource/IDataSource';
import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';
import type { Result } from '../../../types/result';
import { generateCards, measureTime } from './performance-helpers';

// Helper to create Result objects
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * Create a mock DataSource for performance testing
 * 
 * This DataSource stores items in memory and provides fast access.
 */
function createMockDataSource<TItem extends QueueItem>(initialItems: TItem[]): IDataSource<TItem> {
  const items = [...initialItems];
  
  return {
    getAll: vi.fn(async () => items),
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
 * Create a mock Sequencer for performance testing
 * 
 * This Sequencer returns items in order from the DataSource.
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

describe('Large Queue Performance Tests', () => {
  describe('Requirement 9.2: 1000 card operations < 1 second', () => {
    it('should process 1000 cards in under 1 second', async () => {
      // Arrange: Generate 1000 test cards
      const cards = generateCards(1000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure time to get all 1000 cards
      const duration = await measureTime(async () => {
        for (let i = 0; i < 1000; i++) {
          const card = await queue.next();
          expect(card).not.toBeNull();
        }
      });

      // Assert: Should complete in under 1 second (1000ms)
      console.log(`Processed 1000 cards in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000);
    });

    it('should get stats for 1000 cards quickly', async () => {
      // Arrange: Generate 1000 test cards
      const cards = generateCards(1000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure time to get stats
      const duration = await measureTime(async () => {
        const stats = await queue.getStats();
        expect(stats.size).toBe(1000);
      });

      // Assert: Should complete very quickly (< 100ms)
      console.log(`Got stats for 1000 cards in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Requirement 9.4: Measure and report operation duration', () => {
    it('should measure next() operation duration', async () => {
      // Arrange
      const cards = generateCards(1000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure individual next() calls
      const durations: number[] = [];
      for (let i = 0; i < 100; i++) {
        const duration = await measureTime(async () => {
          await queue.next();
        });
        durations.push(duration);
      }

      // Calculate statistics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Report
      console.log(`next() operation statistics (100 calls):`);
      console.log(`  Average: ${avgDuration.toFixed(3)}ms`);
      console.log(`  Min: ${minDuration.toFixed(3)}ms`);
      console.log(`  Max: ${maxDuration.toFixed(3)}ms`);

      // Assert: Average should be very fast (< 10ms)
      expect(avgDuration).toBeLessThan(10);
    });

    it('should measure getStats() operation duration', async () => {
      // Arrange
      const cards = generateCards(1000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure getStats() calls
      const durations: number[] = [];
      for (let i = 0; i < 100; i++) {
        const duration = await measureTime(async () => {
          await queue.getStats();
        });
        durations.push(duration);
      }

      // Calculate statistics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Report
      console.log(`getStats() operation statistics (100 calls):`);
      console.log(`  Average: ${avgDuration.toFixed(3)}ms`);
      console.log(`  Min: ${minDuration.toFixed(3)}ms`);
      console.log(`  Max: ${maxDuration.toFixed(3)}ms`);

      // Assert: Average should be very fast (< 5ms)
      expect(avgDuration).toBeLessThan(5);
    });
  });

  describe('Requirement 9.5: Fail tests if performance degrades', () => {
    it('should fail if 1000 card operations exceed 1 second', async () => {
      // Arrange: Generate 1000 test cards
      const cards = generateCards(1000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure time
      const duration = await measureTime(async () => {
        for (let i = 0; i < 1000; i++) {
          await queue.next();
        }
      });

      // Assert: MUST be under 1 second - test will fail if performance degrades
      expect(duration).toBeLessThan(1000);
    });

    it('should fail if average next() operation exceeds 10ms', async () => {
      // Arrange
      const cards = generateCards(1000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure 100 operations
      const durations: number[] = [];
      for (let i = 0; i < 100; i++) {
        const duration = await measureTime(async () => {
          await queue.next();
        });
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      // Assert: MUST be under 10ms average - test will fail if performance degrades
      expect(avgDuration).toBeLessThan(10);
    });
  });

  describe('Scalability tests', () => {
    it('should handle 2000 cards efficiently', async () => {
      // Arrange: Generate 2000 test cards
      const cards = generateCards(2000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure time to process all cards
      const duration = await measureTime(async () => {
        for (let i = 0; i < 2000; i++) {
          const card = await queue.next();
          expect(card).not.toBeNull();
        }
      });

      // Assert: Should scale linearly (< 2 seconds for 2000 cards)
      console.log(`Processed 2000 cards in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(2000);
    });

    it('should handle 5000 cards efficiently', async () => {
      // Arrange: Generate 5000 test cards
      const cards = generateCards(5000);
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer(mockDataSource);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // Act: Measure time to process all cards
      const duration = await measureTime(async () => {
        for (let i = 0; i < 5000; i++) {
          const card = await queue.next();
          expect(card).not.toBeNull();
        }
      });

      // Assert: Should scale linearly (< 5 seconds for 5000 cards)
      console.log(`Processed 5000 cards in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(5000);
    });
  });
});
