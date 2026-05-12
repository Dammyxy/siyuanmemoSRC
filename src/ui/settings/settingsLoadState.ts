import {
  DEFAULT_SETTINGS,
  type AISettings,
  type FSRSParameters,
  type ProgressiveReadingSettings,
  type QueueSettings,
  type QuickCardSettings,
  type SchedulerConfig,
  type UISettings,
} from '@/types';
import type { ArenaSettings } from '@/types/arena';
import {
  normalizeAutoPostponeSkipTopN,
  normalizeBoolean,
  normalizeConflictResolutionStrategy,
  normalizeDailyLimit,
  normalizeOutstandingEveryNth,
  normalizePriorityRandomness,
  normalizeSrsV2LearnAheadMaxCards,
  normalizeSrsV2LearnAheadWindowMinutes,
  normalizeSrsV2StepList,
  type SettingsFormState,
  type SettingsRiffIntegrationState,
  type SettingsRiffTrigger,
  type SettingsRiffTriggerSelection,
  type SettingsSchedulerConfigWithSrsV2,
} from './settingsSavePayload';
import {
  cloneSettingsSerializable,
  mergeAISettings,
  mergeArenaSettings,
  mergeConfiguredCaptureStorageSettings,
  mergeQueueSettings,
  mergeQuickCardSettings,
  mergeUISettings,
} from './settingsStateDefaults';

export interface SettingsPanelLoadInput {
  fsrsSettings?: FSRSParameters;
  queueSettings?: QueueSettings;
  newCardsPerDay?: number;
  reviewsPerDay?: number;
  priorityRandomness?: number;
  schedulerSettings?: SchedulerConfig;
  riffIntegrationSettings?: Record<string, unknown>;
  quickCardSettings?: Partial<QuickCardSettings>;
  progressiveReadingSettings?: Partial<ProgressiveReadingSettings>;
  aiSettings?: Partial<AISettings>;
  arenaSettings?: Partial<ArenaSettings>;
  uiSettings?: Partial<UISettings>;
  currentSettings: SettingsFormState;
  currentQueueSettings: QueueSettings;
  currentSchedulerConfig: SettingsSchedulerConfigWithSrsV2;
  currentRiffIntegrationConfig: SettingsRiffIntegrationState;
}

export interface SettingsPanelLoadedState {
  settings: SettingsFormState;
  queueSettings: QueueSettings;
  schedulerConfig: SettingsSchedulerConfigWithSrsV2;
  riffIntegrationConfig: SettingsRiffIntegrationState;
  triggers: SettingsRiffTriggerSelection;
  aiSettings: AISettings;
  arenaSettings: ArenaSettings;
  uiSettings: UISettings;
}

export function createDefaultSettingsSchedulerConfig(): SettingsSchedulerConfigWithSrsV2 {
  return {
    defaultScheduler: 'fsrs-v6',
    topicScheduler: 'a-factor-v2',
    itemScheduler: 'fsrs-v6',
    srsV2: {
      learningStepsMinutes: [...DEFAULT_SETTINGS.scheduler!.srsV2!.learningStepsMinutes],
      relearningStepsMinutes: [...DEFAULT_SETTINGS.scheduler!.srsV2!.relearningStepsMinutes],
      filteredReviewDefault: DEFAULT_SETTINGS.scheduler!.srsV2!.filteredReviewDefault,
      learnAhead: {
        ...DEFAULT_SETTINGS.scheduler!.srsV2!.learnAhead,
      },
    },
  };
}

export function createDefaultSettingsRiffIntegrationState(): SettingsRiffIntegrationState {
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
  };
}

function normalizeLoadedDefaultScheduler(value: unknown): 'fsrs-v6' | 'a-factor-v2' {
  return value === 'a-factor-v2' ? 'a-factor-v2' : 'fsrs-v6';
}

function normalizeRiffTriggerList(
  value: unknown,
  fallback: SettingsRiffTrigger[],
): SettingsRiffTrigger[] {
  const source = Array.isArray(value)
    ? value.filter(
      (trigger): trigger is SettingsRiffTrigger =>
        trigger === 'plugin-start' || trigger === 'browser-open',
    )
    : fallback;
  return source.length > 0 ? source : ['plugin-start'];
}

