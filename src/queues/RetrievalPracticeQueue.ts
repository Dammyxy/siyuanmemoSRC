/**
 * Retrieval Practice Queue
 * 检索练习队列
 * 
 * 动态队列，自动获取到期的项目卡片，支持手动添加卡片。
 * 
 * 核心功能：
 * - 自动包含所有到期的项目卡片
 * - 支持手动添加未到期卡片
 * - 按到期日期和优先级排序
 * - 评分 3/4 移除卡片，1/2 保留并添加到最终训练
 * - 持久化手动添加的卡片列表
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType } from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import type { QueueItem } from '../core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { resolveCardId } from '../diagnostics/type-guards';

/**
 * 检索练习队列类
 * 
 * 动态队列，自动获取到期的项目卡片。
 * 
 * 队列行为：
 * - 自动包含所有到期的项目卡片（cardType === 'item'）
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 评分 3/4：更新到期日期，从队列移除
 * - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
 * 
 * @see 需求 5.1, 5.4, 7.1, 7.2, 9.1
 */
export class RetrievalPracticeQueue extends BaseReviewQueue {
    public name = 'RetrievalPracticeQueue';
    /**
     * 手动添加的卡片 ID 集合
     * 
     * 使用 Set 确保唯一性，避免重复添加。
     * 这些卡片会被持久化，在应用重启后恢复。
     * 
     * @see 需求 5.4, 18.1, 18.4
     */
    private manuallyAddedCards: Set<string>;
    
