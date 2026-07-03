import type {
  QueueProjectionCounterBuckets,
  QueueProjectionCounters,
  QueueProjectionDelta,
  QueueProjectionDiagnostics,
  QueueProjectionGeneration,
  QueueProjectionGenerationStatus,
  QueueProjectionInvalidationInput,
  QueueProjectionInvalidationRecord,
  QueueProjectionRebuildCommand,
  QueueProjectionRebuildRecord,
  QueueProjectionRebuildStatus,
  QueueProjectionReplaceInput,
  QueueProjectionRepositoryPort,
  QueueProjectionRow,
  QueueProjectionRowsQuery,
} from '@/application/ports/QueueProjectionPort';
import type { QueueType } from '@/types/unified-data-source';
import { createStableId, parseJson, stringifyJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

type QueueProjectionRowRecord = Record<string, string | number | null> & {
  queue_type: string;
  row_id: string;
  card_id: string;
  block_id: string | null;
  deck_id: string | null;
  membership_reason: string;
  due_at: number | null;
  due_bucket: string;
  priority_score: number;
  sort_key: string;
  queue_index_hint: number | null;
  policy_hash: string;
  source_generation: number;
  payload_json: string;
  updated_at: number;
};

type QueueProjectionCountersRecord = Record<string, string | number> & {
  queue_type: string;
  policy_hash: string;
  generation: number;
  version: number;
  remaining: number;
  due: number;
  total: number;
  buckets_json: string;
  updated_at: number;
};

type QueueProjectionGenerationRecord = Record<string, string | number | null> & {
  queue_type: string;
  policy_hash: string;
  generation: number;
  status: string;
  rebuild_reason: string | null;
  updated_at: number;
  metadata_json: string;
};

type QueueProjectionInvalidationRow = Record<string, string | number> & {
  id: string;
  queue_type: string;
  reason: string;
  affected_card_ids_json: string;
  affected_block_ids_json: string;
  generation: number;
  created_at: number;
  metadata_json: string;
};

type QueueProjectionRebuildRow = Record<string, string | number | null> & {
  id: string;
  queue_type: string;
  reason: string;
  policy_hash: string;
  generation: number;
  status: string;
  started_at: number;
  completed_at: number | null;
  metadata_json: string;
};

const DEFAULT_BUCKETS: QueueProjectionCounterBuckets = {
  all: 0,
  item: 0,
  descriptor: 0,
  topic: 0,
  concept: 0,
};

function normalizeLimit(value: unknown, fallback: number): number {
  return Math.max(1, Math.min(5000, Math.floor(Number(value) || fallback)));
}

function normalizeOffset(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function arrayFromJson(value: string): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

function rowToProjection(row: QueueProjectionRowRecord): QueueProjectionRow {
  return {
    queueType: row.queue_type as QueueType,
    rowId: row.row_id,
    cardId: row.card_id,
    blockId: row.block_id,
    deckId: row.deck_id,
    membershipReason: row.membership_reason,
    dueAt: row.due_at,
    dueBucket: row.due_bucket as QueueProjectionRow['dueBucket'],
    priorityScore: Number(row.priority_score) || 0,
    sortKey: row.sort_key,
    queueIndexHint: row.queue_index_hint,
    policyHash: row.policy_hash,
    sourceGeneration: Number(row.source_generation) || 0,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    updatedAt: Number(row.updated_at) || 0,
  };
}

function rowToCounters(row: QueueProjectionCountersRecord): QueueProjectionCounters {
  return {
    queueType: row.queue_type as QueueType,
    policyHash: row.policy_hash,
    generation: Number(row.generation) || 0,
    version: Number(row.version) || 0,
    remaining: Number(row.remaining) || 0,
    due: Number(row.due) || 0,
    total: Number(row.total) || 0,
    buckets: {
      ...DEFAULT_BUCKETS,
      ...parseJson<Partial<QueueProjectionCounterBuckets>>(row.buckets_json, {}),
    },
    updatedAt: Number(row.updated_at) || 0,
  };
}

function rowToGeneration(row: QueueProjectionGenerationRecord): QueueProjectionGeneration {
  return {
    queueType: row.queue_type as QueueType,
    policyHash: row.policy_hash,
    generation: Number(row.generation) || 0,
    status: row.status as QueueProjectionGenerationStatus,
    rebuildReason: row.rebuild_reason,
    updatedAt: Number(row.updated_at) || 0,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  };
}

function readLastReadyGenerationMetadata(generation: QueueProjectionGeneration | null): QueueProjectionGeneration | null {
  if (!generation) {
    return null;
  }
  if (generation.status === 'ready') {
    return generation;
  }
  const candidate = generation.metadata?.lastReadyGeneration;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const policyHash = String(record.policyHash || '').trim();
  const sourceGeneration = Math.floor(Number(record.generation));
  if (!policyHash || !Number.isFinite(sourceGeneration) || sourceGeneration <= 0) {
    return null;
  }
  return {
    queueType: generation.queueType,
    policyHash,
    generation: sourceGeneration,
    status: 'ready',
    rebuildReason: null,
    updatedAt: Math.max(0, Math.floor(Number(record.updatedAt || generation.updatedAt))),
    metadata: typeof record.metadata === 'object' && record.metadata !== null
      ? { ...(record.metadata as Record<string, unknown>) }
      : {},
  };
}

function withLastReadyGenerationMetadata(
  metadata: Record<string, unknown>,
  current: QueueProjectionGeneration | null,
): Record<string, unknown> {
  const lastReady = readLastReadyGenerationMetadata(current);
  if (!lastReady) {
    return { ...metadata };
  }
  return {
    ...metadata,
    lastReadyGeneration: {
      policyHash: lastReady.policyHash,
      generation: lastReady.generation,
      updatedAt: lastReady.updatedAt,
      metadata: lastReady.metadata,
    },
  };
}

function rowToInvalidation(row: QueueProjectionInvalidationRow): QueueProjectionInvalidationRecord {
  return {
    id: row.id,
    queueType: row.queue_type as QueueType,
    reason: row.reason,
    affectedCardIds: arrayFromJson(row.affected_card_ids_json),
    affectedBlockIds: arrayFromJson(row.affected_block_ids_json),
    generation: Number(row.generation) || 0,
    createdAt: Number(row.created_at) || 0,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  };
}

function rowToRebuild(row: QueueProjectionRebuildRow): QueueProjectionRebuildRecord {
  return {
    id: row.id,
    queueType: row.queue_type as QueueType,
    reason: row.reason,
    policyHash: row.policy_hash,
    generation: Number(row.generation) || 0,
    status: row.status as QueueProjectionRebuildStatus,
    startedAt: Number(row.started_at) || 0,
    completedAt: typeof row.completed_at === 'number' ? row.completed_at : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
  };
}

export class SqlQueueProjectionRepository implements QueueProjectionRepositoryPort {
  constructor(private readonly database: SqliteDatabaseService) {}

  readRows(query: QueueProjectionRowsQuery): QueueProjectionRow[] {
    const clauses = ['queue_type = ?'];
    const params: Array<string | number> = [query.queueType];
    if (query.policyHash) {
      clauses.push('policy_hash = ?');
      params.push(query.policyHash);
    }
    if (typeof query.generation === 'number') {
      clauses.push('source_generation = ?');
      params.push(query.generation);
    }
    const hasExplicitWindow = typeof query.limit === 'number' || typeof query.offset === 'number';
    const windowClause = hasExplicitWindow ? ' LIMIT ? OFFSET ?' : '';
    if (hasExplicitWindow) {
      params.push(normalizeLimit(query.limit, 500), normalizeOffset(query.offset));
    }
    const rows = this.database.getAll<QueueProjectionRowRecord>(
      `SELECT queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
              priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at
       FROM queue_projection_rows
       WHERE ${clauses.join(' AND ')}
       ORDER BY sort_key ASC, COALESCE(queue_index_hint, 2147483647) ASC, row_id ASC${windowClause}`,
      params,
    );
    return rows.map(rowToProjection);
  }

  readRowsByIds(queueType: QueueType, rowIds: string[], policyHash?: string | null): QueueProjectionRow[] {
    const rows = rowIds.map((rowId) => {
      const clauses = ['queue_type = ?', 'row_id = ?'];
      const params: Array<string | number> = [queueType, rowId];
      if (policyHash) {
        clauses.push('policy_hash = ?');
        params.push(policyHash);
      }
      const row = this.database.getOne<QueueProjectionRowRecord>(
        `SELECT queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
                priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at
         FROM queue_projection_rows
         WHERE ${clauses.join(' AND ')}
         LIMIT 1`,
        params,
      );
      return row ? rowToProjection(row) : null;
    });
    return rows.filter((row): row is QueueProjectionRow => Boolean(row));
  }

  readCounters(queueType: QueueType, policyHash?: string | null): QueueProjectionCounters | null {
    const row = policyHash
      ? this.database.getOne<QueueProjectionCountersRecord>(
        `SELECT queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at
         FROM queue_projection_counters
         WHERE queue_type = ? AND policy_hash = ?
         LIMIT 1`,
        [queueType, policyHash],
      )
      : this.database.getOne<QueueProjectionCountersRecord>(
        `SELECT queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at
         FROM queue_projection_counters
         WHERE queue_type = ?
         ORDER BY generation DESC, version DESC
         LIMIT 1`,
        [queueType],
      );
    return row ? rowToCounters(row) : null;
  }

  readGeneration(queueType: QueueType): QueueProjectionGeneration | null {
    const row = this.database.getOne<QueueProjectionGenerationRecord>(
      `SELECT queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json
       FROM queue_projection_generations
       WHERE queue_type = ?
       LIMIT 1`,
      [queueType],
    );
    return row ? rowToGeneration(row) : null;
  }

  listReadyGenerations(queueType: QueueType): QueueProjectionGeneration[] {
    const rows = this.database.getAll<QueueProjectionGenerationRecord>(
      `SELECT c.queue_type,
              c.policy_hash,
              c.generation,
              COALESCE(g.status, 'ready') AS status,
              g.rebuild_reason,
              c.updated_at,
              COALESCE(g.metadata_json, '{}') AS metadata_json
       FROM queue_projection_counters c
       LEFT JOIN queue_projection_generations g
         ON g.queue_type = c.queue_type
       WHERE c.queue_type = ?
         AND COALESCE(g.status, 'ready') = ?
       ORDER BY c.updated_at DESC, c.generation DESC, c.policy_hash ASC`,
      [queueType, 'ready'],
    );
    return rows.map(rowToGeneration);
  }

  readLastReadyGeneration(queueType: QueueType): QueueProjectionGeneration | null {
    return readLastReadyGenerationMetadata(this.readGeneration(queueType));
  }

  listInvalidations(queueType: QueueType, limit = 50): QueueProjectionInvalidationRecord[] {
    const rows = this.database.getAll<QueueProjectionInvalidationRow>(
      `SELECT id, queue_type, reason, affected_card_ids_json, affected_block_ids_json, generation, created_at, metadata_json
       FROM queue_projection_invalidations
       WHERE queue_type = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [queueType, normalizeLimit(limit, 50)],
    );
    return rows.map(rowToInvalidation);
  }

  replaceQueueProjection(input: QueueProjectionReplaceInput): void {
    this.assertUniqueProjectionRows(input.queueType, input.policyHash, input.rows);
    this.database.run('DELETE FROM queue_projection_rows WHERE queue_type = ? AND policy_hash = ?', [
      input.queueType,
      input.policyHash,
    ]);
    for (const row of input.rows) {
      this.upsertRow({
        ...row,
        queueType: input.queueType,
        policyHash: input.policyHash,
        sourceGeneration: input.generation,
      });
    }
    this.assertProjectionRowsWritten(input);
    this.upsertCounters(input.counters);
    this.upsertGeneration({
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: input.generation,
      status: 'ready',
      rebuildReason: null,
      updatedAt: input.counters.updatedAt,
      metadata: input.metadata || {},
    });
  }

  applyQueueProjectionDelta(delta: QueueProjectionDelta): void {
    this.assertUniqueProjectionRows(delta.queueType, delta.policyHash, delta.upsertRows || []);
    for (const rowId of delta.removeRowIds || []) {
      this.database.run(
        'DELETE FROM queue_projection_rows WHERE queue_type = ? AND row_id = ? AND policy_hash = ?',
        [delta.queueType, rowId, delta.policyHash],
      );
    }
    for (const row of delta.upsertRows || []) {
      this.upsertRow({
        ...row,
        queueType: delta.queueType,
        policyHash: delta.policyHash,
        sourceGeneration: delta.generation,
      });
    }
    if (delta.counters) {
      this.upsertCounters(delta.counters);
      this.upsertGeneration({
        queueType: delta.queueType,
        policyHash: delta.policyHash,
        generation: delta.generation,
        status: 'ready',
        rebuildReason: null,
        updatedAt: delta.counters.updatedAt,
        metadata: {},
      });
    }
    if (delta.invalidation) {
      this.insertInvalidation({
        ...delta.invalidation,
        queueType: delta.queueType,
        generation: delta.generation,
        id: delta.invalidation.id || this.createInvalidationId(delta.queueType, delta.invalidation.reason, delta.generation),
        createdAt: delta.invalidation.createdAt || Date.now(),
      });
    }
  }

  invalidateQueues(input: QueueProjectionInvalidationInput): QueueProjectionInvalidationRecord[] {
    const createdAt = input.createdAt ?? Date.now();
    return input.queueTypes.map((queueType) => {
      const current = this.readGeneration(queueType);
      const record: QueueProjectionInvalidationRecord = {
        id: this.createInvalidationId(queueType, input.reason, input.generation),
        queueType,
        reason: input.reason,
        affectedCardIds: [...(input.affectedCardIds || [])],
        affectedBlockIds: [...(input.affectedBlockIds || [])],
        generation: input.generation,
        createdAt,
        metadata: input.metadata || {},
      };
      this.insertInvalidation(record);
      this.upsertGeneration({
        queueType,
        policyHash: current?.policyHash || 'unknown',
        generation: input.generation,
        status: 'invalidated',
        rebuildReason: input.reason,
        updatedAt: createdAt,
        metadata: withLastReadyGenerationMetadata(input.metadata || {}, current),
      });
      return record;
    });
  }

  beginRebuild(command: QueueProjectionRebuildCommand): QueueProjectionRebuildRecord {
    const startedAt = command.startedAt ?? Date.now();
    const record: QueueProjectionRebuildRecord = {
      id: createStableId('queue-projection-rebuild', [
        command.queueType,
        command.reason,
        command.policyHash,
        command.generation,
        startedAt,
      ]),
      queueType: command.queueType,
      reason: command.reason,
      policyHash: command.policyHash,
      generation: command.generation,
      status: 'running',
      startedAt,
      completedAt: null,
      metadata: command.metadata || {},
    };
    this.database.run(
      `INSERT OR REPLACE INTO queue_projection_rebuilds
        (id, queue_type, reason, policy_hash, generation, status, started_at, completed_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.queueType,
        record.reason,
        record.policyHash,
        record.generation,
        record.status,
        record.startedAt,
        record.completedAt,
        stringifyJson(record.metadata),
      ],
    );
    this.upsertGeneration({
      queueType: command.queueType,
      policyHash: command.policyHash,
      generation: command.generation,
      status: command.reason === 'repair' ? 'repairing' : 'rebuilding',
      rebuildReason: command.reason,
      updatedAt: startedAt,
      metadata: withLastReadyGenerationMetadata(command.metadata || {}, this.readGeneration(command.queueType)),
    });
    return record;
  }

  completeRebuild(
    id: string,
    status: Extract<QueueProjectionRebuildStatus, 'completed' | 'failed'>,
    metadata: Record<string, unknown> = {},
  ): QueueProjectionRebuildRecord | null {
    const current = this.readRebuild(id);
    if (!current) {
      return null;
    }
    const completedAt = Date.now();
    const mergedMetadata = {
      ...current.metadata,
      ...metadata,
    };
    this.database.run(
      `UPDATE queue_projection_rebuilds
       SET status = ?, completed_at = ?, metadata_json = ?
       WHERE id = ?`,
      [status, completedAt, stringifyJson(mergedMetadata), id],
    );
    this.upsertGeneration({
      queueType: current.queueType,
      policyHash: current.policyHash,
      generation: current.generation,
      status: status === 'completed' ? 'ready' : 'unavailable',
      rebuildReason: current.reason,
      updatedAt: completedAt,
      metadata: mergedMetadata,
    });
    return this.readRebuild(id);
  }

  compareCounts(input: {
    queueType: QueueType;
    sourceTruthCount: number;
    policyHash?: string | null;
    checkedAt?: number;
  }): QueueProjectionDiagnostics {
    const counters = this.readCounters(input.queueType, input.policyHash);
    const generation = this.readGeneration(input.queueType);
    const policyHash = input.policyHash || counters?.policyHash || generation?.policyHash || null;
    const rowCount = this.database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM queue_projection_rows
       WHERE queue_type = ? AND (? IS NULL OR policy_hash = ?)`,
      [input.queueType, policyHash, policyHash],
    )?.count || 0;
    const projectionCounterTotal = counters?.total ?? null;
    return {
      queueType: input.queueType,
      policyHash,
      generation: counters?.generation ?? generation?.generation ?? null,
      projectionRowCount: Number(rowCount) || 0,
      projectionCounterTotal,
      sourceTruthCount: input.sourceTruthCount,
      mismatch: Number(rowCount) !== input.sourceTruthCount
        || (projectionCounterTotal !== null && projectionCounterTotal !== input.sourceTruthCount),
      checkedAt: input.checkedAt ?? Date.now(),
    };
  }

  private upsertRow(row: QueueProjectionRow): void {
    this.database.run(
      `INSERT OR REPLACE INTO queue_projection_rows
        (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
         priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.queueType,
        row.rowId,
        row.cardId,
        row.blockId,
        row.deckId,
        row.membershipReason,
        row.dueAt,
        row.dueBucket,
        row.priorityScore,
        row.sortKey,
        row.queueIndexHint,
        row.policyHash,
        row.sourceGeneration,
        stringifyJson(row.payload),
        row.updatedAt,
      ],
    );
  }

  private assertUniqueProjectionRows(queueType: QueueType, policyHash: string, rows: QueueProjectionRow[]): void {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const rowId = String(row.rowId || '').trim();
      if (!rowId) {
        throw new Error(`QUEUE_PROJECTION_INVALID_ROW: ${queueType} projection row missing rowId for policy ${policyHash}`);
      }
      const existingCardId = seen.get(rowId);
      if (existingCardId) {
        throw new Error(
          `QUEUE_PROJECTION_IDENTITY_COLLISION: ${queueType} policy ${policyHash} rowId ${rowId} `
          + `is shared by cards ${existingCardId} and ${String(row.cardId || '').trim()}`,
        );
      }
      seen.set(rowId, String(row.cardId || '').trim());
    }
  }

  private assertProjectionRowsWritten(input: QueueProjectionReplaceInput): void {
    const row = this.database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM queue_projection_rows
       WHERE queue_type = ? AND policy_hash = ? AND source_generation = ?`,
      [input.queueType, input.policyHash, input.generation],
    );
    const written = Number(row?.count) || 0;
    if (written !== input.rows.length) {
      throw new Error(
        `QUEUE_PROJECTION_WRITE_INCOMPLETE: ${input.queueType} policy ${input.policyHash} `
        + `generation ${input.generation} wrote ${written} rows for ${input.rows.length} inputs`,
      );
    }
  }

  private upsertCounters(counters: QueueProjectionCounters): void {
    this.database.run(
      `INSERT OR REPLACE INTO queue_projection_counters
        (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        counters.queueType,
        counters.policyHash,
        counters.generation,
        counters.version,
        counters.remaining,
        counters.due,
        counters.total,
        stringifyJson(counters.buckets),
        counters.updatedAt,
      ],
    );
  }

  private upsertGeneration(generation: QueueProjectionGeneration): void {
    this.database.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generation.queueType,
        generation.policyHash,
        generation.generation,
        generation.status,
        generation.rebuildReason,
        generation.updatedAt,
        stringifyJson(generation.metadata),
      ],
    );
  }

  private insertInvalidation(record: QueueProjectionInvalidationRecord): void {
    this.database.run(
      `INSERT OR REPLACE INTO queue_projection_invalidations
        (id, queue_type, reason, affected_card_ids_json, affected_block_ids_json, generation, created_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.queueType,
        record.reason,
        stringifyJson(record.affectedCardIds),
        stringifyJson(record.affectedBlockIds),
        record.generation,
        record.createdAt,
        stringifyJson(record.metadata),
      ],
    );
  }

  private readRebuild(id: string): QueueProjectionRebuildRecord | null {
    const row = this.database.getOne<QueueProjectionRebuildRow>(
      `SELECT id, queue_type, reason, policy_hash, generation, status, started_at, completed_at, metadata_json
       FROM queue_projection_rebuilds
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return row ? rowToRebuild(row) : null;
  }

  private createInvalidationId(queueType: QueueType, reason: string, generation: number): string {
    return createStableId('queue-projection-invalidation', [queueType, reason, generation, Date.now()]);
  }
}
