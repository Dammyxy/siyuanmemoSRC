/**
 * Scheduler Migration Tool
 *
 * 提供不同调度器之间的数据迁移功能
 *
 * 支持的迁移：
 * - FSRS/SM-2 ↔ SM-15
 * - A-Factor → A-Factor-v2
 *
 * Phase 3: SM-15 完整集成与迁移
 */

import type { FSRSCard } from '@/types';
import type { SchedulerType } from '../../SchedulerRouter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SchedulerMigration');

// === 类型转换工具函数 ===

/**
 * FSRS difficulty (1-10) → SM-15 A-Factor (1.2-6.0)
 */
export function difficultyToAFactor(difficulty: number): number {
    // 线性映射：1-10 → 1.2-6.0
    const clampedDifficulty = Math.max(1, Math.min(10, difficulty));
    return 1.2 + ((clampedDifficulty - 1) / 9) * 4.8;
}

/**
 * SM-15 A-Factor (1.2-6.0) → FSRS difficulty (1-10)
 */
export function aFactorToDifficulty(aFactor: number): number {
    // 线性映射：1.2-6.0 → 1-10
    const clampedAF = Math.max(1.2, Math.min(6.0, aFactor));
    return 1 + ((clampedAF - 1.2) / 4.8) * 9;
}

/**
 * SM-2 EF (1.3-2.5) → SM-15 A-Factor (1.2-6.0)
 */
export function efToAFactor(ef: number): number {
    // SM-2 EF 范围较小，映射到 A-Factor 中段
    const clampedEF = Math.max(1.3, Math.min(2.5, ef));
    return 1.2 + ((clampedEF - 1.3) / 1.2) * 4.8;
}

/**
 * SM-15 A-Factor (1.2-6.0) → SM-2 EF (1.3-2.5)
 */
export function aFactorToEF(aFactor: number): number {
    const clampedAF = Math.max(1.2, Math.min(6.0, aFactor));
    return 1.3 + ((clampedAF - 1.2) / 4.8) * 1.2;
}

// === 迁移函数 ===

/**
 * 迁移到 SM-15
 *
 * 从 FSRS、SM-2 或 A-Factor 迁移到 SM-15
 *
 * @param card 原始卡片
 * @returns 迁移后的卡片
 */
export function migrateToSM15(card: FSRSCard): FSRSCard {
    const migrated = { ...card };

    // 设置调度器类型
    migrated.schedulerType = 'sm15';

    // 根据原始调度器类型进行转换
    const oldScheduler = card.schedulerType || 'fsrs-v5';

    if (oldScheduler === 'fsrs-v5' || oldScheduler === 'sm2') {
        // FSRS/SM-2 → SM-15

        // 转换难度参数
        if (oldScheduler === 'fsrs-v5') {
            // FSRS difficulty → SM-15 A-Factor
            const difficulty = card.difficulty || 5;
            const aFactor = difficultyToAFactor(difficulty);

            // 初始化 SM-15 元数据
            migrated.schedulerMeta = {
                ...card.schedulerMeta,
                sm15: {
                    of: aFactor,
                    optimumInterval: card.scheduledDays || 2,
                    afs: [aFactor],
                },
            };
        } else if (oldScheduler === 'sm2') {
            // SM-2 EF → SM-15 A-Factor
            // 注意：SM-2 使用 easeFactor 而非 difficulty
            // 这里假设 difficulty 字段存储的是 EF
            const ef = card.difficulty || 2.5;
            const aFactor = efToAFactor(ef);

            migrated.schedulerMeta = {
                ...card.schedulerMeta,
                sm15: {
                    of: aFactor,
                    optimumInterval: card.scheduledDays || 2,
                    afs: [aFactor],
                },
            };
        }

        // 保留复习历史和计划天数
        migrated.aFactor = migrated.schedulerMeta?.sm15?.of;

    } else if (oldScheduler === 'a-factor' || oldScheduler === 'a-factor-v2') {
        // A-Factor → SM-15
        const aFactor = card.aFactor || 2.5;

        migrated.schedulerMeta = {
            ...card.schedulerMeta,
            sm15: {
                of: aFactor,
                optimumInterval: card.scheduledDays || 2,
                afs: card.schedulerMeta?.topic?.afs || [aFactor],
            },
        };

        migrated.aFactor = aFactor;
    }

    return migrated;
}

/**
 * 从 SM-15 迁移到其他调度器
 *
 * @param card SM-15 卡片
 * @param target 目标调度器类型
 * @returns 迁移后的卡片
 */
