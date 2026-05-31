import { describe, expect, it } from 'vitest';
import {
  beginBackendWorkerTiming,
  beginBackendWorkerRequest,
  endBackendWorkerRequest,
  hasActiveBackendWorkerTiming,
  recordBackendWorkerHostEffect,
  recordBackendWorkerInnerStep,
  recordReviewFeedbackInnerStep,
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
      });
    } finally {
      endBackendWorkerRequest(timing);
    }
  });

  it('reports active review feedback timing under overlapping worker requests', () => {
    const reviewTiming = beginBackendWorkerRequest(true, 'card-1');
    const otherTiming = beginBackendWorkerRequest(false);

    try {
      expect(hasActiveBackendWorkerTiming('review.feedback')).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeJSON')).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeBinary')).toBe(true);
      expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.readJSON')).toBe(false);
    } finally {
      endBackendWorkerRequest(otherTiming);
      endBackendWorkerRequest(reviewTiming);
    }

    expect(hasActiveBackendWorkerTiming('review.feedback')).toBe(false);
    expect(shouldSuppressReviewFeedbackPersistenceHostEffect('sqlite.writeJSON')).toBe(false);
  });
});
