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
  createDefaultSettingsRiffIntegrationState,
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
  const riffIntegrationConfig = ref(createDefaultSettingsRiffIntegrationState());
  const triggers = ref({ pluginStart: true, browserOpen: false });
  const arenaSettings = ref(createDefaultArenaSettings());
  const uiSettings = ref(createDefaultUISettings());
  const save = vi.fn();
  const logger = { debug: vi.fn() };
  const commands = useSettingsLoadSaveCommands({
    getSource: () => source,
    settings,
    queueSettings,
    schedulerConfig,
    riffIntegrationConfig,
    triggers,
    arenaSettings,
    uiSettings,
    save,
    logger,
  });

  return {
    commands,
    logger,
    queueSettings,
    riffIntegrationConfig,
    save,
    schedulerConfig,
    settings,
    triggers,
    uiSettings,
  };
}

describe('settingsLoadSaveCommands', () => {
  it('loads props into SettingsPanel refs and preserves trigger projection', () => {
    const queue = {
      ...clone(DEFAULT_SETTINGS.queues),
      autoSort: { enabled: false },
      autoPostpone: { enabled: true, skipTopNElements: 42 },
      addToOutstandingEveryNth: 6,
    } as QueueSettings;
    const { commands, logger, queueSettings, settings, triggers } = createCommands({
      fsrsSettings: {
        ...clone(DEFAULT_SETTINGS.fsrs),
        dayStartHour: 8,
      },
      queueSettings: queue,
      priorityRandomness: 0.75,
      riffIntegrationSettings: {
        incrementalSync: {
          triggers: ['browser-open'],
        },
      },
    });

    commands.loadSettings();

    expect(settings.value.dayStartHour).toBe(8);
    expect(settings.value.priorityRandomness).toBe(0.75);
    expect(settings.value.addToOutstandingEveryNth).toBe(6);
    expect(settings.value.autoPostponeSkipTopN).toBe(42);
    expect(queueSettings.value.autoSort.enabled).toBe(false);
    expect(triggers.value).toEqual({ pluginStart: false, browserOpen: true });
    expect(logger.debug).toHaveBeenCalledWith('Loading settings with quickCardSettings', {
      quickCardSettings: undefined,
    });
    expect(logger.debug).toHaveBeenCalledWith('Initialized settings.quickCard', {
      quickCard: settings.value.quickCard,
    });
  });

  it('builds and emits save payload from current refs', () => {
    const { commands, logger, save, settings, triggers } = createCommands();
    settings.value.dayStartHour = 99;
    settings.value.autoPostponeEnabled = true;
    settings.value.autoPostponeSkipTopN = 9999;
    settings.value.priorityRandomness = 2;
    triggers.value = { pluginStart: false, browserOpen: true };

    commands.saveSettings();

    const payload = save.mock.calls[0]?.[0] as SettingsPanelSavePayload;
    expect(payload.dayStartHour).toBe(99);
    expect(payload.priorityRandomness).toBe(1);
    expect(payload.queues.autoPostpone?.enabled).toBe(true);
    expect(payload.queues.autoPostpone?.skipTopNElements).toBe(2000);
    expect(payload.riffIntegration.incrementalSync.triggers).toEqual(['browser-open']);
    expect(logger.debug).toHaveBeenCalledWith('Saving settings with quickCard', {
      quickCard: payload.quickCard,
    });
  });
});
