import { describe, expect, it, vi } from 'vitest';
import { CardType, type FSRSCard } from '@/types/card';
import { QueueType, type QueueReviewResult } from '@/types/unified-data-source';
import {
  IncrementalRequeryAdvancePolicy,
  NeuralRoamAdvanceOutcomePolicy,
  ReviewFeedbackCompensationPolicy,
  ReviewLearnAheadAdvancePolicy,
  ReviewSessionProjectionAdvancePolicy,
} from '..';
import type { BackendNeuralRoamAdvanceResult } from '../../../../../packages/contracts/src/backend-rpc';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-05-13T08:00:00+08:00').getTime();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-card-1',
    blockId: 'block-1',
    due: now,
    stability: 5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 86_400_000,
    updatedAt: now,
    ...overrides,
  };
}

function createNeuralResult(status: BackendNeuralRoamAdvanceResult['status']): BackendNeuralRoamAdvanceResult {
  const card = createCard({ id: 'neural-card', blockId: 'neural-block' });
  return {
    queueType: 'neural-roam',
    sessionId: null,
    status,
    nextItem: status === 'advanced'
      ? {
        id: card.id,
        cardId: card.id,
        blockId: card.blockId,
        deckId: null,
        due: card.due,
        type: card.type,
        meta: {},
        sourceKind: 'virtual',
        payload: card as unknown as Record<string, unknown>,
      }
      : null,
    counters: {
      remaining: status === 'advanced' ? 1 : 0,
      due: status === 'advanced' ? 1 : 0,
      total: status === 'advanced' ? 1 : 0,
      pendingAssociatedReview: 0,
      sourceNodes: status === 'advanced' ? 1 : 0,
    },
    sessionState: {
      sessionId: null,
      engineMode: 'hyperspace',
      currentNodeId: null,
      currentEventId: null,
      pathLength: 0,
      historyCount: 0,
      exhausted: status === 'exhausted',
      projectionGeneration: null,
      policyHash: null,
    },
    queueState: { version: 1 },
    projectionImpact: null,
    unavailableReason: status === 'mismatch' ? 'current-item-missing' : null,
    message: status === 'failed' ? 'backend failed' : null,
  };
}

describe('ReviewSessionProjectionAdvancePolicy', () => {
  it.each([
    ['refresh-required'],
    ['generation-mismatch'],
    ['unavailable'],
  ] as const)('returns refresh-required for %s projection actions', async (status) => {
    const card = createCard();
    const policy = new ReviewSessionProjectionAdvancePolicy({
      shouldReadLocally: () => false,
      hydrateCardsBySnapshotIds: vi.fn(async () => []),
    });

    const result = await policy.advance({
      reviewedCard: card,
      result: {
        projectionAction: {
          status,
          queueType: QueueType.RetrievalPractice,
          generation: 2,
          policyHash: 'policy-a',
          reason: status,
        },
      } as QueueReviewResult,
      state: {
        cacheValid: true,
        cachedCards: [card],
        currentIndex: 1,
        forwardBuffer: [],
        lastCounterSnapshot: null,
      },
    });

    expect(result.outcome).toBe('refresh-required');
  });

  it('applies patch-applied through the projection applier', async () => {
    const reviewed = createCard({ id: 'card-1', blockId: 'block-1' });
    const next = createCard({ id: 'card-2', blockId: 'block-2' });
    const policy = new ReviewSessionProjectionAdvancePolicy({
      shouldReadLocally: () => false,
      hydrateCardsBySnapshotIds: vi.fn(async () => [next]),
    });

    const result = await policy.advance({
      reviewedCard: reviewed,
      result: {
        projectionAction: {
          status: 'patch-applied',
          queueType: QueueType.RetrievalPractice,
          generation: 2,
          policyHash: 'policy-a',
          reason: 'review-feedback',
        },
        projectionImpactEntry: {
          queueType: QueueType.RetrievalPractice,
          removedRowIds: ['card-1'],
          insertedRows: [{ rowId: 'card-2', cardId: 'card-2', blockId: 'block-2', queueIndexHint: 1 }],
          updatedRows: [],
        },
      } as QueueReviewResult,
      forceRemove: true,
      state: {
        cacheValid: true,
        cachedCards: [reviewed],
        currentIndex: 1,
        forwardBuffer: [reviewed],
        lastCounterSnapshot: null,
      },
    });

    expect(result.outcome).toBe('patched');
    expect(result.state.cachedCards.map((card) => card.id)).toEqual(['card-2']);
    expect(result.state.forwardBuffer).toEqual([]);
  });

  it('ignores projection actions for static subset local reads', async () => {
    const card = createCard();
    const hydrateCardsBySnapshotIds = vi.fn(async () => [card]);
    const policy = new ReviewSessionProjectionAdvancePolicy({
      shouldReadLocally: () => true,
      hydrateCardsBySnapshotIds,
    });

    const result = await policy.advance({
      reviewedCard: card,
      result: {
        projectionAction: {
          status: 'patch-applied',
          queueType: QueueType.FilterGroup,
          generation: 1,
          policyHash: 'global-filter',
          reason: 'review-feedback',
        },
        projectionImpactEntry: {
          queueType: QueueType.FilterGroup,
          removedRowIds: ['card-1'],
          insertedRows: [],
          updatedRows: [],
        },
      } as QueueReviewResult,
      state: {
        cacheValid: true,
        cachedCards: [card],
        currentIndex: 1,
        forwardBuffer: [],
        lastCounterSnapshot: null,
      },
    });

    expect(result.outcome).toBe('not-applicable');
    expect(hydrateCardsBySnapshotIds).not.toHaveBeenCalled();
  });
});

