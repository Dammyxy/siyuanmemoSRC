/**
 * Property-Based Tests for Observer Pattern
 * 
 * Feature: architecture-optimization
 * Task: 1.7 编写观察者模式属性测试
 * 
 * Property 1: DataSource notifies all observers
 * 
 * **Validates: Requirements 1.1, 1.5**
 * 
 * For any ObservableDataSource and any number of registered observers,
 * when the DataSource's data changes, all registered observers should
 * receive onDataChanged() calls.
 * 
 * This property test uses fast-check to generate:
 * - Random numbers of observers (1-20)
 * - Random data modifications
 * 
 * And verifies that:
 * - All observers are notified exactly once per data change
 * - No observer is missed
 * - Notification order doesn't matter
 * - Observer failures don't prevent other observers from being notified
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { ObservableDataSource } from '../ObservableDataSource';
import type { IDataSourceObserver } from '../../abstraction/types';

/**
 * Test implementation of ObservableDataSource
 * Provides a simple in-memory data source for testing
 */
class TestObservableDataSource extends ObservableDataSource<string> {
  private items: string[] = [];

  constructor(initialItems: string[] = []) {
    super();
    this.items = [...initialItems];
  }

  async getAll(): Promise<string[]> {
    return [...this.items];
  }

  async add(items: string[]): Promise<number> {
    this.items.push(...items);
    this.notifyObservers();
    return items.length;
  }

  async remove(items: string[]): Promise<number> {
    const initialLength = this.items.length;
    this.items = this.items.filter(item => !items.includes(item));
    const removed = initialLength - this.items.length;
    if (removed > 0) {
      this.notifyObservers();
    }
    return removed;
  }

  // Expose for testing
  public triggerNotification(): void {
    this.notifyObservers();
  }
}

/**
 * Create a mock observer that tracks notifications
 */
function createMockObserver(): IDataSourceObserver & { callCount: number } {
  const observer = {
    callCount: 0,
    onDataChanged: vi.fn(() => {
      observer.callCount++;
    }),
  };
  return observer;
}

