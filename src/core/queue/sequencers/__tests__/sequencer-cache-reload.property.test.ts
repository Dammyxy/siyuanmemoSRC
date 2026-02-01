/**
 * Property-Based Tests for Sequencer Cache Reload
 * 
 * Feature: architecture-optimization
 * Task: 1.9 编写缓存重新加载属性测试
 * 
 * Property 3: 缓存失效后重新加载
 * 
 * **Validates: Requirements 1.3**
 * 
 * For any Sequencer with invalidated cache, when next() is called,
 * it should trigger fetchAll() to reload data.
 * 
 * This property test uses fast-check to generate:
 * - Random initial data sets
 * - Random data modifications after invalidation
 * - Random sequences of operations
 * 
 * And verifies that:
 * - fetchAll() is called after cache invalidation
 * - New data is loaded correctly
 * - Multiple invalidation-reload cycles work correctly
 * - Reload happens exactly once per invalidation
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { PrioritySequencer } from '../PrioritySequencer';

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

describe('Sequencer Cache Reload - Property-Based Tests', () => {
  describe('Property 3: 缓存失效后重新加载 (PrioritySequencer)', () => {
    it('should trigger fetchAll() when next() is called after cache invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 20 }),
          // Generate new items after invalidation
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 20 }),
          async (initialItems, newItems) => {
            // Given: A PrioritySequencer with initial data
            let currentItems = [...initialItems];
            let fetchCallCount = 0;
            
            const fetchAllSpy = vi.fn(async () => {
              fetchCallCount++;
              return [...currentItems];
            });

            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: fetchAllSpy,
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: First access to load cache
            await sequencer.next();
            expect(fetchCallCount).toBe(1);
            expect(fetchAllSpy).toHaveBeenCalledTimes(1);

            // And: Cache is invalidated
            currentItems = [...newItems];
            sequencer.onDataChanged();

            // Then: Next call to next() should trigger fetchAll() again
            await sequencer.next();
            expect(fetchCallCount).toBe(2);
            expect(fetchAllSpy).toHaveBeenCalledTimes(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should load new data after cache invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items with unique IDs
          fc.array(
            fc.record({
              id: fc.integer({ min: 0, max: 1000 }).map(n => `initial-${n}`),
              dueTime: fc.integer({ min: 0, max: 1000000 }),
              priority: fc.integer({ min: 0, max: 10 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          // Generate new items with different ID prefix
          fc.array(
            fc.record({
              id: fc.integer({ min: 0, max: 1000 }).map(n => `new-${n}`),
              dueTime: fc.integer({ min: 0, max: 1000000 }),
              priority: fc.integer({ min: 0, max: 10 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (initialItems, newItems) => {
            // Given: A PrioritySequencer with initial data
            let currentItems = [...initialItems];
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => [...currentItems],
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Loading initial data
            const firstItem = await sequencer.next();
            
            // Verify we got an initial item
            if (initialItems.length > 0) {
              expect(firstItem).not.toBeNull();
              expect(firstItem?.id).toMatch(/^initial-/);
            }

            // And: Data changes and cache is invalidated
            currentItems = [...newItems];
            sequencer.onDataChanged();

            // Then: Next item should be from new data
            const reloadedItem = await sequencer.next();
            
            if (newItems.length > 0) {
              expect(reloadedItem).not.toBeNull();
              expect(reloadedItem?.id).toMatch(/^new-/);
            } else {
              expect(reloadedItem).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reload data only once per invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items
          fc.array(testItemArbitrary, { minLength: 3, maxLength: 20 }),
          // Generate number of items to consume after reload
          fc.integer({ min: 1, max: 10 }),
          async (items, consumeCount) => {
            const actualConsumeCount = Math.min(consumeCount, items.length);
            
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

            // When: Initial load
            await sequencer.next();
            expect(fetchCallCount).toBe(1);

            // And: Cache is invalidated
            sequencer.onDataChanged();

            // And: Multiple next() calls after invalidation
            for (let i = 0; i < actualConsumeCount; i++) {
              await sequencer.next();
            }

            // Then: fetchAll() should be called exactly once more (not once per next() call)
            expect(fetchCallCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple invalidation-reload cycles', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          // Generate number of cycles
          fc.integer({ min: 1, max: 5 }),
          async (items, cycleCount) => {
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

            // When: Performing multiple invalidation-reload cycles
            for (let i = 0; i < cycleCount; i++) {
              // Invalidate cache
              sequencer.onDataChanged();
              
              // Trigger reload by calling next()
              await sequencer.next();
              
              // Verify fetchAll was called
              expect(fetchCallCount).toBe(i + 1);
            }

            // Then: fetchAll should be called exactly once per cycle
            expect(fetchCallCount).toBe(cycleCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reload even when previous data was empty', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate new items (non-empty)
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          async (newItems) => {
            // Given: A PrioritySequencer starting with empty data
            let currentItems: TestItem[] = [];
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...currentItems];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: First access with empty data
            const firstItem = await sequencer.next();
            expect(firstItem).toBeNull();
            expect(fetchCallCount).toBe(1);

            // And: Data becomes available and cache is invalidated
            currentItems = [...newItems];
            sequencer.onDataChanged();

            // Then: Should reload and get new data
            const reloadedItem = await sequencer.next();
            expect(reloadedItem).not.toBeNull();
            expect(fetchCallCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reload even when new data is empty', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial items (non-empty)
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          async (initialItems) => {
            // Given: A PrioritySequencer with initial data
            let currentItems = [...initialItems];
            let fetchCallCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                fetchCallCount++;
                return [...currentItems];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: First access with data
            const firstItem = await sequencer.next();
            expect(firstItem).not.toBeNull();
            expect(fetchCallCount).toBe(1);

            // And: Data becomes empty and cache is invalidated
            currentItems = [];
            sequencer.onDataChanged();

            // Then: Should reload and get null (empty data)
            const reloadedItem = await sequencer.next();
            expect(reloadedItem).toBeNull();
            expect(fetchCallCount).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reload with correct sorting after invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with different due times
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              dueTime: fc.integer({ min: 0, max: 1000000 }),
              priority: fc.integer({ min: 0, max: 10 }),
            }),
            { minLength: 3, maxLength: 20 }
          ),
          async (items) => {
            // Given: A PrioritySequencer
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => [...items],
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Loading and consuming one item
            const firstItem = await sequencer.next();
            expect(firstItem).not.toBeNull();

            // And: Cache is invalidated
            sequencer.onDataChanged();

            // Then: After reload, items should be sorted correctly
            const reloadedItems: TestItem[] = [];
            for (let i = 0; i < items.length; i++) {
              const item = await sequencer.next();
              if (item) reloadedItems.push(item);
            }

            // Helper function to get day key (same as PrioritySequencer)
            const dayKey = (ms: number): string => {
              const d = new Date(ms);
              if (!Number.isFinite(d.getTime())) return '';
              return d.toISOString().slice(0, 10);
            };

            // Verify items are sorted by due time (with day grouping) and priority as secondary
            for (let i = 1; i < reloadedItems.length; i++) {
              const prev = reloadedItems[i - 1];
              const curr = reloadedItems[i];
              
              const prevDue = prev.dueTime;
              const currDue = curr.dueTime;
              const prevDay = dayKey(prevDue);
              const currDay = dayKey(currDue);
              
              if (prevDay !== currDay) {
                // Different days: due times should be in ascending order
                expect(prevDue).toBeLessThanOrEqual(currDue);
              } else {
                // Same day: check priority first, then due time
                if (prev.priority !== curr.priority) {
                  expect(prev.priority).toBeLessThanOrEqual(curr.priority);
                } else {
                  // Same priority: due time should be in ascending order
                  expect(prevDue).toBeLessThanOrEqual(currDue);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not reload if next() is not called after invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          async (items) => {
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

            // When: Initial load
            await sequencer.next();
            expect(fetchCallCount).toBe(1);

            // And: Cache is invalidated but next() is not called
            sequencer.onDataChanged();

            // Then: fetchAll should not be called again (lazy loading)
            expect(fetchCallCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle invalidation during iteration and reload correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate items with unique IDs
          fc.array(
            fc.record({
              id: fc.integer({ min: 0, max: 1000 }).map(n => `item-${n}`),
              dueTime: fc.integer({ min: 0, max: 1000000 }),
              priority: fc.integer({ min: 0, max: 10 }),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          // Generate position where to invalidate
          fc.integer({ min: 1, max: 10 }),
          async (items, invalidateAfter) => {
            const actualInvalidateAfter = Math.min(invalidateAfter, items.length - 2);
            
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
            const consumedBeforeInvalidation: TestItem[] = [];
            for (let i = 0; i < actualInvalidateAfter; i++) {
              const item = await sequencer.next();
              if (item) consumedBeforeInvalidation.push(item);
            }
            expect(fetchCallCount).toBe(1);

            // And: Invalidating cache mid-iteration
            sequencer.onDataChanged();

            // Then: Next call should reload from beginning
            await sequencer.next();
            expect(fetchCallCount).toBe(2);

            // And: Should be able to consume all items again
            const consumedAfterReload: TestItem[] = [];
            for (let i = 0; i < items.length; i++) {
              const item = await sequencer.next();
              if (item) consumedAfterReload.push(item);
            }

            // Verify we got all items after reload (minus the one we already consumed)
            expect(consumedAfterReload.length).toBe(items.length - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle fetchAll returning different data on each call', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple data sets
          fc.array(
            fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
            { minLength: 2, maxLength: 5 }
          ),
          async (dataSets) => {
            // Given: A PrioritySequencer with changing data
            let dataSetIndex = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                const data = dataSets[dataSetIndex % dataSets.length];
                dataSetIndex++;
                return [...data];
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: Loading and invalidating multiple times
            for (let i = 0; i < dataSets.length; i++) {
              // Load data
              await sequencer.next();
              
              // Invalidate for next iteration
              if (i < dataSets.length - 1) {
                sequencer.onDataChanged();
              }
            }

            // Then: fetchAll should have been called once per iteration
            expect(dataSetIndex).toBe(dataSets.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3 - Edge Cases', () => {
    it('should handle fetchAll throwing error after invalidation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          async (items) => {
            // Given: A PrioritySequencer that will fail on second load
            let callCount = 0;
            
            const sequencer = new PrioritySequencer<TestItem>({
              fetchAll: async () => {
                callCount++;
                if (callCount === 1) {
                  return [...items];
                } else {
                  throw new Error('Fetch failed');
                }
              },
              getDueMs: (item) => item.dueTime,
              getPriority: (item) => item.priority,
            });

            // When: First load succeeds
            const firstItem = await sequencer.next();
            expect(firstItem).not.toBeNull();

            // And: Cache is invalidated
            sequencer.onDataChanged();

            // Then: Second load should throw error
            await expect(sequencer.next()).rejects.toThrow('Fetch failed');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle rapid invalidation and reload cycles', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(testItemArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 5, max: 20 }),
          async (items, cycleCount) => {
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

            // When: Rapid invalidation-reload cycles
            for (let i = 0; i < cycleCount; i++) {
              sequencer.onDataChanged();
              await sequencer.next();
            }

            // Then: Should handle all cycles correctly
            expect(fetchCallCount).toBe(cycleCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistency between reset() and onDataChanged() for reload behavior', async () => {
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
            
            // Both should have called fetchAll twice (initial + reload)
            expect(fetchCallCount1).toBe(2);
            expect(fetchCallCount2).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
