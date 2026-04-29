type TimerId = ReturnType<typeof globalThis.setTimeout>;

type ReviewSourceRefreshLogger = {
  debug?: (...args: unknown[]) => void;
};

export type ReviewWorkspaceTransactionOperation = {
  id?: unknown;
  parentID?: unknown;
  previousID?: unknown;
  nextID?: unknown;
};

export type ReviewWorkspaceTransaction = {
  doOperations?: ReviewWorkspaceTransactionOperation[] | null;
};

export type ReviewTransactionHandler = {
  handle(transactions: ReviewWorkspaceTransaction[]): void;
};

export type ReviewTransactionWebSocketServiceLike = {
  registerHandler?: (handler: ReviewTransactionHandler) => void;
  unregisterHandler?: (handler: ReviewTransactionHandler) => void;
};

export type ReviewSourceRefreshReference = {
  cardId?: string;
  blockId?: string;
};

export type ReviewSourceRefreshRuntimeOptions = {
  debounceMs?: number;
  suppressionMs?: number;
  isEnabled: () => boolean;
  isAdvancePending: () => boolean;
  getCurrentReference: () => ReviewSourceRefreshReference;
  getDependencyBlockIds: () => string[];
  isMainProtyleEditing: () => boolean;
  refreshVisibleContent: (reason: 'source-transaction') => Promise<unknown> | unknown;
  logger?: ReviewSourceRefreshLogger;
  now?: () => number;
  setTimeout?: (handler: () => void, timeout: number) => TimerId;
  clearTimeout?: (timerId: TimerId) => void;
};

export type ReviewSourceRefreshRuntime = {
  transactionHandler: ReviewTransactionHandler;
  queue(blockIds: string[]): void;
  flush(): Promise<void>;
  suppressBlock(blockId: string): void;
  clearPending(): void;
  clear(): void;
};

const DEFAULT_SOURCE_REFRESH_DEBOUNCE_MS = 200;
const DEFAULT_SOURCE_REFRESH_SUPPRESSION_MS = 600;

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeReference(reference: ReviewSourceRefreshReference): { cardId: string; blockId: string } {
  return {
    cardId: normalizeId(reference.cardId),
    blockId: normalizeId(reference.blockId),
  };
}

export function collectChangedBlockIdsFromReviewTransactions(
  transactions: ReviewWorkspaceTransaction[],
): string[] {
  const changedBlockIds = new Set<string>();

  for (const transaction of transactions) {
    for (const operation of transaction.doOperations || []) {
      for (const candidate of [operation.id, operation.parentID, operation.previousID, operation.nextID]) {
        const normalized = normalizeId(candidate);
        if (normalized.length > 0) {
          changedBlockIds.add(normalized);
        }
      }
    }
  }

  return Array.from(changedBlockIds);
}

export function createReviewSourceRefreshRuntime(
  options: ReviewSourceRefreshRuntimeOptions,
): ReviewSourceRefreshRuntime {
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_SOURCE_REFRESH_DEBOUNCE_MS);
  const suppressionMs = Math.max(0, options.suppressionMs ?? DEFAULT_SOURCE_REFRESH_SUPPRESSION_MS);
  const now = options.now ?? (() => Date.now());
  const schedule = options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout));
  const cancel = options.clearTimeout ?? ((timerId) => globalThis.clearTimeout(timerId));
  const pendingBlockIds = new Set<string>();
  const suppressedBlockIds = new Map<string, number>();
  let refreshTimer: TimerId | null = null;

  const clearTimer = (): void => {
    if (refreshTimer !== null) {
      cancel(refreshTimer);
      refreshTimer = null;
    }
  };

  const clearPending = (): void => {
    clearTimer();
    pendingBlockIds.clear();
  };

  const pruneSuppression = (timestamp: number): void => {
    for (const [blockId, expiresAt] of suppressedBlockIds.entries()) {
      if (expiresAt <= timestamp) {
        suppressedBlockIds.delete(blockId);
      }
    }
  };

  const flush = async (): Promise<void> => {
    if (!options.isEnabled() || options.isAdvancePending()) {
      clearPending();
      return;
    }

    const pending = Array.from(pendingBlockIds);
    pendingBlockIds.clear();
    if (pending.length === 0) {
      return;
    }

    const timestamp = now();
    pruneSuppression(timestamp);
    const effectiveBlockIds = pending.filter((blockId) => {
      const expiresAt = suppressedBlockIds.get(blockId);
      return !expiresAt || expiresAt <= timestamp;
    });
    if (effectiveBlockIds.length === 0) {
      return;
    }

    const dependencyBlockIds = new Set(
      options.getDependencyBlockIds()
        .map(normalizeId)
        .filter((blockId) => blockId.length > 0),
    );
    if (dependencyBlockIds.size === 0) {
      return;
    }

    const matchedBlockIds = effectiveBlockIds.filter((blockId) => dependencyBlockIds.has(blockId));
    if (matchedBlockIds.length === 0) {
      return;
    }

    const currentReference = normalizeReference(options.getCurrentReference());
    if (!currentReference.cardId && !currentReference.blockId) {
      return;
    }

    options.logger?.debug?.('[SiYuanMemo][ReviewView] Refreshing current review card for source block changes:', {
      matchedBlockIds,
      currentCardId: currentReference.cardId,
      currentBlockId: currentReference.blockId,
    });

    if (options.isMainProtyleEditing()) {
      options.logger?.debug?.('[SiYuanMemo][ReviewView] Skip source refresh while native Protyle editing is active:', {
        matchedBlockIds,
        currentCardId: currentReference.cardId,
        currentBlockId: currentReference.blockId,
      });
      return;
    }

    await options.refreshVisibleContent('source-transaction');
  };

  const queue = (blockIds: string[]): void => {
    if (!options.isEnabled() || options.isAdvancePending()) {
      clearPending();
      return;
    }

    for (const blockId of blockIds) {
      const normalized = normalizeId(blockId);
      if (normalized.length > 0) {
        pendingBlockIds.add(normalized);
      }
    }

    if (pendingBlockIds.size === 0) {
      return;
    }

    clearTimer();
    refreshTimer = schedule(() => {
      refreshTimer = null;
      void flush();
    }, debounceMs);
  };

  const transactionHandler: ReviewTransactionHandler = {
    handle(transactions: ReviewWorkspaceTransaction[]): void {
      if (!options.isEnabled() || options.isAdvancePending()) {
        clearPending();
        return;
      }

      const changedBlockIds = collectChangedBlockIdsFromReviewTransactions(transactions);
      if (changedBlockIds.length > 0) {
        queue(changedBlockIds);
      }
    },
  };

  return {
    transactionHandler,
    queue,
    flush,
    suppressBlock(blockId: string): void {
      const normalized = normalizeId(blockId);
      if (!normalized) {
        return;
      }
      suppressedBlockIds.set(normalized, now() + suppressionMs);
    },
    clearPending,
    clear(): void {
      clearPending();
      suppressedBlockIds.clear();
    },
  };
}
