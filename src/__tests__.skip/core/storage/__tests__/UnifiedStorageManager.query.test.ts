/**
 * UnifiedStorageManager Query Methods Tests
 * 
 * Tests for task 1.5: 实现 UnifiedStorageManager 的查询方法
 * Validates Requirements: 1.3, 6.3, 6.4, 11.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { FSRSCard, CardType } from '../../../types/card';
import type { IXiuyuan } from '../../xiuyuan/types';

describe('UnifiedStorageManager Query Methods', () => {
  let storage: UnifiedStorageManager;
  let mockSaveCallback: () => Promise<void>;
  let mockLoadCallback: () => Promise<any>;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
    
    // Mock persistence callbacks
    mockSaveCallback = async (data: any) => {};
    mockLoadCallback = async () => ({
      version: 1,
      xiuyuans: {},
      cards: {},
    });
    
    storage.setPersistenceCallbacks(mockSaveCallback, mockLoadCallback);
  });

  // Helper function to create a test XiuYuan
  const createTestXiuYuan = (id: string = 'xy_test_123'): IXiuyuan => ({
    id,
    blockIDs: ['block-1'],
    templateID: 'builtin-quick-card',
    fields: [
      { name: 'content', blockID: 'block-1' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Helper function to create a test Card
  const createTestCard = (
    id: string = 'card-1',
    xiuyuanID: string = 'xy_test_123',
    blockId: string = 'block-1',
    options: {
      due?: number;
      type?: CardType;
      state?: number;
    } = {}
  ): FSRSCard => ({
    id,
    blockId,
    due: options.due ?? Date.now() + 86400000, // 1 day from now
    stability: 1.0,
    difficulty: 5.0,
    reps: 0,
    lapses: 0,
    state: options.state ?? 0,
    lastReview: Date.now(),
    elapsedDays: 0,
    scheduledDays: 1,
    learning_step: 0,
    type: options.type ?? 'item',
    templateID: 'builtin-quick-card',
    schedulerType: 'fsrs-v6',
    priority: 50,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    meta: {
      xiuyuanID,
      templateID: 'builtin-quick-card',
      ruleIndex: 0,
      frontBlockIDs: [blockId],
      backBlockIDs: [],
      fieldMapping: { content: blockId },
      frontFields: ['content'],
      backFields: [],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  describe('getDueCards', () => {
    it('should return cards that are due now', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      // Create cards with different due dates
      const dueCard1 = createTestCard('card-1', xiuyuan.id, 'block-1', { due: now - 1000 });
      const dueCard2 = createTestCard('card-2', xiuyuan.id, 'block-2', { due: now - 500 });
      const futureCard = createTestCard('card-3', xiuyuan.id, 'block-3', { due: now + 86400000 });

      await storage.createCard(xiuyuan, dueCard1);
      await storage.createCard(xiuyuan, dueCard2);
      await storage.createCard(xiuyuan, futureCard);

      const dueCards = storage.getDueCards(10);

      expect(dueCards).toHaveLength(2);
      expect(dueCards.map(c => c.id)).toContain('card-1');
      expect(dueCards.map(c => c.id)).toContain('card-2');
      expect(dueCards.map(c => c.id)).not.toContain('card-3');
    });

    it('should return cards sorted by due date (ascending)', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      // Create cards with different due dates (not in order)
      const card1 = createTestCard('card-1', xiuyuan.id, 'block-1', { due: now - 3000 });
      const card2 = createTestCard('card-2', xiuyuan.id, 'block-2', { due: now - 1000 });
      const card3 = createTestCard('card-3', xiuyuan.id, 'block-3', { due: now - 2000 });

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);
      await storage.createCard(xiuyuan, card3);

      const dueCards = storage.getDueCards(10);

      expect(dueCards).toHaveLength(3);
      // Should be sorted by due date ascending
      expect(dueCards[0].id).toBe('card-1'); // due: now - 3000
      expect(dueCards[1].id).toBe('card-3'); // due: now - 2000
      expect(dueCards[2].id).toBe('card-2'); // due: now - 1000
    });

    it('should respect the limit parameter', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      // Create 5 due cards
      for (let i = 0; i < 5; i++) {
        const card = createTestCard(`card-${i}`, xiuyuan.id, `block-${i}`, { due: now - 1000 });
        await storage.createCard(xiuyuan, card);
      }

      const dueCards = storage.getDueCards(3);

      expect(dueCards).toHaveLength(3);
    });

    it('should exclude cards with state 4 (relearning)', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      const normalCard = createTestCard('card-1', xiuyuan.id, 'block-1', { due: now - 1000, state: 0 });
      const relearningCard = createTestCard('card-2', xiuyuan.id, 'block-2', { due: now - 1000, state: 4 });

      await storage.createCard(xiuyuan, normalCard);
      await storage.createCard(xiuyuan, relearningCard);

      const dueCards = storage.getDueCards(10);

      expect(dueCards).toHaveLength(1);
      expect(dueCards[0].id).toBe('card-1');
    });

    it('should return empty array when no cards are due', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      const futureCard = createTestCard('card-1', xiuyuan.id, 'block-1', { due: now + 86400000 });
      await storage.createCard(xiuyuan, futureCard);

      const dueCards = storage.getDueCards(10);

      expect(dueCards).toHaveLength(0);
    });
  });

  describe('getCardsByBlockId', () => {
    it('should return all cards associated with a blockId', async () => {
      const xiuyuan = createTestXiuYuan();
      
      const card1 = createTestCard('card-1', xiuyuan.id, 'block-1');
      const card2 = createTestCard('card-2', xiuyuan.id, 'block-1');
      const card3 = createTestCard('card-3', xiuyuan.id, 'block-2');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);
      await storage.createCard(xiuyuan, card3);

      const block1Cards = storage.getCardsByBlockId('block-1');
      const block2Cards = storage.getCardsByBlockId('block-2');

      expect(block1Cards).toHaveLength(2);
      expect(block1Cards.map(c => c.id)).toContain('card-1');
      expect(block1Cards.map(c => c.id)).toContain('card-2');
      
      expect(block2Cards).toHaveLength(1);
      expect(block2Cards[0].id).toBe('card-3');
    });

    it('should return empty array for non-existent blockId', () => {
      const cards = storage.getCardsByBlockId('non-existent');
      expect(cards).toHaveLength(0);
    });

    it('should support one-to-many relationship (multiple cards per block)', async () => {
      const xiuyuan = createTestXiuYuan();
      
      // Simulate bidirectional cards from the same block
      const forwardCard = createTestCard('card-forward', xiuyuan.id, 'block-1');
      const reverseCard = createTestCard('card-reverse', xiuyuan.id, 'block-1');

      await storage.createCard(xiuyuan, forwardCard);
      await storage.createCard(xiuyuan, reverseCard);

      const cards = storage.getCardsByBlockId('block-1');

      expect(cards).toHaveLength(2);
      expect(cards.map(c => c.id)).toContain('card-forward');
      expect(cards.map(c => c.id)).toContain('card-reverse');
    });
  });

  describe('getCardsByXiuyuanId', () => {
    it('should return all cards generated from a XiuYuan', async () => {
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');
      const card3 = createTestCard('card-3', 'xy_2', 'block-3');

      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan1, card2);
      await storage.createCard(xiuyuan2, card3);

      const xy1Cards = storage.getCardsByXiuyuanId('xy_1');
      const xy2Cards = storage.getCardsByXiuyuanId('xy_2');

      expect(xy1Cards).toHaveLength(2);
      expect(xy1Cards.map(c => c.id)).toContain('card-1');
      expect(xy1Cards.map(c => c.id)).toContain('card-2');
      
      expect(xy2Cards).toHaveLength(1);
      expect(xy2Cards[0].id).toBe('card-3');
    });

    it('should return empty array for non-existent xiuyuanId', () => {
      const cards = storage.getCardsByXiuyuanId('non-existent');
      expect(cards).toHaveLength(0);
    });

    it('should support bidirectional template (two cards from one XiuYuan)', async () => {
      const xiuyuan = createTestXiuYuan();
      
      // Simulate bidirectional template generating two cards
      const forwardCard = createTestCard('card-forward', xiuyuan.id, 'block-1');
      const reverseCard = createTestCard('card-reverse', xiuyuan.id, 'block-1');

      await storage.createCard(xiuyuan, forwardCard);
      await storage.createCard(xiuyuan, reverseCard);

      const cards = storage.getCardsByXiuyuanId(xiuyuan.id);

      expect(cards).toHaveLength(2);
      expect(cards.map(c => c.id)).toContain('card-forward');
      expect(cards.map(c => c.id)).toContain('card-reverse');
    });
  });

  describe('getCardsByType', () => {
    it('should return all cards of a specific type', async () => {
      const xiuyuan = createTestXiuYuan();
      
      const itemCard = createTestCard('card-1', xiuyuan.id, 'block-1', { type: 'item' });
      const conceptCard = createTestCard('card-2', xiuyuan.id, 'block-2', { type: 'concept' });
      const topicCard = createTestCard('card-3', xiuyuan.id, 'block-3', { type: 'topic' });

      await storage.createCard(xiuyuan, itemCard);
      await storage.createCard(xiuyuan, conceptCard);
      await storage.createCard(xiuyuan, topicCard);

      const itemCards = storage.getCardsByType('item');
      const conceptCards = storage.getCardsByType('concept');
      const topicCards = storage.getCardsByType('topic');

      expect(itemCards).toHaveLength(1);
      expect(itemCards[0].id).toBe('card-1');
      
      expect(conceptCards).toHaveLength(1);
      expect(conceptCards[0].id).toBe('card-2');
      
      expect(topicCards).toHaveLength(1);
      expect(topicCards[0].id).toBe('card-3');
    });

    it('should return empty array for type with no cards', () => {
      const cards = storage.getCardsByType('descriptor');
      expect(cards).toHaveLength(0);
    });
  });

  describe('getAllCards', () => {
    it('should return all cards in storage', async () => {
      const xiuyuan = createTestXiuYuan();
      
      const card1 = createTestCard('card-1', xiuyuan.id, 'block-1');
      const card2 = createTestCard('card-2', xiuyuan.id, 'block-2');
      const card3 = createTestCard('card-3', xiuyuan.id, 'block-3');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);
      await storage.createCard(xiuyuan, card3);

      const allCards = storage.getAllCards();

      expect(allCards).toHaveLength(3);
      expect(allCards.map(c => c.id)).toContain('card-1');
      expect(allCards.map(c => c.id)).toContain('card-2');
      expect(allCards.map(c => c.id)).toContain('card-3');
    });

    it('should return empty array when no cards exist', () => {
      const allCards = storage.getAllCards();
      expect(allCards).toHaveLength(0);
    });
  });

  describe('getXiuYuan', () => {
    it('should return a XiuYuan by ID', async () => {
      const xiuyuan = createTestXiuYuan('xy_test');
      const card = createTestCard('card-1', xiuyuan.id, 'block-1');

      await storage.createCard(xiuyuan, card);

      const retrieved = storage.getXiuYuan('xy_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('xy_test');
      expect(retrieved?.blockIDs).toEqual(['block-1']);
    });

    it('should return undefined for non-existent XiuYuan', () => {
      const retrieved = storage.getXiuYuan('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Query performance', () => {
    it('should handle queries efficiently with many cards', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      // Create 1000 cards
      for (let i = 0; i < 1000; i++) {
        const card = createTestCard(
          `card-${i}`,
          xiuyuan.id,
          `block-${i % 100}`, // 100 different blocks
          { due: now - Math.random() * 86400000, type: i % 2 === 0 ? 'item' : 'concept' }
        );
        await storage.createCard(xiuyuan, card);
      }

      // Test getDueCards performance
      const start1 = Date.now();
      const dueCards = storage.getDueCards(100);
      const elapsed1 = Date.now() - start1;
      
      expect(dueCards.length).toBeGreaterThan(0);
      expect(elapsed1).toBeLessThan(100); // Should be < 100ms

      // Test getCardsByBlockId performance
      const start2 = Date.now();
      const blockCards = storage.getCardsByBlockId('block-0');
      const elapsed2 = Date.now() - start2;
      
      expect(blockCards.length).toBeGreaterThan(0);
      expect(elapsed2).toBeLessThan(10); // Should be very fast (O(1) lookup)

      // Test getCardsByType performance
      const start3 = Date.now();
      const itemCards = storage.getCardsByType('item');
      const elapsed3 = Date.now() - start3;
      
      expect(itemCards.length).toBeGreaterThan(0);
      expect(elapsed3).toBeLessThan(10); // Should be very fast (O(1) lookup)
    });
  });

  describe('Index consistency after updates', () => {
    it('should maintain correct query results after card updates', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      const card = createTestCard('card-1', xiuyuan.id, 'block-1', { due: now + 86400000 });
      await storage.createCard(xiuyuan, card);

      // Card should not be due yet
      let dueCards = storage.getDueCards(10);
      expect(dueCards).toHaveLength(0);

      // Update card to be due now
      const updatedCard = { ...card, due: now - 1000 };
      await storage.updateCard(updatedCard);

      // Card should now be due
      dueCards = storage.getDueCards(10);
      expect(dueCards).toHaveLength(1);
      expect(dueCards[0].id).toBe('card-1');
    });

    it('should maintain sorted order after multiple updates', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      const card1 = createTestCard('card-1', xiuyuan.id, 'block-1', { due: now - 1000 });
      const card2 = createTestCard('card-2', xiuyuan.id, 'block-2', { due: now - 2000 });
      const card3 = createTestCard('card-3', xiuyuan.id, 'block-3', { due: now - 3000 });

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);
      await storage.createCard(xiuyuan, card3);

      // Update card1 to have earliest due date
      const updatedCard1 = { ...card1, due: now - 5000 };
      await storage.updateCard(updatedCard1);

      const dueCards = storage.getDueCards(10);
      
      // Should be sorted correctly
      expect(dueCards[0].id).toBe('card-1'); // now - 5000
      expect(dueCards[1].id).toBe('card-3'); // now - 3000
      expect(dueCards[2].id).toBe('card-2'); // now - 2000
    });
  });
});
