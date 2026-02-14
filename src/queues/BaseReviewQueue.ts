/**
 * Base Review Queue
 * 复习队列基类
 * 
 * 提供所有队列类型的通用实现基础。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { IReviewQueue, QueueObserver, QueueType, QueueStats, QueueUIConfig, ReviewButtonConfig } from '../types/unified-data-source';
import { FSRSCard, CardState } from '../types/card';
import type { QueueItem } from '../core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { normalizeToFSRSCard, validateQueueReturnType } from '../diagnostics/type-guards';

/**
 * Learning Steps配置接口
 * 
 * 定义新卡片和失败卡片的学习步骤配置。
 * 
 * @see .kiro/specs/learning-steps-rating-fix/requirements.md
 * @see .kiro/specs/learning-steps-rating-fix/design.md
 */
interface LearningStepsConfig {
    /**
     * 新卡片的学习步骤
     * 格式: ['1m', '10m'] (分钟), ['1h', '2h'] (小时), ['1d'] (天)
     */
    learning_steps: string[];
    
    /**
     * 失败复习卡片的重新学习步骤
     * 格式同 learning_steps
     */
    relearning_steps: string[];
    
    /**
     * Easy评分的奖励倍数
     * 用于计算Easy评分的毕业间隔
     */
    easy_bonus: number;
    
    /**
     * Good评分的毕业间隔（天）
     * 完成所有learning steps后，Good评分使用此间隔
     */
    graduating_interval_good: number;
    
    /**
     * Easy评分的毕业间隔（天）
     * Easy评分直接毕业时使用此间隔
     */
    graduating_interval_easy: number;
}

/**
 * 默认Learning Steps配置
 * 
 * 参考Anki和FSRS的默认配置：
 * - learning_steps: ['1m', '10m'] - 新卡片在1分钟和10分钟后复习
 * - relearning_steps: ['10m'] - 失败卡片在10分钟后复习
 * - easy_bonus: 1.3 - Easy评分的间隔是Good的1.3倍
 * - graduating_interval_good: 1 - Good毕业后1天复习
 * - graduating_interval_easy: 4 - Easy毕业后4天复习
 */
const DEFAULT_LEARNING_STEPS_CONFIG: LearningStepsConfig = {
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    easy_bonus: 1.3,
    graduating_interval_good: 1,
    graduating_interval_easy: 4,
};

/**
 * 复习队列抽象基类
 * 
 * 所有队列类型（动态和静态）的基类。
 * 提供通用的队列类型访问，子类实现具体的队列逻辑。
 * 
 * @see 需求 5.1, 6.1
 */
export abstract class BaseReviewQueue implements IReviewQueue {
    /**
     * 队列名称
     */
    public abstract name: string;
    
    /**
     * 数据源管理器引用
     */
    protected manager: UnifiedDataSourceManager;
    
    /**
     * 队列类型
     */
    public type: QueueType;

    /**
     * 队列卡片缓存
     */
    protected cards: FSRSCard[] = [];

    /**
     * 队列观察者
     */
    protected observers: QueueObserver[] = [];
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param type 队列类型
     */
    constructor(manager: UnifiedDataSourceManager, type: QueueType) {
        this.manager = manager;
        this.type = type;
    }
    
