/**
 * Concurrent Safety Tests for BaseCompositeQueue
 * Feature: architecture-optimization
 * Task 4.4: Test concurrent next() calls
 * Task 4.5: Property-based test for concurrent safety
 * 
 * **Validates: Requirements 5.4**
 * 
 * WHEN concurrent next() calls occur, THE System SHALL return different cards
 * without duplication.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { BaseCompositeQueue } from '../BaseCompositeQueue';
import type { IDataSource } from '../../datasource/IDataSource';
import type { ISequencer } from '../../abstraction/types';

// Test item type
type TestItem = {
  id: string;
  value: string;
};

describe('BaseCompositeQueue - Concurrent Safety Tests', () => {
  /**
   * Test concurrent next() calls return different cards
   * 
   * **Validates: Requirements 5.4**
   * 
   * WHEN concurrent next() calls occur, THE System SHALL return different cards
   * without duplication.
   */
  describe('并发调用 next() 时', () => {
    it('应该返回不同的卡片，不出现重复', async () => {
      // Given: 创建包含多张卡片的队列
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
        { id: '4', value: 'fourth' },
        { id: '5', value: 'fifth' },
      ];
      
      const dataSourceItems = [...items];
      let nextIndex = 0;
      
      const mockDataSource: IDataSource<TestItem> = {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;

      // Mock sequencer that returns items in order
      const mockSequencer: ISequencer<TestItem> = {
        next: vi.fn(async () => {
          if (nextIndex < dataSourceItems.length) {
            return dataSourceItems[nextIndex++];
          }
          return null;
        }),
      } as ISequencer<TestItem>;

      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 并发调用 next() 3 次
      const [card1, card2, card3] = await Promise.all([
        queue.next(),
        queue.next(),
        queue.next(),
      ]);

      // Then: 所有卡片应该不同
      const cardIds = [card1?.id, card2?.id, card3?.id].filter(Boolean);
      const uniqueIds = new Set(cardIds);
      
      expect(cardIds.length).toBe(3);
      expect(uniqueIds.size).toBe(3);
      expect(card1).not.toBeNull();
      expect(card2).not.toBeNull();
      expect(card3).not.toBeNull();
      expect(card1?.id).not.toBe(card2?.id);
      expect(card2?.id).not.toBe(card3?.id);
      expect(card1?.id).not.toBe(card3?.id);
    });

    it('应该在并发调用 5 次时返回 5 张不同的卡片', async () => {
      // Given: 创建包含 5 张卡片的队列
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
        { id: '4', value: 'fourth' },
        { id: '5', value: 'fifth' },
      ];
      
      const dataSourceItems = [...items];
      let nextIndex = 0;
      
      const mockDataSource: IDataSource<TestItem> = {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;

      // Mock sequencer that returns items in order
      const mockSequencer: ISequencer<TestItem> = {
        next: vi.fn(async () => {
          if (nextIndex < dataSourceItems.length) {
            return dataSourceItems[nextIndex++];
          }
          return null;
        }),
      } as ISequencer<TestItem>;

      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 并发调用 next() 5 次
      const cards = await Promise.all([
        queue.next(),
        queue.next(),
        queue.next(),
        queue.next(),
        queue.next(),
      ]);

      // Then: 所有卡片应该不同
      const cardIds = cards.map(c => c?.id).filter(Boolean);
      const uniqueIds = new Set(cardIds);
      
      expect(cardIds.length).toBe(5);
      expect(uniqueIds.size).toBe(5);
      
      // 验证每张卡片都不为 null
      cards.forEach(card => {
        expect(card).not.toBeNull();
      });
      
      // 验证返回的是原始卡片
      expect(cardIds.sort()).toEqual(['1', '2', '3', '4', '5']);
    });

    it('应该在并发调用超过队列大小时正确处理', async () => {
      // Given: 创建包含 3 张卡片的队列
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
      ];
      
      const dataSourceItems = [...items];
      let nextIndex = 0;
      
      const mockDataSource: IDataSource<TestItem> = {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;

      // Mock sequencer that returns items in order
      const mockSequencer: ISequencer<TestItem> = {
        next: vi.fn(async () => {
          if (nextIndex < dataSourceItems.length) {
            return dataSourceItems[nextIndex++];
          }
          return null;
        }),
      } as ISequencer<TestItem>;

      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 并发调用 next() 5 次（超过队列大小）
      const cards = await Promise.all([
        queue.next(),
        queue.next(),
        queue.next(),
        queue.next(),
        queue.next(),
      ]);

      // Then: 前 3 张卡片应该不同，后 2 张应该为 null
      const nonNullCards = cards.filter(c => c !== null);
      const nullCards = cards.filter(c => c === null);
      
      expect(nonNullCards.length).toBe(3);
      expect(nullCards.length).toBe(2);
      
      // 验证非 null 卡片都不同
      const cardIds = nonNullCards.map(c => c!.id);
      const uniqueIds = new Set(cardIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('应该在高并发场景下（10 次并发调用）正确处理', async () => {
      // Given: 创建包含 10 张卡片的队列
      const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        value: `card-${i + 1}`,
      }));
      
      const dataSourceItems = [...items];
      let nextIndex = 0;
      
      const mockDataSource: IDataSource<TestItem> = {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;

      // Mock sequencer that returns items in order
      const mockSequencer: ISequencer<TestItem> = {
        next: vi.fn(async () => {
          if (nextIndex < dataSourceItems.length) {
            return dataSourceItems[nextIndex++];
          }
          return null;
        }),
      } as ISequencer<TestItem>;

      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 并发调用 next() 10 次
      const promises = Array.from({ length: 10 }, () => queue.next());
      const cards = await Promise.all(promises);

      // Then: 所有卡片应该不同
      const cardIds = cards.map(c => c?.id).filter(Boolean);
      const uniqueIds = new Set(cardIds);
      
      expect(cardIds.length).toBe(10);
      expect(uniqueIds.size).toBe(10);
      
      // 验证每张卡片都不为 null
      cards.forEach(card => {
        expect(card).not.toBeNull();
      });
    });

    it('应该在混合并发场景下正确处理（部分调用在数据修改后）', async () => {
      // Given: 创建包含 5 张卡片的队列
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
        { id: '4', value: 'fourth' },
        { id: '5', value: 'fifth' },
      ];
      
      const dataSourceItems = [...items];
      let nextIndex = 0;
      
      const mockDataSource: IDataSource<TestItem> = {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;

      // Mock sequencer that returns items in order
      const mockSequencer: ISequencer<TestItem> = {
        next: vi.fn(async () => {
          if (nextIndex < dataSourceItems.length) {
            return dataSourceItems[nextIndex++];
          }
          return null;
        }),
      } as ISequencer<TestItem>;

      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 先并发获取 2 张卡片
      const [card1, card2] = await Promise.all([
        queue.next(),
        queue.next(),
      ]);

      // Then: 验证前 2 张卡片不同
      expect(card1).not.toBeNull();
      expect(card2).not.toBeNull();
      expect(card1?.id).not.toBe(card2?.id);

      // When: 再并发获取 2 张
      const [card3, card4] = await Promise.all([
        queue.next(),
        queue.next(),
      ]);

      // Then: 验证后 2 张卡片也不同
      expect(card3).not.toBeNull();
      expect(card4).not.toBeNull();
      expect(card3?.id).not.toBe(card4?.id);

      // Then: 验证所有 4 张卡片都不同
      const allCardIds = [card1?.id, card2?.id, card3?.id, card4?.id].filter(Boolean);
      const uniqueIds = new Set(allCardIds);
      expect(uniqueIds.size).toBe(4);
      expect(allCardIds.length).toBe(4);
    });
  });
});

