/**
 * Reschedule Fields Migration Integration Test
 * 
 * 验证 SuperMemo 重新调度字段的自动迁移功能
 * 
 * @see .kiro/specs/supermemo-reschedule-operations/requirements.md (Requirement 18.7)
 * @see .kiro/specs/supermemo-reschedule-operations/tasks.md (Task 11)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../manager';
import { FSRSCard, CardState, CardType } from '@/types/card';

describe('Reschedule Fields Migration', () => {
    let storage: StorageManager;

    beforeEach(() => {
        storage = new StorageManager('test-plugin');
    });

    describe('normalizeCard with migration', () => {
        it('should add postponeCount = 0 to cards without it', () => {
            // 模拟从存储加载的旧卡片（没有 postponeCount）
            const oldCard: any = {
                id: 'test-card-1',
                blockId: 'block-1',
                due: Date.now(),
                stability: 1.0,
                difficulty: 5.0,
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
                // 注意：没有 postponeCount 和 rescheduleHistory
            };

            // 通过 normalizeCard 处理（会调用 migrateCard）
            const normalized = (storage as any).normalizeCard(oldCard);

            // 验证迁移结果
            expect(normalized.postponeCount).toBe(0);
            expect(normalized.rescheduleHistory).toEqual([]);
            expect(normalized.lastPostponeDate).toBeUndefined();
        });

        it('should preserve existing postponeCount and rescheduleHistory', () => {
            const existingHistory = [
                { type: 'postpone' as const, timestamp: 123456, oldDue: 100, newDue: 200 }
            ];

            const cardWithHistory: any = {
                id: 'test-card-2',
                blockId: 'block-2',
                due: Date.now(),
                stability: 1.0,
                difficulty: 5.0,
                reps: 5,
                lapses: 1,
                state: CardState.Review,
                lastReview: Date.now() - 86400000,
                elapsedDays: 1,
                scheduledDays: 7,
                priority: 30,
                type: CardType.Item,
                tags: [],
                leechCount: 0,
                isLeech: false,
                skipped: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                postponeCount: 3,
                lastPostponeDate: 123456789,
                rescheduleHistory: existingHistory,
            };

            const normalized = (storage as any).normalizeCard(cardWithHistory);

            expect(normalized.postponeCount).toBe(3);
            expect(normalized.lastPostponeDate).toBe(123456789);
            expect(normalized.rescheduleHistory).toEqual(existingHistory);
        });

        it('should handle cards with partial reschedule fields', () => {
            const partialCard: any = {
                id: 'test-card-3',
                blockId: 'block-3',
                due: Date.now(),
                stability: 1.0,
                difficulty: 5.0,
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
                postponeCount: 2, // 只有 postponeCount，没有 rescheduleHistory
            };

            const normalized = (storage as any).normalizeCard(partialCard);

            expect(normalized.postponeCount).toBe(2);
            expect(normalized.rescheduleHistory).toEqual([]);
            expect(normalized.lastPostponeDate).toBeUndefined();
        });
    });

    describe('getAllCards with migration', () => {
        it('should return migrated cards', () => {
            // 创建测试卡片（没有 reschedule 字段）
            const testCard: any = {
                id: 'card-1',
                blockId: 'block-1',
                due: Date.now(),
                stability: 1.0,
                difficulty: 5.0,
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

            // 通过 normalizeCard 处理后再设置（模拟从存储加载的流程）
            const normalized = (storage as any).normalizeCard(testCard);
            storage.setCard(normalized);

            // 获取所有卡片
            const allCards = storage.getAllCards();

            // 验证所有卡片都已迁移
            expect(allCards).toHaveLength(1);
            expect(allCards[0].postponeCount).toBe(0);
            expect(allCards[0].rescheduleHistory).toEqual([]);
        });
    });
});
