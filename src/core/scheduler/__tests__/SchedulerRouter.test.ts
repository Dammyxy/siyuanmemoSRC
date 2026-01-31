/**
 * Scheduler Router 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulerRouter } from '@/core/scheduler/SchedulerRouter';
import type { FSRSCard, Rating } from '@/types';
import type { StorageManager } from '@/core/storage/manager';
import { CardState, CardType } from '@/types';

// Mock StorageManager
const mockStorage = {
    setCard: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
} as unknown as StorageManager;

// Mock FSRS 参数
const mockParams = {
    requestRetention: 0.9,
    maximumInterval: 36500,
    weights: new Array(19).fill(0.5),
    enableFuzz: false,
    enableShortTerm: true,
};

// 测试用卡片工厂
function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
    return {
        id: 'test-card-1',
        blockId: 'block-1',
        due: Date.now(),
        stability: 0,
        difficulty: 5,
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
        ...overrides,
    };
}

describe('SchedulerRouter', () => {
    let router: SchedulerRouter;

    beforeEach(() => {
        vi.clearAllMocks();
        router = new SchedulerRouter(
            {
                defaultScheduler: 'fsrs-v5',
                enableRiffSync: false,
                fsrsParams: mockParams,
            },
            mockStorage
        );
    });

    describe('初始化', () => {
        it('应该成功创建 SchedulerRouter 实例', () => {
            expect(router).toBeDefined();
            expect(router).toBeInstanceOf(SchedulerRouter);
        });

        it('应该初始化所有可用的调度器', () => {
            // 验证调度器已初始化（通过调用 route 方法间接验证）
            const card = createTestCard();

            // 不应该抛出错误
            expect(() => router.getSchedulerType(card)).not.toThrow();
        });
    });

    describe('getSchedulerType', () => {
        it('Topic 卡片应该返回 a-factor-v2（如果可用）', () => {
            const card = createTestCard({ type: CardType.Topic });
            const schedulerType = router.getSchedulerType(card);

            // TopicScheduler v2 存在，应该返回 a-factor-v2
            expect(schedulerType).toBe('a-factor-v2');
        });

        it('Item 卡片应该返回默认调度器', () => {
            const card = createTestCard({ type: CardType.Item });
            const schedulerType = router.getSchedulerType(card);

            expect(schedulerType).toBe('fsrs-v5');
        });

        it('应该优先使用卡片的 schedulerType 字段', () => {
            const card = createTestCard({
                type: CardType.Item,
                schedulerType: 'sm2',
            });
            const schedulerType = router.getSchedulerType(card);

            expect(schedulerType).toBe('sm2');
        });

        it('如果 schedulerType 不存在，应该回退到默认调度器', () => {
            const card = createTestCard({
                type: CardType.Item,
                schedulerType: 'unknown-scheduler' as any, // 不存在的调度器
            });
            const schedulerType = router.getSchedulerType(card);

            // 不存在的调度器，应该回退到默认
            expect(schedulerType).toBe('fsrs-v5');
        });

        it('应该遵守用户覆盖配置', () => {
            const card = createTestCard({ id: 'override-card' });
            const routerWithOverrides = new SchedulerRouter(
                {
                    defaultScheduler: 'fsrs-v5',
                    enableRiffSync: false,
                    fsrsParams: mockParams,
                    schedulerOverrides: new Map([['override-card', 'sm2']]),
                },
                mockStorage
            );

            const schedulerType = routerWithOverrides.getSchedulerType(card);

            expect(schedulerType).toBe('sm2');
        });
    });

    describe('route', () => {
        it('应该成功路由 Item 卡片到 FSRS v5', async () => {
            const card = createTestCard({ type: CardType.Item });

            const updatedCard = await router.route(card, 3); // Good rating

            expect(updatedCard).toBeDefined();
            expect(updatedCard.schedulerType).toBe('fsrs-v5');
            expect(mockStorage.setCard).toHaveBeenCalledWith(updatedCard);
            expect(mockStorage.saveCards).toHaveBeenCalled();
        });

        it('应该成功路由 Topic 卡片到 A-Factor-v2', async () => {
            const card = createTestCard({ type: CardType.Topic });

            const updatedCard = await router.route(card, 3); // Good rating

            expect(updatedCard).toBeDefined();
            expect(updatedCard.schedulerType).toBe('a-factor-v2');
            expect(mockStorage.setCard).toHaveBeenCalledWith(updatedCard);
            expect(mockStorage.saveCards).toHaveBeenCalled();
        });

        it('应该正确更新卡片状态', async () => {
            const card = createTestCard({
                type: CardType.Item,
                stability: 0,
                reps: 0,
            });

            const updatedCard = await router.route(card, 4); // Easy rating

            expect(updatedCard.reps).toBeGreaterThan(0);
            expect(updatedCard.stability).toBeGreaterThan(0);
        });
    });

    describe('switchScheduler', () => {
        it('应该成功切换 Item 卡片的调度器', async () => {
            const card = createTestCard({
                type: CardType.Item,
                schedulerType: 'fsrs-v5',
            });

            const success = await router.switchScheduler(card, 'sm2');

            expect(success).toBe(true);
            expect(mockStorage.setCard).toHaveBeenCalled();
            expect(mockStorage.saveCards).toHaveBeenCalled();
        });

        it('应该拒绝 Topic 卡片切换到非 A-Factor 调度器', async () => {
            const card = createTestCard({
                type: CardType.Topic,
                schedulerType: 'a-factor',
            });

            const success = await router.switchScheduler(card, 'sm2' as any);

            expect(success).toBe(false);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });

        it('应该拒绝切换到不存在的调度器', async () => {
            const card = createTestCard({
                type: CardType.Item,
                schedulerType: 'fsrs-v5',
            });

            const success = await router.switchScheduler(card, 'unknown-scheduler' as any);

            expect(success).toBe(false);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });

        it('应该正确转换 A-Factor 到 FSRS difficulty', async () => {
            const card = createTestCard({
                type: CardType.Item, // 改为 Item 类型，这样才能切换到 fsrs-v5
                schedulerType: 'a-factor',
                aFactor: 3.0, // 中等难度
            });

            const success = await router.switchScheduler(card, 'fsrs-v5');

            expect(success).toBe(true);
            // 验证转换逻辑
            const updatedCard = createTestCard({
                ...card,
                aFactor: 3.0,
            });
            const converted = router['_convertCardState'](updatedCard, 'a-factor', 'fsrs-v5');
            expect(converted.difficulty).toBeCloseTo(4.375, 1); // (3.0 - 1.2) / 4.8 * 9 + 1 = 4.375
        });
    });

    describe('preview', () => {
        it('应该返回所有评分的预览', () => {
            const card = createTestCard({ type: CardType.Item });

            const previews = router.preview(card);

            expect(previews).toBeDefined();
            expect(previews.size).toBe(4); // Again, Hard, Good, Easy
            expect(previews.get(1)).toBeDefined(); // Again
            expect(previews.get(2)).toBeDefined(); // Hard
            expect(previews.get(3)).toBeDefined(); // Good
            expect(previews.get(4)).toBeDefined(); // Easy
        });

        it('应该根据卡片类型使用正确的调度器', () => {
            const itemCard = createTestCard({ type: CardType.Item });
            const topicCard = createTestCard({ type: CardType.Topic });

            const itemPreviews = router.preview(itemCard);
            const topicPreviews = router.preview(topicCard);

            // 应该返回不同调度器的预览结果
            expect(itemPreviews).toBeDefined();
            expect(topicPreviews).toBeDefined();
        });
    });

    describe('updateConfig', () => {
        it('应该更新配置', () => {
            const newParams = { ...mockParams, requestRetention: 0.95 };

            router.updateConfig({
                fsrsParams: newParams,
            });

            // 验证配置已更新（通过后续调用验证）
            const card = createTestCard();
            expect(() => router.route(card, 3)).not.toThrow();
        });

        it('应该更新默认调度器', () => {
            router.updateConfig({
                defaultScheduler: 'sm2',
            });

            const card = createTestCard({ type: CardType.Item });
            const schedulerType = router.getSchedulerType(card);

            expect(schedulerType).toBe('sm2');
        });
    });

    describe('_convertCardState', () => {
        it('应该正确转换 A-Factor 到 FSRS difficulty', () => {
            const card = createTestCard({
                aFactor: 1.2, // 最小值
                difficulty: 0,
            });

            const converted = router['_convertCardState'](card, 'a-factor', 'fsrs-v5');

            expect(converted.difficulty).toBeCloseTo(1, 1); // (1.2 - 1.2) / 4.8 * 9 + 1 = 1
        });

        it('应该正确转换 FSRS difficulty 到 A-Factor', () => {
            const card = createTestCard({
                difficulty: 5, // 中等
                aFactor: 0,
            });

            const converted = router['_convertCardState'](card, 'fsrs-v5', 'a-factor');

            expect(converted.aFactor).toBeCloseTo(3.333, 1); // 1.2 + ((5 - 1) / 9) * 4.8 = 3.333
        });

        it('A-Factor 到 A-Factor-v2 应该保留 aFactor 值', () => {
            const card = createTestCard({
                aFactor: 2.5,
                schedulerType: 'a-factor',
            });

            const converted = router['_convertCardState'](card, 'a-factor', 'a-factor-v2');

            // a-factor 到 a-factor-v2 应该保留 aFactor 值
            expect(converted.aFactor).toBe(2.5);
            // 但会添加 topic 元数据
            expect(converted.schedulerMeta?.topic).toBeDefined();
        });
    });
});
