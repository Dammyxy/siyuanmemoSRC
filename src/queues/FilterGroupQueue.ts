/**
 * Filter Group Queue
 * 过滤组队列
 * 
 * 动态队列，根据过滤条件获取卡片。
 * 
 * 核心功能：
 * - 根据过滤条件自动获取卡片
 * - 支持手动添加未到期卡片
 * - 按到期日期和优先级排序
 * - 评分 3/4 移除卡片，1/2 保留并添加到最终训练
 * - 持久化手动添加的卡片列表
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType, CardFilter } from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import type { QueueItem } from '../core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { resolveCardId } from '../diagnostics/type-guards';
import { getCurrentDayEnd } from '../utils/dateUtils';
import { getDayStartHour } from '../utils/configUtils';

/**
 * 过滤组队列类
 * 
 * 动态队列，根据过滤条件获取卡片。
 * 
 * 队列行为：
 * - 根据过滤条件自动获取卡片
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 评分 3/4：更新到期日期，从队列移除
 * - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
 * 
 * @see 需求 5.3, 7.5, 7.6, 9.3
 */
export class FilterGroupQueue extends BaseReviewQueue {
    public name = 'FilterGroupQueue';
    /**
     * 手动添加的卡片 ID 集合
     */
    private manuallyAddedCards: Set<string>;
    
    /**
     * 持久化存储键
     */
    private readonly STORAGE_KEY = 'filter-group-manual-cards';
    
