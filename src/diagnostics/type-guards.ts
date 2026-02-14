/**
 * Type Guards
 * 类型守卫
 *
 * 提供类型守卫函数用于运行时类型检查和转换。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 5.1
 * @see 属性 8: 类型守卫准确性
 * @see 属性 9: 类型转换保真度
 */

import type { QueueItem } from '../core/queue/types';
import { CardType } from '../types/card';
import type { FSRSCard } from '../types/card';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * 检查对象是否为 QueueItem
 *
 * @param obj 待检查的对象
 * @returns 如果是 QueueItem 返回 true
 *
 * @see 属性 8: 类型守卫准确性
 * 
 * 注意：只检查核心字段，priority 字段是可选的
 * 🔧 修复：同时检查大小写变体（blockID/blockId, cardID/cardId, id）
 * 🔧 修复：支持 id 字段作为 cardID 的替代（某些队列使用 id 而不是 cardID）
 */
export function isQueueItem(obj: any): obj is QueueItem {
    return (
        obj &&
        typeof obj === 'object' &&
        'deckID' in obj &&
        obj.deckID !== undefined &&
        obj.deckID !== null &&
        (
            // 检查是否有 cardID/blockID/id（至少一个）
            // 🔧 同时检查大小写变体和 id 字段
            ('cardID' in obj && obj.cardID !== undefined && obj.cardID !== null) ||
            ('blockID' in obj && obj.blockID !== undefined && obj.blockID !== null) ||
            ('cardId' in obj && obj.cardId !== undefined && obj.cardId !== null) ||
            ('blockId' in obj && obj.blockId !== undefined && obj.blockId !== null) ||
            ('id' in obj && obj.id !== undefined && obj.id !== null)
        )
        // priority 字段是可选的，不强制要求
    );
}

/**
 * 检查对象是否为 FSRSCard
 *
 * @param obj 待检查的对象
 * @returns 如果是 FSRSCard 返回 true
 *
 * @see 属性 8: 类型守卫准确性
 * 
 * 注意：只检查核心 FSRS 字段，不检查扩展字段（priority, type, tags 等）
 * 这样可以兼容从数据库加载的不完整卡片数据
 */
export function isFSRSCard(obj: any): obj is FSRSCard {
    return (
        obj &&
        typeof obj === 'object' &&
        // 核心标识字段
        'id' in obj &&
        obj.id !== undefined &&
        obj.id !== null &&
        'blockId' in obj &&
        obj.blockId !== undefined &&
        obj.blockId !== null &&
        // 核心 FSRS 调度字段
        'due' in obj &&
        typeof obj.due === 'number' &&
        'state' in obj &&
        typeof obj.state === 'number' &&
        'stability' in obj &&
        typeof obj.stability === 'number' &&
        'difficulty' in obj &&
        typeof obj.difficulty === 'number' &&
        'reps' in obj &&
        typeof obj.reps === 'number' &&
        'lapses' in obj &&
        typeof obj.lapses === 'number' &&
        'lastReview' in obj &&
        typeof obj.lastReview === 'number' &&
        'elapsedDays' in obj &&
        typeof obj.elapsedDays === 'number' &&
        'scheduledDays' in obj &&
        typeof obj.scheduledDays === 'number'
        // 扩展字段（priority, type, tags, leechCount, isLeech, skipped, createdAt, updatedAt）
        // 不在这里检查，因为它们可能在数据加载后才被填充
    );
}

// ============================================================================
// Type Conversion
// ============================================================================

/**
 * 将 QueueItem 转换为 FSRSCard
 *
 * @param item QueueItem 对象
 * @returns FSRSCard 对象
 * @throws Error 如果 item 不是有效的 QueueItem
 * 
 * 🔧 修复：处理大小写变体（blockID/blockId, cardID/cardId, id）
 * 🔧 修复：支持 id 字段作为 cardID 的替代
 */
export function queueItemToFSRSCard(item: QueueItem): FSRSCard {
    if (!isQueueItem(item)) {
        throw new Error(`[queueItemToFSRSCard] Invalid QueueItem: ${JSON.stringify(item)}`);
    }

    const dueFromNextDues = item.nextDues?.[4]
        ? new Date(item.nextDues[4]).getTime()
        : Date.now();

    // 🔧 处理大小写变体和 id 字段
    const cardID = (item as any).cardID || (item as any).cardId || (item as any).id;
    const blockID = (item as any).blockID || (item as any).blockId || (item as any).id;
    
    // 使用 cardID 或 blockID（优先使用 cardID）
    const cardId = String(cardID || blockID);
    const blockId = String(blockID || cardID);

    return {
        id: cardId,
        blockId: blockId,
        due: dueFromNextDues,
        state: item.state ?? 0,
        stability: item.stability ?? 0,
        difficulty: item.difficulty ?? 5,
        reps: item.reps ?? 0,
        lapses: item.lapses ?? 0,
        lastReview: item.lastReview ?? 0,
        elapsedDays: item.elapsedDays ?? 0,
        scheduledDays: item.scheduledDays ?? 0,
        priority: item.priority ?? 50, // 默认优先级
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: item.updatedAt ?? Date.now(),
        updatedAt: item.updatedAt ?? Date.now(),
        meta: item.meta,
    };
}

