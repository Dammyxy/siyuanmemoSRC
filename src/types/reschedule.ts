/**
 * SuperMemo Reschedule Operations Types
 * 基于 SuperMemo 设计的重新调度操作类型定义
 */

/** 重新调度历史记录条目 */
export interface RescheduleHistoryEntry {
    type: 'postpone' | 'advance' | 'spread' | 'dilute';
    timestamp: number;
    oldDue: number;
    newDue: number;
    reason?: string;
}

/** 排序标准 */
export enum SortingCriterion {
    Random = 'random',
    ByPriority = 'by-priority',
    ByInterval = 'by-interval',
    ByLateness = 'by-lateness',
    ByEasiness = 'by-easiness',
    ByRecency = 'by-recency'
}

/** Postpone 配置 */
export interface PostponeConfig {
    // 基础参数
    delayFactor: number;           // 延迟因子 (1.0 - 10.0)
    minInterval: number;           // 最小间隔（天）
    maxInterval: number;           // 最大间隔（天）
    
    // 🆕 Dilute 模式：是否包含未到期的卡片
    includeNonOutstanding?: boolean;  // true = Dilute 模式，false = Postpone 模式（默认）
    
    // 跳过条件
    skipConditions: {
        skipByPriority?: {
            enabled: boolean;
            threshold: number;         // 优先级阈值 (0-100)
        };
        skipByInterval?: {
            enabled: boolean;
            threshold: number;         // 间隔阈值（天）
        };
        skipByRetrievability?: {
            enabled: boolean;
            threshold: number;         // 可提取性阈值 (0-1)
        };
        skipByAFactor?: {
            enabled: boolean;
            threshold: number;         // A-Factor 阈值 (1.2-6.0)
        };
        skipByPostponeCount?: {
            enabled: boolean;
            threshold: number;         // 推迟次数阈值
        };
    };
    
    // 高级参数
    modifyDelayByRetrievability: boolean;
    modifyDelayByPriority: boolean;
    
    // Auto-Postpone 参数
    skipTopNElements?: number;     // 跳过前 N 个最高优先级元素
}

/** Advance 配置 */
export interface AdvanceConfig {
    maxDays: number;               // 最大提前天数
    randomize: boolean;            // 是否随机分散
    handleOverdueCards: boolean;   // 是否特殊处理极度过期的卡片
}

/** Spread 配置 */
export interface SpreadConfig {
    collectingPeriod: number;      // 收集期（天）
    reschedulingPeriod: number;    // 重新调度期（天）
    considerFutureRepetitions: boolean;  // 是否考虑未来复习
    collectAllCards?: boolean;     // 是否直接使用输入卡片集合（队列模式内部使用）
    
    sortingCriterion: SortingCriterion;
    
    // 每日卡片数量限制
    maxCardsPerDay?: number;
}

/** Postpone 操作结果 */
export interface PostponeResult {
    updated: number;               // 成功更新的卡片数量
    skipped: number;               // 跳过的卡片数量
    skippedReasons: Record<string, number>;  // 跳过原因统计
    errors?: string[];             // 错误信息
}

/** Advance 操作结果 */
export interface AdvanceResult {
    updated: number;
    overdueHandled: number;        // 特殊处理的过期卡片数量
    unchanged: number;             // 保持不变的卡片数量
    errors?: string[];
}

/** Spread 操作结果 */
export interface SpreadResult {
    updated: number;
    averageCardsPerDay: number;    // 平均每天的卡片数量
    errors?: string[];
}
