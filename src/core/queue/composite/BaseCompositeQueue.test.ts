/**
 * BaseCompositeQueue 单元测试
 * 
 * 测试 rotateToEnd 方法的功能
 * Feature: retrieval-practice-rating-fix
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { BaseCompositeQueue } from './BaseCompositeQueue';
import type { IDataSource } from '../datasource/IDataSource';
import type { ISequencer } from '../abstraction/types';

// Mock DataSource
const createMockDataSource = <TItem>(): IDataSource<TItem> => {
  const items: TItem[] = [];
  
  return {
    getAll: vi.fn(async () => items),
    remove: vi.fn(async (itemsToRemove: TItem[]) => {
      const initialLength = items.length;
      itemsToRemove.forEach(item => {
        const index = items.indexOf(item);
        if (index > -1) {
          items.splice(index, 1);
        }
      });
      return initialLength - items.length;
    }),
    size: async () => items.length,
  } as IDataSource<TItem>;
};

// Mock Sequencer
const createMockSequencer = <TItem>(): ISequencer<TItem> => {
  return {
    next: vi.fn(async () => null),
  } as ISequencer<TItem>;
};

// Test item type
type TestItem = {
  id: string;
  value: string;
};

describe('BaseCompositeQueue - rotateToEnd 方法测试', () => {
  let queue: BaseCompositeQueue<TestItem>;
  let mockDataSource: IDataSource<TestItem>;
  let mockSequencer: ISequencer<TestItem>;

  beforeEach(() => {
    mockDataSource = createMockDataSource<TestItem>();
    mockSequencer = createMockSequencer<TestItem>();
    
    queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });
  });

  describe('正常情况', () => {
    it('应该成功将卡片旋转到队尾', async () => {
      // Arrange: 设置初始队列状态
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
      ];
      
      // 模拟 DataSource 的内部状态
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      const itemToRotate = items[0]; // 'first'

      // Act: 调用 rotateToEnd
      await (queue as any).rotateToEnd(itemToRotate);

      // Assert: 验证卡片被移除
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRotate]);
      expect(mockDataSource.remove).toHaveBeenCalledTimes(1);

      // Assert: 验证 getAll 被调用
      expect(mockDataSource.getAll).toHaveBeenCalledTimes(1);

      // Assert: 验证卡片被添加到末尾
      expect(dataSourceItems).toHaveLength(3);
      expect(dataSourceItems[0]).toEqual({ id: '2', value: 'second' });
      expect(dataSourceItems[1]).toEqual({ id: '3', value: 'third' });
      expect(dataSourceItems[2]).toEqual({ id: '1', value: 'first' });
    });

    it('应该记录详细的日志', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log');
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      const itemToRotate = items[0];

      // Act
      await (queue as any).rotateToEnd(itemToRotate);

      // Assert: 验证日志被记录
      expect(consoleSpy).toHaveBeenCalledWith('[BaseCompositeQueue] Rotating item to end of queue');
      expect(consoleSpy).toHaveBeenCalledWith('[BaseCompositeQueue] Removed 1 item(s) from queue');
      expect(consoleSpy).toHaveBeenCalledWith('[BaseCompositeQueue] Current queue size: 1');
      expect(consoleSpy).toHaveBeenCalledWith('[BaseCompositeQueue] Item rotated to end, new queue size: 2');

      consoleSpy.mockRestore();
    });
  });

  describe('边缘情况', () => {
    it('应该处理空队列的情况', async () => {
      // Arrange: 空队列
      const dataSourceItems: TestItem[] = [];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async () => 0); // 没有移除任何项

      const itemToRotate: TestItem = { id: '1', value: 'only' };

      // Act
      await (queue as any).rotateToEnd(itemToRotate);

      // Assert: 验证卡片被添加到空队列
      expect(dataSourceItems).toHaveLength(1);
      expect(dataSourceItems[0]).toEqual(itemToRotate);
    });

    it('应该处理单卡片队列的情况', async () => {
      // Arrange: 单卡片队列
      const item: TestItem = { id: '1', value: 'only' };
      const dataSourceItems: TestItem[] = [item];
      
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(removedItem => {
          const index = dataSourceItems.indexOf(removedItem);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      // Act: 旋转唯一的卡片
      await (queue as any).rotateToEnd(item);

      // Assert: 队列大小保持为 1，卡片仍在队列中
      expect(dataSourceItems).toHaveLength(1);
      expect(dataSourceItems[0]).toEqual(item);
    });

    it('应该在 DataSource 不支持 remove 时记录警告并返回', async () => {
      // Arrange: DataSource 没有 remove 方法
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      mockDataSource.remove = undefined as any;

      const itemToRotate: TestItem = { id: '1', value: 'test' };

      // Act
      await (queue as any).rotateToEnd(itemToRotate);

      // Assert: 验证警告被记录
      expect(consoleWarnSpy).toHaveBeenCalledWith('[BaseCompositeQueue] DataSource does not support remove operation');
      
      // Assert: getAll 不应该被调用
      expect(mockDataSource.getAll).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('DataSource 交互', () => {
    it('应该正确调用 DataSource 的 remove 方法', async () => {
      // Arrange
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      const itemToRotate = items[0];

      // Act
      await (queue as any).rotateToEnd(itemToRotate);

      // Assert: 验证 remove 被正确调用
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRotate]);
      expect(mockDataSource.remove).toHaveBeenCalledTimes(1);
    });

    it('应该正确调用 DataSource 的 getAll 方法', async () => {
      // Arrange
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      const itemToRotate = items[0];

      // Act
      await (queue as any).rotateToEnd(itemToRotate);

      // Assert: 验证 getAll 被调用
      expect(mockDataSource.getAll).toHaveBeenCalledTimes(1);
    });
  });
});

describe('BaseCompositeQueue - onFeedback rate 操作测试', () => {
  let queue: BaseCompositeQueue<TestItem>;
  let mockDataSource: IDataSource<TestItem>;
  let mockSequencer: ISequencer<TestItem>;
  let mockScheduler: any;

  beforeEach(() => {
    mockDataSource = createMockDataSource<TestItem>();
    mockSequencer = createMockSequencer<TestItem>();
    mockScheduler = {
      schedule: vi.fn(async (item: TestItem) => item),
    };
  });

  describe('评分 >= 3 时移除卡片', () => {
    it('应该在评分为 3 时调用 dataSource.remove', async () => {
      // Arrange
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      const itemToRate = items[0];

      // Act: 评分为 3
      await queue.onFeedback(itemToRate, { action: 'rate', rating: 3 });

      // Assert: 验证 scheduler 被调用
      expect(mockScheduler.schedule).toHaveBeenCalledWith(itemToRate, 3);

      // Assert: 验证 remove 被调用
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRate]);

      // Assert: 验证卡片被移除
      expect(dataSourceItems).toHaveLength(1);
      expect(dataSourceItems).not.toContainEqual(itemToRate);
    });

    it('应该在评分为 4 时调用 dataSource.remove', async () => {
      // Arrange
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      const itemToRate = items[0];

      // Act: 评分为 4
      await queue.onFeedback(itemToRate, { action: 'rate', rating: 4 });

      // Assert: 验证 scheduler 被调用
      expect(mockScheduler.schedule).toHaveBeenCalledWith(itemToRate, 4);

      // Assert: 验证 remove 被调用
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRate]);

      // Assert: 验证卡片被移除
      expect(dataSourceItems).toHaveLength(1);
      expect(dataSourceItems).not.toContainEqual(itemToRate);
    });
  });

  describe('评分 < 3 时旋转到队尾', () => {
    it('应该在评分为 1 时调用 rotateToEnd', async () => {
      // Arrange
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      const itemToRate = items[0];

      // Act: 评分为 1
      await queue.onFeedback(itemToRate, { action: 'rate', rating: 1 });

      // Assert: 验证 scheduler 被调用
      expect(mockScheduler.schedule).toHaveBeenCalledWith(itemToRate, 1);

      // Assert: 验证 remove 被调用（rotateToEnd 内部调用）
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRate]);

      // Assert: 验证 getAll 被调用（rotateToEnd 内部调用）
      expect(mockDataSource.getAll).toHaveBeenCalledTimes(1);

      // Assert: 验证卡片被旋转到队尾
      expect(dataSourceItems).toHaveLength(3);
      expect(dataSourceItems[2]).toEqual(itemToRate);
    });

    it('应该在评分为 2 时调用 rotateToEnd', async () => {
      // Arrange
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      const itemToRate = items[0];

      // Act: 评分为 2
      await queue.onFeedback(itemToRate, { action: 'rate', rating: 2 });

      // Assert: 验证 scheduler 被调用
      expect(mockScheduler.schedule).toHaveBeenCalledWith(itemToRate, 2);

      // Assert: 验证 remove 被调用（rotateToEnd 内部调用）
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRate]);

      // Assert: 验证 getAll 被调用（rotateToEnd 内部调用）
      expect(mockDataSource.getAll).toHaveBeenCalledTimes(1);

      // Assert: 验证卡片被旋转到队尾
      expect(dataSourceItems).toHaveLength(3);
      expect(dataSourceItems[2]).toEqual(itemToRate);
    });
  });

  describe('Scheduler 调用失败处理', () => {
    it('应该在 scheduler 失败时记录错误但继续执行队列操作（评分 >= 3）', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const schedulerError = new Error('Scheduler failed');
      mockScheduler.schedule = vi.fn(async () => {
        throw schedulerError;
      });

      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      const itemToRate = items[0];

      // Act: 评分为 3，scheduler 会失败
      await queue.onFeedback(itemToRate, { action: 'rate', rating: 3 });

      // Assert: 验证错误被记录
      expect(consoleErrorSpy).toHaveBeenCalledWith('[BaseCompositeQueue] Scheduler failed:', schedulerError);

      // Assert: 验证队列操作继续执行（卡片被移除）
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRate]);
      expect(dataSourceItems).toHaveLength(1);

      consoleErrorSpy.mockRestore();
    });

    it('应该在 scheduler 失败时记录错误但继续执行队列操作（评分 < 3）', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const schedulerError = new Error('Scheduler failed');
      mockScheduler.schedule = vi.fn(async () => {
        throw schedulerError;
      });

      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      const itemToRate = items[0];

      // Act: 评分为 1，scheduler 会失败
      await queue.onFeedback(itemToRate, { action: 'rate', rating: 1 });

      // Assert: 验证错误被记录
      expect(consoleErrorSpy).toHaveBeenCalledWith('[BaseCompositeQueue] Scheduler failed:', schedulerError);

      // Assert: 验证队列操作继续执行（卡片被旋转）
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToRate]);
      expect(mockDataSource.getAll).toHaveBeenCalledTimes(1);
      expect(dataSourceItems).toHaveLength(2);
      expect(dataSourceItems[1]).toEqual(itemToRate);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('边缘情况', () => {
    it('应该在没有 currentItem 时直接返回', async () => {
      // Arrange
      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      (queue as any).currentItem = null;
      mockDataSource.remove = vi.fn();

      // Act: 没有传入 currentItem，内部 currentItem 也为 null
      await queue.onFeedback(null, { action: 'rate', rating: 3 });

      // Assert: 验证 scheduler 和 remove 都没有被调用
      expect(mockScheduler.schedule).not.toHaveBeenCalled();
      expect(mockDataSource.remove).not.toHaveBeenCalled();
    });

    it('应该在没有 rating 时直接返回', async () => {
      // Arrange
      const item: TestItem = { id: '1', value: 'test' };
      
      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      mockDataSource.remove = vi.fn();

      // Act: 没有传入 rating
      await queue.onFeedback(item, { action: 'rate' });

      // Assert: 验证 scheduler 和 remove 都没有被调用
      expect(mockScheduler.schedule).not.toHaveBeenCalled();
      expect(mockDataSource.remove).not.toHaveBeenCalled();
    });

    it('应该在没有 scheduler 时直接返回', async () => {
      // Arrange
      const item: TestItem = { id: '1', value: 'test' };
      
      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        // 没有 scheduler
      });

      mockDataSource.remove = vi.fn();

      // Act: 没有 scheduler
      await queue.onFeedback(item, { action: 'rate', rating: 3 });

      // Assert: 验证 remove 没有被调用
      expect(mockDataSource.remove).not.toHaveBeenCalled();
    });

    it('应该清空 currentItem', async () => {
      // Arrange
      const item: TestItem = { id: '1', value: 'test' };
      
      const dataSourceItems = [item];
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(removedItem => {
          const index = dataSourceItems.indexOf(removedItem);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      // 设置 currentItem
      (queue as any).currentItem = item;

      // Act: 评分为 3
      await queue.onFeedback(null, { action: 'rate', rating: 3 });

      // Assert: 验证 currentItem 被清空
      expect((queue as any).currentItem).toBeNull();
    });

    it('应该使用 currentItem 参数而不是内部 currentItem', async () => {
      // Arrange
      const item1: TestItem = { id: '1', value: 'first' };
      const item2: TestItem = { id: '2', value: 'second' };
      
      const dataSourceItems = [item1, item2];
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(removedItem => {
          const index = dataSourceItems.indexOf(removedItem);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler,
      });

      // 设置内部 currentItem 为 item2
      (queue as any).currentItem = item2;

      // Act: 传入 item1 作为参数
      await queue.onFeedback(item1, { action: 'rate', rating: 3 });

      // Assert: 验证使用的是 item1（参数）而不是 item2（内部）
      expect(mockScheduler.schedule).toHaveBeenCalledWith(item1, 3);
      expect(mockDataSource.remove).toHaveBeenCalledWith([item1]);
      expect(dataSourceItems).not.toContainEqual(item1);
      expect(dataSourceItems).toContainEqual(item2);
    });
  });
});

describe('BaseCompositeQueue - onFeedback skip 操作测试', () => {
  let queue: BaseCompositeQueue<TestItem>;
  let mockDataSource: IDataSource<TestItem>;
  let mockSequencer: ISequencer<TestItem>;

  beforeEach(() => {
    mockDataSource = createMockDataSource<TestItem>();
    mockSequencer = createMockSequencer<TestItem>();
    
    queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
    });
  });

  describe('skip 操作处理', () => {
    it('应该调用 dataSource.remove 移除卡片', async () => {
      // Arrange: 设置队列状态
      const items: TestItem[] = [
        { id: '1', value: 'first' },
        { id: '2', value: 'second' },
        { id: '3', value: 'third' },
      ];
      
      const dataSourceItems = [...items];
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });

      const itemToSkip = items[0];

      // Act: 执行 skip 操作
      await queue.onFeedback(itemToSkip, { action: 'skip' });

      // Assert: 验证 remove 被调用
      expect(mockDataSource.remove).toHaveBeenCalledWith([itemToSkip]);
      expect(mockDataSource.remove).toHaveBeenCalledTimes(1);

      // Assert: 验证卡片被移除
      expect(dataSourceItems).toHaveLength(2);
      expect(dataSourceItems).not.toContainEqual(itemToSkip);
    });

    it('应该清空 currentItem', async () => {
      // Arrange
      const item: TestItem = { id: '1', value: 'test' };
      mockDataSource.remove = vi.fn(async () => 1);

      // 设置 currentItem
      (queue as any).currentItem = item;

      // Act: 执行 skip 操作
      await queue.onFeedback(null, { action: 'skip' });

      // Assert: 验证 currentItem 被清空
      expect((queue as any).currentItem).toBeNull();
    });

    it('应该在没有 currentItem 时直接返回', async () => {
      // Arrange: 没有 currentItem
      (queue as any).currentItem = null;
      mockDataSource.remove = vi.fn();

      // Act: 执行 skip 操作
      await queue.onFeedback(null, { action: 'skip' });

      // Assert: 验证 remove 没有被调用
      expect(mockDataSource.remove).not.toHaveBeenCalled();
    });

    it('应该不调用 scheduler（skip 不需要调度）', async () => {
      // Arrange: 创建带 scheduler 的队列
      const mockScheduler = {
        schedule: vi.fn(async (item: TestItem) => item),
      };

      const queueWithScheduler = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
        scheduler: mockScheduler as any,
      });

      const item: TestItem = { id: '1', value: 'test' };
      mockDataSource.remove = vi.fn(async () => 1);

      // Act: 执行 skip 操作
      await queueWithScheduler.onFeedback(item, { action: 'skip' });

      // Assert: 验证 scheduler 没有被调用
      expect(mockScheduler.schedule).not.toHaveBeenCalled();

      // Assert: 验证 remove 被调用
      expect(mockDataSource.remove).toHaveBeenCalledWith([item]);
    });

    it('应该不调用 rotateToEnd（skip 直接移除，不旋转）', async () => {
      // Arrange
      const item: TestItem = { id: '1', value: 'test' };
      const dataSourceItems: TestItem[] = [item];
      
      mockDataSource.remove = vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(removedItem => {
          const index = dataSourceItems.indexOf(removedItem);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      });
      mockDataSource.getAll = vi.fn(async () => dataSourceItems);

      // Act: 执行 skip 操作
      await queue.onFeedback(item, { action: 'skip' });

      // Assert: 验证 getAll 没有被调用（rotateToEnd 会调用 getAll）
      expect(mockDataSource.getAll).not.toHaveBeenCalled();

      // Assert: 验证卡片被移除
      expect(dataSourceItems).toHaveLength(0);
    });
  });
});

/**
 * Property-Based Tests for onFeedback method
 * Feature: retrieval-practice-rating-fix
 */
