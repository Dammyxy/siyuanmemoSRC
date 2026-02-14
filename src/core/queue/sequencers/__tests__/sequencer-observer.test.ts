/**
 * Tests for Sequencer Observer Pattern Implementation
 * 
 * Verifies that PrioritySequencer and SortedSequencer correctly implement
 * IDataSourceObserver and invalidate their caches when notified of data changes.
 * 
 * Feature: architecture-optimization
 * Task: 1.4 更新 Sequencer 实现观察者接口
 * Requirements: 1.2, 1.3
 */

import { describe, it, expect } from 'vitest';
import { PrioritySequencer } from '../PrioritySequencer';
import { SortedSequencer } from '../SortedSequencer';
import type { IDataSourceObserver } from '../../abstraction/types';

interface TestItem {
  id: string;
  dueTime: number;
  priority: number;
}

describe('Sequencer Observer Pattern Implementation', () => {
  describe('PrioritySequencer', () => {
    it('should implement IDataSourceObserver interface', () => {
      // Given: A PrioritySequencer instance
      const sequencer = new PrioritySequencer<TestItem>({
        fetchAll: async () => [],
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // Then: Should have onDataChanged method
      expect(sequencer.onDataChanged).toBeDefined();
      expect(typeof sequencer.onDataChanged).toBe('function');
      
      // And: Should be assignable to IDataSourceObserver
      const observer: IDataSourceObserver = sequencer;
      expect(observer).toBeDefined();
    });
    
    it('should invalidate cache when onDataChanged is called', async () => {
      // Given: A PrioritySequencer with some items
      let items: TestItem[] = [
        { id: 'A', dueTime: 100, priority: 1 },
        { id: 'B', dueTime: 200, priority: 2 },
      ];
      
      const sequencer = new PrioritySequencer<TestItem>({
        fetchAll: async () => items,
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // When: Loading data
      const item1 = await sequencer.next();
      expect(item1?.id).toBe('A');
      
      // And: Data source changes
      items = [
        { id: 'C', dueTime: 50, priority: 0 },
        { id: 'D', dueTime: 150, priority: 1 },
      ];
      
      // And: Notifying the sequencer
      sequencer.onDataChanged();
      
      // Then: Next call should reload data and return new items
      const item2 = await sequencer.next();
      expect(item2?.id).toBe('C'); // Should get the new first item
    });
    
    it('should clear items cache when onDataChanged is called', async () => {
      // Given: A PrioritySequencer with loaded items
      const sequencer = new PrioritySequencer<TestItem>({
        fetchAll: async () => [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'B', dueTime: 200, priority: 2 },
          { id: 'C', dueTime: 300, priority: 3 },
        ],
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // When: Loading and consuming one item
      const item1 = await sequencer.next();
      expect(item1?.id).toBe('A');
      
      // And: Calling onDataChanged
      sequencer.onDataChanged();
      
      // Then: Should reload all items (not continue from B)
      const item2 = await sequencer.next();
      expect(item2?.id).toBe('A'); // Should start from beginning again
    });
    
    it('should work with reset() method (backward compatibility)', async () => {
      // Given: A PrioritySequencer
      const sequencer = new PrioritySequencer<TestItem>({
        fetchAll: async () => [
          { id: 'A', dueTime: 100, priority: 1 },
        ],
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // When: Loading data
      await sequencer.next();
      
      // And: Calling reset() (old method)
      sequencer.reset();
      
      // Then: Should also invalidate cache
      const item = await sequencer.next();
      expect(item?.id).toBe('A');
    });
  });
  
  describe('SortedSequencer', () => {
    it('should implement IDataSourceObserver interface', () => {
      // Given: A SortedSequencer instance
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // Then: Should have onDataChanged method
      expect(sequencer.onDataChanged).toBeDefined();
      expect(typeof sequencer.onDataChanged).toBe('function');
      
      // And: Should be assignable to IDataSourceObserver
      const observer: IDataSourceObserver = sequencer;
      expect(observer).toBeDefined();
    });
    
    it('should clear items when onDataChanged is called', async () => {
      // Given: A SortedSequencer with items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'B', dueTime: 200, priority: 2 },
          { id: 'C', dueTime: 300, priority: 3 },
        ],
      });
      
      // When: Verifying items exist
      expect(sequencer.size()).toBe(3);
      
      // And: Calling onDataChanged
      sequencer.onDataChanged();
      
      // Then: Items should be cleared
      expect(sequencer.size()).toBe(0);
      expect(sequencer.isEmpty()).toBe(true);
    });
    
    it('should return null after cache invalidation', async () => {
      // Given: A SortedSequencer with items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
        ],
      });
      
      // When: Calling onDataChanged
      sequencer.onDataChanged();
      
      // Then: next() should return null (no items)
      const item = await sequencer.next();
      expect(item).toBeNull();
    });
    
    it('should allow repopulation after cache invalidation', async () => {
      // Given: A SortedSequencer with items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
        ],
      });
      
      // When: Invalidating cache
      sequencer.onDataChanged();
      
      // And: Inserting new items
      sequencer.insert({ id: 'B', dueTime: 50, priority: 0 });
      sequencer.insert({ id: 'C', dueTime: 150, priority: 2 });
      
      // Then: Should work with new items
      const item1 = await sequencer.next();
      expect(item1?.id).toBe('B');
      
      const item2 = await sequencer.next();
      expect(item2?.id).toBe('C');
    });
    
    it('should work with clear() method (backward compatibility)', () => {
      // Given: A SortedSequencer with items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'B', dueTime: 200, priority: 2 },
        ],
      });
      
      // When: Calling clear() (old method)
      sequencer.clear();
      
      // Then: Should also clear items
      expect(sequencer.isEmpty()).toBe(true);
    });
  });
  
  describe('Integration scenarios', () => {
    it('should handle multiple data change notifications', async () => {
      // Given: A PrioritySequencer
      let items: TestItem[] = [
        { id: 'A', dueTime: 100, priority: 1 },
      ];
      
      const sequencer = new PrioritySequencer<TestItem>({
        fetchAll: async () => items,
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // When: Loading initial data
      const item1 = await sequencer.next();
      expect(item1?.id).toBe('A');
      
      // And: Multiple data changes
      items = [{ id: 'B', dueTime: 200, priority: 2 }];
      sequencer.onDataChanged();
      
      items = [{ id: 'C', dueTime: 300, priority: 3 }];
      sequencer.onDataChanged();
      
      items = [{ id: 'D', dueTime: 400, priority: 4 }];
      sequencer.onDataChanged();
      
      // Then: Should reload with latest data
      const item2 = await sequencer.next();
      expect(item2?.id).toBe('D');
    });
    
    it('should handle onDataChanged during iteration', async () => {
      // Given: A PrioritySequencer with multiple items
      const sequencer = new PrioritySequencer<TestItem>({
        fetchAll: async () => [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'B', dueTime: 200, priority: 2 },
          { id: 'C', dueTime: 300, priority: 3 },
        ],
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority,
      });
      
      // When: Consuming first item
      const item1 = await sequencer.next();
      expect(item1?.id).toBe('A');
      
      // And: Data changes mid-iteration
      sequencer.onDataChanged();
      
      // Then: Should reload from beginning
      const item2 = await sequencer.next();
      expect(item2?.id).toBe('A'); // Starts over, not 'B'
    });
  });
});
