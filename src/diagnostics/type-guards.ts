/**
 * Type Guards
 * 类型守卫
 *
 * 提供运行时类型检查与规范化转换。
 */

import type { QueueItem } from '../core/queue/types';
import { CardType } from '../types/card';
import type { FSRSCard } from '../types/card';

type UnknownRecord = Record<string, unknown>;
type NextDues = Record<1 | 2 | 3 | 4, string>;

const EMPTY_NEXT_DUES: NextDues = { 1: '', 2: '', 3: '', 4: '' };

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function pickValue(record: UnknownRecord, keys: readonly string[]): unknown {
    for (const key of keys) {
        const candidate = record[key];
        if (candidate !== undefined && candidate !== null) {
            return candidate;
        }
    }
    return undefined;
}

function toStringOrNull(value: unknown): string | null {
    if (typeof value === 'string') {
        return value.length > 0 ? value : null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return null;
}

function toFiniteNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function toFiniteNumberOr(value: unknown, fallback: number): number {
    const numberValue = toFiniteNumber(value);
    return numberValue ?? fallback;
}

function normalizeNextDuesValue(raw: unknown): NextDues {
    if (!isRecord(raw)) {
        return { ...EMPTY_NEXT_DUES };
    }

    const byNumber: NextDues = {
        1: String(raw[1] ?? raw['1'] ?? ''),
        2: String(raw[2] ?? raw['2'] ?? ''),
        3: String(raw[3] ?? raw['3'] ?? ''),
        4: String(raw[4] ?? raw['4'] ?? ''),
    };

    if (byNumber[1] || byNumber[2] || byNumber[3] || byNumber[4]) {
        return byNumber;
    }

    return {
        1: String(raw.again ?? ''),
        2: String(raw.hard ?? ''),
        3: String(raw.good ?? ''),
        4: String(raw.easy ?? ''),
    };
}

function resolveDueFromNextDues(raw: unknown): number {
    const normalized = normalizeNextDuesValue(raw);
    const dueCandidate = normalized[4] || normalized[3] || normalized[2] || normalized[1];
    const due = dueCandidate ? new Date(dueCandidate).getTime() : NaN;
    return Number.isFinite(due) ? due : Date.now();
}

type QueueIdentity = {
    cardId: string;
    blockId: string;
};

function resolveQueueIdentity(raw: UnknownRecord): QueueIdentity | null {
    const cardId = toStringOrNull(pickValue(raw, ['cardID', 'cardId', 'id']));
    const blockId = toStringOrNull(pickValue(raw, ['blockID', 'blockId', 'id']));

    if (!cardId || !blockId) {
        return null;
    }

    return { cardId, blockId };
}

function normalizeFSRSCard(card: FSRSCard): FSRSCard {
    const now = Date.now();
    return {
        ...card,
        xiuyuanID: typeof card.xiuyuanID === 'string' && card.xiuyuanID.length > 0 ? card.xiuyuanID : card.blockId,
        priority: card.priority ?? 50,
        type: card.type ?? CardType.Item,
        tags: Array.isArray(card.tags) ? card.tags : [],
        leechCount: card.leechCount ?? 0,
        isLeech: card.isLeech ?? false,
        skipped: card.skipped ?? false,
        createdAt: card.createdAt ?? now,
        updatedAt: card.updatedAt ?? now,
    };
}

function normalizeSingleCard(card: unknown, index: number): FSRSCard {
    if (isFSRSCard(card)) {
        return normalizeFSRSCard(card);
    }

    if (isQueueItem(card)) {
        return queueItemToFSRSCard(card);
    }

    const details = isRecord(card) ? `keys=${Object.keys(card).join(',')}` : `type=${typeof card}`;
    throw new Error(`[normalizeToFSRSCard] Unsupported card at index ${index}: ${details}`);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * 检查对象是否可作为 QueueItem 输入。
 *
 * 支持兼容字段：
 * - 新字段：id/blockId/deckId
 * - 旧字段：cardID/cardId/blockID/blockId/deckID
 */
export function isQueueItem(obj: unknown): obj is QueueItem {
    if (!isRecord(obj)) {
        return false;
    }

    if (isFSRSCard(obj)) {
        return false;
    }

    return resolveQueueIdentity(obj) !== null;
}

/**
 * 检查对象是否为 FSRSCard。
 */
export function isFSRSCard(obj: unknown): obj is FSRSCard {
    if (!isRecord(obj)) {
        return false;
    }

    const hasId = toStringOrNull(obj.id) !== null;
    const hasBlockId = toStringOrNull(obj.blockId) !== null;

    if (!hasId || !hasBlockId) {
        return false;
    }

    return (
        toFiniteNumber(obj.due) !== null &&
        toFiniteNumber(obj.state) !== null &&
        toFiniteNumber(obj.stability) !== null &&
        toFiniteNumber(obj.difficulty) !== null &&
        toFiniteNumber(obj.reps) !== null &&
        toFiniteNumber(obj.lapses) !== null &&
        toFiniteNumber(obj.lastReview) !== null &&
        toFiniteNumber(obj.elapsedDays) !== null &&
        toFiniteNumber(obj.scheduledDays) !== null
    );
}

// ============================================================================
// Type Conversion
// ============================================================================

/**
 * 将 QueueItem 转换为 FSRSCard。
 */
export function queueItemToFSRSCard(item: QueueItem): FSRSCard {
    if (!isQueueItem(item)) {
        throw new Error(`[queueItemToFSRSCard] Invalid QueueItem: ${JSON.stringify(item)}`);
    }

    const raw = item as unknown as UnknownRecord;
    const identity = resolveQueueIdentity(raw);

    if (!identity) {
        throw new Error(`[queueItemToFSRSCard] Missing card identity: ${JSON.stringify(item)}`);
    }

    const deckId = toStringOrNull(pickValue(raw, ['deckID', 'deckId'])) ?? '';
    const now = Date.now();

    return {
        id: identity.cardId,
        xiuyuanID: identity.blockId,
        blockId: identity.blockId,
        due: resolveDueFromNextDues(raw.nextDues),
        state: toFiniteNumberOr(raw.state, 0),
        stability: toFiniteNumberOr(raw.stability, 0),
        difficulty: toFiniteNumberOr(raw.difficulty, 5),
        reps: toFiniteNumberOr(raw.reps, 0),
        lapses: toFiniteNumberOr(raw.lapses, 0),
        lastReview: toFiniteNumberOr(raw.lastReview, 0),
        elapsedDays: toFiniteNumberOr(raw.elapsedDays, 0),
        scheduledDays: toFiniteNumberOr(raw.scheduledDays, 0),
        priority: toFiniteNumberOr(raw.priority, 50),
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: toFiniteNumberOr(raw.updatedAt, now),
        updatedAt: toFiniteNumberOr(raw.updatedAt, now),
        meta: {
            ...(isRecord(raw.meta) ? raw.meta : {}),
            deckId,
        },
    };
}

/**
 * 将 FSRSCard 转换为 QueueItem（新字段规范）。
 */
export function fsrsCardToQueueItem(card: FSRSCard): QueueItem {
    if (!isFSRSCard(card)) {
        throw new Error(`[fsrsCardToQueueItem] Invalid FSRSCard: ${JSON.stringify(card)}`);
    }

    return {
        id: card.id,
        blockId: card.blockId,
        deckId: '',
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
        meta: isRecord(card.meta) ? card.meta : undefined,
    };
}

// ============================================================================
// Mixed Type Handling
// ============================================================================

/**
 * 解析卡片 ID（支持 FSRSCard / QueueItem / string）。
 */
export function resolveCardId(card: FSRSCard | QueueItem | string): string {
    if (typeof card === 'string') {
        return card;
    }

    if (isFSRSCard(card)) {
        return card.id;
    }

    if (isQueueItem(card)) {
        const raw = card as unknown as UnknownRecord;
        const cardId = toStringOrNull(pickValue(raw, ['cardID', 'cardId', 'id']));
        if (cardId) {
            return cardId;
        }
    }

    throw new Error(`[resolveCardId] Unknown card type: ${JSON.stringify(card)}`);
}

/**
 * 规范化卡片输入（支持 FSRSCard / QueueItem）。
 */
export function normalizeCardInput(card: FSRSCard | QueueItem): FSRSCard {
    if (isFSRSCard(card)) {
        return normalizeFSRSCard(card);
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
 * 批量转换卡片数组为 FSRSCard。
 */
export function normalizeToFSRSCard(cards: readonly unknown[]): FSRSCard[] {
    const result: FSRSCard[] = [];
    const errors: string[] = [];

    for (let index = 0; index < cards.length; index++) {
        try {
            result.push(normalizeSingleCard(cards[index], index));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(message);
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
 * 运行时类型验证错误。
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
 * 验证队列方法返回类型。
 */
export function validateQueueReturnType(
    queueName: string,
    methodName: string,
    returnValue: unknown
): void {
    const validator = new RuntimeTypeValidator();
    validator.validateQueueReturnType(queueName, methodName, returnValue);
}

/**
 * 验证消费者接收的卡片类型。
 */
export function validateConsumerCardType(consumerName: string, cards: readonly unknown[]): void {
    const validator = new RuntimeTypeValidator();
    validator.validateConsumerCardType(consumerName, cards);
}

/**
 * Runtime Type Validator
 * 运行时类型验证器
 */
export class RuntimeTypeValidator {
    /**
     * 验证队列方法返回类型。
     */
    validateQueueReturnType(
        queueName: string,
        methodName: string,
        returnValue: unknown
    ): void {
        if (process.env.NODE_ENV !== 'development') {
            return;
        }

        if (methodName !== 'getAllCards') {
            return;
        }

        if (!Array.isArray(returnValue)) {
            throw new TypeMismatchError(
                `[${queueName}.${methodName}()] must return an array, got ${typeof returnValue}`,
                'FSRSCard[]',
                typeof returnValue,
                `queue=${queueName}, method=${methodName}`
            );
        }

        for (let index = 0; index < returnValue.length; index++) {
            const card = returnValue[index];
            if (!isFSRSCard(card)) {
                throw new TypeMismatchError(
                    `[${queueName}.${methodName}()] must return FSRSCard[], got invalid value at index ${index}`,
                    'FSRSCard[]',
                    typeof card,
                    `queue=${queueName}, method=${methodName}, index=${index}`
                );
            }
        }
    }

    /**
     * 验证消费者接收的卡片类型。
     */
    validateConsumerCardType(consumerName: string, cards: readonly unknown[]): void {
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

        for (let index = 0; index < cards.length; index++) {
            const card = cards[index];
            if (!isFSRSCard(card)) {
                throw new TypeMismatchError(
                    `[${consumerName}] Card at index ${index} is not FSRSCard`,
                    'FSRSCard',
                    typeof card,
                    `consumer=${consumerName}, index=${index}`
                );
            }
        }
    }
}
