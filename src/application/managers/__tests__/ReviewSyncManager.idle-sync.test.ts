import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ReviewSyncManager } from '../ReviewSyncManager';

function createManager(config?: ConstructorParameters<typeof ReviewSyncManager>[1]) {
  const publish = vi.fn(async () => undefined);
  const manager = new ReviewSyncManager({ publish } as never, config);
  return { manager, publish };
}

describe('ReviewSyncManager passive Native Riff retirement', () => {
  it('publishes review completion without a Native Riff dependency', async () => {
    const { manager, publish } = createManager();

    manager.onDataChanged({
      type: 'card-updated',
      cardIds: ['card-1'],
      timestamp: 1,
    });
    await manager.onReviewCompleted();

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('refreshes local observers on dialog close without external sync', async () => {
    const { manager } = createManager();
    const notifyObservers = vi.fn();
    manager.setUnifiedDataSourceManager({ notifyObservers } as never);
    manager.onDataChanged({
      type: 'card-updated',
      cardIds: ['card-1'],
      timestamp: 1,
    });

    await manager.onDialogClose();

    expect(notifyObservers).toHaveBeenCalledWith({
      type: 'mode-switched',
      timestamp: expect.any(Number),
    });
  });

  it('contains no XiuyuanSyncService or incremental sync call', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/application/managers/ReviewSyncManager.ts'),
      'utf8',
    );

    expect(source).not.toContain('XiuyuanSyncService');
    expect(source).not.toContain('incrementalSync');
    expect(source).not.toContain('autoSync');
  });
});
