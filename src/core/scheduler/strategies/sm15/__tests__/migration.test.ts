/**
 * Scheduler Migration Tests
 *
 * 测试不同调度器之间的数据迁移功能
 *
 * Phase 3: SM-15 完整集成与迁移
 */

import { describe, it, expect } from 'vitest';
import type { FSRSCard, CardState } from '@/types';
import {
    difficultyToAFactor,
    aFactorToDifficulty,
    efToAFactor,
    aFactorToEF,
    migrateToSM15,
    migrateFromSM15,
    migrateToImprovedTopicScheduler,
    migrateCard,
} from '@/core/scheduler/strategies/sm15/migration';

// 创建测试卡片
function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
    return {
        id: 'test-card-1',
        blockId: 'block-1',
        due: Date.now() + 86400000,
        stability: 10,
        difficulty: 5,
        reps: 5,
        lapses: 0,
        state: CardState.Review,
        lastReview: Date.now() - 86400000,
        elapsedDays: 1,
        scheduledDays: 10,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now() - 86400000 * 10,
        updatedAt: Date.now(),
        ...overrides,
    };
}

describe('Type Conversion Utilities', () => {
    describe('difficultyToAFactor', () => {
        it('应该将 difficulty 1 映射到 A-Factor 1.2', () => {
            expect(difficultyToAFactor(1)).toBeCloseTo(1.2, 1);
        });

        it('应该将 difficulty 10 映射到 A-Factor 6.0', () => {
            expect(difficultyToAFactor(10)).toBeCloseTo(6.0, 1);
        });

        it('应该将 difficulty 5 映射到 A-Factor 3.6', () => {
            expect(difficultyToAFactor(5)).toBeCloseTo(3.6, 1);
        });

        it('应该限制最小值和最大值', () => {
            expect(difficultyToAFactor(0)).toBeCloseTo(1.2, 1);
            expect(difficultyToAFactor(15)).toBeCloseTo(6.0, 1);
        });
    });

    describe('aFactorToDifficulty', () => {
        it('应该将 A-Factor 1.2 映射到 difficulty 1', () => {
            expect(aFactorToDifficulty(1.2)).toBeCloseTo(1, 1);
        });

        it('应该将 A-Factor 6.0 映射到 difficulty 10', () => {
            expect(aFactorToDifficulty(6.0)).toBeCloseTo(10, 1);
        });

        it('应该将 A-Factor 3.6 映射到 difficulty 5', () => {
            expect(aFactorToDifficulty(3.6)).toBeCloseTo(5, 1);
        });

        it('应该限制最小值和最大值', () => {
            expect(aFactorToDifficulty(1.0)).toBeCloseTo(1, 1);
            expect(aFactorToDifficulty(7.0)).toBeCloseTo(10, 1);
        });
    });

    describe('efToAFactor', () => {
        it('应该将 EF 1.3 映射到 A-Factor 1.2', () => {
            expect(efToAFactor(1.3)).toBeCloseTo(1.2, 1);
        });

        it('应该将 EF 2.5 映射到 A-Factor 6.0', () => {
            expect(efToAFactor(2.5)).toBeCloseTo(6.0, 1);
        });

        it('应该将 EF 1.9 映射到 A-Factor 中段', () => {
            expect(efToAFactor(1.9)).toBeGreaterThan(2.0);
            expect(efToAFactor(1.9)).toBeLessThan(6.0);
        });
    });

    describe('aFactorToEF', () => {
        it('应该将 A-Factor 1.2 映射到 EF 1.3', () => {
            expect(aFactorToEF(1.2)).toBeCloseTo(1.3, 1);
        });

        it('应该将 A-Factor 6.0 映射到 EF 2.5', () => {
            expect(aFactorToEF(6.0)).toBeCloseTo(2.5, 1);
        });
    });

    describe('round-trip conversion', () => {
        it('FSRS difficulty → A-Factor → difficulty 应该保持一致', () => {
            const originalDifficulty = 7;
            const aFactor = difficultyToAFactor(originalDifficulty);
            const convertedDifficulty = aFactorToDifficulty(aFactor);
            expect(convertedDifficulty).toBeCloseTo(originalDifficulty, 0);
        });

        it('SM-2 EF → A-Factor → EF 应该保持一致', () => {
            const originalEF = 2.0;
            const aFactor = efToAFactor(originalEF);
            const convertedEF = aFactorToEF(aFactor);
            expect(convertedEF).toBeCloseTo(originalEF, 1);
        });
    });
});

