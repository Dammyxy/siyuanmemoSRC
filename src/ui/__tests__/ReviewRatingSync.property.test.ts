/**
 * Property Test: Review Rating Synchronization
 * 属性测试：复习评分同步
 * 
 * **Property 10: 复习评分的数据同步**
 * **Validates: Requirements 6.1**
 * 
 * 验证复习评分后数据在 SRS 浏览器和复习界面之间自动同步。
 * 
 * 属性定义：
 * For any 复习评分操作，评分后 SRS 浏览器中对应卡片的状态（到期时间、复习次数、难度等）
 * 应该自动更新，无需手动刷新。
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 6.1
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - Property 10
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { SRSBrowserAdapter } from '../browser/SRSBrowserAdapter';
import { ReviewViewAdapter } from '../review/ReviewViewAdapter';
import type { IReviewQueue, QueueType, DataChangeEvent, IDataRouter } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';

// ============================================================================
// Test Fixtures and Arbitraries
// ============================================================================

/**
 * 生成随机 FSRSCard 的 fast-check arbitrary
 */
const fsrsCardArbitrary: fc.Arbitrary<FSRSCard> = fc.record({
    id: fc.string({ minLength: 10, maxLength: 20 }).map(s => `fsrs-${s}`),
    riffCardId: fc.string({ minLength: 10, maxLength: 20 }).map(s => `riff-${s}`),
    blockId: fc.string({ minLength: 10, maxLength: 20 }).map(s => `block-${s}`),
    rootId: fc.string({ minLength: 10, maxLength: 20 }).map(s => `root-${s}`),
    deckId: fc.string({ minLength: 10, maxLength: 20 }).map(s => `deck-${s}`),
    content: fc.string({ minLength: 10, maxLength: 100 }),
    due: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
    state: fc.integer({ min: 0, max: 3 }), // 0: New, 1: Learning, 2: Review, 3: Relearning
    stability: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
    difficulty: fc.float({ min: Math.fround(0), max: Math.fround(10), noNaN: true }),
    elapsed_days: fc.integer({ min: 0, max: 365 }),
    elapsedDays: fc.integer({ min: 0, max: 365 }),
    scheduled_days: fc.integer({ min: 1, max: 365 }),
    scheduledDays: fc.integer({ min: 1, max: 365 }),
    reps: fc.integer({ min: 0, max: 100 }),
    lapses: fc.integer({ min: 0, max: 10 }),
    last_review: fc.option(fc.date({ min: new Date('2023-01-01'), max: new Date('2024-12-31') }), { nil: undefined }),
    lastReview: fc.option(fc.date({ min: new Date('2023-01-01'), max: new Date('2024-12-31') }), { nil: undefined }),
    cardType: fc.constantFrom('item', 'topic'),
    priority: fc.integer({ min: 0, max: 10 }),
    suspended: fc.boolean(),
    tags: fc.array(fc.string({ minLength: 3, maxLength: 10 }), { maxLength: 5 }),
    note: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    aFactor: fc.float({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true }),
    type: fc.constantFrom('item', 'topic'),
    leechCount: fc.integer({ min: 0, max: 5 }),
    isLeech: fc.boolean(),
    isManuallyAdded: fc.boolean(),
    updatedAt: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
}) as fc.Arbitrary<FSRSCard>;

/**
 * 生成随机评分值的 fast-check arbitrary
 * 评分范围：1-4
 */
const ratingArbitrary: fc.Arbitrary<number> = fc.integer({ min: 1, max: 4 });

/**
 * 生成随机队列类型的 fast-check arbitrary
 */
const queueTypeArbitrary: fc.Arbitrary<QueueType> = fc.constantFrom(
    'retrieval-practice' as QueueType,
    'final-drill' as QueueType,
    'incremental-learning' as QueueType,
    'filter-group' as QueueType,
    'neural-roam' as QueueType
);

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * 创建 Mock 数据路由器
 */
