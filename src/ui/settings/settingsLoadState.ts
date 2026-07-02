import {
  DEFAULT_SETTINGS,
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
  const riffDefaults = DEFAULT_SETTINGS.riffIntegration!;
  return {
    mode: riffDefaults.mode,
    useLocalScheduler: riffDefaults.useLocalScheduler,
    incrementalSync: {
      enabled: riffDefaults.incrementalSync.enabled,
      triggers: [...riffDefaults.incrementalSync.triggers],
      useBlacklist: riffDefaults.incrementalSync.useBlacklist,
    },
    fullSync: {
      ...riffDefaults.fullSync,
    },
    deleteSync: {
      ...riffDefaults.deleteSync,
    },
    storageConflictResolution: riffDefaults.storageConflictResolution || 'merge',
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
  return source;
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
      : DEFAULT_SETTINGS.riffIntegration!.useLocalScheduler,
    incrementalSync: {
      enabled: typeof incomingIncremental.enabled === 'boolean'
        ? incomingIncremental.enabled
        : DEFAULT_SETTINGS.riffIntegration!.incrementalSync.enabled,
      triggers: normalizeRiffTriggerList(
        incomingIncremental.triggers,
        input.currentRiffIntegrationConfig.incrementalSync.triggers,
      ),
      useBlacklist: typeof incomingIncremental.useBlacklist === 'boolean'
        ? incomingIncremental.useBlacklist
        : DEFAULT_SETTINGS.riffIntegration!.incrementalSync.useBlacklist,
    },
    fullSync: {
      enabled: typeof incomingFullSync.enabled === 'boolean'
        ? incomingFullSync.enabled
        : DEFAULT_SETTINGS.riffIntegration!.fullSync.enabled,
      interval: typeof incomingFullSync.interval === 'number'
        ? incomingFullSync.interval
        : DEFAULT_SETTINGS.riffIntegration!.fullSync.interval,
      cleanupBlacklist: typeof incomingFullSync.cleanupBlacklist === 'boolean'
        ? incomingFullSync.cleanupBlacklist
        : DEFAULT_SETTINGS.riffIntegration!.fullSync.cleanupBlacklist,
    },
    deleteSync: {
      enabled: typeof incomingDeleteSync.enabled === 'boolean'
        ? incomingDeleteSync.enabled
        : DEFAULT_SETTINGS.riffIntegration!.deleteSync.enabled,
      useBlacklistFallback: typeof incomingDeleteSync.useBlacklistFallback === 'boolean'
        ? incomingDeleteSync.useBlacklistFallback
        : DEFAULT_SETTINGS.riffIntegration!.deleteSync.useBlacklistFallback,
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
      progressiveSourceMarkingEnabled: input.progressiveReadingSettings?.sourceMarkingEnabled !== false,
      progressiveStorage: mergeConfiguredCaptureStorageSettings(
        input.progressiveReadingSettings?.storage,
        DEFAULT_SETTINGS.progressiveReading.storage,
      ),
    }
    : cloneSettingsSerializable(input.currentSettings);

  settings.quickCard = mergeQuickCardSettings(input.quickCardSettings);
  settings.progressiveAltXExcerptEnabled = input.progressiveReadingSettings?.altXExcerptEnabled === true;
  settings.progressiveSourceMarkingEnabled = input.progressiveReadingSettings?.sourceMarkingEnabled !== false;
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
    arenaSettings: mergeArenaSettings(input.arenaSettings),
    uiSettings: mergeUISettings(input.uiSettings),
  };
}
