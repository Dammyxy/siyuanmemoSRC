/**
 * TS-FSRS Scheduler Adapter
 * 
 * 使用官方 ts-fsrs 库实现的 FSRS v6 调度器。
 * 
 * 特性：
 * - 完整的 FSRS v6 算法实现
 * - 支持短期记忆模式（可选）
 * - 支持模糊化（fuzz）
 * - 官方维护，算法最准确
 * 
 * @see https://github.com/open-spaced-repetition/ts-fsrs
 */

import { 
    fsrs, 
    generatorParameters, 
    Rating as TSRating, 
    Card as TSCard,
    State as TSState,
    type Grade,
    type FSRSParameters as TSFSRSParameters,
    type RecordLog,
} from 'ts-fsrs';
import type { FSRSCard, FSRSParameters, Rating, CardState } from '@/types';
import type { SchedulerEngineAdapter } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TSFSRSScheduler');

/**
 * 预览缓存项
 */
interface PreviewCacheEntry {
    /** 缓存的预览结果 */
    result: Map<Rating, FSRSCard>;
    /** 缓存创建时间 */
    timestamp: number;
}

/**
 * TS-FSRS 调度器适配器
 * 
 * 将官方 ts-fsrs 库（FSRS v6）适配到我们的 SchedulerEngineAdapter 接口。
 * 
 * 主要职责：
 * - 实现 SchedulerEngineAdapter 接口的所有方法
 * - 在我们的数据格式和 ts-fsrs 数据格式之间进行转换
 * - 管理 ts-fsrs 调度器实例和参数配置
 * 
 * 数据格式差异：
 * - 时间戳：我们使用 number (毫秒)，ts-fsrs 使用 Date 对象
 * - 字段命名：我们使用驼峰命名，ts-fsrs 使用下划线命名
 * - 额外字段：我们的卡片包含 id, blockId 等业务字段，需要在转换时保留
 * 
 * @implements {SchedulerEngineAdapter}
 */
export class TSFSRSScheduler implements SchedulerEngineAdapter {
    /** ts-fsrs 调度器实例 */
    private f: ReturnType<typeof fsrs>;
    
    /** 当前使用的参数配置 */
    /** 预览结果缓存 */
    private previewCache: Map<string, PreviewCacheEntry> = new Map();
    
    /** 缓存过期时间（毫秒），默认 5 分钟 */
    private readonly CACHE_TTL = 5 * 60 * 1000;
    
    /**
     * 创建 TSFSRSScheduler 实例
     * 
     * @param params - FSRS 参数配置
     * @param params.requestRetention - 目标保留率 (0-1)，默认 0.9
     * @param params.maximumInterval - 最大复习间隔（天），默认 36500
     * @param params.weights - FSRS 算法的 21 个权重参数
     * @param params.enableFuzz - 是否启用模糊化，为复习时间添加随机偏移
     * @param params.enableShortTerm - 是否启用短期记忆模式，为新卡片提供更密集的复习计划
     */
    constructor(params: FSRSParameters) {
        this.f = this.createScheduler(params);
    }
    
    /**
     * 创建 ts-fsrs 调度器实例
     * 
     * 将我们的参数格式转换为 ts-fsrs 的参数格式，并创建调度器实例。
     * 
     * 参数映射：
     * - requestRetention → request_retention: 目标保留率
     * - maximumInterval → maximum_interval: 最大间隔（天）
     * - weights → w: 21 个权重参数
     * - enableFuzz → enable_fuzz: 是否启用模糊化
     * - enableShortTerm → enable_short_term: 是否启用短期记忆模式
     * 
     * @param params - 我们的参数格式
     * @returns ts-fsrs 调度器实例
     */
    private createScheduler(params: FSRSParameters): ReturnType<typeof fsrs> {
        const tsParams: Partial<TSFSRSParameters> = {
            request_retention: params.requestRetention,
            maximum_interval: params.maximumInterval,
            w: params.weights,
            enable_fuzz: params.enableFuzz ?? true,
            enable_short_term: params.enableShortTerm ?? false, // 支持短期记忆模式，默认禁用
        };
        
        return fsrs(generatorParameters(tsParams));
    }
    
    /**
     * 更新参数配置
     * 
     * 更新 FSRS 参数并重新创建调度器实例。
     * 用于动态调整算法行为，例如应用参数优化的结果。
     * 
     * 注意：参数更新会清空预览缓存，因为参数变化会影响预览结果。
     * 
     * @param params - 新的参数配置
     */
    updateParams(params: FSRSParameters): void {
        this.f = this.createScheduler(params);
        // 清空缓存，因为参数变化会影响预览结果
        this.previewCache.clear();
    }
    
