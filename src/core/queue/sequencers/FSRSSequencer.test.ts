/**
 * FSRSSequencer Unit Tests
 * 
 * Tests for the FSRS-optimized sequencer with learning queue support.
 * 
 * Test Coverage:
 * 1. Basic Operations (insert, next, remove)
 * 2. Due Time Filtering (only returns due items)
 * 3. Binary Search Insertion (maintains sorted order)
 * 4. Priority Support (secondary sort key)
 * 5. Learning Steps (short intervals like 1m, 5m, 10m)
 * 6. Observer Pattern (cache invalidation)
 * 7. Edge Cases (empty queue, large datasets, etc.)
 */

import { describe, it, expect } from 'vitest';
import { FSRSSequencer } from './FSRSSequencer';
import type { QueueItem } from '../types';
import { createBlockID, createCardID } from '../../../types/branded';

// Test item type
type TestItem = QueueItem & {
  id: string;
  due: number;
  priority?: number;
};

// Helper: Create test item
const createTestItem = (id: string, dueMs: number, priority?: number): TestItem => ({
  blockID: createBlockID(`block-${id}`),
  cardID: createCardID(`card-${id}`),
  deckID: 'test-deck',
  id,
  due: dueMs,
  priority: priority ?? 50,
  nextDues: {
    1: new Date(dueMs).toISOString(),
    2: new Date(dueMs).toISOString(),
    3: new Date(dueMs).toISOString(),
    4: new Date(dueMs).toISOString(),
  },
});

// Helper: Create multiple test items
const createTestItems = (count: number, baseDue: number, interval: number = 60000): TestItem[] => {
  return Array.from({ length: count }, (_, i) =>
    createTestItem(`item-${i}`, baseDue + i * interval, 50)
  );
};

describe('FSRSSequencer - Basic Operations', () => {
  it('应该创建空的 sequencer', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    expect(sequencer.size()).toBe(0);
    expect(sequencer.isEmpty()).toBe(true);
  });

  it('应该使用初始项目创建 sequencer', () => {
    const now = Date.now();
    const items = createTestItems(3, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    expect(sequencer.size()).toBe(3);
    expect(sequencer.isEmpty()).toBe(false);
  });

  it('应该插入单个项目', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    const now = Date.now();
    const item = createTestItem('1', now);
    sequencer.insert(item);

    expect(sequencer.size()).toBe(1);
    expect(sequencer.isEmpty()).toBe(false);
  });

  it('应该插入多个项目', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    const now = Date.now();
    const items = createTestItems(5, now);
    sequencer.insertMany(items);

    expect(sequencer.size()).toBe(5);
  });

  it('应该移除项目', () => {
    const now = Date.now();
    const items = createTestItems(3, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    const removed = sequencer.remove((item) => item.id === 'item-1');

    expect(removed).toBe(true);
    expect(sequencer.size()).toBe(2);
  });

  it('应该清空队列', () => {
    const now = Date.now();
    const items = createTestItems(5, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    sequencer.clear();

    expect(sequencer.size()).toBe(0);
    expect(sequencer.isEmpty()).toBe(true);
  });

  it('应该获取所有项目', () => {
    const now = Date.now();
    const items = createTestItems(3, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    const allItems = sequencer.getAll();

    expect(allItems).toHaveLength(3);
    expect(allItems[0].id).toBe('item-0');
    expect(allItems[1].id).toBe('item-1');
    expect(allItems[2].id).toBe('item-2');
  });
});

describe('FSRSSequencer - Due Time Filtering', () => {
  it('应该只返回已到期的项目', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入 3 个项目：过去、现在、未来
    sequencer.insert(createTestItem('past', now - 60000)); // 1 分钟前
    sequencer.insert(createTestItem('now', now)); // 现在
    sequencer.insert(createTestItem('future', now + 60000)); // 1 分钟后

    // 应该只返回过去和现在的项目
    const item1 = await sequencer.next();
    expect(item1).not.toBeNull();
    expect(item1!.id).toBe('past');

    const item2 = await sequencer.next();
    expect(item2).not.toBeNull();
    expect(item2!.id).toBe('now');

    // 未来的项目不应该返回
    const item3 = await sequencer.next();
    expect(item3).toBeNull();

    // 队列中还有 1 个未到期的项目
    expect(sequencer.size()).toBe(1);
  });

  it('应该在项目到期后返回', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入一个未来的项目
    const futureTime = now + 100; // 100ms 后
    sequencer.insert(createTestItem('future', futureTime));

    // 现在不应该返回
    const item1 = await sequencer.next();
    expect(item1).toBeNull();

    // 等待 150ms
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 现在应该返回
    const item2 = await sequencer.next();
    expect(item2).not.toBeNull();
    expect(item2!.id).toBe('future');
  });

  it('应该正确计算到期项目数量', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入 5 个项目：2 个过去，1 个现在，2 个未来
    sequencer.insert(createTestItem('past1', now - 120000)); // 2 分钟前
    sequencer.insert(createTestItem('past2', now - 60000)); // 1 分钟前
    sequencer.insert(createTestItem('now', now)); // 现在
    sequencer.insert(createTestItem('future1', now + 60000)); // 1 分钟后
    sequencer.insert(createTestItem('future2', now + 120000)); // 2 分钟后

    const dueCount = sequencer.getDueCount();
    expect(dueCount).toBe(3); // past1, past2, now
  });

  it('应该获取下一个到期时间', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入项目
    const dueTime = now + 60000; // 1 分钟后
    sequencer.insert(createTestItem('item1', dueTime));
    sequencer.insert(createTestItem('item2', now + 120000)); // 2 分钟后

    const nextDue = sequencer.getNextDueTime();
    expect(nextDue).toBe(dueTime);
  });

  it('空队列应该返回 null 作为下一个到期时间', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    const nextDue = sequencer.getNextDueTime();
    expect(nextDue).toBeNull();
  });
});

