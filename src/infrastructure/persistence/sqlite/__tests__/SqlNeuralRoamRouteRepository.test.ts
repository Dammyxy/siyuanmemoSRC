import { describe, expect, it } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { DEFAULT_NEURAL_ROAM_ROUTE_ID, type NeuralRoamRouteState } from '@/core/queue/neural/routes';
import { SqliteDatabaseService } from '../SqliteDatabaseService';
import { SqlNeuralRoamRouteRepository } from '../SqlNeuralRoamRouteRepository';

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, new Uint8Array(bytes));
  }
}

function routeState(): NeuralRoamRouteState {
  return {
    activeRouteId: 'route-a',
    engineMode: 'hyperspace',
    routes: [
      {
        metadata: {
          id: DEFAULT_NEURAL_ROAM_ROUTE_ID,
          name: '默认航线',
          temporary: false,
          previousRouteId: null,
          initialSeedNodeIds: [],
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: 1,
        },
        seedPool: [],
        anchorPool: [],
        sessions: { orbit: null, hyperspace: null },
        history: [],
      },
      {
        metadata: {
          id: 'route-a',
          name: '天体物理',
          temporary: false,
          previousRouteId: null,
          initialSeedNodeIds: ['concept-a'],
          createdAt: 2,
          updatedAt: 3,
          lastUsedAt: 4,
        },
        seedPool: [{
          routeId: 'route-a',
          nodeId: 'concept-a',
          kind: 'seed',
          nodeKind: 'concept',
          priority: 0.8,
          addedAt: 5,
          visitedAt: null,
          preview: 'Concept A',
        }],
        anchorPool: [{
          routeId: 'route-a',
          nodeId: 'station-a',
          kind: 'anchor',
          nodeKind: 'virtual',
          role: 'orbit-center',
          priority: 0.6,
          addedAt: 6,
          visitedAt: 7,
          preview: 'Station A',
        }],
        sessions: {
          orbit: {
            displayPath: ['concept-a'],
            currentPathIndex: 0,
            navigationMode: 'explore',
            bookmarkPathIndex: null,
            history: [],
            currentFocus: 'concept-a',
            currentSessionId: 'orbit-session',
            visitedBlocks: ['concept-a'],
            exhaustedFocuses: [],
          },
          hyperspace: {
            displayPath: ['station-a'],
            currentPathIndex: 0,
            navigationMode: 'explore',
            bookmarkPathIndex: null,
            history: [],
            currentLeadSource: 'station-a',
            currentSessionId: 'hyper-session',
            visitedBlocks: ['station-a'],
            frontier: [],
          },
        },
        history: [{
          routeId: 'route-a',
          eventId: 'event-a',
          engineMode: 'hyperspace',
          nodeId: 'station-a',
          cardId: null,
          title: 'Station A',
          activationKind: 'source-root',
          sourceNodeId: null,
          visitedAt: 8,
        }],
      },
    ],
  };
}

describe('SqlNeuralRoamRouteRepository', () => {
  it('round-trips route metadata, pool entries, history, sessions, and active state', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlNeuralRoamRouteRepository(database);

    await repository.saveState(routeState());

    const loaded = await repository.loadState();
    expect(loaded).toMatchObject(routeState());
  });

  it('cleans up deleted route rows on save', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlNeuralRoamRouteRepository(database);
    const state = routeState();
    await repository.saveState(state);

    await repository.saveState({
      activeRouteId: DEFAULT_NEURAL_ROAM_ROUTE_ID,
      engineMode: 'orbit',
      routes: [state.routes[0]],
    });

    const loaded = await repository.loadState();
    expect(loaded?.routes.map((route) => route.metadata.id)).toEqual([DEFAULT_NEURAL_ROAM_ROUTE_ID]);
    expect(database.getAll('SELECT * FROM neural_roam_route_pool_entries WHERE route_id = ?', ['route-a'])).toEqual([]);
    expect(database.getAll('SELECT * FROM neural_roam_route_history_events WHERE route_id = ?', ['route-a'])).toEqual([]);
    expect(database.getAll('SELECT * FROM neural_roam_route_session_snapshots WHERE route_id = ?', ['route-a'])).toEqual([]);
  });

  it('reads route-filtered pool entries and paged route history', async () => {
    const database = new SqliteDatabaseService(new MemorySqliteFileService());
    await database.init();
    const repository = new SqlNeuralRoamRouteRepository(database);
    const state = routeState();
    state.routes[1].history.push({
      routeId: 'route-a',
      eventId: 'event-b',
      engineMode: 'orbit',
      nodeId: 'concept-a',
      cardId: 'card-a',
      title: 'Concept A',
      activationKind: 'graph-edge',
      sourceNodeId: 'station-a',
      visitedAt: 9,
    });
    await repository.saveState(state);

    expect(repository.readRoutePoolEntries('route-a', 'seed').map((entry) => entry.nodeId)).toEqual(['concept-a']);
    expect(repository.readRoutePoolEntries('route-a', 'anchor').map((entry) => entry.nodeId)).toEqual(['station-a']);

    const page = repository.readRouteHistoryPage({ routeId: 'route-a', offset: 0, limit: 1 });
    expect(page.totalCount).toBe(2);
    expect(page.hasMore).toBe(true);
    expect(page.entries.map((entry) => entry.eventId)).toEqual(['event-b']);
  });

});
