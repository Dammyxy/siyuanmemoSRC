/**
 * LocalStorageDataSource 大数据量性能测试
 * 
 * 测试 LocalStorageDataSource 在大数据量场景下的性能表现
 * 
 * 测试场景：
 * 1. 10000+ 张卡片的读取性能
 * 2. 大量过滤和排序操作
 * 3. SchedulerRouter 预测性能
 * 4. 内存使用和 GC 压力测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageDataSource } from '../LocalStorageDataSource';
import type { StorageManager } from '../../../storage/manager';
import type { SchedulerRouter } from '../../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types/card';

/**
 * Helper function to generate test cards
 */
function generateTestCards(count: number, startIndex: number = 0): FSRSCard[] {
  const now = Date.now();
  const cards: FSRSCard[] = [];
  
  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    cards.push({
      id: `card-${index}` as any,
      blockId: `block-${index}` as any,
      due: now + (i * 1000), // Stagger due times
      stability: Math.random() * 10,
      difficulty: Math.random() * 10,
      elapsedDays: Math.floor(Math.random() * 30),
      scheduledDays: Math.floor(Math.random() * 30),
      reps: Math.floor(Math.random() * 10),
      lapses: Math.floor(Math.random() * 3),
      state: Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3,
      lastReview: now - (Math.random() * 86400000),
      priority: Math.floor(Math.random() * 100),
    } as FSRSCard);
  }
  
  return cards;
}

/**
 * Helper function to create mock storage with test data
 */
function createMockStorage(cards: FSRSCard[]): StorageManager {
  return {
    getAllCards: vi.fn().mockReturnValue(cards),
    getCard: vi.fn(),
    setCard: vi.fn(),
    removeCard: vi.fn(),
    saveCards: vi.fn(),
  } as any;
}

/**
 * Helper function to create mock scheduler router
 */
function createMockSchedulerRouter(): SchedulerRouter {
  return {
    preview: vi.fn((card: FSRSCard) => {
      const now = card.due || Date.now();
      return new Map([
        [1, { ...card, due: now + 60000 } as FSRSCard],
        [2, { ...card, due: now + 600000 } as FSRSCard],
        [3, { ...card, due: now + 86400000 } as FSRSCard],
        [4, { ...card, due: now + 259200000 } as FSRSCard],
      ]);
    }),
  } as any;
}