describe('FSRSSequencer - Binary Search Insertion', () => {
  it('应该按到期时间排序插入', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 乱序插入
    sequencer.insert(createTestItem('3', now + 180000)); // 3 分钟后
    sequencer.insert(createTestItem('1', now + 60000)); // 1 分钟后
    sequencer.insert(createTestItem('2', now + 120000)); // 2 分钟后

    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('1');
    expect(allItems[1].id).toBe('2');
    expect(allItems[2].id).toBe('3');
  });

  it('应该维护排序顺序（多次插入）', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入 10 个随机顺序的项目
    const items = [
      createTestItem('5', now + 300000),
      createTestItem('2', now + 120000),
      createTestItem('8', now + 480000),
      createTestItem('1', now + 60000),
      createTestItem('9', now + 540000),
      createTestItem('4', now + 240000),
      createTestItem('7', now + 420000),
      createTestItem('3', now + 180000),
      createTestItem('6', now + 360000),
      createTestItem('10', now + 600000),
    ];

    items.forEach((item) => sequencer.insert(item));

    const allItems = sequencer.getAll();
    for (let i = 0; i < allItems.length; i++) {
      expect(allItems[i].id).toBe(`${i + 1}`);
    }
  });

  it('应该正确处理相同到期时间的项目（FIFO）', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入 3 个相同到期时间的项目
    sequencer.insert(createTestItem('first', now));
    sequencer.insert(createTestItem('second', now));
    sequencer.insert(createTestItem('third', now));

    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('first');
    expect(allItems[1].id).toBe('second');
    expect(allItems[2].id).toBe('third');
  });
});

describe('FSRSSequencer - Priority Support', () => {
  it('应该按优先级排序（相同到期时间）', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPriority: (item) => item.priority ?? 50,
    });

    // 插入 3 个相同到期时间但不同优先级的项目
    sequencer.insert(createTestItem('low', now, 30));
    sequencer.insert(createTestItem('high', now, 70));
    sequencer.insert(createTestItem('medium', now, 50));

    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('high'); // 优先级 70
    expect(allItems[1].id).toBe('medium'); // 优先级 50
    expect(allItems[2].id).toBe('low'); // 优先级 30
  });

  it('应该先按到期时间排序，再按优先级排序', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPriority: (item) => item.priority ?? 50,
    });

    // 插入项目：不同到期时间和优先级
    sequencer.insert(createTestItem('future-high', now + 60000, 90)); // 未来，高优先级
    sequencer.insert(createTestItem('now-low', now, 30)); // 现在，低优先级
    sequencer.insert(createTestItem('now-high', now, 70)); // 现在，高优先级
    sequencer.insert(createTestItem('past-low', now - 60000, 30)); // 过去，低优先级

    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('past-low'); // 最早到期
    expect(allItems[1].id).toBe('now-high'); // 现在，高优先级
    expect(allItems[2].id).toBe('now-low'); // 现在，低优先级
    expect(allItems[3].id).toBe('future-high'); // 未来
  });

  it('应该处理未定义的优先级', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPriority: (item) => item.priority ?? 50,
    });

    // 插入项目：有些有优先级，有些没有
    const item1 = createTestItem('with-priority', now, 70);
    const item2 = createTestItem('without-priority', now);
    delete item2.priority; // 删除优先级字段

    sequencer.insert(item1);
    sequencer.insert(item2);

    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('with-priority'); // 优先级 70
    expect(allItems[1].id).toBe('without-priority'); // 默认优先级 50
  });
});

