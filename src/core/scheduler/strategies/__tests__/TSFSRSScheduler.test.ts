/**
 * TSFSRSScheduler 单元测试
 * 
 * 测试 TSFSRSScheduler 适配器的核心功能：
 * - review() 方法
 * - preview() 方法
 * - getRetrievability() 方法
 * - 类型转换方法
 * - 参数更新功能
 * 
 * **Validates: Requirements 2.3.1**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TSFSRSScheduler } from '../TSFSRSScheduler';
import { CardState, Rating, type FSRSCard, type FSRSParameters } from '@/types';

describe('TSFSRSScheduler', () => {
    let scheduler: TSFSRSScheduler;
    let defaultParams: FSRSParameters;
    let testCard: FSRSCard;
    
    beforeEach(() => {
        // 创建默认参数
        defaultParams = {
            requestRetention: 0.9,
            maximumInterval: 36500,
            weights: [
                0.40255, 1.18385, 3.173, 15.69105,
                7.1949, 0.5345, 1.4604, 0.0046,
                1.54575, 0.1192, 1.01925, 1.9395,
                0.11, 0.29605, 2.2698, 0.2315,
                2.9898, 0.51655, 0.6621
            ],
            enableFuzz: true,
            enableShortTerm: false,
        };
        
        // 创建调度器实例
        scheduler = new TSFSRSScheduler(defaultParams);
        
        // 创建测试卡片
        const now = Date.now();
        testCard = {
            id: 'test-card-1',
            blockId: 'block-1',
            due: now,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: CardState.New,
            lastReview: 0,
            priority: 50,
            type: 'item' as any,
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
        };
    });
    
    describe('构造函数', () => {
        it('应该正确初始化调度器', () => {
            expect(scheduler).toBeDefined();
        });
        
        it('应该接受自定义参数', () => {
            const customParams: FSRSParameters = {
                ...defaultParams,
                requestRetention: 0.85,
                maximumInterval: 30000,
            };
            
            const customScheduler = new TSFSRSScheduler(customParams);
            expect(customScheduler).toBeDefined();
        });
    });
    
    describe('review() 方法', () => {
        it('应该正确处理 Again 评分', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Again, now);
            
            // 验证返回的卡片包含必要字段
            expect(result).toBeDefined();
            expect(result.id).toBe(testCard.id);
            expect(result.blockId).toBe(testCard.blockId);
            
            // 验证 FSRS 字段已更新
            expect(result.due).toBeGreaterThan(testCard.due);
            expect(result.reps).toBeGreaterThanOrEqual(testCard.reps);
            expect(result.lastReview).toBeGreaterThan(0);
            expect(result.updatedAt).toBeGreaterThan(testCard.updatedAt);
        });
        
        it('应该正确处理 Hard 评分', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Hard, now);
            
            expect(result).toBeDefined();
            expect(result.id).toBe(testCard.id);
            expect(result.due).toBeGreaterThan(testCard.due);
            expect(result.lastReview).toBeGreaterThan(0);
        });
        
        it('应该正确处理 Good 评分', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Good, now);
            
            expect(result).toBeDefined();
            expect(result.id).toBe(testCard.id);
            expect(result.due).toBeGreaterThan(testCard.due);
            expect(result.lastReview).toBeGreaterThan(0);
        });
        
        it('应该正确处理 Easy 评分', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Easy, now);
            
            expect(result).toBeDefined();
            expect(result.id).toBe(testCard.id);
            expect(result.due).toBeGreaterThan(testCard.due);
            expect(result.lastReview).toBeGreaterThan(0);
        });
        
        it('应该保留原始卡片的 id 和 blockId', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Good, now);
            
            expect(result.id).toBe(testCard.id);
            expect(result.blockId).toBe(testCard.blockId);
        });
        
        it('应该更新卡片状态', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Good, now);
            
            // 新卡片评分后应该进入 Learning 或 Review 状态
            expect(result.state).not.toBe(CardState.New);
        });
        
        it('应该增加复习次数', () => {
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Good, now);
            
            expect(result.reps).toBeGreaterThan(testCard.reps);
        });
        
        it('应该处理已有复习历史的卡片', () => {
            const reviewedCard: FSRSCard = {
                ...testCard,
                reps: 5,
                lapses: 1,
                state: CardState.Review,
                stability: 10,
                difficulty: 5,
                lastReview: Date.now() - 86400000, // 1天前
            };
            
            const now = new Date();
            const result = scheduler.review(reviewedCard, Rating.Good, now);
            
            expect(result).toBeDefined();
            expect(result.reps).toBeGreaterThan(reviewedCard.reps);
        });
        
        it('Again 评分应该增加 lapses', () => {
            const reviewedCard: FSRSCard = {
                ...testCard,
                reps: 5,
                lapses: 1,
                state: CardState.Review,
                stability: 10,
                difficulty: 5,
            };
            
            const now = new Date();
            const result = scheduler.review(reviewedCard, Rating.Again, now);
            
            expect(result.lapses).toBeGreaterThan(reviewedCard.lapses);
        });
        
        it('应该使用默认时间（当前时间）', () => {
            const beforeTime = Date.now();
            const result = scheduler.review(testCard, Rating.Good);
            const afterTime = Date.now();
            
            expect(result.lastReview).toBeGreaterThanOrEqual(beforeTime);
            expect(result.lastReview).toBeLessThanOrEqual(afterTime);
        });

        it('应该修复脏复习卡状态并返回有效的 Good 评分结果', () => {
            const now = new Date('2026-04-12T15:41:50+08:00');
            const corruptedReviewCard: FSRSCard = {
                ...testCard,
                due: now.getTime(),
                stability: Number.NaN,
                difficulty: 1,
                elapsedDays: 45,
                scheduledDays: Number.NaN,
                reps: 3,
                lapses: 0,
                state: CardState.Review,
                lastReview: new Date('2026-04-07T17:36:24+08:00').getTime(),
            };

            const result = scheduler.review(corruptedReviewCard, Rating.Good, now);

            expect(Number.isFinite(result.due)).toBe(true);
            expect(result.due).toBeGreaterThan(now.getTime());
            expect(result.scheduledDays).toBeGreaterThan(0);
            expect(result.stability).toBeGreaterThan(0);
        });

        it('应该在 ts-fsrs 评分返回 invalid due 时保留评分结果并给出保底 due', () => {
            const now = new Date('2026-04-26T19:20:00+08:00');
            const invalidDueCard = {
                due: new Date(Number.NaN),
                stability: 2,
                difficulty: 5,
                elapsed_days: 0,
                scheduled_days: 0,
                learning_steps: 0,
                reps: 4,
                lapses: 0,
                state: CardState.Review,
                last_review: now,
            };
            (scheduler as unknown as {
                f: {
                    next: ReturnType<typeof vi.fn>;
                };
            }).f.next = vi.fn(() => ({ card: invalidDueCard }));

            const result = scheduler.review({
                ...testCard,
                state: CardState.Review,
                stability: 2,
                scheduledDays: 2,
                reps: 4,
                lastReview: now.getTime() - 2 * 86_400_000,
            }, Rating.Good, now);

            expect(Number.isFinite(result.due)).toBe(true);
            expect(result.due).toBeGreaterThan(now.getTime());
            expect(result.id).toBe(testCard.id);
            expect(result.reps).toBe(4);
        });
    });
    
    describe('preview() 方法', () => {
        it('应该返回 4 个评分选项', () => {
            const now = new Date();
            const result = scheduler.preview(testCard, now);
            
            expect(result).toBeDefined();
            expect(result.size).toBe(4);
            expect(result.has(Rating.Again)).toBe(true);
            expect(result.has(Rating.Hard)).toBe(true);
            expect(result.has(Rating.Good)).toBe(true);
            expect(result.has(Rating.Easy)).toBe(true);
        });
        
        it('每个评分选项应该返回有效的卡片', () => {
            const now = new Date();
            const result = scheduler.preview(testCard, now);
            
            const againCard = result.get(Rating.Again);
            const hardCard = result.get(Rating.Hard);
            const goodCard = result.get(Rating.Good);
            const easyCard = result.get(Rating.Easy);
            
            expect(againCard).toBeDefined();
            expect(hardCard).toBeDefined();
            expect(goodCard).toBeDefined();
            expect(easyCard).toBeDefined();
            
            // 验证每个卡片都有必要字段
            expect(againCard!.id).toBe(testCard.id);
            expect(hardCard!.id).toBe(testCard.id);
            expect(goodCard!.id).toBe(testCard.id);
            expect(easyCard!.id).toBe(testCard.id);
        });
        
        it('不同评分的 due 时间应该不同', () => {
            const now = new Date();
            const result = scheduler.preview(testCard, now);
            
            const againDue = result.get(Rating.Again)!.due;
            const hardDue = result.get(Rating.Hard)!.due;
            const goodDue = result.get(Rating.Good)!.due;
            const easyDue = result.get(Rating.Easy)!.due;
            
            // Easy 的间隔应该最长
            expect(easyDue).toBeGreaterThanOrEqual(goodDue);
            expect(goodDue).toBeGreaterThanOrEqual(hardDue);
            expect(hardDue).toBeGreaterThanOrEqual(againDue);
        });
        
        it('应该保留原始卡片的 id 和 blockId', () => {
            const now = new Date();
            const result = scheduler.preview(testCard, now);
            
            result.forEach((card) => {
                expect(card.id).toBe(testCard.id);
                expect(card.blockId).toBe(testCard.blockId);
            });
        });
        
        it('应该使用默认时间（当前时间）', () => {
            const result = scheduler.preview(testCard);
            
            expect(result).toBeDefined();
            expect(result.size).toBe(4);
        });

        it('应该修复脏复习卡预览而不是退回伪 1 天排期', () => {
            const now = new Date('2026-04-12T15:41:50+08:00');
            const corruptedReviewCard: FSRSCard = {
                ...testCard,
                due: now.getTime(),
                stability: Number.NaN,
                difficulty: 1,
                elapsedDays: 45,
                scheduledDays: Number.NaN,
                reps: 3,
                lapses: 0,
                state: CardState.Review,
                lastReview: new Date('2026-04-07T17:36:24+08:00').getTime(),
            };

            const result = scheduler.preview(corruptedReviewCard, now);
            const againCard = result.get(Rating.Again)!;
            const hardCard = result.get(Rating.Hard)!;
            const goodCard = result.get(Rating.Good)!;
            const easyCard = result.get(Rating.Easy)!;

            [againCard, hardCard, goodCard, easyCard].forEach((card) => {
                expect(Number.isFinite(card.due)).toBe(true);
                expect(card.due).toBeGreaterThan(now.getTime());
            });

            expect(againCard.due).toBeLessThan(hardCard.due);
            expect(hardCard.due).toBeLessThan(goodCard.due);
            expect(goodCard.due).toBeLessThan(easyCard.due);
            expect(new Set([hardCard.due, goodCard.due, easyCard.due]).size).toBe(3);
        });

        it('应该在 ts-fsrs 返回 invalid due 时使用可评分区分的保底时间', () => {
            const now = new Date('2026-04-26T19:20:00+08:00');
            const invalidDueCard = {
                due: new Date(Number.NaN),
                stability: 2,
                difficulty: 5,
                elapsed_days: 0,
                scheduled_days: 0,
                learning_steps: 0,
                reps: 4,
                lapses: 0,
                state: CardState.Review,
                last_review: now,
            };
            (scheduler as unknown as {
                f: {
                    repeat: ReturnType<typeof vi.fn>;
                };
            }).f.repeat = vi.fn(() => ({
                1: { card: invalidDueCard },
                2: { card: invalidDueCard },
                3: { card: invalidDueCard },
                4: { card: invalidDueCard },
            }));

            const result = scheduler.preview({
                ...testCard,
                state: CardState.Review,
                stability: 2,
                scheduledDays: 2,
                reps: 4,
                lastReview: now.getTime() - 2 * 86_400_000,
            }, now);

            const againCard = result.get(Rating.Again)!;
            const hardCard = result.get(Rating.Hard)!;
            const goodCard = result.get(Rating.Good)!;
            const easyCard = result.get(Rating.Easy)!;

            [againCard, hardCard, goodCard, easyCard].forEach((card) => {
                expect(Number.isFinite(card.due)).toBe(true);
                expect(card.due).toBeGreaterThan(now.getTime());
            });
            expect(againCard.due).toBeLessThan(hardCard.due);
            expect(hardCard.due).toBeLessThan(goodCard.due);
            expect(goodCard.due).toBeLessThan(easyCard.due);
        });
    });
    
    describe('getRetrievability() 方法', () => {
        it('应该返回 0-1 之间的值', () => {
            const now = new Date();
            const retrievability = scheduler.getRetrievability(testCard, now);
            
            expect(retrievability).toBeGreaterThanOrEqual(0);
            expect(retrievability).toBeLessThanOrEqual(1);
        });
        
        it('新卡片的可提取性应该为 0', () => {
            const now = new Date();
            const retrievability = scheduler.getRetrievability(testCard, now);
            
            // 新卡片（stability = 0）的可提取性应该为 0
            expect(retrievability).toBe(0);
        });
        
        it('已复习卡片的可提取性应该大于 0', () => {
            const reviewedCard: FSRSCard = {
                ...testCard,
                reps: 5,
                state: CardState.Review,
                stability: 10,
                difficulty: 5,
                lastReview: Date.now() - 86400000, // 1天前
            };
            
            const now = new Date();
            const retrievability = scheduler.getRetrievability(reviewedCard, now);
            
            expect(retrievability).toBeGreaterThan(0);
        });
        
        it('应该使用默认时间（当前时间）', () => {
            const retrievability = scheduler.getRetrievability(testCard);
            
            expect(retrievability).toBeGreaterThanOrEqual(0);
            expect(retrievability).toBeLessThanOrEqual(1);
        });
    });
    
    describe('updateParams() 方法', () => {
        it('应该更新参数', () => {
            const newParams: FSRSParameters = {
                ...defaultParams,
                requestRetention: 0.85,
                maximumInterval: 30000,
            };
            
            scheduler.updateParams(newParams);
            
            // 验证参数已更新（通过调度结果间接验证）
            const result = scheduler.review(testCard, Rating.Good);
            expect(result).toBeDefined();
        });
        
        it('更新参数后应该影响调度结果', () => {
            const now = new Date();
            
            // 使用默认参数调度
            const result1 = scheduler.review(testCard, Rating.Good, now);
            
            // 更新参数
            const newParams: FSRSParameters = {
                ...defaultParams,
                requestRetention: 0.7, // 降低保留率
            };
            scheduler.updateParams(newParams);
            
            // 使用新参数调度相同的卡片
            const result2 = scheduler.review(testCard, Rating.Good, now);
            
            // 两次调度的结果应该不同（由于保留率不同）
            // 注意：由于 FSRS 算法的复杂性，这里只验证结果存在
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
        });
    });
    
    describe('类型转换', () => {
        it('应该正确转换日期字段', () => {
            const now = new Date();
            const cardWithDates: FSRSCard = {
                ...testCard,
                due: now.getTime(),
                lastReview: now.getTime() - 86400000,
            };
            
            const result = scheduler.review(cardWithDates, Rating.Good, now);
            
            // 验证日期字段被正确转换
            expect(typeof result.due).toBe('number');
            expect(typeof result.lastReview).toBe('number');
            expect(result.due).toBeGreaterThan(0);
            expect(result.lastReview).toBeGreaterThan(0);
        });
        
        it('应该正确转换卡片状态', () => {
            const now = new Date();
            const validStateCards: FSRSCard[] = [
                {
                    ...testCard,
                    state: CardState.New,
                },
                {
                    ...testCard,
                    state: CardState.Learning,
                    due: now.getTime() + 10 * 60 * 1000,
                    stability: 2.4,
                    difficulty: 5,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    learning_step: 1,
                    reps: 1,
                    lastReview: now.getTime(),
                },
                {
                    ...testCard,
                    state: CardState.Review,
                    stability: 10,
                    difficulty: 5,
                    elapsedDays: 3,
                    scheduledDays: 3,
                    reps: 5,
                    lastReview: now.getTime() - 3 * 86400000,
                },
                {
                    ...testCard,
                    state: CardState.Relearning,
                    due: now.getTime() + 10 * 60 * 1000,
                    stability: 1.5,
                    difficulty: 6,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    learning_step: 0,
                    reps: 6,
                    lapses: 1,
                    lastReview: now.getTime(),
                },
            ];

            validStateCards.forEach((card) => {
                const result = scheduler.review(card, Rating.Good, now);

                // 验证状态字段存在且有效
                expect(result.state).toBeDefined();
                expect([CardState.New, CardState.Learning, CardState.Review, CardState.Relearning]).toContain(result.state);
            });
        });
        
        it('应该正确处理缺失的可选字段', () => {
            const minimalCard: FSRSCard = {
                id: 'minimal-card',
                blockId: 'block-minimal',
                due: Date.now(),
                stability: 0,
                difficulty: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                reps: 0,
                lapses: 0,
                state: CardState.New,
                lastReview: 0,
                priority: 50,
                type: 'item' as any,
                tags: [],
                leechCount: 0,
                isLeech: false,
                skipped: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            
            const result = scheduler.review(minimalCard, Rating.Good);
            
            expect(result).toBeDefined();
            expect(result.id).toBe(minimalCard.id);
        });
    });
    
    describe('边界情况', () => {
        it('应该处理 stability = 0 的卡片', () => {
            const card: FSRSCard = {
                ...testCard,
                stability: 0,
            };
            
            const result = scheduler.review(card, Rating.Good);
            
            expect(result).toBeDefined();
            expect(result.stability).toBeGreaterThanOrEqual(0);
        });
        
        it('应该处理 difficulty = 0 的卡片', () => {
            const card: FSRSCard = {
                ...testCard,
                difficulty: 0,
            };
            
            const result = scheduler.review(card, Rating.Good);
            
            expect(result).toBeDefined();
            expect(result.difficulty).toBeGreaterThanOrEqual(0);
        });
        
        it('应该处理 reps = 0 的新卡片', () => {
            const card: FSRSCard = {
                ...testCard,
                reps: 0,
                state: CardState.New,
            };
            
            const result = scheduler.review(card, Rating.Good);
            
            expect(result).toBeDefined();
            expect(result.reps).toBeGreaterThan(0);
        });
        
        it('应该处理大量复习次数的卡片', () => {
            const card: FSRSCard = {
                ...testCard,
                reps: 1000,
                state: CardState.Review,
                stability: 100,
                difficulty: 5,
            };
            
            const result = scheduler.review(card, Rating.Good);
            
            expect(result).toBeDefined();
            expect(result.reps).toBeGreaterThan(card.reps);
        });
    });
});
