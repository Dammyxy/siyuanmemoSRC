import type { FSRSCard, FSRSParameters, Rating } from '@/types';

/**
 * 调度器适配器接口
 * 所有调度算法需实现此接口
 */
export interface SchedulerEngineAdapter {
    updateParams(params: FSRSParameters): void;
    preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard>;
    review(card: FSRSCard, rating: Rating, now?: Date): FSRSCard;
    getRetrievability(card: FSRSCard, now?: Date): number;
}
