/**
 * Invalid Date Fix - 集成测试
 * 
 * 测试在实际队列加载场景中，包含无效 due 值的卡片不会导致队列加载失败
 * 
 * @see .kiro/specs/invalid-date-fix/design.md
 * @see .kiro/specs/invalid-date-fix/requirements.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import type { StorageManager } from '../../../storage/StorageManager';
import type { SchedulerRouter } from '../../../scheduler/SchedulerRouter';
import type { FSRSCard } from '../../../types/card';

describe('Invalid Date Fix - 集成测试', () => {
  let mockStorage: StorageManager;
  let mockSchedulerRouter: SchedulerRouter;
  let mockGetRiffDueCards: any;

  beforeEach(() => {
    // Mock StorageManager
    mockStorage = {
      getCard: vi.fn((cardID: string) => {
        // 返回包含无效 due 值的卡片
        return {
          id: cardID,
          blockId: `block-${cardID}`,
          due: NaN, // 无效的 due 值
          stability: 0,
          difficulty: 5,
          reps: 0,
          lapses: 0,
          state: 0,
          lastReview: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          priority: 50,
          type: 'item',
          tags: [],
          leechCount: 0,
          isLeech: false,
          skipped: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as FSRSCard;
      }),
      setCard: vi.fn(),
      saveCards: vi.fn(),
      getIncrementalLearningQueue: vi.fn(() => []),
      setIncrementalLearningQueue: vi.fn(),
      addToRiffBlacklist: vi.fn(),
    } as any;

    // Mock SchedulerRouter
    mockSchedulerRouter = {
      preview: vi.fn((card: FSRSCard) => {
        // 返回包含无效 due 值的预测结果
        const invalidDue = NaN;
        return new Map([
          [1, { ...card, due: invalidDue }],
          [2, { ...card, due: invalidDue }],
          [3, { ...card, due: invalidDue }],
          [4, { ...card, due: invalidDue }],
        ]);
      }),
      route: vi.fn(),
    } as any;

    // Mock Riff API
    mockGetRiffDueCards = vi.fn(async () => ({
      cards: [
        {
          cardID: 'card-with-invalid-due',
          blockID: 'block-1',
          deckID: 'test-deck',
          state: 0,
          reps: 0,
          lapses: 0,
        },
      ],
      unreviewedCount: 1,
      unreviewedNewCardCount: 1,
      unreviewedOldCardCount: 0,
    }));
  });

  it('应该能够加载包含无效 due 值的卡片而不抛出异常', async () => {
    const queue = new IncrementalLearningQueue({
      deckID: 'test-deck',
      storage: mockStorage,
      schedulerRouter: mockSchedulerRouter,
      api: {
        getRiffDueCards: mockGetRiffDueCards,
        reviewRiffCard: vi.fn(),
        skipReviewRiffCard: vi.fn(),
      },
    });

    // 这个调用应该不会抛出异常
    await expect(queue.getStats()).resolves.toBeDefined();
  });

  it('应该为包含无效 due 值的卡片生成有效的 nextDues', async () => {
    const queue = new IncrementalLearningQueue({
      deckID: 'test-deck',
      storage: mockStorage,
      schedulerRouter: mockSchedulerRouter,
      api: {
        getRiffDueCards: mockGetRiffDueCards,
        reviewRiffCard: vi.fn(),
        skipReviewRiffCard: vi.fn(),
      },
    });

    // 触发队列加载
    await queue.getStats();

    // 获取所有卡片
    const cards = await queue.getAllCards();

    // 验证卡片存在
    expect(cards.length).toBeGreaterThan(0);

    // 验证每张卡片的 nextDues 都是有效的 ISO 字符串
    for (const card of cards) {
      expect(card.nextDues).toBeDefined();
      expect(card.nextDues[1]).toBeTruthy();
      expect(card.nextDues[2]).toBeTruthy();
      expect(card.nextDues[3]).toBeTruthy();
      expect(card.nextDues[4]).toBeTruthy();

      // 验证每个 nextDues 都可以被解析为有效的日期
      expect(Date.parse(card.nextDues[1])).not.toBeNaN();
      expect(Date.parse(card.nextDues[2])).not.toBeNaN();
      expect(Date.parse(card.nextDues[3])).not.toBeNaN();
      expect(Date.parse(card.nextDues[4])).not.toBeNaN();

      // 验证 ISO 字符串格式
      expect(card.nextDues[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(card.nextDues[2]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(card.nextDues[3]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(card.nextDues[4]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('应该在遇到无效 due 值时记录警告日志', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const queue = new IncrementalLearningQueue({
      deckID: 'test-deck',
      storage: mockStorage,
      schedulerRouter: mockSchedulerRouter,
      api: {
        getRiffDueCards: mockGetRiffDueCards,
        reviewRiffCard: vi.fn(),
        skipReviewRiffCard: vi.fn(),
      },
    });

    // 触发队列加载
    await queue.getStats();

    // 验证警告日志被调用
    expect(consoleWarnSpy).toHaveBeenCalled();
    
    // 验证日志包含正确的信息
    const warnCalls = consoleWarnSpy.mock.calls;
    const invalidDateWarnings = warnCalls.filter(call => 
      call[0] === '[SiYuanMemo][IncrementalLearningQueue] Invalid due time detected:'
    );
    
    expect(invalidDateWarnings.length).toBeGreaterThan(0);

    consoleWarnSpy.mockRestore();
  });

  it('应该能够处理混合有效和无效 due 值的卡片', async () => {
    // 修改 mock 返回混合数据
    mockSchedulerRouter.preview = vi.fn((card: FSRSCard) => {
      const validDue = Date.now() + 86400000; // 明天
      const invalidDue = NaN;
      return new Map([
        [1, { ...card, due: invalidDue }], // 无效
        [2, { ...card, due: validDue }],   // 有效
        [3, { ...card, due: invalidDue }], // 无效
        [4, { ...card, due: validDue }],   // 有效
      ]);
    });

    const queue = new IncrementalLearningQueue({
      deckID: 'test-deck',
      storage: mockStorage,
      schedulerRouter: mockSchedulerRouter,
      api: {
        getRiffDueCards: mockGetRiffDueCards,
        reviewRiffCard: vi.fn(),
        skipReviewRiffCard: vi.fn(),
      },
    });

    // 触发队列加载
    await queue.getStats();

    // 获取所有卡片
    const cards = await queue.getAllCards();

    // 验证所有 nextDues 都是有效的
    for (const card of cards) {
      expect(Date.parse(card.nextDues[1])).not.toBeNaN();
      expect(Date.parse(card.nextDues[2])).not.toBeNaN();
      expect(Date.parse(card.nextDues[3])).not.toBeNaN();
      expect(Date.parse(card.nextDues[4])).not.toBeNaN();
    }
  });
});
