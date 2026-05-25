import { describe, expect, it } from 'vitest';

import { CardState, CardType, Rating } from '@/types/card';
import type { ReviewLogV2 } from '@/types/review';
import { mapReviewLogV2ToReviewEventFact } from '../reviewEventFact';

const NOW = Date.UTC(2026, 4, 26, 8, 0, 0);

function createLog(overrides: Partial<ReviewLogV2> = {}): ReviewLogV2 {
  return {
    schemaVersion: 2,
    id: 'event-1',
    attemptId: 'attempt-1',
    cardId: 'card-1',
    rating: Rating.Good,
    reviewedAt: NOW,
    commitIdempotencyKey: 'review-commit:key-1',
    elapsedMs: 1234,
    queueType: 'retrieval-practice',
    queueMode: 'formal',
    source: 'queue',
    algorithm: 'fsrs-v6',
    schedulerType: 'fsrs-v6',
    commitPolicy: 'write-schedule',
    before: {
      id: 'card-1',
      due: NOW - 86_400_000,
      stability: 6,
      difficulty: 5,
      reps: 3,
      lapses: 1,
      state: CardState.Review,
      lastReview: NOW - 3 * 86_400_000,
      elapsedDays: 3,
      scheduledDays: 6,
      learning_step: 0,
      priority: 10,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
    },
    after: {
      id: 'card-1',
      due: NOW + 8 * 86_400_000,
      stability: 8,
      difficulty: 4.8,
      reps: 4,
      lapses: 1,
      state: CardState.Review,
      lastReview: NOW,
      elapsedDays: 0,
      scheduledDays: 8,
      learning_step: 0,
      priority: 10,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
    },
    isDrill: false,
    isFiltered: false,
    customStudy: false,
    ...overrides,
  };
}

describe('reviewEventFact', () => {
  it('maps a write-schedule ReviewLogV2 into a formal append-only fact', () => {
    const fact = mapReviewLogV2ToReviewEventFact(createLog());

    expect(fact).toMatchObject({
      eventId: 'event-1',
      cardId: 'card-1',
      attemptId: 'attempt-1',
      rating: Rating.Good,
      reviewedAt: NOW,
      commitIdempotencyKey: 'review-commit:key-1',
      schedulerType: 'fsrs-v6',
      algorithm: 'fsrs-v6',
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      source: 'queue',
      classification: {
        kind: 'formal',
        formal: true,
        exclusionReasons: [],
      },
      before: expect.objectContaining({
        due: NOW - 86_400_000,
        stability: 6,
        difficulty: 5,
        reps: 3,
      }),
      after: expect.objectContaining({
        due: NOW + 8 * 86_400_000,
        stability: 8,
        difficulty: 4.8,
        reps: 4,
      }),
      dataQuality: {
        status: 'complete',
        reasons: [],
      },
    });
  });

  it('marks preview, drill, and custom-study records non-formal with exclusion reasons', () => {
    const fact = mapReviewLogV2ToReviewEventFact(createLog({
      queueMode: 'filtered-preview',
      commitPolicy: 'preview-only',
      isDrill: true,
      customStudy: true,
    }));

    expect(fact.classification).toEqual({
      kind: 'non-formal',
      formal: false,
      exclusionReasons: expect.arrayContaining([
        'preview-only',
        'drill',
        'custom-study',
        'non-formal-queue-mode',
      ]),
    });
  });

  it('does not fabricate missing after-state evidence', () => {
    const fact = mapReviewLogV2ToReviewEventFact(createLog({
      after: null,
    }));

    expect(fact.after).toBeNull();
    expect(fact.dataQuality).toEqual({
      status: 'partial',
      reasons: ['missing-after-state'],
    });
  });
});