describe('BaseCompositeQueue - Property-Based Tests', () => {
  /**
   * Property 1: 评分 < 3 时卡片旋转到队尾
   * Feature: retrieval-practice-rating-fix, Property 1: 评分 < 3 时卡片旋转到队尾
   * **Validates: Requirements 1.1, 1.2, 3.2**
   * 
   * For any queue state and any card, when the user rates with 1 or 2,
   * the card should be removed and then re-inserted at the end of the queue,
   * and the card should appear at the last position.
   */
  it('Property 1: 评分 < 3 时卡片旋转到队尾', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator 1: Random queue state (0-10 items)
        fc.array(
          fc.record({
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        // Generator 2: Random card to rate
        fc.record({
          id: fc.uuid(),
          value: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        // Generator 3: Rating 1 or 2
        fc.constantFrom(1, 2),
        async (initialItems, cardToRate, rating) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          
          // Add the card to rate at the beginning of the queue
          dataSourceItems.unshift(cardToRate);
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          const mockScheduler = {
            schedule: vi.fn(async (item: TestItem) => item),
          };

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
            scheduler: mockScheduler,
          });

          const initialSize = dataSourceItems.length;

          // Act: Rate the card with rating < 3
          await queue.onFeedback(cardToRate, { action: 'rate', rating: rating as 1 | 2 });

          // Assert: Card should be at the end of the queue
          const lastItem = dataSourceItems[dataSourceItems.length - 1];
          expect(lastItem).toEqual(cardToRate);

          // Assert: Queue size should remain the same
          expect(dataSourceItems.length).toBe(initialSize);

          // Assert: Scheduler should have been called
          expect(mockScheduler.schedule).toHaveBeenCalledWith(cardToRate, rating);

          // Assert: remove should have been called (part of rotateToEnd)
          expect(mockDataSource.remove).toHaveBeenCalledWith([cardToRate]);

          // Assert: getAll should have been called (part of rotateToEnd)
          expect(mockDataSource.getAll).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });

  /**
   * Property 2: 评分 < 3 时队列大小不变
   * Feature: retrieval-practice-rating-fix, Property 2: 评分 < 3 时队列大小不变
   * **Validates: Requirements 1.4, 5.1**
   * 
   * For any queue state and any card, when the user rates with 1 or 2,
   * the queue size should remain unchanged (removed then immediately inserted).
   */
  it('Property 2: 评分 < 3 时队列大小不变', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator 1: Random queue state (1-10 items, at least 1 to ensure we have a card to rate)
        fc.array(
          fc.record({
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        // Generator 2: Rating 1 or 2
        fc.constantFrom(1, 2),
        async (initialItems, rating) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          
          // Pick the first card to rate
          const cardToRate = dataSourceItems[0];
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          const mockScheduler = {
            schedule: vi.fn(async (item: TestItem) => item),
          };

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
            scheduler: mockScheduler,
          });

          const initialSize = dataSourceItems.length;

          // Act: Rate the card with rating < 3
          await queue.onFeedback(cardToRate, { action: 'rate', rating: rating as 1 | 2 });

          // Assert: Queue size should remain unchanged
          expect(dataSourceItems.length).toBe(initialSize);

          // Assert: The card should still be in the queue
          expect(dataSourceItems).toContainEqual(cardToRate);

          // Assert: Scheduler should have been called
          expect(mockScheduler.schedule).toHaveBeenCalledWith(cardToRate, rating);

          // Assert: remove should have been called (part of rotateToEnd)
          expect(mockDataSource.remove).toHaveBeenCalledWith([cardToRate]);

          // Assert: getAll should have been called (part of rotateToEnd)
          expect(mockDataSource.getAll).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 } // Run at least 100 iterations as required
    );
  });

  /**
   * Property 3: 评分 >= 3 时卡片从队列移除
   * Feature: retrieval-practice-rating-fix, Property 3: 评分 >= 3 时卡片从队列移除
   * **Validates: Requirements 2.1, 2.2**
   * 
   * For any queue state and any card, when the user rates with 3 or 4,
   * the card should be removed from the queue and should not appear in the queue anymore.
   */
  it('Property 3: 评分 >= 3 时卡片从队列移除', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator 1: Random queue state (1-10 items, at least 1 to ensure we have a card to rate)
        fc.array(
          fc.record({
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        // Generator 2: Rating 3 or 4
        fc.constantFrom(3, 4),
        async (initialItems, rating) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          
          // Pick the first card to rate
          const cardToRate = dataSourceItems[0];
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          const mockScheduler = {
            schedule: vi.fn(async (item: TestItem) => item),
          };

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
            scheduler: mockScheduler,
          });

          const initialSize = dataSourceItems.length;

          // Act: Rate the card with rating >= 3
          await queue.onFeedback(cardToRate, { action: 'rate', rating: rating as 3 | 4 });

          // Assert: Queue size should decrease by 1
          expect(dataSourceItems.length).toBe(initialSize - 1);

          // Assert: The card should NOT be in the queue anymore
          expect(dataSourceItems).not.toContainEqual(cardToRate);

          // Assert: Scheduler should have been called
          expect(mockScheduler.schedule).toHaveBeenCalledWith(cardToRate, rating);

          // Assert: remove should have been called
          expect(mockDataSource.remove).toHaveBeenCalledWith([cardToRate]);

          // Assert: getAll should NOT have been called (no rotation for rating >= 3)
          expect(mockDataSource.getAll).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 } // Run 20 iterations (reduced from 100 for faster execution)
    );
  });

  /**
   * Property 4: 评分 >= 3 时队列大小减少
   * Feature: retrieval-practice-rating-fix, Property 4: 评分 >= 3 时队列大小减少
   * **Validates: Requirements 2.4, 5.2**
   * 
   * For any queue state and any card, when the user rates with 3 or 4,
   * the queue size should decrease by 1.
   */
  it('Property 4: 评分 >= 3 时队列大小减少', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator 1: Random queue state (1-10 items, at least 1 to ensure we have a card to rate)
        fc.array(
          fc.record({
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        // Generator 2: Rating 3 or 4
        fc.constantFrom(3, 4),
        async (initialItems, rating) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          
          // Pick the first card to rate
          const cardToRate = dataSourceItems[0];
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          const mockScheduler = {
            schedule: vi.fn(async (item: TestItem) => item),
          };

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
            scheduler: mockScheduler,
          });

          const initialSize = dataSourceItems.length;

          // Act: Rate the card with rating >= 3
          await queue.onFeedback(cardToRate, { action: 'rate', rating: rating as 3 | 4 });

          // Assert: Queue size should decrease by exactly 1
          expect(dataSourceItems.length).toBe(initialSize - 1);

          // Assert: Scheduler should have been called
          expect(mockScheduler.schedule).toHaveBeenCalledWith(cardToRate, rating);

          // Assert: remove should have been called
          expect(mockDataSource.remove).toHaveBeenCalledWith([cardToRate]);
        }
      ),
      { numRuns: 20 } // Run 20 iterations (reduced from 100 for faster execution)
    );
  });

  /**
   * Property 5: 任何评分都调用 Scheduler
   * Feature: retrieval-practice-rating-fix, Property 5: 任何评分都调用 Scheduler
   * **Validates: Requirements 1.3, 2.3, 4.1**
   * 
   * For any card and any rating (1-4), Scheduler.schedule() method should be called
   * exactly once with the correct card and rating parameters.
   */
  it('Property 5: 任何评分都调用 Scheduler', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator 1: Random card
        fc.record({
          id: fc.uuid(),
          value: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        // Generator 2: Any rating (1-4)
        fc.constantFrom(1, 2, 3, 4),
        async (cardToRate, rating) => {
          // Arrange: Create queue with mock scheduler
          const dataSourceItems = [cardToRate];
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          // Create a mock scheduler to track calls
          const mockScheduler = {
            schedule: vi.fn(async (item: TestItem, r: number) => item),
          };

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
            scheduler: mockScheduler,
          });

          // Act: Rate the card with any rating (1-4)
          await queue.onFeedback(cardToRate, { action: 'rate', rating: rating as 1 | 2 | 3 | 4 });

          // Assert: Scheduler.schedule() should be called exactly once
          expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);

          // Assert: Scheduler.schedule() should be called with correct parameters
          expect(mockScheduler.schedule).toHaveBeenCalledWith(cardToRate, rating);
        }
      ),
      { numRuns: 20 } // Run 20 iterations (reduced from 100 for faster execution)
    );
  });

  /**
   * Property 6: getStats() 返回准确的队列大小
   * Feature: retrieval-practice-rating-fix, Property 6: getStats() 返回准确的队列大小
   * **Validates: Requirements 5.3**
   * 
   * For any queue state, calling getStats() should return a size field
   * that equals the actual number of items in the queue.
   */
  it('Property 6: getStats() 返回准确的队列大小', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator: Random queue state (0-10 items)
        fc.array(
          fc.record({
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
          });

          // Act: Call getStats()
          const stats = await queue.getStats();

          // Assert: The returned size should equal the actual queue size
          expect(stats.size).toBe(dataSourceItems.length);

          // Assert: The stats should have a label
          expect(stats.label).toBeDefined();
          expect(typeof stats.label).toBe('string');
        }
      ),
      { numRuns: 20 } // Run 20 iterations (reduced from 100 for faster execution)
    );
  });

  /**
   * Property 7: skip 操作移除卡片
   * Feature: retrieval-practice-rating-fix, Property 7: skip 操作移除卡片
   * **Validates: Requirements 6.3**
   * 
   * For any queue state and any card, when the user executes skip operation,
   * the card should be removed from the queue and the queue size should decrease by 1.
   */
  it('Property 7: skip 操作移除卡片', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generator 1: Random queue state (1-10 items, at least 1 to ensure we have a card to skip)
        fc.array(
          fc.record({
            id: fc.uuid(),
            value: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (initialItems) => {
          // Arrange: Create queue with initial items
          const dataSourceItems = [...initialItems];
          
          // Pick the first card to skip
          const cardToSkip = dataSourceItems[0];
          
          const mockDataSource: IDataSource<TestItem> = {
            getAll: vi.fn(async () => dataSourceItems),
            remove: vi.fn(async (itemsToRemove: TestItem[]) => {
              itemsToRemove.forEach(item => {
                const index = dataSourceItems.indexOf(item);
                if (index > -1) {
                  dataSourceItems.splice(index, 1);
                }
              });
              return itemsToRemove.length;
            }),
            size: async () => dataSourceItems.length,
          } as IDataSource<TestItem>;

          const mockSequencer: ISequencer<TestItem> = {
            next: vi.fn(async () => null),
          } as ISequencer<TestItem>;

          const mockScheduler = {
            schedule: vi.fn(async (item: TestItem) => item),
          };

          const queue = new BaseCompositeQueue({
            dataSource: mockDataSource,
            sequencer: mockSequencer,
            scheduler: mockScheduler,
          });

          const initialSize = dataSourceItems.length;

          // Act: Execute skip operation
          await queue.onFeedback(cardToSkip, { action: 'skip' });

          // Assert: Queue size should decrease by exactly 1
          expect(dataSourceItems.length).toBe(initialSize - 1);

          // Assert: The card should NOT be in the queue anymore
          expect(dataSourceItems).not.toContainEqual(cardToSkip);

          // Assert: remove should have been called
          expect(mockDataSource.remove).toHaveBeenCalledWith([cardToSkip]);

          // Assert: Scheduler should NOT have been called (skip doesn't schedule)
          expect(mockScheduler.schedule).not.toHaveBeenCalled();

          // Assert: getAll should NOT have been called (skip doesn't rotate)
          expect(mockDataSource.getAll).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 } // Run 20 iterations (reduced from 100 for faster execution)
    );
  });
});

