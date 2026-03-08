import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiffSyncHandler } from '../RiffSyncHandler';
import type { Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';

describe('RiffSyncHandler', () => {
  const incrementalSync = vi.fn();
  const fullSync = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    incrementalSync.mockReset().mockResolvedValue({
      success: true,
      addedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
    });
    fullSync.mockReset().mockResolvedValue({
      success: true,
      addedCount: 0,
      deletedCount: 0,
      skippedCount: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes custom-riff-decks removal to full sync', async () => {
    const handler = new RiffSyncHandler({ incrementalSync, fullSync } as any);
    const transactions: Transaction[] = [{
      doOperations: [{
        action: 'updateAttrs',
        id: 'block-1',
        data: {
          old: { 'custom-riff-decks': 'deck-a' },
          new: { 'custom-riff-decks': '' },
        },
      }],
      undoOperations: null,
    }];

    handler.handle(transactions);
    await vi.advanceTimersByTimeAsync(800);

    expect(fullSync).toHaveBeenCalledTimes(1);
    expect(incrementalSync).not.toHaveBeenCalled();
    handler.dispose();
  });

  it('keeps full sync when remove and add transactions are merged during debounce', async () => {
    const handler = new RiffSyncHandler({ incrementalSync, fullSync } as any);

    handler.handle([{
      doOperations: [{ action: 'removeFlashcards', id: 'block-remove', data: {} }],
      undoOperations: null,
    }]);
    handler.handle([{
      doOperations: [{ action: 'addFlashcards', id: 'block-add', data: {} }],
      undoOperations: null,
    }]);

    await vi.advanceTimersByTimeAsync(800);

    expect(fullSync).toHaveBeenCalledTimes(1);
    expect(incrementalSync).not.toHaveBeenCalled();
    handler.dispose();
  });
});
