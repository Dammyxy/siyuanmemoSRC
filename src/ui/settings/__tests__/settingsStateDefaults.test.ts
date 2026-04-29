import { describe, expect, it } from 'vitest';
import {
  ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  DEFAULT_AI_SETTINGS,
  DEFAULT_SETTINGS,
} from '@/types';
import {
  createDefaultSettingsFormState,
  mergeAISettings,
  mergeConfiguredCaptureStorageSettings,
  mergeQueueSettings,
  mergeQuickCardSettings,
  mergeUISettings,
  resetAiPromptToRecommended,
} from '../settingsStateDefaults';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

  it('normalizes AI settings and restores recommended prompt templates', () => {
    const merged = mergeAISettings({
      ...clone(DEFAULT_AI_SETTINGS),
      promptContractVersion: 0,
      promptProfiles: { legacy: true },
      draftStorage: { legacy: true },
      prompts: {
        skills: {
          ...DEFAULT_AI_SETTINGS.prompts.skills,
          generalChat: {
            systemPrompt: 'custom',
          },
        },
      },
    } as Partial<typeof DEFAULT_AI_SETTINGS> & { promptProfiles?: unknown; draftStorage?: unknown });

    expect(merged.promptContractVersion).toBe(ACTIVE_AI_PROMPT_CONTRACT_VERSION);
    expect(merged).not.toHaveProperty('promptProfiles');
    expect(merged).not.toHaveProperty('draftStorage');
    expect(merged.prompts.skills.generalChat.systemPrompt).toBe('custom');

    resetAiPromptToRecommended(merged, 'generalChat');
    expect(merged.prompts.skills.generalChat).toEqual(DEFAULT_AI_SETTINGS.prompts.skills.generalChat);
  });
});
