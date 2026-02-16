/**
 * Unified Queue Strategy
 * 统一队列策略
 * 
 * 将 UnifiedDataSourceManager 的队列适配到 IQueueStrategy 接口，
 * 使其可以与 useReviewSession 无缝集成。
 * 
 * 核心功能：
 * - 实现 IQueueStrategy 接口
 * - 内部使用 UnifiedDataSourceManager 和 IReviewQueue
 * - 自动触发观察者通知
 * - 提供统一的错误处理和日志记录
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 4, 5, 6
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - 复习界面集成
 */

import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { QueueStats, QueueUIConfig } from '@/core/queue/types';
import type { FSRSCard } from '@/types/card';
import type { IReviewQueue } from '@/types/unified-data-source';
import { QueueType } from '@/types/unified-data-source';
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';

/**
 * 统一队列策略
 * 
 * 将 IReviewQueue 适配到 IQueueStrategy 接口，使其可以与 useReviewSession 集成。
 * 
 * 工作原理：
 * 1. 初始化时从 UnifiedDataSourceManager 获取队列实例
 * 2. 缓存卡片列表以提高性能
 * 3. next() 方法返回当前批次的下一张卡片
 * 4. onFeedback() 方法调用队列的 handleReview()，自动触发数据同步
 * 
 * 验证需求：4.1, 4.2, 4.3, 5.1, 5.2, 6.1
 * 
 * 注意：使用 any 类型来绕过 QueueItem 约束，因为 FSRSCard 的字段名与 QueueItem 不完全匹配。
 * 这是一个适配层，主要目的是功能集成。
 */
export class UnifiedQueueStrategy implements IQueueStrategy<any> {
    /**
     * 统一数据源管理器实例
     */
    private manager: UnifiedDataSourceManager;
    
    /**
     * 当前队列实例
     */
    private queue: IReviewQueue;
    
    /**
     * 队列类型
     */
    private queueType: QueueType;
    
    /**
     * 缓存的卡片列表
     */
    private cachedCards: FSRSCard[] = [];
    
    /**
     * 当前卡片索引
     */
    private currentIndex: number = 0;
    
    /**
     * 缓存是否有效
     */
    private cacheValid: boolean = false;
    
    /**
     * 构造函数
     * 
     * @param queueType 队列类型
     */
    constructor(queueType: QueueType) {
        this.queueType = queueType;
        this.manager = UnifiedDataSourceManager.getInstance();
        this.queue = this.manager.getQueue(queueType);
        
        // 注册观察者以响应队列变更
        this.manager.registerObserver({
            onDataChanged: (event) => {
                // 当队列变更时，失效缓存
                if (event.type === 'queue-changed' && event.queueType === this.queueType) {
                    console.log(`[SiyuanMemo][UnifiedQueueStrategy] Queue changed, invalidating cache: ${this.queueType}`);
                    this.invalidateCache();
                }
            }
        });
        
        console.log(`[SiyuanMemo][UnifiedQueueStrategy] Created for queue: ${queueType}`);
    }
    
    // ========================================================================
    // IQueueStrategy 接口实现
    // ========================================================================
    
