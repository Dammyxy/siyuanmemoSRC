/**
 * 渐进学习队列 Provider
 *
 * 实现 Extensions Layer 的 QueueProvider 接口
 * 封装 IncrementalLearningQueue 为外部提供标准 API
 */

import { riff } from '@/core/siyuan';
import type { QueueProvider } from '@/core/extensions';
import type { BrowserCard } from '@/ui/browser/browserService';
// 🔧 使用新架构的 IncrementalLearningQueue
import { IncrementalLearningQueue } from '@/queues/IncrementalLearningQueue';
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { QueueType } from '@/types/unified-data-source';

/**
 * 渐进学习队列 Provider
 *
 * 提供统一的队列访问接口，支持：
 * - 获取到期卡片
 * - 提交复习评分
 * - 跳过卡片
 * - 获取统计信息
 */
export class IncrementalLearningProvider implements QueueProvider<BrowserCard> {
    private readonly queue: IncrementalLearningQueue;
    private readonly deckId: string;
    
    // 🆕 Provider 自己管理会话状态
    private cards: BrowserCard[] = [];  // 当前会话的卡片列表
    private loaded = false;              // 是否已加载

    constructor(config?: { deckID?: string }) {
        this.deckId = config?.deckID ?? riff.BUILTIN_DECK_ID;
        // 🔧 使用新架构：通过 UnifiedDataSourceManager 获取队列实例
        const manager = UnifiedDataSourceManager.getInstance();
        this.queue = manager.getQueue(QueueType.IncrementalLearning) as IncrementalLearningQueue;
    }

    /**
     * 获取到期卡片
     *
     * 🔧 新架构：使用 getCards() 方法
     *
     * @param options 可选参数
     * @returns 到期卡片列表
     */
    async getDueCards(options?: {
        limit?: number;
        deckId?: string;
        forceReload?: boolean;  // 🆕 强制重新加载
    }): Promise<BrowserCard[]> {
        console.log('[IncrementalLearningProvider] getDueCards START', {
            deckId: this.deckId,
            options,
            loaded: this.loaded,
            cardsCount: this.cards.length,
        });

        // 如果需要强制重新加载，清空状态
        if (options?.forceReload) {
            console.log('[IncrementalLearningProvider] Force reload requested');
            this.loaded = false;
            this.cards = [];
        }

        // 只在第一次或强制重载时加载
        if (!this.loaded) {
            try {
                console.log('[IncrementalLearningProvider] Loading cards from queue...');
                // 🔧 新架构：使用 getCards() 方法获取 FSRSCard[]
                const fsrsCards = await this.queue.getCards();

                // 转换为 BrowserCard 格式
                this.cards = fsrsCards.map(card => ({
                    id: card.id,
                    blockId: card.blockId,
                    content: '', // 内容会在渲染时加载
                    due: card.due,
                    reps: card.reps,
                    lapses: card.lapses,
                    state: card.state,
                    type: card.type || 'item',
                }));

                this.loaded = true;
                console.log('[IncrementalLearningProvider] Loaded cards:', this.cards.length);
            } catch (error) {
                console.error('[IncrementalLearningProvider] Failed to load cards:', error);
                this.cards = [];
            }
        }

        // 返回当前列表（可能已经被 reviewCard 修改过）
        const result = options?.limit 
            ? this.cards.slice(0, options.limit) 
            : [...this.cards];

        console.log('[IncrementalLearningProvider] getDueCards DONE:', {
            options,
            count: result.length,
        });

        return result;
    }

    /**
     * 提交复习评分
     *
     * 🔧 新架构：使用 handleReview() 方法
     * - 评分 < 3：移到末尾（SM-15 的 THRESHOLD_RECALL = 3）
     * - 评分 >= 3：删除
     *
     * @param cardId 卡片 ID
     * @param rating 评分（1=重来, 2=困难, 3=一般, 4=简单）
     * @param reviewedCards 可选的已复习卡片列表
     * @returns 是否成功
     */
    async reviewCard(
        cardId: string,
        rating: 1 | 2 | 3 | 4,
        reviewedCards?: BrowserCard[]
    ): Promise<boolean> {
        console.log('[IncrementalLearningProvider] reviewCard called:', {
            cardId,
            rating,
            cardsCount: this.cards.length,
        });

        try {
            // 找到卡片在列表中的位置
            const index = this.cards.findIndex(
                c => c.blockId === cardId || c.id === cardId
            );

            if (index === -1) {
                console.error('[IncrementalLearningProvider] Card not found in list:', cardId);
                return false;
            }

            const card = this.cards[index];
            console.log('[IncrementalLearningProvider] Card found at index:', index);

            // 🔧 新架构：调用 handleReview() 方法
            await this.queue.handleReview(cardId, rating);

            // 根据评分修改本地列表
            if (rating < 3) {
                // 评分 1-2：移到末尾（SM-15 的 THRESHOLD_RECALL = 3）
                console.log('[IncrementalLearningProvider] Rating < 3, rotating to end:', cardId);
                this.cards.splice(index, 1);
                this.cards.push(card);
            } else {
                // 评分 3-4：删除
                console.log('[IncrementalLearningProvider] Rating >= 3, removing:', cardId);
                this.cards.splice(index, 1);
            }

            console.log('[IncrementalLearningProvider] Cards remaining:', this.cards.length);
            console.log('[IncrementalLearningProvider] Card reviewed:', {
                cardId,
                rating,
                cardType: card.type,
            });

            return true;
        } catch (err) {
            console.error('[IncrementalLearningProvider] Review failed:', err);
            return false;
        }
    }

    /**
     * 跳过卡片
     *
     * 🔧 新架构：使用队列的 skip() 方法
     *
     * @param cardId 卡片 ID
     * @returns 是否成功
     */
    async skipReviewCard(cardId: string): Promise<boolean> {
        try {
            // 🔧 新架构：使用队列的 skip() 方法
            await this.queue.skip(cardId);

            // 同步更新本地列表
            const index = this.cards.findIndex(
                c => c.blockId === cardId || c.id === cardId
            );

            if (index !== -1) {
                const card = this.cards[index];
                this.cards.splice(index, 1);
                this.cards.push(card);
            }

            console.log('[IncrementalLearningProvider] Skipped card:', cardId);
            return true;
        } catch (err) {
            console.error('[IncrementalLearningProvider] Skip failed:', err);
            return false;
        }
    }

    /**
     * 获取统计信息
     *
     * 🔧 新架构：使用队列的 getStats() 方法
     *
     * @returns 队列统计
     */
    async getStats(): Promise<{
        total: number;
        due: number;
        new: number;
        reviewed: number;
        learning: number;
    }> {
        // 🔧 新架构：使用队列的 getStats() 方法
        return await this.queue.getStats();
    }
}
