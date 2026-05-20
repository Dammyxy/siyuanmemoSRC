import type { ParamsObject, SqlValue } from 'sql.js';
import type { FSRSCard } from '@/types/card';

type SqlParams = SqlValue[] | ParamsObject;

type DomainSyncLedgerRuntime = {
  getAll<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T[];
  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null;
  run(sql: string, params?: SqlParams): void;
};

export type ReviewCommittedOperationInput = {
  reviewEventId: string;
  card: FSRSCard;
  rating: number;
  reviewedAt: number;
  queueType: string;
  queueMode: string;
  commitPolicy: string;
  idempotencyKey: string | null;
};

export type CardDeletedOperationInput = {
  cardId: string;
  blockId?: string | null;
  deletedAt: number;
  deletedBy?: string | null;
  idempotencyKey?: string | null;
  payload?: unknown;
};

export type SourceExistenceUpdatedOperationInput = {
  cardId: string;
  blockId: string;
  previousExists: boolean | null;
  exists: boolean;
  checkedAt: number;
  missingAt?: number | null;
  idempotencyKey?: string | null;
};

export class DomainSyncLedger {
  constructor(private readonly runtime: DomainSyncLedgerRuntime) {}

  hasMissingBackfillOperations(): boolean {
    const review = this.runtime.getOne<{ present: number }>(
      `SELECT 1 AS present
       FROM review_events e
       WHERE e.event_type = ?
         AND NOT EXISTS (
           SELECT 1
           FROM domain_sync_operations d
           WHERE d.operation_type = 'review-committed'
             AND d.review_event_id = e.id
         )
       LIMIT 1`,
      ['review-v2'],
    );
    if (review) {
      return true;
    }
    const tombstone = this.runtime.getOne<{ present: number }>(
      `SELECT 1 AS present
       FROM tombstones t
       WHERE t.kind = ?
         AND NOT EXISTS (
           SELECT 1
           FROM domain_sync_operations d
           WHERE d.operation_type = 'card-deleted'
             AND d.idempotency_key = ('migration-card-delete:' || t.id || ':' || t.deleted_at)
         )
       LIMIT 1`,
      ['card'],
    );
    return Boolean(tombstone);
  }

  backfillExistingReviewEventsAndCardTombstones(observedAt = Date.now()): { reviewEvents: number; cardTombstones: number } {
    const reviewRows = this.runtime.getAll<{
      id: string;
      card_id: string | null;
      attempt_id: string | null;
      rating: number | null;
      reviewed_at: number;
      commit_idempotency_key: string | null;
      event_type: string;
      payload_json: string;
      block_id: string | null;
    }>(
      `SELECT e.id, e.card_id, e.attempt_id, e.rating, e.reviewed_at,
              e.commit_idempotency_key, e.event_type, e.payload_json,
              c.block_id
       FROM review_events e
       LEFT JOIN cards c ON c.id = e.card_id
       WHERE e.event_type = ?
       ORDER BY e.reviewed_at, e.id`,
      ['review-v2'],
    );
    let reviewEvents = 0;
    for (const row of reviewRows) {
      const cardId = normalizeOptionalString(row.card_id);
      const reviewEventId = normalizeOptionalString(row.id);
      if (!cardId || !reviewEventId) {
        continue;
      }
      const reviewedAt = normalizeTimestamp(row.reviewed_at);
      const idempotencyKey = normalizeOptionalString(row.commit_idempotency_key);
      const payload = {
        reviewEventId,
        cardId,
        blockId: normalizeOptionalString(row.block_id),
        attemptId: normalizeOptionalString(row.attempt_id),
        rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
        reviewedAt,
        eventType: row.event_type,
        idempotencyKey,
        migrationSource: 'existing-review-events',
      };
      const payloadJson = stableJsonStringify(payload);
      this.runtime.run(
        `INSERT OR IGNORE INTO domain_sync_operations
          (operation_id, source_id, source_device_id, source_generation, operation_type,
           entity_type, entity_id, entity_block_id, occurred_at, observed_at,
           payload_fingerprint, idempotency_key, review_event_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          buildOperationId({
            operationType: 'review-committed',
            idempotencyKey,
            entityId: cardId,
            reviewEventId,
          }),
          'migration:domain-sync-ledger:review-events',
          null,
          null,
          'review-committed',
          'card',
          cardId,
          normalizeOptionalString(row.block_id),
          reviewedAt,
          normalizeTimestamp(observedAt),
          fnv1a32(payloadJson),
          idempotencyKey,
          reviewEventId,
          payloadJson,
        ],
      );
      reviewEvents += 1;
    }

    const tombstoneRows = this.runtime.getAll<{
      id: string;
      deleted_at: number;
      deleted_by: string | null;
      payload_json: string;
      block_id: string | null;
    }>(
      `SELECT t.id, t.deleted_at, t.deleted_by, t.payload_json, c.block_id
       FROM tombstones t
       LEFT JOIN cards c ON c.id = t.id
       WHERE t.kind = ?
       ORDER BY t.deleted_at, t.id`,
      ['card'],
    );
    let cardTombstones = 0;
    for (const row of tombstoneRows) {
      const cardId = normalizeOptionalString(row.id);
      if (!cardId) {
        continue;
      }
      const deletedAt = normalizeTimestamp(row.deleted_at);
      const idempotencyKey = `migration-card-delete:${cardId}:${deletedAt}`;
      const payload = {
        cardId,
        blockId: normalizeOptionalString(row.block_id),
        deletedAt,
        deletedBy: normalizeOptionalString(row.deleted_by),
        idempotencyKey,
        migrationSource: 'existing-card-tombstones',
      };
      const payloadJson = stableJsonStringify(payload);
      this.runtime.run(
        `INSERT OR IGNORE INTO domain_sync_operations
          (operation_id, source_id, source_device_id, source_generation, operation_type,
           entity_type, entity_id, entity_block_id, occurred_at, observed_at,
           payload_fingerprint, idempotency_key, review_event_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          buildOperationId({
            operationType: 'card-deleted',
            idempotencyKey,
            entityId: cardId,
            reviewEventId: idempotencyKey,
          }),
          'migration:domain-sync-ledger:card-tombstones',
          null,
          null,
          'card-deleted',
          'card',
          cardId,
          normalizeOptionalString(row.block_id),
          deletedAt,
          normalizeTimestamp(observedAt),
          fnv1a32(payloadJson),
          idempotencyKey,
          null,
          payloadJson,
        ],
      );
      cardTombstones += 1;
    }

    return { reviewEvents, cardTombstones };
  }

