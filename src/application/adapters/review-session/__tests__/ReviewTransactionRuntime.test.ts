import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import {
  ReviewSessionCursor,
  ReviewTransactionRuntime,
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

function createRuntime() {
  const queueType = QueueType.RetrievalPractice;
  const currentQueue = queue('current-snapshot');
  const finalDrillQueue = queue('final-drill-snapshot');
  const storedCards = [card('previous'), card('active')];
  const cursor = new ReviewSessionCursor(queueType);
  const updateCard = vi.fn(async () => undefined);
  const runtime = new ReviewTransactionRuntime({
    queueType,
    queue: currentQueue,
    manager: {
      getCard: vi.fn(async (id: string) => storedCards.find((stored) => stored.id === id) ?? null),
      getCards: vi.fn(async ({ blockIds }: { blockIds: string[] }) =>
        storedCards.filter((stored) => blockIds.includes(stored.blockId))),
      getQueue: vi.fn((type: QueueType) => type === QueueType.FinalDrill ? finalDrillQueue : currentQueue),
      updateCard,
      restoreCardSnapshotForFailedFeedback: vi.fn(async () => undefined),
    },
    cursor,
    getCurrentItem: () => null,
    invalidateCache: vi.fn(),
    refreshRestoredItem: vi.fn(async (item: FSRSCard) => item),
  });

  return {
    runtime,
    currentQueue,
    finalDrillQueue,
    updateCard,
  };
}

describe('ReviewTransactionRuntime', () => {
  it('keeps Review History rollback behind a single go-back interface', async () => {
    const { runtime, currentQueue, finalDrillQueue, updateCard } = createRuntime();
    const previous = card('previous');
    const active = card('active');
    const transaction = await runtime.capture(previous, { action: 'rate', rating: 1 });
    runtime.record(previous, transaction);

    const result = await runtime.goBack(active);

    expect(result?.previous.id).toBe('previous');
    expect(result?.forwardItem?.id).toBe('active');
    expect(currentQueue.restoreRollbackSnapshot).toHaveBeenCalledWith('current-snapshot');
    expect(finalDrillQueue.restoreRollbackSnapshot).toHaveBeenCalledWith('final-drill-snapshot');
    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'previous' }));
    expect(runtime.canGoBack()).toBe(false);
  });

  it('clears session-only Review History without exposing stack operations to callers', async () => {
    const { runtime } = createRuntime();
    runtime.record(card('session-only'), null);

    expect(runtime.canGoBack()).toBe(true);

    runtime.clear();

    expect(runtime.canGoBack()).toBe(false);
    await expect(runtime.goBack(card('active'))).resolves.toBeNull();
  });
});
