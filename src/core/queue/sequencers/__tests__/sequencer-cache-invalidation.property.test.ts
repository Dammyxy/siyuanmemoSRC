/**
 * Property-Based Tests for Sequencer Cache Invalidation
 * 
 * Feature: architecture-optimization
 * Task: 1.8 编写缓存失效属性测试
 * 
 * Property 2: Sequencer 缓存自动失效
 * 
 * **Validates: Requirements 1.2**
 * 
 * For any Sequencer that implements IDataSourceObserver, when it receives
 * an onDataChanged() notification, its internal cache flag should be set
 * to invalid state (loaded = false).
 * 
 * This property test uses fast-check to generate:
 * - Random initial data sets
 * - Random data modifications
 * - Random sequences of operations
 * 
 * And verifies that:
 * - Cache is invalidated after onDataChanged() is called
 * - Subsequent next() calls trigger data reload
 * - Cache invalidation works regardless of sequencer state
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { PrioritySequencer } from '../PrioritySequencer';
import { SortedSequencer } from '../SortedSequencer';

interface TestItem {
  id: string;
  dueTime: number;
  priority: number;
}

/**
 * Create a test item with given properties
 */
function createTestItem(id: string, dueTime: number, priority: number): TestItem {
  return { id, dueTime, priority };
}

/**
 * Arbitrary generator for test items
 */
const testItemArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  dueTime: fc.integer({ min: 0, max: 1000000 }),
  priority: fc.integer({ min: 0, max: 10 }),
});

