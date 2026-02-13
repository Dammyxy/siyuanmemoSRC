/**
 * AdvanceEngine 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdvanceEngine } from '../AdvanceEngine';
import type { FSRSCard } from '@/types/card';
import type { AdvanceConfig } from '@/types/reschedule';
import { CardState, CardType } from '@/types/card';

// Mock StorageManager
const mockStorage = {
    setCard: vi.fn(),
    saveCards: vi.fn(),
    addRescheduleLog: vi.fn()
};

describe('AdvanceEngine', () => {
    let engine: AdvanceEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new AdvanceEngine(mockStorage as any);
    });

    // 辅助函数：创建测试卡片
    function createTestCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
        const now = Date.now();
        return {
            id: 'test-card-1',
            blockId: 'block-1',
            due: now + 30 * 24 * 60 * 60 * 1000, // 30 天后
            stability: 10,
            difficulty: 5,
            reps: 5,
            lapses: 0,
            state: CardState.Review,
            lastReview: now - 10 * 24 * 60 * 60 * 1000, // 10 天前
            elapsedDays: 10,
            scheduledDays: 40, // 当前间隔 40 天
            priority: 50,
            type: CardType.Item,
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now - 100 * 24 * 60 * 60 * 1000,
            updatedAt: now,
            ...overrides
        };
    }

    // 辅助函数：创建默认配置
    function createDefaultConfig(overrides: Partial<AdvanceConfig> = {}): AdvanceConfig {
        return {
            maxDays: 30,
            randomize: true,
            handleOverdueCards: true,
            ...overrides
        };
    }

    describe('基础 Advance 算法', () => {
        it('应该将卡片的 due date 设置在 today + 1 到 today + maxDays 之间', async () => {
            const card = createTestCard();
            const config = createDefaultConfig({ maxDays: 30 });
            const now = Date.now();

            const result = await engine.execute([card], config, 'test');

            expect(result.updated).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);

            const updatedCard = mockStorage.setCard.mock.calls[0][0] as FSRSCard;
            const dayMs = 24 * 60 * 60 * 1000;
            const minDue = now + 1 * dayMs;
            const maxDue = now + 30 * dayMs;

            expect(updatedCard.due).toBeGreaterThanOrEqual(minDue);
            expect(updatedCard.due).toBeLessThanOrEqual(maxDue);
        });

        it('应该生成 1 到 N 之间的随机天数', async () => {
            const cards = Array.from({ length: 100 }, (_, i) =>
                createTestCard({ id: `card-${i}` })
            );
            const config = createDefaultConfig({ maxDays: 30 });

            await engine.execute(cards, config, 'test');

            // 检查所有更新的卡片
            const updatedCards = mockStorage.setCard.mock.calls.map(call => call[0] as FSRSCard);
            const dayMs = 24 * 60 * 60 * 1000;

            for (const card of updatedCards) {
                // 使用卡片自己的 updatedAt 作为基准时间
                const daysFromUpdate = Math.round((card.due - card.updatedAt) / dayMs);
                expect(daysFromUpdate).toBeGreaterThanOrEqual(1);
                expect(daysFromUpdate).toBeLessThanOrEqual(30);
            }
        });

        it('应该更新卡片的 due、scheduledDays、updatedAt 和 rescheduleHistory', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const card = createTestCard({
                scheduledDays: 40, // 确保大于 maxDays
                due: now + 40 * dayMs,
                updatedAt: now - 1000 // 1秒前更新
            });
            const config = createDefaultConfig({ maxDays: 30 });

            await engine.execute([card], config, 'test');

            const updatedCard = mockStorage.setCard.mock.calls[0][0] as FSRSCard;

            expect(updatedCard.due).not.toBe(card.due);
            expect(updatedCard.scheduledDays).toBeDefined();
            expect(updatedCard.updatedAt).toBeGreaterThanOrEqual(card.updatedAt);
            expect(updatedCard.rescheduleHistory).toBeDefined();
            expect(updatedCard.rescheduleHistory!.length).toBeGreaterThan(0);

            const lastEntry = updatedCard.rescheduleHistory![updatedCard.rescheduleHistory!.length - 1];
            expect(lastEntry.type).toBe('advance');
            expect(lastEntry.oldDue).toBe(card.due);
            expect(lastEntry.newDue).toBe(updatedCard.due);
        });
    });

    describe('过期卡片特殊处理', () => {
        it('应该将极度过期的卡片安排到今天', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;

            // 创建一个上次复习距今超过 maxDays 的卡片
            const card = createTestCard({
                lastReview: now - 40 * dayMs, // 40 天前复习
                scheduledDays: 50
            });

            const config = createDefaultConfig({
                maxDays: 30,
                handleOverdueCards: true
            });

            const result = await engine.execute([card], config, 'test');

            expect(result.overdueHandled).toBe(1);

            const updatedCard = mockStorage.setCard.mock.calls[0][0] as FSRSCard;
            expect(updatedCard.due).toBe(now);

            const lastEntry = updatedCard.rescheduleHistory![updatedCard.rescheduleHistory!.length - 1];
            expect(lastEntry.reason).toBe('overdue');
        });

        it('当 handleOverdueCards 为 false 时不应特殊处理过期卡片', async () => {
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;

            const card = createTestCard({
                lastReview: now - 40 * dayMs,
                scheduledDays: 50
            });

            const config = createDefaultConfig({
                maxDays: 30,
                handleOverdueCards: false
            });

            const result = await engine.execute([card], config, 'test');

            expect(result.overdueHandled).toBe(0);

            const updatedCard = mockStorage.setCard.mock.calls[0][0] as FSRSCard;
            expect(updatedCard.due).not.toBe(now);
        });
    });

    describe('短间隔卡片保持', () => {
        it('应该保持短间隔卡片不变', async () => {
            const card = createTestCard({
                scheduledDays: 10 // 小于 maxDays
            });

            const config = createDefaultConfig({ maxDays: 30 });

            const result = await engine.execute([card], config, 'test');

            expect(result.unchanged).toBe(1);
            expect(result.updated).toBe(0);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });

        it('应该处理间隔等于 maxDays 的卡片', async () => {
            const card = createTestCard({
                scheduledDays: 30 // 等于 maxDays
            });

            const config = createDefaultConfig({ maxDays: 30 });

            const result = await engine.execute([card], config, 'test');

            expect(result.unchanged).toBe(0);
            expect(result.updated).toBe(1);
        });
    });

    describe('批量操作', () => {
        it('应该正确处理多张卡片', async () => {
            const cards = [
                createTestCard({ id: 'card-1', scheduledDays: 40 }),
                createTestCard({ id: 'card-2', scheduledDays: 50 }),
                createTestCard({ id: 'card-3', scheduledDays: 10 }) // 短间隔
            ];

            const config = createDefaultConfig({ maxDays: 30 });

            const result = await engine.execute(cards, config, 'test');

            expect(result.updated).toBe(2);
            expect(result.unchanged).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(2);
            expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
        });

        it('应该记录操作日志', async () => {
            const cards = [
                createTestCard({ id: 'card-1' }),
                createTestCard({ id: 'card-2' })
            ];

            const config = createDefaultConfig();

            await engine.execute(cards, config, 'browser');

            expect(mockStorage.addRescheduleLog).toHaveBeenCalledTimes(1);

            const log = mockStorage.addRescheduleLog.mock.calls[0][0];
            expect(log.action).toBe('advance');
            expect(log.source).toBe('browser');
            expect(log.targets).toHaveLength(2);
            expect(log.result.updated).toBe(2);
        });
    });

    describe('边界情况', () => {
        it('应该处理空卡片列表', async () => {
            const config = createDefaultConfig();

            const result = await engine.execute([], config, 'test');

            expect(result.updated).toBe(0);
            expect(result.unchanged).toBe(0);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });

        it('应该处理 lastReview 为 0 的卡片', async () => {
            const card = createTestCard({
                lastReview: 0,
                scheduledDays: 40
            });

            const config = createDefaultConfig();

            await engine.execute([card], config, 'test');

            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
        });

        it('应该处理 maxDays 为 1 的情况', async () => {
            const dayMs = 24 * 60 * 60 * 1000;
            const now = Date.now();
            
            // 创建一个最近复习过的卡片，不会被当作过期卡片处理
            const card = createTestCard({ 
                scheduledDays: 10, // 大于 maxDays (1)
                due: now + 10 * dayMs,
                lastReview: now - 0.5 * dayMs, // 12小时前复习，不会触发过期处理
                handleOverdueCards: false
            });
            const config = createDefaultConfig({ 
                maxDays: 1,
                handleOverdueCards: false // 禁用过期卡片特殊处理
            });

            const result = await engine.execute([card], config, 'test');

            expect(result.updated).toBe(1);
            expect(result.unchanged).toBe(0);
            expect(result.overdueHandled).toBe(0);

            const updatedCard = mockStorage.setCard.mock.calls[0][0] as FSRSCard;
            
            // 当 maxDays = 1 时，随机天数只能是 1
            // 验证 due 大约是 updatedAt + 1 天
            const daysFromUpdate = Math.round((updatedCard.due - updatedCard.updatedAt) / dayMs);
            expect(daysFromUpdate).toBe(1);
        });
    });
});
