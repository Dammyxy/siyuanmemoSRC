/**
 * Scheduler Router - 调度器路由器
 *
 * 根据卡片类型和配置选择合适的调度器
 * 支持内置调度算法：FSRS v6, A-Factor v2
 */

import type { FSRSCard, FSRSParameters, Rating } from '@/types';
import type { SchedulerEngineAdapter } from './types';
import type { CardUpdatePort } from './ports';
import { TSFSRSScheduler } from './strategies/TSFSRSScheduler';
import { ImprovedTopicScheduler } from './strategies/ImprovedTopicScheduler';
import { normalizeSchedulerCard } from './normalizeSchedulerCard';
import {
    getPreferredSchedulerForCardType,
    resolveEffectiveSchedulerTypeForCard,
    resolveStoredSchedulerType,
    type SchedulerType,
} from './schedulerPolicy';
import {
    SrsV2Kernel,
    type ReviewCommitResult,
    type SchedulingDecision,
    type SrsV2SchedulingContext,
} from './srs-v2';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SchedulerRouter');

/** Scheduler Router 配置 */
export interface SchedulerRouterConfig {
    defaultScheduler: SchedulerType;
    fsrsParams: FSRSParameters;
    schedulerOverrides?: Map<string, SchedulerType>;
}

/**
 * 调度器路由器
 *
 * 根据卡片类型和配置选择合适的调度器并执行复习
 * 
 * 使用 DDD 架构：
 * - 依赖调度器策略进行业务计算
 * - 依赖 CardUpdatePort 进行持久化更新
 */
export class SchedulerRouter {
    private config: SchedulerRouterConfig;
    private schedulers: Map<SchedulerType, SchedulerEngineAdapter>;
    private cardUpdater: CardUpdatePort;
    private kernel: SrsV2Kernel;

    constructor(
        config: SchedulerRouterConfig,
        cardUpdater: CardUpdatePort
    ) {
        this.config = config;
        this.cardUpdater = cardUpdater;
        this.schedulers = new Map();

        this._initializeSchedulers();
        this.kernel = new SrsV2Kernel({
            resolveSchedulerType: card => this.getSchedulerType(card),
            getScheduler: type => this.schedulers.get(type),
            normalizeCard: (card, schedulerType, options) => normalizeSchedulerCard(card, schedulerType, options),
        });
    }

    /**
     * 初始化所有调度器
     */
    private _initializeSchedulers(): void {
        const params = this.config.fsrsParams;

        // FSRS v6 (使用官方 ts-fsrs 库)
        this.schedulers.set('fsrs-v6', new TSFSRSScheduler(params));
        // A-Factor v2 (ImprovedTopicScheduler) stays internal for topic/concept rotation.
        this.schedulers.set('a-factor-v2', new ImprovedTopicScheduler(params));
    }

    /**
     * 生成 SRS v2 调度决策，但不执行持久化。
     */
    answer(card: FSRSCard, rating: Rating, options: SrsV2SchedulingContext = {}): SchedulingDecision {
        logger.debug('answer() called:', {
            cardId: card.id,
            rating,
            reviewTime: options.reviewTime,
            memoryStateAsOf: options.memoryStateAsOf,
            queueType: options.queueType,
            queueMode: options.queueMode,
            commitPolicy: options.commitPolicy,
            cardType: card.type,
            currentSchedulerType: card.schedulerType,
            cardState: card.state,
            stability: card.stability,
            difficulty: card.difficulty,
            due: card.due,
            dueDate: card.due ? new Date(card.due).toISOString() : 'undefined',
            lastReview: card.lastReview,
            lastReviewDate: card.lastReview ? new Date(card.lastReview).toISOString() : 'undefined',
        });

        const decision = this.kernel.answer(card, rating, options);
        logger.debug('SRS v2 decision created:', {
            cardId: decision.attempt.cardId,
            attemptId: decision.attempt.id,
            schedulerType: decision.schedulerType,
            algorithm: decision.algorithm,
            queueMode: decision.queueMode,
            commitPolicy: decision.commitPolicy,
            due: decision.after.due,
            dueDate: decision.after.due ? new Date(decision.after.due).toISOString() : 'undefined',
            state: decision.after.state,
            reps: decision.after.reps,
            stability: decision.after.stability,
            difficulty: decision.after.difficulty,
            scheduledDays: decision.after.scheduledDays,
            elapsedDays: decision.after.elapsedDays,
        });

        return decision;
    }

    /**
     * 提交 SRS v2 决策。preview/drill 决策不会写正式排期。
     */
    async commit(decision: SchedulingDecision): Promise<ReviewCommitResult> {
        const result = this.kernel.commit(decision);
        if (result.updatedCard) {
            await this.cardUpdater.batchUpdateCardsWithoutEvents([result.updatedCard], {
                preferIncomingScheduling: true,
                schedulingWriteSource: 'review-commit',
            });
        }
        return result;
    }

