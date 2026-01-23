import {
    type FSRSCard,
    type FSRSParameters,
    CardState,
    Rating,
} from '@/types';
import type { SchedulerEngineAdapter } from '../types';

/**
 * FSRS-5 默认权重参数 (19个)
 */
const DEFAULT_WEIGHTS = [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395,
    0.11, 0.29605, 2.2698, 0.2315,
    2.9898, 0.51655, 0.6621
];

/**
 * 简化的 FSRS 调度器
 * 基于 FSRS-5 算法的核心公式
 */
export class SimpleFSRSScheduler implements SchedulerEngineAdapter {
    private params: FSRSParameters;

    constructor(params: FSRSParameters) {
        this.params = params;
    }

    updateParams(params: FSRSParameters): void {
        this.params = params;
    }

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
     * 对卡片进行评分，返回更新后的卡片
     */
    review(card: FSRSCard, rating: Rating, now: Date = new Date()): FSRSCard {
        return this.calculateNext(card, rating, now);
    }

    /**
     * 获取卡片当前的可提取性（回忆概率）
     */
    getRetrievability(card: FSRSCard, now: Date = new Date()): number {
        if (card.state === CardState.New || card.stability <= 0) {
            return 0;
        }
        const elapsedDays = (now.getTime() - card.lastReview) / (1000 * 60 * 60 * 24);
        return this.forgettingCurve(elapsedDays, card.stability);
    }

    /**
     * 遗忘曲线公式
     * R(t) = (1 + t / (9 * S))^(-1)
     */
    private forgettingCurve(elapsedDays: number, stability: number): number {
        if (stability <= 0) return 0;
        return Math.pow(1 + elapsedDays / (9 * stability), -1);
    }

    /**
     * 计算下次复习状态
     */
    private calculateNext(card: FSRSCard, rating: Rating, now: Date): FSRSCard {
        const w = this.params.weights?.length === 19 ? this.params.weights : DEFAULT_WEIGHTS;
        const isNew = card.state === CardState.New;
        const nowMs = now.getTime();

        let newState: CardState;
        let newStability: number;
        let newDifficulty: number;
        let newLapses = card.lapses;
        let newReps = card.reps + 1;

        if (isNew) {
            // 新卡片初始化
            newDifficulty = this.initDifficulty(rating, w);
            newStability = this.initStability(rating, w);
            newState = rating === Rating.Again ? CardState.Learning : CardState.Review;
            if (rating === Rating.Again) newLapses++;
        } else {
            // 已有卡片更新
            const elapsedDays = Math.max(0, (nowMs - card.lastReview) / (1000 * 60 * 60 * 24));
            const retrievability = this.forgettingCurve(elapsedDays, card.stability);

            newDifficulty = this.updateDifficulty(card.difficulty, rating, w);

            if (rating === Rating.Again) {
                // 遗忘 - 稳定性衰减
                newStability = this.forgetStability(card.difficulty, card.stability, retrievability, w);
                newState = CardState.Relearning;
                newLapses++;
            } else {
                // 记住 - 稳定性增长
                newStability = this.recallStability(card.difficulty, card.stability, retrievability, rating, w);
                newState = CardState.Review;
            }
        }

        // 计算下次复习间隔
        const interval = this.nextInterval(newStability);
        const clampedInterval = Math.min(interval, this.params.maximumInterval);
        const dueMs = nowMs + clampedInterval * 24 * 60 * 60 * 1000;

        // 添加模糊化
        const fuzzedDue = this.params.enableFuzz ? this.addFuzz(dueMs, clampedInterval) : dueMs;

        return {
            ...card,
            due: fuzzedDue,
            stability: newStability,
            difficulty: Math.max(1, Math.min(10, newDifficulty)),
            elapsedDays: Math.round((nowMs - card.lastReview) / (1000 * 60 * 60 * 24)),
            scheduledDays: Math.round(clampedInterval),
            reps: newReps,
            lapses: newLapses,
            state: newState,
            lastReview: nowMs,
            updatedAt: nowMs,
        };
    }

    /** 初始难度 D0(G) */
    private initDifficulty(rating: Rating, w: number[]): number {
        return w[4] - Math.exp(w[5] * (rating - 1)) + 1;
    }

    /** 初始稳定性 S0(G) */
    private initStability(rating: Rating, w: number[]): number {
        return w[rating - 1];
    }

    /** 更新难度 */
    private updateDifficulty(d: number, rating: Rating, w: number[]): number {
        const delta = -(w[6] * (rating - 3));
        return d + delta * (10 - d) / 9;
    }

    /** 遗忘后稳定性 */
    private forgetStability(d: number, s: number, r: number, w: number[]): number {
        return w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
    }

    /** 回忆后稳定性 */
    private recallStability(d: number, s: number, r: number, rating: Rating, w: number[]): number {
        const hardPenalty = rating === Rating.Hard ? w[15] : 1;
        const easyBonus = rating === Rating.Easy ? w[16] : 1;
        return s * (
            Math.exp(w[8]) *
            (11 - d) *
            Math.pow(s, -w[9]) *
            (Math.exp((1 - r) * w[10]) - 1) *
            hardPenalty *
            easyBonus + 1
        );
    }

    /** 计算下次复习间隔 */
    private nextInterval(stability: number): number {
        const requestRetention = this.params.requestRetention;
        return (stability / 9) * (Math.pow(requestRetention, -1) - 1);
    }

    /** 添加模糊化 */
    private addFuzz(dueMs: number, intervalDays: number): number {
        if (intervalDays < 2.5) return dueMs;
        const fuzzRange = Math.min(intervalDays * 0.05, 2);
        const fuzz = (Math.random() - 0.5) * 2 * fuzzRange;
        return dueMs + fuzz * 24 * 60 * 60 * 1000;
    }
}
