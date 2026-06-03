import {
  QueueType,
  type IReviewQueue,
  type QueueProjectionRolloutDiagnostic,
  type QueueProjectionRolloutReason,
  type QueueProjectionRolloutState,
  type QueueProjectionSnapshot,
} from '@/types/unified-data-source';
import type {
  QueueProjectionLiveIdentityEvent,
  QueueProjectionLiveIdentityListener,
  QueueProjectionLiveIdentityReason,
  QueueProjectionLiveIdentitySource,
} from '@/types/queue-projection-live-identity';
import { normalizeQueueProjectionIdentity } from '@/types/queue-projection-live-identity';
import type { CardType, FSRSCard } from '@/types/card';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { createDependencyUnavailableError } from '@/core/queue/dependencyErrors';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  type BackendQueueProjectionFreshnessEvidence,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  QueueProjectionReadiness,
  QueueProjectionReadinessRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import { buildOrderedQueueProjectionRows } from './QueueProjectionBuilder';
import { QueueProjectionReadinessService } from './QueueProjectionReadinessService';
import { measureRuntimePerformance, startRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';

type QueueProjectionRuntimeLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

type QueueProjectionBackendClient = {
  queueProjectionSnapshot?: (
    request: BackendQueueProjectionSnapshotRequest,
  ) => Promise<BackendQueueProjectionSnapshotResult>;
  queueProjectionRowsByIds?: (
    request: { queueType: string; ids: string[]; policyHash?: string | null; generation?: number | null },
  ) => Promise<BackendQueueProjectionRowsByIdsResult>;
  queueProjectionReplace?: (
    request: QueueProjectionReplaceRequestLike,
  ) => Promise<BackendQueueProjectionReplaceResult>;
  neuralRoamAdvance?: (
    request: BackendNeuralRoamAdvanceRequest,
  ) => Promise<BackendNeuralRoamAdvanceResult>;
};

type FrontendRuntimeLike = {
  getMode?: () => 'writer' | 'follower' | string;
  getInstanceId?: () => string;
};

type FollowerCommandClientLike = {
  submitAndWait?: <TResult>(request: {
    instanceId: string;
    method: string;
    params?: unknown;
  }) => Promise<TResult>;
};

interface QueueProjectionUnavailableDiagnostic {
  reason: QueueProjectionRolloutReason;
  unavailableReason: QueueProjectionRolloutReason | string;
  backendStatus: string | null;
  policyHash: string | null;
  generation: number | null;
  checkedAt: number;
  freshness: BackendQueueProjectionFreshnessEvidence | null;
}

interface QueueProjectionReplaceRequestLike {
  queueType: string;
  policyHash: string;
  generation?: number | null;
  reason?: string | null;
  rows: QueueProjectionRow[];
  metadata?: Record<string, unknown> | null;
}

interface MaterializedQueueProjectionEcho {
  policyHash: string;
  generation: number;
  snapshot: QueueProjectionSnapshot;
  cardsByRowId: Map<string, FSRSCard>;
  cachedAt: number;
}

export type QueueProjectionRuntimeDeps = {
  getBackendClient: () => QueueProjectionBackendClient | null | undefined;
  getFollowerCommandClient: () => FollowerCommandClientLike | null | undefined;
  getFrontendRuntime: () => FrontendRuntimeLike | null | undefined;
  getQueue: (queueType: QueueType) => IReviewQueue;
  getQueueProjectionRolloutState: (queueType: QueueType) => QueueProjectionRolloutState | string | null | undefined;
  publishQueueProjectionIdentityBroadcast?: (event: QueueProjectionLiveIdentityEvent) => void | Promise<void>;
  logger: QueueProjectionRuntimeLogger;
};

const QUEUE_PROJECTION_ROLLOUT_ORDER: QueueType[] = [
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
  QueueType.FilterGroup,
  QueueType.FinalDrill,
  QueueType.Leech,
  QueueType.NeuralRoam,
];

const QUEUE_PROJECTION_BACKED_TYPES = new Set<QueueType>([
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
  QueueType.FilterGroup,
  QueueType.FinalDrill,
  QueueType.Leech,
]);

const QUEUE_PROJECTION_READABLE_TYPES = new Set<QueueType>([
  ...QUEUE_PROJECTION_BACKED_TYPES,
  QueueType.NeuralRoam,
]);

const QUEUE_PROJECTION_READINESS_MATERIALIZABLE_TYPES = new Set<QueueType>([
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
  QueueType.FinalDrill,
  QueueType.FilterGroup,
]);
const QUEUE_PROJECTION_MATERIALIZATION_SHORT_AWAIT_MS = 300;

const DEFAULT_QUEUE_PROJECTION_ROLLOUT_STATES: Record<QueueType, QueueProjectionRolloutState> = {
  [QueueType.RetrievalPractice]: 'backend-projection',
  [QueueType.IncrementalLearning]: 'backend-projection',
  [QueueType.FilterGroup]: 'backend-projection',
  [QueueType.FinalDrill]: 'backend-projection',
  [QueueType.Leech]: 'backend-projection',
  [QueueType.NeuralRoam]: 'advance-contract-unavailable',
};

const QUEUE_PROJECTION_PENDING_NEXT_STEPS: Partial<Record<QueueType, string>> = {
  [QueueType.FilterGroup]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
  [QueueType.FinalDrill]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
  [QueueType.Leech]: 'Projection parity is implemented; existing strategy reads are now only an explicit rollback/parity-checking override.',
  [QueueType.NeuralRoam]: 'Wire neural-roam.advance before NeuralRoam can enter review; projection is browser/count/diagnostic only.',
};

export class QueueProjectionRuntime {
  private readonly materializedProjectionEchoes = new Map<QueueType, MaterializedQueueProjectionEcho>();
  private readonly queueProjectionReadiness: QueueProjectionReadinessService;
  private readonly queueProjectionUnavailableDiagnostics = new Map<QueueType, QueueProjectionUnavailableDiagnostic>();
  private readonly liveIdentityListeners = new Set<QueueProjectionLiveIdentityListener>();
  private readonly publishedReadyIdentities = new Map<QueueType, string>();
  private readonly materializationInFlight = new Map<string, Promise<BackendQueueProjectionReplaceResult | null>>();

  constructor(private readonly deps: QueueProjectionRuntimeDeps) {
    this.queueProjectionReadiness = new QueueProjectionReadinessService({
      readSnapshot: async (request) => this.readRawQueueProjectionSnapshot(request),
    });
  }

  async ensureReady(request: QueueProjectionReadinessRequest): Promise<QueueProjectionReadiness> {
    const queueType = this.normalizeQueueType(request.queueType);
    if (!queueType || !this.isQueueProjectionReadable(queueType)) {
      return {
        status: 'unavailable',
        queueId: String(request.queueType || ''),
        policyId: '',
        cause: 'invalid_queue',
        reason: `queue projection is not readable for ${String(request.queueType || '')}`,
        recoverable: false,
      };
    }

    const readiness = await this.queueProjectionReadiness.ensureReady({
      ...request,
      queueType,
    });
    if (readiness.status === 'ready') {
      this.clearQueueProjectionUnavailable(queueType);
      this.emitReadyLiveIdentity(queueType, {
        policyHash: readiness.policyId,
        generation: readiness.generation,
        reason: 'refreshed',
        source: 'runtime',
      });
      return readiness;
    }
    if (readiness.status === 'refreshing') {
      const currentDiagnostic = this.queueProjectionUnavailableDiagnostics.get(queueType);
      const currentGeneration = this.resolveReadinessMaterializationGeneration(queueType);
      this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
        unavailableReason: readiness.cause,
        backendStatus: currentDiagnostic?.backendStatus ?? readiness.status,
        policyHash: currentDiagnostic?.policyHash ?? readiness.policyId,
        generation: currentGeneration > 0 ? currentGeneration : currentDiagnostic?.generation ?? null,
        freshness: currentDiagnostic?.freshness ?? null,
      });
      if (this.shouldMaterializeDuringReadiness(queueType, readiness)) {
        const backend = this.deps.getBackendClient();
        if (!this.canSubmitQueueProjectionReplace(backend)) {
          const cause = this.isCurrentInstanceFollower()
            ? 'writer_unavailable'
            : 'backend_unavailable';
          this.recordQueueProjectionUnavailable(queueType, 'projection-unavailable', {
            unavailableReason: cause,
            backendStatus: 'unavailable',
            policyHash: readiness.policyId,
            generation: null,
            freshness: currentDiagnostic?.freshness ?? null,
          });
          return {
            status: 'unavailable',
            queueId: queueType,
            policyId: readiness.policyId,
            cause,
            reason: `queue projection materialization unavailable for ${queueType}`,
            recoverable: true,
            retryAfterMs: 300,
          };
        }
        try {
          const result = await this.awaitMaterializationShortWindow(this.tryMaterializeQueueProjection(queueType, backend, {
            currentPolicyHash: readiness.policyId,
            currentGeneration,
            reason: readiness.cause,
            readinessRequest: {
              ...request,
              queueType,
            },
          }));
          if (result && result.status === 'ready') {
            this.clearQueueProjectionUnavailable(queueType);
            return {
              status: 'ready',
              queueId: queueType,
              policyId: result.policyHash,
              generation: result.generation,
            };
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const cause = this.isCurrentInstanceFollower()
            ? 'writer_unavailable'
            : 'materialization_failed';
          this.deps.logger.warn('Queue projection materialization failed during readiness', {
            queueType,
            cause,
            reason,
          });
          this.recordQueueProjectionUnavailable(queueType, 'projection-unavailable', {
            unavailableReason: cause,
            backendStatus: 'unavailable',
            policyHash: readiness.policyId,
            generation: null,
          });
          return {
            status: 'unavailable',
            queueId: queueType,
            policyId: readiness.policyId,
            cause,
            reason,
            recoverable: true,
            retryAfterMs: 300,
          };
        }
      }
      return readiness;
    }

    this.recordQueueProjectionUnavailable(queueType, readiness.recoverable ? 'refresh-required' : 'projection-unavailable', {
      unavailableReason: readiness.cause,
      backendStatus: readiness.status,
      policyHash: readiness.policyId || null,
      generation: null,
    });
    return readiness;
  }

  async readSnapshot(
    queueType: QueueType,
    options: { forceRefresh?: boolean } = {},
  ): Promise<QueueProjectionSnapshot | null> {
    if (!this.isQueueProjectionReadable(queueType)) {
      this.deps.logger.info('Queue projection rollout diagnostic', {
        ...this.getRolloutDiagnostics(queueType)[0],
        forceRefresh: options.forceRefresh === true,
      });
      return null;
    }

    const backend = this.deps.getBackendClient();
    if (!backend || typeof backend.queueProjectionSnapshot !== 'function') {
      this.deps.logger.debug('Queue projection snapshot backend is unavailable', { queueType });
      this.recordQueueProjectionUnavailable(queueType, 'backend-unavailable', {
        unavailableReason: 'backend-unavailable',
      });
      return null;
    }

    try {
      let result = await backend.queueProjectionSnapshot({ queueType });
      if (
        result.status !== 'ready'
        || !this.isValidProjectionPolicyHash(result.policyHash)
        || !this.isValidProjectionGeneration(result.generation)
      ) {
        this.deps.logger.info('Queue projection snapshot is not ready', {
          queueType,
          status: result.status,
          generation: result.generation,
          forceRefresh: options.forceRefresh === true,
        });
        this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
          unavailableReason: this.resolveReadinessSnapshotUnavailableReason(result.status, result.freshness, result.cacheState),
          backendStatus: typeof result.status === 'string' ? result.status : null,
          policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
          generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
          freshness: result.freshness ?? null,
        });
        if (options.forceRefresh && QUEUE_PROJECTION_READINESS_MATERIALIZABLE_TYPES.has(queueType)) {
          const materialized = await this.tryMaterializeQueueProjection(queueType, backend, {
            currentPolicyHash: result.policyHash,
            currentGeneration: result.generation,
            reason: 'forced-snapshot-refresh',
          });
          if (materialized?.status === 'ready') {
            const echo = this.getMaterializedProjectionEcho(
              queueType,
              materialized.policyHash,
              materialized.generation,
            );
            if (echo) {
              this.clearQueueProjectionUnavailable(queueType);
              return this.cloneQueueProjectionSnapshot(echo.snapshot);
            }
          }
        }
        return null;
      }

      this.clearQueueProjectionUnavailable(queueType);
      return this.toQueueProjectionSnapshot(queueType, result);
    } catch (error) {
      this.deps.logger.warn('Failed to read queue projection snapshot', {
        queueType,
        error: error instanceof Error ? error.message : String(error),
      });
      this.recordQueueProjectionUnavailable(queueType, 'projection-unavailable', {
        unavailableReason: error instanceof Error ? error.message : String(error),
      });
      throw createDependencyUnavailableError(
        'QUEUE_PROJECTION_UNAVAILABLE',
        `failed to read queue projection snapshot for ${queueType}`,
        error,
      );
    }
  }

  async getCardsBySnapshotIds(
    queueType: QueueType,
    ids: string[],
    options: { forceRefresh?: boolean } = {},
  ): Promise<FSRSCard[]> {
    if (!this.isQueueProjectionReadable(queueType)) {
      this.deps.logger.debug('Queue projection row hydration not enabled for queue type', { queueType });
      return [];
    }

    const orderedIds = ids.map((id) => String(id || '').trim()).filter(Boolean);
    if (orderedIds.length === 0) {
      return [];
    }

    const echoedCards = this.getMaterializedProjectionEchoCards(queueType, orderedIds);
    if (echoedCards) {
      this.clearQueueProjectionUnavailable(queueType);
      return echoedCards;
    }

    const backend = this.deps.getBackendClient();
    if (!backend || typeof backend.queueProjectionRowsByIds !== 'function') {
      this.deps.logger.debug('Queue projection row hydration backend is unavailable', { queueType });
      this.recordQueueProjectionUnavailable(queueType, 'backend-unavailable', {
        unavailableReason: 'backend-unavailable',
      });
      return [];
    }

    try {
      const result = await backend.queueProjectionRowsByIds({ queueType, ids: orderedIds });
      if (result.status !== 'ready') {
        this.deps.logger.info('Queue projection row hydration is not ready', {
          queueType,
          status: result.status,
          generation: result.generation,
          forceRefresh: options.forceRefresh === true,
        });
        this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
          unavailableReason: this.resolveReadinessSnapshotUnavailableReason(result.status, result.freshness, result.cacheState),
          backendStatus: typeof result.status === 'string' ? result.status : null,
          policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
          generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
          freshness: result.freshness ?? null,
        });
        if (QUEUE_PROJECTION_READINESS_MATERIALIZABLE_TYPES.has(queueType)) {
          const materialized = await this.tryMaterializeQueueProjection(queueType, backend, {
            currentPolicyHash: result.policyHash,
            currentGeneration: result.generation,
            reason: 'row-hydration-refresh',
          });
          if (materialized?.status === 'ready') {
            this.clearQueueProjectionUnavailable(queueType);
            const echoedCards = this.getMaterializedProjectionEchoCards(queueType, orderedIds);
            if (echoedCards) {
              return echoedCards;
            }
          }
        }
        return [];
      }

      this.clearQueueProjectionUnavailable(queueType);
      return (result.cards || [])
        .filter((card): card is FSRSCard => (
          Boolean(card)
          && typeof card === 'object'
          && typeof (card as FSRSCard).id === 'string'
          && typeof (card as FSRSCard).blockId === 'string'
        ))
        .map((card) => ({ ...card }));
    } catch (error) {
      this.deps.logger.warn('Failed to hydrate queue projection rows', {
        queueType,
        count: orderedIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      this.recordQueueProjectionUnavailable(queueType, 'projection-unavailable', {
        unavailableReason: error instanceof Error ? error.message : String(error),
      });
      throw createDependencyUnavailableError(
        'QUEUE_PROJECTION_UNAVAILABLE',
        `failed to hydrate queue projection rows for ${queueType}`,
        error,
      );
    }
  }

  async materialize(
    queueType: QueueType,
    queueOverride?: Pick<IReviewQueue, 'getCards'> | null,
  ): Promise<BackendQueueProjectionReplaceResult | null> {
    return this.tryMaterializeQueueProjection(queueType, this.deps.getBackendClient(), {
      queueOverride,
      reason: 'explicit-repair',
    });
  }

  getRolloutDiagnostics(queueType?: QueueType): QueueProjectionRolloutDiagnostic[] {
    const queueTypes = queueType ? [queueType] : QUEUE_PROJECTION_ROLLOUT_ORDER;
    return queueTypes.map((entry) => this.buildQueueProjectionRolloutDiagnostic(entry));
  }

  subscribeLiveIdentityEvents(listener: QueueProjectionLiveIdentityListener): () => void {
    this.liveIdentityListeners.add(listener);
    return () => {
      this.liveIdentityListeners.delete(listener);
    };
  }

  acceptRemoteLiveIdentityEvent(event: QueueProjectionLiveIdentityEvent): boolean {
    const identity = normalizeQueueProjectionIdentity({
      queueId: event.queueId,
      queueType: event.queueType,
      policyId: event.policyId || undefined,
      generation: event.generation || undefined,
    });
    if (!identity || (event.reason !== 'materialized' && event.reason !== 'refreshed')) {
      return false;
    }
    if (!this.isQueueProjectionReadable(identity.queueType)) {
      return false;
    }
    return this.emitReadyLiveIdentity(identity.queueType, {
      policyHash: identity.policyId,
      generation: identity.generation,
      reason: event.reason,
      source: event.source,
      diagnosticEventId: event.diagnosticEventId,
      timestamp: event.timestamp,
      broadcast: false,
    });
  }

  clearMaterializedProjectionEcho(queueType: QueueType): void {
    this.materializedProjectionEchoes.delete(queueType);
    this.emitInvalidatedLiveIdentity(queueType, 'echo-cleared');
  }

  clearMaterializedProjectionEchoes(): void {
    for (const queueType of this.materializedProjectionEchoes.keys()) {
      this.emitInvalidatedLiveIdentity(queueType, 'echo-cleared');
    }
    this.materializedProjectionEchoes.clear();
  }

  private async readRawQueueProjectionSnapshot(
    request: { queueType: string; policyHash?: string | null; generation?: number | null },
  ): Promise<BackendQueueProjectionSnapshotResult | null> {
    const queueType = this.normalizeQueueType(request.queueType);
    if (!queueType || !this.isQueueProjectionReadable(queueType)) {
      return null;
    }
    const backend = this.deps.getBackendClient();
    if (!backend || typeof backend.queueProjectionSnapshot !== 'function') {
      throw new Error('backend unavailable for queue projection readiness');
    }
    const result = await backend.queueProjectionSnapshot({
      queueType,
      policyHash: request.policyHash,
      generation: request.generation,
    });
    if (
      result.status !== 'ready'
      || !this.isValidProjectionPolicyHash(result.policyHash)
      || !this.isValidProjectionGeneration(result.generation)
    ) {
      this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
        unavailableReason: this.resolveReadinessSnapshotUnavailableReason(result.status, result.freshness, result.cacheState),
        backendStatus: typeof result.status === 'string' ? result.status : null,
        policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
        generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
        freshness: result.freshness ?? null,
      });
    }
    return result;
  }

  private async tryMaterializeQueueProjection(
    queueType: QueueType,
    backend: QueueProjectionBackendClient | null | undefined,
    options: {
      currentPolicyHash?: unknown;
      currentGeneration?: unknown;
      reason?: string;
      queueOverride?: Pick<IReviewQueue, 'getCards'> | null;
      readinessRequest?: QueueProjectionReadinessRequest | null;
    } = {},
  ): Promise<BackendQueueProjectionReplaceResult | null> {
    const key = this.buildMaterializationInFlightKey(queueType, options);
    if (key) {
      const existing = this.materializationInFlight.get(key);
      if (existing) {
        this.deps.logger.debug('Queue projection materialization already in flight', {
          queueType,
          reason: options.reason ?? 'snapshot-refresh',
        });
        return existing;
      }
      let materialization!: Promise<BackendQueueProjectionReplaceResult | null>;
      materialization = this.runMaterializeQueueProjection(queueType, backend, options)
        .finally(() => {
          if (this.materializationInFlight.get(key) === materialization) {
            this.materializationInFlight.delete(key);
          }
        });
      this.materializationInFlight.set(key, materialization);
      return materialization;
    }
    return this.runMaterializeQueueProjection(queueType, backend, options);
  }

  private async runMaterializeQueueProjection(
    queueType: QueueType,
    backend: QueueProjectionBackendClient | null | undefined,
    options: {
      currentPolicyHash?: unknown;
      currentGeneration?: unknown;
      reason?: string;
      queueOverride?: Pick<IReviewQueue, 'getCards'> | null;
      readinessRequest?: QueueProjectionReadinessRequest | null;
    } = {},
  ): Promise<BackendQueueProjectionReplaceResult | null> {
    const finishMaterializeSpan = startRuntimePerformanceSpan('browser', 'queue-projection.materialize.total', {
      queueType,
      reason: options.reason ?? 'snapshot-refresh',
      hasQueueOverride: Boolean(options.queueOverride),
      currentPolicyHash: this.isValidProjectionPolicyHash(options.currentPolicyHash)
        ? String(options.currentPolicyHash)
        : null,
      currentGeneration: this.isValidProjectionGeneration(options.currentGeneration)
        ? Number(options.currentGeneration)
        : null,
      frontendMode: this.deps.getFrontendRuntime()?.getMode?.() ?? null,
    });
    if (!this.isQueueProjectionReadable(queueType)) {
      finishMaterializeSpan({ status: 'skipped', skipReason: 'not-readable' });
      return null;
    }
    if (!this.canSubmitQueueProjectionReplace(backend)) {
      this.deps.logger.debug('Queue projection replace backend is unavailable', { queueType });
      finishMaterializeSpan({ status: 'skipped', skipReason: 'replace-backend-unavailable' });
      return null;
    }

    const queue = options.queueOverride ?? this.deps.getQueue(queueType);
    if (!queue || typeof queue.getCards !== 'function') {
      finishMaterializeSpan({ status: 'failed', skipReason: 'queue-strategy-unavailable' }, {
        ok: false,
        errorName: 'Error',
      });
      throw new Error(`QUEUE_PROJECTION_UNAVAILABLE: queue strategy unavailable for ${queueType}`);
    }

    const now = Date.now();
    const currentGeneration = this.isValidProjectionGeneration(options.currentGeneration)
      ? Number(options.currentGeneration)
      : 0;
    const generation = Math.max(1, currentGeneration + 1);
    const policyHash = this.isValidProjectionPolicyHash(options.currentPolicyHash)
      ? String(options.currentPolicyHash)
      : this.buildMaterializedProjectionPolicyHash(queueType);
    try {
      const cards = await measureRuntimePerformance(
        'browser',
        'queue-projection.materialize.get-cards',
        () => queue.getCards(),
        {
          queueType,
          reason: options.reason ?? 'snapshot-refresh',
          generation,
          policyHash,
        },
      );
      const projection = measureRuntimePerformance(
        'browser',
        'queue-projection.materialize.build-rows',
        () => buildOrderedQueueProjectionRows({
          queueType,
          cards,
          now,
          policyHash,
          sourceGeneration: generation,
          updatedAt: now,
          membershipReason: this.resolveMaterializedProjectionMembershipReason(queueType),
          payload: this.buildMaterializedProjectionPayload(queueType, options.readinessRequest),
        }),
        {
          queueType,
          reason: options.reason ?? 'snapshot-refresh',
          generation,
          policyHash,
          cardCount: cards.length,
        },
      );

      const replaceRequest: QueueProjectionReplaceRequestLike = {
        queueType,
        policyHash,
        generation,
        reason: options.reason ?? 'snapshot-refresh',
        rows: projection.rows,
        metadata: {
          source: 'queue-strategy-materialization',
          cardCount: projection.rows.length,
        },
      };
      const result = await measureRuntimePerformance(
        'browser',
        'queue-projection.materialize.replace',
        () => this.submitQueueProjectionReplace(backend, replaceRequest),
        {
          queueType,
          reason: replaceRequest.reason,
          generation,
          policyHash,
          cardCount: cards.length,
          rowCount: projection.rows.length,
          frontendMode: this.deps.getFrontendRuntime()?.getMode?.() ?? null,
        },
      );
      this.cacheMaterializedProjectionEcho(queueType, result, cards, projection.rows);
      this.emitReadyLiveIdentity(queueType, {
        policyHash: result.policyHash,
        generation: result.generation,
        reason: 'materialized',
        source: this.isCurrentInstanceFollower() ? 'writer-relay' : 'backend',
      });
      finishMaterializeSpan({
        status: result.status,
        policyHash: result.policyHash,
        generation: result.generation,
        cardCount: cards.length,
        rowCount: projection.rows.length,
        replaceRows: result.rows,
      });
      return result;
    } catch (error) {
      finishMaterializeSpan({
        status: 'failed',
        reason: options.reason ?? 'snapshot-refresh',
        error: error instanceof Error ? error.message : String(error),
      }, {
        ok: false,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw error;
    }
  }

  private buildMaterializationInFlightKey(
    queueType: QueueType,
    options: {
      currentPolicyHash?: unknown;
      currentGeneration?: unknown;
      queueOverride?: Pick<IReviewQueue, 'getCards'> | null;
      readinessRequest?: QueueProjectionReadinessRequest | null;
    },
  ): string | null {
    if (options.queueOverride) {
      return null;
    }
    const policyHash = this.isValidProjectionPolicyHash(options.currentPolicyHash)
      ? String(options.currentPolicyHash)
      : this.buildMaterializedProjectionPolicyHash(queueType);
    const generation = this.isValidProjectionGeneration(options.currentGeneration)
      ? Number(options.currentGeneration)
      : 0;
    return `${queueType}:${policyHash}:${generation}`;
  }

  private async submitQueueProjectionReplace(
    backend: QueueProjectionBackendClient | null | undefined,
    request: QueueProjectionReplaceRequestLike,
  ): Promise<BackendQueueProjectionReplaceResult> {
    const runtime = this.deps.getFrontendRuntime();
    if (runtime?.getMode?.() === 'follower') {
      const follower = this.deps.getFollowerCommandClient();
      const instanceId = String(runtime.getInstanceId?.() || '').trim();
      if (!follower || typeof follower.submitAndWait !== 'function' || !instanceId) {
        throw new Error('BACKEND_UNAVAILABLE: writer relay unavailable for queue projection replace');
      }
      return follower.submitAndWait<BackendQueueProjectionReplaceResult>({
        instanceId,
        method: 'queue.projection.replace',
        params: request,
      });
    }

    if (!backend || typeof backend.queueProjectionReplace !== 'function') {
      throw new Error('BACKEND_UNAVAILABLE: queue projection replace backend is unavailable');
    }
    return backend.queueProjectionReplace(request);
  }

  private isCurrentInstanceFollower(): boolean {
    const runtime = this.deps.getFrontendRuntime();
    return runtime?.getMode?.() === 'follower';
  }

  private awaitMaterializationShortWindow(
    materialization: Promise<BackendQueueProjectionReplaceResult | null>,
  ): Promise<BackendQueueProjectionReplaceResult | null> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(null);
      }, QUEUE_PROJECTION_MATERIALIZATION_SHORT_AWAIT_MS);
      materialization.then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      }, (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private resolveReadinessMaterializationGeneration(queueType: QueueType): number {
    const diagnostic = this.queueProjectionUnavailableDiagnostics.get(queueType);
    const generation = Number(diagnostic?.generation);
    return Number.isInteger(generation) && generation > 0 ? generation : 0;
  }

  private resolveReadinessSnapshotUnavailableReason(
    status: unknown,
    freshness?: BackendQueueProjectionFreshnessEvidence | null,
    cacheState?: unknown,
  ): string {
    if (cacheState === 'missing-derived-cache') {
      return 'missing_derived_cache';
    }
    if (this.hasProjectionFreshnessGap(freshness)) {
      return 'projection_stale';
    }
    if (typeof status !== 'string' || status.length === 0) {
      return 'refresh-required';
    }
    if (status === 'refreshing') {
      return 'projection_stale';
    }
    if (status === 'invalidated' || status === 'rebuilding' || status === 'repairing') {
      return 'materialization_in_progress';
    }
    if (status === 'unavailable') {
      return 'projection_unavailable';
    }
    return 'refresh-required';
  }

  private hasProjectionFreshnessGap(freshness: BackendQueueProjectionFreshnessEvidence | null | undefined): boolean {
    if (!freshness) {
      return false;
    }
    return Math.max(0, Number(freshness.staleRows) || 0) > 0
      || Math.max(0, Number(freshness.missingRows) || 0) > 0;
  }

  private canSubmitQueueProjectionReplace(backend: QueueProjectionBackendClient | null | undefined): boolean {
    if (this.isCurrentInstanceFollower()) {
      const runtime = this.deps.getFrontendRuntime();
      const follower = this.deps.getFollowerCommandClient();
      return Boolean(
        String(runtime?.getInstanceId?.() || '').trim()
        && typeof follower?.submitAndWait === 'function',
      );
    }
    return Boolean(backend && typeof backend.queueProjectionReplace === 'function');
  }

  private shouldMaterializeDuringReadiness(
    queueType: QueueType,
    readiness: QueueProjectionReadiness,
  ): boolean {
    return readiness.status === 'refreshing'
      && QUEUE_PROJECTION_READINESS_MATERIALIZABLE_TYPES.has(queueType)
      && (
        readiness.cause === 'materialization_in_progress'
        || readiness.cause === 'projection_unavailable'
        || readiness.cause === 'missing_derived_cache'
        || readiness.cause === 'projection_stale'
      );
  }

  private cacheMaterializedProjectionEcho(
    queueType: QueueType,
    result: BackendQueueProjectionReplaceResult,
    cards: FSRSCard[],
    projectionRows: QueueProjectionRow[],
  ): void {
    if (
      result.status !== 'ready'
      || !this.isValidProjectionPolicyHash(result.policyHash)
      || !this.isValidProjectionGeneration(result.generation)
    ) {
      this.materializedProjectionEchoes.delete(queueType);
      return;
    }

    const cardById = new Map(cards.map((card) => [String(card.id || ''), card]));
    const snapshotRows: QueueSnapshotRow[] = [];
    const cardsByRowId = new Map<string, FSRSCard>();

    projectionRows.forEach((projectionRow, index) => {
      const card = cardById.get(String(projectionRow.cardId || '')) ?? cards[index];
      if (!card || typeof card.id !== 'string') {
        return;
      }
      const queueIndexHint = Number(projectionRow.queueIndexHint);
      const queueIndex = Number.isFinite(queueIndexHint) && queueIndexHint > 0
        ? Math.floor(queueIndexHint)
        : index + 1;
      const baseRow = buildQueueSnapshotRow(card, { queueIndex });
      const row: QueueSnapshotRow = {
        ...baseRow,
        id: String(projectionRow.rowId || baseRow.id),
        fsrsCardId: String(projectionRow.cardId || baseRow.fsrsCardId),
        blockId: String(projectionRow.blockId || baseRow.blockId || ''),
        deckId: String(projectionRow.deckId || baseRow.deckId || ''),
        queueIndex,
        tags: Array.isArray(baseRow.tags) ? [...baseRow.tags] : [],
      };
      snapshotRows.push(row);
      const clonedCard = this.cloneFsrsCard(card);
      cardsByRowId.set(row.id, clonedCard);
      cardsByRowId.set(row.fsrsCardId, clonedCard);
    });

    this.materializedProjectionEchoes.set(queueType, {
      policyHash: result.policyHash,
      generation: Number(result.generation),
      snapshot: {
        queueType,
        policyHash: result.policyHash,
        generation: Number(result.generation),
        rows: snapshotRows,
        counters: this.toQueueCounterSnapshot(result.counters, result.generation),
      },
      cardsByRowId,
      cachedAt: Date.now(),
    });
  }

  private getMaterializedProjectionEcho(
    queueType: QueueType,
    policyHash?: string | null,
    generation?: number | null,
  ): MaterializedQueueProjectionEcho | null {
    const echo = this.materializedProjectionEchoes.get(queueType) ?? null;
    if (!echo) {
      return null;
    }
    if (policyHash && echo.policyHash !== policyHash) {
      return null;
    }
    if (this.isValidProjectionGeneration(generation) && echo.generation !== Number(generation)) {
      return null;
    }
    return echo;
  }

  private getMaterializedProjectionEchoCards(queueType: QueueType, orderedIds: string[]): FSRSCard[] | null {
    const echo = this.getMaterializedProjectionEcho(queueType);
    if (!echo || orderedIds.length === 0) {
      return null;
    }
    const cards: FSRSCard[] = [];
    for (const id of orderedIds) {
      const card = echo.cardsByRowId.get(id);
      if (!card) {
        return null;
      }
      cards.push(this.cloneFsrsCard(card));
    }
    return cards;
  }

  private buildMaterializedProjectionPolicyHash(queueType: QueueType): string {
    return `${queueType}:materialized:v1`;
  }

  private buildMaterializedProjectionPayload(
    queueType: QueueType,
    request?: QueueProjectionReadinessRequest | null,
  ): ((card: FSRSCard, zeroBasedIndex: number) => Record<string, unknown>) | undefined {
    if (queueType !== QueueType.FilterGroup || !request) {
      return undefined;
    }

    const manualCardIds = new Set(normalizeStringArray(request.manualCardIds));
    const filterHash = normalizeNullableString(request.filterHash);
    const transferSessionId = normalizeNullableString(request.transferSessionId);
    const sessionId = normalizeNullableString(request.sessionId);
    const commitPolicy = normalizeNullableString(request.commitPolicy) ?? 'preview-only';

    return (card) => ({
      queueKind: 'filter-group',
      filterHash,
      transferSessionId,
      sessionId,
      commitPolicy,
      membershipSource: manualCardIds.has(card.id) || manualCardIds.has(card.blockId) ? 'manual' : 'filter',
      temporaryBlacklisted: false,
      sessionTransferActive: Boolean(transferSessionId),
    });
  }

  private resolveMaterializedProjectionMembershipReason(queueType: QueueType): string {
    switch (queueType) {
      case QueueType.FilterGroup:
        return 'due';
      case QueueType.FinalDrill:
        return 'final-drill';
      case QueueType.Leech:
        return 'leech';
      case QueueType.NeuralRoam:
        return 'frontier-candidate';
      case QueueType.IncrementalLearning:
        return 'rotation';
      case QueueType.RetrievalPractice:
      default:
        return 'review-due';
    }
  }

  private toQueueProjectionSnapshot(
    queueType: QueueType,
    result: BackendQueueProjectionSnapshotResult,
  ): QueueProjectionSnapshot {
    return {
      queueType,
      policyHash: String(result.policyHash || ''),
      generation: Number(result.generation),
      rows: (result.rows || []).map((row): QueueSnapshotRow => ({
        ...row,
        cardType: row.cardType as CardType | undefined,
        tags: Array.isArray(row.tags) ? [...row.tags] : [],
      })),
      counters: this.toQueueCounterSnapshot(result.counters, result.generation),
    };
  }

  private toQueueCounterSnapshot(
    counters: BackendQueueProjectionSnapshotResult['counters'],
    generation: number | null | undefined,
  ): QueueProjectionSnapshot['counters'] {
    if (!counters) {
      return null;
    }
    return {
      version: Number(counters.version || counters.generation || generation || 0),
      remaining: Math.max(0, Math.floor(Number(counters.remaining || 0))),
      due: Math.max(0, Math.floor(Number(counters.due || 0))),
      total: Math.max(0, Math.floor(Number(counters.total || 0))),
      currentLearningDue: Math.max(0, Math.floor(Number(counters.currentLearningDue || 0))),
      todayReviewDue: Math.max(0, Math.floor(Number(counters.todayReviewDue || 0))),
      allowedNew: Math.max(0, Math.floor(Number(counters.allowedNew || 0))),
      learnAheadAvailable: Math.max(0, Math.floor(Number(counters.learnAheadAvailable || 0))),
      scheduledTotal: Math.max(0, Math.floor(Number(counters.scheduledTotal || counters.total || 0))),
      buckets: {
        all: Math.max(0, Math.floor(Number(counters.buckets?.all || 0))),
        item: Math.max(0, Math.floor(Number(counters.buckets?.item || 0))),
        descriptor: Math.max(0, Math.floor(Number(counters.buckets?.descriptor || 0))),
        topic: Math.max(0, Math.floor(Number(counters.buckets?.topic || 0))),
        concept: Math.max(0, Math.floor(Number(counters.buckets?.concept || 0))),
      },
      source: 'reconciled',
    };
  }

  private cloneQueueProjectionSnapshot(snapshot: QueueProjectionSnapshot): QueueProjectionSnapshot {
    return {
      ...snapshot,
      rows: snapshot.rows.map((row) => ({
        ...row,
        tags: Array.isArray(row.tags) ? [...row.tags] : [],
      })),
      counters: snapshot.counters
        ? {
          ...snapshot.counters,
          buckets: { ...snapshot.counters.buckets },
        }
        : null,
    };
  }

  private cloneFsrsCard(card: FSRSCard): FSRSCard {
    return {
      ...card,
      tags: Array.isArray(card.tags) ? [...card.tags] : [],
      meta: card.meta && typeof card.meta === 'object' ? { ...card.meta } : card.meta,
    };
  }

  private isProjectionBackedQueue(queueType: QueueType): boolean {
    return this.getConfiguredQueueProjectionRolloutState(queueType) === 'backend-projection';
  }

  private isQueueProjectionReadable(queueType: QueueType): boolean {
    if (!QUEUE_PROJECTION_READABLE_TYPES.has(queueType)) {
      return false;
    }
    if (queueType === QueueType.NeuralRoam) {
      return true;
    }
    return this.isProjectionBackedQueue(queueType);
  }

  private buildQueueProjectionRolloutDiagnostic(queueType: QueueType): QueueProjectionRolloutDiagnostic {
    const configuredState = this.getConfiguredQueueProjectionRolloutState(queueType);
    if (queueType === QueueType.NeuralRoam) {
      const advanceBacked = configuredState === 'backend-advance';
      return {
        queueType,
        projectionBacked: false,
        state: configuredState,
        readPath: advanceBacked ? 'backend-advance' : 'existing-queue-strategy',
        reason: advanceBacked ? 'advance-backed' : 'advance-contract-unavailable',
        nextCoverageTask: advanceBacked ? null : QUEUE_PROJECTION_PENDING_NEXT_STEPS[queueType] ?? null,
        unavailableReason: advanceBacked ? null : 'advance-contract-unavailable',
      };
    }

    const projectionBacked = configuredState === 'backend-projection';
    const unavailable = projectionBacked
      ? this.queueProjectionUnavailableDiagnostics.get(queueType)
      : null;
    if (unavailable) {
      return {
        queueType,
        projectionBacked: true,
        state: 'projection-unavailable',
        readPath: 'backend-projection',
        reason: unavailable.reason,
        nextCoverageTask: null,
        unavailableReason: unavailable.unavailableReason,
        backendStatus: unavailable.backendStatus,
        policyHash: unavailable.policyHash,
        generation: unavailable.generation,
        checkedAt: unavailable.checkedAt,
        freshness: unavailable.freshness,
      };
    }

    return {
      queueType,
      projectionBacked,
      state: configuredState,
      readPath: projectionBacked ? 'backend-projection' : 'existing-queue-strategy',
      reason: this.resolveQueueProjectionRolloutReason(configuredState),
      nextCoverageTask: projectionBacked
        ? null
        : QUEUE_PROJECTION_PENDING_NEXT_STEPS[queueType] ?? 'Add projection parity before switching this queue off strategy reads.',
    };
  }

  private getConfiguredQueueProjectionRolloutState(queueType: QueueType): QueueProjectionRolloutState {
    const normalizedPluginState = this.normalizeQueueProjectionRolloutState(
      this.deps.getQueueProjectionRolloutState(queueType),
    );
    if (queueType === QueueType.NeuralRoam) {
      if (normalizedPluginState === 'advance-contract-unavailable') {
        return normalizedPluginState;
      }
      return this.hasNeuralRoamAdvanceCapability()
        ? 'backend-advance'
        : 'advance-contract-unavailable';
    }
    if (normalizedPluginState) {
      return normalizedPluginState;
    }
    if (QUEUE_PROJECTION_BACKED_TYPES.has(queueType)) {
      return 'backend-projection';
    }
    return DEFAULT_QUEUE_PROJECTION_ROLLOUT_STATES[queueType] ?? 'existing-queue-strategy';
  }

  private normalizeQueueProjectionRolloutState(value: unknown): QueueProjectionRolloutState | null {
    switch (value) {
      case 'existing-queue-strategy':
      case 'parity-checking':
      case 'backend-advance':
      case 'advance-contract-unavailable':
      case 'backend-projection':
      case 'projection-unavailable':
        return value;
      default:
        return null;
    }
  }

  private resolveQueueProjectionRolloutReason(
    state: QueueProjectionRolloutState,
  ): QueueProjectionRolloutReason {
    if (state === 'backend-projection') {
      return 'rollout-enabled';
    }
    if (state === 'backend-advance') {
      return 'advance-backed';
    }
    if (state === 'advance-contract-unavailable') {
      return 'advance-contract-unavailable';
    }
    if (state === 'parity-checking') {
      return 'parity-checking';
    }
    if (state === 'projection-unavailable') {
      return 'projection-unavailable';
    }
    return 'projection-rollout-pending';
  }

  private hasNeuralRoamAdvanceCapability(): boolean {
    const runtime = this.deps.getFrontendRuntime();
    if (runtime?.getMode?.() === 'follower') {
      const follower = this.deps.getFollowerCommandClient();
      return typeof follower?.submitAndWait === 'function';
    }
    const backend = this.deps.getBackendClient();
    return typeof backend?.neuralRoamAdvance === 'function';
  }

  private recordQueueProjectionUnavailable(
    queueType: QueueType,
    reason: QueueProjectionRolloutReason,
    details: Partial<Omit<QueueProjectionUnavailableDiagnostic, 'reason' | 'checkedAt'>> = {},
  ): void {
    this.queueProjectionUnavailableDiagnostics.set(queueType, {
      reason,
      unavailableReason: details.unavailableReason ?? reason,
      backendStatus: details.backendStatus ?? null,
      policyHash: details.policyHash ?? null,
      generation: details.generation ?? null,
      freshness: details.freshness ?? null,
      checkedAt: Date.now(),
    });
  }

  private clearQueueProjectionUnavailable(queueType: QueueType): void {
    this.queueProjectionUnavailableDiagnostics.delete(queueType);
  }

  private emitReadyLiveIdentity(
    queueType: QueueType,
    details: {
      policyHash?: string | null;
      generation?: number | null;
      reason: QueueProjectionLiveIdentityReason;
      source: QueueProjectionLiveIdentitySource;
      diagnosticEventId?: string;
      timestamp?: number;
      broadcast?: boolean;
    },
  ): boolean {
    if (
      !this.isValidProjectionPolicyHash(details.policyHash)
      || !this.isValidProjectionGeneration(details.generation)
    ) {
      return false;
    }
    const generation = Number(details.generation);
    const policyHash = String(details.policyHash);
    const identityKey = `${policyHash}:${generation}`;
    if (this.publishedReadyIdentities.get(queueType) === identityKey) {
      return false;
    }
    this.publishedReadyIdentities.set(queueType, identityKey);
    this.emitLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: queueType,
      queueType,
      policyId: policyHash,
      generation,
      reason: details.reason,
      source: details.source,
      timestamp: Number.isFinite(Number(details.timestamp)) ? Number(details.timestamp) : Date.now(),
      diagnosticEventId: details.diagnosticEventId,
    }, { broadcast: details.broadcast !== false });
    return true;
  }

  private emitInvalidatedLiveIdentity(
    queueType: QueueType,
    reason: Extract<QueueProjectionLiveIdentityReason, 'invalidated' | 'echo-cleared'>,
  ): void {
    if (!this.isQueueProjectionReadable(queueType)) {
      return;
    }
    this.publishedReadyIdentities.delete(queueType);
    this.emitLiveIdentityEvent({
      type: 'queue-projection-live-identity',
      queueId: queueType,
      queueType,
      policyId: null,
      generation: null,
      reason,
      source: 'runtime',
      timestamp: Date.now(),
    }, { broadcast: false });
  }

  private emitLiveIdentityEvent(
    event: QueueProjectionLiveIdentityEvent,
    options: { broadcast?: boolean } = {},
  ): void {
    const diagnosticEventId = event.diagnosticEventId
      || `${event.queueType}:${event.policyId ?? 'none'}:${event.generation ?? 'none'}:${event.reason}:${event.timestamp}`;
    const normalized = { ...event, diagnosticEventId };
    for (const listener of this.liveIdentityListeners) {
      try {
        listener(normalized);
      } catch (error) {
        this.deps.logger.warn('Queue projection live identity listener failed', {
          queueType: event.queueType,
          generation: event.generation,
          reason: event.reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (options.broadcast === true) {
      Promise.resolve(this.deps.publishQueueProjectionIdentityBroadcast?.(normalized)).catch((error) => {
        this.deps.logger.warn('Queue projection identity broadcast publish failed', {
          queueType: event.queueType,
          generation: event.generation,
          reason: event.reason,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private isValidProjectionPolicyHash(policyHash: unknown): policyHash is string {
    return typeof policyHash === 'string' && policyHash.trim().length > 0;
  }

  private isValidProjectionGeneration(generation: unknown): boolean {
    return typeof generation === 'number'
      && Number.isFinite(generation)
      && generation > 0;
  }

  private normalizeQueueType(queueType: unknown): QueueType | null {
    if (typeof queueType !== 'string') {
      return null;
    }
    return Object.values(QueueType).includes(queueType as QueueType)
      ? queueType as QueueType
      : null;
  }
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}
