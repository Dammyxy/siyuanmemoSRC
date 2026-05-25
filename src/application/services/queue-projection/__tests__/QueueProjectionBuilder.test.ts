import { describe, expect, it } from 'vitest';
import { SrsV2QueuePolicy } from '@/core/queue/domain/SrsV2QueuePolicy';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import {
  buildQueueProjectionAffectedSet,
  buildQueueProjectionRows,
  buildQueueProjectionSourceCardFingerprint,
  isBroadQueueProjectionInvalidationReason,
  planPrioritySourceQueueProjectionInvalidation,
  planQueueProjectionInvalidation,
} from '../QueueProjectionBuilder';

const NOW = new Date('2026-04-27T08:00:00+08:00').getTime();
const DAY_MS = 86_400_000;
const DAY_END = NOW + DAY_MS;

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: `xiuyuan-${id}`,
    blockId: `block-${id}`,
    due: NOW,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - DAY_MS,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - DAY_MS,
    updatedAt: NOW,
    meta: {
      content: `content-${id}`,
      rootId: 'doc-a',
      deckId: 'deck-a',
    },
    ...overrides,
  };
}

function baseBuildInput(
  queueType: QueueType.RetrievalPractice | QueueType.IncrementalLearning,
  baseCards: FSRSCard[],
  manualCards: FSRSCard[] = [],
) {
  return {
    queueType,
    baseCards,
    manualCards,
    now: NOW,
    dayEnd: DAY_END,
    newCardsPerDay: 1,
    reviewsPerDay: 1,
    priorityRandomness: 0,
    stableSalt: 'projection-test',
    policyHash: 'policy-a',
    sourceGeneration: 7,
    updatedAt: NOW + 1_000,
    frontierCandidateCount: 2,
  };
}

