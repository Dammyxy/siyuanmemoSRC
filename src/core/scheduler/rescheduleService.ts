import type { ActionMeta } from '@/types';
import type { FSRSCard } from '@/types/card';
import type {
  PostponeConfig,
  AdvanceConfig,
  SpreadConfig,
  PostponeResult,
  AdvanceResult,
  SpreadResult,
} from '@/types/reschedule';
import { RescheduleErrorCode, type RescheduleError, type Result } from '@/types/reschedule-error';
import { PostponeEngine } from './PostponeEngine';
import { AdvanceEngine } from './AdvanceEngine';
import { SpreadEngine } from './SpreadEngine';
import { ConfigValidator } from './ConfigValidator';
import type { CardUpdatePort, ErrorNotificationPort, RescheduleStoragePort } from './ports';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RescheduleService');

type ProgressCallback = (processed: number, total: number, percentage: number) => void;
type ValidationErrorLike = { message: string } | null;
type ConfigValidatorFn<TConfig> = (config: TConfig) => ValidationErrorLike;

const NOOP_CARD_UPDATER: CardUpdatePort = {
  async batchUpdateCardsWithoutEvents(_cards: FSRSCard[]) {
    return;
  },
};

export class RescheduleService {
  private postponeEngine: PostponeEngine;
  private advanceEngine: AdvanceEngine;
  private spreadEngine: SpreadEngine;

  constructor(
    private readonly unifiedStorage: RescheduleStoragePort,
    private readonly cardUpdater: CardUpdatePort = NOOP_CARD_UPDATER,
    private readonly errorNotifier?: ErrorNotificationPort
  ) {
    this.postponeEngine = new PostponeEngine(unifiedStorage, cardUpdater);
    this.advanceEngine = new AdvanceEngine(unifiedStorage, cardUpdater);
    this.spreadEngine = new SpreadEngine(unifiedStorage, cardUpdater);
  }

  private async notifyError(message: string): Promise<void> {
    await this.errorNotifier?.notifyError(message);
  }

