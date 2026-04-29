import type { Ref } from 'vue';
import {
  DEFAULT_SETTINGS,
  type AISettings,
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
  createDefaultAISettings,
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
  aiSettings: Ref<AISettings>;
  arenaSettings: Ref<ArenaSettings>;
  uiSettings: Ref<UISettings>;
  logger?: SettingsFormCommandLogger;
}

function readInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : '';
}

function readInputChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

export function useSettingsFormCommands(input: SettingsFormCommandsInput) {
  function resetSettings(): void {
    input.settings.value = createDefaultSettingsFormState();
    input.queueSettings.value = createDefaultQueueSettings();
    input.aiSettings.value = createDefaultAISettings();
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

  function handleArenaSrsWriteEnabledChange(event: Event): void {
    input.arenaSettings.value.srs.advisoryOnly = !readInputChecked(event);
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
    handleArenaSrsWriteEnabledChange,
    handleDayStartHourChange,
    handleAddToOutstandingEveryNthChange,
    handleAutoPostponeSkipTopNChange,
    handlePriorityRandomnessChange,
    setDayStartHour,
  };
}
