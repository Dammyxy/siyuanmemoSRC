/**
 * TSFSRSScheduler 功能测试
 * 
 * 在实际环境中测试 TSFSRSScheduler 的复习功能
 * 验证卡片调度是否正常，确认使用 TSFSRSScheduler
 * 
 * **Validates: Requirements 5.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TSFSRSScheduler } from '@/core/scheduler/strategies/TSFSRSScheduler';
import { SchedulerRouter } from '@/core/scheduler/SchedulerRouter';
import type { FSRSCard, FSRSParameters } from '@/types';
import { CardState, Rating } from '@/types';
import type { StorageManager } from '@/core/storage/manager';
import { vi } from 'vitest';

// Mock StorageManager
const createMockStorage = (): StorageManager => {
  return {
    getCard: vi.fn(),
    setCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageManager;
};

// 创建测试卡片
function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
  const now = Date.now();
  return {
    id: `test-card-${Math.random()}`,
    blockId: `block-${Math.random()}`,
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// 默认 FSRS 参数
const defaultFSRSParams: FSRSParameters = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  weights: [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
    0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61, 0.0, 0.0
  ],
  enableFuzz: false, // 禁用模糊化以便测试结果可预测
};

describe('TSFSRSScheduler 功能测试', () => {
  let scheduler: TSFSRSScheduler;

  beforeEach(() => {
    scheduler = new TSFSRSScheduler(defaultFSRSParams);
    console.log('✓ TSFSRSScheduler 实例已创建');
  });

  describe('1. 基本复习功能', () => {
    it('应该正确处理新卡片的首次复习', () => {
      console.log('\n--- 测试：新卡片首次复习 ---');
      
      const newCard = createTestCard({
        state: CardState.New,
        reps: 0,
        stability: 0,
        difficulty: 0,
      });
      
      console.log('原始卡片:', {
        state: newCard.state,
        reps: newCard.reps,
        stability: newCard.stability,
        difficulty: newCard.difficulty,
      });

      const reviewedCard = scheduler.review(newCard, Rating.Good);
      
      console.log('复习后卡片:', {
        state: reviewedCard.state,
        reps: reviewedCard.reps,
        stability: reviewedCard.stability,
        difficulty: reviewedCard.difficulty,
        scheduledDays: reviewedCard.scheduledDays,
      });

      // 验证卡片状态变化
      expect(reviewedCard.reps).toBe(1);
      expect(reviewedCard.state).not.toBe(CardState.New);
      expect(reviewedCard.stability).toBeGreaterThan(0);
      expect(reviewedCard.difficulty).toBeGreaterThan(0);
      expect(reviewedCard.scheduledDays).toBeGreaterThan(0);
      expect(reviewedCard.lastReview).toBeGreaterThan(0);
      
      console.log('✓ 新卡片首次复习成功');
    });

    it('应该正确处理不同评分（Again, Hard, Good, Easy）', () => {
      console.log('\n--- 测试：不同评分的影响 ---');
      
      const baseCard = createTestCard({
        state: CardState.Review,
        reps: 5,
        stability: 10,
        difficulty: 5,
        scheduledDays: 10,
        elapsedDays: 10,
      });

      const ratings = [
        { rating: Rating.Again, name: 'Again' },
        { rating: Rating.Hard, name: 'Hard' },
        { rating: Rating.Good, name: 'Good' },
        { rating: Rating.Easy, name: 'Easy' },
      ];

      const results: Array<{ rating: string; scheduledDays: number; stability: number }> = [];

      ratings.forEach(({ rating, name }) => {
        const reviewed = scheduler.review(baseCard, rating);
        results.push({
          rating: name,
          scheduledDays: reviewed.scheduledDays,
          stability: reviewed.stability,
        });
        
        console.log(`${name} 评分:`, {
          scheduledDays: reviewed.scheduledDays,
          stability: reviewed.stability.toFixed(2),
          difficulty: reviewed.difficulty.toFixed(2),
        });
      });

      // 验证评分顺序：Again < Hard < Good < Easy
      expect(results[0].scheduledDays).toBeLessThan(results[1].scheduledDays);
      expect(results[1].scheduledDays).toBeLessThan(results[2].scheduledDays);
      expect(results[2].scheduledDays).toBeLessThan(results[3].scheduledDays);
      
      console.log('✓ 不同评分产生了预期的调度间隔');
    });

    it('应该正确处理失败复习（Again）', () => {
      console.log('\n--- 测试：失败复习 ---');
      
      const card = createTestCard({
        state: CardState.Review,
        reps: 5,
        lapses: 0,
        stability: 10,
        difficulty: 5,
      });
      
      console.log('复习前:', {
        state: card.state,
        lapses: card.lapses,
        stability: card.stability,
      });

      const failedCard = scheduler.review(card, Rating.Again);
      
      console.log('复习后:', {
        state: failedCard.state,
        lapses: failedCard.lapses,
        stability: failedCard.stability,
      });

      // 验证失败处理
      expect(failedCard.lapses).toBeGreaterThan(card.lapses);
      expect(failedCard.reps).toBeGreaterThan(card.reps);
      
      console.log('✓ 失败复习正确处理');
    });
  });

  describe('2. 预览功能', () => {
    it('应该返回所有 4 个评分选项的预览', () => {
      console.log('\n--- 测试：预览功能 ---');
      
      const card = createTestCard({
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
        reps: 5,
      });

      const preview = scheduler.preview(card);
      
      console.log('预览结果:');
      preview.forEach((previewCard, rating) => {
        const ratingName = ['', 'Again', 'Hard', 'Good', 'Easy'][rating];
        console.log(`  ${ratingName}:`, {
          scheduledDays: previewCard.scheduledDays,
          stability: previewCard.stability.toFixed(2),
          due: new Date(previewCard.due).toISOString().split('T')[0],
        });
      });

      // 验证预览结果
      expect(preview.size).toBe(4);
      expect(preview.has(Rating.Again)).toBe(true);
      expect(preview.has(Rating.Hard)).toBe(true);
      expect(preview.has(Rating.Good)).toBe(true);
      expect(preview.has(Rating.Easy)).toBe(true);

      // 验证所有预览都保留了原始卡片信息
      preview.forEach((previewCard) => {
        expect(previewCard.id).toBe(card.id);
        expect(previewCard.blockId).toBe(card.blockId);
      });
      
      console.log('✓ 预览功能正常工作');
    });

    it('预览结果应该与实际复习一致', () => {
      console.log('\n--- 测试：预览与实际复习一致性 ---');
      
      const card = createTestCard({
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
        reps: 5,
      });

      const now = new Date();
      const preview = scheduler.preview(card, now);
      const goodPreview = preview.get(Rating.Good)!;
      
      console.log('预览 Good 评分:', {
        scheduledDays: goodPreview.scheduledDays,
        stability: goodPreview.stability.toFixed(2),
      });

      const actualReview = scheduler.review(card, Rating.Good, now);
      
      console.log('实际 Good 评分:', {
        scheduledDays: actualReview.scheduledDays,
        stability: actualReview.stability.toFixed(2),
      });

      // 验证预览与实际复习一致
      expect(actualReview.scheduledDays).toBe(goodPreview.scheduledDays);
      expect(actualReview.stability).toBeCloseTo(goodPreview.stability, 2);
      expect(actualReview.difficulty).toBeCloseTo(goodPreview.difficulty, 2);
      
      console.log('✓ 预览与实际复习结果一致');
    });
  });

  describe('3. 可提取性（Retrievability）', () => {
    it('应该正确计算卡片的可提取性', () => {
      console.log('\n--- 测试：可提取性计算 ---');
      
      const card = createTestCard({
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
        reps: 5,
        lastReview: Date.now() - 5 * 86400000, // 5 天前
      });

      const retrievability = scheduler.getRetrievability(card);
      
      console.log('可提取性:', {
        value: retrievability.toFixed(4),
        percentage: (retrievability * 100).toFixed(2) + '%',
      });

      // 验证可提取性在合理范围内
      expect(retrievability).toBeGreaterThan(0);
      expect(retrievability).toBeLessThanOrEqual(1);
      
      console.log('✓ 可提取性计算正常');
    });

    it('可提取性应该随时间递减', () => {
      console.log('\n--- 测试：可提取性随时间递减 ---');
      
      const card = createTestCard({
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
        reps: 5,
        lastReview: Date.now() - 5 * 86400000,
      });

      const now = new Date();
      const r1 = scheduler.getRetrievability(card, now);
      
      const later = new Date(now.getTime() + 5 * 86400000); // 5 天后
      const r2 = scheduler.getRetrievability(card, later);
      
      console.log('当前可提取性:', r1.toFixed(4));
      console.log('5天后可提取性:', r2.toFixed(4));

      // 验证可提取性递减
      expect(r2).toBeLessThan(r1);
      
      console.log('✓ 可提取性随时间正确递减');
    });
  });

  describe('4. 参数更新', () => {
    it('应该正确更新 FSRS 参数', () => {
      console.log('\n--- 测试：参数更新 ---');
      
      const newParams: FSRSParameters = {
        ...defaultFSRSParams,
        requestRetention: 0.85,
        maximumInterval: 30000,
      };

      console.log('更新参数:', {
        requestRetention: newParams.requestRetention,
        maximumInterval: newParams.maximumInterval,
      });

      scheduler.updateParams(newParams);

      // 验证参数更新后调度器仍然工作
      const card = createTestCard({
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
      });

      const reviewed = scheduler.review(card, Rating.Good);
      
      console.log('参数更新后复习结果:', {
        scheduledDays: reviewed.scheduledDays,
        stability: reviewed.stability.toFixed(2),
      });

      expect(reviewed.scheduledDays).toBeGreaterThan(0);
      expect(reviewed.scheduledDays).toBeLessThanOrEqual(newParams.maximumInterval);
      
      console.log('✓ 参数更新成功');
    });
  });

  describe('5. 完整复习流程', () => {
    it('应该完成从 New 到 Review 的完整流程', () => {
      console.log('\n--- 测试：完整复习流程 ---');
      
      let card = createTestCard({
        state: CardState.New,
        reps: 0,
        stability: 0,
        difficulty: 0,
      });

      console.log('初始状态:', {
        state: CardState[card.state],
        reps: card.reps,
      });

      // 进行多次复习
      const reviewHistory: Array<{ reps: number; state: string; scheduledDays: number }> = [];
      
      for (let i = 0; i < 5; i++) {
        card = scheduler.review(card, Rating.Good);
        reviewHistory.push({
          reps: card.reps,
          state: CardState[card.state],
          scheduledDays: card.scheduledDays,
        });
        
        console.log(`复习 ${i + 1}:`, {
          state: CardState[card.state],
          reps: card.reps,
          scheduledDays: card.scheduledDays,
          stability: card.stability.toFixed(2),
        });
      }

      // 验证复习流程
      expect(card.reps).toBe(5);
      expect(card.state).toBe(CardState.Review);
      expect(card.stability).toBeGreaterThan(0);
      
      console.log('✓ 完整复习流程成功');
      console.log('复习历史:', reviewHistory);
    });
  });
});

describe('SchedulerRouter 与 TSFSRSScheduler 集成功能测试', () => {
  let router: SchedulerRouter;
  let mockStorage: StorageManager;

  beforeEach(() => {
    mockStorage = createMockStorage();
    router = new SchedulerRouter(
      {
        defaultScheduler: 'fsrs-v5',
        enableRiffSync: false,
        fsrsParams: defaultFSRSParams,
      },
      mockStorage
    );
    console.log('✓ SchedulerRouter 实例已创建');
  });

  describe('6. SchedulerRouter 使用 TSFSRSScheduler', () => {
    it('应该确认 SchedulerRouter 使用 TSFSRSScheduler', () => {
      console.log('\n--- 测试：确认使用 TSFSRSScheduler ---');
      
      const fsrsScheduler = router['schedulers'].get('fsrs-v5');
      
      console.log('fsrs-v5 调度器类型:', fsrsScheduler?.constructor.name);
      
      expect(fsrsScheduler).toBeDefined();
      expect(fsrsScheduler).toBeInstanceOf(TSFSRSScheduler);
      
      console.log('✓ 确认 SchedulerRouter 使用 TSFSRSScheduler');
    });

    it('应该通过 SchedulerRouter 正确调度卡片', async () => {
      console.log('\n--- 测试：通过 SchedulerRouter 调度 ---');
      
      const card = createTestCard({
        type: 'item',
        state: CardState.New,
      });
      
      console.log('调度前:', {
        type: card.type,
        state: CardState[card.state],
        reps: card.reps,
      });

      const reviewed = await router.route(card, Rating.Good);
      
      console.log('调度后:', {
        schedulerType: reviewed.schedulerType,
        state: CardState[reviewed.state],
        reps: reviewed.reps,
        scheduledDays: reviewed.scheduledDays,
      });

      // 验证调度结果
      expect(reviewed.schedulerType).toBe('fsrs-v5');
      expect(reviewed.reps).toBeGreaterThan(card.reps);
      expect(mockStorage.setCard).toHaveBeenCalledWith(reviewed);
      expect(mockStorage.saveCards).toHaveBeenCalled();
      
      console.log('✓ SchedulerRouter 调度成功');
    });

    it('应该通过 SchedulerRouter 正确预览', () => {
      console.log('\n--- 测试：通过 SchedulerRouter 预览 ---');
      
      const card = createTestCard({
        type: 'item',
        state: CardState.Review,
        stability: 10,
        difficulty: 5,
      });

      const preview = router.preview(card);
      
      console.log('预览结果数量:', preview.size);
      preview.forEach((previewCard, rating) => {
        const ratingName = ['', 'Again', 'Hard', 'Good', 'Easy'][rating];
        console.log(`  ${ratingName}: ${previewCard.scheduledDays} 天`);
      });

      expect(preview.size).toBe(4);
      
      console.log('✓ SchedulerRouter 预览成功');
    });
  });

  describe('7. 端到端复习流程', () => {
    it('应该完成完整的端到端复习流程', async () => {
      console.log('\n--- 测试：端到端复习流程 ---');
      
      let card = createTestCard({
        type: 'item',
        state: CardState.New,
        reps: 0,
      });

      const originalId = card.id;
      const originalBlockId = card.blockId;

      console.log('开始复习流程...');
      console.log('卡片 ID:', originalId);

      // 进行 5 次复习
      for (let i = 0; i < 5; i++) {
        card = await router.route(card, Rating.Good);
        
        console.log(`复习 ${i + 1}:`, {
          reps: card.reps,
          state: CardState[card.state],
          scheduledDays: card.scheduledDays,
          stability: card.stability.toFixed(2),
        });

        // 验证卡片 ID 保持不变
        expect(card.id).toBe(originalId);
        expect(card.blockId).toBe(originalBlockId);
        expect(card.reps).toBe(i + 1);
      }

      // 验证最终状态
      expect(card.state).toBe(CardState.Review);
      expect(card.schedulerType).toBe('fsrs-v5');
      expect(mockStorage.setCard).toHaveBeenCalledTimes(5);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(5);
      
      console.log('✓ 端到端复习流程成功');
    });
  });
});