describe('migrateToSM15', () => {
    it('应该从 FSRS 迁移到 SM-15', () => {
        const card = createTestCard({
            schedulerType: 'fsrs-v5',
            difficulty: 7,
            scheduledDays: 14,
        });

        const migrated = migrateToSM15(card);

        expect(migrated.schedulerType).toBe('sm15');
        expect(migrated.schedulerMeta?.sm15?.of).toBeCloseTo(4.4, 1); // difficulty 7 → A-Factor ~4.4
        expect(migrated.schedulerMeta?.sm15?.optimumInterval).toBe(14);
        expect(migrated.aFactor).toBeDefined();
    });

    it('应该从 SM-2 迁移到 SM-15', () => {
        const card = createTestCard({
            schedulerType: 'sm2',
            difficulty: 2.0, // EF
            scheduledDays: 10,
        });

        const migrated = migrateToSM15(card);

        expect(migrated.schedulerType).toBe('sm15');
        expect(migrated.schedulerMeta?.sm15?.of).toBeGreaterThan(2.0);
        expect(migrated.schedulerMeta?.sm15?.afs).toBeDefined();
    });

    it('应该从 A-Factor 迁移到 SM-15', () => {
        const card = createTestCard({
            schedulerType: 'a-factor',
            aFactor: 3.6,
            schedulerMeta: {
                topic: {
                    afs: [2.5, 3.0, 3.6],
                    of: 3.6,
                    optimalInterval: 7,
                },
            },
        });

        const migrated = migrateToSM15(card);

        expect(migrated.schedulerType).toBe('sm15');
        expect(migrated.schedulerMeta?.sm15?.of).toBe(3.6);
        expect(migrated.schedulerMeta?.sm15?.afs).toEqual([2.5, 3.0, 3.6]);
    });
});

describe('migrateFromSM15', () => {
    it('应该从 SM-15 迁移到 FSRS', () => {
        const card = createTestCard({
            schedulerType: 'sm15',
            aFactor: 4.4,
            schedulerMeta: {
                sm15: {
                    of: 4.4,
                    optimumInterval: 14,
                    afs: [3.0, 4.0, 4.4],
                },
            },
        });

        const migrated = migrateFromSM15(card, 'fsrs-v5');

        expect(migrated.schedulerType).toBe('fsrs-v5');
        expect(migrated.difficulty).toBeCloseTo(7, 1); // A-Factor 4.4 → difficulty ~7
        expect(migrated.schedulerMeta?.sm15).toBeUndefined();
    });

    it('应该从 SM-15 迁移到 SM-2', () => {
        const card = createTestCard({
            schedulerType: 'sm15',
            aFactor: 3.6,
            schedulerMeta: {
                sm15: {
                    of: 3.6,
                    optimumInterval: 10,
                    afs: [3.6],
                },
            },
        });

        const migrated = migrateFromSM15(card, 'sm2');

        expect(migrated.schedulerType).toBe('sm2');
        expect(migrated.difficulty).toBeGreaterThan(1.3);
        expect(migrated.difficulty).toBeLessThan(2.5);
        expect(migrated.schedulerMeta?.sm15).toBeUndefined();
    });

    it('应该从 SM-15 迁移到 A-Factor-v2', () => {
        const card = createTestCard({
            schedulerType: 'sm15',
            aFactor: 3.6,
            scheduledDays: 7,
            schedulerMeta: {
                sm15: {
                    of: 3.6,
                    optimumInterval: 7,
                    afs: [2.5, 3.0, 3.6],
                },
            },
        });

        const migrated = migrateFromSM15(card, 'a-factor-v2');

        expect(migrated.schedulerType).toBe('a-factor-v2');
        expect(migrated.aFactor).toBe(3.6);
        expect(migrated.schedulerMeta?.topic?.afs).toEqual([2.5, 3.0, 3.6]);
        expect(migrated.schedulerMeta?.sm15).toBeUndefined();
    });
});

