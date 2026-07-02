import type { Ref } from 'vue';
import {
  DEFAULT_SETTINGS,
  type QueueSettings,
  type UISettings,
} from '@/types';
import type { ArenaSettings } from '@/types/arena';
import {
  normalizeAutoPostponeSkipTopN,
  normalizeOutstandingEveryNth,
  normalizePriorityRandomness,
  parseSrsV2StepList,
  type SettingsFormState,
  type SettingsSchedulerConfigWithSrsV2,
} from './settingsSavePayload';
import {
  createDefaultArenaSettings,
  createDefaultQueueSettings,
  createDefaultSettingsFormState,
  createDefaultUISettings,
} from './settingsStateDefaults';
import { clampSettingsDayStartHour } from './settingsFormViewModel';

export interface SettingsFormCommandLogger {
  debug(message: string, payload?: unknown): void;
}

export interface SettingsFormCommandsInput {
  settings: Ref<SettingsFormState>;
  queueSettings: Ref<QueueSettings>;
  schedulerConfig: Ref<SettingsSchedulerConfigWithSrsV2>;
  arenaSettings: Ref<ArenaSettings>;
  uiSettings: Ref<UISettings>;
  logger?: SettingsFormCommandLogger;
}

function readInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : '';
}

export function useSettingsFormCommands(input: SettingsFormCommandsInput) {
  function resetSettings(): void {
    input.settings.value = createDefaultSettingsFormState();
    input.queueSettings.value = createDefaultQueueSettings();
    input.arenaSettings.value = createDefaultArenaSettings();
    input.uiSettings.value = createDefaultUISettings();
  }

  function handleSrsV2LearningStepsChange(event: Event): void {
    input.schedulerConfig.value.srsV2.learningStepsMinutes = parseSrsV2StepList(
      readInputValue(event),
      DEFAULT_SETTINGS.scheduler!.srsV2!.learningStepsMinutes,
    );
  }

  function handleSrsV2RelearningStepsChange(event: Event): void {
    input.schedulerConfig.value.srsV2.relearningStepsMinutes = parseSrsV2StepList(
      readInputValue(event),
      DEFAULT_SETTINGS.scheduler!.srsV2!.relearningStepsMinutes,
    );
  }

  function handleDayStartHourChange(): void {
    input.settings.value.dayStartHour = clampSettingsDayStartHour(input.settings.value.dayStartHour);
    input.logger?.debug('dayStartHour changed', { dayStartHour: input.settings.value.dayStartHour });
  }

  function handleAddToOutstandingEveryNthChange(): void {
    input.settings.value.addToOutstandingEveryNth = normalizeOutstandingEveryNth(
      input.settings.value.addToOutstandingEveryNth,
    );
  }

  function handleAutoPostponeSkipTopNChange(): void {
    input.settings.value.autoPostponeSkipTopN = normalizeAutoPostponeSkipTopN(
      input.settings.value.autoPostponeSkipTopN,
    );
  }

  function handlePriorityRandomnessChange(): void {
    input.settings.value.priorityRandomness = normalizePriorityRandomness(
      input.settings.value.priorityRandomness,
    );
  }

  function setDayStartHour(hour: number): void {
    input.settings.value.dayStartHour = hour;
    handleDayStartHourChange();
  }

  return {
    resetSettings,
    handleSrsV2LearningStepsChange,
    handleSrsV2RelearningStepsChange,
    handleDayStartHourChange,
    handleAddToOutstandingEveryNthChange,
    handleAutoPostponeSkipTopNChange,
    handlePriorityRandomnessChange,
    setDayStartHour,
  };
}