    /**
     * 预览所有评分选项的结果
     * 
     * 计算用户对卡片进行不同评分（Again/Hard/Good/Easy）后的状态。
     * 用于在用户评分前显示每个选项的下次复习时间。
     * 
     * 性能优化：
     * - 使用缓存避免重复计算相同卡片的预览结果
     * - 缓存键基于卡片 ID 和当前时间（精确到分钟）
     * - 缓存有效期为 5 分钟，过期自动失效
     * 
     * @param card - 要预览的卡片
     * @param now - 当前时间，默认为系统当前时间
     * @returns 评分到预览结果的映射 (1=Again, 2=Hard, 3=Good, 4=Easy)
     */
    preview(card: FSRSCard, now: Date = new Date()): Map<Rating, FSRSCard> {
        // 生成缓存键：卡片ID + 时间（精确到分钟）
        const cacheKey = this.generatePreviewCacheKey(card, now);
        
        // 检查缓存
        const cached = this.previewCache.get(cacheKey);
        if (cached && this.isCacheValid(cached)) {
            return cached.result;
        }
        
        // 缓存未命中或已过期，重新计算
        const tsCard = this.toTSCard(card);
        const scheduling: RecordLog = this.f.repeat(tsCard, now);
        
        const result = new Map<Rating, FSRSCard>();
        
        // ts-fsrs 的 Rating 枚举值：1=Again, 2=Hard, 3=Good, 4=Easy
        result.set(1, this.fromTSCard(scheduling[TSRating.Again].card, card));
        result.set(2, this.fromTSCard(scheduling[TSRating.Hard].card, card));
        result.set(3, this.fromTSCard(scheduling[TSRating.Good].card, card));
        result.set(4, this.fromTSCard(scheduling[TSRating.Easy].card, card));
        
        // 存入缓存
        this.previewCache.set(cacheKey, {
            result,
            timestamp: Date.now(),
        });
        
        // 清理过期缓存（避免内存泄漏）
        this.cleanExpiredCache();
        
        return result;
    }

    
    /**
     * 复习卡片并更新状态
     * 
     * 根据用户的评分更新卡片的调度参数（下次复习时间、稳定性、难度等）。
     * 这是调度器的核心方法，每次用户复习卡片时都会调用。
     * 
     * @param card - 要复习的卡片
     * @param rating - 用户评分 (1=Again, 2=Hard, 3=Good, 4=Easy)
     * @param now - 复习时间，默认为系统当前时间
     * @returns 更新后的卡片状态
     */
    review(card: FSRSCard, rating: Rating, now: Date = new Date()): FSRSCard {
        const tsCard = this.toTSCard(card);
        const tsRating = this.toTSRating(rating);
        
        // 使用 ts-fsrs 的 next 方法直接获取指定评分的结果
        const result = this.f.next(tsCard, now, tsRating);
        
        return this.fromTSCard(result.card, card);
    }
    
    /**
     * 批量复习卡片
     * 
     * 一次性处理多张卡片的复习，优化类型转换开销。
     * 适用于批量导入、批量评分等场景。
     * 
     * 性能优化：
     * - 减少重复的类型转换开销
     * - 批量处理减少函数调用开销
     * 
     * @param reviews - 复习请求数组，每项包含卡片和评分
     * @param now - 复习时间，默认为系统当前时间
     * @returns 更新后的卡片数组
     */
    reviewBatch(
        reviews: Array<{ card: FSRSCard; rating: Rating }>,
        now: Date = new Date()
    ): FSRSCard[] {
        const results: FSRSCard[] = [];
        
        for (const { card, rating } of reviews) {
            const tsCard = this.toTSCard(card);
            const tsRating = this.toTSRating(rating);
            
            // 使用 ts-fsrs 的 next 方法
            const result = this.f.next(tsCard, now, tsRating);
            
            results.push(this.fromTSCard(result.card, card));
        }
        
        return results;
    }
    
    /**
     * 获取卡片的可提取性（回忆概率）
     * 
     * 计算在指定时间点，用户能够成功回忆该卡片的概率。
     * 可提取性随时间衰减，用于评估记忆强度和优先级排序。
     * 
     * @param card - 要计算的卡片
     * @param now - 计算时间点，默认为系统当前时间
     * @returns 可提取性值 (0-1)，1 表示完全能回忆，0 表示完全遗忘
     */
    getRetrievability(card: FSRSCard, now: Date = new Date()): number {
        const tsCard = this.toTSCard(card);
        return this.f.get_retrievability(tsCard, now, false) as number;
    }