describe('ObservableDataSource - Property-Based Tests', () => {
  describe('Property 1: DataSource notifies all observers', () => {
    it('should notify all observers when data is added', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of observers (1-20)
          fc.integer({ min: 1, max: 20 }),
          // Generate random items to add
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          async (observerCount, itemsToAdd) => {
            // Given: A data source with N observers
            const dataSource = new TestObservableDataSource();
            const observers = Array.from({ length: observerCount }, () => createMockObserver());

            // Register all observers
            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Data is added
            await dataSource.add(itemsToAdd);

            // Then: All observers should be notified exactly once
            observers.forEach((observer, index) => {
              expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
              expect(observer.callCount).toBe(1);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should notify all observers when data is removed', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of observers (1-20)
          fc.integer({ min: 1, max: 20 }),
          // Generate initial items
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          async (observerCount, initialItems) => {
            // Given: A data source with items and N observers
            const dataSource = new TestObservableDataSource(initialItems);
            const observers = Array.from({ length: observerCount }, () => createMockObserver());

            // Register all observers
            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Data is removed (remove first item if exists)
            if (initialItems.length > 0) {
              await dataSource.remove([initialItems[0]]);

              // Then: All observers should be notified exactly once
              observers.forEach((observer, index) => {
                expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
                expect(observer.callCount).toBe(1);
              });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should notify all observers multiple times for multiple changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of observers (1-10)
          fc.integer({ min: 1, max: 10 }),
          // Generate random number of data changes (1-5)
          fc.integer({ min: 1, max: 5 }),
          async (observerCount, changeCount) => {
            // Given: A data source with N observers
            const dataSource = new TestObservableDataSource();
            const observers = Array.from({ length: observerCount }, () => createMockObserver());

            // Register all observers
            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Data changes M times
            for (let i = 0; i < changeCount; i++) {
              await dataSource.add([`item-${i}`]);
            }

            // Then: All observers should be notified M times
            observers.forEach((observer, index) => {
              expect(observer.onDataChanged).toHaveBeenCalledTimes(changeCount);
              expect(observer.callCount).toBe(changeCount);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not notify observers when no data is actually removed', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of observers (1-10)
          fc.integer({ min: 1, max: 10 }),
          // Generate initial items
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          // Generate items to remove that don't exist
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          async (observerCount, initialItems, itemsToRemove) => {
            // Ensure items to remove don't overlap with initial items
            const nonExistentItems = itemsToRemove.filter(
              item => !initialItems.includes(item)
            );

            if (nonExistentItems.length === 0) {
              return; // Skip this test case
            }

            // Given: A data source with items and observers
            const dataSource = new TestObservableDataSource(initialItems);
            const observers = Array.from({ length: observerCount }, () => createMockObserver());

            // Register all observers
            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Attempting to remove non-existent items
            await dataSource.remove(nonExistentItems);

            // Then: No observers should be notified (no actual change)
            observers.forEach((observer, index) => {
              expect(observer.onDataChanged).not.toHaveBeenCalled();
              expect(observer.callCount).toBe(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle observer failures gracefully without affecting other observers', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of observers (3-10)
          fc.integer({ min: 3, max: 10 }),
          // Generate random index for failing observer
          fc.integer({ min: 0, max: 9 }),
          async (observerCount, failingIndex) => {
            const actualFailingIndex = failingIndex % observerCount;

            // Given: A data source with N observers, one of which throws an error
            const dataSource = new TestObservableDataSource();
            const observers = Array.from({ length: observerCount }, (_, index) => {
              if (index === actualFailingIndex) {
                // This observer will throw an error
                return {
                  callCount: 0,
                  onDataChanged: vi.fn(() => {
                    throw new Error('Observer failed');
                  }),
                };
              } else {
                return createMockObserver();
              }
            });

            // Register all observers
            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Data changes
            await dataSource.add(['test-item']);

            // Then: All observers should still be called (including the failing one)
            observers.forEach((observer, index) => {
              expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
            });

            // And: Non-failing observers should have their callCount incremented
            observers.forEach((observer, index) => {
              if (index !== actualFailingIndex) {
                expect(observer.callCount).toBe(1);
              }
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not register the same observer twice', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of registration attempts (2-10)
          fc.integer({ min: 2, max: 10 }),
          async (registrationAttempts) => {
            // Given: A data source and a single observer
            const dataSource = new TestObservableDataSource();
            const observer = createMockObserver();

            // When: Attempting to register the same observer multiple times
            for (let i = 0; i < registrationAttempts; i++) {
              dataSource.addObserver(observer);
            }

            // And: Data changes
            await dataSource.add(['test-item']);

            // Then: Observer should only be notified once (not N times)
            expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
            expect(observer.callCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not notify removed observers', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random number of observers (2-10)
          fc.integer({ min: 2, max: 10 }),
          // Generate random index to remove
          fc.integer({ min: 0, max: 9 }),
          async (observerCount, removeIndex) => {
            const actualRemoveIndex = removeIndex % observerCount;

            // Given: A data source with N observers
            const dataSource = new TestObservableDataSource();
            const observers = Array.from({ length: observerCount }, () => createMockObserver());

            // Register all observers
            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Removing one observer
            dataSource.removeObserver(observers[actualRemoveIndex]);

            // And: Data changes
            await dataSource.add(['test-item']);

            // Then: Removed observer should not be notified
            expect(observers[actualRemoveIndex].onDataChanged).not.toHaveBeenCalled();
            expect(observers[actualRemoveIndex].callCount).toBe(0);

            // And: Other observers should be notified
            observers.forEach((observer, index) => {
              if (index !== actualRemoveIndex) {
                expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
                expect(observer.callCount).toBe(1);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle adding and removing observers dynamically', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random sequence of add/remove operations
          fc.array(
            fc.record({
              action: fc.constantFrom('add' as const, 'remove' as const),
              observerId: fc.integer({ min: 0, max: 4 }), // 5 possible observers
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (operations) => {
            // Given: A data source and a pool of observers
            const dataSource = new TestObservableDataSource();
            const observerPool = Array.from({ length: 5 }, () => createMockObserver());
            const activeObservers = new Set<number>();

            // When: Performing a sequence of add/remove operations
            operations.forEach(({ action, observerId }) => {
              if (action === 'add') {
                dataSource.addObserver(observerPool[observerId]);
                activeObservers.add(observerId);
              } else {
                dataSource.removeObserver(observerPool[observerId]);
                activeObservers.delete(observerId);
              }
            });

            // And: Data changes
            await dataSource.add(['test-item']);

            // Then: Only currently active observers should be notified
            observerPool.forEach((observer, index) => {
              if (activeObservers.has(index)) {
                expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
                expect(observer.callCount).toBe(1);
              } else {
                expect(observer.onDataChanged).not.toHaveBeenCalled();
                expect(observer.callCount).toBe(0);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 1 - Edge Cases', () => {
    it('should handle zero observers gracefully', async () => {
      // Given: A data source with no observers
      const dataSource = new TestObservableDataSource();

      // When: Data changes
      // Then: Should not throw an error
      await expect(dataSource.add(['test-item'])).resolves.toBe(1);
      await expect(dataSource.remove(['test-item'])).resolves.toBe(1);
    });

    it('should handle direct notification trigger', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (observerCount) => {
            // Given: A data source with observers
            const dataSource = new TestObservableDataSource();
            const observers = Array.from({ length: observerCount }, () => createMockObserver());

            observers.forEach(observer => dataSource.addObserver(observer));

            // When: Manually triggering notification
            dataSource.triggerNotification();

            // Then: All observers should be notified
            observers.forEach(observer => {
              expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
              expect(observer.callCount).toBe(1);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