describe('QueueProjectionBuilder', () => {
  it('builds RetrievalPractice projection rows matching existing SRS v2 queue order', () => {
    const learning = card('learning', {
      state: CardState.Learning,
      due: NOW - 60_000,
      priority: 90,
    });
    const reviewEarly = card('review-early', {
      state: CardState.Review,
      due: NOW,
      priority: 80,
    });
    const reviewLaterFrontier = card('review-later-frontier', {
      state: CardState.Review,
      due: NOW + 2 * 60_000,
      priority: 1,
    });
    const newVisible = card('new-visible', {
      state: CardState.New,
      reps: 0,
      due: NOW,
      priority: 5,
    });
    const newFrontier = card('new-frontier', {
      state: CardState.New,
      reps: 0,
      due: NOW + 1_000,
      priority: 10,
    });
    const manualFuture = card('manual-future', {
      due: NOW + 10 * DAY_MS,
      priority: 1,
    });
    const input = baseBuildInput(
      QueueType.RetrievalPractice,
      [newFrontier, reviewLaterFrontier, learning, newVisible, reviewEarly],
      [manualFuture],
    );

    const existingOrder = SrsV2QueuePolicy.buildRetrievalPracticeQueue({
      ...input,
      isBlacklisted: () => false,
      isDismissed: () => false,
    }).map((entry) => entry.id);
    const projection = buildQueueProjectionRows(input);

    expect(projection.rows.map((entry) => entry.cardId)).toEqual(existingOrder);
    expect(projection.rows.map((entry) => entry.sortKey)).toEqual([...projection.rows.map((entry) => entry.sortKey)].sort());
    expect(projection.rows.map((entry) => entry.queueIndexHint)).toEqual([1, 2, 3]);
    expect(projection.rows.find((entry) => entry.cardId === 'manual-future')).toMatchObject({
      membershipReason: 'manual-outstanding',
      dueBucket: 'manual',
    });
    expect(projection.rows[0].payload.sourceCardFingerprint).toMatchObject({
      version: 1,
      cardId: projection.rows[0].cardId,
      fingerprint: expect.any(String),
    });
    expect(JSON.parse(JSON.stringify(projection.rows[0].payload.sourceCardFingerprint)))
      .toEqual(projection.rows[0].payload.sourceCardFingerprint);
    expect(projection.frontierRows.map((entry) => entry.cardId)).toEqual([
      'review-later-frontier',
    ]);
    expect(projection.frontierRows.every((entry) => entry.membershipReason === 'frontier-candidate')).toBe(true);
    expect(projection.counters).toMatchObject({
      queueType: QueueType.RetrievalPractice,
      generation: 7,
      remaining: 3,
      due: 3,
      total: 3,
      currentLearningDue: 1,
      todayReviewDue: 1,
      allowedNew: 0,
      buckets: {
        all: 3,
        item: 3,
      },
    });
  });

  it('counts learn-ahead candidates without adding them to the normal projection rows', () => {
    const dueLearning = card('learning-now', {
      state: CardState.Learning,
      due: NOW,
    });
    const futureLearning = card('learning-future', {
      state: CardState.Learning,
      due: NOW + 6 * 60_000,
    });
    const futureReview = card('review-future', {
      state: CardState.Review,
      due: NOW + 6 * 60_000,
    });
    const input = {
      ...baseBuildInput(QueueType.IncrementalLearning, [futureReview, futureLearning, dueLearning]),
      learnAheadWindowEnd: NOW + 20 * 60_000,
      learnAheadMaxCards: 10,
    };

    const projection = buildQueueProjectionRows(input);

    expect(projection.rows.map((entry) => entry.cardId)).toEqual(['learning-now', 'review-future']);
    expect(projection.counters).toMatchObject({
      remaining: 2,
      due: 2,
      currentLearningDue: 1,
      todayReviewDue: 1,
      learnAheadAvailable: 1,
      scheduledTotal: 3,
    });
  });

  it('builds IncrementalLearning projection rows for formal cards, rotation cards, manual entries, and frontier candidates', () => {
    const formal = card('formal', {
      type: CardType.Item,
      state: CardState.Review,
      due: NOW,
    });
    const formalFrontier = card('formal-frontier', {
      type: CardType.Descriptor,
      state: CardState.Review,
      due: NOW + 1_000,
      priority: 1,
    });
    const topic = card('topic', {
      type: CardType.Topic,
      schedulerType: 'a-factor-v2',
      due: NOW - 60_000,
      aFactor: 2.4,
    });
    const concept = card('concept', {
      type: CardType.Concept,
      schedulerType: 'a-factor-v2',
      due: NOW + 30_000,
      aFactor: 2.1,
    });
    const manualFuture = card('manual-future', {
      type: CardType.Topic,
      due: NOW + 4 * DAY_MS,
    });
    const input = baseBuildInput(
      QueueType.IncrementalLearning,
      [topic, formalFrontier, concept, formal],
      [manualFuture],
    );

    const existingOrder = SrsV2QueuePolicy.buildIncrementalLearningQueue({
      ...input,
      isBlacklisted: () => false,
      isDismissed: () => false,
    }).map((entry) => entry.id);
    const projection = buildQueueProjectionRows(input);

    expect(projection.rows.map((entry) => entry.cardId)).toEqual(existingOrder);
    expect(projection.rows.find((entry) => entry.cardId === 'topic')).toMatchObject({
      membershipReason: 'rotation',
      dueBucket: 'overdue',
    });
    expect(projection.rows.find((entry) => entry.cardId === 'concept')).toMatchObject({
      membershipReason: 'rotation',
      dueBucket: 'due',
    });
    expect(projection.rows.find((entry) => entry.cardId === 'manual-future')).toMatchObject({
      membershipReason: 'manual-outstanding',
      dueBucket: 'manual',
    });
    expect(projection.frontierRows.map((entry) => entry.cardId)).toEqual(['formal-frontier']);
    expect(projection.counters.buckets).toMatchObject({
      all: 4,
      item: 1,
      topic: 2,
      concept: 1,
    });
  });

  it('changes source-card fingerprint when scheduler-relevant card state or priority changes', () => {
    const original = card('fingerprint-card', {
      due: NOW,
      state: CardState.Review,
      priority: 50,
      meta: { content: 'content-a', rootId: 'doc-a' },
    });

    expect(buildQueueProjectionSourceCardFingerprint({
      ...original,
      meta: { content: 'content-b', rootId: 'doc-b' },
    }).fingerprint).toBe(buildQueueProjectionSourceCardFingerprint(original).fingerprint);
    expect(buildQueueProjectionSourceCardFingerprint({
      ...original,
      priority: 51,
    }).fingerprint).not.toBe(buildQueueProjectionSourceCardFingerprint(original).fingerprint);
    expect(buildQueueProjectionSourceCardFingerprint({
      ...original,
      due: NOW + DAY_MS,
    }).fingerprint).not.toBe(buildQueueProjectionSourceCardFingerprint(original).fingerprint);
  });

  it('recomputes ordinary feedback affected sets across siblings, manual entries, drill/leech membership, and frontier candidates', () => {
    const affected = buildQueueProjectionAffectedSet({
      reviewedCard: card('reviewed', { blockId: 'shared-block' }),
      siblingCards: [
        card('sibling-a', { blockId: 'shared-block' }),
        card('reviewed', { blockId: 'shared-block' }),
      ],
      logicalEquivalentCards: [card('logical-a', { blockId: 'logical-block' })],
      manualOutstandingCards: [card('manual-a')],
      finalDrillCards: [card('drill-a')],
      leechCards: [card('leech-a')],
      frontierCards: [card('frontier-a'), card('manual-a')],
    });

    expect(affected.affectedCardIds).toEqual([
      'reviewed',
      'sibling-a',
      'logical-a',
      'manual-a',
      'drill-a',
      'leech-a',
      'frontier-a',
    ]);
    expect(affected.affectedBlockIds).toEqual([
      'shared-block',
      'logical-block',
      'block-manual-a',
      'block-drill-a',
      'block-leech-a',
      'block-frontier-a',
    ]);
    expect(affected.entries.find((entry) => entry.cardId === 'manual-a')?.reasons).toEqual([
      'manual-outstanding',
      'frontier-candidate',
    ]);
  });

  it('classifies broad invalidations as full rebuild refreshes', () => {
    const broadReasons = [
      'day-rollover',
      'settings-policy-changed',
      'scheduler-policy-hash-changed',
      'algorithm-installed',
      'algorithm-disabled',
      'batch-reschedule',
      'filter-definition-changed',
      'drill-cleanup',
      'leech-action-policy-changed',
      'neural-session-reset',
      'source-existence-repair',
      'projection-corruption',
      'explicit-repair',
    ];

    expect(broadReasons.every(isBroadQueueProjectionInvalidationReason)).toBe(true);
    expect(isBroadQueueProjectionInvalidationReason('review-feedback')).toBe(false);

    expect(planQueueProjectionInvalidation({
      reason: 'settings-policy-changed',
      queueTypes: [QueueType.RetrievalPractice, QueueType.IncrementalLearning],
      generation: 9,
      createdAt: NOW,
    })).toMatchObject({
      reason: 'settings-policy-changed',
      queueTypes: [QueueType.RetrievalPractice, QueueType.IncrementalLearning],
      generation: 9,
      refreshRequired: true,
      fullRebuildRequired: true,
    });

    expect(planQueueProjectionInvalidation({
      reason: 'review-feedback',
      queueTypes: [QueueType.RetrievalPractice],
      generation: 10,
      affectedCardIds: ['reviewed'],
    })).toMatchObject({
      refreshRequired: false,
      fullRebuildRequired: false,
      affectedCardIds: ['reviewed'],
    });
  });

  it('plans priority-source invalidation for processing and review projections without a full rebuild', () => {
    const plan = planPrioritySourceQueueProjectionInvalidation({
      change: { sourceId: 'doc-root' },
      processingItems: [
        {
          id: 'progressive-a',
          kind: 'progressive-item',
          sourceId: 'block-a',
          processingDueAt: NOW,
          sourceLineage: ['block-a', 'doc-root'],
        },
        {
          id: 'progressive-b',
          kind: 'progressive-item',
          sourceId: 'block-b',
          processingDueAt: NOW,
          sourceLineage: ['other-root'],
        },
      ],
      reviewRefs: [
        { cardId: 'review-a', blockId: 'block-review-a', sourceLineage: ['doc-root'] },
        { cardId: 'review-b', blockId: 'block-review-b', sourceLineage: ['other-root'] },
      ],
      queueTypes: [QueueType.RetrievalPractice, QueueType.IncrementalLearning],
      generation: 11,
      createdAt: NOW,
    });

    expect(plan).toMatchObject({
      reason: 'priority-source-changed',
      queueTypes: [QueueType.RetrievalPractice, QueueType.IncrementalLearning],
      generation: 11,
      affectedCardIds: ['review-a'],
      affectedBlockIds: ['block-review-a'],
      refreshRequired: true,
      fullRebuildRequired: false,
      metadata: {
        sourceId: 'doc-root',
        projectionFamilies: ['processing', 'review'],
        affectedProcessingItemIds: ['progressive-a'],
      },
      processing: {
        affectedProcessingItemIds: ['progressive-a'],
        affectedReviewCardIds: ['review-a'],
      },
    });
  });
});
