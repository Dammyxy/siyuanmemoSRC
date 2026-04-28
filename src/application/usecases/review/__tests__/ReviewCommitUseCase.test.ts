import { describe, expect, it, vi } from 'vitest';
import { ReviewCommitUseCase } from '../ReviewCommitUseCase';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import type { SchedulingDecision } from '@/core/scheduler/srs-v2';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-04-27T08:00:00+08:00').getTime();
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: now,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 86_400_000,
    updatedAt: now,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

function createDecision(before: FSRSCard, after: FSRSCard, rating = Rating.Good): SchedulingDecision {
  const reviewedAt = after.lastReview || Date.now();
  const selected = {
    rating,
    card: after,
    due: after.due,
    scheduledDays: after.scheduledDays,
    state: after.state,
    schedulerType: 'fsrs-v6' as const,
    algorithm: 'memory-fsrs' as const,
    generatedAt: reviewedAt,
    intervalMs: Math.max(0, after.due - reviewedAt),
    stability: after.stability,
    difficulty: after.difficulty,
  };
  return {
    attempt: {
      id: `srs-v2:${before.id}:${reviewedAt}:${rating}`,
      cardId: before.id,
      rating,
      reviewedAt,
      schedulerType: 'fsrs-v6',
      algorithm: 'memory-fsrs',
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      source: 'queue',
      isDrill: false,
      isFiltered: false,
      customStudy: false,
    },
    before,
    current: before,
    after,
    selected,
    choices: new Map([[rating, selected]]),
    schedulerType: 'fsrs-v6',
    algorithm: 'memory-fsrs',
    queueMode: 'formal',
    commitPolicy: 'write-schedule',
  };
}

describe('ReviewCommitUseCase', () => {
  it('writes card, revlog v2, and post-commit events for formal reviews', async () => {
    const before = createCard();
    const after = createCard({ due: before.due + 3 * 86_400_000, reps: 2, lastReview: before.due });
    const decision = createDecision(before, after);
    const addReviewLogV2 = vi.fn(async () => {});
    const onCommittedCard = vi.fn(async () => {});
    const scheduler = {
      answer: vi.fn(() => decision),
      commit: vi.fn(async () => ({
        decision,
        updatedCard: after,
        committed: true,
      })),
      route: vi.fn(),
    };

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: scheduler as never,
      reviewLogs: { addReviewLogV2 },
      onCommittedCard,
    });

    const result = await useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    });

    expect(result.updatedCard).toEqual(after);
    expect(result.committed).toBe(true);
    expect(scheduler.answer).toHaveBeenCalledWith(before, Rating.Good, expect.objectContaining({
      queueType: 'retrieval-practice',
      source: 'queue',
    }));
    expect(addReviewLogV2).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2,
      cardId: before.id,
      after: expect.objectContaining({ id: after.id, due: after.due }),
      isDrill: false,
    }));
    expect(onCommittedCard).toHaveBeenCalledWith(after);
  });

  it('passes queue scheduling context into Arena SRS review recording', async () => {
    const before = createCard();
    const after = createCard({
      due: before.due + 13 * 86_400_000,
      reps: 2,
      lastReview: before.due,
      scheduledDays: 13,
    });
    const decision = createDecision(before, after, Rating.Hard);
    const arena = {
      recordSrsReview: vi.fn(async () => null),
    };
    const scheduler = {
      answer: vi.fn(() => decision),
      commit: vi.fn(async () => ({
        decision,
        updatedCard: after,
        committed: true,
      })),
      route: vi.fn(),
    };
    const schedulingContext = {
      queueType: 'retrieval-practice' as const,
      memoryStateAsOf: before.due + 30 * 86_400_000,
      queueMode: 'filtered-preview' as const,
      commitPolicy: 'preview-only' as const,
      customStudy: true,
    };

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: scheduler as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      arena,
    });

    await useCase.execute({
      cardId: before.id,
      rating: Rating.Hard,
      context: schedulingContext,
    });

    expect(arena.recordSrsReview).toHaveBeenCalledWith(expect.objectContaining({
      card: before,
      rating: Rating.Hard,
      currentSchedulerType: 'fsrs-v6',
      schedulingContext: expect.objectContaining({
        ...schedulingContext,
        source: 'queue',
      }),
    }));
  });

  it('keeps preview-only reviews out of formal card writes and revlog v2', async () => {
    const before = createCard({ due: Date.now() + 5 * 86_400_000 });
    const decision = {
      ...createDecision(before, before),
      queueMode: 'filtered-preview' as const,
      commitPolicy: 'preview-only' as const,
    };
    decision.attempt.queueMode = 'filtered-preview';
    decision.attempt.commitPolicy = 'preview-only';
    decision.attempt.isFiltered = true;
    decision.attempt.customStudy = true;
    const addReviewLogV2 = vi.fn(async () => {});
    const onCommittedCard = vi.fn(async () => {});
    const scheduler = {
      answer: vi.fn(() => decision),
      commit: vi.fn(async () => ({
        decision,
        updatedCard: null,
        committed: false,
        suppressedReason: 'preview-only',
      })),
      route: vi.fn(),
    };

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: scheduler as never,
      reviewLogs: { addReviewLogV2 },
      onCommittedCard,
    });

    const result = await useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'filter-group',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      },
    });

    expect(result.updatedCard).toEqual(before);
    expect(result.committed).toBe(false);
    expect(addReviewLogV2).not.toHaveBeenCalled();
    expect(onCommittedCard).not.toHaveBeenCalled();
  });

  it('fails fast when the scheduler returns dirty persistent scheduling metadata', async () => {
    const before = createCard();
    const after = {
      ...createCard({ due: before.due + 86_400_000, reps: 2, lastReview: before.due }),
      nextDues: { good: before.due + 86_400_000 },
    } as FSRSCard & { nextDues: unknown };
    const decision = createDecision(before, after);
    const addReviewLogV2 = vi.fn(async () => {});
    const onCommittedCard = vi.fn(async () => {});
    const scheduler = {
      answer: vi.fn(() => decision),
      commit: vi.fn(async () => ({
        decision,
        updatedCard: after,
        committed: true,
      })),
      route: vi.fn(),
    };

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: scheduler as never,
      reviewLogs: { addReviewLogV2 },
      onCommittedCard,
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    })).rejects.toThrow(/Dirty scheduling state/);
    expect(addReviewLogV2).not.toHaveBeenCalled();
    expect(onCommittedCard).not.toHaveBeenCalled();
  });
});
