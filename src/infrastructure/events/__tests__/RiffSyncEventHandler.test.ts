import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardDeletedEvent } from '@/core/xiuyuan/domain/events/CardDeletedEvent';
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import { RiffSyncEventHandler } from '../RiffSyncEventHandler';

function createSyncServiceMock() {
  return {
    deleteSync: vi.fn(async () => true),
    deleteSyncBatch: vi.fn(async (blockIds: string[]) => blockIds.length),
  };
}

describe('RiffSyncEventHandler', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus(false);
  });

  afterEach(() => {
    eventBus.clear();
    vi.clearAllMocks();
  });

  it('keeps local delete events from hard-deleting native Riff cards by default', async () => {
    const syncService = createSyncServiceMock();
    new RiffSyncEventHandler(eventBus, syncService as never);

    await eventBus.publish(new CardDeletedEvent('xy-1', 'card-1', 'block-1'));
    await eventBus.publish(new CardsDeletedEvent('batch-delete', ['card-2'], ['block-2']));

    expect(syncService.deleteSync).not.toHaveBeenCalled();
    expect(syncService.deleteSyncBatch).not.toHaveBeenCalled();
  });

  it('rejects native-hard-delete intent without dangerous confirmation or ownership proof', async () => {
    const syncService = createSyncServiceMock();
    new RiffSyncEventHandler(eventBus, syncService as never);

    await eventBus.publish(new CardDeletedEvent('xy-1', 'card-1', 'block-1', 'native-hard-delete'));
    await eventBus.publish(new CardsDeletedEvent(
      'batch-delete',
      ['card-2', 'card-3'],
      ['block-2', 'block-3'],
      'native-hard-delete',
    ));

    expect(syncService.deleteSync).not.toHaveBeenCalled();
    expect(syncService.deleteSyncBatch).not.toHaveBeenCalled();
  });

  it('hard-deletes native Riff cards only for confirmed native-hard-delete intent', async () => {
    const syncService = createSyncServiceMock();
    new RiffSyncEventHandler(eventBus, syncService as never);

    await eventBus.publish(new CardDeletedEvent('xy-1', 'card-1', 'block-1', {
      deleteIntent: 'native-hard-delete',
      confirmDangerousNativeDelete: true,
    }));
    await eventBus.publish(new CardsDeletedEvent(
      'batch-delete',
      ['card-2', 'card-3'],
      ['block-2', 'block-3'],
      {
        deleteIntent: 'native-hard-delete',
        confirmDangerousNativeDelete: true,
      },
    ));

    expect(syncService.deleteSync).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({
        deleteIntent: 'native-hard-delete',
        confirmDangerousNativeDelete: true,
        requestedBy: 'CardDeletedEvent',
      }),
    );
    expect(syncService.deleteSyncBatch).toHaveBeenCalledWith(
      ['block-2', 'block-3'],
      expect.objectContaining({
        deleteIntent: 'native-hard-delete',
        confirmDangerousNativeDelete: true,
        requestedBy: 'CardsDeletedEvent',
      }),
    );
  });
});
