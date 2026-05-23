import {
  cloneRouteSnapshot,
  createDefaultRoute,
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  DEFAULT_NEURAL_ROAM_ROUTE_NAME,
  normalizeRouteId,
  normalizeRouteName,
  type NeuralRoamRouteHistoryEvent,
  type NeuralRoamRouteEngineMode,
  type NeuralRoamRouteListItem,
  type NeuralRoamRouteSnapshot,
  type NeuralRoamRouteState,
  type NeuralRoamRouteStats,
} from './NeuralRoamRoute';
import type {
  AppendNeuralRoamRouteHistoryInput,
  CreateNeuralRoamRouteInput,
  DeleteNeuralRoamRouteInput,
  DiscardTemporaryNeuralRoamRouteInput,
  NeuralRoamRouteClock,
  NeuralRoamRouteIdFactory,
  NeuralRoamRouteRepository,
  RenameNeuralRoamRouteInput,
  ReadNeuralRoamRouteHistoryInput,
  ReplaceActiveNeuralRoamRouteInput,
  SaveTemporaryNeuralRoamRouteInput,
  SwitchNeuralRoamRouteInput,
} from './NeuralRoamRouteRepository';

export class NeuralRoamRouteError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'route-not-found'
      | 'default-route-delete-forbidden'
      | 'route-name-empty'
      | 'history-event-invalid'
      | 'temporary-route-required',
  ) {
    super(message);
    this.name = 'NeuralRoamRouteError';
  }
}

export interface NeuralRoamRouteCatalogOptions {
  repository: NeuralRoamRouteRepository;
  idFactory?: NeuralRoamRouteIdFactory;
  clock?: NeuralRoamRouteClock;
}

export class NeuralRoamRouteCatalog {
  private readonly repository: NeuralRoamRouteRepository;
  private readonly idFactory: NeuralRoamRouteIdFactory;
  private readonly clock: NeuralRoamRouteClock;

