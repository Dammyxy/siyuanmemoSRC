/**
 * SortedSequencer Tests
 * 
 * Verifies that binary search insertion works correctly
 * and that items are returned in sorted order by due time.
 * 
 * Feature: architecture-optimization
 * Task: 17.4 - Refactor tests to BDD style with clear scenarios
 * 
 * Test Structure:
 * - Basic operations: empty queue, sorted order, single item
 * - Binary search insertion: beginning, middle, end, duplicates
 * - Priority sorting: when due times are equal
 * - Review workflow: simulating real answer workflows
 * - Utility methods: remove, clear, insertMany
 * - Edge cases: empty items, large datasets, same values
 */

import { describe, it, expect } from 'vitest';
import { SortedSequencer } from '../SortedSequencer';

interface TestItem {
  id: string;
  dueTime: number;
  priority?: number;
}

describe('SortedSequencer', () => {
  describe('Basic Operations', () => {
    it('should return null when the queue is empty', async () => {
      // Given: An empty sequencer
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
      });

      // When: We request the next item
      const item = await sequencer.next();

      // Then: It should return null
      expect(item).toBeNull();
    });

    it('should return items in sorted order by due time', async () => {
      // Given: A sequencer with three items in random order
      const items: TestItem[] = [
        { id: 'A', dueTime: 300 },
        { id: 'B', dueTime: 100 },
        { id: 'C', dueTime: 200 },
      ];

      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: items,
      });

      // When: We retrieve items one by one
      const first = await sequencer.next();
      const second = await sequencer.next();
      const third = await sequencer.next();
      const fourth = await sequencer.next();

      // Then: Items should be returned in ascending due time order
      expect(first).toEqual({ id: 'B', dueTime: 100 });
      expect(second).toEqual({ id: 'C', dueTime: 200 });
      expect(third).toEqual({ id: 'A', dueTime: 300 });
      expect(fourth).toBeNull();
    });

    it('should handle a single item correctly', async () => {
      // Given: A sequencer with one item
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [{ id: 'A', dueTime: 100 }],
      });

      // When: We retrieve items
      const first = await sequencer.next();
      const second = await sequencer.next();

      // Then: The first call should return the item, second should return null
      expect(first).toEqual({ id: 'A', dueTime: 100 });
      expect(second).toBeNull();
    });
  });

  describe('Binary Search Insertion', () => {
    it('should insert an item at the beginning when it has the earliest due time', () => {
      // Given: A sequencer with items B and C
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'B', dueTime: 200 },
          { id: 'C', dueTime: 300 },
        ],
      });

      // When: We insert item A with the earliest due time
      sequencer.insert({ id: 'A', dueTime: 100 });

      // Then: Item A should be at the beginning
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });

    it('should insert an item in the middle when it has a middle due time', () => {
      // Given: A sequencer with items A and C
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'C', dueTime: 300 },
        ],
      });

      // When: We insert item B with a middle due time
      sequencer.insert({ id: 'B', dueTime: 200 });

      // Then: Item B should be in the middle
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });

    it('should insert an item at the end when it has the latest due time', () => {
      // Given: A sequencer with items A and B
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
        ],
      });

      // When: We insert item C with the latest due time
      sequencer.insert({ id: 'C', dueTime: 300 });

      // Then: Item C should be at the end
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });

    it('should insert an item with the same due time after existing items', () => {
      // Given: A sequencer with items A and B
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
        ],
      });

      // When: We insert item B2 with the same due time as B
      sequencer.insert({ id: 'B2', dueTime: 200 });

      // Then: Item B2 should appear after B (stable sort)
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'B2']);
    });

    it('should handle multiple insertions correctly', () => {
      // Given: An empty sequencer
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
      });

      // When: We insert multiple items in random order
      sequencer.insert({ id: 'C', dueTime: 300 });
      sequencer.insert({ id: 'A', dueTime: 100 });
      sequencer.insert({ id: 'D', dueTime: 400 });
      sequencer.insert({ id: 'B', dueTime: 200 });

      // Then: All items should be in sorted order
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('Priority Sorting', () => {
    it('should sort by priority when due times are equal', () => {
      // Given: A sequencer with items having the same due time but different priorities
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority || 0,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 2 },
          { id: 'B', dueTime: 100, priority: 1 },
          { id: 'C', dueTime: 100, priority: 3 },
        ],
      });

      // When: We retrieve all items
      const all = sequencer.getAll();

      // Then: Items should be sorted by priority (ascending)
      expect(all.map(i => i.id)).toEqual(['B', 'A', 'C']);
    });

    it('should insert with priority consideration when due times are equal', () => {
      // Given: A sequencer with items A and C with same due time
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority || 0,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'C', dueTime: 100, priority: 3 },
        ],
      });

      // When: We insert item B with a middle priority
      sequencer.insert({ id: 'B', dueTime: 100, priority: 2 });

      // Then: Item B should be inserted between A and C
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Review Workflow', () => {
    it('should simulate failed-card rotation', async () => {
      // Given: A queue with 3 cards in order
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'card-1', dueTime: 100 },
          { id: 'card-2', dueTime: 200 },
          { id: 'card-3', dueTime: 300 },
        ],
      });

      // When: We get the first card
      const card1 = await sequencer.next();
      expect(card1?.id).toBe('card-1');

      // When: We simulate rating < 3 by re-inserting with dueTime = now
      const now = Date.now();
      sequencer.insert({ id: 'card-1', dueTime: now });

      // Then: The next card should be card-2, not card-1
      const card2 = await sequencer.next();
      expect(card2?.id).toBe('card-2');

      // Then: The third card should be card-3
      const card3 = await sequencer.next();
      expect(card3?.id).toBe('card-3');

      // Then: The fourth card should be card-1 (the rotated one)
      const card4 = await sequencer.next();
      expect(card4?.id).toBe('card-1');
    });

    it('should handle multiple failed cards correctly', async () => {
      // Given: A queue with 3 cards, all overdue
      const now = Date.now();
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'card-1', dueTime: now - 300 },
          { id: 'card-2', dueTime: now - 200 },
          { id: 'card-3', dueTime: now - 100 },
        ],
      });

      // When: We fail card-1 (rating < 3)
      const card1 = await sequencer.next();
      expect(card1?.id).toBe('card-1');
      sequencer.insert({ id: 'card-1', dueTime: now });

      // When: We fail card-2 (rating < 3)
      const card2 = await sequencer.next();
      expect(card2?.id).toBe('card-2');
      sequencer.insert({ id: 'card-2', dueTime: now + 1 });

      // Then: We should get card-3 next
      const card3 = await sequencer.next();
      expect(card3?.id).toBe('card-3');

      // Then: Failed cards should reappear in order
      const card1Again = await sequencer.next();
      expect(card1Again?.id).toBe('card-1');

      const card2Again = await sequencer.next();
      expect(card2Again?.id).toBe('card-2');
    });
  });

  describe('Utility Methods', () => {
    it('should remove items matching a predicate', () => {
      // Given: A sequencer with three items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
          { id: 'C', dueTime: 300 },
        ],
      });

      // When: We remove item B
      const removed = sequencer.remove(item => item.id === 'B');

      // Then: Item B should be removed
      expect(removed).toBe(true);
      expect(sequencer.size()).toBe(2);

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'C']);
    });

    it('should return false when removing a non-existent item', () => {
      // Given: A sequencer with one item
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [{ id: 'A', dueTime: 100 }],
      });

      // When: We try to remove a non-existent item
      const removed = sequencer.remove(item => item.id === 'B');

      // Then: Remove should return false and size should remain unchanged
      expect(removed).toBe(false);
      expect(sequencer.size()).toBe(1);
    });

    it('should clear all items from the sequencer', () => {
      // Given: A sequencer with two items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
        ],
      });

      // When: We clear the sequencer
      sequencer.clear();

      // Then: The sequencer should be empty
      expect(sequencer.isEmpty()).toBe(true);
      expect(sequencer.size()).toBe(0);
    });

    it('should insert multiple items at once', () => {
      // Given: An empty sequencer
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
      });

      // When: We insert multiple items in random order
      sequencer.insertMany([
        { id: 'C', dueTime: 300 },
        { id: 'A', dueTime: 100 },
        { id: 'B', dueTime: 200 },
      ]);

      // Then: All items should be in sorted order
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty initial items', () => {
      // Given: A sequencer with empty initial items
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [],
      });

      // Then: The sequencer should be empty
      expect(sequencer.isEmpty()).toBe(true);
    });

    it('should handle a large number of items efficiently', () => {
      // Given: 1000 items with random due times
      const items: TestItem[] = [];
      for (let i = 0; i < 1000; i++) {
        items.push({ id: `item-${i}`, dueTime: Math.random() * 10000 });
      }

      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: items,
      });

      // When: We retrieve all items
      const all = sequencer.getAll();

      // Then: All items should be sorted by due time
      for (let i = 1; i < all.length; i++) {
        expect(all[i].dueTime).toBeGreaterThanOrEqual(all[i - 1].dueTime);
      }
    });

    it('should handle items with the same due time and priority', () => {
      // Given: A sequencer with items having identical due time and priority
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority || 0,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'B', dueTime: 100, priority: 1 },
          { id: 'C', dueTime: 100, priority: 1 },
        ],
      });

      // When: We retrieve all items
      const all = sequencer.getAll();

      // Then: Order should be maintained (stable sort)
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });
  });
});