describe('LocalStorageDataSource - 大数据量性能测试', () => {
  describe('1. 基本读取性能 - 大数据量', () => {
    it('应该在 < 1s 内加载 10000 张卡片', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(duration).toBeLessThan(1000);
      console.log(`[大数据量] 加载 10000 张卡片: ${duration.toFixed(2)}ms`);
    });

    it('应该在 < 2s 内加载 20000 张卡片', async () => {
      const cards = generateTestCards(20000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(20000);
      expect(duration).toBeLessThan(2000);
      console.log(`[大数据量] 加载 20000 张卡片: ${duration.toFixed(2)}ms`);
    });

    it('应该在 < 5s 内加载 50000 张卡片', async () => {
      const cards = generateTestCards(50000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(50000);
      expect(duration).toBeLessThan(5000);
      console.log(`[大数据量] 加载 50000 张卡片: ${duration.toFixed(2)}ms`);
    });

    it('应该在多次调用时保持一致的性能', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({ storage: mockStorage });

      const durations: number[] = [];
      
      // Run 10 times to check consistency
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        await dataSource.getAll();
        const duration = performance.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`[大数据量] 10 次加载 10000 张卡片:`);
      console.log(`  平均: ${avgDuration.toFixed(2)}ms`);
      console.log(`  最小: ${minDuration.toFixed(2)}ms`);
      console.log(`  最大: ${maxDuration.toFixed(2)}ms`);
      
      // All calls should be fast
      expect(maxDuration).toBeLessThan(1500);
      
      // Performance should be consistent (max should not be more than 3x min)
      expect(maxDuration / minDuration).toBeLessThan(3);
    });
  });

  describe('2. 过滤性能 - 大数据量', () => {
    it('应该高效过滤 10000 张卡片（50% 到期）', async () => {
      const now = Date.now();
      const cards = generateTestCards(10000);
      
      // Make 50% of them due
      cards.forEach((card, i) => {
        card.due = i < 5000 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(5000);
      expect(duration).toBeLessThan(1000);
      console.log(`[大数据量] 过滤 10000 张卡片到 5000 张: ${duration.toFixed(2)}ms`);
    });

    it('应该高效过滤 20000 张卡片（30% 到期）', async () => {
      const now = Date.now();
      const cards = generateTestCards(20000);
      
      // Make 30% of them due
      cards.forEach((card, i) => {
        card.due = i < 6000 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(6000);
      expect(duration).toBeLessThan(2000);
      console.log(`[大数据量] 过滤 20000 张卡片到 6000 张: ${duration.toFixed(2)}ms`);
    });

    it('应该高效处理复杂过滤条件（10000 张卡片）', async () => {
      const now = Date.now();
      const cards = generateTestCards(10000);

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => 
          card.due <= now && 
          card.state !== 0 && 
          (card.priority ?? 50) >= 50 &&
          card.lapses < 3 &&
          card.reps > 0,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000);
      console.log(`[大数据量] 复杂过滤 10000 张卡片: ${duration.toFixed(2)}ms (结果 ${result.length} 张)`);
    });
  });

  describe('3. 排序性能 - 大数据量', () => {
    it('应该高效排序 10000 张卡片（按优先级）', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(duration).toBeLessThan(1000);
      
      // Verify sorting is correct
      for (let i = 1; i < result.length; i++) {
        expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
      }
      
      console.log(`[大数据量] 排序 10000 张卡片（按优先级）: ${duration.toFixed(2)}ms`);
    });

    it('应该高效排序 20000 张卡片（按到期时间）', async () => {
      const cards = generateTestCards(20000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        sort: (a, b) => a.due - b.due,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(20000);
      expect(duration).toBeLessThan(2000);
      console.log(`[大数据量] 排序 20000 张卡片（按到期时间）: ${duration.toFixed(2)}ms`);
    });

    it('应该高效处理过滤 + 排序组合（10000 张卡片）', async () => {
      const now = Date.now();
      const cards = generateTestCards(10000);
      
      // Make 50% of them due
      cards.forEach((card, i) => {
        card.due = i < 5000 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= now,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(5000);
      expect(duration).toBeLessThan(1000);
      console.log(`[大数据量] 过滤 + 排序 10000 张卡片: ${duration.toFixed(2)}ms`);
    });
  });

  describe('4. SchedulerRouter 性能 - 大数据量', () => {
    it('应该高效提取 10000 张卡片的 nextDues', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const mockScheduler = createMockSchedulerRouter();
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(duration).toBeLessThan(3000); // Allow more time for scheduler calls
      
      // Verify nextDues are populated
      expect(result[0].nextDues).toBeDefined();
      expect(result[0].nextDues![1]).toBeDefined();
      
      console.log(`[大数据量] 提取 10000 张卡片的 nextDues: ${duration.toFixed(2)}ms`);
    });

    it('应该高效提取 20000 张卡片的 nextDues', async () => {
      const cards = generateTestCards(20000);
      const mockStorage = createMockStorage(cards);
      const mockScheduler = createMockSchedulerRouter();
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(20000);
      expect(duration).toBeLessThan(6000); // Allow more time for scheduler calls
      console.log(`[大数据量] 提取 20000 张卡片的 nextDues: ${duration.toFixed(2)}ms`);
    });

    it('应该高效处理 SchedulerRouter 错误（10000 张卡片）', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const mockScheduler = {
        preview: vi.fn(() => {
          throw new Error('Preview failed');
        }),
      } as any;
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(result).toHaveLength(10000);
      // Error handling adds overhead, but should still be reasonable
      expect(duration).toBeLessThan(2000);
      console.log(`[大数据量] SchedulerRouter 错误处理 10000 张卡片: ${duration.toFixed(2)}ms`);
    });
  });

  describe('5. 内存和性能压力测试', () => {
    it('应该在连续多次读取后保持性能', async () => {
      const cards = generateTestCards(10000);
      const mockStorage = createMockStorage(cards);
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => card.due <= Date.now(),
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
      });

      const durations: number[] = [];
      
      // Run 20 times to check for memory leaks or performance degradation
      for (let i = 0; i < 20; i++) {
        const startTime = performance.now();
        await dataSource.getAll();
        const duration = performance.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`[压力测试] 20 次读取 10000 张卡片:`);
      console.log(`  平均: ${avgDuration.toFixed(2)}ms`);
      console.log(`  最小: ${minDuration.toFixed(2)}ms`);
      console.log(`  最大: ${maxDuration.toFixed(2)}ms`);
      
      // Performance should not degrade significantly (allow 3x variance for large datasets)
      expect(maxDuration / minDuration).toBeLessThan(3);
    });

    it('应该高效处理混合操作场景', async () => {
      const now = Date.now();
      const cards = generateTestCards(10000);
      
      // Make 40% of them due
      cards.forEach((card, i) => {
        card.due = i < 4000 ? now - 1000 : now + 86400000;
      });

      const mockStorage = createMockStorage(cards);
      const mockScheduler = createMockSchedulerRouter();
      
      const dataSource = new LocalStorageDataSource({
        storage: mockStorage,
        filter: (card) => 
          card.due <= now && 
          card.state !== 0 && 
          (card.priority ?? 50) >= 30,
        sort: (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
        schedulerRouter: mockScheduler,
      });

      const startTime = performance.now();
      const result = await dataSource.getAll();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(3000);
      console.log(`[混合操作] 10000 张卡片（过滤 + 排序 + nextDues）: ${duration.toFixed(2)}ms (结果 ${result.length} 张)`);
    });
  });

  describe('6. 性能基准测试', () => {
    it('应该生成大数据量性能报告', async () => {
      const testCases = [
        { name: '10000 张基本读取', count: 10000, filter: false, sort: false, scheduler: false },
        { name: '10000 张 + 过滤', count: 10000, filter: true, sort: false, scheduler: false },
        { name: '10000 张 + 排序', count: 10000, filter: false, sort: true, scheduler: false },
        { name: '10000 张 + nextDues', count: 10000, filter: false, sort: false, scheduler: true },
        { name: '10000 张全功能', count: 10000, filter: true, sort: true, scheduler: true },
        { name: '20000 张基本读取', count: 20000, filter: false, sort: false, scheduler: false },
        { name: '20000 张全功能', count: 20000, filter: true, sort: true, scheduler: true },
        { name: '50000 张基本读取', count: 50000, filter: false, sort: false, scheduler: false },
      ];
      
      const report: any[] = [];
      
      for (const testCase of testCases) {
        const now = Date.now();
        const cards = generateTestCards(testCase.count);
        
        // Make 40% of them due for filter tests
        if (testCase.filter) {
          cards.forEach((card, i) => {
            card.due = i < testCase.count * 0.4 ? now - 1000 : now + 86400000;
          });
        }
        
        const mockStorage = createMockStorage(cards);
        const mockScheduler = testCase.scheduler ? createMockSchedulerRouter() : undefined;
        
        const dataSource = new LocalStorageDataSource({
          storage: mockStorage,
          filter: testCase.filter ? (card) => card.due <= now : undefined,
          sort: testCase.sort ? (a, b) => (a.priority ?? 50) - (b.priority ?? 50) : undefined,
          schedulerRouter: mockScheduler,
        });
        
        const startTime = performance.now();
        const result = await dataSource.getAll();
        const duration = performance.now() - startTime;
        
        report.push({
          场景: testCase.name,
          输入: testCase.count,
          输出: result.length,
          耗时: `${duration.toFixed(2)}ms`,
          速度: `${(testCase.count / duration * 1000).toFixed(0)} 张/秒`,
        });
      }
      
      console.log('\n=== LocalStorageDataSource 大数据量性能报告 ===');
      console.table(report);
      console.log('=============================================\n');
      
      // Verify performance goals
      const report10k = report.find(r => r.场景 === '10000 张基本读取');
      expect(parseFloat(report10k.耗时)).toBeLessThan(1000);
    });
  });
});