  private classifyErrorCode(message: string): RescheduleErrorCode {
    const text = String(message || '').toLowerCase();
    if (text.includes('network') || text.includes('fetch')) {
      return RescheduleErrorCode.NETWORK_ERROR;
    }
    if (text.includes('storage') || text.includes('database')) {
      return RescheduleErrorCode.STORAGE_ERROR;
    }
    if (text.includes('calculation') || text.includes('nan')) {
      return RescheduleErrorCode.CALCULATION_ERROR;
    }
    if (text.includes('batch') || text.includes('update')) {
      return RescheduleErrorCode.BATCH_UPDATE_FAILED;
    }
    return RescheduleErrorCode.UNKNOWN_ERROR;
  }

  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    errorContext: string
  ): Promise<Result<T, RescheduleError>> {
    try {
      const value = await operation();
      return { ok: true, value };
    } catch (error: unknown) {
      logger.error(`${errorContext}:`, error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        ok: false,
        error: {
          code: this.classifyErrorCode(message),
          message,
          details: error,
        },
      };
    }
  }

  private async getAllCardsSafe(): Promise<FSRSCard[]> {
    const getter = this.unifiedStorage.getAllCards;
    if (!getter) {
      return [];
    }

    const value = getter.call(this.unifiedStorage) as FSRSCard[] | Promise<FSRSCard[]>;
    return await Promise.resolve(value ?? []);
  }

  private async executeValidatedOperation<TConfig, TResult>(params: {
    operationName: string;
    config: TConfig;
    validator: ConfigValidatorFn<TConfig>;
    execute: () => Promise<TResult>;
    buildInvalidResult: (message: string) => TResult;
    buildFailureResult: (message: string) => TResult;
  }): Promise<TResult> {
    const {
      operationName,
      config,
      validator,
      execute,
      buildInvalidResult,
      buildFailureResult,
    } = params;

    const validationError = validator(config);
    if (validationError) {
      logger.error(`Invalid ${operationName} config:`, validationError);
      await this.notifyError(`Invalid configuration: ${validationError.message}`);
      return buildInvalidResult(validationError.message);
    }

    const result = await this.executeWithErrorHandling(execute, operationName);
    if (!result.ok) {
      await this.notifyError(`${operationName} failed: ${result.error.message}`);
      return buildFailureResult(result.error.message);
    }

    return result.value;
  }

  async postponeWithConfig(
    cards: FSRSCard[],
    config: PostponeConfig,
    meta: ActionMeta,
    onProgress?: ProgressCallback
  ): Promise<PostponeResult> {
    return this.executeValidatedOperation({
      operationName: 'postponeWithConfig',
      config,
      validator: ConfigValidator.validatePostponeConfig,
      execute: () => this.postponeEngine.execute(cards, config, false, meta.source, onProgress),
      buildInvalidResult: (message) => ({
        updated: 0,
        skipped: 0,
        skippedReasons: {},
        errors: [message],
      }),
      buildFailureResult: (message) => ({
        updated: 0,
        skipped: 0,
        skippedReasons: {},
        errors: [message],
      }),
    });
  }

  async dilute(
    cards: FSRSCard[],
    config: PostponeConfig,
    meta: ActionMeta,
    onProgress?: ProgressCallback
  ): Promise<PostponeResult> {
    return this.executeValidatedOperation({
      operationName: 'dilute',
      config,
      validator: ConfigValidator.validatePostponeConfig,
      execute: () => this.postponeEngine.execute(cards, config, true, meta.source, onProgress),
      buildInvalidResult: (message) => ({
        updated: 0,
        skipped: 0,
        skippedReasons: {},
        errors: [message],
      }),
      buildFailureResult: (message) => ({
        updated: 0,
        skipped: 0,
        skippedReasons: {},
        errors: [message],
      }),
    });
  }

  async autoPostpone(
    config: PostponeConfig,
    onProgress?: ProgressCallback,
    options?: {
      cards?: FSRSCard[];
    }
  ): Promise<PostponeResult> {
    return this.executeValidatedOperation({
      operationName: 'autoPostpone',
      config,
      validator: ConfigValidator.validatePostponeConfig,
      execute: async () => {
        const sourceCards = Array.isArray(options?.cards)
          ? options.cards
          : await this.getAllCardsSafe();
        const now = Date.now();
        const outstandingCards = sourceCards.filter(card => card.due < now);
        const sortedCards = outstandingCards.sort(
          (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
        );
        const skipCount = config.skipTopNElements ?? 0;
        const cardsToPostpone = sortedCards.slice(skipCount);
        return this.postponeEngine.execute(
          cardsToPostpone,
          config,
          false,
          'auto-postpone',
          onProgress
        );
      },
      buildInvalidResult: (message) => ({
        updated: 0,
        skipped: 0,
        skippedReasons: {},
        errors: [message],
      }),
      buildFailureResult: (message) => ({
        updated: 0,
        skipped: 0,
        skippedReasons: {},
        errors: [message],
      }),
    });
  }

  async advanceWithConfig(
    cards: FSRSCard[],
    config: AdvanceConfig,
    meta: ActionMeta,
    onProgress?: ProgressCallback
  ): Promise<AdvanceResult> {
    return this.executeValidatedOperation({
      operationName: 'advanceWithConfig',
      config,
      validator: ConfigValidator.validateAdvanceConfig,
      execute: () => this.advanceEngine.execute(cards, config, meta.source, onProgress),
      buildInvalidResult: (message) => ({
        updated: 0,
        overdueHandled: 0,
        unchanged: 0,
        errors: [message],
      }),
      buildFailureResult: (message) => ({
        updated: 0,
        overdueHandled: 0,
        unchanged: 0,
        errors: [message],
      }),
    });
  }

  async spreadWithConfig(
    cards: FSRSCard[],
    config: SpreadConfig,
    meta: ActionMeta,
    onProgress?: ProgressCallback
  ): Promise<SpreadResult> {
    return this.executeValidatedOperation({
      operationName: 'spreadWithConfig',
      config,
      validator: ConfigValidator.validateSpreadConfig,
      execute: () => this.spreadEngine.execute(cards, config, meta.source, onProgress),
      buildInvalidResult: (message) => ({
        updated: 0,
        averageCardsPerDay: 0,
        errors: [message],
      }),
      buildFailureResult: (message) => ({
        updated: 0,
        averageCardsPerDay: 0,
        errors: [message],
      }),
    });
  }
}
