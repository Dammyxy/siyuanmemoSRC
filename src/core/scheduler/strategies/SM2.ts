import {
    type FSRSCard,
    type FSRSParameters,
    CardState,
    Rating,
} from '@/types';
import type { SchedulerEngineAdapter } from '../types';

/**
 * SM-2 调度器
 * 经典的间隔重复算法
 */
export class SM2Scheduler implements SchedulerEngineAdapter {
    private params: FSRSParameters;

    constructor(params: FSRSParameters) {
        this.params = params;
    }

    updateParams(params: FSRSParameters): void {
        this.params = params;
    }

    preview(card: FSRSCard, now: Date = new Date()): Map<Rating, FSRSCard> {
        const result = new Map<Rating, FSRSCard>();
        for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
            result.set(rating, this.calculateNext(card, rating, now));
        }
        return result;
    }

    review(card: FSRSCard, rating: Rating, now: Date = new Date()): FSRSCard {
        return this.calculateNext(card, rating, now);
    }

    getRetrievability(card: FSRSCard, now: Date = new Date()): number {
        // SM-2 算法本身不直接计算可提取性/回忆概率
        // 这里可以使用一个简单的指数衰减模型来近似，或者直接返回 0 (如果是新卡)
        if (card.state === CardState.New) return 0;
        const elapsedDays = (now.getTime() - card.lastReview) / (1000 * 60 * 60 * 24);
        // 简单的近似：假设间隔期末 R=0.9
        const scheduledDays = card.scheduledDays || 1;
        const r = Math.pow(0.9, elapsedDays / scheduledDays);
        return Math.max(0, Math.min(1, r));
    }

    private calculateNext(card: FSRSCard, rating: Rating, now: Date): FSRSCard {
        // 初始化或获取当前状态
        // FSRSCard 中: stability 对应 SM-2 的 Interval (I), difficulty 对应 SM-2 的 Factor (EF)
        // 注意：FSRS difficulty (1-10) 与 SM-2 EF (1.3-2.5) 范围不同，需要转换或复用字段
        // 这里复用 card.stability 存储上一次的 Interval，复用 card.difficulty 存储 EF * 10 (保持精度)

        const nowMs = now.getTime();
        const isNew = card.state === CardState.New;

        let interval = isNew ? 0 : (card.scheduledDays || 0); // 上一次间隔
        let ef = isNew ? 2.5 : (card.difficulty / 100); // 恢复 EF，假设存储时乘了 100
        if (isNew) ef = 2.5; // 默认 EF
        if (ef < 1.3) ef = 1.3;

        let reps = card.reps;
        let lapses = card.lapses;

        // Rating 映射:
        // FSRS: 1=Again, 2=Hard, 3=Good, 4=Easy
        // SM-2: 0-2=Fail (Again), 3=Hard, 4=Good, 5=Easy
        // 这里做个近似映射
        let sm2Quality = 0;
        if (rating === Rating.Again) sm2Quality = 2; // Fail
        if (rating === Rating.Hard) sm2Quality = 3;
        if (rating === Rating.Good) sm2Quality = 4;
        if (rating === Rating.Easy) sm2Quality = 5;

        if (sm2Quality >= 3) {
            // Correct response
            if (reps === 0) {
                interval = 1;
            } else if (reps === 1) {
                interval = 6;
            } else {
                interval = Math.round(interval * ef);
            }
            reps++;
        } else {
            // Incorrect response
            reps = 0;
            interval = 1;
            lapses++;
        }

        // 更新 EF
        // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        const q = sm2Quality;
        ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        if (ef < 1.3) ef = 1.3;

        // 限制最大间隔
        const clampedInterval = Math.min(interval, this.params.maximumInterval);
        const dueMs = nowMs + clampedInterval * 24 * 60 * 60 * 1000;

        // 映射回 FSRSCard 结构
        // stability 用来暂存下一次 interval，以便下次计算使用
        // difficulty 用来存储 EF * 100
        const newDifficulty = Math.round(ef * 100);

        // 状态转换
        const newState = rating === Rating.Again ? CardState.Relearning : CardState.Review;

        return {
            ...card,
            due: dueMs,
            stability: interval, // SM-2 下，stability 字段仅用于存储 interval I(n)
            difficulty: newDifficulty, // 存储 EF
            elapsedDays: Math.round((nowMs - card.lastReview) / (1000 * 60 * 60 * 24)),
            scheduledDays: clampedInterval,
            reps: reps,
            lapses: lapses,
            state: newState,
            lastReview: nowMs,
            updatedAt: nowMs,
        }
    }
}
