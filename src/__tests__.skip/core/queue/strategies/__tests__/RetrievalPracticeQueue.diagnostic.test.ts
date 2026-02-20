/**
 * Diagnostic Test for Retrieval Practice Queue Manual Card Addition
 * 
 * This test is designed to collect detailed logs to diagnose the card ID mismatch issue.
 * 
 * Run with: npm test -- RetrievalPracticeQueue.diagnostic.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import type { QueueItem } from '../../types';
import type { StorageManager } from '@/core/storage/manager';

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
    saveData: vi.fn().mockResolvedValue(null),
    loadData: vi.fn().mockResolvedValue(null),
    getRiffBlacklist: vi.fn(() => []),
    addToRiffBlacklist: vi.fn(),
  } as unknown as StorageManager;

  return storage;
};

// Mock Riff API
const mockRiffApi = {
  getRiffDueCards: vi.fn().mockResolvedValue({
    cards: [],
    unreviewedCount: 0,
    unreviewedNewCardCount: 0,
    unreviewedOldCardCount: 0,
  }),
  reviewRiffCard: vi.fn().mockResolvedValue(undefined),
  skipReviewRiffCard: vi.fn().mockResolvedValue(undefined),
};

describe('Retrieval Practice Queue - Diagnostic Tests', () => {
  let queue: RetrievalPracticeQueue;
  let storage: StorageManager;

  beforeEach(async () => {
    storage = createMockStorage();
    queue = await RetrievalPracticeQueue.create({
      storage,
      deckID: 'test-deck',
      api: mockRiffApi,
    });
  });

  it('DIAGNOSTIC: Should add a single card and preserve card ID', async () => {
    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST: Single Card Addition');
    console.log('========================================\n');

    // 准备测试数据
    const testCard: QueueItem = {
      cardID: '20260203222457-raq2sfs',
      blockID: 'block-test-001',
      deckID: 'test-deck',
      priority: 50,
      nextDues: {
        1: new Date(Date.now() + 86400000).toISOString(),
        2: new Date(Date.now() + 86400000).toISOString(),
        3: new Date(Date.now() + 86400000).toISOString(),
        4: new Date(Date.now() + 86400000).toISOString(),
      },
    };

    console.log('测试卡片数据:', {
      cardID: testCard.cardID,
      blockID: testCard.blockID,
      deckID: testCard.deckID,
      priority: testCard.priority,
    });

    // 记录初始状态
    const initialSize = queue.getAllItems().length;
    console.log('初始队列大小:', initialSize);

    // 执行添加操作
    console.log('\n--- 开始执行 addItems() ---\n');
    const added = await queue.addItems([testCard]);
    console.log('\n--- addItems() 完成 ---\n');

    // 验证结果
    console.log('返回的 added 数量:', added);
    expect(added).toBe(1);

    // 检查队列状态
    const allItems = queue.getAllItems();
    console.log('最终队列大小:', allItems.length);
    console.log('最终队列内容:', allItems.map(item => ({
      cardID: item.cardID,
      blockID: item.blockID,
    })));

    // 查找添加的卡片
    const foundCard = allItems.find(item => item.cardID === testCard.cardID);
    console.log('查找结果:', foundCard ? {
      cardID: foundCard.cardID,
      blockID: foundCard.blockID,
      match: foundCard.cardID === testCard.cardID && foundCard.blockID === testCard.blockID,
    } : 'NOT FOUND');

    // 断言
    expect(foundCard).toBeDefined();
    expect(foundCard?.cardID).toBe(testCard.cardID);
    expect(foundCard?.blockID).toBe(testCard.blockID);

    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST COMPLETED');
    console.log('========================================\n');
  });

  it('DIAGNOSTIC: Should add multiple cards and preserve all card IDs', async () => {
    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST: Multiple Cards Addition');
    console.log('========================================\n');

    // 准备测试数据
    const testCards: QueueItem[] = [
      {
        cardID: '20260203222457-card001',
        blockID: 'block-test-001',
        deckID: 'test-deck',
        priority: 50,
        nextDues: {
          1: new Date(Date.now() + 86400000).toISOString(),
          2: new Date(Date.now() + 86400000).toISOString(),
          3: new Date(Date.now() + 86400000).toISOString(),
          4: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      {
        cardID: '20260203222457-card002',
        blockID: 'block-test-002',
        deckID: 'test-deck',
        priority: 60,
        nextDues: {
          1: new Date(Date.now() + 172800000).toISOString(),
          2: new Date(Date.now() + 172800000).toISOString(),
          3: new Date(Date.now() + 172800000).toISOString(),
          4: new Date(Date.now() + 172800000).toISOString(),
        },
      },
      {
        cardID: '20260203222457-card003',
        blockID: 'block-test-003',
        deckID: 'test-deck',
        priority: 40,
        nextDues: {
          1: new Date(Date.now() + 259200000).toISOString(),
          2: new Date(Date.now() + 259200000).toISOString(),
          3: new Date(Date.now() + 259200000).toISOString(),
          4: new Date(Date.now() + 259200000).toISOString(),
        },
      },
    ];

    console.log('测试卡片数量:', testCards.length);
    console.log('测试卡片 IDs:', testCards.map(c => c.cardID));

    // 执行添加操作
    console.log('\n--- 开始执行 addItems() ---\n');
    const added = await queue.addItems(testCards);
    console.log('\n--- addItems() 完成 ---\n');

    // 验证结果
    console.log('返回的 added 数量:', added);
    expect(added).toBe(3);

    // 检查队列状态
    const allItems = queue.getAllItems();
    console.log('最终队列大小:', allItems.length);

    // 验证每张卡片
    for (const testCard of testCards) {
      const foundCard = allItems.find(item => item.cardID === testCard.cardID);
      console.log(`验证卡片 ${testCard.cardID}:`, foundCard ? {
        cardID: foundCard.cardID,
        blockID: foundCard.blockID,
        match: foundCard.cardID === testCard.cardID && foundCard.blockID === testCard.blockID,
      } : 'NOT FOUND');

      expect(foundCard).toBeDefined();
      expect(foundCard?.cardID).toBe(testCard.cardID);
      expect(foundCard?.blockID).toBe(testCard.blockID);
    }

    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST COMPLETED');
    console.log('========================================\n');
  });

  it('DIAGNOSTIC: Should handle cards with different nextDues formats', async () => {
    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST: Different nextDues Formats');
    console.log('========================================\n');

    // 准备测试数据 - 模拟可能有问题的 nextDues
    const testCards: QueueItem[] = [
      {
        cardID: '20260203222457-normal',
        blockID: 'block-normal',
        deckID: 'test-deck',
        priority: 50,
        nextDues: {
          1: new Date(Date.now() + 86400000).toISOString(),
          2: new Date(Date.now() + 86400000).toISOString(),
          3: new Date(Date.now() + 86400000).toISOString(),
          4: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      {
        cardID: '20260203222457-undefined',
        blockID: 'block-undefined',
        deckID: 'test-deck',
        priority: 50,
        nextDues: undefined as any,
      },
      {
        cardID: '20260203222457-partial',
        blockID: 'block-partial',
        deckID: 'test-deck',
        priority: 50,
        nextDues: {
          1: new Date(Date.now() + 86400000).toISOString(),
        } as any,
      },
    ];

    console.log('测试卡片 nextDues 格式:');
    testCards.forEach(card => {
      console.log(`  ${card.cardID}:`, card.nextDues);
    });

    // 执行添加操作
    console.log('\n--- 开始执行 addItems() ---\n');
    const added = await queue.addItems(testCards);
    console.log('\n--- addItems() 完成 ---\n');

    // 验证结果
    const allItems = queue.getAllItems();
    console.log('最终队列大小:', allItems.length);

    // 验证每张卡片的 cardID 是否保持不变
    for (const testCard of testCards) {
      const foundCard = allItems.find(item => item.cardID === testCard.cardID);
      console.log(`验证卡片 ${testCard.cardID}:`, {
        found: !!foundCard,
        cardIDMatch: foundCard?.cardID === testCard.cardID,
        blockIDMatch: foundCard?.blockID === testCard.blockID,
        nextDues: foundCard?.nextDues,
      });

      if (foundCard) {
        expect(foundCard.cardID).toBe(testCard.cardID);
        expect(foundCard.blockID).toBe(testCard.blockID);
      }
    }

    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST COMPLETED');
    console.log('========================================\n');
  });

  it('DIAGNOSTIC: getAllCards() should return manually added cards even if not due', async () => {
    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST: getAllCards() with Manual Cards');
    console.log('========================================\n');

    // 准备测试数据 - 未到期的手动添加卡片
    const futureDate = new Date(Date.now() + 86400000 * 7); // 7 days in future
    const testCard: QueueItem = {
      cardID: '20260205112305-a4cerin',
      blockID: '20260205112249-xtwlgwa',
      deckID: 'test-deck',
      priority: 50,
      nextDues: {
        1: futureDate.toISOString(),
        2: futureDate.toISOString(),
        3: futureDate.toISOString(),
        4: futureDate.toISOString(),
      },
    };

    console.log('测试卡片数据:', {
      cardID: testCard.cardID,
      blockID: testCard.blockID,
      futureDate: futureDate.toISOString(),
      daysInFuture: 7,
    });

    // 添加卡片（应该设置 manuallyAdded = true）
    console.log('\n--- 开始执行 addItems() ---\n');
    const added = await queue.addItems([testCard]);
    console.log('\n--- addItems() 完成 ---\n');
    console.log('返回的 added 数量:', added);
    expect(added).toBe(1);

    // 使用 getAllItems() 检查（这个方法直接访问 sequencer）
    const allItemsFromSequencer = queue.getAllItems();
    console.log('\n--- getAllItems() (from sequencer) ---');
    console.log('队列大小:', allItemsFromSequencer.length);
    console.log('卡片列表:', allItemsFromSequencer.map(item => ({
      cardID: item.cardID,
      blockID: item.blockID,
      manuallyAdded: (item as any).manuallyAdded,
    })));

    // 使用 getAllCards() 检查（这个方法调用 dataSource.getAll()）
    console.log('\n--- 开始执行 getAllCards() ---\n');
    const allCardsFromDataSource = await queue.getAllCards();
    console.log('\n--- getAllCards() 完成 ---\n');
    console.log('返回的卡片数量:', allCardsFromDataSource.length);
    console.log('卡片列表:', allCardsFromDataSource.map(item => ({
      cardID: item.cardID,
      blockID: item.blockID,
      manuallyAdded: (item as any).manuallyAdded,
    })));

    // 验证：getAllCards() 应该返回手动添加的卡片
    const foundCard = allCardsFromDataSource.find(item => item.cardID === testCard.cardID);
    console.log('\n查找结果:', foundCard ? {
      cardID: foundCard.cardID,
      blockID: foundCard.blockID,
      manuallyAdded: (foundCard as any).manuallyAdded,
      match: foundCard.cardID === testCard.cardID,
    } : 'NOT FOUND');

    // 断言
    expect(foundCard).toBeDefined();
    expect(foundCard?.cardID).toBe(testCard.cardID);
    expect(foundCard?.blockID).toBe(testCard.blockID);
    expect((foundCard as any)?.manuallyAdded).toBe(true);

    // 验证：getAllItems() 和 getAllCards() 应该返回相同数量的卡片
    console.log('\n--- 比较结果 ---');
    console.log('getAllItems() 数量:', allItemsFromSequencer.length);
    console.log('getAllCards() 数量:', allCardsFromDataSource.length);
    console.log('是否一致:', allItemsFromSequencer.length === allCardsFromDataSource.length);

    expect(allCardsFromDataSource.length).toBe(allItemsFromSequencer.length);

    console.log('\n========================================');
    console.log('DIAGNOSTIC TEST COMPLETED');
    console.log('========================================\n');
  });
});
