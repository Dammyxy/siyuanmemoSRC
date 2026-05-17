import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { ReviewSessionCursor } from '../ReviewSessionCursor';

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id,
    xiuyuanID: overrides.xiuyuanID ?? id,
    blockId: overrides.blockId ?? `block-${id}`,
    due: 1,
    stability: 1,
    difficulty: 1,
    reps: 0,
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

describe('ReviewSessionCursor', () => {
  it('loads cards and advances current index through nextCached', () => {
    const cursor = new ReviewSessionCursor(QueueType.RetrievalPractice);
    cursor.load([card('a'), card('b')]);

    expect(cursor.nextCached()?.card.id).toBe('a');
    expect(cursor.nextCached()?.card.id).toBe('b');
    expect(cursor.nextCached()).toBeNull();
    expect(cursor.remainingFromCache()).toBe(0);
  });

  it('replays forward buffer before cached cards', () => {
    const cursor = new ReviewSessionCursor(QueueType.RetrievalPractice);
    cursor.load([card('a')]);
    cursor.pushForward(card('undo'));

    expect(cursor.hasForward()).toBe(true);
    expect(cursor.shiftForward()?.id).toBe('undo');
    expect(cursor.nextCached()?.card.id).toBe('a');
  });

  it('removes matching cards and adjusts current index and forward buffer', () => {
    const cursor = new ReviewSessionCursor(QueueType.RetrievalPractice);
    cursor.load([card('a'), card('b'), card('c')]);
    cursor.nextCached();
    cursor.nextCached();
    cursor.pushForward(card('forward-b', { blockId: 'block-b' }));

    const removed = cursor.removeMatching(new Set(['a', 'block-b']));

    expect(removed).toBe(3);
    expect(cursor.index).toBe(0);
    expect(cursor.shiftForward()).toBeNull();
    expect(cursor.cached().map((item) => item.id)).toEqual(['c']);
  });

  it('filters session-local exclusions from cached and restored cards', () => {
    const cursor = new ReviewSessionCursor(QueueType.RetrievalPractice);
    const reviewed = card('a', { blockId: 'shared-block', meta: { faceIndex: 0 } });
    const siblingFace = card('b', { blockId: 'shared-block', meta: { faceIndex: 0 } });
    const otherFace = card('c', { blockId: 'shared-block', meta: { faceIndex: 1 } });

    expect(cursor.addSessionExcludedCardIdentity(reviewed)).toBe(true);
    cursor.load([reviewed, siblingFace, otherFace]);

    expect(cursor.cached().map((item) => item.id)).toEqual(['c']);
  });

  it('serializes and restores volatile cursor state', () => {
    const cursor = new ReviewSessionCursor(QueueType.RetrievalPractice);
    cursor.load([card('a'), card('b')]);
    cursor.nextCached();
    cursor.pushForward(card('forward'));
    cursor.setPendingRotation('b');
    cursor.setAvoidOnce(card('avoid', { blockId: 'avoid-block' }));

    const restored = new ReviewSessionCursor(QueueType.RetrievalPractice);
    restored.restore(cursor.serialize(QueueType.RetrievalPractice, card('current')));

    expect(restored.index).toBe(1);
    expect(restored.shiftForward()?.id).toBe('forward');
    expect(restored.pendingRotation).toBe('b');
    expect(restored.avoidCardId).toBe('avoid');
    expect(restored.avoidBlockId).toBe('avoid-block');
  });

  it('applies projection patch state as the cursor authority', () => {
    const cursor = new ReviewSessionCursor(QueueType.FilterGroup);
    cursor.load([card('old')]);
    cursor.pushForward(card('forward'));

    cursor.applyProjectionPatch({
      cacheValid: true,
      cachedCards: [card('new-a'), card('new-b')],
      currentIndex: 1,
      forwardBuffer: [],
      lastCounterSnapshot: {
        version: 1,
        remaining: 1,
        due: 1,
        total: 2,
        currentLearningDue: 0,
        todayReviewDue: 1,
        allowedNew: 0,
        learnAheadAvailable: 0,
        scheduledTotal: 2,
        buckets: { all: 2, item: 2, descriptor: 0, topic: 0, concept: 0 },
        source: 'hot',
      },
    });

    expect(cursor.cached().map((item) => item.id)).toEqual(['new-a', 'new-b']);
    expect(cursor.index).toBe(1);
    expect(cursor.shiftForward()).toBeNull();
    expect(cursor.counterSnapshot?.remaining).toBe(1);
  });

  it('selects requery next card and clears one-time avoidance inside the cursor', () => {
    const cursor = new ReviewSessionCursor(QueueType.IncrementalLearning);
    cursor.load([
      card('a', { blockId: 'same-block' }),
      card('b', { blockId: 'same-block' }),
      card('c', { blockId: 'other-block' }),
    ]);
    cursor.setAvoidOnce(card('a', { blockId: 'same-block' }));

    const next = cursor.nextRequery();

    expect(next?.card.id).toBe('c');
    expect(next?.avoidedCardId).toBe('a');
    expect(next?.avoidedBlockId).toBe('same-block');
    expect(cursor.index).toBe(3);
    expect(cursor.avoidCardId).toBeNull();
    expect(cursor.avoidBlockId).toBeNull();
  });
});