export function resolveSettingsRiffTriggerSelection(
  riffIntegrationConfig: SettingsRiffIntegrationState,
): SettingsRiffTriggerSelection {
  return {
    pluginStart: riffIntegrationConfig.incrementalSync.triggers.includes('plugin-start'),
    browserOpen: riffIntegrationConfig.incrementalSync.triggers.includes('browser-open'),
  };
}

export function resolveSettingsSchedulerConfig(
  schedulerSettings: SchedulerConfig | undefined,
  currentSchedulerConfig: SettingsSchedulerConfigWithSrsV2,
): SettingsSchedulerConfigWithSrsV2 {
  if (!schedulerSettings) {
    return currentSchedulerConfig;
  }

  return {
    defaultScheduler: normalizeLoadedDefaultScheduler(schedulerSettings.defaultScheduler),
    topicScheduler: schedulerSettings.topicScheduler || 'a-factor-v2',
    itemScheduler: 'fsrs-v6',
    srsV2: {
      learningStepsMinutes: normalizeSrsV2StepList(
        schedulerSettings.srsV2?.learningStepsMinutes,
        DEFAULT_SETTINGS.scheduler!.srsV2!.learningStepsMinutes,
      ),
      relearningStepsMinutes: normalizeSrsV2StepList(
        schedulerSettings.srsV2?.relearningStepsMinutes,
        DEFAULT_SETTINGS.scheduler!.srsV2!.relearningStepsMinutes,
      ),
      filteredReviewDefault: schedulerSettings.srsV2?.filteredReviewDefault === 'reschedule'
        ? 'reschedule'
        : 'preview-only',
      learnAhead: {
        windowMinutes: normalizeSrsV2LearnAheadWindowMinutes(
          schedulerSettings.srsV2?.learnAhead?.windowMinutes,
        ),
        maxCards: normalizeSrsV2LearnAheadMaxCards(
          schedulerSettings.srsV2?.learnAhead?.maxCards,
        ),
      },
    },
  };
}

export function resolveSettingsRiffIntegrationState(input: {
  riffIntegrationSettings?: Record<string, unknown>;
  currentRiffIntegrationConfig: SettingsRiffIntegrationState;
}): SettingsRiffIntegrationState {
  const riffSettings = input.riffIntegrationSettings || {};
  const incomingIncremental = (
    typeof riffSettings.incrementalSync === 'object' &&
    riffSettings.incrementalSync !== null
  ) ? riffSettings.incrementalSync as Record<string, unknown> : {};
  const incomingFullSync = (
    typeof riffSettings.fullSync === 'object' &&
    riffSettings.fullSync !== null
  ) ? riffSettings.fullSync as Record<string, unknown> : {};
  const incomingDeleteSync = (
    typeof riffSettings.deleteSync === 'object' &&
    riffSettings.deleteSync !== null
  ) ? riffSettings.deleteSync as Record<string, unknown> : {};

  return {
    mode: riffSettings.mode === 'simple' ? 'simple' : 'advanced',
    useLocalScheduler: typeof riffSettings.useLocalScheduler === 'boolean'
      ? riffSettings.useLocalScheduler
      : true,
    incrementalSync: {
      enabled: typeof incomingIncremental.enabled === 'boolean' ? incomingIncremental.enabled : true,
      triggers: normalizeRiffTriggerList(
        incomingIncremental.triggers,
        input.currentRiffIntegrationConfig.incrementalSync.triggers,
      ),
      useBlacklist: typeof incomingIncremental.useBlacklist === 'boolean' ? incomingIncremental.useBlacklist : true,
    },
    fullSync: {
      enabled: typeof incomingFullSync.enabled === 'boolean' ? incomingFullSync.enabled : true,
      interval: typeof incomingFullSync.interval === 'number' ? incomingFullSync.interval : 86400000,
      cleanupBlacklist: typeof incomingFullSync.cleanupBlacklist === 'boolean' ? incomingFullSync.cleanupBlacklist : true,
    },
    deleteSync: {
      enabled: typeof incomingDeleteSync.enabled === 'boolean' ? incomingDeleteSync.enabled : true,
      useBlacklistFallback: typeof incomingDeleteSync.useBlacklistFallback === 'boolean'
        ? incomingDeleteSync.useBlacklistFallback
        : true,
    },
    storageConflictResolution: normalizeConflictResolutionStrategy(riffSettings.storageConflictResolution),
  };
}

