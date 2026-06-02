import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { FilterGroupQueue } from '../FilterGroupQueue';
import type { QueuePersistencePort } from '../ports';
import { QueueType } from '@/types/unified-data-source';

function createCard(id: string, blockId: string): FSRSCard {
  const now = Date.now();
  return {
    id,
    xiuyuanID: `xy-${id}`,
    blockId,
    due: now + 60_000,
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 120_000,
    updatedAt: now - 60_000,
  };
}

function createPersistenceStub(): QueuePersistencePort {
  return {
    get: vi.fn(() => null),
    set: vi.fn(async () => undefined),
  };
}

function createManager(cards: FSRSCard[]) {
  const cardMap = new Map(cards.map((card) => [card.id, { ...card }]));
  return {
    getCard: vi.fn(async (cardId: string) => {
      const card = cardMap.get(cardId);
      if (!card) {
        throw new Error(`Missing card ${cardId}`);
      }
      return { ...card };
    }),
    getCards: vi.fn(async (filter?: { blockIds?: string[] }) => {
      const blockIds = Array.isArray(filter?.blockIds) ? new Set(filter.blockIds) : null;
      return cards
        .filter((card) => !blockIds || blockIds.has(card.blockId))
        .map((card) => ({ ...card }));
    }),
    notifyObservers: vi.fn(),
    getPriorityRandomness: vi.fn(() => 0),
    getAutoSortEnabled: vi.fn(() => true),
    getAddToOutstandingEveryNth: vi.fn(() => 2),
    getDayStartHour: vi.fn(() => 4),
  };
}

describe('FilterGroupQueue session transfer', () => {
  it('declares submitted Browser reads as backend projection backed', () => {
    const queue = new FilterGroupQueue(createManager([]) as never, createPersistenceStub());

    expect(queue.getProjectionReadMode()).toBe('backend-projection');
  });

  it('emits a full-refresh queue-changed event only for rebuilds after filter updates', async () => {
    const card1 = createCard('card-1', 'block-1');
    const manager = createManager([card1]);
    const queue = new FilterGroupQueue(manager as never, createPersistenceStub());

    await queue.setFilter({
      blockIds: ['block-1'],
    });
    await queue.rebuild();

    expect(manager.notifyObservers).toHaveBeenCalledWith(expect.objectContaining({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      requiresFullRefresh: true,
    }));

    vi.mocked(manager.notifyObservers).mockClear();

    await queue.rebuild();

    expect(manager.notifyObservers).toHaveBeenCalledWith(expect.objectContaining({
      type: 'queue-changed',
      queueType: QueueType.FilterGroup,
      requiresFullRefresh: undefined,
    }));
  });

  it('serializes and restores filter session state with the same visible order', async () => {
    const card1 = createCard('card-1', 'block-1');
    const card2 = createCard('card-2', 'block-2');
    const manualCard = createCard('manual-1', 'block-manual');
    const manager = createManager([card1, card2, manualCard]);
    const queue = new FilterGroupQueue(manager as never, createPersistenceStub());

    await queue.setFilter({
      blockIds: ['block-1', 'block-2'],
      scopeDocIds: ['doc-1'],
      cardType: 'item',
    });
    await queue.getCards();
    await queue.skip(card1.id);
    await queue.addCard(manualCard);
    await queue.removeCard(card2.id);

    const visibleBefore = await queue.getCards();
    const snapshot = queue.serializeSessionSnapshot();

    const restoredQueue = new FilterGroupQueue(manager as never, createPersistenceStub());
    restoredQueue.restoreSessionSnapshot(snapshot);

    expect(restoredQueue.getFilter()).toEqual(expect.objectContaining({
      blockIds: ['block-1', 'block-2'],
      scopeDocIds: ['doc-1'],
      cardType: 'item',
    }));

    const visibleAfter = await restoredQueue.getCards();
    expect(visibleAfter.map((card) => card.id)).toEqual(visibleBefore.map((card) => card.id));
    expect(restoredQueue.serializeSessionSnapshot()).toEqual(expect.objectContaining({
      rollbackSnapshot: expect.objectContaining({
        temporaryBlacklist: snapshot.rollbackSnapshot.temporaryBlacklist,
        manualCards: snapshot.rollbackSnapshot.manualCards,
      }),
      visibleCardIds: snapshot.visibleCardIds,
    }));
  });
});
