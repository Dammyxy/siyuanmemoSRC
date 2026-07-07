import { describe, expect, it, vi } from 'vitest';
import { addToQueue, adjustTime, buildAddToQueueAction, QUEUE_ADD_ROUTES } from '../MenuActions';
import type { BrowserCard } from '../../types';

function createBrowserCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? 'card-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.8,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note ?? '',
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

describe('MenuActions.addToQueue neural-roam', () => {
  it('shows one visible add action per SRS queue while keeping legacy route ids accepted', () => {
    const action = buildAddToQueueAction({
      retrieval: true,
      incremental: true,
      finalDrill: false,
      filterGroup: false,
      neuralRoam: false,
    });

    expect(action?.submenu?.map((item) => item.id)).toEqual([
      'add-to-retrieval-queue',
      'add-to-incremental-queue',
    ]);
    expect(QUEUE_ADD_ROUTES['add-to-retrieval-queue-all']).toMatchObject({
      queueType: QUEUE_ADD_ROUTES['add-to-retrieval-queue'].queueType,
      actionType: 'retrieval',
    });
    expect(QUEUE_ADD_ROUTES['add-to-retrieval-queue-all'].source).toBeUndefined();
    expect(QUEUE_ADD_ROUTES['add-to-incremental-queue-all']).toMatchObject({
      queueType: QUEUE_ADD_ROUTES['add-to-incremental-queue'].queueType,
      actionType: 'incremental',
    });
    expect(QUEUE_ADD_ROUTES['add-to-incremental-queue-all'].source).toBeUndefined();
  });

  it('uses addCards once for large browser selections', async () => {
    const queue = {
      addCards: vi.fn(async (cards: unknown[]) => ({
        attemptedCount: cards.length,
        changedCount: cards.length,
        failedIds: [],
      })),
      addCard: vi.fn(),
    };
    const selectedRows: BrowserCard[] = Array.from({ length: 1000 }, (_, index) =>
      createBrowserCard({
        id: `card-${index}`,
        blockId: `block-${index}`,
        cardType: 'item',
      })
    );

    const result = await addToQueue(queue, selectedRows, 'final-drill', 'manual');

    expect(result.added).toBe(1000);
    expect(queue.addCards).toHaveBeenCalledTimes(1);
    expect(queue.addCards.mock.calls[0]?.[0]).toHaveLength(1000);
    expect(queue.addCard).not.toHaveBeenCalled();
  });

  it('passes trusted concept ids to the shared current-route add service', async () => {
    const queue = {
      addConceptBlocksToCurrentRoute: vi.fn(async () => ({
        added: 1,
        message: '已将 1 张 Concept 卡片加入神经漫游当前航线',
      })),
    };
    const selectedRows: BrowserCard[] = [
      createBrowserCard({
        id: 'card-1',
        blockId: 'block-1',
        cardType: 'concept',
      }),
    ];

    const result = await addToQueue(queue, selectedRows, 'neural-roam', 'manual');

    expect(result.added).toBe(1);
    expect(queue.addConceptBlocksToCurrentRoute).toHaveBeenCalledWith(['block-1'], {
      source: 'manual',
      enabled: true,
    });
  });

  it('returns current-route unavailable when the shared service is missing', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
    };
    const selectedRows: BrowserCard[] = [
      createBrowserCard({
        id: 'card-2',
        blockId: 'block-2',
        cardType: 'item',
      }),
    ];

    const result = await addToQueue(queue, selectedRows, 'neural-roam', 'manual');

    expect(result.added).toBe(0);
    expect(queue.addCard).not.toHaveBeenCalled();
    expect(result.message).toBe('神经漫游当前航线不可用');
  });

  it('loads reschedule cards through one block-id batch lookup for large selections', async () => {
    const selectedRows: BrowserCard[] = Array.from({ length: 1000 }, (_, index) =>
      createBrowserCard({
        id: `card-${index}`,
        blockId: `block-${index}`,
      })
    );
    const storage = {
      getCardsByBlockIds: vi.fn((blockIds: string[]) =>
        blockIds.map((blockId) => ({
          id: blockId.replace('block', 'card'),
          blockId,
        }))
      ),
      getCardsByBlockId: vi.fn(() => {
        throw new Error('per-block lookup should not run');
      }),
      getAllCards: vi.fn(() => []),
    };
    const service = {
      postponeWithConfig: vi.fn(async (cards: unknown[]) => ({
        updated: cards.length,
        skipped: 0,
        skippedReasons: {},
      })),
      advanceWithConfig: vi.fn(),
      spreadWithConfig: vi.fn(),
    };
    const plugin = {
      context: {
        getUnifiedStorage: () => storage,
        getRescheduleService: () => service,
      },
    };

    const result = await adjustTime(plugin, selectedRows, 'postpone', {
      config: { minInterval: 3, maxInterval: 3 },
    });

    expect(storage.getCardsByBlockIds).toHaveBeenCalledTimes(1);
    expect(storage.getCardsByBlockIds).toHaveBeenCalledWith(
      Array.from({ length: 1000 }, (_, index) => `block-${index}`)
    );
    expect(storage.getCardsByBlockId).not.toHaveBeenCalled();
    expect(service.postponeWithConfig).toHaveBeenCalledTimes(1);
    expect(service.postponeWithConfig.mock.calls[0]?.[0]).toHaveLength(1000);
    expect(result).toMatchObject({
      updated: 1000,
      skipped: 0,
    });
  });
});