export function resolveSettingsPanelLoadState(input: SettingsPanelLoadInput): SettingsPanelLoadedState {
  const settings = input.fsrsSettings
    ? {
      requestRetention: input.fsrsSettings.requestRetention,
      maximumInterval: input.fsrsSettings.maximumInterval,
      enableShortTerm: input.fsrsSettings.enableShortTerm,
      params: [...input.fsrsSettings.weights],
      dayStartHour: input.fsrsSettings.dayStartHour ?? 4,
      newCardsPerDay: normalizeDailyLimit(input.newCardsPerDay, DEFAULT_SETTINGS.newCardsPerDay),
      reviewsPerDay: normalizeDailyLimit(input.reviewsPerDay, DEFAULT_SETTINGS.reviewsPerDay),
      autoPostponeEnabled: false,
      autoPostponeSkipTopN: 20,
      autoSortEnabled: true,
      addToOutstandingEveryNth: 2,
      priorityRandomness: normalizePriorityRandomness(input.priorityRandomness),
      quickCard: mergeQuickCardSettings(input.quickCardSettings),
      progressiveAltXExcerptEnabled: input.progressiveReadingSettings?.altXExcerptEnabled === true,
      progressiveStorage: mergeConfiguredCaptureStorageSettings(
        input.progressiveReadingSettings?.storage,
        DEFAULT_SETTINGS.progressiveReading.storage,
      ),
    }
    : cloneSettingsSerializable(input.currentSettings);

  settings.quickCard = mergeQuickCardSettings(input.quickCardSettings);
  settings.progressiveAltXExcerptEnabled = input.progressiveReadingSettings?.altXExcerptEnabled === true;
  settings.progressiveStorage = mergeConfiguredCaptureStorageSettings(
    input.progressiveReadingSettings?.storage,
    DEFAULT_SETTINGS.progressiveReading.storage,
  );

  let queueSettings = input.currentQueueSettings;
  if (input.queueSettings) {
    const incoming = cloneSettingsSerializable(input.queueSettings) as QueueSettings;
    queueSettings = mergeQueueSettings(incoming);

    settings.addToOutstandingEveryNth = normalizeOutstandingEveryNth(
      (incoming as QueueSettings & { outstandingEveryNth?: unknown; outstandingSpacing?: unknown })
        .addToOutstandingEveryNth
      ?? (incoming as { outstandingEveryNth?: unknown }).outstandingEveryNth
      ?? (incoming as { outstandingSpacing?: unknown }).outstandingSpacing
      ?? settings.addToOutstandingEveryNth,
    );
    settings.autoSortEnabled = normalizeBoolean(
      (incoming as { autoSort?: { enabled?: unknown } }).autoSort?.enabled,
      true,
    );
    settings.autoPostponeEnabled = normalizeBoolean(
      (incoming as { autoPostpone?: { enabled?: unknown } }).autoPostpone?.enabled,
      false,
    );
    settings.autoPostponeSkipTopN = normalizeAutoPostponeSkipTopN(
      (incoming as { autoPostpone?: { skipTopNElements?: unknown } }).autoPostpone?.skipTopNElements,
    );
  }

  settings.priorityRandomness = normalizePriorityRandomness(
    input.priorityRandomness ?? settings.priorityRandomness,
  );

  const schedulerConfig = resolveSettingsSchedulerConfig(
    input.schedulerSettings,
    input.currentSchedulerConfig,
  );
  const riffIntegrationConfig = resolveSettingsRiffIntegrationState({
    riffIntegrationSettings: input.riffIntegrationSettings,
    currentRiffIntegrationConfig: input.currentRiffIntegrationConfig,
  });

  return {
    settings,
    queueSettings,
    schedulerConfig,
    riffIntegrationConfig,
    triggers: resolveSettingsRiffTriggerSelection(riffIntegrationConfig),
    aiSettings: mergeAISettings(input.aiSettings),
    arenaSettings: mergeArenaSettings(input.arenaSettings),
    uiSettings: mergeUISettings(input.uiSettings),
  };
}
