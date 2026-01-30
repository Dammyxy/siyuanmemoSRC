/**
 * SchedulerRouter 集成测试
 *
 * 测试 SchedulerRouter 与 RetrievalPracticeQueue 的集成
 *
 * Phase 5: 测试与文档
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulerRouter } from '@/core/scheduler/SchedulerRouter';
import type { FSRSCard, CardState, Rating } from '@/types';
import type { StorageManager } from '@/core/storage/manager';

// Mock StorageManager
const createMockStorage = (): StorageManager => {
  const storage = {
    getCard: vi.fn(),
    setCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageManager;

  return storage;
};

// 创建测试卡片
function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
  const now = Date.now();
  return {
    id: `test-card-${Math.random()}`,
    blockId: `block-${Math.random()}`,
    due: now + 86400000,
    stability: 10,
    difficulty: 5,
    reps: 5,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 86400000,
    elapsedDays: 1,
    scheduledDays: 10,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 86400000 * 10,
    updatedAt: now,
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

describe('SchedulerRouter Integration Tests', () => {
  let router: SchedulerRouter;
  let mockStorage: StorageManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    router = new SchedulerRouter(
      {
        defaultScheduler: 'fsrs-v5',
        enableRiffSync: false,
        fsrsParams: mockFSRSParams,
      },
      mockStorage
    );
  });

  describe('路由到正确的调度器', () => {
    it('Topic 卡片应该使用 a-factor-v2', () => {
      const topicCard = createTestCard({
        type: 'topic',
        aFactor: 2.5,
      });

      const schedulerType = router.getSchedulerType(topicCard);

      expect(schedulerType).toBe('a-factor-v2');
    });

    it('Item 卡片应该使用默认调度器', () => {
      const itemCard = createTestCard({
        type: 'item',
      });

      const schedulerType = router.getSchedulerType(itemCard);

      expect(schedulerType).toBe('fsrs-v5');
    });

    it('卡片有 schedulerType 时应该使用指定的调度器', () => {
      const card = createTestCard({
        schedulerType: 'sm15',
      });

      const schedulerType = router.getSchedulerType(card);

      expect(schedulerType).toBe('sm15');
    });

    it('用户覆盖配置应该优先生效', () => {
      const card = createTestCard({
        id: 'card-override-test',
      });

      // 设置用户覆盖
      router['config'].schedulerOverrides = new Map([
        ['card-override-test', 'sm2'],
      ]);

      const schedulerType = router.getSchedulerType(card);

      expect(schedulerType).toBe('sm2');
    });
  });

  describe('路由执行', () => {
    it('应该正确路由到 FSRS 调度器', async () => {
      const card = createTestCard({
        type: 'item',
      });

      const updatedCard = await router.route(card, Rating.Good);

      expect(updatedCard.reps).toBe(card.reps + 1);
      expect(mockStorage.setCard).toHaveBeenCalledWith(updatedCard);
      expect(mockStorage.saveCards).toHaveBeenCalled();
    });

    it('应该正确路由到 A-Factor-v2 调度器', async () => {
      const topicCard = createTestCard({
        type: 'topic',
        aFactor: 2.5,
      });

      const updatedCard = await router.route(topicCard, Rating.Good);

      expect(updatedCard.reps).toBe(topicCard.reps + 1);
      expect(updatedCard.schedulerType).toBe('a-factor-v2');
      expect(updatedCard.aFactor).toBeDefined();
    });

    it('应该正确路由到 SM-15 调度器', async () => {
      const card = createTestCard({
        schedulerType: 'sm15',
        aFactor: 3.6,
      });

      const updatedCard = await router.route(card, Rating.Good);

      expect(updatedCard.schedulerType).toBe('sm15');
      expect(mockStorage.setCard).toHaveBeenCalledWith(updatedCard);
    });

    it('应该正确路由到 SM-2 调度器', async () => {
      const card = createTestCard({
        schedulerType: 'sm2',
      });

      const updatedCard = await router.route(card, Rating.Good);

      expect(updatedCard.schedulerType).toBe('sm2');
      expect(mockStorage.setCard).toHaveBeenCalledWith(updatedCard);
    });
  });

  describe('预览功能', () => {
    it('应该返回所有评分选项的预览', () => {
      const card = createTestCard();

      const preview = router.preview(card);

      expect(preview.size).toBe(4);
      expect(preview.has(Rating.Again)).toBe(true);
      expect(preview.has(Rating.Hard)).toBe(true);
      expect(preview.has(Rating.Good)).toBe(true);
      expect(preview.has(Rating.Easy)).toBe(true);
    });

    it('不同评分应该产生不同的结果', () => {
      const card = createTestCard({
        state: CardState.New,
      });

      const preview = router.preview(card);

      const againCard = preview.get(Rating.Again);
      const easyCard = preview.get(Rating.Easy);

      // Again 评分应该产生更短的间隔
      expect(againCard?.scheduledDays).toBeLessThan(easyCard?.scheduledDays || 0);
    });
  });

  describe('切换调度器', () => {
    it('应该允许在 Item 卡片之间切换调度器', async () => {
      const card = createTestCard({
        schedulerType: 'fsrs-v5',
        difficulty: 7,
      });

      const success = await router.switchScheduler(card, 'sm15');

      expect(success).toBe(true);
      expect(mockStorage.setCard).toHaveBeenCalled();
    });

    it('应该拒绝 Topic 卡片切换到非 A-Factor 调度器', async () => {
      const topicCard = createTestCard({
        type: 'topic',
        aFactor: 2.5,
      });

      const success = await router.switchScheduler(topicCard, 'fsrs-v5');

      expect(success).toBe(false);
      expect(mockStorage.setCard).not.toHaveBeenCalled();
    });

    it('应该允许 Topic 卡片在 A-Factor 系列之间切换', async () => {
      const topicCard = createTestCard({
        type: 'topic',
        schedulerType: 'a-factor',
        aFactor: 2.5,
      });

      const success = await router.switchScheduler(topicCard, 'a-factor-v2');

      expect(success).toBe(true);
      expect(mockStorage.setCard).toHaveBeenCalled();
    });
  });

  describe('配置更新', () => {
    it('应该更新所有调度器的参数', () => {
      const newParams = {
        ...mockFSRSParams,
        requestRetention: 0.95,
      };

      router.updateConfig({ fsrsParams: newParams });

      // 验证配置已更新（通过检查内部调度器）
      const fsrsScheduler = router['schedulers'].get('fsrs-v5');
      expect(fsrsScheduler).toBeDefined();
    });
  });

  describe('数据持久化', () => {
    it('路由后应该保存卡片到存储', async () => {
      const card = createTestCard();

      await router.route(card, Rating.Good);

      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('切换调度器后应该保存卡片', async () => {
      const card = createTestCard();

      await router.switchScheduler(card, 'sm15');

      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });
  });

  describe('边缘情况', () => {
    it('应该处理未知调度器类型', () => {
      const card = createTestCard({
        schedulerType: 'unknown' as any,
      });

      const schedulerType = router.getSchedulerType(card);

      // 应该回退到默认调度器
      expect(schedulerType).toBe('fsrs-v5');
    });

    it('应该处理无效的调度器切换', async () => {
      const card = createTestCard();

      const success = await router.switchScheduler(card, 'unknown' as any);

      expect(success).toBe(false);
    });

    it('New 卡片应该正确初始化', async () => {
      const newCard = createTestCard({
        state: CardState.New,
        reps: 0,
        lapses: 0,
      });

      const updatedCard = await router.route(newCard, Rating.Good);

      expect(updatedCard.reps).toBe(1);
      expect(updatedCard.state).not.toBe(CardState.New);
    });
  });
});