    /**
     * 过滤条件
     */
    private cardFilter: CardFilter;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param filter 过滤条件（可选）
     */
    constructor(manager: UnifiedDataSourceManager, filter: CardFilter = {}) {
        super(manager, QueueType.FilterGroup);
        
        this.cardFilter = filter;
        this.manuallyAddedCards = new Set<string>();
        this.loadManuallyAddedCards();
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns true（动态队列）
     * @see 需求 5.3
     */
    public isDynamic(): boolean {
        return true;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 根据过滤条件获取卡片
     * 2. 获取手动添加的卡片
     * 3. 合并并去重
     * 4. 过滤临时黑名单中的卡片
     * 5. 按到期日期和优先级排序
     * 6. 应用自定义排序（如果存在）
     * 
     * @returns 卡片数组
     * @see 需求 5.3, 15.1, 15.4
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            // 🔍 调试：记录当前过滤条件
            console.log(`[FilterGroupQueue] 🔍 Current cardFilter:`, this.cardFilter);
            
            // 根据过滤条件获取卡片
            // ✅ 修复：不强制添加 dueDate 过滤，只使用用户设置的过滤条件
            // 筛选复习队列应该显示所有符合过滤条件的卡片，而不是只显示到期的卡片
            const filteredCards = await this.manager.getCards(this.cardFilter);
            
            console.log(`[FilterGroupQueue] 🔍 Got ${filteredCards.length} filtered cards from manager`);
            
            // 获取手动添加的卡片
            const manualCards = await this.getManuallyAddedCards();
            
            console.log(`[FilterGroupQueue] 🔍 Got ${manualCards.length} manually added cards`);
            
            // 合并并去重
            const allCards = this.mergeAndDeduplicate(filteredCards, manualCards);
            
            console.log(`[FilterGroupQueue] 🔍 After merge: ${allCards.length} cards`);
            
            // 过滤临时黑名单中的卡片
            const blacklistFiltered = allCards.filter(card => 
                !this.temporaryBlacklist.has(card.id)
            );
            
            if (blacklistFiltered.length < allCards.length) {
                console.log(`[FilterGroupQueue] 🔍 Filtered ${allCards.length - blacklistFiltered.length} cards from temporary blacklist`);
            }
            
            // 按到期日期和优先级排序
            const sortedCards = this.sortByDueDateAndPriority(blacklistFiltered);
            
            // 应用自定义排序（如果存在）
            return this.applyCustomOrder(sortedCards);
        } catch (error) {
            console.error('[FilterGroupQueue] Failed to get cards:', error);
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
     */
    public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
        try {
            const cardId = resolveCardId(card);
            
            // 从临时黑名单中移除（如果存在）
            const wasBlacklisted = this.temporaryBlacklist.has(cardId);
            this.temporaryBlacklist.delete(cardId);
            
            // 添加到手动添加的卡片集合
            this.manuallyAddedCards.add(cardId);
            
            // 持久化
            await this.persistManuallyAddedCards();
            
            // 触发观察者通知
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: this.getType(),
                timestamp: Date.now()
            });
            
            console.log(`[FilterGroupQueue] Card ${cardId} added manually`, {
                wasBlacklisted,
                temporaryBlacklistSize: this.temporaryBlacklist.size
            });
        } catch (error) {
            console.error('[FilterGroupQueue] Failed to add card:', error);
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
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            // 1. 从手动添加的卡片集合中移除
            const wasManuallyAdded = this.manuallyAddedCards.has(cardIdOrBlockId);
            this.manuallyAddedCards.delete(cardIdOrBlockId);
            
            // 2. 加入临时黑名单（继承自 BaseReviewQueue）
            this.temporaryBlacklist.add(cardIdOrBlockId);
            
            // 3. 持久化手动添加的卡片列表（如果有变化）
            if (wasManuallyAdded) {
                await this.persistManuallyAddedCards();
            }
            
            console.log(`[FilterGroupQueue] Card ${cardIdOrBlockId} removed`, {
                wasManuallyAdded,
                temporaryBlacklistSize: this.temporaryBlacklist.size
            });
        } catch (error) {
            console.error('[FilterGroupQueue] Failed to remove card:', error);
            // 即使出错，也要尝试加入临时黑名单
            this.temporaryBlacklist.add(cardIdOrBlockId);
            throw error;
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 评分 3/4：更新到期日期，从队列移除
     * - 评分 1/2：更新到期日期，根据过滤条件决定是否保留
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 7.5, 7.6, 7.7, 9.3, 18.2, 18.3
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        try {
            const card = await this.manager.getCard(cardId);
            
            if (rating >= 3) {
                // 记住了：更新到期日期，从队列移除
                card.due = this.calculateNextDueDate(card, rating);
                await this.manager.updateCard(card);
                await this.removeCard(cardId);
                
                console.log(`[FilterGroupQueue] Card ${cardId} reviewed with rating ${rating}, removed from queue`);
            } else {
                // 忘记了：更新到期日期，根据过滤条件决定是否保留
                const newDueDate = this.calculateNextDueDateForLowRating(card, rating);
                card.due = newDueDate;
                await this.manager.updateCard(card);
                
                // ✅ 修复：只有当用户设置了 dueDate 过滤条件时，才根据新日期决定是否保留
                // 如果没有设置 dueDate 过滤，卡片应该保留在队列中（因为它仍然符合其他过滤条件）
                if (this.cardFilter.dueDate) {
                    // 获取今天的结束时间（使用正确的 dayStartHour 配置）
                    const router = (this.manager as any).advancedRouter;
                    const plugin = router?.plugin;
                    const dayStartHour = plugin ? getDayStartHour(plugin) : 4;
                    const dayEnd = getCurrentDayEnd(dayStartHour);
                    
                    if (newDueDate > dayEnd) {
                        // 新日期超出今天范围，从队列移除
                        await this.removeCard(cardId);
                        console.log(`[FilterGroupQueue] Card ${cardId} reviewed with rating ${rating}, new due date (${new Date(newDueDate).toISOString()}) is beyond today (${new Date(dayEnd).toISOString()}), removed from queue`);
                    } else {
                        // 新日期在今天范围内，保留在队列中
                        console.log(`[FilterGroupQueue] Card ${cardId} reviewed with rating ${rating}, new due date (${new Date(newDueDate).toISOString()}) is within today (${new Date(dayEnd).toISOString()}), kept in queue`);
                    }
                } else {
                    // 没有设置 dueDate 过滤，保留在队列中
                    console.log(`[FilterGroupQueue] Card ${cardId} reviewed with rating ${rating}, no dueDate filter set, kept in queue`);
                }
                
                // 自动添加到最终训练队列
                const finalDrillQueue = this.manager.getQueue(QueueType.FinalDrill);
                await finalDrillQueue.addCard(cardId, 'auto-failed');
            }
            
            // 通知观察者
            this.manager.notifyObservers({
                type: 'card-updated',
                cardIds: [cardId],
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[FilterGroupQueue] Failed to handle review:', error);
            throw error;
        }
    }
    
    /**
     * 获取队列大小
     * 
     * 覆盖基类方法，确保返回筛选后的卡片数量。
     * 
     * @returns 筛选后的卡片数量
     */
    public async getSize(): Promise<number> {
        const cards = await this.getCards();
        return cards.length;
    }
    
    /**
     * 设置过滤条件
     * 
     * 更新过滤条件后，下次调用 getCards() 时会使用新的过滤条件。
     * 
     * @param filter 新的过滤条件
     */
    public setFilter(filter: CardFilter): void {
        this.cardFilter = filter;
        console.log('[FilterGroupQueue] Filter updated:', filter);
    }
    
    /**
     * 获取当前过滤条件
     * 
     * @returns 当前的过滤条件
     */
    public getFilter(): CardFilter {
        return { ...this.cardFilter };
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 获取手动添加的卡片
     */
    private async getManuallyAddedCards(): Promise<FSRSCard[]> {
        const cards: FSRSCard[] = [];
        
        for (const cardId of this.manuallyAddedCards) {
            try {
                // 使用静默模式，避免记录预期的"卡片不存在"错误
                const card = await this.manager.getCard(cardId, { silent: true });
                cards.push(card);
            } catch (error) {
                // 卡片不存在是预期行为（可能已被删除），自动清理
                console.log(`[FilterGroupQueue] Card ${cardId} not found, removing from manual additions`);
                this.manuallyAddedCards.delete(cardId);
            }
        }
        
        return cards;
    }
    
    /**
     * 合并并去重卡片
     */
    private mergeAndDeduplicate(filteredCards: FSRSCard[], manualCards: FSRSCard[]): FSRSCard[] {
        const cardMap = new Map<string, FSRSCard>();
        
        for (const card of filteredCards) {
            cardMap.set(card.id, card);
        }
        
        for (const card of manualCards) {
            cardMap.set(card.id, card);
        }
        
        return Array.from(cardMap.values());
    }
    
    /**
     * 按到期日期和优先级排序
     * 
     * 排序规则：
     * 1. 首先按到期日期排序（升序）
     * 2. 如果到期日期相同，按优先级排序（升序）
     * 3. 如果优先级也相同，按卡片 ID 排序（确保稳定排序）
     */
    private sortByDueDateAndPriority(cards: FSRSCard[]): FSRSCard[] {
        return cards.sort((a, b) => {
            const dateDiff = a.due - b.due;
            if (dateDiff !== 0) {
                return dateDiff;
            }
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
     */
    private calculateNextDueDate(card: FSRSCard, rating: number): number {
        const currentInterval = card.scheduledDays || 1;
        const newInterval = rating === 3 ? currentInterval * 2 : currentInterval * 4;
        const now = Date.now();
        return now + newInterval * 24 * 60 * 60 * 1000;
    }
    
    /**
     * 从持久化存储加载手动添加的卡片
     */
    private loadManuallyAddedCards(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const cardIds: string[] = JSON.parse(stored);
                this.manuallyAddedCards = new Set(cardIds);
                console.log(`[FilterGroupQueue] Loaded ${cardIds.length} manually added cards from storage`);
            }
        } catch (error) {
            console.error('[FilterGroupQueue] Failed to load manually added cards:', error);
            this.manuallyAddedCards = new Set();
        }
    }
    
    /**
     * 持久化手动添加的卡片
     */
    private async persistManuallyAddedCards(): Promise<void> {
        try {
            const cardIds = Array.from(this.manuallyAddedCards);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cardIds));
            console.log(`[FilterGroupQueue] Persisted ${cardIds.length} manually added cards`);
        } catch (error) {
            console.error('[FilterGroupQueue] Failed to persist manually added cards:', error);
            throw error;
        }
    }
}