describe('ReviewFeedbackCompensationPolicy', () => {
  it('plans failed-feedback cleanup and restore actions atomically', () => {
    const plan = new ReviewFeedbackCompensationPolicy().plan({
      hasFailedHistoryEntry: true,
      hasTransaction: true,
      hasCardSnapshot: true,
    });

    expect(plan).toEqual([
      'discard-failed-history-entry',
      'restore-queue-rollback-snapshots',
      'restore-card-snapshot',
      'restore-session-exclusions',
      'reset-volatile-advance-state',
      'restore-current-item',
      'invalidate-cache',
    ]);
  });
});

describe('IncrementalRequeryAdvancePolicy', () => {
  it('captures avoid-once visible identity', () => {
    const policy = new IncrementalRequeryAdvancePolicy();
    expect(policy.captureVisibleIdentity(createCard({ id: 'card-a', blockId: 'block-a' }))).toEqual({
      cardId: 'card-a',
      blockId: 'block-a',
    });
  });

  it('prefers a different block, then a different card, then same visible item', () => {
    const policy = new IncrementalRequeryAdvancePolicy();
    const identity = { cardId: 'card-a', blockId: 'block-a' };

    expect(policy.selectNext([
      createCard({ id: 'card-a', blockId: 'block-a' }),
      createCard({ id: 'card-b', blockId: 'block-a' }),
      createCard({ id: 'card-c', blockId: 'block-c' }),
    ], identity)).toEqual({ index: 2, mode: 'different-block' });

    expect(policy.selectNext([
      createCard({ id: 'card-a', blockId: 'block-a' }),
      createCard({ id: 'card-b', blockId: 'block-a' }),
    ], identity)).toEqual({ index: 1, mode: 'same-block-different-card' });

    expect(policy.selectNext([
      createCard({ id: 'card-a', blockId: 'block-a' }),
    ], identity)).toEqual({ index: 0, mode: 'same-visible-card-fallback' });
  });

  it('preserves snapshot compatibility with deferOnceCardId', () => {
    const policy = new IncrementalRequeryAdvancePolicy();
    expect(policy.serialize({ cardId: 'card-a', blockId: 'block-a' })).toEqual({
      avoidOnceCardId: 'card-a',
      avoidOnceBlockId: 'block-a',
      deferOnceCardId: 'card-a',
    });
    expect(policy.restore({ deferOnceCardId: 'legacy-card', avoidOnceBlockId: null })).toEqual({
      cardId: 'legacy-card',
      blockId: null,
    });
  });
});

describe('ReviewLearnAheadAdvancePolicy', () => {
  it('starts only after normal exhaustion and exits when exhausted', async () => {
    const card = createCard();
    const policy = new ReviewLearnAheadAdvancePolicy();

    await expect(policy.startAfterNormalExhaustion({
      getNormalRemaining: vi.fn(async () => 1),
      getLearnAheadCards: vi.fn(async () => [card]),
    })).resolves.toEqual({ started: false, cards: [] });

    await expect(policy.startAfterNormalExhaustion({
      getNormalRemaining: vi.fn(async () => 0),
      getLearnAheadCards: vi.fn(async () => [card]),
    })).resolves.toEqual({ started: true, cards: [card] });

    expect(policy.shouldExitAfterFeedback({ currentIndex: 1, cachedCardsLength: 1 })).toBe(true);
    expect(policy.shouldSupersedeWithNormalQueue(1)).toBe(true);
  });
});

describe('NeuralRoamAdvanceOutcomePolicy', () => {
  it('normalizes backend-authoritative advance outcomes without local cursor fallback', () => {
    const policy = new NeuralRoamAdvanceOutcomePolicy();

    expect(policy.consume(createNeuralResult('advanced'))).toEqual({ kind: 'next' });
    expect(policy.consume(createNeuralResult('exhausted'))).toEqual({ kind: 'exhausted' });
    expect(policy.consume(createNeuralResult('failed'))).toEqual({
      kind: 'unavailable',
      reason: 'failed',
      message: 'backend failed',
    });
    expect(policy.consume(createNeuralResult('mismatch'))).toEqual({
      kind: 'item-unavailable',
      reason: 'current-item-missing',
    });
  });
});
