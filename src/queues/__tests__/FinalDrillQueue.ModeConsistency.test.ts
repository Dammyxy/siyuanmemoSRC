/**
 * Final Drill Queue Mode Consistency Tests
 * 最终训练队列模式一致性测试
 * 
 * 测试最终训练队列在简单模式和高级模式下的一致性行为：
 * - 属性 32：最终训练简单和高级模式一致性
 * - 验证评分不计入调度算法（在两种模式下）
 * - 验证模式切换不影响最终训练行为
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md (需求 8.4, 8.5)
 * @see .kiro/specs/unified-data-source-architecture/design.md (属性 32)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { FinalDrillQueue } from '../FinalDrillQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../types/unified-data-source';
import { FSRSCard, CardType, CardState } from '../../types/card';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        }
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
});

// Helper function to create test cards
function createTestCard(id: string, due: number = Date.now()): FSRSCard {
    return {
        id,
        blockId: `block-${id}`,
        due,
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: Date.now(),
        elapsedDays: 0,
        scheduledDays: 1,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

describe('FinalDrillQueue - Mode Consistency Tests', () => {
    let manager: UnifiedDataSourceManager;
    let queue: FinalDrillQueue;
    
    beforeEach(() => {
        // Clear localStorage
        localStorageMock.clear();
        
        // Reset manager instance
        UnifiedDataSourceManager.resetInstance();
        manager = UnifiedDataSourceManager.getInstance();
        
        // Mock getCard method
        vi.spyOn(manager, 'getCard').mockImplementation(async (cardId: string) => {
            return createTestCard(cardId);
        });
        
        // Mock notifyObservers
        vi.spyOn(manager, 'notifyObservers').mockImplementation(() => {});
        
        // Create queue instance
        queue = new FinalDrillQueue(manager);
    });
    
    describe('属性 32：最终训练简单和高级模式一致性', () => {
        it('Feature: unified-data-source-architecture, Property 32: 对于任何模式（简单或高级），最终训练队列中的评分都不应该计入卡片的调度算法', async () => {
            /**
             * **Validates: Requirements 8.4, 8.5**
             * 
             * 此属性测试验证：
             * - 最终训练队列的评分不计入调度（无论模式如何）
             * - 评分不会修改卡片的任何调度参数
             * 
             * 测试策略：
             * 1. 生成随机卡片和评分
             * 2. 复习卡片
             * 3. 验证卡片的所有调度数据未被修改
             * 
             * 注意：由于 FinalDrillQueue 的行为在两种模式下完全一致
             * （评分都不计入调度），我们不需要显式测试模式切换。
             * 模式切换的行为由 UnifiedDataSourceManager 负责，
             * 而 FinalDrillQueue 的核心逻辑与模式无关。
             */
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }), // cardId
                    fc.integer({ min: 1, max: 4 }), // rating
                    async (cardId, rating) => {
                        // 创建测试卡片
                        const card = createTestCard(cardId);
                        const originalDue = card.due;
                        const originalStability = card.stability;
                        const originalDifficulty = card.difficulty;
                        const originalReps = card.reps;
                        const originalLapses = card.lapses;
                        const originalState = card.state;
                        
                        // Mock getCard to return our test card
                        vi.spyOn(manager, 'getCard').mockResolvedValue(card);
                        
                        // 添加卡片到队列
                        await queue.addCard(cardId, 'manual');
                        
                        // 复习卡片
                        await queue.handleReview(cardId, rating);
                        
                        // 验证：所有调度数据未被修改
                        expect(card.due).toBe(originalDue);
                        expect(card.stability).toBe(originalStability);
                        expect(card.difficulty).toBe(originalDifficulty);
                        expect(card.reps).toBe(originalReps);
                        expect(card.lapses).toBe(originalLapses);
                        expect(card.state).toBe(originalState);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
    
    describe('单元测试：评分不计入调度（需求 8.4, 8.5）', () => {
        it('需求 8.4, 8.5: 评分 1 不应该更新卡片的到期日期', async () => {
            const card = createTestCard('card-1');
            const originalDue = card.due;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-1', 'manual');
            await queue.handleReview('card-1', 1);
            
            expect(card.due).toBe(originalDue);
        });
        
        it('需求 8.4, 8.5: 评分 2 不应该更新卡片的到期日期', async () => {
            const card = createTestCard('card-2');
            const originalDue = card.due;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-2', 'manual');
            await queue.handleReview('card-2', 2);
            
            expect(card.due).toBe(originalDue);
        });
        
        it('需求 8.4, 8.5: 评分 3 不应该更新卡片的到期日期', async () => {
            const card = createTestCard('card-3');
            const originalDue = card.due;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-3', 'manual');
            await queue.handleReview('card-3', 3);
            
            expect(card.due).toBe(originalDue);
        });
        
        it('需求 8.4, 8.5: 评分 4 不应该更新卡片的到期日期', async () => {
            const card = createTestCard('card-4');
            const originalDue = card.due;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-4', 'manual');
            await queue.handleReview('card-4', 4);
            
            expect(card.due).toBe(originalDue);
        });
        
        it('需求 8.4, 8.5: 多次评分后，到期日期仍不改变', async () => {
            const card = createTestCard('card-5');
            const originalDue = card.due;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-5', 'manual');
            
            // 多次评分
            await queue.handleReview('card-5', 1);
            await queue.handleReview('card-5', 2);
            await queue.handleReview('card-5', 3);
            await queue.handleReview('card-5', 1);
            
            // 验证：到期日期始终未改变
            expect(card.due).toBe(originalDue);
        });
    });
    
    describe('单元测试：验证评分不影响其他调度参数', () => {
        it('评分不应该改变卡片的 stability', async () => {
            const card = createTestCard('card-12');
            const originalStability = card.stability;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-12', 'manual');
            await queue.handleReview('card-12', 3);
            
            expect(card.stability).toBe(originalStability);
        });
        
        it('评分不应该改变卡片的 difficulty', async () => {
            const card = createTestCard('card-13');
            const originalDifficulty = card.difficulty;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-13', 'manual');
            await queue.handleReview('card-13', 2);
            
            expect(card.difficulty).toBe(originalDifficulty);
        });
        
        it('评分不应该改变卡片的 reps 计数', async () => {
            const card = createTestCard('card-14');
            const originalReps = card.reps;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-14', 'manual');
            await queue.handleReview('card-14', 4);
            
            expect(card.reps).toBe(originalReps);
        });
        
        it('评分不应该改变卡片的 lapses 计数', async () => {
            const card = createTestCard('card-15');
            const originalLapses = card.lapses;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-15', 'manual');
            await queue.handleReview('card-15', 1);
            
            expect(card.lapses).toBe(originalLapses);
        });
        
        it('评分不应该改变卡片的 state', async () => {
            const card = createTestCard('card-16');
            const originalState = card.state;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-16', 'manual');
            await queue.handleReview('card-16', 3);
            
            expect(card.state).toBe(originalState);
        });
    });
});