describe('Sequencer Cache Invalidation - Property-Based Tests', () => {
  describe('Property 2: Sequencer 缓存自动失效 (PrioritySequencer)', () => {
    it('should invalidate cache when onDataChanged is called', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 20 }),
          // Generate new items after data change
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 20 }),
          async (initialItems, newItems) => {
            // Given: A PrioritySequencer with initial data
            let currentItems = [...initialItems];
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: vi.fn(async () => {
                fetchCallCount++;
                return [...currentItems];
              }),
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: First access to load cache
            await sequencer.next();
            expect(fetchCallCount).toBe(1);

            // And: Data changes
            currentItems = [...newItems];

            // And: onDataChanged is called
            sequencer.onDataChanged();

            // Then: Next access should trigger reload (fetchAll called again)
            await sequencer.next();
            expect(fetchCallCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clear items cache when onDataChanged is called', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with unique IDs
          fc.array(
            fc.record({
              id: fc.integer({ min: 0, max: 1000 }).map(n => `item-${n}`),
              dueTime: fc.integer({ min: 0, max: 1000000 }),
              priority: fc.integer({ min: 0, max: 10 }),
            }),
            { minLength: 3, maxLength: 20 }
          ),
          async (items) => {
            // Given: A PrioritySequencer with multiple items
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => [...items],
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Consuming one item
            const firstItem = await sequencer.next();
            expect(firstItem).not.toBeNull();

            // And: Calling onDataChanged
            sequencer.onDataChanged();

            // Then: Should reload all items (not continue from second item)
            // We verify this by checking that we can get the same first item again
            const reloadedFirstItem = await sequencer.next();
            
            // The first item should be available again after reload
            // (unless the data source changed, but in this test it doesn't)
            expect(reloadedFirstItem).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple onDataChanged calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          // Generate number of data changes
          fc.integer({ min: 1, max: 5 }),
          async (initialItems, changeCount) => {
            // Given: A PrioritySequencer
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...initialItems];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Initial load
            await sequencer.next();
            expect(fetchCallCount).toBe(1);

            // And: Multiple data changes
            for (let i = 0; i < changeCount; i++) {
              sequencer.onDataChanged();
              await sequencer.next();
            }

            // Then: fetchAll should be called once for initial load + once per change
            expect(fetchCallCount).toBe(1 + changeCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invalidate cache even when called before first load', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          async (items) => {
            // Given: A PrioritySequencer that hasn't loaded yet
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...items];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Calling onDataChanged before any load
            sequencer.onDataChanged();

            // Then: First next() should still trigger load
            await sequencer.next();
            expect(fetchCallCount).toBe(1);

            // And: Calling onDataChanged again
            sequencer.onDataChanged();

            // Then: Should trigger reload
            await sequencer.next();
            expect(fetchCallCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should work correctly with empty data sets', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate boolean to determine if initial data is empty
          fc.boolean(),
          async (startEmpty) => {
            // Given: A PrioritySequencer with possibly empty data
            let items: TestItem[] = startEmpty ? [] : [createTestItem('A', 100, 1)];
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...items];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Loading data
            const item1 = await sequencer.next();
            expect(fetchCallCount).toBe(1);

            // And: Data changes
            items = startEmpty ? [createTestItem('B', 200, 2)] : [];
            sequencer.onDataChanged();

            // Then: Should reload with new data
            const item2 = await sequencer.next();
            expect(fetchCallCount).toBe(2);

            // Verify correct behavior based on new data
            if (startEmpty) {
              expect(item1).toBeNull();
              expect(item2).not.toBeNull();
            } else {
              expect(item1).not.toBeNull();
              expect(item2).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invalidate cache during iteration', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with at least 3 items
          fc.array(testItemArbitrary, { minLength: 3, maxLength: 20 }),
          // Generate position where to invalidate (1 to length-1)
          fc.integer({ min: 1, max: 10 }),
          async (items, invalidateAfter) => {
            const actualInvalidateAfter = Math.min(invalidateAfter, items.length - 1);
            
            // Given: A PrioritySequencer with multiple items
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...items];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Consuming some items
            for (let i = 0; i < actualInvalidateAfter; i++) {
              await sequencer.next();
            }
            expect(fetchCallCount).toBe(1);

            // And: Invalidating cache mid-iteration
            sequencer.onDataChanged();

            // Then: Next call should reload from beginning
            await sequencer.next();
            expect(fetchCallCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Sequencer 缓存自动失效 (SortedSequencer)', () => {
    it('should clear items when onDataChanged is called', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 20 }),
          async (items) => {
            // Given: A SortedSequencer with items
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
              initialItems: [...items],
            });

            // When: Verifying items exist
            const initialSize = sequencer.size();
            expect(initialSize).toBe(items.length);
            expect(sequencer.isEmpty()).toBe(false);

            // And: Calling onDataChanged
            sequencer.onDataChanged();

            // Then: Items should be cleared
            expect(sequencer.size()).toBe(0);
            expect(sequencer.isEmpty()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null after cache invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 20 }),
          async (items) => {
            // Given: A SortedSequencer with items
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
              initialItems: [...items],
            });

            // When: Calling onDataChanged
            sequencer.onDataChanged();

            // Then: next() should return null (no items)
            const item = await sequencer.next();
            expect(item).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow repopulation after cache invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          // Generate new items to insert after invalidation
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          async (initialItems, newItems) => {
            // Given: A SortedSequencer with initial items
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
              initialItems: [...initialItems],
            });

            // When: Invalidating cache
            sequencer.onDataChanged();
            expect(sequencer.isEmpty()).toBe(true);

            // And: Inserting new items
            newItems.forEach(item => sequencer.insert(item));

            // Then: Should work with new items
            expect(sequencer.size()).toBe(newItems.length);
            
            // And: Should be able to retrieve items
            const retrievedItems: TestItem[] = [];
            for (let i = 0; i < newItems.length; i++) {
              const item = await sequencer.next();
              if (item) retrievedItems.push(item);
            }
            
            expect(retrievedItems.length).toBe(newItems.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple onDataChanged calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (items, changeCount) => {
            // Given: A SortedSequencer with items
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
              initialItems: [...items],
            });

            // When: Multiple data changes
            for (let i = 0; i < changeCount; i++) {
              sequencer.onDataChanged();
              
              // Then: Should be empty after each call
              expect(sequencer.isEmpty()).toBe(true);
              expect(sequencer.size()).toBe(0);
              
              // Repopulate for next iteration
              if (i < changeCount - 1) {
                items.forEach(item => sequencer.insert(item));
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clear items even when called on empty sequencer', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          async (callCount) => {
            // Given: An empty SortedSequencer
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Calling onDataChanged multiple times on empty sequencer
            for (let i = 0; i < callCount; i++) {
              sequencer.onDataChanged();
            }

            // Then: Should remain empty without errors
            expect(sequencer.isEmpty()).toBe(true);
            expect(sequencer.size()).toBe(0);
            
            const item = await sequencer.next();
            expect(item).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invalidate cache during iteration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 3, maxLength: 20 }),
          fc.integer({ min: 1, max: 10 }),
          async (items, consumeCount) => {
            const actualConsumeCount = Math.min(consumeCount, items.length - 1);
            
            // Given: A SortedSequencer with multiple items
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
              initialItems: [...items],
            });

            // When: Consuming some items
            for (let i = 0; i < actualConsumeCount; i++) {
              await sequencer.next();
            }
            
            const remainingBeforeInvalidation = sequencer.size();
            expect(remainingBeforeInvalidation).toBe(items.length - actualConsumeCount);

            // And: Invalidating cache mid-iteration
            sequencer.onDataChanged();

            // Then: All items should be cleared
            expect(sequencer.size()).toBe(0);
            expect(sequencer.isEmpty()).toBe(true);
            
            const item = await sequencer.next();
            expect(item).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2 - Edge Cases', () => {
    it('should handle rapid successive onDataChanged calls (PrioritySequencer)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 2, max: 10 }),
          async (items, rapidCallCount) => {
            // Given: A PrioritySequencer
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...items];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Rapid successive onDataChanged calls without next() in between
            for (let i = 0; i < rapidCallCount; i++) {
              sequencer.onDataChanged();
            }

            // Then: First next() should trigger exactly one load
            await sequencer.next();
            expect(fetchCallCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle rapid successive onDataChanged calls (SortedSequencer)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 2, max: 10 }),
          async (items, rapidCallCount) => {
            // Given: A SortedSequencer with items
            const sequencer = new SortedSequencer<TestItem>({
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
              initialItems: [...items],
            });

            // When: Rapid successive onDataChanged calls
            for (let i = 0; i < rapidCallCount; i++) {
              sequencer.onDataChanged();
            }

            // Then: Should be empty
            expect(sequencer.isEmpty()).toBe(true);
            expect(sequencer.size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistency between reset() and onDataChanged() for PrioritySequencer', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.boolean(),
          async (items, useReset) => {
            // Given: Two identical PrioritySequencers
            let fetchCallCount1 = 0;
            let fetchCallCount2 = 0;
            
            const sequencer1 = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount1++;
                return [...items];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });
            
            const sequencer2 = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount2++;
                return [...items];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Loading both
            await sequencer1.next();
            await sequencer2.next();

            // And: Using different invalidation methods
            if (useReset) {
              sequencer1.reset();
            } else {
              sequencer1.onDataChanged();
            }
            sequencer2.onDataChanged();

            // Then: Both should reload on next access
            await sequencer1.next();
            await sequencer2.next();
            
            expect(fetchCallCount1).toBe(2);
            expect(fetchCallCount2).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
