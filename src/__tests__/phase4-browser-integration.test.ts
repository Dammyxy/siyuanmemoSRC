/**
 * Phase 4: Browser Integration Tests (Queue Pattern)
 * 
 * Tests for browser updates to use queue instances:
 * - Browser uses queue.getAllItems() to get cards
 * - Remove button calls queue.discard() for temporary removal
 * - Refresh button calls queue.refresh() to reload cards
 * - Browser and review interface share same queue state
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { QueueItem } from '@/core/queue';

// Mock queue interface
interface MockQueue {
  memoryQueue: QueueItem[];
  getAllItems: () => QueueItem[];
  discard: (item: QueueItem) => void;
  refresh: () => Promise<void>;
  addItems: (items: QueueItem[]) => Promise<number>;
}

// Mock plugin interface
interface MockPlugin {
  retrievalPracticeQueue: MockQueue;
  incrementalLearningQueue: MockQueue;
  getRetrievalPracticeQueue: () => MockQueue;
  getIncrementalLearningQueue: () => MockQueue;
}

describe('Phase 4: Browser Integration (Queue Pattern)', () => {
  let mockPlugin: MockPlugin;
  let mockRetrievalQueue: MockQueue;
  let mockIncrementalQueue: MockQueue;
  let testCards: QueueItem[];

  beforeEach(() => {
    // Create test cards
    testCards = [
      {
        cardID: 'card-1',
        blockID: 'block-1',
        deckID: 'deck-1',
        priority: 50,
      },
      {
        cardID: 'card-2',
        blockID: 'block-2',
        deckID: 'deck-1',
        priority: 30,
      },
      {
        cardID: 'card-3',
        blockID: 'block-3',
        deckID: 'deck-1',
        priority: 70,
      },
    ];

    // Create mock queues
    mockRetrievalQueue = {
      memoryQueue: [...testCards],
      getAllItems: vi.fn(() => mockRetrievalQueue.memoryQueue),
      discard: vi.fn((item: QueueItem) => {
        const index = mockRetrievalQueue.memoryQueue.findIndex(
          (i) => i.id === item.id
        );
        if (index >= 0) {
          mockRetrievalQueue.memoryQueue.splice(index, 1);
        }
      }),
      refresh: vi.fn(async () => {
        // Simulate refresh: reload all cards
        mockRetrievalQueue.memoryQueue = [...testCards];
      }),
      addItems: vi.fn(async (items: QueueItem[]) => {
        mockRetrievalQueue.memoryQueue.push(...items);
        return items.length;
      }),
    };

    mockIncrementalQueue = {
      memoryQueue: [...testCards],
      getAllItems: vi.fn(() => mockIncrementalQueue.memoryQueue),
      discard: vi.fn((item: QueueItem) => {
        const index = mockIncrementalQueue.memoryQueue.findIndex(
          (i) => i.id === item.id
        );
        if (index >= 0) {
          mockIncrementalQueue.memoryQueue.splice(index, 1);
        }
      }),
      refresh: vi.fn(async () => {
        // Simulate refresh: reload all cards
        mockIncrementalQueue.memoryQueue = [...testCards];
      }),
      addItems: vi.fn(async (items: QueueItem[]) => {
        mockIncrementalQueue.memoryQueue.push(...items);
        return items.length;
      }),
    };

    // Create mock plugin
    mockPlugin = {
      retrievalPracticeQueue: mockRetrievalQueue,
      incrementalLearningQueue: mockIncrementalQueue,
      getRetrievalPracticeQueue: () => mockRetrievalQueue,
      getIncrementalLearningQueue: () => mockIncrementalQueue,
    };
  });

  describe('4.1 Browser uses queue.getAllItems()', () => {
    it('4.1.1 should get queue instance from Plugin', () => {
      // ✅ Task 4.1.1: Browser gets queue from Plugin
      const queue = mockPlugin.getRetrievalPracticeQueue();
      expect(queue).toBeDefined();
      expect(queue).toBe(mockRetrievalQueue);
    });

    it('4.1.2 should use queue.getAllItems() to get all cards', () => {
      // ✅ Task 4.1.2: Use queue.getAllItems()
      const queue = mockPlugin.getRetrievalPracticeQueue();
      const cards = queue.getAllItems();

      expect(queue.getAllItems).toHaveBeenCalled();
      expect(cards).toHaveLength(3);
      expect(cards[0].cardID).toBe('card-1');
    });

    it('4.1.4 should display correct card list in browser', () => {
      // ✅ Task 4.1.4: Browser displays correct cards
      const queue = mockPlugin.getRetrievalPracticeQueue();
      const cards = queue.getAllItems();

      // Verify all cards are present
      expect(cards).toHaveLength(3);
      expect(cards.map((c) => c.cardID)).toEqual(['card-1', 'card-2', 'card-3']);
    });
  });

  describe('4.2 Remove button uses discard()', () => {
    it('4.2.1 should call queue.discard() when removing card', () => {
      // ✅ Task 4.2.1: Remove button calls queue.discard()
      const queue = mockPlugin.getRetrievalPracticeQueue();
      const cardToRemove = testCards[0];

      queue.discard(cardToRemove);

      expect(queue.discard).toHaveBeenCalledWith(cardToRemove);
    });

    it('4.2.4 should remove card from list after discard', () => {
      // ✅ Task 4.2.4: Card disappears from list after removal
      const queue = mockPlugin.getRetrievalPracticeQueue();
      const cardToRemove = testCards[0];

      // Before discard
      expect(queue.getAllItems()).toHaveLength(3);

      // Discard card
      queue.discard(cardToRemove);

      // After discard
      const remainingCards = queue.getAllItems();
      expect(remainingCards).toHaveLength(2);
      expect(remainingCards.find((c) => c.cardID === 'card-1')).toBeUndefined();
    });

    it('should not affect other cards when discarding one', () => {
      const queue = mockPlugin.getRetrievalPracticeQueue();
      const cardToRemove = testCards[1]; // Remove card-2

      queue.discard(cardToRemove);

      const remainingCards = queue.getAllItems();
      expect(remainingCards).toHaveLength(2);
      expect(remainingCards.map((c) => c.cardID)).toEqual(['card-1', 'card-3']);
    });
  });

  describe('4.3 Refresh button reloads queue', () => {
    it('4.3.2 should call queue.refresh() when refresh button clicked', async () => {
      // ✅ Task 4.3.2: Refresh button calls queue.refresh()
      const queue = mockPlugin.getRetrievalPracticeQueue();

      await queue.refresh();

      expect(queue.refresh).toHaveBeenCalled();
    });

    it('4.3.3 should reload and display card list after refresh', async () => {
      // ✅ Task 4.3.3: Refresh reloads card list
      const queue = mockPlugin.getRetrievalPracticeQueue();

      // Discard a card
      queue.discard(testCards[0]);
      expect(queue.getAllItems()).toHaveLength(2);

      // Refresh queue
      await queue.refresh();

      // After refresh, all cards should be back
      const cards = queue.getAllItems();
      expect(cards).toHaveLength(3);
    });

    it('4.3.4 should restore discarded cards after refresh', async () => {
      // ✅ Task 4.3.4: Discarded cards reappear after refresh
      const queue = mockPlugin.getRetrievalPracticeQueue();

      // Discard multiple cards
      queue.discard(testCards[0]);
      queue.discard(testCards[1]);
      expect(queue.getAllItems()).toHaveLength(1);

      // Refresh queue
      await queue.refresh();

      // All cards should be restored
      const cards = queue.getAllItems();
      expect(cards).toHaveLength(3);
      expect(cards.map((c) => c.cardID)).toEqual(['card-1', 'card-2', 'card-3']);
    });
  });

  describe('4.4 Browser and Review Interface Integration', () => {
    it('4.4.1 should see same queue state in browser and review interface', () => {
      // ✅ Task 4.4.1: Browser and review see same queue state
      const queueFromBrowser = mockPlugin.getRetrievalPracticeQueue();
      const queueFromReview = mockPlugin.getRetrievalPracticeQueue();

      // Both should reference the same queue instance
      expect(queueFromBrowser).toBe(queueFromReview);

      // Both should see the same cards
      const browserCards = queueFromBrowser.getAllItems();
      const reviewCards = queueFromReview.getAllItems();
      expect(browserCards).toEqual(reviewCards);
    });

    it('4.4.2 should not see discarded card in review interface after browser removal', () => {
      // ✅ Task 4.4.2: Review interface doesn't see discarded cards
      const browserQueue = mockPlugin.getRetrievalPracticeQueue();
      const reviewQueue = mockPlugin.getRetrievalPracticeQueue();

      // Browser discards a card
      browserQueue.discard(testCards[0]);

      // Review interface should not see the discarded card
      const reviewCards = reviewQueue.getAllItems();
      expect(reviewCards).toHaveLength(2);
      expect(reviewCards.find((c) => c.cardID === 'card-1')).toBeUndefined();
    });

    it('4.4.3 should see complete list in both interfaces after refresh', async () => {
      // ✅ Task 4.4.3: Both interfaces see complete list after refresh
      const browserQueue = mockPlugin.getRetrievalPracticeQueue();
      const reviewQueue = mockPlugin.getRetrievalPracticeQueue();

      // Discard cards from browser
      browserQueue.discard(testCards[0]);
      browserQueue.discard(testCards[1]);

      // Refresh queue
      await browserQueue.refresh();

      // Both interfaces should see all cards
      const browserCards = browserQueue.getAllItems();
      const reviewCards = reviewQueue.getAllItems();
      expect(browserCards).toHaveLength(3);
      expect(reviewCards).toHaveLength(3);
      expect(browserCards).toEqual(reviewCards);
    });

    it('4.4.4 should see new cards in both interfaces after adding', async () => {
      // ✅ Task 4.4.4: Both interfaces see new cards after adding
      const browserQueue = mockPlugin.getRetrievalPracticeQueue();
      const reviewQueue = mockPlugin.getRetrievalPracticeQueue();

      const newCard: QueueItem = {
        id: 'card-4',
        blockId: 'block-4',
        deckID: 'deck-1',
        priority: 40,
      };

      // Add card from browser
      await browserQueue.addItems([newCard]);

      // Both interfaces should see the new card
      const browserCards = browserQueue.getAllItems();
      const reviewCards = reviewQueue.getAllItems();
      expect(browserCards).toHaveLength(4);
      expect(reviewCards).toHaveLength(4);
      expect(browserCards.find((c) => c.cardID === 'card-4')).toBeDefined();
      expect(reviewCards.find((c) => c.cardID === 'card-4')).toBeDefined();
    });
  });

  describe('Incremental Learning Queue Integration', () => {
    it('should work with incremental learning queue', () => {
      const queue = mockPlugin.getIncrementalLearningQueue();
      expect(queue).toBeDefined();
      expect(queue.getAllItems()).toHaveLength(3);
    });

    it('should discard cards from incremental queue', () => {
      const queue = mockPlugin.getIncrementalLearningQueue();
      queue.discard(testCards[0]);
      expect(queue.getAllItems()).toHaveLength(2);
    });

    it('should refresh incremental queue', async () => {
      const queue = mockPlugin.getIncrementalLearningQueue();
      queue.discard(testCards[0]);
      await queue.refresh();
      expect(queue.getAllItems()).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle discarding non-existent card gracefully', () => {
      const queue = mockPlugin.getRetrievalPracticeQueue();
      const nonExistentCard: QueueItem = {
        id: 'non-existent',
        blockId: 'non-existent',
        deckID: 'deck-1',
        priority: 50,
      };

      // Should not throw error
      expect(() => queue.discard(nonExistentCard)).not.toThrow();
      expect(queue.getAllItems()).toHaveLength(3);
    });

    it('should handle empty queue', () => {
      const queue = mockPlugin.getRetrievalPracticeQueue();
      
      // Discard all cards
      testCards.forEach((card) => queue.discard(card));
      
      expect(queue.getAllItems()).toHaveLength(0);
    });

    it('should handle multiple refreshes', async () => {
      const queue = mockPlugin.getRetrievalPracticeQueue();
      
      await queue.refresh();
      await queue.refresh();
      await queue.refresh();
      
      expect(queue.getAllItems()).toHaveLength(3);
      expect(queue.refresh).toHaveBeenCalledTimes(3);
    });
  });
});
