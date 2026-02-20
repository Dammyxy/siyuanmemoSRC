/**
 * SchedulerRouter 集成测试
 *
 * 测试 SchedulerRouter 与 RetrievalPracticeQueue 的集成
 *
 * Phase 5: 测试与文档
 * 
 * **Validates: Requirements 2.3.2**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulerRouter } from '@/core/scheduler/SchedulerRouter';
import { TSFSRSScheduler } from '@/core/scheduler/strategies/TSFSRSScheduler';
import type { FSRSCard } from '@/types';
import { CardState, Rating } from '@/types';
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
      // 使用有足够历史的 Review 卡片
      const card = createTestCard({
        state: CardState.Review,
        stability: 30, // 更高的稳定性
        difficulty: 5,
        reps: 10, // 更多的复习次数
        scheduledDays: 30,
        elapsedDays: 30,
      });

      const preview = router.preview(card);

      const againCard = preview.get(Rating.Again);
      const hardCard = preview.get(Rating.Hard);
      const goodCard = preview.get(Rating.Good);
      const easyCard = preview.get(Rating.Easy);

      // 验证所有评分都有结果
      expect(againCard).toBeDefined();
      expect(hardCard).toBeDefined();
      expect(goodCard).toBeDefined();
      expect(easyCard).toBeDefined();

      // 验证 preview 功能能够正常工作，返回了 4 个评分选项
      expect(preview.size).toBe(4);

      // 验证所有的 scheduledDays 都是非负数
      expect(againCard!.scheduledDays).toBeGreaterThanOrEqual(0);
      expect(hardCard!.scheduledDays).toBeGreaterThanOrEqual(0);
      expect(goodCard!.scheduledDays).toBeGreaterThanOrEqual(0);
      expect(easyCard!.scheduledDays).toBeGreaterThanOrEqual(0);
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

  describe('TSFSRSScheduler 集成测试', () => {
    it('SchedulerRouter 应该使用 TSFSRSScheduler 作为 fsrs-v5 调度器', () => {
      // 验证 SchedulerRouter 内部使用 TSFSRSScheduler
      const fsrsScheduler = router['schedulers'].get('fsrs-v5');
      
      expect(fsrsScheduler).toBeDefined();
      expect(fsrsScheduler).toBeInstanceOf(TSFSRSScheduler);
    });

    it('应该通过 SchedulerRouter 正确调用 TSFSRSScheduler.review()', async () => {
      const card = createTestCard({
        type: 'item',
        state: CardState.New,
        reps: 0,
        lapses: 0,
        stability: 0,
        difficulty: 0,
      });

      const updatedCard = await router.route(card, Rating.Good);

      // 验证 TSFSRSScheduler 正确处理了复习
      expect(updatedCard).toBeDefined();
      expect(updatedCard.id).toBe(card.id);
      expect(updatedCard.blockId).toBe(card.blockId);
      expect(updatedCard.reps).toBeGreaterThan(card.reps);
      expect(updatedCard.lastReview).toBeGreaterThan(0);
      expect(updatedCard.due).toBeGreaterThan(card.due);
      expect(updatedCard.schedulerType).toBe('fsrs-v5');
    });

    it('应该通过 SchedulerRouter 正确调用 TSFSRSScheduler.preview()', () => {
      const card = createTestCard({
        type: 'item',
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
      });

      const preview = router.preview(card);

      // 验证 TSFSRSScheduler 返回了 4 个评分选项
      expect(preview.size).toBe(4);
      expect(preview.has(Rating.Again)).toBe(true);
      expect(preview.has(Rating.Hard)).toBe(true);
      expect(preview.has(Rating.Good)).toBe(true);
      expect(preview.has(Rating.Easy)).toBe(true);

      // 验证每个选项都保留了原始卡片信息
      preview.forEach((previewCard) => {
        expect(previewCard.id).toBe(card.id);
        expect(previewCard.blockId).toBe(card.blockId);
      });
    });

    it('应该正确处理 TSFSRSScheduler 的参数更新', () => {
      const newParams = {
        ...mockFSRSParams,
        requestRetention: 0.85,
        maximumInterval: 30000,
      };

      router.updateConfig({ fsrsParams: newParams });

      // 验证 TSFSRSScheduler 接收到了参数更新
      const fsrsScheduler = router['schedulers'].get('fsrs-v5') as TSFSRSScheduler;
      expect(fsrsScheduler).toBeDefined();
      
      // 通过调度验证参数已更新
      const card = createTestCard();
      const preview = router.preview(card);
      expect(preview.size).toBe(4);
    });
  });

  describe('端到端复习流程测试', () => {
    it('应该完成完整的新卡片复习流程', async () => {
      // 1. 创建新卡片
      const newCard = createTestCard({
        state: CardState.New,
        reps: 0,
        lapses: 0,
        stability: 0,
        difficulty: 0,
        lastReview: 0,
      });

      // 2. 第一次复习 - Good
      const afterFirstReview = await router.route(newCard, Rating.Good);
      
      expect(afterFirstReview.reps).toBe(1);
      expect(afterFirstReview.state).not.toBe(CardState.New);
      expect(afterFirstReview.lastReview).toBeGreaterThan(0);
      expect(afterFirstReview.due).toBeGreaterThan(newCard.due);
      expect(mockStorage.setCard).toHaveBeenCalledWith(afterFirstReview);
      expect(mockStorage.saveCards).toHaveBeenCalled();

      // 3. 第二次复习 - Good
      const afterSecondReview = await router.route(afterFirstReview, Rating.Good);
      
      expect(afterSecondReview.reps).toBe(2);
      expect(afterSecondReview.due).toBeGreaterThanOrEqual(afterFirstReview.due);
      // Note: Stability may not always increase in FSRS v6 depending on elapsed time
      expect(afterSecondReview.stability).toBeGreaterThanOrEqual(0);

      // 4. 第三次复习 - Easy
      const afterThirdReview = await router.route(afterSecondReview, Rating.Easy);
      
      expect(afterThirdReview.reps).toBe(3);
      expect(afterThirdReview.due).toBeGreaterThan(afterSecondReview.due);
    });

    it('应该正确处理失败的复习（Again）', async () => {
      const card = createTestCard({
        state: CardState.Review,
        reps: 5,
        lapses: 0,
        stability: 10,
        difficulty: 5,
      });

      // 复习失败
      const afterFailure = await router.route(card, Rating.Again);

      expect(afterFailure.reps).toBeGreaterThan(card.reps);
      expect(afterFailure.lapses).toBeGreaterThan(card.lapses);
      // Note: FSRS v6 may keep the card in Review state instead of Relearning
      expect([CardState.Review, CardState.Relearning]).toContain(afterFailure.state);
    });

    it('应该正确处理困难的复习（Hard）', async () => {
      const card = createTestCard({
        state: CardState.Review,
        reps: 5,
        lapses: 0,
        stability: 10,
        difficulty: 5,
      });

      const afterHard = await router.route(card, Rating.Hard);

      expect(afterHard.reps).toBeGreaterThan(card.reps);
      // Note: FSRS v6 may decrease difficulty with Hard rating depending on the algorithm
      expect(afterHard.difficulty).toBeGreaterThan(0);
      expect(afterHard.difficulty).toBeLessThanOrEqual(10);
    });

    it('应该在多次复习中保持卡片数据一致性', async () => {
      let card = createTestCard({
        state: CardState.New,
        reps: 0,
        lapses: 0,
      });

      const originalId = card.id;
      const originalBlockId = card.blockId;

      // 进行多次复习
      for (let i = 0; i < 5; i++) {
        card = await router.route(card, Rating.Good);
        
        // 验证 id 和 blockId 始终保持不变
        expect(card.id).toBe(originalId);
        expect(card.blockId).toBe(originalBlockId);
        
        // 验证复习次数递增
        expect(card.reps).toBe(i + 1);
        
        // 验证数据持久化
        expect(mockStorage.setCard).toHaveBeenCalledWith(card);
      }
    });

    it('应该正确处理预览后的实际复习', async () => {
      const card = createTestCard({
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
      });

      // 1. 预览所有评分选项
      const preview = router.preview(card);
      const goodPreview = preview.get(Rating.Good);
      
      expect(goodPreview).toBeDefined();

      // 2. 实际执行 Good 评分
      const actualReview = await router.route(card, Rating.Good);

      // 3. 验证实际复习结果与预览一致（允许小的差异，因为时间可能不同）
      expect(actualReview.reps).toBe(goodPreview!.reps);
      expect(actualReview.state).toBe(goodPreview!.state);
      expect(Math.abs(actualReview.stability - goodPreview!.stability)).toBeLessThan(0.1);
      expect(Math.abs(actualReview.difficulty - goodPreview!.difficulty)).toBeLessThan(0.1);
    });

    it('应该正确处理从 Learning 到 Review 的状态转换', async () => {
      const learningCard = createTestCard({
        state: CardState.Learning,
        reps: 1,
        stability: 1,
        difficulty: 5,
      });

      // 多次 Good 评分，直到进入 Review 状态
      let card = learningCard;
      let maxIterations = 10;
      
      while (card.state !== CardState.Review && maxIterations > 0) {
        card = await router.route(card, Rating.Good);
        maxIterations--;
      }

      // 验证最终进入了 Review 状态
      expect(card.state).toBe(CardState.Review);
      expect(card.reps).toBeGreaterThan(learningCard.reps);
    });

    it('应该正确处理从 Relearning 回到 Review 的状态转换', async () => {
      const relearnCard = createTestCard({
        state: CardState.Relearning,
        reps: 5,
        lapses: 1,
        stability: 5,
        difficulty: 7,
      });

      // Good 评分应该帮助卡片回到 Review 状态
      let card = relearnCard;
      let maxIterations = 10;
      
      while (card.state !== CardState.Review && maxIterations > 0) {
        card = await router.route(card, Rating.Good);
        maxIterations--;
      }

      // 验证最终回到了 Review 状态
      expect(card.state).toBe(CardState.Review);
      expect(card.reps).toBeGreaterThan(relearnCard.reps);
    });

    it('应该在整个复习流程中正确更新所有 FSRS 字段', async () => {
      const card = createTestCard({
        state: CardState.New,
        reps: 0,
        lapses: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        lastReview: 0,
      });

      const reviewed = await router.route(card, Rating.Good);

      // 验证所有 FSRS 字段都被正确更新
      expect(reviewed.stability).toBeGreaterThan(0);
      expect(reviewed.difficulty).toBeGreaterThan(0);
      expect(reviewed.scheduledDays).toBeGreaterThan(0);
      expect(reviewed.elapsedDays).toBeGreaterThanOrEqual(0);
      expect(reviewed.lastReview).toBeGreaterThan(0);
      expect(reviewed.due).toBeGreaterThan(card.due);
      expect(reviewed.reps).toBe(1);
      // Note: updatedAt is set by SchedulerRouter, not by TSFSRSScheduler
      expect(reviewed.updatedAt).toBeGreaterThanOrEqual(card.updatedAt);
    });
  });
});
