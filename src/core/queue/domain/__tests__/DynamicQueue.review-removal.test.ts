import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { FilterGroupQueue } from '../FilterGroupQueue';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import { LeechReviewQueue } from '../LeechReviewQueue';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import type { QueuePersistencePort } from '../ports';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now + 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
    ...overrides,
  };
}

function createPersistenceStub(): QueuePersistencePort {
  return {
    get: vi.fn(() => null),
    set: vi.fn(async () => {}),
  };
}

function createManagerStub(card: FSRSCard) {
  const updatedCard: FSRSCard = {
    ...card,
    due: Date.now() + 86_400_000,
    scheduledDays: 1,
    reps: card.reps + 1,
  };

  const route = vi.fn(async () => updatedCard);
  return {
    getCard: vi.fn(async () => ({ ...card })),
    getSchedulerRouter: vi.fn(() => ({ route })),
    onCardUpdatedFromScheduler: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    getDayStartHour: vi.fn(() => 4),
    getCards: vi.fn(async () => []),
    notifyObservers: vi.fn(),
    getPriorityRandomness: vi.fn(() => 0),
    getAutoSortEnabled: vi.fn(() => true),
    getAddToOutstandingEveryNth: vi.fn(() => 2),
  };
}

describe('Dynamic queues - review removal semantics', () => {
  it('retrieval practice review removal does not write temporary blacklist', async () => {
    const card = createCard();
    const manager = createManagerStub(card);
    const queue = new RetrievalPracticeQueue(manager as never);

    await queue.handleReview(card.id, 4);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);

    await queue.removeCard(card.id);
    expect(queue.getTemporaryBlacklistSize()).toBe(1);
  });

  it('incremental learning review removal does not write temporary blacklist', async () => {
    const card = createCard();
    const manager = createManagerStub(card);
    const queue = new IncrementalLearningQueue(
      manager as never,
      createPersistenceStub()
    );

    await queue.handleReview(card.id, 4);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);

    await queue.removeCard(card.id);
    expect(queue.getTemporaryBlacklistSize()).toBe(1);
  });

  it('filter group review removal does not write temporary blacklist', async () => {
    const card = createCard();
    const manager = createManagerStub(card);
    const queue = new FilterGroupQueue(
      manager as never,
      createPersistenceStub()
    );

    await queue.handleReview(card.id, 4);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);

    await queue.removeCard(card.id);
    expect(queue.getTemporaryBlacklistSize()).toBe(1);
  });

  it('leech queue review removal does not write temporary blacklist', async () => {
    const card = createCard();
    const manager = createManagerStub(card);
    const queue = new LeechReviewQueue(manager as never);

    await queue.handleReview(card.id, 4);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);

    await queue.removeCard(card.id);
    expect(queue.getTemporaryBlacklistSize()).toBe(1);
  });
});
