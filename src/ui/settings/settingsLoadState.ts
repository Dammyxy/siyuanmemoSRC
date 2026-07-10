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
  type SettingsConflictResolutionStrategy,
  type SettingsFormState,
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
  storageConflictResolution?: unknown;
  quickCardSettings?: Partial<QuickCardSettings>;
  progressiveReadingSettings?: Partial<ProgressiveReadingSettings>;
  arenaSettings?: Partial<ArenaSettings>;
  uiSettings?: Partial<UISettings>;
  currentSettings: SettingsFormState;
  currentQueueSettings: QueueSettings;
  currentSchedulerConfig: SettingsSchedulerConfigWithSrsV2;
}

export interface SettingsPanelLoadedState {
  settings: SettingsFormState;
  queueSettings: QueueSettings;
  schedulerConfig: SettingsSchedulerConfigWithSrsV2;
  storageConflictResolution: SettingsConflictResolutionStrategy;
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

function normalizeLoadedDefaultScheduler(value: unknown): 'fsrs-v6' | 'a-factor-v2' {
  return value === 'a-factor-v2' ? 'a-factor-v2' : 'fsrs-v6';
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

  return {
    settings,
    queueSettings,
    schedulerConfig,
    storageConflictResolution: normalizeConflictResolutionStrategy(input.storageConflictResolution),
    arenaSettings: mergeArenaSettings(input.arenaSettings),
    uiSettings: mergeUISettings(input.uiSettings),
  };
}
