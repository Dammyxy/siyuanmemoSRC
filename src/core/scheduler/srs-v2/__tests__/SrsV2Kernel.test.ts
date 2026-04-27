import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import { normalizeSchedulerCard } from '../../normalizeSchedulerCard';
import { SrsV2Kernel, type SrsV2SchedulerAdapter } from '../SrsV2Kernel';

const DAY_MS = 86_400_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-04-27T08:00:00+08:00').getTime();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 10,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 10 * DAY_MS,
    elapsedDays: 10,
    scheduledDays: 10,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 20 * DAY_MS,
    updatedAt: now - DAY_MS,
    ...overrides,
  };
}

function createKernel(scheduler: SrsV2SchedulerAdapter, schedulerType: 'fsrs-v6' | 'a-factor-v2' = 'fsrs-v6') {
  return new SrsV2Kernel({
    resolveSchedulerType: () => schedulerType,
    getScheduler: () => scheduler,
    normalizeCard: (card, type, options) => normalizeSchedulerCard(card, type, options),
  });
}

describe('SrsV2Kernel', () => {
  it('builds normalized four-button preview choices', () => {
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const scheduler = {
      preview: vi.fn((card: FSRSCard, now: Date) => new Map([
        [Rating.Again, { ...card, due: now.getTime() + 10 * 60_000, scheduledDays: 0 }],
        [Rating.Hard, { ...card, due: now.getTime() + 8 * DAY_MS, scheduledDays: 8 }],
        [Rating.Good, { ...card, due: now.getTime() + 12 * DAY_MS, scheduledDays: 12 }],
        [Rating.Easy, { ...card, due: now.getTime() + 20 * DAY_MS, scheduledDays: 20 }],
      ])),
      review: vi.fn((card: FSRSCard) => card),
    };
    const kernel = createKernel(scheduler);

    const preview = kernel.preview(createCard(), { reviewTime });

    expect(preview.schedulerType).toBe('fsrs-v6');
    expect(preview.algorithm).toBe('memory-fsrs');
    expect(preview.queueMode).toBe('formal');
    expect(preview.commitPolicy).toBe('write-schedule');
    expect(preview.choices).toHaveLength(4);
    expect(preview.choices.get(Rating.Good)).toEqual(expect.objectContaining({
      rating: Rating.Good,
      due: reviewTime.getTime() + 12 * DAY_MS,
      scheduledDays: 12,
      intervalMs: 12 * DAY_MS,
      schedulerType: 'fsrs-v6',
    }));
  });

  it('answers without committing when context is filtered preview', () => {
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const scheduler = {
      preview: vi.fn((card: FSRSCard, now: Date) => new Map([
        [Rating.Again, { ...card, due: now.getTime() + 10 * 60_000 }],
        [Rating.Hard, { ...card, due: now.getTime() + 8 * DAY_MS }],
        [Rating.Good, { ...card, due: now.getTime() + 12 * DAY_MS }],
        [Rating.Easy, { ...card, due: now.getTime() + 20 * DAY_MS }],
      ])),
      review: vi.fn((card: FSRSCard, rating: Rating, now: Date) => ({
        ...card,
        due: now.getTime() + rating * DAY_MS,
        lastReview: now.getTime(),
        reps: card.reps + 1,
      })),
    };
    const kernel = createKernel(scheduler);

    const decision = kernel.answer(createCard(), Rating.Good, {
      reviewTime,
      queueType: 'filter-group',
      queueMode: 'filtered-preview',
      commitPolicy: 'preview-only',
      isFiltered: true,
      customStudy: true,
    });
    const commit = kernel.commit(decision);

    expect(decision.attempt.id).toContain('srs-v2:card-1');
    expect(decision.attempt.queueType).toBe('filter-group');
    expect(decision.after.reps).toBe(3);
    expect(commit.committed).toBe(false);
    expect(commit.updatedCard).toBeNull();
    expect(commit.suppressedReason).toBe('preview-only');
  });

  it('anchors future manual memory to due day while scheduling from actual review time', () => {
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const memoryTime = new Date('2026-05-10T08:00:00+08:00');
    const lastReview = memoryTime.getTime() - 30 * DAY_MS;
    const scheduler = {
      preview: vi.fn((card: FSRSCard, now: Date) => new Map([
        [Rating.Good, { ...card, due: now.getTime() + (card.scheduledDays + 5) * DAY_MS }],
      ])),
      review: vi.fn((card: FSRSCard, rating: Rating, now: Date) => ({
        ...card,
        due: now.getTime() + (card.scheduledDays + rating) * DAY_MS,
        lastReview: now.getTime(),
      })),
    };
    const kernel = createKernel(scheduler);
    const card = createCard({
      due: memoryTime.getTime(),
      lastReview,
      scheduledDays: 30,
      elapsedDays: 0,
    });

    const decision = kernel.answer(card, Rating.Good, {
      reviewTime: reviewTime.getTime(),
      memoryStateAsOf: memoryTime.getTime(),
    });

    expect(scheduler.preview).toHaveBeenCalledWith(expect.objectContaining({
      due: reviewTime.getTime(),
      lastReview: reviewTime.getTime() - 30 * DAY_MS,
      elapsedDays: 30,
    }), reviewTime);
    expect(scheduler.review).toHaveBeenCalledWith(expect.objectContaining({
      due: reviewTime.getTime(),
      lastReview: reviewTime.getTime() - 30 * DAY_MS,
      elapsedDays: 30,
    }), Rating.Good, reviewTime);
    expect(decision.after.due).toBe(reviewTime.getTime() + 33 * DAY_MS);
  });

  it('classifies a-factor scheduling as rotation with writable schedule by default', () => {
    const reviewTime = new Date('2026-04-27T08:00:00+08:00');
    const scheduler = {
      preview: vi.fn((card: FSRSCard, now: Date) => new Map([
        [Rating.Good, { ...card, due: now.getTime() + 2 * DAY_MS }],
      ])),
      review: vi.fn((card: FSRSCard, _rating: Rating, now: Date) => ({
        ...card,
        due: now.getTime() + 2 * DAY_MS,
      })),
    };
    const kernel = createKernel(scheduler, 'a-factor-v2');

    const decision = kernel.answer(createCard({ type: CardType.Topic }), Rating.Good, { reviewTime });
    const commit = kernel.commit(decision);

    expect(decision.algorithm).toBe('rotation');
    expect(decision.queueMode).toBe('rotation');
    expect(commit.committed).toBe(true);
    expect(commit.updatedCard?.schedulerType).toBe('a-factor-v2');
  });
});
