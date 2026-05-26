import { describe, expect, it } from 'vitest';
import { decideReviewSyncCardMerge } from '../SqliteDatabaseService';

describe('decideReviewSyncCardMerge', () => {
  const local = {
    updated_at: 1_700_000_100_000,
    last_review: 1_700_000_000_000,
    reps: 5,
  };

  it('skips incoming scheduler state older than formal review history', () => {
    expect(decideReviewSyncCardMerge(local, {
      updated_at: 1_700_000_200_000,
      last_review: 1_699_999_999_999,
      reps: 6,
    }, {
      newestReviewedAt: 1_700_000_000_000,
      formalReviewEventCount: 5,
    })).toEqual({
      action: 'skip-card',
      reason: 'incoming-review-older-than-review-history',
    });
  });

  it('skips same lastReview when incoming reps are behind local review evidence', () => {
    expect(decideReviewSyncCardMerge(local, {
      updated_at: 1_700_000_200_000,
      last_review: 1_700_000_000_000,
      reps: 1,
    }, {
      newestReviewedAt: 1_700_000_000_000,
      formalReviewEventCount: 5,
    })).toEqual({
      action: 'skip-card',
      reason: 'incoming-reps-behind-review-history',
    });
  });

  it('applies incoming scheduler state when lastReview is newer', () => {
    expect(decideReviewSyncCardMerge(local, {
      updated_at: 1_700_000_200_000,
      last_review: 1_700_000_300_000,
      reps: 6,
    }, {
      newestReviewedAt: 1_700_000_000_000,
      formalReviewEventCount: 5,
    })).toEqual({
      action: 'apply-card',
      reason: 'incoming-card-newer',
    });
  });

  it('skips incoming scheduler state when review state is same and only updatedAt is older', () => {
    expect(decideReviewSyncCardMerge(local, {
      updated_at: 1_700_000_000_000,
      last_review: 1_700_000_000_000,
      reps: 5,
    }, null)).toEqual({
      action: 'skip-card',
      reason: 'incoming-card-stale-or-same',
    });
  });

  it('applies non-scheduler metadata freshness only after review fields tie', () => {
    expect(decideReviewSyncCardMerge(local, {
      updated_at: 1_700_000_200_000,
      last_review: 1_700_000_000_000,
      reps: 5,
    }, null)).toEqual({
      action: 'apply-card',
      reason: 'incoming-card-newer',
    });
  });
});
