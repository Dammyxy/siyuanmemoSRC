/**
 * Feature: queue-architecture-diagnosis, Property 8-9: Type guards & conversion
 *
 * Property 8: 类型守卫准确性
 * Property 9: 类型转换保真度
 */

import { describe, it, expect } from 'vitest';
import { isQueueItem, isFSRSCard, queueItemToFSRSCard } from '../type-guards';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

const queueItemArb = fc.record({
    cardID: fc.string(),
    blockID: fc.string(),
    deckID: fc.string(),
    priority: fc.integer({ min: 0, max: 100 }),
    nextDues: fc.record({
        1: fc.string(),
        2: fc.string(),
        3: fc.string(),
        4: fc.string(),
    }, { requiredKeys: ['1', '2', '3', '4'] }),
    state: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
    stability: fc.option(fc.float({ min: 0, max: 100 }), { nil: undefined }),
    difficulty: fc.option(fc.float({ min: 0, max: 10 }), { nil: undefined }),
    reps: fc.option(fc.nat(), { nil: undefined }),
    lapses: fc.option(fc.nat(), { nil: undefined }),
    lastReview: fc.option(fc.nat(), { nil: undefined }),
    elapsedDays: fc.option(fc.nat(), { nil: undefined }),
    scheduledDays: fc.option(fc.nat(), { nil: undefined }),
});

const fsrsCardArb = fc.record({
    id: fc.string(),
    blockId: fc.string(),
    due: fc.nat(),
    stability: fc.float({ min: 0, max: 100 }),
    difficulty: fc.float({ min: 0, max: 10 }),
    reps: fc.nat(),
    lapses: fc.nat(),
    state: fc.integer({ min: 0, max: 3 }),
    lastReview: fc.nat(),
    elapsedDays: fc.nat(),
    scheduledDays: fc.nat(),
    priority: fc.integer({ min: 0, max: 100 }),
    type: fc.constantFrom('item', 'topic', 'incremental', 'webpage'),
    tags: fc.array(fc.string(), { maxLength: 3 }),
    leechCount: fc.nat(),
    isLeech: fc.boolean(),
    skipped: fc.boolean(),
    createdAt: fc.nat(),
    updatedAt: fc.nat(),
});

describe('Type Guards Properties', () => {
    it('Property 8: Type guard accuracy', () => {
        fc.assert(
            fc.property(queueItemArb, fsrsCardArb, (queueItem, fsrsCard) => {
                expect(isQueueItem(queueItem)).toBe(true);
                expect(isFSRSCard(fsrsCard)).toBe(true);

                const invalid = { ...queueItem, cardID: undefined };
                expect(isQueueItem(invalid)).toBe(false);
            }),
            PROPERTY_TEST_CONFIG
        );
    });

    it('Property 9: Type conversion fidelity', () => {
        fc.assert(
            fc.property(queueItemArb, (queueItem) => {
                const dueDate = new Date('2024-01-01T00:00:00.000Z').toISOString();
                const withDue = { ...queueItem, nextDues: { 1: dueDate, 2: dueDate, 3: dueDate, 4: dueDate } };
                const converted = queueItemToFSRSCard(withDue);

                expect(converted.blockId).toBe(String(withDue.blockID));
                expect(converted.due).toBe(new Date(dueDate).getTime());
                expect(converted.stability).toBe(withDue.stability ?? 0);
                expect(converted.difficulty).toBe(withDue.difficulty ?? 5);
                expect(converted.reps).toBe(withDue.reps ?? 0);
            }),
            PROPERTY_TEST_CONFIG
        );
    });
});
