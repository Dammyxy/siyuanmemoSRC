/**
 * 渐进学习队列（Progressive Learning Queue）
 *
 * 混合 Topic 和 Item 卡片的队列策略：
 * - Topic 卡片：使用 A-Factor 算法调度（用于增量阅读）
 * - Item 卡片：使用 FSRS 算法调度（用于主动回忆）
 * - 选择策略：基于优先级比较两个队列头部
 *
 * @example
 * const queue = new ProgressiveLearningQueue({
 *     topicRatio: 0.25,  // 25% Topic, 75% Item
 *     autoSort: true,
 * });
 */

import * as riff from '@/core/siyuan/riff';
import { TopicScheduler } from '@/core/scheduler/TopicScheduler';
import { Rating, CardState } from '@/types';
import { setBlockAttrs } from '@/core/siyuan/api';
import type { QueueItem, QueueStats, QueueUIConfig } from '../types';
import type { IQueueStrategy, QueueFeedback } from '../abstraction/Strategy';

/**
 * 渐进学习队列配置
 */
export interface ProgressiveLearningConfig {
    /** Topic 卡片比例（0-1），默认 0.25（25%） */
    topicRatio?: number;
    /** 是否自动排序，默认 true */
    autoSort?: boolean;
    /** 卡组 ID（可选，默认使用内置卡组） */
    deckID?: string;
}

/**
 * 子队列卡片（扩展 QueueItem 以包含卡片类型）
 */
interface ExtendedQueueItem extends QueueItem {
    cardType?: 'topic' | 'item';
    aFactor?: number;
}

/**
 * 渐进学习队列
 *
 * 实现逻辑：
 * 1. 维护两个独立的子队列（Topic 队列 + Item 队列）
 * 2. next() 时比较两个队列头部，返回优先级更高的卡片
 * 3. onFeedback() 时根据卡片类型调用对应的调度器
 * 4. 自动排序时对两个子队列都进行排序
 */
export class ProgressiveLearningQueue implements IQueueStrategy<ExtendedQueueItem> {
    private readonly config: Required<ProgressiveLearningConfig>;
    private readonly topicScheduler: TopicScheduler;

    // Topic 队列和 Item 队列
    private topicQueue: ExtendedQueueItem[] = [];
    private itemQueue: ExtendedQueueItem[] = [];

    // 统计信息
    private topicReviewed = 0;
    private itemReviewed = 0;
    private initialTopicCount = 0;
    private initialItemCount = 0;

    constructor(config: ProgressiveLearningConfig = {}) {
        this.config = {
            topicRatio: config.topicRatio ?? 0.25,
            autoSort: config.autoSort ?? true,
            deckID: config.deckID ?? riff.BUILTIN_DECK_ID,
        };

        // 初始化 Topic 调度器
        this.topicScheduler = new TopicScheduler();

        console.log('[ProgressiveLearningQueue] Initialized with config:', this.config);
    }

    /**
     * 获取 UI 配置
     */
    getUIConfig(_currentItem: ExtendedQueueItem | null): QueueUIConfig {
        return {
            title: '渐进学习',
            icon: 'iconFilter',
            showProgress: true,
            showStats: true,
            showRating: true,
            allowSkip: true,
        };
    }

    /**
     * 添加卡片到队列
     *
     * 根据 cardType 字段将卡片分配到对应的子队列
     */
    async addItems(items: ExtendedQueueItem[]): Promise<void> {
        const topics: ExtendedQueueItem[] = [];
        const itemCards: ExtendedQueueItem[] = [];

        for (const item of items) {
            const cardType = item.cardType ?? 'item'; // 默认为 Item

            if (cardType === 'topic') {
                topics.push(item);
            } else {
                itemCards.push(item);
            }
        }

        this.topicQueue.push(...topics);
        this.itemQueue.push(...itemCards);

        this.initialTopicCount = this.topicQueue.length;
        this.initialItemCount = this.itemQueue.length;

        // 自动排序
        if (this.config.autoSort) {
            await this.sort();
        }

        console.log('[ProgressiveLearningQueue] Added items:', {
            topics: topics.length,
            items: itemCards.length,
        });
    }

    /**
     * 获取下一张卡片
     *
     * 策略：
     * 1. 如果只有一个队列有卡片，直接返回
     * 2. 如果两个队列都有卡片，比较优先级：
     *    - 优先级 0 = 最高
     *    - 返回优先级较小的卡片
     * 3. 如果优先级相同，根据 topicRatio 加权随机选择
     */
    async next(): Promise<ExtendedQueueItem | null> {
        const topicNext = this.topicQueue[0] ?? null;
        const itemNext = this.itemQueue[0] ?? null;

        // 只有一个队列有卡片
        if (!topicNext) return itemNext;
        if (!itemNext) return topicNext;

        // 两个队列都有卡片：比较优先级
        const topicPriority = topicNext.priority ?? 50;
        const itemPriority = itemNext.priority ?? 50;

        // 优先级不同：返回优先级更高的（数值越小优先级越高）
        if (topicPriority < itemPriority) return topicNext;
        if (itemPriority < topicPriority) return itemNext;

        // 优先级相同：根据 topicRatio 加权随机选择
        const shouldPickTopic = Math.random() * 100 < this.config.topicRatio * 100;
        return shouldPickTopic ? topicNext : itemNext;
    }

