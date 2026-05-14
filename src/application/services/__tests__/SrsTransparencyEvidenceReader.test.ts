import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, Rating } from '@/types/card';
import type { ReviewLogV2 } from '@/types/review';
import { ReviewLogLearningCurveEvidenceReader } from '@/application/services/SrsTransparencyEvidenceReader';

function createLog(overrides: Partial<ReviewLogV2> = {}): ReviewLogV2 {
  const reviewedAt = overrides.reviewedAt ?? 1_700_000_000_000;
  return {
    schemaVersion: 2,
    id: overrides.id ?? `log-${reviewedAt}`,
    attemptId: overrides.attemptId ?? `attempt-${reviewedAt}`,
    cardId: overrides.cardId ?? 'card-1',
    rating: overrides.rating ?? Rating.Good,
    reviewedAt,
    elapsedMs: overrides.elapsedMs,
    queueType: overrides.queueType ?? 'retrieval-practice',
    queueMode: overrides.queueMode ?? 'formal',
    source: overrides.source ?? 'review',
    algorithm: overrides.algorithm ?? 'fsrs-v6',
    schedulerType: overrides.schedulerType ?? 'fsrs-v6',
    commitPolicy: overrides.commitPolicy ?? 'write-schedule',
    before: overrides.before ?? {
      id: overrides.cardId ?? 'card-1',
      due: reviewedAt,
      stability: 10,
      difficulty: 6,
      reps: 3,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 7,
      priority: 50,
      type: CardType.Item,
      schedulerType: 'fsrs-v6',
    },
    after: overrides.after ?? null,
    isDrill: overrides.isDrill ?? false,
    isFiltered: overrides.isFiltered ?? false,
    customStudy: overrides.customStudy ?? false,
  };
}

describe('ReviewLogLearningCurveEvidenceReader', () => {
  it('reads bounded recent ReviewLogV2 months and filters by card identity', async () => {
    const calls: Array<[number, number]> = [];
    const reviewLogService = {
      getReviewLogsV2: vi.fn(async (year: number, month: number) => {
        calls.push([year, month]);
        if (month === 11) {
          return [
            createLog({ cardId: 'other-card', reviewedAt: Date.UTC(2023, 10, 20) }),
            createLog({ cardId: 'card-1', reviewedAt: Date.UTC(2023, 10, 19) }),
          ];
        }
        if (month === 10) {
          return [
            createLog({ cardId: 'card-1', reviewedAt: Date.UTC(2023, 9, 10) }),
            createLog({ cardId: 'card-1', reviewedAt: Date.UTC(2023, 9, 5) }),
          ];
        }
        return [];
      }),
    };
    const reader = new ReviewLogLearningCurveEvidenceReader(reviewLogService, {
      monthWindow: 2,
      maxRecords: 2,
    });

    const logs = await reader.readRecentReviewLogs({
      cardId: 'card-1',
      now: Date.UTC(2023, 10, 25),
    });

    expect(calls).toEqual([[2023, 11], [2023, 10]]);
    expect(logs.map((log) => log.cardId)).toEqual(['card-1', 'card-1']);
    expect(logs.map((log) => log.reviewedAt)).toEqual([
      Date.UTC(2023, 10, 19),
      Date.UTC(2023, 9, 10),
    ]);
  });

  it('returns an empty bounded result when card identity is missing', async () => {
    const reviewLogService = {
      getReviewLogsV2: vi.fn(async () => [createLog()]),
    };
    const reader = new ReviewLogLearningCurveEvidenceReader(reviewLogService);

    await expect(reader.readRecentReviewLogs({ cardId: '', now: Date.UTC(2023, 10, 25) })).resolves.toEqual([]);
    expect(reviewLogService.getReviewLogsV2).not.toHaveBeenCalled();
  });
});
