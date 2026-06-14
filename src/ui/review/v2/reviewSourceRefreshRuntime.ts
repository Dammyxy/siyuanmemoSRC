import type { TransactionClassification } from '@/core/infrastructure/websocket/transaction-classifier';
import type {
  BackendReviewSourceRefreshExecuteRequest,
  BackendReviewSourceRefreshExecuteResult,
} from '../../../../packages/contracts/src/backend-rpc';

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
  handle(transactions: ReviewWorkspaceTransaction[], classification?: Pick<TransactionClassification, 'changedBlockIds'>): void;
  shouldHandleTransactionBatch?: (classification: Pick<TransactionClassification, 'changedBlockIds'>) => boolean;
  getTransactionConsumerId?: () => string;
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
  maxWaitMs?: number;
  suppressionMs?: number;
  isEnabled: () => boolean;
  isAdvancePending: () => boolean;
  getCurrentReference: () => ReviewSourceRefreshReference;
  getDependencyBlockIds: () => string[];
  resolveBackendImpact?: (
    request: BackendReviewSourceRefreshExecuteRequest,
  ) => Promise<BackendReviewSourceRefreshExecuteResult>;
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

export type ReviewSourceRefreshCoordinatorSubscription = {
  surfaceId: string;
  getDependencyBlockIds: () => string[];
  queue: (blockIds: string[]) => void;
};

export type ReviewSourceRefreshCoordinator = ReviewTransactionHandler & {
  subscribe(subscription: ReviewSourceRefreshCoordinatorSubscription): () => void;
  unsubscribe(surfaceId: string): void;
  refreshSubscription(surfaceId: string): void;
  bindTransactionService(service: ReviewTransactionWebSocketServiceLike | null): void;
  handleClassification(classification: Pick<TransactionClassification, 'changedBlockIds'>): void;
  clear(): void;
};

export type ReviewSourceRefreshHostContentExpose = {
  getDependencyBlockIds?: () => string[];
};

export type ReviewSourceRefreshHostContentSnapshot = {
  id?: unknown;
  answerBlockID?: unknown;
  card?: {
    id?: unknown;
    blockId?: unknown;
  } | null;
};

export type ReviewSourceRefreshDependencyInput = {
  contentExpose?: ReviewSourceRefreshHostContentExpose | null;
  content: ReviewSourceRefreshHostContentSnapshot;
};

export type ReviewSourceRefreshHostRuntimeOptions = {
  surfaceId: string;
  runtime: Pick<ReviewSourceRefreshRuntime, 'queue' | 'clearPending' | 'clear'>;
  coordinator: Pick<ReviewSourceRefreshCoordinator, 'subscribe' | 'unsubscribe' | 'refreshSubscription' | 'bindTransactionService'>;
  isEnabled: () => boolean;
  getTransactionService: () => ReviewTransactionWebSocketServiceLike | null;
  getContentExpose: () => ReviewSourceRefreshHostContentExpose | null;
  getContentSnapshot: () => ReviewSourceRefreshHostContentSnapshot;
  onDependencyChanged?: () => void;
};

