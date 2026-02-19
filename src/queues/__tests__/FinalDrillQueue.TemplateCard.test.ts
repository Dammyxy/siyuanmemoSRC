/**
 * FinalDrillQueue - 模板卡支持测试
 * 
 * 测试模板卡（一个块对应多张卡片）在刻意练习队列中的行为。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinalDrillQueue } from '../FinalDrillQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { AdvancedDataRouter } from '../../routers/DataAccessFacade';
import { StorageManager } from '../../core/storage/manager';
import { FSRSCard, CardState, CardType } from '../../types/card';

describe('FinalDrillQueue - Template Card Support', () => {
  let manager: UnifiedDataSourceManager;
  let storage: StorageManager;
  let queue: FinalDrillQueue;

  beforeEach(() => {
    // 重置单例
    UnifiedDataSourceManager.resetInstance();
    
    // 创建存储管理器
    storage = new StorageManager('test-plugin');
    
    // 创建管理器
    manager = UnifiedDataSourceManager.getInstance();
    const router = new AdvancedDataRouter(storage);
    manager.setAdvancedRouter(router);
    
    // 创建队列
    queue = new FinalDrillQueue(manager);
  });

  it('应该能够添加模板卡到队列', async () => {
    // 创建模板卡（3张卡片共享同一个 blockId）
    const blockId = '20260215204543-csvp9z3';
    const cards: FSRSCard[] = [
      {
        id: 'xy_123_0',
        blockId,
        due: Date.now(),
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-list-item',
          ruleIndex: 0,
        },
      },
      {
        id: 'xy_123_1',
        blockId,
        due: Date.now(),
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-list-item',
          ruleIndex: 1,
        },
      },
      {
        id: 'xy_123_2',
        blockId,
        due: Date.now(),
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {
          xiuyuanID: 'xy_123',
          templateID: 'builtin-list-item',
          ruleIndex: 2,
        },
      },
    ];

    // 添加卡片到存储
    for (const card of cards) {
      storage.setCard(card);
    }

    // 添加卡片到队列
    for (const card of cards) {
      await queue.addCard(card.id, 'manual');
    }

    // 验证队列中有3张卡片
    const queueCards = await queue.getCards();
    expect(queueCards).toHaveLength(3);
    expect(queueCards.map(c => c.id).sort()).toEqual(['xy_123_0', 'xy_123_1', 'xy_123_2']);
  });

  it('应该能够处理卡片不存在的情况', async () => {
    // 添加一个不存在的卡片ID到队列
    await queue.addCard('non-existent-card', 'manual');

    // 获取卡片时应该自动移除不存在的卡片
    const queueCards = await queue.getCards();
    expect(queueCards).toHaveLength(0);
  });

  it('应该能够处理部分卡片不存在的情况', async () => {
    // 创建一张存在的卡片
    const existingCard: FSRSCard = {
      id: 'existing-card',
      blockId: '20260215204543-abc',
      due: Date.now(),
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    storage.setCard(existingCard);

    // 添加存在和不存在的卡片到队列
    await queue.addCard('existing-card', 'manual');
    await queue.addCard('non-existent-card', 'manual');

    // 获取卡片时应该只返回存在的卡片
    const queueCards = await queue.getCards();
    expect(queueCards).toHaveLength(1);
    expect(queueCards[0].id).toBe('existing-card');
  });
});
