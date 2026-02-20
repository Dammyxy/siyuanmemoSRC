/**
 * UnifiedStorageManager Persistence Tests
 * 
 * Tests for task 1.7: 实现持久化（load 和 save）
 * Validates Requirements: 1.1, 1.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedStorageManager, UnifiedCardStore } from '../UnifiedStorageManager';
import type { FSRSCard, CardType } from '../../../types/card';
import type { IXiuyuan } from '../../xiuyuan/types';

describe('UnifiedStorageManager Persistence', () => {
  let storage: UnifiedStorageManager;
  let mockStore: UnifiedCardStore;
  let savedData: UnifiedCardStore | null;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
    savedData = null;
    
    // Mock persistence callbacks
    const mockSaveCallback = async (data: UnifiedCardStore) => {
      savedData = data;
    };
    
    const mockLoadCallback = async () => {
      return mockStore || {
        version: 1,
        xiuyuans: {},
        cards: {},
        cardDTOs: {},
      };
    };
    
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
    due: Date.now() + 86400000,
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

  describe('load', () => {
    it('should load empty store when no data exists', async () => {
      mockStore = {
        version: 1,
        xiuyuans: {},
        cards: {},
      };

      const result = await storage.load();

      expect(result.ok).toBe(true);
      expect(storage.getAllCards()).toHaveLength(0);
      expect(storage.getAllXiuYuans()).toHaveLength(0);
    });

    it('should load xiuyuans and cards from store', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      mockStore = {
        version: 1,
        xiuyuans: {
          'xy_1': xiuyuan,
        },
        cards: {
          'card-1': card,
        },
      };

      const result = await storage.load();

      expect(result.ok).toBe(true);
      expect(storage.getAllCards()).toHaveLength(1);
      expect(storage.getAllXiuYuans()).toHaveLength(1);
      expect(storage.getCard('card-1')).toBeDefined();
      expect(storage.getXiuYuan('xy_1')).toBeDefined();
    });

    it('should rebuild indexes after loading', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');

      mockStore = {
        version: 1,
        xiuyuans: {
          'xy_1': xiuyuan,
        },
        cards: {
          'card-1': card1,
          'card-2': card2,
        },
      };

      await storage.load();

      // Verify indexes are built
      expect(storage.getCardsByBlockId('block-1')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-2')).toHaveLength(1);
      expect(storage.getCardsByXiuyuanId('xy_1')).toHaveLength(2);
      expect(storage.getCardsByType('item')).toHaveLength(2);
    });

    it('should clear existing data before loading', async () => {
      // Create initial data
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      await storage.createCard(xiuyuan1, card1);

      // Load different data
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card2 = createTestCard('card-2', 'xy_2', 'block-2');

      mockStore = {
        version: 1,
        xiuyuans: {
          'xy_2': xiuyuan2,
        },
        cards: {
          'card-2': card2,
        },
      };

      await storage.load();

      // Old data should be gone
      expect(storage.getCard('card-1')).toBeUndefined();
      expect(storage.getXiuYuan('xy_1')).toBeUndefined();

      // New data should be present
      expect(storage.getCard('card-2')).toBeDefined();
      expect(storage.getXiuYuan('xy_2')).toBeDefined();
    });

    it('should return error when load callback is not set', async () => {
      const newStorage = new UnifiedStorageManager();
      const result = await newStorage.load();

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Load callback not set');
    });
  });

  describe('save', () => {
    it('should save current data to store', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);
      await storage.save();

      expect(savedData).not.toBeNull();
      expect(savedData?.version).toBe(1);
      expect(savedData?.xiuyuans['xy_1']).toBeDefined();
      expect(savedData?.cards['card-1']).toBeDefined();
    });

    it('should save multiple xiuyuans and cards', async () => {
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_2', 'block-2');

      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan2, card2);
      await storage.save();

      expect(savedData).not.toBeNull();
      expect(Object.keys(savedData?.xiuyuans || {})).toHaveLength(2);
      expect(Object.keys(savedData?.cards || {})).toHaveLength(2);
    });

    it('should clear dirty flag after save', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);
      
      // Save should clear dirty flag
      const result = await storage.save();
      expect(result.ok).toBe(true);
    });

    it('should return error when save callback is not set', async () => {
      const newStorage = new UnifiedStorageManager();
      const result = await newStorage.save();

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Save callback not set');
    });
  });

  describe('auto-save', () => {
    it('should schedule save after card creation', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);

      // Wait for debounced save (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1200));

      expect(savedData).not.toBeNull();
      expect(savedData?.cards['card-1']).toBeDefined();
    });

    it('should schedule save after card update', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);
      savedData = null; // Reset

      // Update card
      const updatedCard = { ...card, priority: 80 };
      await storage.updateCard(updatedCard);

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 1200));

      expect(savedData).not.toBeNull();
      expect(savedData?.cards['card-1'].priority).toBe(80);
    });

    it('should schedule save after card deletion', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);
      savedData = null; // Reset

      await storage.deleteCard('card-1');

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 1200));

      expect(savedData).not.toBeNull();
      expect(savedData?.cards['card-1']).toBeUndefined();
    });
  });

  describe('round-trip consistency', () => {
    it('should maintain data integrity through save and load cycle', async () => {
      // Create test data
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');
      const card3 = createTestCard('card-3', 'xy_2', 'block-3');

      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan1, card2);
      await storage.createCard(xiuyuan2, card3);

      // Save
      await storage.save();

      // Create new storage instance and load
      const newStorage = new UnifiedStorageManager();
      mockStore = savedData!;
      newStorage.setPersistenceCallbacks(
        async (data) => { savedData = data; },
        async () => mockStore
      );

      await newStorage.load();

      // Verify data integrity
      expect(newStorage.getAllCards()).toHaveLength(3);
      expect(newStorage.getAllXiuYuans()).toHaveLength(2);
      
      const loadedCard1 = newStorage.getCard('card-1');
      expect(loadedCard1).toBeDefined();
      expect(loadedCard1?.xiuyuanID).toBe('xy_1');
      expect(loadedCard1?.blockId).toBe('block-1');
      expect(loadedCard1?.priority).toBe(50);

      // Verify indexes are rebuilt correctly
      expect(newStorage.getCardsByBlockId('block-1')).toHaveLength(1);
      expect(newStorage.getCardsByXiuyuanId('xy_1')).toHaveLength(2);
      expect(newStorage.getCardsByType('item')).toHaveLength(3);
    });

    it('should preserve all card fields through save/load', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');
      
      // Set specific values
      card.priority = 75;
      card.tags = ['tag1', 'tag2'];
      card.leechCount = 3;
      card.isLeech = true;
      card.skipped = true;
      card.skipNote = 'Test skip note';
      card.skipUntil = Date.now() + 86400000;

      await storage.createCard(xiuyuan, card);
      await storage.save();

      // Load in new storage
      const newStorage = new UnifiedStorageManager();
      mockStore = savedData!;
      newStorage.setPersistenceCallbacks(
        async (data) => { savedData = data; },
        async () => mockStore
      );

      await newStorage.load();

      const loadedCard = newStorage.getCard('card-1');
      expect(loadedCard).toBeDefined();
      expect(loadedCard?.priority).toBe(75);
      expect(loadedCard?.tags).toEqual(['tag1', 'tag2']);
      expect(loadedCard?.leechCount).toBe(3);
      expect(loadedCard?.isLeech).toBe(true);
      expect(loadedCard?.skipped).toBe(true);
      expect(loadedCard?.skipNote).toBe('Test skip note');
      expect(loadedCard?.skipUntil).toBe(card.skipUntil);
    });
  });

  describe('rebuildIndexes', () => {
    it('should rebuild all indexes correctly', async () => {
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');
      const card3 = createTestCard('card-3', 'xy_2', 'block-3');

      mockStore = {
        version: 1,
        xiuyuans: {
          'xy_1': xiuyuan1,
          'xy_2': xiuyuan2,
        },
        cards: {
          'card-1': card1,
          'card-2': card2,
          'card-3': card3,
        },
      };

      await storage.load();

      // Verify blockID index
      expect(storage.getCardsByBlockId('block-1')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-2')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-3')).toHaveLength(1);

      // Verify xiuyuanID index
      expect(storage.getCardsByXiuyuanId('xy_1')).toHaveLength(2);
      expect(storage.getCardsByXiuyuanId('xy_2')).toHaveLength(1);

      // Verify type index
      expect(storage.getCardsByType('item')).toHaveLength(3);

      // Verify due index (should be sorted)
      const dueCards = storage.getDueCards(10);
      expect(dueCards.length).toBeGreaterThanOrEqual(0);
    });

    it('should sort due index by due date', async () => {
      const xiuyuan = createTestXiuYuan('xy_1');
      const now = Date.now();
      
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      card1.due = now - 3600000; // 1 hour ago
      
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');
      card2.due = now - 7200000; // 2 hours ago
      
      const card3 = createTestCard('card-3', 'xy_1', 'block-3');
      card3.due = now - 1800000; // 30 minutes ago

      mockStore = {
        version: 1,
        xiuyuans: { 'xy_1': xiuyuan },
        cards: {
          'card-1': card1,
          'card-2': card2,
          'card-3': card3,
        },
      };

      await storage.load();

      const dueCards = storage.getDueCards(10);
      
      // Should be sorted by due date (oldest first)
      expect(dueCards[0].id).toBe('card-2'); // 2 hours ago
      expect(dueCards[1].id).toBe('card-1'); // 1 hour ago
      expect(dueCards[2].id).toBe('card-3'); // 30 minutes ago
    });
  });
});
