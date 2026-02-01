/**
 * Boundary Conditions Tests for BaseCompositeQueue
 * Feature: architecture-optimization
 * Task 4.6: Add boundary condition tests
 * 
 * **Validates: Requirements 5.5**
 * 
 * WHEN boundary conditions are tested, THE System SHALL have at least 20 new test cases
 * covering edge scenarios including:
 * - Large datasets (1000+ cards)
 * - Special characters and encoding issues
 * - Extreme date values
 * - Other edge cases
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseCompositeQueue } from '../BaseCompositeQueue';
import type { IDataSource } from '../../datasource/IDataSource';
import type { ISequencer } from '../../abstraction/types';

// Test item type with realistic card fields
type TestCard = {
  id: string;
  value: string;
  due?: number;
  priority?: number;
  content?: string;
};

/**
 * Helper function to create a mock data source
 */
function createMockDataSource<TItem>(initialItems: TItem[]): IDataSource<TItem> {
  const items = [...initialItems];
  
  return {
    getAll: vi.fn(async () => items),
    remove: vi.fn(async (itemsToRemove: TItem[]) => {
      itemsToRemove.forEach(item => {
        const index = items.indexOf(item);
        if (index > -1) {
          items.splice(index, 1);
        }
      });
      return itemsToRemove.length;
    }),
    size: async () => items.length,
  } as IDataSource<TItem>;
}

/**
 * Helper function to create a mock sequencer
 */
function createMockSequencer<TItem>(items: TItem[]): ISequencer<TItem> {
  let nextIndex = 0;
  
  return {
    next: vi.fn(async () => {
      if (nextIndex < items.length) {
        return items[nextIndex++];
      }
      return null;
    }),
  } as ISequencer<TItem>;
}