    /**
     * 获取下一张卡片
     * 
     * 从缓存的卡片列表中返回下一张卡片。
     * 如果缓存无效，重新加载卡片列表。
     * 
     * 对于刻意练习队列（FinalDrill），使用动态抽牌算法：
     * - 每次调用都重新加载队列
     * - 返回第一张卡片（随机或加权随机）
     * 
     * 对于其他队列，使用顺序遍历：
     * - 缓存卡片列表
     * - 按索引顺序返回
     * 
     * 验证需求：4.2, 5.1
     * 
     * @returns 下一张卡片，如果队列为空则返回 null
     */
    async next(): Promise<FSRSCard | null> {
        try {
            // 刻意练习队列：动态抽牌算法
            if (this.queueType === 'final-drill') {
                // 每次都重新加载队列（动态抽牌）
                await this.reloadCards();
                
                // 如果队列为空，返回 null
                if (this.cachedCards.length === 0) {
                    console.log(`[SiyuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                    return null;
                }
                
                // 返回第一张卡片（队列已经处理了随机/加权逻辑）
                const card = this.cachedCards[0];
                
                // 🔧 刻意练习队列不显示下次复习时间
                console.log(`[SiyuanMemo][UnifiedQueueStrategy] Next card (dynamic draw):`, {
                    queueType: this.queueType,
                    cardId: card.id,
                    total: this.cachedCards.length
                });
                
                return card;
            }
            
            // 其他队列：顺序遍历
            // 神经漫游队列：使用扩散激活
            if (this.queueType === QueueType.NeuralRoam) {
                // 直接使用 this.queue，它已经在构造函数中初始化
                if (this.queue && typeof (this.queue as any).getNextCard === 'function') {
                    const nextCard = await (this.queue as any).getNextCard();
                    if (nextCard) {
                        // 🆕 计算 nextDues
                        const cardWithNextDues = await this.addNextDues(nextCard);
                        
                        console.log(`[SiyuanMemo][UnifiedQueueStrategy] Next card (spreading activation):`, {
                            queueType: this.queueType,
                            cardId: nextCard.id
                        });
                        return cardWithNextDues;
                    } else {
                        console.log(`[SiyuanMemo][UnifiedQueueStrategy] No more cards from spreading activation`);
                        return null;
                    }
                }
            }
            
            // 其他队列：顺序遍历
            // 如果缓存无效或用完，重新加载
            if (!this.cacheValid || this.currentIndex >= this.cachedCards.length) {
                await this.reloadCards();
            }
            
            // 如果队列为空，返回 null
            if (this.cachedCards.length === 0) {
                console.log(`[SiyuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                return null;
            }
            
            // 返回当前卡片并移动索引
            const card = this.cachedCards[this.currentIndex++];
            
            // 🆕 计算 nextDues
            const cardWithNextDues = await this.addNextDues(card);
            
            console.log(`[SiyuanMemo][UnifiedQueueStrategy] Next card:`, {
                queueType: this.queueType,
                cardId: card.id,
                index: this.currentIndex - 1,
                total: this.cachedCards.length,
                due: new Date(card.due).toISOString(),
                now: new Date(Date.now()).toISOString()
            });
            
            return cardWithNextDues;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[SiyuanMemo][UnifiedQueueStrategy] Failed to get next card:`, {
                queueType: this.queueType,
                error: errorMessage
            });
            throw new Error(`获取下一张卡片失败: ${errorMessage}`);
        }
    }
    
    /**
     * 处理用户反馈
     * 
     * 根据反馈类型调用相应的队列方法：
     * - rate: 调用 handleReview() 处理评分
     * - skip: 跳过当前卡片
     * - custom: 处理自定义操作
     * 
     * 评分后会自动触发：
     * 1. UnifiedDataSourceManager.updateCard()
     * 2. 观察者通知
     * 3. 缓存失效
     * 
     * 验证需求：4.2, 5.2, 6.1
     * 
     * @param currentItem 当前卡片
     * @param feedback 用户反馈
     */
    async onFeedback(currentItem: FSRSCard | null, feedback: QueueFeedback): Promise<void> {
        if (!currentItem) {
            console.warn(`[SiyuanMemo][UnifiedQueueStrategy] No current item for feedback`);
            return;
        }
        
        try {
            console.log(`[SiyuanMemo][UnifiedQueueStrategy] Processing feedback:`, {
                queueType: this.queueType,
                cardId: currentItem.id,
                action: feedback.action,
                rating: feedback.rating
            });
            
            if (feedback.action === 'rate' && feedback.rating) {
                // 处理评分
                await this.queue.handleReview(currentItem.id, feedback.rating);
                
                // 刻意练习队列：不需要失效缓存（每次 next() 都会重新加载）
                // 其他队列：失效缓存，下次 next() 会重新加载
                if (this.queueType !== 'final-drill') {
                    this.invalidateCache();
                }
                
                console.log(`[SiyuanMemo][UnifiedQueueStrategy] Card rated:`, {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                    rating: feedback.rating
                });
            } else if (feedback.action === 'skip') {
                // 跳过卡片（不做任何操作，只是移动到下一张）
                console.log(`[SiyuanMemo][UnifiedQueueStrategy] Card skipped:`, {
                    queueType: this.queueType,
                    cardId: currentItem.id
                });
            } else if (feedback.action === 'custom' && feedback.customActionId) {
                // 处理自定义操作
                console.log(`[SiyuanMemo][UnifiedQueueStrategy] Custom action:`, {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                    actionId: feedback.customActionId
                });
                
                // TODO: 根据 customActionId 执行相应操作
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            
            console.error(`[SiyuanMemo][UnifiedQueueStrategy] Failed to process feedback:`, {
                queueType: this.queueType,
                cardId: currentItem.id,
                action: feedback.action,
                error: errorMessage,
                stack: errorStack
            });
            
            throw new Error(`处理反馈失败: ${errorMessage}`);
        }
    }
    
    /**
     * 获取 UI 配置
     * 
     * 根据卡片类型返回相应的 UI 配置：
     * - item 卡片：显示评分按钮
     * - topic 卡片：显示插入和跳过按钮
     * 
     * 验证需求：4.1
     * 
     * @param currentItem 当前卡片
     * @returns UI 配置
     */
    getUIConfig(currentItem: any | null): QueueUIConfig {
        if (!currentItem) {
            return {
                statsType: 'queue-size',
                showRatingButtons: false,
                allowSkip: true
            };
        }
        
        // item 和 descriptor 卡片显示评分按钮
        const card = currentItem as FSRSCard;
        if (card.type === 'item' || card.type === 'descriptor') {
            return {
                statsType: 'queue-size',
                showRatingButtons: true,
                allowSkip: true
            };
        }
        
        // topic 卡片显示插入和跳过按钮
        return {
            statsType: 'queue-size',
            showRatingButtons: false,
            allowSkip: true,
            customButtons: [
                {
                    actionId: 'insert',
                    label: '插入',
                    icon: 'iconAdd'
                }
            ]
        };
    }
    
    /**
     * 获取队列统计
     * 
     * 返回队列的统计信息，包括：
     * - 总卡片数
     * - 今天到期的卡片数
     * 
     * 验证需求：4.1
     * 
     * @returns 队列统计
     */
    async getStats(): Promise<QueueStats> {
        try {
            const cards = await this.queue.getCards();
            const now = Date.now();
            
            const dueToday = cards.filter(c => c.due <= now).length;
            
            const stats: QueueStats = {
                size: cards.length,
                label: `剩余 ${dueToday} 张`,
                extra: `共 ${cards.length} 张`
            };
            
            console.log(`[SiyuanMemo][UnifiedQueueStrategy] Stats:`, {
                queueType: this.queueType,
                ...stats
            });
            
            return stats;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[SiyuanMemo][UnifiedQueueStrategy] Failed to get stats:`, {
                queueType: this.queueType,
                error: errorMessage
            });
            
            // 返回空统计
            return {
                size: 0,
                label: '0 张',
                extra: ''
            };
        }
    }
    
    /**
     * 插入卡片到指定位置
     * 
     * @param cardId 卡片 ID
     * @param position 位置 (1-based)
     */
    async insertAt(cardId: string, position: number): Promise<void> {
        try {
            console.log(`[SiyuanMemo][UnifiedQueueStrategy] insertAt called:`, {
                queueType: this.queueType,
                cardId,
                position
            });
            
            // 检查底层队列是否支持 insertAt
            if (typeof (this.queue as any).insertAt === 'function') {
                await (this.queue as any).insertAt(cardId, position);
                
                // 失效缓存，下次 next() 会重新加载
                this.invalidateCache();
                
                console.log(`[SiyuanMemo][UnifiedQueueStrategy] Card inserted via queue.insertAt:`, {
                    queueType: this.queueType,
                    cardId,
                    position
                });
            } else {
                console.error(`[SiyuanMemo][UnifiedQueueStrategy] Queue does not support insertAt:`, {
                    queueType: this.queueType,
                    queueType_actual: this.queue.constructor.name
                });
                throw new Error(`Queue type ${this.queueType} does not support insertAt`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[SiyuanMemo][UnifiedQueueStrategy] Failed to insert card:`, {
                queueType: this.queueType,
                cardId,
                position,
                error: errorMessage
            });
            throw error;
        }
    }
    
    /**
     * 获取剩余卡片数量
     * 
     * @returns 剩余卡片数量
     */
    async getRemainingSize(): Promise<number> {
        try {
            // 如果缓存有效，返回缓存的数量
            if (this.cacheValid) {
                return Math.max(0, this.cachedCards.length - this.currentIndex);
            }
            
            // 否则重新加载并返回总数
            await this.reloadCards();
            return this.cachedCards.length;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[SiyuanMemo][UnifiedQueueStrategy] Failed to get remaining size:`, {
                queueType: this.queueType,
                error: errorMessage
            });
            return 0;
        }
    }
    
    // ========================================================================
    // 私有方法
    // ========================================================================
    
    /**
     * 为卡片添加 nextDues 字段
     * 
     * 使用调度器的 preview() 方法计算每个评分的下次复习时间。
     * 
     * @param card 原始卡片
     * @returns 添加了 nextDues 字段的卡片
     */
    private async addNextDues(card: FSRSCard): Promise<any> {
        try {
            console.log('[SiyuanMemo][UnifiedQueueStrategy] 🔍 Calculating nextDues for card:', card.id);
            
            // 从全局获取插件实例
            const plugin = (window as any).siyuanMemoPlugin;
            if (!plugin || !plugin.schedulerRouter) {
                console.warn('[SiyuanMemo][UnifiedQueueStrategy] ⚠️ Plugin or schedulerRouter not found');
                return card;
            }
            
            const schedulerRouter = plugin.schedulerRouter;
            console.log('[SiyuanMemo][UnifiedQueueStrategy] 📊 SchedulerRouter obtained:', !!schedulerRouter);
            
            // 使用 preview() 方法计算所有评分的结果
            const previews = schedulerRouter.preview(card);
            
            console.log('[SiyuanMemo][UnifiedQueueStrategy] 📊 Preview results:', previews.size);
            
            // 格式化 nextDues
            const nextDues: Record<number, string> = {};
            
            for (const [rating, previewCard] of previews.entries()) {
                // 计算下次复习时间
                const nextDue = new Date(previewCard.due);
                const now = new Date();
                const diffMs = nextDue.getTime() - now.getTime();
                
                // 格式化时间差
                let formatted: string;
                if (diffMs < 60 * 1000) {
                    // 小于 1 分钟
                    formatted = '< 1 分钟';
                } else if (diffMs < 60 * 60 * 1000) {
                    // 小于 1 小时
                    const minutes = Math.round(diffMs / (60 * 1000));
                    formatted = `${minutes} 分钟`;
                } else if (diffMs < 24 * 60 * 60 * 1000) {
                    // 小于 1 天
                    const hours = Math.round(diffMs / (60 * 60 * 1000));
                    formatted = `${hours} 小时`;
                } else {
                    // 大于等于 1 天
                    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
                    formatted = `${days} 天`;
                }
                
                nextDues[rating] = formatted;
                console.log(`[SiyuanMemo][UnifiedQueueStrategy]   Rating ${rating}: ${formatted} (due: ${nextDue.toISOString()})`);
            }
            
            console.log('[SiyuanMemo][UnifiedQueueStrategy] ✅ nextDues calculated:', nextDues);
            
            // 返回添加了 nextDues 的卡片
            return {
                ...card,
                nextDues,
            };
        } catch (error) {
            console.error('[SiyuanMemo][UnifiedQueueStrategy] ❌ Failed to calculate nextDues:', error);
            console.error('[SiyuanMemo][UnifiedQueueStrategy] ❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
            console.error('[SiyuanMemo][UnifiedQueueStrategy] ❌ Error message:', error instanceof Error ? error.message : String(error));
            // 如果计算失败，返回原始卡片（不带 nextDues）
            return card;
        }
    }
    
    /**
     * 重新加载卡片列表
     * 
     * 从队列获取最新的卡片列表并缓存。
     */
    private async reloadCards(): Promise<void> {
        try {
            console.log(`[SiyuanMemo][UnifiedQueueStrategy] Reloading cards: ${this.queueType}`);
            
            const startTime = Date.now();
            this.cachedCards = await this.queue.getCards();
            this.currentIndex = 0;
            this.cacheValid = true;
            const duration = Date.now() - startTime;
            
            console.log(`[SiyuanMemo][UnifiedQueueStrategy] Cards reloaded:`, {
                queueType: this.queueType,
                cardCount: this.cachedCards.length,
                duration: `${duration}ms`
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[SiyuanMemo][UnifiedQueueStrategy] Failed to reload cards:`, {
                queueType: this.queueType,
                error: errorMessage
            });
            
            // 清空缓存
            this.cachedCards = [];
            this.currentIndex = 0;
            this.cacheValid = false;
            
            throw error;
        }
    }
    
    /**
     * 使缓存失效
     * 
     * 标记缓存为无效，下次 next() 会重新加载卡片列表。
     */
    private invalidateCache(): void {
        this.cacheValid = false;
        console.log(`[SiyuanMemo][UnifiedQueueStrategy] Cache invalidated: ${this.queueType}`);
    }
    
    /**
     * 获取队列类型
     * 
     * @returns 队列类型
     */
    getType(): QueueType {
        return this.queueType;
    }
    
    /**
     * 获取底层队列实例
     * 
     * 暴露底层队列对象，允许 UI 层直接访问队列特有的方法。
     * 这避免了在适配器层添加大量代理方法。
     * 
     * @returns 底层队列实例
     */
    getUnderlyingQueue(): IReviewQueue {
        return this.queue;
    }
}