    /**
     * 获取卡片应使用的调度器类型
     *
     * 优先级：
     * 1. 卡片类型强制规则（Item/Descriptor → FSRS, Topic/Concept → A-Factor）
     * 2. 用户覆盖配置
     * 3. 卡片的 schedulerType 字段
     * 4. 默认调度器
     *
     * @param card 卡片
     * @returns 调度器类型
     */
    getSchedulerType(card: FSRSCard): SchedulerType {
        return resolveEffectiveSchedulerTypeForCard(card, {
            defaultScheduler: this.config.defaultScheduler,
            schedulerOverrides: this.config.schedulerOverrides,
            strict: true,
        });
    }

    /**
     * 切换卡片的调度器
     *
     * @param card 卡片
     * @param newScheduler 新的调度器类型
     * @returns 是否成功切换
     */
    async switchScheduler(
        card: FSRSCard,
        newScheduler: SchedulerType
    ): Promise<boolean> {
        // 1. 验证切换是否允许
        if (!this.isSchedulerAllowedForCardType(card.type, newScheduler)) {
            logger.error(`Card type "${card.type}" does not allow scheduler "${newScheduler}"`);
            return false;
        }

        // 2. 验证新调度器是否存在
        if (!this.schedulers.has(newScheduler)) {
            logger.error(`Scheduler not found: ${newScheduler}`);
            return false;
        }

        // 3. 转换卡片状态（如果需要）
        const convertedCard = this._convertCardState(card, newScheduler);

        // 4. 更新调度器类型
        const normalizedCard = normalizeSchedulerCard({
            ...convertedCard,
            schedulerType: newScheduler,
        }, newScheduler);

        // 5. 保存到本地（使用 CardApplicationService）
        await this.cardUpdater.batchUpdateCardsWithoutEvents([normalizedCard], {
            schedulingWriteSource: 'scheduler-migration',
        });

        logger.info(`Switched card ${card.id} from ${card.schedulerType} to ${newScheduler}`);
        return true;
    }

    /**
     * 预览所有评分选项
     *
     * @param card 卡片
     * @returns 评分 → 卡片的映射
     */
    preview(card: FSRSCard, options: SrsV2SchedulingContext = {}): Map<Rating, FSRSCard> {
        const preview = this.kernel.preview(card, options);
        const normalizedPreview = new Map<Rating, FSRSCard>();
        for (const [rating, choice] of preview.choices.entries()) {
            normalizedPreview.set(rating, choice.card);
        }
        return normalizedPreview;
    }

    getScheduler(type: string): unknown {
        const schedulerType = resolveStoredSchedulerType(type);
        return schedulerType ? this.schedulers.get(schedulerType) : undefined;
    }

    getAllSchedulers(): Map<string, unknown> {
        return new Map(this.schedulers.entries());
    }

    hasScheduler(type: string): boolean {
        const schedulerType = resolveStoredSchedulerType(type);
        return schedulerType ? this.schedulers.has(schedulerType) : false;
    }

    /**
     * 更新配置
     *
     * @param config 新配置（部分）
     */
    updateConfig(config: Partial<SchedulerRouterConfig>): void {
        this.config = { ...this.config, ...config };

        // 更新支持 updateParams 的调度器参数
        if (config.fsrsParams) {
            for (const scheduler of this.schedulers.values()) {
                // 🔧 修复：只对有 updateParams 方法的调度器调用
                if ('updateParams' in scheduler && typeof scheduler.updateParams === 'function') {
                    try {
                        scheduler.updateParams(config.fsrsParams);
                    } catch (err) {
                        logger.warn('Failed to update params for scheduler:', err);
                    }
                }
            }
        }
    }

    /**
     * 状态转换（使用迁移工具）
     *
     * 处理不同调度器之间的状态转换。
     *
     * Formal memory scheduling is FSRS-owned. Topic rotation keeps its internal
     * state in the topic metadata and does not migrate unsupported stored
     * scheduler values into another built-in algorithm.
     *
     * @param card 卡片
     * @param oldScheduler 旧调度器
     * @param newScheduler 新调度器
     * @returns 转换后的卡片
     */
    private _convertCardState(
        card: FSRSCard,
        newScheduler: SchedulerType
    ): FSRSCard {
        return {
            ...card,
            schedulerType: newScheduler,
        };
    }

    private getPreferredSchedulerForType(cardType?: string): SchedulerType | null {
        return getPreferredSchedulerForCardType(cardType);
    }

    private isSchedulerAllowedForCardType(cardType: string | undefined, scheduler: SchedulerType): boolean {
        if (!cardType) {
            return true;
        }

        if (cardType === 'descriptor') {
            return scheduler === 'fsrs-v6';
        }

        const preferredScheduler = this.getPreferredSchedulerForType(cardType);
        if (!preferredScheduler) {
            return true;
        }

        return scheduler === preferredScheduler;
    }
}
