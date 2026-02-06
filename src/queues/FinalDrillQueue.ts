/**
 * Final Drill Queue
 * 最终训练队列
 * 
 * 静态队列，仅包含手动管理的卡片。
 * 
 * 核心功能：
 * - 仅包含手动添加或自动失败的卡片
 * - 评分不计入调度算法
 * - 评分 4 移除卡片，1/2/3 保留
 * - 自动清理超过 3 天的自动失败卡片
 * - 持久化所有条目（包括源类型和时间戳）
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
 * 最终训练条目接口
 * 
 * 记录卡片的来源和添加时间。
 */
export interface FinalDrillEntry {
    cardId: string;
    source: 'manual' | 'auto-failed';
    timestamp: number;
}

/**
 * 最终训练队列类
 * 
 * 静态队列，仅包含手动管理的卡片。
 * 
 * 队列行为：
 * - 仅包含手动添加或自动失败的卡片
 * - 评分不计入调度算法（练习模式）
 * - 评分 4：从队列移除
 * - 评分 1/2/3：保留在队列中
 * - 自动清理超过 3 天的自动失败卡片
 * - 手动添加的卡片永久保留
 * 
 * @see 需求 6.1, 6.3, 8.1, 8.2, 8.3, 9.4, 9.5, 13.1, 13.3, 13.5
 */
export class FinalDrillQueue extends BaseReviewQueue {
    public name = 'FinalDrillQueue';
    /**
     * 队列条目映射
     * 
     * 键：卡片 ID
     * 值：条目信息（来源和时间戳）
     */
    private entries: Map<string, FinalDrillEntry>;
    
    /**
     * 自动清理天数阈值
     * 
     * 超过此天数的自动失败卡片将被自动清理。
     */
    private readonly AUTO_CLEANUP_DAYS = 3;
    
