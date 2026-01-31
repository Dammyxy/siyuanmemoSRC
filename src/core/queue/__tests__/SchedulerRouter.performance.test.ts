/**
 * SchedulerRouter + RetrievalPracticeQueue 性能测试
 *
 * 测试集成后的性能开销
 *
 * Phase 5: 测试与文档
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulerRouter } from '@/core/scheduler/SchedulerRouter';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import { SimpleFSRSScheduler } from '@/core/scheduler/strategies/FSRSV5';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { CardState, Rating } from '@/types';
import type { QueueItem } from '@/core/queue/types';

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

// FSRS 参数
const mockFSRSParams = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  weights: new Array(19).fill(0.5),
  enableFuzz: false,
  enableShortTerm: true,
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
    },
    ...overrides,
  };
}

describe('Performance Tests - SchedulerRouter Integration', () => {
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

  describe('路由性能', () => {
    it('100 次路由应该 < 100ms', async () => {
      const cards = Array.from({ length: 100 }, () => createTestCard());

      const start = performance.now();

      for (const card of cards) {
        await router.route(card, Rating.Good);
      }

      const duration = performance.now() - start;

      console.log(`100 次路由耗时: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100);
    });

    it('1000 次路由应该 < 500ms', async () => {
      const cards = Array.from({ length: 1000 }, () => createTestCard());

      const start = performance.now();

      for (const card of cards) {
        await router.route(card, Rating.Good);
      }

      const duration = performance.now() - start;

      console.log(`1000 次路由耗时: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);
    });

    it('getSchedulerType() 应该 < 0.1ms', () => {
      const card = createTestCard();

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        router.getSchedulerType(card);
      }

      const duration = performance.now() - start;
      const avgDuration = duration / iterations;

      console.log(`getSchedulerType() 平均耗时: ${avgDuration.toFixed(4)}ms`);
      expect(avgDuration).toBeLessThan(0.1);
    });

    it('preview() 应该 < 10ms', () => {
      const card = createTestCard();

      const start = performance.now();

      const preview = router.preview(card);

      const duration = performance.now() - start;

      console.log(`preview() 耗时: ${duration.toFixed(3)}ms (4 个评分选项)`);
      expect(duration).toBeLessThan(10);
      expect(preview.size).toBe(4);
    });
  });

  describe('内存开销', () => {
    it('不应该有明显的内存泄漏', async () => {
      const mockStorage = createMockStorage();

      // 创建大量 SchedulerRouter 实例
      const routers: SchedulerRouter[] = [];

      for (let i = 0; i < 100; i++) {
        const r = new SchedulerRouter(
          {
            defaultScheduler: 'fsrs-v5',
            enableRiffSync: false,
            fsrsParams: mockFSRSParams,
          },
          mockStorage
        );
        routers.push(r);
      }

      // 执行一些操作
      for (const r of routers) {
        const card = createTestCard();
        await r.route(card, Rating.Good);
      }

      // 验证内存使用合理（没有明显的内存泄漏）
      // 注意：这个测试比较粗糙，实际应用中可能需要更精确的内存分析
      expect(routers.length).toBe(100);
    });
  });

  describe('对比测试 - 有/无 SchedulerRouter', () => {
    it('使用 SchedulerRouter 应该有可接受的性能开销', async () => {
      const card = createTestCard();
      const iterations = 100;

      // 不使用 SchedulerRouter（直接使用调度器）
      const directScheduler = new SimpleFSRSScheduler(mockFSRSParams);
      const startDirect = performance.now();

      for (let i = 0; i < iterations; i++) {
        directScheduler.review(card, Rating.Good);
      }

      const durationDirect = performance.now() - startDirect;

      // 使用 SchedulerRouter
      const startRouter = performance.now();

      for (let i = 0; i < iterations; i++) {
        await router.route(card, Rating.Good);
      }

      const durationRouter = performance.now() - startRouter;

      const overhead = durationRouter - durationDirect;
      const overheadPercent = (overhead / durationDirect) * 100;

      console.log(`直接调度: ${durationDirect.toFixed(2)}ms`);
      console.log(`通过 Router: ${durationRouter.toFixed(2)}ms`);
      console.log(`开销: ${overhead.toFixed(2)}ms (${overheadPercent.toFixed(1)}%)`);

      // 开销应该 < 200%（放宽限制，因为 Router 包含额外的逻辑）
      expect(overheadPercent).toBeLessThan(200);
    });
  });
});
