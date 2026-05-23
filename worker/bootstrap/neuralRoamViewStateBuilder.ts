import type {
  BackendNeuralRoamCounters,
  BackendNeuralRoamRouteListItem,
  BackendNeuralRoamViewState,
  BackendNeuralRoamViewStateProgress,
} from '../../packages/contracts/src/backend-rpc';

export interface WorkerNeuralRoamViewStateQueue {
  getActiveRouteId(): string | null;
  getNavigationState(): Record<string, unknown>;
  getEngineMode?: () => string | null;
  getSize(): Promise<number>;
  getSourceSnapshot(): unknown[];
  getAnchorSnapshot(): unknown[];
  listRoutes?: () => Promise<WorkerNeuralRoamRouteLike[]>;
  getHistoryPage(request: { offset: number; limit: number }): { entries: unknown[] };
  getRouteHistoryPage?: (request: { offset: number; limit: number }) => Promise<{ entries: unknown[] }>;
  getCurrentBatchSnapshot(): WorkerNeuralRoamBatchSnapshotLike | null;
}

export interface WorkerNeuralRoamRouteLike {
  id: string;
  name: string;
  temporary?: boolean;
  previousRouteId?: string | null;
  initialSeedNodeIds?: string[];
  createdAt?: number;
  updatedAt?: number;
  lastUsedAt?: number;
  stats?: BackendNeuralRoamRouteListItem['stats'];
  isActive?: boolean;
}

export interface WorkerNeuralRoamBatchSnapshotLike {
  kind?: BackendNeuralRoamViewStateProgress['kind'];
  engineMode?: string | null;
  viewedCount?: number | null;
  roundSize?: number | null;
  remainingCount?: number | null;
}

export async function readWorkerNeuralRoamCounters(
  queue: Pick<WorkerNeuralRoamViewStateQueue, 'getActiveRouteId' | 'getSize' | 'getSourceSnapshot'>,
): Promise<BackendNeuralRoamCounters> {
  const total = await queue.getSize();
  const sourceNodes = queue.getSourceSnapshot().length;
  return {
    routeId: queue.getActiveRouteId(),
    remaining: total,
    due: total,
    total,
    pendingAssociatedReview: Math.max(0, total - sourceNodes),
    sourceNodes,
  };
}

export async function buildWorkerNeuralRoamViewState(
  queue: WorkerNeuralRoamViewStateQueue,
  counters?: BackendNeuralRoamCounters,
): Promise<BackendNeuralRoamViewState> {
  const navigation = queue.getNavigationState();
  const routeId = queue.getActiveRouteId();
  const routes = typeof queue.listRoutes === 'function'
    ? await queue.listRoutes()
    : [];
  const route = routes.find((candidate) => candidate.isActive)
    ?? routes.find((candidate) => candidate.id === routeId)
    ?? null;
  const historyRequest = { offset: 0, limit: 200 };
  const engineHistory = queue.getHistoryPage(historyRequest).entries;
  const routeHistory = typeof queue.getRouteHistoryPage === 'function'
    ? (await queue.getRouteHistoryPage(historyRequest)).entries
    : engineHistory;
  const resolvedCounters = counters ?? await readWorkerNeuralRoamCounters(queue);
  return {
    version: 1,
    queueType: 'neural-roam',
    route: {
      id: route?.id ?? routeId ?? null,
      name: route?.name ?? null,
      temporary: route?.temporary === true,
      previousRouteId: route?.previousRouteId ?? null,
    },
    routes: routes.map((candidate) => toWorkerNeuralRoamRouteListItem(candidate, routeId)),
    engineMode: asNullableString(navigation.engineMode) ?? queue.getEngineMode?.() ?? null,
    currentNodeId: asNullableString(navigation.currentNodeId),
    currentEventId: asNullableString(navigation.currentEventId),
    navigationState: { ...navigation },
    counters: { ...resolvedCounters },
    sources: cloneRecordArray(queue.getSourceSnapshot()),
    anchors: cloneRecordArray(queue.getAnchorSnapshot()),
    engineHistory: cloneRecordArray(engineHistory),
    routeHistory: cloneRecordArray(routeHistory),
    batchProgress: buildWorkerNeuralRoamProgress(queue.getCurrentBatchSnapshot()),
    updatedAt: Date.now(),
  };
}

export function buildWorkerNeuralRoamProgress(
  batch: WorkerNeuralRoamBatchSnapshotLike | null | undefined,
): BackendNeuralRoamViewStateProgress {
  return {
    kind: batch?.kind ?? 'none',
    viewedCount: Math.max(0, Math.floor(Number(batch?.viewedCount) || 0)),
    totalCount: Math.max(0, Math.floor(Number(batch?.roundSize) || 0)),
    remainingCount: Math.max(0, Math.floor(Number(batch?.remainingCount) || 0)),
    label: batch?.engineMode === 'hyperspace' ? 'depth' : batch ? 'orbit-round' : 'none',
  };
}

export function toWorkerNeuralRoamRouteListItem(
  route: WorkerNeuralRoamRouteLike,
  activeRouteId: string | null,
): BackendNeuralRoamRouteListItem {
  return {
    id: route.id,
    name: route.name,
    temporary: route.temporary === true,
    previousRouteId: route.previousRouteId ?? null,
    initialSeedNodeIds: [...(route.initialSeedNodeIds ?? [])],
    createdAt: Number(route.createdAt) || 0,
    updatedAt: Number(route.updatedAt) || 0,
    lastUsedAt: Number(route.lastUsedAt) || 0,
    stats: route.stats ?? {
      routeId: route.id,
      seedCount: 0,
      anchorCount: 0,
      historyCount: 0,
      totalPoolEntries: 0,
    },
    isActive: route.isActive === true || route.id === activeRouteId,
  };
}

function cloneRecordArray(entries: unknown[]): unknown[] {
  return entries.map((entry) => (
    entry && typeof entry === 'object'
      ? { ...(entry as Record<string, unknown>) }
      : entry
  ));
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
