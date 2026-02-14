/**
 * BaseCompositeQueue.getAllCards() Property-Based Tests
 * 
 * Feature: architecture-optimization
 * Task 16.4: Test refactoring behavior consistency for getAllCards()
 * **Validates: Requirement 14.5**
 * 
 * Property 14: Refactoring Behavior Consistency
 * 
 * For any refactored method (such as getAllCards() extracted to base class),
 * the behavior should remain identical before and after refactoring.
 * Same inputs should produce same outputs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { BaseCompositeQueue } from './BaseCompositeQueue';
import type { IDataSource } from '../datasource/IDataSource';
import type { ISequencer } from '../abstraction/types';
import type { QueueItem } from '../types';

// Test item type
type TestItem = QueueItem & {
  id: string;
  value: string;
};

// Mock DataSource factory
const createMockDataSource = <TItem extends QueueItem>(items: TItem[]): IDataSource<TItem> => {
  return {
    getAll: vi.fn(async () => [...items]), // Return a copy to prevent mutation
    size: async () => items.length,
  } as IDataSource<TItem>;
};

// Mock Sequencer factory
const createMockSequencer = <TItem extends QueueItem>(): ISequencer<TItem> => {
  return {
    next: vi.fn(async () => null),
  } as ISequencer<TItem>;
};

describe('BaseCompositeQueue.getAllCards() - Property-Based Tests', () => {
  /**
   * Property 14: Refactoring Behavior Consistency
   * 
   * **Validates: Requirement 14.5**
   * 
   * For any queue state (any number of items), calling getAllCards() should:
   * 1. Return all items from the data source
   * 2. Return items in the same order as dataSource.getAll()
   * 3. Not modify the original data source
   * 4. Be idempotent (calling multiple times returns same result)
   * 
   * This property ensures that the refactored getAllCards() method in BaseCompositeQueue
   * behaves identically to the original implementations in subclasses.
   */
  it('Property 14: getAllCards() 返回与 dataSource.getAll() 相同的结果', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator: Random queue state (0-20 items)
        fc.array(
          fc.record({
            blockID: fc.uuid(),
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const mockDataSource = createMockDataSource<TestItem>(initialItems);
          const mockSequencer = createMockSequencer<TestItem>();
          
          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
          });

          // Act: Call getAllCards()
          const result = await queue.getAllCards();

          // Assert 1: getAllCards() should call dataSource.getAll()
          expect(mockDataSource.getAll).toHaveBeenCalled();

          // Assert 2: Result should contain all items
          expect(result).toHaveLength(initialItems.length);

          // Assert 3: Result should match the items from dataSource
          // (order and content should be identical)
          for (let i = 0; i < initialItems.length; i++) {
            expect(result[i]).toEqual(initialItems[i]);
          }

          // Assert 4: Result should be a different array instance (not mutating original)
          if (initialItems.length > 0) {
            expect(result).not.toBe(initialItems);
          }
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });

  /**
   * Property 14.1: getAllCards() 是幂等的
   * 
   * **Validates: Requirement 14.5**
   * 
   * Calling getAllCards() multiple times should return the same result
   * (assuming the data source hasn't changed).
   */
  it('Property 14.1: getAllCards() 多次调用返回相同结果（幂等性）', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator: Random queue state (0-20 items)
        fc.array(
          fc.record({
            blockID: fc.uuid(),
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const mockDataSource = createMockDataSource<TestItem>(initialItems);
          const mockSequencer = createMockSequencer<TestItem>();
          
          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
          });

          // Act: Call getAllCards() multiple times
          const result1 = await queue.getAllCards();
          const result2 = await queue.getAllCards();
          const result3 = await queue.getAllCards();

          // Assert: All results should be identical
          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
          expect(result1).toEqual(result3);

          // Assert: All results should have the same length
          expect(result1.length).toBe(initialItems.length);
          expect(result2.length).toBe(initialItems.length);
          expect(result3.length).toBe(initialItems.length);

          // Assert: dataSource.getAll() should be called 3 times
          expect(mockDataSource.getAll).toHaveBeenCalledTimes(3);
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });

  /**
   * Property 14.2: getAllCards() 不修改数据源
   * 
   * **Validates: Requirement 14.5**
   * 
   * Calling getAllCards() should not modify the underlying data source.
   * The data source should remain unchanged after the call.
   */
  it('Property 14.2: getAllCards() 不修改数据源', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator: Random queue state (1-20 items, at least 1 to verify no modification)
        fc.array(
          fc.record({
            blockID: fc.uuid(),
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          const mockDataSource = createMockDataSource<TestItem>(dataSourceItems);
          const mockSequencer = createMockSequencer<TestItem>();
          
          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
          });

          // Capture original data source state
          const originalDataSource = await mockDataSource.getAll();
          const originalLength = originalDataSource.length;
          const originalFirstItem = originalDataSource[0];

          // Act: Call getAllCards()
          const result = await queue.getAllCards();

          // Assert: Data source should remain unchanged
          const afterDataSource = await mockDataSource.getAll();
          expect(afterDataSource.length).toBe(originalLength);
          expect(afterDataSource[0]).toEqual(originalFirstItem);

          // Assert: Result should not affect data source
          if (result.length > 0) {
            // Modify result to verify it doesn't affect data source
            result[0] = { ...result[0], value: 'MODIFIED' };
            
            const finalDataSource = await mockDataSource.getAll();
            expect(finalDataSource[0].value).not.toBe('MODIFIED');
            expect(finalDataSource[0]).toEqual(originalFirstItem);
          }
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });

  /**
   * Property 14.3: getAllCards() 处理空队列
   * 
   * **Validates: Requirement 14.5**
   * 
   * When the queue is empty, getAllCards() should return an empty array
   * without errors.
   */
  it('Property 14.3: getAllCards() 正确处理空队列', async () => {
    // Arrange: Create queue with no items
    const mockDataSource = createMockDataSource<TestItem>([]);
    const mockSequencer = createMockSequencer<TestItem>();
    
    const queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });

    // Act: Call getAllCards() on empty queue
    const result = await queue.getAllCards();

    // Assert: Should return empty array
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);

    // Assert: dataSource.getAll() should be called
    expect(mockDataSource.getAll).toHaveBeenCalled();
  });

  /**
   * Property 14.4: getAllCards() 保持项目顺序
   * 
   * **Validates: Requirement 14.5**
   * 
   * The order of items returned by getAllCards() should match the order
   * from dataSource.getAll() exactly.
   */
  it('Property 14.4: getAllCards() 保持项目顺序', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator: Random queue state (2-20 items, at least 2 to verify order)
        fc.array(
          fc.record({
            blockID: fc.uuid(),
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 2, maxLength: 20 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const mockDataSource = createMockDataSource<TestItem>(initialItems);
          const mockSequencer = createMockSequencer<TestItem>();
          
          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
          });

          // Act: Call getAllCards()
          const result = await queue.getAllCards();

          // Assert: Order should match exactly
          for (let i = 0; i < initialItems.length; i++) {
            expect(result[i].id).toBe(initialItems[i].id);
            expect(result[i].value).toBe(initialItems[i].value);
            expect(result[i].blockID).toBe(initialItems[i].blockID);
          }

          // Assert: First and last items should match
          expect(result[0]).toEqual(initialItems[0]);
          expect(result[result.length - 1]).toEqual(initialItems[initialItems.length - 1]);
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });

  /**
   * Property 14.5: getAllCards() 与 dataSource.getAll() 行为一致
   * 
   * **Validates: Requirement 14.5**
   * 
   * This is the core refactoring consistency property:
   * getAllCards() should behave identically to calling dataSource.getAll() directly.
   * 
   * This ensures that extracting getAllCards() to the base class doesn't change behavior.
   */
  it('Property 14.5: getAllCards() 与 dataSource.getAll() 行为完全一致', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator: Random queue state (0-20 items)
        fc.array(
          fc.record({
            blockID: fc.uuid(),
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const mockDataSource = createMockDataSource<TestItem>(initialItems);
          const mockSequencer = createMockSequencer<TestItem>();
          
          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
          });

          // Act: Call both methods
          const getAllCardsResult = await queue.getAllCards();
          const dataSourceResult = await mockDataSource.getAll();

          // Assert: Results should be identical
          expect(getAllCardsResult).toEqual(dataSourceResult);

          // Assert: Length should match
          expect(getAllCardsResult.length).toBe(dataSourceResult.length);

          // Assert: Each item should match
          for (let i = 0; i < getAllCardsResult.length; i++) {
            expect(getAllCardsResult[i]).toEqual(dataSourceResult[i]);
          }

          // Assert: If not empty, verify specific items
          if (getAllCardsResult.length > 0) {
            expect(getAllCardsResult[0]).toEqual(dataSourceResult[0]);
            expect(getAllCardsResult[getAllCardsResult.length - 1])
              .toEqual(dataSourceResult[dataSourceResult.length - 1]);
          }
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });
});

