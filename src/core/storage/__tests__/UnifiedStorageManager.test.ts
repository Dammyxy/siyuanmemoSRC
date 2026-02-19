/**
 * UnifiedStorageManager CRUD Operations Tests
 * 
 * Tests for task 1.3: 实现 UnifiedStorageManager 的 CRUD 操作
 * Validates Requirements: 1.4, 1.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { FSRSCard, CardType } from '../../../types/card';
import type { IXiuyuan } from '../../xiuyuan/types';

describe('UnifiedStorageManager CRUD Operations', () => {
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
    blockId: string = 'block-1'
  ): FSRSCard => ({
    id,
    xiuyuanID,
    blockId,
    due: Date.now() + 86400000, // 1 day from now
    stability: 1.0,
    difficulty: 5.0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: Date.now(),
    elapsedDays: 0,
    scheduledDays: 1,
    learning_step: 0,
    type: 'item' as CardType,
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

  describe('createCard', () => {
    it('should create a card and update all indexes', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();

      const result = await storage.createCard(xiuyuan, card);

      expect(result.ok).toBe(true);
      
      // Verify card is stored
      const storedCard = storage.getCard(card.id);
      expect(storedCard).toBeDefined();
      expect(storedCard?.id).toBe(card.id);
      
      // Verify XiuYuan is stored
      const storedXiuYuan = storage.getXiuYuan(xiuyuan.id);
      expect(storedXiuYuan).toBeDefined();
      expect(storedXiuYuan?.id).toBe(xiuyuan.id);
      
      // Verify indexes are updated
      const cardsByBlock = storage.getCardsByBlockId(card.blockId);
      expect(cardsByBlock).toHaveLength(1);
      expect(cardsByBlock[0].id).toBe(card.id);
      
      const cardsByXiuyuan = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cardsByXiuyuan).toHaveLength(1);
      expect(cardsByXiuyuan[0].id).toBe(card.id);
      
      const cardsByType = storage.getCardsByType(card.type);
      expect(cardsByType).toHaveLength(1);
      expect(cardsByType[0].id).toBe(card.id);
    });

    it('should not duplicate XiuYuan if it already exists', async () => {
      const xiuyuan = createTestXiuYuan();
      const card1 = createTestCard('card-1');
      const card2 = createTestCard('card-2');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);

      const allXiuYuans = storage.getAllXiuYuans();
      expect(allXiuYuans).toHaveLength(1);
      expect(allXiuYuans[0].id).toBe(xiuyuan.id);
    });
  });

  describe('batchCreateCards', () => {
    it('should create multiple cards in a single operation', async () => {
      const xiuyuan = createTestXiuYuan();
      const cards = [
        createTestCard('card-1', xiuyuan.id, 'block-1'),
        createTestCard('card-2', xiuyuan.id, 'block-1'),
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      // Verify all cards are stored
      expect(storage.getCard('card-1')).toBeDefined();
      expect(storage.getCard('card-2')).toBeDefined();
      
      // Verify indexes are updated
      const cardsByXiuyuan = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cardsByXiuyuan).toHaveLength(2);
    });

    it('should update indexes only once for batch operations', async () => {
      const xiuyuan = createTestXiuYuan();
      const cards = Array.from({ length: 10 }, (_, i) => 
        createTestCard(`card-${i}`, xiuyuan.id, 'block-1')
      );

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      const cardsByBlock = storage.getCardsByBlockId('block-1');
      expect(cardsByBlock).toHaveLength(10);
    });
  });

  describe('getCard', () => {
    it('should return a card by ID', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();

      await storage.createCard(xiuyuan, card);

      const retrieved = storage.getCard(card.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(card.id);
      expect(retrieved?.xiuyuanID).toBe(xiuyuan.id);
    });

    it('should return undefined for non-existent card', () => {
      const retrieved = storage.getCard('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('updateCard', () => {
    it('should update a card and refresh indexes', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();

      await storage.createCard(xiuyuan, card);

      // Update card
      const updatedCard = { ...card, priority: 80, due: Date.now() };
      const result = await storage.updateCard(updatedCard);

      expect(result.ok).toBe(true);
      
      // Verify update
      const retrieved = storage.getCard(card.id);
      expect(retrieved?.priority).toBe(80);
      expect(retrieved?.due).toBe(updatedCard.due);
    });

    it('should update indexes when card properties change', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard('card-1', xiuyuan.id, 'block-1');

      await storage.createCard(xiuyuan, card);

      // Change blockId
      const updatedCard = { ...card, blockId: 'block-2' };
      await storage.updateCard(updatedCard);

      // Old blockId should not have the card
      const oldBlockCards = storage.getCardsByBlockId('block-1');
      expect(oldBlockCards).toHaveLength(0);

      // New blockId should have the card
      const newBlockCards = storage.getCardsByBlockId('block-2');
      expect(newBlockCards).toHaveLength(1);
      expect(newBlockCards[0].id).toBe(card.id);
    });

    it('should return error for non-existent card', async () => {
      const card = createTestCard();
      const result = await storage.updateCard(card);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('deleteCard', () => {
    it('should delete a card and remove from indexes', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();

      await storage.createCard(xiuyuan, card);

      const result = await storage.deleteCard(card.id);

      expect(result.ok).toBe(true);
      
      // Verify card is deleted
      expect(storage.getCard(card.id)).toBeUndefined();
      
      // Verify indexes are updated
      expect(storage.getCardsByBlockId(card.blockId)).toHaveLength(0);
      expect(storage.getCardsByXiuyuanId(xiuyuan.id)).toHaveLength(0);
      expect(storage.getCardsByType(card.type)).toHaveLength(0);
    });

    it('should cascade delete XiuYuan when last card is deleted', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();

      await storage.createCard(xiuyuan, card);

      // Delete the only card
      await storage.deleteCard(card.id);

      // XiuYuan should be automatically deleted
      expect(storage.getXiuYuan(xiuyuan.id)).toBeUndefined();
    });

    it('should NOT delete XiuYuan if other cards exist', async () => {
      const xiuyuan = createTestXiuYuan();
      const card1 = createTestCard('card-1');
      const card2 = createTestCard('card-2');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);

      // Delete one card
      await storage.deleteCard(card1.id);

      // XiuYuan should still exist
      expect(storage.getXiuYuan(xiuyuan.id)).toBeDefined();
      
      // Other card should still exist
      expect(storage.getCard(card2.id)).toBeDefined();
    });

    it('should return error for non-existent card', async () => {
      const result = await storage.deleteCard('non-existent');

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('deleteXiuYuan', () => {
    it('should cascade delete all associated cards', async () => {
      const xiuyuan = createTestXiuYuan();
      const card1 = createTestCard('card-1');
      const card2 = createTestCard('card-2');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);

      const result = await storage.deleteXiuYuan(xiuyuan.id);

      expect(result.ok).toBe(true);
      
      // Verify XiuYuan is deleted
      expect(storage.getXiuYuan(xiuyuan.id)).toBeUndefined();
      
      // Verify all cards are deleted
      expect(storage.getCard(card1.id)).toBeUndefined();
      expect(storage.getCard(card2.id)).toBeUndefined();
      
      // Verify indexes are cleaned up
      expect(storage.getCardsByXiuyuanId(xiuyuan.id)).toHaveLength(0);
    });

    it('should return error for non-existent XiuYuan', async () => {
      const result = await storage.deleteXiuYuan('non-existent');

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('Index consistency', () => {
    it('should maintain consistent indexes across multiple operations', async () => {
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');
      const card3 = createTestCard('card-3', 'xy_2', 'block-3');

      // Create cards
      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan1, card2);
      await storage.createCard(xiuyuan2, card3);

      // Verify indexes
      expect(storage.getCardsByXiuyuanId('xy_1')).toHaveLength(2);
      expect(storage.getCardsByXiuyuanId('xy_2')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-1')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-2')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-3')).toHaveLength(1);

      // Update card1 to different block
      const updatedCard1 = { ...card1, blockId: 'block-4' };
      await storage.updateCard(updatedCard1);

      expect(storage.getCardsByBlockId('block-1')).toHaveLength(0);
      expect(storage.getCardsByBlockId('block-4')).toHaveLength(1);

      // Delete card2
      await storage.deleteCard('card-2');

      expect(storage.getCardsByXiuyuanId('xy_1')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-2')).toHaveLength(0);

      // Delete xiuyuan2
      await storage.deleteXiuYuan('xy_2');

      expect(storage.getCardsByXiuyuanId('xy_2')).toHaveLength(0);
      expect(storage.getCardsByBlockId('block-3')).toHaveLength(0);
      expect(storage.getCard('card-3')).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics after CRUD operations', async () => {
      const xiuyuan = createTestXiuYuan();
      const card1 = createTestCard('card-1');
      const card2 = createTestCard('card-2', xiuyuan.id, 'block-2');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);

      const stats = storage.getStats();

      expect(stats.totalCards).toBe(2);
      expect(stats.totalXiuYuans).toBe(1);
      expect(stats.cardsByType.item).toBe(2);
      expect(stats.newCards).toBe(2); // state === 0

      // Delete one card
      await storage.deleteCard('card-1');

      const updatedStats = storage.getStats();
      expect(updatedStats.totalCards).toBe(1);
      expect(updatedStats.totalXiuYuans).toBe(1);
    });
  });
});
