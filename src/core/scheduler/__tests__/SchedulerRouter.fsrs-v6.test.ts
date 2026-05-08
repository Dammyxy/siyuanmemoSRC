import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types';
import { CardState, CardType } from '@/types/card';
import { SchedulerRouter } from '../SchedulerRouter';
import { TSFSRSScheduler } from '../strategies/TSFSRSScheduler';
import { DEFAULT_SETTINGS } from '@/types/settings';

const DAY_MS = 86_400_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    blockId: 'block-1',
    due: now + 86400000,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRouter(fsrsParams = DEFAULT_SETTINGS.fsrs) {
  const cardUpdater = {
    batchUpdateCardsWithoutEvents: vi.fn().mockResolvedValue(undefined),
  };
  return {
    router: new SchedulerRouter(
      {
        defaultScheduler: 'fsrs-v6',
        fsrsParams,
      },
      cardUpdater
    ),
    cardUpdater,
  };
}

async function answerAndCommit(
  router: SchedulerRouter,
  card: FSRSCard,
  rating: 1 | 2 | 3 | 4,
  options: Parameters<SchedulerRouter['answer']>[2] = {}
): Promise<FSRSCard> {
  const decision = router.answer(card, rating, options);
  const result = await router.commit(decision);
  if (!result.updatedCard) {
    throw new Error('Expected committed scheduler result');
  }
  return result.updatedCard;
}