    /**
     * 获取队列类型
     * 
     * @returns 队列类型
     * @see 需求 5.1, 6.1
     */
    public getType(): QueueType {
        return this.type;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 子类必须实现此方法以提供具体的卡片获取逻辑。
     * 
     * @returns 卡片数组
     * @see 需求 5.1, 5.2, 5.3, 6.1, 6.2
     */
    public abstract getCards(): Promise<FSRSCard[]>;
    
    /**
     * 获取队列中的所有卡片（包括过滤后的结果）
     * 
     * 此方法用于浏览器等 UI 组件，返回经过过滤和处理的卡片列表。
     * 默认实现直接调用 getCards()，子类可以覆盖以提供不同的行为。
     * 
     * 与 getCards() 的区别：
     * - getCards(): 返回原始卡片数据
     * - getAllCards(): 返回经过数据源过滤的卡片（例如：只返回到期的卡片）
     * 
     * @returns 卡片数组
     * @see 需求 5.1, 5.2, 5.3, 6.1, 6.2
     */
    public async getAllCards(): Promise<FSRSCard[]> {
        const rawCards = await this.getCards();
        const cards = normalizeToFSRSCard(rawCards as any[]);
        this.cards = [...cards];
        validateQueueReturnType(this.name ?? this.type, 'getAllCards', cards);
        return cards;
    }

    /**
     * 获取下一张卡片
     */
    public async getNextCard(): Promise<FSRSCard | null> {
        if (this.cards.length === 0) {
            await this.getAllCards();
        }
        return this.cards.length > 0 ? this.cards[0] : null;
    }
    
    /**
     * 添加卡片到队列
     * 
     * 子类必须实现此方法以提供具体的添加逻辑。
     * 
     * @param cardId 卡片 ID
     * @param source 来源类型（可选，仅用于最终训练队列）
     * @see 需求 5.4, 6.1, 6.2, 9.1, 9.5, 18.1
     */
    public abstract addCard(card: FSRSCard | QueueItem | string, source?: 'manual' | 'auto-failed'): Promise<void>;
    
    /**
     * 从队列中移除卡片
     * 
     * 子类必须实现此方法以提供具体的移除逻辑。
     * 
     * @param cardId 卡片 ID
     * @see 需求 5.5, 6.1, 6.2, 12.1, 12.2, 12.3
     */
    public abstract removeCard(cardIdOrBlockId: string): Promise<void>;

    /**
     * 更新卡片
     */
    public async updateCard(card: FSRSCard): Promise<void> {
        const index = this.cards.findIndex(c => c.blockId === card.blockId);
        if (index !== -1) {
            this.cards[index] = card;
            this.notifyObservers();
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 子类必须实现此方法以提供具体的复习处理逻辑。
     * 不同队列类型有不同的复习行为：
     * - 正式队列：评分计入调度，高评分移除，低评分保留
     * - 最终训练：评分不计入调度，评分 4 移除，其他保留
     * - 神经漫游：评分计入调度，但永不自动移除
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 7.1-7.7, 8.1-8.3, 9.1-9.3
     */
    public abstract handleReview(cardId: string, rating: number): Promise<void>;
    
    // ========================================================================
    // 调度器集成辅助方法（队列-调度器职责分离）
    // @see .kiro/specs/queue-scheduler-separation/requirements.md
    // ========================================================================
    
    /**
     * 获取 SchedulerRouter 实例
     * 
     * 通过 UnifiedDataSourceManager 访问 SchedulerRouter。
     * 
     * @returns SchedulerRouter 实例
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 8.3
     */
    protected getSchedulerRouter(): any {
        const router = (this.manager as any).advancedRouter;
        const plugin = router?.plugin;
        const schedulerRouter = plugin?.schedulerRouter;
        
        if (!schedulerRouter) {
            throw new Error(`[${this.type}] SchedulerRouter not available - plugin initialization failed`);
        }
        
        return schedulerRouter;
    }
    
    /**
     * 获取一天开始的小时数
     * 
     * 从插件配置中获取 dayStartHour，用于计算当天结束时间。
     * 
     * @returns 一天开始的小时数（默认 4）
     * @see 需求 2.2, 2.3
     */
    protected getDayStartHour(): number {
        try {
            const router = (this.manager as any).advancedRouter;
            const plugin = router?.plugin;
            
            if (plugin && typeof plugin.storage?.getSettings === 'function') {
                const settings = plugin.storage.getSettings();
                return settings?.queues?.dayStartHour ?? 4;
            }
        } catch (error) {
            console.warn(`[${this.type}] Failed to get dayStartHour from settings:`, error);
        }
        
        return 4; // 默认值
    }
    
    /**
     * 判断卡片是否应该从队列中移除
     * 
     * 基于卡片的到期日期和当天结束时间判断。
     * 这个方法是算法无关的，只依赖调度器输出的 due 值。
     * 
     * 判断逻辑：
     * - 如果 due > dayEnd：卡片应该在未来复习，从队列移除
     * - 如果 due <= dayEnd 但 scheduledDays >= 1：卡片间隔至少1天，从队列移除
     * - 否则：卡片仍需今天复习，保留在队列中
     * 
     * 第二个条件是为了处理 FSRS 在短时间内重复复习的情况：
     * 当用户在很短时间内（如几分钟）重复复习同一张卡片时，FSRS 会给出很短的间隔（如1小时）。
     * 虽然 due 还在今天范围内，但 scheduledDays >= 1 表示这是一次"正式"的复习，
     * 应该让卡片移出队列，避免在同一天内反复出现。
     * 
     * @param card 卡片对象
     * @returns true 表示应该移除，false 表示应该保留
     * @see 需求 2.1, 2.2, 2.3, 5.1
     */
    protected shouldRemoveFromQueue(card: FSRSCard): boolean {
        const dayStartHour = this.getDayStartHour();
        const dayEnd = this.getCurrentDayEnd(dayStartHour);
        
        // 验证 card.due 是否有效
        if (!card.due || isNaN(card.due) || card.due <= 0) {
            console.error(`[${this.type}] Invalid due date for card ${card.id}:`, {
                due: card.due,
                cardState: card.state,
                reps: card.reps,
            });
            // 无效的 due 日期，默认保留在队列中（不移除）
            return false;
        }
        
        // 条件1：due 超出今天范围
        const dueAfterDayEnd = card.due > dayEnd;
        
        // 条件2：scheduledDays >= 1（间隔至少1天）
        // 这处理了 FSRS 在短时间内重复复习的情况
        // 注意：SimpleFSRSScheduler 使用 Math.max(1, Math.round(interval)) 确保 scheduledDays 至少为 1
        const hasMinimumInterval = (card.scheduledDays ?? 0) >= 1;
        
        const shouldRemove = dueAfterDayEnd || hasMinimumInterval;
        
        console.log(`[${this.type}] shouldRemoveFromQueue:`, {
            cardId: card.id,
            due: new Date(card.due).toISOString(),
            dayEnd: new Date(dayEnd).toISOString(),
            scheduledDays: card.scheduledDays,
            dueAfterDayEnd,
            hasMinimumInterval,
            shouldRemove,
        });
        
        return shouldRemove;
    }
    
    /**
     * 获取当天结束时间
     * 
     * 根据 dayStartHour 计算当天的结束时间戳。
     * 
     * @param dayStartHour 一天开始的小时数
     * @returns 当天结束时间戳
     * @private
     */
    private getCurrentDayEnd(dayStartHour: number): number {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), dayStartHour, 0, 0, 0);
        
        if (now.getTime() < today.getTime()) {
            // 当前时间在今天的开始时间之前，返回今天的结束时间
            return today.getTime() + 24 * 60 * 60 * 1000;
        } else {
            // 当前时间在今天的开始时间之后，返回明天的开始时间
            return today.getTime() + 24 * 60 * 60 * 1000;
        }
    }
    
    /**
     * 使用调度器处理卡片复习（通用实现）
     * 
     * 这是一个通用的复习处理方法，实现了队列-调度器职责分离：
     * 1. 队列负责：卡片生命周期管理（排序、过滤、移除）
     * 2. 调度器负责：算法计算（到期日期、稳定性、难度）
     * 
     * 处理流程：
     * 1. 获取卡片
     * 2. 调用 SchedulerRouter.route() 更新卡片（应用 FSRS/SM-15/A-Factor 等算法）
     * 3. 保存更新后的卡片
     * 4. 调用 shouldRemoveFromQueue() 判断是否移除
     * 5. 移除或保留卡片
     * 6. 通知观察者
     * 
     * 子类使用方式：
     * - 标准队列：直接调用此方法
     * - 特殊队列：覆盖 handleReview() 实现自定义逻辑
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 1.1, 1.2, 1.3, 2.1
     * @see .kiro/specs/queue-scheduler-separation/design.md
     */
    protected async handleReviewWithScheduler(cardId: string, rating: number): Promise<void> {
        try {
            // 1. 获取卡片
            const card = await this.manager.getCard(cardId);
            
            console.log(`[${this.type}] handleReviewWithScheduler - Before scheduling:`, {
                cardId: card.id,
                rating,
                due: card.due,
                state: card.state,
                reps: card.reps,
            });
            
            // 2. 获取调度器并调度卡片
            const schedulerRouter = this.getSchedulerRouter();
            const updatedCard = await schedulerRouter.route(card, rating);
            
            console.log(`[${this.type}] handleReviewWithScheduler - After scheduling:`, {
                cardId: updatedCard.id,
                due: updatedCard.due,
                state: updatedCard.state,
                reps: updatedCard.reps,
            });
            
            // 验证调度器返回的卡片数据
            if (!updatedCard.due || isNaN(updatedCard.due) || updatedCard.due <= 0) {
                console.error(`[${this.type}] Scheduler returned invalid due date:`, {
                    cardId: updatedCard.id,
                    due: updatedCard.due,
                    rating,
                });
                throw new Error(`Scheduler returned invalid due date for card ${cardId}: ${updatedCard.due}`);
            }
            
            // 3. 保存更新后的卡片
            await this.manager.updateCard(updatedCard);
            
            // 4. 判断是否应该从队列移除
            const shouldRemove = this.shouldRemoveFromQueue(updatedCard);
            
            // 5. 移除或保留卡片
            if (shouldRemove) {
                await this.removeCard(cardId);
                console.log(`[${this.type}] Card ${cardId} reviewed with rating ${rating}, removed from queue`);
            } else {
                console.log(`[${this.type}] Card ${cardId} reviewed with rating ${rating}, kept in queue`);
            }
            
            // 6. 通知观察者
            this.manager.notifyObservers({
                type: 'card-updated',
                cardIds: [cardId],
                timestamp: Date.now(),
            });
        } catch (error) {
            console.error(`[${this.type}] Failed to handle review:`, error);
            throw error;
        }
    }
    
    /**
     * 跳过卡片
     * 
     * 默认实现：将卡片移到队列末尾。
     * 子类可以覆盖此方法以提供自定义行为。
     * 
     * @param cardId 卡片 ID
     */
    public async skip(cardId: string): Promise<void> {
        try {
            if (this.cards.length === 0) {
                await this.getAllCards();
            }
            
            const index = this.cards.findIndex(c => c.id === cardId || c.blockId === cardId);
            if (index === -1) {
                console.warn(`[${this.type}] Card ${cardId} not found in queue`);
                return;
            }
            
            const card = this.cards[index];
            this.cards.splice(index, 1);
            this.cards.push(card);
            
            console.log(`[${this.type}] Card ${cardId} skipped (moved to end)`);
            this.notifyObservers();
        } catch (error) {
            console.error(`[${this.type}] Failed to skip card:`, error);
            throw error;
        }
    }
    
    /**
     * 获取队列统计信息
     * 
     * 默认实现：基于当前队列卡片计算统计。
     * 子类可以覆盖此方法以提供更精确的统计。
     * 
     * @returns 队列统计数据
     */
    public async getStats(): Promise<QueueStats> {
        try {
            if (this.cards.length === 0) {
                await this.getAllCards();
            }
            
            const now = Date.now();
            const total = this.cards.length;
            const due = this.cards.filter(c => c.due <= now).length;
            const newCards = this.cards.filter(c => c.reps === 0).length;
            const learning = this.cards.filter(c => c.state === 1).length;
            
            return {
                total,
                due,
                new: newCards,
                learning,
                reviewed: 0, // 默认不跟踪已复习数量
            };
        } catch (error) {
            console.error(`[${this.type}] Failed to get stats:`, error);
            throw error;
        }
    }
    
    /**
     * 获取队列 UI 配置
     * 
     * 默认实现：返回标准的 4 按钮配置。
     * 子类可以覆盖此方法以提供自定义 UI 配置。
     * 
     * @returns UI 配置对象
     */
    public getUIConfig(): QueueUIConfig {
        return {
            displayName: this.name || this.type,
            buttons: this.getDefaultButtons(),
            showSkipButton: true,
            showProgressBar: true,
        };
    }
    
    /**
     * 获取默认按钮配置
     * 
     * 返回标准的 4 按钮配置（Again, Hard, Good, Easy）。
     * 
     * @returns 按钮配置数组
     */
    protected getDefaultButtons(): ReviewButtonConfig[] {
        return [
            { type: 'rating', label: 'Again', value: 1 },
            { type: 'rating', label: 'Hard', value: 2 },
            { type: 'rating', label: 'Good', value: 3 },
            { type: 'rating', label: 'Easy', value: 4 },
        ];
    }
    
    /**
     * 获取Learning Steps配置
     * 
     * 从插件配置读取learning steps配置，如果未配置则返回默认值。
     * 
     * **Learning Steps机制说明**：
     * 
     * Learning steps定义了新卡片和失败卡片的学习路径，参考Anki和FSRS的设计：
     * - 新卡片（New）：使用 `learning_steps` 定义学习路径
     * - 失败卡片（Review → Relearning）：使用 `relearning_steps` 定义重新学习路径
     * - 评分1（Again）：返回第一个step，重置学习进度
     * - 评分2（Hard）：使用介于Again和Good之间的间隔
     * - 评分3（Good）：进入下一个step，完成所有steps后毕业
     * - 评分4（Easy）：直接毕业，跳过所有steps
     * 
     * **配置优先级**：
     * 1. Per-deck配置（未来支持）
     * 2. 全局插件配置（未来支持）
     * 3. 默认配置
     * 
     * @returns Learning Steps配置对象
     * 
     * @example
     * // 获取配置
     * const config = this.getLearningStepsConfig();
     * // {
     * //   learning_steps: ['1m', '10m'],
     * //   relearning_steps: ['10m'],
     * //   easy_bonus: 1.3,
     * //   graduating_interval_good: 1,
     * //   graduating_interval_easy: 4
     * // }
     * 
     * @example
     * // 在handleReview中使用
     * protected async handleReview(cardId: string, rating: number): Promise<void> {
     *   const card = await this.getCard(cardId);
     *   if (rating < 3) {
     *     // 使用learning steps机制
     *     const newDue = this.calculateNextDueDateForLowRating(card, rating);
     *     card.due = newDue;
     *   }
     * }
     * 
     * @see .kiro/specs/learning-steps-rating-fix/design.md 3.1
     * @see .kiro/specs/learning-steps-rating-fix/requirements.md 4.1
     */
    protected getLearningStepsConfig(): LearningStepsConfig {
        // TODO: 未来从插件配置读取
        // 1. 尝试读取per-deck配置（如果支持）
        // 2. 尝试读取全局插件配置
        // 3. 使用默认配置作为fallback
        
        // 当前实现：直接返回默认配置
        const config = DEFAULT_LEARNING_STEPS_CONFIG;
        
        // 调试日志：记录使用的learning steps配置
        console.log(`[${this.type}] Learning Steps Config:`, {
            learning_steps: config.learning_steps,
            relearning_steps: config.relearning_steps,
            easy_bonus: config.easy_bonus,
            graduating_interval_good: config.graduating_interval_good,
            graduating_interval_easy: config.graduating_interval_easy,
        });
        
        return config;
    }
    
    /**
     * 将learning step字符串转换为毫秒
     * 
     * 这是learning steps机制的基础工具方法，用于将人类可读的时间格式
     * （如'1m', '10m', '1h'）转换为程序使用的毫秒数。
     * 
     * **支持的单位**：
     * - 'm': 分钟 (minutes) - 例如 '1m' = 1分钟 = 60000毫秒
     * - 'h': 小时 (hours) - 例如 '1h' = 1小时 = 3600000毫秒
     * - 'd': 天 (days) - 例如 '1d' = 1天 = 86400000毫秒
     * 
     * **格式要求**：
     * - 数值部分必须是非负整数
     * - 单位部分必须是'm', 'h', 'd'之一
     * - 格式：数值 + 单位，例如 '10m', '2h', '1d'
     * 
     * @param step - 时间步骤字符串，格式: '1m', '10m', '1h', '2h', '1d' 等
     * @returns 毫秒数
     * @throws {Error} 如果step格式无效、单位不支持或值为负数
     * 
     * @example
     * // 基本用法
     * this.convertStepToMs('1m')  // 60000 (1分钟)
     * this.convertStepToMs('10m') // 600000 (10分钟)
     * this.convertStepToMs('1h')  // 3600000 (1小时)
     * this.convertStepToMs('1d')  // 86400000 (1天)
     * 
     * @example
     * // 在calculateAgainInterval中使用
     * const firstStep = config.learning_steps[0]; // '1m'
     * const delayMs = this.convertStepToMs(firstStep); // 60000
     * return Date.now() + delayMs; // 1分钟后
     * 
     * @example
     * // 错误处理
     * try {
     *   this.convertStepToMs('invalid'); // 抛出错误
     * } catch (error) {
     *   console.error('Invalid step format:', error.message);
     * }
     * 
     * @see .kiro/specs/learning-steps-rating-fix/design.md 3.2
     */
    protected convertStepToMs(step: string): number {
        // 验证输入不为空
        if (!step || step.length < 2) {
            throw new Error(`Invalid step format: ${step}`);
        }
        
        // 提取单位和数值
        const unit = step.slice(-1);
        const valueStr = step.slice(0, -1);
        const value = parseInt(valueStr, 10);
        
        // 验证数值有效性
        if (isNaN(value) || value < 0) {
            throw new Error(`Invalid step value: ${step}`);
        }
        
        // 根据单位转换为毫秒
        switch (unit) {
            case 'm': // 分钟
                return value * 60 * 1000;
            case 'h': // 小时
                return value * 60 * 60 * 1000;
            case 'd': // 天
                return value * 24 * 60 * 60 * 1000;
            default:
                throw new Error(`Invalid step unit: ${step}. Supported units: 'm' (minutes), 'h' (hours), 'd' (days)`);
        }
    }

    /**
     * 计算评分1（Again）的间隔
     *
     * 当用户评分为1（Again）时，使用第一个learning step作为延迟间隔。
     * 这避免了卡片立即重新出现，给用户"喘息"的时间。
     *
     * **Learning Steps机制核心**：
     * 
     * 这是learning steps机制的关键方法之一。在旧的实现中，评分1会返回
     * `Date.now()`，导致卡片立即重新出现。新的实现使用第一个learning step
     * （默认1分钟）作为延迟，让用户有时间思考和准备。
     * 
     * **工作原理**：
     * 1. 根据卡片状态选择steps：
     *    - New/Learning状态 → 使用 `learning_steps`
     *    - Review状态 → 使用 `relearning_steps`
     * 2. 获取第一个step（如'1m'）
     * 3. 转换为毫秒（60000ms）
     * 4. 返回 now + 延迟时间
     * 
     * **状态转换**：
     * - New → Learning (step 0)
     * - Learning → Learning (step 0)
     * - Review → Relearning (step 0)
     *
     * @param card - 卡片对象
     * @returns 下次到期时间（时间戳，毫秒）
     *
     * @example
     * // 基本用法：learning_steps = ['1m', '10m']
     * const card = { state: CardState.Learning, learning_step: 1 };
     * const dueDate = this.calculateAgainInterval(card);
     * // dueDate = now + 60000 (1分钟后)
     * // 用户在1分钟后才会再次看到这张卡片
     *
     * @example
     * // Review状态卡片失败：relearning_steps = ['10m']
     * const card = { state: CardState.Review };
     * const dueDate = this.calculateAgainInterval(card);
     * // dueDate = now + 600000 (10分钟后)
     * 
     * @example
     * // 空steps数组的fallback
     * const card = { state: CardState.New };
     * const dueDate = this.calculateAgainInterval(card);
     * // dueDate = now + 60000 (默认1分钟)
     * 
     * @example
     * // 在动态队列的handleReview中使用
     * async handleReview(cardId: string, rating: number): Promise<void> {
     *   const card = this.cards.find(c => c.id === cardId);
     *   if (rating === 1) {
     *     // 使用learning steps机制，避免立即重复
     *     card.due = this.calculateAgainInterval(card);
     *     // 如果队列中有其他卡片，会先显示其他卡片
     *   }
     * }
     *
     * @see .kiro/specs/learning-steps-rating-fix/design.md 3.3.1
     * @see .kiro/specs/learning-steps-rating-fix/requirements.md 4.2
     */
    protected calculateAgainInterval(card: FSRSCard): number {
        const now = Date.now();
        const config = this.getLearningStepsConfig();

        // 根据卡片状态选择learning steps或relearning steps
        const steps = card.state === CardState.Review
            ? config.relearning_steps
            : config.learning_steps;

        // 调试日志：记录评分1的详细信息
        console.log(`[${this.type}] Rating 1 (Again) - Card ${card.id}:`, {
            cardState: card.state,
            stepsType: card.state === CardState.Review ? 'relearning_steps' : 'learning_steps',
            steps: steps,
        });

        // 如果没有配置steps，使用默认1分钟
        if (!steps || steps.length === 0) {
            console.warn(`[${this.type}] No learning steps configured, using default 1 minute`);
            const dueDate = now + 60 * 1000;
            console.log(`[${this.type}] Again interval calculation:`, {
                firstStep: '1m (default)',
                delayMs: 60000,
                delayMinutes: 1,
                newDueDate: new Date(dueDate).toISOString(),
            });
            return dueDate;
        }

        // 获取第一个learning step并转换为毫秒
        const firstStep = steps[0];
        const delayMs = this.convertStepToMs(firstStep);
        const dueDate = now + delayMs;

        // 调试日志：记录间隔计算过程
        console.log(`[${this.type}] Again interval calculation:`, {
            firstStep: firstStep,
            delayMs: delayMs,
            delayMinutes: Math.round(delayMs / 60000 * 10) / 10,
            newDueDate: new Date(dueDate).toISOString(),
        });

        return dueDate;
    }

    /**
     * 计算评分2（Hard）的间隔
     *
     * 当用户评分为2（Hard）时，使用介于Again和Good之间的间隔。
     * 
     * **计算规则**：
     * - 如果只有一个learning step：`first_step * 1.5`
     * - 如果有多个learning steps：`(first_step + next_step) / 2`
     *
     * 这确保了Hard的间隔始终大于Again，但小于Good，提供合理的难度梯度。
     * 
     * **工作原理**：
     * 
     * Hard评分表示卡片有一定难度，但不至于完全忘记。因此间隔应该：
     * - 比Again（完全忘记）更长，给用户更多时间巩固
     * - 比Good（记住了）更短，需要更频繁的复习
     * 
     * 单个step场景（如 learning_steps = ['10m']）：
     * - Again: 10分钟
     * - Hard: 15分钟（10 * 1.5）
     * - Good: 进入下一阶段或毕业
     * 
     * 多个steps场景（如 learning_steps = ['1m', '10m']）：
     * - Again: 1分钟（第一个step）
     * - Hard: 5.5分钟（(1 + 10) / 2）
     * - Good: 10分钟（第二个step）
     *
     * **状态转换**：
     * - New → Learning (保持当前step)
     * - Learning → Learning (保持当前step)
     * - Review → Relearning (保持当前step)
     *
     * @param card - 卡片对象
     * @returns 下次到期时间（时间戳，毫秒）
     *
     * @example
     * // 单个step: learning_steps = ['1m']
     * const card = { state: CardState.Learning, learning_step: 0 };
     * const dueDate = this.calculateHardInterval(card);
     * // dueDate = now + 90000 (1.5分钟后)
     *
     * @example
     * // 多个steps: learning_steps = ['1m', '10m']
     * const card = { state: CardState.Learning, learning_step: 0 };
     * const dueDate = this.calculateHardInterval(card);
     * // dueDate = now + 330000 (5.5分钟后，即(1+10)/2)
     * 
     * @example
     * // 在动态队列的handleReview中使用
     * async handleReview(cardId: string, rating: number): Promise<void> {
     *   const card = this.cards.find(c => c.id === cardId);
     *   if (rating === 2) {
     *     // Hard评分：使用介于Again和Good之间的间隔
     *     card.due = this.calculateHardInterval(card);
     *     // 间隔保证：Again < Hard < Good
     *   }
     * }
     *
     * @see .kiro/specs/learning-steps-rating-fix/design.md 3.3.2
     * @see .kiro/specs/learning-steps-rating-fix/requirements.md 4.3
     */
    protected calculateHardInterval(card: FSRSCard): number {
        const now = Date.now();
        const config = this.getLearningStepsConfig();

        // 根据卡片状态选择learning steps或relearning steps
        const steps = card.state === CardState.Review || card.state === CardState.Relearning
            ? config.relearning_steps
            : config.learning_steps;

        // 调试日志：记录评分2的详细信息
        console.log(`[${this.type}] Rating 2 (Hard) - Card ${card.id}:`, {
            cardState: card.state,
            stepsType: (card.state === CardState.Review || card.state === CardState.Relearning) 
                ? 'relearning_steps' 
                : 'learning_steps',
            steps: steps,
        });

        // 如果没有配置steps，使用默认1分钟
        if (!steps || steps.length === 0) {
            console.warn(`[${this.type}] No learning steps configured, using default 1 minute`);
            const dueDate = now + 60 * 1000;
            console.log(`[${this.type}] Hard interval calculation:`, {
                stepsCount: 0,
                calculationMethod: 'default',
                delayMs: 60000,
                delayMinutes: 1,
                newDueDate: new Date(dueDate).toISOString(),
            });
            return dueDate;
        }

        const currentStep = 0; // Default to first step since learning_step is not tracked on FSRSCard
        const firstStepMs = this.convertStepToMs(steps[0]);
        let dueDate: number;
        let calculationDetails: any;

        if (steps.length === 1) {
            // 只有一个step：first_step * 1.5
            dueDate = now + Math.round(firstStepMs * 1.5);
            calculationDetails = {
                stepsCount: 1,
                calculationMethod: 'first_step * 1.5',
                firstStep: steps[0],
                firstStepMs: firstStepMs,
                multiplier: 1.5,
                delayMs: Math.round(firstStepMs * 1.5),
                delayMinutes: Math.round(firstStepMs * 1.5 / 60000 * 10) / 10,
            };
        } else {
            // 多个steps：(first_step + next_step) / 2
            const nextStepIndex = Math.min(currentStep + 1, steps.length - 1);
            const nextStepMs = this.convertStepToMs(steps[nextStepIndex]);
            dueDate = now + Math.round((firstStepMs + nextStepMs) / 2);
            calculationDetails = {
                stepsCount: steps.length,
                calculationMethod: '(first_step + next_step) / 2',
                firstStep: steps[0],
                firstStepMs: firstStepMs,
                nextStep: steps[nextStepIndex],
                nextStepMs: nextStepMs,
                delayMs: Math.round((firstStepMs + nextStepMs) / 2),
                delayMinutes: Math.round((firstStepMs + nextStepMs) / 2 / 60000 * 10) / 10,
            };
        }

        // 调试日志：记录间隔计算过程
        console.log(`[${this.type}] Hard interval calculation:`, {
            ...calculationDetails,
            newDueDate: new Date(dueDate).toISOString(),
        });

        return dueDate;
    }

    /**
     * 计算低评分（1/2）的下次到期日期
     *
     * 使用learning steps机制，避免卡片立即重新出现。
     * 
     * **Learning Steps机制总览**：
     * 
     * 这是BaseReviewQueue基类提供的核心方法，所有动态队列（RetrievalPracticeQueue、
     * IncrementalLearningQueue、FilterGroupQueue）自动继承此功能。
     * 
     * **评分处理**：
     * - rating 1 (Again): 使用第一个learning step作为延迟（默认1分钟）
     * - rating 2 (Hard): 使用介于Again和Good之间的间隔（默认5.5分钟）
     * 
     * **与旧实现的对比**：
     * 
     * 旧实现（问题）：
     * ```typescript
     * if (rating === 1) {
     *   return Date.now(); // 立即重新出现！
     * }
     * ```
     * 
     * 新实现（解决方案）：
     * ```typescript
     * if (rating === 1) {
     *   return this.calculateAgainInterval(card); // 1分钟后出现
     * }
     * ```
     * 
     * **使用场景**：
     * 
     * 所有动态队列的`handleReview`方法都会调用此方法处理低评分：
     * 1. 用户评分1或2
     * 2. 调用`calculateNextDueDateForLowRating`计算新的due时间
     * 3. 更新卡片的due字段
     * 4. 根据新due决定是否保留在队列中
     * 5. 如果队列中有其他卡片，会先显示其他卡片
     *
     * @param card - 卡片对象
     * @param rating - 评分 (1 或 2)
     * @returns 下次到期时间（时间戳，毫秒）
     *
     * @example
     * // 评分1（Again）- learning_steps = ['1m', '10m']
     * const card = { state: CardState.Learning, learning_step: 0 };
     * const dueDate = this.calculateNextDueDateForLowRating(card, 1);
     * // dueDate = now + 60000 (1分钟后)
     *
     * @example
     * // 评分2（Hard）- learning_steps = ['1m', '10m']
     * const card = { state: CardState.Learning, learning_step: 0 };
     * const dueDate = this.calculateNextDueDateForLowRating(card, 2);
     * // dueDate = now + 330000 (5.5分钟后，即(1+10)/2)
     * 
     * @example
     * // 在动态队列中使用（所有动态队列都继承此方法）
     * class RetrievalPracticeQueue extends BaseReviewQueue {
     *   async handleReview(cardId: string, rating: number): Promise<void> {
     *     const card = this.cards.find(c => c.id === cardId);
     *     
     *     if (rating >= 3) {
     *       // 高评分：使用FSRS算法
     *       // ...
     *     } else {
     *       // 低评分：使用learning steps机制（继承自基类）
     *       const newDueDate = this.calculateNextDueDateForLowRating(card, rating);
     *       card.due = newDueDate;
     *       
     *       // 根据新due决定是否保留在队列中
     *       if (newDueDate > this.dayEnd) {
     *         await this.removeCard(cardId); // 超出今天范围，移除
     *       }
     *       // 否则保留在队列中，1分钟后重新出现
     *     }
     *   }
     * }
     *
     * @see .kiro/specs/learning-steps-rating-fix/design.md 3.5
     * @see .kiro/specs/learning-steps-rating-fix/requirements.md 4.2, 4.3
     */
    protected calculateNextDueDateForLowRating(card: FSRSCard, rating: number): number {
        // 调试日志：记录评分处理开始
        console.log(`[${this.type}] Processing low rating for card ${card.id}:`, {
            rating: rating,
            ratingLabel: rating === 1 ? 'Again' : 'Hard',
            cardState: card.state,
            currentDue: card.due ? new Date(card.due).toISOString() : 'N/A',
        });

        let dueDate: number;
        if (rating === 1) {
            // Again: 使用第一个learning step
            dueDate = this.calculateAgainInterval(card);
        } else {
            // Hard: 使用Hard间隔
            dueDate = this.calculateHardInterval(card);
        }

        // 调试日志：记录最终结果
        console.log(`[${this.type}] Low rating processing complete:`, {
            cardId: card.id,
            rating: rating,
            oldDue: card.due ? new Date(card.due).toISOString() : 'N/A',
            newDue: new Date(dueDate).toISOString(),
            delayFromNow: Math.round((dueDate - Date.now()) / 60000 * 10) / 10 + ' minutes',
        });

        return dueDate;
    }



    
    /**
     * 判断是否为动态队列
     * 
     * 子类必须实现此方法以标识队列类型。
     * - 动态队列：自动获取到期卡片（检索练习、渐进学习、过滤组）
     * - 静态队列：仅包含手动管理的卡片（最终训练、神经漫游）
     * 
     * @returns true 表示动态队列，false 表示静态队列
     * @see 需求 5.1, 6.1
     */
    public abstract isDynamic(): boolean;

    /**
     * 刷新队列
     */
    public async refresh(): Promise<void> {
        await this.getAllCards();
        this.clearSizeCache();
        this.notifyObservers();
    }

    /**
     * 清空队列
     */
    public async clear(): Promise<void> {
        this.cards = [];
        this.clearSizeCache();
        this.notifyObservers();
    }

    /**
     * 获取队列大小
     * 
     * 注意：总是调用 getCards() 以确保返回最新的队列大小
     */
    public async getSize(): Promise<number> {
        const cards = await this.getCards();
        console.log(`[${this.name}] getSize: returning ${cards.length} cards`);
        return cards.length;
    }

    /**
     * 判断队列是否为空
     */
    public async isEmpty(): Promise<boolean> {
        return (await this.getSize()) === 0;
    }

    /**
     * 排序队列
     */
    public async sort(compareFn?: (a: FSRSCard, b: FSRSCard) => number): Promise<void> {
        if (this.cards.length === 0) {
            await this.getAllCards();
        }
        if (compareFn) {
            this.cards.sort(compareFn);
        } else {
            this.cards.sort((a, b) => a.due - b.due);
        }
        this.notifyObservers();
    }

    /**
     * 过滤队列
     */
    public async filter(predicate: (card: FSRSCard) => boolean): Promise<FSRSCard[]> {
        if (this.cards.length === 0) {
            await this.getAllCards();
        }
        return this.cards.filter(predicate);
    }

    /**
     * 订阅队列变更
     */
    public subscribe(observer: QueueObserver): void {
        if (!this.observers.includes(observer)) {
            this.observers.push(observer);
        }
    }

    /**
     * 取消订阅队列变更
     */
    public unsubscribe(observer: QueueObserver): void {
        this.observers = this.observers.filter(o => o !== observer);
    }

    /**
     * 通知所有订阅者
     */
    public notifyObservers(): void {
        this.observers.forEach(observer => observer.onQueueUpdate(this));
    }
    
    /**
     * 重新排序队列
     * 
     * 默认实现：使用内存中的排序覆盖（不持久化）。
     * 子类可以覆盖此方法以实现自定义排序逻辑（如持久化）。
     * 
     * 实现说明：
     * - 动态队列：支持临时排序覆盖，影响 getCards() 的返回顺序
     * - 静态队列：支持持久化排序，永久改变队列顺序
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功，false 表示失败
     */
    public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
        try {
            console.log(`[${this.type}] Reordering ${orderedCards.length} cards`);
            
            // 将排序顺序存储在内存中
            this.customOrder = orderedCards.map(card => card.id);
            
            // 通知观察者队列已变更（触发复习界面刷新）
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: this.type,
                timestamp: Date.now()
            });
            
