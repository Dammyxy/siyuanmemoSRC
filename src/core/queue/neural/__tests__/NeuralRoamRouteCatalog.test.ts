import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
  DEFAULT_NEURAL_ROAM_ROUTE_NAME,
  InMemoryNeuralRoamRouteRepository,
  NeuralRoamRouteCatalog,
  NeuralRoamRouteError,
  createDefaultRoute,
  type NeuralRoamRouteState,
} from '../routes';

function createCatalog(initialState?: NeuralRoamRouteState | null) {
  let now = 1_000;
  let nextId = 1;
  const repository = new InMemoryNeuralRoamRouteRepository(initialState);
  const catalog = new NeuralRoamRouteCatalog({
    repository,
    clock: {
      now: () => {
        now += 100;
        return now;
      },
    },
    idFactory: {
      createRouteId: () => `route-${nextId++}`,
    },
  });
  return { catalog, repository };
}

describe('NeuralRoamRouteCatalog', () => {
  it('does not rewrite route storage for valid read-only state lookups', async () => {
    const initialState: NeuralRoamRouteState = {
      activeRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      engineMode: 'orbit',
      routes: [createDefaultRoute(1_000)],
    };
    const repository = new InMemoryNeuralRoamRouteRepository(initialState);
    let saveCount = 0;
    const catalog = new NeuralRoamRouteCatalog({
      repository: {
        loadState: () => repository.loadState(),
        saveState: async (state) => {
          saveCount += 1;
          await repository.saveState(state);
        },
      },
      clock: { now: () => 2_000 },
    });

    await catalog.getState();
    await catalog.getActiveRouteStats();

    expect(saveCount).toBe(0);
  });

  it('creates the default route when no route state exists', async () => {
    const { catalog } = createCatalog();

    const state = await catalog.getState();

    expect(state.activeRouteId).toBe(DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(state.engineMode).toBe('orbit');
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0].metadata).toMatchObject({
      id: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      name: DEFAULT_NEURAL_ROAM_ROUTE_NAME,
      temporary: false,
    });
  });

  it('creates routes with duplicate names and stable ids', async () => {
    const { catalog } = createCatalog();

    const first = await catalog.createRoute({ name: '中子星' });
    const second = await catalog.createRoute({ name: '中子星' });

    expect(first.metadata.name).toBe('中子星');
    expect(second.metadata.name).toBe('中子星');
    expect(first.metadata.id).not.toBe(second.metadata.id);
  });

  it('orders active temporary route, default route, then ordinary routes by last used time', async () => {
    const { catalog } = createCatalog();

    const older = await catalog.createRoute({ name: 'older' });
    const newer = await catalog.createRoute({ name: 'newer' });
    await catalog.switchRoute({ routeId: older.metadata.id });
    await catalog.switchRoute({ routeId: newer.metadata.id });
    const temporary = await catalog.createRoute({
      name: '临时：黑洞',
      temporary: true,
      previousRouteId: newer.metadata.id,
    });

    const routes = await catalog.listRoutes();

    expect(routes.map((route) => route.id)).toEqual([
      temporary.metadata.id,
      DEFAULT_NEURAL_ROAM_ROUTE_ID,
      newer.metadata.id,
      older.metadata.id,
    ]);
  });

  it('renames routes without requiring unique names', async () => {
    const { catalog } = createCatalog();
    const first = await catalog.createRoute({ name: '量子力学' });
    const second = await catalog.createRoute({ name: '天体物理' });

    await catalog.renameRoute({ routeId: second.metadata.id, name: '量子力学' });
    const routes = await catalog.listRoutes();

    expect(routes.filter((route) => route.name === '量子力学').map((route) => route.id).sort()).toEqual(
      [first.metadata.id, second.metadata.id].sort(),
    );
  });

  it('prevents deleting the default route and switches to default when deleting the active ordinary route', async () => {
    const { catalog } = createCatalog();
    const route = await catalog.createRoute({ name: '天体物理' });

    await expect(catalog.deleteRoute({ routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID })).rejects.toMatchObject({
      code: 'default-route-delete-forbidden',
    } satisfies Partial<NeuralRoamRouteError>);

    await catalog.deleteRoute({ routeId: route.metadata.id });
    const state = await catalog.getState();

    expect(state.activeRouteId).toBe(DEFAULT_NEURAL_ROAM_ROUTE_ID);
    expect(state.routes.map((candidate) => candidate.metadata.id)).toEqual([DEFAULT_NEURAL_ROAM_ROUTE_ID]);
  });

  it('saves temporary routes in place and preserves active route id', async () => {
    const { catalog } = createCatalog();
    const temporary = await catalog.createRoute({
      name: '临时：中子星',
      temporary: true,
      previousRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      initialSeedNodeIds: ['concept-a'],
    });

    const saved = await catalog.saveTemporaryRoute({
      routeId: temporary.metadata.id,
      name: '中子星',
    });
    const state = await catalog.getState();

    expect(saved.metadata).toMatchObject({
      id: temporary.metadata.id,
      name: '中子星',
      temporary: false,
      previousRouteId: null,
    });
    expect(state.activeRouteId).toBe(temporary.metadata.id);
  });

  it('discards temporary routes and restores the previous route', async () => {
    const { catalog } = createCatalog();
    const ordinary = await catalog.createRoute({ name: '普通航线' });
    const temporary = await catalog.createRoute({
      name: '临时：当前块',
      temporary: true,
      previousRouteId: ordinary.metadata.id,
    });

    await catalog.discardTemporaryRoute({ routeId: temporary.metadata.id });
    const state = await catalog.getState();

    expect(state.activeRouteId).toBe(ordinary.metadata.id);
    expect(state.routes.some((route) => route.metadata.id === temporary.metadata.id)).toBe(false);
  });

  it('reports stats for the active route only', async () => {
    const { catalog, repository } = createCatalog();
    const state = await catalog.getState();
    const defaultRoute = state.routes[0];
    defaultRoute.seedPool.push({
      routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      nodeId: 'concept-a',
      kind: 'seed',
      nodeKind: 'concept',
      priority: 0.5,
      addedAt: 1,
      visitedAt: null,
      preview: 'Concept A',
    });
    defaultRoute.anchorPool.push({
      routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      nodeId: 'station-a',
      kind: 'anchor',
      nodeKind: 'virtual',
      priority: 0.5,
      addedAt: 1,
      visitedAt: null,
      preview: 'Station A',
    });
    defaultRoute.history.push({
      routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      eventId: 'event-a',
      engineMode: 'orbit',
      nodeId: 'concept-a',
      cardId: null,
      title: 'Concept A',
      activationKind: 'focus-root',
      sourceNodeId: null,
      visitedAt: 1,
    });
    await repository.saveState(state);

    const stats = await catalog.getActiveRouteStats();

    expect(stats).toEqual({
      routeId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      seedCount: 1,
      anchorCount: 1,
      historyCount: 1,
      totalPoolEntries: 2,
    });
  });

  it('keeps route history as a chronological event log without deduping repeated nodes', async () => {
    const { catalog } = createCatalog();

    await catalog.appendRouteHistory({
      event: {
        eventId: 'event-late',
        engineMode: 'hyperspace',
        nodeId: 'concept-a',
        title: 'Concept A',
        activationKind: 'source-root',
        visitedAt: 30,
      },
    });
    await catalog.appendRouteHistory({
      event: {
        eventId: 'event-early',
        engineMode: 'orbit',
        nodeId: 'concept-a',
        title: 'Concept A',
        activationKind: 'focus-root',
        visitedAt: 10,
      },
    });

    const state = await catalog.getState();
    const history = await catalog.getRouteHistory({ limit: 10 });

    expect(state.routes[0].history.map((event) => event.eventId)).toEqual(['event-early', 'event-late']);
    expect(history.entries.map((event) => event.eventId)).toEqual(['event-late', 'event-early']);
    expect(history.totalCount).toBe(2);
  });

  it('clamps route history to the configured limit and clears it independently', async () => {
    const { catalog } = createCatalog();

    for (let index = 0; index < 205; index += 1) {
      await catalog.appendRouteHistory({
        maxEntries: 200,
        event: {
          eventId: `event-${index}`,
          engineMode: 'orbit',
          nodeId: `node-${index}`,
          title: `Node ${index}`,
          activationKind: 'graph-edge',
          visitedAt: index,
        },
      });
    }

    const capped = await catalog.getRouteHistory({ offset: 0, limit: 250 });
    expect(capped.totalCount).toBe(200);
    expect(capped.entries.at(-1)?.eventId).toBe('event-5');

    await catalog.clearRouteHistory();

    const cleared = await catalog.getRouteHistory();
    expect(cleared.totalCount).toBe(0);
    expect(cleared.entries).toEqual([]);
  });
});
