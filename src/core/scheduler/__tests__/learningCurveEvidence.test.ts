import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CardState, CardType, Rating, type FSRSCard } from '@/types/card';
import { buildSchedulerStateSnapshot } from '../schedulerStateSnapshot';
import {
  buildLearningCurveEvidence,
  mapReviewEventFactsToLearningCurveHistory,
  mapReviewLogV2ToLearningCurveHistory,
  type LearningCurveEvidenceHistoryRecord,
} from '../learningCurveEvidence';
import type { ReviewEventFact, ReviewEventSchedulerStateFact } from '../reviewEventFact';

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

function schedulerState(overrides: Partial<ReviewEventSchedulerStateFact> = {}): ReviewEventSchedulerStateFact {
  return {
    cardId: 'card-1',
    due: NOW + DAY_MS,
    stability: 10,
    difficulty: 5,
    reps: 12,
    lapses: 1,
    state: CardState.Review,
    lastReview: NOW - DAY_MS,
    elapsedDays: 4,
    scheduledDays: 10,
    learningStep: 0,
    priority: 30,
    cardType: CardType.Item,
    schedulerType: 'fsrs-v6',
    aFactor: null,
    ...overrides,
  };
}

function reviewFact(overrides: Partial<ReviewEventFact> = {}): ReviewEventFact {
  const before = schedulerState();
  return {
    schemaVersion: 1,
    eventId: 'event-1',
    cardId: 'card-1',
    attemptId: 'attempt-1',
    rating: Rating.Good,
    reviewedAt: NOW - DAY_MS,
    commitIdempotencyKey: 'commit-1',
    schedulerType: 'fsrs-v6',
    algorithm: 'memory-fsrs',
    queueType: 'review',
    queueMode: 'formal',
    commitPolicy: 'write-schedule',
    source: 'review',
    classification: {
      kind: 'formal',
      formal: true,
      exclusionReasons: [],
    },
    before,
    after: schedulerState({ reps: 13 }),
    elapsedMs: 1000,
    dataQuality: {
      status: 'complete',
      reasons: [],
    },
    ...overrides,
  };
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
      exclusions: {
        nonFormal: 0,
        lowQuality: 0,
        missingSchedulerIdentity: 0,
        missingMemoryState: 0,
      },
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

  it('maps formal review facts and excludes non-formal or incomplete facts with diagnostics', () => {
    const mapped = mapReviewEventFactsToLearningCurveHistory([
      reviewFact({
        eventId: 'formal-1',
        rating: Rating.Good,
        before: schedulerState({ elapsedDays: 6, stability: 12 }),
      }),
      reviewFact({
        eventId: 'preview-1',
        classification: {
          kind: 'non-formal',
          formal: false,
          exclusionReasons: ['preview-only'],
        },
        commitPolicy: 'preview-only',
        queueMode: 'filtered-preview',
      }),
      reviewFact({
        eventId: 'drill-1',
        classification: {
          kind: 'non-formal',
          formal: false,
          exclusionReasons: ['drill-only'],
        },
        commitPolicy: 'drill-only',
      }),
      reviewFact({
        eventId: 'custom-1',
        classification: {
          kind: 'non-formal',
          formal: false,
          exclusionReasons: ['custom-study'],
        },
        queueMode: 'custom-study',
      }),
      reviewFact({
        eventId: 'processing-1',
        classification: {
          kind: 'non-formal',
          formal: false,
          exclusionReasons: ['non-formal-queue-mode'],
        },
        queueMode: 'processing-scheduler',
      }),
      reviewFact({
        eventId: 'missing-scheduler-identity',
        schedulerType: null,
        before: schedulerState({ schedulerType: null }),
      }),
      reviewFact({
        eventId: 'missing-memory-state',
        before: schedulerState({ elapsedDays: null }),
      }),
      reviewFact({
        eventId: 'low-quality',
        dataQuality: {
          status: 'low-quality',
          reasons: ['missing-before-state'],
        },
      }),
    ]);

    expect(mapped.history).toEqual([
      expect.objectContaining({
        rating: Rating.Good,
        observedRecall: true,
        expectedRetention: Math.exp(-6 / 12),
        commitPolicy: 'write-schedule',
        queueMode: 'formal',
      }),
    ]);
    expect(mapped.exclusions).toEqual({
      nonFormal: 4,
      lowQuality: 1,
      missingSchedulerIdentity: 1,
      missingMemoryState: 1,
    });

    const evidence = buildLearningCurveEvidence(snapshot(), mapped.history, {
      now: NOW,
      minSamples: 1,
      exclusions: mapped.exclusions,
    });

    expect(evidence.diagnostics).toEqual(expect.arrayContaining([
      'excluded-non-formal:4',
      'excluded-low-quality:1',
      'excluded-missing-scheduler-identity:1',
      'excluded-missing-memory-state:1',
    ]));
    expect(JSON.parse(JSON.stringify(evidence))).toEqual(evidence);
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
