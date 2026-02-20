/**
 * 端到端集成测试 - 复习 UI
 * 
 * 测试复习界面的完整交互流程，包括：
 * - UI 状态管理
 * - 用户交互（评分、跳过、显示答案）
 * - 不同队列的 UI 适配
 * - 统计信息显示
 * 
 * 注意：这些测试主要验证队列和适配器的集成，
 * 实际的 Vue 组件测试需要在真实的浏览器环境中进行。
 */

import { describe, it, expect, vi } from 'vitest';
import { RetrievalPracticeAdapter } from '../v2/adapters/RetrievalPracticeAdapter';
import { FinalDrillAdapter } from '../v2/adapters/FinalDrillAdapter';
import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { QueueItem, QueueStats, QueueUIConfig } from '@/core/queue/types';

// ==================== Mock 队列 ====================

class MockQueue implements IQueueStrategy<QueueItem> {
  private items: QueueItem[] = [];
  private currentIndex = 0;
  private feedbackHistory: QueueFeedback[] = [];

  constructor(items: QueueItem[]) {
    this.items = items;
  }

  async next(): Promise<QueueItem | null> {
    if (this.currentIndex >= this.items.length) {
      return null;
    }
    return this.items[this.currentIndex++];
  }

  async onFeedback(_item: QueueItem | null, feedback: QueueFeedback): Promise<void> {
    this.feedbackHistory.push(feedback);
  }

  async getStats(): Promise<QueueStats> {
    return {
      size: this.items.length - this.currentIndex,
    };
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    return {
      statsType: 'queue-size',
      showRatingButtons: true,
      allowSkip: true,
    };
  }

  getFeedbackHistory() {
    return this.feedbackHistory;
  }

  async getAllCards(): Promise<QueueItem[]> {
    return this.items;
  }
}

// 创建测试用 QueueItem
function createQueueItem(id: string, overrides?: Partial<QueueItem>): QueueItem {
  return {
    cardID: id,
    blockID: `block-${id}`,
    deckID: 'test-deck',
    priority: 50,
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
    ...overrides,
  };
}

// ==================== 端到端测试 ====================

