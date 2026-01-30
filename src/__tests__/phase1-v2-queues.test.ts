/**
 * Phase 1 验证测试 - V2 队列功能测试
 * 
 * 验证 V2 队列是否正确工作
 */

import { describe, test, expect } from 'vitest';
import { RetrievalPracticeQueueV2 } from '@/core/queue/strategies/RetrievalPracticeQueueV2';
import { FinalDrillQueueV2 } from '@/core/queue/strategies/FinalDrillQueueV2';
import { LeechQueueV2 } from '@/core/queue/strategies/LeechQueueV2';
import { NeuralRoamQueueV2 } from '@/core/queue/strategies/NeuralRoamQueueV2';
import { IncrementalLearningQueueV2 } from '@/core/queue/strategies/IncrementalLearningQueueV2';
import { FilterGroupQueueV2 } from '@/core/queue/strategies/FilterGroupQueueV2';

describe('Phase 1 - V2 Queues Validation', () => {
  test('RetrievalPracticeQueueV2 可以实例化', () => {
    const queue = new RetrievalPracticeQueueV2();
    expect(queue).toBeDefined();
    expect(queue.getAllItems).toBeDefined();
    expect(queue.addItems).toBeDefined(); // 新增方法
  });

  test('FinalDrillQueueV2 可以实例化', () => {
    const queue = new FinalDrillQueueV2();
    expect(queue).toBeDefined();
    expect(queue.getAllItems).toBeDefined();
  });

  test('LeechQueueV2 可以实例化', () => {
    const queue = new LeechQueueV2();
    expect(queue).toBeDefined();
  });

  test('NeuralRoamQueueV2 可以实例化', () => {
    const queue = new NeuralRoamQueueV2();
    expect(queue).toBeDefined();
  });

  test('IncrementalLearningQueueV2 可以实例化', () => {
    const queue = new IncrementalLearningQueueV2();
    expect(queue).toBeDefined();
    expect(queue.addItems).toBeDefined();
  });

  test('FilterGroupQueueV2 可以实例化', () => {
    const configs = [{ id: 'test', weight: 1 }];
    const queue = new FilterGroupQueueV2(configs);
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

    expect(new RetrievalPracticeQueue()).toBeInstanceOf(RetrievalPracticeQueueV2);
    expect(new FinalDrillQueue()).toBeInstanceOf(FinalDrillQueueV2);
    expect(new LeechQueue()).toBeInstanceOf(LeechQueueV2);
    expect(new NeuralRoamQueue()).toBeInstanceOf(NeuralRoamQueueV2);
    expect(new IncrementalLearningQueue()).toBeInstanceOf(IncrementalLearningQueueV2);
    expect(new FilterGroupQueue([{ id: 'test', weight: 1 }])).toBeInstanceOf(FilterGroupQueueV2);
  });
});
