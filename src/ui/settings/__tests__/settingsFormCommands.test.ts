import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types';
import {
  createDefaultArenaSettings,
  createDefaultQueueSettings,
  createDefaultSettingsFormState,
  createDefaultUISettings,
} from '../settingsStateDefaults';
import { createDefaultSettingsSchedulerConfig } from '../settingsLoadState';
import { useSettingsFormCommands } from '../settingsFormCommands';

function createInputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

function createCommands() {
  const settings = ref(createDefaultSettingsFormState());
  const queueSettings = ref(createDefaultQueueSettings());
  const schedulerConfig = ref(createDefaultSettingsSchedulerConfig());
  const arenaSettings = ref(createDefaultArenaSettings());
  const uiSettings = ref(createDefaultUISettings());
  const logger = { debug: vi.fn() };
  const commands = useSettingsFormCommands({
    settings,
    queueSettings,
    schedulerConfig,
    arenaSettings,
    uiSettings,
    logger,
  });

  return {
    arenaSettings,
    commands,
    logger,
    queueSettings,
    schedulerConfig,
    settings,
    uiSettings,
  };
}

describe('settingsFormCommands', () => {
  it('normalizes scheduler step inputs', () => {
    const { commands, schedulerConfig } = createCommands();

    commands.handleSrsV2LearningStepsChange(createInputEvent('2, bad, 1440'));
    commands.handleSrsV2RelearningStepsChange(createInputEvent('bad'));

    expect(schedulerConfig.value.srsV2.learningStepsMinutes).toEqual([2, 1440]);
    expect(schedulerConfig.value.srsV2.relearningStepsMinutes).toEqual(
      DEFAULT_SETTINGS.scheduler!.srsV2!.relearningStepsMinutes,
    );
  });

  it('clamps numeric form values and logs day-start changes', () => {
    const { commands, logger, settings } = createCommands();

    settings.value.dayStartHour = 99;
    settings.value.addToOutstandingEveryNth = 999;
    settings.value.autoPostponeSkipTopN = 9999;
    settings.value.priorityRandomness = -0.5;

    commands.handleDayStartHourChange();
    commands.handleAddToOutstandingEveryNthChange();
    commands.handleAutoPostponeSkipTopNChange();
    commands.handlePriorityRandomnessChange();

    expect(settings.value.dayStartHour).toBe(23);
    expect(settings.value.addToOutstandingEveryNth).toBe(100);
    expect(settings.value.autoPostponeSkipTopN).toBe(2000);
    expect(settings.value.priorityRandomness).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith('dayStartHour changed', { dayStartHour: 23 });

    commands.setDayStartHour(-5);

    expect(settings.value.dayStartHour).toBe(0);
  });

  it('resets footer-owned settings state without changing scheduler selection', () => {
    const {
      arenaSettings,
      commands,
      queueSettings,
      schedulerConfig,
      settings,
      uiSettings,
    } = createCommands();

    settings.value.dayStartHour = 18;
    queueSettings.value.autoSort.enabled = false;
    arenaSettings.value.enabled = !createDefaultArenaSettings().enabled;
    uiSettings.value.enableDebugLogs = !createDefaultUISettings().enableDebugLogs;
    schedulerConfig.value.defaultScheduler = 'a-factor-v2';

    commands.resetSettings();

    expect(settings.value).toEqual(createDefaultSettingsFormState());
    expect(queueSettings.value).toEqual(createDefaultQueueSettings());
    expect(arenaSettings.value).toEqual(createDefaultArenaSettings());
    expect(uiSettings.value).toEqual(createDefaultUISettings());
    expect(schedulerConfig.value.defaultScheduler).toBe('a-factor-v2');
  });
});
