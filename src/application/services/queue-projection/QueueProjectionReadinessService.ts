import type {
  BackendQueueProjectionSnapshotResult,
  QueueProjectionReadiness,
  QueueProjectionReadinessCause,
  QueueProjectionReadinessRequest,
} from '../../../../packages/contracts/src/backend-rpc';

export type QueueProjectionReadinessSnapshotReader = (
  request: { queueType: string; policyHash?: string | null; generation?: number | null },
) => Promise<BackendQueueProjectionSnapshotResult | null>;

export type QueueProjectionReadinessServiceDeps = {
  readSnapshot: QueueProjectionReadinessSnapshotReader;
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

const DEFAULT_RETRY_AFTER_MS = 300;

export class QueueProjectionReadinessService {
  private readonly retryAfterMs: number;

  constructor(private readonly deps: QueueProjectionReadinessServiceDeps) {
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

    return {
      status: 'refreshing',
      queueId: canonical.queueType,
      policyId,
      cause: this.resolveRefreshingCause(snapshot),
      retryAfterMs: this.retryAfterMs,
    };
  }

  buildPolicyId(request: QueueProjectionReadinessRequest): string {
    const canonical = this.normalizeRequest(request);
    return `queue-projection:${stableStringify(canonical)}`;
  }

  private resolveRefreshingCause(snapshot: BackendQueueProjectionSnapshotResult | null): QueueProjectionReadinessCause {
    if (!snapshot) {
      return 'projection_unavailable';
    }
    if (hasProjectionFreshnessGap(snapshot.freshness)) {
      return 'projection_stale';
    }
    if (snapshot.status === 'refreshing') {
      return 'projection_stale';
    }
    if (snapshot.status === 'invalidated' || snapshot.status === 'rebuilding' || snapshot.status === 'repairing') {
      return 'materialization_in_progress';
    }
    if (snapshot.status === 'unavailable') {
      return 'projection_unavailable';
    }
    return 'materialization_in_progress';
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
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function hasProjectionFreshnessGap(
  freshness: BackendQueueProjectionSnapshotResult['freshness'] | null | undefined,
): boolean {
  if (!freshness) {
    return false;
  }
  return Math.max(0, Number(freshness.staleRows) || 0) > 0
    || Math.max(0, Number(freshness.missingRows) || 0) > 0;
}
