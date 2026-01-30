/**
 * RetrievalPracticeQueue 转换方法测试
 *
 * 测试 QueueItem ↔ FSRSCard 转换功能
 *
 * Phase 5: 测试与文档
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { StorageManager } from '@/core/storage/manager';
import type { QueueItem } from '@/core/queue/types';
import type { FSRSCard, CardState } from '@/types';
import { SimpleFSRSScheduler } from '@/core/scheduler/strategies/FSRSV5';

// Mock StorageManager
const createMockStorage = (): StorageManager => {
  const storage = {
    getPracticeQueue: vi.fn(() => []),
    setPracticeQueue: vi.fn().mockResolvedValue(undefined),
    getQueueData: vi.fn(() => null),
    setQueueData: vi.fn().mockResolvedValue(undefined),
    getQueueBackup: vi.fn().mockResolvedValue(null),
    setQueueBackup: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageManager;

  return storage;
};

// FSRS 参数
const mockFSRSParams = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  weights: new Array(19).fill(0.5),
  enableFuzz: false,
  enableShortTerm: true,
};

// 创建测试 QueueItem
function createTestQueueItem(overrides?: Partial<QueueItem>): QueueItem {
  const now = Date.now();
  return {
    cardID: `card-${Math.random()}`,
    blockID: `block-${Math.random()}`,
    deckID: 'deck-test',
    priority: 50,
    nextDues: {
      1: new Date(now + 86400000).toISOString(),
      2: new Date(now + 86400000 * 2).toISOString(),
      3: new Date(now + 86400000 * 3).toISOString(),
      4: new Date(now + 86400000 * 4).toISOString(),
    },
    state: CardState.Review,
    lapses: 0,
    reps: 5,
    lastReview: now - 86400000,
    meta: {
      stability: 10,
      difficulty: 5,
      aFactor: 2.5,
    },
    ...overrides,
  };
}

describe('RetrievalPracticeQueue - QueueItem ↔ FSRSCard 转换', () => {
  let queue: RetrievalPracticeQueue;

  beforeEach(async () => {
    const mockStorage = createMockStorage();
    queue = new RetrievalPracticeQueue({
      deckID: 'test-deck',
      storage: mockStorage,
    });

    // 等待队列加载完成
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('_queueItemToCard() - QueueItem → FSRSCard', () => {
    it('应该正确转换基本字段', () => {
      const item = createTestQueueItem();

      // 访问私有方法进行测试
      const card = queue['_queueItemToCard'](item);

      expect(card.id).toBe(item.cardID);
      expect(card.blockId).toBe(item.blockID);
      expect(card.reps).toBe(item.reps);
      expect(card.lapses).toBe(item.lapses);
      expect(card.state).toBe(item.state);
    });

    it('应该从 nextDues 提取到期时间', () => {
      const now = Date.now();
      const item = createTestQueueItem({
        nextDues: {
          1: new Date(now + 86400000).toISOString(),
          2: new Date(now + 86400000 * 2).toISOString(),
          3: new Date(now + 86400000 * 3).toISOString(),
          4: new Date(now + 86400000 * 4).toISOString(),
        },
      });

      const card = queue['_queueItemToCard'](item);

      // 应该使用 Good (3) 的到期时间
      expect(card.due).toBeCloseTo(now + 86400000 * 3, -3);
    });

    it('应该保留 meta 数据', () => {
      const item = createTestQueueItem({
        meta: {
          stability: 15,
          difficulty: 7,
          aFactor: 3.6,
          customField: 'test',
        },
      });

      const card = queue['_queueItemToCard'](item);

      expect(card.meta?.stability).toBe(15);
      expect(card.meta?.difficulty).toBe(7);
      expect(card.meta?.aFactor).toBe(3.6);
      expect(card.meta?.customField).toBe('test');
    });

    it('应该处理缺少 nextDues 的情况', () => {
      const item = createTestQueueItem({
        nextDues: undefined,
      });

      const card = queue['_queueItemToCard'](item);

      // 应该使用默认到期时间（1 天后）
      const now = Date.now();
      expect(card.due).toBeGreaterThan(now);
      expect(card.due).toBeLessThan(now + 86400000 * 2);
    });

    it('应该处理空 nextDues', () => {
      const item = createTestQueueItem({
        nextDues: { 1: '', 2: '', 3: '', 4: '' },
      });

      const card = queue['_queueItemToCard'](item);

      const now = Date.now();
      expect(card.due).toBeGreaterThan(now);
    });
  });

  describe('_cardToQueueItem() - FSRSCard → QueueItem', () => {
    it('应该正确转换基本字段', () => {
      const item = createTestQueueItem();
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: Date.now() + 86400000,
        stability: 10,
        difficulty: 5,
        reps: 6,
        lapses: 0,
        state: CardState.Review,
        lastReview: Date.now() - 86400000,
        elapsedDays: 1,
        scheduledDays: 10,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now() - 86400000 * 10,
        updatedAt: Date.now(),
      };

      const updatedItem = queue['_cardToQueueItem'](card, item);

      expect(updatedItem.cardID).toBe(item.cardID);
      expect(updatedItem.blockID).toBe(item.blockID);
      expect(updatedItem.reps).toBe(card.reps);
      expect(updatedItem.lapses).toBe(card.lapses);
      expect(updatedItem.state).toBe(card.state);
    });

    it('应该更新 nextDues 格式', () => {
      const item = createTestQueueItem();
      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: Date.now() + 86400000 * 3,
        stability: 10,
        difficulty: 5,
        reps: 6,
        lapses: 0,
        state: CardState.Review,
        lastReview: Date.now() - 86400000,
        elapsedDays: 1,
        scheduledDays: 10,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now() - 86400000 * 10,
        updatedAt: Date.now(),
      };

      const updatedItem = queue['_cardToQueueItem'](card, item);

      // nextDues 应该是 ISO 格式字符串
      expect(updatedItem.nextDues?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(updatedItem.nextDues?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(updatedItem.nextDues?.[3]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(updatedItem.nextDues?.[4]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('应该保留原始 QueueItem 的其他字段', () => {
      const item = createTestQueueItem({
        deckID: 'my-deck',
        priority: 80,
      });

      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: Date.now() + 86400000,
        stability: 10,
        difficulty: 5,
        reps: 6,
        lapses: 0,
        state: CardState.Review,
        lastReview: Date.now() - 86400000,
        elapsedDays: 1,
        scheduledDays: 10,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now() - 86400000 * 10,
        updatedAt: Date.now(),
      };

      const updatedItem = queue['_cardToQueueItem'](card, item);

      expect(updatedItem.deckID).toBe('my-deck');
      expect(updatedItem.priority).toBe(80);
    });

    it('应该更新 meta 数据', () => {
      const item = createTestQueueItem({
        meta: {
          customField: 'original',
        },
      });

      const card: FSRSCard = {
        id: 'card-1',
        blockId: 'block-1',
        due: Date.now() + 86400000,
        stability: 15,
        difficulty: 7,
        reps: 6,
        lapses: 0,
        state: CardState.Review,
        lastReview: Date.now() - 86400000,
        elapsedDays: 1,
        scheduledDays: 10,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now() - 86400000 * 10,
        updatedAt: Date.now(),
        meta: {
          customField: 'original',
        },
      };

      const updatedItem = queue['_cardToQueueItem'](card, item);

      expect(updatedItem.meta?.stability).toBe(15);
      expect(updatedItem.meta?.difficulty).toBe(7);
      expect(updatedItem.meta?.customField).toBe('original');
    });
  });

  describe('往返转换', () => {
    it('QueueItem → FSRSCard → QueueItem 应该保留关键字段', () => {
      const originalItem = createTestQueueItem({
        reps: 10,
        lapses: 2,
        state: CardState.Review,
        lastReview: Date.now() - 86400000 * 5,
        meta: {
          stability: 20,
          difficulty: 8,
          aFactor: 4.0,
        },
      });

      // QueueItem → FSRSCard
      const card = queue['_queueItemToCard'](originalItem);

      // 模拟卡片更新（例如评分后）
      card.reps = 11;
      card.lapses = 2;

      // FSRSCard → QueueItem
      const finalItem = queue['_cardToQueueItem'](card, originalItem);

      // 验证关键字段保留
      expect(finalItem.cardID).toBe(originalItem.cardID);
      expect(finalItem.blockID).toBe(originalItem.blockID);
      expect(finalItem.reps).toBe(11);
      expect(finalItem.lapses).toBe(2);
      expect(finalItem.state).toBe(CardState.Review);
      expect(finalItem.meta?.stability).toBeDefined();
      expect(finalItem.meta?.difficulty).toBeDefined();
    });
  });
});
