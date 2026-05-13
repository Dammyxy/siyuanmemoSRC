import {
  QueueType,
  type IReviewQueue,
  type QueueProjectionRolloutDiagnostic,
  type QueueProjectionRolloutReason,
  type QueueProjectionRolloutState,
  type QueueProjectionSnapshot,
} from '@/types/unified-data-source';
import type { CardType, FSRSCard } from '@/types/card';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { createDependencyUnavailableError } from '@/core/queue/dependencyErrors';
import type { QueueProjectionRow } from '@/application/ports/QueueProjectionPort';
import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  QueueProjectionReadiness,
  QueueProjectionReadinessRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import { buildOrderedQueueProjectionRows } from './QueueProjectionBuilder';
import { QueueProjectionReadinessService } from './QueueProjectionReadinessService';

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

  constructor(private readonly deps: QueueProjectionRuntimeDeps) {
    this.queueProjectionReadiness = new QueueProjectionReadinessService({
      readSnapshot: async (request) => this.readRawQueueProjectionSnapshot(request),
      materialize: async (request) => {
        const queueType = this.normalizeQueueType(request.queueType);
        if (!queueType) {
          return null;
        }
        return this.tryMaterializeQueueProjection(queueType, this.deps.getBackendClient(), {
          currentPolicyHash: request.currentPolicyHash,
          currentGeneration: request.currentGeneration,
          reason: 'ensure-ready',
        });
      },
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
      return readiness;
    }
    if (readiness.status === 'refreshing') {
      this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
        unavailableReason: readiness.cause,
        backendStatus: readiness.status,
        policyHash: readiness.policyId,
        generation: null,
      });
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
      let materializedEcho: MaterializedQueueProjectionEcho | null = null;
      if (
        result.status !== 'ready'
        || !this.isValidProjectionPolicyHash(result.policyHash)
        || !this.isValidProjectionGeneration(result.generation)
      ) {
        const materialized = await this.tryMaterializeQueueProjection(queueType, backend, {
          currentPolicyHash: result.policyHash,
          currentGeneration: result.generation,
          reason: 'snapshot-refresh',
        });
        if (materialized) {
          materializedEcho = this.getMaterializedProjectionEcho(
            queueType,
            materialized.policyHash,
            materialized.generation,
          );
          if (materializedEcho && this.isCurrentInstanceFollower()) {
            this.clearQueueProjectionUnavailable(queueType);
            return this.cloneQueueProjectionSnapshot(materializedEcho.snapshot);
          }
          result = await backend.queueProjectionSnapshot({
            queueType,
            policyHash: materialized.policyHash,
            generation: materialized.generation,
          });
        }
      }

      if (
        result.status !== 'ready'
        || !this.isValidProjectionPolicyHash(result.policyHash)
        || !this.isValidProjectionGeneration(result.generation)
      ) {
        if (materializedEcho) {
          this.clearQueueProjectionUnavailable(queueType);
          return this.cloneQueueProjectionSnapshot(materializedEcho.snapshot);
        }
        this.deps.logger.info('Queue projection snapshot is not ready', {
          queueType,
          status: result.status,
          generation: result.generation,
          forceRefresh: options.forceRefresh === true,
        });
        this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
          unavailableReason: 'refresh-required',
          backendStatus: typeof result.status === 'string' ? result.status : null,
          policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
          generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
        });
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
        const materialized = await this.tryMaterializeQueueProjection(queueType, backend, {
          currentPolicyHash: result.policyHash,
          currentGeneration: result.generation,
          reason: 'row-hydration-refresh',
        });
        if (materialized) {
          const materializedCards = this.getMaterializedProjectionEchoCards(queueType, orderedIds);
          if (materializedCards) {
            this.clearQueueProjectionUnavailable(queueType);
            return materializedCards;
          }
        }
        this.deps.logger.info('Queue projection row hydration is not ready', {
          queueType,
          status: result.status,
          generation: result.generation,
          forceRefresh: options.forceRefresh === true,
        });
        this.recordQueueProjectionUnavailable(queueType, 'refresh-required', {
          unavailableReason: 'refresh-required',
          backendStatus: typeof result.status === 'string' ? result.status : null,
          policyHash: this.isValidProjectionPolicyHash(result.policyHash) ? result.policyHash : null,
          generation: this.isValidProjectionGeneration(result.generation) ? Number(result.generation) : null,
        });
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

  clearMaterializedProjectionEcho(queueType: QueueType): void {
    this.materializedProjectionEchoes.delete(queueType);
  }

  clearMaterializedProjectionEchoes(): void {
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
    return backend.queueProjectionSnapshot({
      queueType,
      policyHash: request.policyHash,
      generation: request.generation,
    });
  }

  private async tryMaterializeQueueProjection(
    queueType: QueueType,
    backend: QueueProjectionBackendClient | null | undefined,
    options: {
      currentPolicyHash?: unknown;
      currentGeneration?: unknown;
      reason?: string;
      queueOverride?: Pick<IReviewQueue, 'getCards'> | null;
    } = {},
  ): Promise<BackendQueueProjectionReplaceResult | null> {
    if (!this.isQueueProjectionReadable(queueType)) {
      return null;
    }
    if (!backend || typeof backend.queueProjectionReplace !== 'function') {
      this.deps.logger.debug('Queue projection replace backend is unavailable', { queueType });
      return null;
    }

    const queue = options.queueOverride ?? this.deps.getQueue(queueType);
    if (!queue || typeof queue.getCards !== 'function') {
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
    const cards = await queue.getCards();
    const projection = buildOrderedQueueProjectionRows({
      queueType,
      cards,
      now,
      policyHash,
      sourceGeneration: generation,
      updatedAt: now,
      membershipReason: this.resolveMaterializedProjectionMembershipReason(queueType),
    });

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
    const result = await this.submitQueueProjectionReplace(backend, replaceRequest);
    this.cacheMaterializedProjectionEcho(queueType, result, cards, projection.rows);
    return result;
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
      checkedAt: Date.now(),
    });
  }

  private clearQueueProjectionUnavailable(queueType: QueueType): void {
    this.queueProjectionUnavailableDiagnostics.delete(queueType);
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
