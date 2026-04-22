import { describe, expect, it, vi } from 'vitest';
import { deleteBrowserCards } from '../DataSourceUtils';

describe('deleteBrowserCards', () => {
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