describe('migrateToImprovedTopicScheduler', () => {
    it('应该从 A-Factor 迁移到 A-Factor-v2', () => {
        const card = createTestCard({
            schedulerType: 'a-factor',
            aFactor: 3.6,
            scheduledDays: 7,
        });

        const migrated = migrateToImprovedTopicScheduler(card);

        expect(migrated.schedulerType).toBe('a-factor-v2');
        expect(migrated.aFactor).toBe(3.6);
        expect(migrated.schedulerMeta?.topic?.afs).toEqual([3.6]);
        expect(migrated.schedulerMeta?.topic?.of).toBe(3.6);
    });

    it('应该从 FSRS 迁移到 A-Factor-v2', () => {
        const card = createTestCard({
            schedulerType: 'fsrs-v5',
            difficulty: 7,
            scheduledDays: 14,
        });

        const migrated = migrateToImprovedTopicScheduler(card);

        expect(migrated.schedulerType).toBe('a-factor-v2');
        expect(migrated.aFactor).toBeCloseTo(4.4, 1); // difficulty 7 → A-Factor ~4.4
        expect(migrated.schedulerMeta?.topic?.afs).toBeDefined();
    });

    it('应该从 SM-15 迁移到 A-Factor-v2', () => {
        const card = createTestCard({
            schedulerType: 'sm15',
            aFactor: 3.6,
            schedulerMeta: {
                sm15: {
                    of: 3.6,
                    optimumInterval: 7,
                    afs: [2.5, 3.0, 3.6],
                },
            },
        });

        const migrated = migrateToImprovedTopicScheduler(card);

        expect(migrated.schedulerType).toBe('a-factor-v2');
        expect(migrated.aFactor).toBe(3.6);
        expect(migrated.schedulerMeta?.topic?.afs).toEqual([2.5, 3.0, 3.6]);
        expect(migrated.schedulerMeta?.sm15).toBeUndefined();
    });
});

describe('migrateCard - 通用迁移', () => {
    it('相同调度器应该返回原卡片', () => {
        const card = createTestCard({
            schedulerType: 'fsrs-v5',
        });

        const migrated = migrateCard(card, 'fsrs-v5');

        expect(migrated).toBe(card);
    });

    it('应该支持 FSRS → SM-15', () => {
        const card = createTestCard({
            schedulerType: 'fsrs-v5',
            difficulty: 5,
        });

        const migrated = migrateCard(card, 'sm15');

        expect(migrated.schedulerType).toBe('sm15');
        expect(migrated.schedulerMeta?.sm15).toBeDefined();
    });

    it('应该支持 SM-15 → FSRS', () => {
        const card = createTestCard({
            schedulerType: 'sm15',
            aFactor: 3.6,
            schedulerMeta: {
                sm15: {
                    of: 3.6,
                    optimumInterval: 10,
                    afs: [3.6],
                },
            },
        });

        const migrated = migrateCard(card, 'fsrs-v5');

        expect(migrated.schedulerType).toBe('fsrs-v5');
        expect(migrated.difficulty).toBeDefined();
    });

    it('应该支持 A-Factor → A-Factor-v2', () => {
        const card = createTestCard({
            schedulerType: 'a-factor',
            aFactor: 3.6,
        });

        const migrated = migrateCard(card, 'a-factor-v2');

        expect(migrated.schedulerType).toBe('a-factor-v2');
        expect(migrated.schedulerMeta?.topic).toBeDefined();
    });

    it('不支持的迁移应该返回原卡片并警告', () => {
        const card = createTestCard({
            schedulerType: 'fsrs-v5',
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const migrated = migrateCard(card, 'sm2');

        expect(migrated).toBe(card);
        expect(warnSpy).toHaveBeenCalledWith('[Migration] Unsupported migration: fsrs-v5 → sm2');

        warnSpy.mockRestore();
    });
});
