/**
 * 渐进学习队列 Provider
 *
 * 实现 Extensions Layer 的 QueueProvider 接口
 * 封装 IncrementalLearningQueue 为外部提供标准 API
 */

import * as riff from '@/core/siyuan/riff';
import type { QueueProvider } from '@/core/extensions';
import type { BrowserCard } from '@/ui/browser/browserService';
import { IncrementalLearningQueueV2 } from '@/core/queue/strategies/IncrementalLearningQueueV2';

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
    private readonly queue: IncrementalLearningQueueV2;
    private readonly deckId: string;

    constructor(config?: { deckID?: string }) {
        this.deckId = config?.deckID ?? riff.BUILTIN_DECK_ID;
        this.queue = new IncrementalLearningQueueV2({
            deckID: this.deckId,
        });
    }

    /**
     * 获取到期卡片
     *
     * @param options 可选参数
     * @returns 到期卡片列表
     */
    async getDueCards(options?: {
        limit?: number;
        deckId?: string;
    }): Promise<BrowserCard[]> {
        // TODO: 从 Riff 系统获取到期卡片
        // 目前返回空数组，实际使用时需要实现
        console.log('[IncrementalLearningProvider] getDueCards called with options:', options);
        return [];
    }

    /**
     * 提交复习评分
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
        try {
            // 查找对应的卡片
            const card = reviewedCards?.find(c => c.blockId === cardId);
            if (!card) {
                console.error('[IncrementalLearningProvider] Card not found:', cardId);
                return false;
            }

            // 提交反馈
            await this.queue.onFeedback(card as any, {
                action: 'rate',
                rating,
            });

            console.log('[IncrementalLearningProvider] Card reviewed:', {
                cardId,
                rating,
                cardType: card.cardType,
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
     * @param cardId 卡片 ID
     * @returns 是否成功
     */
    async skipReviewCard(cardId: string): Promise<boolean> {
        try {
            // TODO: 实现跳过逻辑
            console.log('[IncrementalLearningProvider] Skip card:', cardId);
            return true;
        } catch (err) {
            console.error('[IncrementalLearningProvider] Skip failed:', err);
            return false;
        }
    }

    /**
     * 获取统计信息
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
        const stats = await this.queue.getStats();

        return {
            total: stats.total,
            due: stats.remaining,
            new: stats.new ?? 0,
            reviewed: stats.reviewed,
            learning: stats.learning ?? 0,
        };
    }
}