  appendReviewCommitted(input: ReviewCommittedOperationInput): void {
    const operationId = buildOperationId({
      operationType: 'review-committed',
      idempotencyKey: input.idempotencyKey,
      entityId: input.card.id,
      reviewEventId: input.reviewEventId,
    });
    const payload = {
      reviewEventId: input.reviewEventId,
      cardId: input.card.id,
      blockId: input.card.blockId ?? null,
      rating: input.rating,
      reviewedAt: input.reviewedAt,
      queueType: input.queueType,
      queueMode: input.queueMode,
      commitPolicy: input.commitPolicy,
      idempotencyKey: input.idempotencyKey,
    };
    const payloadJson = stableJsonStringify(payload);
    this.runtime.run(
      `INSERT OR IGNORE INTO domain_sync_operations
        (operation_id, source_id, source_device_id, source_generation, operation_type,
         entity_type, entity_id, entity_block_id, occurred_at, observed_at,
         payload_fingerprint, idempotency_key, review_event_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operationId,
        'local-backend-worker',
        null,
        null,
        'review-committed',
        'card',
        input.card.id,
        normalizeOptionalString(input.card.blockId),
        input.reviewedAt,
        input.reviewedAt,
        fnv1a32(payloadJson),
        input.idempotencyKey,
        input.reviewEventId,
        payloadJson,
      ],
    );
  }

  appendCardDeleted(input: CardDeletedOperationInput): void {
    const cardId = normalizeOptionalString(input.cardId);
    if (!cardId) {
      return;
    }
    const deletedAt = normalizeTimestamp(input.deletedAt);
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey)
      ?? `card-delete:${cardId}:${deletedAt}`;
    const payload = {
      cardId,
      blockId: normalizeOptionalString(input.blockId),
      deletedAt,
      deletedBy: normalizeOptionalString(input.deletedBy),
      idempotencyKey,
      tombstone: input.payload ?? null,
    };
    const payloadJson = stableJsonStringify(payload);
    this.runtime.run(
      `INSERT OR IGNORE INTO domain_sync_operations
        (operation_id, source_id, source_device_id, source_generation, operation_type,
         entity_type, entity_id, entity_block_id, occurred_at, observed_at,
         payload_fingerprint, idempotency_key, review_event_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        buildOperationId({
          operationType: 'card-deleted',
          idempotencyKey,
          entityId: cardId,
          reviewEventId: idempotencyKey,
        }),
        'local-backend-worker',
        null,
        null,
        'card-deleted',
        'card',
        cardId,
        normalizeOptionalString(input.blockId),
        deletedAt,
        deletedAt,
        fnv1a32(payloadJson),
        idempotencyKey,
        null,
        payloadJson,
      ],
    );
  }

  appendSourceExistenceUpdated(input: SourceExistenceUpdatedOperationInput): void {
    const cardId = normalizeOptionalString(input.cardId);
    const blockId = normalizeOptionalString(input.blockId);
    if (!cardId || !blockId) {
      return;
    }
    const checkedAt = normalizeTimestamp(input.checkedAt);
    const missingAt = input.exists ? null : normalizeTimestamp(input.missingAt ?? checkedAt);
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey)
      ?? `source-existence:${cardId}:${blockId}:${checkedAt}:${input.exists ? 'present' : 'missing'}`;
    const payload = {
      cardId,
      blockId,
      previousExists: input.previousExists,
      exists: input.exists,
      checkedAt,
      missingAt,
      idempotencyKey,
    };
    const payloadJson = stableJsonStringify(payload);
    this.runtime.run(
      `INSERT OR IGNORE INTO domain_sync_operations
        (operation_id, source_id, source_device_id, source_generation, operation_type,
         entity_type, entity_id, entity_block_id, occurred_at, observed_at,
         payload_fingerprint, idempotency_key, review_event_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        buildOperationId({
          operationType: 'source-existence-updated',
          idempotencyKey,
          entityId: cardId,
          reviewEventId: idempotencyKey,
        }),
        'local-backend-worker',
        null,
        null,
        'source-existence-updated',
        'card',
        cardId,
        blockId,
        checkedAt,
        checkedAt,
        fnv1a32(payloadJson),
        idempotencyKey,
        null,
        payloadJson,
      ],
    );
  }
}

function buildOperationId(input: {
  operationType: string;
  idempotencyKey: string | null;
  entityId: string;
  reviewEventId: string;
}): string {
  const identity = input.idempotencyKey || input.reviewEventId;
  return `domain-sync:${input.operationType}:${fnv1a32(`${input.entityId}:${identity}`)}`;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonValue(entry)]),
    );
  }
  return value;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeTimestamp(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : Date.now();
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
