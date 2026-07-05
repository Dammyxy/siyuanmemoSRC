import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import {
  QueueType,
  type IReviewQueue,
  type QueueCounterSnapshot,
  type QueueReviewResult,
} from '@/types/unified-data-source';
import { createSrsV2QueueProfile } from '../SrsV2QueueProfiles';
import { SrsV2SessionQueueRuntime } from '../SrsV2SessionQueueRuntime';

const MINUTE_MS = 60_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now - MINUTE_MS,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - MINUTE_MS,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - MINUTE_MS,
    updatedAt: now - MINUTE_MS,
    ...overrides,
  };
}

function counter(remaining: number): QueueCounterSnapshot {
  return {
    version: 1,
    remaining,
    due: remaining,
    total: remaining,
    buckets: {
      all: remaining,
      item: remaining,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'hot',
  };
}

function createQueue(cards: FSRSCard[], options: {
  handleReview?: (cardId: string, rating: number) => Partial<QueueReviewResult>;
  hydrateCards?: FSRSCard[];
} = {}): IReviewQueue {
  const liveCards = cards.map((card) => ({ ...card }));
  const hydrationCards = options.hydrateCards?.map((card) => ({ ...card })) ?? null;
  return {
    name: 'runtime-test-queue',
    type: QueueType.IncrementalLearning,
    getType: () => QueueType.IncrementalLearning,
    getCards: vi.fn(async () => liveCards.map((card) => ({ ...card }))),
    getSnapshotRows: vi.fn(async () => {
      throw new Error('QUEUE_PROJECTION_NOT_READY: test projection refresh');
    }),
    getCardsBySnapshotIds: vi.fn(async (ids: string[]) => {
      if (!hydrationCards) {
        throw new Error('QUEUE_PROJECTION_NOT_READY: test projection refresh');
      }
      return ids
        .map((id) => hydrationCards.find((card) => card.id === id))
        .filter((card): card is FSRSCard => Boolean(card))
        .map((card) => ({ ...card }));
    }),
    getAllCards: vi.fn(async () => liveCards.map((card) => ({ ...card }))),
    getNextCard: vi.fn(async () => liveCards[0] ?? null),
    addCard: vi.fn(async () => undefined),
    removeCard: vi.fn(async (cardId: string) => {
      const index = liveCards.findIndex((card) => card.id === cardId);
      if (index >= 0) {
        liveCards.splice(index, 1);
      }
    }),
    updateCard: vi.fn(async () => undefined),
    handleReview: vi.fn(async (cardId: string, rating: number) => {
      const existing = liveCards.find((card) => card.id === cardId) ?? null;
      const override = options.handleReview?.(cardId, rating);
      if (!override && rating >= 3) {
        const index = liveCards.findIndex((card) => card.id === cardId);
        if (index >= 0) {
          liveCards.splice(index, 1);
        }
      }
      return {
        updatedCard: override?.updatedCard ?? existing,
        removedFromQueue: override?.removedFromQueue ?? rating >= 3,
        remainsInQueue: override?.remainsInQueue ?? rating < 3,
        queueChanged: override?.queueChanged ?? true,
        requiresCurrentViewReorder: override?.requiresCurrentViewReorder ?? false,
        counterSnapshot: override?.counterSnapshot ?? counter(Math.max(0, liveCards.length - (rating >= 3 ? 1 : 0))),
        version: 1,
      };
    }),
    skip: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ total: liveCards.length, due: liveCards.length, new: 0, learning: 0, reviewed: 0 })),
    getCounterSnapshot: vi.fn(async () => counter(liveCards.length)),
    getRemainingSize: vi.fn(async () => liveCards.length),
    getUIConfig: vi.fn(() => ({ displayName: 'Runtime test', buttons: [], showSkipButton: true, showProgressBar: true })),
    isDynamic: vi.fn(() => true),
    refresh: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    getSize: vi.fn(async () => liveCards.length),
    isEmpty: vi.fn(async () => liveCards.length === 0),
    sort: vi.fn(async () => undefined),
    filter: vi.fn(async () => []),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    reorder: vi.fn(async () => true),
    clearCustomOrder: vi.fn(),
  };
}

