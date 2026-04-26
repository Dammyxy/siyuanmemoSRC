/**
 * Scheduler Router - 调度器路由器
 *
 * 根据卡片类型和配置选择合适的调度器
 * 支持多种调度算法：FSRS v6, SM-15, A-Factor v2
 */

import type { FSRSCard, FSRSParameters, Rating } from '@/types';
import type { SchedulerEngineAdapter } from './types';
import type { CardUpdatePort } from './ports';
import { TSFSRSScheduler } from './strategies/TSFSRSScheduler';
import { SM15Scheduler } from './strategies/SM15Scheduler';
import { ImprovedTopicScheduler } from './strategies/ImprovedTopicScheduler';
import { migrateCard } from './strategies/sm15/migration';
import { normalizeSchedulerCard } from './normalizeSchedulerCard';
import {
    getPreferredSchedulerForCardType,
    resolveEffectiveSchedulerTypeForCard,
    type SchedulerType,
} from './schedulerPolicy';
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

    constructor(
        config: SchedulerRouterConfig,
        cardUpdater: CardUpdatePort
    ) {
        this.config = config;
        this.cardUpdater = cardUpdater;
        this.schedulers = new Map();

        this._initializeSchedulers();
    }

    /**
     * 初始化所有调度器
     */
    private _initializeSchedulers(): void {
        const params = this.config.fsrsParams;

        // FSRS v6 (使用官方 ts-fsrs 库)
        this.schedulers.set('fsrs-v6', new TSFSRSScheduler(params));
        // SM-15
        this.schedulers.set('sm15', new SM15Scheduler(params));

        // A-Factor v2 (ImprovedTopicScheduler)
        this.schedulers.set('a-factor-v2', new ImprovedTopicScheduler(params));
    }

    /**
     * 路由到合适的调度器并执行复习
     *
     * @param card 卡片
     * @param rating 评分 (1-4)
     * @returns 更新后的卡片
     */
    async route(card: FSRSCard, rating: Rating): Promise<FSRSCard> {
        try {
            const now = Date.now();
            logger.debug('route() called:', {
                cardId: card.id,
                rating,
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
            
            // 1. 确定调度器类型
            const schedulerType = this.getSchedulerType(card);
            const normalizedCard = normalizeSchedulerCard(card, schedulerType, { now });
            logger.debug('Selected scheduler type:', schedulerType);

            // 2. 获取调度器
            const scheduler = this.schedulers.get(schedulerType);
            if (!scheduler) {
                throw new Error(`Scheduler not found: ${schedulerType}`);
            }
            
            logger.debug('Scheduler found:', {
                schedulerType,
                hasReviewMethod: typeof scheduler.review === 'function',
            });

            // 3. 执行复习
            const reviewedCard = scheduler.review(normalizedCard, rating);
            
            logger.debug('After scheduler.review():', {
                updatedCard: reviewedCard ? {
                    id: reviewedCard.id,
                    due: reviewedCard.due,
                    dueDate: reviewedCard.due ? new Date(reviewedCard.due).toISOString() : 'undefined',
                    state: reviewedCard.state,
                    reps: reviewedCard.reps,
                    stability: reviewedCard.stability,
                    difficulty: reviewedCard.difficulty,
                    scheduledDays: reviewedCard.scheduledDays,
                    elapsedDays: reviewedCard.elapsedDays,
                } : 'undefined',
            });
            
            if (!reviewedCard) {
                throw new Error(`Scheduler ${schedulerType} returned undefined for card ${card.id}`);
            }

            const updatedCard = normalizeSchedulerCard({
                ...reviewedCard,
                schedulerType,
            }, schedulerType, { now });

            // 5. 保存到本地数据库（使用 CardApplicationService）
            await this.cardUpdater.batchUpdateCardsWithoutEvents([updatedCard]);

            return updatedCard;
        } catch (error) {
            logger.error('route() failed:', {
                cardId: card.id,
                rating,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
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
        const convertedCard = this._convertCardState(
            card,
            resolveEffectiveSchedulerTypeForCard(card, {
                defaultScheduler: this.config.defaultScheduler,
                schedulerOverrides: this.config.schedulerOverrides,
            }),
            newScheduler
        );

        // 4. 更新调度器类型
        const normalizedCard = normalizeSchedulerCard({
            ...convertedCard,
            schedulerType: newScheduler,
        }, newScheduler);

        // 5. 保存到本地（使用 CardApplicationService）
        await this.cardUpdater.batchUpdateCardsWithoutEvents([normalizedCard]);

        logger.info(`Switched card ${card.id} from ${card.schedulerType} to ${newScheduler}`);
        return true;
    }

    /**
     * 预览所有评分选项
     *
     * @param card 卡片
     * @returns 评分 → 卡片的映射
     */
    preview(card: FSRSCard): Map<Rating, FSRSCard> {
        const schedulerType = this.getSchedulerType(card);
        const scheduler = this.schedulers.get(schedulerType);

        if (!scheduler) {
            throw new Error(`Scheduler not found: ${schedulerType}`);
        }

        const normalizedCard = normalizeSchedulerCard(card, schedulerType);
        const preview = scheduler.preview(normalizedCard);
        const normalizedPreview = new Map<Rating, FSRSCard>();
        for (const [rating, previewCard] of preview.entries()) {
            normalizedPreview.set(
                rating,
                normalizeSchedulerCard({
                    ...previewCard,
                    schedulerType,
                }, schedulerType),
            );
        }
        return normalizedPreview;
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
     * 处理不同调度器之间的状态转换
     *
     * Phase 4: 使用 migration.ts 中的迁移工具
     *
     * @param card 卡片
     * @param oldScheduler 旧调度器
     * @param newScheduler 新调度器
     * @returns 转换后的卡片
     */
    private _convertCardState(
        card: FSRSCard,
        oldScheduler: SchedulerType,
        newScheduler: SchedulerType
    ): FSRSCard {
        if (oldScheduler === newScheduler) {
            return { ...card };
        }

        // 🆕 Phase 4: 使用迁移工具进行状态转换
        const migrated = migrateCard(card, newScheduler);

        if (migrated === card) {
            throw new Error(`Scheduler migration not supported: ${oldScheduler} -> ${newScheduler}`);
        }

        return migrated;
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
