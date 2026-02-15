/**
 * Scheduler Router - 调度器路由器
 *
 * 根据卡片类型和配置选择合适的调度器
 * 支持多种调度算法：FSRS v5, SM-2, SM-15, A-Factor, A-Factor v2
 */

import type { FSRSCard, FSRSParameters, Rating, CardType } from '@/types';
import type { SchedulerEngineAdapter } from './types';
import type { StorageManager } from '../storage/manager';
import { TSFSRSScheduler } from './strategies/TSFSRSScheduler';
import { SM15Scheduler } from './strategies/SM15Scheduler';
import { ImprovedTopicScheduler } from './strategies/ImprovedTopicScheduler';
import { createScheduler } from './index';
import { migrateCard } from './strategies/sm15/migration';

/** 调度器类型 */
export type SchedulerType = 'fsrs-v5' | 'sm15' | 'a-factor-v2';

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
 */
export class SchedulerRouter {
    private config: SchedulerRouterConfig;
    private schedulers: Map<SchedulerType, SchedulerEngineAdapter>;
    private storage: StorageManager;

    constructor(config: SchedulerRouterConfig, storage: StorageManager) {
        this.config = config;
        this.storage = storage;
        this.schedulers = new Map();

        this._initializeSchedulers();
    }

    /**
     * 初始化所有调度器
     */
    private _initializeSchedulers(): void {
        const params = this.config.fsrsParams;

        // FSRS v6 (使用官方 ts-fsrs 库)
        this.schedulers.set('fsrs-v5', new TSFSRSScheduler(params));

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
            console.log('[SchedulerRouter] route() called:', {
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
            console.log('[SchedulerRouter] Selected scheduler type:', schedulerType);

            // 2. 获取调度器
            const scheduler = this.schedulers.get(schedulerType);
            if (!scheduler) {
                throw new Error(`Scheduler not found: ${schedulerType}`);
            }
            
            console.log('[SchedulerRouter] Scheduler found:', {
                schedulerType,
                hasReviewMethod: typeof scheduler.review === 'function',
            });

            // 3. 执行复习
            const updatedCard = scheduler.review(card, rating);
            
            console.log('[SchedulerRouter] After scheduler.review():', {
                updatedCard: updatedCard ? {
                    id: updatedCard.id,
                    due: updatedCard.due,
                    dueDate: updatedCard.due ? new Date(updatedCard.due).toISOString() : 'undefined',
                    state: updatedCard.state,
                    reps: updatedCard.reps,
                    stability: updatedCard.stability,
                    difficulty: updatedCard.difficulty,
                    scheduledDays: updatedCard.scheduledDays,
                    elapsedDays: updatedCard.elapsedDays,
                } : 'undefined',
            });
            
            if (!updatedCard) {
                throw new Error(`Scheduler ${schedulerType} returned undefined for card ${card.id}`);
            }

            // 4. 更新调度器类型
            updatedCard.schedulerType = schedulerType;

            // 5. 保存到本地数据库
            this.storage.setCard(updatedCard);
            await this.storage.saveCards();

            return updatedCard;
        } catch (error) {
            console.error('[SchedulerRouter] route() failed:', {
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
     * 1. 卡片类型强制规则（Topic → A-Factor, Concept/Descriptor → FSRS）
     * 2. 用户覆盖配置
     * 3. 卡片的 schedulerType 字段
     * 4. 默认调度器
     *
     * @param card 卡片
     * @returns 调度器类型
     */
    getSchedulerType(card: FSRSCard): SchedulerType {
        // 1. 检查卡片类型强制规则
        if (card.type === 'topic') {
            // Topic 卡片强制使用 A-Factor v2
            return 'a-factor-v2';
        }
        
        // 🔧 修复：Concept 使用 A-Factor v2（文档块，支持反链）
        if (card.type === 'concept') {
            return 'a-factor-v2';
        }
        
        // 🔧 修复：Descriptor 使用 FSRS v5（问答卡片）
        if (card.type === 'descriptor') {
            return 'fsrs-v5';
        }

        // 2. 检查用户覆盖配置
        if (this.config.schedulerOverrides?.has(card.id)) {
            return this.config.schedulerOverrides.get(card.id)!;
        }

        // 3. 检查卡片自身的调度器类型
        if (card.schedulerType) {
            // 验证调度器是否存在
            if (this.schedulers.has(card.schedulerType)) {
                return card.schedulerType;
            }
            console.warn(`[SchedulerRouter] Card ${card.id} has unknown scheduler type: ${card.schedulerType}, falling back to default`);
        }

        // 4. 使用默认调度器
        return this.config.defaultScheduler;
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
        if (card.type === 'topic') {
            // Topic 卡片只能使用 A-Factor v2
            if (newScheduler !== 'a-factor-v2') {
                console.error('[SchedulerRouter] Topic cards must use A-Factor v2 scheduler');
                return false;
            }
        }
        
        // 🔧 修复：Concept 卡片只能使用 A-Factor v2
        if (card.type === 'concept') {
            if (newScheduler !== 'a-factor-v2') {
                console.error('[SchedulerRouter] Concept cards must use A-Factor v2 scheduler');
                return false;
            }
        }
        
        // 🔧 修复：Descriptor 卡片只能使用 FSRS
        if (card.type === 'descriptor') {
            if (newScheduler !== 'fsrs-v5') {
                console.error('[SchedulerRouter] Descriptor cards must use FSRS scheduler');
                return false;
            }
        }

        // 2. 验证新调度器是否存在
        if (!this.schedulers.has(newScheduler)) {
            console.error(`[SchedulerRouter] Scheduler not found: ${newScheduler}`);
            return false;
        }

        // 3. 转换卡片状态（如果需要）
        const convertedCard = this._convertCardState(
            card,
            card.schedulerType || this.config.defaultScheduler,
            newScheduler
        );

        // 4. 更新调度器类型
        convertedCard.schedulerType = newScheduler;

        // 5. 保存到本地
        this.storage.setCard(convertedCard);
        await this.storage.saveCards();

        console.log(`[SchedulerRouter] Switched card ${card.id} from ${card.schedulerType} to ${newScheduler}`);
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

        return scheduler.preview(card);
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
                        console.warn('[SchedulerRouter] Failed to update params for scheduler:', err);
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
        // 🆕 Phase 4: 使用迁移工具进行状态转换
        const migrated = migrateCard(card, newScheduler);

        // 如果迁移工具不支持该路径，回退到简化版转换
        if (migrated === card) {
            // 简化版转换（保持向后兼容）
            const converted = { ...card };

            // 从其他算法切换到 A-Factor v2
            if (oldScheduler !== 'a-factor-v2') {
                if (newScheduler === 'a-factor-v2') {
                    // FSRS difficulty (1-10) → A-Factor (1.2-6.0)
                    const difficulty = card.difficulty || 5;
                    converted.aFactor = 1.2 + ((difficulty - 1) / 9) * 4.8;
                }
            }

            return converted;
        }

        return migrated;
    }
}
