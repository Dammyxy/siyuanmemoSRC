import {
  normalizeArenaSettings,
  type ArenaSettings,
} from '@/types/arena';
import {
  DEFAULT_SETTINGS,
  normalizeConfiguredCaptureStorageSettings,
  type ConfiguredCaptureStorageSettings,
  type PluginSettings,
  type QueueSettings,
  type QuickCardSettings,
  type SchedulerConfig,
  type UISettings,
} from '@/types';

export type SettingsConflictResolutionStrategy = 'merge' | 'prefer-local' | 'prefer-remote';
export type SettingsSchedulerConfigWithSrsV2 = SchedulerConfig & {
  srsV2: NonNullable<SchedulerConfig['srsV2']>;
};

export interface SettingsFormState {
  requestRetention: number;
  maximumInterval: number;
  enableShortTerm: boolean;
  params: number[];
  dayStartHour: number;
  newCardsPerDay: number;
  reviewsPerDay: number;
  autoPostponeEnabled: boolean;
  autoPostponeSkipTopN: number;
  autoSortEnabled: boolean;
  addToOutstandingEveryNth: number;
  priorityRandomness: number;
  quickCard: QuickCardSettings;
  progressiveAltXExcerptEnabled: boolean;
  progressiveSourceMarkingEnabled: boolean;
  progressiveStorage: ConfiguredCaptureStorageSettings;
}

export interface SettingsPanelSavePayload {
  requestRetention: number;
  maximumInterval: number;
  enableShortTerm: boolean;
  params: number[];
  dayStartHour: number;
  newCardsPerDay: number;
  reviewsPerDay: number;
  priorityRandomness: number;
  quickCard: QuickCardSettings;
  progressiveStorage: ConfiguredCaptureStorageSettings;
  queues: QueueSettings;
  scheduler: SchedulerConfig;
  storageConflictResolution: SettingsConflictResolutionStrategy;
  progressiveReading: NonNullable<PluginSettings['progressiveReading']>;
  arena: ArenaSettings;
  ui: UISettings;
}

export function normalizeConflictResolutionStrategy(value: unknown): SettingsConflictResolutionStrategy {
  if (value === 'prefer-local' || value === 'prefer-remote' || value === 'merge') {
    return value;
  }
  return 'merge';
}

export function normalizeOutstandingEveryNth(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 2;
  }
  return Math.max(1, Math.min(100, Math.floor(numeric)));
}

export function normalizePriorityRandomness(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.1;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeDailyLimit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.min(9999, Math.floor(numeric)));
}

export function normalizeSrsV2StepList(value: unknown, fallback: number[]): number[] {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source
    .map((item) => Math.max(1, Math.min(30 * 24 * 60, Math.floor(Number(item)))))
    .filter((item) => Number.isFinite(item));
  return normalized.length > 0 ? normalized : [...fallback];
}

export function normalizeSrsV2LearnAheadWindowMinutes(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.scheduler!.srsV2!.learnAhead.windowMinutes;
  }
  return Math.max(0, Math.min(24 * 60, Math.floor(numeric)));
}

export function normalizeSrsV2LearnAheadMaxCards(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.scheduler!.srsV2!.learnAhead.maxCards;
  }
  return Math.max(0, Math.min(500, Math.floor(numeric)));
}

export function parseSrsV2StepList(value: string, fallback: number[]): number[] {
  return normalizeSrsV2StepList(
    value.split(',').map((part) => part.trim()).filter(Boolean),
    fallback,
  );
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

export function normalizeAutoPostponeSkipTopN(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 20;
  }
  return Math.max(0, Math.min(2000, Math.floor(numeric)));
}

export function buildSettingsSavePayload(input: {
  settings: SettingsFormState;
  queueSettings: QueueSettings;
  schedulerConfig: SettingsSchedulerConfigWithSrsV2;
  storageConflictResolution: SettingsConflictResolutionStrategy;
  arenaSettings: ArenaSettings;
  uiSettings: UISettings;
}): SettingsPanelSavePayload {
  const queueInput = input.queueSettings as QueueSettings & {
    outstandingEveryNth?: number;
    outstandingSpacing?: number;
  };
  const {
    outstandingEveryNth: _legacyOutstandingEveryNth,
    outstandingSpacing: _legacyOutstandingSpacing,
    ...queueBase
  } = queueInput;
  const queues: QueueSettings = {
    ...queueBase,
    addToOutstandingEveryNth: normalizeOutstandingEveryNth(input.settings.addToOutstandingEveryNth),
    autoSort: {
      ...(queueBase.autoSort || {}),
      enabled: input.settings.autoSortEnabled,
    },
    autoPostpone: {
      ...(queueBase.autoPostpone || {}),
      enabled: input.settings.autoPostponeEnabled,
      skipTopNElements: normalizeAutoPostponeSkipTopN(input.settings.autoPostponeSkipTopN),
    },
  };

  const {
    addToOutstandingEveryNth: _spacingFromForm,
    autoSortEnabled: _autoSortEnabled,
    autoPostponeEnabled: _autoPostponeEnabled,
    autoPostponeSkipTopN: _autoPostponeSkipTopN,
    progressiveAltXExcerptEnabled: _progressiveAltXExcerptEnabled,
    progressiveSourceMarkingEnabled: _progressiveSourceMarkingEnabled,
    ...settingsBase
  } = input.settings;

  return {
    ...settingsBase,
    newCardsPerDay: normalizeDailyLimit(input.settings.newCardsPerDay, DEFAULT_SETTINGS.newCardsPerDay),
    reviewsPerDay: normalizeDailyLimit(input.settings.reviewsPerDay, DEFAULT_SETTINGS.reviewsPerDay),
    queues,
    priorityRandomness: normalizePriorityRandomness(input.settings.priorityRandomness),
    scheduler: {
      defaultScheduler: input.schedulerConfig.defaultScheduler,
      topicScheduler: input.schedulerConfig.topicScheduler,
      itemScheduler: input.schedulerConfig.itemScheduler,
      srsV2: {
        learningStepsMinutes: normalizeSrsV2StepList(
          input.schedulerConfig.srsV2.learningStepsMinutes,
          DEFAULT_SETTINGS.scheduler!.srsV2!.learningStepsMinutes,
        ),
        relearningStepsMinutes: normalizeSrsV2StepList(
          input.schedulerConfig.srsV2.relearningStepsMinutes,
          DEFAULT_SETTINGS.scheduler!.srsV2!.relearningStepsMinutes,
        ),
        filteredReviewDefault: input.schedulerConfig.srsV2.filteredReviewDefault,
        learnAhead: {
          windowMinutes: normalizeSrsV2LearnAheadWindowMinutes(
            input.schedulerConfig.srsV2.learnAhead?.windowMinutes,
          ),
          maxCards: normalizeSrsV2LearnAheadMaxCards(
            input.schedulerConfig.srsV2.learnAhead?.maxCards,
          ),
        },
      },
    },
    storageConflictResolution: normalizeConflictResolutionStrategy(input.storageConflictResolution),
    progressiveReading: {
      altXExcerptEnabled: input.settings.progressiveAltXExcerptEnabled,
      sourceMarkingEnabled: input.settings.progressiveSourceMarkingEnabled,
      storage: normalizeConfiguredCaptureStorageSettings(
        input.settings.progressiveStorage,
        {
          allowSourceChild: true,
          fallback: DEFAULT_SETTINGS.progressiveReading.storage,
        },
      ),
    },
    arena: normalizeArenaSettings(input.arenaSettings),
    ui: {
      ...input.uiSettings,
    },
  };
}
