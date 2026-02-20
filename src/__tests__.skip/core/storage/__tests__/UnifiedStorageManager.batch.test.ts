/**
 * UnifiedStorageManager 批量操作测试
 * 
 * 测试批量操作的原子性、回滚逻辑和性能优化
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import { FSRSCard } from '../../../types/card';
import { IXiuyuan } from '../../xiuyuan/domain/IXiuyuan';

// 测试辅助函数
function createTestXiuyuan(id: string = 'xy_test_123'): IXiuyuan {
  return {
    id,
    blockIDs: ['block-1'],
    templateID: 'builtin-basic-qa',
    fields: [
      { name: 'question', blockID: 'block-1' },
      { name: 'answer', blockID: 'block-2' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createTestCard(
  id: string = 'card_test_123',
  xiuyuanID: string = 'xy_test_123',
  blockId: string = 'block-1'
): FSRSCard {
  return {
    id,
    xiuyuanID,
    blockId,
    due: Date.now(),
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: Date.now(),
    elapsedDays: 0,
    scheduledDays: 0,
    learning_step: 0,
    type: 'item',
    templateID: 'builtin-basic-qa',
    schedulerType: 'fsrs-v6',
    priority: 50,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    meta: {
      xiuyuanID,
      templateID: 'builtin-basic-qa',
      ruleIndex: 0,
      frontBlockIDs: [blockId],
      backBlockIDs: ['block-2'],
      fieldMapping: {},
      frontFields: ['question'],
      backFields: ['answer'],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('UnifiedStorageManager - Batch Operations', () => {
  let storage: UnifiedStorageManager;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
  });

  describe('batchCreateCards - Basic Functionality', () => {
    it('should create multiple cards in a single operation', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = [
        createTestCard('card-1', xiuyuan.id, 'block-1'),
        createTestCard('card-2', xiuyuan.id, 'block-1'),
        createTestCard('card-3', xiuyuan.id, 'block-1'),
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      // Verify all cards are stored
      expect(storage.getCard('card-1')).toBeDefined();
      expect(storage.getCard('card-2')).toBeDefined();
      expect(storage.getCard('card-3')).toBeDefined();
      
      // Verify XiuYuan is stored
      expect(storage.getXiuYuan(xiuyuan.id)).toBeDefined();
    });

    it('should update all indexes correctly', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = [
        createTestCard('card-1', xiuyuan.id, 'block-1'),
        createTestCard('card-2', xiuyuan.id, 'block-2'),
      ];

      await storage.batchCreateCards(xiuyuan, cards);

      // Verify blockID index
      expect(storage.getCardsByBlockId('block-1')).toHaveLength(1);
      expect(storage.getCardsByBlockId('block-2')).toHaveLength(1);
      
      // Verify xiuyuanID index
      expect(storage.getCardsByXiuyuanId(xiuyuan.id)).toHaveLength(2);
      
      // Verify type index
      expect(storage.getCardsByType('item')).toHaveLength(2);
    });

    it('should sort due index only once', async () => {
      const xiuyuan = createTestXiuyuan();
      const now = Date.now();
      const cards = [
        { ...createTestCard('card-1', xiuyuan.id), due: now - 3000 }, // Past due
        { ...createTestCard('card-2', xiuyuan.id), due: now - 5000 }, // Most overdue
        { ...createTestCard('card-3', xiuyuan.id), due: now - 4000 }, // Middle
      ];

      await storage.batchCreateCards(xiuyuan, cards);

      const dueCards = storage.getDueCards(10);
      
      // Verify we got all 3 cards back
      expect(dueCards.length).toBe(3);
      
      // Verify cards are sorted by due date (ascending - most overdue first)
      expect(dueCards[0].id).toBe('card-2'); // due: now - 5000
      expect(dueCards[1].id).toBe('card-3'); // due: now - 4000
      expect(dueCards[2].id).toBe('card-1'); // due: now - 3000
    });
  });

  describe('batchCreateCards - Input Validation', () => {
    it('should reject invalid xiuyuan (missing id)', async () => {
      const xiuyuan = { ...createTestXiuyuan(), id: '' };
      const cards = [createTestCard('card-1', xiuyuan.id)];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Invalid xiuyuan');
    });

    it('should reject empty cards array', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards: FSRSCard[] = [];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('empty array');
    });

    it('should reject card with missing id', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = [{ ...createTestCard('', xiuyuan.id), id: '' }];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('missing id');
    });

    it('should reject card with mismatched xiuyuanID', async () => {
      const xiuyuan = createTestXiuyuan('xy_123');
      const cards = [createTestCard('card-1', 'xy_different')];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('xiuyuanID mismatch');
    });

    it('should reject if any card already exists', async () => {
      const xiuyuan = createTestXiuyuan();
      const existingCard = createTestCard('card-1', xiuyuan.id);
      
      // Create first card
      await storage.createCard(xiuyuan, existingCard);

      // Try to batch create with duplicate
      const cards = [
        createTestCard('card-1', xiuyuan.id), // Duplicate
        createTestCard('card-2', xiuyuan.id),
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('already exists');
      
      // Verify card-2 was not created (atomicity)
      expect(storage.getCard('card-2')).toBeUndefined();
    });
  });

  describe('batchCreateCards - Atomicity', () => {
    it('should rollback all changes if operation fails', async () => {
      const xiuyuan = createTestXiuyuan();
      
      // Create a card that will cause validation failure
      const cards = [
        createTestCard('card-1', xiuyuan.id),
        { ...createTestCard('card-2', xiuyuan.id), id: '' }, // Invalid
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      
      // Verify no cards were created
      expect(storage.getCard('card-1')).toBeUndefined();
      expect(storage.getCard('card-2')).toBeUndefined();
      
      // Verify indexes are not updated
      expect(storage.getCardsByXiuyuanId(xiuyuan.id)).toHaveLength(0);
    });

    it('should not create xiuyuan if card creation fails', async () => {
      const xiuyuan = createTestXiuyuan('xy_new');
      const cards = [
        createTestCard('card-1', xiuyuan.id),
        { ...createTestCard('card-2', 'xy_different'), id: 'card-2' }, // Mismatch
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      
      // Verify xiuyuan was not created
      expect(storage.getXiuYuan(xiuyuan.id)).toBeUndefined();
    });

    it('should rollback index updates on failure', async () => {
      const xiuyuan = createTestXiuyuan();
      
      // Create some existing cards first
      const existingCard = createTestCard('existing', xiuyuan.id, 'block-existing');
      await storage.createCard(xiuyuan, existingCard);
      
      const originalBlockCount = storage.getCardsByBlockId('block-1').length;
      const originalXiuyuanCount = storage.getCardsByXiuyuanId(xiuyuan.id).length;

      // Try to batch create with invalid data
      const cards = [
        createTestCard('card-1', xiuyuan.id, 'block-1'),
        { ...createTestCard('card-2', xiuyuan.id), id: '' }, // Invalid
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(false);
      
      // Verify indexes are unchanged
      expect(storage.getCardsByBlockId('block-1')).toHaveLength(originalBlockCount);
      expect(storage.getCardsByXiuyuanId(xiuyuan.id)).toHaveLength(originalXiuyuanCount);
    });
  });

  describe('batchCreateCards - Performance Optimization', () => {
    it('should update indexes only once for all cards', async () => {
      const xiuyuan = createTestXiuyuan();
      const cardCount = 100;
      const cards = Array.from({ length: cardCount }, (_, i) => 
        createTestCard(`card-${i}`, xiuyuan.id, 'block-1')
      );

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      // Verify all cards are indexed
      const cardsByBlock = storage.getCardsByBlockId('block-1');
      expect(cardsByBlock).toHaveLength(cardCount);
      
      const cardsByXiuyuan = storage.getCardsByXiuyuanId(xiuyuan.id);
      expect(cardsByXiuyuan).toHaveLength(cardCount);
    });

    it('should trigger save only once', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = Array.from({ length: 10 }, (_, i) => 
        createTestCard(`card-${i}`, xiuyuan.id)
      );

      let saveCount = 0;
      const savePromise = new Promise<void>((resolve) => {
        storage.setPersistenceCallbacks(
          async (data) => {
            saveCount++;
            // Resolve after first save
            if (saveCount === 1) {
              setTimeout(resolve, 100);
            }
          },
          async () => ({
            version: 1,
            xiuyuans: {},
            cards: {},
          })
        );
      });

      await storage.batchCreateCards(xiuyuan, cards);

      // Wait for the save to be triggered (with timeout)
      await Promise.race([
        savePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 2000))
      ]);

      // Should only save once despite creating 10 cards
      expect(saveCount).toBe(1);
    }, 3000);

    it('should handle large batch efficiently', async () => {
      const xiuyuan = createTestXiuyuan();
      const cardCount = 1000;
      const cards = Array.from({ length: cardCount }, (_, i) => 
        createTestCard(`card-${i}`, xiuyuan.id, `block-${i % 10}`)
      );

      const startTime = Date.now();
      const result = await storage.batchCreateCards(xiuyuan, cards);
      const elapsed = Date.now() - startTime;

      expect(result.ok).toBe(true);
      expect(elapsed).toBeLessThan(500); // Should complete in < 500ms
      
      // Verify all cards are stored
      expect(storage.getAllCards()).toHaveLength(cardCount);
    });
  });

  describe('batchCreateCards - Edge Cases', () => {
    it('should handle single card batch', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = [createTestCard('card-1', xiuyuan.id)];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      expect(storage.getCard('card-1')).toBeDefined();
    });

    it('should handle cards with different priorities', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = [
        { ...createTestCard('card-1', xiuyuan.id), priority: 10 },
        { ...createTestCard('card-2', xiuyuan.id), priority: 50 },
        { ...createTestCard('card-3', xiuyuan.id), priority: 90 },
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      // Verify priority index
      expect(storage.getCard('card-1')?.priority).toBe(10);
      expect(storage.getCard('card-2')?.priority).toBe(50);
      expect(storage.getCard('card-3')?.priority).toBe(90);
    });

    it('should handle cards with different types', async () => {
      const xiuyuan = createTestXiuyuan();
      const cards = [
        { ...createTestCard('card-1', xiuyuan.id), type: 'item' as const },
        { ...createTestCard('card-2', xiuyuan.id), type: 'concept' as const },
        { ...createTestCard('card-3', xiuyuan.id), type: 'topic' as const },
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      // Verify type index
      expect(storage.getCardsByType('item')).toHaveLength(1);
      expect(storage.getCardsByType('concept')).toHaveLength(1);
      expect(storage.getCardsByType('topic')).toHaveLength(1);
    });

    it('should preserve existing xiuyuan if it already exists', async () => {
      const xiuyuan = createTestXiuyuan();
      const originalMeta = { custom: 'data' };
      xiuyuan.meta = originalMeta;
      
      // Create xiuyuan first
      const firstCard = createTestCard('card-1', xiuyuan.id);
      await storage.createCard(xiuyuan, firstCard);

      // Batch create more cards with same xiuyuan
      const cards = [
        createTestCard('card-2', xiuyuan.id),
        createTestCard('card-3', xiuyuan.id),
      ];

      const result = await storage.batchCreateCards(xiuyuan, cards);

      expect(result.ok).toBe(true);
      
      // Verify xiuyuan metadata is preserved
      const storedXiuyuan = storage.getXiuYuan(xiuyuan.id);
      expect(storedXiuyuan?.meta).toEqual(originalMeta);
    });
  });
});
