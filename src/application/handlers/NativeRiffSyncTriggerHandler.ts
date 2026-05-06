import type { ITransactionHandler, Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import type { DoOperation } from '@/core/infrastructure/websocket/transaction-types';
import type { IncrementalSyncOptions } from '@/application/services/XiuyuanSyncService.types';
import type FSRSPlugin from '@/index';
import { ATTR_IS_FLASHCARD, ATTR_RIFF_DECKS } from '@/application/services/BlockAttrContract';
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
  handleNativeRiffUpsert?: () => Promise<unknown>;
  handleNativeRiffRemove?: (blockIds: string[]) => Promise<unknown>;
};

type ApplicationContextLike = {
  getSettingsService?: () => SettingsServiceLike;
  getHybridSyncService?: () => HybridSyncServiceLike | undefined;
};

const RELEVANT_UPSERT_ACTIONS = new Set(['insert', 'update', 'delete', 'setAttrs', 'updateAttrs']);
const REMOVE_FLASHCARDS_ACTION = 'removeFlashcards';
const ADD_FLASHCARDS_ACTION = 'addFlashcards';
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

function uniqueStrings(values: Iterable<unknown>): string[] {
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

function extractOperationBlockIds(operation: DoOperation): string[] {
  const data = isRecord(operation.data) ? operation.data : undefined;
  return uniqueStrings([
    ...(operation.blockIDs || []),
    ...(operation.ids || []),
    ...(Array.isArray(data?.blockIDs) ? data.blockIDs : []),
    ...(Array.isArray(data?.ids) ? data.ids : []),
    operation.id,
  ]);
}

function looksLikeNativeRiffUpsert(operation: DoOperation): boolean {
  if (operation.action === ADD_FLASHCARDS_ACTION) {
    return extractOperationBlockIds(operation).length > 0;
  }
  if (looksLikeNativeRiffAttrRemoval(operation)) {
    return false;
  }
  if (!RELEVANT_UPSERT_ACTIONS.has(operation.action)) {
    return false;
  }
  return containsNativeRiffMarker(operation.data?.new)
    || containsNativeRiffMarker(operation.data?.old);
}

function looksLikeNativeRiffAttrRemoval(operation: DoOperation): boolean {
  if (operation.action !== 'setAttrs' && operation.action !== 'updateAttrs') {
    return false;
  }

  const oldHasMarker = containsNativeRiffMarker(operation.data?.old);
  const newHasMarker = containsNativeRiffMarker(operation.data?.new);
  return oldHasMarker && !newHasMarker;
}

function extractNativeRiffRemoveBlockIds(operation: DoOperation): string[] {
  if (operation.action === REMOVE_FLASHCARDS_ACTION) {
    return extractOperationBlockIds(operation);
  }

  if (looksLikeNativeRiffAttrRemoval(operation)) {
    return uniqueStrings([operation.id]);
  }

  return [];
}

export class NativeRiffSyncTriggerHandler implements ITransactionHandler {
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncInFlight = false;
  private rerunRequested = false;
  private nativeRemoveInFlight = false;
  private readonly pendingNativeRemoveBlockIds = new Set<string>();
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

    const nativeRemoveBlockIds = uniqueStrings(
      transactions.flatMap((transaction) => (
        (transaction.doOperations || []).flatMap((operation) => extractNativeRiffRemoveBlockIds(operation))
      )),
    );
    if (nativeRemoveBlockIds.length > 0) {
      logger.info('[NativeRiffSyncTrigger] Routing native riff remove operations', {
        blockIds: nativeRemoveBlockIds,
      });
      this.queueNativeRiffRemove(nativeRemoveBlockIds);
    }

    const hasRelevantUpsert = transactions.some((transaction) => (
      (transaction.doOperations || []).some((operation) => looksLikeNativeRiffUpsert(operation))
    ));
    if (hasRelevantUpsert) {
      logger.info('[NativeRiffSyncTrigger] Routing native riff add/update operations through incremental sync');
      this.scheduleIncrementalSync();
    }
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.rerunRequested = false;
    this.pendingNativeRemoveBlockIds.clear();
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
      if (typeof hybridSyncService.handleNativeRiffUpsert === 'function') {
        await hybridSyncService.handleNativeRiffUpsert();
      } else {
        await hybridSyncService.incrementalSync(undefined, {
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
