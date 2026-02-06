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
 */
export function isQueueItem(obj: any): obj is QueueItem {
    return (
        obj &&
        typeof obj === 'object' &&
        'cardID' in obj &&
        obj.cardID !== undefined &&
        obj.cardID !== null &&
        'blockID' in obj &&
        obj.blockID !== undefined &&
        obj.blockID !== null &&
        'deckID' in obj &&
        obj.deckID !== undefined &&
        obj.deckID !== null &&
        'priority' in obj &&
        obj.priority !== undefined &&
        obj.priority !== null
    );
}

/**
 * 检查对象是否为 FSRSCard
 *
 * @param obj 待检查的对象
 * @returns 如果是 FSRSCard 返回 true
 *
 * @see 属性 8: 类型守卫准确性
 */
export function isFSRSCard(obj: any): obj is FSRSCard {
    return (
        obj &&
        typeof obj === 'object' &&
        'id' in obj &&
        obj.id !== undefined &&
        obj.id !== null &&
        'blockId' in obj &&
        obj.blockId !== undefined &&
        obj.blockId !== null &&
        'due' in obj &&
        obj.due !== undefined &&
        obj.due !== null &&
        'state' in obj &&
        obj.state !== undefined &&
        obj.state !== null &&
        'stability' in obj &&
        obj.stability !== undefined &&
        obj.stability !== null &&
        'difficulty' in obj &&
        obj.difficulty !== undefined &&
        obj.difficulty !== null &&
        'reps' in obj &&
        obj.reps !== undefined &&
        obj.reps !== null &&
        'lapses' in obj &&
        obj.lapses !== undefined &&
        obj.lapses !== null &&
        'lastReview' in obj &&
        obj.lastReview !== undefined &&
        obj.lastReview !== null &&
        'elapsedDays' in obj &&
        obj.elapsedDays !== undefined &&
        obj.elapsedDays !== null &&
        'scheduledDays' in obj &&
        obj.scheduledDays !== undefined &&
        obj.scheduledDays !== null &&
        'priority' in obj &&
        obj.priority !== undefined &&
        obj.priority !== null &&
        'type' in obj &&
        obj.type !== undefined &&
        obj.type !== null &&
        'tags' in obj &&
        obj.tags !== undefined &&
        obj.tags !== null &&
        'leechCount' in obj &&
        obj.leechCount !== undefined &&
        obj.leechCount !== null &&
        'isLeech' in obj &&
        obj.isLeech !== undefined &&
        obj.isLeech !== null &&
        'skipped' in obj &&
        obj.skipped !== undefined &&
        obj.skipped !== null &&
        'createdAt' in obj &&
        obj.createdAt !== undefined &&
        obj.createdAt !== null &&
        'updatedAt' in obj &&
        obj.updatedAt !== undefined &&
        obj.updatedAt !== null
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
 */
export function queueItemToFSRSCard(item: QueueItem): FSRSCard {
    if (!isQueueItem(item)) {
        throw new Error(`[queueItemToFSRSCard] Invalid QueueItem: ${JSON.stringify(item)}`);
    }

    const dueFromNextDues = item.nextDues?.[4]
        ? new Date(item.nextDues[4]).getTime()
        : Date.now();

    return {
        id: String(item.cardID),
        blockId: String(item.blockID),
        due: dueFromNextDues,
        state: item.state ?? 0,
        stability: item.stability ?? 0,
        difficulty: item.difficulty ?? 5,
        reps: item.reps ?? 0,
        lapses: item.lapses ?? 0,
        lastReview: item.lastReview ?? 0,
        elapsedDays: item.elapsedDays ?? 0,
        scheduledDays: item.scheduledDays ?? 0,
        priority: item.priority,
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
 */
export function resolveCardId(card: FSRSCard | QueueItem | string): string {
    if (typeof card === 'string') {
        return card;
    }

    if (isQueueItem(card)) {
        return String(card.cardID);
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
 */
export function normalizeToFSRSCard(cards: any[]): FSRSCard[] {
    const result: FSRSCard[] = [];
    const errors: string[] = [];

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];

        try {
            if (isFSRSCard(card)) {
                result.push(card);
            } else if (isQueueItem(card)) {
                console.warn(`[normalizeToFSRSCard] Converting QueueItem at index ${i}:`, card.cardID);
                result.push(queueItemToFSRSCard(card));
            } else {
                const error = `[normalizeToFSRSCard] Unknown card type at index ${i}: ${JSON.stringify(card)}`;
                errors.push(error);
                console.error(error);
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
