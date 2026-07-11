import type {
  NeuralRoamRouteHistoryEvent,
  NeuralRoamRoutePoolEntry,
  NeuralRoamRouteSessionSnapshots,
  NeuralRoamRouteSnapshot,
  NeuralRoamRouteState,
} from '@/core/queue/neural/routes';
import {
  cloneRouteSnapshot,
  DEFAULT_NEURAL_ROAM_ROUTE_ID,
} from '@/core/queue/neural/routes';
import { parseJson, stringifyJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

type RouteRow = Record<string, string | number | null> & {
  route_id: string;
  name: string;
  temporary: number;
  previous_route_id: string | null;
  initial_seed_node_ids_json: string;
  created_at: number;
  updated_at: number;
  last_used_at: number;
};

type PoolEntryRow = Record<string, string | number | null> & {
  route_id: string;
  node_id: string;
  kind: string;
  node_kind: string;
  role: string | null;
  priority: number;
  added_at: number;
  visited_at: number | null;
  preview: string;
};

type HistoryEventRow = Record<string, string | number | null> & {
  event_id: string;
  route_id: string;
  engine_mode: string;
  node_id: string;
  card_id: string | null;
  title: string;
  activation_kind: string;
  source_node_id: string | null;
  source_event_id: string | null;
  branch_root_node_id: string | null;
  source_role: string | null;
  origin: string | null;
  trace_quality: string | null;
  depth: number | null;
  conduction_score: number | null;
  visited_at: number;
};

type SessionSnapshotRow = Record<string, string | number> & {
  route_id: string;
  engine_mode: string;
  snapshot_json: string;
  updated_at: number;
};

type ActiveRouteRow = Record<string, string | number> & {
  active_route_id: string;
  engine_mode: string;
};

export class SqlNeuralRoamRouteRepository {
  constructor(private readonly database: SqliteDatabaseService) {}

  async loadState(): Promise<NeuralRoamRouteState | null> {
    const routeRows = this.database.getAll<RouteRow>(
      `SELECT route_id, name, temporary, previous_route_id, initial_seed_node_ids_json,
              created_at, updated_at, last_used_at
       FROM neural_roam_routes
       ORDER BY route_id`,
    );
    if (routeRows.length === 0) {
      return null;
    }

    const active = this.database.getOne<ActiveRouteRow>(
      `SELECT active_route_id, engine_mode
       FROM neural_roam_route_active
       WHERE singleton_id = 'active'`,
    );
    const routes = routeRows.map((row) => this.readRoute(row));
    const activeRouteId = routes.some((route) => route.metadata.id === active?.active_route_id)
      ? active!.active_route_id
      : DEFAULT_NEURAL_ROAM_ROUTE_ID;

    return {
      activeRouteId,
      engineMode: active?.engine_mode === 'hyperspace' ? 'hyperspace' : 'orbit',
      routes,
    };
  }

  async saveState(state: NeuralRoamRouteState): Promise<void> {
    await this.database.write(() => {
      this.saveStateInCurrentTransaction(state);
    }, { label: 'neural-roam-route.save-state' });
  }

  saveStateInCurrentTransaction(state: NeuralRoamRouteState): void {
    const snapshot: NeuralRoamRouteState = {
      activeRouteId: state.activeRouteId,
      engineMode: state.engineMode === 'hyperspace' ? 'hyperspace' : 'orbit',
      routes: state.routes.map(cloneRouteSnapshot),
    };
    this.database.run('DELETE FROM neural_roam_route_active');
    this.database.run('DELETE FROM neural_roam_route_session_snapshots');
    this.database.run('DELETE FROM neural_roam_route_history_events');
    this.database.run('DELETE FROM neural_roam_route_pool_entries');
    this.database.run('DELETE FROM neural_roam_routes');

    const now = Date.now();
    this.database.run(
      `INSERT INTO neural_roam_route_active (singleton_id, active_route_id, engine_mode, updated_at)
       VALUES ('active', ?, ?, ?)`,
      [snapshot.activeRouteId, snapshot.engineMode, now],
    );

    for (const route of snapshot.routes) {
      this.writeRoute(route);
    }
  }

  readRoutePoolEntries(routeId: string, kind: 'seed' | 'anchor'): NeuralRoamRoutePoolEntry[] {
    return this.readPoolEntries(routeId, kind);
  }

  readRouteHistoryPage(input: {
    routeId: string;
    offset?: number;
    limit?: number;
  }): {
    entries: NeuralRoamRouteHistoryEvent[];
    totalCount: number;
    hasMore: boolean;
  } {
    const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
    const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit) || 50)));
    const totalRow = this.database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM neural_roam_route_history_events
       WHERE route_id = ?`,
      [input.routeId],
    );
    const rows = this.database.getAll<HistoryEventRow>(
      `SELECT event_id, route_id, engine_mode, node_id, card_id, title, activation_kind,
              source_node_id, source_event_id, branch_root_node_id, source_role, origin,
              trace_quality, depth, conduction_score, visited_at
       FROM neural_roam_route_history_events
       WHERE route_id = ?
       ORDER BY visited_at DESC, event_id DESC
       LIMIT ? OFFSET ?`,
      [input.routeId, limit, offset],
    );
    const totalCount = Number(totalRow?.count) || 0;
    return {
      entries: rows.map(historyRowToEvent),
      totalCount,
      hasMore: offset + rows.length < totalCount,
    };
  }

  private readRoute(row: RouteRow): NeuralRoamRouteSnapshot {
    const routeId = row.route_id;
    return {
      metadata: {
        id: routeId,
        name: row.name,
        temporary: Number(row.temporary) === 1,
        previousRouteId: row.previous_route_id,
        initialSeedNodeIds: parseJson<string[]>(row.initial_seed_node_ids_json, []),
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
        lastUsedAt: Number(row.last_used_at) || 0,
      },
      seedPool: this.readPoolEntries(routeId, 'seed'),
      anchorPool: this.readPoolEntries(routeId, 'anchor'),
      sessions: this.readSessionSnapshots(routeId),
      history: this.readHistoryEvents(routeId),
    };
  }

  private writeRoute(route: NeuralRoamRouteSnapshot): void {
    this.database.run(
      `INSERT INTO neural_roam_routes (
        route_id, name, temporary, previous_route_id, initial_seed_node_ids_json,
        created_at, updated_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        route.metadata.id,
        route.metadata.name,
        route.metadata.temporary ? 1 : 0,
        route.metadata.previousRouteId,
        stringifyJson(route.metadata.initialSeedNodeIds),
        route.metadata.createdAt,
        route.metadata.updatedAt,
        route.metadata.lastUsedAt,
      ],
    );

    for (const entry of [...route.seedPool, ...route.anchorPool]) {
      this.writePoolEntry(entry);
    }
    for (const event of route.history) {
      this.writeHistoryEvent(event);
    }
    this.writeSessionSnapshot(route.metadata.id, 'orbit', route.sessions.orbit);
    this.writeSessionSnapshot(route.metadata.id, 'hyperspace', route.sessions.hyperspace);
  }

  private readPoolEntries(routeId: string, kind: 'seed' | 'anchor'): NeuralRoamRoutePoolEntry[] {
    const rows = this.database.getAll<PoolEntryRow>(
      `SELECT route_id, node_id, kind, node_kind, role, priority, added_at, visited_at, preview
       FROM neural_roam_route_pool_entries
       WHERE route_id = ? AND kind = ?
       ORDER BY added_at ASC, node_id ASC`,
      [routeId, kind],
    );
    return rows.map((row) => ({
      routeId: row.route_id,
      nodeId: row.node_id,
      kind: row.kind === 'anchor' ? 'anchor' : 'seed',
      nodeKind: row.node_kind === 'virtual' ? 'virtual' : row.node_kind === 'element' ? 'element' : 'concept',
      role: row.role === 'activation-source' ? 'activation-source' : row.role === 'orbit-center' ? 'orbit-center' : null,
      priority: Number(row.priority) || 0,
      addedAt: Number(row.added_at) || 0,
      visitedAt: typeof row.visited_at === 'number' ? row.visited_at : null,
      preview: row.preview,
    }));
  }

  private writePoolEntry(entry: NeuralRoamRoutePoolEntry): void {
    this.database.run(
      `INSERT INTO neural_roam_route_pool_entries (
        route_id, node_id, kind, node_kind, role, priority, added_at, visited_at, preview
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.routeId,
        entry.nodeId,
        entry.kind,
        entry.nodeKind,
        entry.role ?? null,
        entry.priority,
        entry.addedAt,
        entry.visitedAt,
        entry.preview,
      ],
    );
  }

  private readHistoryEvents(routeId: string): NeuralRoamRouteHistoryEvent[] {
    const rows = this.database.getAll<HistoryEventRow>(
      `SELECT event_id, route_id, engine_mode, node_id, card_id, title, activation_kind,
              source_node_id, source_event_id, branch_root_node_id, source_role, origin,
              trace_quality, depth, conduction_score, visited_at
       FROM neural_roam_route_history_events
       WHERE route_id = ?
       ORDER BY visited_at ASC, event_id ASC`,
      [routeId],
    );
    return rows.map(historyRowToEvent);
  }

  private writeHistoryEvent(event: NeuralRoamRouteHistoryEvent): void {
    this.database.run(
      `INSERT INTO neural_roam_route_history_events (
        event_id, route_id, engine_mode, node_id, card_id, title, activation_kind,
        source_node_id, source_event_id, branch_root_node_id, source_role, origin,
        trace_quality, depth, conduction_score, visited_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.routeId,
        event.engineMode,
        event.nodeId,
        event.cardId,
        event.title,
        event.activationKind,
        event.sourceNodeId,
        event.sourceEventId ?? null,
        event.branchRootNodeId ?? null,
        event.sourceRole ?? null,
        event.origin ?? null,
        event.traceQuality ?? (event.sourceEventId ? 'exact' : 'legacy'),
        event.depth ?? null,
        event.conductionScore ?? null,
        event.visitedAt,
      ],
    );
  }

  private readSessionSnapshots(routeId: string): NeuralRoamRouteSessionSnapshots {
    const rows = this.database.getAll<SessionSnapshotRow>(
      `SELECT route_id, engine_mode, snapshot_json, updated_at
       FROM neural_roam_route_session_snapshots
       WHERE route_id = ?`,
      [routeId],
    );
    const sessions: NeuralRoamRouteSessionSnapshots = {
      orbit: null,
      hyperspace: null,
    };
    for (const row of rows) {
      if (row.engine_mode === 'hyperspace') {
        sessions.hyperspace = parseJson(row.snapshot_json, null);
      } else {
        sessions.orbit = parseJson(row.snapshot_json, null);
      }
    }
    return sessions;
  }

  private writeSessionSnapshot(
    routeId: string,
    engineMode: 'orbit' | 'hyperspace',
    snapshot: unknown,
  ): void {
    if (!snapshot) {
      return;
    }
    this.database.run(
      `INSERT INTO neural_roam_route_session_snapshots (
        route_id, engine_mode, snapshot_json, updated_at
      ) VALUES (?, ?, ?, ?)`,
      [routeId, engineMode, stringifyJson(snapshot), Date.now()],
    );
  }
}

function historyRowToEvent(row: HistoryEventRow): NeuralRoamRouteHistoryEvent {
  return {
    eventId: row.event_id,
    routeId: row.route_id,
    engineMode: row.engine_mode === 'hyperspace' ? 'hyperspace' : 'orbit',
    nodeId: row.node_id,
    cardId: row.card_id,
    title: row.title,
    activationKind: row.activation_kind,
    sourceNodeId: row.source_node_id,
    sourceEventId: row.source_event_id,
    branchRootNodeId: row.branch_root_node_id,
    sourceRole: row.source_role === 'orbit-center' || row.source_role === 'activation-source'
      ? row.source_role
      : null,
    origin: row.origin,
    traceQuality: row.trace_quality === 'exact' || row.trace_quality === 'synthetic-root'
      ? row.trace_quality
      : 'legacy',
    depth: typeof row.depth === 'number' ? row.depth : null,
    conductionScore: typeof row.conduction_score === 'number' ? row.conduction_score : null,
    visitedAt: Number(row.visited_at) || 0,
  };
}
