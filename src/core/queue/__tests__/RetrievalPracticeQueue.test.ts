/**
 * RetrievalPracticeQueue 单元测试
 * 
 * 测试新的 Composite Architecture 实现的公共 API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { StorageManager } from '@/core/storage/manager';
import { SimpleFSRSScheduler } from '@/core/scheduler/strategies/FSRSV5';
import type { QueueItem } from '@/core/queue/types';
import { DEFAULT_PRIORITY } from '@/core/queue/abstraction/IPriority';

// Mock StorageManager
const createMockStorage = (): StorageManager => {
  const storage = {
    getPracticeQueue: vi.fn(() => []),
    setPracticeQueue: vi.fn().mockResolvedValue(undefined),
    getQueueData: vi.fn(() => null),
    setQueueData: vi.fn().mockResolvedValue(undefined),
    getQueueBackup: vi.fn().mockResolvedValue(null),
    setQueueBackup: vi.fn().mockResolvedValue(undefined),
    getCard: vi.fn(),
    setCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
    saveData: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(null),
    getRiffBlacklist: vi.fn(() => []),
    addToRiffBlacklist: vi.fn(),
  } as unknown as StorageManager;

  return storage;
};

// Mock Riff API
const mockRiffApi = {
  getRiffDueCards: vi.fn().mockResolvedValue({
    cards: [],
    unreviewedCount: 0,
    unreviewedNewCardCount: 0,
    unreviewedOldCardCount: 0,
  }),
  reviewRiffCard: vi.fn().mockResolvedValue(undefined),
  skipReviewRiffCard: vi.fn().mockResolvedValue(undefined),
};

// 测试用 QueueItem 工厂
function createTestQueueItem(overrides?: Partial<QueueItem>): QueueItem {
  const now = Date.now();
  return {
    cardID: `test-card-${Math.random()}`,
    blockID: `block-${Math.random()}`,
    deckID: 'deck-test',
    priority: DEFAULT_PRIORITY,
    nextDues: {
      1: new Date(now + 1000).toISOString(),
      2: new Date(now + 2000).toISOString(),
      3: new Date(now + 3000).toISOString(),
      4: new Date(now + 4000).toISOString(),
    },
    state: 0,
    lapses: 0,
    reps: 0,
    lastReview: now - 86400000, // 1 天前
    meta: {},
    ...overrides,
  };
}

// FSRS 参数
const mockFSRSParams = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  weights: new Array(19).fill(0.5),
  enableFuzz: false,
  enableShortTerm: true,
};

describe('RetrievalPracticeQueue - 公共 API 测试', () => {
  let queue: RetrievalPracticeQueue;
  let mockStorage: StorageManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    queue = new RetrievalPracticeQueue({
      deckID: 'test-deck',
      api: mockRiffApi,
      storage: mockStorage,
      localScheduler: new SimpleFSRSScheduler(mockFSRSParams),
    });

    // 等待队列加载完成
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('addItems()', () => {
    it('应该成功添加卡片到队列', async () => {
      const items = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
        createTestQueueItem({ cardID: 'card-3' }),
      ];

      const count = await queue.addItems(items);

      expect(count).toBe(3);
      expect(queue.getAllItems()).toHaveLength(3);
    });

    it('应该返回添加的卡片数量', async () => {
      const items = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
      ];

      const count = await queue.addItems(items);

      expect(count).toBe(2);
    });

    it('空数组应该返回 0', async () => {
      const count = await queue.addItems([]);

      expect(count).toBe(0);
    });
  });

  describe('getAllItems()', () => {
    it('应该返回所有卡片', async () => {
      const items = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
      ];

      await queue.addItems(items);

      const allItems = queue.getAllItems();

      expect(allItems).toHaveLength(2);
      expect(allItems[0].cardID).toBe('card-1');
      expect(allItems[1].cardID).toBe('card-2');
    });

    it('空队列应该返回空数组', () => {
      const allItems = queue.getAllItems();

      expect(allItems).toEqual([]);
    });
  });

  describe('clear()', () => {
    it('应该清空本地队列', async () => {
      const items = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
      ];

      await queue.addItems(items);
      expect(queue.getAllItems()).toHaveLength(2);

      const count = await queue.clear();

      expect(count).toBe(2);
      expect(queue.getAllItems()).toHaveLength(0);
    });

    it('清空空队列应该返回 0', async () => {
      const count = await queue.clear();

      expect(count).toBe(0);
    });
  });

  describe('getAllCards()', () => {
    it('应该返回所有到期卡片', async () => {
      const now = Date.now();
      const items = [
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: {
            1: new Date(now - 1000).toISOString(), // 已过期
            2: '',
            3: '',
            4: '',
          },
        }),
        createTestQueueItem({
          cardID: 'card-2',
          nextDues: {
            1: new Date(now - 2000).toISOString(), // 已过期
            2: '',
            3: '',
            4: '',
          },
        }),
      ];

      await queue.addItems(items);

      const allCards = await queue.getAllCards();

      expect(allCards).toHaveLength(2);
    });
  });

  describe('Traits', () => {
    it('应该有 prioritizable trait', () => {
      const trait = queue.getPrioritizableTrait();

      expect(trait).toBeDefined();
      expect(trait.id).toBe('prioritizable');
    });

    it('应该有 mutable trait', () => {
      const trait = queue.getMutableTrait();

      expect(trait).toBeDefined();
      expect(trait?.id).toBe('mutable');
    });

    it('应该有 removable trait', () => {
      const trait = queue.getRemovableTrait();

      expect(trait).toBeDefined();
      expect(trait?.id).toBe('removable');
    });
  });
});
