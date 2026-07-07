import { describe, expect, it, vi } from 'vitest';
import {
  adjustBrowserCardsPriorityRelative,
  removeCardsFromQueue,
  resolveQueueRemovalTarget,
  setBrowserCardsPriority,
} from '../DataSourceUtils';
import type { FSRSCard } from '@/types/card';
import type { BrowserCard } from '../../types';
import { QueueType } from '@/types/unified-data-source';

function makeCard(id: string, blockId: string, priority = 50): FSRSCard {
  return {
    id,
    blockId,
    state: 0,
    due: Date.now(),
    stability: 1,
    difficulty: 1,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: 0,
    priority,
    type: 'item',
    meta: {},
  } as FSRSCard;
}

function makeBrowserRow(index: number): BrowserCard {
  const id = `card-${index}`;
  return {
    id,
    fsrsCardId: id,
    blockId: `block-${index}`,
    deckId: 'deck',
    content: '',
    fullContent: '',
    rootId: 'doc',
    state: 0,
    stateLabel: 'New',
    due: new Date(),
    dueFormatted: '',
    stability: 1,
    difficulty: 1,
    retrievability: 0,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 0,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 50,
    suspended: false,
    tags: [],
    note: '',
    cardType: 'item',
  };
}

describe('DataSourceUtils batch actions', () => {
  it('sets priority through one batchUpdateCards call for 1k rows', async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => makeBrowserRow(index));
    const manager = {
      getCards: vi.fn(async (filter?: { blockIds?: string[] }) =>
        (filter?.blockIds || []).map((blockId) => makeCard(blockId.replace('block', 'card'), blockId))
      ),
      getCard: vi.fn(async (cardId: string) => makeCard(cardId, cardId.replace('card', 'block'))),
      updateCard: vi.fn(),
      batchUpdateCards: vi.fn(async (cards: FSRSCard[]) => ({
        attemptedCount: cards.length,
        updatedCount: cards.length,
        updatedCardIds: cards.map((card) => card.id),
        failedCardIds: [],
      })),
    };

    const result = await setBrowserCardsPriority(manager, rows, 17, {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.getCards).toHaveBeenCalledTimes(1);
    expect(manager.getCards).toHaveBeenCalledWith({
      blockIds: Array.from({ length: 1000 }, (_, index) => `block-${index}`),
    });
    expect(manager.getCard).not.toHaveBeenCalled();
    expect(manager.batchUpdateCards).toHaveBeenCalledTimes(1);
    expect(manager.batchUpdateCards.mock.calls[0]?.[0]).toHaveLength(1000);
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(result.updated).toHaveLength(1000);
    expect(result.skipped).toHaveLength(0);
    expect(rows.every((row) => row.priority === 17)).toBe(true);
  });

  it('adjusts relative priority through one batchUpdateCards call and clamps bounds', async () => {
    const rows = [makeBrowserRow(1), makeBrowserRow(2)];
    rows[0].priority = 20;
    rows[1].priority = 95;
    const manager = {
      getCards: vi.fn(async (filter?: { blockIds?: string[] }) =>
        (filter?.blockIds || []).map((blockId) => (
          blockId === 'block-1'
            ? makeCard('card-1', blockId, 20)
            : makeCard('card-2', blockId, 95)
        ))
      ),
      getCard: vi.fn(async (cardId: string) => (
        cardId === 'card-1'
          ? makeCard(cardId, 'block-1', 20)
          : makeCard(cardId, 'block-2', 95)
      )),
      updateCard: vi.fn(),
      batchUpdateCards: vi.fn(async (cards: FSRSCard[]) => ({
        attemptedCount: cards.length,
        updatedCount: cards.length,
        updatedCardIds: cards.map((card) => card.id),
        failedCardIds: [],
      })),
    };

    const result = await adjustBrowserCardsPriorityRelative(manager, rows, 10, {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.getCards).toHaveBeenCalledTimes(1);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-1', 'block-2'] });
    expect(manager.getCard).not.toHaveBeenCalled();
    expect(manager.batchUpdateCards).toHaveBeenCalledTimes(1);
    expect(manager.batchUpdateCards.mock.calls[0]?.[0].map((card) => card.priority)).toEqual([30, 100]);
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      delta: 10,
      lowerBoundReached: false,
      upperBoundReached: true,
    });
    expect(result.updated).toHaveLength(2);
    expect(rows.map((row) => row.priority)).toEqual([30, 100]);
  });

  it('falls back to per-card priority loads when bulk getCards is unavailable', async () => {
    const rows = [makeBrowserRow(1), makeBrowserRow(2)];
    const manager = {
      getCard: vi.fn(async (cardId: string) => makeCard(cardId, cardId.replace('card', 'block'))),
      updateCard: vi.fn(),
      batchUpdateCards: vi.fn(async (cards: FSRSCard[]) => ({
        attemptedCount: cards.length,
        updatedCount: cards.length,
        updatedCardIds: cards.map((card) => card.id),
        failedCardIds: [],
      })),
    };

    const result = await setBrowserCardsPriority(manager, rows, 33, {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.getCard).toHaveBeenCalledTimes(2);
    expect(manager.batchUpdateCards).toHaveBeenCalledTimes(1);
    expect(result.updated).toHaveLength(2);
    expect(rows.map((row) => row.priority)).toEqual([33, 33]);
  });

  it('fails priority updates closed when bulk getCards is present but fails', async () => {
    const rows = [makeBrowserRow(1), makeBrowserRow(2)];
    const manager = {
      getCards: vi.fn(async () => {
        throw new Error('bulk read unavailable');
      }),
      getCard: vi.fn(async (cardId: string) => makeCard(cardId, cardId.replace('card', 'block'))),
      updateCard: vi.fn(),
      batchUpdateCards: vi.fn(async (cards: FSRSCard[]) => ({
        attemptedCount: cards.length,
        updatedCount: cards.length,
        updatedCardIds: cards.map((card) => card.id),
        failedCardIds: [],
      })),
    };

    const result = await setBrowserCardsPriority(manager, rows, 44, {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.getCards).toHaveBeenCalledTimes(1);
    expect(manager.getCard).not.toHaveBeenCalled();
    expect(manager.batchUpdateCards).not.toHaveBeenCalled();
    expect(result.updated).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(rows.map((row) => row.priority)).toEqual([50, 50]);
  });

  it('removes selected queue rows through one removeCards call', async () => {
    const queue = {
      removeCards: vi.fn(async (ids: string[]) => ({
        attemptedCount: ids.length,
        changedCount: ids.length,
        failedIds: [],
      })),
      removeCard: vi.fn(),
    };
    const rows = [
      { id: 'card-1', blockId: 'block-1' },
      { id: 'card-2', blockId: 'block-2' },
      { id: 'card-1', blockId: 'block-1' },
    ];

    const result = await removeCardsFromQueue(queue, rows as never[], {
      scope: 'DataSourceUtilsTest',
    });

    expect(queue.removeCards).toHaveBeenCalledTimes(1);
    expect(queue.removeCards).toHaveBeenCalledWith(['card-1', 'card-2']);
    expect(queue.removeCard).not.toHaveBeenCalled();
    expect(result).toEqual({
      removedCount: 2,
      failedCount: 0,
      failedIds: [],
    });
  });

  it('adapts queue removal to the manager batch command without reading a live queue', async () => {
    const manager = {
      batchRemoveFromQueue: vi.fn(async (_queueType: QueueType, ids: string[]) => ({
        attemptedCount: ids.length,
        changedCount: ids.length,
        failedIds: [],
      })),
      getQueue: vi.fn(() => {
        throw new Error('live queue should not be read');
      }),
    };

    const target = resolveQueueRemovalTarget(manager as never, QueueType.IncrementalLearning);
    const result = await removeCardsFromQueue(target, [
      { id: 'card-1', blockId: 'block-1' },
      { id: 'card-2', blockId: 'block-2' },
    ] as never[], {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.batchRemoveFromQueue).toHaveBeenCalledWith(QueueType.IncrementalLearning, ['card-1', 'card-2']);
    expect(manager.getQueue).not.toHaveBeenCalled();
    expect(result).toEqual({
      removedCount: 2,
      failedCount: 0,
      failedIds: [],
    });
  });

  it('does not fall back to a live queue when manager batch removal is missing', () => {
    const manager = {
      getQueue: vi.fn(() => {
        throw new Error('live queue should not be read');
      }),
    };

    const target = resolveQueueRemovalTarget(manager as never, QueueType.IncrementalLearning);

    expect(target).toBeNull();
    expect(manager.getQueue).not.toHaveBeenCalled();
  });
});
