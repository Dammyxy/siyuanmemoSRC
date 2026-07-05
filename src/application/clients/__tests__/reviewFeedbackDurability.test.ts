import { describe, expect, it } from 'vitest';
import {
  assertCommittedReviewFeedbackDurability,
  classifyReviewFeedbackOutcome,
} from '../reviewFeedbackDurability';

function createCommittedResult(overrides: Record<string, unknown> = {}) {
  return {
    committed: true,
    queueImpact: {
      hotPatchable: false,
      refreshRequired: true,
      affectedQueues: ['incremental-learning'],
    },
    storage: {
      localIntent: {
        status: 'recorded',
        durable: true,
        storage: 'non-siyuan',
        entryId: 'review-feedback:key-1',
        idempotencyKey: 'key-1',
        journalStatus: 'prepared',
        pendingCount: 1,
        pendingBytes: 256,
        error: null,
      },
      truthFlush: {
        status: 'pending',
        family: 'review-events',
        syncVisible: false,
        pendingCount: 1,
        oldestPendingAgeMs: 0,
        lastError: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect truth.writeBinary',
      },
      sqlProjection: {
        status: 'deferred',
        hotPatchable: false,
        refreshRequired: true,
        affectedQueueCount: 1,
        projectionGeneration: null,
      },
      sqlCheckpoint: {
        status: 'not-run',
        hotPath: false,
        cause: null,
        initiator: null,
        projectionGeneration: null,
        byteLength: null,
        error: null,
      },
    },
    ...overrides,
  };
}

describe('assertCommittedReviewFeedbackDurability', () => {
  it('accepts committed rating when minimum durable intent is recorded and secondary work is pending', () => {
    expect(() => assertCommittedReviewFeedbackDurability(createCommittedResult(), {
      source: 'test',
      requireQueueImpact: true,
    })).not.toThrow();
  });

  it('rejects committed rating when local durable intent is unavailable', () => {
    const result = createCommittedResult({
      storage: {
        ...createCommittedResult().storage,
        localIntent: {
          status: 'unavailable',
          durable: false,
          storage: 'unavailable',
          entryId: null,
          idempotencyKey: 'key-1',
          journalStatus: 'unavailable',
          pendingCount: null,
          pendingBytes: null,
          error: 'BACKEND_UNAVAILABLE: backend worker host effect sqlite.writeJSON timed out after 5000ms',
        },
      },
    });

    expect(() => assertCommittedReviewFeedbackDurability(result, {
      source: 'test',
      requireQueueImpact: true,
    })).toThrow('minimum durable local intent is not recorded');
  });

  it('rejects committed rating when SQL checkpoint reports durability failure', () => {
    const result = createCommittedResult({
      storage: {
        ...createCommittedResult().storage,
        sqlCheckpoint: {
          status: 'failed',
          hotPath: true,
          cause: 'review.feedback',
          initiator: 'review.feedback',
          projectionGeneration: null,
          byteLength: null,
          error: 'SQLITE_DELTA_REPAIR_REQUIRED',
        },
      },
    });

    expect(() => assertCommittedReviewFeedbackDurability(result, {
      source: 'test',
      requireQueueImpact: true,
    })).toThrow('SQL delta/checkpoint durability failed');
  });

  it('classifies committed, duplicate, retryable, unavailable, and repair-required outcomes', () => {
    expect(classifyReviewFeedbackOutcome(createCommittedResult())).toMatchObject({
      outcome: 'committed',
      committed: true,
      retryable: false,
    });
    expect(classifyReviewFeedbackOutcome(createCommittedResult({ duplicate: true }))).toMatchObject({
      outcome: 'duplicate-committed',
      committed: true,
      retryable: false,
    });
    expect(classifyReviewFeedbackOutcome({
      ...createCommittedResult(),
      committed: false,
    })).toMatchObject({
      outcome: 'retryable-pending',
      committed: false,
      retryable: true,
    });
    expect(classifyReviewFeedbackOutcome(createCommittedResult({
      storage: {
        ...createCommittedResult().storage,
        localIntent: { status: 'unavailable', durable: false },
      },
    }))).toMatchObject({
      outcome: 'unavailable',
      committed: false,
      retryable: true,
    });
    expect(classifyReviewFeedbackOutcome(createCommittedResult({
      storage: {
        ...createCommittedResult().storage,
        sqlCheckpoint: {
          status: 'failed',
          error: 'SQLITE_DELTA_REPAIR_REQUIRED',
        },
      },
    }))).toMatchObject({
      outcome: 'repair-required',
      committed: false,
      retryable: false,
    });
  });
});