/**
 * 将 FSRSCard 转换为 QueueItem
 *
 * @param card FSRSCard 对象
 * @returns QueueItem 对象
 * @throws Error 如果 card 不是有效的 FSRSCard
 */
export function fsrsCardToQueueItem(card: FSRSCard): QueueItem {
    if (!isFSRSCard(card)) {
        throw new Error(`[fsrsCardToQueueItem] Invalid FSRSCard: ${JSON.stringify(card)}`);
    }

    return {
        cardID: card.id as any,
        blockID: card.blockId as any,
        deckID: '' as any,
        priority: card.priority,
        state: card.state,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        lastReview: card.lastReview,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        updatedAt: card.updatedAt,
        meta: card.meta,
    };
}

// ============================================================================
// Mixed Type Handling
// ============================================================================

/**
 * 解析卡片 ID（支持 FSRSCard / QueueItem / string）
 * 
 * 🔧 修复：处理大小写变体（cardID/cardId）
 */
export function resolveCardId(card: FSRSCard | QueueItem | string): string {
    if (typeof card === 'string') {
        return card;
    }

    if (isQueueItem(card)) {
        // 🔧 处理大小写变体
        const cardID = (card as any).cardID || (card as any).cardId;
        
        // 🔍 调试：检查 Xiuyuan 卡片的 ID 解析
        if (String(cardID).startsWith('xy_card_')) {
            console.log('[resolveCardId] 🔍 Xiuyuan card detected:', {
                cardID,
                blockID: (card as any).blockID,
                hasCardID: !!(card as any).cardID,
                hasCardId: !!(card as any).cardId,
            });
        }
        
        return String(cardID);
    }

    if (isFSRSCard(card)) {
        return card.id;
    }

    throw new Error(`[resolveCardId] Unknown card type: ${JSON.stringify(card)}`);
}

/**
 * 规范化卡片输入（支持 FSRSCard / QueueItem）
 */
export function normalizeCardInput(card: FSRSCard | QueueItem): FSRSCard {
    if (isFSRSCard(card)) {
        return card;
    }

    if (isQueueItem(card)) {
        return queueItemToFSRSCard(card);
    }

    throw new Error(`[normalizeCardInput] Unknown card type: ${JSON.stringify(card)}`);
}

// ============================================================================
// Batch Conversion
// ============================================================================

/**
 * 批量转换卡片数组为 FSRSCard
 * 
 * 🔧 修复：自动填充缺失的扩展字段
 * - 如果卡片缺少 priority 字段，填充默认值 50
 * - 如果卡片缺少 type 字段，填充默认值 CardType.Item
 * - 如果卡片缺少 tags 字段，填充空数组
 * - 如果卡片缺少其他扩展字段，填充默认值
 * 
 * 🔧 修复：优先尝试 QueueItem 转换
 * - 如果对象有 deckID 字段，优先作为 QueueItem 处理
 * - 这样可以正确处理从队列加载的混合类型数据
 */