function createMockRouter(cards: Map<string, FSRSCard>): IDataRouter {
    return {
        getCard: vi.fn(async (cardId: string) => {
            const card = cards.get(cardId);
            if (!card) {
                throw new Error(`Card not found: ${cardId}`);
            }
            return card;
        }),
        getCards: vi.fn(async () => Array.from(cards.values())),
        updateCard: vi.fn(async (card: FSRSCard) => {
            cards.set(card.id, card);
        }),
        deleteCard: vi.fn(async (cardId: string) => {
            cards.delete(cardId);
        }),
        getAvailableQueueTypes: vi.fn(() => [
            'retrieval-practice' as QueueType,
            'final-drill' as QueueType,
        ]),
    };
}

/**
 * 创建 Mock 队列
 */
function createMockQueue(
    queueType: QueueType,
    cards: Map<string, FSRSCard>,
    manager: UnifiedDataSourceManager
): IReviewQueue {
    return {
        getType: vi.fn(() => queueType),
        getCards: vi.fn(async () => Array.from(cards.values())),
        addCard: vi.fn(async (cardId: string) => {
            // Mock implementation
        }),
        removeCard: vi.fn(async (cardId: string) => {
            cards.delete(cardId);
        }),
        handleReview: vi.fn(async (cardId: string, rating: number) => {
            // 模拟评分逻辑：更新卡片状态
            const card = cards.get(cardId);
            if (!card) {
                throw new Error(`Card not found: ${cardId}`);
            }
            
            // 更新卡片状态
            const updatedCard: FSRSCard = {
                ...card,
                reps: card.reps + 1,
                last_review: new Date(),
                lastReview: new Date(),
                updatedAt: Date.now(),
            };
            
            // 根据评分更新到期时间
            if (rating >= 3) {
                // 评分 3/4：延长到期时间
                const daysToAdd = rating === 4 ? 7 : 3;
                updatedCard.due = new Date(Date.now() + daysToAdd * 86400000);
                updatedCard.scheduled_days = daysToAdd;
                updatedCard.scheduledDays = daysToAdd;
            } else {
                // 评分 1/2：保持今天到期
                updatedCard.due = new Date();
                updatedCard.scheduled_days = 0;
                updatedCard.scheduledDays = 0;
                updatedCard.lapses = card.lapses + 1;
            }
            
            // 更新卡片到数据源
            cards.set(cardId, updatedCard);
            
            // 通过 manager 更新卡片，触发观察者通知
            await manager.updateCard(updatedCard);
        }),
        isDynamic: vi.fn(() => true),
    };
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 10: Review Rating Synchronization', () => {
    let manager: UnifiedDataSourceManager;
    let cards: Map<string, FSRSCard>;
    let mockRouter: IDataRouter;
    let originalGetQueue: any;
    
    beforeEach(() => {
        // 重置单例实例
        UnifiedDataSourceManager.resetInstance();
        
        // 创建新的管理器实例
        manager = UnifiedDataSourceManager.getInstance();
        
        // 创建卡片存储
        cards = new Map<string, FSRSCard>();
        
        // 创建 mock 路由器
        mockRouter = createMockRouter(cards);
        
        // 初始化路由器
        manager.initializeRouters(mockRouter, mockRouter);
        
        // 保存原始的 getQueue 方法
        originalGetQueue = manager.getQueue.bind(manager);
    });
    
    afterEach(() => {
        // 恢复原始的 getQueue 方法
        if (originalGetQueue) {
            manager.getQueue = originalGetQueue;
        }
        
        // 清理
        UnifiedDataSourceManager.resetInstance();
    });
    
    /**
     * Property 10: 复习评分的数据同步
     * 
     * For any 复习评分操作，评分后 SRS 浏览器中对应卡片的状态
     * （到期时间、复习次数、难度等）应该自动更新，无需手动刷新。
     * 
     * 测试策略：
     * 1. 生成随机卡片和评分
     * 2. 创建 SRSBrowserAdapter 和 ReviewViewAdapter
     * 3. 在 ReviewViewAdapter 中评分卡片
     * 4. 验证 SRSBrowserAdapter 收到了 card-updated 事件
     * 5. 验证事件中包含正确的卡片 ID
     * 6. 验证卡片状态已更新（复习次数增加）
     */
    it('should automatically sync card state from review to browser after rating', async () => {
        await fc.assert(
            fc.asyncProperty(
                fsrsCardArbitrary,
                ratingArbitrary,
                queueTypeArbitrary,
                async (card, rating, queueType) => {
                    // 1. 准备测试数据
                    cards.set(card.id, card);
                    
                    // 创建 mock 队列
                    const mockQueue = createMockQueue(queueType, cards, manager);
                    
                    // Mock manager.getQueue 方法
                    manager.getQueue = vi.fn(() => mockQueue) as any;
                    
                    // 2. 创建适配器
                    const browserAdapter = new SRSBrowserAdapter(manager);
                    const reviewAdapter = new ReviewViewAdapter(manager);
                    
                    // 3. 初始化适配器
                    await browserAdapter.initializeQueueView(queueType);
                    await reviewAdapter.initializeController(queueType);
                    
                    // 4. 设置浏览器适配器的数据变更回调
                    const browserEvents: DataChangeEvent[] = [];
                    browserAdapter.setOnDataChangeCallback((event) => {
                        browserEvents.push(event);
                    });
                    
                    // 5. 获取初始卡片状态
                    const initialCard = cards.get(card.id)!;
                    const initialReps = initialCard.reps;
                    
                    // 6. 在复习界面评分卡片
                    await reviewAdapter.next();
                    await reviewAdapter.grade(rating);
                    
                    // 7. 验证浏览器适配器收到了 card-updated 事件
                    const cardUpdatedEvents = browserEvents.filter(e => e.type === 'card-updated');
                    expect(cardUpdatedEvents.length).toBeGreaterThan(0);
                    
                    // 8. 验证事件中包含正确的卡片 ID
                    const lastEvent = cardUpdatedEvents[cardUpdatedEvents.length - 1];
                    expect(lastEvent.cardIds).toBeDefined();
                    expect(lastEvent.cardIds).toContain(card.id);
                    
                    // 9. 验证卡片状态已更新
                    const updatedCard = cards.get(card.id)!;
                    
                    // 验证复习次数增加
                    expect(updatedCard.reps).toBe(initialReps + 1);
                    
                    // 验证最后复习时间已更新
                    expect(updatedCard.last_review).toBeDefined();
                    expect(updatedCard.lastReview).toBeDefined();
                    
                    // 验证到期时间根据评分更新
                    if (rating >= 3) {
                        // 评分 3/4：到期时间应该延长
                        expect(updatedCard.due.getTime()).toBeGreaterThan(Date.now());
                    } else {
                        // 评分 1/2：到期时间应该是今天
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dueDate = new Date(updatedCard.due);
                        dueDate.setHours(0, 0, 0, 0);
                        expect(dueDate.getTime()).toBeLessThanOrEqual(today.getTime() + 86400000);
                        
                        // 验证失误次数增加
                        expect(updatedCard.lapses).toBe(initialCard.lapses + 1);
                    }
                    
                    // 10. 清理
                    browserAdapter.destroy();
                    reviewAdapter.destroy();
                }
            ),
            { numRuns: 50 } // 运行 50 次迭代
        );
    });
    
    /**
     * Property 10.1: 多次评分的累积同步
     * 
     * For any 连续的多次评分操作，每次评分后浏览器都应该收到通知，
     * 且卡片状态应该累积更新。
     * 
     * 测试策略：
     * 1. 生成随机卡片和多个评分
     * 2. 连续评分多次
     * 3. 验证每次评分后都收到通知
     * 4. 验证复习次数累积增加
     */
    it('should sync card state after multiple consecutive ratings', async () => {
        await fc.assert(
            fc.asyncProperty(
                fsrsCardArbitrary,
                fc.array(ratingArbitrary, { minLength: 2, maxLength: 5 }),
                queueTypeArbitrary,
                async (card, ratings, queueType) => {
                    // 1. 准备测试数据
                    cards.set(card.id, card);
                    
                    // 创建 mock 队列
                    const mockQueue = createMockQueue(queueType, cards, manager);
                    
                    // Mock manager.getQueue 方法
                    manager.getQueue = vi.fn(() => mockQueue) as any;
                    
                    // 2. 创建适配器
                    const browserAdapter = new SRSBrowserAdapter(manager);
                    const reviewAdapter = new ReviewViewAdapter(manager);
                    
                    // 3. 初始化适配器
                    await browserAdapter.initializeQueueView(queueType);
                    await reviewAdapter.initializeController(queueType);
                    
                    // 4. 设置浏览器适配器的数据变更回调
                    const browserEvents: DataChangeEvent[] = [];
                    browserAdapter.setOnDataChangeCallback((event) => {
                        browserEvents.push(event);
                    });
                    
                    // 5. 获取初始卡片状态
                    const initialReps = card.reps;
                    
                    // 6. 连续评分多次
                    for (let i = 0; i < ratings.length; i++) {
                        await reviewAdapter.next();
                        await reviewAdapter.grade(ratings[i]);
                    }
                    
                    // 7. 验证收到了正确数量的 card-updated 事件
                    const cardUpdatedEvents = browserEvents.filter(e => e.type === 'card-updated');
                    expect(cardUpdatedEvents.length).toBeGreaterThanOrEqual(ratings.length);
                    
                    // 8. 验证每个事件都包含正确的卡片 ID
                    for (const event of cardUpdatedEvents) {
                        expect(event.cardIds).toBeDefined();
                        expect(event.cardIds).toContain(card.id);
                    }
                    
                    // 9. 验证复习次数累积增加
                    const updatedCard = cards.get(card.id)!;
                    expect(updatedCard.reps).toBe(initialReps + ratings.length);
                    
                    // 10. 清理
                    browserAdapter.destroy();
                    reviewAdapter.destroy();
                }
            ),
            { numRuns: 30 } // 运行 30 次迭代
        );
    });
    
    /**
     * Property 10.2: 不同队列类型的同步一致性
     * 
     * For any 队列类型，评分后的同步行为应该一致，
     * 都应该触发 card-updated 事件并更新卡片状态。
     * 
     * 测试策略：
     * 1. 生成随机卡片和评分
     * 2. 对所有队列类型进行测试
     * 3. 验证每种队列类型都能正确同步
     */
    it('should sync consistently across different queue types', async () => {
        await fc.assert(
            fc.asyncProperty(
                fsrsCardArbitrary,
                ratingArbitrary,
                async (card, rating) => {
                    // 测试所有队列类型
                    const queueTypes: QueueType[] = [
                        'retrieval-practice' as QueueType,
                        'final-drill' as QueueType,
                        'incremental-learning' as QueueType,
                        'filter-group' as QueueType,
                        'neural-roam' as QueueType,
                    ];
                    
                    for (const queueType of queueTypes) {
                        // 1. 准备测试数据
                        cards.clear();
                        cards.set(card.id, { ...card });
                        
                        // 创建 mock 队列
                        const mockQueue = createMockQueue(queueType, cards, manager);
                        
                        // Mock manager.getQueue 方法
                        manager.getQueue = vi.fn(() => mockQueue) as any;
                        
                        // 2. 创建适配器
                        const browserAdapter = new SRSBrowserAdapter(manager);
                        const reviewAdapter = new ReviewViewAdapter(manager);
                        
                        // 3. 初始化适配器
                        await browserAdapter.initializeQueueView(queueType);
                        await reviewAdapter.initializeController(queueType);
                        
                        // 4. 设置浏览器适配器的数据变更回调
                        const browserEvents: DataChangeEvent[] = [];
                        browserAdapter.setOnDataChangeCallback((event) => {
                            browserEvents.push(event);
                        });
                        
                        // 5. 在复习界面评分卡片
                        await reviewAdapter.next();
                        await reviewAdapter.grade(rating);
                        
                        // 6. 验证浏览器适配器收到了 card-updated 事件
                        const cardUpdatedEvents = browserEvents.filter(e => e.type === 'card-updated');
                        expect(cardUpdatedEvents.length).toBeGreaterThan(0);
                        
                        // 7. 验证事件中包含正确的卡片 ID
                        const lastEvent = cardUpdatedEvents[cardUpdatedEvents.length - 1];
                        expect(lastEvent.cardIds).toContain(card.id);
                        
                        // 8. 清理
                        browserAdapter.destroy();
                        reviewAdapter.destroy();
                    }
                }
            ),
            { numRuns: 20 } // 运行 20 次迭代（每次测试 5 种队列类型）
        );
    });
});
