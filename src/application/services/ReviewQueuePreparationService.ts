import { QueueType } from '@/types/unified-data-source';
import type { PostponeConfig } from '@/types/reschedule';
import type { QueuePersistencePort } from '@/core/queue/domain/ports';
import type { SettingsService } from '@/application/services/SettingsService';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { RescheduleService } from '@/core/scheduler';
import { getTodayRange } from '@/utils/dateUtils';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewQueuePreparationService');

const PREPARATION_STATE_KEY = 'reviewQueuePreparationState';
const DEFAULT_AUTO_POSTPONE_TOP_N = 20;

type PreparationQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

type PreparationState = {
  version: 1;
  queues: Partial<Record<PreparationQueueType, {
    logicalDayStart: number;
    preparedAt: number;
  }>>;
};

type AutoPostponeRuntimeConfig = {
  enabled: boolean;
  skipTopNElements: number;
  delayFactor: number;
  minInterval: number;
  maxInterval: number;
  modifyDelayByRetrievability: boolean;
  modifyDelayByPriority: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function isPreparationQueueType(queueType: QueueType): queueType is PreparationQueueType {
  return queueType === QueueType.RetrievalPractice || queueType === QueueType.IncrementalLearning;
}

export class ReviewQueuePreparationService {
  constructor(
    private readonly manager: UnifiedDataSourceManager,
    private readonly rescheduleService: RescheduleService,
    private readonly queuePersistence: QueuePersistencePort,
    private readonly settingsService: SettingsService
  ) {}

  async prepareBeforeReview(queueType: QueueType): Promise<void> {
    if (!isPreparationQueueType(queueType)) {
      return;
    }

    const runtimeConfig = this.resolveAutoPostponeRuntimeConfig();
    if (!runtimeConfig.enabled) {
      return;
    }

    const logicalDayStart = this.resolveLogicalDayStart();
    const state = this.loadState();
    const queueState = state.queues[queueType];
    if (queueState?.logicalDayStart === logicalDayStart) {
      logger.debug('Skip preparation: already prepared for current logical day', {
        queueType,
        logicalDayStart,
      });
      return;
    }

    const queue = this.manager.getQueue(queueType);
    const queueCards = await queue.getCards();
    const postponeConfig = this.buildAutoPostponeConfig(runtimeConfig);
    const result = await this.rescheduleService.autoPostpone(
      postponeConfig,
      undefined,
      { cards: queueCards }
    );

    state.queues[queueType] = {
      logicalDayStart,
      preparedAt: Date.now(),
    };
    await this.queuePersistence.set(PREPARATION_STATE_KEY, state);

    if (result.errors && result.errors.length > 0) {
      logger.warn('Queue preparation finished with autoPostpone errors', {
        queueType,
        errors: result.errors,
      });
      return;
    }

    logger.info('Queue preparation completed', {
      queueType,
      updated: result.updated,
      skipped: result.skipped,
      logicalDayStart,
    });
  }

  private resolveLogicalDayStart(): number {
    const dayStartHour = this.manager.getDayStartHour();
    return getTodayRange(dayStartHour).start;
  }

  private loadState(): PreparationState {
    const raw = this.queuePersistence.get<unknown>(PREPARATION_STATE_KEY);
    if (!isRecord(raw)) {
      return {
        version: 1,
        queues: {},
      };
    }

    const queuesRaw = isRecord(raw.queues) ? raw.queues : {};
    const queues: PreparationState['queues'] = {};

    for (const queueType of [QueueType.RetrievalPractice, QueueType.IncrementalLearning] as const) {
      const candidate = queuesRaw[queueType];
      if (!isRecord(candidate)) {
        continue;
      }
      const logicalDayStart = Number(candidate.logicalDayStart);
      const preparedAt = Number(candidate.preparedAt);
      if (!Number.isFinite(logicalDayStart) || !Number.isFinite(preparedAt)) {
        continue;
      }
      queues[queueType] = {
        logicalDayStart,
        preparedAt,
      };
    }

    return {
      version: 1,
      queues,
    };
  }

  private resolveAutoPostponeRuntimeConfig(): AutoPostponeRuntimeConfig {
    const settings = this.settingsService.getSettings();
    const queues = asRecord(settings.queues);
    const autoPostpone = asRecord(queues.autoPostpone);

    const minInterval = clampInt(autoPostpone.minInterval, 1, 1, 36500);
    const maxInterval = clampInt(autoPostpone.maxInterval, 365, minInterval, 36500);

    return {
      enabled: typeof autoPostpone.enabled === 'boolean' ? autoPostpone.enabled : false,
      skipTopNElements: clampInt(
        autoPostpone.skipTopNElements,
        DEFAULT_AUTO_POSTPONE_TOP_N,
        0,
        2000
      ),
      delayFactor: clampNumber(autoPostpone.delayFactor, 1.1, 0.1, 10),
      minInterval,
      maxInterval,
      modifyDelayByRetrievability:
        typeof autoPostpone.modifyDelayByRetrievability === 'boolean'
          ? autoPostpone.modifyDelayByRetrievability
          : false,
      modifyDelayByPriority:
        typeof autoPostpone.modifyDelayByPriority === 'boolean'
          ? autoPostpone.modifyDelayByPriority
          : false,
    };
  }

  private buildAutoPostponeConfig(runtime: AutoPostponeRuntimeConfig): PostponeConfig {
    return {
      delayFactor: runtime.delayFactor,
      minInterval: runtime.minInterval,
      maxInterval: runtime.maxInterval,
      includeNonOutstanding: false,
      skipConditions: {
        skipByPriority: { enabled: false, threshold: 10 },
        skipByInterval: { enabled: false, threshold: 365 },
        skipByRetrievability: { enabled: false, threshold: 0.9 },
        skipByAFactor: { enabled: false, threshold: 1.5 },
        skipByPostponeCount: { enabled: false, threshold: 10 },
      },
      modifyDelayByRetrievability: runtime.modifyDelayByRetrievability,
      modifyDelayByPriority: runtime.modifyDelayByPriority,
      skipTopNElements: runtime.skipTopNElements,
    };
  }
}
