/**
 * Tests for ObservableDataSource Base Class
 * 
 * Verifies that the ObservableDataSource base class correctly implements
 * the observer pattern for automatic cache invalidation.
 * 
 * Feature: architecture-optimization
 * Task: 1.2 实现 ObservableDataSource 基类
 * Requirements: 1.1, 1.5
 */

import { describe, it, expect, vi } from 'vitest';
import { ObservableDataSource } from '../ObservableDataSource';
import type { IDataSourceObserver } from '../../abstraction/types';

/**
 * Concrete implementation of ObservableDataSource for testing
 */
class TestDataSource extends ObservableDataSource<string> {
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
 * Mock observer for testing
 */
class MockObserver implements IDataSourceObserver {
  public callCount = 0;
  public lastCallTime = 0;

  onDataChanged(): void {
    this.callCount++;
    this.lastCallTime = Date.now();
  }

  reset(): void {
    this.callCount = 0;
    this.lastCallTime = 0;
  }
}

describe('ObservableDataSource', () => {
  describe('Observer Registration', () => {
    it('should allow registering an observer', () => {
      // Given: A data source and an observer
      const dataSource = new TestDataSource();
      const observer = new MockObserver();

      // When: Registering the observer
      dataSource.addObserver(observer);

      // Then: Should not throw an error
      expect(observer).toBeDefined();
    });

    it('should not register the same observer twice', async () => {
      // Given: A data source and an observer
      const dataSource = new TestDataSource();
      const observer = new MockObserver();

      // When: Registering the same observer multiple times
      dataSource.addObserver(observer);
      dataSource.addObserver(observer);
      dataSource.addObserver(observer);

      // And: Triggering a notification
      await dataSource.add(['item1']);

      // Then: Observer should only be notified once
      expect(observer.callCount).toBe(1);
    });

    it('should allow registering multiple different observers', async () => {
      // Given: A data source and multiple observers
      const dataSource = new TestDataSource();
      const observer1 = new MockObserver();
      const observer2 = new MockObserver();
      const observer3 = new MockObserver();

      // When: Registering multiple observers
      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);
      dataSource.addObserver(observer3);

      // And: Triggering a notification
      await dataSource.add(['item1']);

      // Then: All observers should be notified
      expect(observer1.callCount).toBe(1);
      expect(observer2.callCount).toBe(1);
      expect(observer3.callCount).toBe(1);
    });
  });

  describe('Observer Removal', () => {
    it('should allow removing a registered observer', async () => {
      // Given: A data source with a registered observer
      const dataSource = new TestDataSource();
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Removing the observer
      dataSource.removeObserver(observer);

      // And: Triggering a notification
      await dataSource.add(['item1']);

      // Then: Observer should not be notified
      expect(observer.callCount).toBe(0);
    });

    it('should safely handle removing a non-registered observer', () => {
      // Given: A data source
      const dataSource = new TestDataSource();
      const observer = new MockObserver();

      // When: Removing an observer that was never registered
      // Then: Should not throw an error
      expect(() => dataSource.removeObserver(observer)).not.toThrow();
    });

    it('should only remove the specified observer', async () => {
      // Given: A data source with multiple observers
      const dataSource = new TestDataSource();
      const observer1 = new MockObserver();
      const observer2 = new MockObserver();
      const observer3 = new MockObserver();

      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);
      dataSource.addObserver(observer3);

      // When: Removing one observer
      dataSource.removeObserver(observer2);

      // And: Triggering a notification
      await dataSource.add(['item1']);

      // Then: Only the remaining observers should be notified
      expect(observer1.callCount).toBe(1);
      expect(observer2.callCount).toBe(0);
      expect(observer3.callCount).toBe(1);
    });

    it('should allow removing and re-adding the same observer', async () => {
      // Given: A data source with an observer
      const dataSource = new TestDataSource();
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Removing and re-adding the observer
      dataSource.removeObserver(observer);
      dataSource.addObserver(observer);

      // And: Triggering a notification
      await dataSource.add(['item1']);

      // Then: Observer should be notified
      expect(observer.callCount).toBe(1);
    });
  });

