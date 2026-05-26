import { describe, expect, it, vi } from 'vitest';
import { QueueItemUnavailableError, type QueueFeedback } from '@/core/queue/abstraction/Strategy';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import {
  ReviewSessionCursor,
  ReviewTransactionSafetyEnvelope,
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

function queue(snapshot: unknown): IReviewQueue {
  return {
    createRollbackSnapshot: vi.fn(async () => snapshot),
    restoreRollbackSnapshot: vi.fn(async () => undefined),
  } as unknown as IReviewQueue;
}

function createEnvelope(options: {
  queueType?: QueueType;
  currentQueue?: IReviewQueue;
  finalDrillQueue?: IReviewQueue;
  storedCards?: FSRSCard[];
} = {}) {
  const queueType = options.queueType ?? QueueType.RetrievalPractice;
  const currentQueue = options.currentQueue ?? queue('current-snapshot');
  const finalDrillQueue = options.finalDrillQueue ?? queue('final-drill-snapshot');
  const cursor = new ReviewSessionCursor(queueType);
  const storedCards = options.storedCards ?? [card('active')];
  const updateCard = vi.fn(async () => undefined);
  const restoreCardSnapshotForFailedFeedback = vi.fn(async () => undefined);
  const manager = {
    getCard: vi.fn(async (id: string) => storedCards.find((stored) => stored.id === id) ?? null),
    getCards: vi.fn(async ({ blockIds }: { blockIds: string[] }) =>
      storedCards.filter((stored) => blockIds.includes(stored.blockId))),
    getQueue: vi.fn((type: QueueType) => type === QueueType.FinalDrill ? finalDrillQueue : currentQueue),
    updateCard,
    restoreCardSnapshotForFailedFeedback,
  };
  const invalidateCache = vi.fn();
  const refreshRestoredItem = vi.fn(async (item: FSRSCard) => ({ ...item, nextDues: { 3: 'tomorrow' } }));
  const envelope = new ReviewTransactionSafetyEnvelope({
    queueType,
    queue: currentQueue,
    manager,
    cursor,
    getCurrentItem: () => null,
    invalidateCache,
    refreshRestoredItem,
  });

  return {
    envelope,
    cursor,
    manager,
    currentQueue,
    finalDrillQueue,
    invalidateCache,
    refreshRestoredItem,
    updateCard,
    restoreCardSnapshotForFailedFeedback,
  };
}

describe('ReviewTransactionSafetyEnvelope', () => {
  it('fails closed when ordinary Review feedback cannot capture the pre-review card snapshot', async () => {
    const { envelope } = createEnvelope({ storedCards: [] });

    await expect(envelope.capture(card('missing'), { action: 'rate', rating: 3 }))
      .rejects.toBeInstanceOf(QueueItemUnavailableError);
  });

  it('classifies missing source block snapshot errors as unavailable current items', async () => {
    const current = card('active', { blockId: 'block-active' });
    const { envelope, manager } = createEnvelope({ storedCards: [current] });
    manager.getCard.mockRejectedValue(new Error('Block not found for current source block-active: active'));

    await expect(envelope.capture(current, { action: 'rate', rating: 3 }))
      .rejects.toBeInstanceOf(QueueItemUnavailableError);
  });

  it('classifies lowercase backend missing-card snapshot errors as unavailable current items', async () => {
    const current = card('active', { blockId: 'block-active' });
    const { envelope, manager } = createEnvelope({ storedCards: [current] });
    manager.getCard.mockRejectedValue(new Error('INTERNAL_ERROR: review.feedback card not found: active'));

    await expect(envelope.capture(current, { action: 'rate', rating: 3 }))
      .rejects.toBeInstanceOf(QueueItemUnavailableError);
  });

  it('captures card, queue rollback, final-drill rollback, and session exclusion state before risky feedback', async () => {
    const current = card('active');
    const excluded = card('excluded');
    const { envelope, cursor, currentQueue, finalDrillQueue } = createEnvelope({ storedCards: [current] });
    cursor.addSessionExcludedCardIdentity(excluded);

    const transaction = await envelope.capture(current, { action: 'rate', rating: 1 });

    expect(transaction.cardId).toBe('active');
    expect(transaction.cardBefore?.id).toBe('active');
    expect(transaction.sessionExcludedCardIdsBefore).toEqual(['excluded']);
    expect(transaction.queueSnapshots.map((record) => record.queueType)).toEqual([
      QueueType.RetrievalPractice,
      QueueType.FinalDrill,
    ]);
    expect(currentQueue.createRollbackSnapshot).toHaveBeenCalledOnce();
    expect(finalDrillQueue.createRollbackSnapshot).toHaveBeenCalledOnce();
  });

  it('rolls back with persistent card restore and invalidates the local queue cache', async () => {
    const current = card('active');
    const { envelope, currentQueue, finalDrillQueue, updateCard, invalidateCache } =
      createEnvelope({ storedCards: [current] });
    const transaction = await envelope.capture(current, { action: 'rate', rating: 1 });

    await envelope.rollback(transaction);

    expect(currentQueue.restoreRollbackSnapshot).toHaveBeenCalledWith('current-snapshot');
    expect(finalDrillQueue.restoreRollbackSnapshot).toHaveBeenCalledWith('final-drill-snapshot');
    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'active' }));
    expect(invalidateCache).toHaveBeenCalledOnce();
  });

  it('compensates failed feedback without a second persistent card write and returns a refreshed visible item', async () => {
    const current = card('active');
    const { envelope, restoreCardSnapshotForFailedFeedback, updateCard, refreshRestoredItem } =
      createEnvelope({ storedCards: [current] });
    const transaction = await envelope.capture(current, { action: 'rate', rating: 3 });

    const restored = await envelope.compensateFailedFeedback(card('mutated'), transaction);

    expect(restoreCardSnapshotForFailedFeedback).toHaveBeenCalledWith(expect.objectContaining({ id: 'active' }));
    expect(updateCard).not.toHaveBeenCalled();
    expect(refreshRestoredItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'active' }));
    expect(restored.id).toBe('active');
    expect(restored.nextDues).toEqual({ 3: 'tomorrow' });
  });

  it('allows NeuralRoam feedback transactions without a card snapshot', async () => {
    const { envelope } = createEnvelope({
      queueType: QueueType.NeuralRoam,
      storedCards: [],
    });

    const transaction = await envelope.capture(card('synthetic-node'), { action: 'skip' } as QueueFeedback);

    expect(transaction.cardBefore).toBeNull();
    expect(transaction.queueSnapshots.map((record) => record.queueType)).toEqual([QueueType.NeuralRoam]);
  });
});
