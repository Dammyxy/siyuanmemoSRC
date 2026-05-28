import { describe, expect, it } from 'vitest';
import {
  beginBackendWorkerRequest,
  endBackendWorkerRequest,
  recordReviewFeedbackInnerStep,
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
});
