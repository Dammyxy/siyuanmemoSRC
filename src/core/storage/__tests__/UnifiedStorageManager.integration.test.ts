/**
 * UnifiedStorageManager Integration Test
 * 
 * Demonstrates how to integrate UnifiedStorageManager with the plugin's
 * MessagePack persistence system.
 * 
 * This test shows the complete workflow:
 * 1. Create persistence callbacks using the plugin
 * 2. Initialize UnifiedStorageManager with callbacks
 * 3. Load existing data
 * 4. Perform CRUD operations
 * 5. Save data automatically
 * 
 * Validates Requirements: 1.1, 1.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedStorageManager, UnifiedCardStore } from '../UnifiedStorageManager';
import { createPersistenceCallbacks } from '../UnifiedStoragePersistence';
import type { FSRSCard, CardType } from '../../../types/card';
import type { IXiuyuan } from '../../xiuyuan/types';

describe('UnifiedStorageManager Integration', () => {
  let storage: UnifiedStorageManager;
  let mockPlugin: any;
  let pluginData: Record<string, any>;

  beforeEach(() => {
    // Mock plugin data storage
    pluginData = {};

    // Mock plugin with loadData/saveData methods
    mockPlugin = {
      loadData: vi.fn(async (key: string) => {
        return pluginData[key] || null;
      }),
      saveData: vi.fn(async (key: string, data: any) => {
        pluginData[key] = data;
      }),
    };

    // Create storage with persistence callbacks
    storage = new UnifiedStorageManager();
    const { save, load } = createPersistenceCallbacks(mockPlugin);
    
    // Wrap callbacks to pass data correctly
    storage.setPersistenceCallbacks(
      async (data: UnifiedCardStore) => {
        await save(data);
      },
      load
    );
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

  describe('Complete workflow', () => {
    it('should handle full lifecycle: create, save, load, query', async () => {
      // 1. Load (should be empty initially)
      await storage.load();
      expect(storage.getAllCards()).toHaveLength(0);

      // 2. Create cards
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');
      const card3 = createTestCard('card-3', 'xy_2', 'block-3');

      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan1, card2);
      await storage.createCard(xiuyuan2, card3);

      // 3. Save manually
      await storage.save();

      // Verify plugin.saveData was called
      expect(mockPlugin.saveData).toHaveBeenCalledWith(
        'unified-cards.msgpack',
        expect.objectContaining({
          version: 1,
          xiuyuans: expect.any(Object),
          cards: expect.any(Object),
        })
      );

      // 4. Create new storage instance and load
      const newStorage = new UnifiedStorageManager();
      const { save, load } = createPersistenceCallbacks(mockPlugin);
      newStorage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      await newStorage.load();

      // Verify plugin.loadData was called
      expect(mockPlugin.loadData).toHaveBeenCalledWith('unified-cards.msgpack');

      // 5. Query loaded data
      expect(newStorage.getAllCards()).toHaveLength(3);
      expect(newStorage.getAllXiuYuans()).toHaveLength(2);
      expect(newStorage.getCardsByBlockId('block-1')).toHaveLength(1);
      expect(newStorage.getCardsByXiuyuanId('xy_1')).toHaveLength(2);
    });

    it('should auto-save after operations', async () => {
      await storage.load();

      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);

      // Wait for auto-save (1 second debounce)
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Verify auto-save called plugin.saveData
      expect(mockPlugin.saveData).toHaveBeenCalled();
    });

    it('should handle updates and persist changes', async () => {
      await storage.load();

      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);
      await storage.save();

      // Update card
      const updatedCard = { ...card, priority: 80 };
      await storage.updateCard(updatedCard);
      await storage.save();

      // Load in new storage
      const newStorage = new UnifiedStorageManager();
      const { save, load } = createPersistenceCallbacks(mockPlugin);
      newStorage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      await newStorage.load();

      const loadedCard = newStorage.getCard('card-1');
      expect(loadedCard?.priority).toBe(80);
    });

    it('should handle deletions and persist changes', async () => {
      await storage.load();

      const xiuyuan = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      const card2 = createTestCard('card-2', 'xy_1', 'block-2');

      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);
      await storage.save();

      // Delete one card
      await storage.deleteCard('card-1');
      await storage.save();

      // Load in new storage
      const newStorage = new UnifiedStorageManager();
      const { save, load } = createPersistenceCallbacks(mockPlugin);
      newStorage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      await newStorage.load();

      expect(newStorage.getCard('card-1')).toBeUndefined();
      expect(newStorage.getCard('card-2')).toBeDefined();
      expect(newStorage.getXiuYuan('xy_1')).toBeDefined(); // XiuYuan still exists
    });

    it('should cascade delete XiuYuan when last card is deleted', async () => {
      await storage.load();

      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);
      await storage.save();

      // Delete the only card
      await storage.deleteCard('card-1');
      await storage.save();

      // Load in new storage
      const newStorage = new UnifiedStorageManager();
      const { save, load } = createPersistenceCallbacks(mockPlugin);
      newStorage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      await newStorage.load();

      expect(newStorage.getCard('card-1')).toBeUndefined();
      expect(newStorage.getXiuYuan('xy_1')).toBeUndefined(); // XiuYuan also deleted
    });
  });

  describe('Error handling', () => {
    it('should handle load errors gracefully', async () => {
      mockPlugin.loadData = vi.fn(async () => {
        throw new Error('Load failed');
      });

      const { save, load } = createPersistenceCallbacks(mockPlugin);
      storage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      // Should not throw, returns empty store
      const result = await storage.load();
      expect(result.ok).toBe(true);
      expect(storage.getAllCards()).toHaveLength(0);
    });

    it('should handle save errors', async () => {
      mockPlugin.saveData = vi.fn(async () => {
        throw new Error('Save failed');
      });

      const { save, load } = createPersistenceCallbacks(mockPlugin);
      storage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      await storage.load();

      const xiuyuan = createTestXiuYuan('xy_1');
      const card = createTestCard('card-1', 'xy_1', 'block-1');

      await storage.createCard(xiuyuan, card);

      const result = await storage.save();
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Save failed');
    });
  });

  describe('Data consistency', () => {
    it('should maintain consistency across multiple save/load cycles', async () => {
      await storage.load();

      // Cycle 1: Create initial data
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1', 'block-1');
      await storage.createCard(xiuyuan1, card1);
      await storage.save();

      // Cycle 2: Add more data
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card2 = createTestCard('card-2', 'xy_2', 'block-2');
      await storage.createCard(xiuyuan2, card2);
      await storage.save();

      // Cycle 3: Update data
      const updatedCard1 = { ...card1, priority: 90 };
      await storage.updateCard(updatedCard1);
      await storage.save();

      // Load in new storage
      const newStorage = new UnifiedStorageManager();
      const { save, load } = createPersistenceCallbacks(mockPlugin);
      newStorage.setPersistenceCallbacks(
        async (data: UnifiedCardStore) => {
          await save(data);
        },
        load
      );

      await newStorage.load();

      // Verify all changes persisted
      expect(newStorage.getAllCards()).toHaveLength(2);
      expect(newStorage.getAllXiuYuans()).toHaveLength(2);
      expect(newStorage.getCard('card-1')?.priority).toBe(90);
      expect(newStorage.getCard('card-2')).toBeDefined();
    });
  });
});
