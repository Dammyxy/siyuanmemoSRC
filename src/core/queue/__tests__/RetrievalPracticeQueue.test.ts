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
      1: new Date(now - 1000).toISOString(), // Past date - card is due
      2: new Date(now - 2000).toISOString(),
      3: new Date(now - 3000).toISOString(),
      4: new Date(now - 4000).toISOString(),
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
    queue = await RetrievalPracticeQueue.create({
      deckID: 'test-deck',
      api: mockRiffApi,
      storage: mockStorage,
      localScheduler: new SimpleFSRSScheduler(mockFSRSParams),
    });
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

/**
 * RetrievalPracticeQueue 集成测试
 * 
 * 测试完整的评分流程，验证评分 1-2 的卡片旋转到队尾，评分 3-4 的卡片从队列移除
 * Feature: retrieval-practice-rating-fix
 * Task: 4.1 编写 RetrievalPracticeQueue 的集成测试
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 6.4**
 */
describe('RetrievalPracticeQueue - 集成测试：评分操作', () => {
  let queue: RetrievalPracticeQueue;
  let mockStorage: StorageManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    
    // Mock Riff API to return empty results
    mockRiffApi.getRiffDueCards.mockResolvedValue({
      cards: [],
      unreviewedCount: 0,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 0,
    });
    
    queue = await RetrievalPracticeQueue.create({
      deckID: 'test-deck',
      api: mockRiffApi,
      storage: mockStorage,
      localScheduler: new SimpleFSRSScheduler(mockFSRSParams),
    });
  });

  describe('评分 1 - 重来', () => {
    it('应该将卡片旋转到队列末尾', async () => {
      // Arrange: 创建测试队列状态
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      await queue.addItems(items);
      
      // 获取初始队列大小
      const initialSize = queue.getAllItems().length;
      expect(initialSize).toBe(3);

      // 获取第一张卡片
      const firstCard = queue.getAllItems()[0];
      expect(firstCard.cardID).toBe('card-1');

      // Act: 对第一张卡片评分为 1
      await queue.onFeedback(firstCard, { action: 'rate', rating: 1 });

      // Assert: 验证队列大小不变
      const finalSize = queue.getAllItems().length;
      expect(finalSize).toBe(initialSize);

      // Assert: 验证卡片被旋转到队尾
      const allItems = queue.getAllItems();
      const lastCard = allItems[allItems.length - 1];
      expect(lastCard.cardID).toBe('card-1');

      // Assert: 验证队列顺序正确
      expect(allItems[0].cardID).toBe('card-2');
      expect(allItems[1].cardID).toBe('card-3');
      expect(allItems[2].cardID).toBe('card-1');

      // Assert: 验证 Riff API 被调用
      expect(mockRiffApi.reviewRiffCard).toHaveBeenCalledWith('deck-test', 'card-1', 1);
    });

    it('应该在单卡片队列中保持队列大小为 1', async () => {
      // Arrange: 单卡片队列
      const item = createTestQueueItem({ cardID: 'card-only', blockID: 'block-only' });
      await queue.addItems([item]);

      expect(queue.getAllItems().length).toBe(1);

      // Act: 评分为 1
      await queue.onFeedback(item, { action: 'rate', rating: 1 });

      // Assert: 队列大小仍为 1
      expect(queue.getAllItems().length).toBe(1);

      // Assert: 卡片仍在队列中
      expect(queue.getAllItems()[0].cardID).toBe('card-only');
    });
  });

  describe('评分 2 - 困难', () => {
    it('应该将卡片旋转到队列末尾', async () => {
      // Arrange: 创建测试队列状态
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      await queue.addItems(items);
      
      const initialSize = queue.getAllItems().length;
      expect(initialSize).toBe(3);

      const firstCard = queue.getAllItems()[0];
      expect(firstCard.cardID).toBe('card-1');

      // Act: 对第一张卡片评分为 2
      await queue.onFeedback(firstCard, { action: 'rate', rating: 2 });

      // Assert: 验证队列大小不变
      const finalSize = queue.getAllItems().length;
      expect(finalSize).toBe(initialSize);

      // Assert: 验证卡片被旋转到队尾
      const allItems = queue.getAllItems();
      const lastCard = allItems[allItems.length - 1];
      expect(lastCard.cardID).toBe('card-1');

      // Assert: 验证队列顺序正确
      expect(allItems[0].cardID).toBe('card-2');
      expect(allItems[1].cardID).toBe('card-3');
      expect(allItems[2].cardID).toBe('card-1');

      // Assert: 验证 Riff API 被调用
      expect(mockRiffApi.reviewRiffCard).toHaveBeenCalledWith('deck-test', 'card-1', 2);
    });
  });

  describe('评分 3 - 良好', () => {
    it('应该从队列中移除卡片', async () => {
      // Arrange: 创建测试队列状态
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      await queue.addItems(items);
      
      const initialSize = queue.getAllItems().length;
      expect(initialSize).toBe(3);

      const firstCard = queue.getAllItems()[0];
      expect(firstCard.cardID).toBe('card-1');

      // Act: 对第一张卡片评分为 3
      await queue.onFeedback(firstCard, { action: 'rate', rating: 3 });

      // Assert: 验证队列大小减少 1
      const finalSize = queue.getAllItems().length;
      expect(finalSize).toBe(initialSize - 1);

      // Assert: 验证卡片被移除
      const allItems = queue.getAllItems();
      expect(allItems.find(item => item.cardID === 'card-1')).toBeUndefined();

      // Assert: 验证剩余卡片顺序正确
      expect(allItems[0].cardID).toBe('card-2');
      expect(allItems[1].cardID).toBe('card-3');

      // Assert: 验证 Riff API 被调用
      expect(mockRiffApi.reviewRiffCard).toHaveBeenCalledWith('deck-test', 'card-1', 3);
    });

    it('应该在移除最后一张卡片后队列为空', async () => {
      // Arrange: 单卡片队列
      const item = createTestQueueItem({ cardID: 'card-only', blockID: 'block-only' });
      await queue.addItems([item]);

      expect(queue.getAllItems().length).toBe(1);

      // Act: 评分为 3
      await queue.onFeedback(item, { action: 'rate', rating: 3 });

      // Assert: 队列为空
      expect(queue.getAllItems().length).toBe(0);
    });
  });

  describe('评分 4 - 简单', () => {
    it('应该从队列中移除卡片', async () => {
      // Arrange: 创建测试队列状态
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      await queue.addItems(items);
      
      const initialSize = queue.getAllItems().length;
      expect(initialSize).toBe(3);

      const firstCard = queue.getAllItems()[0];
      expect(firstCard.cardID).toBe('card-1');

      // Act: 对第一张卡片评分为 4
      await queue.onFeedback(firstCard, { action: 'rate', rating: 4 });

      // Assert: 验证队列大小减少 1
      const finalSize = queue.getAllItems().length;
      expect(finalSize).toBe(initialSize - 1);

      // Assert: 验证卡片被移除
      const allItems = queue.getAllItems();
      expect(allItems.find(item => item.cardID === 'card-1')).toBeUndefined();

      // Assert: 验证剩余卡片顺序正确
      expect(allItems[0].cardID).toBe('card-2');
      expect(allItems[1].cardID).toBe('card-3');

      // Assert: 验证 Riff API 被调用
      expect(mockRiffApi.reviewRiffCard).toHaveBeenCalledWith('deck-test', 'card-1', 4);
    });
  });

  describe('混合评分场景', () => {
    it('应该正确处理连续的不同评分操作', async () => {
      // Arrange: 创建测试队列状态
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
        createTestQueueItem({ cardID: 'card-4', blockID: 'block-4' }),
      ];

      await queue.addItems(items);
      expect(queue.getAllItems().length).toBe(4);

      // Act & Assert: 评分 1 - 旋转到队尾
      const card1 = queue.getAllItems()[0];
      expect(card1.cardID).toBe('card-1');
      await queue.onFeedback(card1, { action: 'rate', rating: 1 });
      
      expect(queue.getAllItems().length).toBe(4); // 大小不变
      expect(queue.getAllItems()[3].cardID).toBe('card-1'); // 在队尾

      // Act & Assert: 评分 3 - 移除
      const card2 = queue.getAllItems()[0];
      expect(card2.cardID).toBe('card-2');
      await queue.onFeedback(card2, { action: 'rate', rating: 3 });
      
      expect(queue.getAllItems().length).toBe(3); // 大小减少
      expect(queue.getAllItems().find(item => item.cardID === 'card-2')).toBeUndefined(); // 已移除

      // Act & Assert: 评分 2 - 旋转到队尾
      const card3 = queue.getAllItems()[0];
      expect(card3.cardID).toBe('card-3');
      await queue.onFeedback(card3, { action: 'rate', rating: 2 });
      
      expect(queue.getAllItems().length).toBe(3); // 大小不变
      expect(queue.getAllItems()[2].cardID).toBe('card-3'); // 在队尾

      // Act & Assert: 评分 4 - 移除
      const card4 = queue.getAllItems()[0];
      expect(card4.cardID).toBe('card-4');
      await queue.onFeedback(card4, { action: 'rate', rating: 4 });
      
      expect(queue.getAllItems().length).toBe(2); // 大小减少
      expect(queue.getAllItems().find(item => item.cardID === 'card-4')).toBeUndefined(); // 已移除

      // Final state: 只剩下 card-1 和 card-3（都被旋转过）
      const finalItems = queue.getAllItems();
      expect(finalItems.length).toBe(2);
      expect(finalItems[0].cardID).toBe('card-1');
      expect(finalItems[1].cardID).toBe('card-3');
    });

    it('应该正确处理多次旋转同一张卡片', async () => {
      // Arrange: 创建测试队列状态
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      await queue.addItems(items);
      expect(queue.getAllItems().length).toBe(3);

      // Act: 第一次评分 1 - card-1 旋转到队尾
      const card1_first = queue.getAllItems()[0];
      expect(card1_first.cardID).toBe('card-1');
      await queue.onFeedback(card1_first, { action: 'rate', rating: 1 });
      
      expect(queue.getAllItems().length).toBe(3);
      expect(queue.getAllItems()[2].cardID).toBe('card-1');

      // Act: 第二次评分 2 - card-2 旋转到队尾
      const card2 = queue.getAllItems()[0];
      expect(card2.cardID).toBe('card-2');
      await queue.onFeedback(card2, { action: 'rate', rating: 2 });
      
      expect(queue.getAllItems().length).toBe(3);
      expect(queue.getAllItems()[2].cardID).toBe('card-2');

      // Act: 第三次评分 1 - card-3 旋转到队尾
      const card3 = queue.getAllItems()[0];
      expect(card3.cardID).toBe('card-3');
      await queue.onFeedback(card3, { action: 'rate', rating: 1 });
      
      expect(queue.getAllItems().length).toBe(3);
      expect(queue.getAllItems()[2].cardID).toBe('card-3');

      // Act: 第四次评分 1 - card-1 再次旋转到队尾
      const card1_second = queue.getAllItems()[0];
      expect(card1_second.cardID).toBe('card-1');
      await queue.onFeedback(card1_second, { action: 'rate', rating: 1 });
      
      expect(queue.getAllItems().length).toBe(3);
      expect(queue.getAllItems()[2].cardID).toBe('card-1');

      // Final state: card-2, card-3, card-1
      const finalItems = queue.getAllItems();
      expect(finalItems[0].cardID).toBe('card-2');
      expect(finalItems[1].cardID).toBe('card-3');
      expect(finalItems[2].cardID).toBe('card-1');
    });
  });

  describe('队列统计数据', () => {
    it('应该在评分 1-2 后保持准确的队列大小', async () => {
      // Arrange
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
      ];

      await queue.addItems(items);

      // Act: 评分 1
      const card1 = queue.getAllItems()[0];
      await queue.onFeedback(card1, { action: 'rate', rating: 1 });

      // Assert: 验证 getStats 返回准确的大小
      const stats1 = await queue.getStats();
      expect(stats1.size).toBe(2);

      // Act: 评分 2
      const card2 = queue.getAllItems()[0];
      await queue.onFeedback(card2, { action: 'rate', rating: 2 });

      // Assert: 验证 getStats 返回准确的大小
      const stats2 = await queue.getStats();
      expect(stats2.size).toBe(2);
    });

    it('应该在评分 3-4 后保持准确的队列大小', async () => {
      // Arrange
      const items = [
        createTestQueueItem({ cardID: 'card-1', blockID: 'block-1' }),
        createTestQueueItem({ cardID: 'card-2', blockID: 'block-2' }),
        createTestQueueItem({ cardID: 'card-3', blockID: 'block-3' }),
      ];

      await queue.addItems(items);

      // Act: 评分 3
      const card1 = queue.getAllItems()[0];
      await queue.onFeedback(card1, { action: 'rate', rating: 3 });

      // Assert: 验证 getStats 返回准确的大小
      const stats1 = await queue.getStats();
      expect(stats1.size).toBe(2);

      // Act: 评分 4
      const card2 = queue.getAllItems()[0];
      await queue.onFeedback(card2, { action: 'rate', rating: 4 });

      // Assert: 验证 getStats 返回准确的大小
      const stats2 = await queue.getStats();
      expect(stats2.size).toBe(1);
    });
  });
});
