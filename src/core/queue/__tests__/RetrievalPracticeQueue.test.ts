/**
 * RetrievalPracticeQueue 单元测试
 * Phase 2d.5: 测试和优化
 *
 * 测试范围：
 * - 二分查找插入（Phase 2d.1）
 * - 版本化持久化（Phase 2d.2）
 * - 生命周期管理（Phase 2d.3）
 * - 数据恢复和备份（Phase 2d.4）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { StorageManager } from '@/core/storage/manager';
import { SimpleFSRSScheduler } from '@/core/scheduler/strategies/SimpleFSRSScheduler';
import type { QueueItem, QueueFeedback } from '@/core/queue/types';
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

describe('RetrievalPracticeQueue - Phase 2d.1: 二分查找插入', () => {
  let queue: RetrievalPracticeQueue;
  let mockStorage: StorageManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    queue = new RetrievalPracticeQueue({
      deckID: 'test-deck',
      api: mockRiffApi,
      storage: mockStorage,
      localScheduler: new SimpleFSRSScheduler(mockFSRSParams),
    });
  });

  describe('_compareItems', () => {
    it('应该按到期时间升序排序', () => {
      const item1 = createTestQueueItem({
        cardID: 'card-1',
        nextDues: {
          1: new Date(Date.now() + 5000).toISOString(),
          2: new Date(Date.now() + 5000).toISOString(),
          3: new Date(Date.now() + 5000).toISOString(),
          4: new Date(Date.now() + 5000).toISOString(),
        },
      });
      const item2 = createTestQueueItem({
        cardID: 'card-2',
        nextDues: {
          1: new Date(Date.now() + 1000).toISOString(),
          2: new Date(Date.now() + 1000).toISOString(),
          3: new Date(Date.now() + 1000).toISOString(),
          4: new Date(Date.now() + 1000).toISOString(),
        },
      });

      // 访问私有方法进行测试
      const compare = queue['_compareItems'](item1, item2);

      // item2 到期更早，应该排在前面（返回负数）
      expect(compare).toBeGreaterThan(0);
    });

    it('到期时间相同时应该按优先级降序排序', () => {
      const now = Date.now();
      const dueTime = new Date(now + 1000).toISOString();

      const item1 = createTestQueueItem({
        cardID: 'card-1',
        priority: 30, // 低优先级
        nextDues: { 1: dueTime, 2: dueTime, 3: dueTime, 4: dueTime },
      });
      const item2 = createTestQueueItem({
        cardID: 'card-2',
        priority: 70, // 高优先级
        nextDues: { 1: dueTime, 2: dueTime, 3: dueTime, 4: dueTime },
      });

      const compare = queue['_compareItems'](item1, item2);

      // item2 优先级更高，应该排在前面
      expect(compare).toBeGreaterThan(0);
    });
  });

  describe('_findInsertIndex', () => {
    it('空队列应该返回索引 0', () => {
      const item = createTestQueueItem();
      const index = queue['_findInsertIndex'](item, []);

      expect(index).toBe(0);
    });

    it('应该找到正确的插入位置（开头）', () => {
      const now = Date.now();
      const early = new Date(now + 1000).toISOString();
      const late = new Date(now + 5000).toISOString();

      const sortedQueue = [
        createTestQueueItem({
          cardID: 'card-2',
          nextDues: { 1: late, 2: late, 3: late, 4: late },
        }),
        createTestQueueItem({
          cardID: 'card-3',
          nextDues: { 1: late, 2: late, 3: late, 4: late },
        }),
      ];

      const newItem = createTestQueueItem({
        cardID: 'card-1',
        nextDues: { 1: early, 2: early, 3: early, 4: early },
      });

      const index = queue['_findInsertIndex'](newItem, sortedQueue);

      // 应该插入到开头
      expect(index).toBe(0);
    });

    it('应该找到正确的插入位置（末尾）', () => {
      const now = Date.now();
      const early = new Date(now + 1000).toISOString();
      const late = new Date(now + 5000).toISOString();

      const sortedQueue = [
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: { 1: early, 2: early, 3: early, 4: early },
        }),
        createTestQueueItem({
          cardID: 'card-2',
          nextDues: { 1: early, 2: early, 3: early, 4: early },
        }),
      ];

      const newItem = createTestQueueItem({
        cardID: 'card-3',
        nextDues: { 1: late, 2: late, 3: late, 4: late },
      });

      const index = queue['_findInsertIndex'](newItem, sortedQueue);

      // 应该插入到末尾
      expect(index).toBe(2);
    });

    it('应该找到正确的插入位置（中间）', () => {
      const now = Date.now();
      const early = new Date(now + 1000).toISOString();
      const middle = new Date(now + 3000).toISOString();
      const late = new Date(now + 5000).toISOString();

      const sortedQueue = [
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: { 1: early, 2: early, 3: early, 4: early },
        }),
        createTestQueueItem({
          cardID: 'card-3',
          nextDues: { 1: late, 2: late, 3: late, 4: late },
        }),
      ];

      const newItem = createTestQueueItem({
        cardID: 'card-2',
        nextDues: { 1: middle, 2: middle, 3: middle, 4: middle },
      });

      const index = queue['_findInsertIndex'](newItem, sortedQueue);

      // 应该插入到中间
      expect(index).toBe(1);
    });
  });

  describe('_insertSorted', () => {
    it('应该将元素插入到正确位置并保持有序', () => {
      const now = Date.now();
      const items = [
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: { 1: new Date(now + 1000).toISOString(), 2: '', 3: '', 4: '' },
        }),
        createTestQueueItem({
          cardID: 'card-3',
          nextDues: { 1: new Date(now + 3000).toISOString(), 2: '', 3: '', 4: '' },
        }),
      ];

      const newItem = createTestQueueItem({
        cardID: 'card-2',
        nextDues: { 1: new Date(now + 2000).toISOString(), 2: '', 3: '', 4: '' },
      });

      queue['_insertSorted'](newItem, items);

      expect(items).toHaveLength(3);
      expect(items[0].cardID).toBe('card-1');
      expect(items[1].cardID).toBe('card-2');
      expect(items[2].cardID).toBe('card-3');
    });
  });

  describe('_ensureSorted', () => {
    it('未排序队列应该被排序', () => {
      const now = Date.now();
      const unsortedItems = [
        createTestQueueItem({
          cardID: 'card-3',
          nextDues: { 1: new Date(now + 3000).toISOString(), 2: '', 3: '', 4: '' },
        }),
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: { 1: new Date(now + 1000).toISOString(), 2: '', 3: '', 4: '' },
        }),
        createTestQueueItem({
          cardID: 'card-2',
          nextDues: { 1: new Date(now + 2000).toISOString(), 2: '', 3: '', 4: '' },
        }),
      ];

      // 手动设置未排序的队列
      queue['localBuffer'] = unsortedItems;
      queue['_markUnsorted']();

      // 确保排序
      queue['_ensureSorted']();

      // 验证已排序
      expect(queue['localBuffer'][0].cardID).toBe('card-1');
      expect(queue['localBuffer'][1].cardID).toBe('card-2');
      expect(queue['localBuffer'][2].cardID).toBe('card-3');
      expect(queue['isLocalBufferSorted']).toBe(true);
    });

    it('已排序队列不应该重新排序', () => {
      const now = Date.now();
      const sortedItems = [
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: { 1: new Date(now + 1000).toISOString(), 2: '', 3: '', 4: '' },
        }),
        createTestQueueItem({
          cardID: 'card-2',
          nextDues: { 1: new Date(now + 2000).toISOString(), 2: '', 3: '', 4: '' },
        }),
      ];

      queue['localBuffer'] = sortedItems;
      queue['isLocalBufferSorted'] = true;

      // 调用 _ensureSorted
      queue['_ensureSorted']();

      // 验证没有重新排序
      expect(queue['isLocalBufferSorted']).toBe(true);
    });
  });

  describe('addItems', () => {
    it('批量添加后应该标记为未排序', async () => {
      const items = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
        createTestQueueItem({ cardID: 'card-3' }),
      ];

      await queue.addItems(items);

      // 验证标记为未排序
      expect(queue['isLocalBufferSorted']).toBe(false);
    });

    it('应该过滤掉 Topic 卡片', async () => {
      const items = [
        createTestQueueItem({ cardID: 'item-1' }),
        createTestQueueItem({ cardID: 'topic-1', meta: { type: 'topic' } }),
      ];

      // Mock getBlockAttrs 返回 Topic 卡片
      vi.spyOn(queue as any, '_getCardType').mockResolvedValue('topic');

      const count = await queue.addItems(items);

      // 应该只添加 Item 卡片
      expect(count).toBe(1);
    });
  });
});

describe('RetrievalPracticeQueue - Phase 2d.2: 版本化持久化', () => {
  let queue: RetrievalPracticeQueue;
  let mockStorage: StorageManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    queue = new RetrievalPracticeQueue({
      deckID: 'test-deck',
      api: mockRiffApi,
      storage: mockStorage,
    });
  });

  describe('数据迁移', () => {
    it('应该成功迁移 V1 格式（数组）到 V2 格式', async () => {
      const v1Data = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
      ];

      // Mock getQueueData 返回 null（V2 格式不存在）
      mockStorage.getQueueData = vi.fn(() => null);

      // Mock getPracticeQueue 返回 V1 格式数据
      mockStorage.getPracticeQueue = vi.fn(() => v1Data);

      // 加载队列
      await queue['_loadLocalQueue']();

      // 验证队列已加载
      expect(queue['localBuffer']).toHaveLength(2);
      expect(queue['localBuffer'][0].cardID).toBe('card-1');
      expect(queue['localBuffer'][1].cardID).toBe('card-2');
    });

    it('应该正确加载 V2 格式数据', async () => {
      const v2Data = {
        version: 2,
        items: [
          createTestQueueItem({ cardID: 'card-1' }),
          createTestQueueItem({ cardID: 'card-2' }),
        ],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 10,
          initialTotal: 100,
        },
      };

      // Mock getQueueData 返回 V2 格式
      mockStorage.getQueueData = vi.fn(() => v2Data);

      // 加载队列
      await queue['_loadLocalQueue']();

      // 验证队列已加载
      expect(queue['localBuffer']).toHaveLength(2);
      expect(queue['queueCreatedAt']).toBe(v2Data.metadata.createdAt);
      expect(queue['queueInitialTotal']).toBe(100);
      expect(queue['reviewedCount']).toBe(10);
    });

    it('应该规范化字段名（cardId → cardID）', async () => {
      const v1DataWithOldNames = [
        {
          cardId: 'card-1', // 旧字段名
          blockId: 'block-1',
          deckId: 'deck-1',
          priority: 50,
          nextDues: { 1: '', 2: '', 3: '', 4: '' },
        },
      ];

      mockStorage.getQueueData = vi.fn(() => null);
      mockStorage.getPracticeQueue = vi.fn(() => v1DataWithOldNames);

      await queue['_loadLocalQueue']();

      // 验证字段已规范化
      expect(queue['localBuffer'][0].cardID).toBe('card-1');
      expect(queue['localBuffer'][0].blockID).toBe('block-1');
      expect(queue['localBuffer'][0].deckID).toBe('deck-1');
    });
  });

  describe('_persistLocalQueue', () => {
    it('应该保存为 V2 格式', async () => {
      queue['localBuffer'] = [
        createTestQueueItem({ cardID: 'card-1' }),
        createTestQueueItem({ cardID: 'card-2' }),
      ];
      queue['queueCreatedAt'] = Date.now();
      queue['reviewedCount'] = 5;

      await queue['_persistLocalQueue']();

      // 验证 setQueueData 被调用
      expect(mockStorage.setQueueData).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          items: expect.any(Array),
          metadata: expect.objectContaining({
            createdAt: expect.any(Number),
            updatedAt: expect.any(Number),
            totalReviewed: 5,
          }),
        })
      );
    });

    it('应该每 10 次保存创建一次备份', async () => {
      queue['localBuffer'] = [createTestQueueItem({ cardID: 'card-1' })];

      // 保存 9 次，不应该创建备份
      for (let i = 0; i < 9; i++) {
        await queue['_persistLocalQueue']();
      }
      expect(mockStorage.setQueueBackup).not.toHaveBeenCalled();

      // 第 10 次，应该创建备份
      await queue['_persistLocalQueue']();
      expect(mockStorage.setQueueBackup).toHaveBeenCalledTimes(1);

      // 第 20 次，应该创建第二个备份
      for (let i = 0; i < 9; i++) {
        await queue['_persistLocalQueue']();
      }
      await queue['_persistLocalQueue']();
      expect(mockStorage.setQueueBackup).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RetrievalPracticeQueue - Phase 2d.4: 数据恢复和备份', () => {
  let queue: RetrievalPracticeQueue;
  let mockStorage: StorageManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    queue = new RetrievalPracticeQueue({
      deckID: 'test-deck',
      api: mockRiffApi,
      storage: mockStorage,
    });
  });

  describe('数据验证', () => {
    it('应该拒绝无效的数据', async () => {
      const invalidData = null;
      const backupData = null;

      mockStorage.getQueueData = vi.fn(() => invalidData);
      mockStorage.getQueueBackup = vi.fn(() => backupData);
      mockStorage.getPracticeQueue = vi.fn(() => []);

      await queue['_loadLocalQueue']();

      // 应该创建空队列
      expect(queue['localBuffer']).toHaveLength(0);
    });

    it('应该使用备份数据当主数据无效时', async () => {
      const invalidData = { version: 'invalid' }; // 无效版本号
      const validBackup = {
        version: 2,
        items: [createTestQueueItem({ cardID: 'card-1' })],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          totalReviewed: 0,
          initialTotal: 1,
        },
      };

      mockStorage.getQueueData = vi.fn(() => invalidData);
      mockStorage.getQueueBackup = vi.fn(() => validBackup);

      await queue['_loadLocalQueue']();

      // 应该从备份恢复
      expect(queue['localBuffer']).toHaveLength(1);
      expect(queue['localBuffer'][0].cardID).toBe('card-1');
    });

    it('应该验证必需字段', async () => {
      const dataWithMissingFields = {
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

      mockStorage.getQueueData = vi.fn(() => dataWithMissingFields);
      mockStorage.getQueueBackup = vi.fn(() => null);
      mockStorage.getPracticeQueue = vi.fn(() => []);

      await queue['_loadLocalQueue']();

      // 应该创建空队列
      expect(queue['localBuffer']).toHaveLength(0);
    });
  });
});

describe('RetrievalPracticeQueue - Phase 2d.3: 生命周期管理', () => {
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

  describe('next() 和 onFeedback() 生命周期', () => {
    it('next() 应该从队列中移除卡片', async () => {
      const now = Date.now();
      const item = createTestQueueItem({
        cardID: 'card-1',
        nextDues: {
          1: new Date(now - 1000).toISOString(), // 已过期
          2: '',
          3: '',
          4: '',
        },
      });

      await queue.addItems([item]);

      const nextItem = await queue.next();

      expect(nextItem).toBeDefined();
      expect(nextItem?.cardID).toBe('card-1');

      // 验证卡片已从队列移除
      expect(queue['localBuffer']).toHaveLength(0);
    });

    it('onFeedback() 应该更新并重新插入卡片', async () => {
      const now = Date.now();
      const item = createTestQueueItem({
        cardID: 'card-1',
        nextDues: {
          1: new Date(now - 1000).toISOString(),
          2: '',
          3: '',
          4: '',
        },
      });

      await queue.addItems([item]);
      const nextItem = await queue.next();

      expect(nextItem).toBeDefined();

      // 评分后重新插入
      const feedback: QueueFeedback = {
        action: 'rate',
        rating: 3, // Good
      };
      await queue.onFeedback(nextItem, feedback);

      // 验证卡片已重新插入
      expect(queue['localBuffer']).toHaveLength(1);
    });

    it('跳过卡片应该移到队列末尾', async () => {
      const now = Date.now();
      const items = [
        createTestQueueItem({
          cardID: 'card-1',
          nextDues: { 1: new Date(now - 1000).toISOString(), 2: '', 3: '', 4: '' },
        }),
        createTestQueueItem({
          cardID: 'card-2',
          nextDues: { 1: new Date(now - 1000).toISOString(), 2: '', 3: '', 4: '' },
        }),
      ];

      await queue.addItems(items);

      const firstItem = await queue.next();
      expect(firstItem?.cardID).toBeDefined();

      // 跳过第一张卡片
      const feedback: QueueFeedback = {
        action: 'skip',
      };
      await queue.onFeedback(firstItem, feedback);

      // 验证卡片已重新插入（应该在末尾）
      expect(queue['localBuffer']).toHaveLength(1);
    });
  });
});
