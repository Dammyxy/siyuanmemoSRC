/**
 * QueueMigrationManager 单元测试
 * Phase 2d.5: 版本迁移测试
 */

import { describe, it, expect } from 'vitest';
import { QueueMigrationManager } from '@/core/queue/strategies/QueueMigrationManager';
import type { QueueItem } from '@/core/queue/types';

// 创建测试 QueueItem
function createTestItem(id: string): QueueItem {
  return {
    cardID: id,
    blockID: `block-${id}`,
    deckID: 'deck-test',
    priority: 50,
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
    state: 0,
    lapses: 0,
    reps: 0,
    lastReview: Date.now() - 86400000,
    meta: {},
  };
}

describe('QueueMigrationManager', () => {
  let manager: QueueMigrationManager;

  beforeEach(() => {
    manager = new QueueMigrationManager();
  });

  describe('detectVersion', () => {
    it('应该检测 V2 格式（QueueData）', () => {
      const v2Data = {
        version: 2,
        items: [createTestItem('card-1')],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 0,
          initialTotal: 1,
        },
      };

      const version = manager.detectVersion(v2Data);

      expect(version).toBe(2);
    });

    it('应该检测 V1 格式（数组）', () => {
      const v1Data = [
        createTestItem('card-1'),
        createTestItem('card-2'),
      ];

      const version = manager.detectVersion(v1Data);

      expect(version).toBe(1);
    });

    it('应该拒绝无效格式', () => {
      expect(() => {
        manager.detectVersion(null);
      }).toThrow();

      expect(() => {
        manager.detectVersion('invalid');
      }).toThrow();

      expect(() => {
        manager.detectVersion(123);
      }).toThrow();
    });
  });

  describe('migrate', () => {
    it('应该成功迁移 V1 到 V2', () => {
      const v1Data = [
        createTestItem('card-1'),
        createTestItem('card-2'),
      ];

      const result = manager.migrate(v1Data);

      expect(result).toBeDefined();
      expect(result.version).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.createdAt).toBeDefined();
      expect(result.metadata.updatedAt).toBeDefined();
      expect(result.metadata.totalReviewed).toBe(0);
      expect(result.metadata.initialTotal).toBe(2);
    });

    it('应该保持 V2 格式不变', () => {
      const v2Data = {
        version: 2,
        items: [createTestItem('card-1')],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 5,
          initialTotal: 10,
        },
      };

      const result = manager.migrate(v2Data);

      expect(result).toEqual(v2Data);
    });

    it('应该规范化字段名', () => {
      const v1DataWithOldNames = [
        {
          cardId: 'card-1',
          blockId: 'block-1',
          deckId: 'deck-1',
          priority: 50,
          nextDues: { 1: '', 2: '', 3: '', 4: '' },
          state: 0,
        },
      ];

      const result = manager.migrate(v1DataWithOldNames);

      expect(result.version).toBe(2);
      expect(result.items[0].cardID).toBe('card-1');
      expect(result.items[0].blockID).toBe('block-1');
      expect(result.items[0].deckID).toBe('deck-1');
    });

    it('应该提供默认值', () => {
      const incompleteItem = {
        cardID: 'card-1',
        blockID: 'block-1',
      } as QueueItem;

      const result = manager.migrate([incompleteItem]);

      expect(result.items[0].priority).toBeDefined();
      expect(result.items[0].nextDues).toBeDefined();
      expect(result.items[0].meta).toBeDefined();
    });
  });

  describe('latestVersion', () => {
    it('应该返回最新版本号', () => {
      expect(manager.latestVersion).toBe(2);
    });
  });
});
