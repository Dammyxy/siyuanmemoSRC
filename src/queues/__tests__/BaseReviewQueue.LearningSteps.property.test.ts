/**
 * BaseReviewQueue Learning Steps Property-Based Tests
 * BaseReviewQueue学习步骤基于属性的测试
 * 
 * Feature: learning-steps-rating-fix
 * Task: 4.3 - 编写Property-Based测试
 * 
 * 使用fast-check进行基于属性的测试，验证learning steps机制的核心属性：
 * - 属性1：interval(Again) < interval(Hard)
 * - 属性2：Again间隔 >= 1分钟（不再是0）
 * - 属性3：Hard间隔 > Again间隔
 * 
 * **Validates: Requirements 4.2, 4.3**
 * 
 * @see .kiro/specs/learning-steps-rating-fix/requirements.md
 * @see .kiro/specs/learning-steps-rating-fix/design.md
 * @see .kiro/specs/learning-steps-rating-fix/tasks.md - Task 4.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { BaseReviewQueue } from '../BaseReviewQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../types/unified-data-source';
import { FSRSCard, CardState, CardType } from '../../types/card';

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

/**
 * 测试用的具体队列实现
 * 因为BaseReviewQueue是抽象类，需要创建一个具体实现用于测试
 */
class TestReviewQueue extends BaseReviewQueue {
    public name = 'TestQueue';
    
    async getCards(): Promise<FSRSCard[]> {
        return [];
    }
    
    async addCard(card: FSRSCard | string): Promise<void> {
        // 测试实现
    }
    
    async removeCard(cardId: string): Promise<void> {
        // 测试实现
    }
    
    async handleReview(cardId: string, rating: number): Promise<void> {
        // 测试实现
    }
    
    isDynamic(): boolean {
        return true;
    }
    
    // 暴露protected方法用于测试
    public testCalculateAgainInterval(card: FSRSCard): number {
        return this.calculateAgainInterval(card);
    }
    
    public testCalculateHardInterval(card: FSRSCard): number {
        return this.calculateHardInterval(card);
    }
}

// ============================================================================
// Arbitraries (Generators for random test data)
// ============================================================================

/**
 * 生成随机的CardState
 */
const arbitraryCardState = (): fc.Arbitrary<CardState> => {
    return fc.constantFrom(
        CardState.New,
        CardState.Learning,
        CardState.Review,
        CardState.Relearning
    );
};

/**
 * 生成随机的CardType
 */
const arbitraryCardType = (): fc.Arbitrary<CardType> => {
    return fc.constantFrom(
        CardType.Item,
        CardType.Topic
    );
};

/**
 * 生成随机的FSRSCard
 * 用于property-based testing
 */
