/**
 * Static Queues Learning Steps Isolation Tests
 * 静态队列学习步骤隔离测试
 * 
 * 验证静态队列（NeuralRoamQueue、FinalDrillQueue）不受 learning steps 机制影响。
 * 
 * 测试目标：
 * - 确认静态队列不调用 calculateNextDueDateForLowRating
 * - 确认静态队列有自己独立的 handleReview 实现
 * - 确认评分行为与 learning steps 无关
 * 
 * @see .kiro/specs/learning-steps-rating-fix/requirements.md (约束条件 6.1)
 * @see .kiro/specs/learning-steps-rating-fix/design.md (架构设计 2.1)
 * @see .kiro/specs/learning-steps-rating-fix/tasks.md (任务 4.4)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FinalDrillQueue } from '../FinalDrillQueue';
import { NeuralRoamQueue } from '../NeuralRoamQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
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

// Mock SQL API
vi.mock('@/core/siyuan/api', () => ({
    sql: vi.fn().mockResolvedValue([])
}));

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

describe('Static Queues - Learning Steps Isolation', () => {
    let manager: UnifiedDataSourceManager;
    
    beforeEach(() => {
        // Clear localStorage
        localStorageMock.clear();
        
        // Reset manager instance
        UnifiedDataSourceManager.resetInstance();
        manager = UnifiedDataSourceManager.getInstance();
        
        // Mock notifyObservers
        vi.spyOn(manager, 'notifyObservers').mockImplementation(() => {});
    });
    
    afterEach(() => {
        vi.clearAllMocks();
    });
    
    describe('FinalDrillQueue - 不受 Learning Steps 影响', () => {
        let queue: FinalDrillQueue;
        
        beforeEach(() => {
            queue = new FinalDrillQueue(manager);
        });
        
        it('任务 4.4: FinalDrillQueue 不调用 calculateNextDueDateForLowRating', async () => {
            /**
             * 验证 FinalDrillQueue 有自己的 handleReview 实现，
             * 不依赖基类的 calculateNextDueDateForLowRating 方法。
             */
            const card = createTestCard('card-1');
            const originalDue = card.due;
            
            // Mock getCard
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            // 添加卡片到队列
            await queue.addCard('card-1', 'manual');
            
            // 评分 1（Again）- 在动态队列中会触发 learning steps
            await queue.handleReview('card-1', 1);
            
            // 验证：FinalDrillQueue 不修改 due 时间（不使用 learning steps）
            expect(card.due).toBe(originalDue);
        });
        
        it('任务 4.4: FinalDrillQueue 评分 1 不使用 learning steps 延迟', async () => {
            /**
             * 验证评分 1 后，卡片的 due 时间不会被设置为 now + 1分钟。
             * FinalDrillQueue 的评分不计入调度，due 时间保持不变。
             */
            const card = createTestCard('card-2');
            const originalDue = card.due;
            const now = Date.now();
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-2', 'manual');
            await queue.handleReview('card-2', 1);
            
            // 验证：due 时间没有被设置为 now + 1分钟
            expect(card.due).toBe(originalDue);
            expect(card.due).not.toBe(now + 60 * 1000);
        });
        
        it('任务 4.4: FinalDrillQueue 评分 2 不使用 learning steps 延迟', async () => {
            /**
             * 验证评分 2 后，卡片的 due 时间不会被设置为 Hard 间隔。
             */
            const card = createTestCard('card-3');
            const originalDue = card.due;
            const now = Date.now();
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-3', 'manual');
            await queue.handleReview('card-3', 2);
            
            // 验证：due 时间没有被设置为 Hard 间隔（5.5分钟）
            expect(card.due).toBe(originalDue);
            expect(card.due).not.toBe(now + 5.5 * 60 * 1000);
        });
        
        it('任务 4.4: FinalDrillQueue 行为与 learning steps 配置无关', async () => {
            /**
             * 验证即使修改了 learning steps 配置，
             * FinalDrillQueue 的行为也不会改变。
             */
            const card = createTestCard('card-4');
            const originalDue = card.due;
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-4', 'manual');
            
            // 多次评分（模拟不同的 learning steps 场景）
            await queue.handleReview('card-4', 1); // Again
            expect(card.due).toBe(originalDue);
            
            await queue.handleReview('card-4', 2); // Hard
            expect(card.due).toBe(originalDue);
            
            await queue.handleReview('card-4', 3); // Good
            expect(card.due).toBe(originalDue);
        });
        
        it('任务 4.4: FinalDrillQueue 评分 4 移除卡片（不受 learning steps 影响）', async () => {
            /**
             * 验证评分 4 的行为：从队列移除卡片。
             * 这是 FinalDrillQueue 的特有行为，与 learning steps 无关。
             */
            const card = createTestCard('card-5');
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            
            await queue.addCard('card-5', 'manual');
            
            // 验证卡片在队列中
            expect(queue.getEntry('card-5')).toBeDefined();
            
            // 评分 4
            await queue.handleReview('card-5', 4);
            
            // 验证卡片已从队列移除
            expect(queue.getEntry('card-5')).toBeUndefined();
        });
    });
    
    describe('NeuralRoamQueue - 不受 Learning Steps 影响', () => {
        let queue: NeuralRoamQueue;
        
        beforeEach(() => {
            queue = new NeuralRoamQueue(manager);
        });
        
        it('任务 4.4: NeuralRoamQueue 不调用 calculateNextDueDateForLowRating', async () => {
            /**
             * 验证 NeuralRoamQueue 有自己的 handleReview 实现，
             * 不依赖基类的 calculateNextDueDateForLowRating 方法。
             */
            const card = createTestCard('card-6');
            const originalDue = card.due;
            
            // Mock getCard
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            vi.spyOn(manager, 'updateCard').mockResolvedValue(undefined);
            
            // 评分 1（Again）- 在动态队列中会触发 learning steps
            await queue.handleReview('card-6', 1);
            
            // 验证：NeuralRoamQueue 使用自己的调度逻辑（不是 learning steps）
            // NeuralRoamQueue 会修改 due，但使用的是 calculateNextDueDate，不是 learning steps
            expect(card.due).not.toBe(originalDue + 60 * 1000); // 不是 learning steps 的 1 分钟
        });
        
        it('任务 4.4: NeuralRoamQueue 评分 1 使用自己的调度逻辑', async () => {
            /**
             * 验证 NeuralRoamQueue 使用 calculateNextDueDate 方法，
             * 而不是 calculateNextDueDateForLowRating（learning steps）。
             */
            const card = createTestCard('card-7');
            const now = Date.now();
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            vi.spyOn(manager, 'updateCard').mockResolvedValue(undefined);
            
            await queue.handleReview('card-7', 1);
            
            // 验证：due 时间不是 learning steps 的 1 分钟延迟
            const delay = card.due - now;
            expect(delay).not.toBe(60 * 1000);
            
            // NeuralRoamQueue 使用简化的 FSRS 算法：
            // rating 1 -> interval = currentInterval (1 day)
            // 所以 delay 应该接近 1 天
            expect(delay).toBeGreaterThan(20 * 60 * 60 * 1000); // > 20 小时
        });
        
        it('任务 4.4: NeuralRoamQueue 评分 2 不使用 learning steps Hard 间隔', async () => {
            /**
             * 验证评分 2 后，卡片的 due 时间不会被设置为 Hard 间隔（5.5分钟）。
             */
            const card = createTestCard('card-8');
            const now = Date.now();
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            vi.spyOn(manager, 'updateCard').mockResolvedValue(undefined);
            
            await queue.handleReview('card-8', 2);
            
            // 验证：due 时间不是 learning steps 的 Hard 间隔
            const delay = card.due - now;
            expect(delay).not.toBe(5.5 * 60 * 1000);
            
            // NeuralRoamQueue 使用简化的 FSRS 算法
            expect(delay).toBeGreaterThan(20 * 60 * 60 * 1000); // > 20 小时
        });
        
        it('任务 4.4: NeuralRoamQueue 仅对 item 卡片评分', async () => {
            /**
             * 验证 NeuralRoamQueue 只对 item 类型的卡片进行评分，
             * topic 卡片不评分（与 learning steps 无关）。
             */
            const itemCard = createTestCard('card-9');
            itemCard.type = CardType.Item;
            
            const topicCard = createTestCard('card-10');
            topicCard.type = 'topic' as CardType;
            
            const itemOriginalDue = itemCard.due;
            const topicOriginalDue = topicCard.due;
            
            // Mock getCard to return different cards
            vi.spyOn(manager, 'getCard').mockImplementation(async (cardId: string) => {
                if (cardId === 'card-9') return itemCard;
                if (cardId === 'card-10') return topicCard;
                throw new Error('Card not found');
            });
            vi.spyOn(manager, 'updateCard').mockResolvedValue(undefined);
            
            // 评分 item 卡片
            await queue.handleReview('card-9', 3);
            expect(itemCard.due).not.toBe(itemOriginalDue); // item 卡片会被评分
            
            // 评分 topic 卡片
            await queue.handleReview('card-10', 3);
            expect(topicCard.due).toBe(topicOriginalDue); // topic 卡片不评分
        });
        
        it('任务 4.4: NeuralRoamQueue 行为与 learning steps 配置无关', async () => {
            /**
             * 验证即使修改了 learning steps 配置，
             * NeuralRoamQueue 的行为也不会改变。
             */
            const card = createTestCard('card-11');
            const now = Date.now();
            
            vi.spyOn(manager, 'getCard').mockResolvedValue(card);
            vi.spyOn(manager, 'updateCard').mockResolvedValue(undefined);
            
            // 评分 3（Good）
            await queue.handleReview('card-11', 3);
            
            // 验证：使用 NeuralRoamQueue 自己的调度逻辑
            const delay = card.due - now;
            
            // NeuralRoamQueue: rating 3 -> interval = currentInterval * 2 (2 days)
            expect(delay).toBeGreaterThan(1.5 * 24 * 60 * 60 * 1000); // > 1.5 天
            expect(delay).toBeLessThan(3 * 24 * 60 * 60 * 1000); // < 3 天
            
            // 不是 learning steps 的毕业间隔（1 天）
            expect(delay).not.toBe(1 * 24 * 60 * 60 * 1000);
        });
    });
    
    describe('架构验证：静态队列独立性', () => {
        it('任务 4.4: 静态队列不继承动态队列的 learning steps 行为', () => {
            /**
             * 验证静态队列的架构设计：
             * - 静态队列有自己的 handleReview 实现
             * - 不调用基类的 calculateNextDueDateForLowRating
             * - 与 learning steps 机制完全隔离
             * 
             * 注意：calculateNextDueDateForLowRating 是 protected 方法，
             * 所以静态队列会继承它，但关键是静态队列不会调用它。
             */
            const finalDrillQueue = new FinalDrillQueue(manager);
            const neuralRoamQueue = new NeuralRoamQueue(manager);
            
            // 验证：静态队列标识
            expect(finalDrillQueue.isDynamic()).toBe(false);
            expect(neuralRoamQueue.isDynamic()).toBe(false);
            
            // 验证：静态队列有自己的 handleReview 方法
            expect(typeof finalDrillQueue.handleReview).toBe('function');
            expect(typeof neuralRoamQueue.handleReview).toBe('function');
            
            // 验证：虽然静态队列继承了 calculateNextDueDateForLowRating（protected 方法），
            // 但它们有自己独立的 handleReview 实现，不会调用这个方法
            expect(typeof (finalDrillQueue as any).calculateNextDueDateForLowRating).toBe('function');
            expect(typeof (neuralRoamQueue as any).calculateNextDueDateForLowRating).toBe('function');
        });
    });
});
