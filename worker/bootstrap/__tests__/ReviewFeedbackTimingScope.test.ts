import { describe, expect, it } from 'vitest';
import {
  beginBackendWorkerTiming,
  beginBackendWorkerRequest,
  classifyBackendWorkerHostEffectStorage,
  endBackendWorkerRequest,
  hasActiveBackendWorkerTiming,
  recordBackendWorkerHostEffect,
  recordBackendWorkerInnerStep,
  recordReviewFeedbackInnerStep,
  resolveExclusiveActiveBackendWorkerTiming,
  shouldSuppressReviewFeedbackPersistenceHostEffect,
} from '../ReviewFeedbackTimingScope';

describe('ReviewFeedbackTimingScope', () => {
  it('keeps inner steps for the only active review feedback while another worker request is active', () => {
    const reviewTiming = beginBackendWorkerRequest(true, 'card-1');
    const otherTiming = beginBackendWorkerRequest(false);

    try {
      recordReviewFeedbackInnerStep({
        layer: 'database',
        step: 'merge.total',
        durationMs: 321,
        cardId: 'card-1',
      });

      expect(reviewTiming?.innerSteps).toEqual([
        expect.objectContaining({
          layer: 'database',
          step: 'merge.total',
          durationMs: 321,
          cardId: 'card-1',
        }),
      ]);
      expect(reviewTiming?.innerStepAttribution).toBe('ambiguous-concurrency');
    } finally {
      endBackendWorkerRequest(otherTiming);
      endBackendWorkerRequest(reviewTiming);
    }
  });

  it('drops mismatched inner steps while another worker request is active', () => {
    const reviewTiming = beginBackendWorkerRequest(true, 'card-1');
    const otherTiming = beginBackendWorkerRequest(false);

    try {
      recordReviewFeedbackInnerStep({
        layer: 'database',
        step: 'merge.total',
        durationMs: 321,
        cardId: 'card-2',
      });

      expect(reviewTiming?.innerSteps).toEqual([]);
      expect(reviewTiming?.innerStepAttribution).toBe('ambiguous-concurrency');
    } finally {
      endBackendWorkerRequest(otherTiming);
      endBackendWorkerRequest(reviewTiming);
    }
  });

  it('keeps diagnostic inner steps with matching method while diagnostic requests overlap', () => {
    const browserTiming = beginBackendWorkerTiming('browser.deck.page');
    const queueTiming = beginBackendWorkerTiming('queue.projection.snapshot', null, {
      queueType: 'retrieval',
    });

    try {
      recordBackendWorkerInnerStep({
        layer: 'database',
        step: 'queryDeckPage.total',
        durationMs: 123,
        extra: {
          backendMethod: 'browser.deck.page',
        },
      });
      recordBackendWorkerInnerStep({
        layer: 'database',
        step: 'queueProjection.snapshot.total',
        durationMs: 456,
        queueType: 'retrieval',
        extra: {
          backendMethod: 'queue.projection.snapshot',
          queueType: 'retrieval',
        },
      });

      expect(browserTiming.innerSteps).toEqual([
        expect.objectContaining({
          step: 'queryDeckPage.total',
          durationMs: 123,
        }),
      ]);
      expect(queueTiming.innerSteps).toEqual([
        expect.objectContaining({
          step: 'queueProjection.snapshot.total',
          durationMs: 456,
        }),
      ]);
      expect(browserTiming.innerStepAttribution).toBe('ambiguous-concurrency');
      expect(queueTiming.innerStepAttribution).toBe('ambiguous-concurrency');
    } finally {
      endBackendWorkerRequest(queueTiming);
      endBackendWorkerRequest(browserTiming);
    }
  });

  it('keeps review session feedback inner steps by backend method under overlapping requests', () => {
    const sessionTiming = beginBackendWorkerTiming('review.session.feedback', 'card-1', {
      queueType: 'retrieval-practice',
    });
    const browserTiming = beginBackendWorkerTiming('browser.deck.page');

    try {
      recordBackendWorkerInnerStep({
        layer: 'session',
        step: 'session-feedback-commit',
        durationMs: 222,
        cardId: 'card-1',
        queueType: 'retrieval-practice',
        extra: {
          backendMethod: 'review.session.feedback',
          queueType: 'retrieval-practice',
        },
      });

      expect(sessionTiming.innerSteps).toEqual([
        expect.objectContaining({
          layer: 'session',
          step: 'session-feedback-commit',
          durationMs: 222,
          cardId: 'card-1',
        }),
      ]);
      expect(browserTiming.innerSteps).toEqual([]);
      expect(sessionTiming.innerStepAttribution).toBe('ambiguous-concurrency');
    } finally {
      endBackendWorkerRequest(browserTiming);
      endBackendWorkerRequest(sessionTiming);
    }
  });

  it('keeps slowest host effect path and byte length metadata', () => {
    const timing = beginBackendWorkerTiming('queue.projection.replace');

    try {
      recordBackendWorkerHostEffect(timing, 'sqlite.writeBinary', 250, {
        path: 'siyuanmemo.db',
        byteLength: 106_233_856,
      });

      expect(timing.slowestHostEffect).toEqual({
        kind: 'sqlite.writeBinary',
        durationMs: 250,
        path: 'siyuanmemo.db',
        byteLength: 106_233_856,
        storageClass: 'sql-projection-db',
        purpose: null,
        substep: null,
      });
    } finally {
      endBackendWorkerRequest(timing);
    }
  });

  it('groups host effects by kind, path, and storage class for review timing summaries', () => {
    const timing = beginBackendWorkerTiming('review.session.feedback', 'card-1');

    try {
      recordBackendWorkerHostEffect(timing, 'sqlite.writeBinary', 140, {
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack',
        byteLength: 42_000,
      });
      recordBackendWorkerHostEffect(timing, 'sqlite.writeJSON', 80, {
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
      });
      recordBackendWorkerHostEffect(timing, 'sqlite.writeJSON', 45, {
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
      });

      expect(timing.hostEffectBreakdown).toEqual([
        {
          kind: 'sqlite.writeBinary',
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack',
          storageClass: 'sqlite-delta-log',
          count: 1,
          totalMs: 140,
          maxMs: 140,
          byteLength: 42_000,
          purpose: null,
          substep: null,
        },
        {
          kind: 'sqlite.writeJSON',
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
          storageClass: 'sqlite-delta-log',
          count: 2,
          totalMs: 125,
          maxMs: 80,
          byteLength: null,
          purpose: null,
          substep: null,
        },
      ]);
    } finally {
      endBackendWorkerRequest(timing);
    }
  });

  it('classifies storage write host effects by active truth/projection role', () => {
    expect(classifyBackendWorkerHostEffectStorage('sqlite.writeBinary', 'siyuanmemo.db'))
      .toBe('sql-projection-db');
    expect(classifyBackendWorkerHostEffectStorage('sqlite.writeJSON', 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json'))
      .toBe('sqlite-delta-log');
    expect(classifyBackendWorkerHostEffectStorage('sqlite.writeBinary', 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack'))
      .toBe('sqlite-delta-log');
    expect(classifyBackendWorkerHostEffectStorage('sqlite.writeBinary', 'sqlite-delta-log.v2.open.msgpack'))
      .toBe('sqlite-delta-log');
    expect(classifyBackendWorkerHostEffectStorage(
      'truth.writeBinary',
      'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
    )).toBe('messagepack-truth-segment');
    expect(classifyBackendWorkerHostEffectStorage(
      'truth.writeJSON',
      'truth/review-events/review-events-v1/device-device-A/manifest.v1.json',
    )).toBe('messagepack-truth-manifest');
  });

  it('reports active review feedback timing under overlapping worker requests', () => {
    const reviewTiming = beginBackendWorkerRequest(true, 'card-1');
    const otherTiming = beginBackendWorkerRequest(false);

    try {
      expect(hasActiveBackendWorkerTiming('review.feedback')).toBe(true);
      expect(resolveExclusiveActiveBackendWorkerTiming()).toBeNull();
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeJSON', reviewTiming)).toBe(false);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeBinary', reviewTiming)).toBe(false);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('truth.writeJSON', reviewTiming)).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('truth.writeBinary', reviewTiming)).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('truth.writeBinary', null)).toBe(false);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.readJSON', reviewTiming)).toBe(false);
    } finally {
      endBackendWorkerRequest(otherTiming);
      endBackendWorkerRequest(reviewTiming);
    }

    expect(hasActiveBackendWorkerTiming('review.feedback')).toBe(false);
    expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeJSON', null)).toBe(false);
  });

  it('suppresses truth persistence host effects for review session feedback timing', () => {
    const sessionTiming = beginBackendWorkerTiming('review.session.feedback', 'card-1');

    try {
      expect(hasActiveBackendWorkerTiming('review.session.feedback')).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeJSON', sessionTiming)).toBe(false);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('truth.writeJSON', sessionTiming)).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('truth.writeBinary', sessionTiming)).toBe(true);
    } finally {
      endBackendWorkerRequest(sessionTiming);
    }

    expect(hasActiveBackendWorkerTiming('review.session.feedback')).toBe(false);
  });

  it('keeps sqlite delta purpose and substep attribution in host effect summaries', () => {
    const timing = beginBackendWorkerTiming('review.session.feedback', 'card-1');

    try {
      recordBackendWorkerHostEffect(timing, 'sqlite.readBinary', 90, {
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
        byteLength: 64_000,
        purpose: 'sqlite-delta.append-preflight',
        substep: 'persist-committed-transaction-read-snapshot',
      });
      recordBackendWorkerHostEffect(timing, 'sqlite.readBinary', 40, {
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
        byteLength: 64_000,
        purpose: 'sqlite-delta.checkpoint-recovery',
        substep: 'volatile-checkpoint-covered-segment-replay',
      });
      recordBackendWorkerHostEffect(timing, 'sqlite.readBinary', 25, {
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
        byteLength: 64_000,
        purpose: 'sqlite-delta.append-preflight',
        substep: 'persist-committed-transaction-read-snapshot',
      });

      expect(timing.slowestHostEffect).toEqual({
        kind: 'sqlite.readBinary',
        durationMs: 90,
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
        byteLength: 64_000,
        storageClass: 'sqlite-delta-log',
        purpose: 'sqlite-delta.append-preflight',
        substep: 'persist-committed-transaction-read-snapshot',
      });
      expect(timing.hostEffectBreakdown).toEqual([
        {
          kind: 'sqlite.readBinary',
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
          storageClass: 'sqlite-delta-log',
          purpose: 'sqlite-delta.append-preflight',
          substep: 'persist-committed-transaction-read-snapshot',
          count: 2,
          totalMs: 115,
          maxMs: 90,
          byteLength: 64_000,
        },
        {
          kind: 'sqlite.readBinary',
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
          storageClass: 'sqlite-delta-log',
          purpose: 'sqlite-delta.checkpoint-recovery',
          substep: 'volatile-checkpoint-covered-segment-replay',
          count: 1,
          totalMs: 40,
          maxMs: 40,
          byteLength: 64_000,
        },
      ]);
    } finally {
      endBackendWorkerRequest(timing);
    }
  });
});
