/**
 * Feature: queue-architecture-diagnosis, Property 12: getAllCards inheritance
 *
 * 对于任何继承 BaseReviewQueue 的队列类，应具有可调用的 getAllCards()
 * 且返回 FSRSCard 数组。
 */

import { describe, it, expect } from 'vitest';
import { BaseReviewQueue } from '../../core/queue/domain/BaseReviewQueue';
import { QueueType } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import type { QueueItem } from '../../core/queue/types';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

class TestQueue extends BaseReviewQueue {
    public name = 'TestQueue';
    private mockCards: FSRSCard[] = [];

    constructor() {
        super({ notifyObservers: () => undefined } as any, QueueType.RetrievalPractice);
    }

    public setCards(cards: FSRSCard[]): void {
        this.mockCards = cards;
    }

    public async getCards(): Promise<FSRSCard[]> {
        return this.mockCards;
    }

    public async addCard(_card: FSRSCard | QueueItem | string): Promise<void> {}

    public async removeCard(_cardIdOrBlockId: string): Promise<void> {}

    public async handleReview(_cardId: string, _rating: number): Promise<void> {}

    public isDynamic(): boolean {
        return false;
    }
}

describe('BaseReviewQueue Properties', () => {
    it('Property 12: getAllCards inheritance', () => {
        fc.assert(
            fc.asyncProperty(
                fc.array(fc.record({
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
                }) as any),
                async (cards) => {
                    const queue = new TestQueue();
                    queue.setCards(cards as FSRSCard[]);
                    const result = await queue.getAllCards();
                    expect(Array.isArray(result)).toBe(true);
                    expect(result.length).toBe(cards.length);
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });
});
