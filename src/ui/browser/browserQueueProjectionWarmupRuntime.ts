import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import type { QueueProjectionReadiness, QueueProjectionReadinessRequest } from '../../../packages/contracts/src/backend-rpc';
import { QueueType } from '@/types/unified-data-source';
import {
  normalizeBrowserQueueId,
  resolveQueueTypeForBrowserQueueId,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import type { QueueProjectionLiveIdentityEvent } from '@/types/queue-projection-live-identity';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';
import type { CardTypeFilter } from './types';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';

type BrowserQueueProjectionWarmupLogger = {
  trace?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

type ReadonlyRef<T> = {
  readonly value: T;
};

type QueueProjectionWarmupScope = {
  activeDocId: string | null;
  activeQueueId: string | null;
  activeScopeDocIds: string[] | null;
  cardType: CardTypeFilter;
  preset: PresetFilter;
  searchText: string;
};

export type BrowserQueueProjectionReviewPressure = {
  active: boolean;
  activeQueueType?: QueueType | null;
};

export type BrowserQueueProjectionWarmupStatus =
  | {
      status: 'ready';
      queueId: BrowserQueueId;
      queueType: QueueType;
      policyId: string;
      generation: number;
      warmedAt: number;
    }
  | {
      status: 'refreshing' | 'unavailable';
      queueId: BrowserQueueId;
      queueType: QueueType;
      policyId: string;
      cause: string;
      reason?: string;
      retryAfterMs?: number;
      warmedAt: number;
    };

export type BrowserQueueProjectionWarmupRuntimeDeps = {
  activeDocId: ReadonlyRef<string | null>;
  activeQueueId: ReadonlyRef<string | null>;
  activeScopeDocIds: ReadonlyRef<string[] | null>;
  browserAppService: ReadonlyRef<IBrowserApplicationService | null | undefined>;
  currentCardType: ReadonlyRef<CardTypeFilter>;
  currentPreset: ReadonlyRef<PresetFilter>;
  logger: BrowserQueueProjectionWarmupLogger;
  onQueueReady?: (status: Extract<BrowserQueueProjectionWarmupStatus, { status: 'ready' }>) => void | Promise<void>;
  reviewPressure?: ReadonlyRef<BrowserQueueProjectionReviewPressure | null | undefined>;
  searchQuery: ReadonlyRef<string>;
};

const DEFAULT_WARMUP_DEBOUNCE_MS = 120;
const ACTIVE_REVIEW_WARMUP_DEFER_MS = 750;
const BROWSER_OPEN_WARMUP_QUEUE_IDS: BrowserQueueId[] = [
  'retrieval',
  'incremental-learning',
  'final-drill',
  'filter-group',
];
const REPAIRABLE_WARMUP_CAUSES = new Set(['projection_stale', 'missing_derived_cache']);

function isWarmableQueue(queueType: QueueType | null): queueType is QueueType {
  return Boolean(queueType && queueType !== QueueType.NeuralRoam);
}

function buildWarmupQueueOrder(
  activeQueueId: string | null,
  targetQueueIds?: BrowserQueueId[],
): BrowserQueueId[] {
  if (targetQueueIds?.length) {
    const deduped = Array.from(new Set(targetQueueIds));
    return deduped.filter((queueId) => isWarmableQueue(resolveQueueTypeForBrowserQueueId(queueId)));
  }
  const active = normalizeBrowserQueueId(activeQueueId);
  return Array.from(new Set(
    active && isWarmableQueue(resolveQueueTypeForBrowserQueueId(active))
      ? [active, ...BROWSER_OPEN_WARMUP_QUEUE_IDS]
      : BROWSER_OPEN_WARMUP_QUEUE_IDS,
  )).filter((queueId) => isWarmableQueue(resolveQueueTypeForBrowserQueueId(queueId)));
}

function normalizeReadinessStatus(
  queueId: BrowserQueueId,
  queueType: QueueType,
  readiness: QueueProjectionReadiness,
): BrowserQueueProjectionWarmupStatus {
  const warmedAt = Date.now();
  if (readiness.status === 'ready') {
    return {
      status: 'ready',
      queueId,
      queueType,
      policyId: readiness.policyId,
      generation: readiness.generation,
      warmedAt,
    };
  }
  return {
    status: readiness.status,
    queueId,
    queueType,
    policyId: readiness.policyId,
    cause: readiness.cause,
    reason: readiness.status === 'unavailable' ? readiness.reason : undefined,
    retryAfterMs: readiness.retryAfterMs,
    warmedAt,
  };
}

function canRepairWarmupStatus(status: BrowserQueueProjectionWarmupStatus): boolean {
  return status.status !== 'ready' && REPAIRABLE_WARMUP_CAUSES.has(status.cause);
}

function isReviewPressureActive(
  pressure: BrowserQueueProjectionReviewPressure | null | undefined,
): pressure is BrowserQueueProjectionReviewPressure {
  return pressure?.active === true;
}

function isReviewPressureVisibleQueue(
  queueId: BrowserQueueId,
  queueType: QueueType,
  scope: QueueProjectionWarmupScope,
  pressure: BrowserQueueProjectionReviewPressure,
): boolean {
  const activeQueueId = normalizeBrowserQueueId(scope.activeQueueId);
  return queueId === activeQueueId || queueType === pressure.activeQueueType;
}

function partitionWarmupQueueIdsForReviewPressure(
  queueIds: BrowserQueueId[],
  scope: QueueProjectionWarmupScope,
  pressure: BrowserQueueProjectionReviewPressure | null | undefined,
): { immediateQueueIds: BrowserQueueId[]; deferredQueueIds: BrowserQueueId[] } {
  if (!isReviewPressureActive(pressure)) {
    return { immediateQueueIds: queueIds, deferredQueueIds: [] };
  }

  const immediateQueueIds: BrowserQueueId[] = [];
  const deferredQueueIds: BrowserQueueId[] = [];
  for (const queueId of queueIds) {
    const queueType = resolveQueueTypeForBrowserQueueId(queueId);
    if (!isWarmableQueue(queueType)) {
      continue;
    }
    if (isReviewPressureVisibleQueue(queueId, queueType, scope, pressure)) {
      immediateQueueIds.push(queueId);
    } else {
      deferredQueueIds.push(queueId);
    }
  }
  return { immediateQueueIds, deferredQueueIds };
}

function resolveRetryDelayMs(status: BrowserQueueProjectionWarmupStatus): number | null {
  if (status.status === 'ready') {
    return null;
  }
  const retryAfterMs = Number(status.retryAfterMs);
  if (!Number.isFinite(retryAfterMs)) {
    return null;
  }
  return Math.max(DEFAULT_WARMUP_DEBOUNCE_MS, Math.floor(retryAfterMs));
}

function buildWarmupRequest(
  scope: QueueProjectionWarmupScope,
  queueType: QueueType,
): QueueProjectionReadinessRequest {
  return {
    queueType,
    preset: scope.preset,
    searchText: scope.searchText,
    docId: scope.activeDocId,
    scopeDocIds: scope.activeScopeDocIds,
    cardType: String(scope.cardType),
    source: 'browser',
  };
}

export function createBrowserQueueProjectionWarmupRuntime(
  deps: BrowserQueueProjectionWarmupRuntimeDeps,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  const targetedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const statuses = new Map<BrowserQueueId, BrowserQueueProjectionWarmupStatus>();

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function clearTargetedTimers(): void {
    for (const targetedTimer of targetedTimers.values()) {
      clearTimeout(targetedTimer);
    }
    targetedTimers.clear();
  }

  function abort(): void {
    generation += 1;
    clearTimer();
    clearTargetedTimers();
  }

  function currentScope(): QueueProjectionWarmupScope {
    return {
      activeDocId: deps.activeDocId.value,
      activeQueueId: deps.activeQueueId.value,
      activeScopeDocIds: deps.activeScopeDocIds.value,
      cardType: deps.currentCardType.value,
      preset: deps.currentPreset.value,
      searchText: deps.searchQuery.value,
    };
  }

  function currentReviewPressure(): BrowserQueueProjectionReviewPressure | null {
    const pressure = deps.reviewPressure?.value;
    return isReviewPressureActive(pressure)
      ? pressure
      : null;
  }

  function logDeferredWarmup(
    reason: string,
    deferredQueueIds: BrowserQueueId[],
    delayMs: number,
    pressure: BrowserQueueProjectionReviewPressure,
  ): void {
    if (deferredQueueIds.length === 0) {
      return;
    }
    deps.logger.trace?.('[SiYuanMemo][SRSBrowser] Queue projection warmup deferred during active Review', {
      reason,
      deferredQueueIds,
      delayMs,
      activeQueueId: normalizeBrowserQueueId(deps.activeQueueId.value),
      activeQueueType: pressure.activeQueueType ?? null,
    });
  }

  function shouldSuppressRepairDuringReview(
    queueId: BrowserQueueId,
    queueType: QueueType,
    scope: QueueProjectionWarmupScope,
    pressure: BrowserQueueProjectionReviewPressure | null,
  ): boolean {
    return Boolean(
      pressure
      && !isReviewPressureVisibleQueue(queueId, queueType, scope, pressure),
    );
  }

  async function runWarmup(
    seq: number,
    reason: string,
    targetQueueIds?: BrowserQueueId[],
    options: { fromReviewDeferral?: boolean } = {},
  ): Promise<void> {
    const service = deps.browserAppService.value;
    if (!service?.ensureQueueReadModelReady) {
      deps.logger.debug?.('[SiYuanMemo][SRSBrowser] Queue projection warmup skipped; readiness service unavailable');
      return;
    }
    const scope = currentScope();
    const queueIds = buildWarmupQueueOrder(
      scope.activeQueueId,
      targetQueueIds,
    );
    const reviewPressure = currentReviewPressure();
    const { immediateQueueIds, deferredQueueIds } = partitionWarmupQueueIdsForReviewPressure(
      queueIds,
      scope,
      reviewPressure,
    );
    if (reviewPressure && deferredQueueIds.length > 0) {
      logDeferredWarmup(reason, deferredQueueIds, ACTIVE_REVIEW_WARMUP_DEFER_MS, reviewPressure);
      scheduleTargeted(reason, ACTIVE_REVIEW_WARMUP_DEFER_MS, deferredQueueIds, { fromReviewDeferral: true });
    }
    for (const queueId of immediateQueueIds) {
      if (seq !== generation) return;
      const queueType = resolveQueueTypeForBrowserQueueId(queueId);
      if (!isWarmableQueue(queueType)) continue;
      const request = buildWarmupRequest(scope, queueType);
      try {
        const readiness = await measureRuntimePerformance(
          'browser',
          'queue-projection.warmup',
          () => service.ensureQueueReadModelReady!(request),
          {
            queueId,
            queueType,
            reason,
          },
        );
        if (seq !== generation) return;
        const status = normalizeReadinessStatus(queueId, queueType, readiness);
        statuses.set(queueId, status);
        deps.logger.trace?.('[SiYuanMemo][SRSBrowser] Queue projection warmup readiness', status);
        if (status.status === 'ready') {
          void Promise.resolve(deps.onQueueReady?.(status)).catch((error) => {
            deps.logger.warn?.('[SiYuanMemo][SRSBrowser] Queue projection warmup ready callback failed', {
              queueId,
              queueType,
              error,
            });
          });
          continue;
        }
        if (shouldSuppressRepairDuringReview(queueId, queueType, scope, reviewPressure)) {
          continue;
        }
        if (canRepairWarmupStatus(status) && typeof service.repairQueueReadModel === 'function') {
          try {
            const repaired = await measureRuntimePerformance(
              'browser',
              'queue-projection.warmup.repair',
              () => service.repairQueueReadModel!(request),
              {
                queueId,
                queueType,
                reason,
                cause: status.cause,
              },
            );
            deps.logger.trace?.('[SiYuanMemo][SRSBrowser] Queue projection warmup repair requested', {
              queueId,
              queueType,
              reason,
              cause: status.cause,
              repaired,
            });
            if (!repaired) {
              const retryDelayMs = resolveRetryDelayMs(status);
              if (retryDelayMs != null) {
                scheduleTargeted(`warmup-retry:${status.cause}`, retryDelayMs, [queueId]);
              }
            }
            continue;
          } catch (repairError) {
            deps.logger.warn?.('[SiYuanMemo][SRSBrowser] Queue projection warmup repair failed', {
              queueId,
              queueType,
              reason,
              cause: status.cause,
              error: repairError instanceof Error ? repairError.message : String(repairError),
            });
          }
        }
        const retryDelayMs = resolveRetryDelayMs(status);
        if (retryDelayMs != null) {
          scheduleTargeted(`warmup-retry:${status.cause}`, retryDelayMs, [queueId]);
        }
      } catch (error) {
        if (seq !== generation) return;
        const status: BrowserQueueProjectionWarmupStatus = {
          status: 'unavailable',
          queueId,
          queueType,
          policyId: 'browser-queue-warmup',
          cause: 'backend_unavailable',
          reason: error instanceof Error ? error.message : String(error),
          retryAfterMs: 300,
          warmedAt: Date.now(),
        };
        statuses.set(queueId, status);
        deps.logger.warn?.('[SiYuanMemo][SRSBrowser] Queue projection warmup failed', status);
      }
    }
  }

  function buildTargetedTimerKey(targetQueueIds: BrowserQueueId[]): string {
    return Array.from(new Set(targetQueueIds)).sort().join('|');
  }

  function scheduleTargeted(
    reason: string,
    delayMs: number,
    targetQueueIds: BrowserQueueId[],
    options: { fromReviewDeferral?: boolean } = {},
  ): void {
    const seq = generation;
    const timerKey = buildTargetedTimerKey(targetQueueIds);
    const existingTimer = targetedTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const targetedTimer = setTimeout(() => {
      targetedTimers.delete(timerKey);
      void runWarmup(seq, reason, targetQueueIds, options);
    }, Math.max(0, Math.floor(delayMs)));
    targetedTimers.set(timerKey, targetedTimer);
  }

  function schedule(reason = 'browser-open', delayMs = DEFAULT_WARMUP_DEBOUNCE_MS, targetQueueIds?: BrowserQueueId[]): void {
    if (targetQueueIds?.length) {
      scheduleTargeted(reason, delayMs, targetQueueIds);
      return;
    }
    const seq = ++generation;
    clearTimer();
    clearTargetedTimers();
    timer = setTimeout(() => {
      timer = null;
      void runWarmup(seq, reason, targetQueueIds);
    }, Math.max(0, Math.floor(delayMs)));
  }

  function handleLiveIdentityEvent(event: QueueProjectionLiveIdentityEvent): void {
    const queueId = normalizeBrowserQueueId(event.queueId);
    if (!queueId) return;
    if (!isWarmableQueue(resolveQueueTypeForBrowserQueueId(queueId))) return;
    if (event.reason !== 'invalidated' && event.reason !== 'refreshed' && event.reason !== 'materialized') {
      return;
    }
    schedule(`live-identity:${event.reason}`, 0, [queueId]);
  }

  function getStatus(queueId: string | null): BrowserQueueProjectionWarmupStatus | null {
    const normalized = normalizeBrowserQueueId(queueId);
    return normalized ? statuses.get(normalized) ?? null : null;
  }

  return {
    abort,
    getStatus,
    handleLiveIdentityEvent,
    schedule,
  };
}
