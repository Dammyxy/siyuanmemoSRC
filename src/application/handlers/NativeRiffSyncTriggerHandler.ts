import type { ITransactionHandler, Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import {
  classifyTransactionBatch,
  type TransactionClassification,
} from '@/core/infrastructure/websocket/transaction-classifier';
import {
  shouldDispatchNativeRiffFromFanoutPlan,
  type TransactionFanoutPlan,
} from '@/core/infrastructure/websocket/transaction-fanout-coordinator';
import type { IncrementalSyncOptions } from '@/application/services/XiuyuanSyncService.types';
import type FSRSPlugin from '@/index';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NativeRiffSyncTriggerHandler');

type SettingsServiceLike = {
  getSettings: () => {
    riffIntegration?: {
      incrementalSync?: {
        enabled?: boolean;
      };
    };
  };
};

type HybridSyncServiceLike = {
  incrementalSync: (_onProgress?: unknown, _options?: IncrementalSyncOptions) => Promise<unknown>;
  handleNativeRiffUpsert?: (blockIds: string[]) => Promise<unknown>;
  handleNativeRiffRemove?: (blockIds: string[]) => Promise<unknown>;
};

type ApplicationContextLike = {
  getSettingsService?: () => SettingsServiceLike;
  getHybridSyncService?: () => HybridSyncServiceLike | undefined;
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export class NativeRiffSyncTriggerHandler implements ITransactionHandler {
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncInFlight = false;
  private rerunRequested = false;
  private nativeRemoveInFlight = false;
  private readonly pendingNativeRemoveBlockIds = new Set<string>();
  private readonly pendingNativeUpsertBlockIds = new Set<string>();
  private readonly debounceMs: number;

  constructor(
    private readonly plugin: FSRSPlugin,
    options?: {
      debounceMs?: number;
    },
  ) {
    this.debounceMs = Math.max(100, Math.floor(options?.debounceMs ?? 350));
  }

  getTransactionConsumerId(): string {
    return 'native-riff-sync';
  }

  shouldHandleTransactionBatch(classification: TransactionClassification, fanoutPlan?: TransactionFanoutPlan): boolean {
    return fanoutPlan
      ? shouldDispatchNativeRiffFromFanoutPlan(fanoutPlan)
      : classification.nativeRiff.hasSignal;
  }

  handle(
    transactions: Transaction[],
    classification: TransactionClassification = classifyTransactionBatch(transactions),
    fanoutPlan?: TransactionFanoutPlan,
  ): void {
    if (!this.isEnabled()) {
      return;
    }
    if (!this.shouldHandleTransactionBatch(classification, fanoutPlan)) {
      return;
    }

    const nativeRiffPlan = fanoutPlan?.nativeRiff ?? classification.nativeRiff;
    const nativeRemoveBlockIds = nativeRiffPlan.removeBlockIds;
    if (nativeRemoveBlockIds.length > 0) {
      logger.info('[NativeRiffSyncTrigger] Routing native riff remove operations', {
        blockIds: nativeRemoveBlockIds,
      });
      this.queueNativeRiffRemove(nativeRemoveBlockIds);
    }

    const nativeUpsertBlockIds = nativeRiffPlan.upsertBlockIds;
    if (nativeUpsertBlockIds.length > 0) {
      logger.info('[NativeRiffSyncTrigger] Routing native riff add/update operations through scoped incremental sync', {
        blockIds: nativeUpsertBlockIds,
      });
      this.queueNativeRiffUpsert(nativeUpsertBlockIds);
    }
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.rerunRequested = false;
    this.pendingNativeRemoveBlockIds.clear();
    this.pendingNativeUpsertBlockIds.clear();
  }

  private getContext(): ApplicationContextLike | null {
    try {
      return (this.plugin?.getContext?.() as ApplicationContextLike | null) ?? null;
    } catch (error) {
      logger.warn('[NativeRiffSyncTrigger] Failed to access ApplicationContext:', error);
      throw new Error(`NATIVE_RIFF_SYNC_UNAVAILABLE: failed to access ApplicationContext: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private isEnabled(): boolean {
    const context = this.getContext();
    const settingsService = context?.getSettingsService?.();
    const hybridSyncService = context?.getHybridSyncService?.();
    return settingsService?.getSettings().riffIntegration?.incrementalSync?.enabled === true
      && Boolean(hybridSyncService?.incrementalSync);
  }

  private scheduleIncrementalSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runIncrementalSync();
    }, this.debounceMs);
  }

  private async runIncrementalSync(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    if (this.syncInFlight) {
      this.rerunRequested = true;
      return;
    }

    const hybridSyncService = this.getContext()?.getHybridSyncService?.();
    if (!hybridSyncService?.incrementalSync) {
      return;
    }

    const blockIds = uniqueStrings(this.pendingNativeUpsertBlockIds);
    this.pendingNativeUpsertBlockIds.clear();
    if (blockIds.length === 0) {
      logger.warn('[NativeRiffSyncTrigger] Skip native riff upsert without block ids');
      return;
    }

    this.syncInFlight = true;
    try {
      if (typeof hybridSyncService.handleNativeRiffUpsert === 'function') {
        await hybridSyncService.handleNativeRiffUpsert(blockIds);
      } else {
        await hybridSyncService.incrementalSync(undefined, {
          blockIds,
          source: 'native-riff-transaction',
          persistIdleCheckpoint: false,
        });
      }
    } catch (error) {
      logger.warn('[NativeRiffSyncTrigger] Incremental sync failed:', {
        error: error instanceof Error ? error.message : normalizeString(error),
      });
    } finally {
      this.syncInFlight = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.scheduleIncrementalSync();
      }
    }
  }

  private queueNativeRiffUpsert(blockIds: string[]): void {
    for (const blockId of blockIds) {
      this.pendingNativeUpsertBlockIds.add(blockId);
    }
    this.scheduleIncrementalSync();
  }

  private queueNativeRiffRemove(blockIds: string[]): void {
    for (const blockId of blockIds) {
      this.pendingNativeRemoveBlockIds.add(blockId);
    }
    void this.flushNativeRiffRemoveQueue();
  }

  private async flushNativeRiffRemoveQueue(): Promise<void> {
    if (!this.isEnabled() || this.nativeRemoveInFlight || this.pendingNativeRemoveBlockIds.size === 0) {
      return;
    }

    const hybridSyncService = this.getContext()?.getHybridSyncService?.();
    if (typeof hybridSyncService?.handleNativeRiffRemove !== 'function') {
      logger.warn('[NativeRiffSyncTrigger] Native riff remove handler is unavailable; skip local delete routing');
      this.pendingNativeRemoveBlockIds.clear();
      return;
    }

    const blockIds = Array.from(this.pendingNativeRemoveBlockIds);
    this.pendingNativeRemoveBlockIds.clear();
    this.nativeRemoveInFlight = true;

    try {
      await hybridSyncService.handleNativeRiffRemove(blockIds);
    } catch (error) {
      logger.warn('[NativeRiffSyncTrigger] Native riff remove routing failed:', {
        blockIds,
        error: error instanceof Error ? error.message : normalizeString(error),
      });
    } finally {
      this.nativeRemoveInFlight = false;
      if (this.pendingNativeRemoveBlockIds.size > 0) {
        void this.flushNativeRiffRemoveQueue();
      }
    }
  }
}
