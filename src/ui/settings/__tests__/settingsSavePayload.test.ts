import { describe, expect, it } from 'vitest';
import {
  ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  DEFAULT_SETTINGS,
  type AISettings,
  type QueueSettings,
} from '@/types';
import {
  buildSettingsSavePayload,
  normalizeAutoPostponeSkipTopN,
  normalizeDailyLimit,
  normalizeOutstandingEveryNth,
  normalizePriorityRandomness,
  normalizeSrsV2StepList,
  parseSrsV2StepList,
  type SettingsFormState,
  type SettingsRiffIntegrationState,
  type SettingsSchedulerConfigWithSrsV2,
} from '../settingsSavePayload';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSettings(overrides: Partial<SettingsFormState> = {}): SettingsFormState {
  return {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableShortTerm: true,
    params: [...DEFAULT_SETTINGS.fsrs.weights],
    dayStartHour: 4,
    newCardsPerDay: DEFAULT_SETTINGS.newCardsPerDay,
    reviewsPerDay: DEFAULT_SETTINGS.reviewsPerDay,
    autoPostponeEnabled: false,
    autoPostponeSkipTopN: 20,
    autoSortEnabled: true,
    addToOutstandingEveryNth: 2,
    priorityRandomness: DEFAULT_SETTINGS.priorityRandomness,
    quickCard: clone(DEFAULT_SETTINGS.quickCard),
    progressiveAltXExcerptEnabled: false,
    progressiveStorage: clone(DEFAULT_SETTINGS.progressiveReading.storage),
    ...overrides,
  };
}

function createRiffState(overrides: Partial<SettingsRiffIntegrationState> = {}): SettingsRiffIntegrationState {
  return {
    mode: 'advanced',
    useLocalScheduler: true,
    incrementalSync: {
      enabled: true,
      triggers: ['plugin-start'],
      useBlacklist: true,
    },
    fullSync: {
      enabled: true,
      interval: 86400000,
      cleanupBlacklist: true,
    },
    deleteSync: {
      enabled: true,
      useBlacklistFallback: true,
    },
    storageConflictResolution: 'merge',
    ...overrides,
  };
}

describe('settingsSavePayload', () => {
  it('clamps shared settings normalization helpers', () => {
    expect(normalizeOutstandingEveryNth(999)).toBe(100);
    expect(normalizeOutstandingEveryNth('bad')).toBe(2);
    expect(normalizeAutoPostponeSkipTopN(9999)).toBe(2000);
    expect(normalizeAutoPostponeSkipTopN('bad')).toBe(20);
    expect(normalizeDailyLimit(12000, 30)).toBe(9999);
    expect(normalizeDailyLimit('bad', 30)).toBe(30);
    expect(normalizePriorityRandomness(-1)).toBe(0);
    expect(normalizePriorityRandomness(1.5)).toBe(1);
    expect(normalizeSrsV2StepList([0, 10.8, 50000, 'bad'], [5])).toEqual([1, 10, 43200]);
    expect(parseSrsV2StepList('2, bad, 1440', [5])).toEqual([2, 1440]);
  });

  it('builds save payload without legacy queue spacing keys', () => {
    const queueSettings = {
      ...clone(DEFAULT_SETTINGS.queues),
      outstandingEveryNth: 9,
      outstandingSpacing: 8,
      autoSort: { enabled: true },
      autoPostpone: {
        enabled: false,
        skipTopNElements: 5,
      },
    } as QueueSettings;
    const schedulerConfig: SettingsSchedulerConfigWithSrsV2 = {
      defaultScheduler: 'fsrs-v6',
      topicScheduler: 'a-factor-v2',
      itemScheduler: 'fsrs-v6',
      srsV2: {
        learningStepsMinutes: [0, 50000],
        relearningStepsMinutes: ['30', 'bad'] as unknown as number[],
        filteredReviewDefault: 'reschedule',
      },
    };
    const aiSettings = clone(DEFAULT_SETTINGS.ai) as AISettings;
    aiSettings.baseUrl = ' https://example.test/v1 ';
    aiSettings.apiKey = ' secret-key ';
    aiSettings.model = ' gpt-test ';

    const payload = buildSettingsSavePayload({
      settings: createSettings({
        newCardsPerDay: 12000,
        reviewsPerDay: -5,
        autoSortEnabled: false,
        autoPostponeEnabled: true,
        autoPostponeSkipTopN: 9999,
        addToOutstandingEveryNth: 999,
        priorityRandomness: 1.5,
        progressiveAltXExcerptEnabled: true,
        progressiveStorage: {
          mode: 'library',
          notebookId: 'notebook-a',
          targetBlockId: 'doc-root-1',
        },
      }),
      queueSettings,
      schedulerConfig,
      riffIntegrationConfig: createRiffState({ storageConflictResolution: 'prefer-local' }),
      triggers: {
        pluginStart: false,
        browserOpen: true,
      },
      aiSettings,
      arenaSettings: clone(DEFAULT_SETTINGS.arena),
      uiSettings: clone(DEFAULT_SETTINGS.ui),
    });

    expect(payload.newCardsPerDay).toBe(9999);
    expect(payload.reviewsPerDay).toBe(0);
    expect(payload.priorityRandomness).toBe(1);
    expect(payload.queues).not.toHaveProperty('outstandingEveryNth');
    expect(payload.queues).not.toHaveProperty('outstandingSpacing');
    expect(payload.queues.addToOutstandingEveryNth).toBe(100);
    expect(payload.queues.autoSort?.enabled).toBe(false);
    expect(payload.queues.autoPostpone?.enabled).toBe(true);
    expect(payload.queues.autoPostpone?.skipTopNElements).toBe(2000);
    expect(payload.scheduler.srsV2?.learningStepsMinutes).toEqual([1, 43200]);
    expect(payload.scheduler.srsV2?.relearningStepsMinutes).toEqual([30]);
    expect(payload.scheduler.srsV2?.filteredReviewDefault).toBe('reschedule');
    expect(payload.riffIntegration.incrementalSync.triggers).toEqual(['browser-open']);
    expect(payload.riffIntegration.storageConflictResolution).toBe('prefer-local');
    expect(payload.progressiveReading).toEqual({
      altXExcerptEnabled: true,
      storage: {
        mode: 'library',
        notebookId: 'notebook-a',
        targetBlockId: 'doc-root-1',
      },
    });
    expect(payload.ai.baseUrl).toBe('https://example.test/v1');
    expect(payload.ai.apiKey).toBe('secret-key');
    expect(payload.ai.model).toBe('gpt-test');
    expect(payload.ai.defaultModelId).toBe('gpt-test');
    expect(payload.ai.promptContractVersion).toBe(ACTIVE_AI_PROMPT_CONTRACT_VERSION);
  });
});