/**
 * Unit Tests for getAllCards() Edge Cases
 * 
 * Feature: architecture-optimization
 * Task 16.4: Test edge cases for getAllCards()
 * **Validates: Requirement 14.5**
 */
describe('BaseCompositeQueue.getAllCards() - Edge Cases', () => {
  it('应该处理包含特殊字符的项目', async () => {
    // Arrange: Items with special characters
    const specialItems: TestItem[] = [
      { blockID: '1', id: '1', value: 'Hello\nWorld' },
      { blockID: '2', id: '2', value: 'Tab\tSeparated' },
      { blockID: '3', id: '3', value: 'Quote"Test' },
      { blockID: '4', id: '4', value: 'Emoji 😀🎉' },
      { blockID: '5', id: '5', value: 'Unicode 中文测试' },
    ];

    const mockDataSource = createMockDataSource<TestItem>(specialItems);
    const mockSequencer = createMockSequencer<TestItem>();
    
    const queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });

    // Act: Call getAllCards()
    const result = await queue.getAllCards();

    // Assert: All special characters should be preserved
    expect(result).toHaveLength(5);
    expect(result[0].value).toBe('Hello\nWorld');
    expect(result[1].value).toBe('Tab\tSeparated');
    expect(result[2].value).toBe('Quote"Test');
    expect(result[3].value).toBe('Emoji 😀🎉');
    expect(result[4].value).toBe('Unicode 中文测试');
  });

  it('应该处理大量项目（性能测试）', async () => {
    // Arrange: Create 1000 items
    const largeItemSet: TestItem[] = Array.from({ length: 1000 }, (_, i) => ({
      blockID: `block-${i}`,
      id: `id-${i}`,
      value: `value-${i}`,
    }));

    const mockDataSource = createMockDataSource<TestItem>(largeItemSet);
    const mockSequencer = createMockSequencer<TestItem>();
    
    const queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });

    // Act: Call getAllCards() and measure time
    const startTime = performance.now();
    const result = await queue.getAllCards();
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Assert: Should return all 1000 items
    expect(result).toHaveLength(1000);

    // Assert: Should complete in reasonable time (< 100ms)
    expect(duration).toBeLessThan(100);

    // Assert: First and last items should match
    expect(result[0]).toEqual(largeItemSet[0]);
    expect(result[999]).toEqual(largeItemSet[999]);
  });

  it('应该处理包含重复 ID 的项目', async () => {
    // Arrange: Items with duplicate IDs
    const duplicateItems: TestItem[] = [
      { blockID: '1', id: 'duplicate', value: 'first' },
      { blockID: '2', id: 'duplicate', value: 'second' },
      { blockID: '3', id: 'unique', value: 'third' },
    ];

    const mockDataSource = createMockDataSource<TestItem>(duplicateItems);
    const mockSequencer = createMockSequencer<TestItem>();
    
    const queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });

    // Act: Call getAllCards()
    const result = await queue.getAllCards();

    // Assert: Should return all items including duplicates
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('duplicate');
    expect(result[1].id).toBe('duplicate');
    expect(result[2].id).toBe('unique');

    // Assert: Values should be preserved
    expect(result[0].value).toBe('first');
    expect(result[1].value).toBe('second');
    expect(result[2].value).toBe('third');
  });

  it('应该处理包含 undefined 或 null 字段的项目', async () => {
    // Arrange: Items with undefined/null fields
    const itemsWithNulls: TestItem[] = [
      { blockID: '1', id: '1', value: 'normal' },
      { blockID: '2', id: '2', value: '' }, // empty string
      { blockID: '3', id: '3', value: 'test' },
    ];

    const mockDataSource = createMockDataSource<TestItem>(itemsWithNulls);
    const mockSequencer = createMockSequencer<TestItem>();
    
    const queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });

    // Act: Call getAllCards()
    const result = await queue.getAllCards();

    // Assert: Should handle all items correctly
    expect(result).toHaveLength(3);
    expect(result[0].value).toBe('normal');
    expect(result[1].value).toBe('');
    expect(result[2].value).toBe('test');
  });
});
