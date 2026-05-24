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

function createSiyuanApi(overrides: Record<string, unknown> = {}) {
  return {
    reviewRiffCard: vi.fn(async () => undefined),
    skipReviewRiffCard: vi.fn(async () => undefined),
    pushErrMsg: vi.fn(async () => undefined),
    ...overrides,
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

describe('FinalDrillV2Session current Riff feedback path', () => {
  it('rates native Riff cards through the current ReviewSiyuanPort path', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const siyuanApi = createSiyuanApi();
    const session = new FinalDrillV2Session({
      queue: queue.queue,
      siyuanApi,
    });

    await session.init();
    await session.onFeedback(item, { action: 'rate', rating: 4 } as any);

    expect(siyuanApi.reviewRiffCard).toHaveBeenCalledWith('deck-1', 'card-1', 4);
    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(siyuanApi.pushErrMsg).not.toHaveBeenCalled();
    expect(session.getProgress()).toMatchObject({
      answered: 1,
      correct: 1,
    });
  });

  it('pushes the current explicit error when native Riff rating fails', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const siyuanApi = createSiyuanApi({
      reviewRiffCard: vi.fn(async () => {
        throw new Error('native riff unavailable');
      }),
    });
    const session = new FinalDrillV2Session({
      queue: queue.queue,
      siyuanApi,
      i18n: {
        drillFailed: 'Final drill operation failed',
      },
    });

    await session.init();
    await session.onFeedback(item, { action: 'rate', rating: 4 } as any);

    expect(siyuanApi.reviewRiffCard).toHaveBeenCalledWith('deck-1', 'card-1', 4);
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('Final drill operation failed');
    expect(queue.remove).toHaveBeenCalledWith([item]);
  });

  it('skips native Riff cards through the current ReviewSiyuanPort path', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const siyuanApi = createSiyuanApi();
    const session = new FinalDrillV2Session({
      queue: queue.queue,
      siyuanApi,
    });

    await session.init();
    await session.onFeedback(item, { action: 'skip' } as any);

    expect(siyuanApi.skipReviewRiffCard).toHaveBeenCalledWith('deck-1', 'card-1');
    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(queue.insertAt).toHaveBeenCalledWith([item], 0);
  });
});