const arbitraryFSRSCard = (): fc.Arbitrary<FSRSCard> => {
    const minDate = new Date('2020-01-01').getTime();
    const maxDate = new Date('2030-12-31').getTime();
    
    return fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        blockId: fc.string({ minLength: 1, maxLength: 20 }),
        state: arbitraryCardState(),
        learning_step: fc.option(fc.nat({ max: 10 }), { nil: undefined }),
        due: fc.integer({ min: minDate, max: maxDate }),
        stability: fc.float({ min: 0, max: 100 }),
        difficulty: fc.float({ min: 0, max: 10 }),
        elapsedDays: fc.nat({ max: 365 }),
        scheduledDays: fc.nat({ max: 365 }),
        reps: fc.nat({ max: 100 }),
        lapses: fc.nat({ max: 50 }),
        lastReview: fc.integer({ min: 0, max: maxDate }),
        priority: fc.nat({ max: 100 }),
        type: arbitraryCardType(),
        tags: fc.array(fc.string(), { maxLength: 5 }),
        leechCount: fc.option(fc.nat({ max: 10 }), { nil: undefined }),
        isLeech: fc.option(fc.boolean(), { nil: undefined }),
        skipped: fc.option(fc.boolean(), { nil: undefined }),
        createdAt: fc.integer({ min: minDate, max: maxDate }),
        updatedAt: fc.integer({ min: minDate, max: maxDate }),
        source: fc.constant('siyuan' as any),
    }) as fc.Arbitrary<FSRSCard>;
};

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('BaseReviewQueue - Learning Steps Property-Based Tests', () => {
    let manager: UnifiedDataSourceManager;
    let queue: TestReviewQueue;
    
    beforeEach(() => {
        localStorageMock.clear();
        
        // Reset manager instance
        UnifiedDataSourceManager.resetInstance();
        manager = UnifiedDataSourceManager.getInstance();
        
        queue = new TestReviewQueue(manager, QueueType.RetrievalPractice);
    });
    
    /**
     * 属性1：interval(Again) < interval(Hard)
     * 
     * **Validates: Requirements 4.2, 4.3**
     * 
     * 对于任意卡片，评分Again的间隔应该始终小于评分Hard的间隔。
     * 这确保了难度梯度的合理性：用户评分越高，卡片重新出现的时间越晚。
     */
    describe('Property 1: interval(Again) < interval(Hard)', () => {
        it('should always have Again interval less than Hard interval', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        
                        // 计算Again和Hard的间隔
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        // 计算延迟时间（毫秒）
                        const againDelay = againInterval - now;
                        const hardDelay = hardInterval - now;
                        
                        // 属性：Hard间隔应该严格大于Again间隔
                        expect(hardDelay).toBeGreaterThan(againDelay);
                        
                        // 返回true表示属性成立
                        return hardDelay > againDelay;
                    }
                ),
                { numRuns: 100 } // 运行100次随机测试
            );
        });
        
        it('should maintain interval ordering across all card states', () => {
            fc.assert(
                fc.property(
                    arbitraryCardState(),
                    (state) => {
                        // 创建具有特定状态的卡片
                        const card: FSRSCard = {
                            id: 'test-card',
                            blockId: 'test-block',
                            state,
                            learning_step: 0,
                            due: Date.now(),
                            stability: 1,
                            difficulty: 5,
                            elapsedDays: 0,
                            scheduledDays: 1,
                            reps: 0,
                            lapses: 0,
                            lastReview: Date.now(),
                            priority: 50,
                            type: CardType.Item,
                            tags: [],
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            source: 'siyuan' as any,
                        };
                        
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        const againDelay = againInterval - now;
                        const hardDelay = hardInterval - now;
                        
                        // 对于所有状态，Hard都应该大于Again
                        return hardDelay > againDelay;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
    
    /**
     * 属性2：Again间隔 >= 1分钟（不再是0）
     * 
     * **Validates: Requirements 4.2**
     * 
     * 对于任意卡片，评分Again后的间隔应该至少为1分钟（60000毫秒）。
     * 这解决了原有问题：评分1后卡片立即重新出现（due = now）。
     * 现在卡片会在至少1分钟后重新出现，给用户"喘息"的机会。
     */
    describe('Property 2: Again interval >= 1 minute', () => {
        it('should always have Again interval at least 1 minute', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const delay = againInterval - now;
                        
                        // 属性：Again间隔应该至少为1分钟（60000毫秒）
                        // 允许1秒的误差（59000毫秒）以处理时间精度问题
                        expect(delay).toBeGreaterThanOrEqual(59000);
                        
                        return delay >= 59000;
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('should never return current time for Again rating', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        
                        // 属性：Again间隔应该严格大于当前时间
                        // 这确保卡片不会立即重新出现
                        expect(againInterval).toBeGreaterThan(now);
                        
                        return againInterval > now;
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('should use first learning step for Again rating', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const delay = againInterval - now;
                        
                        // 对于非Review状态，应该使用learning_steps的第一个step（1分钟）
                        // 对于Review状态，应该使用relearning_steps的第一个step（10分钟）
                        if (card.state === CardState.Review) {
                            // relearning_steps = ['10m'] = 600000毫秒
                            // 允许1秒误差
                            expect(delay).toBeGreaterThanOrEqual(599000);
                            expect(delay).toBeLessThanOrEqual(601000);
                            return delay >= 599000 && delay <= 601000;
                        } else {
                            // learning_steps = ['1m', '10m']，第一个是1分钟 = 60000毫秒
                            // 允许1秒误差
                            expect(delay).toBeGreaterThanOrEqual(59000);
                            expect(delay).toBeLessThanOrEqual(61000);
                            return delay >= 59000 && delay <= 61000;
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
    
    /**
     * 属性3：Hard间隔 > Again间隔
     * 
     * **Validates: Requirements 4.3**
     * 
     * 对于任意卡片，评分Hard的间隔应该严格大于评分Again的间隔。
     * 这是属性1的另一种表述，强调Hard评分应该给予更长的学习时间。
     * 
     * Hard间隔的计算规则：
     * - 单个step：first_step * 1.5
     * - 多个steps：(first_step + next_step) / 2
     */
    describe('Property 3: Hard interval > Again interval', () => {
        it('should always have Hard interval greater than Again interval', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        const againDelay = againInterval - now;
                        const hardDelay = hardInterval - now;
                        
                        // 属性：Hard间隔应该严格大于Again间隔
                        expect(hardDelay).toBeGreaterThan(againDelay);
                        
                        return hardDelay > againDelay;
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('should have Hard interval at least 1.5x Again for single step', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        const againDelay = againInterval - now;
                        const hardDelay = hardInterval - now;
                        
                        // 对于Review状态（使用relearning_steps = ['10m']，单个step）
                        // Hard应该是Again的1.5倍
                        if (card.state === CardState.Review) {
                            // Again = 10分钟 = 600000毫秒
                            // Hard = 10 * 1.5 = 15分钟 = 900000毫秒
                            const expectedRatio = 1.5;
                            const actualRatio = hardDelay / againDelay;
                            
                            // 允许小的浮点误差
                            expect(Math.abs(actualRatio - expectedRatio)).toBeLessThan(0.01);
                            return Math.abs(actualRatio - expectedRatio) < 0.01;
                        }
                        
                        // 对于其他状态（使用learning_steps = ['1m', '10m']，多个steps）
                        // Hard = (1 + 10) / 2 = 5.5分钟
                        // Again = 1分钟
                        // 比例 = 5.5
                        return hardDelay > againDelay;
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('should maintain consistent interval ratios', () => {
            fc.assert(
                fc.property(
                    arbitraryCardState(),
                    (state) => {
                        const card: FSRSCard = {
                            id: 'test-card',
                            blockId: 'test-block',
                            state,
                            learning_step: 0,
                            due: Date.now(),
                            stability: 1,
                            difficulty: 5,
                            elapsedDays: 0,
                            scheduledDays: 1,
                            reps: 0,
                            lapses: 0,
                            lastReview: Date.now(),
                            priority: 50,
                            type: CardType.Item,
                            tags: [],
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            source: 'siyuan' as any,
                        };
                        
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        const againDelay = againInterval - now;
                        const hardDelay = hardInterval - now;
                        
                        // 验证间隔比例的一致性
                        // 注意：calculateAgainInterval只对Review状态使用relearning_steps
                        // calculateHardInterval对Review和Relearning状态都使用relearning_steps
                        if (state === CardState.Review) {
                            // Again使用relearning_steps = ['10m']
                            // Hard使用relearning_steps = ['10m']（单个step）
                            // Hard = Again * 1.5 = 10 * 1.5 = 15分钟
                            const ratio = hardDelay / againDelay;
                            expect(Math.abs(ratio - 1.5)).toBeLessThan(0.01);
                            return Math.abs(ratio - 1.5) < 0.01;
                        } else if (state === CardState.Relearning) {
                            // Again使用learning_steps = ['1m', '10m']，第一个是1分钟
                            // Hard使用relearning_steps = ['10m']（单个step）
                            // Hard = 10 * 1.5 = 15分钟
                            // Again = 1分钟
                            // 比例 = 15
                            const ratio = hardDelay / againDelay;
                            expect(Math.abs(ratio - 15)).toBeLessThan(0.1);
                            return Math.abs(ratio - 15) < 0.1;
                        } else {
                            // New和Learning状态
                            // Again使用learning_steps = ['1m', '10m']，第一个是1分钟
                            // Hard使用learning_steps = ['1m', '10m']（多个steps）
                            // Hard = (1 + 10) / 2 = 5.5分钟
                            // Again = 1分钟
                            // 比例 = 5.5
                            const ratio = hardDelay / againDelay;
                            expect(Math.abs(ratio - 5.5)).toBeLessThan(0.1);
                            return Math.abs(ratio - 5.5) < 0.1;
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
    
    /**
     * 额外属性：间隔的合理性
     * 
     * 验证间隔值在合理范围内，不会出现异常值
     */
    describe('Additional Property: Interval Reasonableness', () => {
        it('should have intervals within reasonable bounds', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        const againDelay = againInterval - now;
                        const hardDelay = hardInterval - now;
                        
                        // Again间隔应该在1分钟到10分钟之间
                        expect(againDelay).toBeGreaterThanOrEqual(59000); // >= 59秒
                        expect(againDelay).toBeLessThanOrEqual(601000); // <= 10分1秒
                        
                        // Hard间隔应该在1.5分钟到15分钟之间
                        expect(hardDelay).toBeGreaterThanOrEqual(89000); // >= 1.5分钟 - 1秒
                        expect(hardDelay).toBeLessThanOrEqual(901000); // <= 15分钟 + 1秒
                        
                        return (
                            againDelay >= 59000 && againDelay <= 601000 &&
                            hardDelay >= 89000 && hardDelay <= 901000
                        );
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('should return valid timestamps', () => {
            fc.assert(
                fc.property(
                    arbitraryFSRSCard(),
                    (card) => {
                        const now = Date.now();
                        const againInterval = queue.testCalculateAgainInterval(card);
                        const hardInterval = queue.testCalculateHardInterval(card);
                        
                        // 时间戳应该是有效的数字
                        expect(Number.isFinite(againInterval)).toBe(true);
                        expect(Number.isFinite(hardInterval)).toBe(true);
                        
                        // 时间戳应该是正数
                        expect(againInterval).toBeGreaterThan(0);
                        expect(hardInterval).toBeGreaterThan(0);
                        
                        // 时间戳应该在未来
                        expect(againInterval).toBeGreaterThan(now);
                        expect(hardInterval).toBeGreaterThan(now);
                        
                        return (
                            Number.isFinite(againInterval) &&
                            Number.isFinite(hardInterval) &&
                            againInterval > 0 &&
                            hardInterval > 0 &&
                            againInterval > now &&
                            hardInterval > now
                        );
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
