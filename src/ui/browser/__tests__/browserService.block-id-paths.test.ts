import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  batchDelete,
  clearGlobalBrowserContext,
  invalidateCardCache,
  loadQueueCards,
  setGlobalBrowserContext,
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
  return {
    ATTR_CARD_ID: 'custom-riff-card-id',
    ATTR_PRIORITY: 'custom-riff-priority',
    ATTR_SUSPENDED: 'custom-riff-suspended',
    ATTR_CARD_TYPE: 'custom-riff-card-type',
    ATTR_A_FACTOR: 'custom-riff-a-factor',
    sql: vi.fn(async (stmt: string) => {
      if (stmt.includes('FROM blocks')) {
        return [{ id: 'block-a', root_id: 'doc-a', ial: '', type: 'p', content: 'Alpha block' }];
      }
      return [];
    }),
    pushMsg: vi.fn(),
    pushErrMsg: vi.fn(),
    setBlockAttrs: vi.fn(),
  };
}

describe('browserService block-id paths', () => {
  afterEach(() => {
    invalidateCardCache();
    clearGlobalBrowserContext();
    vi.restoreAllMocks();
  });

  it('loadQueueCards scopes manager.getCards by blockIds', async () => {
    const siyuanApi = createSiyuanApi();
    const manager = {
      getCards: vi.fn().mockResolvedValue([makeFsrsCard('card-a', 'block-a')]),
    };
    setGlobalBrowserContext(manager as any, '', siyuanApi as any);

    const rows = await loadQueueCards(['block-a'], '', manager as any);

    expect(manager.getCards).toHaveBeenCalledTimes(1);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: ['block-a'] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.blockId).toBe('block-a');
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
});