    // ========================================================================
    // 缓存管理方法
    // ========================================================================

    /**
     * 生成预览缓存键
     *
     * 缓存键格式：{cardId}:{minuteTimestamp}
     * - cardId: 卡片唯一标识
     * - minuteTimestamp: 时间戳精确到分钟（忽略秒和毫秒）
     *
     * 这样同一张卡片在同一分钟内的多次预览请求会命中缓存。
     *
     * @param card - 卡片
     * @param now - 当前时间
     * @returns 缓存键
     */
    private generatePreviewCacheKey(card: FSRSCard, now: Date): string {
        // 将时间精确到分钟（忽略秒和毫秒）
        const minuteTimestamp = Math.floor(now.getTime() / 60000);
        return `${card.id}:${minuteTimestamp}`;
    }

    /**
     * 检查缓存是否有效
     *
     * 缓存有效条件：
     * - 缓存项存在
     * - 未超过过期时间（CACHE_TTL）
     *
     * @param entry - 缓存项
     * @returns 是否有效
     */
    private isCacheValid(entry: PreviewCacheEntry): boolean {
        const age = Date.now() - entry.timestamp;
        return age < this.CACHE_TTL;
    }

    /**
     * 清理过期缓存
     *
     * 遍历所有缓存项，删除已过期的条目。
     * 定期调用此方法可以防止内存泄漏。
     */
    private cleanExpiredCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.previewCache.entries()) {
            if (now - entry.timestamp >= this.CACHE_TTL) {
                this.previewCache.delete(key);
            }
        }
    }

    
    // ========================================================================
    // 类型转换方法
    // 
    // 这些方法负责在我们的数据格式和 ts-fsrs 的数据格式之间进行转换。
    // 主要差异：
    // 1. 时间表示：我们使用 number (Unix 毫秒时间戳)，ts-fsrs 使用 Date 对象
    // 2. 字段命名：我们使用驼峰命名 (camelCase)，ts-fsrs 使用下划线命名 (snake_case)
    // 3. 业务字段：我们的卡片包含额外的业务字段 (id, blockId 等)，需要保留
    // ========================================================================
    
    /**
     * 将我们的 FSRSCard 转换为 ts-fsrs 的 Card
     * 
     * 转换规则：
     * - due: number → Date (毫秒时间戳转日期对象)
     * - lastReview: number → Date (毫秒时间戳转日期对象)
     * - elapsedDays: 驼峰命名 → elapsed_days (下划线命名)
     * - scheduledDays: 驼峰命名 → scheduled_days (下划线命名)
     * - 其他字段 (stability, difficulty, reps, lapses, state) 直接映射
     * - 业务字段 (id, blockId 等) 不传递给 ts-fsrs
     * 
     * @param card - 我们的卡片格式
     * @returns ts-fsrs 的卡片格式
     */
    private toTSCard(card: FSRSCard): TSCard {
        // 安全地转换 due 日期，确保不会产生 Invalid Date
        let dueDate: Date;
        if (card.due && !isNaN(card.due) && isFinite(card.due)) {
            dueDate = new Date(card.due);
        } else {
            // 如果 due 无效，使用当前时间
            dueDate = new Date();
            logger.warn('Invalid due date for card:', card.id, 'using current time');
        }
        
        // 安全地转换 lastReview 日期
        let lastReviewDate: Date | undefined;
        if (card.lastReview && !isNaN(card.lastReview) && isFinite(card.lastReview)) {
            lastReviewDate = new Date(card.lastReview);
        }
        
        return {
            due: dueDate,
            stability: card.stability ?? 0,
            difficulty: card.difficulty ?? 5,
            elapsed_days: card.elapsedDays ?? 0,
            scheduled_days: card.scheduledDays ?? 0,
            learning_steps: card.learning_step ?? 0,
            reps: card.reps ?? 0,
            lapses: card.lapses ?? 0,
            state: this.toTSState(card.state),
            last_review: lastReviewDate,
        };
    }
    
    /**
     * 将 ts-fsrs 的 Card 转换回我们的 FSRSCard
     * 
     * 转换规则：
     * - due: Date → number (日期对象转毫秒时间戳)
     * - last_review: Date → lastReview: number (日期对象转毫秒时间戳)
     * - elapsed_days → elapsedDays (下划线命名转驼峰命名)
     * - scheduled_days → scheduledDays (下划线命名转驼峰命名)
     * - 其他字段 (stability, difficulty, reps, lapses, state) 直接映射
     * - 保留原始卡片的业务字段 (id, blockId, type, deckID 等)
     * - 更新 updatedAt 为当前时间
     * 
     * 注意：使用展开运算符 {...originalCard} 保留所有原始字段，
     * 然后覆盖调度相关的字段。这确保业务字段不会丢失。
     * 
     * @param tsCard - ts-fsrs 的卡片格式
     * @param originalCard - 原始卡片（用于保留业务字段）
     * @returns 我们的卡片格式
     */
    private fromTSCard(tsCard: TSCard, originalCard: FSRSCard): FSRSCard {
        // 安全地转换 due 日期
        let dueTime: number;
        if (tsCard.due && tsCard.due instanceof Date && !isNaN(tsCard.due.getTime())) {
            dueTime = tsCard.due.getTime();
        } else {
            // 如果 due 无效，使用当前时间 + 1天
            dueTime = Date.now() + 86400000;
            logger.error('Invalid due date from ts-fsrs:', {
                cardId: originalCard.id,
                tsCardDue: tsCard.due,
                fallbackDue: new Date(dueTime).toISOString(),
            });
        }
        
        // 安全地转换 lastReview 日期
        let lastReviewTime: number;
        if (tsCard.last_review && tsCard.last_review instanceof Date && !isNaN(tsCard.last_review.getTime())) {
            lastReviewTime = tsCard.last_review.getTime();
        } else {
            // 如果 lastReview 无效，使用当前时间
            lastReviewTime = Date.now();
        }
        
        return {
            ...originalCard,
            due: dueTime,
            stability: tsCard.stability,
            difficulty: tsCard.difficulty,
            elapsedDays: tsCard.elapsed_days,
            scheduledDays: tsCard.scheduled_days,
            reps: tsCard.reps,
            lapses: tsCard.lapses,
            state: this.fromTSState(tsCard.state),
            lastReview: lastReviewTime,
            updatedAt: Date.now(),
        };
    }
    
    /**
     * 将我们的 Rating 转换为 ts-fsrs 的 Rating
     * 
     * 评分映射：
     * - 1 → Again (完全忘记)
     * - 2 → Hard (困难)
     * - 3 → Good (良好)
     * - 4 → Easy (简单)
     * 
     * 注意：两种格式的枚举值完全一致，可以直接类型转换。
     * 
     * @param rating - 我们的评分格式
     * @returns ts-fsrs 的评分格式
     */
    private toTSRating(rating: Rating): Grade {
        // 我们的 Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
        // ts-fsrs 的 Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
        // 完全一致，直接返回
        switch (rating) {
            case 1:
                return TSRating.Again;
            case 2:
                return TSRating.Hard;
            case 3:
                return TSRating.Good;
            case 4:
            default:
                return TSRating.Easy;
        }
    }
    
    /**
     * 将我们的 CardState 转换为 ts-fsrs 的 State
     * 
     * 状态映射：
     * - 0 → New (新卡片)
     * - 1 → Learning (学习中)
     * - 2 → Review (复习中)
     * - 3 → Relearning (重新学习)
     * 
     * 注意：两种格式的枚举值完全一致，可以直接类型转换。
     * 
     * @param state - 我们的状态格式
     * @returns ts-fsrs 的状态格式
     */
    private toTSState(state: CardState): TSState {
        // 我们的 CardState: 0=New, 1=Learning, 2=Review, 3=Relearning
        // ts-fsrs 的 State: 0=New, 1=Learning, 2=Review, 3=Relearning
        // 完全一致，直接返回
        switch (state) {
            case 1:
                return TSState.Learning;
            case 2:
                return TSState.Review;
            case 3:
                return TSState.Relearning;
            case 0:
            default:
                return TSState.New;
        }
    }
    
    /**
     * 将 ts-fsrs 的 State 转换回我们的 CardState
     * 
     * 状态映射：
     * - 0 → New (新卡片)
     * - 1 → Learning (学习中)
     * - 2 → Review (复习中)
     * - 3 → Relearning (重新学习)
     * 
     * 注意：两种格式的枚举值完全一致，可以直接类型转换。
     * 
     * @param state - ts-fsrs 的状态格式
     * @returns 我们的状态格式
     */
    private fromTSState(state: TSState): CardState {
        // 完全一致，直接返回
        switch (state) {
            case TSState.Learning:
                return 1;
            case TSState.Review:
                return 2;
            case TSState.Relearning:
                return 3;
            case TSState.New:
            default:
                return 0;
        }
    }
}