    /**
     * 持久化存储键
     */
    private readonly STORAGE_KEY = 'final-drill-entries';
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: UnifiedDataSourceManager) {
        super(manager, QueueType.FinalDrill);
        
        this.entries = new Map<string, FinalDrillEntry>();
        this.loadPersistedEntries();
        
        // 启动时自动清理过期的自动失败卡片
        this.cleanupExpiredAutoFailed().catch(error => {
            console.error('[FinalDrillQueue] Failed to cleanup expired auto-failed cards on startup:', error);
        });
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns false（静态队列）
     * @see 需求 6.1
     */
    public isDynamic(): boolean {
        return false;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 清理过期的自动失败卡片
     * 2. 获取所有条目对应的卡片数据
     * 
     * @returns 卡片数组
     * @see 需求 6.1, 9.4, 13.5
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            // 清理过期的自动失败卡片
            await this.cleanupExpiredAutoFailed();
            
            // 获取所有卡片
            const cards: FSRSCard[] = [];
            for (const entry of this.entries.values()) {
                try {
                    const card = await this.manager.getCard(entry.cardId);
                    cards.push(card);
                } catch (error) {
                    // 如果卡片不存在，从队列中移除
                    console.warn(`[FinalDrillQueue] Card ${entry.cardId} not found, removing from queue`);
                    this.entries.delete(entry.cardId);
                }
            }
            
            // 持久化（如果有卡片被移除）
            await this.persistEntries();
            
            return cards;
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to get cards:', error);
            throw error;
        }
    }
    
    /**
     * 添加卡片到队列
     * 
     * 添加逻辑：
     * - 如果卡片已存在且为手动添加，不覆盖
     * - 如果卡片已存在且为自动失败，可以被手动添加覆盖
     * - 新卡片记录来源和时间戳
     * 
     * @param cardId 卡片 ID
     * @param source 来源类型（'manual' 或 'auto-failed'）
     * @see 需求 6.1, 9.1, 9.5, 6.4
     */
    public async addCard(card: FSRSCard | QueueItem | string, source: 'manual' | 'auto-failed' = 'manual'): Promise<void> {
        try {
            const cardId = resolveCardId(card);
            // 检查是否已存在
            const existing = this.entries.get(cardId);
            if (existing && existing.source === 'manual') {
                // 手动添加的卡片不覆盖
                console.log(`[FinalDrillQueue] Card ${cardId} already exists as manual, skipping`);
                return;
            }
            
            // 添加或更新条目
            this.entries.set(cardId, {
                cardId,
                source,
                timestamp: Date.now()
            });
            
            // 持久化
            await this.persistEntries();
            
            // 触发观察者通知（需求 6.4：卡片添加的队列统计更新）
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: this.getType(),
                timestamp: Date.now()
            });
            
            console.log(`[FinalDrillQueue] Card ${cardId} added with source ${source}`);
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to add card:', error);
            throw error;
        }
    }
    
    /**
     * 从队列中移除卡片
     * 
     * @param cardId 卡片 ID
     * @see 需求 6.1, 8.2
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            this.entries.delete(cardIdOrBlockId);
            await this.persistEntries();
            console.log(`[FinalDrillQueue] Card ${cardIdOrBlockId} removed`);
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to remove card:', error);
            throw error;
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 评分不计入调度算法（练习模式）
     * - 评分 4：从队列移除
     * - 评分 1/2/3：保留在队列中
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 8.1, 8.2, 8.3
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        try {
            // 注意：评分不计入调度算法
            // 不更新卡片的到期日期或其他调度数据
            
            if (rating === 4) {
                // 评分 4：从队列移除
                await this.removeCard(cardId);
                console.log(`[FinalDrillQueue] Card ${cardId} reviewed with rating 4, removed from queue`);
            } else {
                // 评分 1/2/3：保留在队列中
                console.log(`[FinalDrillQueue] Card ${cardId} reviewed with rating ${rating}, kept in queue`);
            }
            
            // 通知观察者队列已变化
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: QueueType.FinalDrill,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to handle review:', error);
            throw error;
        }
    }
    
    /**
     * 获取条目信息
     * 
     * 用于调试和测试。
     * 
     * @param cardId 卡片 ID
     * @returns 条目信息，如果不存在则返回 undefined
     */
    public getEntry(cardId: string): FinalDrillEntry | undefined {
        return this.entries.get(cardId);
    }
    
    /**
     * 获取所有条目
     * 
     * 用于调试和测试。
     * 
     * @returns 所有条目数组
     */
    public getAllEntries(): FinalDrillEntry[] {
        return Array.from(this.entries.values());
    }
    
    /**
     * 重新排序队列
     * 
     * 最终训练队列支持手动重排序。
     * 重排序逻辑：
     * 1. 将 entries Map 转换为数组
     * 2. 根据 orderedCards 的顺序重新排列
     * 3. 更新 entries Map（使用 Map 保持插入顺序）
     * 4. 持久化新顺序
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功
     */
    public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
        try {
            console.log(`[FinalDrillQueue] Reordering ${orderedCards.length} cards`);
            
            // 创建新的 Map 以保持顺序
            const newEntries = new Map<string, FinalDrillEntry>();
            
            // 按照 orderedCards 的顺序重新添加条目
            for (const card of orderedCards) {
                const entry = this.entries.get(card.id);
                if (entry) {
                    newEntries.set(card.id, entry);
                }
            }
            
            // 添加不在 orderedCards 中的条目（保持在末尾）
            for (const [cardId, entry] of this.entries.entries()) {
                if (!newEntries.has(cardId)) {
                    newEntries.set(cardId, entry);
                }
            }
            
            // 更新 entries
            this.entries = newEntries;
            
            // 持久化新顺序
            await this.persistEntries();
            
            console.log(`[FinalDrillQueue] Reorder completed successfully`);
            return true;
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to reorder:', error);
            return false;
        }
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 清理过期的自动失败卡片
     * 
     * 删除时间戳超过 3 天的自动失败卡片。
     * 手动添加的卡片不受影响。
     * 
     * @see 需求 9.4, 13.5
     */
    private async cleanupExpiredAutoFailed(): Promise<void> {
        try {
            const now = Date.now();
            const threeDaysMs = this.AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
            
            let cleanedCount = 0;
            for (const [cardId, entry] of this.entries.entries()) {
                if (entry.source === 'auto-failed' && now - entry.timestamp > threeDaysMs) {
                    this.entries.delete(cardId);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                await this.persistEntries();
                console.log(`[FinalDrillQueue] Cleaned up ${cleanedCount} expired auto-failed cards`);
            }
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to cleanup expired auto-failed cards:', error);
            throw error;
        }
    }
    
    /**
     * 从持久化存储加载条目
     * 
     * @see 需求 13.1, 13.3
     */
    private loadPersistedEntries(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const entries: FinalDrillEntry[] = JSON.parse(stored);
                for (const entry of entries) {
                    this.entries.set(entry.cardId, entry);
                }
                console.log(`[FinalDrillQueue] Loaded ${entries.length} entries from storage`);
            }
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to load persisted entries:', error);
            this.entries = new Map();
        }
    }
    
    /**
     * 持久化条目到存储
     * 
     * @see 需求 13.1
     */
    private async persistEntries(): Promise<void> {
        try {
            const entries = Array.from(this.entries.values());
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
            console.log(`[FinalDrillQueue] Persisted ${entries.length} entries`);
        } catch (error) {
            console.error('[FinalDrillQueue] Failed to persist entries:', error);
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
        console.warn('[FinalDrillQueue] getAllItems() is deprecated, use getAllCards() instead');
        // 返回当前缓存的卡片
        return this.cards;
    }
}
