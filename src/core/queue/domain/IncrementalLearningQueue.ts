/**
 * Incremental Learning Queue
 * 渐进学习队列
 * 
 * 动态队列，自动获取所有到期卡片（项目卡片和主题卡片）。
 * 
 * 核心功能：
 * - 自动包含所有到期的项目卡片和主题卡片
 * - 支持手动添加未到期卡片
 * - 按到期日期和优先级排序
 * - 评分 3/4 移除卡片，1/2 保留并添加到最终训练
 * - 持久化手动添加的卡片列表
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { ManualCardCollectionQueue } from './ManualCardCollectionQueue';
import { QueueType, QueueUIConfig, ReviewButtonConfig } from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { AutoFailedCardSinkPort, QueuePersistencePort } from './ports';
import { createLogger } from '@/utils/logger';

const logger = createLogger('IncrementalLearningQueue');
const NOOP_AUTO_FAILED_SINK: AutoFailedCardSinkPort = {
    async addAutoFailed(): Promise<void> {
        return;
    }
};

interface IncrementalLearningQueueOptions {
    autoFailedSink?: AutoFailedCardSinkPort;
}

/**
 * 渐进学习队列类
 * 
 * 动态队列，自动获取所有到期卡片（项目和主题）。
 * 
 * 队列行为：
 * - 自动包含所有到期的卡片（项目和主题）
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 评分 3/4：更新到期日期，从队列移除
 * - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
 * 
 * @see 需求 5.2, 7.3, 7.4, 9.2
 */
export class IncrementalLearningQueue extends ManualCardCollectionQueue {
    public name = 'IncrementalLearningQueue';
    private readonly autoFailedSink: AutoFailedCardSinkPort;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param queuePersistence 队列持久化服务（依赖注入）
     */
    constructor(
        manager: UnifiedDataSourceManager,
        queuePersistence: QueuePersistencePort,
        options: IncrementalLearningQueueOptions = {}
    ) {
        super(manager, QueueType.IncrementalLearning, {
            queuePersistence,
            storageKey: 'incrementalLearningQueue',
            persistenceContext: 'IncrementalLearningQueue',
        });

        this.autoFailedSink = options.autoFailedSink ?? NOOP_AUTO_FAILED_SINK;
        if (!options.autoFailedSink) {
            logger.warn('AutoFailedCardSinkPort not provided. Failed reviews will not be escalated.');
        }
        
        // 注意：不在构造函数中调用 load()，由外部调用
        // this.loadManuallyAddedCards();
    }
    
    /**
     * 从持久化服务加载状态
     * 
     * 加载手动添加的卡片 ID 列表。
     * 如果没有保存的数据，初始化为空集合。
     * 
     * @see 需求 4.2, 4.5
     */
    async load(): Promise<void> {
        const { fromStorage, count } = this.loadManualCardState(logger);
        if (fromStorage) {
            logger.info(`Loaded ${count} manually added cards`);
        } else {
            logger.info('No saved data found, starting with empty set');
        }
    }
    
    /**
     * 保存状态到持久化服务
     * 
     * 保存手动添加的卡片 ID 列表。
     * 使用键名 "incrementalLearningQueue"。
     * 
     * @see 需求 4.2, 4.5, 4.6
     */
    async save(): Promise<void> {
        const count = await this.saveManualCardState(logger);
        logger.info(`Saved ${count} manually added cards`);
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns true（动态队列）
     * @see 需求 5.2
     */
    public isDynamic(): boolean {
        return true;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 获取所有到期的卡片（项目和主题）
     * 2. 获取手动添加的卡片
     * 3. 合并并去重
     * 4. 过滤临时黑名单中的卡片
     * 5. 按到期日期和优先级排序
     * 6. 应用自定义排序（如果存在）
     * 
     * @returns 卡片数组
     * @see 需求 5.2, 15.1, 15.4
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            await this.ensureInitialLoad();
            const now = Date.now();
            
            // 获取所有到期的卡片（所有类型）
            // ✅ 包含所有类型：item、concept、descriptor、topic、incremental、webpage
            const dueCards = await this.manager.getCards({
                cardType: ['item', 'concept', 'descriptor', 'topic', 'incremental', 'webpage'],
                dueDate: { lte: new Date(now) }
            });
            
            logger.debug(`Got ${dueCards.length} due cards from manager`);
            
            // 获取手动添加的卡片
            const manualCards = await this.getManuallyAddedCards();
            
            logger.debug(`Got ${manualCards.length} manually added cards`);
            
            // 合并并去重
            const allCards = this.mergeUniqueCards(dueCards, manualCards);
            
            logger.debug(`After merge: ${allCards.length} cards`);
            
            // 过滤临时黑名单中的卡片
            const filteredCards = allCards.filter(card => 
                !this.temporaryBlacklist.has(card.id)
            );
            
            if (filteredCards.length < allCards.length) {
                logger.debug(`Filtered ${allCards.length - filteredCards.length} cards from temporary blacklist`);
            }
            
            // 按到期日期和优先级排序
            const sortedCards = this.sortByDuePriority(filteredCards);
            
            // 应用自定义排序（如果存在）
            return this.applyCustomOrder(sortedCards);
        } catch (error) {
            logger.error('Failed to get cards:', error);
            throw error;
        }
    }
    
