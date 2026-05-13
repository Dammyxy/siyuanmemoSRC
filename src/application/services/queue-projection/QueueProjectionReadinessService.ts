import type {
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotResult,
  QueueProjectionReadiness,
  QueueProjectionReadinessCause,
  QueueProjectionReadinessRequest,
} from '../../../../packages/contracts/src/backend-rpc';

export type QueueProjectionReadinessSnapshotReader = (
  request: { queueType: string; policyHash?: string | null; generation?: number | null },
) => Promise<BackendQueueProjectionSnapshotResult | null>;

export type QueueProjectionReadinessMaterializer = (
  request: { queueType: string; currentPolicyHash?: string | null; currentGeneration?: number | null },
) => Promise<BackendQueueProjectionReplaceResult | null>;

export type QueueProjectionReadinessServiceDeps = {
  readSnapshot: QueueProjectionReadinessSnapshotReader;
  materialize: QueueProjectionReadinessMaterializer;
  shortAwaitMs?: number;
  retryAfterMs?: number;
};

type CanonicalRequest = Required<Pick<QueueProjectionReadinessRequest, 'queueType'>> & {
  preset: string | null;
  searchText: string | null;
  docId: string | null;
  scopeDocIds: string[];
  cardType: string | null;
  source: string | null;
};

type InFlightMaterialization = Promise<BackendQueueProjectionReplaceResult | null>;

const DEFAULT_SHORT_AWAIT_MS = 120;
const DEFAULT_RETRY_AFTER_MS = 300;

export class QueueProjectionReadinessService {
  private readonly inFlightMaterializations = new Map<string, InFlightMaterialization>();
  private readonly shortAwaitMs: number;
  private readonly retryAfterMs: number;

  constructor(private readonly deps: QueueProjectionReadinessServiceDeps) {
    this.shortAwaitMs = normalizePositiveInteger(deps.shortAwaitMs, DEFAULT_SHORT_AWAIT_MS);
    this.retryAfterMs = normalizePositiveInteger(deps.retryAfterMs, DEFAULT_RETRY_AFTER_MS);
  }

  async ensureReady(request: QueueProjectionReadinessRequest): Promise<QueueProjectionReadiness> {
    const canonical = this.normalizeRequest(request);
    if (!canonical.queueType) {
      return this.unavailable('', 'invalid_queue', 'queueType is required', false);
    }

    const policyId = this.buildPolicyId(canonical);
    let snapshot: BackendQueueProjectionSnapshotResult | null;
    try {
      snapshot = await this.deps.readSnapshot({ queueType: canonical.queueType, policyHash: policyId });
    } catch (error) {
      return this.unavailable(
        canonical.queueType,
        'backend_unavailable',
        formatUnknownError(error),
        true,
      );
    }

    const ready = this.toReadyReadiness(canonical.queueType, snapshot);
    if (ready) {
      return ready;
    }

    const materialization = this.ensureMaterialization(
      canonical.queueType,
      policyId,
      snapshot,
    );
    const materialized = await this.awaitBriefly(materialization);
    if (materialized === 'timeout') {
      return {
        status: 'refreshing',
        queueId: canonical.queueType,
        policyId,
        cause: 'materialization_in_progress',
        retryAfterMs: this.retryAfterMs,
      };
    }

    if (!materialized) {
      return this.unavailable(
        canonical.queueType,
        'materialization_failed',
        'queue projection materialization did not return a committed generation',
        true,
      );
    }

    return {
      status: 'ready',
      queueId: canonical.queueType,
      policyId: materialized.policyHash,
      generation: materialized.generation,
    };
  }

  buildPolicyId(request: QueueProjectionReadinessRequest): string {
    const canonical = this.normalizeRequest(request);
    return `queue-projection:${stableStringify(canonical)}`;
  }

  private ensureMaterialization(
    queueType: string,
    policyId: string,
    snapshot: BackendQueueProjectionSnapshotResult | null,
  ): InFlightMaterialization {
    const key = `${queueType}:${policyId}`;
    const existing = this.inFlightMaterializations.get(key);
    if (existing) {
      return existing;
    }

    const materialization = this.deps.materialize({
      queueType,
      currentPolicyHash: isNonEmptyString(snapshot?.policyHash) ? snapshot!.policyHash : policyId,
      currentGeneration: isPositiveInteger(snapshot?.generation) ? Number(snapshot!.generation) : null,
    }).catch((error) => {
      throw error;
    }).finally(() => {
      this.inFlightMaterializations.delete(key);
    });
    this.inFlightMaterializations.set(key, materialization);
    return materialization;
  }

  private async awaitBriefly(
    materialization: InFlightMaterialization,
  ): Promise<BackendQueueProjectionReplaceResult | null | 'timeout'> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), this.shortAwaitMs);
    });
    try {
      return await Promise.race([materialization, timeout]);
    } catch (error) {
      return null;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private toReadyReadiness(
    queueType: string,
    snapshot: BackendQueueProjectionSnapshotResult | null,
  ): QueueProjectionReadiness | null {
    if (
      !snapshot
      || snapshot.status !== 'ready'
      || !isNonEmptyString(snapshot.policyHash)
      || !isPositiveInteger(snapshot.generation)
    ) {
      return null;
    }
    return {
      status: 'ready',
      queueId: queueType,
      policyId: snapshot.policyHash,
      generation: Number(snapshot.generation),
    };
  }

  private unavailable(
    queueId: string,
    cause: QueueProjectionReadinessCause,
    reason: string,
    recoverable: boolean,
  ): QueueProjectionReadiness {
    return {
      status: 'unavailable',
      queueId,
      policyId: queueId ? this.buildPolicyId({ queueType: queueId }) : '',
      cause,
      reason,
      recoverable,
      retryAfterMs: recoverable ? this.retryAfterMs : undefined,
    };
  }

  private normalizeRequest(request: QueueProjectionReadinessRequest): CanonicalRequest {
    return {
      queueType: normalizeString(request.queueType) ?? '',
      preset: normalizeString(request.preset),
      searchText: normalizeString(request.searchText),
      docId: normalizeString(request.docId),
      scopeDocIds: Array.isArray(request.scopeDocIds)
        ? request.scopeDocIds.map((id) => normalizeString(id)).filter(isNonEmptyString).sort()
        : [],
      cardType: normalizeString(request.cardType),
      source: normalizeString(request.source),
    };
  }
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return isPositiveInteger(value) ? Number(value) : fallback;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
