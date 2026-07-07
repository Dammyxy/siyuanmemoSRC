import { describe, expect, it, vi } from 'vitest';
import { ReviewSyncManager } from '../ReviewSyncManager';

function createManager(config?: ConstructorParameters<typeof ReviewSyncManager>[2]) {
  const incrementalSync = vi.fn(async () => ({ success: true }));
  const publish = vi.fn(async () => undefined);
  const manager = new ReviewSyncManager(
    { incrementalSync } as never,
    { publish } as never,
    config,
  );
  return { manager, incrementalSync, publish };
}

describe('ReviewSyncManager legacy Xiuyuan idle sync policy', () => {
  it('keeps legacy review completion Xiuyuan sync non-persistent when idle', async () => {
    const { manager, incrementalSync } = createManager();

    await manager.onReviewCompleted();

    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      source: 'review-completed',
      persistIdleCheckpoint: false,
    });
  });

  it('keeps the legacy dialog-close Xiuyuan hook persistent when called directly', async () => {
    const { manager, incrementalSync } = createManager();
    manager.onDataChanged({
      type: 'card-updated',
      cardIds: ['card-1'],
      timestamp: 1,
    });

    await manager.onDialogClose();

    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      source: 'review-dialog-close',
      persistIdleCheckpoint: true,
    });
  });

  it('keeps legacy auto Xiuyuan sync non-persistent when idle', async () => {
    const { manager, incrementalSync } = createManager({ autoSyncCardInterval: 1 });

    manager.onDataChanged({
      type: 'card-updated',
      cardIds: ['card-1'],
      timestamp: 1,
    });

    await vi.waitFor(() => {
      expect(incrementalSync).toHaveBeenCalledWith(undefined, {
        source: 'review-auto',
        persistIdleCheckpoint: false,
      });
    });
  });
});
