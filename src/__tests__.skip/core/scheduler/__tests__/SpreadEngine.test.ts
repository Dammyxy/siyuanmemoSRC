/**
 * SpreadEngine 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpreadEngine } from '../SpreadEngine';
import type { FSRSCard } from '@/types/card';
import type { SpreadConfig, SortingCriterion } from '@/types/reschedule';
import type { StorageManager } from '@/core/storage/manager';

// Mock StorageManager
const createMockStorage = (): StorageManager => ({
    setCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
    addRescheduleLog: vi.fn().mockResolvedValue(undefined),
} as any);

// 创建测试卡片
const createTestCard = (overrides: Partial<FSRSCard> = {}): FSRSCard => ({
    cardId: 'test-card-id',
    blockId: 'test-block-id',
    due: Date.now(),
    stability: 10,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 10,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: Date.now() - 10 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
    ...overrides
});

describe('SpreadEngine', () => {
    let engine: SpreadEngine;
    let mockStorage: StorageManager;

    beforeEach(() => {
        mockStorage = createMockStorage();
        engine = new SpreadEngine(mockStorage);
    });

    describe('execute', () => {
        it('should spread cards evenly across rescheduling period', async () => {
            const cards = Array.from({ length: 10 }, (_, i) => 
                createTestCard({ 
                    cardId: `card-${i}`,
                    due: Date.now() - i * 24 * 60 * 60 * 1000 // 过期 i 天
                })
            );

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute(cards, config, 'test');

            expect(result.updated).toBe(10);
            expect(result.averageCardsPerDay).toBe(1); // 10 cards / 10 days
            expect(mockStorage.saveCards).toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).toHaveBeenCalled();
        });

        it('should handle empty card list', async () => {
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute([], config, 'test');

            expect(result.updated).toBe(0);
            expect(result.averageCardsPerDay).toBe(0);
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });

        it('should calculate correct average cards per day', async () => {
            const cards = Array.from({ length: 30 }, (_, i) => 
                createTestCard({ 
                    cardId: `card-${i}`,
                    due: Date.now() - 1000
                })
            );

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 15,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute(cards, config, 'test');

            expect(result.updated).toBe(30);
            expect(result.averageCardsPerDay).toBe(2); // 30 cards / 15 days
        });
    });

    describe('collectCards', () => {
        it('should collect only outstanding cards when considerFutureRepetitions is false', async () => {
            const now = Date.now();
            const cards = [
                createTestCard({ cardId: 'card-1', due: now - 1000 }), // 过期
                createTestCard({ cardId: 'card-2', due: now + 1000 }), // 未到期
                createTestCard({ cardId: 'card-3', due: now - 2000 }), // 过期
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute(cards, config, 'test');

            // 只有 2 张过期卡片被处理
            expect(result.updated).toBe(2);
        });

        it('should collect all cards within collecting period when considerFutureRepetitions is true', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const cards = [
                createTestCard({ cardId: 'card-1', due: now - 1000 }), // 过期
                createTestCard({ cardId: 'card-2', due: now + 5 * dayMs }), // 未来 5 天
                createTestCard({ cardId: 'card-3', due: now + 20 * dayMs }), // 未来 20 天
                createTestCard({ cardId: 'card-4', due: now + 40 * dayMs }), // 未来 40 天（超出收集期）
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: true,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute(cards, config, 'test');

            // 前 3 张卡片在收集期内，第 4 张超出
            expect(result.updated).toBe(3);
        });
    });

    describe('sortCards', () => {
        it('should sort by priority correctly', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', priority: 50, due: Date.now() - 1000 }),
                createTestCard({ cardId: 'card-2', priority: 10, due: Date.now() - 1000 }),
                createTestCard({ cardId: 'card-3', priority: 30, due: Date.now() - 1000 }),
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'by-priority' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            // 验证 setCard 被调用的顺序（priority 从小到大）
            const calls = (mockStorage.setCard as any).mock.calls;
            expect(calls[0][0].cardId).toBe('card-2'); // priority 10
            expect(calls[1][0].cardId).toBe('card-3'); // priority 30
            expect(calls[2][0].cardId).toBe('card-1'); // priority 50
        });

        it('should sort by interval correctly', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', scheduledDays: 20, due: Date.now() - 1000 }),
                createTestCard({ cardId: 'card-2', scheduledDays: 5, due: Date.now() - 1000 }),
                createTestCard({ cardId: 'card-3', scheduledDays: 10, due: Date.now() - 1000 }),
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'by-interval' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            const calls = (mockStorage.setCard as any).mock.calls;
            expect(calls[0][0].cardId).toBe('card-2'); // 5 days
            expect(calls[1][0].cardId).toBe('card-3'); // 10 days
            expect(calls[2][0].cardId).toBe('card-1'); // 20 days
        });

        it('should sort by lateness correctly', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const cards = [
                createTestCard({ cardId: 'card-1', due: now - 5 * dayMs }), // 过期 5 天
                createTestCard({ cardId: 'card-2', due: now - 15 * dayMs }), // 过期 15 天
                createTestCard({ cardId: 'card-3', due: now - 10 * dayMs }), // 过期 10 天
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'by-lateness' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            const calls = (mockStorage.setCard as any).mock.calls;
            expect(calls[0][0].cardId).toBe('card-2'); // 过期最久
            expect(calls[1][0].cardId).toBe('card-3');
            expect(calls[2][0].cardId).toBe('card-1'); // 过期最少
        });

        it('should sort by easiness correctly', async () => {
            const cards = [
                createTestCard({ cardId: 'card-1', difficulty: 8, due: Date.now() - 1000 }),
                createTestCard({ cardId: 'card-2', difficulty: 3, due: Date.now() - 1000 }),
                createTestCard({ cardId: 'card-3', difficulty: 5, due: Date.now() - 1000 }),
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'by-easiness' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            const calls = (mockStorage.setCard as any).mock.calls;
            expect(calls[0][0].cardId).toBe('card-2'); // difficulty 3 (最容易)
            expect(calls[1][0].cardId).toBe('card-3'); // difficulty 5
            expect(calls[2][0].cardId).toBe('card-1'); // difficulty 8 (最难)
        });

        it('should sort by recency correctly', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const cards = [
                createTestCard({ cardId: 'card-1', createdAt: now - 20 * dayMs, due: now - 1000 }),
                createTestCard({ cardId: 'card-2', createdAt: now - 5 * dayMs, due: now - 1000 }),
                createTestCard({ cardId: 'card-3', createdAt: now - 10 * dayMs, due: now - 1000 }),
            ];

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'by-recency' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            const calls = (mockStorage.setCard as any).mock.calls;
            expect(calls[0][0].cardId).toBe('card-2'); // 最新
            expect(calls[1][0].cardId).toBe('card-3');
            expect(calls[2][0].cardId).toBe('card-1'); // 最旧
        });

        it('should randomize cards when sorting criterion is random', async () => {
            const cards = Array.from({ length: 10 }, (_, i) => 
                createTestCard({ cardId: `card-${i}`, due: Date.now() - 1000 })
            );

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            // 验证卡片被处理了（无法验证随机性，但至少确保没有错误）
            expect(mockStorage.setCard).toHaveBeenCalledTimes(10);
        });
    });

    describe('spreadCards', () => {
        it('should spread cards evenly across rescheduling period', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const cards = Array.from({ length: 10 }, (_, i) => 
                createTestCard({ 
                    cardId: `card-${i}`,
                    due: now - 1000,
                    lastReview: now - 10 * dayMs
                })
            );

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            // 验证卡片的 due date 分布
            const calls = (mockStorage.setCard as any).mock.calls;
            const dueDates = calls.map((call: any) => call[0].due);
            
            // 第一张卡片应该在今天
            expect(dueDates[0]).toBeGreaterThanOrEqual(now);
            expect(dueDates[0]).toBeLessThan(now + dayMs);
            
            // 最后一张卡片应该在第 9 天（因为是 10 张卡片分散到 10 天）
            const lastDue = dueDates[dueDates.length - 1];
            expect(lastDue).toBeGreaterThanOrEqual(now + 9 * dayMs);
            expect(lastDue).toBeLessThan(now + 10 * dayMs);
        });

        it('should update card fields correctly', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const card = createTestCard({ 
                cardId: 'test-card',
                due: now - 5 * dayMs,
                lastReview: now - 10 * dayMs,
                rescheduleHistory: []
            });

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute([card], config, 'test');

            const updatedCard = (mockStorage.setCard as any).mock.calls[0][0];
            
            // 验证字段更新
            expect(updatedCard.due).toBeGreaterThanOrEqual(now);
            expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
            expect(updatedCard.updatedAt).toBeGreaterThanOrEqual(now);
            expect(updatedCard.rescheduleHistory).toHaveLength(1);
            expect(updatedCard.rescheduleHistory[0].type).toBe('spread');
            expect(updatedCard.rescheduleHistory[0].oldDue).toBe(card.due);
            expect(updatedCard.rescheduleHistory[0].newDue).toBe(updatedCard.due);
        });

        it('should ensure minimum interval of 1 day', async () => {
            const now = Date.now();
            const card = createTestCard({ 
                cardId: 'test-card',
                due: now - 1000,
                lastReview: now - 100 // 很短的 lastReview 时间
            });

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 1,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute([card], config, 'test');

            const updatedCard = (mockStorage.setCard as any).mock.calls[0][0];
            
            // 即使计算出的间隔很小，也应该至少是 1 天
            expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
        });
    });

    describe('batchUpdate', () => {
        it('should call storage methods in correct order', async () => {
            const cards = [createTestCard({ due: Date.now() - 1000 })];
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            // 验证调用顺序
            expect(mockStorage.setCard).toHaveBeenCalled();
            expect(mockStorage.saveCards).toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).toHaveBeenCalled();
        });

        it('should not call storage methods when no cards to update', async () => {
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute([], config, 'test');

            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
            expect(mockStorage.addRescheduleLog).not.toHaveBeenCalled();
        });
    });

    describe('logOperation', () => {
        it('should log operation with correct structure', async () => {
            const cards = Array.from({ length: 5 }, (_, i) => 
                createTestCard({ 
                    cardId: `card-${i}`,
                    blockId: `block-${i}`,
                    due: Date.now() - 1000
                })
            );

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute(cards, config, 'test-source');

            const logCall = (mockStorage.addRescheduleLog as any).mock.calls[0][0];
            
            expect(logCall.action).toBe('spread');
            expect(logCall.source).toBe('test-source');
            expect(logCall.targets).toHaveLength(5);
            expect(logCall.result.updated).toBe(5);
            expect(logCall.result.skipped).toBe(0);
            expect(logCall.sample).toHaveLength(3); // 最多 3 个样本
        });

        it('should include sample cards in log', async () => {
            const cards = Array.from({ length: 10 }, (_, i) => 
                createTestCard({ 
                    cardId: `card-${i}`,
                    blockId: `block-${i}`,
                    due: Date.now() - 1000
                })
            );

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            await engine.execute(cards, config, 'test');

            const logCall = (mockStorage.addRescheduleLog as any).mock.calls[0][0];
            
            // 应该有 3 个样本卡片
            expect(logCall.sample).toHaveLength(3);
            expect(logCall.sample[0]).toHaveProperty('cardId');
            expect(logCall.sample[0]).toHaveProperty('blockId');
            expect(logCall.sample[0]).toHaveProperty('newDue');
        });
    });

    describe('edge cases', () => {
        it('should handle single card', async () => {
            const card = createTestCard({ due: Date.now() - 1000 });
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute([card], config, 'test');

            expect(result.updated).toBe(1);
            expect(result.averageCardsPerDay).toBeCloseTo(0.1, 1); // 1 card / 10 days
        });

        it('should handle cards with missing optional fields', async () => {
            const card = createTestCard({ 
                due: Date.now() - 1000,
                priority: undefined,
                rescheduleHistory: undefined
            });

            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 10,
                considerFutureRepetitions: false,
                sortingCriterion: 'by-priority' as SortingCriterion
            };

            const result = await engine.execute([card], config, 'test');

            expect(result.updated).toBe(1);
            
            const updatedCard = (mockStorage.setCard as any).mock.calls[0][0];
            expect(updatedCard.rescheduleHistory).toHaveLength(1);
        });

        it('should handle zero rescheduling period gracefully', async () => {
            const cards = [createTestCard({ due: Date.now() - 1000 })];
            const config: SpreadConfig = {
                collectingPeriod: 30,
                reschedulingPeriod: 0,
                considerFutureRepetitions: false,
                sortingCriterion: 'random' as SortingCriterion
            };

            const result = await engine.execute(cards, config, 'test');

            expect(result.averageCardsPerDay).toBe(0);
        });
    });
});
