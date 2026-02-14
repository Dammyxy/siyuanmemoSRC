/**
 * Mixed Type Handling Tests
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CardType, type FSRSCard } from '../../types/card';
import type { QueueItem } from '../../core/queue/types';
import { normalizeCardInput, resolveCardId } from '../type-guards';

const buildFsrsCard = (id: string): FSRSCard => ({
    id,
    blockId: `block-${id}`,
    due: Date.now(),
    state: 0,
    stability: 0,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {},
});

const buildQueueItem = (id: string): QueueItem => ({
    cardID: id as any,
    blockID: `block-${id}` as any,
    deckID: `deck-${id}` as any,
    priority: 50,
});

describe('Mixed type handling', () => {
    /**
     * Feature: queue-architecture-diagnosis, Property 18: 类型处理灵活性
     *
     * 对于任何 FSRSCard 或 QueueItem，系统应能解析卡片 ID 并可转换为 FSRSCard。
     */
    it('Feature: queue-architecture-diagnosis, Property 18: should handle FSRSCard and QueueItem inputs', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 12 }), (id) => {
                const fsrsCard = buildFsrsCard(id);
                const queueItem = buildQueueItem(id);

                const fsrsId = resolveCardId(fsrsCard);
                const queueId = resolveCardId(queueItem);
                const stringId = resolveCardId(id);

                expect(fsrsId).toBe(id);
                expect(queueId).toBe(id);
                expect(stringId).toBe(id);

                const normalizedFsrs = normalizeCardInput(fsrsCard);
                const normalizedQueue = normalizeCardInput(queueItem);

                expect(normalizedFsrs.id).toBe(id);
                expect(normalizedQueue.id).toBe(id);
            })
        );
    });
});

