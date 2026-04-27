/**
 * Review Log Types
 * 复习日志数据结构
 */

import type { CardState, CardType, FSRSCard, Rating } from './card';

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

export type ReviewLogV2QueueMode =
    | 'formal'
    | 'filtered-preview'
    | 'filtered-rescheduling'
    | 'drill'
    | 'rotation';

export type ReviewLogV2CommitPolicy = 'write-schedule' | 'preview-only' | 'drill-only';

export interface ReviewLogV2CardSnapshot {
    id: string;
    due: number;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: CardState;
    lastReview: number;
    elapsedDays: number;
    scheduledDays: number;
    learning_step?: number;
    priority: number;
    type: CardType;
    schedulerType?: FSRSCard['schedulerType'];
    aFactor?: number;
}

/** SRS v2 append-only 复习日志 */
export interface ReviewLogV2 {
    schemaVersion: 2;
    id: string;
    attemptId: string;
    cardId: string;
    rating: Rating;
    reviewedAt: number;
    elapsedMs?: number;
    queueType?: string;
    queueMode: ReviewLogV2QueueMode | string;
    source?: string;
    algorithm: string;
    schedulerType: string;
    commitPolicy: ReviewLogV2CommitPolicy | string;
    before: ReviewLogV2CardSnapshot;
    after: ReviewLogV2CardSnapshot | null;
    isDrill: boolean;
    isFiltered: boolean;
    customStudy: boolean;
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

export function createReviewLogV2Snapshot(card: FSRSCard): ReviewLogV2CardSnapshot {
    return {
        id: card.id,
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        lastReview: card.lastReview,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        learning_step: card.learning_step,
        priority: card.priority,
        type: card.type,
        schedulerType: card.schedulerType,
        aFactor: card.aFactor,
    };
}

export function createReviewLogV2(input: {
    attemptId: string;
    cardId: string;
    rating: Rating;
    reviewedAt: number;
    before: FSRSCard;
    after: FSRSCard | null;
    elapsedMs?: number;
    queueType?: string;
    queueMode: ReviewLogV2QueueMode | string;
    source?: string;
    algorithm: string;
    schedulerType: string;
    commitPolicy: ReviewLogV2CommitPolicy | string;
    isDrill: boolean;
    isFiltered: boolean;
    customStudy: boolean;
}): ReviewLogV2 {
    return {
        schemaVersion: 2,
        id: generateReviewLogV2Id(input),
        attemptId: input.attemptId,
        cardId: input.cardId,
        rating: input.rating,
        reviewedAt: input.reviewedAt,
        elapsedMs: input.elapsedMs,
        queueType: input.queueType,
        queueMode: input.queueMode,
        source: input.source,
        algorithm: input.algorithm,
        schedulerType: input.schedulerType,
        commitPolicy: input.commitPolicy,
        before: createReviewLogV2Snapshot(input.before),
        after: input.after ? createReviewLogV2Snapshot(input.after) : null,
        isDrill: input.isDrill,
        isFiltered: input.isFiltered,
        customStudy: input.customStudy,
    };
}

/** 生成日志 ID */
function generateLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateReviewLogV2Id(input: {
    attemptId: string;
    cardId: string;
    rating: Rating;
    reviewedAt: number;
    queueType?: string;
}): string {
    const queueType = input.queueType ? input.queueType.replace(/[^a-zA-Z0-9_.-]/g, '_') : 'unknown-queue';
    return [
        'v2',
        input.cardId.replace(/[^a-zA-Z0-9_.-]/g, '_'),
        input.reviewedAt,
        input.rating,
        queueType,
        input.attemptId.replace(/[^a-zA-Z0-9_.:-]/g, '_'),
    ].join(':');
}
