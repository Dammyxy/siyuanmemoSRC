import type {
  SemanticEvent,
  SemanticLens,
  SemanticMemoryProjection,
  SemanticPathEntry,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';
import type { SemanticActivationPersistencePort } from '@/application/ports/SemanticActivationPersistencePort';
import { parseJson, stringifyJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

type SemanticSessionRow = Record<string, string | number | null> & {
  session_id: string;
  root_focus_node_id: string;
  current_node_id: string;
  active_lens: string;
  narrative_path_json: string;
  started_at: number;
  ended_at: number | null;
  payload_json: string;
  updated_at: number;
};

type SemanticEventRow = Record<string, string | number | null> & {
  event_id: string;
  session_id: string;
  event_type: string;
  node_id: string | null;
  from_node_id: string | null;
  to_node_id: string | null;
  lens: string | null;
  occurred_at: number;
  payload_json: string;
};

type SemanticStationRow = Record<string, string | number | null> & {
  station_id: string;
  station_type: string;
  session_id: string;
  node_id: string | null;
  path_json: string;
  lens_history_json: string;
  created_at: number;
  payload_json: string;
};

type SemanticRelationRow = Record<string, string | number | null> & {
  relation_id: string;
  from_node_id: string;
  to_node_id: string;
  decision: string;
  source: string;
  confidence: number;
  reason: string | null;
  decided_at: number;
  payload_json: string;
};

type SemanticProjectionRow = Record<string, string | number | null> & {
  projection_key: string;
  version: number;
  session_id: string | null;
  node_memory_json: string;
  edge_memory_json: string;
  rebuilt_at: number;
  payload_json: string;
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireString(value: unknown, field: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`INVALID_REQUEST: semantic persistence requires ${field}`);
  }
  return normalized;
}

function projectionKey(sessionId?: string | null): string {
  return normalizeNullableString(sessionId) ?? 'global';
}

function rowToSession(row: SemanticSessionRow): SemanticSessionSnapshot {
  return {
    sessionId: row.session_id,
    rootFocusNodeId: row.root_focus_node_id,
    currentNodeId: row.current_node_id,
    activeLens: row.active_lens as SemanticLens,
    narrativePath: parseJson<SemanticPathEntry[]>(row.narrative_path_json, []),
    startedAt: normalizeFiniteNumber(row.started_at),
    endedAt: typeof row.ended_at === 'number' ? row.ended_at : null,
  };
}

function rowToEvent(row: SemanticEventRow): SemanticEvent {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    type: row.event_type as SemanticEvent['type'],
    nodeId: row.node_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    lens: row.lens as SemanticLens | null,
    occurredAt: normalizeFiniteNumber(row.occurred_at),
    payload: parseJson<Record<string, unknown> | null>(row.payload_json, null),
  };
}

function rowToStation(row: SemanticStationRow): SemanticStation {
  return {
    stationId: row.station_id,
    type: row.station_type as SemanticStation['type'],
    sessionId: row.session_id,
    nodeId: row.node_id,
    path: parseJson<SemanticPathEntry[] | null>(row.path_json, null),
    lensHistory: parseJson<SemanticLens[] | null>(row.lens_history_json, null),
    createdAt: normalizeFiniteNumber(row.created_at),
  };
}

function rowToRelation(row: SemanticRelationRow): SemanticRelation {
  return {
    relationId: row.relation_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    decision: row.decision as SemanticRelation['decision'],
    source: row.source as SemanticRelation['source'],
    confidence: normalizeFiniteNumber(row.confidence),
    reason: row.reason,
    decidedAt: normalizeFiniteNumber(row.decided_at),
  };
}

function rowToProjection(row: SemanticProjectionRow): SemanticMemoryProjection {
  return {
    version: normalizeFiniteNumber(row.version, 1),
    sessionId: row.session_id,
    nodeMemory: parseJson<SemanticMemoryProjection['nodeMemory']>(row.node_memory_json, []),
    edgeMemory: parseJson<SemanticMemoryProjection['edgeMemory']>(row.edge_memory_json, []),
    rebuiltAt: normalizeFiniteNumber(row.rebuilt_at),
  };
}

export class SqlSemanticActivationRepository implements SemanticActivationPersistencePort {
  constructor(private readonly database: SqliteDatabaseService) {}

