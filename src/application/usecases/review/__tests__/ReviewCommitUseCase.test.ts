import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBackendMigrationRuntimePolicy } from '@/application/backendMigration/runtimePolicy';
import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import { DEFAULT_SETTINGS } from '@/types/settings';

const reviewPolicyLoggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewPolicyLoggerMocks,
}));

import { ReviewCommitUseCase } from '../ReviewCommitUseCase';

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

function createReleasePolicy(overrides?: {
  backendWorker?: string;
  writerLeaseGuard?: string;
  autocardDecisionRelay?: string;
}) {
  return resolveBackendMigrationRuntimePolicy({
    VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: overrides?.backendWorker ?? 'true',
    VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: overrides?.writerLeaseGuard ?? 'true',
    VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: overrides?.autocardDecisionRelay ?? 'true',
    VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'false',
    VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'false',
    VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'false',
  });
}

describe('ReviewCommitUseCase', () => {
  beforeEach(() => {
    reviewPolicyLoggerMocks.info.mockReset();
    reviewPolicyLoggerMocks.warn.mockReset();
    reviewPolicyLoggerMocks.error.mockReset();
    reviewPolicyLoggerMocks.debug.mockReset();
  });

  it('uses backend worker write path in default release env (backend+writer writer mode)', async () => {
    const before = createCard({ id: 'card-default-env' });
    const after = createCard({ id: before.id, due: before.due + 2 * 86_400_000 });
    const reviewFeedback = vi.fn(async () => ({ committed: true, updatedCard: after }));
    const ensureWritable = vi.fn(async () => {});

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback },
      writerLeaseGuard: {
        ensureWritable,
        getMode: () => 'writer',
      } as never,
      runtimePolicy: createReleasePolicy(),
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

    expect(result.committed).toBe(true);
    expect(ensureWritable).toHaveBeenCalledTimes(1);
    expect(reviewFeedback).toHaveBeenCalledTimes(1);
  });

  it('passes current scheduler configuration to backend review feedback', async () => {
    const before = createCard({ id: 'card-custom-fsrs' });
    const after = createCard({ id: before.id, due: before.due + 4 * 86_400_000 });
    const customFsrs = {
      ...DEFAULT_SETTINGS.fsrs,
      requestRetention: 0.97,
      enableFuzz: false,
    };
    const reviewFeedback = vi.fn(async () => ({ committed: true, updatedCard: after }));

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      schedulerConfig: {
        defaultScheduler: 'fsrs-v6',
        fsrsParams: customFsrs,
      },
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'writer',
      } as never,
      runtimePolicy: createReleasePolicy(),
    });

    await useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    });

    expect(reviewFeedback).toHaveBeenCalledWith(expect.objectContaining({
      scheduler: {
        defaultScheduler: 'fsrs-v6',
        fsrsParams: customFsrs,
      },
    }));
  });

  it('passes projection snapshot identity to backend review feedback', async () => {
    const before = createCard({ id: 'card-projection-context' });
    const after = createCard({ id: before.id, due: before.due + 4 * 86_400_000 });
    const reviewFeedback = vi.fn(async () => ({ committed: true, updatedCard: after }));

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'writer',
      } as never,
      runtimePolicy: createReleasePolicy(),
    });

    await useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        projectionGeneration: 7,
        projectionPolicyHash: 'policy-a',
      },
    });

    expect(reviewFeedback).toHaveBeenCalledWith(expect.objectContaining({
      projectionGeneration: 7,
      projectionPolicyHash: 'policy-a',
    }));
  });

  it('fails closed when backend is disabled by runtime policy', async () => {
    const before = createCard({ id: 'card-backend-disabled' });
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      runtimePolicy: createReleasePolicy({ backendWorker: 'false', writerLeaseGuard: 'false' }),
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires backend+writer ownership');

    expect(reviewPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][ReviewCommitUseCase]',
      expect.objectContaining({ reason: 'backend-worker-disabled' }),
    );
  });

  it('fails closed when backend is enabled without writer relay runtime policy capability', async () => {
    const before = createCard({ id: 'card-backend-only' });
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      runtimePolicy: createReleasePolicy({ backendWorker: 'true', writerLeaseGuard: 'false' }),
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires backend+writer ownership');

    expect(reviewPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][ReviewCommitUseCase]',
      expect.objectContaining({ reason: 'writer-relay-disabled' }),
    );
  });

  it('uses follower relay in follower mode for backend+writer policy', async () => {
    const before = createCard({ id: 'card-follower-mode' });
    const after = createCard({ id: before.id, due: before.due + 3 * 86_400_000 });
    const reviewFeedback = vi.fn(async () => ({ committed: true, updatedCard: after }));
    const submitAndWait = vi.fn(async () => ({ committed: true, updatedCard: after }));

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-1',
      } as never,
      followerCommandClient: { submitAndWait },
      runtimePolicy: createReleasePolicy(),
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

    expect(result.committed).toBe(true);
    expect(submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'instance-follower-1',
      method: 'review.feedback',
    }));
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('keeps queue impact data when feedback is relayed from a follower window', async () => {
    const before = createCard({ id: 'card-follower-impact' });
    const after = createCard({ id: before.id, due: before.due + 3 * 86_400_000 });
    const queueImpact = {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [{
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 2,
        removedRowIds: ['card-follower-impact'],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: 2,
        counters: {
          generation: 2,
          version: 2,
          remaining: 0,
          due: 0,
          total: 0,
        },
      }],
    };
    const reviewFeedback = vi.fn(async () => ({ committed: true, updatedCard: after, queueImpact }));
    const submitAndWait = vi.fn(async () => ({ committed: true, updatedCard: after, queueImpact }));

    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-impact',
      } as never,
      followerCommandClient: { submitAndWait },
      runtimePolicy: createReleasePolicy(),
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

    expect((result as { queueImpact?: unknown }).queueImpact).toEqual(queueImpact);
    expect(reviewFeedback).not.toHaveBeenCalled();
  });

  it('fails closed when writer runtime injection is partial/unknown under writer-required policy', async () => {
    const before = createCard({ id: 'card-partial-di' });
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
      } as never,
      runtimePolicy: createReleasePolicy(),
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: { queueType: 'retrieval-practice' },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback requires writer relay runtime');

    expect(reviewPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][ReviewCommitUseCase]',
      expect.objectContaining({ reason: 'writer-relay-runtime-unknown' }),
    );
  });

  it('surfaces writer unavailable error and emits diagnostics', async () => {
    const before = createCard({ id: 'card-writer-unavailable' });
    const writerError = new Error('BACKEND_UNAVAILABLE: writer lease not owned by current instance');
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {
          throw writerError;
        }),
        getMode: () => 'writer',
      } as never,
      runtimePolicy: createReleasePolicy(),
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: writer lease not owned by current instance');

    expect(reviewPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][ReviewCommitUseCase]',
      expect.objectContaining({ reason: 'writer-unavailable' }),
    );
  });

  it('emits follower relay timeout diagnostics when follower relay call times out', async () => {
    const before = createCard({ id: 'card-follower-timeout' });
    const relayTimeout = new Error('BACKEND_UNAVAILABLE: writer relay timeout');
    const useCase = new ReviewCommitUseCase({
      cards: { getCard: vi.fn(async () => before) },
      scheduler: { answer: vi.fn(), commit: vi.fn() } as never,
      reviewLogs: { addReviewLogV2: vi.fn(async () => {}) },
      srsBackend: { reviewFeedback: vi.fn(async () => ({ committed: true, updatedCard: before })) },
      writerLeaseGuard: {
        ensureWritable: vi.fn(async () => {}),
        getMode: () => 'follower',
        getInstanceId: () => 'instance-follower-timeout',
      } as never,
      followerCommandClient: {
        submitAndWait: vi.fn(async () => {
          throw relayTimeout;
        }),
      },
      runtimePolicy: createReleasePolicy(),
    });

    await expect(useCase.execute({
      cardId: before.id,
      rating: Rating.Good,
      context: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: writer relay timeout');

    expect(reviewPolicyLoggerMocks.info).toHaveBeenCalledWith(
      '[BackendMigrationPolicy][ReviewCommitUseCase]',
      expect.objectContaining({ reason: 'follower-relay-timeout' }),
    );
  });

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
});
