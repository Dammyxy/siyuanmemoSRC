import type {
  SemanticEvent,
  SemanticBranchEdge,
  SemanticBranchState,
  SemanticIrrelevantFeedback,
  SemanticLaterEntry,
  SemanticLens,
  SemanticMemoryProjection,
  SemanticPathEntry,
  SemanticRelation,
  SemanticSessionSnapshot,
  SemanticSuggestion,
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

type SemanticBranchEdgeRow = Record<string, string | number | null> & {
  edge_id: string;
  session_id: string;
  branch_id: string;
  from_node_id: string;
  to_node_id: string;
  lens: string;
  created_at: number;
  payload_json: string;
};

type SemanticBranchStateRow = Record<string, string | number | null> & {
  branch_id: string;
  session_id: string;
  root_node_id: string;
  active_cursor_node_id: string;
  archived_at: number | null;
  restored_at: number | null;
  updated_at: number;
  payload_json: string;
};

type SemanticLaterEntryRow = Record<string, string | number | null> & {
  entry_id: string;
  session_id: string;
  node_id: string;
  reason: string | null;
  created_at: number;
  removed_at: number | null;
  payload_json: string;
};

type SemanticIrrelevantFeedbackRow = Record<string, string | number | null> & {
  feedback_id: string;
  session_id: string;
  node_id: string;
  scope: string;
  root_focus_node_id: string | null;
  created_at: number;
  payload_json: string;
};

type SemanticSuggestionRow = Record<string, string | number | null> & {
  suggestion_id: string;
  session_id: string;
  source: string;
  summary: string;
  status: string;
  target_node_id: string | null;
  bound_node_id: string | null;
  materialized_block_id: string | null;
  materialized_card_id: string | null;
  created_at: number;
  updated_at: number;
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
  const payload = parseJson<{ rootFocusNodeType?: SemanticSessionSnapshot['rootFocusNodeType'] }>(row.payload_json, {});
  return {
    sessionId: row.session_id,
    rootFocusNodeId: row.root_focus_node_id,
    rootFocusNodeType: payload.rootFocusNodeType ?? null,
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
  const payload = parseJson<{ archivedAt?: number | null }>(row.payload_json, {});
  return {
    stationId: row.station_id,
    type: row.station_type as SemanticStation['type'],
    sessionId: row.session_id,
    nodeId: row.node_id,
    path: parseJson<SemanticPathEntry[] | null>(row.path_json, null),
    lensHistory: parseJson<SemanticLens[] | null>(row.lens_history_json, null),
    createdAt: normalizeFiniteNumber(row.created_at),
    archivedAt: typeof payload.archivedAt === 'number' ? payload.archivedAt : null,
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

function rowToBranchEdge(row: SemanticBranchEdgeRow): SemanticBranchEdge {
  const payload = parseJson<Pick<SemanticBranchEdge, 'explanation' | 'createdBy' | 'forkMetadata'>>(row.payload_json, {} as never);
  return {
    edgeId: row.edge_id,
    sessionId: row.session_id,
    branchId: row.branch_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    lens: row.lens as SemanticLens,
    explanation: payload.explanation ?? null,
    createdBy: payload.createdBy ?? { kind: 'unknown', id: null, label: null },
    createdAt: normalizeFiniteNumber(row.created_at),
    forkMetadata: payload.forkMetadata ?? null,
  };
}

function rowToBranchState(row: SemanticBranchStateRow): SemanticBranchState {
  return {
    branchId: row.branch_id,
    sessionId: row.session_id,
    rootNodeId: row.root_node_id,
    activeCursorNodeId: row.active_cursor_node_id,
    archivedAt: typeof row.archived_at === 'number' ? row.archived_at : null,
    restoredAt: typeof row.restored_at === 'number' ? row.restored_at : null,
    updatedAt: normalizeFiniteNumber(row.updated_at),
  };
}

function rowToLaterEntry(row: SemanticLaterEntryRow): SemanticLaterEntry {
  return {
    entryId: row.entry_id,
    sessionId: row.session_id,
    nodeId: row.node_id,
    reason: row.reason,
    createdAt: normalizeFiniteNumber(row.created_at),
    removedAt: typeof row.removed_at === 'number' ? row.removed_at : null,
  };
}

function rowToIrrelevantFeedback(row: SemanticIrrelevantFeedbackRow): SemanticIrrelevantFeedback {
  return {
    feedbackId: row.feedback_id,
    sessionId: row.session_id,
    nodeId: row.node_id,
    scope: row.scope === 'root' ? 'root' : 'session',
    rootFocusNodeId: row.root_focus_node_id,
    createdAt: normalizeFiniteNumber(row.created_at),
  };
}

function rowToSuggestion(row: SemanticSuggestionRow): SemanticSuggestion {
  const status = ['active', 'ignored', 'bound', 'materialized'].includes(row.status)
    ? row.status as SemanticSuggestion['status']
    : 'active';
  return {
    suggestionId: row.suggestion_id,
    sessionId: row.session_id,
    source: row.source === 'system' ? 'system' : 'ai',
    summary: row.summary,
    status,
    targetNodeId: row.target_node_id,
    boundNodeId: row.bound_node_id,
    materializedBlockId: row.materialized_block_id,
    materializedCardId: row.materialized_card_id,
    createdAt: normalizeFiniteNumber(row.created_at),
    updatedAt: normalizeFiniteNumber(row.updated_at),
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
        stringifyJson({ rootFocusNodeType: session.rootFocusNodeType ?? null }),
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

  findActiveSessionByRoot(rootFocusNodeId: string): SemanticSessionSnapshot | null {
    const row = this.database.getOne<SemanticSessionRow>(
      `SELECT session_id, root_focus_node_id, current_node_id, active_lens, narrative_path_json,
              started_at, ended_at, payload_json, updated_at
       FROM semantic_sessions
       WHERE root_focus_node_id = ?
         AND ended_at IS NULL
       ORDER BY updated_at DESC, started_at DESC, session_id DESC
       LIMIT 1`,
      [requireString(rootFocusNodeId, 'rootFocusNodeId')],
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
        stringifyJson({ archivedAt: typeof station.archivedAt === 'number' ? station.archivedAt : null }),
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

  listStationsByRoot(rootFocusNodeId: string): SemanticStation[] {
    const rows = this.database.getAll<SemanticStationRow>(
      `SELECT st.station_id, st.station_type, st.session_id, st.node_id, st.path_json,
              st.lens_history_json, st.created_at, st.payload_json
       FROM semantic_stations st
       INNER JOIN semantic_sessions se ON se.session_id = st.session_id
       WHERE se.root_focus_node_id = ?
       ORDER BY st.created_at DESC, st.station_id ASC`,
      [requireString(rootFocusNodeId, 'rootFocusNodeId')],
    );
    return rows.map(rowToStation);
  }

  getStation(stationId: string): SemanticStation | null {
    const row = this.database.getOne<SemanticStationRow>(
      `SELECT station_id, station_type, session_id, node_id, path_json, lens_history_json, created_at, payload_json
       FROM semantic_stations
       WHERE station_id = ?
       LIMIT 1`,
      [requireString(stationId, 'stationId')],
    );
    return row ? rowToStation(row) : null;
  }

  archiveStation(stationId: string, archivedAt: number): SemanticStation | null {
    const station = this.getStation(stationId);
    if (!station) {
      return null;
    }
    const archived = {
      ...station,
      archivedAt: normalizeFiniteNumber(archivedAt, Date.now()),
    };
    this.saveStation(archived);
    return archived;
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

  saveBranchEdge(edge: SemanticBranchEdge): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_branch_edges
        (edge_id, session_id, branch_id, from_node_id, to_node_id, lens, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(edge.edgeId, 'edgeId'),
        requireString(edge.sessionId, 'sessionId'),
        requireString(edge.branchId, 'branchId'),
        requireString(edge.fromNodeId, 'fromNodeId'),
        requireString(edge.toNodeId, 'toNodeId'),
        requireString(edge.lens, 'lens'),
        normalizeFiniteNumber(edge.createdAt, Date.now()),
        stringifyJson({
          explanation: edge.explanation ?? null,
          createdBy: edge.createdBy ?? { kind: 'unknown', id: null, label: null },
          forkMetadata: edge.forkMetadata ?? null,
        }),
      ],
    );
  }

  listBranchEdges(sessionId: string): SemanticBranchEdge[] {
    const rows = this.database.getAll<SemanticBranchEdgeRow>(
      `SELECT edge_id, session_id, branch_id, from_node_id, to_node_id, lens, created_at, payload_json
       FROM semantic_branch_edges
       WHERE session_id = ?
       ORDER BY created_at ASC, edge_id ASC`,
      [requireString(sessionId, 'sessionId')],
    );
    return rows.map(rowToBranchEdge);
  }

  saveBranchState(state: SemanticBranchState): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_branch_states
        (branch_id, session_id, root_node_id, active_cursor_node_id, archived_at, restored_at, updated_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(state.branchId, 'branchId'),
        requireString(state.sessionId, 'sessionId'),
        requireString(state.rootNodeId, 'rootNodeId'),
        requireString(state.activeCursorNodeId, 'activeCursorNodeId'),
        typeof state.archivedAt === 'number' ? state.archivedAt : null,
        typeof state.restoredAt === 'number' ? state.restoredAt : null,
        normalizeFiniteNumber(state.updatedAt, Date.now()),
        stringifyJson({}),
      ],
    );
  }

  listBranchStates(sessionId: string): SemanticBranchState[] {
    const rows = this.database.getAll<SemanticBranchStateRow>(
      `SELECT branch_id, session_id, root_node_id, active_cursor_node_id, archived_at, restored_at, updated_at, payload_json
       FROM semantic_branch_states
       WHERE session_id = ?
       ORDER BY updated_at DESC, branch_id ASC`,
      [requireString(sessionId, 'sessionId')],
    );
    return rows.map(rowToBranchState);
  }

  saveLaterEntry(entry: SemanticLaterEntry): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_later_entries
        (entry_id, session_id, node_id, reason, created_at, removed_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(entry.entryId, 'entryId'),
        requireString(entry.sessionId, 'sessionId'),
        requireString(entry.nodeId, 'nodeId'),
        normalizeNullableString(entry.reason),
        normalizeFiniteNumber(entry.createdAt, Date.now()),
        typeof entry.removedAt === 'number' ? entry.removedAt : null,
        stringifyJson({}),
      ],
    );
  }

  listLaterEntries(sessionId: string): SemanticLaterEntry[] {
    const rows = this.database.getAll<SemanticLaterEntryRow>(
      `SELECT entry_id, session_id, node_id, reason, created_at, removed_at, payload_json
       FROM semantic_later_entries
       WHERE session_id = ?
       ORDER BY created_at DESC, entry_id ASC`,
      [requireString(sessionId, 'sessionId')],
    );
    return rows.map(rowToLaterEntry);
  }

  saveIrrelevantFeedback(feedback: SemanticIrrelevantFeedback): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_irrelevant_feedback
        (feedback_id, session_id, node_id, scope, root_focus_node_id, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(feedback.feedbackId, 'feedbackId'),
        requireString(feedback.sessionId, 'sessionId'),
        requireString(feedback.nodeId, 'nodeId'),
        requireString(feedback.scope, 'scope'),
        normalizeNullableString(feedback.rootFocusNodeId),
        normalizeFiniteNumber(feedback.createdAt, Date.now()),
        stringifyJson({}),
      ],
    );
  }

  listIrrelevantFeedback(sessionId: string): SemanticIrrelevantFeedback[] {
    const rows = this.database.getAll<SemanticIrrelevantFeedbackRow>(
      `SELECT feedback_id, session_id, node_id, scope, root_focus_node_id, created_at, payload_json
       FROM semantic_irrelevant_feedback
       WHERE session_id = ?
       ORDER BY created_at DESC, feedback_id ASC`,
      [requireString(sessionId, 'sessionId')],
    );
    return rows.map(rowToIrrelevantFeedback);
  }

  saveSuggestion(suggestion: SemanticSuggestion): void {
    this.database.run(
      `INSERT OR REPLACE INTO semantic_suggestions
        (suggestion_id, session_id, source, summary, status, target_node_id, bound_node_id,
         materialized_block_id, materialized_card_id, created_at, updated_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(suggestion.suggestionId, 'suggestionId'),
        requireString(suggestion.sessionId, 'sessionId'),
        requireString(suggestion.source, 'source'),
        requireString(suggestion.summary, 'summary'),
        requireString(suggestion.status, 'status'),
        normalizeNullableString(suggestion.targetNodeId),
        normalizeNullableString(suggestion.boundNodeId),
        normalizeNullableString(suggestion.materializedBlockId),
        normalizeNullableString(suggestion.materializedCardId),
        normalizeFiniteNumber(suggestion.createdAt, Date.now()),
        normalizeFiniteNumber(suggestion.updatedAt, Date.now()),
        stringifyJson({}),
      ],
    );
  }

  listSuggestions(sessionId: string): SemanticSuggestion[] {
    const rows = this.database.getAll<SemanticSuggestionRow>(
      `SELECT suggestion_id, session_id, source, summary, status, target_node_id, bound_node_id,
              materialized_block_id, materialized_card_id, created_at, updated_at, payload_json
       FROM semantic_suggestions
       WHERE session_id = ?
       ORDER BY updated_at DESC, suggestion_id ASC`,
      [requireString(sessionId, 'sessionId')],
    );
    return rows.map(rowToSuggestion);
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
