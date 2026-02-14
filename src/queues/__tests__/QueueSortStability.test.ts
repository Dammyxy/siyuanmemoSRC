/**
 * 队列排序稳定性测试
 * 
 * 验证队列的排序逻辑在多次调用时返回一致的结果
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import { FilterGroupQueue } from '../FilterGroupQueue';
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { FSRSCard, CardType, CardState } from '@/types/card';

describe('队列排序稳定性测试', () => {
    let manager: UnifiedDataSourceManager;
    
    beforeEach(() => {
        // 重置单例
        (UnifiedDataSourceManager as any).instance = null;
        
        // 创建 mock 管理器
        manager = UnifiedDataSourceManager.getInstance();
        
        // Mock getCards 方法
        vi.spyOn(manager, 'getCards').mockImplementation(async (filter) => {
            // 返回一组具有相同 due 和 priority 的卡片
            const now = Date.now();
            const cards: FSRSCard[] = [
                {
                    id: '20250424235115-git177y',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,
                },
                {
                    id: '20230606070000-fapuv4b',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,
                },
                {
                    id: '20240514013449-9kvrfn3',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,
                },
            ];
            
            // 根据过滤条件返回卡片
            if (filter?.cardType === 'item') {
                return cards.filter(c => c.type === CardType.Item);
            }
            return cards;
        });
    });
    
    describe('RetrievalPracticeQueue 排序稳定性', () => {
        it('应该在多次调用 getCards() 时返回相同的顺序', async () => {
            const queue = new RetrievalPracticeQueue(manager);
            
            // 多次调用 getCards()
            const result1 = await queue.getCards();
            const result2 = await queue.getCards();
            const result3 = await queue.getCards();
            
            // 提取卡片 ID
            const ids1 = result1.map(c => c.id);
            const ids2 = result2.map(c => c.id);
            const ids3 = result3.map(c => c.id);
            
            // 验证顺序一致
            expect(ids1).toEqual(ids2);
            expect(ids2).toEqual(ids3);
            
            // 验证是按 ID 字母顺序排序的（因为 due 和 priority 都相同）
            const sortedIds = [...ids1].sort();
            expect(ids1).toEqual(sortedIds);
        });
        
        it('应该在 due 和 priority 相同时按 ID 排序', async () => {
            const queue = new RetrievalPracticeQueue(manager);
            
            const result = await queue.getCards();
            const ids = result.map(c => c.id);
            
            // 验证顺序：按 ID 字母顺序
            expect(ids).toEqual([
                '20230606070000-fapuv4b',  // 最早的 ID
                '20240514013449-9kvrfn3',
                '20250424235115-git177y',  // 最晚的 ID
            ]);
        });
    });
    
    describe('IncrementalLearningQueue 排序稳定性', () => {
        it('应该在多次调用 getCards() 时返回相同的顺序', async () => {
            const queue = new IncrementalLearningQueue(manager);
            
            // 多次调用 getCards()
            const result1 = await queue.getCards();
            const result2 = await queue.getCards();
            const result3 = await queue.getCards();
            
            // 提取卡片 ID
            const ids1 = result1.map(c => c.id);
            const ids2 = result2.map(c => c.id);
            const ids3 = result3.map(c => c.id);
            
            // 验证顺序一致
            expect(ids1).toEqual(ids2);
            expect(ids2).toEqual(ids3);
        });
    });
    
    describe('FilterGroupQueue 排序稳定性', () => {
        it('应该在多次调用 getCards() 时返回相同的顺序', async () => {
            const queue = new FilterGroupQueue(manager, {});
            
            // 多次调用 getCards()
            const result1 = await queue.getCards();
            const result2 = await queue.getCards();
            const result3 = await queue.getCards();
            
            // 提取卡片 ID
            const ids1 = result1.map(c => c.id);
            const ids2 = result2.map(c => c.id);
            const ids3 = result3.map(c => c.id);
            
            // 验证顺序一致
            expect(ids1).toEqual(ids2);
            expect(ids2).toEqual(ids3);
        });
    });
    
    describe('不同 priority 的排序', () => {
        it('应该优先按 priority 排序，然后按 ID 排序', async () => {
            const now = Date.now();
            
            // Mock 返回不同 priority 的卡片
            vi.spyOn(manager, 'getCards').mockResolvedValue([
                {
                    id: 'card-c',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 30,  // 高优先级
                },
                {
                    id: 'card-a',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,  // 低优先级
                },
                {
                    id: 'card-b',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,  // 低优先级
                },
            ]);
            
            const queue = new RetrievalPracticeQueue(manager);
            const result = await queue.getCards();
            const ids = result.map(c => c.id);
            
            // 验证顺序：
            // 1. card-c (priority=30) 排在最前
            // 2. card-a 和 card-b (priority=50) 按 ID 排序
            expect(ids).toEqual([
                'card-c',  // priority=30
                'card-a',  // priority=50, ID 较小
                'card-b',  // priority=50, ID 较大
            ]);
        });
    });
    
    describe('不同 due 的排序', () => {
        it('应该优先按 due 排序，然后按 priority，最后按 ID', async () => {
            const now = Date.now();
            const yesterday = now - 24 * 60 * 60 * 1000;
            const tomorrow = now + 24 * 60 * 60 * 1000;
            
            // Mock 返回不同 due 的卡片
            vi.spyOn(manager, 'getCards').mockResolvedValue([
                {
                    id: 'card-future',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: tomorrow,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 10,  // 高优先级，但 due 最晚
                },
                {
                    id: 'card-today-b',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,
                },
                {
                    id: 'card-today-a',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: now,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 50,
                },
                {
                    id: 'card-past',
                    type: CardType.Item,
                    state: CardState.Review,
                    due: yesterday,
                    stability: 1,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 1,
                    reps: 1,
                    lapses: 0,
                    lastReview: now,
                    priority: 100,  // 低优先级，但 due 最早
                },
            ]);
            
            const queue = new RetrievalPracticeQueue(manager);
            const result = await queue.getCards();
            const ids = result.map(c => c.id);
            
            // 验证顺序：
            // 1. card-past (due=yesterday) 排在最前
            // 2. card-today-a 和 card-today-b (due=now) 按 ID 排序
            // 3. card-future (due=tomorrow) 排在最后
            expect(ids).toEqual([
                'card-past',      // due=yesterday
                'card-today-a',   // due=now, ID 较小
                'card-today-b',   // due=now, ID 较大
                'card-future',    // due=tomorrow
            ]);
        });
    });
});
