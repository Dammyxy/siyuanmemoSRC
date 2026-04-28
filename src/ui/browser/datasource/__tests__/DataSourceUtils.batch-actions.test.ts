import { describe, expect, it, vi } from 'vitest';
import { removeCardsFromQueue, setBrowserCardsPriority } from '../DataSourceUtils';
import type { FSRSCard } from '@/types/card';
import type { BrowserCard } from '../../types';

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

    expect(manager.getCard).toHaveBeenCalledTimes(1000);
    expect(manager.batchUpdateCards).toHaveBeenCalledTimes(1);
    expect(manager.batchUpdateCards.mock.calls[0]?.[0]).toHaveLength(1000);
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(result.updated).toHaveLength(1000);
    expect(result.skipped).toHaveLength(0);
    expect(rows.every((row) => row.priority === 17)).toBe(true);
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
});