describe('FSRSSequencer - FSRS Learning Steps', () => {
  it('应该支持 1 分钟学习步骤', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 模拟用户点"忘记"，卡片 1 分钟后到期
    const card = createTestItem('learning', now + 60000); // 1 分钟后
    sequencer.insert(card);

    // 现在不应该返回
    const item1 = await sequencer.next();
    expect(item1).toBeNull();

    // 等待 70ms（模拟时间流逝）
    await new Promise((resolve) => setTimeout(resolve, 70));

    // 仍然不应该返回（还没到 1 分钟）
    const item2 = await sequencer.next();
    expect(item2).toBeNull();
  });

  it('应该支持多个学习步骤（1m, 10m）', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 模拟 FSRS learning_steps: ['1m', '10m']
    const card1 = createTestItem('step1', now + 60000); // 1 分钟后
    const card2 = createTestItem('step2', now + 600000); // 10 分钟后

    sequencer.insert(card1);
    sequencer.insert(card2);

    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('step1'); // 1 分钟步骤在前
    expect(allItems[1].id).toBe('step2'); // 10 分钟步骤在后
  });

  it('应该支持失败卡片重新进入队列', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入一个已到期的卡片
    const card = createTestItem('card', now - 1000);
    sequencer.insert(card);

    // 获取卡片
    const item = await sequencer.next();
    expect(item).not.toBeNull();
    expect(item!.id).toBe('card');
    expect(sequencer.size()).toBe(0);

    // 用户点"忘记"，卡片 1 分钟后重新进入队列
    card.due = now + 60000;
    sequencer.insert(card);

    expect(sequencer.size()).toBe(1);

    // 现在不应该返回（还没到期）
    const item2 = await sequencer.next();
    expect(item2).toBeNull();
  });

  it('应该支持短间隔（秒级）', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入一个 5 秒后到期的卡片
    const card = createTestItem('short', now + 5000);
    sequencer.insert(card);

    // 现在不应该返回
    const item1 = await sequencer.next();
    expect(item1).toBeNull();

    // 等待 6 秒
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // 现在应该返回
    const item2 = await sequencer.next();
    expect(item2).not.toBeNull();
    expect(item2!.id).toBe('short');
  });
});

describe('FSRSSequencer - Observer Pattern', () => {
  it('应该实现 onDataChanged 方法', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    expect(typeof sequencer.onDataChanged).toBe('function');
  });

  it('应该在 onDataChanged 时清空缓存', () => {
    const now = Date.now();
    const items = createTestItems(5, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    expect(sequencer.size()).toBe(5);

    // 触发 onDataChanged
    sequencer.onDataChanged();

    expect(sequencer.size()).toBe(0);
    expect(sequencer.isEmpty()).toBe(true);
  });

  it('应该在清空后可以重新插入项目', () => {
    const now = Date.now();
    const items = createTestItems(3, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    // 触发 onDataChanged
    sequencer.onDataChanged();
    expect(sequencer.size()).toBe(0);

    // 重新插入项目
    const newItems = createTestItems(2, now);
    sequencer.insertMany(newItems);

    expect(sequencer.size()).toBe(2);
  });
});

describe('FSRSSequencer - Edge Cases', () => {
  it('应该处理空队列', async () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    const item = await sequencer.next();
    expect(item).toBeNull();
    expect(sequencer.size()).toBe(0);
    expect(sequencer.isEmpty()).toBe(true);
    expect(sequencer.getDueCount()).toBe(0);
    expect(sequencer.getNextDueTime()).toBeNull();
  });

  it('应该处理大量项目（性能测试）', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入 1000 个项目
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      sequencer.insert(createTestItem(`item-${i}`, now + i * 1000));
    }
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(sequencer.size()).toBe(1000);
    expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成

    // 验证排序正确
    const allItems = sequencer.getAll();
    for (let i = 0; i < 999; i++) {
      expect(allItems[i].due).toBeLessThanOrEqual(allItems[i + 1].due);
    }
  });

  it('应该处理负数到期时间', async () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入一个负数到期时间的项目（很久以前）
    const card = createTestItem('ancient', -1000000);
    sequencer.insert(card);

    // 应该立即返回
    const item = await sequencer.next();
    expect(item).not.toBeNull();
    expect(item!.id).toBe('ancient');
  });

  it('应该处理非常大的到期时间', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入一个非常远的未来时间
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 年后
    const card = createTestItem('far-future', farFuture);
    sequencer.insert(card);

    expect(sequencer.size()).toBe(1);
    expect(sequencer.getDueCount()).toBe(0); // 不应该到期
  });

  it('应该处理移除不存在的项目', () => {
    const now = Date.now();
    const items = createTestItems(3, now);

    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: items,
    });

    const removed = sequencer.remove((item) => item.id === 'non-existent');
    expect(removed).toBe(false);
    expect(sequencer.size()).toBe(3);
  });

  it('应该处理重复插入相同项目', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    const card = createTestItem('duplicate', now);
    sequencer.insert(card);
    sequencer.insert(card);
    sequencer.insert(card);

    expect(sequencer.size()).toBe(3); // 允许重复
  });

  it('应该处理初始项目为空数组', () => {
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initialItems: [],
    });

    expect(sequencer.size()).toBe(0);
    expect(sequencer.isEmpty()).toBe(true);
  });

  it('应该处理相同到期时间和优先级的大量项目', () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPriority: (item) => item.priority ?? 50,
    });

    // 插入 100 个相同到期时间和优先级的项目
    for (let i = 0; i < 100; i++) {
      sequencer.insert(createTestItem(`item-${i}`, now, 50));
    }

    expect(sequencer.size()).toBe(100);

    // 验证 FIFO 顺序
    const allItems = sequencer.getAll();
    for (let i = 0; i < 100; i++) {
      expect(allItems[i].id).toBe(`item-${i}`);
    }
  });
});

