import { describe, expect, it, vi } from 'vitest';
import { DialogManager } from '../DialogManager';

describe('DialogManager settings dialog dependencies', () => {
  it('fails closed when configured capture notebooks cannot be loaded', async () => {
    const listOpenNotebooks = vi.fn(async () => {
      throw new Error('notebook API down');
    });
    const context = {
      getSettingsService: () => ({
        getSettings: () => ({}),
      }),
      getScheduler: () => ({}),
      getHybridSyncService: () => ({}),
      getConfiguredCaptureStorageService: () => ({
        listOpenNotebooks,
      }),
      getPracticeQueueManager: () => ({}),
      getRetrievalQueue: () => ({
        localBuffer: [],
      }),
      getI18n: () => ({
        settings: 'Settings',
      }),
    };
    const dialogManager = new DialogManager(context as never, {} as never, {
      siyuanApi: {} as never,
      progressiveSiyuanApi: {} as never,
      leechActionEffects: {} as never,
    });

    await expect(dialogManager.openSettingsDialog())
      .rejects.toThrow('CAPTURE_NOTEBOOKS_UNAVAILABLE: failed to load configured capture notebooks: notebook API down');
  });
});
