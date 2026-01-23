/**
 * Review Log Types
 * 复习日志数据结构
 */

import type { CardState, Rating } from './card';

/** 单条复习记录 */
export interface ReviewLog {
    id: string;           // 日志唯一 ID
    cardId: string;       // 卡片 ID

    // FSRS 标准字段
    rating: Rating;       // 用户评分 1-4
    state: CardState;     // 复习时的卡片状态
    scheduledDays: number; // 预定的间隔天数
    elapsedDays: number;  // 实际经过天数
    review: number;       // 复习时间戳 (ms)

    // 扩展字段
    reviewTime?: number;  // 复习耗时（秒）
    isDrill?: boolean;    // 是否为机械练习（不计入调度）

    // 用于参数优化
    stability: number;    // 复习时的稳定性
    difficulty: number;   // 复习时的难度
}

/** 创建复习日志 */
export function createReviewLog(
    cardId: string,
    rating: Rating,
    state: CardState,
    stability: number,
    difficulty: number,
    scheduledDays: number,
    elapsedDays: number,
    reviewTime?: number,
    isDrill?: boolean
): ReviewLog {
    return {
        id: generateLogId(),
        cardId,
        rating,
        state,
        scheduledDays,
        elapsedDays,
        review: Date.now(),
        reviewTime,
        isDrill: isDrill || false,
        stability,
        difficulty,
    };
}

/** 生成日志 ID */
function generateLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