    /**
     * 持久化存储键
     * 
     * 用于在 localStorage 中存储手动添加的卡片列表。
     */
    private readonly STORAGE_KEY = 'retrieval-practice-manual-cards';
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: UnifiedDataSourceManager) {
        super(manager, QueueType.RetrievalPractice);
        
        // 初始化手动添加的卡片集合
        this.manuallyAddedCards = new Set<string>();
        
        // 从持久化存储加载手动添加的卡片
        this.loadManuallyAddedCards();
    }
    
    /**
     * 判断是否为动态队列
     * 
     * 检索练习队列是动态队列，自动获取到期卡片。
     * 
     * @returns true（动态队列）
     * @see 需求 5.1
     */
    public isDynamic(): boolean {
        return true;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 获取所有到期的项目卡片（cardType === 'item', due <= now）
     * 2. 获取手动添加的卡片
     * 3. 合并并去重
     * 4. 按到期日期和优先级排序
     * 5. 应用自定义排序（如果存在）
     * 
     * @returns 卡片数组
     * @see 需求 5.1, 5.4, 15.1, 15.4
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            // 获取当前时间戳
            const now = Date.now();
            
            // 获取所有到期的项目卡片
            const dueCards = await this.manager.getCards({
                cardType: 'item',
                dueDate: { lte: new Date(now) }
            });
            
            console.log(`[RetrievalPracticeQueue] 🔍 Got ${dueCards.length} due cards from manager`);
            
            // 获取手动添加的卡片
            const manualCards = await this.getManuallyAddedCards();
            
            console.log(`[RetrievalPracticeQueue] 🔍 Got ${manualCards.length} manually added cards`);
            
            // 合并并去重
            const allCards = this.mergeAndDeduplicate(dueCards, manualCards);
            
            console.log(`[RetrievalPracticeQueue] 🔍 After merge: ${allCards.length} cards`);
            
            // 检查无效卡片（blockId 为空或 undefined）
            const invalidCards = allCards.filter(card => !card.blockId || card.blockId === 'undefined');
            if (invalidCards.length > 0) {
                console.warn(`[RetrievalPracticeQueue] ⚠️ Found ${invalidCards.length} cards with invalid blockId:`, invalidCards.map(c => ({ id: c.id, blockId: c.blockId })));
            }
            
            // 按到期日期和优先级排序
            const sortedCards = this.sortByDueDateAndPriority(allCards);
            
            // 应用自定义排序（如果存在）
            return this.applyCustomOrder(sortedCards);
        } catch (error) {
            console.error('[RetrievalPracticeQueue] Failed to get cards:', error);
            throw error;
        }
    }
    
    /**
     * 添加卡片到队列
     * 
     * 将卡片 ID 添加到手动添加的卡片集合中，并持久化。
     * 支持添加未到期的卡片，用于提前复习。
     * 
     * @param cardId 卡片 ID
     * @see 需求 5.4, 18.1, 18.4, 6.4
     */
    public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
        try {
            const cardId = resolveCardId(card);
            // 添加到手动添加的卡片集合
            this.manuallyAddedCards.add(cardId);
            
            // 持久化
            await this.persistManuallyAddedCards();
            
            // 触发观察者通知（需求 6.4：卡片添加的队列统计更新）
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: this.getType(),
                timestamp: Date.now()
            });
            
            console.log(`[RetrievalPracticeQueue] Card ${cardId} added manually`);
        } catch (error) {
            console.error('[RetrievalPracticeQueue] Failed to add card:', error);
            throw error;
        }
    }
    
    /**
     * 从队列中移除卡片
     * 
     * 从手动添加的卡片集合中移除卡片，并持久化。
     * 注意：到期卡片会自动从队列中移除（通过 getCards 的过滤逻辑）。
     * 
     * @param cardId 卡片 ID
     * @see 需求 5.5, 12.1
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            // 从手动添加的卡片集合中移除
            this.manuallyAddedCards.delete(cardIdOrBlockId);
            
            // 持久化
            await this.persistManuallyAddedCards();
            
            console.log(`[RetrievalPracticeQueue] Card ${cardIdOrBlockId} removed`);
        } catch (error) {
            console.error('[RetrievalPracticeQueue] Failed to remove card:', error);
            throw error;
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 评分 3/4（记住了）：
     *   - 更新卡片的到期日期（使用 FSRS 算法）
     *   - 从队列中移除（从手动添加集合中删除）
     * - 评分 1/2（忘记了）：
     *   - 更新卡片的到期日期（使用 FSRS 算法）
     *   - 根据新的到期日期决定是否保留在队列中：
     *     - 如果新日期仍未到期（未来），从手动添加集合中移除
     *     - 如果新日期已到期（今天或过去），保留在手动添加集合中
     *   - 自动添加到最终训练队列（标记为 'auto-failed'）
     * 
     * 注意：评分会计入卡片的调度算法（正式复习队列）。
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 7.1, 7.2, 7.7, 9.1, 18.2, 18.3
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        try {
            // 获取卡片
            const card = await this.manager.getCard(cardId);
            
            if (rating >= 3) {
                // 记住了：更新到期日期，从队列移除
                card.due = this.calculateNextDueDate(card, rating);
                await this.manager.updateCard(card);
                
                // 从手动添加集合中移除（如果存在）
                await this.removeCard(cardId);
                
                console.log(`[RetrievalPracticeQueue] Card ${cardId} reviewed with rating ${rating}, removed from queue`);
            } else {
                // 忘记了：更新到期日期，根据新日期决定是否保留
                const newDueDate = this.calculateNextDueDateForLowRating(card, rating);
                card.due = newDueDate;
                await this.manager.updateCard(card);
                
                // 根据新的到期日期决定是否保留在队列中
                const now = Date.now();
                if (newDueDate > now) {
                    // 新日期是未来，从手动添加集合中移除
                    await this.removeCard(cardId);
                    console.log(`[RetrievalPracticeQueue] Card ${cardId} reviewed with rating ${rating}, new due date is in future, removed from queue`);
                } else {
                    // 新日期是今天或过去，保留在队列中
                    console.log(`[RetrievalPracticeQueue] Card ${cardId} reviewed with rating ${rating}, kept in queue`);
                }
                
                // 自动添加到最终训练队列
                const finalDrillQueue = this.manager.getQueue(QueueType.FinalDrill);
                await finalDrillQueue.addCard(cardId, 'auto-failed');
            }
            
            // 通知观察者卡片已更新
            this.manager.notifyObservers({
                type: 'card-updated',
                cardIds: [cardId],
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[RetrievalPracticeQueue] Failed to handle review:', error);
            throw error;
        }
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 获取手动添加的卡片
     * 
     * 从手动添加的卡片 ID 集合中获取完整的卡片数据。
     * 
     * @returns 手动添加的卡片数组
     */
    private async getManuallyAddedCards(): Promise<FSRSCard[]> {
        const cards: FSRSCard[] = [];
        const toRemove: string[] = [];
        
        for (const cardId of this.manuallyAddedCards) {
            try {
                // 使用静默模式，避免记录预期的"卡片不存在"错误
                const card = await this.manager.getCard(cardId, { silent: true });
                cards.push(card);
            } catch (error) {
                // 卡片不存在是预期行为（可能已被删除），标记为待移除
                toRemove.push(cardId);
            }
        }
        
        // 批量移除不存在的卡片并持久化
        if (toRemove.length > 0) {
            for (const cardId of toRemove) {
                this.manuallyAddedCards.delete(cardId);
            }
            await this.persistManuallyAddedCards();
            console.log(`[RetrievalPracticeQueue] Removed ${toRemove.length} non-existent cards from manual additions`);
        }
        
        return cards;
    }
    
    /**
     * 合并并去重卡片
     * 
     * 将到期卡片和手动添加的卡片合并，使用 Map 去重。
     * 
     * @param dueCards 到期卡片数组
     * @param manualCards 手动添加的卡片数组
     * @returns 合并后的卡片数组
     */
    private mergeAndDeduplicate(dueCards: FSRSCard[], manualCards: FSRSCard[]): FSRSCard[] {
        const cardMap = new Map<string, FSRSCard>();
        
        // 添加到期卡片
        for (const card of dueCards) {
            cardMap.set(card.id, card);
        }
        
        // 添加手动添加的卡片（会覆盖重复的卡片）
        for (const card of manualCards) {
            cardMap.set(card.id, card);
        }
        
        return Array.from(cardMap.values());
    }
    
    /**
     * 按到期日期和优先级排序
     * 
     * 排序规则：
     * 1. 首先按到期日期排序（升序，越早到期越靠前）
     * 2. 如果到期日期相同，按优先级排序（降序，优先级越高越靠前）
     * 3. 如果优先级也相同，按卡片 ID 排序（确保稳定排序）
     * 
     * @param cards 卡片数组
     * @returns 排序后的卡片数组
     * @see 需求 15.4
     */
    private sortByDueDateAndPriority(cards: FSRSCard[]): FSRSCard[] {
        return cards.sort((a, b) => {
            // 首先按到期日期排序
            const dateDiff = a.due - b.due;
            if (dateDiff !== 0) {
                return dateDiff;
            }
            
            // 然后按优先级排序（优先级越小越优先）
            const priorityDiff = a.priority - b.priority;
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            
            // 最后按卡片 ID 排序（确保稳定排序）
            return a.id.localeCompare(b.id);
        });
    }
    
    /**
     * 计算下次到期日期
     * 
     * 使用简化的 FSRS 算法计算下次复习日期。
     * 
     * 计算逻辑：
     * - 评分 3：间隔 * 2
     * - 评分 4：间隔 * 4
     * 
     * 注意：这是一个简化的实现，实际的 FSRS 算法更复杂。
     * 在实际应用中，应该使用完整的 FSRS 调度器。
     * 
     * @param card 卡片
     * @param rating 评分
     * @returns 下次到期日期（时间戳）
     */
    private calculateNextDueDate(card: FSRSCard, rating: number): number {
        // 获取当前间隔（天数）
        const currentInterval = card.scheduledDays || 1;
        
        // 根据评分计算新间隔
        let newInterval: number;
        if (rating === 3) {
            // Good: 间隔 * 2
            newInterval = currentInterval * 2;
        } else {
            // Easy: 间隔 * 4
            newInterval = currentInterval * 4;
        }
        
        // 计算下次到期日期
        const now = Date.now();
        const nextDue = now + newInterval * 24 * 60 * 60 * 1000; // 转换为毫秒
        
        return nextDue;
    }
    
    /**
     * 计算低评分（1/2）的下次到期日期
     * 
     * 对于评分 1/2（忘记了），使用 FSRS 算法计算新的到期日期。
     * 
     * 计算逻辑：
     * - 评分 1（Again）：重置间隔，通常设置为今天或明天
     * - 评分 2（Hard）：减少间隔，通常设置为今天或短期内
     * 
     * 注意：这是一个简化的实现。实际的 FSRS 算法会考虑更多因素，
     * 如难度、稳定性、遗忘曲线等。
     * 
     * @param card 卡片
     * @param rating 评分 (1 或 2)
     * @returns 下次到期日期（时间戳）
     * @see 需求 18.3
     */
    private calculateNextDueDateForLowRating(card: FSRSCard, rating: number): number {
        const now = Date.now();
        
        if (rating === 1) {
            // Again: 重置为今天（立即复习）
            return now;
        } else {
            // Hard: 设置为今天或短期内
            // 使用当前间隔的一半，但至少是今天
            const currentInterval = card.scheduledDays || 1;
            const newInterval = Math.max(0, currentInterval * 0.5);
            return now + newInterval * 24 * 60 * 60 * 1000;
        }
    }
    
    /**
     * 从持久化存储加载手动添加的卡片
     * 
     * 从 localStorage 加载手动添加的卡片 ID 列表。
     * 如果加载失败，初始化为空集合。
     * 
     * @see 需求 18.4
     */
    private loadManuallyAddedCards(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const cardIds: string[] = JSON.parse(stored);
                this.manuallyAddedCards = new Set(cardIds);
                console.log(`[RetrievalPracticeQueue] Loaded ${cardIds.length} manually added cards from storage`);
            }
        } catch (error) {
            console.error('[RetrievalPracticeQueue] Failed to load manually added cards:', error);
            this.manuallyAddedCards = new Set();
        }
    }
    
    /**
     * 持久化手动添加的卡片
     * 
     * 将手动添加的卡片 ID 列表保存到 localStorage。
     * 
     * @see 需求 18.4
     */
    private async persistManuallyAddedCards(): Promise<void> {
        try {
            const cardIds = Array.from(this.manuallyAddedCards);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cardIds));
            console.log(`[RetrievalPracticeQueue] Persisted ${cardIds.length} manually added cards`);
        } catch (error) {
            console.error('[RetrievalPracticeQueue] Failed to persist manually added cards:', error);
            throw error;
        }
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
        console.warn('[RetrievalPracticeQueue] getAllItems() is deprecated, use getAllCards() instead');
        // 返回当前缓存的卡片
        return this.cards;
    }
}
