import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type QueueSettings } from '@/types';
import {
  createDefaultArenaSettings,
  createDefaultQueueSettings,
  createDefaultSettingsFormState,
  createDefaultUISettings,
} from '../settingsStateDefaults';
import {
  createDefaultSettingsSchedulerConfig,
} from '../settingsLoadState';
import {
  useSettingsLoadSaveCommands,
  type SettingsLoadSaveSource,
} from '../settingsLoadSaveCommands';
import type { SettingsPanelSavePayload } from '../settingsSavePayload';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createCommands(source: SettingsLoadSaveSource = {}) {
  const settings = ref(createDefaultSettingsFormState());
  const queueSettings = ref(createDefaultQueueSettings());
  const schedulerConfig = ref(createDefaultSettingsSchedulerConfig());
  const storageConflictResolution = ref<'merge' | 'prefer-local' | 'prefer-remote'>('merge');
  const arenaSettings = ref(createDefaultArenaSettings());
  const uiSettings = ref(createDefaultUISettings());
  const save = vi.fn();
  const logger = { debug: vi.fn() };
  const commands = useSettingsLoadSaveCommands({
    getSource: () => source,
    settings,
    queueSettings,
    schedulerConfig,
    storageConflictResolution,
    arenaSettings,
    uiSettings,
    save,
    logger,
  });

  return {
    commands,
    logger,
    queueSettings,
    save,
    schedulerConfig,
    settings,
    storageConflictResolution,
    uiSettings,
  };
}

describe('settingsLoadSaveCommands', () => {
  it('loads props into SettingsPanel refs without continuous Native Riff sync state', () => {
    const queue = {
      ...clone(DEFAULT_SETTINGS.queues),
      autoSort: { enabled: false },
      autoPostpone: { enabled: true, skipTopNElements: 42 },
      addToOutstandingEveryNth: 6,
    } as QueueSettings;
    const { commands, logger, queueSettings, settings, storageConflictResolution } = createCommands({
      fsrsSettings: {
        ...clone(DEFAULT_SETTINGS.fsrs),
        dayStartHour: 8,
      },
      queueSettings: queue,
      priorityRandomness: 0.75,
      storageConflictResolution: 'prefer-remote',
    });

    commands.loadSettings();

    expect(settings.value.dayStartHour).toBe(8);
    expect(settings.value.priorityRandomness).toBe(0.75);
    expect(settings.value.addToOutstandingEveryNth).toBe(6);
    expect(settings.value.autoPostponeSkipTopN).toBe(42);
    expect(queueSettings.value.autoSort.enabled).toBe(false);
    expect(storageConflictResolution.value).toBe('prefer-remote');
    expect(logger.debug).toHaveBeenCalledWith('Loading settings with quickCardSettings', {
      quickCardSettings: undefined,
    });
    expect(logger.debug).toHaveBeenCalledWith('Initialized settings.quickCard', {
      quickCard: settings.value.quickCard,
    });
  });

  it('builds and emits save payload from current refs', () => {
    const { commands, logger, save, settings, storageConflictResolution } = createCommands();
    settings.value.dayStartHour = 99;
    settings.value.autoPostponeEnabled = true;
    settings.value.autoPostponeSkipTopN = 9999;
    settings.value.priorityRandomness = 2;
    storageConflictResolution.value = 'prefer-local';

    commands.saveSettings();

    const payload = save.mock.calls[0]?.[0] as SettingsPanelSavePayload;
    expect(payload.dayStartHour).toBe(99);
    expect(payload.priorityRandomness).toBe(1);
    expect(payload.queues.autoPostpone?.enabled).toBe(true);
    expect(payload.queues.autoPostpone?.skipTopNElements).toBe(2000);
    expect(payload.storageConflictResolution).toBe('prefer-local');
    expect(payload).not.toHaveProperty('riffIntegration');
    expect(logger.debug).toHaveBeenCalledWith('Saving settings with quickCard', {
      quickCard: payload.quickCard,
    });
  });
});
