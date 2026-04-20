import type { ITransactionHandler, Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import type { DoOperation } from '@/core/infrastructure/websocket/transaction-types';
import type FSRSPlugin from '@/index';
import { ATTR_IS_FLASHCARD, ATTR_RIFF_DECKS } from '@/core/siyuan/block';
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
  incrementalSync: () => Promise<unknown>;
};

type ApplicationContextLike = {
  getSettingsService?: () => SettingsServiceLike;
  getHybridSyncService?: () => HybridSyncServiceLike | undefined;
};

const RELEVANT_ACTIONS = new Set(['insert', 'update', 'delete', 'setAttrs', 'updateAttrs']);
const NATIVE_RIFF_MARKERS = [
  ATTR_RIFF_DECKS,
  ATTR_IS_FLASHCARD,
  'flashcard',
  'riffCardID',
  'riffCardId',
  'riffCard',
  'custom-card-type',
];

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function containsNativeRiffMarker(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }
    return NATIVE_RIFF_MARKERS.some((marker) => normalized.includes(marker));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsNativeRiffMarker(entry));
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => (
    NATIVE_RIFF_MARKERS.includes(key)
    || containsNativeRiffMarker(nested)
  ));
}

function looksLikeNativeRiffOperation(operation: DoOperation): boolean {
  if (!RELEVANT_ACTIONS.has(operation.action)) {
    return false;
  }
  return containsNativeRiffMarker(operation.data?.new)
    || containsNativeRiffMarker(operation.data?.old);
}

export class NativeRiffSyncTriggerHandler implements ITransactionHandler {
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncInFlight = false;
  private rerunRequested = false;
  private readonly debounceMs: number;

  constructor(
    private readonly plugin: FSRSPlugin,
    options?: {
      debounceMs?: number;
    },
  ) {
    this.debounceMs = Math.max(100, Math.floor(options?.debounceMs ?? 350));
  }

  handle(transactions: Transaction[]): void {
    if (!this.isEnabled()) {
      return;
    }
    const hasRelevantChange = transactions.some((transaction) => (
      (transaction.doOperations || []).some((operation) => looksLikeNativeRiffOperation(operation))
    ));
    if (!hasRelevantChange) {
      return;
    }
    this.scheduleIncrementalSync();
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.rerunRequested = false;
  }

  private getContext(): ApplicationContextLike | null {
    try {
      return (this.plugin?.getContext?.() as ApplicationContextLike | null) ?? null;
    } catch (error) {
      logger.warn('[NativeRiffSyncTrigger] Failed to access ApplicationContext:', error);
      return null;
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

    this.syncInFlight = true;
    try {
      await hybridSyncService.incrementalSync();
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
}