  saveSession(session: SemanticSessionSnapshot): void {
    const sessionId = requireString(session.sessionId, 'sessionId');
    const now = Date.now();
    this.database.run(
      `INSERT OR REPLACE INTO semantic_sessions
        (session_id, root_focus_node_id, current_node_id, active_lens, narrative_path_json,
         started_at, ended_at, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        requireString(session.rootFocusNodeId, 'rootFocusNodeId'),
        requireString(session.currentNodeId, 'currentNodeId'),
        requireString(session.activeLens, 'activeLens'),
        stringifyJson(session.narrativePath),
        normalizeFiniteNumber(session.startedAt, now),
        typeof session.endedAt === 'number' ? session.endedAt : null,
        stringifyJson({}),
        now,
      ],
    );
  }

  getSession(sessionId: string): SemanticSessionSnapshot | null {
    const row = this.database.getOne<SemanticSessionRow>(
      `SELECT session_id, root_focus_node_id, current_node_id, active_lens, narrative_path_json,
              started_at, ended_at, payload_json, updated_at
       FROM semantic_sessions
       WHERE session_id = ?
       LIMIT 1`,
      [requireString(sessionId, 'sessionId')],
    );
    return row ? rowToSession(row) : null;
  }

  appendEvent(event: SemanticEvent): void {
    this.database.run(
      `INSERT INTO semantic_events
        (event_id, session_id, event_type, node_id, from_node_id, to_node_id, lens, occurred_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(event.eventId, 'eventId'),
        requireString(event.sessionId, 'sessionId'),
        requireString(event.type, 'type'),
        normalizeNullableString(event.nodeId),
        normalizeNullableString(event.fromNodeId),
        normalizeNullableString(event.toNodeId),
        normalizeNullableString(event.lens),
        normalizeFiniteNumber(event.occurredAt, Date.now()),
        stringifyJson(event.payload ?? null),
      ],
    );
  }

  listEvents(sessionId: string, limit = 500): SemanticEvent[] {
    const rows = this.database.getAll<SemanticEventRow>(
      `SELECT event_id, session_id, event_type, node_id, from_node_id, to_node_id, lens, occurred_at, payload_json
       FROM semantic_events
       WHERE session_id = ?
       ORDER BY occurred_at ASC, event_id ASC
       LIMIT ?`,
      [requireString(sessionId, 'sessionId'), Math.max(1, Math.min(5000, Math.floor(Number(limit) || 500)))],
    );
    return rows.map(rowToEvent);
  }

  saveStation(station: SemanticStation): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_stations
        (station_id, station_type, session_id, node_id, path_json, lens_history_json, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(station.stationId, 'stationId'),
        requireString(station.type, 'type'),
        requireString(station.sessionId, 'sessionId'),
        normalizeNullableString(station.nodeId),
        stringifyJson(station.path ?? null),
        stringifyJson(station.lensHistory ?? null),
        normalizeFiniteNumber(station.createdAt, Date.now()),
        stringifyJson({}),
      ],
    );
  }

  listStations(sessionId: string): SemanticStation[] {
    const rows = this.database.getAll<SemanticStationRow>(
      `SELECT station_id, station_type, session_id, node_id, path_json, lens_history_json, created_at, payload_json
       FROM semantic_stations
       WHERE session_id = ?
       ORDER BY created_at DESC, station_id ASC`,
      [requireString(sessionId, 'sessionId')],
    );
    return rows.map(rowToStation);
  }

  saveRelation(relation: SemanticRelation): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_relations
        (relation_id, from_node_id, to_node_id, decision, source, confidence, reason, decided_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(relation.relationId, 'relationId'),
        requireString(relation.fromNodeId, 'fromNodeId'),
        requireString(relation.toNodeId, 'toNodeId'),
        requireString(relation.decision, 'decision'),
        requireString(relation.source, 'source'),
        normalizeFiniteNumber(relation.confidence),
        normalizeNullableString(relation.reason),
        normalizeFiniteNumber(relation.decidedAt, Date.now()),
        stringifyJson({}),
      ],
    );
  }

  listRelations(): SemanticRelation[] {
    const rows = this.database.getAll<SemanticRelationRow>(
      `SELECT relation_id, from_node_id, to_node_id, decision, source, confidence, reason, decided_at, payload_json
       FROM semantic_relations
       ORDER BY decided_at DESC, relation_id ASC`,
    );
    return rows.map(rowToRelation);
  }

  saveProjection(projection: SemanticMemoryProjection): void {
    const sessionId = normalizeNullableString(projection.sessionId);
    this.database.run(
      `INSERT OR REPLACE INTO semantic_projection_cache
        (projection_key, version, session_id, node_memory_json, edge_memory_json, rebuilt_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        projectionKey(sessionId),
        normalizeFiniteNumber(projection.version, 1),
        sessionId,
        stringifyJson(projection.nodeMemory),
        stringifyJson(projection.edgeMemory),
        normalizeFiniteNumber(projection.rebuiltAt, Date.now()),
        stringifyJson({}),
      ],
    );
  }

  getProjection(sessionId?: string | null): SemanticMemoryProjection | null {
    const row = this.database.getOne<SemanticProjectionRow>(
      `SELECT projection_key, version, session_id, node_memory_json, edge_memory_json, rebuilt_at, payload_json
       FROM semantic_projection_cache
       WHERE projection_key = ?
       LIMIT 1`,
      [projectionKey(sessionId)],
    );
    return row ? rowToProjection(row) : null;
  }
}
