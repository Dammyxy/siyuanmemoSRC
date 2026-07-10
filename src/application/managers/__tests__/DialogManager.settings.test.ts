import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DialogManager } from '../DialogManager';

const dialogManagerSource = readFileSync(
  resolve(process.cwd(), 'src/application/managers/DialogManager.ts'),
  'utf8',
);

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

  it('keeps continuous Native Riff sync out of settings save wiring', () => {
    expect(dialogManagerSource).toContain('storageConflictResolution: currentSettings.storageConflictResolution');
    expect(dialogManagerSource).not.toContain('riffIntegration: {');
    expect(dialogManagerSource).not.toContain('incrementalSync: {');
    expect(dialogManagerSource).not.toContain('fullSync: {');
    expect(dialogManagerSource).not.toContain('deleteSync: {');
    expect(dialogManagerSource).not.toContain('updateHybridSyncConfig');
  });
});
