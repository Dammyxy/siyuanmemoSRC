/**
 * ImprovedTopicScheduler - 改进的 Topic 调度器
 *
 * 基于 SuperMemo A-Factor 算法，支持动态 A-Factor 更新
 *
 * 核心改进：
 * - 动态 A-Factor：根据复习表现更新 A-Factor
 * - A-Factor 历史：保存最近 30 个值
 * - 加权平均：最近的复习权重更大
 * - 保留学习进度：Again 评分时不完全重置
 *
 * Phase 2c: ImprovedTopicScheduler Implementation
 */

import {
    type FSRSCard,
    type FSRSParameters,
    CardState,
    Rating,
} from '@/types';
import type { SchedulerEngineAdapter } from '../types';

// A-Factor 范围常量
const AF_MIN = 1.2;
const AF_MAX = 6.0;
const AF_STEP = 0.3;
const AF_HISTORY_SIZE = 30;

// 初始间隔（天）
const INITIAL_INTERVALS: Record<Rating, number> = {
    [Rating.Again]: 1,
    [Rating.Hard]: 1,
    [Rating.Good]: 2,
    [Rating.Easy]: 3,
};

/**
 * 改进的 Topic 调度器
 *
 * 实现动态 A-Factor 更新的调度算法
 */
export class ImprovedTopicScheduler implements SchedulerEngineAdapter {
    constructor(_params: FSRSParameters) {}

    updateParams(_params: FSRSParameters): void {}

