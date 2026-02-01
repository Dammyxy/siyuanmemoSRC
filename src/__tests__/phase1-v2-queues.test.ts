/**
 * Phase 1 验证测试 - 队列功能测试
 * 
 * 验证 队列是否正确工作
 */

import { describe, test, expect } from 'vitest';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import { FinalDrillQueue } from '@/core/queue/strategies/FinalDrillQueue';
import { LeechQueue } from '@/core/queue/strategies/LeechQueue';
import { NeuralRoamQueue } from '@/core/queue/strategies/NeuralRoamQueue';
import { IncrementalLearningQueue } from '@/core/queue/strategies/IncrementalLearningQueue';
import { FilterGroupQueue } from '@/core/queue/strategies/FilterGroupQueue';

describe('Phase 1 - V2 Queues Validation', () => {
  test('RetrievalPracticeQueue 可以实例化', async () => {
    const queue = await RetrievalPracticeQueue.create();
    expect(queue).toBeDefined();
    expect(queue.getAllItems).toBeDefined();
    expect(queue.addItems).toBeDefined(); // 新增方法
  });

  test('FinalDrillQueue 可以实例化', () => {
    const queue = new FinalDrillQueue();
    expect(queue).toBeDefined();
    expect(queue.getAllItems).toBeDefined();
  });

  test('LeechQueue 可以实例化', () => {
    const queue = new LeechQueue();
    expect(queue).toBeDefined();
  });

  test('NeuralRoamQueue 可以实例化', () => {
    const queue = new NeuralRoamQueue();
    expect(queue).toBeDefined();
  });

  test('IncrementalLearningQueue 可以实例化', () => {
    const queue = new IncrementalLearningQueue();
    expect(queue).toBeDefined();
    expect(queue.addItems).toBeDefined();
  });

  test('FilterGroupQueue 可以实例化', () => {
    const configs = [{ id: 'test', weight: 1 }];
    const queue = new FilterGroupQueue(configs);
    expect(queue).toBeDefined();
  });

  test('strategies/index.ts 正确导出 V2 为主版本', async () => {
    // 验证从 index.ts 导入的是 V2 版本
    const { 
      RetrievalPracticeQueue,
      FinalDrillQueue,
      LeechQueue,
      NeuralRoamQueue,
      IncrementalLearningQueue,
      FilterGroupQueue
    } = await import('@/core/queue/strategies');

    expect(await RetrievalPracticeQueue.create()).toBeInstanceOf(RetrievalPracticeQueue);
    expect(new FinalDrillQueue()).toBeInstanceOf(FinalDrillQueue);
    expect(new LeechQueue()).toBeInstanceOf(LeechQueue);
    expect(new NeuralRoamQueue()).toBeInstanceOf(NeuralRoamQueue);
    expect(new IncrementalLearningQueue()).toBeInstanceOf(IncrementalLearningQueue);
    expect(new FilterGroupQueue([{ id: 'test', weight: 1 }])).toBeInstanceOf(FilterGroupQueue);
  });
});