  describe('Observer Notification', () => {
    it('should notify observers when data is added', async () => {
      // Given: A data source with an observer
      const dataSource = new TestDataSource();
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Adding items
      await dataSource.add(['item1', 'item2']);

      // Then: Observer should be notified
      expect(observer.callCount).toBe(1);
    });

    it('should notify observers when data is removed', async () => {
      // Given: A data source with items and an observer
      const dataSource = new TestDataSource(['item1', 'item2', 'item3']);
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Removing items
      await dataSource.remove(['item1']);

      // Then: Observer should be notified
      expect(observer.callCount).toBe(1);
    });

    it('should not notify observers when no items are removed', async () => {
      // Given: A data source with items and an observer
      const dataSource = new TestDataSource(['item1', 'item2']);
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Attempting to remove non-existent items
      await dataSource.remove(['item3', 'item4']);

      // Then: Observer should not be notified
      expect(observer.callCount).toBe(0);
    });

    it('should notify all registered observers', async () => {
      // Given: A data source with multiple observers
      const dataSource = new TestDataSource();
      const observer1 = new MockObserver();
      const observer2 = new MockObserver();
      const observer3 = new MockObserver();

      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);
      dataSource.addObserver(observer3);

      // When: Modifying data
      await dataSource.add(['item1']);

      // Then: All observers should be notified
      expect(observer1.callCount).toBe(1);
      expect(observer2.callCount).toBe(1);
      expect(observer3.callCount).toBe(1);
    });

    it('should notify observers multiple times for multiple changes', async () => {
      // Given: A data source with an observer
      const dataSource = new TestDataSource(['item1']);
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Making multiple changes
      await dataSource.add(['item2']);
      await dataSource.add(['item3']);
      await dataSource.remove(['item1']);

      // Then: Observer should be notified for each change
      expect(observer.callCount).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should catch and log errors from failing observers', async () => {
      // Given: A data source with a failing observer
      const dataSource = new TestDataSource();
      const failingObserver: IDataSourceObserver = {
        onDataChanged: vi.fn(() => {
          throw new Error('Observer failed');
        })
      };
      const workingObserver = new MockObserver();

      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      dataSource.addObserver(failingObserver);
      dataSource.addObserver(workingObserver);

      // When: Triggering a notification
      await dataSource.add(['item1']);

      // Then: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      // And: Working observer should still be notified
      expect(workingObserver.callCount).toBe(1);

      // Cleanup
      consoleErrorSpy.mockRestore();
    });

    it('should continue notifying other observers after one fails', async () => {
      // Given: A data source with multiple observers, one of which fails
      const dataSource = new TestDataSource();
      const observer1 = new MockObserver();
      const failingObserver: IDataSourceObserver = {
        onDataChanged: vi.fn(() => {
          throw new Error('Observer 2 failed');
        })
      };
      const observer3 = new MockObserver();

      // Suppress console.error for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      dataSource.addObserver(observer1);
      dataSource.addObserver(failingObserver);
      dataSource.addObserver(observer3);

      // When: Triggering a notification
      await dataSource.add(['item1']);

      // Then: All observers should be called (even if one fails)
      expect(observer1.callCount).toBe(1);
      expect(failingObserver.onDataChanged).toHaveBeenCalled();
      expect(observer3.callCount).toBe(1);

      // Cleanup
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Data Operations', () => {
    it('should implement getAll() method', async () => {
      // Given: A data source with items
      const dataSource = new TestDataSource(['item1', 'item2', 'item3']);

      // When: Getting all items
      const items = await dataSource.getAll();

      // Then: Should return all items
      expect(items).toEqual(['item1', 'item2', 'item3']);
    });

    it('should implement add() method', async () => {
      // Given: An empty data source
      const dataSource = new TestDataSource();

      // When: Adding items
      const count = await dataSource.add(['item1', 'item2']);

      // Then: Should return the number of items added
      expect(count).toBe(2);

      // And: Items should be in the data source
      const items = await dataSource.getAll();
      expect(items).toEqual(['item1', 'item2']);
    });

    it('should implement remove() method', async () => {
      // Given: A data source with items
      const dataSource = new TestDataSource(['item1', 'item2', 'item3']);

      // When: Removing items
      const count = await dataSource.remove(['item1', 'item3']);

      // Then: Should return the number of items removed
      expect(count).toBe(2);

      // And: Items should be removed from the data source
      const items = await dataSource.getAll();
      expect(items).toEqual(['item2']);
    });
  });

  describe('Integration Scenarios', () => {
    it('should support typical sequencer cache invalidation pattern', async () => {
      // Given: A sequencer-like observer that caches data
      class SequencerObserver implements IDataSourceObserver {
        private loaded = false;
        private cache: string[] = [];

        constructor(private dataSource: TestDataSource) {}

        onDataChanged(): void {
          // Invalidate cache
          this.loaded = false;
          this.cache = [];
        }

        async next(): Promise<string | null> {
          if (!this.loaded) {
            this.loaded = true;
            this.cache = await this.dataSource.getAll();
          }
          return this.cache.shift() || null;
        }

        isLoaded(): boolean {
          return this.loaded;
        }
      }

      const dataSource = new TestDataSource(['item1', 'item2', 'item3']);
      const sequencer = new SequencerObserver(dataSource);
      dataSource.addObserver(sequencer);

      // When: Loading data
      const item1 = await sequencer.next();
      expect(item1).toBe('item1');
      expect(sequencer.isLoaded()).toBe(true);

      // When: Data source changes
      await dataSource.remove(['item1']);

      // Then: Sequencer cache should be invalidated
      expect(sequencer.isLoaded()).toBe(false);

      // When: Accessing sequencer again
      const item2 = await sequencer.next();

      // Then: Should reload and get updated data
      expect(item2).toBe('item2');
      expect(sequencer.isLoaded()).toBe(true);
    });

    it('should support multiple sequencers observing the same data source', async () => {
      // Given: Multiple sequencers observing the same data source
      const dataSource = new TestDataSource(['item1', 'item2', 'item3']);
      const observer1 = new MockObserver();
      const observer2 = new MockObserver();
      const observer3 = new MockObserver();

      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);
      dataSource.addObserver(observer3);

      // When: Data changes
      await dataSource.add(['item4']);

      // Then: All sequencers should be notified
      expect(observer1.callCount).toBe(1);
      expect(observer2.callCount).toBe(1);
      expect(observer3.callCount).toBe(1);

      // When: Data changes again
      await dataSource.remove(['item1']);

      // Then: All sequencers should be notified again
      expect(observer1.callCount).toBe(2);
      expect(observer2.callCount).toBe(2);
      expect(observer3.callCount).toBe(2);
    });

    it('should support cleanup when sequencer is destroyed', async () => {
      // Given: A data source with observers
      const dataSource = new TestDataSource();
      const observer1 = new MockObserver();
      const observer2 = new MockObserver();

      dataSource.addObserver(observer1);
      dataSource.addObserver(observer2);

      // When: One sequencer is destroyed (observer removed)
      dataSource.removeObserver(observer1);

      // And: Data changes
      await dataSource.add(['item1']);

      // Then: Only the remaining observer should be notified
      expect(observer1.callCount).toBe(0);
      expect(observer2.callCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty observer list', async () => {
      // Given: A data source with no observers
      const dataSource = new TestDataSource();

      // When: Modifying data
      // Then: Should not throw an error
      await expect(dataSource.add(['item1'])).resolves.toBe(1);
      await expect(dataSource.remove(['item1'])).resolves.toBe(1);
    });

    it('should handle rapid successive notifications', async () => {
      // Given: A data source with an observer
      const dataSource = new TestDataSource();
      const observer = new MockObserver();
      dataSource.addObserver(observer);

      // When: Making rapid successive changes
      await Promise.all([
        dataSource.add(['item1']),
        dataSource.add(['item2']),
        dataSource.add(['item3']),
        dataSource.add(['item4']),
        dataSource.add(['item5'])
      ]);

      // Then: Observer should be notified for each change
      expect(observer.callCount).toBe(5);
    });

    it('should handle observer that modifies the data source', async () => {
      // Given: An observer that modifies the data source
      const dataSource = new TestDataSource(['item1']);
      let recursionDepth = 0;
      const maxRecursion = 3;

      const recursiveObserver: IDataSourceObserver = {
        onDataChanged: vi.fn(async () => {
          recursionDepth++;
          if (recursionDepth < maxRecursion) {
            // This would normally cause infinite recursion
            // But we limit it for testing
            await dataSource.add([`item${recursionDepth + 1}`]);
          }
        })
      };

      dataSource.addObserver(recursiveObserver);

      // When: Triggering the first change
      await dataSource.add(['item2']);

      // Then: Should handle the recursive notifications
      expect(recursionDepth).toBe(maxRecursion);
    });
  });
});