    /**
     * 提交反馈
     *
     * 根据 cardType 调用对应的调度器：
     * - Topic: 使用 TopicScheduler（A-Factor 算法）
     * - Item: 使用 Riff API（FSRS 算法）
     */
    async onFeedback(currentItem: ExtendedQueueItem | null, feedback: QueueFeedback): Promise<void> {
        if (!currentItem) return;

        const cardType = currentItem.cardType ?? 'item';
        const rating = feedback.rating ?? 3; // 默认评分：一般

        if (feedback.action === 'skip') {
            // 跳过卡片：移到队列末尾
            await this._moveToEnd(currentItem);
            return;
        }

        if (feedback.action === 'rate') {
            if (cardType === 'topic') {
                // Topic 卡片：使用 TopicScheduler
                await this._reviewTopic(currentItem, rating);
            } else {
                // Item 卡片：使用 Riff API
                await this._reviewItem(currentItem, rating);
            }
        }

        // 从队列头部移除
        await this._removeHead(currentItem);
    }

    /**
     * 获取统计信息
     */
    async getStats(): Promise<QueueStats> {
        const totalRemaining = this.topicQueue.length + this.itemQueue.length;
        const totalReviewed = this.topicReviewed + this.itemReviewed;
        const totalInitial = this.initialTopicCount + this.initialItemCount;

        return {
            total: totalInitial,
            remaining: totalRemaining,
            reviewed: totalReviewed,
            new: 0, // TODO: 从队列中统计新卡数量
            learning: 0, // TODO: 从队列中统计学习中数量
        };
    }

    /**
     * 重新排序队列
     *
     * 对两个子队列都按优先级排序（优先级 0 = 最高，排在最前）
     */
    async reorder(orderedItems: ExtendedQueueItem[]): Promise<boolean> {
        const topics: ExtendedQueueItem[] = [];
        const items = [];

        for (const item of orderedItems) {
            if (item.cardType === 'topic') {
                topics.push(item);
            } else {
                items.push(item);
            }
        }

        this.topicQueue = topics;
        this.itemQueue = items;

        return true;
    }

    /**
     * 自动排序
     *
     * 对两个子队列分别按优先级排序
     */
    async sort(): Promise<void> {
        // 按优先级升序排序（0 = 最高，排在最前）
        this.topicQueue.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
        this.itemQueue.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

        console.log('[ProgressiveLearningQueue] Queues sorted:', {
            topicQueue: this.topicQueue.length,
            itemQueue: this.itemQueue.length,
        });
    }

    /**
     * 复习 Topic 卡片（使用 TopicScheduler）
     */
    private async _reviewTopic(card: ExtendedQueueItem, rating: Rating): Promise<void> {
        // 创建 FSRSCard 对象用于调度
        const fsrsCard = {
            id: card.cardID,
            blockId: card.blockID,
            state: (card.state ?? CardState.New) as CardState,
            due: card.nextDues?.[rating] ? Date.parse(card.nextDues[rating]) : Date.now(),
            lastReview: card.lastReview ?? Date.now(),
            interval: 0,
            aFactor: card.aFactor ?? 1.2,
            reps: card.reps ?? 0,
            lapses: card.lapses ?? 0,
        };

        // 调用 TopicScheduler
        const updated = await this.topicScheduler.schedule(fsrsCard, rating);

        // ✅ 持久化到块属性
        await setBlockAttrs(card.blockID, {
            'custom-fsrs-topic-due': updated.due.toString(),
            'custom-fsrs-topic-interval': updated.interval.toString(),
            'custom-fsrs-topic-reps': updated.reps.toString(),
            'custom-fsrs-topic-state': updated.state.toString(),
        });

        console.log('[ProgressiveLearningQueue] Topic reviewed:', {
            blockID: card.blockID,
            rating,
            newInterval: updated.interval,
        });

        this.topicReviewed++;
    }

    /**
     * 复习 Item 卡片（使用 Riff API）
     */
    private async _reviewItem(card: ExtendedQueueItem, rating: Rating): Promise<void> {
        await riff.reviewRiffCard(
            card.deckID ?? this.config.deckID,
            card.cardID,
            rating
        );

        console.log('[ProgressiveLearningQueue] Item reviewed:', {
            cardID: card.cardID,
            rating,
        });

        this.itemReviewed++;
    }

    /**
     * 从队列头部移除卡片
     */
    private async _removeHead(card: ExtendedQueueItem): Promise<void> {
        if (card.cardType === 'topic') {
            this.topicQueue.shift();
        } else {
            this.itemQueue.shift();
        }
    }

    /**
     * 将卡片移到队列末尾
     */
    private async _moveToEnd(card: ExtendedQueueItem): Promise<void> {
        if (card.cardType === 'topic') {
            const [first, ...rest] = this.topicQueue;
            if (first && first.cardID === card.cardID) {
                this.topicQueue = [...rest, first];
            }
        } else {
            const [first, ...rest] = this.itemQueue;
            if (first && first.cardID === card.cardID) {
                this.itemQueue = [...rest, first];
            }
        }
    }
}
