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
  const schedulerRouter = { route };
  return {
    getCard: vi.fn(async () => ({ ...card })),
    getSchedulerRouter: vi.fn(() => schedulerRouter),
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
    expect(manager.getSchedulerRouter().route).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      4
    );
  });

  it('retrieval practice removes blockId-only manual cards after review', async () => {
    const now = Date.now();
    const card = createCard({
      id: 'card-manual-by-block',
      blockId: 'block-manual-by-block',
      due: now - 60_000,
      scheduledDays: 0,
    });
    const persistence: QueuePersistencePort = {
      get: vi.fn(() => [card.blockId]),
      set: vi.fn(async () => {}),
    };
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: now + 10 * 60_000,
        scheduledDays: 1,
        reps: card.reps + 1,
      },
    });
    const queue = new RetrievalPracticeQueue(manager as never, persistence);
    await queue.load();

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(true);
    expect(result.remainsInQueue).toBe(false);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
    expect(persistence.set).toHaveBeenCalledWith('retrievalPracticeQueue', []);
  });

  it('retrieval practice anchors manual future-card scheduling at the original due date', async () => {
    const now = Date.now();
    const originalDue = getCurrentDayEnd(4) + 5 * 86_400_000;
    const card = createCard({
      id: 'card-manual-future',
      blockId: 'block-manual-future',
      due: originalDue,
      lastReview: originalDue - 30 * 86_400_000,
      scheduledDays: 30,
      stability: 30,
      elapsedDays: 30,
    });
    const persistence: QueuePersistencePort = {
      get: vi.fn(() => [card.id]),
      set: vi.fn(async () => {}),
    };
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: originalDue + 35 * 86_400_000,
        lastReview: originalDue,
        scheduledDays: 35,
        reps: card.reps + 1,
        updatedAt: now,
      },
    });
    const queue = new RetrievalPracticeQueue(manager as never, persistence);
    await queue.load();

    await queue.handleReview(card.id, 3);

    expect(manager.getSchedulerRouter().route).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      3,
      { memoryStateAsOf: originalDue }
    );
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
    expect(manager.getSchedulerRouter().route).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      4
    );
  });

  it('incremental learning removes blockId-only manual cards after review', async () => {
    const now = Date.now();
    const card = createCard({
      id: 'card-incremental-manual-by-block',
      blockId: 'block-incremental-manual-by-block',
      due: now - 60_000,
      scheduledDays: 0,
    });
    const persistence: QueuePersistencePort = {
      get: vi.fn(() => [card.blockId]),
      set: vi.fn(async () => {}),
    };
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: now + 10 * 60_000,
        scheduledDays: 1,
        reps: card.reps + 1,
      },
    });
    const queue = new IncrementalLearningQueue(manager as never, persistence);
    await queue.load();

    const result = await queue.handleReview(card.id, 4);

    expect(result.removedFromQueue).toBe(true);
    expect(result.remainsInQueue).toBe(false);
    expect(queue.getTemporaryBlacklistSize()).toBe(0);
    expect(persistence.set).toHaveBeenCalledWith('incrementalLearningQueue', []);
  });

  it('incremental learning anchors manual future-card scheduling at the original due date', async () => {
    const now = Date.now();
    const originalDue = getCurrentDayEnd(4) + 4 * 86_400_000;
    const card = createCard({
      id: 'card-incremental-future',
      blockId: 'block-incremental-future',
      due: originalDue,
      lastReview: originalDue - 20 * 86_400_000,
      scheduledDays: 20,
      stability: 20,
      elapsedDays: 20,
    });
    const persistence: QueuePersistencePort = {
      get: vi.fn(() => [card.blockId]),
      set: vi.fn(async () => {}),
    };
    const manager = createManagerStub(card, {
      updatedCard: {
        ...card,
        due: originalDue + 25 * 86_400_000,
        lastReview: originalDue,
        scheduledDays: 25,
        reps: card.reps + 1,
        updatedAt: now,
      },
    });
    const queue = new IncrementalLearningQueue(manager as never, persistence);
    await queue.load();

    await queue.handleReview(card.id, 3);

    expect(manager.getSchedulerRouter().route).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      3,
      { memoryStateAsOf: originalDue }
    );
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

  it('filter group future-card preview does not write formal schedule through SRS v2 commit', async () => {
    const card = createCard({
      id: 'filter-future',
      due: getCurrentDayEnd(4) + 5 * 86_400_000,
    });
    const manager = createManagerStub(card);
    const decision = {
      current: { ...card },
      commitPolicy: 'preview-only',
    };
    const schedulerRouter = {
      route: vi.fn(),
      answer: vi.fn(() => decision),
      commit: vi.fn(async () => ({
        decision,
        updatedCard: null,
        committed: false,
        suppressedReason: 'preview-only',
      })),
    };
    manager.getSchedulerRouter.mockReturnValue(schedulerRouter as never);
    const queue = new FilterGroupQueue(
      manager as never,
      createPersistenceStub()
    );

    const result = await queue.handleReview(card.id, 3);

    expect(result.removedFromQueue).toBe(false);
    expect(schedulerRouter.route).not.toHaveBeenCalled();
    expect(schedulerRouter.answer).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id }),
      3,
      expect.objectContaining({
        queueType: 'filter-group',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
        isFiltered: true,
        customStudy: true,
      })
    );
    expect(manager.onCardUpdatedFromScheduler).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
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
        due: now + 3 * 86_400_000,
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