describe('FSRSSequencer - Integration Tests', () => {
  it('应该模拟完整的 FSRS 学习流程', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 1. 插入一个新卡片（立即到期）
    const card = createTestItem('new-card', now);
    sequencer.insert(card);

    // 2. 获取卡片
    const item1 = await sequencer.next();
    expect(item1).not.toBeNull();
    expect(item1!.id).toBe('new-card');

    // 3. 用户点"忘记"（Rating.Again），卡片 1 分钟后重新进入
    card.due = now + 60000;
    sequencer.insert(card);

    // 4. 现在不应该返回
    const item2 = await sequencer.next();
    expect(item2).toBeNull();

    // 5. 等待 70ms
    await new Promise((resolve) => setTimeout(resolve, 70));

    // 6. 仍然不应该返回
    const item3 = await sequencer.next();
    expect(item3).toBeNull();

    // 7. 验证队列状态
    expect(sequencer.size()).toBe(1);
    expect(sequencer.getDueCount()).toBe(0);
  });

  it('应该模拟多张卡片的混合场景', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPriority: (item) => item.priority ?? 50,
    });

    // 插入多张不同状态的卡片
    sequencer.insert(createTestItem('due-now', now, 50)); // 现在到期
    sequencer.insert(createTestItem('due-past', now - 60000, 70)); // 过去到期，高优先级
    sequencer.insert(createTestItem('due-future-1m', now + 60000, 50)); // 1 分钟后
    sequencer.insert(createTestItem('due-future-10m', now + 600000, 50)); // 10 分钟后

    // 应该按顺序返回：due-past, due-now
    const item1 = await sequencer.next();
    expect(item1!.id).toBe('due-past');

    const item2 = await sequencer.next();
    expect(item2!.id).toBe('due-now');

    // 未来的卡片不应该返回
    const item3 = await sequencer.next();
    expect(item3).toBeNull();

    // 验证队列状态
    expect(sequencer.size()).toBe(2); // 还有 2 张未到期
    expect(sequencer.getDueCount()).toBe(0); // 没有到期的
  });

  it('应该正确处理卡片的重新调度', async () => {
    const now = Date.now();
    const sequencer = new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    });

    // 插入 3 张卡片
    const card1 = createTestItem('card1', now);
    const card2 = createTestItem('card2', now + 60000);
    const card3 = createTestItem('card3', now + 120000);

    sequencer.insert(card1);
    sequencer.insert(card2);
    sequencer.insert(card3);

    // 获取第一张卡片
    const item1 = await sequencer.next();
    expect(item1!.id).toBe('card1');

    // 用户点"忘记"，重新调度到 5 分钟后
    card1.due = now + 300000;
    sequencer.insert(card1);

    // 验证排序：card2 (1m) < card3 (2m) < card1 (5m)
    const allItems = sequencer.getAll();
    expect(allItems[0].id).toBe('card2');
    expect(allItems[1].id).toBe('card3');
    expect(allItems[2].id).toBe('card1');
  });
});
