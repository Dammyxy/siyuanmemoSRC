import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types';
import {
  createDefaultSettingsFormState,
  mergeConfiguredCaptureStorageSettings,
  mergeQueueSettings,
  mergeQuickCardSettings,
  mergeUISettings,
} from '../settingsStateDefaults';

describe('settingsStateDefaults', () => {
  it('creates isolated default settings form state', () => {
    const first = createDefaultSettingsFormState();
    const second = createDefaultSettingsFormState();

    first.quickCard.enabledSymbols.basic = false;
    first.progressiveStorage.notebookId = 'changed';

    expect(second.quickCard.enabledSymbols.basic).toBe(DEFAULT_SETTINGS.quickCard.enabledSymbols.basic);
    expect(second.progressiveStorage.notebookId).toBe(DEFAULT_SETTINGS.progressiveReading.storage.notebookId);
  });

  it('deep-merges quick card, queue, ui, and capture storage defaults', () => {
    expect(mergeQuickCardSettings({
      enabledSymbols: {
        basic: false,
      } as Partial<typeof DEFAULT_SETTINGS.quickCard.enabledSymbols> as typeof DEFAULT_SETTINGS.quickCard.enabledSymbols,
      topicDerivation: {
        enabled: false,
        storageMode: 'source-child',
      },
    }).enabledSymbols).toEqual({
      ...DEFAULT_SETTINGS.quickCard.enabledSymbols,
      basic: false,
    });

    const mergedQueue = mergeQueueSettings({
      neuralRoam: {
        hyperspace: {
          treeChannels: {
            blockTree: true,
          },
        },
      },
    } as Partial<typeof DEFAULT_SETTINGS.queues>);
    expect(mergedQueue.neuralRoam?.hyperspace.treeChannels.blockTree).toBe(true);
    expect(mergedQueue.neuralRoam?.hyperspace.treeChannels.documentTree).toBe(
      DEFAULT_SETTINGS.queues.neuralRoam?.hyperspace.treeChannels.documentTree,
    );

    expect(mergeUISettings({ enableDebugLogs: true }).enableDebugLogs).toBe(true);
    expect(mergeConfiguredCaptureStorageSettings(
      { mode: 'library', notebookId: 'notebook-a', targetBlockId: 'doc-root' },
      DEFAULT_SETTINGS.progressiveReading.storage,
    )).toEqual({
      mode: 'library',
      notebookId: 'notebook-a',
      targetBlockId: 'doc-root',
    });
  });
});
