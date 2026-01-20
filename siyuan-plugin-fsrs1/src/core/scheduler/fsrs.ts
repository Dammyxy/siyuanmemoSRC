/**
 * FSRS Scheduler
 * 封装 ts-fsrs 库，提供统一的调度接口
 */

import {
    type Card as TsFsrsCard,
    type FSRSParameters as TsFsrsParams,
    type Grade,
    type RecordLog,
    FSRS,
    createEmptyCard,
    Rating as TsRating,
    State,
} from 'ts-fsrs';

import {
    type FSRSCard,
    type FSRSParameters,
    CardState,
    Rating,
} from '@/types';

/**
 * FSRS 调度器类
 * 封装 ts-fsrs，提供与插件数据结构兼容的接口
 */
export class FSRSScheduler {
    private fsrs: FSRS;
    private params: FSRSParameters;

    constructor(params: FSRSParameters) {
        this.params = params;
        this.fsrs = new FSRS({
            request_retention: params.requestRetention,
            maximum_interval: params.maximumInterval,
            w: params.weights,
            enable_fuzz: params.enableFuzz,
            enable_short_term: params.enableShortTerm,
        });
    }

    /**
     * 更新参数
     */
    updateParams(params: FSRSParameters): void {
        this.params = params;
        this.fsrs = new FSRS({
            request_retention: params.requestRetention,
            maximum_interval: params.maximumInterval,
            w: params.weights,
            enable_fuzz: params.enableFuzz,
            enable_short_term: params.enableShortTerm,
        });
    }

    /**
     * 预览所有评分选项的结果
     */
    preview(card: FSRSCard, now: Date = new Date()): Map<Rating, FSRSCard> {
        const tsCard = this.toTsCard(card);
        const recordLog = this.fsrs.repeat(tsCard, now);

        const result = new Map<Rating, FSRSCard>();

        for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
            const tsRating = this.toTsRating(rating);
            const scheduled = recordLog[tsRating];
            if (scheduled) {
                result.set(rating, this.fromTsCard(scheduled.card, card));
            }
        }

        return result;
    }

    /**
     * 对卡片进行评分，返回更新后的卡片
     */
    review(card: FSRSCard, rating: Rating, now: Date = new Date()): FSRSCard {
        const tsCard = this.toTsCard(card);
        const tsRating = this.toTsRating(rating);
        const recordLog = this.fsrs.repeat(tsCard, now);
        const scheduled = recordLog[tsRating];

        if (!scheduled) {
            throw new Error(`No schedule found for rating ${rating}`);
        }

        return this.fromTsCard(scheduled.card, card);
    }

    /**
     * 获取卡片当前的可提取性（回忆概率）
     */
    getRetrievability(card: FSRSCard, now: Date = new Date()): number {
        if (card.state === CardState.New) {
            return 0;
        }

        const elapsedDays = (now.getTime() - card.lastReview) / (1000 * 60 * 60 * 24);
        return this.fsrs.forgetting_curve(elapsedDays, card.stability);
    }

    /**
     * 转换为 ts-fsrs 的 Card 格式
     */
    private toTsCard(card: FSRSCard): TsFsrsCard {
        if (card.state === CardState.New) {
            return createEmptyCard(new Date(card.due));
        }

        return {
            due: new Date(card.due),
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: card.elapsedDays,
            scheduled_days: card.scheduledDays,
            reps: card.reps,
            lapses: card.lapses,
            state: this.toTsState(card.state),
            last_review: card.lastReview ? new Date(card.lastReview) : undefined,
        };
    }

    /**
     * 从 ts-fsrs 的 Card 转换回 FSRSCard
     */
    private fromTsCard(tsCard: TsFsrsCard, original: FSRSCard): FSRSCard {
        return {
            ...original,
            due: tsCard.due.getTime(),
            stability: tsCard.stability,
            difficulty: tsCard.difficulty,
            elapsedDays: tsCard.elapsed_days,
            scheduledDays: tsCard.scheduled_days,
            reps: tsCard.reps,
            lapses: tsCard.lapses,
            state: this.fromTsState(tsCard.state),
            lastReview: tsCard.last_review?.getTime() || Date.now(),
            updatedAt: Date.now(),
        };
    }

    private toTsRating(rating: Rating): Grade {
        switch (rating) {
            case Rating.Again: return TsRating.Again;
            case Rating.Hard: return TsRating.Hard;
            case Rating.Good: return TsRating.Good;
            case Rating.Easy: return TsRating.Easy;
        }
    }

    private toTsState(state: CardState): State {
        switch (state) {
            case CardState.New: return State.New;
            case CardState.Learning: return State.Learning;
            case CardState.Review: return State.Review;
            case CardState.Relearning: return State.Relearning;
        }
    }

    private fromTsState(state: State): CardState {
        switch (state) {
            case State.New: return CardState.New;
            case State.Learning: return CardState.Learning;
            case State.Review: return CardState.Review;
            case State.Relearning: return CardState.Relearning;
        }
    }
}

/** 创建默认调度器 */
export function createDefaultScheduler(params: FSRSParameters): FSRSScheduler {
    return new FSRSScheduler(params);
}