  constructor(options: NeuralRoamRouteCatalogOptions) {
    this.repository = options.repository;
    this.idFactory = options.idFactory ?? {
      createRouteId: () => `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.clock = options.clock ?? { now: () => Date.now() };
  }

  async getState(): Promise<NeuralRoamRouteState> {
    return this.ensureState();
  }

  async listRoutes(): Promise<NeuralRoamRouteListItem[]> {
    const state = await this.ensureState();
    return this.sortRoutes(state.routes, state.activeRouteId).map((route) => ({
      ...route.metadata,
      initialSeedNodeIds: [...route.metadata.initialSeedNodeIds],
      stats: this.getRouteStatsFromSnapshot(route),
      isActive: route.metadata.id === state.activeRouteId,
    }));
  }

  async getActiveRoute(): Promise<NeuralRoamRouteSnapshot> {
    const state = await this.ensureState();
    return cloneRouteSnapshot(this.findRouteOrThrow(state, state.activeRouteId));
  }

  async getActiveRouteStats(): Promise<NeuralRoamRouteStats> {
    return this.getRouteStatsFromSnapshot(await this.getActiveRoute());
  }

  async getRouteStats(routeId: string): Promise<NeuralRoamRouteStats> {
    const state = await this.ensureState();
    return this.getRouteStatsFromSnapshot(this.findRouteOrThrow(state, routeId));
  }

  async replaceActiveRoute(input: ReplaceActiveNeuralRoamRouteInput): Promise<NeuralRoamRouteSnapshot> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, state.activeRouteId);
    const replacement = cloneRouteSnapshot(input.route);
    if (replacement.metadata.id !== route.metadata.id) {
      throw new NeuralRoamRouteError(`NeuralRoam route not found: ${replacement.metadata.id}`, 'route-not-found');
    }

    const now = this.clock.now();
    const nextRoute: NeuralRoamRouteSnapshot = {
      ...replacement,
      metadata: {
        ...route.metadata,
        name: replacement.metadata.name || route.metadata.name,
        temporary: route.metadata.temporary,
        previousRouteId: route.metadata.previousRouteId,
        initialSeedNodeIds: [...route.metadata.initialSeedNodeIds],
        createdAt: route.metadata.createdAt,
        updatedAt: now,
        lastUsedAt: now,
      },
    };
    state.routes = state.routes.map((candidate) => (
      candidate.metadata.id === route.metadata.id ? nextRoute : candidate
    ));
    if (input.engineMode) {
      state.engineMode = input.engineMode;
    }
    await this.saveState(state);
    return cloneRouteSnapshot(nextRoute);
  }

  async appendRouteHistory(input: AppendNeuralRoamRouteHistoryInput): Promise<NeuralRoamRouteHistoryEvent> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, input.routeId || state.activeRouteId);
    const event = this.normalizeHistoryEvent(route.metadata.id, input.event);
    route.history.push(event);
    route.history.sort((left, right) => left.visitedAt - right.visitedAt);
    const maxEntries = clampHistoryLimit(input.maxEntries);
    if (route.history.length > maxEntries) {
      route.history = route.history.slice(-maxEntries);
    }
    route.metadata.updatedAt = this.clock.now();
    await this.saveState(state);
    return { ...event };
  }

  async getRouteHistory(input: ReadNeuralRoamRouteHistoryInput = {}): Promise<{
    routeId: string;
    entries: NeuralRoamRouteHistoryEvent[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, input.routeId || state.activeRouteId);
    const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
    const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit) || 50)));
    const newestFirst = route.history.slice().sort((left, right) => right.visitedAt - left.visitedAt);
    const entries = newestFirst.slice(offset, offset + limit).map((event) => ({ ...event }));
    return {
      routeId: route.metadata.id,
      entries,
      totalCount: route.history.length,
      hasMore: offset + entries.length < route.history.length,
    };
  }

  async clearRouteHistory(routeId?: string | null): Promise<void> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, routeId || state.activeRouteId);
    route.history = [];
    route.metadata.updatedAt = this.clock.now();
    await this.saveState(state);
  }

  async createRoute(input: CreateNeuralRoamRouteInput = {}): Promise<NeuralRoamRouteSnapshot> {
    const state = await this.ensureState();
    const now = this.clock.now();
    const routeId = this.idFactory.createRouteId();
    const route: NeuralRoamRouteSnapshot = {
      metadata: {
        id: routeId,
        name: normalizeRouteName(input.name, input.temporary ? '临时：当前块' : '新航线'),
        temporary: input.temporary === true,
        previousRouteId: normalizeRouteId(input.previousRouteId) || null,
        initialSeedNodeIds: normalizeIdList(input.initialSeedNodeIds),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      },
      seedPool: [],
      anchorPool: [],
      sessions: {
        orbit: null,
        hyperspace: null,
      },
      history: [],
    };

    state.routes.push(route);
    state.activeRouteId = route.metadata.id;
    await this.saveState(state);
    return cloneRouteSnapshot(route);
  }

  async renameRoute(input: RenameNeuralRoamRouteInput): Promise<NeuralRoamRouteSnapshot> {
    const name = normalizeRouteName(input.name, '');
    if (!name) {
      throw new NeuralRoamRouteError('Route name cannot be empty', 'route-name-empty');
    }
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, input.routeId);
    const now = this.clock.now();
    route.metadata.name = name;
    route.metadata.updatedAt = now;
    await this.saveState(state);
    return cloneRouteSnapshot(route);
  }

  async switchRoute(input: SwitchNeuralRoamRouteInput): Promise<NeuralRoamRouteSnapshot> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, input.routeId);
    const now = this.clock.now();
    state.activeRouteId = route.metadata.id;
    route.metadata.lastUsedAt = now;
    route.metadata.updatedAt = now;
    await this.saveState(state);
    return cloneRouteSnapshot(route);
  }

  async saveTemporaryRoute(input: SaveTemporaryNeuralRoamRouteInput): Promise<NeuralRoamRouteSnapshot> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, input.routeId);
    if (!route.metadata.temporary) {
      throw new NeuralRoamRouteError('Route is not temporary', 'temporary-route-required');
    }

    const now = this.clock.now();
    route.metadata.temporary = false;
    route.metadata.name = normalizeRouteName(input.name, route.metadata.name.replace(/^临时：/, ''));
    route.metadata.previousRouteId = null;
    route.metadata.updatedAt = now;
    route.metadata.lastUsedAt = now;
    state.activeRouteId = route.metadata.id;
    await this.saveState(state);
    return cloneRouteSnapshot(route);
  }

  async discardTemporaryRoute(input: DiscardTemporaryNeuralRoamRouteInput): Promise<void> {
    const state = await this.ensureState();
    const route = this.findRouteOrThrow(state, input.routeId);
    if (!route.metadata.temporary) {
      throw new NeuralRoamRouteError('Route is not temporary', 'temporary-route-required');
    }

    state.routes = state.routes.filter((candidate) => candidate.metadata.id !== route.metadata.id);
    state.activeRouteId = this.resolveRouteAfterRemoval(state, route.metadata.previousRouteId);
    await this.saveState(state);
  }

  async deleteRoute(input: DeleteNeuralRoamRouteInput): Promise<void> {
    const state = await this.ensureState();
    const routeId = normalizeRouteId(input.routeId);
    if (routeId === DEFAULT_NEURAL_ROAM_ROUTE_ID) {
      throw new NeuralRoamRouteError('Default NeuralRoam route cannot be deleted', 'default-route-delete-forbidden');
    }
    this.findRouteOrThrow(state, routeId);

    state.routes = state.routes.filter((route) => route.metadata.id !== routeId);
    if (state.activeRouteId === routeId) {
      state.activeRouteId = DEFAULT_NEURAL_ROAM_ROUTE_ID;
      const defaultRoute = this.findRouteOrThrow(state, DEFAULT_NEURAL_ROAM_ROUTE_ID);
      const now = this.clock.now();
      defaultRoute.metadata.lastUsedAt = now;
      defaultRoute.metadata.updatedAt = now;
    }
    await this.saveState(state);
  }

  async setEngineMode(engineMode: NeuralRoamRouteEngineMode): Promise<void> {
    const state = await this.ensureState();
    state.engineMode = engineMode;
    await this.saveState(state);
  }

  private async ensureState(): Promise<NeuralRoamRouteState> {
    const loaded = await this.repository.loadState();
    const now = this.clock.now();
    let shouldSave = false;
    const state: NeuralRoamRouteState = loaded
      ? (() => {
          const activeRouteId = normalizeRouteId(loaded.activeRouteId) || DEFAULT_NEURAL_ROAM_ROUTE_ID;
          const engineMode = loaded.engineMode === 'hyperspace' ? 'hyperspace' : 'orbit';
          shouldSave = activeRouteId !== loaded.activeRouteId || engineMode !== loaded.engineMode;
          return {
            activeRouteId,
            engineMode,
            routes: loaded.routes.map(cloneRouteSnapshot),
          };
        })()
      : (() => {
          shouldSave = true;
          return {
            activeRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
            engineMode: 'orbit',
            routes: [createDefaultRoute(now)],
          };
        })();

    if (!state.routes.some((route) => route.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID)) {
      state.routes.unshift(createDefaultRoute(now));
      shouldSave = true;
    }
    if (!state.routes.some((route) => route.metadata.id === state.activeRouteId)) {
      state.activeRouteId = DEFAULT_NEURAL_ROAM_ROUTE_ID;
      shouldSave = true;
    }
    if (shouldSave) {
      await this.saveState(state);
    }
    return state;
  }

  private async saveState(state: NeuralRoamRouteState): Promise<void> {
    await this.repository.saveState({
      activeRouteId: state.activeRouteId,
      engineMode: state.engineMode,
      routes: state.routes.map(cloneRouteSnapshot),
    });
  }

  private findRouteOrThrow(state: NeuralRoamRouteState, routeId: string): NeuralRoamRouteSnapshot {
    const normalizedRouteId = normalizeRouteId(routeId);
    const route = state.routes.find((candidate) => candidate.metadata.id === normalizedRouteId);
    if (!route) {
      throw new NeuralRoamRouteError(`NeuralRoam route not found: ${normalizedRouteId}`, 'route-not-found');
    }
    return route;
  }

  private resolveRouteAfterRemoval(state: NeuralRoamRouteState, preferredRouteId: string | null): string {
    const preferred = normalizeRouteId(preferredRouteId);
    if (preferred && state.routes.some((route) => route.metadata.id === preferred)) {
      return preferred;
    }
    if (state.routes.some((route) => route.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID)) {
      return DEFAULT_NEURAL_ROAM_ROUTE_ID;
    }
    const fallback = createDefaultRoute(this.clock.now());
    state.routes.unshift(fallback);
    return fallback.metadata.id;
  }

  private getRouteStatsFromSnapshot(route: NeuralRoamRouteSnapshot): NeuralRoamRouteStats {
    return {
      routeId: route.metadata.id,
      seedCount: route.seedPool.length,
      anchorCount: route.anchorPool.length,
      historyCount: route.history.length,
      totalPoolEntries: route.seedPool.length + route.anchorPool.length,
    };
  }

  private normalizeHistoryEvent(
    routeId: string,
    input: AppendNeuralRoamRouteHistoryInput['event'],
  ): NeuralRoamRouteHistoryEvent {
    const eventId = normalizeRouteId(input.eventId);
    const nodeId = normalizeRouteId(input.nodeId);
    if (!eventId || !nodeId) {
      throw new NeuralRoamRouteError('Route history event requires eventId and nodeId', 'history-event-invalid');
    }
    return {
      routeId,
      eventId,
      engineMode: input.engineMode === 'hyperspace' ? 'hyperspace' : 'orbit',
      nodeId,
      cardId: normalizeRouteId(input.cardId) || null,
      title: normalizeRouteName(input.title, nodeId),
      activationKind: normalizeRouteId(input.activationKind) || 'unknown',
      sourceNodeId: normalizeRouteId(input.sourceNodeId) || null,
      sourceEventId: normalizeRouteId(input.sourceEventId) || null,
      branchRootNodeId: normalizeRouteId(input.branchRootNodeId) || null,
      sourceRole: input.sourceRole === 'orbit-center' || input.sourceRole === 'activation-source'
        ? input.sourceRole
        : null,
      origin: normalizeRouteId(input.origin) || null,
      traceQuality: input.traceQuality === 'legacy' || input.traceQuality === 'synthetic-root'
        ? input.traceQuality
        : 'exact',
      depth: Number.isFinite(Number(input.depth)) ? Number(input.depth) : null,
      conductionScore: Number.isFinite(Number(input.conductionScore)) ? Number(input.conductionScore) : null,
      visitedAt: Number.isFinite(Number(input.visitedAt)) ? Number(input.visitedAt) : this.clock.now(),
    };
  }

  private sortRoutes(routes: NeuralRoamRouteSnapshot[], activeRouteId: string): NeuralRoamRouteSnapshot[] {
    return [...routes].sort((left, right) => {
      const leftIsActiveTemporary = left.metadata.temporary && left.metadata.id === activeRouteId;
      const rightIsActiveTemporary = right.metadata.temporary && right.metadata.id === activeRouteId;
      if (leftIsActiveTemporary !== rightIsActiveTemporary) {
        return leftIsActiveTemporary ? -1 : 1;
      }
      if (left.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID && right.metadata.id !== DEFAULT_NEURAL_ROAM_ROUTE_ID) {
        return -1;
      }
      if (right.metadata.id === DEFAULT_NEURAL_ROAM_ROUTE_ID && left.metadata.id !== DEFAULT_NEURAL_ROAM_ROUTE_ID) {
        return 1;
      }
      return right.metadata.lastUsedAt - left.metadata.lastUsedAt;
    });
  }
}

function normalizeIdList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.map(normalizeRouteId).filter(Boolean)));
}

function clampHistoryLimit(value: unknown): number {
  const parsed = Math.floor(Number(value) || 3000);
  return Math.max(200, Math.min(5000, parsed));
}
