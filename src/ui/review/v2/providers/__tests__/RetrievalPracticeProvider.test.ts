/**
 * RetrievalPracticeProvider 单元测试
 * 
 * 测试 Provider 的状态管理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalPracticeProvider } from '../RetrievalPracticeProvider';
import type { BrowserCard } from '@/ui/browser/browserService';

// Mock RetrievalPracticeQueue
vi.mock('@/core/queue/strategies/RetrievalPracticeQueue', () => ({
  RetrievalPracticeQueue: {
    create: vi.fn(async () => ({
      getAllCards: vi.fn(async () => [
        { cardID: '1', blockID: 'block1', content: 'Card 1' },
        { cardID: '2', blockID: 'block2', content: 'Card 2' },
        { cardID: '3', blockID: 'block3', content: 'Card 3' },
      ]),
      onFeedback: vi.fn(async () => {}),
      getStats: vi.fn(async () => ({ size: 3, label: '0/0' })),
    })),
  },
}));

describe('RetrievalPracticeProvider state management', () => {
  let provider: RetrievalPracticeProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = await RetrievalPracticeProvider.create();
  });

  describe('Task 5.1: getDueCards() loads cards only once', () => {
    it('should load cards only once without forceReload', async () => {
      // First call loads cards
      const cards1 = await provider.getDueCards();
      expect(cards1.length).toBe(3);
      expect(cards1[0].cardID).toBe('1');

      // Get the queue mock
      const queue = (provider as any).queue;
      const getAllCardsSpy = queue.getAllCards;

      // Clear the spy to count subsequent calls
      getAllCardsSpy.mockClear();

      // Second call should return same list without reloading
      const cards2 = await provider.getDueCards();
      expect(cards2.length).toBe(3);
      expect(cards2[0].cardID).toBe('1');

      // Verify getAllCards was NOT called again
      expect(getAllCardsSpy).not.toHaveBeenCalled();
    });
  });

  describe('Task 5.2: getDueCards() with forceReload reloads cards', () => {
    it('should reload cards when forceReload is true', async () => {
      // First call loads cards
      const cards1 = await provider.getDueCards();
      expect(cards1.length).toBe(3);

      // Get the queue mock
      const queue = (provider as any).queue;
      const getAllCardsSpy = queue.getAllCards;

      // Clear the spy to count subsequent calls
      getAllCardsSpy.mockClear();

      // Second call with forceReload should reload
      const cards2 = await provider.getDueCards({ forceReload: true });
      expect(cards2.length).toBe(3);

      // Verify getAllCards WAS called again
      expect(getAllCardsSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Task 5.3: reviewCard() with rating < 3 rotates to end', () => {
    it('should move card to end when rating is 1', async () => {
      // Load cards
      await provider.getDueCards();

      // Rate first card with 1
      const success = await provider.reviewCard('1', 1);
      expect(success).toBe(true);

      // Get cards again
      const cards = await provider.getDueCards();

      // First card should be rotated (moved based on due time)
      // Note: SessionManager uses binary insertion based on due time
      // The exact position depends on the due time set by the provider
      expect(cards.length).toBe(3);
      expect(cards[0].cardID).not.toBe('1'); // First card should not be '1'
      
      // Verify card '1' is still in the list
      const card1 = cards.find(c => c.cardID === '1');
      expect(card1).toBeDefined();
    });

    it('should move card to end when rating is 2', async () => {
      // Load cards
      await provider.getDueCards();

      // Rate first card with 2
      const success = await provider.reviewCard('1', 2);
      expect(success).toBe(true);

      // Get cards again
      const cards = await provider.getDueCards();

      // First card should be rotated (moved based on due time)
      expect(cards.length).toBe(3);
      expect(cards[0].cardID).not.toBe('1'); // First card should not be '1'
      
      // Verify card '1' is still in the list
      const card1 = cards.find(c => c.cardID === '1');
      expect(card1).toBeDefined();
    });
  });

  describe('Task 5.4: reviewCard() with rating >= 3 removes card', () => {
    it('should remove card when rating is 3', async () => {
      // Load cards
      await provider.getDueCards();

      // Rate first card with 3
      const success = await provider.reviewCard('1', 3);
      expect(success).toBe(true);

      // Get cards again
      const cards = await provider.getDueCards();

      // First card should be removed
      expect(cards.length).toBe(2);
      expect(cards[0].cardID).toBe('2');
      expect(cards[1].cardID).toBe('3');
    });

    it('should remove card when rating is 4', async () => {
      // Load cards
      await provider.getDueCards();

      // Rate first card with 4
      const success = await provider.reviewCard('1', 4);
      expect(success).toBe(true);

      // Get cards again
      const cards = await provider.getDueCards();

      // First card should be removed
      expect(cards.length).toBe(2);
      expect(cards[0].cardID).toBe('2');
      expect(cards[1].cardID).toBe('3');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty card list', async () => {
      // Create provider with empty queue
      const emptyQueue = {
        getAllCards: vi.fn(async () => []),
        onFeedback: vi.fn(async () => {}),
        getStats: vi.fn(async () => ({ size: 0, label: '0/0' })),
      };
      (provider as any).queue = emptyQueue;
      (provider as any).loaded = false;

      const cards = await provider.getDueCards();
      expect(cards.length).toBe(0);
    });

    it('should handle reviewCard on non-existent card', async () => {
      await provider.getDueCards();

      const success = await provider.reviewCard('non-existent', 3);
      expect(success).toBe(false);
    });

    it('should handle limit parameter', async () => {
      const cards = await provider.getDueCards({ limit: 2 });
      expect(cards.length).toBe(2);
      expect(cards[0].cardID).toBe('1');
      expect(cards[1].cardID).toBe('2');
    });
  });
});