export function migrateFromSM15(card: FSRSCard, target: 'fsrs-v5' | 'sm2' | 'a-factor' | 'a-factor-v2'): FSRSCard {
    const migrated = { ...card };

    // 设置调度器类型
    migrated.schedulerType = target;

    // 从 SM-15 元数据中获取 A-Factor
    const aFactor = card.schedulerMeta?.sm15?.of || card.aFactor || 2.5;

    if (target === 'fsrs-v5') {
        // SM-15 → FSRS
        migrated.difficulty = aFactorToDifficulty(aFactor);
        migrated.stability = card.scheduledDays || 2;

        // 清除 SM-15 元数据
        migrated.schedulerMeta = {
            ...card.schedulerMeta,
            sm15: undefined,
        };

    } else if (target === 'sm2') {
        // SM-15 → SM-2
        migrated.difficulty = aFactorToEF(aFactor);

        // 清除 SM-15 元数据
        migrated.schedulerMeta = {
            ...card.schedulerMeta,
            sm15: undefined,
        };

    } else if (target === 'a-factor' || target === 'a-factor-v2') {
        // SM-15 → A-Factor / A-Factor-v2
        migrated.aFactor = aFactor;

        // 保留 A-Factor 历史
        const afs = card.schedulerMeta?.sm15?.afs || [aFactor];

        if (target === 'a-factor-v2') {
            // A-Factor-v2: 保留历史到 topic 元数据
            migrated.schedulerMeta = {
                ...card.schedulerMeta,
                topic: {
                    afs,
                    of: aFactor,
                    optimalInterval: card.scheduledDays || 2,
                },
                sm15: undefined,
            };
        } else {
            // A-Factor: 清除所有元数据
            migrated.schedulerMeta = {
                ...card.schedulerMeta,
                sm15: undefined,
                topic: undefined,
            };
        }
    }

    return migrated;
}

/**
 * 迁移到 A-Factor-v2 (ImprovedTopicScheduler)
 *
 * 从原始 A-Factor 或其他调度器迁移到 A-Factor-v2
 *
 * @param card 原始卡片
 * @returns 迁移后的卡片
 */
export function migrateToImprovedTopicScheduler(card: FSRSCard): FSRSCard {
    const migrated = { ...card };

    // 设置调度器类型
    migrated.schedulerType = 'a-factor-v2';

    const oldScheduler = card.schedulerType || 'fsrs-v5';

    if (oldScheduler === 'a-factor') {
        // A-Factor → A-Factor-v2
        const aFactor = card.aFactor || 2.5;

        migrated.schedulerMeta = {
            ...card.schedulerMeta,
            topic: {
                afs: [aFactor], // 初始化历史
                of: aFactor,
                optimalInterval: card.scheduledDays || 2,
            },
        };

    } else if (oldScheduler === 'fsrs-v5' || oldScheduler === 'sm2') {
        // FSRS/SM-2 → A-Factor-v2
        let aFactor: number;

        if (oldScheduler === 'fsrs-v5') {
            aFactor = difficultyToAFactor(card.difficulty || 5);
        } else {
            aFactor = efToAFactor(card.difficulty || 2.5);
        }

        migrated.aFactor = aFactor;
        migrated.schedulerMeta = {
            ...card.schedulerMeta,
            topic: {
                afs: [aFactor],
                of: aFactor,
                optimalInterval: card.scheduledDays || 2,
            },
        };

    } else if (oldScheduler === 'sm15') {
        // SM-15 → A-Factor-v2
        const aFactor = card.schedulerMeta?.sm15?.of || card.aFactor || 2.5;
        const afs = card.schedulerMeta?.sm15?.afs || [aFactor];

        migrated.aFactor = aFactor;
        migrated.schedulerMeta = {
            ...card.schedulerMeta,
            topic: {
                afs,
                of: aFactor,
                optimalInterval: card.schedulerMeta?.sm15?.optimumInterval || card.scheduledDays || 2,
            },
            sm15: undefined, // 清除 SM-15 元数据
        };
    }

    return migrated;
}

/**
 * 通用迁移函数
 *
 * 根据目标调度器类型自动选择迁移策略
 *
 * @param card 原始卡片
 * @param targetScheduler 目标调度器类型
 * @returns 迁移后的卡片
 */
export function migrateCard(
    card: FSRSCard,
    targetScheduler: SchedulerType
): FSRSCard {
    const currentScheduler = card.schedulerType || 'fsrs-v5';

    // 相同调度器，无需迁移
    if (currentScheduler === targetScheduler) {
        return card;
    }

    // 迁移到 SM-15
    if (targetScheduler === 'sm15') {
        return migrateToSM15(card);
    }

    // 从 SM-15 迁移到其他调度器
    if (currentScheduler === 'sm15') {
        if (targetScheduler === 'fsrs-v5') {
            return migrateFromSM15(card, 'fsrs-v5');
        } else if (targetScheduler === 'sm2') {
            return migrateFromSM15(card, 'sm2');
        } else if (targetScheduler === 'a-factor') {
            return migrateFromSM15(card, 'a-factor');
        } else if (targetScheduler === 'a-factor-v2') {
            return migrateFromSM15(card, 'a-factor-v2');
        }
    }

    // 迁移到 A-Factor-v2
    if (targetScheduler === 'a-factor-v2') {
        return migrateToImprovedTopicScheduler(card);
    }

    // 其他迁移（FSRS ↔ SM-2）暂时不支持，保持原样
    logger.warn(`Unsupported migration: ${currentScheduler} -> ${targetScheduler}`);
    return card;
}
