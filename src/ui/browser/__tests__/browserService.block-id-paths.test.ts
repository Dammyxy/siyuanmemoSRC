import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  batchSuspend,
  batchDelete,
  invalidateCardCache,
  loadBrowserCardsByBlockIds,
  loadQueueCards,
} from '../browserService';

function makeFsrsCard(id: string, blockId: string) {
  return {
    id,
    blockId,
    state: 0,
    due: Date.now(),
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    lastReview: 0,
    scheduledDays: 0,
    type: 'concept',
    meta: {
      content: `${blockId}-content`,
      deckId: 'deck-a',
      rootId: 'doc-a',
    },
  } as any;
}

function createSiyuanApi() {
  const blockInfoRows = [{ id: 'block-a', root_id: 'doc-a', ial: '', type: 'p', content: 'Alpha block' }];
  return {
    ATTR_CARD_ID: 'custom-riff-card-id',
    ATTR_PRIORITY: 'custom-riff-priority',
    ATTR_SUSPENDED: 'custom-riff-suspended',
    ATTR_CARD_TYPE: 'custom-riff-card-type',
    ATTR_A_FACTOR: 'custom-riff-a-factor',
    sql: vi.fn(async (stmt: string) => {
      if (stmt.includes('FROM blocks')) {
        return blockInfoRows;
      }
      return [];
    }),
    getBlockAttrs: vi.fn(async () => ({})),
    getBlockInfoRowsByIds: vi.fn(async () => blockInfoRows),
    getBlockAttributeRowsByIds: vi.fn(async () => []),
    getDocTreeRowsByIds: vi.fn(async () => []),
    getBlockMeta: vi.fn(async () => null),
    pushMsg: vi.fn(),
    pushErrMsg: vi.fn(),
    setBlockAttrs: vi.fn(),
  };
}

describe('browserService block-id paths', () => {
  afterEach(() => {
    invalidateCardCache();
    vi.restoreAllMocks();
  });

  it('loadQueueCards scopes manager.getCards by blockIds', async () => {
    const siyuanApi = createSiyuanApi();
    const manager = {
      getCards: vi.fn().mockResolvedValue([makeFsrsCard('card-a', 'block-a')]),
    };

    const rows = await loadQueueCards(['block-a'], '', manager as any, siyuanApi as any);

    expect(manager.getCards).toHaveBeenCalledTimes(1);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a'] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.blockId).toBe('block-a');
  });

  it('loadBrowserCardsByBlockIds preserves multiple cards from the same block', async () => {
    const siyuanApi = createSiyuanApi();
    const manager = {
      getCards: vi.fn().mockResolvedValue([
        makeFsrsCard('card-a', 'block-a'),
        makeFsrsCard('card-b', 'block-a'),
      ]),
    };

    const rows = await loadBrowserCardsByBlockIds(['block-a'], {
      manager: manager as any,
      siyuanApi: siyuanApi as any,
      applyQueryFilter: false,
    });

    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a'] });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-a', 'card-b']);
    expect(rows.every((row) => row.blockId === 'block-a')).toBe(true);
  });

  it('loadBrowserCardsByBlockIds creates explicit virtual rows for source blocks without cards', async () => {
    const siyuanApi = createSiyuanApi();
    const manager = {
      getCards: vi.fn().mockResolvedValue([]),
    };

    const rows = await loadBrowserCardsByBlockIds(['block-a'], {
      manager: manager as any,
      siyuanApi: siyuanApi as any,
      applyQueryFilter: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'block-a',
      fsrsCardId: 'block-a',
      blockId: 'block-a',
      rootId: 'doc-a',
      content: 'Alpha block',
      fullContent: 'Alpha block',
      dueFormatted: '-',
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      scheduledDays: 0,
      priority: 50,
      cardType: 'concept',
    });
    expect(rows[0]?.meta).toMatchObject({
      content: 'Alpha block',
      rootId: 'doc-a',
    });
  });

  it('batchDelete builds block card map with scoped manager.getCards', async () => {
    const manager = {
      getCards: vi.fn().mockResolvedValue([
        makeFsrsCard('card-a', 'block-a'),
        makeFsrsCard('card-b', 'block-b'),
      ]),
      deleteCard: vi.fn().mockResolvedValue(undefined),
      updateCard: vi.fn(),
    };

    const deletedBlocks = await batchDelete(['block-a', 'block-b'], manager as any);

    expect(deletedBlocks).toBe(2);
    expect(manager.getCards).toHaveBeenCalledTimes(1);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a', 'block-b'] });
    expect(manager.deleteCard).toHaveBeenCalledTimes(2);
    expect(manager.deleteCard).toHaveBeenNthCalledWith(1, 'card-a');
    expect(manager.deleteCard).toHaveBeenNthCalledWith(2, 'card-b');
  });

  it('batchDelete uses manager.batchDeleteCards once when available', async () => {
    const manager = {
      getCards: vi.fn().mockResolvedValue([
        makeFsrsCard('card-a', 'block-a'),
        makeFsrsCard('card-b', 'block-b'),
      ]),
      deleteCard: vi.fn(),
      batchDeleteCards: vi.fn().mockResolvedValue({
        attemptedCount: 2,
        deletedCount: 2,
        deletedCardIds: ['card-a', 'card-b'],
        failedCardIds: [],
      }),
      updateCard: vi.fn(),
    };

    const deletedBlocks = await batchDelete(['block-a', 'block-b'], manager as any);

    expect(deletedBlocks).toBe(2);
    expect(manager.batchDeleteCards).toHaveBeenCalledTimes(1);
    expect(manager.batchDeleteCards).toHaveBeenCalledWith(['card-a', 'card-b'], {
      blockIds: ['block-a', 'block-b'],
    });
    expect(manager.deleteCard).not.toHaveBeenCalled();
  });

  it('batchSuspend updates storage only and does not write suspended block attrs', async () => {
    const siyuanApi = createSiyuanApi();
    const manager = {
      getCards: vi.fn().mockResolvedValue([makeFsrsCard('card-a', 'block-a')]),
      deleteCard: vi.fn(),
      updateCard: vi.fn().mockResolvedValue(undefined),
    };

    const updatedBlocks = await batchSuspend(['block-a'], true, manager as any);

    expect(updatedBlocks).toBe(1);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a'] });
    expect(manager.updateCard).toHaveBeenCalledTimes(1);
    expect(siyuanApi.setBlockAttrs).not.toHaveBeenCalled();
  });

  it('batchSuspend uses manager.batchUpdateCards once when available', async () => {
    const manager = {
      getCards: vi.fn().mockResolvedValue([
        makeFsrsCard('card-a', 'block-a'),
        makeFsrsCard('card-b', 'block-b'),
      ]),
      deleteCard: vi.fn(),
      updateCard: vi.fn(),
      batchUpdateCards: vi.fn().mockResolvedValue({
        attemptedCount: 2,
        updatedCount: 2,
        updatedCardIds: ['card-a', 'card-b'],
        failedCardIds: [],
      }),
    };

    const updatedBlocks = await batchSuspend(['block-a', 'block-b'], true, manager as any);

    expect(updatedBlocks).toBe(2);
    expect(manager.batchUpdateCards).toHaveBeenCalledTimes(1);
    expect(manager.batchUpdateCards.mock.calls[0]?.[0]).toHaveLength(2);
    expect(manager.updateCard).not.toHaveBeenCalled();
  });
});