    /**
     * 添加卡片到队列
     * 
     * 将卡片 ID 添加到手动添加的卡片集合中，并持久化。
     * 支持添加未到期的卡片，用于提前复习。
     * 
     * 如果卡片在临时黑名单中，会自动从黑名单中移除。
     * 
     * @param card 卡片对象、QueueItem 或卡片 ID
     * @see 需求 5.4, 18.1, 18.4, 6.4
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
        try {
            await this.ensureInitialLoad();
            const { cardId, wasBlacklisted } = await this.addManualCard(card, logger);
            
            // 触发观察者通知（需求 6.4：卡片添加的队列统计更新）
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: this.getType(),
                timestamp: Date.now()
            });
            
            logger.info(`Card ${cardId} added manually`, {
                wasBlacklisted,
                temporaryBlacklistSize: this.temporaryBlacklist.size
            });
        } catch (error) {
            logger.error('Failed to add card:', error);
            throw error;
        }
    }
    
    /**
     * 从队列中移除卡片
     * 
     * 移除逻辑：
     * 1. 从手动添加的卡片集合中移除（如果存在）
     * 2. 将卡片 ID 加入临时黑名单
     * 3. 持久化手动添加的卡片列表
     * 
     * 注意：临时黑名单不持久化，关闭浏览器后自动清空。
     * 
     * @param cardIdOrBlockId 卡片 ID 或块 ID
     * @see 需求 5.5, 12.2
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            await this.ensureInitialLoad();
            const { wasManuallyAdded } = await this.removeManualCard(cardIdOrBlockId, logger);
            
            logger.info(`Card ${cardIdOrBlockId} removed`, {
                wasManuallyAdded,
                temporaryBlacklistSize: this.temporaryBlacklist.size
            });
        } catch (error) {
            logger.error('Failed to remove card:', error);
            // 即使出错，也要尝试加入临时黑名单
            this.temporaryBlacklist.add(cardIdOrBlockId);
            throw error;
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 评分 3/4：使用调度器更新卡片状态，从队列移除
     * - 评分 1/2：使用调度器更新卡片状态，根据新日期决定是否保留，并自动添加到最终训练
     * 
     * 使用基类的 handleReviewWithScheduler() 方法处理调度器集成。
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 7.3, 7.4, 7.7, 9.2, 18.2, 18.3
     * @see .kiro/specs/queue-scheduler-separation/requirements.md
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        try {
            // 使用基类的调度器集成方法
            await this.handleReviewWithScheduler(cardId, rating);
            
            // 渐进学习队列特殊逻辑：评分 < 3 时自动添加到最终训练
            if (rating < 3) {
                await this.autoFailedSink.addAutoFailed(cardId);
                logger.info(`Card ${cardId} with rating ${rating} added to FinalDrill`);
            }
        } catch (error) {
            logger.error('Failed to handle review:', error);
            throw error;
        }
    }
    
    /**
     * 获取队列 UI 配置
     * 
     * 渐进学习队列使用自定义按钮配置，包括额外的操作按钮。
     * 
     * @returns UI 配置对象
     */
    public getUIConfig(): QueueUIConfig {
        return {
            displayName: '渐进学习',
            buttons: this.getIncrementalLearningButtons(),
            showSkipButton: true,
            showProgressBar: true,
            customClass: 'incremental-learning-queue',
        };
    }
    
    /**
     * 获取渐进学习队列的按钮配置
     * 
     * 包括标准的 4 个评分按钮和额外的操作按钮。
     * 
     * @returns 按钮配置数组
     */
    private getIncrementalLearningButtons(): ReviewButtonConfig[] {
        return [
            { type: 'rating', label: 'Again', value: 1 },
            { type: 'rating', label: 'Hard', value: 2 },
            { type: 'rating', label: 'Good', value: 3 },
            { type: 'rating', label: 'Easy', value: 4 },
            { type: 'action', label: 'Insert', action: 'insert' },
            { type: 'action', label: 'Next', action: 'next' },
        ];
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 获取手动添加的卡片
     */
  private async getManuallyAddedCards(): Promise<FSRSCard[]> {
        return this.resolveManuallyAddedCards(logger, async () => this.save());
    }
    
    /**
     * ✅ 兼容方法：获取所有队列项（同步）
     * 
     * 这是为了兼容旧架构的 getAllItems() 方法。
     * 新代码应该使用 getAllCards() 方法。
     * 
     * @deprecated 使用 getAllCards() 代替
     */
    public getAllItems(): any[] {
        logger.warn('getAllItems() is deprecated, use getAllCards() instead');
        // 返回当前缓存的卡片
        return this.cards;
    }
}