describe('SrsV2SessionQueueRuntime', () => {
  it('treats live CDF relation cards as session-eligible only when active and content-complete', () => {
    const profile = createSrsV2QueueProfile(QueueType.RetrievalPractice);
    const eligible = createCard({
      id: 'cdf-active-complete',
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'source:concept:descriptor-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        liveRelationIssues: [],
      },
    });
    const incomplete = createCard({
      id: 'cdf-content-incomplete',
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'source:concept:descriptor-reverse',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-incomplete',
        liveRelationIssues: [],
      },
    });
    const orphaned = createCard({
      id: 'cdf-orphaned',
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'source:concept:definition-forward',
        liveRelationStatus: 'orphaned-by-live-relation',
        liveContentStatus: 'content-complete',
        liveRelationIssues: [],
      },
    });
    const blocked = createCard({
      id: 'cdf-blocked',
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'source:concept:definition-reverse',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        liveRelationIssues: [{ code: 'missing-concept-ref', severity: 'blocking' }],
      },
    });

    expect(profile.isEligible(eligible)).toBe(true);
    expect(profile.isEligible(incomplete)).toBe(false);
    expect(profile.isEligible(orphaned)).toBe(false);
    expect(profile.isEligible(blocked)).toBe(false);
  });

  it('answers and advances from the session queue without projection readiness', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: 'card-1' });
    const result = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'answer-1' },
    });

    expect(result.status).toBe('advanced');
    expect(result.nextCard).toMatchObject({ id: 'card-2' });
    expect(result.counterSnapshot.remaining).toBe(1);
    expect(queue.handleReview).toHaveBeenCalledTimes(1);
    expect(queue.getCards).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();
  });

  it('initializes counter snapshot from the session queue without selecting the first card', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await expect(runtime.ensureCounterSnapshot()).resolves.toMatchObject({
      remaining: 2,
      due: 2,
      total: 2,
    });
    expect(runtime.getSessionCards().map((card) => card.id)).toEqual(['card-1', 'card-2']);
    expect(queue.getCards).toHaveBeenCalledTimes(1);
    expect(queue.getCounterSnapshot).not.toHaveBeenCalled();
    expect(queue.getSnapshotRows).not.toHaveBeenCalled();
    expect(queue.getCardsBySnapshotIds).not.toHaveBeenCalled();

    await expect(runtime.next()).resolves.toMatchObject({ id: 'card-1' });
  });

  it('keeps failed answers pending and advances from the session frontier before commit settles', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const failed = createCard({
      id: 'card-1',
      blockId: 'block-1',
      state: CardState.Learning,
      due: Date.now() - MINUTE_MS,
    });
    const queue = createQueue([first, second], {
      handleReview: () => ({
        updatedCard: failed,
        removedFromQueue: false,
        remainsInQueue: true,
        counterSnapshot: counter(2),
      }),
    });
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.RetrievalPractice,
      queue,
    });

    await runtime.next();
    const result = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 2, commitIdempotencyKey: 'answer-2' },
    });

    expect(result.commitStatus).toBe('pending');
    expect(result.commitIdempotencyKey).toBe('answer-2');
    expect(result.nextCard).toMatchObject({ id: 'card-1', state: CardState.Review });
    expect(result.counterSnapshot.remaining).toBe(2);
    await expect(result.commit).resolves.toMatchObject({
      updatedCard: expect.objectContaining({ id: 'card-1', state: CardState.Learning }),
    });
  });

  it('returns pending frontier advance without waiting for future learning commit evidence', async () => {
    const now = Date.now();
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const futureDue = now + 30 * MINUTE_MS;
    const failed = createCard({
      id: 'card-1',
      blockId: 'block-1',
      state: CardState.Learning,
      due: futureDue,
    });
    const queue = createQueue([first], {
      handleReview: () => ({
        updatedCard: failed,
        removedFromQueue: false,
        remainsInQueue: true,
        counterSnapshot: counter(1),
      }),
    });
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
      learnAheadMs: 10 * MINUTE_MS,
      now: () => now,
    });

    await runtime.next();
    const result = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 2, commitIdempotencyKey: 'future-learning' },
    });

    expect(result.status).toBe('advanced');
    expect(result.nextCard).toMatchObject({ id: 'card-1' });
    expect(result.waitingUntil).toBeNull();
    expect(result.commitStatus).toBe('pending');
    expect(result.counterSnapshot.remaining).toBe(1);
    await expect(result.commit).resolves.toMatchObject({
      updatedCard: expect.objectContaining({ id: 'card-1', due: futureDue }),
    });
  });

  it('replays duplicate idempotency keys without committing twice', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    const firstResult = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'same-key' },
    });
    const duplicate = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'same-key' },
    });

    expect(duplicate).toEqual(firstResult);
    expect(queue.handleReview).toHaveBeenCalledTimes(1);
  });

  it('rejects reused idempotency keys with different answer fingerprints', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'conflict-key' },
    });
    const conflict = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 4, commitIdempotencyKey: 'conflict-key' },
    });

    expect(conflict.status).toBe('conflict');
    expect(conflict.reason).toBe('idempotency-conflict');
    expect(queue.handleReview).toHaveBeenCalledTimes(1);
  });

  it('persists skip before rotating to the next session card', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    const result = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'skip', commitIdempotencyKey: 'skip-1' },
    });

    expect(result.status).toBe('advanced');
    expect(result.nextCard).toMatchObject({ id: 'card-2' });
    expect(result.counterSnapshot.remaining).toBe(2);
    expect(queue.skip).toHaveBeenCalledWith(first.id);
    expect(queue.handleReview).not.toHaveBeenCalled();
  });

  it('repairs counters when the current card is discarded as unavailable', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    runtime.discardCard(first);

    expect(runtime.getCounterSnapshot()).toMatchObject({
      remaining: 1,
      due: 1,
      total: 1,
      buckets: {
        all: 1,
      },
    });
    await expect(runtime.next()).resolves.toMatchObject({ id: second.id });
  });

  it('restores runtime queue and counter state with an undo token', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    const result = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'undo-answer' },
    });
    expect(result.undoToken).toBeTruthy();
    expect(result.counterSnapshot.remaining).toBe(1);

    const undo = runtime.undoLast(result.undoToken);
    expect(undo?.restoredCurrentCard).toMatchObject({ id: first.id });
    expect(undo?.counterSnapshot).toMatchObject({ remaining: 2 });
    expect(runtime.getSessionCards().map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });

  it('restores go-back replay order as forward card then previous card', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'go-back-answer' },
    });
    runtime.restoreAfterGoBack({
      previous: first,
      forward: second,
    });

    expect(runtime.getSessionCards().map((card) => card.id)).toEqual(['card-1', 'card-2', 'card-1']);
    await expect(runtime.next()).resolves.toMatchObject({ id: second.id });
    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
  });

  it('rejects answers for non-current cards', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    const result = await runtime.answerAndAdvance({
      card: second,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'wrong-card' },
    });

    expect(result.status).toBe('conflict');
    expect(queue.handleReview).not.toHaveBeenCalled();
  });

  it('rejects answers when the submitted current card fingerprint is stale', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1', updatedAt: 100 });
    const queue = createQueue([first]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await runtime.next();
    const result = await runtime.answerAndAdvance({
      card: createCard({ id: 'card-1', blockId: 'block-1', updatedAt: 99 }),
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'stale-current' },
    });

    expect(result.status).toBe('conflict');
    expect(result.reason).toBe('current-card-stale');
    expect(queue.handleReview).not.toHaveBeenCalled();
  });

  it('returns unavailable without mutating when the runtime mutation owner is unavailable', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
      mutationOwner: {
        ensureAvailable: vi.fn(async () => {
          throw new Error('BACKEND_UNAVAILABLE: writer unavailable');
        }),
      },
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    const result = await runtime.answerAndAdvance({
      card: first,
      feedback: { action: 'rate', rating: 3, commitIdempotencyKey: 'owner-unavailable' },
    });

    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('BACKEND_UNAVAILABLE: writer unavailable');
    expect(result.nextCard).toMatchObject({ id: first.id });
    expect(runtime.getSessionCards().map((card) => card.id)).toEqual(['card-1', 'card-2']);
    expect(queue.handleReview).not.toHaveBeenCalled();
    expect(queue.skip).not.toHaveBeenCalled();
  });

  it('rebuilds only through explicit allowed rebuild triggers', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    await runtime.rebuild('user-refresh');
    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    await expect(runtime.rebuild('ordinary-answer' as never)).rejects.toThrow(
      'REVIEW_SESSION_REBUILD_UNAVAILABLE: unsupported trigger ordinary-answer',
    );

    expect(queue.getCards).toHaveBeenCalledTimes(2);
  });

  it('rebuilds on day rollover before selecting the next card', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const queue = createQueue([first, second]);
    let now = Date.UTC(2026, 4, 27, 10);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
      now: () => now,
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    now = Date.UTC(2026, 4, 28, 10);
    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });

    expect(queue.getCards).toHaveBeenCalledTimes(2);
  });

  it('lazily repairs suspended and out-of-scope queued entries before returning next', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const second = createCard({ id: 'card-2', blockId: 'block-2' });
    const third = createCard({ id: 'card-3', blockId: 'block-3' });
    const suspended = createCard({ id: 'card-2', blockId: 'block-2', state: CardState.Suspended });
    const outOfScope = createCard({ id: 'card-3', blockId: 'block-3', meta: { outOfScope: true } });
    const eligible = createCard({ id: 'card-4', blockId: 'block-4' });
    const queue = createQueue([first, second, third, eligible], {
      hydrateCards: [first, suspended, outOfScope, eligible],
    });
    const profile = createSrsV2QueueProfile(QueueType.IncrementalLearning);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
      profile: {
        queueType: profile.queueType,
        eligibleCardTypes: profile.eligibleCardTypes,
        buildInitialCards: profile.buildInitialCards.bind(profile),
        isEligible: profile.isEligible.bind(profile),
        fingerprint: profile.fingerprint.bind(profile),
        shouldRemainInLearning: profile.shouldRemainInLearning.bind(profile),
        hydrateEntry: async (runtimeQueue, entry) => {
          const [card] = await runtimeQueue.getCardsBySnapshotIds([entry.cardId], false);
          if (!card) {
            return { status: 'remove', reason: 'missing' };
          }
          return profile.isEligible(card)
            ? { status: 'ready', card }
            : { status: 'remove', reason: 'not-eligible' };
        },
      },
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    await expect(runtime.next()).resolves.toMatchObject({ id: eligible.id });
    expect(runtime.getCounterSnapshot()).toMatchObject({ remaining: 2 });
    expect(queue.getCardsBySnapshotIds).toHaveBeenCalled();
  });

  it('hydrates safe fingerprint changes for queued entries without rebuilding the session', async () => {
    const first = createCard({ id: 'card-1', blockId: 'block-1' });
    const staleSecond = createCard({ id: 'card-2', blockId: 'block-2', updatedAt: 100 });
    const repairedSecond = createCard({ id: 'card-2', blockId: 'block-2', updatedAt: 200, priority: 1 });
    const queue = createQueue([first, staleSecond], {
      hydrateCards: [first, repairedSecond],
    });
    const profile = createSrsV2QueueProfile(QueueType.IncrementalLearning);
    const runtime = new SrsV2SessionQueueRuntime({
      queueType: QueueType.IncrementalLearning,
      queue,
      profile: {
        queueType: profile.queueType,
        eligibleCardTypes: profile.eligibleCardTypes,
        buildInitialCards: profile.buildInitialCards.bind(profile),
        isEligible: profile.isEligible.bind(profile),
        fingerprint: profile.fingerprint.bind(profile),
        shouldRemainInLearning: profile.shouldRemainInLearning.bind(profile),
        hydrateEntry: async (runtimeQueue, entry) => {
          const [card] = await runtimeQueue.getCardsBySnapshotIds([entry.cardId], false);
          return card
            ? { status: 'ready', card }
            : { status: 'remove', reason: 'missing' };
        },
      },
    });

    await expect(runtime.next()).resolves.toMatchObject({ id: first.id });
    await expect(runtime.next()).resolves.toMatchObject({ id: staleSecond.id, updatedAt: 200, priority: 1 });
    expect(queue.getCards).toHaveBeenCalledTimes(1);
  });
});
