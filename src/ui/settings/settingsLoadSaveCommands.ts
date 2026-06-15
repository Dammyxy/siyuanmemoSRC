import type { Ref } from 'vue';
import type {
  FSRSParameters,
  ProgressiveReadingSettings,
  QueueSettings,
  QuickCardSettings,
  SchedulerConfig,
  UISettings,
} from '@/types';
import type { ArenaSettings } from '@/types/arena';
import {
  resolveSettingsPanelLoadState,
} from './settingsLoadState';
import {
  buildSettingsSavePayload,
  type SettingsFormState,
  type SettingsPanelSavePayload,
  type SettingsRiffIntegrationState,
  type SettingsRiffTriggerSelection,
  type SettingsSchedulerConfigWithSrsV2,
} from './settingsSavePayload';

export interface SettingsLoadSaveLogger {
  debug(message: string, payload?: unknown): void;
}

export interface SettingsLoadSaveSource {
  fsrsSettings?: FSRSParameters;
  queueSettings?: QueueSettings;
  newCardsPerDay?: number;
  reviewsPerDay?: number;
  priorityRandomness?: number;
  schedulerSettings?: SchedulerConfig;
  riffIntegrationSettings?: Record<string, unknown>;
  quickCardSettings?: Partial<QuickCardSettings>;
  progressiveReadingSettings?: Partial<ProgressiveReadingSettings>;
  arenaSettings?: Partial<ArenaSettings>;
  uiSettings?: Partial<UISettings>;
}

export interface SettingsLoadSaveCommandsInput {
  getSource: () => SettingsLoadSaveSource;
  settings: Ref<SettingsFormState>;
  queueSettings: Ref<QueueSettings>;
  schedulerConfig: Ref<SettingsSchedulerConfigWithSrsV2>;
  riffIntegrationConfig: Ref<SettingsRiffIntegrationState>;
  triggers: Ref<SettingsRiffTriggerSelection>;
  arenaSettings: Ref<ArenaSettings>;
  uiSettings: Ref<UISettings>;
  save: (settings: SettingsPanelSavePayload) => void;
  logger?: SettingsLoadSaveLogger;
}

export function useSettingsLoadSaveCommands(input: SettingsLoadSaveCommandsInput) {
  function loadSettings(): void {
    const source = input.getSource();
    input.logger?.debug('Loading settings with quickCardSettings', {
      quickCardSettings: source.quickCardSettings,
    });

    const loadedState = resolveSettingsPanelLoadState({
      ...source,
      currentSettings: input.settings.value,
      currentQueueSettings: input.queueSettings.value,
      currentSchedulerConfig: input.schedulerConfig.value,
      currentRiffIntegrationConfig: input.riffIntegrationConfig.value,
    });

    input.settings.value = loadedState.settings;
    input.queueSettings.value = loadedState.queueSettings;
    input.schedulerConfig.value = loadedState.schedulerConfig;
    input.riffIntegrationConfig.value = loadedState.riffIntegrationConfig;
    input.triggers.value = loadedState.triggers;
    input.arenaSettings.value = loadedState.arenaSettings;
    input.uiSettings.value = loadedState.uiSettings;

    input.logger?.debug('Initialized settings.quickCard', {
      quickCard: input.settings.value.quickCard,
    });
  }

  function saveSettings(): void {
    const settingsToSave = buildSettingsSavePayload({
      settings: input.settings.value,
      queueSettings: input.queueSettings.value,
      schedulerConfig: input.schedulerConfig.value,
      riffIntegrationConfig: input.riffIntegrationConfig.value,
      triggers: input.triggers.value,
      arenaSettings: input.arenaSettings.value,
      uiSettings: input.uiSettings.value,
    });

    input.logger?.debug('Saving settings with quickCard', {
      quickCard: settingsToSave.quickCard,
    });

    input.save(settingsToSave);
  }

  return {
    loadSettings,
    saveSettings,
  };
}
