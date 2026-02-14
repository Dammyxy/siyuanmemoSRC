/**
 * TypeConverter - 类型转换器
 * 
 * 在队列架构迁移期间处理 QueueItem 和 FSRSCard 之间的转换。
 * 这是一个临时组件，在迁移完成后将被移除。
 * 
 * @module migration/TypeConverter
 */

import type { QueueItem } from '../core/queue/types';
import type { FSRSCard } from '../types/card';
import { CardState, CardType } from '../types/card';

/**
 * 类型转换器
 * 
 * 提供 QueueItem 和 FSRSCard 之间的双向转换功能。
 * 处理字段映射、默认值填充和类型安全转换。
 */
export class TypeConverter {
    /**
     * 将 QueueItem 转换为 FSRSCard
     * 
     * 处理字段名差异（如 cardID → blockId）和缺失字段的默认值。
     * 
     * @param item - QueueItem 实例
     * @returns FSRSCard 实例
     * 
     * @example
     * ```typescript
     * const queueItem: QueueItem = {
     *   cardID: 'block-123',
     *   blockID: 'block-123',
     *   deckID: 'deck-1',
     *   priority: 50,
     *   due: Date.now(),
     *   state: 2,
     *   stability: 10,
     *   difficulty: 5,
     * };
     * 
     * const fsrsCard = TypeConverter.queueItemToFSRSCard(queueItem);
     * console.log(fsrsCard.blockId); // 'block-123'
     * console.log(fsrsCard.type); // CardType.Item (default)
     * ```
     */
    static queueItemToFSRSCard(item: QueueItem): FSRSCard {
        const now = Date.now();
        
        return {
            // === 标识字段 ===
            id: item.cardID || item.blockID || '',
            blockId: item.blockID || item.cardID || '',
            
            // === FSRS 核心字段 ===
            due: item.due ?? now,
            stability: item.stability ?? 0,
            difficulty: item.difficulty ?? 0,
            reps: item.reps ?? 0,
            lapses: item.lapses ?? 0,
            state: (item.state ?? CardState.New) as CardState,
            lastReview: item.lastReview ?? item.last_review ?? 0,
            elapsedDays: item.elapsedDays ?? item.elapsed_days ?? 0,
            scheduledDays: item.scheduledDays ?? item.scheduled_days ?? 0,
            
            // === 扩展功能 ===
            priority: item.priority ?? 50,
            type: CardType.Item, // 默认为普通闪卡
            tags: [],
            
            // === 难点攻克 ===
            leechCount: 0,
            isLeech: false,
            
            // === 跳过/留言 ===
            skipped: false,
            
            // === 元数据 ===
            createdAt: item.updatedAt ?? now,
            updatedAt: item.updatedAt ?? now,
            meta: item.meta,
        };
    }

    /**
     * 将 FSRSCard 转换为 QueueItem
     * 
     * 用于向后兼容，将新架构的 FSRSCard 转换为旧架构的 QueueItem。
     * 
     * @param card - FSRSCard 实例
     * @returns QueueItem 实例
     * 
     * @example
     * ```typescript
     * const fsrsCard: FSRSCard = {
     *   id: 'card-123',
     *   blockId: 'block-123',
     *   due: Date.now(),
     *   stability: 10,
     *   difficulty: 5,
     *   // ... other fields
     * };
     * 
     * const queueItem = TypeConverter.fsrsCardToQueueItem(fsrsCard);
     * console.log(queueItem.cardID); // 'block-123'
     * console.log(queueItem.blockID); // 'block-123'
     * ```
     */
    static fsrsCardToQueueItem(card: FSRSCard): QueueItem {
        return {
            // === 标识字段 ===
            cardID: card.blockId,
            blockID: card.blockId,
            deckID: '', // QueueItem 需要 deckID，但 FSRSCard 没有此字段
            
            // === FSRS 核心字段 ===
            priority: card.priority,
            due: card.due,
            state: card.state,
            stability: card.stability,
            difficulty: card.difficulty,
            reps: card.reps,
            lapses: card.lapses,
            lastReview: card.lastReview,
            elapsedDays: card.elapsedDays,
            scheduledDays: card.scheduledDays,
            
            // === 扩展字段 ===
            updatedAt: card.updatedAt,
            meta: card.meta,
        };
    }

    /**
     * 批量转换 QueueItem 数组为 FSRSCard 数组
     * 
     * @param items - QueueItem 数组
     * @returns FSRSCard 数组
     * 
     * @example
     * ```typescript
     * const queueItems: QueueItem[] = [item1, item2, item3];
     * const fsrsCards = TypeConverter.queueItemsToFSRSCards(queueItems);
     * console.log(fsrsCards.length); // 3
     * ```
     */
    static queueItemsToFSRSCards(items: QueueItem[]): FSRSCard[] {
        return items.map(item => this.queueItemToFSRSCard(item));
    }

    /**
     * 批量转换 FSRSCard 数组为 QueueItem 数组
     * 
     * @param cards - FSRSCard 数组
     * @returns QueueItem 数组
     * 
     * @example
     * ```typescript
     * const fsrsCards: FSRSCard[] = [card1, card2, card3];
     * const queueItems = TypeConverter.fsrsCardsToQueueItems(fsrsCards);
     * console.log(queueItems.length); // 3
     * ```
     */
    static fsrsCardsToQueueItems(cards: FSRSCard[]): QueueItem[] {
        return cards.map(card => this.fsrsCardToQueueItem(card));
    }

    /**
     * 验证 QueueItem 是否有效
     * 
     * 检查必需字段是否存在。
     * 
     * @param item - 要验证的 QueueItem
     * @returns 是否有效
     */
    static isValidQueueItem(item: any): item is QueueItem {
        return (
            item &&
            typeof item === 'object' &&
            (typeof item.cardID === 'string' || typeof item.blockID === 'string') &&
            typeof item.priority === 'number'
        );
    }

    /**
     * 验证 FSRSCard 是否有效
     * 
     * 检查必需字段是否存在。
     * 
     * @param card - 要验证的 FSRSCard
     * @returns 是否有效
     */
    static isValidFSRSCard(card: any): card is FSRSCard {
        return (
            card &&
            typeof card === 'object' &&
            typeof card.id === 'string' &&
            typeof card.blockId === 'string' &&
            typeof card.due === 'number' &&
            typeof card.stability === 'number' &&
            typeof card.difficulty === 'number' &&
            typeof card.state === 'number'
        );
    }
}
