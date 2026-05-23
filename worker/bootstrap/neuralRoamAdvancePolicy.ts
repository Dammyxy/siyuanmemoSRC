import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamAdvanceUnavailableReason,
  BackendNeuralRoamItem,
  BackendReviewFeedbackQueueImpact,
} from '../../packages/contracts/src/backend-rpc';
import type { FSRSCard } from '@/types/card';
import {
  isWorkerNeuralRoamAdvanceMismatchReason,
  normalizeWorkerNeuralRoamString,
} from './neuralRoamRoutePolicy';
import {
  buildWorkerNeuralRoamViewState,
  readWorkerNeuralRoamCounters,
  type WorkerNeuralRoamViewStateQueue,
} from './neuralRoamViewStateBuilder';

export interface WorkerNeuralRoamAdvanceQueue extends WorkerNeuralRoamViewStateQueue {
  getHistoryCount(sessionId: string | null): number;
  getNextCard(): Promise<FSRSCard | null>;
  exportPersistedState(): Record<string, unknown>;
}

export interface WorkerNeuralRoamProjectionReader {
  getQueueProjectionGeneration(queueType: string): Promise<{
    status: string;
    generation: number;
    policyHash: string | null;
  } | null>;
}

export class WorkerNeuralRoamAdvanceResultCache {
  private readonly results = new Map<string, BackendNeuralRoamAdvanceResult>();

  constructor(private readonly maxEntries = 500) {}

  get(idempotencyKey: unknown): BackendNeuralRoamAdvanceResult | null {
    const normalized = normalizeWorkerNeuralRoamString(idempotencyKey);
    return normalized ? this.results.get(normalized) ?? null : null;
  }

  remember(
    idempotencyKey: unknown,
    result: BackendNeuralRoamAdvanceResult,
  ): BackendNeuralRoamAdvanceResult {
    const normalized = normalizeWorkerNeuralRoamString(idempotencyKey);
    if (!normalized) {
      return result;
    }
    this.results.set(normalized, result);
    if (this.results.size > this.maxEntries) {
      const firstKey = this.results.keys().next().value;
      if (firstKey) {
        this.results.delete(firstKey);
      }
    }
    return result;
  }
}

export async function resolveWorkerNeuralRoamProjectionMismatch(
  reader: WorkerNeuralRoamProjectionReader,
  request: BackendNeuralRoamAdvanceRequest,
): Promise<BackendNeuralRoamAdvanceUnavailableReason | null> {
  const requestedGeneration = Number(request.projectionGeneration);
  const requestedPolicyHash = normalizeWorkerNeuralRoamString(request.policyHash);
  if ((!Number.isFinite(requestedGeneration) || requestedGeneration <= 0) && !requestedPolicyHash) {
    return null;
  }

  const current = await reader.getQueueProjectionGeneration('neural-roam');
  if (!current || current.status !== 'ready') {
    return 'generation-mismatch';
  }
  if (
    Number.isFinite(requestedGeneration)
    && requestedGeneration > 0
    && current.generation !== Math.floor(requestedGeneration)
  ) {
    return 'generation-mismatch';
  }
  if (requestedPolicyHash && current.policyHash !== requestedPolicyHash) {
    return 'policy-mismatch';
  }
  return null;
}

export async function readWorkerNeuralRoamNextItem(
  queue: Pick<WorkerNeuralRoamAdvanceQueue, 'getNextCard'>,
  toAdvanceItem: (card: FSRSCard) => BackendNeuralRoamItem,
): Promise<BackendNeuralRoamItem | null> {
  const card = await queue.getNextCard();
  return card ? toAdvanceItem(card) : null;
}