describe('SchedulerRouter fsrs-v6 migration constraints', () => {
  it('registers only one TSFSRSScheduler instance', () => {
    const { router } = createRouter();
    const schedulers = (router as unknown as { schedulers: Map<string, unknown> }).schedulers;

    const fsrsSchedulerInstances = [...schedulers.values()].filter(
      (scheduler) => scheduler instanceof TSFSRSScheduler
    );

    expect(fsrsSchedulerInstances).toHaveLength(1);
    expect(schedulers.has('fsrs-v6')).toBe(true);
    expect(schedulers.has('fsrs-v5')).toBe(false);
  });

  it('rejects legacy fsrs-v5 schedulerType on cards', () => {
    const { router } = createRouter();
    const legacyCard = createCard({
      schedulerType: 'fsrs-v5',
      type: CardType.Item,
    });

    expect(() => router.getSchedulerType(legacyCard)).toThrow(/unsupported scheduler type/i);
  });

  it('normalizes dirty card data before and after scheduling', async () => {
    const { router, cardUpdater } = createRouter();
    const updatedCard = await answerAndCommit(router, createCard({
      schedulerType: undefined,
      type: CardType.Item,
      state: 2,
      due: Number.NaN,
      stability: 0,
      difficulty: Number.POSITIVE_INFINITY,
      reps: -3,
      lapses: -1,
      lastReview: 0,
      elapsedDays: -2,
      scheduledDays: 0,
      learning_step: -1,
      priority: Number.NEGATIVE_INFINITY,
      createdAt: 0,
      updatedAt: Number.NaN,
    }), 3);

    expect(updatedCard.schedulerType).toBe('fsrs-v6');
    expect(Number.isFinite(updatedCard.due)).toBe(true);
    expect(updatedCard.difficulty).toBeGreaterThanOrEqual(1);
    expect(updatedCard.difficulty).toBeLessThanOrEqual(10);
    expect(updatedCard.priority).toBeGreaterThanOrEqual(0);
    expect(updatedCard.priority).toBeLessThanOrEqual(100);
    expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(cardUpdater.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: updatedCard.id,
        schedulerType: 'fsrs-v6',
      }),
    ], {
      preferIncomingScheduling: true,
      schedulingWriteSource: 'review-commit',
    });
  });

  it('forces item cards with legacy a-factor schedulerType onto fsrs-v6', async () => {
    const { router } = createRouter();
    const itemCard = createCard({
      id: 'legacy-a-factor-item',
      type: CardType.Item,
      schedulerType: 'a-factor-v2',
      state: CardState.Review,
      due: new Date('2026-04-26T23:38:33+08:00').getTime(),
      lastReview: new Date('2026-02-15T23:38:33+08:00').getTime(),
      stability: 1,
      scheduledDays: 1,
      reps: 4,
    });
    const fsrsScheduler = {
      preview: vi.fn((card: FSRSCard) => new Map([
        [1, { ...card, due: Date.now() + 10 * 60_000 }],
        [2, { ...card, due: Date.now() + card.scheduledDays * DAY_MS }],
        [3, { ...card, due: Date.now() + (card.scheduledDays + 1) * DAY_MS }],
        [4, { ...card, due: Date.now() + (card.scheduledDays + 2) * DAY_MS }],
      ])),
      review: vi.fn((card: FSRSCard) => ({
        ...card,
        due: Date.now() + card.scheduledDays * DAY_MS,
        reps: card.reps + 1,
      })),
    };
    const aFactorScheduler = {
      preview: vi.fn(),
      review: vi.fn(),
    };
    const schedulers = (router as unknown as { schedulers: Map<string, unknown> }).schedulers;
    schedulers.set('fsrs-v6', fsrsScheduler);
    schedulers.set('a-factor-v2', aFactorScheduler);

    expect(router.getSchedulerType(itemCard)).toBe('fsrs-v6');

    const previews = router.preview(itemCard);
    expect(fsrsScheduler.preview).toHaveBeenCalledWith(expect.objectContaining({
      id: 'legacy-a-factor-item',
      schedulerType: 'fsrs-v6',
      stability: 70,
      scheduledDays: 70,
    }), expect.any(Date));
    expect(aFactorScheduler.preview).not.toHaveBeenCalled();
    expect(previews.get(3)?.schedulerType).toBe('fsrs-v6');

    const reviewed = await answerAndCommit(router, itemCard, 3);
    expect(fsrsScheduler.review).toHaveBeenCalledWith(expect.objectContaining({
      id: 'legacy-a-factor-item',
      schedulerType: 'fsrs-v6',
      stability: 70,
      scheduledDays: 70,
    }), 3, expect.any(Date));
    expect(aFactorScheduler.review).not.toHaveBeenCalled();
    expect(reviewed.schedulerType).toBe('fsrs-v6');
  });

  it('uses memoryStateAsOf for elapsed memory while scheduling from reviewTime', async () => {
    const { router, cardUpdater } = createRouter();
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const memoryTime = new Date('2026-05-10T08:00:00+08:00');
    const lastReview = memoryTime.getTime() - 30 * DAY_MS;
    const futureCard = createCard({
      id: 'manual-early-card',
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
      state: CardState.Review,
      due: memoryTime.getTime(),
      lastReview,
      stability: 30,
      scheduledDays: 30,
      elapsedDays: 0,
      reps: 6,
    });
    const fsrsScheduler = {
      preview: vi.fn((card: FSRSCard, now: Date) => new Map([
        [1, { ...card, due: now.getTime() + 10 * 60_000, lastReview: now.getTime() }],
        [2, { ...card, due: now.getTime() + card.scheduledDays * DAY_MS, lastReview: now.getTime() }],
        [3, { ...card, due: now.getTime() + (card.scheduledDays + 5) * DAY_MS, lastReview: now.getTime() }],
        [4, { ...card, due: now.getTime() + (card.scheduledDays + 10) * DAY_MS, lastReview: now.getTime() }],
      ])),
      review: vi.fn((card: FSRSCard, rating: number, now: Date) => ({
        ...card,
        due: now.getTime() + (card.scheduledDays + rating) * DAY_MS,
        lastReview: now.getTime(),
        reps: card.reps + 1,
      })),
    };
    const schedulers = (router as unknown as { schedulers: Map<string, unknown> }).schedulers;
    schedulers.set('fsrs-v6', fsrsScheduler);

    const previews = router.preview(futureCard, {
      reviewTime: reviewTime.getTime(),
      memoryStateAsOf: memoryTime.getTime(),
    });
    expect(fsrsScheduler.preview).toHaveBeenCalledWith(expect.objectContaining({
      id: 'manual-early-card',
      due: reviewTime.getTime(),
      lastReview: reviewTime.getTime() - 30 * DAY_MS,
      elapsedDays: 30,
      scheduledDays: 30,
    }), reviewTime);
    expect(previews.get(3)?.due).toBe(reviewTime.getTime() + 35 * DAY_MS);

    const reviewed = await answerAndCommit(router, futureCard, 3, {
      reviewTime: reviewTime.getTime(),
      memoryStateAsOf: memoryTime.getTime(),
    });
    expect(fsrsScheduler.review).toHaveBeenCalledWith(expect.objectContaining({
      id: 'manual-early-card',
      due: reviewTime.getTime(),
      lastReview: reviewTime.getTime() - 30 * DAY_MS,
      elapsedDays: 30,
      scheduledDays: 30,
    }), 3, reviewTime);
    expect(reviewed.due).toBe(reviewTime.getTime() + 33 * DAY_MS);
    expect(reviewed.lastReview).toBe(reviewTime.getTime());
    expect(cardUpdater.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'manual-early-card',
        due: reviewTime.getTime() + 33 * DAY_MS,
        lastReview: reviewTime.getTime(),
      }),
    ], {
      preferIncomingScheduling: true,
      schedulingWriteSource: 'review-commit',
    });
  });

  it('keeps Again minute-level for manual early reviews while preserving due-day memory interval', async () => {
    const { router, cardUpdater } = createRouter({
      ...DEFAULT_SETTINGS.fsrs,
      enableFuzz: false,
      enableShortTerm: true,
    });
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const memoryTime = new Date('2026-05-10T08:00:00+08:00');
    const futureCard = createCard({
      id: 'manual-early-real-fsrs-card',
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
      state: CardState.Review,
      due: memoryTime.getTime(),
      lastReview: memoryTime.getTime() - 30 * DAY_MS,
      stability: 30,
      difficulty: 5,
      scheduledDays: 30,
      elapsedDays: 0,
      reps: 6,
    });

    const previews = router.preview(futureCard, {
      reviewTime: reviewTime.getTime(),
      memoryStateAsOf: memoryTime.getTime(),
    });
    const againDelay = previews.get(1)!.due - reviewTime.getTime();
    const hardDelay = previews.get(2)!.due - reviewTime.getTime();

    expect(againDelay).toBeGreaterThan(0);
    expect(againDelay).toBeLessThan(60 * 60 * 1000);
    expect(hardDelay).toBeGreaterThan(20 * DAY_MS);

    const reviewedAgain = await answerAndCommit(router, futureCard, 1, {
      reviewTime: reviewTime.getTime(),
      memoryStateAsOf: memoryTime.getTime(),
    });
    expect(reviewedAgain.due - reviewTime.getTime()).toBeLessThan(60 * 60 * 1000);
    expect(reviewedAgain.lastReview).toBe(reviewTime.getTime());
    expect(cardUpdater.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'manual-early-real-fsrs-card',
        due: reviewedAgain.due,
        lastReview: reviewTime.getTime(),
      }),
    ], {
      preferIncomingScheduling: true,
      schedulingWriteSource: 'review-commit',
    });
  });

  it('keeps filtered preview decisions out of formal persistence', async () => {
    const { router, cardUpdater } = createRouter();
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const card = createCard({
      id: 'filtered-preview-card',
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
      state: CardState.Review,
      due: reviewTime.getTime() + 7 * DAY_MS,
      lastReview: reviewTime.getTime() - 10 * DAY_MS,
      stability: 10,
      scheduledDays: 10,
      reps: 3,
    });
    const fsrsScheduler = {
      preview: vi.fn((input: FSRSCard, now: Date) => new Map([
        [1, { ...input, due: now.getTime() + 10 * 60_000 }],
        [2, { ...input, due: now.getTime() + 8 * DAY_MS }],
        [3, { ...input, due: now.getTime() + 12 * DAY_MS }],
        [4, { ...input, due: now.getTime() + 20 * DAY_MS }],
      ])),
      review: vi.fn((input: FSRSCard, _rating: number, now: Date) => ({
        ...input,
        due: now.getTime() + 12 * DAY_MS,
        lastReview: now.getTime(),
        reps: input.reps + 1,
      })),
    };
    const schedulers = (router as unknown as { schedulers: Map<string, unknown> }).schedulers;
    schedulers.set('fsrs-v6', fsrsScheduler);

    const decision = router.answer(card, 3, {
      reviewTime,
      queueType: 'filter-group',
      queueMode: 'filtered-preview',
      commitPolicy: 'preview-only',
      isFiltered: true,
      customStudy: true,
    });
    const result = await router.commit(decision);

    expect(result.committed).toBe(false);
    expect(result.updatedCard).toBeNull();
    expect(cardUpdater.batchUpdateCardsWithoutEvents).not.toHaveBeenCalled();
  });
});
