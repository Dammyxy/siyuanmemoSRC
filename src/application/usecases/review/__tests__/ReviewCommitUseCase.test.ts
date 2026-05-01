import { describe, expect, it, vi } from 'vitest';
import { ReviewCommitUseCase } from '../ReviewCommitUseCase';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';

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

describe('ReviewCommitUseCase', () => {
  it('fails with explicit unavailable when backend worker path is not configured', async () => {
    const before = createCard();
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires backend-worker ownership');
  });

  it('uses worker feedback path for retrieval-practice formal commit', async () => {
    const before = createCard({ due: Date.now() - 3_600_000 });
    const after = createCard({
      id: before.id,
      due: before.due + 5 * 86_400_000,
      reps: before.reps + 1,
      lastReview: before.due,
      scheduledDays: 5,
      updatedAt: before.updatedAt + 1_000,
    });
    const reviewFeedback = vi.fn(async () => ({
      committed: true,
      updatedCard: after,
    }));
    const onCommittedCard = vi.fn(async () => {});
    const arena = { recordSrsReview: vi.fn(async () => null) };
    const ensureWritable = vi.fn(async () => {});

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      onCommittedCard,
      arena,
      srsBackend: { reviewFeedback },
      writerLeaseGuard: { ensureWritable },
    });

    const result = await useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        sessionId: 'session-1',
      },
    });

    expect(reviewFeedback).toHaveBeenCalledWith(expect.objectContaining({
      cardId: before.id,
      rating: Rating.Good,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      sessionId: 'session-1',
    }));
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(result.committed).toBe(true);
    expect(result.updatedCard).toEqual(expect.objectContaining({ id: before.id, due: after.due }));
    expect(onCommittedCard).toHaveBeenCalledWith(expect.objectContaining({ id: before.id, due: after.due }));
    expect(arena.recordSrsReview).toHaveBeenCalled();
  });

  it('uses follower relay for review.feedback in follower mode', async () => {
    const before = createCard({ id: 'card-follower-1', due: Date.now() - 1_000 });
    const after = createCard({
      id: before.id,
      due: before.due + 2 * 86_400_000,
      reps: before.reps + 1,
      lastReview: before.due,
      scheduledDays: 2,
      updatedAt: before.updatedAt + 1_000,
    });
    const reviewFeedback = vi.fn(async () => ({
      committed: true,
      updatedCard: after,
    }));
    const submitAndWait = vi.fn(async () => ({
      committed: true,
      updatedCard: after,
    }));

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      onCommittedCard: vi.fn(async () => {}),
      srsBackend: { reviewFeedback },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-1',
      } as never,
      followerCommandClient: { submitAndWait },
    });

    const result = await useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    });

    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-follower-1',
      method: 'review.feedback',
    }));
    expect(reviewFeedback).not.toHaveBeenCalled();
    expect(result.committed).toBe(true);
  });

  it('fails closed when runtime policy disables backend+writer ownership', async () => {
    const before = createCard({ id: 'card-policy-1' });
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      runtimePolicy: {
        capabilities: {
          backendWorkerAvailable: true,
          writerRelayRuntimeEnabled: false,
          writerRelayRequiredForBackendWrites: true,
          reviewFeedbackWriteEnabled: false,
          autoCardExecuteWriteEnabled: false,
          autoCardDecisionBackendEnabled: false,
          kernelTransactionIngestEnabled: false,
          privateApiReadEnabled: false,
          privateApiMutationEnabled: false,
          aiBackendSessionEnabled: false,
        },
      },
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires backend+writer ownership');
  });

  it('fails closed when follower relay client is missing', async () => {
    const before = createCard({ id: 'card-follower-2' });
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-2',
      } as never,
      followerCommandClient: null,
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback relay is unavailable in follower mode');
  });
});
