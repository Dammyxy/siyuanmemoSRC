/**
 * QueueRecoveryManager 单元测试
 * Phase 2d.5: 数据恢复测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QueueRecoveryManager } from '@/core/queue/strategies/QueueRecoveryManager';
import type { QueueData } from '@/core/queue/strategies/QueueMigrationManager';

// 创建有效的 QueueData
function createValidQueueData(): QueueData {
  return {
    version: 2,
    items: [
      {
        cardID: 'card-1',
        blockID: 'block-1',
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
      },
    ],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalReviewed: 5,
      initialTotal: 10,
    },
  };
}

describe('QueueRecoveryManager', () => {
  let manager: QueueRecoveryManager;

  beforeEach(() => {
    manager = new QueueRecoveryManager();
  });

  describe('validateQueueData', () => {
    it('应该验证有效的 QueueData', () => {
      const validData = createValidQueueData();
      const result = manager.validateQueueData(validData);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝 null 或 undefined', () => {
      const nullResult = manager.validateQueueData(null);
      const undefinedResult = manager.validateQueueData(undefined);

      expect(nullResult.valid).toBe(false);
      expect(nullResult.error).toBeDefined();

      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.error).toBeDefined();
    });

    it('应该拒绝非对象类型', () => {
      const arrayResult = manager.validateQueueData([]);
      const stringResult = manager.validateQueueData('invalid');
      const numberResult = manager.validateQueueData(123);

      expect(arrayResult.valid).toBe(false);
      expect(stringResult.valid).toBe(false);
      expect(numberResult.valid).toBe(false);
    });

    it('应该拒绝缺少 version 字段', () => {
      const invalidData = {
        items: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 0,
          initialTotal: 0,
        },
      };

      const result = manager.validateQueueData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('version');
    });

    it('应该拒绝无效的 version 类型', () => {
      const invalidData = {
        version: '2' as any, // 应该是数字
        items: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 0,
          initialTotal: 0,
        },
      };

      const result = manager.validateQueueData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('version');
    });

    it('应该拒绝缺少 items 数组', () => {
      const invalidData = {
        version: 2,
        items: 'not-an-array' as any,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 0,
          initialTotal: 0,
        },
      };

      const result = manager.validateQueueData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('items');
    });

    it('应该拒绝缺少必需字段的 item', () => {
      const invalidData = {
        version: 2,
        items: [
          {
            // 缺少 cardID
            blockID: 'block-1',
          },
        ],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 0,
          initialTotal: 1,
        },
      };

      const result = manager.validateQueueData(invalidData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('cardID');
    });

    it('应该验证 metadata 字段', () => {
      const dataWithoutMetadata = {
        version: 2,
        items: [
          {
            cardID: 'card-1',
            blockID: 'block-1',
          },
        ],
        metadata: null as any,
      };

      const result = manager.validateQueueData(dataWithoutMetadata);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('metadata');
    });
  });

  describe('recover', () => {
    it('应该返回有效的主数据', () => {
      const validData = createValidQueueData();
      const backupData = createValidQueueData();

      const result = manager.recover(validData, backupData);

      expect(result).not.toBeNull();
      expect(result).toEqual(validData);
    });

    it('主数据无效时应该使用备份数据', () => {
      const invalidData = { version: 'invalid' };
      const validBackup = createValidQueueData();

      const result = manager.recover(invalidData, validBackup);

      expect(result).not.toBeNull();
      expect(result).toEqual(validBackup);
    });

    it('主数据和备份数据都无效时应该返回 null', () => {
      const invalidData = { version: 'invalid' };
      const invalidBackup = null;

      const result = manager.recover(invalidData, invalidBackup);

      expect(result).toBeNull();
    });

    it('没有备份时应该返回 null', () => {
      const invalidData = { version: 'invalid' };

      const result = manager.recover(invalidData, null);

      expect(result).toBeNull();
    });

    it('主数据有效时不应该检查备份', () => {
      const validData = createValidQueueData();
      const invalidBackup = { version: 'invalid' };

      const result = manager.recover(validData, invalidBackup);

      // 应该返回主数据，即使备份无效
      expect(result).not.toBeNull();
      expect(result).toEqual(validData);
    });
  });

  describe('createEmptyQueue', () => {
    it('应该创建有效的空队列数据', () => {
      const emptyQueue = manager.createEmptyQueue();

      expect(emptyQueue.version).toBe(2);
      expect(emptyQueue.items).toHaveLength(0);
      expect(emptyQueue.metadata.createdAt).toBeDefined();
      expect(emptyQueue.metadata.updatedAt).toBeDefined();
      expect(emptyQueue.metadata.totalReviewed).toBe(0);
      expect(emptyQueue.metadata.initialTotal).toBe(0);
    });

    it('应该使用当前时间作为创建和更新时间', () => {
      const before = Date.now();
      const emptyQueue = manager.createEmptyQueue();
      const after = Date.now();

      expect(emptyQueue.metadata.createdAt).toBeGreaterThanOrEqual(before);
      expect(emptyQueue.metadata.createdAt).toBeLessThanOrEqual(after);
      expect(emptyQueue.metadata.updatedAt).toBeGreaterThanOrEqual(before);
      expect(emptyQueue.metadata.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('cloneQueueData', () => {
    it('应该创建队列数据的深拷贝', () => {
      const original = createValidQueueData();
      const clone = manager.cloneQueueData(original);

      // 验证内容相同
      expect(clone).toEqual(original);

      // 验证是深拷贝（修改克隆不应该影响原对象）
      clone.items[0].cardID = 'modified-card';
      expect(original.items[0].cardID).toBe('card-1');
      expect(clone.items[0].cardID).toBe('modified-card');

      clone.metadata.totalReviewed = 999;
      expect(original.metadata.totalReviewed).toBe(5);
      expect(clone.metadata.totalReviewed).toBe(999);
    });
  });
});
