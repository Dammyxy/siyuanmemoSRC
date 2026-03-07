import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard, type Rating } from '@/types/card';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { ReviewApplicationService } from '../ReviewApplicationService';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now,
    stability: 2,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 1000,
    updatedAt: now - 500,
    ...overrides,
  };
}

describe('ReviewApplicationService reschedule queue membership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T10:00:00+08:00'));
  });

  it('removes manually inserted cards from both due queues when rescheduled to a future day', async () => {
    const card = createCard();
    const retrievalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => true),
    };
    const incrementalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => true),
    };
    const manager = {
      getCard: vi.fn(async () => card),
      updateCard: vi.fn(async () => {}),
      getQueue: vi.fn((queueType: QueueType) => {
        if (queueType === QueueType.RetrievalPractice) {
          return retrievalQueue;
        }
        if (queueType === QueueType.IncrementalLearning) {
          return incrementalQueue;
        }
        throw new Error(`Unexpected queue type: ${queueType}`);
      }),
    } as unknown as IUnifiedDataSourceManagerFacade;

    const schedulerRouter = {
      route: vi.fn(async (_card: FSRSCard, _rating: Rating) => card),
    } as never;
    const service = new ReviewApplicationService(manager, schedulerRouter);
    const dueTimestamp = new Date('2026-03-14T12:00:00+08:00').getTime();

    const updated = await service.rescheduleCard(card.id, {
      mode: 'direct',
      dueTimestamp,
    });

    expect(updated.due).toBe(dueTimestamp);
    expect(manager.updateCard).toHaveBeenCalledWith(expect.objectContaining({ due: dueTimestamp }));
    expect(retrievalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id, due: dueTimestamp }),
    );
    expect(incrementalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id, due: dueTimestamp }),
    );
  });

  it('keeps retrieval membership intact for cards still due later today, but removes incremental membership', async () => {
    const card = createCard();
    const retrievalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => false),
    };
    const incrementalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => true),
    };
    const manager = {
      getCard: vi.fn(async () => card),
      updateCard: vi.fn(async () => {}),
      getQueue: vi.fn((queueType: QueueType) => {
        if (queueType === QueueType.RetrievalPractice) {
          return retrievalQueue;
        }
        if (queueType === QueueType.IncrementalLearning) {
          return incrementalQueue;
        }
        throw new Error(`Unexpected queue type: ${queueType}`);
      }),
    } as unknown as IUnifiedDataSourceManagerFacade;

    const schedulerRouter = {
      route: vi.fn(async (_card: FSRSCard, _rating: Rating) => card),
    } as never;
    const service = new ReviewApplicationService(manager, schedulerRouter);
    const dueTimestamp = new Date('2026-03-07T23:00:00+08:00').getTime();

    await service.rescheduleCard(card.id, {
      mode: 'direct',
      dueTimestamp,
    });

    expect(retrievalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ due: dueTimestamp }),
    );
    expect(incrementalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ due: dueTimestamp }),
    );
  });
});