export async function buildWorkerNeuralRoamAdvanceResult(input: {
  request: BackendNeuralRoamAdvanceRequest;
  queue: WorkerNeuralRoamAdvanceQueue;
  status: BackendNeuralRoamAdvanceResult['status'];
  nextItem: BackendNeuralRoamItem | null;
  projectionImpact: BackendReviewFeedbackQueueImpact | null;
  unavailableReason: BackendNeuralRoamAdvanceUnavailableReason | null;
  message?: string | null;
}): Promise<BackendNeuralRoamAdvanceResult> {
  const navigation = input.queue.getNavigationState();
  const counters = await readWorkerNeuralRoamCounters(input.queue);
  if (input.status === 'exhausted') {
    counters.remaining = 0;
    counters.due = 0;
    counters.total = 0;
    counters.pendingAssociatedReview = 0;
  }
  const navigationSessionId = normalizeWorkerNeuralRoamString(navigation.sessionId)
    || normalizeWorkerNeuralRoamString(navigation.engineSessionId)
    || null;
  const sessionId = input.request.sessionId ?? navigationSessionId;
  const routeId = input.queue.getActiveRouteId();
  const viewState = await buildWorkerNeuralRoamViewState(input.queue, counters);
  return {
    queueType: 'neural-roam',
    routeId,
    sessionId,
    status: input.status,
    nextItem: input.nextItem,
    counters,
    sessionState: {
      sessionId,
      routeId,
      engineMode: normalizeWorkerNeuralRoamString(navigation.engineMode) || null,
      currentNodeId: normalizeWorkerNeuralRoamString(navigation.currentNodeId) || null,
      currentEventId: normalizeWorkerNeuralRoamString(navigation.currentEventId) || null,
      pathLength: Math.max(0, Math.floor(Number(navigation.pathLength || 0))),
      historyCount: input.queue.getHistoryCount(normalizeWorkerNeuralRoamString(navigation.sessionId) || null),
      exhausted: input.status === 'exhausted',
      projectionGeneration: input.request.projectionGeneration ?? null,
      policyHash: input.request.policyHash ?? null,
    },
    viewState,
    queueState: input.queue.exportPersistedState(),
    projectionImpact: input.projectionImpact,
    unavailableReason: input.unavailableReason,
    message: input.message ?? null,
  };
}

export async function buildWorkerNeuralRoamUnavailableAdvanceResult(input: {
  request: BackendNeuralRoamAdvanceRequest;
  queue: WorkerNeuralRoamAdvanceQueue | null;
  reason: BackendNeuralRoamAdvanceUnavailableReason;
  message: string;
}): Promise<BackendNeuralRoamAdvanceResult> {
  const projectionImpact = buildWorkerNeuralRoamUnavailableProjectionImpact(input.request, input.reason);
  if (input.queue) {
    return buildWorkerNeuralRoamAdvanceResult({
      request: input.request,
      queue: input.queue,
      status: isWorkerNeuralRoamAdvanceMismatchReason(input.reason) ? 'mismatch' : 'unavailable',
      nextItem: null,
      projectionImpact,
      unavailableReason: input.reason,
      message: input.message,
    });
  }
  return {
    queueType: 'neural-roam',
    sessionId: input.request.sessionId ?? null,
    status: isWorkerNeuralRoamAdvanceMismatchReason(input.reason) ? 'mismatch' : 'unavailable',
    nextItem: null,
    counters: {
      routeId: input.request.routeId ?? null,
      remaining: 0,
      due: 0,
      total: 0,
      pendingAssociatedReview: 0,
      sourceNodes: 0,
    },
    sessionState: {
      sessionId: input.request.sessionId ?? null,
      routeId: input.request.routeId ?? null,
      engineMode: null,
      currentNodeId: null,
      currentEventId: null,
      pathLength: 0,
      historyCount: 0,
      exhausted: false,
      projectionGeneration: input.request.projectionGeneration ?? null,
      policyHash: input.request.policyHash ?? null,
    },
    viewState: null,
    routeId: input.request.routeId ?? null,
    queueState: null,
    projectionImpact,
    unavailableReason: input.reason,
    message: input.message,
  };
}

export function buildWorkerNeuralRoamUnavailableProjectionImpact(
  request: BackendNeuralRoamAdvanceRequest,
  reason: BackendNeuralRoamAdvanceUnavailableReason,
): BackendReviewFeedbackQueueImpact | null {
  if (reason !== 'generation-mismatch' && reason !== 'policy-mismatch' && reason !== 'route-mismatch') {
    return null;
  }
  return {
    hotPatchable: false,
    refreshRequired: true,
    affectedQueues: [{
      queueType: 'neural-roam',
      policyHash: request.policyHash ?? null,
      generation: null,
      currentGeneration: null,
      requestedGeneration: request.projectionGeneration ?? null,
      hotPatchable: false,
      refreshRequired: true,
      reason,
      removedRowIds: [],
      insertedRows: [],
      updatedRows: [],
      reorderHints: [],
      counterGeneration: null,
      counters: null,
    }],
  };
}
