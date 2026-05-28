import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import type { QueueProjectionReadiness, QueueProjectionReadinessRequest } from '../../../packages/contracts/src/backend-rpc';
import { QueueType } from '@/types/unified-data-source';
import {
  getCanonicalBrowserQueueIds,
  normalizeBrowserQueueId,
  resolveQueueTypeForBrowserQueueId,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import type { QueueProjectionLiveIdentityEvent } from '@/types/queue-projection-live-identity';
import { measureRuntimePerformance } from '@/utils/runtimePerformanceDiagnostics';
import type { CardTypeFilter } from './types';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';

type BrowserQueueProjectionWarmupLogger = {
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
  searchQuery: ReadonlyRef<string>;
};

const DEFAULT_WARMUP_DEBOUNCE_MS = 120;
const MAX_WARMUP_QUEUES = 4;

function isWarmableQueue(queueType: QueueType | null): queueType is QueueType {
  return Boolean(queueType && queueType !== QueueType.NeuralRoam);
}

function buildWarmupQueueOrder(activeQueueId: string | null, targetQueueIds?: BrowserQueueId[]): BrowserQueueId[] {
  if (targetQueueIds?.length) {
    const deduped = Array.from(new Set(targetQueueIds));
    return deduped
      .filter((queueId) => isWarmableQueue(resolveQueueTypeForBrowserQueueId(queueId)))
      .slice(0, MAX_WARMUP_QUEUES);
  }
  const active = normalizeBrowserQueueId(activeQueueId);
  const all = getCanonicalBrowserQueueIds().filter((queueId) =>
    isWarmableQueue(resolveQueueTypeForBrowserQueueId(queueId)),
  );
  const ordered = active && all.includes(active)
    ? [active, ...all.filter((queueId) => queueId !== active)]
    : all;
  return ordered.slice(0, MAX_WARMUP_QUEUES);
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
  const statuses = new Map<BrowserQueueId, BrowserQueueProjectionWarmupStatus>();

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function abort(): void {
    generation += 1;
    clearTimer();
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

  async function runWarmup(seq: number, reason: string, targetQueueIds?: BrowserQueueId[]): Promise<void> {
    const service = deps.browserAppService.value;
    if (!service?.ensureQueueReadModelReady) {
      deps.logger.debug?.('[SiYuanMemo][SRSBrowser] Queue projection warmup skipped; readiness service unavailable');
      return;
    }
    const scope = currentScope();
    const queueIds = buildWarmupQueueOrder(scope.activeQueueId, targetQueueIds);
    for (const queueId of queueIds) {
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
        deps.logger.info('[SiYuanMemo][SRSBrowser] Queue projection warmup readiness', status);
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

  function schedule(reason = 'browser-open', delayMs = DEFAULT_WARMUP_DEBOUNCE_MS, targetQueueIds?: BrowserQueueId[]): void {
    const seq = ++generation;
    clearTimer();
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