export function normalizeToFSRSCard(cards: any[]): FSRSCard[] {
    const result: FSRSCard[] = [];
    const errors: string[] = [];

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];

        try {
            // 🔧 优先检查 QueueItem（如果有 deckID 字段）
            if (isQueueItem(card)) {
                const cardId = (card as any).id || card.cardID || (card as any).cardId;
                console.warn(`[normalizeToFSRSCard] Converting QueueItem at index ${i}:`, cardId);
                result.push(queueItemToFSRSCard(card));
            } else if (isFSRSCard(card)) {
                // 🔧 填充缺失的扩展字段
                const normalizedCard: FSRSCard = {
                    ...card,
                    priority: card.priority ?? 50,
                    type: card.type ?? CardType.Item, // ✅ 修复：为 null/undefined 提供默认值
                    tags: card.tags ?? [],
                    leechCount: card.leechCount ?? 0,
                    isLeech: card.isLeech ?? false,
                    skipped: card.skipped ?? false,
                    createdAt: card.createdAt ?? Date.now(),
                    updatedAt: card.updatedAt ?? Date.now(),
                };
                result.push(normalizedCard);
            } else {
                // 🔧 最后的容错：如果卡片有所有必需字段但 isFSRSCard 返回 false，
                // 可能是因为某些字段的类型不完全匹配，尝试强制转换
                const hasAllRequiredFields = (
                    card &&
                    typeof card === 'object' &&
                    'id' in card &&
                    'blockId' in card &&
                    'due' in card &&
                    'state' in card &&
                    'stability' in card &&
                    'difficulty' in card &&
                    'reps' in card &&
                    'lapses' in card &&
                    'lastReview' in card &&
                    'elapsedDays' in card &&
                    'scheduledDays' in card
                );

                if (hasAllRequiredFields) {
                    console.warn(`[normalizeToFSRSCard] Card at index ${i} has all required fields but failed isFSRSCard check, forcing conversion:`, card.id);
                    const normalizedCard: FSRSCard = {
                        ...card,
                        priority: card.priority ?? 50,
                        type: card.type ?? CardType.Item, // ✅ 修复：为 null/undefined 提供默认值
                        tags: card.tags ?? [],
                        leechCount: card.leechCount ?? 0,
                        isLeech: card.isLeech ?? false,
                        skipped: card.skipped ?? false,
                        createdAt: card.createdAt ?? Date.now(),
                        updatedAt: card.updatedAt ?? Date.now(),
                    };
                    result.push(normalizedCard);
                } else {
                    // ⚠️ 最后的降级方案：如果卡片看起来像 Riff 卡片（有 deckID），尝试转换
                    if (card && typeof card === 'object' && 'deckID' in card) {
                        console.warn(`[normalizeToFSRSCard] Card at index ${i} looks like a Riff card with deckID, attempting conversion:`, card.id);
                        try {
                            result.push(queueItemToFSRSCard(card));
                        } catch (conversionError) {
                            const error = `[normalizeToFSRSCard] Failed to convert Riff card at index ${i}: ${conversionError}`;
                            errors.push(error);
                            console.error(error, card);
                        }
                    } else {
                        const error = `[normalizeToFSRSCard] Unknown card type at index ${i}: ${JSON.stringify(card)}`;
                        errors.push(error);
                        console.error(error);
                    }
                }
            }
        } catch (error) {
            const err = `[normalizeToFSRSCard] Failed to convert card at index ${i}: ${error}`;
            errors.push(err);
            console.error(err);
        }
    }

    if (errors.length > 0) {
        throw new Error(`[normalizeToFSRSCard] Conversion failed with ${errors.length} errors:\n${errors.join('\n')}`);
    }

    return result;
}

// ============================================================================
// Runtime Validation
// ============================================================================

/**
 * 运行时类型验证错误
 */
export class TypeMismatchError extends TypeError {
    constructor(
        message: string,
        public expected: string,
        public actual: string,
        public context?: string
    ) {
        super(message);
        this.name = 'TypeMismatchError';
    }
}

/**
 * 验证队列方法返回类型
 */
export function validateQueueReturnType(
    queueName: string,
    methodName: string,
    returnValue: any
): void {
    const validator = new RuntimeTypeValidator();
    validator.validateQueueReturnType(queueName, methodName, returnValue);
}

/**
 * 验证消费者接收的卡片类型
 */
export function validateConsumerCardType(consumerName: string, cards: any[]): void {
    const validator = new RuntimeTypeValidator();
    validator.validateConsumerCardType(consumerName, cards);
}

/**
 * Runtime Type Validator
 * 运行时类型验证器
 *
 * 在开发模式下验证队列方法返回类型和消费者输入类型。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 5.3
 */
export class RuntimeTypeValidator {
    /**
     * 验证队列方法返回类型
     */
    validateQueueReturnType(
        queueName: string,
        methodName: string,
        returnValue: any
    ): void {
        if (process.env.NODE_ENV !== 'development') {
            return;
        }

        if (methodName === 'getAllCards') {
            if (!Array.isArray(returnValue)) {
                throw new TypeMismatchError(
                    `[${queueName}.${methodName}()] must return an array, got ${typeof returnValue}`,
                    'FSRSCard[]',
                    typeof returnValue,
                    `queue=${queueName}, method=${methodName}`
                );
            }

            for (let i = 0; i < returnValue.length; i++) {
                const card = returnValue[i];
                if (!isFSRSCard(card)) {
                    throw new TypeMismatchError(
                        `[${queueName}.${methodName}()] must return FSRSCard[], got ${JSON.stringify(card)}`,
                        'FSRSCard[]',
                        typeof card,
                        `queue=${queueName}, method=${methodName}, index=${i}`
                    );
                }
            }
        }
    }

    /**
     * 验证消费者接收的卡片类型
     */
    validateConsumerCardType(consumerName: string, cards: any[]): void {
        if (process.env.NODE_ENV !== 'development') {
            return;
        }

        if (!Array.isArray(cards)) {
            throw new TypeMismatchError(
                `[${consumerName}] Expected array of cards, got ${typeof cards}`,
                'FSRSCard[]',
                typeof cards,
                `consumer=${consumerName}`
            );
        }

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (!isFSRSCard(card)) {
                throw new TypeMismatchError(
                    `[${consumerName}] Card at index ${i} is not FSRSCard`,
                    'FSRSCard',
                    typeof card,
                    `consumer=${consumerName}, index=${i}`
                );
            }
        }
    }
}