    /**
     * 预览所有评分选项的结果
     */
    preview(card: FSRSCard, now: Date = new Date()): Map<Rating, FSRSCard> {
        const result = new Map<Rating, FSRSCard>();
        for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
            result.set(rating, this.calculateNext(card, rating, now));
        }
        return result;
    }

    /**
     * 对卡片进行评分
     */
    review(card: FSRSCard, rating: Rating, now: Date = new Date()): FSRSCard {
        return this.calculateNext(card, rating, now);
    }

    /**
     * 获取可提取性（回忆概率）
     *
     * Topic 卡片不使用可提取性概念，返回 0
     */
    getRetrievability(_card: FSRSCard, _now?: Date): number {
        return 0; // Topic 卡片不使用可提取性
    }

    /**
     * 计算下次复习状态
     */
    private calculateNext(card: FSRSCard, rating: Rating, now: Date): FSRSCard {
        const isNew = card.state === CardState.New;
        const nowMs = now.getTime();

        if (isNew) {
            return this._handleFirstReview(card, rating, nowMs);
        }

        return this._handleSubsequentReview(card, rating, nowMs);
    }

    /**
     * 处理首次复习
     */
    private _handleFirstReview(card: FSRSCard, rating: Rating, nowMs: number): FSRSCard {
        const interval = INITIAL_INTERVALS[rating];
        const dueMs = nowMs + interval * 24 * 60 * 60 * 1000;

        // 初始化 A-Factor（默认 2.5）
        const aFactor = card.aFactor ?? 2.5;
        const history: number[] = [aFactor];

        return {
            ...card,
            state: CardState.Review,
            due: dueMs,
            lastReview: nowMs,
            scheduledDays: interval,
            elapsedDays: 0,
            reps: 1,
            lapses: rating === Rating.Again ? 1 : 0,
            aFactor,
            schedulerMeta: {
                ...card.schedulerMeta,
                topic: {
                    afs: history,
                    of: aFactor,
                    optimalInterval: interval,
                },
            },
            updatedAt: nowMs,
        };
    }

    /**
     * 处理后续复习
     */
    private _handleSubsequentReview(card: FSRSCard, rating: Rating, nowMs: number): FSRSCard {
        const aFactor = card.aFactor ?? 2.5;
        const oldInterval = card.scheduledDays ?? 2;

        // 计算新间隔
        let newInterval = Math.round(oldInterval * aFactor);

        // 根据评分调整间隔
        if (rating === Rating.Again) {
            // 遗忘：重置为 1 天，但保留 A-Factor 历史
            newInterval = 1;
        } else if (rating === Rating.Hard) {
            // 困难：减少 25%
            newInterval = Math.max(1, Math.round(newInterval * 0.75));
        } else if (rating === Rating.Easy) {
            // 简单：增加 25%
            newInterval = Math.round(newInterval * 1.25);
        }

        // 限制最小间隔
        newInterval = Math.max(1, newInterval);

        // 更新 A-Factor（仅在非 Again 评分时）
        let newAFactor = aFactor;
        if (rating !== Rating.Again) {
            newAFactor = this._updateAFactor(card, rating, newInterval, nowMs);
        }

        const dueMs = nowMs + newInterval * 24 * 60 * 60 * 1000;
        const elapsedDays = Math.round((nowMs - card.lastReview) / (1000 * 60 * 60 * 24));

        return {
            ...card,
            due: dueMs,
            lastReview: nowMs,
            scheduledDays: newInterval,
            elapsedDays,
            reps: card.reps + 1,
            lapses: rating === Rating.Again ? card.lapses + 1 : card.lapses,
            aFactor: newAFactor,
            schedulerMeta: {
                ...card.schedulerMeta,
                topic: {
                    afs: this._getAFactorHistory(card, newAFactor),
                    of: newAFactor,
                    optimalInterval: newInterval,
                },
            },
            updatedAt: nowMs,
        };
    }

    /**
     * 更新 A-Factor（根据复习表现）
     *
     * 核心算法：
     * 1. 计算使用因子（UF）- 实际间隔 / 预期间隔
     * 2. 更新 A-Factor 历史
     * 3. 使用加权平均计算新 A-Factor
     * 4. 量化到 1.2-6.0（步长 0.3）
     */
    private _updateAFactor(card: FSRSCard, rating: Rating, _newInterval: number, nowMs: number): number {
        const aFactor = card.aFactor ?? 2.5;
        const history = this._getAFactorHistory(card);

        // 计算使用因子（UF）
        const uf = this._calculateUF(card, nowMs);

        // 根据评分调整 UF
        let adjustedUF = uf;
        if (rating === Rating.Hard) {
            // 困难：降低 UF
            adjustedUF = Math.max(0.5, uf * 0.8);
        } else if (rating === Rating.Easy) {
            // 简单：提高 UF
            adjustedUF = Math.min(2.0, uf * 1.2);
        }

        // 计算新的 A-Factor
        const newAFactorRaw = aFactor * adjustedUF;

        // 添加到历史并计算加权平均
        history.push(newAFactorRaw);
        const weightedAvg = this._weightedAverageAF(history);

        // 量化到 1.2-6.0（步长 0.3）
        return this._quantizeAF(weightedAvg);
    }

    /**
     * 计算使用因子（Usage Factor）
     *
     * UF = 实际间隔 / 预期间隔
     *
     * - UF > 1：用户能承受更长间隔（A-Factor 应增加）
     * - UF < 1：用户需要更短间隔（A-Factor 应减少）
     */
    private _calculateUF(card: FSRSCard, nowMs: number): number {
        const aFactor = card.aFactor ?? 2.5;
        const lastInterval = card.scheduledDays ?? 2;
        const elapsedDays = Math.max(1, Math.round((nowMs - card.lastReview) / (1000 * 60 * 60 * 24)));

        // 预期间隔 = 上次间隔 * A-Factor
        const expectedInterval = lastInterval * aFactor;

        // 使用因子 = 实际间隔 / 预期间隔
        // 限制在 [0.5, 2.0] 范围内
        const uf = Math.max(0.5, Math.min(2.0, elapsedDays / expectedInterval));

        return uf;
    }

    /**
     * 加权平均 A-Factor 历史
     *
     * 最近的复习权重更大（指数衰减）
     */
    private _weightedAverageAF(history: number[]): number {
        if (history.length === 0) return 2.5;
        if (history.length === 1) return history[0];

        let weightedSum = 0;
        let weightSum = 0;

        // 从最新到最旧，权重指数衰减
        for (let i = 0; i < history.length; i++) {
            const index = history.length - 1 - i; // 从最新的开始
            const weight = Math.pow(0.9, i); // 指数衰减权重
            weightedSum += history[index] * weight;
            weightSum += weight;
        }

        return weightedSum / weightSum;
    }

    /**
     * 量化 A-Factor 到 1.2-6.0（步长 0.3）
     *
     * 可能的值：1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0, ..., 6.0
     */
    private _quantizeAF(af: number): number {
        // 限制在 [1.2, 6.0] 范围内
        const clamped = Math.max(AF_MIN, Math.min(AF_MAX, af));

        // 量化到步长 0.3
        const quantized = Math.round((clamped - AF_MIN) / AF_STEP) * AF_STEP + AF_MIN;

        // 四舍五入到 1 位小数
        return Math.round(quantized * 10) / 10;
    }

    /**
     * 获取 A-Factor 历史（最多保留 30 个）
     */
    private _getAFactorHistory(card: FSRSCard, newAF?: number): number[] {
        const existing = card.schedulerMeta?.topic?.afs ?? [];

        if (newAF !== undefined) {
            const updated = [...existing, newAF];
            // 最多保留 30 个
            return updated.slice(-AF_HISTORY_SIZE);
        }

        return existing.slice(-AF_HISTORY_SIZE);
    }
}
