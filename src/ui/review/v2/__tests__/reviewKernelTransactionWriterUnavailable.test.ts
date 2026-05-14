import { describe, expect, it } from 'vitest';
import type { ReviewSessionRetryAction } from '../useReviewSession';
import {
  createReviewKernelTransactionWriterActionTracker,
  resolveReviewActionForKernelTransactionWriterUnavailable,
} from '../reviewKernelTransactionWriterUnavailable';

describe('review kernel transaction writer unavailable recovery', () => {
  const skipAction: ReviewSessionRetryAction = { type: 'skip' };

  it('returns recent review action for dequeue writer relay timeout', () => {
    const tracker = createReviewKernelTransactionWriterActionTracker('review-session-1', 10_000);
    tracker.record(skipAction, 1_000);

    const action = resolveReviewActionForKernelTransactionWriterUnavailable({
      detail: {
        method: 'kernel.transaction.dequeue',
        message: 'BACKEND_UNAVAILABLE: writer relay timeout',
        occurredAt: 2_000,
      },
      currentSessionId: 'review-session-1',
      recentAction: tracker.getRecentAction(),
      now: 2_000,
    });

    expect(action).toEqual(skipAction);
  });

  it('ignores background dequeue timeout without recent review action', () => {
    const action = resolveReviewActionForKernelTransactionWriterUnavailable({
      detail: {
        method: 'kernel.transaction.dequeue',
        message: 'BACKEND_UNAVAILABLE: writer relay timeout',
        occurredAt: 2_000,
      },
      currentSessionId: 'review-session-1',
      recentAction: null,
      now: 2_000,
    });

    expect(action).toBeNull();
  });

  it('ignores stale review action', () => {
    const tracker = createReviewKernelTransactionWriterActionTracker('review-session-1', 10_000);
    tracker.record(skipAction, 1_000);

    const action = resolveReviewActionForKernelTransactionWriterUnavailable({
      detail: {
        method: 'kernel.transaction.dequeue',
        message: 'BACKEND_UNAVAILABLE: writer relay timeout',
        occurredAt: 20_000,
      },
      currentSessionId: 'review-session-1',
      recentAction: tracker.getRecentAction(),
      now: 20_000,
    });

    expect(action).toBeNull();
  });

  it('ignores non-dequeue relay failures', () => {
    const tracker = createReviewKernelTransactionWriterActionTracker('review-session-1', 10_000);
    tracker.record(skipAction, 1_000);

    const action = resolveReviewActionForKernelTransactionWriterUnavailable({
      detail: {
        method: 'autocard.execute',
        message: 'BACKEND_UNAVAILABLE: writer relay timeout',
        occurredAt: 2_000,
      },
      currentSessionId: 'review-session-1',
      recentAction: tracker.getRecentAction(),
      now: 2_000,
    });

    expect(action).toBeNull();
  });
});