export type ReviewSourceRefreshHostRuntime = {
  getDependencyBlockIds(): string[];
  getDependencySignature(): string;
  handleDependencyChange(): void;
  bindTransactionService(): void;
  unbind(): void;
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

function addNormalizedId(target: Set<string>, value: unknown): void {
  const blockId = normalizeId(value);
  if (blockId.length > 0) {
    target.add(blockId);
  }
}

export function collectReviewSourceRefreshDependencyBlockIds(
  input: ReviewSourceRefreshDependencyInput,
): string[] {
  const normalized = new Set<string>();
  for (const blockId of input.contentExpose?.getDependencyBlockIds?.() || []) {
    addNormalizedId(normalized, blockId);
  }
  addNormalizedId(normalized, input.content.id);
  addNormalizedId(normalized, input.content.answerBlockID);
  addNormalizedId(normalized, input.content.card?.blockId);
  return Array.from(normalized);
}

export function createReviewSourceRefreshDependencySignature(
  content: ReviewSourceRefreshHostContentSnapshot,
): string {
  return [
    content.card?.id,
    content.id,
    content.answerBlockID,
    content.card?.blockId,
  ]
    .map((value) => normalizeId(value))
    .join('\u0001');
}

export function createReviewSourceRefreshHostRuntime(
  options: ReviewSourceRefreshHostRuntimeOptions,
): ReviewSourceRefreshHostRuntime {
  let subscribedTransactionService: ReviewTransactionWebSocketServiceLike | null = null;
  let subscribed = false;

  const getDependencyBlockIds = (): string[] => collectReviewSourceRefreshDependencyBlockIds({
    contentExpose: options.getContentExpose(),
    content: options.getContentSnapshot(),
  });

  const getDependencySignature = (): string => createReviewSourceRefreshDependencySignature(
    options.getContentSnapshot(),
  );

  const handleDependencyChange = (): void => {
    options.runtime.clearPending();
    if (subscribed) {
      options.coordinator.refreshSubscription(options.surfaceId);
    }
    options.onDependencyChanged?.();
  };

  const unbind = (): void => {
    options.runtime.clear();
    if (subscribed) {
      options.coordinator.unsubscribe(options.surfaceId);
      subscribed = false;
    }
    subscribedTransactionService = null;
  };

  const bindTransactionService = (): void => {
    if (!options.isEnabled()) {
      unbind();
      return;
    }

    const transactionService = options.getTransactionService();
    if (!subscribed) {
      options.coordinator.subscribe({
        surfaceId: options.surfaceId,
        getDependencyBlockIds,
        queue: (blockIds) => options.runtime.queue(blockIds),
      });
      subscribed = true;
    } else {
      options.coordinator.refreshSubscription(options.surfaceId);
    }

    if (transactionService === subscribedTransactionService) {
      options.coordinator.bindTransactionService(transactionService);
      return;
    }

    subscribedTransactionService = transactionService;
    options.coordinator.bindTransactionService(transactionService);
  };

  return {
    getDependencyBlockIds,
    getDependencySignature,
    handleDependencyChange,
    bindTransactionService,
    unbind,
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
  const maxWaitMs = Math.max(debounceMs, options.maxWaitMs ?? 2_000);
  const suppressionMs = Math.max(0, options.suppressionMs ?? DEFAULT_SOURCE_REFRESH_SUPPRESSION_MS);
  const now = options.now ?? (() => Date.now());
  const schedule = options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout));
  const cancel = options.clearTimeout ?? ((timerId) => globalThis.clearTimeout(timerId));
  const pendingBlockIds = new Set<string>();
  const suppressedBlockIds = new Map<string, number>();
  let refreshTimer: TimerId | null = null;
  let maxWaitTimer: TimerId | null = null;
  let refreshInFlight = false;
  let dirtyWhileInFlight = false;

  const clearTimer = (): void => {
    if (refreshTimer !== null) {
      cancel(refreshTimer);
      refreshTimer = null;
    }
  };

  const clearMaxWaitTimer = (): void => {
    if (maxWaitTimer !== null) {
      cancel(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const scheduleFlush = (timeoutMs: number): void => {
    clearTimer();
    refreshTimer = schedule(() => {
      refreshTimer = null;
      void flush();
    }, timeoutMs);
    if (maxWaitTimer === null && maxWaitMs > debounceMs) {
      maxWaitTimer = schedule(() => {
        maxWaitTimer = null;
        clearTimer();
        void flush();
      }, maxWaitMs);
    }
  };

  const clearPending = (): void => {
    clearTimer();
    clearMaxWaitTimer();
    pendingBlockIds.clear();
    dirtyWhileInFlight = false;
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
    if (refreshInFlight) {
      dirtyWhileInFlight = pendingBlockIds.size > 0;
      return;
    }

    const pending = Array.from(pendingBlockIds);
    pendingBlockIds.clear();
    clearMaxWaitTimer();
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

    const currentReference = normalizeReference(options.getCurrentReference());
    if (!currentReference.cardId && !currentReference.blockId) {
      return;
    }

    const request: BackendReviewSourceRefreshExecuteRequest = {
      commandId: `review-source-refresh:${currentReference.cardId || currentReference.blockId}:${timestamp}`,
      idempotencyKey: `review-source-refresh:${currentReference.cardId || currentReference.blockId}:${effectiveBlockIds.join(',')}:${timestamp}`,
      sessionId: 'review-v2',
      currentCardId: currentReference.cardId || null,
      currentBlockId: currentReference.blockId || null,
      changedBlockIds: effectiveBlockIds,
      dependencyBlockIds: Array.from(dependencyBlockIds),
    };
    const impact = options.resolveBackendImpact
      ? await options.resolveBackendImpact(request)
      : null;
    const matchedBlockIds = impact
      ? impact.matchedBlockIds
      : effectiveBlockIds.filter((blockId) => dependencyBlockIds.has(blockId));
    if (matchedBlockIds.length === 0 || impact?.impact.refreshVisibleContent === false) {
      return;
    }
    if (impact?.status === 'unavailable' || impact?.status === 'failed') {
      options.logger?.debug?.('[SiYuanMemo][ReviewView] Source refresh backend impact unavailable:', {
        status: impact.status,
        reason: impact.reason,
        currentCardId: currentReference.cardId,
        currentBlockId: currentReference.blockId,
      });
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

    refreshInFlight = true;
    try {
      await options.refreshVisibleContent('source-transaction');
    } finally {
      refreshInFlight = false;
      if (dirtyWhileInFlight && pendingBlockIds.size > 0) {
        dirtyWhileInFlight = false;
        scheduleFlush(debounceMs);
      } else {
        dirtyWhileInFlight = false;
      }
    }
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

    if (refreshInFlight) {
      dirtyWhileInFlight = true;
    }
    scheduleFlush(debounceMs);
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

export function createReviewSourceRefreshCoordinator(): ReviewSourceRefreshCoordinator {
  const subscriptions = new Map<string, ReviewSourceRefreshCoordinatorSubscription>();
  const dependencyIndex = new Map<string, Set<string>>();
  let boundService: ReviewTransactionWebSocketServiceLike | null = null;
  let registered = false;

  const addDependency = (blockId: string, surfaceId: string): void => {
    const normalized = normalizeId(blockId);
    if (!normalized) {
      return;
    }
    const surfaceIds = dependencyIndex.get(normalized) ?? new Set<string>();
    surfaceIds.add(surfaceId);
    dependencyIndex.set(normalized, surfaceIds);
  };

  const removeSurfaceFromIndex = (surfaceId: string): void => {
    for (const [blockId, surfaceIds] of dependencyIndex.entries()) {
      surfaceIds.delete(surfaceId);
      if (surfaceIds.size === 0) {
        dependencyIndex.delete(blockId);
      }
    }
  };

  const refreshSubscription = (surfaceId: string): void => {
    const subscription = subscriptions.get(surfaceId);
    if (!subscription) {
      return;
    }
    removeSurfaceFromIndex(surfaceId);
    for (const blockId of subscription.getDependencyBlockIds()) {
      addDependency(blockId, surfaceId);
    }
  };

  const maybeRegister = (handler: ReviewSourceRefreshCoordinator): void => {
    if (registered || subscriptions.size === 0 || !boundService?.registerHandler) {
      return;
    }
    boundService.registerHandler(handler);
    registered = true;
  };

  const maybeUnregister = (handler: ReviewSourceRefreshCoordinator): void => {
    if (!registered || subscriptions.size > 0 || !boundService?.unregisterHandler) {
      return;
    }
    boundService.unregisterHandler(handler);
    registered = false;
  };

  const coordinator: ReviewSourceRefreshCoordinator = {
    getTransactionConsumerId: () => 'review-source-refresh',
    shouldHandleTransactionBatch(classification): boolean {
      if (subscriptions.size === 0 || dependencyIndex.size === 0) {
        return false;
      }
      return classification.changedBlockIds.some((blockId) => dependencyIndex.has(normalizeId(blockId)));
    },
    handle(transactions, classification): void {
      if (classification) {
        coordinator.handleClassification(classification);
        return;
      }
      coordinator.handleClassification({
        changedBlockIds: collectChangedBlockIdsFromReviewTransactions(transactions),
      });
    },
    handleClassification(classification): void {
      const matchedBlockIdsBySurface = new Map<string, Set<string>>();
      for (const blockId of classification.changedBlockIds) {
        const normalized = normalizeId(blockId);
        if (!normalized) {
          continue;
        }
        for (const surfaceId of dependencyIndex.get(normalized) || []) {
          const surfaceBlockIds = matchedBlockIdsBySurface.get(surfaceId) ?? new Set<string>();
          surfaceBlockIds.add(normalized);
          matchedBlockIdsBySurface.set(surfaceId, surfaceBlockIds);
        }
      }

      for (const [surfaceId, matchedBlockIds] of matchedBlockIdsBySurface.entries()) {
        subscriptions.get(surfaceId)?.queue(Array.from(matchedBlockIds));
      }
    },
    subscribe(subscription): () => void {
      subscriptions.set(subscription.surfaceId, subscription);
      refreshSubscription(subscription.surfaceId);
      maybeRegister(coordinator);
      return () => coordinator.unsubscribe(subscription.surfaceId);
    },
    unsubscribe(surfaceId): void {
      subscriptions.delete(surfaceId);
      removeSurfaceFromIndex(surfaceId);
      maybeUnregister(coordinator);
    },
    refreshSubscription,
    bindTransactionService(service): void {
      if (service === boundService) {
        maybeRegister(coordinator);
        return;
      }
      if (registered && boundService?.unregisterHandler) {
        boundService.unregisterHandler(coordinator);
      }
      registered = false;
      boundService = service;
      maybeRegister(coordinator);
    },
    clear(): void {
      if (registered && boundService?.unregisterHandler) {
        boundService.unregisterHandler(coordinator);
      }
      registered = false;
      boundService = null;
      subscriptions.clear();
      dependencyIndex.clear();
    },
  };

  return coordinator;
}

let sharedReviewSourceRefreshCoordinator: ReviewSourceRefreshCoordinator | null = null;

export function getSharedReviewSourceRefreshCoordinator(): ReviewSourceRefreshCoordinator {
  if (!sharedReviewSourceRefreshCoordinator) {
    sharedReviewSourceRefreshCoordinator = createReviewSourceRefreshCoordinator();
  }
  return sharedReviewSourceRefreshCoordinator;
}
