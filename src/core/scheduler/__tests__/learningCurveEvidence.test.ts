import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import { buildSchedulerStateSnapshot } from '../schedulerStateSnapshot';
import {
  buildLearningCurveEvidence,
  mapReviewLogV2ToLearningCurveHistory,
  type LearningCurveEvidenceHistoryRecord,
} from '../learningCurveEvidence';

const NOW = Date.UTC(2026, 4, 13, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: NOW + 5 * DAY_MS,
    stability: 10,
    difficulty: 5,
    reps: 12,
    lapses: 1,
    state: CardState.Review,
    lastReview: NOW - 4 * DAY_MS,
    elapsedDays: 4,
    scheduledDays: 10,
    learning_step: 0,
    priority: 30,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - 120 * DAY_MS,
    updatedAt: NOW - DAY_MS,
    schedulerType: 'fsrs-v6',
    ...overrides,
  };
}

function snapshot() {
  return buildSchedulerStateSnapshot(createCard(), { now: NOW, source: 'test' });
}

function history(
  recalls: boolean[],
  expectedRetention = 0.7,
): LearningCurveEvidenceHistoryRecord[] {
  return recalls.map((recalled, index) => ({
    reviewedAt: NOW - (recalls.length - index) * DAY_MS,
    rating: recalled ? Rating.Good : Rating.Again,
    observedRecall: recalled,
    expectedRetention,
    elapsedDays: 4,
    stability: 10,
    difficulty: 5,
    scheduledDays: 10,
    commitPolicy: 'write-schedule',
    queueMode: 'formal',
  }));
}

describe('learningCurveEvidence', () => {
  it('reports sufficient advisory evidence when recall is weaker than expected', () => {
    const evidence = buildLearningCurveEvidence(snapshot(), history([
      true,
      false,
      false,
      true,
      false,
      false,
    ], 0.82), {
      now: NOW,
      minSamples: 4,
      driftTolerance: 0.1,
    });

    expect(evidence).toMatchObject({
      status: 'ready',
      advisory: true,
      sampleSize: 6,
      usableSampleSize: 6,
      observedRecallRate: 2 / 6,
      expectedRetention: 0.82,
      driftDirection: 'weaker-than-expected',
    });
    expect(evidence.calibrationGap).toBeLessThan(-0.4);
    expect(evidence.confidence).toBeGreaterThan(0.4);
    expect(evidence.diagnostics).toContain('observed-recall-below-expected-retention');
    expect(evidence.suggestions).toEqual([
      expect.objectContaining({
        advisory: true,
        kind: 'review-sooner-advisory',
        reasons: expect.arrayContaining(['observed-recall-below-expected-retention']),
      }),
    ]);
  });

  it('returns insufficient-data without suggestions when usable samples are below the threshold', () => {
    const evidence = buildLearningCurveEvidence(snapshot(), history([true, false]), {
      now: NOW,
      minSamples: 3,
    });

    expect(evidence.status).toBe('insufficient-data');
    expect(evidence.usableSampleSize).toBe(2);
    expect(evidence.diagnostics).toContain('insufficient-samples');
    expect(evidence.suggestions).toEqual([]);
  });

  it('returns low-quality-data when records lack outcome or memory-state evidence', () => {
    const evidence = buildLearningCurveEvidence(snapshot(), [
      { reviewedAt: NOW - DAY_MS, rating: null, expectedRetention: null },
      { reviewedAt: Number.NaN, rating: Rating.Good, expectedRetention: 0.8 },
      { reviewedAt: NOW - 2 * DAY_MS, rating: Rating.Good, stability: null, elapsedDays: 2 },
    ], {
      now: NOW,
      minSamples: 2,
    });

    expect(evidence.status).toBe('low-quality-data');
    expect(evidence.usableSampleSize).toBe(0);
    expect(evidence.diagnostics).toEqual(expect.arrayContaining([
      'missing-review-timestamp',
      'missing-observed-outcome',
      'missing-expected-retention',
    ]));
    expect(evidence.suggestions).toEqual([]);
  });

  it('reports stronger-than-expected drift as advisory-only evidence', () => {
    const evidence = buildLearningCurveEvidence(snapshot(), history([
      true,
      true,
      true,
      true,
      true,
    ], 0.55), {
      now: NOW,
      minSamples: 4,
      driftTolerance: 0.1,
    });

    expect(evidence.status).toBe('ready');
    expect(evidence.driftDirection).toBe('stronger-than-expected');
    expect(evidence.suggestions).toEqual([
      expect.objectContaining({
        advisory: true,
        kind: 'review-later-advisory',
        reasons: expect.arrayContaining(['observed-recall-above-expected-retention']),
      }),
    ]);
  });

  it('reports stable drift without corrective suggestions', () => {
    const evidence = buildLearningCurveEvidence(snapshot(), history([
      true,
      true,
      true,
      false,
      false,
    ], 0.6), {
      now: NOW,
      minSamples: 4,
      driftTolerance: 0.1,
    });

    expect(evidence.status).toBe('ready');
    expect(evidence.driftDirection).toBe('stable');
    expect(evidence.suggestions).toEqual([]);
    expect(evidence.diagnostics).toContain('observed-recall-within-expected-range');
  });

  it('serializes to JSON without repository, UI, queue, or function handles', () => {
    const evidence = buildLearningCurveEvidence(snapshot(), history([
      true,
      false,
      true,
      true,
    ]), {
      now: NOW,
      minSamples: 3,
    });

    expect(JSON.parse(JSON.stringify(evidence))).toEqual(evidence);
    expect(JSON.stringify(evidence)).not.toContain('repository');
    expect(JSON.stringify(evidence)).not.toContain('queueProjection');
  });

  it('maps ReviewLogV2-like records into normalized history without persistence coupling', () => {
    const records = mapReviewLogV2ToLearningCurveHistory([
      {
        cardId: 'card-1',
        rating: Rating.Good,
        reviewedAt: NOW - DAY_MS,
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        before: {
          elapsedDays: 6,
          stability: 12,
          difficulty: 4,
          scheduledDays: 8,
        },
      },
      {
        cardId: 'card-1',
        rating: Rating.Again,
        reviewedAt: NOW - 2 * DAY_MS,
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
        before: {
          elapsedDays: 4,
          stability: 9,
          difficulty: 6,
          scheduledDays: 10,
        },
      },
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        reviewedAt: NOW - DAY_MS,
        rating: Rating.Good,
        observedRecall: true,
        expectedRetention: Math.exp(-6 / 12),
        commitPolicy: 'write-schedule',
        queueMode: 'formal',
      }),
      expect.objectContaining({
        rating: Rating.Again,
        observedRecall: false,
        expectedRetention: Math.exp(-4 / 9),
      }),
    ]);
  });

  it('keeps the core evidence module inside scheduler read-model boundaries', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/core/scheduler/learningCurveEvidence.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/@\/ui|@\/application|@\/infrastructure|ReviewLogService|review_events|queue-projection|kernel/i);
  });
});