describe('BaseCompositeQueue - Boundary Conditions Tests', () => {
  /**
   * Test 1: Large dataset handling (1000+ cards)
   * Validates: Requirement 5.5
   */
  describe('大量卡片场景 (1000+)', () => {
    it('应该能够处理 1000 张卡片而不出错', async () => {
      // Given: 创建 1000 张卡片
      const cards: TestCard[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `card-${i}`,
        value: `content-${i}`,
        due: Date.now() + i * 1000,
      }));
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取队列统计信息
      const stats = await queue.getStats();

      // Then: 应该正确报告队列大小
      expect(stats.size).toBe(1000);
    });

    it('应该能够从 1000 张卡片中连续获取多张卡片', async () => {
      // Given: 创建 1000 张卡片
      const cards: TestCard[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `card-${i}`,
        value: `content-${i}`,
      }));
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 连续获取 100 张卡片
      const retrievedCards: TestCard[] = [];
      for (let i = 0; i < 100; i++) {
        const card = await queue.next();
        if (card) retrievedCards.push(card);
      }

      // Then: 应该成功获取 100 张不同的卡片
      expect(retrievedCards).toHaveLength(100);
      const uniqueIds = new Set(retrievedCards.map(c => c.id));
      expect(uniqueIds.size).toBe(100);
    });

    it('应该能够处理 5000 张卡片的大规模场景', async () => {
      // Given: 创建 5000 张卡片
      const cards: TestCard[] = Array.from({ length: 5000 }, (_, i) => ({
        id: `large-card-${i}`,
        value: `large-content-${i}`,
        priority: i % 100,
      }));
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取队列统计信息
      const stats = await queue.getStats();

      // Then: 应该正确报告队列大小
      expect(stats.size).toBe(5000);
    });
  });

  /**
   * Test 2-6: Special characters and encoding issues
   * Validates: Requirement 5.5
   */
  describe('特殊字符和编码问题', () => {
    it('应该正确处理包含 Unicode 字符的卡片', async () => {
      // Given: 包含各种 Unicode 字符的卡片
      const cards: TestCard[] = [
        { id: '1', value: '你好世界 🌍', content: '中文内容' },
        { id: '2', value: 'Привет мир 🇷🇺', content: '俄语内容' },
        { id: '3', value: 'مرحبا بالعالم 🇸🇦', content: '阿拉伯语内容' },
        { id: '4', value: 'こんにちは世界 🇯🇵', content: '日语内容' },
        { id: '5', value: '안녕하세요 세계 🇰🇷', content: '韩语内容' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取队列统计信息
      const stats = await queue.getStats();

      // Then: 应该保留所有 Unicode 字符
      expect(stats.size).toBe(5);
      
      // Verify by getting cards one by one
      const card1 = await queue.next();
      const card2 = await queue.next();
      expect(card1?.value).toBe('你好世界 🌍');
      expect(card2?.value).toBe('Привет мир 🇷🇺');
    });

    it('应该正确处理包含特殊符号的卡片', async () => {
      // Given: 包含特殊符号的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'Math: ∑∫∂∇∞≈≠±×÷' },
        { id: '2', value: 'Arrows: ←→↑↓↔↕⇐⇒⇑⇓' },
        { id: '3', value: 'Currency: $€£¥₹₽₩₪' },
        { id: '4', value: 'Symbols: ©®™§¶†‡' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();

      // Then: 应该保留所有特殊符号
      expect(card1?.value).toBe('Math: ∑∫∂∇∞≈≠±×÷');
      expect(card2?.value).toBe('Arrows: ←→↑↓↔↕⇐⇒⇑⇓');
    });

    it('应该正确处理包含 HTML/XML 特殊字符的卡片', async () => {
      // Given: 包含 HTML/XML 特殊字符的卡片
      const cards: TestCard[] = [
        { id: '1', value: '<div>HTML content</div>' },
        { id: '2', value: 'A & B < C > D' },
        { id: '3', value: 'Quote: "test" and \'test\'' },
        { id: '4', value: 'Backslash: \\ and slash: /' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();

      // Then: 应该保留所有特殊字符
      expect(card1?.value).toBe('<div>HTML content</div>');
      expect(card2?.value).toBe('A & B < C > D');
      expect(card3?.value).toBe('Quote: "test" and \'test\'');
    });

    it('应该正确处理包含换行符和制表符的卡片', async () => {
      // Given: 包含换行符和制表符的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'Line 1\nLine 2\nLine 3' },
        { id: '2', value: 'Tab\tseparated\tvalues' },
        { id: '3', value: 'Mixed\n\tformatting\r\nhere' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();

      // Then: 应该保留换行符和制表符
      expect(card1?.value).toBe('Line 1\nLine 2\nLine 3');
      expect(card2?.value).toBe('Tab\tseparated\tvalues');
    });

    it('应该正确处理空字符串和空白字符', async () => {
      // Given: 包含空字符串和空白字符的卡片
      const cards: TestCard[] = [
        { id: '1', value: '' },
        { id: '2', value: '   ' },
        { id: '3', value: '\t\t\t' },
        { id: '4', value: '\n\n\n' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取队列统计信息
      const stats = await queue.getStats();

      // Then: 应该保留空字符串和空白字符
      expect(stats.size).toBe(4);
      
      // Verify by getting cards
      const card1 = await queue.next();
      const card2 = await queue.next();
      expect(card1?.value).toBe('');
      expect(card2?.value).toBe('   ');
    });
  });

  /**
   * Test 7-11: Extreme date values
   * Validates: Requirement 5.5
   */
  describe('极端日期值', () => {
    it('应该正确处理 Unix 纪元时间 (1970-01-01)', async () => {
      // Given: Unix 纪元时间的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'Epoch', due: 0 },
        { id: '2', value: 'Near epoch', due: 1000 },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card = await queue.next();

      // Then: 应该正确处理纪元时间
      expect(card?.due).toBe(0);
    });

    it('应该正确处理负数时间戳（1970 年之前）', async () => {
      // Given: 负数时间戳的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'Before epoch', due: -86400000 }, // 1969-12-31
        { id: '2', value: 'Way before', due: -31536000000 }, // 1969-01-01
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card = await queue.next();

      // Then: 应该正确处理负数时间戳
      expect(card?.due).toBe(-86400000);
    });

    it('应该正确处理非常大的时间戳（遥远的未来）', async () => {
      // Given: 非常大的时间戳
      const farFuture = 9999999999999; // Year 2286
      const cards: TestCard[] = [
        { id: '1', value: 'Far future', due: farFuture },
        { id: '2', value: 'Very far', due: Number.MAX_SAFE_INTEGER },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();

      // Then: 应该正确处理大时间戳
      expect(card1?.due).toBe(farFuture);
      expect(card2?.due).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('应该正确处理相同的到期时间', async () => {
      // Given: 多张卡片有相同的到期时间
      const sameTime = Date.now();
      const cards: TestCard[] = [
        { id: '1', value: 'Card 1', due: sameTime },
        { id: '2', value: 'Card 2', due: sameTime },
        { id: '3', value: 'Card 3', due: sameTime },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取队列统计信息
      const stats = await queue.getStats();

      // Then: 应该返回所有卡片
      expect(stats.size).toBe(3);
      
      // Verify all cards have same due time
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();
      expect(card1?.due).toBe(sameTime);
      expect(card2?.due).toBe(sameTime);
      expect(card3?.due).toBe(sameTime);
    });

    it('应该正确处理未定义的到期时间', async () => {
      // Given: 没有到期时间的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'No due date' },
        { id: '2', value: 'Also no due', due: undefined },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();

      // Then: 应该正确处理未定义的到期时间
      expect(card1?.due).toBeUndefined();
      expect(card2?.due).toBeUndefined();
    });
  });

  /**
   * Test 12-20: Other edge cases
   * Validates: Requirement 5.5
   */
  describe('其他边界条件', () => {
    it('应该正确处理非常长的字符串内容', async () => {
      // Given: 包含非常长字符串的卡片
      const longString = 'A'.repeat(10000);
      const cards: TestCard[] = [
        { id: '1', value: longString },
        { id: '2', value: 'Normal content' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card = await queue.next();

      // Then: 应该正确处理长字符串
      expect(card?.value).toHaveLength(10000);
      expect(card?.value).toBe(longString);
    });

    it('应该正确处理包含 null 字节的字符串', async () => {
      // Given: 包含 null 字节的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'Before\x00After' },
        { id: '2', value: 'Multiple\x00null\x00bytes' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card = await queue.next();

      // Then: 应该保留 null 字节
      expect(card?.value).toBe('Before\x00After');
    });

    it('应该正确处理极端优先级值', async () => {
      // Given: 包含极端优先级的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'Max priority', priority: Number.MAX_SAFE_INTEGER },
        { id: '2', value: 'Min priority', priority: Number.MIN_SAFE_INTEGER },
        { id: '3', value: 'Zero priority', priority: 0 },
        { id: '4', value: 'Negative priority', priority: -1000 },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();
      const card4 = await queue.next();

      // Then: 应该保留所有优先级值
      expect(card1?.priority).toBe(Number.MAX_SAFE_INTEGER);
      expect(card2?.priority).toBe(Number.MIN_SAFE_INTEGER);
      expect(card3?.priority).toBe(0);
      expect(card4?.priority).toBe(-1000);
    });

    it('应该正确处理重复的 ID', async () => {
      // Given: 包含重复 ID 的卡片
      const cards: TestCard[] = [
        { id: 'duplicate', value: 'First' },
        { id: 'duplicate', value: 'Second' },
        { id: 'unique', value: 'Third' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取队列统计信息
      const stats = await queue.getStats();

      // Then: 应该返回所有卡片（包括重复 ID）
      expect(stats.size).toBe(3);
      
      // Verify by getting cards
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();
      const duplicateCount = [card1, card2, card3].filter(c => c?.id === 'duplicate').length;
      expect(duplicateCount).toBe(2);
    });

    it('应该正确处理包含 JSON 字符串的内容', async () => {
      // Given: 包含 JSON 字符串的卡片
      const jsonContent = JSON.stringify({ key: 'value', nested: { data: [1, 2, 3] } });
      const cards: TestCard[] = [
        { id: '1', value: jsonContent },
        { id: '2', value: '{"invalid": json}' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card = await queue.next();

      // Then: 应该保留 JSON 字符串
      expect(card?.value).toBe(jsonContent);
      expect(() => JSON.parse(card!.value)).not.toThrow();
    });

    it('应该正确处理包含 URL 和路径的内容', async () => {
      // Given: 包含 URL 和路径的卡片
      const cards: TestCard[] = [
        { id: '1', value: 'https://example.com/path?query=value&other=123' },
        { id: '2', value: 'file:///C:/Users/Test/Documents/file.txt' },
        { id: '3', value: '/absolute/path/to/file' },
        { id: '4', value: '../relative/path/to/file' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();
      const card4 = await queue.next();

      // Then: 应该保留所有 URL 和路径
      expect(card1?.value).toBe('https://example.com/path?query=value&other=123');
      expect(card2?.value).toBe('file:///C:/Users/Test/Documents/file.txt');
    });

    it('应该正确处理混合大小写的 ID', async () => {
      // Given: 包含混合大小写 ID 的卡片
      const cards: TestCard[] = [
        { id: 'ABC123', value: 'Upper' },
        { id: 'abc123', value: 'Lower' },
        { id: 'AbC123', value: 'Mixed' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();

      // Then: 应该区分大小写
      expect([card1?.id, card2?.id, card3?.id]).toEqual(['ABC123', 'abc123', 'AbC123']);
    });

    it('应该正确处理包含正则表达式特殊字符的内容', async () => {
      // Given: 包含正则表达式特殊字符的卡片
      const cards: TestCard[] = [
        { id: '1', value: '.*+?^${}()|[]\\' },
        { id: '2', value: 'Pattern: [a-z]+ matches text' },
        { id: '3', value: 'Escape: \\d{3}-\\d{4}' },
      ];
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 获取卡片
      const card1 = await queue.next();
      const card2 = await queue.next();
      const card3 = await queue.next();

      // Then: 应该保留所有正则表达式字符
      expect(card1?.value).toBe('.*+?^${}()|[]\\');
      expect(card2?.value).toBe('Pattern: [a-z]+ matches text');
    });

    it('应该正确处理快速连续的操作', async () => {
      // Given: 创建队列
      const cards: TestCard[] = Array.from({ length: 100 }, (_, i) => ({
        id: `card-${i}`,
        value: `content-${i}`,
      }));
      
      const mockDataSource = createMockDataSource(cards);
      const mockSequencer = createMockSequencer([...cards]);
      
      const queue = new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer: mockSequencer,
      });

      // When: 快速连续调用 next() 和 getStats()
      const operations = await Promise.all([
        queue.next(),
        queue.getStats(),
        queue.next(),
        queue.getStats(),
        queue.next(),
      ]);

      // Then: 所有操作都应该成功
      expect(operations[0]).not.toBeNull(); // first next()
      expect(operations[1].size).toBeGreaterThan(0); // first getStats()
      expect(operations[2]).not.toBeNull(); // second next()
      expect(operations[3].size).toBeGreaterThan(0); // second getStats()
      expect(operations[4]).not.toBeNull(); // third next()
    });
  });
});
