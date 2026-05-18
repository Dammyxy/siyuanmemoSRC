import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types';
import {
  createDefaultSettingsFormState,
  createDefaultQueueSettings,
} from '../settingsStateDefaults';
import {
  createDefaultSettingsRiffIntegrationState,
  createDefaultSettingsSchedulerConfig,
  resolveSettingsPanelLoadState,
  resolveSettingsRiffIntegrationState,
  resolveSettingsRiffTriggerSelection,
  resolveSettingsSchedulerConfig,
} from '../settingsLoadState';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('settingsLoadState', () => {
  it('hydrates form, queue, scheduler, riff, ai, arena, and ui settings from props', () => {
    const loaded = resolveSettingsPanelLoadState({
      fsrsSettings: {
        ...DEFAULT_SETTINGS.fsrs,
        requestRetention: 0.93,
        weights: [1, 2, 3],
        dayStartHour: 7,
      },
      queueSettings: {
        ...clone(DEFAULT_SETTINGS.queues),
        addToOutstandingEveryNth: undefined,
        outstandingEveryNth: 9,
        autoSort: { enabled: false },
        autoPostpone: {
          enabled: true,
          skipTopNElements: 9999,
        },
      },
      newCardsPerDay: 12000,
      reviewsPerDay: -1,
      priorityRandomness: 1.5,
      schedulerSettings: {
        defaultScheduler: 'fsrs-v6',
        topicScheduler: 'a-factor-v2',
        itemScheduler: 'unsupported-scheduler' as never,
        srsV2: {
          learningStepsMinutes: [0, 15],
          relearningStepsMinutes: ['bad', '20'] as unknown as number[],
          filteredReviewDefault: 'reschedule',
        },
      },
      riffIntegrationSettings: {
        mode: 'simple',
        useLocalScheduler: false,
        incrementalSync: {
          enabled: false,
          triggers: ['browser-open', 'bad'],
          useBlacklist: false,
        },
        fullSync: {
          enabled: false,
          interval: 123,
          cleanupBlacklist: false,
        },
        deleteSync: {
          enabled: false,
          useBlacklistFallback: false,
        },
        storageConflictResolution: 'prefer-remote',
      },
      quickCardSettings: {
        ...DEFAULT_SETTINGS.quickCard,
        topicDerivation: {
          enabled: false,
          storageMode: 'source-child',
        },
      },
      progressiveReadingSettings: {
        ...DEFAULT_SETTINGS.progressiveReading,
        altXExcerptEnabled: true,
        sourceMarkingEnabled: false,
        storage: {
          mode: 'library',
          notebookId: 'notebook-a',
          targetBlockId: 'doc-root',
        },
      },
      aiSettings: {
        ...DEFAULT_SETTINGS.ai,
        enabled: true,
      },
      arenaSettings: {
        ...DEFAULT_SETTINGS.arena,
        enabled: true,
      },
      uiSettings: {
        ...DEFAULT_SETTINGS.ui,
        enableDebugLogs: true,
      },
      currentSettings: createDefaultSettingsFormState(),
      currentQueueSettings: createDefaultQueueSettings(),
      currentSchedulerConfig: createDefaultSettingsSchedulerConfig(),
      currentRiffIntegrationConfig: createDefaultSettingsRiffIntegrationState(),
    });

    expect(loaded.settings.requestRetention).toBe(0.93);
    expect(loaded.settings.dayStartHour).toBe(7);
    expect(loaded.settings.newCardsPerDay).toBe(9999);
    expect(loaded.settings.reviewsPerDay).toBe(0);
    expect(loaded.settings.priorityRandomness).toBe(1);
    expect(loaded.settings.addToOutstandingEveryNth).toBe(9);
    expect(loaded.settings.autoSortEnabled).toBe(false);
    expect(loaded.settings.autoPostponeEnabled).toBe(true);
    expect(loaded.settings.autoPostponeSkipTopN).toBe(2000);
    expect(loaded.settings.quickCard.topicDerivation).toEqual({
      enabled: false,
      storageMode: 'source-child',
    });
    expect(loaded.settings.progressiveAltXExcerptEnabled).toBe(true);
    expect(loaded.settings.progressiveSourceMarkingEnabled).toBe(false);
    expect(loaded.settings.progressiveStorage).toEqual({
      mode: 'library',
      notebookId: 'notebook-a',
      targetBlockId: 'doc-root',
    });
    expect(loaded.schedulerConfig.srsV2.learningStepsMinutes).toEqual([1, 15]);
    expect(loaded.schedulerConfig.srsV2.relearningStepsMinutes).toEqual([20]);
    expect(loaded.schedulerConfig.srsV2.filteredReviewDefault).toBe('reschedule');
    expect(loaded.schedulerConfig.itemScheduler).toBe('fsrs-v6');
    expect(loaded.riffIntegrationConfig.mode).toBe('simple');
    expect(loaded.riffIntegrationConfig.incrementalSync.triggers).toEqual(['browser-open']);
    expect(loaded.riffIntegrationConfig.storageConflictResolution).toBe('prefer-remote');
    expect(loaded.triggers).toEqual({
      pluginStart: false,
      browserOpen: true,
    });
    expect(loaded.aiSettings.enabled).toBe(true);
    expect(loaded.arenaSettings.enabled).toBe(true);
    expect(loaded.uiSettings.enableDebugLogs).toBe(true);
  });

  it('keeps current form and scheduler state when optional props are absent', () => {
    const currentSettings = createDefaultSettingsFormState();
    currentSettings.requestRetention = 0.88;
    currentSettings.quickCard.enabled = true;
    const currentSchedulerConfig = createDefaultSettingsSchedulerConfig();
    currentSchedulerConfig.srsV2.filteredReviewDefault = 'reschedule';
    const currentRiffIntegrationConfig = createDefaultSettingsRiffIntegrationState();
    currentRiffIntegrationConfig.incrementalSync.triggers = ['browser-open'];

    const loaded = resolveSettingsPanelLoadState({
      currentSettings,
      currentQueueSettings: createDefaultQueueSettings(),
      currentSchedulerConfig,
      currentRiffIntegrationConfig,
    });

    expect(loaded.settings.requestRetention).toBe(0.88);
    expect(loaded.settings.quickCard.enabled).toBe(DEFAULT_SETTINGS.quickCard.enabled);
    expect(loaded.schedulerConfig.srsV2.filteredReviewDefault).toBe('reschedule');
    expect(loaded.riffIntegrationConfig.incrementalSync.triggers).toEqual(['browser-open']);
    expect(loaded.triggers).toEqual({
      pluginStart: false,
      browserOpen: true,
    });
  });

  it('normalizes scheduler and riff sub-state helpers', () => {
    const currentSchedulerConfig = createDefaultSettingsSchedulerConfig();
    expect(resolveSettingsSchedulerConfig(undefined, currentSchedulerConfig)).toBe(currentSchedulerConfig);

    const currentRiffIntegrationConfig = createDefaultSettingsRiffIntegrationState();
    currentRiffIntegrationConfig.incrementalSync.triggers = ['browser-open'];
    const riff = resolveSettingsRiffIntegrationState({
      riffIntegrationSettings: {
        incrementalSync: {
          triggers: ['bad'],
        },
        storageConflictResolution: 'bad',
      },
      currentRiffIntegrationConfig,
    });

    expect(riff.incrementalSync.triggers).toEqual(['plugin-start']);
    expect(riff.storageConflictResolution).toBe('merge');
    expect(resolveSettingsRiffTriggerSelection(riff)).toEqual({
      pluginStart: true,
      browserOpen: false,
    });
  });
});