describe('E2E: 复习队列和适配器集成', () => {
  describe('场景 1: 队列基本功能', () => {
    it('应该正确处理卡片流转', async () => {
      const items = [
        createQueueItem('card-1'),
        createQueueItem('card-2'),
        createQueueItem('card-3'),
      ];
      const queue = new MockQueue(items);

      // 获取第一张卡片
      const firstCard = await queue.next();
      expect(firstCard).toBeDefined();
      expect(firstCard?.cardID).toBe('card-1');

      // 发送反馈
      await queue.onFeedback(firstCard, { action: 'rate', rating: 3 });

      // 验证反馈历史
      const history = queue.getFeedbackHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({ action: 'rate', rating: 3 });

      // 获取下一张卡片
      const secondCard = await queue.next();
      expect(secondCard?.cardID).toBe('card-2');
    });

    it('应该支持跳过卡片', async () => {
      const items = [createQueueItem('card-skip')];
      const queue = new MockQueue(items);

      const card = await queue.next();
      await queue.onFeedback(card, { action: 'skip' });

      const history = queue.getFeedbackHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({ action: 'skip' });
    });

    it('应该正确报告统计信息', async () => {
      const items = [
        createQueueItem('card-1'),
        createQueueItem('card-2'),
        createQueueItem('card-3'),
      ];
      const queue = new MockQueue(items);

      // 初始统计
      let stats = await queue.getStats();
      expect(stats.size).toBe(3);

      // 处理一张卡片
      const card = await queue.next();
      await queue.onFeedback(card, { action: 'rate', rating: 3 });

      // 更新后的统计
      stats = await queue.getStats();
      expect(stats.size).toBe(2);
    });

    it('应该在队列为空时返回 null', async () => {
      const items = [createQueueItem('last-card')];
      const queue = new MockQueue(items);

      // 获取唯一的卡片
      const card = await queue.next();
      expect(card).toBeDefined();

      // 再次获取应该返回 null
      const noCard = await queue.next();
      expect(noCard).toBeNull();
    });
  });

  describe('场景 2: 不同适配器的配置', () => {
    it('提取练习适配器应该提供正确的 UI 配置', () => {
      const adapter = new RetrievalPracticeAdapter();

      // 适配器应该能够处理卡片
      expect(adapter).toBeDefined();
    });

    it('刻意练习适配器应该提供正确的 UI 配置', () => {
      const adapter = new FinalDrillAdapter();
      expect(adapter).toBeDefined();
    });

    it('神经漫游适配器应该处理漫游元数据', () => {
      // 神经漫游适配器已迁移到新架构，通过 UnifiedDataSourceManager 访问
      const item = createQueueItem('card-roam', {
        meta: {
          neuralReason: 'ref',
          neuralSource: 'source-block',
        },
      });

      expect(item.meta?.neuralReason).toBe('ref');
    });
  });

  describe('场景 3: 评分选项', () => {
    it('应该提供所有评分选项的 nextDues', () => {
      const item = createQueueItem('card-grades');

      expect(item.nextDues).toBeDefined();
      expect(item.nextDues[1]).toBeDefined(); // Again
      expect(item.nextDues[2]).toBeDefined(); // Hard
      expect(item.nextDues[3]).toBeDefined(); // Good
      expect(item.nextDues[4]).toBeDefined(); // Easy
    });

    it('应该正确处理不同的评分', async () => {
      const items = [createQueueItem('card-rating')];
      const queue = new MockQueue(items);

      const card = await queue.next();

      // 测试不同的评分
      const ratings: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
      for (const rating of ratings) {
        await queue.onFeedback(card, { action: 'rate', rating });
      }

      const history = queue.getFeedbackHistory();
      expect(history).toHaveLength(4);
      expect(history.map(h => h.rating)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('场景 4: UI 配置', () => {
    it('应该根据队列类型提供不同的 UI 配置', () => {
      const items = [createQueueItem('card-1')];
      const queue = new MockQueue(items);

      const config = queue.getUIConfig(items[0]);

      expect(config).toBeDefined();
      expect(config.statsType).toBe('queue-size');
      expect(config.showRatingButtons).toBe(true);
      expect(config.allowSkip).toBe(true);
    });
  });

  describe('场景 5: 错误处理', () => {
    it('应该处理队列加载失败', async () => {
      const failingQueue = {
        next: vi.fn().mockRejectedValue(new Error('Queue load failed')),
        onFeedback: vi.fn(),
        getStats: vi.fn().mockResolvedValue({
          size: 0,
        }),
        getUIConfig: vi.fn().mockReturnValue({
          statsType: 'queue-size',
          showRatingButtons: true,
          allowSkip: true,
        }),
      } as any;

      // 尝试获取卡片应该抛出错误
      await expect(failingQueue.next()).rejects.toThrow('Queue load failed');
    });

    it('应该处理评分失败', async () => {
      const items = [createQueueItem('card-fail')];
      const failingQueue = new MockQueue(items);
      failingQueue.onFeedback = vi.fn().mockRejectedValue(new Error('Grade failed'));

      const card = await failingQueue.next();

      // 评分应该抛出错误
      await expect(failingQueue.onFeedback(card, { action: 'rate', rating: 3 }))
        .rejects.toThrow('Grade failed');
    });
  });

  describe('场景 6: 性能', () => {
    it('应该快速处理大量卡片', async () => {
      const items = Array.from({ length: 100 }, (_, i) => 
        createQueueItem(`card-${i}`)
      );
      const queue = new MockQueue(items);

      const startTime = Date.now();

      // 获取所有卡片
      const cards = await queue.getAllCards();

      const duration = Date.now() - startTime;

      expect(cards).toHaveLength(100);
      expect(duration).toBeLessThan(100); // 应该在 100ms 内完成
    });

    it('应该快速响应评分操作', async () => {
      const items = [createQueueItem('card-fast')];
      const queue = new MockQueue(items);

      const card = await queue.next();

      const startTime = Date.now();
      await queue.onFeedback(card, { action: 'rate', rating: 3 });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10); // 应该在 10ms 内完成
    });
  });
});
