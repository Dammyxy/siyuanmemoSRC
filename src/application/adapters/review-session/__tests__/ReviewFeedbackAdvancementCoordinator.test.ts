import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import {
  ReviewCurrentItemCommand,
  ReviewFeedbackAdvancementCoordinator,
  ReviewLearnAheadAdvancePolicy,
  ReviewSessionCursor,
} from '..';

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: overrides.xiuyuanID ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
    due: 1,
    stability: 1,
    difficulty: 1,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createCoordinator(queueType: QueueType, cursor = new ReviewSessionCursor(queueType)) {
  const currentItem = new ReviewCurrentItemCommand();
  const invalidateCache = vi.fn(() => cursor.invalidate());
  const refreshLocalCounterSnapshot = vi.fn();
  const coordinator = new ReviewFeedbackAdvancementCoordinator({
    queueType,
    cursor,
    currentItem,
    learnAheadAdvancePolicy: new ReviewLearnAheadAdvancePolicy(),
    refreshLocalCounterSnapshot,
    invalidateCache,
    applyProjectionQueueImpact: vi.fn(async () => 'not-applicable'),
  });

  return {
    coordinator,
    cursor,
    currentItem,
    invalidateCache,
    refreshLocalCounterSnapshot,
  };
}

describe('ReviewFeedbackAdvancementCoordinator', () => {
  it('applies successful rated feedback to the local Review session without owning queue mutation', async () => {
    const reviewed = card('reviewed', { blockId: 'shared-block', meta: { faceIndex: 0 } });
    const sibling = card('sibling', { blockId: 'shared-block', meta: { faceIndex: 0 } });
    const remaining = card('remaining', { blockId: 'other-block' });
    const { coordinator, cursor, currentItem, invalidateCache, refreshLocalCounterSnapshot } =
      createCoordinator(QueueType.RetrievalPractice);
    cursor.load([reviewed, sibling, remaining]);
    currentItem.select(reviewed);

    const result = await coordinator.applyRateResult({
      activeItem: reviewed,
      feedback: { action: 'rate', rating: 4 },
      reviewResult: {
        removedFromQueue: true,
        remainsInQueue: false,
        updatedCard: null,
        queueChanged: false,
        requiresCurrentViewReorder: false,
        counterSnapshot: {
          version: 1,
          remaining: 2,
          due: 2,
          total: 3,
          currentLearningDue: 0,
          todayReviewDue: 2,
          allowedNew: 0,
          learnAheadAvailable: 0,
          scheduledTotal: 3,
          buckets: { all: 3, item: 3, descriptor: 0, topic: 0, concept: 0 },
          source: 'backend',
        },
      },
      learnAheadSession: false,
    });

    expect(result.kind).toBe('local-patched');
    expect(currentItem.current).toBeNull();
    expect(cursor.cached().map((item) => item.id)).toEqual(['sibling', 'remaining']);
    expect(cursor.valid).toBe(true);
    expect(invalidateCache).not.toHaveBeenCalled();
    expect(refreshLocalCounterSnapshot).toHaveBeenCalledWith('hot', expect.objectContaining({ version: 1 }));
  });

  it('applies IncrementalLearning skip as a requery transition with one-time avoidance', () => {
    const skipped = card('skipped', { blockId: 'block-skipped' });
    const { coordinator, cursor, currentItem, invalidateCache } =
      createCoordinator(QueueType.IncrementalLearning);
    cursor.load([skipped, card('next')]);
    currentItem.select(skipped);

    const result = coordinator.applySkipResult(skipped);

    expect(result.kind).toBe('requery');
    expect(currentItem.current).toBeNull();
    expect(cursor.valid).toBe(false);
    expect(cursor.avoidCardId).toBe('skipped');
    expect(cursor.avoidBlockId).toBe('block-skipped');
    expect(invalidateCache).toHaveBeenCalledOnce();
  });

  it('keeps IncrementalLearning Good/Easy cards out of the current review session', async () => {
    const reviewed = card('reviewed', { blockId: 'block-reviewed' });
    const { coordinator, cursor, currentItem } =
      createCoordinator(QueueType.IncrementalLearning);
    cursor.load([reviewed, card('next')]);
    currentItem.select(reviewed);

    await coordinator.applyRateResult({
      activeItem: reviewed,
      feedback: { action: 'rate', rating: 4 },
      reviewResult: {
        removedFromQueue: true,
        remainsInQueue: false,
        updatedCard: null,
        queueChanged: true,
        requiresCurrentViewReorder: false,
        counterSnapshot: null,
      },
      learnAheadSession: false,
    });

    expect(cursor.hasSessionExclusions()).toBe(true);
  });

  it('restores local Review session state after failed feedback compensation', () => {
    const restored = card('restored');
    const { coordinator, cursor, currentItem, invalidateCache } =
      createCoordinator(QueueType.FilterGroup);
    cursor.load([card('old')]);
    cursor.pushForward(card('forward'));
    cursor.setAvoidOnce(card('avoid'));
    currentItem.select(card('failed'));

    coordinator.applyFailedFeedbackCompensation(restored);

    expect(currentItem.current?.id).toBe('restored');
    expect(cursor.shiftForward()).toBeNull();
    expect(cursor.avoidCardId).toBeNull();
    expect(cursor.pendingRotation).toBeNull();
    expect(invalidateCache).toHaveBeenCalledOnce();
  });
});