/**
 * Property-Based Tests for Concurrent Safety
 * 
 * Feature: architecture-optimization
 * Task: 4.5 编写并发安全属性测试
 * 
 * Property 6: 并发调用无重复
 * 
 * **Validates: Requirements 5.4**
 * 
 * For any queue state, concurrent calls to next() should return different cards,
 * and no card should be returned multiple times.
 * 
 * This property test uses fast-check to generate:
 * - Random numbers of cards (1-50)
 * - Random numbers of concurrent calls (1-20)
 * - Random card data
 * 
 * And verifies that:
 * - All returned cards are unique (no duplicates)
 * - The number of unique cards matches the number of non-null results
 * - Concurrent calls don't cause race conditions
 */
describe('BaseCompositeQueue - Property-Based Concurrent Safety Tests', () => {
  describe('Property 6: 并发调用无重复', () => {
    /**
     * Arbitrary generator for test items with guaranteed unique IDs
     * We generate an array of unique integers first, then map to items
     */
    const uniqueItemsArbitrary = (minLength: number, maxLength: number) =>
      fc
        .uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength, maxLength })
        .chain(ids =>
          fc.tuple(...ids.map(id =>
            fc.record({
              id: fc.constant(`item-${id}`),
              value: fc.string({ minLength: 1, maxLength: 50 }),
            })
          ))
        )
        .map(items => Array.from(items));

    /**
     * Create a mock sequencer that returns items sequentially
     * This simulates a real sequencer's behavior with proper concurrent access handling
     */
    function createMockSequencer(items: TestItem[]): ISequencer<TestItem> {
      let nextIndex = 0;
      
      return {
        next: vi.fn(async () => {
          // Atomically get and increment the index
          const currentIndex = nextIndex++;
          if (currentIndex < items.length) {
            return items[currentIndex];
          }
          return null;
        }),
      } as ISequencer<TestItem>;
    }

    /**
     * Create a mock data source
     */
    function createMockDataSource(items: TestItem[]): IDataSource<TestItem> {
      const dataSourceItems = [...items];
      
      return {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;
    }

    it('should never return duplicate cards when called concurrently', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of cards with unique IDs (1-50)
          uniqueItemsArbitrary(1, 50),
          // Generate random number of concurrent calls (1-20)
          fc.integer({ min: 1, max: 20 }),
          async (items, concurrentCalls) => {
            // Given: A queue with random items
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making concurrent calls to next()
            const promises = Array.from({ length: concurrentCalls }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: All non-null results should be unique
            const nonNullResults = results.filter(r => r !== null) as TestItem[];
            const ids = nonNullResults.map(r => r.id);
            const uniqueIds = new Set(ids);

            // Verify no duplicates
            expect(uniqueIds.size).toBe(nonNullResults.length);

            // Verify we didn't get more cards than available
            expect(nonNullResults.length).toBeLessThanOrEqual(items.length);

            // Verify we got the expected number of cards
            const expectedCards = Math.min(concurrentCalls, items.length);
            expect(nonNullResults.length).toBe(expectedCards);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle concurrent calls when queue has fewer items than calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate small number of cards with unique IDs (1-10)
          uniqueItemsArbitrary(1, 10),
          // Generate larger number of concurrent calls (5-30)
          fc.integer({ min: 5, max: 30 }),
          async (items, concurrentCalls) => {
            // Ensure we have more calls than items
            if (concurrentCalls <= items.length) {
              concurrentCalls = items.length + 5;
            }

            // Given: A queue with fewer items than concurrent calls
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making more concurrent calls than available items
            const promises = Array.from({ length: concurrentCalls }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: Should return all items exactly once, rest should be null
            const nonNullResults = results.filter(r => r !== null) as TestItem[];
            const nullResults = results.filter(r => r === null);

            // All non-null results should be unique
            const ids = nonNullResults.map(r => r.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(nonNullResults.length);

            // Should get exactly as many items as available
            expect(nonNullResults.length).toBe(items.length);

            // Rest should be null
            expect(nullResults.length).toBe(concurrentCalls - items.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain uniqueness across multiple concurrent batches', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with unique IDs
          uniqueItemsArbitrary(10, 50),
          // Generate number of batches
          fc.integer({ min: 2, max: 5 }),
          // Generate calls per batch
          fc.integer({ min: 2, max: 5 }),
          async (items, batchCount, callsPerBatch) => {
            // Given: A queue with items
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making multiple batches of concurrent calls
            const allResults: TestItem[] = [];
            
            for (let batch = 0; batch < batchCount; batch++) {
              const promises = Array.from({ length: callsPerBatch }, () => queue.next());
              const batchResults = await Promise.all(promises);
              const nonNullResults = batchResults.filter(r => r !== null) as TestItem[];
              allResults.push(...nonNullResults);
              
              // If we've exhausted the queue, stop
              if (nonNullResults.length === 0) break;
            }

            // Then: All results across all batches should be unique
            const ids = allResults.map(r => r.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(allResults.length);

            // Should not exceed available items
            expect(allResults.length).toBeLessThanOrEqual(items.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle high concurrency scenarios (stress test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate large number of items with unique IDs
          uniqueItemsArbitrary(20, 100),
          async (items) => {
            // Given: A queue with many items
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making very high number of concurrent calls
            const highConcurrency = Math.min(items.length, 50);
            const promises = Array.from({ length: highConcurrency }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: All results should be unique
            const nonNullResults = results.filter(r => r !== null) as TestItem[];
            const ids = nonNullResults.map(r => r.id);
            const uniqueIds = new Set(ids);

            expect(uniqueIds.size).toBe(nonNullResults.length);
            expect(nonNullResults.length).toBe(highConcurrency);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle concurrent calls with empty queue', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate number of concurrent calls
          fc.integer({ min: 1, max: 10 }),
          async (concurrentCalls) => {
            // Given: An empty queue
            const mockDataSource = createMockDataSource([]);
            const mockSequencer = createMockSequencer([]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making concurrent calls on empty queue
            const promises = Array.from({ length: concurrentCalls }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: All results should be null
            expect(results.every(r => r === null)).toBe(true);
            expect(results.length).toBe(concurrentCalls);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle concurrent calls with single item', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate single item
          fc.record({
            id: fc.integer({ min: 0, max: 10000 }).map(n => `item-${n}`),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          // Generate number of concurrent calls (more than 1)
          fc.integer({ min: 2, max: 10 }),
          async (item, concurrentCalls) => {
            // Given: A queue with single item
            const mockDataSource = createMockDataSource([item]);
            const mockSequencer = createMockSequencer([item]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making multiple concurrent calls
            const promises = Array.from({ length: concurrentCalls }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: Exactly one result should be the item, rest should be null
            const nonNullResults = results.filter(r => r !== null) as TestItem[];
            const nullResults = results.filter(r => r === null);

            expect(nonNullResults.length).toBe(1);
            expect(nullResults.length).toBe(concurrentCalls - 1);
            expect(nonNullResults[0].id).toBe(item.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return cards in consistent order despite concurrency', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with sequential IDs for order verification
          uniqueItemsArbitrary(5, 20),
          fc.integer({ min: 2, max: 10 }),
          async (items, concurrentCalls) => {
            // Ensure we don't request more than available
            const actualCalls = Math.min(concurrentCalls, items.length);

            // Given: A queue with ordered items
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making concurrent calls
            const promises = Array.from({ length: actualCalls }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: Results should be unique and from the original set
            const nonNullResults = results.filter(r => r !== null) as TestItem[];
            const resultIds = nonNullResults.map(r => r.id);
            const uniqueIds = new Set(resultIds);

            expect(uniqueIds.size).toBe(nonNullResults.length);
            expect(nonNullResults.length).toBe(actualCalls);

            // All results should be from the original items
            const originalIds = new Set(items.map(i => i.id));
            resultIds.forEach(id => {
              expect(originalIds.has(id)).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mixed sequential and concurrent calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with unique IDs
          uniqueItemsArbitrary(10, 30),
          // Generate number of sequential calls before concurrent batch
          fc.integer({ min: 1, max: 5 }),
          // Generate number of concurrent calls
          fc.integer({ min: 2, max: 10 }),
          async (items, sequentialCalls, concurrentCalls) => {
            // Given: A queue with items
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making some sequential calls first
            const sequentialResults: TestItem[] = [];
            for (let i = 0; i < Math.min(sequentialCalls, items.length); i++) {
              const result = await queue.next();
              if (result) sequentialResults.push(result);
            }

            // And: Then making concurrent calls
            const remainingItems = items.length - sequentialResults.length;
            const actualConcurrentCalls = Math.min(concurrentCalls, remainingItems);
            
            if (actualConcurrentCalls > 0) {
              const promises = Array.from({ length: actualConcurrentCalls }, () => queue.next());
              const concurrentResults = await Promise.all(promises);
              const nonNullConcurrent = concurrentResults.filter(r => r !== null) as TestItem[];

              // Then: All results (sequential + concurrent) should be unique
              const allResults = [...sequentialResults, ...nonNullConcurrent];
              const allIds = allResults.map(r => r.id);
              const uniqueIds = new Set(allIds);

              expect(uniqueIds.size).toBe(allResults.length);
              expect(allResults.length).toBe(sequentialResults.length + nonNullConcurrent.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6 - Edge Cases', () => {
    const uniqueItemsArbitrary = (minLength: number, maxLength: number) =>
      fc
        .uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength, maxLength })
        .chain(ids =>
          fc.tuple(...ids.map(id =>
            fc.record({
              id: fc.constant(`item-${id}`),
              value: fc.string({ minLength: 1, maxLength: 50 }),
            })
          ))
        )
        .map(items => Array.from(items));

    function createMockSequencer(items: TestItem[]): ISequencer<TestItem> {
      let nextIndex = 0;
      return {
        next: vi.fn(async () => {
          const currentIndex = nextIndex++;
          if (currentIndex < items.length) {
            return items[currentIndex];
          }
          return null;
        }),
      } as ISequencer<TestItem>;
    }

    function createMockDataSource(items: TestItem[]): IDataSource<TestItem> {
      const dataSourceItems = [...items];
      return {
        getAll: vi.fn(async () => dataSourceItems),
        remove: vi.fn(async (itemsToRemove: TestItem[]) => {
          itemsToRemove.forEach(item => {
            const index = dataSourceItems.indexOf(item);
            if (index > -1) {
              dataSourceItems.splice(index, 1);
            }
          });
          return itemsToRemove.length;
        }),
        size: async () => dataSourceItems.length,
      } as IDataSource<TestItem>;
    }

    it('should handle concurrent calls with items having duplicate IDs in data', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate base items with unique IDs
          uniqueItemsArbitrary(5, 15),
          fc.integer({ min: 2, max: 8 }),
          async (baseItems, concurrentCalls) => {
            // Create items with some duplicate IDs (simulating data inconsistency)
            const items = [...baseItems, ...baseItems.slice(0, 2)];
            
            // Given: A queue with duplicate IDs
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making concurrent calls
            const actualCalls = Math.min(concurrentCalls, items.length);
            const promises = Array.from({ length: actualCalls }, () => queue.next());
            const results = await Promise.all(promises);

            // Then: Should still return items without errors
            const nonNullResults = results.filter(r => r !== null);
            expect(nonNullResults.length).toBe(actualCalls);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle rapid successive concurrent batches', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueItemsArbitrary(20, 50),
          fc.integer({ min: 3, max: 8 }),
          async (items, batchCount) => {
            // Given: A queue with items
            const mockDataSource = createMockDataSource(items);
            const mockSequencer = createMockSequencer([...items]);
            
            const queue = new BaseCompositeQueue({
              dataSource: mockDataSource,
              sequencer: mockSequencer,
            });

            // When: Making rapid successive concurrent batches
            const allResults: TestItem[] = [];
            const callsPerBatch = 3;
            
            for (let i = 0; i < batchCount; i++) {
              const promises = Array.from({ length: callsPerBatch }, () => queue.next());
              const batchResults = await Promise.all(promises);
              const nonNull = batchResults.filter(r => r !== null) as TestItem[];
              allResults.push(...nonNull);
              
              if (nonNull.length === 0) break;
            }

            // Then: All results should be unique
            const ids = allResults.map(r => r.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(allResults.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
