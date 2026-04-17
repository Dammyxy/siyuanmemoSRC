import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { FilterGroupQueue } from '../FilterGroupQueue';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import { LeechReviewQueue } from '../LeechReviewQueue';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import type { QueuePersistencePort } from '../ports';
import { getCurrentDayEnd } from '@/utils/dateUtils';

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

function createManagerStub(
  card: FSRSCard,
  options?: {
    cards?: FSRSCard[];
    updatedCard?: FSRSCard;
  }
) {
  const updatedCard: FSRSCard = options?.updatedCard ?? {
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
    getCards: vi.fn(async () => (options?.cards ?? []).map((item) => ({ ...item }))),
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

  it('retrieval practice keeps same-day cards active after review even when scheduledDays reaches 1', async () => {
    const now = Date.now();
    const card = createCard({
      due: now - 60_000,
      scheduledDays: 0,
    });
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: now + 10 * 60_000,
        scheduledDays: 1,
        reps: card.reps + 1,
      },
    });
    const queue = new RetrievalPracticeQueue(manager as never);

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(false);
    expect(result.remainsInQueue).toBe(true);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
  });

  it('incremental learning keeps same-day cards active after review', async () => {
    const now = Date.now();
    const card = createCard({
      due: now - 60_000,
      scheduledDays: 0,
    });
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: now + 10 * 60_000,
        scheduledDays: 1,
        reps: card.reps + 1,
      },
    });
    const queue = new IncrementalLearningQueue(
      manager as never,
      createPersistenceStub()
    );

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(false);
    expect(result.remainsInQueue).toBe(true);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
  });

  it('incremental learning builds its base set with today window instead of current moment', async () => {
    const now = Date.now();
    const card = createCard({
      due: now + 10 * 60_000,
    });
    const manager = createManagerStub(card, { cards: [] });
    const queue = new IncrementalLearningQueue(
      manager as never,
      createPersistenceStub()
    );

    await queue.getCards();

    expect(manager.getCards).toHaveBeenCalledWith({
      cardType: ['item', 'concept', 'descriptor', 'topic', 'incremental', 'webpage'],
      dueDate: { lte: new Date(getCurrentDayEnd(4)) },
      includeSuspended: false,
    });
  });

  it('filter group keeps reviewed cards when they still match the persisted filter', async () => {
    const card = createCard();
    const manager = createManagerStub(card);
    const queue = new FilterGroupQueue(
      manager as never,
      createPersistenceStub()
    );

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(false);
    expect(result.remainsInQueue).toBe(true);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
  });

  it('filter group removes cards once the updated card no longer matches the persisted filter', async () => {
    const card = createCard({ state: 0 });
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        state: 1,
        reps: card.reps + 1,
      },
    });
    const queue = new FilterGroupQueue(
      manager as never,
      createPersistenceStub(),
      { cardStatus: ['new'] }
    );

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(true);
    expect(result.remainsInQueue).toBe(false);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
  });

  it('filter group explicit remove keeps card hidden until rebuild clears temporary blacklist', async () => {
    const card = createCard();
    const manager = createManagerStub(card, { cards: [card] });
    const queue = new FilterGroupQueue(
      manager as never,
      createPersistenceStub()
    );

    const beforeReview = await queue.getCards();
    expect(beforeReview.map((item) => item.id)).toContain(card.id);

    await queue.removeCard(card.id);
    expect(queue.getTemporaryBlacklistSize()).toBe(1);

    const afterReview = await queue.getCards();
    expect(afterReview).toHaveLength(0);

    await queue.rebuild();
    expect(queue.getTemporaryBlacklistSize()).toBe(0);

    const afterRebuild = await queue.getCards();
    expect(afterRebuild.map((item) => item.id)).toContain(card.id);
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

  it('leech queue removes cards when review schedules them outside the today window', async () => {
    const now = Date.now();
    const card = createCard({
      due: now - 60_000,
      lapses: 9,
    });
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: getCurrentDayEnd(4) + 60_000,
        reps: card.reps + 1,
      },
    });
    const queue = new LeechReviewQueue(manager as never);

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(true);
    expect(result.remainsInQueue).toBe(false);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
  });
});