            console.log(`[${this.type}] Reorder completed successfully (in-memory)`);
            return true;
        } catch (error) {
            console.error(`[${this.type}] Failed to reorder:`, error);
            return false;
        }
    }
    
    /**
     * 清除自定义排序
     * 
     * 恢复到默认排序（动态队列按算法排序，静态队列按添加顺序）
     */
    public clearCustomOrder(): void {
        this.customOrder = null;
        console.log(`[${this.type}] Custom order cleared`);
    }
    
    /**
     * 应用自定义排序到卡片数组
     * 
     * 如果存在自定义排序，按照自定义顺序重新排列卡片。
     * 
     * @param cards 原始卡片数组
     * @returns 排序后的卡片数组
     */
    protected applyCustomOrder(cards: FSRSCard[]): FSRSCard[] {
        if (!this.customOrder || this.customOrder.length === 0) {
            return cards;
        }
        
        // 创建卡片 ID 到卡片的映射
        const cardMap = new Map<string, FSRSCard>();
        for (const card of cards) {
            cardMap.set(card.id, card);
        }
        
        // 按照自定义顺序重新排列
        const orderedCards: FSRSCard[] = [];
        for (const cardId of this.customOrder) {
            const card = cardMap.get(cardId);
            if (card) {
                orderedCards.push(card);
                cardMap.delete(cardId);
            }
        }
        
        // 添加不在自定义顺序中的卡片（保持在末尾）
        for (const card of cardMap.values()) {
            orderedCards.push(card);
        }
        
        return orderedCards;
    }
    
    /**
     * 自定义排序顺序（卡片 ID 数组）
     * 
     * 用于临时覆盖队列的默认排序。
     * - null 表示使用默认排序
     * - 非空数组表示使用自定义排序
     */
    protected customOrder: string[] | null = null;
    
    /**
     * 临时黑名单（会话级，不持久化）
     * 
     * 用于临时移除不想复习的卡片。移除的卡片在当前会话中不再显示，
     * 但关闭浏览器或重新加载插件后会自动恢复。
     * 
     * 特性：
     * - 只存在于内存中，不持久化
     * - 每个队列实例维护独立的黑名单
     * - 通过 addCard() 可以立即恢复被移除的卡片
     * 
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     * @see .kiro/specs/retrieval-practice-browser-display-fix/design.md
     */
    protected temporaryBlacklist: Set<string> = new Set();
    
    /**
     * 获取临时黑名单大小
     * 
     * 用于调试和统计临时移除的卡片数量。
     * 
     * @returns 临时黑名单中的卡片数量
     */
    public getTemporaryBlacklistSize(): number {
        return this.temporaryBlacklist.size;
    }
    
    /**
     * 清空临时黑名单
     * 
     * 用于测试或手动恢复所有被移除的卡片。
     * 调用此方法后，所有被临时移除的卡片将重新出现在队列中。
     */
    public clearTemporaryBlacklist(): void {
        this.temporaryBlacklist.clear();
        console.log(`[${this.constructor.name}] Temporary blacklist cleared`);
    }
    
    /**
     * 插入卡片到指定位置
     * 
     * @param cardId 卡片 ID
     * @param position 位置 (1-based)
     */
    public async insertAt(cardId: string, position: number): Promise<void> {
        try {
            // 1. 验证位置
            const size = await this.getSize();
            if (position < 1 || position > size) {
                throw new Error(`Invalid position: ${position}, queue size: ${size}`);
            }
            
            // 2. 获取当前队列
            if (this.cards.length === 0) {
                await this.getAllCards();
            }
            
            // 3. 找到目标卡片
            const cardIndex = this.cards.findIndex(c => c.id === cardId || c.blockId === cardId);
            if (cardIndex === -1) {
                throw new Error(`Card not found: ${cardId}`);
            }
            
            // 4. 移除卡片
            const [card] = this.cards.splice(cardIndex, 1);
            
            // 5. 插入到指定位置 (position - 1 因为是 0-based)
            this.cards.splice(position - 1, 0, card);
            
            // 6. 更新自定义排序
            this.customOrder = this.cards.map(c => c.id);
            
            console.log(`[${this.type}] Card ${cardId} inserted at position ${position}`);
            
            // 7. 通知观察者
            this.notifyObservers();
        } catch (error) {
            console.error(`[${this.type}] Failed to insert card:`, error);
            throw error;
        }
    }
    
    /**
     * 获取剩余卡片数量
     */
    public async getRemainingSize(): Promise<number> {
        const now = Date.now();
        
        // 使用缓存
        if (this.cachedSize !== null && now - this.cacheTimestamp < this.CACHE_TTL) {
            return this.cachedSize;
        }
        
        // 重新计算
        if (this.cards.length === 0) {
            await this.getAllCards();
        }
        this.cachedSize = this.cards.length;
        this.cacheTimestamp = now;
        
        return this.cachedSize;
    }
    
    /**
     * 清除缓存（在队列变化时调用）
     */
    protected clearSizeCache(): void {
        this.cachedSize = null;
    }
    
    /**
     * 队列大小缓存
     */
    private cachedSize: number | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5000; // 5 秒缓存
}
