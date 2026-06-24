import { describe, expect, it, vi } from 'vitest';
import { deleteBrowserCards } from '../DataSourceUtils';

describe('deleteBrowserCards', () => {
  it('uses manager batchDeleteCards once when available', async () => {
    const manager = {
      batchDeleteCards: vi.fn(async (cardIds: string[]) => ({
        attemptedCount: cardIds.length,
        deletedCount: cardIds.length,
        deletedCardIds: cardIds,
        failedCardIds: [],
      })),
      deleteCard: vi.fn(),
    };
    const rows = [
      { id: 'riff-1', fsrsCardId: 'card-1', blockId: 'block-1' },
      { id: 'card-2', blockId: 'block-2' },
      { id: 'riff-1', fsrsCardId: 'card-1', blockId: 'block-1' },
    ];

    const result = await deleteBrowserCards(manager, rows as never[], {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.batchDeleteCards).toHaveBeenCalledTimes(1);
    expect(manager.batchDeleteCards).toHaveBeenCalledWith(['card-1', 'card-2'], {
      blockIds: ['block-1', 'block-2'],
    });
    expect(manager.deleteCard).not.toHaveBeenCalled();
    expect(result).toEqual({
      attemptedCount: 2,
      deletedCount: 2,
      deletedCardIds: ['card-1', 'card-2'],
      failedCardIds: [],
    });
  });

  it('passes explicit cardId instead of projection row id to batch delete', async () => {
    const manager = {
      batchDeleteCards: vi.fn(async (cardIds: string[]) => ({
        attemptedCount: cardIds.length,
        deletedCount: cardIds.length,
        deletedCardIds: cardIds,
        failedCardIds: [],
      })),
    };
    const rows = [
      { id: 'projection-row-1', cardId: 'card-1', blockId: 'block-1' },
      { id: 'projection-row-2', cardId: 'card-2', blockId: 'block-2' },
    ];

    const result = await deleteBrowserCards(manager, rows as never[], {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.batchDeleteCards).toHaveBeenCalledWith(['card-1', 'card-2'], {
      blockIds: ['block-1', 'block-2'],
    });
    expect(result.deletedCardIds).toEqual(['card-1', 'card-2']);
  });

  it('routes exact browser card ids through the unified manager delete path', async () => {
    const manager = {
      deleteCard: vi.fn(async (cardId: string) => {
        if (cardId === 'card-fail') {
          throw new Error('delete failed');
        }
      }),
    };
    const rows = [
      { id: 'riff-1', fsrsCardId: 'card-1', blockId: 'block-1' },
      { id: 'card-fail', blockId: 'block-2' },
      { id: 'riff-1', fsrsCardId: 'card-1', blockId: 'block-1' },
    ];

    const result = await deleteBrowserCards(manager, rows as never[], {
      scope: 'DataSourceUtilsTest',
    });

    expect(manager.deleteCard).toHaveBeenCalledTimes(2);
    expect(manager.deleteCard).toHaveBeenNthCalledWith(1, 'card-1');
    expect(manager.deleteCard).toHaveBeenNthCalledWith(2, 'card-fail');
    expect(result).toEqual({
      attemptedCount: 2,
      deletedCount: 1,
      deletedCardIds: ['card-1'],
      failedCardIds: ['card-fail'],
    });
  });

  it('reports all resolved card ids as failed when unified delete is unavailable', async () => {
    const result = await deleteBrowserCards(undefined, [
      { id: 'card-1', blockId: 'block-1' },
      { id: 'card-2', blockId: 'block-2' },
    ] as never[], {
      scope: 'DataSourceUtilsTest',
    });

    expect(result).toEqual({
      attemptedCount: 2,
      deletedCount: 0,
      deletedCardIds: [],
      failedCardIds: ['card-1', 'card-2'],
    });
  });
});