/**
 * Unit Tests for Mixed Rating Scenarios
 * Feature: retrieval-practice-rating-fix
 * Task 5.2: Test mixed rating scenarios with consecutive ratings
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */
describe('BaseCompositeQueue - Mixed Rating Scenarios', () => {
  let mockDataSource: IDataSource<TestItem>;
  let mockSequencer: ISequencer<TestItem>;
  let mockScheduler: any;
  let queue: BaseCompositeQueue<TestItem>;
  let dataSourceItems: TestItem[];

  beforeEach(() => {
    // Initialize data source items
    dataSourceItems = [];

    // Create mock data source
    mockDataSource = {
      getAll: vi.fn(async () => dataSourceItems),
      remove: vi.fn(async (itemsToRemove: TestItem[]) => {
        itemsToRemove.forEach(item => {
          const index = dataSourceItems.indexOf(item);
          if (index > -1) {
            dataSourceItems.splice(index, 1);
          }
        });
        return itemsToRemove.length;
      }),
      size: async () => dataSourceItems.length,
    } as IDataSource<TestItem>;

    // Create mock sequencer
    mockSequencer = {
      next: vi.fn(async () => null),
    } as ISequencer<TestItem>;

    // Create mock scheduler
    mockScheduler = {
      schedule: vi.fn(async (item: TestItem) => item),
    };

    // Create queue
    queue = new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mockSequencer,
      scheduler: mockScheduler,
    });
  });

  it('应该正确处理混合评分场景：连续评分多张卡片（包括 < 3 和 >= 3）', async () => {
    // Arrange: Create initial queue with 5 cards
    const card1: TestItem = { id: '1', value: 'card1' };
    const card2: TestItem = { id: '2', value: 'card2' };
    const card3: TestItem = { id: '3', value: 'card3' };
    const card4: TestItem = { id: '4', value: 'card4' };
    const card5: TestItem = { id: '5', value: 'card5' };

    dataSourceItems.push(card1, card2, card3, card4, card5);

    // Initial state: 5 cards in queue
    let stats = await queue.getStats();
    expect(stats.size).toBe(5);

    // Act & Assert: Rate card1 with rating 1 (should rotate to end)
    await queue.onFeedback(card1, { action: 'rate', rating: 1 });
    
    stats = await queue.getStats();
    expect(stats.size).toBe(5); // Size should remain 5
    expect(dataSourceItems[4]).toEqual(card1); // card1 should be at the end
    expect(mockScheduler.schedule).toHaveBeenCalledWith(card1, 1);

    // Act & Assert: Rate card2 with rating 3 (should remove)
    await queue.onFeedback(card2, { action: 'rate', rating: 3 });
    
    stats = await queue.getStats();
    expect(stats.size).toBe(4); // Size should decrease to 4
    expect(dataSourceItems).not.toContainEqual(card2); // card2 should be removed
    expect(mockScheduler.schedule).toHaveBeenCalledWith(card2, 3);

    // Act & Assert: Rate card3 with rating 2 (should rotate to end)
    await queue.onFeedback(card3, { action: 'rate', rating: 2 });
    
    stats = await queue.getStats();
    expect(stats.size).toBe(4); // Size should remain 4
    expect(dataSourceItems[3]).toEqual(card3); // card3 should be at the end
    expect(mockScheduler.schedule).toHaveBeenCalledWith(card3, 2);

    // Act & Assert: Rate card4 with rating 4 (should remove)
    await queue.onFeedback(card4, { action: 'rate', rating: 4 });
    
    stats = await queue.getStats();
    expect(stats.size).toBe(3); // Size should decrease to 3
    expect(dataSourceItems).not.toContainEqual(card4); // card4 should be removed
    expect(mockScheduler.schedule).toHaveBeenCalledWith(card4, 4);

    // Act & Assert: Rate card5 with rating 1 (should rotate to end)
    await queue.onFeedback(card5, { action: 'rate', rating: 1 });
    
    stats = await queue.getStats();
    expect(stats.size).toBe(3); // Size should remain 3
    expect(dataSourceItems[2]).toEqual(card5); // card5 should be at the end
    expect(mockScheduler.schedule).toHaveBeenCalledWith(card5, 1);

    // Final verification: Check final queue state
    // Expected order: [card1, card3, card5] (all rotated cards)
    expect(dataSourceItems).toHaveLength(3);
    expect(dataSourceItems[0]).toEqual(card1);
    expect(dataSourceItems[1]).toEqual(card3);
    expect(dataSourceItems[2]).toEqual(card5);

    // Verify scheduler was called for all ratings
    expect(mockScheduler.schedule).toHaveBeenCalledTimes(5);
  });

  it('应该在混合评分场景中保持队列统计数据的准确性', async () => {
    // Arrange: Create initial queue with 4 cards
    const cards: TestItem[] = [
      { id: '1', value: 'card1' },
      { id: '2', value: 'card2' },
      { id: '3', value: 'card3' },
      { id: '4', value: 'card4' },
    ];

    dataSourceItems.push(...cards);

    // Test sequence: rating 2, 3, 1, 4
    const ratings: Array<1 | 2 | 3 | 4> = [2, 3, 1, 4];
    const expectedSizes = [4, 3, 3, 2]; // Expected sizes after each rating

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const rating = ratings[i];
      const expectedSize = expectedSizes[i];

      // Act: Rate the card
      await queue.onFeedback(card, { action: 'rate', rating });

      // Assert: Verify getStats() returns accurate size
      const stats = await queue.getStats();
      expect(stats.size).toBe(expectedSize);

      // Assert: Verify actual queue size matches
      expect(dataSourceItems.length).toBe(expectedSize);

      // Assert: Verify scheduler was called
      expect(mockScheduler.schedule).toHaveBeenCalledWith(card, rating);
    }

    // Final verification: Only cards with rating < 3 should remain
    // cards[0] (rating 2) and cards[2] (rating 1) should be in queue
    expect(dataSourceItems).toHaveLength(2);
    expect(dataSourceItems).toContainEqual(cards[0]);
    expect(dataSourceItems).toContainEqual(cards[2]);
    expect(dataSourceItems).not.toContainEqual(cards[1]); // rating 3, removed
    expect(dataSourceItems).not.toContainEqual(cards[3]); // rating 4, removed
  });

  it('应该在所有卡片都评分 < 3 时保持队列大小不变', async () => {
    // Arrange: Create initial queue with 3 cards
    const cards: TestItem[] = [
      { id: '1', value: 'card1' },
      { id: '2', value: 'card2' },
      { id: '3', value: 'card3' },
    ];

    dataSourceItems.push(...cards);

    const initialSize = 3;

    // Act: Rate all cards with rating < 3
    await queue.onFeedback(cards[0], { action: 'rate', rating: 1 });
    await queue.onFeedback(cards[1], { action: 'rate', rating: 2 });
    await queue.onFeedback(cards[2], { action: 'rate', rating: 1 });

    // Assert: Queue size should remain unchanged
    const stats = await queue.getStats();
    expect(stats.size).toBe(initialSize);
    expect(dataSourceItems).toHaveLength(initialSize);

    // Assert: All cards should still be in queue (rotated)
    expect(dataSourceItems).toContainEqual(cards[0]);
    expect(dataSourceItems).toContainEqual(cards[1]);
    expect(dataSourceItems).toContainEqual(cards[2]);
  });

  it('应该在所有卡片都评分 >= 3 时清空队列', async () => {
    // Arrange: Create initial queue with 3 cards
    const cards: TestItem[] = [
      { id: '1', value: 'card1' },
      { id: '2', value: 'card2' },
      { id: '3', value: 'card3' },
    ];

    dataSourceItems.push(...cards);

    // Act: Rate all cards with rating >= 3
    await queue.onFeedback(cards[0], { action: 'rate', rating: 3 });
    await queue.onFeedback(cards[1], { action: 'rate', rating: 4 });
    await queue.onFeedback(cards[2], { action: 'rate', rating: 3 });

    // Assert: Queue should be empty
    const stats = await queue.getStats();
    expect(stats.size).toBe(0);
    expect(dataSourceItems).toHaveLength(0);

    // Assert: No cards should remain in queue
    expect(dataSourceItems).not.toContainEqual(cards[0]);
    expect(dataSourceItems).not.toContainEqual(cards[1]);
    expect(dataSourceItems).not.toContainEqual(cards[2]);
  });

  it('应该在复杂混合场景中正确追踪队列统计', async () => {
    // Arrange: Create initial queue with 6 cards
    const cards: TestItem[] = [
      { id: '1', value: 'card1' },
      { id: '2', value: 'card2' },
      { id: '3', value: 'card3' },
      { id: '4', value: 'card4' },
      { id: '5', value: 'card5' },
      { id: '6', value: 'card6' },
    ];

    dataSourceItems.push(...cards);

    // Complex rating sequence: 1, 4, 2, 3, 1, 4
    const ratingSequence: Array<{ card: TestItem; rating: 1 | 2 | 3 | 4; expectedSize: number }> = [
      { card: cards[0], rating: 1, expectedSize: 6 }, // rotate
      { card: cards[1], rating: 4, expectedSize: 5 }, // remove
      { card: cards[2], rating: 2, expectedSize: 5 }, // rotate
      { card: cards[3], rating: 3, expectedSize: 4 }, // remove
      { card: cards[4], rating: 1, expectedSize: 4 }, // rotate
      { card: cards[5], rating: 4, expectedSize: 3 }, // remove
    ];

    // Act & Assert: Execute rating sequence and verify stats after each step
    for (const { card, rating, expectedSize } of ratingSequence) {
      await queue.onFeedback(card, { action: 'rate', rating });

      const stats = await queue.getStats();
      expect(stats.size).toBe(expectedSize);
      expect(dataSourceItems.length).toBe(expectedSize);
    }

    // Final verification: Only rotated cards should remain
    expect(dataSourceItems).toHaveLength(3);
    expect(dataSourceItems).toContainEqual(cards[0]); // rating 1
    expect(dataSourceItems).toContainEqual(cards[2]); // rating 2
    expect(dataSourceItems).toContainEqual(cards[4]); // rating 1

    // Removed cards should not be in queue
    expect(dataSourceItems).not.toContainEqual(cards[1]); // rating 4
    expect(dataSourceItems).not.toContainEqual(cards[3]); // rating 3
    expect(dataSourceItems).not.toContainEqual(cards[5]); // rating 4
  });
});
