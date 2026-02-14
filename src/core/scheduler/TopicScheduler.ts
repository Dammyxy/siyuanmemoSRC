/**
 * Topic 调度器（A-Factor 算法）
 *
 * 基于 SuperMemo 的 A-Factor 算法：
 * - newInterval = oldInterval * A-Factor
 * - 首次复习间隔：2 天
 * - 状态：仅 New 和 Learning
 * - A-Factor 范围：1.2 - 6.0
 */

import type { FSRSCard, CardState, Rating } from '@/types';
import type { IScheduler } from '@/core/queue/abstraction';

/**
 * Topic 调度器
 *
 * 与 FSRS 调度器不同，Topic 调度器使用更简单的 A-Factor 算法：
 * - 不计算稳定性（stability）
 * - 不计算难度（difficulty）
 * - 间隔 = 间隔 * A-Factor
 * - 首次复习固定为 2 天
 */
export class TopicScheduler implements IScheduler<FSRSCard, Rating> {
    /**
     * 调度 Topic 卡片
     *
     * @param card 卡片
     * @param rating 评分（1=重来, 2=困难, 3=一般, 4=简单）
     * @returns 更新后的卡片
     */
    async schedule(card: FSRSCard, rating: Rating): Promise<FSRSCard> {
        const now = Date.now();
        const aFactor = card.aFactor ?? 1.2;

        // 首次复习
        if (card.state === 0 /* CardState.New */) {
            return {
                ...card,
                state: 1 /* CardState.Learning */,
                due: now + 2 * 24 * 60 * 60 * 1000, // 2 天
                lastReview: now,
                interval: 2,
                scheduledDays: 2,
                elapsedDays: 0,
            };
        }

        // 后续复习：newInterval = oldInterval * A-Factor
        const oldInterval = card.interval ?? 2;
        let newInterval = Math.round(oldInterval * aFactor);

        // 根据评分调整间隔
        if (rating === 1 /* Rating.Again */) {
            // 完全忘记：重置为 2 天
            newInterval = 2;
        } else if (rating === 2 /* Rating.Hard */) {
            // 困难：减少 25%
            newInterval = Math.max(2, Math.round(newInterval * 0.75));
        } else if (rating === 4 /* Rating.Easy */) {
            // 简单：增加 25%
            newInterval = Math.round(newInterval * 1.25);
        }

        // 限制最小间隔
        newInterval = Math.max(2, newInterval);

        return {
            ...card,
            due: now + newInterval * 24 * 60 * 60 * 1000,
            lastReview: now,
            interval: newInterval,
            scheduledDays: newInterval,
            elapsedDays: Math.round((now - card.lastReview) / (1000 * 60 * 60 * 24)),
            reps: card.reps + 1,
        };
    }
}
