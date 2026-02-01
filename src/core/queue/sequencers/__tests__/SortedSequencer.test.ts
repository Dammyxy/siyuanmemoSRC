/**
 * Tests for SortedSequencer
 * 
 * Verifies that the SM-15 style binary search insertion works correctly
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
    it('should return null when queue is empty', async () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
      });

      const item = await sequencer.next();
      expect(item).toBeNull();
    });

    it('should return items in sorted order', async () => {
      const items: TestItem[] = [
        { id: 'A', dueTime: 300 },
        { id: 'B', dueTime: 100 },
        { id: 'C', dueTime: 200 },
      ];

      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: items,
      });

      expect(await sequencer.next()).toEqual({ id: 'B', dueTime: 100 });
      expect(await sequencer.next()).toEqual({ id: 'C', dueTime: 200 });
      expect(await sequencer.next()).toEqual({ id: 'A', dueTime: 300 });
      expect(await sequencer.next()).toBeNull();
    });

    it('should handle single item', async () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [{ id: 'A', dueTime: 100 }],
      });

      expect(await sequencer.next()).toEqual({ id: 'A', dueTime: 100 });
      expect(await sequencer.next()).toBeNull();
    });
  });

  describe('Binary Search Insertion', () => {
    it('should insert item at the beginning', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'B', dueTime: 200 },
          { id: 'C', dueTime: 300 },
        ],
      });

      sequencer.insert({ id: 'A', dueTime: 100 });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });

    it('should insert item in the middle', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'C', dueTime: 300 },
        ],
      });

      sequencer.insert({ id: 'B', dueTime: 200 });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });

    it('should insert item at the end', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
        ],
      });

      sequencer.insert({ id: 'C', dueTime: 300 });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });

    it('should insert item with same dueTime after existing items', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
        ],
      });

      sequencer.insert({ id: 'B2', dueTime: 200 });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'B2']);
    });

    it('should handle multiple insertions', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
      });

      sequencer.insert({ id: 'C', dueTime: 300 });
      sequencer.insert({ id: 'A', dueTime: 100 });
      sequencer.insert({ id: 'D', dueTime: 400 });
      sequencer.insert({ id: 'B', dueTime: 200 });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('Priority Sorting', () => {
    it('should sort by priority when due times are equal', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority || 0,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 2 },
          { id: 'B', dueTime: 100, priority: 1 },
          { id: 'C', dueTime: 100, priority: 3 },
        ],
      });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['B', 'A', 'C']);
    });

    it('should insert with priority consideration', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority || 0,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'C', dueTime: 100, priority: 3 },
        ],
      });

      sequencer.insert({ id: 'B', dueTime: 100, priority: 2 });

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('SM-15 Style Workflow', () => {
    it('should simulate SM-15 answer workflow', async () => {
      // Initial queue with 3 cards
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'card-1', dueTime: 100 },
          { id: 'card-2', dueTime: 200 },
          { id: 'card-3', dueTime: 300 },
        ],
      });

      // Get first card
      const card1 = await sequencer.next();
      expect(card1?.id).toBe('card-1');

      // Simulate rating < 3: remove and re-insert with dueTime = now
      const now = Date.now();
      sequencer.insert({ id: 'card-1', dueTime: now });

      // Get next card (should be card-2, not card-1)
      const card2 = await sequencer.next();
      expect(card2?.id).toBe('card-2');

      // Get third card (should be card-3)
      const card3 = await sequencer.next();
      expect(card3?.id).toBe('card-3');

      // Get fourth card (should be card-1, the rotated one)
      const card4 = await sequencer.next();
      expect(card4?.id).toBe('card-1');
    });

    it('should handle multiple failed cards', async () => {
      const now = Date.now();
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'card-1', dueTime: now - 300 },
          { id: 'card-2', dueTime: now - 200 },
          { id: 'card-3', dueTime: now - 100 },
        ],
      });

      // Fail card-1
      const card1 = await sequencer.next();
      expect(card1?.id).toBe('card-1');
      sequencer.insert({ id: 'card-1', dueTime: now });

      // Fail card-2
      const card2 = await sequencer.next();
      expect(card2?.id).toBe('card-2');
      sequencer.insert({ id: 'card-2', dueTime: now + 1 });

      // Get card-3
      const card3 = await sequencer.next();
      expect(card3?.id).toBe('card-3');

      // Failed cards should reappear in order
      const card1Again = await sequencer.next();
      expect(card1Again?.id).toBe('card-1');

      const card2Again = await sequencer.next();
      expect(card2Again?.id).toBe('card-2');
    });
  });

  describe('Utility Methods', () => {
    it('should remove items', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
          { id: 'C', dueTime: 300 },
        ],
      });

      const removed = sequencer.remove(item => item.id === 'B');
      expect(removed).toBe(true);
      expect(sequencer.size()).toBe(2);

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'C']);
    });

    it('should return false when removing non-existent item', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [{ id: 'A', dueTime: 100 }],
      });

      const removed = sequencer.remove(item => item.id === 'B');
      expect(removed).toBe(false);
      expect(sequencer.size()).toBe(1);
    });

    it('should clear all items', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [
          { id: 'A', dueTime: 100 },
          { id: 'B', dueTime: 200 },
        ],
      });

      sequencer.clear();
      expect(sequencer.isEmpty()).toBe(true);
      expect(sequencer.size()).toBe(0);
    });

    it('should insert multiple items', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
      });

      sequencer.insertMany([
        { id: 'C', dueTime: 300 },
        { id: 'A', dueTime: 100 },
        { id: 'B', dueTime: 200 },
      ]);

      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty initial items', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: [],
      });

      expect(sequencer.isEmpty()).toBe(true);
    });

    it('should handle large number of items', () => {
      const items: TestItem[] = [];
      for (let i = 0; i < 1000; i++) {
        items.push({ id: `item-${i}`, dueTime: Math.random() * 10000 });
      }

      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        initialItems: items,
      });

      // Verify all items are sorted
      const all = sequencer.getAll();
      for (let i = 1; i < all.length; i++) {
        expect(all[i].dueTime).toBeGreaterThanOrEqual(all[i - 1].dueTime);
      }
    });

    it('should handle items with same dueTime and priority', () => {
      const sequencer = new SortedSequencer<TestItem>({
        getDueMs: (item) => item.dueTime,
        getPriority: (item) => item.priority || 0,
        initialItems: [
          { id: 'A', dueTime: 100, priority: 1 },
          { id: 'B', dueTime: 100, priority: 1 },
          { id: 'C', dueTime: 100, priority: 1 },
        ],
      });

      // All items have same dueTime and priority
      // Order should be maintained (A, B, C)
      const all = sequencer.getAll();
      expect(all.map(i => i.id)).toEqual(['A', 'B', 'C']);
    });
  });
});
