import { describe, expect, it, vi } from 'vitest';
import { FinalDrillV2Session } from '../sessions/FinalDrillV2Session';

function createQueue(items: any[]) {
  const remove = vi.fn(async (removedItems: any[]) => {
    for (const removed of removedItems) {
      const index = items.findIndex((item) => item.id === removed.id);
      if (index >= 0) {
        items.splice(index, 1);
      }
    }
    return removedItems.length;
  });
  const insertAt = vi.fn(async (insertedItems: any[], index: number) => {
    items.splice(index, 0, ...insertedItems);
  });
  return {
    queue: {
      getAllCards: vi.fn(async () => items.slice()),
      getRemovableTrait: () => ({ remove }),
      getMutableTrait: () => ({ insertAt }),
    },
    remove,
    insertAt,
    items,
  };
}

function createItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    cardID: 'card-1',
    deckID: 'deck-1',
    ...overrides,
  };
}

describe('FinalDrillV2Session local-only feedback', () => {
  it('removes easy cards and advances local progress without a Native Riff bridge', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const session = new FinalDrillV2Session({
      queue: queue.queue,
    });

    await session.init();
    await session.onFeedback(item as any, { action: 'rate', rating: 4 } as any);

    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(session.getProgress()).toMatchObject({
      answered: 1,
      correct: 1,
    });
  });

  it('rotates difficult cards and advances only local progress', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const session = new FinalDrillV2Session({
      queue: queue.queue,
    });

    await session.init();
    await session.onFeedback(item as any, { action: 'rate', rating: 2 } as any);

    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(queue.insertAt).toHaveBeenCalledWith([item], 0);
    expect(session.getProgress()).toMatchObject({
      answered: 1,
      correct: 0,
    });
  });

  it('rotates skipped cards locally', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const session = new FinalDrillV2Session({
      queue: queue.queue,
    });

    await session.init();
    await session.onFeedback(item as any, { action: 'skip' } as any);

    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(queue.insertAt).toHaveBeenCalledWith([item], 0);
  });
});
