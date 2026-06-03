import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemoryReviewFeedbackJournalStore } from '../db/ReviewFeedbackJournalStore';
import {
  createInMemorySqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../truth/MessagePackTruthSegmentStore';
import { SqlNeuralRoamRouteRepository } from '@/infrastructure/persistence/sqlite/SqlNeuralRoamRouteRepository';
import { createDefaultRoute } from '@/core/queue/neural/routes';
import { buildQueueProjectionSourceCardFingerprint } from '@/application/services/queue-projection/QueueProjectionBuilder';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
} from '../../packages/contracts/src/backend-rpc';
import {
  beginBackendWorkerTiming,
  endBackendWorkerRequest,
} from '../bootstrap/ReviewFeedbackTimingScope';

class MemoryTruthSegmentFileStore implements MessagePackTruthSegmentFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }
}

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

function authorizedPrivateCapability() {
  return {
    available: true,
    reason: null,
    kernelSidecarAvailable: true,
    backendWorkerAvailable: true,
    writerAvailable: true,
    methodAllowed: true,
  };
}

async function seedQueueProjection(database: WorkerSqliteDatabaseService, input: {
  queueType?: string;
  policyHash?: string;
  generation?: number;
  rows: FSRSCard[];
  updatedAt?: number;
}): Promise<void> {
  const queueType = input.queueType ?? 'retrieval-practice';
  const policyHash = input.policyHash ?? 'policy-a';
  const generation = input.generation ?? 1;
  const updatedAt = input.updatedAt ?? 1_700_000_100_000;
  await database.runTransaction('seed.queue-projection', (db) => {
    db.run(
      `INSERT OR REPLACE INTO queue_projection_generations
        (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [queueType, policyHash, generation, 'ready', null, updatedAt, '{}'],
    );
    db.run(
      `INSERT OR REPLACE INTO queue_projection_counters
        (queue_type, policy_hash, generation, version, remaining, due, total, buckets_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        queueType,
        policyHash,
        generation,
        generation,
        input.rows.length,
        input.rows.length,
        input.rows.length,
        JSON.stringify({
          all: input.rows.length,
          item: input.rows.filter((card) => card.type === CardType.Item).length,
          descriptor: input.rows.filter((card) => card.type === CardType.Descriptor).length,
          topic: input.rows.filter((card) => card.type === CardType.Topic).length,
          concept: input.rows.filter((card) => card.type === CardType.Concept).length,
        }),
        updatedAt,
      ],
    );
    for (const [index, card] of input.rows.entries()) {
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, deck_id, membership_reason, due_at, due_bucket,
           priority_score, sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          queueType,
          card.id,
          card.id,
          card.blockId,
          null,
          'review-due',
          card.due,
          card.due <= updatedAt ? 'overdue' : 'due',
          card.priority ?? 50,
          `${String(index + 1).padStart(9, '0')}:${card.id}`,
          index + 1,
          policyHash,
          generation,
          JSON.stringify({
            cardType: card.type,
            rowId: card.id,
            state: card.state,
            due: card.due,
            priority: card.priority,
            sourceCardFingerprint: buildQueueProjectionSourceCardFingerprint(card),
          }),
          updatedAt,
        ],
      );
    }
  });
}

async function flushReviewFeedbackDeferredProjectionMaintenance(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function withoutReviewFeedbackJournalStore(
  bridge: ReturnType<typeof createInMemorySqlitePersistenceBridge>,
): SqlitePersistenceBridge {
  return {
    readBinary: bridge.readBinary.bind(bridge),
    writeBinary: bridge.writeBinary.bind(bridge),
    readJSON: bridge.readJSON?.bind(bridge),
    writeJSON: bridge.writeJSON?.bind(bridge),
    readSyncConflictDatabaseSources: bridge.readSyncConflictDatabaseSources?.bind(bridge),
    cleanupSyncConflictDatabaseSources: bridge.cleanupSyncConflictDatabaseSources?.bind(bridge),
  };
}

async function seedReviewEvent(database: WorkerSqliteDatabaseService, input: {
  id: string;
  cardId: string;
  attemptId?: string;
  rating?: number;
  reviewedAt: number;
  eventType?: string;
  commitIdempotencyKey?: string | null;
  payload?: unknown;
}): Promise<void> {
  const reviewedAtDate = new Date(input.reviewedAt);
  await database.runTransaction(`seed.review-event.${input.id}`, (db) => {
    db.run(
      `INSERT INTO review_events
        (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.cardId,
        input.attemptId ?? `attempt-${input.id}`,
        input.rating ?? 3,
        input.reviewedAt,
        input.commitIdempotencyKey ?? null,
        reviewedAtDate.getFullYear(),
        reviewedAtDate.getMonth() + 1,
        input.eventType ?? 'review-v2',
        JSON.stringify(input.payload ?? {}),
      ],
    );
  });
}

async function seedFormalReviewHistory(database: WorkerSqliteDatabaseService, input: {
  cardId: string;
  count: number;
  firstReviewedAt: number;
  latestReviewedAt: number;
}): Promise<void> {
  const count = Math.max(1, Math.floor(input.count));
  for (let index = 0; index < count; index += 1) {
    const reviewedAt = index === count - 1
      ? input.latestReviewedAt
      : input.firstReviewedAt + index;
    await seedReviewEvent(database, {
      id: `event-${input.cardId}-${index + 1}`,
      cardId: input.cardId,
      reviewedAt,
      eventType: 'review-v2',
    });
  }
}

async function seedDomainSyncOperation(database: WorkerSqliteDatabaseService, input: {
  operationId: string;
  sourceId?: string;
  operationType?: string;
  entityType?: string;
  entityId?: string;
  entityBlockId?: string | null;
  occurredAt?: number;
  observedAt?: number;
  payloadFingerprint?: string;
  idempotencyKey?: string | null;
  reviewEventId?: string | null;
  payload?: unknown;
}): Promise<void> {
  await database.runTransaction(`seed.domain-sync-operation.${input.operationId}`, (db) => {
    db.run(
      `INSERT INTO domain_sync_operations
        (operation_id, source_id, source_device_id, source_generation, operation_type,
         entity_type, entity_id, entity_block_id, occurred_at, observed_at,
         payload_fingerprint, idempotency_key, review_event_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.operationId,
        input.sourceId ?? 'test-source',
        null,
        null,
        input.operationType ?? 'review-committed',
        input.entityType ?? 'card',
        input.entityId ?? 'card-domain-sync-import',
        input.entityBlockId ?? 'block-domain-sync-import',
        input.occurredAt ?? 1_700_000_700_000,
        input.observedAt ?? 1_700_000_700_001,
        input.payloadFingerprint ?? 'abc12345',
        input.idempotencyKey ?? `test:${input.operationId}`,
        input.reviewEventId ?? null,
        JSON.stringify(input.payload ?? { seeded: true }),
      ],
    );
  });
}

async function seedNeuralRoamHyperspaceSource(
  database: WorkerSqliteDatabaseService,
  sourceId: string | string[] = 'neural-source-1',
  storageKey = 'neuralRoamQueue',
): Promise<void> {
  const sourceIds = Array.isArray(sourceId) ? sourceId : [sourceId];
  await database.setQueueStateValue(storageKey, {
    version: 8,
    engineMode: 'hyperspace',
    orbit: {
      seedPool: [],
      anchorPool: [],
      session: {},
    },
    hyperspace: {
      sourcePool: sourceIds.map((nodeId) => ({
        nodeId,
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: 1_700_000_000_000,
        visitedAt: 0,
        nodePreview: 'Neural source',
      })),
      anchorPool: [],
      session: {
        displayPath: [],
        displayPathEventIds: [],
        currentPathIndex: -1,
        navigationMode: 'source',
        bookmarkPathIndex: null,
        history: [],
        currentLeadSource: null,
        currentLeadSourceEventId: null,
        branchRootNodeId: null,
        currentSessionId: null,
        visitedBlocks: [],
        frontier: [],
        exhaustedSources: [],
      },
    },
    pendingAssociatedReviewCardIds: [],
    seenAssociatedReviewCardIds: [],
  });
}

async function seedNeuralRoamRouteSource(
  database: WorkerSqliteDatabaseService,
  routeId: string,
  sourceId: string,
  activeRouteId = routeId,
): Promise<void> {
  await database.init();
  const repository = new SqlNeuralRoamRouteRepository(database as never);
  const now = 1_700_000_000_000;
  const routes = [createDefaultRoute(now)];
  if (routeId !== 'default') {
    routes.push({
      metadata: {
        id: routeId,
        name: routeId,
        temporary: false,
        previousRouteId: null,
        initialSeedNodeIds: [],
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      },
      seedPool: [{
        routeId,
        nodeId: sourceId,
        kind: 'seed',
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: 1_700_000_000_000,
        visitedAt: null,
        preview: sourceId,
      }],
      anchorPool: [],
      sessions: { orbit: null, hyperspace: null },
      history: [],
    });
  } else {
    routes[0] = {
      ...routes[0],
      seedPool: [{
        routeId,
        nodeId: sourceId,
        kind: 'seed',
        nodeKind: 'concept',
        role: 'orbit-center',
        priority: 0.9,
        addedAt: now,
        visitedAt: null,
        preview: sourceId,
      }],
    };
  }
  await repository.saveState({
    activeRouteId,
    engineMode: 'hyperspace',
    routes,
  });
}

function createNeuralGraphResolver(
  dataByBlockId: Record<string, {
    id: string;
    content: string;
    type: string;
    parent_id?: string;
    root_id?: string;
    attrs?: Record<string, string>;
    ial?: Record<string, string>;
    attributes?: Record<string, string>;
  }>,
) {
  return vi.fn(async (
    request: BackendNeuralGraphQueryRequest,
  ): Promise<BackendNeuralGraphQueryResult> => {
    if (request.operation === 'fetchBlockData') {
      const block = dataByBlockId[request.blockId];
      return block
        ? { status: 'found', blockId: request.blockId, data: block, error: null }
        : { status: 'known-missing', blockId: request.blockId, data: null, error: null };
    }
    if (request.operation === 'isConceptCard') {
      return {
        status: 'found',
        blockId: request.blockId,
        data: request.blockId.includes('source'),
        error: null,
      };
    }
    if (request.operation === 'fetchNodePriority') {
      return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
    }
    return { status: 'found', blockId: request.blockId, data: [], error: null };
  });
}

describe('BackendKernel', () => {
  it('returns explicit unavailable when no persistence bridge is configured', async () => {
    const kernel = BackendKernel.createWithoutBridge();

    const loadResponse = await kernel.handle({
      id: 1,
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });

    expect(loadResponse).toEqual({
      id: 1,
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker persistence bridge is unavailable',
      },
    });
  });

  it('loads and persists sqlite database through worker methods', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const loadResponse = await kernel.handle({
      id: 'load',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });
    expect(loadResponse).toEqual({
      id: 'load',
      jsonrpc: '2.0',
      result: {
        ok: true,
        initialized: true,
        dbFile: 'siyuanmemo.db',
      },
    });

    const persistResponse = await kernel.handle({
      id: 'persist',
      jsonrpc: '2.0',
      method: 'db.persist',
      params: [],
    });
    expect(persistResponse).toEqual({
      id: 'persist',
      jsonrpc: '2.0',
      result: {
        ok: true,
        persisted: true,
        dbFile: 'siyuanmemo.db',
      },
    });

    const statusResponse = await kernel.handle({
      id: 'status',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in statusResponse).toBe(true);
    if ('result' in statusResponse) {
      expect(statusResponse.result).toMatchObject({
        runtime: 'srs-backend-worker',
        initialized: true,
        dbFile: 'siyuanmemo.db',
        ingest: {
          queueLength: 0,
          queuedTransactions: 0,
          maxQueueLength: 256,
          actionQueueLength: 0,
          actionEnqueuedTotal: 0,
          actionDequeuedTotal: 0,
          actionRequeuedTotal: 0,
          actionRejectedTotal: 0,
          removeActionQueuedTotal: 0,
          upsertActionQueuedTotal: 0,
          autoCardActionQueuedTotal: 0,
          maxActionQueueLength: 4096,
        },
        storage: {
          sqliteDelta: {
            fileName: 'sqlite-delta-log.v2.manifest.json',
            pendingCount: 0,
            lastCheckpoint: {
              ok: true,
              cause: 'worker.persist',
              initiator: 'db.persist',
              projectionGeneration: null,
              hotPath: false,
            },
          },
        },
      });
    }
  });

  it('treats compatible review.feedback retry with changed timing/session as one committed review event', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });
    const reviewedAt = 1_779_300_000_000;
    await database.upsertCards([
      buildCard({
        id: 'card-review-retry-idempotent',
        due: reviewedAt,
        reps: 3,
        lastReview: reviewedAt - 86_400_000,
        updatedAt: reviewedAt - 86_400_000,
      }),
    ]);

    const first = await kernel.handle({
      id: 'review-first',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-retry-idempotent',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        sessionId: 'session-before-retry',
        reviewedAt,
        idempotencyKey: 'review-commit:retry-same-action',
      }],
    });
    const afterFirst = await database.getCard('card-review-retry-idempotent');

    const retry = await kernel.handle({
      id: 'review-retry',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-retry-idempotent',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        sessionId: 'session-after-retry',
        reviewedAt: reviewedAt + 30_000,
        idempotencyKey: 'review-commit:retry-same-action',
      }],
    });
    const afterRetry = await database.getCard('card-review-retry-idempotent');

    expect(first).toEqual(expect.objectContaining({
      result: expect.objectContaining({ committed: true }),
    }));
    expect(retry).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        committed: true,
        duplicate: true,
        idempotencyKey: 'review-commit:retry-same-action',
      }),
    }));
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-retry-idempotent'],
    )?.count).toBe(1);
    const reviewEventPayload = JSON.parse(database.getOne<{ payload_json: string }>(
      'SELECT payload_json FROM review_events WHERE card_id = ?',
      ['card-review-retry-idempotent'],
    )?.payload_json || '{}');
    expect(reviewEventPayload.projectionKind).toBe('messagepack-review-event-index');
    expect(reviewEventPayload).not.toHaveProperty('before');
    expect(reviewEventPayload).not.toHaveProperty('after');
    expect(reviewEventPayload).not.toHaveProperty('reviewEventFact');
    expect(reviewEventPayload.reviewEventFactSummary).toMatchObject({
      eventId: expect.stringMatching(/^v2:card-review-retry-idempotent:/),
      cardId: 'card-review-retry-idempotent',
      commitIdempotencyKey: 'review-commit:retry-same-action',
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      classification: {
        kind: 'formal',
        formal: true,
        exclusionReasons: [],
      },
      dataQuality: {
        status: 'complete',
        reasons: [],
      },
    });
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['review-committed', 'card-review-retry-idempotent'],
    )?.count).toBe(1);
    const ledgerRow = database.getOne<{
      operation_type: string;
      entity_type: string;
      entity_id: string;
      entity_block_id: string | null;
      idempotency_key: string | null;
      review_event_id: string | null;
      payload_fingerprint: string;
      payload_json: string;
    }>(
      `SELECT operation_type, entity_type, entity_id, entity_block_id,
              idempotency_key, review_event_id, payload_fingerprint, payload_json
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?
       ORDER BY occurred_at, operation_id`,
      ['review-committed', 'card-review-retry-idempotent'],
    );
    expect(ledgerRow).toMatchObject({
      operation_type: 'review-committed',
      entity_type: 'card',
      entity_id: 'card-review-retry-idempotent',
      entity_block_id: 'block-1',
      idempotency_key: 'review-commit:retry-same-action',
    });
    expect(ledgerRow?.review_event_id).toMatch(/^v2:card-review-retry-idempotent:/);
    expect(ledgerRow?.payload_fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.parse(ledgerRow?.payload_json || '{}')).toMatchObject({
      cardId: 'card-review-retry-idempotent',
      rating: 3,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'review-commit:retry-same-action',
    });
    expect(JSON.parse(ledgerRow?.payload_json || '{}')).not.toHaveProperty('before');
    expect(JSON.parse(ledgerRow?.payload_json || '{}')).not.toHaveProperty('after');
    expect(afterRetry?.reps).toBe(afterFirst?.reps);
    expect(afterRetry?.lastReview).toBe(afterFirst?.lastReview);
  });

  it('commits a later review of the same card and rating when commit identity is new', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });
    const reviewedAt = 1_779_301_000_000;
    await database.upsertCards([
      buildCard({
        id: 'card-review-later-distinct',
        due: reviewedAt,
        reps: 3,
        lastReview: reviewedAt - 86_400_000,
        updatedAt: reviewedAt - 86_400_000,
      }),
    ]);

    for (const [idempotencyKey, offset] of [
      ['review-commit:later-first', 0],
      ['review-commit:later-second', 86_400_000],
    ] as const) {
      const response = await kernel.handle({
        id: idempotencyKey,
        jsonrpc: '2.0',
        method: 'review.feedback',
        params: [{
          cardId: 'card-review-later-distinct',
          rating: 3,
          queueType: 'retrieval-practice',
          queueMode: 'formal',
          commitPolicy: 'write-schedule',
          sessionId: idempotencyKey,
          reviewedAt: reviewedAt + offset,
          idempotencyKey,
        }],
      });
      expect(response).toEqual(expect.objectContaining({
        result: expect.objectContaining({
          committed: true,
          duplicate: false,
          idempotencyKey,
        }),
      }));
    }

    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-later-distinct'],
    )?.count).toBe(2);
  });

  it('rejects conflicting duplicate review commit identity without mutating review state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });
    const reviewedAt = 1_779_302_000_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-conflict-a', due: reviewedAt }),
      buildCard({ id: 'card-review-conflict-b', due: reviewedAt }),
    ]);

    await kernel.handle({
      id: 'review-conflict-first',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-conflict-a',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        reviewedAt,
        idempotencyKey: 'review-commit:conflicting-key',
      }],
    });
    const beforeConflict = await database.getCard('card-review-conflict-b');

    const conflict = await kernel.handle({
      id: 'review-conflict-second',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-conflict-b',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        reviewedAt: reviewedAt + 1_000,
        idempotencyKey: 'review-commit:conflicting-key',
      }],
    });
    const afterConflict = await database.getCard('card-review-conflict-b');

    expect(conflict).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('conflicting review commit idempotency key'),
      }),
    }));
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id IN (?, ?)',
      ['card-review-conflict-a', 'card-review-conflict-b'],
    )?.count).toBe(1);
    expect(afterConflict?.reps).toBe(beforeConflict?.reps);
    expect(afterConflict?.lastReview).toBe(beforeConflict?.lastReview);
  });

  it('exposes automatic pre-request merge activity through diagnostics.status', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const reviewedAt = 1_779_303_000_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-pre-request-merge',
        due: reviewedAt + 86_400_000,
        reps: 0,
        lastReview: reviewedAt - 86_400_000,
        updatedAt: reviewedAt - 86_400_000,
      }),
    ]);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-pre-request-merge',
        due: reviewedAt + 2 * 86_400_000,
        reps: 1,
        lastReview: reviewedAt,
        updatedAt: reviewedAt,
      }),
    ]);
    await seedReviewEvent(conflictDatabase, {
      id: 'event-pre-request-merge',
      cardId: 'card-pre-request-merge',
      reviewedAt,
      payload: { source: 'phone' },
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const bridgeWithConflict = {
      ...currentBridge,
      async readSyncConflictDatabaseSources() {
        return [{
          sourceId: 'phone-pre-request-conflict',
          bytes: conflictBytes!,
        }];
      },
    };
    const database = new WorkerSqliteDatabaseService(bridgeWithConflict);
    await database.upsertCards([buildCard({ id: 'card-pre-request-merge' })]);
    const kernel = new BackendKernel({ database });

    const countResponse = await kernel.handle({
      id: 'trigger-pre-request-merge',
      jsonrpc: '2.0',
      method: 'browser.count',
      params: [{ query: {} }],
    });
    expect(countResponse).toEqual(expect.objectContaining({
      result: expect.objectContaining({ count: expect.any(Number) }),
    }));

    const diagnosticsResponse = await kernel.handle({
      id: 'diagnostics-after-pre-request-merge',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect(diagnosticsResponse).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        preRequestMerge: expect.objectContaining({
          latest: expect.objectContaining({
            method: 'browser.count',
            sources: 1,
            mergedReviewEvents: 1,
            mergedCards: 1,
            skippedSources: [],
            sourceIds: ['phone-pre-request-conflict'],
          }),
          history: expect.arrayContaining([
            expect.objectContaining({
              method: 'browser.count',
              mergedReviewEvents: 1,
              mergedCards: 1,
            }),
          ]),
        }),
      }),
    }));
  });

  it('merges review events and newer card state from a synced conflict database', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const staleReviewAt = 1_779_187_000_000;
    const syncedReviewAt = 1_779_188_000_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-sync-conflict',
        due: staleReviewAt + 86_400_000,
        reps: 0,
        lastReview: staleReviewAt,
        updatedAt: staleReviewAt,
      }),
    ]);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-sync-conflict',
        due: syncedReviewAt + 2 * 86_400_000,
        reps: 1,
        lastReview: syncedReviewAt,
        updatedAt: syncedReviewAt,
      }),
    ]);
    await conflictDatabase.runTransaction('seed.conflict-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-from-phone',
          'card-sync-conflict',
          'attempt-phone',
          3,
          syncedReviewAt,
          2026,
          5,
          'review',
          JSON.stringify({ source: 'phone' }),
        ],
      );
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-conflict-db',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: syncedReviewAt + 1,
        sources: [{ sourceId: 'phone-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual({
      id: 'merge-conflict-db',
      jsonrpc: '2.0',
      result: {
        ok: true,
        sources: 1,
        mergedReviewEvents: 1,
        ignoredReviewEvents: 0,
        mergedCards: 1,
        ignoredCards: 0,
        skippedSources: [],
        diagnostics: {
          reviewCardDivergences: [],
        },
      },
    });
    expect(currentDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE id = ?',
      ['event-from-phone'],
    )?.count).toBe(1);
    const mergedCard = await currentDatabase.getCard('card-sync-conflict');
    expect(mergedCard?.reps).toBe(1);
    expect(mergedCard?.lastReview).toBe(syncedReviewAt);
    const metadataRow = currentDatabase.getOne<{ value_json: string; updated_at: number }>(
      'SELECT value_json, updated_at FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );
    expect(metadataRow?.updated_at).toBe(syncedReviewAt + 1);
    expect(JSON.parse(metadataRow?.value_json || '{}')).toMatchObject({
      revision: 1,
      lastModifiedAt: syncedReviewAt + 1,
      lastModifiedBy: 'srs-backend-worker:sync.conflict.merge',
    });
  });

  it('imports missing domain sync ledger operations from changed persisted main DB bytes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'local-main-import-card', blockId: 'local-main-import-block' })]);

    const externalBridge = createInMemorySqlitePersistenceBridge();
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await seedDomainSyncOperation(externalDatabase, {
      operationId: 'domain-sync-main-import-1',
      sourceId: 'phone-main-db',
      operationType: 'review-committed',
      entityId: 'remote-review-card',
      entityBlockId: 'remote-review-block',
      reviewEventId: 'remote-review-event-1',
      idempotencyKey: 'review:remote-review-event-1',
    });
    await externalDatabase.persist();
    const externalBytes = await externalBridge.readBinary('siyuanmemo.db');
    expect(externalBytes).toBeTruthy();
    await persistenceBridge.writeBinary('siyuanmemo.db', externalBytes!);

    const result = await database.mergeExternalDatabaseIfChanged(1_700_000_900_000);

    expect(result).toMatchObject({
      ok: true,
      checked: true,
      changed: true,
      mergedReviewEvents: 0,
      mergedCards: 0,
      skippedSources: [],
    });
    const imported = database.getOne<{
      operation_type: string;
      source_id: string;
      review_event_id: string | null;
      payload_json: string;
    }>(
      `SELECT operation_type, source_id, review_event_id, payload_json
       FROM domain_sync_operations
       WHERE operation_id = ?`,
      ['domain-sync-main-import-1'],
    );
    expect(imported).toMatchObject({
      operation_type: 'review-committed',
      source_id: 'phone-main-db',
      review_event_id: 'remote-review-event-1',
      payload_json: JSON.stringify({ seeded: true }),
    });
    expect(database.getOne<{
      source_kind: string;
      imported_operations: number;
      ignored_operations: number;
      imported_review_events: number;
      imported_cards: number;
    }>(
      `SELECT source_kind, imported_operations, ignored_operations, imported_review_events, imported_cards
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['siyuan-sync:siyuanmemo.db'],
    )).toMatchObject({
      source_kind: 'persisted-main-db',
      imported_operations: 1,
      ignored_operations: 0,
      imported_review_events: 0,
      imported_cards: 0,
    });

    const repeated = await database.mergeExternalDatabaseIfChanged(1_700_000_900_001);
    expect(repeated.changed).toBe(false);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_operations WHERE operation_id = ?',
      ['domain-sync-main-import-1'],
    )?.count).toBe(1);
  });

  it('imports missing domain sync ledger operations from readable sync conflict database copies', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedDomainSyncOperation(conflictDatabase, {
      operationId: 'domain-sync-conflict-import-1',
      sourceId: 'tablet-conflict-db',
      operationType: 'card-deleted',
      entityId: 'deleted-conflict-card',
      entityBlockId: 'deleted-conflict-block',
      idempotencyKey: 'card-delete:deleted-conflict-card:1700000800000',
      payload: { deletedAt: 1_700_000_800_000 },
    });
    await conflictDatabase.persist();
    const conflictBytes = await conflictBridge.readBinary('siyuanmemo.db');
    expect(conflictBytes).toBeTruthy();

    const result = await database.mergeSyncConflictDatabases({
      mergedAt: 1_700_000_901_000,
      sources: [{ sourceId: 'siyuan-sync-conflict:ledger-only', bytes: conflictBytes! }],
    });

    expect(result).toMatchObject({
      ok: true,
      sources: 1,
      mergedReviewEvents: 0,
      mergedCards: 0,
      skippedSources: [],
    });
    const imported = database.getOne<{
      operation_type: string;
      source_id: string;
      entity_id: string;
      entity_block_id: string | null;
      payload_json: string;
    }>(
      `SELECT operation_type, source_id, entity_id, entity_block_id, payload_json
       FROM domain_sync_operations
       WHERE operation_id = ?`,
      ['domain-sync-conflict-import-1'],
    );
    expect(imported).toMatchObject({
      operation_type: 'card-deleted',
      source_id: 'tablet-conflict-db',
      entity_id: 'deleted-conflict-card',
      entity_block_id: 'deleted-conflict-block',
      payload_json: JSON.stringify({ deletedAt: 1_700_000_800_000 }),
    });
    expect(database.getOne<{
      source_kind: string;
      imported_operations: number;
      ignored_operations: number;
      imported_review_events: number;
      imported_cards: number;
    }>(
      `SELECT source_kind, imported_operations, ignored_operations, imported_review_events, imported_cards
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['siyuan-sync-conflict:ledger-only'],
    )).toMatchObject({
      source_kind: 'siyuan-conflict-db',
      imported_operations: 1,
      ignored_operations: 0,
      imported_review_events: 0,
      imported_cards: 0,
    });

    const repeated = await database.mergeSyncConflictDatabases({
      mergedAt: 1_700_000_901_001,
      sources: [{ sourceId: 'siyuan-sync-conflict:ledger-only', bytes: conflictBytes! }],
    });
    expect(repeated).toMatchObject({
      ok: true,
      sources: 1,
      mergedReviewEvents: 0,
      mergedCards: 0,
      skippedSources: [],
    });
    expect(database.getOne<{
      imported_operations: number;
      ignored_operations: number;
    }>(
      `SELECT imported_operations, ignored_operations
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['siyuan-sync-conflict:ledger-only'],
    )).toMatchObject({
      imported_operations: 1,
      ignored_operations: 0,
    });
  });

  it('records skipped domain sync source diagnostics without successful processed counts', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);

    const result = await database.mergeSyncConflictDatabases({
      mergedAt: 1_700_000_902_000,
      sources: [
        { sourceId: 'empty-source', bytes: new Uint8Array() },
        { sourceId: 'broken-source', bytes: new Uint8Array([
          ..."SQLite format 3\0".split('').map((char) => char.charCodeAt(0)),
          1,
          2,
          3,
        ]) },
      ],
    });

    expect(result.skippedSources).toEqual([
      { sourceId: 'empty-source', reason: 'invalid-bytes' },
      expect.objectContaining({ sourceId: 'broken-source' }),
    ]);
    const brokenSkipped = database.getOne<{
      source_id: string;
      skipped_reason: string;
      imported_operations: number;
      imported_review_events: number;
      imported_cards: number;
    }>(
      `SELECT source_id, skipped_reason, imported_operations, imported_review_events, imported_cards
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['broken-source'],
    );
    const emptySkipped = database.getOne<{
      source_id: string;
      skipped_reason: string;
      imported_operations: number;
      imported_review_events: number;
      imported_cards: number;
    }>(
      `SELECT source_id, skipped_reason, imported_operations, imported_review_events, imported_cards
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['empty-source'],
    );
    expect(brokenSkipped).toMatchObject({
      source_id: 'broken-source',
      skipped_reason: 'parse-error',
      imported_operations: 0,
      imported_review_events: 0,
      imported_cards: 0,
    });
    expect(emptySkipped).toMatchObject({
      source_id: 'empty-source',
      skipped_reason: 'invalid-bytes',
      imported_operations: 0,
      imported_review_events: 0,
      imported_cards: 0,
    });
  });

  it('cleans only backend-eligible processed conflict sources and keeps idempotency bounded', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const cleanupSyncConflictDatabaseSources = vi.fn(async (sourceIds: string[]) => ({
      cleaned: sourceIds
        .filter((sourceId) => sourceId !== 'skipped-source')
        .map((sourceId) => ({ sourceId, path: `/conflicts/${sourceId}.db` })),
      skipped: sourceIds.includes('skipped-source')
        ? [{ sourceId: 'skipped-source', reason: 'source-not-found' }]
        : [],
      failed: [],
    }));
    persistenceBridge.cleanupSyncConflictDatabaseSources = cleanupSyncConflictDatabaseSources;
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.load();
    await database.runTransaction('seed.domain-sync-cleanup-sources', (db) => {
      db.run(
        `INSERT INTO domain_sync_processed_sources
          (source_id, source_fingerprint, source_kind, path, processed_at,
           imported_operations, ignored_operations, imported_review_events, ignored_review_events,
           imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['eligible-source', 'fp-eligible', 'siyuan-conflict-db', '/conflicts/eligible-source.db', 1, 0, 0, 0, 0, 0, 0, null, 'clean', '{}'],
      );
    });

    const result = await database.cleanupDomainSyncConflictSources({
      sourceIds: ['eligible-source', 'missing-source'],
      idempotencyKey: 'cleanup-key-1',
      confirmedAt: 1_700_000_000_000,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'cleaned',
      cleaned: [{ sourceId: 'eligible-source', path: '/conflicts/eligible-source.db' }],
      skipped: [
        { sourceId: 'missing-source', reason: 'unprocessed' },
      ],
      failed: [],
    });
    expect(cleanupSyncConflictDatabaseSources).toHaveBeenCalledWith(['eligible-source']);

    const duplicate = await database.cleanupDomainSyncConflictSources({
      sourceIds: ['eligible-source'],
      idempotencyKey: 'cleanup-key-1',
      confirmedAt: 1_700_000_000_001,
    });
    expect(duplicate.status).toBe('duplicate');
    expect(cleanupSyncConflictDatabaseSources).toHaveBeenCalledTimes(1);

    await database.runTransaction('seed.domain-sync-skipped-cleanup-source', (db) => {
      db.run(
        `INSERT INTO domain_sync_processed_sources
          (source_id, source_fingerprint, source_kind, path, processed_at,
           imported_operations, ignored_operations, imported_review_events, ignored_review_events,
           imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['skipped-source', 'fp-skipped', 'siyuan-conflict-db', '/conflicts/skipped-source.db', 1, 0, 0, 0, 0, 0, 0, 'parse-error', 'source-error', '{}'],
      );
    });
    const skipped = await database.cleanupDomainSyncConflictSources({
      sourceIds: ['skipped-source'],
      idempotencyKey: 'cleanup-key-2',
      confirmedAt: 1_700_000_000_002,
    });
    expect(skipped.cleaned).toEqual([]);
    expect(skipped.skipped).toEqual([{ sourceId: 'skipped-source', reason: 'source-not-found' }]);
    expect(cleanupSyncConflictDatabaseSources).toHaveBeenCalledTimes(2);
    expect(cleanupSyncConflictDatabaseSources).toHaveBeenLastCalledWith(['skipped-source']);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['skipped-source'],
    )?.count).toBe(0);
  });

  it('lists existing processed conflict database copies as cleanup candidates', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.load();
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();
    const source = {
      sourceId: 'siyuan-sync-conflict:2026-05-21-151105:/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      bytes: conflictBytes!,
      path: '/temp/repo/sync/conflicts/2026-05-21-151105/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      modifiedAt: 1_779_347_466_184,
      size: conflictBytes!.byteLength,
    };
    await database.mergeSyncConflictDatabases({
      mergedAt: 1_779_347_466_184,
      sources: [source],
    });
    persistenceBridge.readSyncConflictDatabaseSources = vi.fn(async () => [source]);

    const candidates = await database.listDomainSyncConflictSourceCleanupCandidates();

    expect(candidates).toMatchObject({
      ok: true,
      sanityStatus: 'merged',
      candidates: [
        {
          sourceId: source.sourceId,
          path: source.path,
          size: source.size,
          processedSource: {
            sourceKind: 'siyuan-conflict-db',
            skippedReason: null,
          },
          cleanup: {
            eligible: true,
            reason: 'processed-resolved',
          },
        },
      ],
    });
  });

  it('keeps legacy DB merge behavior and backfills imported formal review events into the local ledger', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const reviewedAt = 1_700_000_903_000;

    const legacyBridge = createInMemorySqlitePersistenceBridge();
    const legacyDatabase = new WorkerSqliteDatabaseService(legacyBridge);
    await legacyDatabase.upsertCards([
      buildCard({
        id: 'legacy-card',
        blockId: 'legacy-block',
        reps: 2,
        lastReview: reviewedAt,
        updatedAt: reviewedAt,
      }),
    ]);
    await seedReviewEvent(legacyDatabase, {
      id: 'legacy-review-event-1',
      cardId: 'legacy-card',
      reviewedAt,
      payload: { source: 'legacy-db' },
    });
    await legacyDatabase.runTransaction('legacy.drop-domain-sync-ledger', (db) => {
      db.run('DROP TABLE domain_sync_operations');
    });
    await legacyDatabase.persist();
    const legacyBytes = await legacyBridge.readBinary('siyuanmemo.db');
    expect(legacyBytes).toBeTruthy();

    const result = await currentDatabase.mergeSyncConflictDatabases({
      mergedAt: reviewedAt + 1,
      sources: [{ sourceId: 'legacy-conflict-db', bytes: legacyBytes! }],
    });

    expect(result).toMatchObject({
      ok: true,
      sources: 1,
      mergedReviewEvents: 1,
      mergedCards: 1,
      skippedSources: [],
    });
    expect(await currentDatabase.getCard('legacy-card')).toMatchObject({
      id: 'legacy-card',
      blockId: 'legacy-block',
      reps: 2,
    });
    expect(currentDatabase.getOne<{
      source_id: string;
      operation_type: string;
      entity_id: string;
      entity_block_id: string | null;
      review_event_id: string | null;
    }>(
      `SELECT source_id, operation_type, entity_id, entity_block_id, review_event_id
       FROM domain_sync_operations
       WHERE review_event_id = ?`,
      ['legacy-review-event-1'],
    )).toMatchObject({
      source_id: 'legacy-import:legacy-conflict-db',
      operation_type: 'review-committed',
      entity_id: 'legacy-card',
      entity_block_id: 'legacy-block',
      review_event_id: 'legacy-review-event-1',
    });
    expect(currentDatabase.getOne<{
      source_kind: string;
      imported_operations: number;
      imported_review_events: number;
      imported_cards: number;
    }>(
      `SELECT source_kind, imported_operations, imported_review_events, imported_cards
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['legacy-conflict-db'],
    )).toMatchObject({
      source_kind: 'legacy-db',
      imported_operations: 1,
      imported_review_events: 1,
      imported_cards: 1,
    });
  });

  it('keeps repaired scheduling state when persisted main DB bytes contain a stale newer-updated card row', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'card-authority-repair';
    const repairedLastReview = 1_779_590_000_000;
    const repairedUpdatedAt = 1_779_590_100_000;
    await database.upsertCards([buildCard({
      id: cardId,
      due: repairedLastReview + 86_400_000,
      reps: 11,
      lastReview: repairedLastReview,
      updatedAt: repairedUpdatedAt,
    })]);
    await seedFormalReviewHistory(database, {
      cardId,
      count: 11,
      firstReviewedAt: repairedLastReview - 10_000,
      latestReviewedAt: repairedLastReview,
    });
    await database.persist();

    const externalBridge = createInMemorySqlitePersistenceBridge();
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await externalDatabase.upsertCards([buildCard({
      id: cardId,
      due: repairedLastReview + 32 * 86_400_000,
      reps: 1,
      lastReview: repairedLastReview,
      updatedAt: repairedUpdatedAt + 100_000,
    })]);
    await externalDatabase.persist();
    const externalBytes = await externalBridge.readBinary('siyuanmemo.db');
    expect(externalBytes).toBeTruthy();
    await persistenceBridge.writeBinary('siyuanmemo.db', externalBytes!);

    const result = await database.mergeExternalDatabaseIfChanged(repairedUpdatedAt + 200_000);

    expect(result).toMatchObject({
      ok: true,
      checked: true,
      changed: false,
      mergedCards: 0,
    });
    expect(await database.getCard(cardId)).toMatchObject({
      reps: 11,
      lastReview: repairedLastReview,
      updatedAt: repairedUpdatedAt,
    });
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['siyuan-sync:siyuanmemo.db'],
    )?.count).toBe(0);
  });

  it('does not regress scheduling state before handling a routine backend request', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'card-preflight-authority';
    const repairedLastReview = 1_779_590_500_000;
    const repairedUpdatedAt = 1_779_590_600_000;
    await database.upsertCards([buildCard({
      id: cardId,
      due: repairedLastReview + 86_400_000,
      reps: 8,
      lastReview: repairedLastReview,
      updatedAt: repairedUpdatedAt,
    })]);
    await seedFormalReviewHistory(database, {
      cardId,
      count: 8,
      firstReviewedAt: repairedLastReview - 8_000,
      latestReviewedAt: repairedLastReview,
    });
    await database.persist();

    const externalBridge = createInMemorySqlitePersistenceBridge();
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await externalDatabase.upsertCards([buildCard({
      id: cardId,
      due: repairedLastReview + 66 * 86_400_000,
      reps: 1,
      lastReview: repairedLastReview,
      updatedAt: repairedUpdatedAt + 100_000,
    })]);
    await externalDatabase.persist();
    const externalBytes = await externalBridge.readBinary('siyuanmemo.db');
    expect(externalBytes).toBeTruthy();
    await persistenceBridge.writeBinary('siyuanmemo.db', externalBytes!);

    const kernel = new BackendKernel({ database });
    const response = await kernel.handle({
      id: 'browser-count-preflight-authority',
      jsonrpc: '2.0',
      method: 'browser.count',
      params: [{ query: { ids: [cardId] } }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({ count: 1 }),
    }));
    expect(await database.getCard(cardId)).toMatchObject({
      reps: 8,
      lastReview: repairedLastReview,
      updatedAt: repairedUpdatedAt,
    });
  });

  it('does not invalidate queue projections for event-only ledger imports', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    await seedQueueProjection(currentDatabase, {
      queueType: 'retrieval-practice',
      rows: [buildCard({ id: 'event-only-card', blockId: 'event-only-block' })],
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedDomainSyncOperation(conflictDatabase, {
      operationId: 'domain-sync-event-only-import-1',
      operationType: 'review-committed',
      entityId: 'event-only-card',
      entityBlockId: 'event-only-block',
      reviewEventId: 'event-only-review-1',
      idempotencyKey: 'review:event-only-review-1',
    });
    await conflictDatabase.persist();
    const conflictBytes = await conflictBridge.readBinary('siyuanmemo.db');
    expect(conflictBytes).toBeTruthy();

    await currentDatabase.mergeSyncConflictDatabases({
      mergedAt: 1_700_000_904_000,
      sources: [{ sourceId: 'event-only-ledger-source', bytes: conflictBytes! }],
    });

    expect(currentDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_invalidations',
    )?.count).toBe(0);
  });

  it('invalidates queue projections for card-affecting ledger imports', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    await seedQueueProjection(currentDatabase, {
      queueType: 'retrieval-practice',
      rows: [buildCard({ id: 'card-affecting-import-card', blockId: 'card-affecting-import-block' })],
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedDomainSyncOperation(conflictDatabase, {
      operationId: 'domain-sync-card-affecting-import-1',
      operationType: 'card-deleted',
      entityId: 'card-affecting-import-card',
      entityBlockId: 'card-affecting-import-block',
      idempotencyKey: 'card-delete:card-affecting-import-card:1700000904000',
      payload: { deletedAt: 1_700_000_904_000 },
    });
    await conflictDatabase.persist();
    const conflictBytes = await conflictBridge.readBinary('siyuanmemo.db');
    expect(conflictBytes).toBeTruthy();

    await currentDatabase.mergeSyncConflictDatabases({
      mergedAt: 1_700_000_904_001,
      sources: [{ sourceId: 'card-affecting-ledger-source', bytes: conflictBytes! }],
    });

    const invalidation = currentDatabase.getOne<{
      reason: string;
      affected_card_ids_json: string;
      affected_block_ids_json: string;
    }>(
      `SELECT reason, affected_card_ids_json, affected_block_ids_json
       FROM queue_projection_invalidations
       WHERE reason = ?
       LIMIT 1`,
      ['sync-conflict-merge'],
    );
    expect(invalidation?.reason).toBe('sync-conflict-merge');
    expect(JSON.parse(invalidation?.affected_card_ids_json || '[]')).toContain('card-affecting-import-card');
    expect(JSON.parse(invalidation?.affected_block_ids_json || '[]')).toContain('card-affecting-import-block');
  });

  it('reports clean domain sync sanity through diagnostics without changing ordinary browser count shape', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const countResponse = await kernel.handle({
      id: 'count-shape',
      jsonrpc: '2.0',
      method: 'browser.count',
      params: [{ query: {} }],
    });
    const diagnosticsResponse = await kernel.handle({
      id: 'domain-sync-clean',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });

    expect(countResponse).toEqual({
      id: 'count-shape',
      jsonrpc: '2.0',
      result: { count: 0 },
    });
    expect(diagnosticsResponse).toMatchObject({
      id: 'domain-sync-clean',
      jsonrpc: '2.0',
      result: {
        domainSync: {
          ok: true,
          ledger: { operationCount: 0 },
          sanity: { status: 'clean', pendingImportCount: 0 },
          processedSources: { totalProcessed: 0, totalSkipped: 0 },
        },
      },
    });
  });

  it('reports merged domain sync sanity after a successful processed source import', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedDomainSyncOperation(conflictDatabase, {
      operationId: 'domain-sync-merged-status-1',
      operationType: 'card-deleted',
      entityId: 'merged-status-card',
      entityBlockId: 'merged-status-block',
      idempotencyKey: 'card-delete:merged-status-card:1700001000000',
    });
    await conflictDatabase.persist();
    const conflictBytes = await conflictBridge.readBinary('siyuanmemo.db');
    expect(conflictBytes).toBeTruthy();

    await database.mergeSyncConflictDatabases({
      mergedAt: 1_700_001_000_000,
      sources: [{ sourceId: 'merged-status-source', bytes: conflictBytes! }],
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      ledger: { operationCount: 1 },
      processedSources: { totalProcessed: 1, totalSkipped: 0 },
      sanity: { status: 'merged' },
    });
  });

  it('reports repairable domain sync sanity for newer formal review history', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'repairable-card',
      blockId: 'repairable-block',
      reps: 0,
      lastReview: 1_700_001_000_000,
      updatedAt: 1_700_001_000_000,
    })]);
    await seedReviewEvent(database, {
      id: 'repairable-review-event',
      cardId: 'repairable-card',
      reviewedAt: 1_700_001_100_000,
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'repairable',
        repairableDivergenceCount: 1,
        affectedCardIds: expect.arrayContaining(['repairable-card']),
      },
      repair: {
        available: true,
        repairableDivergenceCount: 1,
      },
    });
  });

  it('does not offer domain sync repair for source-missing cards', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'source-missing-repair-card',
      blockId: 'source-missing-repair-block',
      reps: 0,
      lastReview: 0,
      updatedAt: 1_700_001_050_000,
    })]);
    await seedReviewEvent(database, {
      id: 'source-missing-repair-review-1',
      cardId: 'source-missing-repair-card',
      reviewedAt: 1_700_001_100_000,
    });
    await seedReviewEvent(database, {
      id: 'source-missing-repair-review-2',
      cardId: 'source-missing-repair-card',
      reviewedAt: 1_700_001_110_000,
    });
    await database.runTransaction('seed.source-missing.repair-card', (db) => {
      db.run(
        `UPDATE cards
         SET source_exists = 0,
             source_checked_at = ?,
             source_missing_at = ?
         WHERE id = ?`,
        [1_700_001_120_000, 1_700_001_120_000, 'source-missing-repair-card'],
      );
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
      repair: {
        available: false,
        repairableDivergenceCount: 0,
      },
    });
    await expect(database.previewDomainSyncRepair({
      cardIds: ['source-missing-repair-card'],
      includeUnrepairable: true,
    }, 1_700_001_120_001)).resolves.toMatchObject({
      status: 'no-repair',
      affectedCardCount: 0,
      evidence: [],
      plannedMutations: [],
      unrepairableReasons: [],
    });
  });

  it('does not offer domain sync repair for tombstoned cards', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'tombstoned-repair-card',
      blockId: 'tombstoned-repair-block',
      reps: 0,
      lastReview: 0,
      updatedAt: 1_700_001_050_000,
    })]);
    await seedReviewEvent(database, {
      id: 'tombstoned-repair-review',
      cardId: 'tombstoned-repair-card',
      reviewedAt: 1_700_001_100_000,
    });
    await database.runTransaction('seed.tombstoned.repair-card', (db) => {
      db.run(
        `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        [
          'card',
          'tombstoned-repair-card',
          1_700_001_120_000,
          'test-delete',
          JSON.stringify({ deletedAt: 1_700_001_120_000, deletedBy: 'test-delete' }),
        ],
      );
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
      repair: {
        available: false,
        repairableDivergenceCount: 0,
      },
    });
    await expect(database.previewDomainSyncRepair({
      cardIds: ['tombstoned-repair-card'],
      includeUnrepairable: true,
    }, 1_700_001_120_001)).resolves.toMatchObject({
      status: 'no-repair',
      affectedCardCount: 0,
      evidence: [],
      plannedMutations: [],
      unrepairableReasons: [],
    });
  });

  it('builds a read-only domain sync repair preview from newer review history', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'preview-newer-card',
      blockId: 'preview-newer-block',
      reps: 0,
      lastReview: 1_700_001_000_000,
      updatedAt: 1_700_001_000_000,
    });
    await database.upsertCards([card]);
    await seedReviewEvent(database, {
      id: 'preview-newer-review-event',
      cardId: 'preview-newer-card',
      reviewedAt: 1_700_001_100_000,
    });

    const preview = await database.previewDomainSyncRepair({ limit: 10 }, 1_700_001_200_000);

    expect(preview).toMatchObject({
      ok: true,
      status: 'preview',
      affectedCardCount: 1,
      schedulerEvidence: {
        schedulerType: expect.any(String),
        configHash: expect.any(String),
        capturedAt: 1_700_001_200_000,
      },
      evidence: [
        expect.objectContaining({
          cardId: 'preview-newer-card',
          blockId: 'preview-newer-block',
          reason: 'review-history-newer-than-card-state',
          newestReviewEventAt: 1_700_001_100_000,
          cardLastReview: 1_700_001_000_000,
        }),
      ],
      plannedMutations: [
        expect.objectContaining({
          cardId: 'preview-newer-card',
          mutationType: 'card-state-repair',
          after: expect.objectContaining({
            lastReview: 1_700_001_100_000,
            reps: 1,
          }),
        }),
      ],
    });
    await expect(database.getCard('preview-newer-card')).resolves.toMatchObject({
      reps: 0,
      lastReview: 1_700_001_000_000,
    });
    expect(database.getOne<{ status: string; affected_card_count: number; payload_json: string }>(
      `SELECT status, affected_card_count, payload_json
       FROM domain_sync_repair_plans
       WHERE plan_id = ?`,
      [preview.planId],
    )).toMatchObject({
      status: 'preview',
      affected_card_count: 1,
    });
  });

  it('surfaces review event count divergence in repair preview evidence', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'preview-count-card',
      blockId: 'preview-count-block',
      reps: 1,
      lastReview: 1_700_001_300_000,
      updatedAt: 1_700_001_300_000,
    })]);
    await seedReviewEvent(database, {
      id: 'preview-count-review-1',
      cardId: 'preview-count-card',
      reviewedAt: 1_700_001_200_000,
    });
    await seedReviewEvent(database, {
      id: 'preview-count-review-2',
      cardId: 'preview-count-card',
      reviewedAt: 1_700_001_250_000,
    });

    await expect(database.previewDomainSyncRepair({ cardIds: ['preview-count-card'] }, 1_700_001_300_001))
      .resolves.toMatchObject({
        status: 'preview',
        evidence: [
          expect.objectContaining({
            cardId: 'preview-count-card',
            reason: 'review-event-count-exceeds-card-reps',
            reviewEventCount: 2,
            cardReps: 1,
          }),
        ],
        plannedMutations: [
          expect.objectContaining({
            after: expect.objectContaining({ reps: 2 }),
          }),
        ],
      });
  });

  it('reports missing scheduler evidence as unrepairable without mutating card state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'preview-missing-scheduler-card',
      blockId: 'preview-missing-scheduler-block',
      reps: 0,
      lastReview: 1_700_001_400_000,
      updatedAt: 1_700_001_400_000,
    })]);
    await seedReviewEvent(database, {
      id: 'preview-missing-scheduler-review',
      cardId: 'preview-missing-scheduler-card',
      reviewedAt: 1_700_001_500_000,
    });
    await database.runTransaction('seed.missing-scheduler-evidence', (db) => {
      db.run(
        `UPDATE cards
         SET stability = NULL
         WHERE id = ?`,
        ['preview-missing-scheduler-card'],
      );
    });

    const preview = await database.previewDomainSyncRepair({
      cardIds: ['preview-missing-scheduler-card'],
      includeUnrepairable: true,
    }, 1_700_001_500_001);

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'divergent',
        repairableDivergenceCount: 0,
        divergentCardCount: 1,
      },
      repair: {
        available: false,
        repairableDivergenceCount: 0,
      },
    });

    expect(preview).toMatchObject({
      status: 'unrepairable',
      evidence: [
        expect.objectContaining({
          cardId: 'preview-missing-scheduler-card',
          reason: 'missing-scheduler-evidence',
        }),
      ],
      plannedMutations: [],
      unrepairableReasons: [
        { cardId: 'preview-missing-scheduler-card', reason: 'missing-scheduler-evidence' },
      ],
    });
    await expect(database.getCard('preview-missing-scheduler-card')).resolves.toMatchObject({
      reps: 0,
      lastReview: 1_700_001_400_000,
    });
  });

  it('scopes and truncates domain sync repair preview results', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([
      buildCard({
        id: 'preview-scope-a',
        blockId: 'preview-scope-block-a',
        reps: 0,
        lastReview: 1_700_001_600_000,
        updatedAt: 1_700_001_600_000,
      }),
      buildCard({
        id: 'preview-scope-b',
        blockId: 'preview-scope-block-b',
        reps: 0,
        lastReview: 1_700_001_600_000,
        updatedAt: 1_700_001_600_000,
      }),
      buildCard({
        id: 'preview-scope-c',
        blockId: 'preview-scope-block-c',
        reps: 0,
        lastReview: 1_700_001_600_000,
        updatedAt: 1_700_001_600_000,
      }),
    ]);
    for (const cardId of ['preview-scope-a', 'preview-scope-b', 'preview-scope-c']) {
      await seedReviewEvent(database, {
        id: `${cardId}-review`,
        cardId,
        reviewedAt: 1_700_001_700_000,
      });
    }

    const scoped = await database.previewDomainSyncRepair({
      cardIds: ['preview-scope-b'],
      limit: 10,
    }, 1_700_001_700_001);
    const truncated = await database.previewDomainSyncRepair({ limit: 2 }, 1_700_001_700_002);

    expect(scoped.evidence.map((item) => item.cardId)).toEqual(['preview-scope-b']);
    expect(truncated).toMatchObject({
      status: 'preview',
      truncated: true,
      limit: 2,
      affectedCardCount: 2,
    });
    expect(truncated.evidence).toHaveLength(2);
    expect(truncated.plannedMutations).toHaveLength(2);
  });

  it('exposes domain sync repair preview through backend RPC', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'preview-rpc-card',
      blockId: 'preview-rpc-block',
      reps: 0,
      lastReview: 1_700_001_800_000,
      updatedAt: 1_700_001_800_000,
    })]);
    await seedReviewEvent(database, {
      id: 'preview-rpc-review',
      cardId: 'preview-rpc-card',
      reviewedAt: 1_700_001_900_000,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      jsonrpc: '2.0',
      id: 5101,
      method: 'domainSync.repair.preview',
      params: [{ cardIds: ['preview-rpc-card'], limit: 10 }],
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 5101,
      result: {
        ok: true,
        status: 'preview',
        evidence: [
          expect.objectContaining({
            cardId: 'preview-rpc-card',
          }),
        ],
      },
    });
  });

  it('applies a domain sync repair plan once and records audit/projection effects', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'apply-repair-card',
      blockId: 'apply-repair-block',
      reps: 0,
      lastReview: 1_700_002_000_000,
      updatedAt: 1_700_002_000_000,
    })]);
    await seedQueueProjection(database, {
      rows: [buildCard({ id: 'apply-repair-card', blockId: 'apply-repair-block' })],
      updatedAt: 1_700_002_000_000,
    });
    await seedReviewEvent(database, {
      id: 'apply-repair-review',
      cardId: 'apply-repair-card',
      reviewedAt: 1_700_002_100_000,
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: ['apply-repair-card'] }, 1_700_002_100_001);

    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'apply-repair-key',
      confirmedAt: 1_700_002_100_002,
      confirmedBy: 'test',
    }, 1_700_002_100_003);
    const duplicate = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'apply-repair-key',
      confirmedAt: 1_700_002_100_004,
    }, 1_700_002_100_005);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
      invalidatedQueueProjections: 6,
    });
    expect(duplicate).toMatchObject({
      ok: true,
      status: 'duplicate',
      appliedCards: 1,
      skippedCards: 0,
    });
    await expect(database.getCard('apply-repair-card')).resolves.toMatchObject({
      reps: 1,
      lastReview: 1_700_002_100_000,
      updatedAt: 1_700_002_100_003,
    });
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_type = ?
         AND entity_id = ?`,
      ['repair-applied', 'apply-repair-card'],
    )?.count).toBe(1);
    expect(database.getOne<{ status: string; apply_idempotency_key: string }>(
      `SELECT status, apply_idempotency_key
       FROM domain_sync_repair_plans
       WHERE plan_id = ?`,
      [preview.planId],
    )).toMatchObject({
      status: 'applied',
      apply_idempotency_key: 'apply-repair-key',
    });
    expect(database.getOne<{ status: string }>(
      `SELECT status
       FROM queue_projection_generations
       WHERE queue_type = ?`,
      ['retrieval-practice'],
    )).toMatchObject({ status: 'invalidated' });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('repairs full scheduling state from the newest formal review event', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'apply-full-schedule-repair-card';
    await database.upsertCards([buildCard({
      id: cardId,
      blockId: 'apply-full-schedule-repair-block',
      due: 1_700_002_000_000,
      stability: 0,
      difficulty: 1,
      reps: 3,
      lapses: 0,
      state: CardState.Relearning,
      lastReview: 1_700_002_000_000,
      elapsedDays: 0,
      scheduledDays: 0,
      learning_step: 0,
      updatedAt: 1_700_002_000_000,
      schedulerType: 'fsrs-v6',
    })]);
    await seedReviewEvent(database, {
      id: 'apply-full-schedule-repair-review',
      cardId,
      reviewedAt: 1_700_002_100_000,
      payload: {
        schemaVersion: 2,
        id: 'apply-full-schedule-repair-review',
        attemptId: 'attempt-full-schedule-repair',
        cardId,
        rating: 3,
        reviewedAt: 1_700_002_100_000,
        algorithm: 'fsrs-v6',
        schedulerType: 'fsrs-v6',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        before: {
          id: cardId,
          due: 1_700_002_000_000,
          stability: 0,
          difficulty: 1,
          reps: 3,
          lapses: 0,
          state: CardState.Relearning,
          lastReview: 1_700_002_000_000,
          elapsedDays: 0,
          scheduledDays: 0,
          priority: 19,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
        after: {
          id: cardId,
          due: 1_700_002_700_000,
          stability: 2.3,
          difficulty: 2.1,
          reps: 4,
          lapses: 0,
          state: CardState.Learning,
          lastReview: 1_700_002_100_000,
          elapsedDays: 0,
          scheduledDays: 0,
          learning_step: 1,
          priority: 19,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
        isDrill: false,
        isFiltered: false,
        customStudy: false,
      },
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: [cardId] }, 1_700_002_100_001);

    expect(preview.plannedMutations).toEqual([
      expect.objectContaining({
        cardId,
        after: expect.objectContaining({
          due: 1_700_002_700_000,
          stability: 2.3,
          difficulty: 2.1,
          reps: 4,
          state: CardState.Learning,
          lastReview: 1_700_002_100_000,
          scheduledDays: 0,
          learning_step: 1,
          schedulerType: 'fsrs-v6',
        }),
      }),
    ]);

    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'apply-full-schedule-repair-key',
      confirmedAt: 1_700_002_100_002,
      confirmedBy: 'test',
    }, 1_700_002_100_003);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
    });
    await expect(database.getCard(cardId)).resolves.toMatchObject({
      due: 1_700_002_700_000,
      stability: 2.3,
      difficulty: 2.1,
      reps: 4,
      state: CardState.Learning,
      lastReview: 1_700_002_100_000,
      scheduledDays: 0,
      learning_step: 1,
      updatedAt: 1_700_002_100_003,
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('does not keep repairable divergence only because elapsedDays advanced after review', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'apply-elapsed-days-repair-card';
    const reviewedAt = 1_700_002_100_000;
    await database.upsertCards([buildCard({
      id: cardId,
      blockId: 'apply-elapsed-days-repair-block',
      due: reviewedAt + 86_400_000,
      stability: 1,
      difficulty: 5,
      reps: 3,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 1,
      updatedAt: reviewedAt,
      schedulerType: 'fsrs-v6',
    })]);
    await seedReviewEvent(database, {
      id: 'apply-elapsed-days-repair-review',
      cardId,
      reviewedAt,
      payload: {
        schemaVersion: 2,
        id: 'apply-elapsed-days-repair-review',
        cardId,
        rating: 3,
        reviewedAt,
        schedulerType: 'fsrs-v6',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        after: {
          id: cardId,
          due: reviewedAt + 10 * 86_400_000,
          stability: 10,
          difficulty: 4.2,
          reps: 4,
          lapses: 0,
          state: CardState.Review,
          lastReview: reviewedAt,
          elapsedDays: 0,
          scheduledDays: 10,
          learning_step: 0,
          schedulerType: 'fsrs-v6',
        },
      },
    });

    const preview = await database.previewDomainSyncRepair({ cardIds: [cardId] }, reviewedAt + 1);
    expect(preview.plannedMutations).toHaveLength(1);
    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'apply-elapsed-days-repair-key',
      confirmedAt: reviewedAt + 2,
      confirmedBy: 'test',
    }, reviewedAt + 20 * 86_400_000);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
    });
    const repaired = await database.getCard(cardId);
    expect(repaired).toMatchObject({
      due: reviewedAt + 10 * 86_400_000,
      stability: 10,
      difficulty: 4.2,
      reps: 4,
      state: CardState.Review,
      lastReview: reviewedAt,
      scheduledDays: 10,
      learning_step: 0,
    });
    expect(repaired?.elapsedDays).toBe(0);
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('does not keep repairable divergence when review after snapshot omits learning_step', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'apply-no-learning-step-repair-card';
    const reviewedAt = 1_700_002_100_000;
    await database.upsertCards([{
      ...buildCard({
        id: cardId,
        blockId: 'apply-no-learning-step-repair-block',
        due: reviewedAt + 86_400_000,
        stability: 1,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        state: CardState.Review,
        lastReview: reviewedAt - 86_400_000,
        elapsedDays: 1,
        scheduledDays: 1,
        updatedAt: reviewedAt,
      }),
      learning_step: 0,
      schedulerType: 'fsrs-v6',
    }]);
    await seedReviewEvent(database, {
      id: 'apply-no-learning-step-repair-review',
      cardId,
      reviewedAt,
      payload: {
        schemaVersion: 2,
        id: 'apply-no-learning-step-repair-review',
        cardId,
        rating: 3,
        reviewedAt,
        schedulerType: 'fsrs-v6',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        after: {
          id: cardId,
          due: reviewedAt + 10 * 86_400_000,
          stability: 10,
          difficulty: 4.2,
          reps: 4,
          lapses: 0,
          state: CardState.Review,
          lastReview: reviewedAt,
          elapsedDays: 0,
          scheduledDays: 10,
          schedulerType: 'fsrs-v6',
        },
      },
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: [cardId] }, reviewedAt + 1);
    expect(preview.plannedMutations).toHaveLength(1);

    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'apply-no-learning-step-repair-key',
      confirmedAt: reviewedAt + 2,
      confirmedBy: 'test',
    }, reviewedAt + 3);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('does not keep repairable divergence when storage canonicalizes a mature learning after snapshot', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'apply-mature-learning-repair-card';
    const reviewedAt = 1_700_002_100_000;
    await database.upsertCards([buildCard({
      id: cardId,
      blockId: 'apply-mature-learning-repair-block',
      due: reviewedAt + 86_400_000,
      stability: 1,
      difficulty: 5,
      reps: 3,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 1,
      updatedAt: reviewedAt,
      schedulerType: 'fsrs-v6',
    })]);
    await seedReviewEvent(database, {
      id: 'apply-mature-learning-repair-review',
      cardId,
      reviewedAt,
      payload: {
        schemaVersion: 2,
        id: 'apply-mature-learning-repair-review',
        cardId,
        rating: 3,
        reviewedAt,
        schedulerType: 'fsrs-v6',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        after: {
          id: cardId,
          due: reviewedAt + 10 * 86_400_000,
          stability: 10,
          difficulty: 4.2,
          reps: 4,
          lapses: 0,
          state: CardState.Learning,
          lastReview: reviewedAt,
          elapsedDays: 0,
          scheduledDays: 10,
          learning_step: 1,
          priority: 19,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
      },
    });

    const preview = await database.previewDomainSyncRepair({ cardIds: [cardId] }, reviewedAt + 1);
    expect(preview.plannedMutations).toEqual([
      expect.objectContaining({
        cardId,
        after: expect.objectContaining({
          state: CardState.Review,
          learning_step: 0,
        }),
      }),
    ]);
    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'apply-mature-learning-repair-key',
      confirmedAt: reviewedAt + 2,
      confirmedBy: 'test',
    }, reviewedAt + 3);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('records a repair-applied ledger operation for every repaired card in one plan', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([
      buildCard({
        id: 'multi-repair-card-a',
        blockId: 'multi-repair-block-a',
        reps: 0,
        lastReview: 1_700_002_000_000,
        updatedAt: 1_700_002_000_000,
      }),
      buildCard({
        id: 'multi-repair-card-b',
        blockId: 'multi-repair-block-b',
        reps: 0,
        lastReview: 1_700_002_000_000,
        updatedAt: 1_700_002_000_000,
      }),
    ]);
    await seedReviewEvent(database, {
      id: 'multi-repair-review-a',
      cardId: 'multi-repair-card-a',
      reviewedAt: 1_700_002_100_000,
    });
    await seedReviewEvent(database, {
      id: 'multi-repair-review-b',
      cardId: 'multi-repair-card-b',
      reviewedAt: 1_700_002_100_000,
    });
    const preview = await database.previewDomainSyncRepair({ limit: 10 }, 1_700_002_100_001);

    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'multi-repair-key',
      confirmedAt: 1_700_002_100_002,
      confirmedBy: 'test',
    }, 1_700_002_100_003);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 2,
      skippedCards: 0,
    });
    const rows = database.getAll<{ entity_id: string; idempotency_key: string }>(
      `SELECT entity_id, idempotency_key
       FROM domain_sync_operations
       WHERE operation_type = ?
       ORDER BY entity_id ASC`,
      ['repair-applied'],
    );
    expect(rows).toEqual([
      { entity_id: 'multi-repair-card-a', idempotency_key: 'multi-repair-key:multi-repair-card-a' },
      { entity_id: 'multi-repair-card-b', idempotency_key: 'multi-repair-key:multi-repair-card-b' },
    ]);
  });

  it('keeps domain sync repair durable against later stale persisted main DB merge', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'durable-repair-card';
    await database.upsertCards([buildCard({
      id: cardId,
      blockId: 'durable-repair-block',
      reps: 0,
      lastReview: 1_700_002_200_000,
      updatedAt: 1_700_002_200_000,
    })]);
    await seedReviewEvent(database, {
      id: 'durable-repair-review',
      cardId,
      reviewedAt: 1_700_002_300_000,
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: [cardId] }, 1_700_002_300_001);

    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'durable-repair-key',
      confirmedAt: 1_700_002_300_002,
      confirmedBy: 'test',
    }, 1_700_002_300_003);
    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
    });
    await database.persist();

    const externalBridge = createInMemorySqlitePersistenceBridge();
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await externalDatabase.upsertCards([buildCard({
      id: cardId,
      blockId: 'durable-repair-block',
      reps: 0,
      lastReview: 1_700_002_300_000,
      updatedAt: 1_700_002_300_100,
    })]);
    await externalDatabase.persist();
    const externalBytes = await externalBridge.readBinary('siyuanmemo.db');
    expect(externalBytes).toBeTruthy();
    await persistenceBridge.writeBinary('siyuanmemo.db', externalBytes!);

    const merge = await database.mergeExternalDatabaseIfChanged(1_700_002_300_200);

    expect(merge).toMatchObject({
      ok: true,
      mergedCards: 0,
    });
    await expect(database.getCard(cardId)).resolves.toMatchObject({
      reps: 1,
      lastReview: 1_700_002_300_000,
      updatedAt: 1_700_002_300_003,
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('keeps applied domain sync repair clean after worker restart without explicit persist call', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardId = 'restart-repair-card';
    await database.upsertCards([buildCard({
      id: cardId,
      blockId: 'restart-repair-block',
      reps: 0,
      lastReview: 1_700_002_400_000,
      updatedAt: 1_700_002_400_000,
    })]);
    await seedReviewEvent(database, {
      id: 'restart-repair-review',
      cardId,
      reviewedAt: 1_700_002_500_000,
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: [cardId] }, 1_700_002_500_001);

    await expect(database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'restart-repair-key',
      confirmedAt: 1_700_002_500_002,
      confirmedBy: 'test',
    }, 1_700_002_500_003)).resolves.toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
    });

    const restartedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    await expect(restartedDatabase.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
    await expect(restartedDatabase.getCard(cardId)).resolves.toMatchObject({
      reps: 1,
      lastReview: 1_700_002_500_000,
    });
  });

  it('does not leave unapplyable review snapshots counted as repairable after applying available repairs', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const repairableCardId = 'mixed-repair-applyable-card';
    const unapplyableCardId = 'mixed-repair-unapplyable-card';
    await database.upsertCards([
      buildCard({
        id: repairableCardId,
        blockId: 'mixed-repair-applyable-block',
        reps: 0,
        lastReview: 1_700_002_600_000,
        updatedAt: 1_700_002_600_000,
      }),
      buildCard({
        id: unapplyableCardId,
        blockId: 'mixed-repair-unapplyable-block',
        reps: 0,
        lastReview: 1_700_002_600_000,
        updatedAt: 1_700_002_600_000,
      }),
    ]);
    await seedReviewEvent(database, {
      id: 'mixed-repair-applyable-review',
      cardId: repairableCardId,
      reviewedAt: 1_700_002_700_000,
    });
    await seedReviewEvent(database, {
      id: 'mixed-repair-unapplyable-review',
      cardId: unapplyableCardId,
      reviewedAt: 1_700_002_700_000,
      payload: {
        cardId: unapplyableCardId,
        after: {
          id: unapplyableCardId,
          lastReview: 1_700_002_700_000,
          reps: 1,
        },
      },
    });

    const preview = await database.previewDomainSyncRepair({ limit: 10, includeUnrepairable: true }, 1_700_002_700_001);

    expect(preview).toMatchObject({
      status: 'preview',
      affectedCardCount: 2,
      plannedMutations: [
        expect.objectContaining({ cardId: repairableCardId }),
      ],
      unrepairableReasons: [
        { cardId: unapplyableCardId, reason: 'missing-scheduler-evidence' },
      ],
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'repairable',
        repairableDivergenceCount: 1,
        unrepairableDivergenceCount: 1,
      },
      repair: {
        available: true,
        repairableDivergenceCount: 1,
      },
    });

    await expect(database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'mixed-repair-key',
      confirmedAt: 1_700_002_700_002,
      confirmedBy: 'test',
    }, 1_700_002_700_003)).resolves.toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'divergent',
        repairableDivergenceCount: 0,
        unrepairableDivergenceCount: 1,
      },
      repair: {
        available: false,
        repairableDivergenceCount: 0,
      },
    });
  });

  it('applies repairable card mutations even when skipped sync sources keep diagnostics in source-error', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'source-error-repair-card',
      blockId: 'source-error-repair-block',
      reps: 0,
      lastReview: 1_700_002_110_000,
      updatedAt: 1_700_002_110_000,
    })]);
    await seedReviewEvent(database, {
      id: 'source-error-repair-review',
      cardId: 'source-error-repair-card',
      reviewedAt: 1_700_002_120_000,
    });
    await database.runTransaction('seed.source-error.repair-skipped-source', (db) => {
      db.run(
        `INSERT INTO domain_sync_processed_sources
          (source_id, source_fingerprint, source_kind, path, processed_at,
           imported_operations, ignored_operations, imported_review_events, ignored_review_events,
           imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['source-error-repair-skipped', 'fp-source-error-repair-skipped', 'siyuan-conflict-db', '/conflicts/source-error-repair-skipped.db', 1, 0, 0, 0, 0, 0, 0, 'parse-error', 'source-error', '{}'],
      );
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'source-error',
        skippedSourceCount: 1,
        repairableDivergenceCount: 1,
      },
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: ['source-error-repair-card'] }, 1_700_002_120_001);

    const applied = await database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'source-error-repair-key',
      confirmedAt: 1_700_002_120_002,
      confirmedBy: 'test',
    }, 1_700_002_120_003);

    expect(applied).toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
      skippedCards: 0,
    });
    await expect(database.getCard('source-error-repair-card')).resolves.toMatchObject({
      reps: 1,
      lastReview: 1_700_002_120_000,
    });
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'source-error',
        skippedSourceCount: 1,
        repairableDivergenceCount: 0,
      },
    });
  });

  it('rejects stale domain sync repair plans when card state changes after preview', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'stale-repair-card',
      blockId: 'stale-repair-block',
      reps: 0,
      lastReview: 1_700_002_200_000,
      updatedAt: 1_700_002_200_000,
    })]);
    await seedReviewEvent(database, {
      id: 'stale-repair-review',
      cardId: 'stale-repair-card',
      reviewedAt: 1_700_002_300_000,
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: ['stale-repair-card'] }, 1_700_002_300_001);
    await database.upsertCards([buildCard({
      id: 'stale-repair-card',
      blockId: 'stale-repair-block',
      reps: 0,
      lastReview: 1_700_002_250_000,
      updatedAt: 1_700_002_250_000,
    })]);

    await expect(database.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'stale-repair-key',
      confirmedAt: 1_700_002_300_002,
    }, 1_700_002_300_003)).resolves.toMatchObject({
      ok: false,
      status: 'stale-plan',
    });
    await expect(database.getCard('stale-repair-card')).resolves.toMatchObject({
      lastReview: 1_700_002_250_000,
    });
  });

  it('exposes domain sync repair apply through backend RPC', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({
      id: 'apply-rpc-card',
      blockId: 'apply-rpc-block',
      reps: 0,
      lastReview: 1_700_002_400_000,
      updatedAt: 1_700_002_400_000,
    })]);
    await seedReviewEvent(database, {
      id: 'apply-rpc-review',
      cardId: 'apply-rpc-card',
      reviewedAt: 1_700_002_500_000,
    });
    const preview = await database.previewDomainSyncRepair({ cardIds: ['apply-rpc-card'] }, 1_700_002_500_001);
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      jsonrpc: '2.0',
      id: 6101,
      method: 'domainSync.repair.apply',
      params: [{
        planId: preview.planId,
        idempotencyKey: 'apply-rpc-key',
        confirmedAt: 1_700_002_500_002,
      }],
    });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 6101,
      result: {
        ok: true,
        status: 'applied',
        planId: preview.planId,
        idempotencyKey: 'apply-rpc-key',
        appliedCards: 1,
      },
    });
  });

  it('reports divergent domain sync sanity when review ledger evidence lacks a review event', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedDomainSyncOperation(database, {
      operationId: 'domain-sync-divergent-ledger-1',
      operationType: 'review-committed',
      entityId: 'divergent-ledger-card',
      reviewEventId: 'missing-review-event',
      idempotencyKey: 'review:missing-review-event',
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'divergent',
        divergentCardCount: 1,
      },
    });
  });

  it('reports needs-direction domain sync sanity for unsupported imported mutation classes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedDomainSyncOperation(database, {
      operationId: 'domain-sync-needs-direction-1',
      operationType: 'card-upserted',
      entityId: 'needs-direction-card',
      entityBlockId: 'needs-direction-block',
      idempotencyKey: 'card-upserted:needs-direction-card',
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'needs-direction',
        reasonCounts: { 'needs-direction': 1 },
      },
    });
  });

  it('reports source-error domain sync sanity for skipped sync sources', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.mergeSyncConflictDatabases({
      mergedAt: 1_700_001_200_000,
      sources: [{ sourceId: 'source-error-bytes', bytes: new Uint8Array() }],
    });

    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      processedSources: { totalProcessed: 0, totalSkipped: 1 },
      sanity: {
        status: 'source-error',
        reasonCounts: { 'source-error': 1 },
      },
    });
  });

  it('forgets stale unknown skipped conflict sources when the host no longer reports that conflict copy', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    persistenceBridge.readSyncConflictDatabaseSources = vi.fn(async () => []);
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.runTransaction('seed.stale-unknown-skipped-conflict-source', (db) => {
      db.run(
        `INSERT INTO domain_sync_processed_sources
          (source_id, source_fingerprint, source_kind, path, processed_at,
           imported_operations, ignored_operations, imported_review_events, ignored_review_events,
           imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'siyuan-sync-conflict:2026-05-21-044935:/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
          'stale-fp',
          'unknown',
          null,
          1_700_001_210_000,
          0,
          0,
          0,
          0,
          0,
          0,
          'unknown',
          'source-error',
          JSON.stringify({ error: 'no such table: review_events' }),
        ],
      );
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE skipped_reason IS NOT NULL',
    )?.count).toBe(1);
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'trigger-stale-source-cleanup',
      jsonrpc: '2.0',
      method: 'domainSync.status',
      params: [],
    });

    expect(response).toMatchObject({
      result: {
        sanity: { status: 'clean' },
        processedSources: { totalSkipped: 0 },
      },
    });

    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE skipped_reason IS NOT NULL',
    )?.count).toBe(0);
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: { status: 'clean' },
      processedSources: { totalSkipped: 0 },
    });
  });

  it('records domain sync import counts in pre-request merge diagnostics', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedDomainSyncOperation(conflictDatabase, {
      operationId: 'domain-sync-pre-request-diagnostics-1',
      operationType: 'card-deleted',
      entityId: 'pre-request-domain-sync-card',
      entityBlockId: 'pre-request-domain-sync-block',
      idempotencyKey: 'card-delete:pre-request-domain-sync-card:1700001300000',
    });
    await conflictDatabase.persist();
    const conflictBytes = await conflictBridge.readBinary('siyuanmemo.db');
    expect(conflictBytes).toBeTruthy();
    const bridgeWithConflict = {
      ...currentBridge,
      async readSyncConflictDatabaseSources() {
        return [{ sourceId: 'pre-request-domain-sync-source', bytes: conflictBytes! }];
      },
    };
    const database = new WorkerSqliteDatabaseService(bridgeWithConflict);
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'trigger-domain-sync-pre-request',
      jsonrpc: '2.0',
      method: 'browser.count',
      params: [{ query: {} }],
    });
    const diagnostics = await kernel.handle({
      id: 'read-domain-sync-pre-request',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });

    expect(diagnostics).toMatchObject({
      result: {
        preRequestMerge: {
          latest: {
            method: 'browser.count',
            sourceIds: ['pre-request-domain-sync-source'],
            importedOperations: 1,
            ignoredOperations: 0,
            processedSourceIds: ['pre-request-domain-sync-source'],
            sanityStatus: 'merged',
          },
        },
      },
    });
  });

  it('invalidates queue projections when synced conflict merge changes cards', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const mergedAt = 1_779_219_500_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-projection-stale',
        blockId: 'block-projection-stale',
        due: mergedAt + 86_400_000,
        reps: 0,
        lastReview: 0,
        updatedAt: mergedAt - 10_000,
      }),
    ]);
    await seedQueueProjection(currentDatabase, {
      queueType: 'incremental-learning',
      generation: 3,
      rows: [],
      updatedAt: mergedAt - 5_000,
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-projection-stale',
        blockId: 'block-projection-stale',
        due: mergedAt - 1_000,
        reps: 1,
        lastReview: mergedAt,
        updatedAt: mergedAt,
      }),
    ]);
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-conflict-invalidates-projection',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt,
        sources: [{ sourceId: 'projection-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        mergedCards: 1,
      }),
    }));
    expect(currentDatabase.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      ['incremental-learning'],
    )).toMatchObject({
      status: 'invalidated',
      rebuild_reason: 'sync-conflict-merge',
    });
  });

  it('imports synced missing-source projection when merging conflict cards', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const checkedAt = 1_779_264_500_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-source-missing',
        blockId: '20260520005027-wqloxxq',
        due: checkedAt - 1_000,
        reps: 0,
        lastReview: 0,
        updatedAt: checkedAt - 10_000,
      }),
    ]);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-source-missing',
        blockId: '20260520005027-wqloxxq',
        due: checkedAt - 1_000,
        reps: 1,
        lastReview: checkedAt,
        updatedAt: checkedAt,
      }),
    ]);
    await conflictDatabase.runTransaction('seed.source-missing', (db) => {
      db.run(
        `UPDATE cards
         SET source_exists = 0, source_checked_at = ?, source_missing_at = ?
         WHERE id = ?`,
        [checkedAt + 1, checkedAt + 1, 'card-source-missing'],
      );
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-conflict-source-missing',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: checkedAt + 2,
        sources: [{ sourceId: 'source-missing-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        mergedCards: 1,
      }),
    }));
    expect(currentDatabase.getOne<{
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT source_exists, source_checked_at, source_missing_at FROM cards WHERE id = ?',
      ['card-source-missing'],
    )).toEqual({
      source_exists: 0,
      source_checked_at: checkedAt + 1,
      source_missing_at: checkedAt + 1,
    });
  });

  it('imports missing-source projection without regressing stale incoming scheduling state', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const checkedAt = 1_779_264_700_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-stale-scheduler-source-missing',
        blockId: '20260520005027-source-stale',
        due: checkedAt + 20 * 86_400_000,
        reps: 7,
        lastReview: checkedAt,
        updatedAt: checkedAt,
      }),
    ]);
    await seedFormalReviewHistory(currentDatabase, {
      cardId: 'card-stale-scheduler-source-missing',
      count: 7,
      firstReviewedAt: checkedAt - 7_000,
      latestReviewedAt: checkedAt,
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-stale-scheduler-source-missing',
        blockId: '20260520005027-source-stale',
        due: checkedAt + 60_000,
        reps: 1,
        lastReview: checkedAt,
        updatedAt: checkedAt + 10_000,
      }),
    ]);
    await conflictDatabase.runTransaction('seed.stale-source-missing', (db) => {
      db.run(
        `UPDATE cards
         SET source_exists = 0, source_checked_at = ?, source_missing_at = ?
         WHERE id = ?`,
        [checkedAt + 20_000, checkedAt + 20_000, 'card-stale-scheduler-source-missing'],
      );
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-conflict-stale-scheduler-source-missing',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: checkedAt + 30_000,
        sources: [{ sourceId: 'stale-scheduler-source-missing-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        mergedCards: 0,
        ignoredCards: 1,
      }),
    }));
    await expect(currentDatabase.getCard('card-stale-scheduler-source-missing')).resolves.toMatchObject({
      reps: 7,
      lastReview: checkedAt,
      due: checkedAt + 20 * 86_400_000,
    });
    expect(currentDatabase.getOne<{
      source_exists: number | null;
      source_checked_at: number | null;
      source_missing_at: number | null;
    }>(
      'SELECT source_exists, source_checked_at, source_missing_at FROM cards WHERE id = ?',
      ['card-stale-scheduler-source-missing'],
    )).toEqual({
      source_exists: 0,
      source_checked_at: checkedAt + 20_000,
      source_missing_at: checkedAt + 20_000,
    });
  });

  it('does not rewrite equal missing-source projection while merging ignored conflict cards', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const checkedAt = 1_779_264_900_000;
    const card = buildCard({
      id: 'card-source-missing-noop',
      blockId: '20260520005027-source-noop',
      due: checkedAt + 20 * 86_400_000,
      reps: 7,
      lastReview: checkedAt,
      updatedAt: checkedAt,
    });
    await currentDatabase.upsertCards([card]);
    await seedFormalReviewHistory(currentDatabase, {
      cardId: card.id,
      count: 7,
      firstReviewedAt: checkedAt - 7_000,
      latestReviewedAt: checkedAt,
    });
    await currentDatabase.runTransaction('seed.current-source-missing-noop', (db) => {
      db.run(
        `UPDATE cards
         SET source_exists = 0, source_checked_at = ?, source_missing_at = ?
         WHERE id = ?`,
        [checkedAt + 20_000, checkedAt + 20_000, card.id],
      );
    });
    await seedQueueProjection(currentDatabase, {
      queueType: 'retrieval-practice',
      generation: 23,
      rows: [card],
      updatedAt: checkedAt,
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([{
      ...card,
      due: checkedAt + 60_000,
      reps: 1,
      updatedAt: checkedAt + 10_000,
    }]);
    await conflictDatabase.runTransaction('seed.conflict-source-missing-noop', (db) => {
      db.run(
        `UPDATE cards
         SET source_exists = 0, source_checked_at = ?, source_missing_at = ?
         WHERE id = ?`,
        [checkedAt + 20_000, checkedAt + 20_000, card.id],
      );
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();
    const beforeMetadata = currentDatabase.getOne<{ value_json: string; updated_at: number }>(
      'SELECT value_json, updated_at FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );
    const beforeProjection = currentDatabase.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      ['retrieval-practice'],
    );

    const result = await currentDatabase.mergeSyncConflictDatabases({
      mergedAt: checkedAt + 30_000,
      sources: [{ sourceId: 'noop-source-missing-conflict-db', bytes: conflictBytes! }],
    });

    expect(result).toMatchObject({
      ok: true,
      sources: 1,
      mergedCards: 0,
      ignoredCards: 1,
    });
    expect(currentDatabase.getOne<{ value_json: string; updated_at: number }>(
      'SELECT value_json, updated_at FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    )).toEqual(beforeMetadata);
    expect(currentDatabase.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      ['retrieval-practice'],
    )).toEqual(beforeProjection);
  });

  it('records source-existence-updated domain sync operations when sweep marks cards missing', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });
    const checkedAt = 1_779_401_000_000;
    await database.upsertCards([
      buildCard({
        id: 'card-source-ledger-missing',
        blockId: 'block-source-ledger-missing',
        due: checkedAt - 1_000,
        updatedAt: checkedAt - 10_000,
      }),
    ]);
    await seedQueueProjection(database, {
      rows: [buildCard({
        id: 'card-source-ledger-missing',
        blockId: 'block-source-ledger-missing',
        due: checkedAt - 1_000,
      })],
      updatedAt: checkedAt - 1,
    });

    const first = await kernel.handle({
      id: 'source-existence-ledger-first',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweep',
      params: [{
        request: { blockIds: ['block-source-ledger-missing'], force: true },
        existingBlockIds: [],
        checkedAt,
      }],
    });
    const retry = await kernel.handle({
      id: 'source-existence-ledger-retry',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweep',
      params: [{
        request: { blockIds: ['block-source-ledger-missing'], force: true },
        existingBlockIds: [],
        checkedAt,
      }],
    });

    expect(first).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        checked: 1,
        updated: 1,
        changed: true,
        changedToMissing: true,
        changedBlockIds: ['block-source-ledger-missing'],
      }),
    }));
    expect(retry).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      }),
    }));
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['source-existence-updated', 'card-source-ledger-missing'],
    )?.count).toBe(1);
    const ledgerRow = database.getOne<{
      operation_type: string;
      entity_id: string;
      entity_block_id: string | null;
      idempotency_key: string | null;
      payload_fingerprint: string;
      payload_json: string;
    }>(
      `SELECT operation_type, entity_id, entity_block_id, idempotency_key, payload_fingerprint, payload_json
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['source-existence-updated', 'card-source-ledger-missing'],
    );
    expect(ledgerRow).toMatchObject({
      operation_type: 'source-existence-updated',
      entity_id: 'card-source-ledger-missing',
      entity_block_id: 'block-source-ledger-missing',
      idempotency_key: 'source-existence:card-source-ledger-missing:block-source-ledger-missing:1779401000000:missing',
    });
    expect(ledgerRow?.payload_fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.parse(ledgerRow?.payload_json || '{}')).toMatchObject({
      cardId: 'card-source-ledger-missing',
      blockId: 'block-source-ledger-missing',
      previousExists: null,
      exists: false,
      checkedAt,
      missingAt: checkedAt,
    });
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM queue_projection_generations
       WHERE queue_type = ? AND status = ? AND rebuild_reason = ?`,
      ['retrieval-practice', 'invalidated', 'source-existence-changed'],
    )?.count).toBe(1);
  });

  it('conservatively backfills existing formal reviews and card tombstones into domain sync ledger', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_402_000_000;
    await database.upsertCards([
      buildCard({
        id: 'card-backfill-review',
        blockId: 'block-backfill-review',
        lastReview: reviewedAt,
      }),
      buildCard({
        id: 'card-backfill-delete',
        blockId: 'block-backfill-delete',
      }),
    ]);
    await database.runTransaction('seed.domain-sync-backfill', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, commit_idempotency_key, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-backfill-formal',
          'card-backfill-review',
          'attempt-backfill-formal',
          4,
          reviewedAt,
          2026,
          5,
          null,
          'review-v2',
          '{}',
        ],
      );
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, commit_idempotency_key, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-backfill-nonformal',
          'card-backfill-review',
          'attempt-backfill-nonformal',
          3,
          reviewedAt + 1,
          2026,
          5,
          null,
          'drill',
          '{}',
        ],
      );
      db.run(
        `INSERT INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        ['card', 'card-backfill-delete', reviewedAt + 2, 'migration-test', '{}'],
      );
    });

    await database.reloadFromDisk();
    await database.reloadFromDisk();

    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['review-committed', 'card-backfill-review'],
    )?.count).toBe(1);
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['card-deleted', 'card-backfill-delete'],
    )?.count).toBe(1);
    expect(database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_operations
       WHERE review_event_id = ?`,
      ['review-backfill-nonformal'],
    )?.count).toBe(0);
    const reviewLedger = database.getOne<{
      source_id: string;
      review_event_id: string | null;
      entity_block_id: string | null;
      idempotency_key: string | null;
      payload_json: string;
    }>(
      `SELECT source_id, review_event_id, entity_block_id, idempotency_key, payload_json
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['review-committed', 'card-backfill-review'],
    );
    expect(reviewLedger).toMatchObject({
      source_id: 'migration:domain-sync-ledger:review-events',
      review_event_id: 'review-backfill-formal',
      entity_block_id: 'block-backfill-review',
      idempotency_key: null,
    });
    const reviewBackfillPayload = JSON.parse(reviewLedger?.payload_json || '{}');
    expect(reviewBackfillPayload).toMatchObject({
      migrationSource: 'existing-review-events',
      reviewEventId: 'review-backfill-formal',
      cardId: 'card-backfill-review',
      reviewEventFact: {
        cardId: 'card-backfill-review',
        classification: {
          kind: 'formal',
          formal: true,
          exclusionReasons: [],
        },
        dataQuality: {
          status: 'low-quality',
          reasons: expect.arrayContaining(['missing-before-state', 'missing-after-state']),
        },
      },
    });
    const tombstoneLedger = database.getOne<{
      source_id: string;
      entity_block_id: string | null;
      idempotency_key: string | null;
      payload_json: string;
    }>(
      `SELECT source_id, entity_block_id, idempotency_key, payload_json
       FROM domain_sync_operations
       WHERE operation_type = ? AND entity_id = ?`,
      ['card-deleted', 'card-backfill-delete'],
    );
    expect(tombstoneLedger).toMatchObject({
      source_id: 'migration:domain-sync-ledger:card-tombstones',
      entity_block_id: 'block-backfill-delete',
      idempotency_key: 'migration-card-delete:card-backfill-delete:1779402000002',
    });
    expect(JSON.parse(tombstoneLedger?.payload_json || '{}')).toMatchObject({
      migrationSource: 'existing-card-tombstones',
      cardId: 'card-backfill-delete',
      deletedBy: 'migration-test',
    });
  });

  it('ignores duplicate review events and stale cards when merging the same conflict database again', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const reviewedAt = 1_779_188_100_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-sync-idempotent',
        due: reviewedAt + 86_400_000,
        reps: 2,
        lastReview: reviewedAt,
        updatedAt: reviewedAt,
      }),
    ]);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-sync-idempotent',
        due: reviewedAt,
        reps: 1,
        lastReview: reviewedAt - 1_000,
        updatedAt: reviewedAt - 1_000,
      }),
    ]);
    await conflictDatabase.runTransaction('seed.duplicate-conflict-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-duplicate',
          'card-sync-idempotent',
          'attempt-duplicate',
          3,
          reviewedAt - 1_000,
          2026,
          5,
          'review',
          '{}',
        ],
      );
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();
    await currentDatabase.runTransaction('seed.existing-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-duplicate',
          'card-sync-idempotent',
          'attempt-duplicate',
          3,
          reviewedAt - 1_000,
          2026,
          5,
          'review',
          '{}',
        ],
      );
    });

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-duplicate-conflict-db',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: reviewedAt + 1,
        sources: [{ sourceId: 'duplicate-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual({
      id: 'merge-duplicate-conflict-db',
      jsonrpc: '2.0',
      result: {
        ok: true,
        sources: 1,
        mergedReviewEvents: 0,
        ignoredReviewEvents: 1,
        mergedCards: 0,
        ignoredCards: 1,
        skippedSources: [],
        diagnostics: {
          reviewCardDivergences: [],
        },
      },
    });
    expect(currentDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE id = ?',
      ['event-duplicate'],
    )?.count).toBe(1);
    const card = await currentDatabase.getCard('card-sync-idempotent');
    expect(card?.reps).toBe(2);
    expect(card?.lastReview).toBe(reviewedAt);
  });

  it('uses review-time, modification-time, reps, and local tie order when merging conflict cards', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const base = 1_779_188_500_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-newer-review',
        due: base + 86_400_000,
        reps: 4,
        lastReview: base,
        updatedAt: base + 10_000,
      }),
      buildCard({
        id: 'card-newer-updated',
        due: base + 86_400_000,
        reps: 3,
        lastReview: 0,
        updatedAt: base,
      }),
      buildCard({
        id: 'card-higher-reps',
        due: base + 86_400_000,
        reps: 3,
        lastReview: base,
        updatedAt: base,
      }),
      buildCard({
        id: 'card-full-tie',
        due: base + 86_400_000,
        reps: 3,
        lastReview: base,
        updatedAt: base,
      }),
    ]);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-newer-review',
        due: base + 2 * 86_400_000,
        reps: 2,
        lastReview: base + 1_000,
        updatedAt: base,
      }),
      buildCard({
        id: 'card-newer-updated',
        due: base + 3 * 86_400_000,
        reps: 1,
        lastReview: 0,
        updatedAt: base + 1_000,
      }),
      buildCard({
        id: 'card-higher-reps',
        due: base + 4 * 86_400_000,
        reps: 4,
        lastReview: base,
        updatedAt: base,
      }),
      buildCard({
        id: 'card-full-tie',
        due: base + 5 * 86_400_000,
        reps: 3,
        lastReview: base,
        updatedAt: base,
      }),
    ]);
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-card-freshness-policy',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: base + 2_000,
        sources: [{ sourceId: 'freshness-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        mergedCards: 3,
        ignoredCards: 1,
      }),
    }));
    await expect(currentDatabase.getCard('card-newer-review')).resolves.toMatchObject({
      due: base + 2 * 86_400_000,
      lastReview: base + 1_000,
      reps: 2,
    });
    await expect(currentDatabase.getCard('card-newer-updated')).resolves.toMatchObject({
      due: base + 3 * 86_400_000,
      updatedAt: base + 1_000,
      reps: 1,
    });
    await expect(currentDatabase.getCard('card-higher-reps')).resolves.toMatchObject({
      due: base + 4 * 86_400_000,
      reps: 4,
    });
    await expect(currentDatabase.getCard('card-full-tie')).resolves.toMatchObject({
      due: base + 86_400_000,
      reps: 3,
    });
  });

  it('does not invalidate queue projections when conflict merge only imports review events', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const reviewedAt = 1_779_188_600_000;
    await currentDatabase.upsertCards([buildCard({
      id: 'card-event-only',
      blockId: 'block-event-only',
      due: reviewedAt + 86_400_000,
      reps: 1,
      lastReview: reviewedAt - 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
    })]);
    await seedQueueProjection(currentDatabase, {
      queueType: 'retrieval-practice',
      generation: 7,
      rows: [buildCard({ id: 'card-event-only', blockId: 'block-event-only' })],
      updatedAt: reviewedAt - 1_000,
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedReviewEvent(conflictDatabase, {
      id: 'event-only-import',
      cardId: 'card-event-only',
      reviewedAt,
      eventType: 'review-v2',
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-event-only',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: reviewedAt + 1,
        sources: [{ sourceId: 'event-only-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        mergedReviewEvents: 1,
        mergedCards: 0,
      }),
    }));
    expect(currentDatabase.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      ['retrieval-practice'],
    )).toMatchObject({
      status: 'ready',
      rebuild_reason: null,
    });
  });

  it('reports review/card divergence diagnostics without repairing selected card state', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const localReviewAt = 1_779_188_700_000;
    const remoteReviewAt = localReviewAt + 60_000;
    await currentDatabase.upsertCards([buildCard({
      id: 'card-divergent-history',
      due: localReviewAt + 86_400_000,
      reps: 1,
      lastReview: localReviewAt,
      updatedAt: localReviewAt,
    })]);
    await seedReviewEvent(currentDatabase, {
      id: 'event-local-divergent',
      cardId: 'card-divergent-history',
      reviewedAt: localReviewAt,
      eventType: 'review-v2',
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await seedReviewEvent(conflictDatabase, {
      id: 'event-remote-divergent',
      cardId: 'card-divergent-history',
      reviewedAt: remoteReviewAt,
      eventType: 'review-v2',
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'merge-divergence-diagnostics',
      jsonrpc: '2.0',
      method: 'sync.conflict.merge',
      params: [{
        mergedAt: remoteReviewAt + 1,
        sources: [{ sourceId: 'divergence-conflict-db', bytes: conflictBytes! }],
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        mergedReviewEvents: 1,
        mergedCards: 0,
        diagnostics: {
          reviewCardDivergences: expect.arrayContaining([
            expect.objectContaining({
              cardId: 'card-divergent-history',
              reason: 'review-history-newer-than-card-state',
              newestReviewEventAt: remoteReviewAt,
              cardLastReview: localReviewAt,
              reviewEventCount: 2,
              cardReps: 1,
            }),
            expect.objectContaining({
              cardId: 'card-divergent-history',
              reason: 'review-event-count-exceeds-card-reps',
              newestReviewEventAt: remoteReviewAt,
              cardLastReview: localReviewAt,
              reviewEventCount: 2,
              cardReps: 1,
            }),
          ]),
        },
      }),
    }));
    await expect(currentDatabase.getCard('card-divergent-history')).resolves.toMatchObject({
      due: localReviewAt + 86_400_000,
      reps: 1,
      lastReview: localReviewAt,
      updatedAt: localReviewAt,
    });
    expect(currentDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-divergent-history'],
    )?.count).toBe(2);
  });

  it('audits current review/card divergence without requiring a conflict merge', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const base = 1_779_188_800_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-audit-newer-history',
        blockId: 'block-audit-newer-history',
        due: base + 86_400_000,
        reps: 1,
        lastReview: base,
        updatedAt: base,
      }),
      buildCard({
        id: 'card-audit-consistent',
        blockId: 'block-audit-consistent',
        due: base + 2 * 86_400_000,
        reps: 2,
        lastReview: base + 20_000,
        updatedAt: base + 20_000,
      }),
    ]);
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-local',
      cardId: 'card-audit-newer-history',
      reviewedAt: base,
    });
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-remote',
      cardId: 'card-audit-newer-history',
      reviewedAt: base + 60_000,
    });
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-consistent-1',
      cardId: 'card-audit-consistent',
      reviewedAt: base + 10_000,
    });
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-consistent-2',
      cardId: 'card-audit-consistent',
      reviewedAt: base + 20_000,
    });

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'review-divergence-audit',
      jsonrpc: '2.0',
      method: 'sync.reviewDivergence.audit',
      params: [{ limit: 10 }],
    });

    expect(response).toEqual({
      id: 'review-divergence-audit',
      jsonrpc: '2.0',
      result: {
        ok: true,
        scannedCards: 2,
        divergentCards: 1,
        limit: 10,
        truncated: false,
        reasons: {
          'review-history-newer-than-card-state': 1,
          'review-event-count-exceeds-card-reps': 1,
        },
        records: expect.arrayContaining([
          expect.objectContaining({
            cardId: 'card-audit-newer-history',
            blockId: 'block-audit-newer-history',
            reason: 'review-history-newer-than-card-state',
            newestReviewEventAt: base + 60_000,
            cardLastReview: base,
            reviewEventCount: 2,
            cardReps: 1,
          }),
          expect.objectContaining({
            cardId: 'card-audit-newer-history',
            blockId: 'block-audit-newer-history',
            reason: 'review-event-count-exceeds-card-reps',
            newestReviewEventAt: base + 60_000,
            cardLastReview: base,
            reviewEventCount: 2,
            cardReps: 1,
          }),
        ]),
      },
    });
    expect(JSON.stringify(response)).not.toContain('card-audit-consistent');
  });

  it('audits review/card divergence with scoped card ids and bounded output', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const base = 1_779_188_900_000;
    await currentDatabase.upsertCards([
      buildCard({ id: 'card-audit-scope-a', blockId: 'block-audit-scope-a', reps: 0, lastReview: base }),
      buildCard({ id: 'card-audit-scope-b', blockId: 'block-audit-scope-b', reps: 0, lastReview: base }),
      buildCard({ id: 'card-audit-outside', blockId: 'block-audit-outside', reps: 0, lastReview: base }),
    ]);
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-scope-a',
      cardId: 'card-audit-scope-a',
      reviewedAt: base + 10_000,
    });
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-scope-b',
      cardId: 'card-audit-scope-b',
      reviewedAt: base + 20_000,
    });
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-outside',
      cardId: 'card-audit-outside',
      reviewedAt: base + 30_000,
    });

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'review-divergence-audit-scoped',
      jsonrpc: '2.0',
      method: 'sync.reviewDivergence.audit',
      params: [{
        cardIds: ['card-audit-scope-a', 'card-audit-scope-b'],
        limit: 1,
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        ok: true,
        scannedCards: 2,
        divergentCards: 2,
        limit: 1,
        truncated: true,
        records: [
          expect.objectContaining({
            cardId: expect.stringMatching(/^card-audit-scope-/),
          }),
        ],
      }),
    }));
    expect(JSON.stringify(response)).not.toContain('card-audit-outside');
  });

  it('audits review/card divergence without mutating review, card, sync, or projection state', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    const base = 1_779_189_000_000;
    await currentDatabase.upsertCards([
      buildCard({
        id: 'card-audit-readonly',
        blockId: 'block-audit-readonly',
        due: base + 86_400_000,
        reps: 0,
        lastReview: base,
        updatedAt: base,
      }),
    ]);
    await seedReviewEvent(currentDatabase, {
      id: 'event-audit-readonly',
      cardId: 'card-audit-readonly',
      reviewedAt: base + 60_000,
    });
    await seedQueueProjection(currentDatabase, {
      queueType: 'retrieval-practice',
      generation: 11,
      rows: [buildCard({ id: 'card-audit-readonly', blockId: 'block-audit-readonly' })],
      updatedAt: base,
    });
    const beforeCard = await currentDatabase.getCard('card-audit-readonly');
    const beforeEvents = currentDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-audit-readonly'],
    );
    const beforeProjection = currentDatabase.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      ['retrieval-practice'],
    );
    const beforeMetadata = currentDatabase.getOne<{ value_json: string; updated_at: number }>(
      'SELECT value_json, updated_at FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );

    const kernel = new BackendKernel({ database: currentDatabase });
    const response = await kernel.handle({
      id: 'review-divergence-audit-readonly',
      jsonrpc: '2.0',
      method: 'sync.reviewDivergence.audit',
      params: [{ cardIds: ['card-audit-readonly'] }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        divergentCards: 1,
      }),
    }));
    await expect(currentDatabase.getCard('card-audit-readonly')).resolves.toEqual(beforeCard);
    expect(currentDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-audit-readonly'],
    )).toEqual(beforeEvents);
    expect(currentDatabase.getOne<{ status: string; rebuild_reason: string | null }>(
      'SELECT status, rebuild_reason FROM queue_projection_generations WHERE queue_type = ?',
      ['retrieval-practice'],
    )).toEqual(beforeProjection);
    expect(currentDatabase.getOne<{ value_json: string; updated_at: number }>(
      'SELECT value_json, updated_at FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    )).toEqual(beforeMetadata);
  });

  it('merges externally synced database bytes before the next backend request', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const localReviewAt = 1_779_189_000_000;
    const remoteReviewAt = 1_779_190_000_000;
    await database.upsertCards([
      buildCard({
        id: 'card-sync-auto',
        due: localReviewAt + 86_400_000,
        reps: 1,
        lastReview: localReviewAt,
        updatedAt: localReviewAt,
      }),
    ]);
    await database.runTransaction('seed.local-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-local-before-sync',
          'card-sync-auto',
          'attempt-local',
          3,
          localReviewAt,
          2026,
          5,
          'review',
          '{}',
        ],
      );
    });

    const remoteBridge = createInMemorySqlitePersistenceBridge();
    const remoteDatabase = new WorkerSqliteDatabaseService(remoteBridge);
    await remoteDatabase.upsertCards([
      buildCard({
        id: 'card-sync-auto',
        due: remoteReviewAt + 2 * 86_400_000,
        reps: 2,
        lastReview: remoteReviewAt,
        updatedAt: remoteReviewAt,
      }),
    ]);
    await remoteDatabase.runTransaction('seed.remote-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-remote-after-sync',
          'card-sync-auto',
          'attempt-remote',
          4,
          remoteReviewAt,
          2026,
          5,
          'review',
          '{}',
        ],
      );
    });
    await remoteDatabase.persist();
    const remoteBytes = remoteBridge.snapshot().bytes;
    expect(remoteBytes).toBeTruthy();
    await persistenceBridge.writeBinary('siyuanmemo.db', remoteBytes!);

    const kernel = new BackendKernel({ database });
    const response = await kernel.handle({
      id: 'persist-after-external-sync',
      jsonrpc: '2.0',
      method: 'db.persist',
      params: [],
    });
    expect(response).toEqual({
      id: 'persist-after-external-sync',
      jsonrpc: '2.0',
      result: {
        ok: true,
        persisted: true,
        dbFile: 'siyuanmemo.db',
      },
    });

    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE id IN (?, ?)',
      ['event-local-before-sync', 'event-remote-after-sync'],
    )?.count).toBe(2);
    const mergedCard = await database.getCard('card-sync-auto');
    expect(mergedCard?.reps).toBe(2);
    expect(mergedCard?.lastReview).toBe(remoteReviewAt);
  });

  it('merges synced conflict database copies before the next backend request', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const staleReviewAt = 1_779_187_510_541;
    const conflictReviewAt = 1_779_201_734_583;
    await database.upsertCards([
      buildCard({
        id: 'card-sync-conflict-auto',
        due: staleReviewAt + 60_000,
        reps: 1,
        lastReview: staleReviewAt,
        updatedAt: staleReviewAt,
      }),
    ]);
    await database.runTransaction('seed.stale-main-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-stale-main',
          'card-sync-conflict-auto',
          'attempt-stale',
          3,
          staleReviewAt,
          2026,
          5,
          'review',
          '{}',
        ],
      );
    });
    await database.persist();
    await persistenceBridge.writeBinary('siyuanmemo.db', persistenceBridge.snapshot().bytes!);

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({
        id: 'card-sync-conflict-auto',
        due: conflictReviewAt + 120_000,
        reps: 2,
        lastReview: conflictReviewAt,
        updatedAt: conflictReviewAt,
      }),
    ]);
    await conflictDatabase.runTransaction('seed.conflict-auto-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-conflict-copy',
          'card-sync-conflict-auto',
          'attempt-conflict-copy',
          4,
          conflictReviewAt,
          2026,
          5,
          'review',
          JSON.stringify({ source: 'siyuan-sync-conflict' }),
        ],
      );
    });
    await conflictDatabase.persist();
    const conflictBytes = conflictBridge.snapshot().bytes;
    expect(conflictBytes).toBeTruthy();
    persistenceBridge.readSyncConflictDatabaseSources = vi.fn(async () => [{
      sourceId: 'siyuan-sync-conflict:2026-05-19-224317:/data/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      bytes: conflictBytes!,
    }]);

    const kernel = new BackendKernel({ database });
    const response = await kernel.handle({
      id: 'persist-after-conflict-sync',
      jsonrpc: '2.0',
      method: 'db.persist',
      params: [],
    });

    expect(response).toEqual({
      id: 'persist-after-conflict-sync',
      jsonrpc: '2.0',
      result: {
        ok: true,
        persisted: true,
        dbFile: 'siyuanmemo.db',
      },
    });
    expect(persistenceBridge.readSyncConflictDatabaseSources).toHaveBeenCalled();
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE id IN (?, ?)',
      ['event-stale-main', 'event-conflict-copy'],
    )?.count).toBe(2);
    const mergedCard = await database.getCard('card-sync-conflict-auto');
    expect(mergedCard?.reps).toBe(2);
    expect(mergedCard?.lastReview).toBe(conflictReviewAt);
  });

  it('summarizes readable and unreadable sync conflict database copies without mutating current state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([
      buildCard({ id: 'current-card', updatedAt: 100, lastReview: 90 }),
      buildCard({ id: 'current-missing-card', blockId: 'current-missing-block', updatedAt: 110, lastReview: 95 }),
    ]);
    await database.updateSourceExistence([
      { cardId: 'current-missing-card', blockId: 'current-missing-block', exists: false },
    ], 120);
    await database.runTransaction('seed.current-summary-review-events', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'event-current-active-summary', 'current-card', 'attempt-current-active', 3, 121, 2026, 5, 'review-v2', '{}',
          'event-current-missing-summary', 'current-missing-card', 'attempt-current-missing', 3, 122, 2026, 5, 'review-v2', '{}',
        ],
      );
    });

    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([
      buildCard({ id: 'conflict-card', updatedAt: 200, lastReview: 180 }),
      buildCard({ id: 'conflict-missing-card', blockId: 'conflict-missing-block', updatedAt: 210, lastReview: 185 }),
    ]);
    await conflictDatabase.updateSourceExistence([
      { cardId: 'conflict-missing-card', blockId: 'conflict-missing-block', exists: false },
    ], 220);
    await conflictDatabase.runTransaction('seed.summary-review-event', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['event-summary', 'conflict-card', 'attempt-summary', 3, 220, 2026, 5, 'review', '{}'],
      );
    });
    await conflictDatabase.persist();
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'summary',
      jsonrpc: '2.0',
      method: 'sync.conflict.summarize',
      params: [{
        sources: [
          { sourceId: 'readable', bytes: conflictBridge.snapshot().bytes!, path: '/conflict/siyuanmemo.db', modifiedAt: 300 },
          { sourceId: 'broken', bytes: new Uint8Array([
            ..."SQLite format 3\0".split('').map((char) => char.charCodeAt(0)),
            1,
            2,
            3,
          ]) },
        ],
      }],
    });

    expect(response).toMatchObject({
      id: 'summary',
      jsonrpc: '2.0',
      result: {
        ok: true,
        current: {
          sourceId: 'current-local:siyuanmemo.db',
          parseStatus: 'ok',
          reviewEventCount: 1,
          cardCount: 1,
        },
        sources: [
          {
            sourceId: 'readable',
            path: '/conflict/siyuanmemo.db',
            modifiedAt: 300,
            reviewEventCount: 1,
            cardCount: 1,
            latestReviewTimestamp: 220,
            parseStatus: 'ok',
          },
          {
            sourceId: 'broken',
            parseStatus: 'parse-error',
          },
        ],
      },
    });
    expect(await database.getCard('conflict-card')).toBeUndefined();
  });

  it('reloads worker sqlite state from replaced persisted bytes before later requests', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'old-card', blockId: 'old-block' })]);

    const replacementBridge = createInMemorySqlitePersistenceBridge();
    const replacementDatabase = new WorkerSqliteDatabaseService(replacementBridge);
    await replacementDatabase.upsertCards([buildCard({ id: 'replacement-card', blockId: 'replacement-block' })]);
    await replacementDatabase.persist();
    const replacementBytes = await replacementBridge.readBinary('siyuanmemo.db');
    expect(replacementBytes).toBeTruthy();
    await persistenceBridge.writeBinary('siyuanmemo.db', replacementBytes!);

    const kernel = new BackendKernel({ database });
    await expect(kernel.handle({
      id: 'reload',
      jsonrpc: '2.0',
      method: 'sync.conflict.reload',
      params: [],
    })).resolves.toEqual({
      id: 'reload',
      jsonrpc: '2.0',
      result: {
        ok: true,
        reloaded: true,
        dbFile: 'siyuanmemo.db',
      },
    });

    expect(await database.getCard('old-card')).toBeUndefined();
    expect(await database.getCard('replacement-card')).toMatchObject({
      id: 'replacement-card',
      blockId: 'replacement-block',
    });
  });

  it('serves browser phase-2 rpc methods from worker sqlite repository', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const deckPageResponse = await kernel.handle({
      id: 'deck-page',
      jsonrpc: '2.0',
      method: 'browser.deck.page',
      params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }],
    });
    expect(deckPageResponse).toEqual({
      id: 'deck-page',
      jsonrpc: '2.0',
      result: {
        total: 0,
        cards: [],
        generation: null,
      },
    });

    const matchedIdsResponse = await kernel.handle({
      id: 'deck-ids',
      jsonrpc: '2.0',
      method: 'browser.deck.matchedIds',
      params: [{ query: { preset: 'review' } }],
    });
    expect(matchedIdsResponse).toEqual({
      id: 'deck-ids',
      jsonrpc: '2.0',
      result: { ids: [] },
    });

    const rowsByIdsResponse = await kernel.handle({
      id: 'deck-rows',
      jsonrpc: '2.0',
      method: 'browser.deck.rowsByIds',
      params: [{ ids: ['card-1'] }],
    });
    expect(rowsByIdsResponse).toEqual({
      id: 'deck-rows',
      jsonrpc: '2.0',
      result: { cards: [] },
    });

    const statsResponse = await kernel.handle({
      id: 'stats',
      jsonrpc: '2.0',
      method: 'browser.stats',
      params: [],
    });
    expect(statsResponse).toEqual({
      id: 'stats',
      jsonrpc: '2.0',
      result: {
        totalCards: 0,
        dueCards: 0,
        newCards: 0,
        learningCards: 0,
        reviewCards: 0,
        suspendedCards: 0,
        lostCards: 0,
      },
    });

    const sourceSummaryResponse = await kernel.handle({
      id: 'source-summary',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.summary',
      params: [],
    });
    expect(sourceSummaryResponse).toEqual({
      id: 'source-summary',
      jsonrpc: '2.0',
      result: {
        unknown: 0,
        stale: 0,
        missing: 0,
      },
    });

    const sourceSweepResponse = await kernel.handle({
      id: 'source-sweep',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweep',
      params: [{ request: { blockIds: ['block-1'] }, existingBlockIds: ['block-1'] }],
    });
    expect(sourceSweepResponse).toEqual({
      id: 'source-sweep',
      jsonrpc: '2.0',
      result: {
        checked: 0,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      },
    });

    const sourceSweepHostResponse = await kernel.handle({
      id: 'source-sweep-host',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweepHost',
      params: [{ request: { blockIds: ['block-1'] } }],
    });
    expect(sourceSweepHostResponse).toEqual({
      id: 'source-sweep-host',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker host source-existence resolver is unavailable',
      },
    });

    const transactionIngestResponse = await kernel.handle({
      id: 'kernel-transaction-ingest',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'kernel-sidecar',
        transactions: [{ id: 'tx-1' }],
        receivedAt: 1,
      }],
    });
    expect(transactionIngestResponse).toEqual({
      id: 'kernel-transaction-ingest',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 1,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    const transactionDequeueResponse = await kernel.handle({
      id: 'kernel-transaction-dequeue',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 4 }],
    });
    expect(transactionDequeueResponse).toEqual({
      id: 'kernel-transaction-dequeue',
      jsonrpc: '2.0',
      result: {
        actions: [],
        remaining: 0,
      },
    });

    const autoCardDecisionResponse = await kernel.handle({
      id: 'autocard-decision-resolve',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [{
        blockId: 'block-1',
        content: 'question <> answer',
        blockType: 'p',
        resolvedCardType: 'item',
        source: 'symbol-listener',
        hasParentTopicCard: false,
      }],
    });
    expect(autoCardDecisionResponse).toMatchObject({
      id: 'autocard-decision-resolve',
      jsonrpc: '2.0',
      result: {
        candidateId: expect.any(String),
        decisionEventId: expect.any(String),
        status: 'selected',
        unavailableClass: null,
        matchedRuleIds: ['BasicDirectionRule'],
        enabledDecisions: [{
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          renderProfile: 'quick-default',
          direction: 'both',
          priority: 50,
          conflictGroup: 'single-block',
          hints: {
            isBidirectional: true,
          },
        }],
        filteredDecisions: [{
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          renderProfile: 'quick-default',
          direction: 'both',
          priority: 50,
          conflictGroup: 'single-block',
          hints: {
            isBidirectional: true,
          },
        }],
        selectedDecision: {
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          renderProfile: 'quick-default',
          direction: 'both',
          priority: 50,
          conflictGroup: 'single-block',
          hints: {
            isBidirectional: true,
          },
        },
        conflicted: false,
        strategyUsed: 'semantic-first',
        markOnlyClozeCandidate: false,
        shouldUseTopicDerivation: false,
      },
    });

    const autoCardStructuralDecisionResponse = await kernel.handle({
      id: 'autocard-decision-structural',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [{
        blockId: 'block-structural-1',
        content: '概念 >>>',
        blockType: 'i',
        resolvedCardType: 'item',
        source: 'doc-oneclick-scan',
        ruleScope: 'structural',
      }],
    });
    expect(autoCardStructuralDecisionResponse).toMatchObject({
      id: 'autocard-decision-structural',
      jsonrpc: '2.0',
      result: {
        matchedRuleIds: ['ListTemplateStructuralRule'],
        selectedDecision: {
          id: 'ListTemplateStructuralRule',
          executorKind: 'list-template-structural',
          mode: 'split-list',
        },
      },
    });

    const autoCardExecuteResponse = await kernel.handle({
      id: 'autocard-execute',
      jsonrpc: '2.0',
      method: 'autocard.execute',
      params: [{
        envelope: {
          kind: 'planner-decision',
          blockId: 'block-1',
          content: 'question <> answer',
          decision: {
            id: 'BasicDirectionRule',
            family: 'basic',
            templateId: 'builtin-bidirectional-single',
            cardType: 'item',
            mode: 'multi-face',
            executorKind: 'quick-basic',
            priority: 50,
            direction: 'both',
          },
          source: 'symbol-listener',
        },
      }],
    });
    expect(autoCardExecuteResponse).toEqual({
      id: 'autocard-execute',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker autocard.execute unavailable: execute callback is not configured',
      },
    });

    const reviewFeedbackResponse = await kernel.handle({
      id: 'review-feedback',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-1',
        rating: 3,
        queueType: 'final-drill',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      }],
    });
    expect(reviewFeedbackResponse).toEqual({
      id: 'review-feedback',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for final-drill mode/policy in current phase: formal/write-schedule',
      },
    });

    const reviewFeedbackPreviewResponse = await kernel.handle({
      id: 'review-feedback-preview',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-1',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      }],
    });
    expect(reviewFeedbackPreviewResponse).toEqual({
      id: 'review-feedback-preview',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for queueMode in current phase: filtered-preview',
      },
    });

    const reviewFeedbackFilterInvalidResponse = await kernel.handle({
      id: 'review-feedback-filter-invalid',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-1',
        rating: 3,
        queueType: 'filter-group',
        queueMode: 'filtered-rescheduling',
        commitPolicy: 'preview-only',
      }],
    });
    expect(reviewFeedbackFilterInvalidResponse).toEqual({
      id: 'review-feedback-filter-invalid',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker review.feedback unavailable for filter-group mode/policy in current phase: filtered-rescheduling/preview-only',
      },
    });
  });

  it('executes autocard.execute through injected callback when configured', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({
      database,
      executeAutoCard: async () => ({
        executed: true,
        created: 2,
        skipped: 1,
      }),
    });

    const response = await kernel.handle({
      id: 'autocard-execute-callback',
      jsonrpc: '2.0',
      method: 'autocard.execute',
      params: [{
        envelope: {
          kind: 'topic-derived',
          input: {
            sourceBlockId: 'block-1',
            sourceDocId: 'doc-1',
            parentTopicCardId: 'topic-1',
            plannerContent: 'Q <> A',
            decisions: [{
              id: 'BasicDirectionRule',
              family: 'basic',
              templateId: 'builtin-bidirectional-single',
              cardType: 'item',
              mode: 'multi-face',
              executorKind: 'quick-basic',
              priority: 50,
              direction: 'both',
            }],
          },
        },
      }],
    });

    expect(response).toEqual({
      id: 'autocard-execute-callback',
      jsonrpc: '2.0',
      result: {
        executed: true,
        created: 2,
        skipped: 1,
      },
    });
  });

  it('records diagnostic inner steps for browser deck page reads', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([
      buildCard({
        id: 'diagnostic-browser-card',
        blockId: 'diagnostic-browser-block',
        due: 1_700_000_100_000,
        meta: { content: 'diagnostic Browser card', rootId: 'doc-diagnostic', deckId: 'deck-diagnostic' },
      }),
    ]);
    const kernel = new BackendKernel({ database });
    const timing = beginBackendWorkerTiming('browser.deck.page');

    try {
      const response = await kernel.handle({
        id: 'browser-diagnostic-page',
        jsonrpc: '2.0',
        method: 'browser.deck.page',
        params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }],
      });

      expect('result' in response).toBe(true);
      if ('result' in response) {
        expect(response.result.total).toBe(1);
      }
      expect(timing.innerSteps.map((step) => `${step.layer}:${step.step}`)).toEqual(expect.arrayContaining([
        'kernel:pre-request-merge',
        'database:queryDeckPage.init',
        'database:queryDeckPage.count',
        'database:queryDeckPage.select',
        'database:queryDeckPage.total',
      ]));
      expect(timing.innerSteps.find((step) => step.step === 'queryDeckPage.select')?.extra).toMatchObject({
        startRow: 0,
        limit: 1,
        total: 1,
      });
      expect(timing.innerSteps.find((step) => step.step === 'queryDeckPage.parse')).toBeUndefined();
      expect(timing.innerSteps.find((step) => step.step === 'pre-request-merge')?.extra).toMatchObject({
        mainDbReadSkipped: true,
        mainDbReadSkipReason: 'read-only-preflight-main-db-disabled',
        nonEmptyConflictSourceCount: 0,
      });
    } finally {
      endBackendWorkerRequest(timing);
    }
  });

  it('serves projection-backed queue snapshots and row hydration from worker projection storage', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardA = buildCard({
      id: 'projection-card-a',
      blockId: 'projection-block-a',
      due: 1_700_000_000_000,
      priority: 20,
      meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
    });
    const cardB = buildCard({
      id: 'projection-card-b',
      blockId: 'projection-block-b',
      due: 1_700_000_100_000,
      priority: 80,
      meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
    });
    await database.upsertCards([cardA, cardB]);
    await seedQueueProjection(database, {
      generation: 3,
      rows: [cardB, cardA],
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'retrieval-practice' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 3,
        status: 'ready',
        counters: {
          generation: 3,
          remaining: 2,
        },
      });
      expect(snapshot.result.rows.map((row: { fsrsCardId: string; queueIndex?: number }) => ({
        fsrsCardId: row.fsrsCardId,
        queueIndex: row.queueIndex,
      }))).toEqual([
        { fsrsCardId: 'projection-card-b', queueIndex: 1 },
        { fsrsCardId: 'projection-card-a', queueIndex: 2 },
      ]);
    }

    const rowsByIds = await kernel.handle({
      id: 'projection-rows-by-ids',
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{ queueType: 'retrieval-practice', ids: ['projection-card-a', 'projection-card-b'] }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        'projection-card-a',
        'projection-card-b',
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-card-a',
        'projection-card-b',
      ]);
    }
  });

  it('returns refreshing projection state when snapshot or row hydration cannot fully hydrate projection rows', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const activeCard = buildCard({
      id: 'projection-active-card',
      blockId: 'projection-active-block',
      due: 1_700_000_000_000,
    });
    const missingCard = buildCard({
      id: 'projection-missing-card',
      blockId: 'projection-missing-block',
      due: 1_700_000_000_000,
    });
    const unknownCard = buildCard({
      id: 'projection-unknown-card',
      blockId: 'projection-unknown-block',
      due: 1_700_000_000_000,
    });
    await database.upsertCards([activeCard, missingCard, unknownCard]);
    await database.updateSourceExistence([
      { blockId: activeCard.blockId, exists: true },
      { blockId: missingCard.blockId, exists: false },
    ], 1_700_000_100_000);
    await seedQueueProjection(database, {
      queueType: 'incremental-learning',
      generation: 9,
      rows: [activeCard, missingCard, unknownCard],
      updatedAt: 1_700_000_100_000,
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-active-source-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'incremental-learning' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 9,
        status: 'refreshing',
        rows: [],
        counters: null,
        freshness: {
          totalRows: 3,
          freshRows: 2,
          missingRows: 1,
          missingCardIds: ['projection-missing-card'],
        },
      });
    }

    const rowsByIds = await kernel.handle({
      id: 'projection-active-source-rows-by-ids',
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{
        queueType: 'incremental-learning',
        ids: ['projection-active-card', 'projection-missing-card', 'projection-unknown-card'],
      }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result).toMatchObject({
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 9,
        status: 'refreshing',
        rows: [],
        cards: [],
        freshness: {
          totalRows: 3,
          freshRows: 2,
          missingRows: 1,
          missingCardIds: ['projection-missing-card'],
        },
      });
    }
  });

  it('invalidates projection generations when source existence changes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-invalidated-card',
      blockId: 'projection-invalidated-block',
      due: 1_700_000_000_000,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'final-drill',
      generation: 3,
      rows: [card],
      updatedAt: 1_700_000_100_000,
    });
    await database.updateSourceExistence([
      { blockId: card.blockId, exists: false },
    ], 1_700_000_200_000);
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-invalidated-source-change',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'final-drill' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'final-drill',
        status: 'refreshing',
        rows: [],
      });
    }
  });

  it('replaces missing queue projection generation through explicit backend materialization', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-rebuild-card',
      blockId: 'projection-rebuild-block',
      due: 1_700_000_000_000,
      priority: 42,
      meta: { content: 'projection rebuild', rootId: 'doc-rebuild', deckId: 'deck-rebuild' },
    });
    await database.upsertCards([card]);
    const kernel = new BackendKernel({ database });

    const before = await kernel.handle({
      id: 'projection-replace-before',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'leech' }],
    });
    expect('result' in before).toBe(true);
    if ('result' in before) {
      expect(before.result).toMatchObject({
        queueType: 'leech',
        status: 'refreshing',
        generation: null,
      });
    }

    const replace = await kernel.handle({
      id: 'projection-replace',
      jsonrpc: '2.0',
      method: 'queue.projection.replace' as never,
      params: [{
        queueType: 'leech',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        rows: [{
          queueType: 'leech',
          rowId: card.id,
          cardId: card.id,
          blockId: card.blockId,
          deckId: 'deck-rebuild',
          membershipReason: 'materialized-strategy',
          dueAt: card.due,
          dueBucket: 'overdue',
          priorityScore: card.priority,
          sortKey: `000000001:${card.id}`,
          queueIndexHint: 1,
          policyHash: 'materialized-leech-v1',
          sourceGeneration: 1,
          payload: { queueKind: 'leech', source: 'application-materialized' },
          updatedAt: 1_700_000_100_000,
        }],
        reason: 'snapshot-refresh',
      }],
    });
    expect('result' in replace).toBe(true);
    if ('result' in replace) {
      expect(replace.result).toMatchObject({
        queueType: 'leech',
        status: 'ready',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        rows: 1,
        counters: {
          remaining: 1,
          total: 1,
        },
      });
    }

    const after = await kernel.handle({
      id: 'projection-replace-after',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'leech' }],
    });
    expect('result' in after).toBe(true);
    if ('result' in after) {
      expect(after.result).toMatchObject({
        queueType: 'leech',
        status: 'ready',
        policyHash: 'materialized-leech-v1',
        generation: 1,
        counters: {
          remaining: 1,
          total: 1,
        },
      });
      expect(after.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        'projection-rebuild-card',
      ]);
    }
  });

  it('reports refreshing when source-card fingerprint is stale after synced review state changes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedCard = buildCard({
      id: 'projection-reviewed-card',
      blockId: 'projection-reviewed-block',
      state: 1,
      due: 1_700_000_000_000,
      lastReview: 1_699_999_900_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection stale membership', rootId: 'doc-projection' },
    });
    await database.upsertCards([reviewedCard]);
    const kernel = new BackendKernel({ database });

    const replace = await kernel.handle({
      id: 'projection-stale-replace',
      jsonrpc: '2.0',
      method: 'queue.projection.replace' as never,
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'incremental-learning:materialized:v1',
        generation: 1,
        rows: [{
          queueType: 'incremental-learning',
          rowId: reviewedCard.id,
          cardId: reviewedCard.id,
          blockId: reviewedCard.blockId,
          deckId: null,
          membershipReason: 'rotation',
          dueAt: reviewedCard.due,
          dueBucket: 'overdue',
          priorityScore: reviewedCard.priority,
          sortKey: `000000001:${reviewedCard.id}`,
          queueIndexHint: 1,
          policyHash: 'incremental-learning:materialized:v1',
          sourceGeneration: 1,
          payload: { queueKind: 'incremental-learning', state: 1, source: 'application-materialized' },
          updatedAt: 1_700_000_000_100,
        }],
        reason: 'snapshot-refresh',
      }],
    });
    expect('result' in replace).toBe(true);

    await database.upsertCards([{
      ...reviewedCard,
      state: 2,
      due: 1_700_172_800_000,
      lastReview: 1_700_000_200_000,
      updatedAt: 1_700_000_200_000,
    }]);

    const snapshot = await kernel.handle({
      id: 'projection-stale-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'incremental-learning' }],
    });
    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        status: 'refreshing',
        counters: null,
        freshness: {
          totalRows: 1,
          freshRows: 0,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['projection-reviewed-card'],
        },
      });
      expect(snapshot.result.rows).toEqual([]);
    }
  });

  it('reports refreshing when source-card priority changes without projection rematerialization', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'projection-priority-card',
      blockId: 'projection-priority-block',
      priority: 20,
      due: 1_700_000_000_000,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'retrieval-practice',
      generation: 11,
      rows: [card],
      updatedAt: 1_700_000_100_000,
    });
    await database.upsertCards([{ ...card, priority: 90, updatedAt: 1_700_000_200_000 }]);
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: 'projection-stale-priority-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType: 'retrieval-practice' }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType: 'retrieval-practice',
        policyHash: 'policy-a',
        generation: 11,
        status: 'refreshing',
        rows: [],
        counters: null,
        freshness: {
          totalRows: 1,
          freshRows: 0,
          staleRows: 1,
          missingRows: 0,
          staleCardIds: ['projection-priority-card'],
        },
      });
    }
  });

  it.each([
    'filter-group',
    'final-drill',
    'leech',
    'neural-roam',
  ])('serves deferred queue projection snapshots and row hydration from worker storage for %s', async (queueType) => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const cardA = buildCard({
      id: `${queueType}-projection-card-a`,
      blockId: `${queueType}-projection-block-a`,
      due: 1_700_000_000_000,
      priority: 20,
      meta: { content: 'alpha', rootId: 'doc-a', deckId: 'deck-a' },
    });
    const cardB = buildCard({
      id: `${queueType}-projection-card-b`,
      blockId: `${queueType}-projection-block-b`,
      due: 1_700_000_100_000,
      priority: 80,
      meta: { content: 'beta', rootId: 'doc-a', deckId: 'deck-a' },
    });
    await database.upsertCards([cardA, cardB]);
    await seedQueueProjection(database, {
      queueType,
      generation: 7,
      rows: [cardB, cardA],
    });
    const kernel = new BackendKernel({ database });

    const snapshot = await kernel.handle({
      id: `${queueType}-projection-snapshot`,
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot' as never,
      params: [{ queueType }],
    });

    expect('result' in snapshot).toBe(true);
    if ('result' in snapshot) {
      expect(snapshot.result).toMatchObject({
        queueType,
        policyHash: 'policy-a',
        generation: 7,
        status: 'ready',
        counters: {
          generation: 7,
          remaining: 2,
        },
      });
      expect(snapshot.result.rows.map((row: { fsrsCardId: string; queueIndex?: number }) => ({
        fsrsCardId: row.fsrsCardId,
        queueIndex: row.queueIndex,
      }))).toEqual([
        { fsrsCardId: `${queueType}-projection-card-b`, queueIndex: 1 },
        { fsrsCardId: `${queueType}-projection-card-a`, queueIndex: 2 },
      ]);
    }

    const rowsByIds = await kernel.handle({
      id: `${queueType}-projection-rows-by-ids`,
      jsonrpc: '2.0',
      method: 'queue.projection.rowsByIds' as never,
      params: [{
        queueType,
        ids: [`${queueType}-projection-card-a`, `${queueType}-projection-card-b`],
      }],
    });

    expect('result' in rowsByIds).toBe(true);
    if ('result' in rowsByIds) {
      expect(rowsByIds.result.cards.map((card: FSRSCard) => card.id)).toEqual([
        `${queueType}-projection-card-a`,
        `${queueType}-projection-card-b`,
      ]);
      expect(rowsByIds.result.rows.map((row: { fsrsCardId: string }) => row.fsrsCardId)).toEqual([
        `${queueType}-projection-card-a`,
        `${queueType}-projection-card-b`,
      ]);
    }
  });

  it('advances neural-roam through backend graph query and persisted session state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-1');
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'neural-source-1': {
        id: 'neural-source-1',
        content: 'Neural source content',
        type: 'p',
        root_id: 'doc-neural',
      },
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-success',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          cardId: 'neural-source-1',
          blockId: 'neural-source-1',
          sourceKind: 'virtual',
        },
        counters: {
          sourceNodes: 1,
        },
        sessionState: {
          engineMode: 'hyperspace',
          currentNodeId: 'neural-source-1',
          exhausted: false,
        },
        queueState: {
          version: 8,
          engineMode: 'hyperspace',
          hyperspace: {
            session: expect.objectContaining({
              history: expect.arrayContaining([
                expect.objectContaining({
                  nodeId: 'neural-source-1',
                }),
              ]),
            }),
          },
        },
      });
    }
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'fetchBlockData',
      blockId: 'neural-source-1',
    }));
  });

  it('continues neural-roam from request current virtual item when persisted session lost current path', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-1');
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: request.blockId === 'neural-source-1' ? 'Neural source content' : 'Neighbor content',
            type: 'p',
            root_id: 'doc-neural',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-source-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-neighbor-1' ? 0.7 : 0.9,
          error: null,
        };
      }
      if (request.operation === 'fetchHyperspaceEdges') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'neural-source-1'
            ? [{
              nodeId: 'neural-neighbor-1',
              associationType: 'concept-link',
              weight: 12,
              channel: 'concept-map',
              origin: 'backlink',
              distance: 1,
              sourcePriority: 0.9,
              targetPriority: 0.7,
              rootId: 'doc-neural',
            }]
            : [],
          error: null,
        };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-virtual-repair',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: {
          id: 'neural-source-1',
          cardId: 'neural-source-1',
          blockId: 'neural-source-1',
          sourceKind: 'virtual',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'neural-neighbor-1',
          sourceKind: 'virtual',
        },
        sessionState: {
          engineMode: 'hyperspace',
          currentNodeId: 'neural-neighbor-1',
          exhausted: false,
        },
      });
      expect(response.result.queueState).toMatchObject({
        hyperspace: {
          session: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({ nodeId: 'neural-source-1' }),
              expect.objectContaining({ nodeId: 'neural-neighbor-1' }),
            ]),
          }),
        },
      });
    }
  });

  it('returns exhausted neural-roam advance when backend session has no graph item', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-exhausted',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'empty-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        nextItem: null,
        unavailableReason: null,
        sessionState: {
          exhausted: true,
        },
      });
    }
  });

  it('does not report stale source-pool nodes as due after neural-roam advance exhausts', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamHyperspaceSource(database, [
      'neural-source-missing-1',
      'neural-source-missing-2',
      'neural-source-missing-3',
    ]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-exhausted-counters',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        nextItem: null,
        counters: {
          remaining: 0,
          due: 0,
          total: 0,
          sourceNodes: 3,
        },
      });
    }
  });

  it('starts backend neural-roam advance from requested concept focus', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'concept-source-1': {
        id: 'concept-source-1',
        content: 'Concept source',
        type: 'p',
      },
      'old-source-1': {
        id: 'old-source-1',
        content: 'Old source',
        type: 'p',
      },
    });
    await seedNeuralRoamHyperspaceSource(database, 'old-source-1');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-start-focus',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'concept-source-1',
          includeFocusAsFirst: true,
          startNewSession: true,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'concept-source-1',
        },
        sessionState: {
          currentNodeId: 'concept-source-1',
          pathLength: 1,
        },
      });
    }
  });

  it('returns orbit round progress and engine history after advancing from focus to neighbor', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        const block = {
          id: request.blockId,
          content: `${request.blockId} content`,
          type: 'p',
        };
        return { status: 'found', blockId: request.blockId, data: block, error: null };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'concept-source-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNeighbors') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'concept-source-1'
            ? [{ id: 'orbit-neighbor-1', type: 'backlink', weight: 15 }]
            : [],
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const startResponse = await kernel.handle({
      id: 'neural-advance-orbit-start-focus',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'concept-source-1',
          includeFocusAsFirst: true,
          startNewSession: true,
        },
      }],
    });

    expect('result' in startResponse).toBe(true);
    if (!('result' in startResponse)) {
      return;
    }

    const nextResponse = await kernel.handle({
      id: 'neural-advance-orbit-next-neighbor',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: startResponse.result.nextItem,
        feedback: { action: 'skip' },
      }],
    });

    expect('result' in nextResponse).toBe(true);
    if ('result' in nextResponse) {
      expect(nextResponse.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'orbit-neighbor-1',
        },
        sessionState: {
          engineMode: 'orbit',
          currentNodeId: 'orbit-neighbor-1',
          pathLength: 2,
          historyCount: 2,
        },
        queueState: {
          version: 8,
          engineMode: 'orbit',
          orbit: {
            anchorPool: [
              expect.objectContaining({
                nodeId: 'concept-source-1',
                neighborsViewed: 1,
              }),
            ],
            session: expect.objectContaining({
              currentFocus: 'concept-source-1',
              history: expect.arrayContaining([
                expect.objectContaining({ nodeId: 'concept-source-1' }),
                expect.objectContaining({ nodeId: 'orbit-neighbor-1' }),
              ]),
            }),
          },
        },
      });
    }
  });

  it('trusts neural-roam start conceptBlockId as the backend orbit seed for temporary current-block roam', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: `${request.blockId} content`,
            type: 'p',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'concept-seed-1',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-block-with-concept-seed',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'definition-block-1',
          seedBlockId: 'concept-seed-1',
          conceptBlockId: 'concept-seed-1',
          includeFocusAsFirst: true,
          startNewSession: true,
          entrySessionKind: 'temporary-current-block',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'definition-block-1',
        },
        queueState: {
          version: 8,
          engineMode: 'orbit',
          orbit: {
            seedPool: [
              expect.objectContaining({
                nodeId: 'concept-seed-1',
              }),
            ],
            anchorPool: [
              expect.objectContaining({
                nodeId: 'definition-block-1',
              }),
            ],
          },
        },
      });
    }
  });

  it('uses neural-roam start seedBlockId as the backend orbit seed when conceptBlockId is absent', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: {
            id: request.blockId,
            content: `${request.blockId} content`,
            type: 'p',
          },
          error: null,
        };
      }
      if (request.operation === 'isConceptCard') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: request.blockId === 'seed-only-concept',
          error: null,
        };
      }
      if (request.operation === 'fetchNodePriority') {
        return { status: 'found', blockId: request.blockId, data: 0.9, error: null };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-current-block-with-seed-only',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'definition-block-1',
          seedBlockId: 'seed-only-concept',
          includeFocusAsFirst: true,
          startNewSession: true,
          entrySessionKind: 'temporary-current-block',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          blockId: 'definition-block-1',
        },
        queueState: {
          version: 8,
          engineMode: 'orbit',
          orbit: {
            seedPool: [
              expect.objectContaining({
                nodeId: 'seed-only-concept',
              }),
            ],
            anchorPool: [
              expect.objectContaining({
                nodeId: 'definition-block-1',
              }),
            ],
          },
        },
      });
    }
  });

  it('uses SQL active route by default for backend neural-roam advance', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-b', 'route-b-source');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-b-source': { id: 'route-b-source', content: 'Route B', type: 'p' },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-active-route',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        routeId: 'route-b',
        status: 'advanced',
        nextItem: { blockId: 'route-b-source' },
        sessionState: { routeId: 'route-b' },
      });
    }
  });

  it('rejects stale backend neural-roam feedback for an inactive route', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-a', 'route-a-source', 'default');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-a-source': { id: 'route-a-source', content: 'Route A', type: 'p' },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-stale-route-feedback',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        routeId: 'route-a',
        sessionId: null,
        currentItem: {
          id: 'route-a-source',
          cardId: 'route-a-source',
          blockId: 'route-a-source',
          sourceKind: 'virtual',
        },
        feedback: { action: 'skip' },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        routeId: 'default',
        status: 'mismatch',
        nextItem: null,
        unavailableReason: 'route-mismatch',
      });
    }
  });

  it('rejects stale backend neural-roam commands for an inactive route', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-a', 'route-a-source', 'default');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-a-source': { id: 'route-a-source', content: 'Route A', type: 'p' },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-command-stale-route',
      jsonrpc: '2.0',
      method: 'neural-roam.command' as never,
      params: [{
        queueType: 'neural-roam',
        command: {
          type: 'set-anchor',
          nodeId: 'route-a-source',
          enabled: true,
          routeId: 'route-a',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'mismatch',
        unavailableReason: 'route-mismatch',
        viewState: {
          route: {
            id: 'default',
          },
        },
        queueState: expect.objectContaining({
          version: 8,
        }),
      });
    }
  });

  it('returns backend-owned NeuralRoam route selector state after create and switch commands', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const created = await kernel.handle({
      id: 'neural-command-create-route-selector',
      jsonrpc: '2.0',
      method: 'neural-roam.command' as never,
      params: [{
        queueType: 'neural-roam',
        command: {
          type: 'create-route',
          name: 'Backend Route',
        },
      }],
    });

    expect('result' in created).toBe(true);
    let createdRouteId = '';
    if ('result' in created) {
      createdRouteId = String(created.result.viewState?.route.id || '');
      expect(createdRouteId).toMatch(/^route-/);
      expect(created.result.viewState).toMatchObject({
        route: {
          id: createdRouteId,
          name: 'Backend Route',
        },
        routes: expect.arrayContaining([
          expect.objectContaining({
            id: createdRouteId,
            name: 'Backend Route',
            isActive: true,
            stats: expect.objectContaining({
              routeId: createdRouteId,
            }),
          }),
          expect.objectContaining({
            id: 'default',
            isActive: false,
          }),
        ]),
      });
    }

    const switched = await kernel.handle({
      id: 'neural-command-switch-route-selector',
      jsonrpc: '2.0',
      method: 'neural-roam.command' as never,
      params: [{
        queueType: 'neural-roam',
        command: {
          type: 'switch-route',
          routeId: 'default',
        },
      }],
    });

    expect('result' in switched).toBe(true);
    if ('result' in switched) {
      expect(switched.result.viewState).toMatchObject({
        route: {
          id: 'default',
        },
        routes: expect.arrayContaining([
          expect.objectContaining({
            id: 'default',
            isActive: true,
          }),
          expect.objectContaining({
            id: createdRouteId,
            isActive: false,
          }),
        ]),
      });
    }
  });

  it('syncs cached backend neural-roam queue to the SQL active route before mismatch checks', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await seedNeuralRoamRouteSource(database, 'route-a', 'route-a-source');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'route-a-source': { id: 'route-a-source', content: 'Route A', type: 'p' },
        'route-b-source': { id: 'route-b-source', content: 'Route B', type: 'p' },
      }),
    });

    const firstResponse = await kernel.handle({
      id: 'neural-advance-cache-route-a',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        routeId: 'route-a',
        sessionId: null,
      }],
    });
    expect('result' in firstResponse && firstResponse.result.routeId).toBe('route-a');

    const repository = new SqlNeuralRoamRouteRepository(database as never);
    const state = await repository.loadState();
    expect(state).not.toBeNull();
    const now = 1_700_000_000_100;
    await repository.saveState({
      activeRouteId: 'route-b',
      engineMode: 'hyperspace',
      routes: [
        ...(state?.routes ?? []),
        {
          metadata: {
            id: 'route-b',
            name: 'route-b',
            temporary: false,
            previousRouteId: null,
            initialSeedNodeIds: [],
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
          },
          seedPool: [{
            routeId: 'route-b',
            nodeId: 'route-b-source',
            kind: 'seed',
            nodeKind: 'concept',
            role: 'orbit-center',
            priority: 0.9,
            addedAt: now,
            visitedAt: null,
            preview: 'route-b-source',
          }],
          anchorPool: [],
          sessions: { orbit: null, hyperspace: null },
          history: [],
        },
      ],
    });

    const secondResponse = await kernel.handle({
      id: 'neural-advance-after-route-b-switch',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        routeId: 'route-b',
        sessionId: null,
      }],
    });

    expect('result' in secondResponse).toBe(true);
    if ('result' in secondResponse) {
      expect(secondResponse.result).toMatchObject({
        queueType: 'neural-roam',
        routeId: 'route-b',
        status: 'advanced',
        nextItem: { blockId: 'route-b-source' },
        sessionState: { routeId: 'route-b' },
      });
    }
  });

  it('starts backend neural-roam from a block seed while returning the source review card first', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'review-block-1': {
        id: 'review-block-1',
        content: 'Review block',
        type: 'p',
      },
    });
    await database.upsertCards([buildCard({
      id: 'source-review-card-1',
      blockId: 'review-block-1',
      type: CardType.Item,
    })]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-start-source-review-card',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        startFromFocus: {
          blockId: 'review-block-1',
          seedBlockId: 'review-block-1',
          sourceReviewCardId: 'source-review-card-1',
          includeFocusAsFirst: true,
          startNewSession: true,
          entrySessionKind: 'temporary-current-block',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'advanced',
        nextItem: {
          cardId: 'source-review-card-1',
          blockId: 'review-block-1',
          sourceKind: 'virtual',
        },
        sessionState: {
          currentNodeId: 'review-block-1',
        },
      });
    }
  });

  it('returns explicit unavailable when neural-roam graph query authority is absent', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'neural-advance-unavailable',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'session-no-graph',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'unavailable',
        nextItem: null,
        unavailableReason: 'advance-contract-unavailable',
      });
    }
  });

  it('returns neural-roam generation mismatch without local advance', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedQueueProjection(database, {
      queueType: 'neural-roam',
      policyHash: 'neural-policy-current',
      generation: 5,
      rows: [],
    });
    const resolveNeuralGraphQuery = createNeuralGraphResolver({});
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'neural-advance-generation-mismatch',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'session-stale',
        projectionGeneration: 4,
        policyHash: 'neural-policy-current',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'mismatch',
        nextItem: null,
        unavailableReason: 'generation-mismatch',
        projectionImpact: expect.objectContaining({
          refreshRequired: true,
        }),
      });
    }
    expect(resolveNeuralGraphQuery).not.toHaveBeenCalled();
  });

  it('returns neural-roam current item unavailable when source is known missing', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const current = buildCard({
      id: 'missing-neural-card',
      blockId: 'missing-neural-block',
    });
    await database.upsertCards([current]);
    await database.updateSourceExistence([
      { blockId: current.blockId, exists: false },
    ], 1_700_000_200_000);
    await seedNeuralRoamHyperspaceSource(database, 'neural-source-after-missing');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'neural-source-after-missing': {
          id: 'neural-source-after-missing',
          content: 'Next available source',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-source-missing',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: null,
        currentItem: {
          id: current.id,
          cardId: current.id,
          blockId: current.blockId,
          sourceKind: 'associated-review',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'unavailable',
        unavailableReason: 'source-block-missing',
        nextItem: {
          blockId: 'neural-source-after-missing',
        },
      });
    }
  });

  it('keeps neural-roam virtual item rating practice-only without formal SRS commit', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const virtualShadow = buildCard({
      id: 'virtual-shadow-card',
      blockId: 'virtual-shadow-block',
      due: reviewedAt - 10_000,
      reps: 2,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([virtualShadow]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-virtual-rating',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'virtual-session',
        currentItem: {
          id: virtualShadow.id,
          cardId: virtualShadow.id,
          blockId: virtualShadow.blockId,
          sourceKind: 'virtual',
        },
        feedback: {
          action: 'rate',
          rating: 4,
        },
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        projectionImpact: null,
      });
    }
    const after = await database.getCard(virtualShadow.id);
    expect(after?.reps).toBe(2);
    expect(after?.lastReview).toBe(reviewedAt - 86_400_000);
  });

  it('commits neural-roam associated review feedback through backend review ownership', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const associated = buildCard({
      id: 'neural-associated-card',
      blockId: 'neural-associated-block',
      due: reviewedAt - 10_000,
      reps: 1,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([associated]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-associated-rating',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'associated-session',
        currentItem: {
          id: associated.id,
          cardId: associated.id,
          blockId: associated.blockId,
          sourceKind: 'associated-review',
        },
        feedback: {
          action: 'rate',
          rating: 3,
        },
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        queueType: 'neural-roam',
        status: 'exhausted',
        projectionImpact: expect.objectContaining({
          refreshRequired: true,
        }),
      });
    }
    const after = await database.getCard(associated.id);
    expect(after?.reps).toBe(2);
    expect(after?.lastReview).toBe(reviewedAt);
  });

  it('replays duplicate neural-roam advance idempotency keys without double-committing associated reviews', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const associated = buildCard({
      id: 'neural-associated-idempotent-card',
      blockId: 'neural-associated-idempotent-block',
      due: reviewedAt - 10_000,
      reps: 1,
      lastReview: reviewedAt - 86_400_000,
    });
    await database.upsertCards([associated]);
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });
    const request = {
      queueType: 'neural-roam',
      sessionId: 'associated-idempotent-session',
      idempotencyKey: 'neural-associated-same-key',
      currentItem: {
        id: associated.id,
        cardId: associated.id,
        blockId: associated.blockId,
        sourceKind: 'associated-review',
      },
      feedback: {
        action: 'rate',
        rating: 3,
      },
      reviewedAt,
    };

    const first = await kernel.handle({
      id: 'neural-advance-associated-idempotent-first',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [request],
    });
    const second = await kernel.handle({
      id: 'neural-advance-associated-idempotent-second',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [request],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in first && 'result' in second) {
      expect(second.result).toEqual(first.result);
    }
    const after = await database.getCard(associated.id);
    expect(after?.reps).toBe(2);
  });

  it('migrates old neural-roam queue state into SQL default route for backend advance', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'legacy-neural-source', 'neuralRoamQueue');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'legacy-neural-source': {
          id: 'legacy-neural-source',
          content: 'Legacy source content',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-import-old-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'imported-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        routeId: 'default',
        status: 'advanced',
        nextItem: {
          blockId: 'legacy-neural-source',
        },
      });
    }
    const routes = await new SqlNeuralRoamRouteRepository(database as never).loadState();
    expect(routes?.activeRouteId).toBe('default');
    expect(routes?.routes[0]?.seedPool.map((entry) => entry.nodeId)).toContain('legacy-neural-source');
  });

  it('ignores old session-specific neural-roam state after route SQL ownership is active', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await seedNeuralRoamHyperspaceSource(database, 'legacy-neural-source', 'neuralRoamQueue');
    await seedNeuralRoamHyperspaceSource(database, 'backend-neural-source', 'neuralRoamQueue:kept-session');
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'legacy-neural-source': {
          id: 'legacy-neural-source',
          content: 'Legacy source content',
          type: 'p',
        },
        'backend-neural-source': {
          id: 'backend-neural-source',
          content: 'Backend source content',
          type: 'p',
        },
      }),
    });

    const response = await kernel.handle({
      id: 'neural-advance-keeps-backend-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'kept-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'advanced',
        routeId: 'default',
        nextItem: {
          blockId: 'legacy-neural-source',
        },
      });
    }
  });

  it('resets corrupted old neural-roam state into SQL default route state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.setQueueStateValue('neuralRoamQueue', {
      broken: true,
      version: 'not-a-neural-roam-state',
    });
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'neural-advance-corrupted-old-state',
      jsonrpc: '2.0',
      method: 'neural-roam.advance' as never,
      params: [{
        queueType: 'neural-roam',
        sessionId: 'corrupted-import-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        routeId: 'default',
        status: 'exhausted',
        nextItem: null,
        unavailableReason: null,
      });
    }
    const routes = await new SqlNeuralRoamRouteRepository(database as never).loadState();
    expect(routes?.activeRouteId).toBe('default');
    expect(routes?.routes[0]?.metadata.id).toBe('default');
  });

  it('returns deterministic candidate identity for duplicate decision requests', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });
    const payload = {
      blockId: 'block-dup-1',
      content: 'question <> answer',
      blockType: 'p',
      resolvedCardType: 'item',
      source: 'symbol-listener',
      ruleScope: 'all',
      hasParentTopicCard: false,
    } as const;

    const first = await kernel.handle({
      id: 'autocard-decision-dup-1',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [payload],
    });
    const second = await kernel.handle({
      id: 'autocard-decision-dup-2',
      jsonrpc: '2.0',
      method: 'autocard.decision.resolve',
      params: [payload],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in first && 'result' in second) {
      expect(first.result.candidateId).toBe(second.result.candidateId);
      expect(first.result.status).toBe(second.result.status);
    }
  });

  it('deduplicates kernel.transaction.ingest by idempotency key', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-a' }],
        receivedAt: 10,
        idempotencyKey: 'same-key',
      }],
    });
    expect(first).toEqual({
      id: 'ingest-first',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 10,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    const second = await kernel.handle({
      id: 'ingest-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-a' }],
        receivedAt: 10,
        idempotencyKey: 'same-key',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-second',
      jsonrpc: '2.0',
      result: {
        accepted: 0,
        queued: 1,
        receivedAt: 10,
        duplicate: true,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });
  });

  it('dequeues native-riff-remove actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-remove-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'remove-action-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'removeFlashcards',
                blockIDs: ['block-a', 'block-b'],
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-remove-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-remove-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-a', 'block-b'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'remove-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('dequeues native-riff-upsert actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-upsert-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'upsert-action-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'addFlashcards',
                blockIDs: ['block-upsert-a', 'block-upsert-b'],
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-upsert-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-upsert-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-upsert',
          blockIds: ['block-upsert-a', 'block-upsert-b'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'upsert-action-key',
        }],
        remaining: 0,
      },
    });

    const status = await kernel.handle({
      id: 'status-upsert-action',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    if ('result' in status) {
      expect(status.result.ingest).toMatchObject({
        actionQueueLength: 0,
        actionEnqueuedTotal: 1,
        actionDequeuedTotal: 1,
        upsertActionQueuedTotal: 1,
      });
    }
  });

  it('dequeues auto-card-candidates actions parsed from transaction operations', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-action-key',
        transactions: [
          {
            doOperations: [
              { action: 'insert', id: 'block-auto-1' },
              { action: 'update', id: 'block-auto-2' },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'insert', blockId: 'block-auto-1' },
            { action: 'update', blockId: 'block-auto-2' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('prefilters no-marker auto-card insert and update payloads in worker extraction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-prefilter',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-prefilter-key',
        transactions: [
          {
            doOperations: [
              {
                action: 'insert',
                id: 'block-plain-insert',
                data: { new: { content: 'ordinary paragraph without marker' } },
              },
              {
                action: 'update',
                id: 'block-marker-update',
                data: { new: { content: 'question >> answer' } },
              },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-prefilter',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-prefilter',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'update', blockId: 'block-marker-update' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-prefilter-key',
        }],
        remaining: 0,
      },
    });
  });

  it('coalesces auto-card candidate operations for same block in worker extraction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingest = await kernel.handle({
      id: 'ingest-auto-card-coalesce',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'auto-card-coalesce-key',
        transactions: [
          {
            doOperations: [
              { action: 'insert', id: 'block-auto-c1' },
              { action: 'update', id: 'block-auto-c1' },
              { action: 'delete', id: 'block-auto-c1' },
              { action: 'insert', id: 'block-auto-c2' },
            ],
          },
        ],
      }],
    });
    expect('result' in ingest).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-auto-card-coalesce',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-auto-card-coalesce',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'auto-card-candidates',
          operations: [
            { action: 'insert', blockId: 'block-auto-c2' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'auto-card-coalesce-key',
        }],
        remaining: 0,
      },
    });
  });

  it('coalesces mixed dequeue action batch inside worker before dispatch', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const ingestFirst = await kernel.handle({
      id: 'ingest-mixed-1',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'mixed-1',
        transactions: [{
          doOperations: [
            { action: 'removeFlashcards', blockIDs: ['block-rm-1'] },
            { action: 'addFlashcards', blockIDs: ['block-up-1'] },
            { action: 'insert', id: 'block-auto-x' },
          ],
        }],
      }],
    });
    expect('result' in ingestFirst).toBe(true);

    const ingestSecond = await kernel.handle({
      id: 'ingest-mixed-2',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'mixed-2',
        transactions: [{
          doOperations: [
            { action: 'removeFlashcards', blockIDs: ['block-rm-2'] },
            { action: 'addFlashcards', blockIDs: ['block-up-2'] },
            { action: 'delete', id: 'block-auto-x' },
            { action: 'update', id: 'block-auto-y' },
          ],
        }],
      }],
    });
    expect('result' in ingestSecond).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-mixed-coalesced',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 32 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-mixed-coalesced',
      jsonrpc: '2.0',
      result: {
        actions: [
          {
            type: 'native-riff-remove',
            blockIds: ['block-rm-1', 'block-rm-2'],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
          {
            type: 'native-riff-upsert',
            blockIds: ['block-up-1', 'block-up-2'],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
          {
            type: 'auto-card-candidates',
            operations: [
              { action: 'update', blockId: 'block-auto-y' },
            ],
            source: 'ws-main',
            receivedAt: expect.any(Number),
            idempotencyKey: 'mixed-1',
          },
        ],
        remaining: 0,
      },
    });
  });

  it('supports kernel.transaction.requeue and keeps actions in queue', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernel = new BackendKernel({ database });

    const requeue = await kernel.handle({
      id: 'requeue-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.requeue',
      params: [{
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-rq-1'],
          source: 'ws-main',
          receivedAt: 1,
          idempotencyKey: 'rq-1',
        }],
      }],
    });
    expect(requeue).toEqual({
      id: 'requeue-action',
      jsonrpc: '2.0',
      result: {
        requeued: 1,
        queueLength: 1,
        maxQueueLength: 4096,
      },
    });

    const dequeue = await kernel.handle({
      id: 'dequeue-requeued-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-requeued-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-rq-1'],
          source: 'ws-main',
          receivedAt: 1,
          idempotencyKey: 'rq-1',
        }],
        remaining: 0,
      },
    });
  });

  it('restores persisted action queue snapshot across worker restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const databaseA = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelA = new BackendKernel({ database: databaseA });

    const ingest = await kernelA.handle({
      id: 'ingest-persisted-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'persisted-action-key',
        transactions: [{
          doOperations: [{ action: 'removeFlashcards', id: 'block-persist-1' }],
        }],
      }],
    });
    expect('result' in ingest).toBe(true);

    databaseA.dispose();

    const databaseB = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelB = new BackendKernel({ database: databaseB });
    const dequeue = await kernelB.handle({
      id: 'dequeue-persisted-action',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect(dequeue).toEqual({
      id: 'dequeue-persisted-action',
      jsonrpc: '2.0',
      result: {
        actions: [{
          type: 'native-riff-remove',
          blockIds: ['block-persist-1'],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'persisted-action-key',
        }],
        remaining: 0,
      },
    });
  });

  it('restores persisted ingest queue snapshot across worker restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const databaseA = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelA = new BackendKernel({ database: databaseA });

    const ingest = await kernelA.handle({
      id: 'ingest-persisted-inbox',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'persisted-inbox-key',
        transactions: [{ id: 'tx-persist-1' }],
      }],
    });
    expect(ingest).toEqual({
      id: 'ingest-persisted-inbox',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: expect.any(Number),
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 256,
      },
    });

    databaseA.dispose();

    const databaseB = new WorkerSqliteDatabaseService(persistenceBridge);
    const kernelB = new BackendKernel({ database: databaseB });
    const load = await kernelB.handle({
      id: 'load-persisted-inbox',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [],
    });
    expect('result' in load).toBe(true);
    const status = await kernelB.handle({
      id: 'status-persisted-inbox',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    if ('result' in status) {
      expect(status.result.ingest).toMatchObject({
        queueLength: 1,
        queuedTransactions: 1,
        acceptedTotal: 1,
      });
    }
  });

  it('returns explicit unavailable when kernel transaction ingest queue is backpressured', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 1,
    });
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-backpressure-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-1' }],
        receivedAt: 1,
        idempotencyKey: 'k1',
      }],
    });
    expect('result' in first).toBe(true);

    const second = await kernel.handle({
      id: 'ingest-backpressure-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{ id: 'tx-2' }],
        receivedAt: 2,
        idempotencyKey: 'k2',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-backpressure-second',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=1, limit=1)',
      },
    });
  });

  it('drains accepted ingest envelopes when transaction actions are dequeued', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 4,
    });
    const kernel = new BackendKernel({ database });

    const first = await kernel.handle({
      id: 'ingest-drain-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{
          doOperations: [{ action: 'insert', id: 'block-drain-1' }],
        }],
        receivedAt: 1,
        idempotencyKey: 'drain-first',
      }],
    });
    expect('result' in first).toBe(true);

    const dequeue = await kernel.handle({
      id: 'dequeue-drain-first',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 8 }],
    });
    expect('result' in dequeue).toBe(true);

    const second = await kernel.handle({
      id: 'ingest-drain-second',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        transactions: [{
          doOperations: [{ action: 'insert', id: 'block-drain-2' }],
        }],
        receivedAt: 2,
        idempotencyKey: 'drain-second',
      }],
    });
    expect(second).toEqual({
      id: 'ingest-drain-second',
      jsonrpc: '2.0',
      result: {
        accepted: 1,
        queued: 1,
        receivedAt: 2,
        duplicate: false,
        queueLength: 1,
        maxQueueLength: 1,
      },
    });
  });

  it('commits retrieval review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_187_777_000;
    await database.upsertCards([buildCard({ id: 'card-review-1', due: reviewedAt - 10_000 })]);
    await database.runTransaction('seed.sync-metadata', (db) => {
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        [
          'sync_metadata',
          JSON.stringify({
            revision: 12,
            contentHash: 'stale-before-review',
            lastModifiedAt: reviewedAt - 60_000,
            lastModifiedBy: 'storage-phone',
          }),
          reviewedAt - 60_000,
        ],
      );
    });
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-success',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-1', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-review-1',
        committed: true,
        queueType: 'retrieval-practice',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
    expect(database.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM review_events')?.count).toBe(1);
    const metadataRow = database.getOne<{ value_json: string; updated_at: number }>(
      'SELECT value_json, updated_at FROM store_metadata WHERE key = ?',
      ['sync_metadata'],
    );
    expect(metadataRow?.updated_at).toBe(reviewedAt);
    const metadata = JSON.parse(metadataRow?.value_json || '{}') as {
      revision?: number;
      contentHash?: string;
      lastModifiedAt?: number;
      lastModifiedBy?: string;
    };
    expect(metadata).toMatchObject({
      revision: 13,
      lastModifiedAt: reviewedAt,
      lastModifiedBy: 'srs-backend-worker:review.feedback',
    });
    expect(metadata.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(metadata.contentHash).not.toBe('stale-before-review');
  });

  it('persists committed review feedback to the sqlite bridge file on explicit checkpoint', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_187_888_000;
    await database.upsertCards([buildCard({ id: 'card-review-persist', due: reviewedAt - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-persist',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-persist', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });

    expect('result' in response).toBe(true);
    await database.persist();
    const persistedBytes = persistenceBridge.snapshot().bytes;
    expect(persistedBytes?.byteLength).toBeGreaterThan(0);

    const reloadedBridge = createInMemorySqlitePersistenceBridge();
    await reloadedBridge.writeBinary('siyuanmemo.db', persistedBytes!);
    const reloadedDatabase = new WorkerSqliteDatabaseService(reloadedBridge);
    await reloadedDatabase.load();

    expect(reloadedDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-persist'],
    )?.count).toBe(1);
    await expect(database.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      storage: 'non-siyuan',
      pendingCount: 1,
      statusCounts: {
        'projection-applied': 1,
      },
      lastCheckpoint: {
        ok: true,
        cleared: false,
      },
    });
  });

  it('persists formal review feedback to non-SiYuan journal with required sqlite delta durability on the hot path', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const writeJSON = vi.fn(persistenceBridge.writeJSON!.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      writeBinary,
      writeJSON,
    });
    const reviewedAt = 1_779_187_889_000;
    await database.upsertCards([buildCard({ id: 'card-review-journal-hot-path', due: reviewedAt - 10_000 })]);
    await database.persist();
    writeBinary.mockClear();
    writeJSON.mockClear();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-hot-path',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-hot-path',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-hot-path-journal-key',
      }],
    });

    expect('result' in response).toBe(true);
    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result.storage).toMatchObject({
      localIntent: {
        status: 'recorded',
        durable: true,
        storage: 'non-siyuan',
        entryId: 'review-feedback:review-hot-path-journal-key',
        idempotencyKey: 'review-hot-path-journal-key',
        journalStatus: 'projection-applied',
      },
      truthFlush: {
        status: 'pending',
        family: 'review-events',
        syncVisible: false,
        pendingCount: 1,
      },
      sqlProjection: {
        status: 'refresh-required',
        hotPatchable: false,
        refreshRequired: true,
        affectedQueueCount: 1,
      },
      sqlCheckpoint: {
        status: 'not-run',
      },
    });
    expect(writeBinary.mock.calls.some(([path]) => path === 'sqlite-delta-log.v2.open.msgpack')).toBe(true);
    expect(writeBinary.mock.calls.some(([path]) => path === 'siyuanmemo.db')).toBe(false);
    expect(writeJSON.mock.calls.some(([path]) => path === 'sqlite-delta-log.v2.manifest.json')).toBe(true);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastWrite: {
        ok: true,
        classification: 'delta',
        label: 'review.feedback',
        hotPath: true,
        affectedTables: expect.arrayContaining([
          'cards',
          'algorithm_card_state',
          'review_events',
          'domain_sync_operations',
          'store_metadata',
        ]),
      },
    });

    const diagnostics = await kernel.handle({
      id: 'review-feedback-journal-diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.review?.journal).toMatchObject({
        storage: 'non-siyuan',
        version: 1,
        pendingCount: 1,
        statusCounts: {
          'projection-applied': 1,
        },
        backpressure: {
          state: 'ok',
          reason: null,
          nextAction: 'continue',
        },
        lastWrite: {
          ok: true,
          entryId: 'review-feedback:review-hot-path-journal-key',
          cardId: 'card-review-journal-hot-path',
          status: 'prepared',
        },
      });
      expect(diagnostics.result.review?.journal?.pendingBytes).toBeGreaterThan(0);
    }
  });

  it('flushes projection-applied Review journal entries through explicit review.truth.flush', async () => {
    const reviewFeedbackJournalStore = createInMemoryReviewFeedbackJournalStore();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      reviewFeedbackJournalStore,
    });
    const kernel = new BackendKernel({
      database,
      truthFileStore,
    });
    await reviewFeedbackJournalStore.appendEntry({
      id: 'review-feedback:truth-flush-key',
      requestId: null,
      cardId: 'card-truth-flush',
      idempotencyKey: 'truth-flush-key',
      status: 'projection-applied',
      recordedAt: 1_700_000_000_001,
      request: {
        cardId: 'card-truth-flush',
        rating: 3,
        reviewedAt: 1_700_000_000_100,
        idempotencyKey: 'truth-flush-key',
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
      appliedAt: 1_700_000_000_100,
      projectionAppliedAt: 1_700_000_000_101,
      projectionFailedAt: null,
      lastError: null,
    });

    const response = await kernel.handle({
      id: 'review-truth-flush',
      jsonrpc: '2.0',
      method: 'review.truth.flush',
      params: [{
        deviceId: 'device-A',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
        maxSegmentBytes: 4096,
        batchLimit: 8,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
        ok: true,
        journalQueued: 1,
        recordsWritten: 1,
        segmentWritten: true,
        manifestUpdated: true,
        projectionRefreshScheduled: true,
        idempotencyDuplicateSkipped: 0,
        flushedEntryIds: ['review-feedback:truth-flush-key'],
    });
    expect(response.result.segmentPaths[0]).toMatch(
        /^truth\/review-events\/projection-gen-1\/device-device-A\/seg-\d{6}-[a-z0-9-]+\.msgpack$/,
    );
    expect(truthFileStore.binaryFiles.size).toBe(1);
    await expect(reviewFeedbackJournalStore.getStats()).resolves.toMatchObject({
      pendingCount: 0,
      statusCounts: {
        'truth-flushed': 1,
      },
    });

    const diagnostics = await kernel.handle({
      id: 'review-truth-flush-diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.review?.truthFlush).toMatchObject({
        family: 'review-events',
        storage: 'truth-segments',
        last: {
          ok: true,
          journalQueued: 1,
          recordsWritten: 1,
          manifestUpdated: true,
          projectionRefreshScheduled: true,
          idempotencyDuplicateSkipped: 0,
        },
      });
    }
  });

  it('fails truth flush with TRUTH_DEVICE_ID_UNAVAILABLE when local truth identity is missing', async () => {
    const reviewFeedbackJournalStore = createInMemoryReviewFeedbackJournalStore();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const kernel = new BackendKernel({
      database: new WorkerSqliteDatabaseService({
        ...persistenceBridge,
        reviewFeedbackJournalStore,
      }),
      truthFileStore: new MemoryTruthSegmentFileStore(),
    });

    const response = await kernel.handle({
      id: 'review-truth-flush-no-device',
      jsonrpc: '2.0',
      method: 'review.truth.flush',
      params: [{
        deviceId: '',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
      }],
    });

    expect(response).toMatchObject({
      error: {
        code: 'TRUTH_DEVICE_ID_UNAVAILABLE',
      },
    });
  });

  it('backfills existing review_events rows into MessagePack truth and patches SQL truth refs', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const writeJSON = vi.fn(persistenceBridge.writeJSON!.bind(persistenceBridge));
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      writeBinary,
      writeJSON,
    });
    await seedReviewEvent(database, {
      id: 'event-review-backfill-a',
      cardId: 'card-review-backfill-a',
      attemptId: 'attempt-review-backfill-a',
      rating: 4,
      reviewedAt: 1_700_000_000_300,
      commitIdempotencyKey: 'review:key-backfill-a',
      payload: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        schedulerType: 'fsrs-v6',
        sourceBlockId: 'block-review-backfill-a',
      },
    });
    const mainDbWritesBeforeBackfill = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;
    const deltaWritesBeforeBackfill = writeJSON.mock.calls.filter(([path]) => path === 'sqlite-delta-log.v2.manifest.json').length;
    const kernel = new BackendKernel({
      database,
      truthFileStore,
    });

    const response = await kernel.handle({
      id: 'review-truth-backfill',
      jsonrpc: '2.0',
      method: 'review.truth.backfill',
      params: [{
        deviceId: 'device-A',
        generationId: 'projection-gen-backfill',
        schemaVersion: 1,
        maxSegmentBytes: 4096,
        batchLimit: 8,
        sourceId: 'local-sql-test',
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
      ok: true,
      source: 'review_events',
      sqlRowsRead: 1,
      recordsWritten: 1,
      segmentWritten: true,
      manifestUpdated: true,
      projectionRefreshScheduled: true,
      idempotencyDuplicateSkipped: 0,
      backfilledEventIds: ['event-review-backfill-a'],
      duplicateEventIds: [],
      repairRequiredEventIds: [],
      syncVisible: true,
      error: null,
    });
    expect(response.result.segmentPaths[0]).toMatch(
      /^truth\/review-events\/projection-gen-backfill\/device-device-A\/seg-\d{6}-[a-z0-9-]+\.msgpack$/,
    );
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-backfill',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });
    const replay = await truthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records).toMatchObject([{
      family: 'review-events',
      type: 'review.feedback.v1',
      idempotencyKey: 'review:key-backfill-a',
      eventId: 'event-review-backfill-a',
      source: {
        cardId: 'card-review-backfill-a',
        sourceBlockId: 'block-review-backfill-a',
      },
      review: {
        action: 'rating',
        rating: 4,
        scheduler: 'fsrs-v6',
      },
      queue: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
      sqlLineage: {
        sourceId: 'local-sql-test',
        table: 'review_events',
        eventId: 'event-review-backfill-a',
      },
    }]);
    const row = database.getOne<{
      msgpack_ref: string;
      truth_hash: string;
      truth_schema_version: number;
      projection_generation: number;
    }>(
      `SELECT msgpack_ref, truth_hash, truth_schema_version, projection_generation
         FROM review_events
        WHERE id = ?`,
      ['event-review-backfill-a'],
    );
    expect(row).toMatchObject({
      truth_schema_version: 1,
      projection_generation: response.result.at,
    });
    expect(row?.truth_hash).toBeTruthy();
    expect(JSON.parse(row?.msgpack_ref || '{}')).toMatchObject({
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-backfill',
      recordId: 'event-review-backfill-a',
      idempotencyKey: 'review:key-backfill-a',
    });
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(
      mainDbWritesBeforeBackfill,
    );
    expect(writeJSON.mock.calls.filter(([path]) => path === 'sqlite-delta-log.v2.manifest.json').length).toBeGreaterThan(
      deltaWritesBeforeBackfill,
    );
    expect(writeBinary.mock.calls.some(([path]) => path === 'sqlite-delta-log.v2.open.msgpack')).toBe(true);

    const restartedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    await restartedDatabase.init();
    const restartedRow = restartedDatabase.getOne<{ msgpack_ref: string | null }>(
      'SELECT msgpack_ref FROM review_events WHERE id = ?',
      ['event-review-backfill-a'],
    );
    expect(JSON.parse(restartedRow?.msgpack_ref || '{}')).toMatchObject({
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-backfill',
      recordId: 'event-review-backfill-a',
    });

    const diagnostics = await kernel.handle({
      id: 'review-truth-backfill-diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.review?.truthBackfill).toMatchObject({
        family: 'review-events',
        source: 'review_events',
        storage: 'truth-segments',
        pendingSqlRows: 0,
        syncVisible: true,
        last: {
          ok: true,
          recordsWritten: 1,
          syncVisible: true,
        },
      });
    }
  });

  it('does not flush Review truth segments from ordinary review.feedback', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_187_889_000;
    await database.upsertCards([buildCard({ id: 'card-review-no-truth-hot-path', due: reviewedAt - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-no-truth-hot-path',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-no-truth-hot-path',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-no-truth-hot-path-key',
      }],
    });

    expect('result' in response).toBe(true);
    expect(truthFileStore.binaryFiles.size).toBe(0);
    expect(truthFileStore.jsonFiles.size).toBe(0);
  });

  it('stores Review truth v2 in the journal, flushes it asynchronously, and rebuilds card state from after-card truth', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_188_410_000;
    const card = buildCard({
      id: 'card-review-truth-v2',
      blockId: 'block-review-truth-v2',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      reps: 4,
      stability: 4,
      difficulty: 5,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'review truth v2 source card' },
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'retrieval-practice',
      policyHash: 'policy-truth-v2',
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt - 1_000,
    });
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'block-review-truth-v2': {
          id: 'block-review-truth-v2',
          content: 'Review truth v2 source block content',
          type: 'p',
          root_id: 'doc-review-truth-v2',
          attrs: {},
        },
      }),
    });

    const feedback = await kernel.handle({
      id: 'review-feedback-truth-v2',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 4,
        reviewedAt,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-truth-v2',
        idempotencyKey: 'review-truth-v2-key',
      }],
    });
    if (!('result' in feedback)) {
      throw new Error(feedback.error.message);
    }
    expect(feedback.result).toMatchObject({
      committed: true,
      storage: {
        localIntent: {
          durable: true,
          journalStatus: 'projection-applied',
        },
        truthFlush: {
          status: 'pending',
          syncVisible: false,
        },
      },
    });

    const journalEntries = await persistenceBridge.reviewFeedbackJournalStore.listEntries();
    expect(journalEntries).toHaveLength(1);
    expect(journalEntries[0]).toMatchObject({
      id: 'review-feedback:review-truth-v2-key',
      status: 'projection-applied',
      truthCandidate: {
        family: 'review-events',
        type: 'review.feedback.v2',
        idempotencyKey: 'review-truth-v2-key',
        source: {
          cardId: card.id,
          blockId: 'block-review-truth-v2',
        },
        queue: {
          queueType: 'retrieval-practice',
          queueMode: 'formal',
          commitPolicy: 'write-schedule',
        },
        scheduler: {
          schedulerType: 'fsrs-v6',
        },
        beforeCard: expect.objectContaining({
          id: card.id,
          due: card.due,
          reps: card.reps,
          lastReview: card.lastReview,
        }),
        afterCard: expect.objectContaining({
          id: card.id,
          blockId: 'block-review-truth-v2',
          lastReview: reviewedAt,
        }),
        projection: {
          generation: expect.any(Number),
          policyHash: 'policy-truth-v2',
        },
      },
    });

    const flush = await kernel.handle({
      id: 'review-truth-v2-flush',
      jsonrpc: '2.0',
      method: 'review.truth.flush',
      params: [{
        deviceId: 'device-v2',
        generationId: 'projection-gen-truth-v2',
        schemaVersion: 1,
        maxSegmentBytes: 16_384,
        batchLimit: 8,
      }],
    });
    if (!('result' in flush)) {
      throw new Error(flush.error.message);
    }
    expect(flush.result).toMatchObject({
      ok: true,
      journalQueued: 1,
      recordsWritten: 1,
      flushedEntryIds: ['review-feedback:review-truth-v2-key'],
    });
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'review-events',
      deviceId: 'device-v2',
      generationId: 'projection-gen-truth-v2',
      schemaVersion: 1,
      maxSegmentBytes: 16_384,
    });
    const replay = await truthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records).toMatchObject([{
      family: 'review-events',
      type: 'review.feedback.v2',
      idempotencyKey: 'review-truth-v2-key',
      source: {
        cardId: card.id,
        blockId: 'block-review-truth-v2',
      },
      beforeCard: expect.objectContaining({
        id: card.id,
        due: card.due,
      }),
      afterCard: expect.objectContaining({
        id: card.id,
        lastReview: reviewedAt,
      }),
    }]);

    const rebuiltBridge = createInMemorySqlitePersistenceBridge();
    const rebuiltDatabase = new WorkerSqliteDatabaseService(rebuiltBridge);
    const rebuiltKernel = new BackendKernel({
      database: rebuiltDatabase,
      truthFileStore,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'block-review-truth-v2': {
          id: 'block-review-truth-v2',
          content: 'Review truth v2 source block content',
          type: 'p',
          root_id: 'doc-review-truth-v2',
          attrs: {},
        },
      }),
    });
    const rebuild = await rebuiltKernel.handle({
      id: 'review-truth-v2-rebuild',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-review-truth-v2',
        cause: 'sql-deleted',
        families: ['cards', 'review-event-indexes'],
        deviceId: 'device-v2',
        generationId: 'projection-gen-truth-v2',
        schemaVersion: 1,
        maxSegmentBytes: 16_384,
      }],
    });
    if (!('result' in rebuild)) {
      throw new Error(rebuild.error.message);
    }
    expect(rebuild.result).toMatchObject({
      status: 'ready',
      rowsWritten: 2,
      families: expect.arrayContaining([
        expect.objectContaining({ family: 'cards', rowsWritten: 1 }),
        expect.objectContaining({ family: 'review-event-indexes', rowsWritten: 1 }),
      ]),
    });
    const updatedDue = Number((feedback.result.updatedCard as { due?: number } | null)?.due);
    expect(rebuiltDatabase.getOne<{
      id: string;
      block_id: string;
      due: number;
      last_review: number;
      scheduler_type: string | null;
    }>(
      'SELECT id, block_id, due, last_review, scheduler_type FROM cards WHERE id = ?',
      [card.id],
    )).toMatchObject({
      id: card.id,
      block_id: 'block-review-truth-v2',
      due: Number.isFinite(updatedDue) ? updatedDue : expect.any(Number),
      last_review: reviewedAt,
      scheduler_type: 'fsrs-v6',
    });
    expect(rebuiltDatabase.getOne<{
      card_id: string;
      rating: number;
      reviewed_at: number;
      commit_idempotency_key: string;
      payload_json: string;
    }>(
      'SELECT card_id, rating, reviewed_at, commit_idempotency_key, payload_json FROM review_events WHERE commit_idempotency_key = ?',
      ['review-truth-v2-key'],
    )).toMatchObject({
      card_id: card.id,
      rating: 4,
      reviewed_at: reviewedAt,
      commit_idempotency_key: 'review-truth-v2-key',
    });
  });

  it('reports Review feedback SQL projection patch separately from pending truth flush and checkpoint state', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_187_889_050;
    const reviewed = buildCard({ id: 'card-review-storage-patch', blockId: 'block-review-storage-patch', due: reviewedAt - 10_000 });
    await database.upsertCards([reviewed]);
    await seedQueueProjection(database, {
      queueType: 'retrieval-practice',
      policyHash: 'policy-storage',
      generation: 3,
      rows: [reviewed],
      updatedAt: reviewedAt - 1_000,
    });
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-storage-patch',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-storage-patch',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        projectionGeneration: 3,
        projectionPolicyHash: 'policy-storage',
        idempotencyKey: 'review-storage-patch-key',
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result.storage).toMatchObject({
      localIntent: {
        status: 'recorded',
        durable: true,
        entryId: 'review-feedback:review-storage-patch-key',
        journalStatus: 'projection-applied',
      },
      truthFlush: {
        status: 'pending',
        syncVisible: false,
        pendingCount: 1,
      },
      sqlProjection: {
        status: 'patched',
        hotPatchable: true,
        refreshRequired: false,
        affectedQueueCount: 1,
        projectionGeneration: 4,
      },
      sqlCheckpoint: {
        status: 'not-run',
        hotPath: false,
        cause: null,
        initiator: null,
      },
    });
    expect(response.result.queueImpact).toMatchObject({
      hotPatchable: true,
      refreshRequired: false,
    });
  });

  it('returns backend unavailable when projection rebuild has no truth segment store', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'projection-rebuild-no-truth-store',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        families: ['review-event-indexes'],
        deviceId: 'device-A',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
      }],
    });

    expect(response).toMatchObject({
      id: 'projection-rebuild-no-truth-store',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
    });
    if ('error' in response) {
      expect(response.error.message).toContain('truth segment file store');
    }
  });

  it('reports repair-required when projection rebuild finds invalid MessagePack truth manifest', async () => {
    const truthFileStore = new MemoryTruthSegmentFileStore();
    truthFileStore.jsonFiles.set('truth/review-events/projection-gen-corrupt/device-device-A/manifest.v1.json', {
      version: 1,
      path: 'truth/review-events/projection-gen-corrupt/device-device-A/manifest.v1.json',
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'projection-gen-corrupt',
      schemaVersion: 1,
      segments: [],
      updatedAt: 1_700_000_000_000,
    });
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveNeuralGraphQuery: createNeuralGraphResolver({}),
    });

    const response = await kernel.handle({
      id: 'projection-rebuild-invalid-truth-manifest',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-invalid-truth-manifest',
        cause: 'sql-stale',
        families: ['review-event-indexes'],
        deviceId: 'device-A',
        generationId: 'projection-gen-corrupt',
        schemaVersion: 1,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
      status: 'repair-required',
      rebuildId: 'rebuild-invalid-truth-manifest',
      rowsWritten: 0,
      families: [{
        family: 'review-event-indexes',
        status: 'repair-required',
        unavailableReason: 'validation-failed',
        rowsWritten: 0,
      }],
    });
    expect(database.getStatus().initialized).toBe(false);
  });

  it('rebuilds review event SQL indexes from MessagePack truth and SiYuan source reads', async () => {
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });
    await truthStore.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      journalEntryId: 'journal-projection-a',
      idempotencyKey: 'projection-key-a',
      cardId: 'card-projection-a',
      rating: 3,
      reviewedAt: 1_700_000_000_100,
      logicalTime: 1_700_000_000_100,
      recordedAt: 1_700_000_000_001,
      source: {
        cardId: 'card-projection-a',
        blockId: 'block-projection-a',
        sourceBlockId: 'block-projection-a',
      },
      review: {
        action: 'rating',
        rating: 3,
        reviewedAt: 1_700_000_000_100,
        scheduler: 'fsrs-v6',
      },
      memory: {
        projectionGeneration: 7,
      },
      queue: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    }]);
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'block-projection-a': {
        id: 'block-projection-a',
        content: 'Source content must stay out of review_events payload_json',
        type: 'p',
        root_id: 'doc-projection-a',
      },
    });
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'projection-rebuild-review-events',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-review-events',
        cause: 'sql-missing',
        families: ['review-event-indexes'],
        deviceId: 'device-A',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
      status: 'ready',
      rebuildId: 'rebuild-review-events',
      rowsRead: 1,
      rowsWritten: 1,
      sourceReadCount: 1,
      missingSourceIds: [],
      families: [{
        family: 'review-event-indexes',
        status: 'ready',
        rowsRead: 1,
        rowsWritten: 1,
        sourceReadCount: 1,
        missingSourceIds: [],
      }],
    });
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'fetchBlockData',
      blockId: 'block-projection-a',
    }));
    const row = database.getOne<{
      card_id: string;
      rating: number;
      commit_idempotency_key: string;
      msgpack_ref: string;
      truth_schema_version: number;
      projection_generation: number;
      payload_json: string;
    }>(
      `SELECT card_id, rating, commit_idempotency_key, msgpack_ref,
              truth_schema_version, projection_generation, payload_json
         FROM review_events
        WHERE card_id = ?`,
      ['card-projection-a'],
    );
    expect(row).toMatchObject({
      card_id: 'card-projection-a',
      rating: 3,
      commit_idempotency_key: 'projection-key-a',
      truth_schema_version: 1,
      projection_generation: response.result.projectionGeneration,
    });
    expect(JSON.parse(row?.msgpack_ref || '{}')).toMatchObject({
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      idempotencyKey: 'projection-key-a',
    });
    expect(row?.payload_json).not.toContain('Source content must stay out');
  });

  it('reports missing SiYuan source during projection rebuild without synthesizing rows', async () => {
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-missing-source',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });
    await truthStore.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      journalEntryId: 'journal-missing-source',
      idempotencyKey: 'projection-key-missing-source',
      cardId: 'card-missing-source',
      rating: 2,
      reviewedAt: 1_700_000_000_200,
      logicalTime: 1_700_000_000_200,
      recordedAt: 1_700_000_000_002,
      source: {
        cardId: 'card-missing-source',
        blockId: 'block-missing-source',
        sourceBlockId: 'block-missing-source',
      },
      review: {
        action: 'rating',
        rating: 2,
        reviewedAt: 1_700_000_000_200,
      },
      memory: {
        projectionGeneration: 8,
      },
    }]);
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({});
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'projection-rebuild-missing-source',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-missing-source',
        cause: 'source-missing',
        families: ['review-event-indexes'],
        deviceId: 'device-A',
        generationId: 'projection-gen-missing-source',
        schemaVersion: 1,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
      status: 'unavailable',
      missingSourceIds: ['block-missing-source'],
      families: [{
        family: 'review-event-indexes',
        status: 'unavailable',
        unavailableReason: 'missing-source',
        rowsWritten: 0,
        missingSourceIds: ['block-missing-source'],
      }],
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-missing-source'],
    )?.count).toBe(0);
  });

  it('rebuilds card projections after deleted SQL from synced card memory truth and SiYuan source', async () => {
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'card-memory-facts',
      deviceId: 'device-remote',
      generationId: 'projection-gen-cards',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });
    const longSourceContent = 'Remote source content used for projection rebuild. Full source body must stay owned by SiYuan blocks.';
    await truthStore.appendRecords([
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.created.v1',
        idempotencyKey: 'card:create:remote-a',
        logicalTime: 1_700_000_010_000,
        recordedAt: 1_700_000_010_001,
        source: {
          cardId: 'card-remote-a',
          blockId: 'block-remote-a',
          sourceBlockId: 'block-remote-a',
          xiuyuanId: 'xy-remote-a',
          cardFaceId: 'face-remote-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-remote-a',
          lineage: {
            type: 'concept',
            state: CardState.New,
            due: 1_700_086_400_000,
            priority: 17,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_010_000,
            schedulerType: 'fsrs-v6',
            tags: ['remote', 'synced'],
            cardTypeMarker: 'concept',
          },
        },
      },
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'source-binding.created.v1',
        idempotencyKey: 'binding:create:remote-a',
        logicalTime: 1_700_000_020_000,
        recordedAt: 1_700_000_020_001,
        source: {
          cardId: 'card-remote-a',
          blockId: 'block-remote-a',
          sourceBlockId: 'block-remote-a',
          xiuyuanId: 'xy-remote-a',
          cardFaceId: 'face-remote-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-remote-a',
          lineage: {
            xiuyuanId: 'xy-remote-a',
            sourceHash: 'source-hash-remote-a',
          },
        },
      },
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-face.created.v1',
        idempotencyKey: 'face:create:remote-a',
        logicalTime: 1_700_000_030_000,
        recordedAt: 1_700_000_030_001,
        source: {
          cardId: 'card-remote-a',
          blockId: 'block-remote-a',
          sourceBlockId: 'block-remote-a',
          xiuyuanId: 'xy-remote-a',
          cardFaceId: 'face-remote-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-remote-a',
          lineage: {
            faceKey: { ruleId: 'concept-definition', faceIndex: 0 },
            cardTypeMarker: 'concept',
          },
        },
      },
    ]);
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'block-remote-a': {
        id: 'block-remote-a',
        content: longSourceContent,
        type: 'p',
        root_id: 'doc-remote-a',
      },
    });
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveNeuralGraphQuery,
    });

    const response = await kernel.handle({
      id: 'projection-rebuild-cards',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-cards-after-sql-delete',
        cause: 'sql-deleted',
        families: ['cards'],
        deviceId: 'device-remote',
        generationId: 'projection-gen-cards',
        schemaVersion: 1,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
      status: 'ready',
      rebuildId: 'rebuild-cards-after-sql-delete',
      rowsRead: 3,
      rowsWritten: 1,
      sourceReadCount: 1,
      missingSourceIds: [],
      families: [{
        family: 'cards',
        status: 'ready',
        rowsRead: 3,
        rowsWritten: 1,
        sourceReadCount: 1,
        missingSourceIds: [],
      }],
    });
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'fetchBlockData',
      blockId: 'block-remote-a',
    }));
    const row = database.getOne<{
      id: string;
      block_id: string;
      xiuyuan_id: string;
      type: string;
      state: number;
      due: number;
      priority: number;
      scheduler_type: string;
      root_id: string;
      content_text: string;
      search_text: string;
      card_type_marker: string;
      source_exists: number;
      msgpack_ref: string;
      truth_hash: string;
      truth_schema_version: number;
      projection_generation: number;
      source_hash: string;
      payload_json: string;
      dto_json: string | null;
    }>(
      `SELECT id, block_id, xiuyuan_id, type, state, due, priority, scheduler_type,
              root_id, content_text, search_text, card_type_marker, source_exists,
              msgpack_ref, truth_hash, truth_schema_version, projection_generation,
              source_hash, payload_json, dto_json
         FROM cards
        WHERE id = ?`,
      ['card-remote-a'],
    );
    expect(row).toMatchObject({
      id: 'card-remote-a',
      block_id: 'block-remote-a',
      xiuyuan_id: 'xy-remote-a',
      type: 'concept',
      state: CardState.New,
      due: 1_700_086_400_000,
      priority: 17,
      scheduler_type: 'a-factor-v2',
      root_id: 'doc-remote-a',
      content_text: longSourceContent.slice(0, 80),
      search_text: longSourceContent.toLowerCase().slice(0, 80),
      card_type_marker: 'concept',
      source_exists: 1,
      truth_schema_version: 1,
      projection_generation: response.result.projectionGeneration,
      source_hash: 'source-hash-remote-a',
    });
    expect(JSON.parse(row?.msgpack_ref || '{}')).toMatchObject({
      family: 'card-memory-facts',
      deviceId: 'device-remote',
      generationId: 'projection-gen-cards',
      idempotencyKey: 'face:create:remote-a',
    });
    expect(row?.truth_hash).toBeTruthy();
    expect(row?.payload_json).not.toContain('Full source body must stay owned');
    expect(row?.dto_json || '').not.toContain('Full source body must stay owned');
  });

  it('rebuilds Xiuyuan binding from allowlisted source attrs during card projection rebuild', async () => {
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const truthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'card-memory-facts',
      deviceId: 'device-attrs',
      generationId: 'projection-gen-card-attrs',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });
    await truthStore.appendRecords([
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.created.v1',
        idempotencyKey: 'card:create:attrs-a',
        logicalTime: 1_700_000_040_000,
        recordedAt: 1_700_000_040_001,
        source: {
          cardId: 'card-attrs-a',
          blockId: 'block-attrs-a',
          sourceBlockId: 'block-attrs-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-attrs-a',
          lineage: {
            type: 'item',
            state: CardState.New,
            due: 1_700_086_500_000,
            priority: 23,
            createdAt: 1_700_000_040_000,
            updatedAt: 1_700_000_040_000,
          },
        },
      },
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'source-binding.created.v1',
        idempotencyKey: 'binding:create:attrs-a',
        logicalTime: 1_700_000_050_000,
        recordedAt: 1_700_000_050_001,
        source: {
          cardId: 'card-attrs-a',
          blockId: 'block-attrs-a',
          sourceBlockId: 'block-attrs-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-attrs-a',
          lineage: {},
        },
      },
    ]);
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      truthFileStore,
      resolveNeuralGraphQuery: createNeuralGraphResolver({
        'block-attrs-a': {
          id: 'block-attrs-a',
          content: 'Attr-bound source content',
          type: 'p',
          root_id: 'doc-attrs-a',
          attrs: {
            'custom-xiuyuan-id': 'xy-from-allowlisted-attr',
            'custom-fsrs-due': '9999999999999',
          },
        },
      }),
    });

    const response = await kernel.handle({
      id: 'projection-rebuild-card-attrs',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-card-attrs',
        cause: 'sql-missing',
        families: ['cards'],
        deviceId: 'device-attrs',
        generationId: 'projection-gen-card-attrs',
        schemaVersion: 1,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result.status).toBe('ready');
    const row = database.getOne<{
      xiuyuan_id: string;
      due: number;
      scheduler_type: string;
      payload_json: string;
    }>(
      'SELECT xiuyuan_id, due, scheduler_type, payload_json FROM cards WHERE id = ?',
      ['card-attrs-a'],
    );
    expect(row).toMatchObject({
      xiuyuan_id: 'xy-from-allowlisted-attr',
      due: 1_700_086_500_000,
      scheduler_type: 'fsrs-v6',
    });
    expect(row?.payload_json).not.toContain('custom-fsrs-due');
  });

  it('rebuilds supported projections on a second device with deleted SQL after synced truth arrives', async () => {
    const truthFileStore = new MemoryTruthSegmentFileStore();
    const reviewTruthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'review-events',
      deviceId: 'device-origin',
      generationId: 'projection-gen-second-device',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });
    const cardTruthStore = createMessagePackTruthSegmentStore({
      fileStore: truthFileStore,
      family: 'card-memory-facts',
      deviceId: 'device-origin',
      generationId: 'projection-gen-second-device',
      schemaVersion: 1,
      maxSegmentBytes: 4096,
    });

    await reviewTruthStore.appendRecords([{
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      journalEntryId: 'journal-second-device-a',
      idempotencyKey: 'review:second-device-a',
      cardId: 'card-second-device-a',
      rating: 4,
      reviewedAt: 1_700_000_200_000,
      logicalTime: 1_700_000_200_000,
      recordedAt: 1_700_000_200_001,
      source: {
        cardId: 'card-second-device-a',
        blockId: 'block-second-device-a',
        sourceBlockId: 'block-second-device-a',
      },
      review: {
        action: 'rating',
        rating: 4,
        reviewedAt: 1_700_000_200_000,
        scheduler: 'fsrs-v6',
      },
      memory: {
        baseMemoryHash: 'memory-second-device-before',
        afterMemoryHash: 'memory-second-device-after',
        projectionGeneration: 3,
      },
      queue: {
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
      },
    }]);

    await cardTruthStore.appendRecords([
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.created.v1',
        idempotencyKey: 'card:create:second-device-a',
        logicalTime: 1_700_000_100_000,
        recordedAt: 1_700_000_100_001,
        source: {
          cardId: 'card-second-device-a',
          blockId: 'block-second-device-a',
          sourceBlockId: 'block-second-device-a',
          cardFaceId: 'face-second-device-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-second-device-before',
          lineage: {
            type: 'item',
            state: CardState.Review,
            due: 1_700_086_600_000,
            priority: 31,
            reps: 2,
            lastReview: 1_700_000_000_000,
            createdAt: 1_700_000_050_000,
            updatedAt: 1_700_000_100_000,
            schedulerType: 'fsrs-v6',
            tags: ['synced'],
          },
        },
      },
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'source-binding.created.v1',
        idempotencyKey: 'binding:create:second-device-a',
        logicalTime: 1_700_000_110_000,
        recordedAt: 1_700_000_110_001,
        source: {
          cardId: 'card-second-device-a',
          blockId: 'block-second-device-a',
          sourceBlockId: 'block-second-device-a',
          xiuyuanId: 'xy-second-device-a',
          cardFaceId: 'face-second-device-a',
          sourceHash: 'source-hash-second-device-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-second-device-before',
          lineage: {
            xiuyuanId: 'xy-second-device-a',
            sourceHash: 'source-hash-second-device-a',
          },
        },
      },
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-face.created.v1',
        idempotencyKey: 'face:create:second-device-a',
        logicalTime: 1_700_000_120_000,
        recordedAt: 1_700_000_120_001,
        source: {
          cardId: 'card-second-device-a',
          blockId: 'block-second-device-a',
          sourceBlockId: 'block-second-device-a',
          xiuyuanId: 'xy-second-device-a',
          cardFaceId: 'face-second-device-a',
        },
        memory: {
          schedulerOwner: 'fsrs-v6',
          memoryHash: 'memory-second-device-before',
          lineage: {
            faceKey: { ruleId: 'basic-front', faceIndex: 0 },
          },
        },
      },
    ]);

    const secondDeviceBridge = createInMemorySqlitePersistenceBridge();
    expect(secondDeviceBridge.snapshot().bytes).toBeNull();
    const secondDeviceDatabase = new WorkerSqliteDatabaseService(secondDeviceBridge);
    await secondDeviceDatabase.init();
    expect(secondDeviceDatabase.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM cards')?.count).toBe(0);
    expect(secondDeviceDatabase.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM review_events')?.count).toBe(0);

    const resolveNeuralGraphQuery = createNeuralGraphResolver({
      'block-second-device-a': {
        id: 'block-second-device-a',
        content: 'Second-device source block content from synced SiYuan data with a long body that must stay source-owned and outside plugin truth payload storage',
        type: 'p',
        root_id: 'doc-second-device-a',
        attrs: {
          'custom-xiuyuan-id': 'xy-second-device-a',
          'custom-fsrs-due': '9999999999999',
        },
      },
    });
    const secondDeviceKernel = new BackendKernel({
      database: secondDeviceDatabase,
      truthFileStore,
      resolveNeuralGraphQuery,
    });

    const response = await secondDeviceKernel.handle({
      id: 'projection-rebuild-second-device',
      jsonrpc: '2.0',
      method: 'storage.projection.rebuild',
      params: [{
        rebuildId: 'rebuild-second-device-deleted-sql',
        cause: 'sql-deleted',
        families: ['review-event-indexes', 'cards'],
        deviceId: 'device-origin',
        generationId: 'projection-gen-second-device',
        schemaVersion: 1,
      }],
    });

    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result).toMatchObject({
      status: 'ready',
      rebuildId: 'rebuild-second-device-deleted-sql',
      cause: 'sql-deleted',
      rowsRead: 4,
      rowsWritten: 2,
      sourceReadCount: 1,
      missingSourceIds: [],
      families: [
        {
          family: 'review-event-indexes',
          status: 'ready',
          rowsRead: 1,
          rowsWritten: 1,
          sourceReadCount: 1,
        },
        {
          family: 'cards',
          status: 'ready',
          rowsRead: 3,
          rowsWritten: 1,
          sourceReadCount: 1,
        },
      ],
    });
    expect(resolveNeuralGraphQuery).toHaveBeenCalledTimes(1);
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'fetchBlockData',
      blockId: 'block-second-device-a',
    }));

    const cardRow = secondDeviceDatabase.getOne<{
      id: string;
      xiuyuan_id: string;
      root_id: string;
      content_text: string;
      due: number;
      msgpack_ref: string;
      source_hash: string;
      payload_json: string;
    }>(
      `SELECT id, xiuyuan_id, root_id, content_text, due, msgpack_ref, source_hash, payload_json
         FROM cards
        WHERE id = ?`,
      ['card-second-device-a'],
    );
    expect(cardRow).toMatchObject({
      id: 'card-second-device-a',
      xiuyuan_id: 'xy-second-device-a',
      root_id: 'doc-second-device-a',
      content_text: 'Second-device source block content from synced SiYuan data with a long body that',
      due: 1_700_086_600_000,
      source_hash: 'source-hash-second-device-a',
    });
    expect(JSON.parse(cardRow?.msgpack_ref || '{}')).toMatchObject({
      family: 'card-memory-facts',
      deviceId: 'device-origin',
      generationId: 'projection-gen-second-device',
      idempotencyKey: 'face:create:second-device-a',
    });
    expect(JSON.parse(cardRow?.payload_json || '{}')).toMatchObject({
      projectionKind: 'messagepack-card-projection',
      cardId: 'card-second-device-a',
      blockId: 'block-second-device-a',
    });
    expect(cardRow?.payload_json).not.toContain('custom-fsrs-due');
    expect(cardRow?.payload_json).not.toContain('must stay source-owned and outside plugin truth payload storage');

    const reviewRow = secondDeviceDatabase.getOne<{
      card_id: string;
      rating: number;
      commit_idempotency_key: string;
      msgpack_ref: string;
      projection_generation: number;
      payload_json: string;
    }>(
      `SELECT card_id, rating, commit_idempotency_key, msgpack_ref, projection_generation, payload_json
         FROM review_events
        WHERE card_id = ?`,
      ['card-second-device-a'],
    );
    expect(reviewRow).toMatchObject({
      card_id: 'card-second-device-a',
      rating: 4,
      commit_idempotency_key: 'review:second-device-a',
      projection_generation: response.result.projectionGeneration,
    });
    expect(JSON.parse(reviewRow?.msgpack_ref || '{}')).toMatchObject({
      family: 'review-events',
      deviceId: 'device-origin',
      generationId: 'projection-gen-second-device',
      idempotencyKey: 'review:second-device-a',
    });
    expect(JSON.parse(reviewRow?.payload_json || '{}')).toMatchObject({
      projectionKind: 'messagepack-review-event-index',
      cardId: 'card-second-device-a',
      commitIdempotencyKey: 'review:second-device-a',
    });
    expect(reviewRow?.payload_json).not.toContain('baseMemoryHash');
    expect(reviewRow?.payload_json).not.toContain('afterMemoryHash');
  });

  it('appends one review journal entry without reading or rewriting existing pending entries', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const journalEntries = new Map<string, unknown>();
    let appendEntryCalls = 0;
    let readSnapshotCalls = 0;
    let writeSnapshotCalls = 0;
    let forbidFullSnapshot = false;
    const clone = <T>(value: T): T => structuredClone(value);
    const pendingBytes = () => {
      const value = JSON.stringify(Array.from(journalEntries.values()));
      return new TextEncoder().encode(value).byteLength;
    };
    const journalStore = {
      storage: 'non-siyuan' as const,
      async appendEntry(entry: unknown) {
        appendEntryCalls += 1;
        const id = typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string'
          ? (entry as { id: string }).id
          : `entry-${appendEntryCalls}`;
        journalEntries.set(id, clone(entry));
        return {
          entryCount: journalEntries.size,
          pendingCount: journalEntries.size,
          pendingBytes: pendingBytes(),
          updatedAt: Date.now(),
        };
      },
      async listEntries() {
        return Array.from(journalEntries.values()).map((entry) => clone(entry));
      },
      async listPendingEntries() {
        return Array.from(journalEntries.values()).map((entry) => clone(entry));
      },
      async getStats() {
        return {
          entryCount: journalEntries.size,
          pendingCount: journalEntries.size,
          pendingBytes: pendingBytes(),
          updatedAt: Date.now(),
        };
      },
      async clearEntries() {
        journalEntries.clear();
        return {
          entryCount: 0,
          pendingCount: 0,
          pendingBytes: 0,
          updatedAt: Date.now(),
        };
      },
      async updateEntryStatus(id: string, status: string, patch: unknown) {
        const current = journalEntries.get(id);
        if (typeof current === 'object' && current !== null) {
          journalEntries.set(id, {
            ...current,
            ...(typeof patch === 'object' && patch !== null ? patch : {}),
            status,
          });
        }
        return {
          entryCount: journalEntries.size,
          pendingCount: journalEntries.size,
          pendingBytes: pendingBytes(),
          updatedAt: Date.now(),
          oldestPendingAt: reviewedAt - 10_000,
          statusCounts: { [status]: 1 },
        };
      },
      async listEntriesByStatus(status: string, limit = 100) {
        return Array.from(journalEntries.values())
          .filter((entry) => typeof entry === 'object' && entry !== null && (entry as { status?: unknown }).status === status)
          .slice(0, limit)
          .map((entry) => clone(entry));
      },
      async readSnapshot() {
        readSnapshotCalls += 1;
        if (!forbidFullSnapshot) {
          return {
            version: 1,
            entries: [],
            updatedAt: 0,
          };
        }
        throw new Error('full review journal snapshot read is forbidden on feedback hot path');
      },
      async writeSnapshot() {
        writeSnapshotCalls += 1;
        if (!forbidFullSnapshot) {
          return;
        }
        throw new Error('full review journal snapshot write is forbidden on feedback hot path');
      },
    };
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      reviewFeedbackJournalStore: journalStore,
    });
    const reviewedAt = 1_779_187_889_125;
    await database.upsertCards([buildCard({ id: 'card-review-journal-indexed', due: reviewedAt - 10_000 })]);
    await database.persist();
    for (let index = 0; index < 10_000; index += 1) {
      journalEntries.set(`existing-${index}`, {
        id: `existing-${index}`,
        cardId: `existing-card-${index}`,
        recordedAt: reviewedAt - index - 1,
        request: {
          cardId: `existing-card-${index}`,
          rating: 3,
          reviewedAt: reviewedAt - index - 1,
          queueType: 'retrieval-practice',
          idempotencyKey: `existing-key-${index}`,
        },
        appliedAt: null,
      });
    }
    appendEntryCalls = 0;
    readSnapshotCalls = 0;
    writeSnapshotCalls = 0;
    forbidFullSnapshot = true;
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-indexed',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-indexed',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-journal-indexed-key',
      }],
    });

    expect('result' in response).toBe(true);
    expect(appendEntryCalls).toBe(1);
    expect(readSnapshotCalls).toBe(0);
    expect(writeSnapshotCalls).toBe(0);
    expect(journalEntries.has('review-feedback:review-journal-indexed-key')).toBe(true);
    expect(journalEntries.get('review-feedback:review-journal-indexed-key')).toMatchObject({
      status: 'projection-applied',
    });
    expect(journalEntries.size).toBe(10_001);
  });

  it('fails review feedback closed when review journal backpressure threshold is exceeded', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const reviewedAt = 1_779_187_889_175;
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      reviewFeedbackJournalBackpressure: {
        maxPendingCount: 1,
        maxPendingBytes: 1_000_000,
        maxOldestPendingAgeMs: 86_400_000,
      },
    });
    await database.upsertCards([buildCard({
      id: 'card-review-journal-backpressure',
      due: reviewedAt - 10_000,
      reps: 3,
    })]);
    await persistenceBridge.reviewFeedbackJournalStore.appendEntry({
      id: 'existing-pressure-entry',
      cardId: 'existing-pressure-card',
      idempotencyKey: 'existing-pressure-key',
      status: 'projection-applied',
      recordedAt: reviewedAt - 1_000,
      request: {
        cardId: 'existing-pressure-card',
        rating: 3,
        reviewedAt: reviewedAt - 1_000,
        queueType: 'retrieval-practice',
        idempotencyKey: 'existing-pressure-key',
      },
      appliedAt: reviewedAt - 900,
    });
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-backpressure',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-backpressure',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-journal-backpressure-key',
      }],
    });

    expect(response).toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
    });
    expect(response.error?.message).toContain('review.feedback non-SiYuan journal backpressure');
    await expect(database.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      backpressure: {
        state: 'unavailable',
        reason: 'pending-count',
        nextAction: 'flush-or-checkpoint',
      },
      pendingCount: 1,
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-journal-backpressure'],
    )?.count).toBe(0);
    expect((await database.getCard('card-review-journal-backpressure'))?.reps).toBe(3);
  });

  it('fails review feedback closed when review journal pending bytes threshold is exceeded', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const reviewedAt = 1_779_187_889_190;
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      reviewFeedbackJournalBackpressure: {
        maxPendingCount: 100,
        maxPendingBytes: 128,
        maxOldestPendingAgeMs: 86_400_000,
      },
    });
    await database.upsertCards([buildCard({
      id: 'card-review-journal-bytes-pressure',
      due: reviewedAt - 10_000,
      reps: 3,
    })]);
    await persistenceBridge.reviewFeedbackJournalStore.appendEntry({
      id: 'existing-bytes-pressure-entry',
      cardId: 'existing-bytes-pressure-card',
      idempotencyKey: 'existing-bytes-pressure-key',
      status: 'projection-applied',
      recordedAt: reviewedAt - 1_000,
      request: {
        cardId: 'existing-bytes-pressure-card',
        rating: 3,
        reviewedAt: reviewedAt - 1_000,
        queueType: 'retrieval-practice',
        idempotencyKey: 'existing-bytes-pressure-key',
        diagnosticPayload: 'x'.repeat(1024),
      },
      appliedAt: reviewedAt - 900,
    });
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-bytes-pressure',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-bytes-pressure',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-journal-bytes-pressure-key',
      }],
    });

    expect(response).toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
    });
    await expect(database.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      backpressure: {
        state: 'unavailable',
        reason: 'pending-bytes',
        nextAction: 'flush-or-checkpoint',
      },
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-journal-bytes-pressure'],
    )?.count).toBe(0);
    expect((await database.getCard('card-review-journal-bytes-pressure'))?.reps).toBe(3);
  });

  it('fails review feedback closed when review journal oldest pending age threshold is exceeded', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const reviewedAt = 1_779_187_889_210;
    const database = new WorkerSqliteDatabaseService(persistenceBridge, undefined, {
      reviewFeedbackJournalBackpressure: {
        maxPendingCount: 100,
        maxPendingBytes: 1_000_000,
        maxOldestPendingAgeMs: 1,
      },
    });
    await database.upsertCards([buildCard({
      id: 'card-review-journal-age-pressure',
      due: reviewedAt - 10_000,
      reps: 3,
    })]);
    await persistenceBridge.reviewFeedbackJournalStore.appendEntry({
      id: 'existing-age-pressure-entry',
      cardId: 'existing-age-pressure-card',
      idempotencyKey: 'existing-age-pressure-key',
      status: 'projection-applied',
      recordedAt: Date.now() - 10_000,
      request: {
        cardId: 'existing-age-pressure-card',
        rating: 3,
        reviewedAt: reviewedAt - 1_000,
        queueType: 'retrieval-practice',
        idempotencyKey: 'existing-age-pressure-key',
      },
      appliedAt: reviewedAt - 900,
    });
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-age-pressure',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-age-pressure',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-journal-age-pressure-key',
      }],
    });

    expect(response).toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
    });
    await expect(database.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      backpressure: {
        state: 'unavailable',
        reason: 'oldest-pending-age',
        nextAction: 'flush-or-checkpoint',
      },
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-journal-age-pressure'],
    )?.count).toBe(0);
    expect((await database.getCard('card-review-journal-age-pressure'))?.reps).toBe(3);
  });

  it('fails review feedback closed when non-SiYuan journal durability is unavailable', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const writeJSON = vi.fn(persistenceBridge.writeJSON!.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...withoutReviewFeedbackJournalStore(persistenceBridge),
      writeBinary,
      writeJSON,
    });
    const reviewedAt = 1_779_187_889_250;
    await database.upsertCards([buildCard({
      id: 'card-review-journal-unavailable',
      due: reviewedAt - 10_000,
      reps: 3,
    })]);
    await database.persist();
    writeBinary.mockClear();
    writeJSON.mockClear();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-unavailable',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-unavailable',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-journal-unavailable-key',
      }],
    });

    expect(response).toMatchObject({
      error: {
        code: 'BACKEND_UNAVAILABLE',
      },
    });
    expect(response.error?.message).toContain('review.feedback non-SiYuan journal store unavailable');
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-journal-unavailable'],
    )?.count).toBe(0);
    expect((await database.getCard('card-review-journal-unavailable'))?.reps).toBe(3);
    expect(writeBinary).not.toHaveBeenCalled();
    expect(writeJSON).not.toHaveBeenCalled();
  });

  it('keeps queue projection replacement patchable while allowing required review checkpoint writes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const writeJSON = vi.fn(persistenceBridge.writeJSON!.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      writeBinary,
      writeJSON,
    });
    const reviewedAt = 1_779_187_889_500;
    const card = buildCard({
      id: 'card-review-projection-hot-path',
      blockId: 'block-review-projection-hot-path',
      due: reviewedAt - 10_000,
      priority: 25,
    });
    await database.upsertCards([card]);
    await database.persist();
    writeBinary.mockClear();
    writeJSON.mockClear();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const replace = await kernel.handle({
      id: 'review-projection-replace-hot-path',
      jsonrpc: '2.0',
      method: 'queue.projection.replace' as never,
      params: [{
        queueType: 'retrieval-practice',
        policyHash: 'retrieval-practice:review-hot-path',
        generation: 1,
        rows: [{
          queueType: 'retrieval-practice',
          rowId: card.id,
          cardId: card.id,
          blockId: card.blockId,
          deckId: null,
          membershipReason: 'due',
          dueAt: card.due,
          dueBucket: 'overdue',
          priorityScore: card.priority,
          sortKey: `000000001:${card.id}`,
          queueIndexHint: 1,
          policyHash: 'retrieval-practice:review-hot-path',
          sourceGeneration: 1,
          payload: { source: 'test' },
          updatedAt: reviewedAt - 5_000,
        }],
        reason: 'review-hot-path-test',
      }],
    });
    expect('result' in replace).toBe(true);
    writeBinary.mockClear();
    writeJSON.mockClear();

    const response = await kernel.handle({
      id: 'review-feedback-projection-hot-path',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'retrieval-practice:review-hot-path',
        idempotencyKey: 'review-projection-hot-path-key',
      }],
    });

    expect('result' in response).toBe(true);
    if (!('result' in response)) {
      throw new Error(response.error.message);
    }
    expect(response.result.storage).toMatchObject({
      sqlProjection: {
        status: 'patched',
        hotPatchable: true,
        refreshRequired: false,
      },
      sqlCheckpoint: {
        status: 'not-run',
        hotPath: false,
        initiator: null,
      },
    });
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(0);
    expect(writeBinary.mock.calls.some(([path]) => path === 'sqlite-delta-log.v2.open.msgpack')).toBe(true);
    expect(writeJSON.mock.calls).toHaveLength(1);
    expect(writeJSON.mock.calls[0][0]).toBe('sqlite-delta-log.v2.manifest.json');
  });

  it('replays pending review feedback journal after restart before checkpoint', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const reviewedAt = 1_779_187_890_000;
    const firstDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    await firstDatabase.upsertCards([buildCard({
      id: 'card-review-journal-replay',
      due: reviewedAt - 10_000,
      reps: 3,
    })]);
    await firstDatabase.persist();
    const kernel = new BackendKernel({
      database: firstDatabase,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-replay',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-replay',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-journal-replay-key',
      }],
    });

    expect('result' in response).toBe(true);
    firstDatabase.dispose();

    const reloadedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    await reloadedDatabase.load();

    expect(reloadedDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-review-journal-replay'],
    )?.count).toBe(1);
    expect((await reloadedDatabase.getCard('card-review-journal-replay'))?.reps).toBe(4);
  });

  it('does not persist review journal for unsupported review feedback requests', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const writeJSON = vi.fn(persistenceBridge.writeJSON!.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      writeJSON,
    });
    const reviewedAt = 1_779_187_891_000;
    await database.upsertCards([buildCard({ id: 'card-review-journal-reject', due: reviewedAt - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-journal-reject',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-journal-reject',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        commitPolicy: 'preview-only',
      }],
    });

    expect('error' in response).toBe(true);
    expect(writeJSON).not.toHaveBeenCalled();
  });

  it('keeps projection-applied review feedback journal entries after explicit checkpoint for async truth flush', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    let failMainDbWrite = false;
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      writeBinary: async (path, bytes) => {
        if (path === 'siyuanmemo.db' && failMainDbWrite) {
          throw new Error('forced main DB upload failure');
        }
        await persistenceBridge.writeBinary(path, bytes);
      },
    });
    const reviewedAt = 1_779_187_892_000;
    await database.upsertCards([buildCard({ id: 'card-review-checkpoint-fail', due: reviewedAt - 10_000 })]);
    await database.persist();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-checkpoint-fail',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-checkpoint-fail',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        idempotencyKey: 'review-checkpoint-fail-key',
      }],
    });
    expect('result' in response).toBe(true);

    failMainDbWrite = true;
    await expect(database.persist()).rejects.toThrow(/forced main DB upload failure/);
    await expect(database.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      storage: 'non-siyuan',
      pendingCount: 1,
      statusCounts: {
        'projection-applied': 1,
      },
      lastCheckpoint: {
        ok: false,
        cleared: false,
        error: expect.stringContaining('forced main DB upload failure'),
      },
    });
  });

  it('skips repeated persisted main DB reads for consecutive review feedback without conflict sources', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_187_999_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-path-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-path-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-path-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-path-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);
    const mainDbReadsAfterFirst = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-path-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-path-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsAfterFirst);
  });

  it('skips repeated persisted main DB reads for review feedback when conflict source entries are empty', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => [{
        sourceId: 'siyuan-sync-conflict:empty-review-feedback',
        bytes: new Uint8Array(),
      }]),
    });
    const reviewedAt = 1_779_188_001_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-empty-conflict-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-empty-conflict-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-empty-conflict-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-empty-conflict-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);
    const mainDbReadsAfterFirst = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-empty-conflict-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-empty-conflict-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsAfterFirst);
  });

  it('forces a persisted main DB read and retries review feedback when the worker card row is missing', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const externalBridge = createInMemorySqlitePersistenceBridge();
    const reviewedAt = 1_779_188_003_000;
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await externalDatabase.upsertCards([
      buildCard({ id: 'card-review-retry-from-main-db', due: reviewedAt - 10_000 }),
    ]);
    await externalDatabase.persist();
    const externalBytes = externalBridge.snapshot().bytes;
    await currentBridge.writeBinary('siyuanmemo.db', externalBytes!);
    const readBinary = vi.fn(currentBridge.readBinary.bind(currentBridge));
    const database = new WorkerSqliteDatabaseService({
      ...currentBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    database.markReviewFeedbackOwnPersistedMainDbClean();
    database.run('DELETE FROM cards WHERE id = ?', ['card-review-retry-from-main-db']);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM cards WHERE id = ?',
      ['card-review-retry-from-main-db'],
    )?.count).toBe(0);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-retry-from-main-db',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-retry-from-main-db',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-review-retry-from-main-db',
        committed: true,
        queueType: 'retrieval-practice',
      });
    }
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length)
      .toBeGreaterThan(0);
  });

  it('retries review feedback from the persisted main DB even when that source fingerprint was already processed', async () => {
    const currentBridge = createInMemorySqlitePersistenceBridge();
    const externalBridge = createInMemorySqlitePersistenceBridge();
    const reviewedAt = 1_779_188_003_500;
    const externalDatabase = new WorkerSqliteDatabaseService(externalBridge);
    await seedDomainSyncOperation(externalDatabase, {
      operationId: 'domain-sync-review-retry-source-processed',
      operationType: 'card-upserted',
      entityId: 'card-review-retry-processed-main-db',
      entityBlockId: 'block-review-retry-processed-main-db',
      idempotencyKey: 'card-upserted:card-review-retry-processed-main-db',
    });
    await externalDatabase.upsertCards([
      buildCard({
        id: 'card-review-retry-processed-main-db',
        blockId: 'block-review-retry-processed-main-db',
        due: reviewedAt - 10_000,
      }),
    ]);
    await externalDatabase.persist();
    const externalBytes = externalBridge.snapshot().bytes;
    await currentBridge.writeBinary('siyuanmemo.db', externalBytes!);
    const readBinary = vi.fn(currentBridge.readBinary.bind(currentBridge));
    const database = new WorkerSqliteDatabaseService({
      ...currentBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    database.run('DELETE FROM cards WHERE id = ?', ['card-review-retry-processed-main-db']);
    await database.persist();
    await currentBridge.writeBinary('siyuanmemo.db', externalBytes!);
    const initialMerge = await database.mergeExternalDatabaseIfChanged(reviewedAt - 5_000);
    expect(initialMerge).toMatchObject({
      changed: true,
      mergedCards: 1,
      processedSourceIds: ['siyuan-sync:siyuanmemo.db'],
    });
    database.markReviewFeedbackOwnPersistedMainDbClean();
    database.run('DELETE FROM cards WHERE id = ?', ['card-review-retry-processed-main-db']);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-retry-processed-main-db',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-review-retry-processed-main-db',
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-review-retry-processed-main-db',
        committed: true,
      });
    }
  });

  it('keeps review feedback main DB read fast path across read-only domain sync status checks', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_188_004_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-domain-status-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-domain-status-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-domain-status-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-domain-status-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);

    const status = await kernel.handle({
      id: 'domain-status-preserves-review-fast-path',
      jsonrpc: '2.0',
      method: 'domainSync.status',
      params: [],
    });
    expect('result' in status).toBe(true);
    const mainDbReadsAfterStatus = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-domain-status-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-domain-status-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsAfterStatus);
  });

  it('refreshes domain sync status from persisted main DB before blocking Review entry', async () => {
    const staleBridge = createInMemorySqlitePersistenceBridge();
    const staleDatabase = new WorkerSqliteDatabaseService(staleBridge);
    const cardId = 'domain-status-refresh-card';
    await staleDatabase.upsertCards([buildCard({
      id: cardId,
      blockId: 'domain-status-refresh-block',
      reps: 0,
      lastReview: 1_779_188_010_000,
      updatedAt: 1_779_188_010_000,
    })]);
    await seedReviewEvent(staleDatabase, {
      id: 'domain-status-refresh-review',
      cardId,
      reviewedAt: 1_779_188_020_000,
    });
    await staleDatabase.persist();
    const staleBytes = await staleBridge.readBinary('siyuanmemo.db');
    expect(staleBytes).toBeTruthy();

    const repairedBridge = createInMemorySqlitePersistenceBridge();
    await repairedBridge.writeBinary('siyuanmemo.db', staleBytes!);
    const repairedDatabase = new WorkerSqliteDatabaseService(repairedBridge);
    const preview = await repairedDatabase.previewDomainSyncRepair({ cardIds: [cardId] }, 1_779_188_020_001);
    await expect(repairedDatabase.applyDomainSyncRepair({
      planId: preview.planId,
      idempotencyKey: 'domain-status-refresh-repair',
      confirmedAt: 1_779_188_020_002,
      confirmedBy: 'test',
    }, 1_779_188_020_003)).resolves.toMatchObject({
      ok: true,
      status: 'applied',
      appliedCards: 1,
    });
    const repairedBytes = await repairedBridge.readBinary('siyuanmemo.db');
    expect(repairedBytes).toBeTruthy();

    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    await persistenceBridge.writeBinary('siyuanmemo.db', staleBytes!);
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'repairable',
        repairableDivergenceCount: 1,
      },
    });
    await persistenceBridge.writeBinary('siyuanmemo.db', repairedBytes!);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'domain-status-refreshes-main-db',
      jsonrpc: '2.0',
      method: 'domainSync.status',
      params: [],
    });

    expect(response).toMatchObject({
      id: 'domain-status-refreshes-main-db',
      jsonrpc: '2.0',
      result: {
        sanity: {
          status: 'merged',
          repairableDivergenceCount: 0,
          divergentCardCount: 0,
        },
      },
    });
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length).toBeGreaterThan(0);
  });

  it('reads sync conflict sources only once for a no-source review feedback preflight merge', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readSyncConflictDatabaseSources = vi.fn(async () => []);
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readSyncConflictDatabaseSources,
    });

    const merge = await database.mergeExternalDatabaseIfChanged(1_779_188_006_000, {
      context: 'review-feedback-preflight',
      cardId: 'card-review-single-conflict-source-read',
    });

    expect(merge).toMatchObject({
      changed: false,
      sourceIds: [],
      conflictSourceCount: 0,
      nonEmptyConflictSourceCount: 0,
    });
    expect(readSyncConflictDatabaseSources).toHaveBeenCalledOnce();
  });

  it('reuses the cached domain sync safety status for no-source review feedback preflight', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const status = await database.getDomainSyncStatus(1_779_188_006_100);
    const audit = vi.spyOn(database, 'auditReviewSyncDivergence');

    const merge = await database.mergeExternalDatabaseIfChanged(1_779_188_006_200, {
      context: 'review-feedback-preflight',
      cardId: 'card-review-cached-domain-status',
    });

    expect(merge).toMatchObject({
      changed: false,
      sourceIds: [],
      sanityStatus: status.sanity.status,
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it('serves review action domain sync status through the review preflight cache', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const readSyncConflictDatabaseSources = vi.fn(async () => []);
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources,
    });
    const status = await database.getDomainSyncStatus(1_779_188_006_100);
    const audit = vi.spyOn(database, 'auditReviewSyncDivergence');
    readBinary.mockClear();
    readSyncConflictDatabaseSources.mockClear();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'domain-status-review-preflight',
      jsonrpc: '2.0',
      method: 'domainSync.status',
      params: [{
        context: 'review-feedback-preflight',
        cardId: 'card-review-preflight-status',
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      id: 'domain-status-review-preflight',
      result: expect.objectContaining({
        sanity: expect.objectContaining({
          status: status.sanity.status,
        }),
      }),
    }));
    expect(audit).not.toHaveBeenCalled();
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(0);
    expect(readSyncConflictDatabaseSources).toHaveBeenCalledOnce();
  });

  it('keeps review feedback main DB read fast path across clean read-only backend queries', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_188_006_500;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-read-only-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-read-only-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-read-only-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-read-only-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);

    const count = await kernel.handle({
      id: 'browser-count-preserves-review-fast-path',
      jsonrpc: '2.0',
      method: 'browser.count',
      params: [{ query: {} }],
    });
    expect('result' in count).toBe(true);
    const mainDbReadsAfterCount = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-read-only-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-read-only-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsAfterCount);
  });

  it('does not merge or persist stale main DB bytes during browser deck read preflight', async () => {
    const cardId = 'card-browser-read-external-main-db';
    const blockId = 'block-browser-read-external-main-db';
    const staleBridge = createInMemorySqlitePersistenceBridge();
    const staleDatabase = new WorkerSqliteDatabaseService(staleBridge);
    await staleDatabase.upsertCards([buildCard({
      id: cardId,
      blockId,
      due: 1_779_188_006_000,
      updatedAt: 1_779_188_006_000,
    })]);
    await staleDatabase.persist();
    const stalePersistedBytes = await staleBridge.readBinary('siyuanmemo.db');
    expect(stalePersistedBytes).toBeTruthy();

    const emptyBridge = createInMemorySqlitePersistenceBridge();
    const emptyDatabase = new WorkerSqliteDatabaseService(emptyBridge);
    await emptyDatabase.load();
    await emptyDatabase.persist();
    const emptyPersistedBytes = await emptyBridge.readBinary('siyuanmemo.db');
    expect(emptyPersistedBytes).toBeTruthy();

    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    await persistenceBridge.writeBinary('siyuanmemo.db', emptyPersistedBytes!);
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      writeBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    await expect(database.getCard(cardId)).resolves.toBeUndefined();
    await persistenceBridge.writeBinary('siyuanmemo.db', stalePersistedBytes!);
    const mainDbReadsBeforeBrowser = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const mainDbWritesBeforeBrowser = writeBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const page = await kernel.handle({
      id: 'browser-deck-read-does-not-self-merge-main-db',
      jsonrpc: '2.0',
      method: 'browser.deck.page',
      params: [{ query: { preset: 'all' }, page: { startRow: 0, endRow: 20 } }],
    });

    expect('result' in page).toBe(true);
    expect(page).toMatchObject({
      result: {
        total: 0,
        cards: [],
      },
    });
    expect(await database.getCard(cardId)).toBeUndefined();
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['siyuan-sync:siyuanmemo.db'],
    )?.count).toBe(0);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsBeforeBrowser);
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbWritesBeforeBrowser);
  });

  it('does not merge or persist stale main DB bytes during unchanged source-existence sweep', async () => {
    const cardId = 'card-browser-source-existence-noop';
    const blockId = 'block-browser-source-existence-noop';
    const staleBridge = createInMemorySqlitePersistenceBridge();
    const staleDatabase = new WorkerSqliteDatabaseService(staleBridge);
    await staleDatabase.upsertCards([buildCard({
      id: 'card-browser-source-existence-stale-main',
      blockId: 'block-browser-source-existence-stale-main',
      due: 1_779_188_016_000,
      updatedAt: 1_779_188_016_000,
    })]);
    await staleDatabase.persist();
    const stalePersistedBytes = await staleBridge.readBinary('siyuanmemo.db');
    expect(stalePersistedBytes).toBeTruthy();

    const currentBridge = createInMemorySqlitePersistenceBridge();
    const currentDatabase = new WorkerSqliteDatabaseService(currentBridge);
    await currentDatabase.upsertCards([buildCard({
      id: cardId,
      blockId,
      due: 1_779_188_015_000,
      updatedAt: 1_779_188_015_000,
    })]);
    await currentDatabase.updateSourceExistence([
      { cardId, blockId, exists: true },
    ], 1_779_188_015_100);
    await currentDatabase.persist();
    const currentPersistedBytes = await currentBridge.readBinary('siyuanmemo.db');
    expect(currentPersistedBytes).toBeTruthy();

    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    await persistenceBridge.writeBinary('siyuanmemo.db', currentPersistedBytes!);
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const writeBinary = vi.fn(persistenceBridge.writeBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      writeBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    await database.load();
    await persistenceBridge.writeBinary('siyuanmemo.db', stalePersistedBytes!);
    const mainDbReadsBeforeSweep = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const mainDbWritesBeforeSweep = writeBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const sweep = await kernel.handle({
      id: 'browser-source-existence-noop-does-not-self-merge-main-db',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.applySweepHost',
      params: [{ request: { blockIds: [blockId], force: true }, checkedAt: 1_779_188_015_200 }],
    });

    expect(sweep).toEqual({
      id: 'browser-source-existence-noop-does-not-self-merge-main-db',
      jsonrpc: '2.0',
      result: {
        checked: 1,
        updated: 0,
        changed: false,
        changedToMissing: false,
        changedBlockIds: [],
      },
    });
    expect(await database.getCard('card-browser-source-existence-stale-main')).toBeUndefined();
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_processed_sources WHERE source_id = ?',
      ['siyuan-sync:siyuanmemo.db'],
    )?.count).toBe(0);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsBeforeSweep);
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbWritesBeforeSweep);
  });

  it('keeps review feedback main DB read fast path across empty kernel transaction dequeue polling', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_188_007_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-dequeue-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-dequeue-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-dequeue-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-dequeue-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);

    const dequeue = await kernel.handle({
      id: 'kernel-transaction-dequeue-preserves-review-fast-path',
      jsonrpc: '2.0',
      method: 'kernel.transaction.dequeue',
      params: [{ maxActions: 4 }],
    });
    expect(dequeue).toMatchObject({
      result: {
        actions: [],
        remaining: 0,
      },
    });
    const mainDbReadsAfterDequeue = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-dequeue-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-dequeue-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(mainDbReadsAfterDequeue);
  });

  it('keeps persisted main DB reads when review feedback preflight sees conflict sources', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const conflictBridge = createInMemorySqlitePersistenceBridge();
    const conflictDatabase = new WorkerSqliteDatabaseService(conflictBridge);
    await conflictDatabase.upsertCards([buildCard({ id: 'card-review-fast-conflict-remote' })]);
    await conflictDatabase.persist();
    const conflictBytes = await conflictBridge.readBinary('siyuanmemo.db');
    expect(conflictBytes).toBeTruthy();
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => [{
        sourceId: 'phone-review-fast-conflict',
        bytes: conflictBytes!,
      }]),
    });
    const reviewedAt = 1_779_188_009_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-conflict-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-conflict-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-conflict-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-conflict-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);
    const mainDbReadsAfterFirst = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-conflict-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-conflict-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length)
      .toBeGreaterThan(mainDbReadsAfterFirst);
  });

  it('invalidates review feedback main DB read fast path after a non-review mutating backend command', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_188_019_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-invalidate-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-invalidate-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-invalidate-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-invalidate-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);

    const update = await kernel.handle({
      id: 'source-existence-update-invalidates-review-fast-path',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.update',
      params: [{ updates: [{ blockId: 'block-review-fast-invalidate', exists: false }], checkedAt: reviewedAt + 500 }],
    });
    expect('result' in update).toBe(true);
    const mainDbReadsAfterUpdate = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-invalidate-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-invalidate-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length)
      .toBeGreaterThan(mainDbReadsAfterUpdate);
  });

  it('reports the backend method that invalidated review feedback main DB read fast path', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_188_019_500;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-reason-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-reason-b', due: reviewedAt - 10_000 }),
    ]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-reason-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-reason-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);

    const update = await kernel.handle({
      id: 'source-existence-update-invalidates-review-fast-reason',
      jsonrpc: '2.0',
      method: 'browser.sourceExistence.update',
      params: [{ updates: [{ blockId: 'block-review-fast-reason', exists: false }], checkedAt: reviewedAt + 500 }],
    });
    expect('result' in update).toBe(true);

    const merge = await database.mergeExternalDatabaseIfChanged(reviewedAt + 2_000, {
      context: 'review-feedback-preflight',
      cardId: 'card-review-fast-reason-b',
    });

    expect(merge).toMatchObject({
      mainDbReadSkipped: false,
      mainDbReadSkipReason: 'fast-skip-not-eligible:backend-method:browser.sourceExistence.update',
      sourceIds: [],
    });
  });

  it('invalidates review feedback main DB read fast path after sync conflict reload even though it skips pre-request refresh', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(persistenceBridge.readBinary.bind(persistenceBridge));
    const database = new WorkerSqliteDatabaseService({
      ...persistenceBridge,
      readBinary,
      readSyncConflictDatabaseSources: vi.fn(async () => []),
    });
    const reviewedAt = 1_779_188_020_000;
    await database.upsertCards([
      buildCard({ id: 'card-review-fast-reload-a', due: reviewedAt - 10_000 }),
      buildCard({ id: 'card-review-fast-reload-b', due: reviewedAt - 10_000 }),
    ]);
    await database.persist();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const first = await kernel.handle({
      id: 'review-feedback-fast-reload-a',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-reload-a', rating: 3, reviewedAt, queueType: 'retrieval-practice' }],
    });
    expect('result' in first).toBe(true);

    const reload = await kernel.handle({
      id: 'reload-invalidates-review-fast-path',
      jsonrpc: '2.0',
      method: 'sync.conflict.reload',
      params: [],
    });
    expect('result' in reload).toBe(true);
    const mainDbReadsAfterReload = readBinary.mock.calls
      .filter(([path]) => path === 'siyuanmemo.db')
      .length;

    const second = await kernel.handle({
      id: 'review-feedback-fast-reload-b',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-review-fast-reload-b', rating: 3, reviewedAt: reviewedAt + 1_000, queueType: 'retrieval-practice' }],
    });

    expect('result' in second).toBe(true);
    expect(readBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length)
      .toBeGreaterThan(mainDbReadsAfterReload);
  });

  it('returns refresh-required queue impact when the projection generation is unavailable', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-impact-unavailable', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-projection-unavailable',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-impact-unavailable', rating: 3, queueType: 'retrieval-practice' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: false,
          refreshRequired: true,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            reason: 'projection-unavailable',
            refreshRequired: true,
          }],
        },
      });
    }
  });

  it('returns refresh-required queue impact when requested projection generation is stale', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({ id: 'card-impact-generation', due: reviewedAt - 10_000 });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      generation: 5,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-generation-mismatch',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-generation',
        rating: 3,
        queueType: 'retrieval-practice',
        projectionGeneration: 4,
        projectionPolicyHash: 'policy-a',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: false,
          refreshRequired: true,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            reason: 'generation-mismatch',
            currentGeneration: 6,
            requestedGeneration: 4,
            refreshRequired: true,
          }],
        },
      });
    }
    const counters = database.getOne<{ generation: number; version: number }>(
      'SELECT generation, version FROM queue_projection_counters WHERE queue_type = ? AND policy_hash = ?',
      ['retrieval-practice', 'policy-a'],
    );
    expect(counters).toMatchObject({ generation: 6, version: 6 });
  });

  it('updates projection rows and counter generation when reviewed card leaves retrieval queue', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-impact-remove',
      blockId: 'block-impact-remove',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-remove',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-remove',
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            generation: 2,
            removedRowIds: ['card-impact-remove'],
            counterGeneration: 2,
            counters: {
              version: 2,
              remaining: 0,
              total: 0,
            },
          }],
        },
      });
    }
    const remainingRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      ['retrieval-practice', 'card-impact-remove'],
    );
    expect(remainingRow?.count).toBe(0);
  });

  it('updates projection rows and counter generation when reviewed card leaves incremental queue', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-impact-incremental-remove',
      blockId: 'block-impact-incremental-remove',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'incremental-learning',
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-incremental-remove',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-incremental-remove',
        rating: 4,
        queueType: 'incremental-learning',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'incremental-learning',
            generation: 2,
            removedRowIds: ['card-impact-incremental-remove'],
            counterGeneration: 2,
            counters: {
              version: 2,
              remaining: 0,
              total: 0,
            },
          }],
        },
      });
    }
    const remainingRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      ['incremental-learning', 'card-impact-incremental-remove'],
    );
    expect(remainingRow?.count).toBe(0);
  });

  it('keeps a reviewed incremental-learning card out of ready count after truth-flushed restart replay', async () => {
    const reviewedAt = 1_779_188_200_000;
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-incremental-restart-durable',
      blockId: 'block-incremental-restart-durable',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'incremental-learning',
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    await database.persist();
    const kernel = new BackendKernel({
      database,
      truthFileStore: persistenceBridge.truthFileStore,
    });

    const before = await kernel.handle({
      id: 'incremental-before-review',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot',
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 1,
      }],
    });
    expect(before).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        counters: expect.objectContaining({ remaining: 1 }),
      }),
    }));

    const feedback = await kernel.handle({
      id: 'review-feedback-incremental-restart-durable',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 4,
        queueType: 'incremental-learning',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
        idempotencyKey: 'review-commit:incremental-restart-durable',
      }],
    });
    expect(feedback).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        committed: true,
        queueImpact: expect.objectContaining({
          affectedQueues: [expect.objectContaining({
            queueType: 'incremental-learning',
            counters: expect.objectContaining({ remaining: 0 }),
          })],
        }),
      }),
    }));

    const afterReview = await kernel.handle({
      id: 'incremental-after-review',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot',
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 2,
      }],
    });
    expect(afterReview).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        counters: expect.objectContaining({ remaining: 0 }),
      }),
    }));

    const truthFlush = await kernel.handle({
      id: 'review-truth-flush-after-incremental-review',
      jsonrpc: '2.0',
      method: 'review.truth.flush',
      params: [{
        deviceId: 'device-A',
        generationId: 'review-events-v1',
        schemaVersion: 1,
        batchLimit: 8,
      }],
    });
    expect(truthFlush).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        ok: true,
        flushedEntryIds: ['review-feedback:review-commit:incremental-restart-durable'],
      }),
    }));

    database.dispose();
    const restartedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    const restartedKernel = new BackendKernel({
      database: restartedDatabase,
      truthFileStore: persistenceBridge.truthFileStore,
    });
    const afterRestart = await restartedKernel.handle({
      id: 'incremental-after-restart',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot',
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 2,
      }],
    });

    expect(afterRestart).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        counters: expect.objectContaining({ remaining: 0 }),
        rows: [],
      }),
    }));
  });

  it('does not report review.feedback success when SQL delta or checkpoint durability fails', async () => {
    const baseBridge = createInMemorySqlitePersistenceBridge();
    let failDurabilityWrites = false;
    const persistenceBridge = {
      ...baseBridge,
      writeJSON: vi.fn((path: string, value: unknown) => baseBridge.writeJSON!(path, value)),
      writeBinary: vi.fn(async (path: string, bytes: Uint8Array) => {
        if (path === 'sqlite-delta-log.v2.open.msgpack' && failDurabilityWrites) {
          throw new Error('BACKEND_UNAVAILABLE: mock sqlite delta durability failed');
        }
        if (path === 'siyuanmemo.db' && failDurabilityWrites) {
          throw new Error('BACKEND_UNAVAILABLE: mock sqlite checkpoint durability failed');
        }
        await baseBridge.writeBinary(path, bytes);
      }),
    };
    const reviewedAt = 1_779_188_300_000;
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-incremental-durability-fail',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      reps: 4,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      queueType: 'incremental-learning',
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    await database.persist();
    failDurabilityWrites = true;
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-durability-fail',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 4,
        queueType: 'incremental-learning',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
        idempotencyKey: 'review-commit:durability-fail',
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: 'BACKEND_UNAVAILABLE',
        message: expect.stringContaining('durability failed'),
      }),
    }));
  });

  it('reconciles prepared review journal entries by replaying durable SQL before queues become ready', async () => {
    const reviewedAt = 1_779_188_350_000;
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const seedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-journal-prepared-replay',
      blockId: 'block-journal-prepared-replay',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      reps: 4,
    });
    await seedDatabase.upsertCards([card]);
    await seedQueueProjection(seedDatabase, {
      queueType: 'incremental-learning',
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    await seedDatabase.persist();
    seedDatabase.dispose();
    await persistenceBridge.reviewFeedbackJournalStore.appendEntry({
      id: 'review-feedback:journal-prepared-replay',
      requestId: null,
      cardId: card.id,
      idempotencyKey: 'journal-prepared-replay',
      status: 'prepared',
      recordedAt: reviewedAt - 1_000,
      request: {
        cardId: card.id,
        rating: 4,
        queueType: 'incremental-learning',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
        idempotencyKey: 'journal-prepared-replay',
      },
      appliedAt: null,
      projectionAppliedAt: null,
      projectionFailedAt: null,
      lastError: null,
    });

    const restartedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    const restartedKernel = new BackendKernel({ database: restartedDatabase });
    const snapshot = await restartedKernel.handle({
      id: 'journal-prepared-replay-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot',
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 2,
      }],
    });

    expect(snapshot).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        counters: expect.objectContaining({ remaining: 0 }),
        rows: [],
      }),
    }));
    expect(restartedDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['journal-prepared-replay'],
    )?.count).toBe(1);
    await expect(persistenceBridge.reviewFeedbackJournalStore.listEntriesByStatus('projection-applied', 10))
      .resolves.toMatchObject([{
        id: 'review-feedback:journal-prepared-replay',
        status: 'projection-applied',
        appliedAt: reviewedAt,
      }]);
  });

  it('advances stale prepared review journal status when durable SQL already has the idempotent review event', async () => {
    const reviewedAt = 1_779_188_360_000;
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const seedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-journal-sql-durable',
      blockId: 'block-journal-sql-durable',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      reps: 4,
    });
    await seedDatabase.upsertCards([card]);
    await seedQueueProjection(seedDatabase, {
      queueType: 'incremental-learning',
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const seedKernel = new BackendKernel({ database: seedDatabase });
    await expect(seedKernel.handle({
      id: 'journal-sql-durable-feedback',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 4,
        queueType: 'incremental-learning',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
        idempotencyKey: 'journal-sql-durable',
      }],
    })).resolves.toEqual(expect.objectContaining({
      result: expect.objectContaining({ committed: true }),
    }));
    expect(seedDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['journal-sql-durable'],
    )?.count).toBe(1);
    await persistenceBridge.reviewFeedbackJournalStore.updateEntryStatus(
      'review-feedback:journal-sql-durable',
      'prepared',
      {
        appliedAt: null,
        projectionAppliedAt: null,
        lastError: null,
      },
    );
    seedDatabase.dispose();

    const restartedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    const restartedKernel = new BackendKernel({ database: restartedDatabase });
    const snapshot = await restartedKernel.handle({
      id: 'journal-sql-durable-snapshot',
      jsonrpc: '2.0',
      method: 'queue.projection.snapshot',
      params: [{
        queueType: 'incremental-learning',
        policyHash: 'policy-a',
        generation: 2,
      }],
    });

    expect(snapshot).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        counters: expect.objectContaining({ remaining: 0 }),
        rows: [],
      }),
    }));
    expect(restartedDatabase.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['journal-sql-durable'],
    )?.count).toBe(1);
    await expect(persistenceBridge.reviewFeedbackJournalStore.listEntriesByStatus('projection-applied', 10))
      .resolves.toMatchObject([{
        id: 'review-feedback:journal-sql-durable',
        status: 'projection-applied',
        appliedAt: reviewedAt,
      }]);
  });

  it('rolls back review feedback card and log writes when projection impact persistence fails', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-impact-rollback',
      blockId: 'block-impact-rollback',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    await database.upsertCards([card]);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [card],
      updatedAt: reviewedAt,
    });
    const queueProjection = (database as unknown as {
      queueProjection: { applyQueueProjectionDelta: (...args: unknown[]) => unknown };
    }).queueProjection;
    queueProjection.applyQueueProjectionDelta = () => {
      throw new Error('forced projection persistence failure');
    };
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-rollback',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('error' in response).toBe(true);
    const storedCard = await database.getCard(card.id);
    expect(storedCard).toMatchObject({
      id: card.id,
      due: card.due,
      reps: card.reps,
      stability: card.stability,
      difficulty: card.difficulty,
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      [card.id],
    )?.count).toBe(0);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_operations WHERE entity_id = ?',
      [card.id],
    )?.count).toBe(0);
    expect(database.getOne<{ generation: number }>(
      'SELECT generation FROM queue_projection_counters WHERE queue_type = ? AND policy_hash = ?',
      ['retrieval-practice', 'policy-a'],
    )?.generation).toBe(1);
  });

  it('rebuilds projection feedback impact from active-source cards only', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewed = buildCard({
      id: 'card-impact-active-source',
      blockId: 'block-impact-active-source',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
    });
    const staleMissing = buildCard({
      id: 'card-impact-missing-source',
      blockId: 'block-impact-missing-source',
      due: reviewedAt - 5_000,
    });
    await database.upsertCards([reviewed, staleMissing]);
    await database.updateSourceExistence([
      { blockId: staleMissing.blockId, exists: false },
    ], reviewedAt - 1_000);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [reviewed, staleMissing],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-active-source-build',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: reviewed.id,
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      const affectedQueue = response.result.queueImpact?.affectedQueues[0];
      expect(affectedQueue).toMatchObject({
        queueType: 'retrieval-practice',
        generation: 2,
        counters: {
          remaining: 0,
          total: 0,
        },
      });
      expect(affectedQueue?.removedRowIds).toEqual(expect.arrayContaining([
        reviewed.id,
        staleMissing.id,
      ]));
    }

    const missingRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      ['retrieval-practice', staleMissing.id],
    );
    expect(missingRow?.count).toBe(0);
  });

  it('returns updated row and reorder hint when remaining retrieval row moves forward', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-impact-reorder',
      blockId: 'block-impact-reorder',
      due: reviewedAt - 10_000,
      lastReview: reviewedAt - 86_400_000,
      stability: 1,
      difficulty: 9,
      reps: 2,
    });
    const peer = buildCard({
      id: 'card-impact-reorder-peer',
      blockId: 'block-impact-reorder-peer',
      due: reviewedAt - 5_000,
      priority: 30,
    });
    await database.upsertCards([card, peer]);
    await seedQueueProjection(database, {
      generation: 1,
      rows: [card, peer],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-reorder',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-impact-reorder',
        rating: 4,
        queueType: 'retrieval-practice',
        projectionGeneration: 1,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: true,
        queueImpact: {
          hotPatchable: true,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'retrieval-practice',
            generation: 2,
            removedRowIds: ['card-impact-reorder'],
            counterGeneration: 2,
          }],
        },
      });
      const affectedQueue = response.result.queueImpact?.affectedQueues[0];
      expect(affectedQueue?.updatedRows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rowId: 'card-impact-reorder-peer',
          cardId: 'card-impact-reorder-peer',
        }),
      ]));
      expect(affectedQueue?.reorderHints).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rowId: 'card-impact-reorder-peer',
        }),
      ]));
    }
  });

  it.each([
    {
      queueType: 'filter-group',
      committed: false,
      params: {
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      },
    },
    {
      queueType: 'final-drill',
      committed: false,
      params: {
        rating: 4,
      },
    },
    {
      queueType: 'leech',
      committed: true,
      params: {
        rating: 3,
      },
    },
    {
      queueType: 'neural-roam',
      committed: true,
      params: {
        rating: 3,
      },
    },
  ])('returns deferred queue impact for projection-backed $queueType feedback before maintenance runs', async ({ queueType, committed, params }) => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: `card-impact-${queueType}`,
      blockId: `block-impact-${queueType}`,
      due: reviewedAt - 10_000,
    });
    const peer = buildCard({
      id: `card-impact-${queueType}-peer`,
      blockId: `block-impact-${queueType}-peer`,
      due: reviewedAt - 5_000,
    });
    await database.upsertCards([card, peer]);
    await seedQueueProjection(database, {
      queueType,
      generation: 2,
      rows: [card, peer],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: `review-feedback-impact-${queueType}`,
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 3,
        queueType,
        projectionGeneration: 2,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
        ...params,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed,
        queueImpact: {
          hotPatchable: false,
          refreshRequired: false,
          affectedQueues: [{
            queueType,
            generation: 2,
            currentGeneration: 2,
            requestedGeneration: 2,
            outcome: 'deferred',
            hotPatchable: false,
            removedRowIds: [],
            counterGeneration: null,
            counters: null,
            deferred: {
              reason: 'review-feedback',
              scheduled: true,
            },
          }],
        },
      });
    }
    const removedRow = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      [queueType, card.id],
    );
    expect(removedRow?.count).toBe(1);

    await flushReviewFeedbackDeferredProjectionMaintenance();

    const removedAfterMaintenance = database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM queue_projection_rows WHERE queue_type = ? AND card_id = ?',
      [queueType, card.id],
    );
    expect(removedAfterMaintenance?.count).toBe(0);
  });

  it('moves low-rated final-drill projection row to tail without schedule writes', async () => {
    const reviewedAt = Date.now();
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const card = buildCard({
      id: 'card-final-drill-impact-low',
      blockId: 'block-final-drill-impact-low',
      due: reviewedAt + 60_000,
    });
    const peer = buildCard({
      id: 'card-final-drill-impact-peer',
      blockId: 'block-final-drill-impact-peer',
      due: reviewedAt + 120_000,
    });
    await database.upsertCards([card, peer]);
    await seedQueueProjection(database, {
      queueType: 'final-drill',
      generation: 6,
      rows: [card, peer],
      updatedAt: reviewedAt,
    });
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'review-feedback-impact-final-drill-low',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: card.id,
        rating: 2,
        queueType: 'final-drill',
        projectionGeneration: 6,
        projectionPolicyHash: 'policy-a',
        reviewedAt,
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        committed: false,
        updatedCard: null,
        queueImpact: {
          hotPatchable: false,
          refreshRequired: false,
          affectedQueues: [{
            queueType: 'final-drill',
            generation: 6,
            currentGeneration: 6,
            requestedGeneration: 6,
            outcome: 'deferred',
            hotPatchable: false,
            removedRowIds: [],
            counterGeneration: null,
            counters: null,
            deferred: {
              reason: 'review-feedback',
              scheduled: true,
            },
          }],
        },
      });
    }

    await flushReviewFeedbackDeferredProjectionMaintenance();

    const movedRow = database.getOne<{ queueIndexHint: number; sourceGeneration: number }>(
      `SELECT queue_index_hint AS queueIndexHint, source_generation AS sourceGeneration
       FROM queue_projection_rows
       WHERE queue_type = ? AND card_id = ?`,
      ['final-drill', card.id],
    );
    expect(movedRow).toMatchObject({ queueIndexHint: 2, sourceGeneration: 7 });
    const counters = database.getOne<{ generation: number; remaining: number; total: number }>(
      `SELECT generation, remaining, total
       FROM queue_projection_counters
       WHERE queue_type = ? AND policy_hash = ?`,
      ['final-drill', 'policy-a'],
    );
    expect(counters).toMatchObject({ generation: 7, remaining: 2, total: 2 });
  });

  it('uses request scheduler config for review feedback scheduling', async () => {
    const reviewedAt = 1_700_200_000_000;
    const runWithRetention = async (id: string, requestRetention: number) => {
      const persistenceBridge = createInMemorySqlitePersistenceBridge();
      const database = new WorkerSqliteDatabaseService(persistenceBridge);
      await database.upsertCards([buildCard({
        id,
        due: reviewedAt - 10_000,
        lastReview: reviewedAt - 86_400_000,
        stability: 2,
        difficulty: 7,
        reps: 3,
        scheduledDays: 1,
      })]);
      const kernel = new BackendKernel({ database });
      const response = await kernel.handle({
        id: `review-feedback-${id}`,
        jsonrpc: '2.0',
        method: 'review.feedback',
        params: [{
          cardId: id,
          rating: 3,
          queueType: 'retrieval-practice',
          reviewedAt,
          scheduler: {
            defaultScheduler: 'fsrs-v6',
            fsrsParams: {
              ...DEFAULT_SETTINGS.fsrs,
              requestRetention,
              enableFuzz: false,
            },
          },
        }],
      });
      expect('result' in response).toBe(true);
      if (!('result' in response)) {
        throw new Error(response.error.message);
      }
      return response.result.updatedCard as FSRSCard;
    };

    const lowRetention = await runWithRetention('card-review-low-retention', 0.5);
    const highRetention = await runWithRetention('card-review-high-retention', 0.99);

    expect(lowRetention.scheduledDays).not.toBe(highRetention.scheduledDays);
  });

  it('commits incremental-learning review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-incremental-1', due: Date.now() - 20_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-incremental',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-incremental-1', rating: 2, queueType: 'incremental-learning' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-incremental-1',
        committed: true,
        queueType: 'incremental-learning',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('keeps incremental-learning review feedback clean in domain sync diagnostics after restart', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    const reviewedAt = 1_779_188_100_000;
    await database.upsertCards([buildCard({
      id: 'card-incremental-domain-sync-clean',
      due: reviewedAt - 20_000,
      lastReview: reviewedAt - 86_400_000,
      reps: 3,
    })]);
    await database.persist();
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-incremental-domain-sync-clean',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-incremental-domain-sync-clean',
        rating: 2,
        reviewedAt,
        queueType: 'incremental-learning',
      }],
    });

    expect('result' in response).toBe(true);
    await expect(database.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });

    const restartedDatabase = new WorkerSqliteDatabaseService(persistenceBridge);
    await expect(restartedDatabase.getDomainSyncStatus()).resolves.toMatchObject({
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        divergentCardCount: 0,
      },
    });
  });

  it('commits neural-roam formal review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-neural-1', due: Date.now() - 15_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-neural',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-neural-1', rating: 3, queueType: 'neural-roam' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-neural-1',
        committed: true,
        queueType: 'neural-roam',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('commits leech formal review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-leech-1', due: Date.now() - 18_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-leech',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-leech-1', rating: 2, queueType: 'leech' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-leech-1',
        committed: true,
        queueType: 'leech',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('supports final-drill drill-only feedback without schedule writes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-final-drill-1', due: Date.now() + 60_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-final-drill',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-final-drill-1', rating: 3, queueType: 'final-drill' }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-final-drill-1',
        committed: false,
        queueType: 'final-drill',
        updatedCard: null,
      });
    }
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-final-drill-1'],
    )?.count).toBe(0);
  });

  it('supports filter-group preview-only review feedback without schedule writes', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-filter-preview-1', due: Date.now() + 86_400_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-filter-preview',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-filter-preview-1',
        rating: 3,
        queueType: 'filter-group',
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-filter-preview-1',
        committed: false,
        queueType: 'filter-group',
        updatedCard: null,
      });
    }
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE card_id = ?',
      ['card-filter-preview-1'],
    )?.count).toBe(0);
  });

  it('commits filter-group filtered-rescheduling review feedback in worker transaction', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-filter-reschedule-1', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'review-feedback-filter-reschedule',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{
        cardId: 'card-filter-reschedule-1',
        rating: 2,
        queueType: 'filter-group',
        queueMode: 'filtered-rescheduling',
        commitPolicy: 'write-schedule',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        cardId: 'card-filter-reschedule-1',
        committed: true,
        queueType: 'filter-group',
      });
      expect(response.result.updatedCard).toBeTruthy();
    }
  });

  it('reports review/queue parity diagnostics after ingest and review mutation', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-parity-1', due: Date.now() - 10_000 })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const ingest = await kernel.handle({
      id: 'ingest-parity',
      jsonrpc: '2.0',
      method: 'kernel.transaction.ingest',
      params: [{
        source: 'ws-main',
        idempotencyKey: 'parity-key-1',
        transactions: [{ id: 'tx-parity-1' }],
      }],
    });
    expect('result' in ingest).toBe(true);

    const review = await kernel.handle({
      id: 'review-parity',
      jsonrpc: '2.0',
      method: 'review.feedback',
      params: [{ cardId: 'card-parity-1', rating: 3, queueType: 'retrieval-practice' }],
    });
    expect('result' in review).toBe(true);

    const diagnostics = await kernel.handle({
      id: 'status-parity',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.ingest?.acceptedTotal).toBeGreaterThanOrEqual(1);
      expect(diagnostics.result.ingest?.queueLength).toBeGreaterThanOrEqual(1);
      expect(diagnostics.result.review?.feedbackTotal).toBeGreaterThanOrEqual(1);
    }
  });

  it('serves private read and private command methods with audit trail', async () => {
    const persistenceBridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(persistenceBridge);
    await database.upsertCards([buildCard({ id: 'card-private-1' })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const read = await kernel.handle({
      id: 'private-read-cards',
      jsonrpc: '2.0',
      method: 'private.read.cards',
      params: [{
        requestId: 'private-read-1',
        method: 'private.read.cards',
        callerIntent: 'test-private-read',
        limit: 5,
      }],
    });
    expect('result' in read).toBe(true);
    if ('result' in read) {
      expect(read.result).toMatchObject({
        ok: true,
        auditStatus: 'recorded',
      });
    }

    const mutate = await kernel.handle({
      id: 'private-command-execute',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-mutate-1',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-key-1',
        capabilityResult: authorizedPrivateCapability(),
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 20,
        },
      }],
    });
    expect('result' in mutate).toBe(true);
    if ('result' in mutate) {
      expect(mutate.result).toMatchObject({
        ok: true,
        commandId: 'private-mutate-1',
        changed: {
          blockIds: ['block-1'],
        },
        result: {
          operation: 'browser.sourceExistence.applySweepHost',
          idempotencyKey: 'private-key-1',
          committed: true,
          sweep: {
            checked: 1,
            updated: 1,
            changed: true,
            changedToMissing: false,
          },
        },
      });
    }

    const health = await kernel.handle({
      id: 'private-health',
      jsonrpc: '2.0',
      method: 'private.health',
      params: [],
    });
    expect('result' in health).toBe(true);
    if ('result' in health) {
      expect(health.result).toMatchObject({
        ok: true,
        feature: 'private-api',
      });
    }

    const diagnostics = await kernel.handle({
      id: 'private-diagnostics-status',
      jsonrpc: '2.0',
      method: 'private.diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result).toMatchObject({
        ok: true,
      });
    }

    const audit = await kernel.handle({
      id: 'private-audit-query',
      jsonrpc: '2.0',
      method: 'private.audit.query',
      params: [{
        requestId: 'private-audit-1',
        method: 'private.audit.query',
        callerIntent: 'test-private-audit',
        limit: 10,
      }],
    });
    expect('result' in audit).toBe(true);
    if ('result' in audit) {
      expect(Array.isArray(audit.result.data)).toBe(true);
      expect(audit.result.data.length).toBeGreaterThan(0);
    }
  });

  it('rejects direct private command calls without an authorized capability result', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'private-command-direct',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-direct-1',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-direct-key',
        params: { operation: 'browser.sourceExistence.applySweepHost' },
      }],
    });

    expect(response).toEqual({
      id: 'private-command-direct',
      jsonrpc: '2.0',
      error: {
        code: 'INVALID_REQUEST',
        message: 'private.command.execute requires authorized private API capability',
      },
    });
  });

  it('replays private command result for duplicate idempotency keys', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.upsertCards([buildCard({ id: 'card-private-replay', blockId: 'block-1' })]);
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });
    const capabilityResult = authorizedPrivateCapability();

    const first = await kernel.handle({
      id: 'private-command-first',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-first',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-same-key',
        capabilityResult,
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 20,
        },
      }],
    });
    const second = await kernel.handle({
      id: 'private-command-second',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-second',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-same-key',
        capabilityResult,
        params: {
          operation: 'browser.sourceExistence.applySweepHost',
          request: { blockIds: ['block-1'] },
          checkedAt: 30,
        },
      }],
    });

    expect('result' in first).toBe(true);
    expect('result' in second).toBe(true);
    if ('result' in second) {
      expect(second.result.commandId).toBe('private-first');
      expect(second.result.changed).toMatchObject({
        blockIds: ['block-1'],
      });
      expect(second.result.result).toMatchObject({
        idempotencyKey: 'private-same-key',
        committed: true,
      });
    }
  });

  it('rejects unsupported private command operations', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({
      database,
      resolveExistingBlockIds: async (blockIds) => blockIds,
    });

    const response = await kernel.handle({
      id: 'private-command-unknown',
      jsonrpc: '2.0',
      method: 'private.command.execute',
      params: [{
        requestId: 'private-unknown',
        method: 'private.command.execute',
        callerIntent: 'test-private-mutation',
        idempotencyKey: 'private-unknown-key',
        capabilityResult: authorizedPrivateCapability(),
        params: { operation: 'unknown.operation' },
      }],
    });

    expect(response).toEqual({
      id: 'private-command-unknown',
      jsonrpc: '2.0',
      error: {
        code: 'INVALID_REQUEST',
        message: 'unsupported private.command.execute operation: unknown.operation',
      },
    });
  });

  it('executes writer-owned semantic activation commands through the backend database owner', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const start = await kernel.handle({
      id: 'semantic-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'node-root',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in start).toBe(true);
    if (!('result' in start)) {
      throw new Error('semantic start did not return result');
    }
    expect(start.result).toMatchObject({
      status: 'ok',
      commandId: 'semantic-start-1',
      changed: {
        semanticSessionIds: ['semantic-session-1'],
      },
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'node-root',
        currentNodeId: 'node-root',
        activeLens: 'assimilation',
      },
      event: {
        type: 'node-visited',
      },
      events: [
        { type: 'session-started' },
        { type: 'node-visited' },
      ],
    });

    const follow = await kernel.handle({
      id: 'semantic-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-session-1',
          candidateId: 'node-next',
          lens: 'free',
        },
      }],
    });
    expect('result' in follow).toBe(true);
    if ('result' in follow) {
      expect(follow.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'node-next',
          activeLens: 'free',
        },
        event: {
          type: 'node-visited',
          nodeId: 'node-next',
        },
        events: [
          { type: 'lens-switched' },
          { type: 'edge-traversed' },
          { type: 'node-visited' },
        ],
      });
    }

    const station = await kernel.handle({
      id: 'semantic-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-session-1',
          stationType: 'node',
        },
      }],
    });
    expect('result' in station).toBe(true);
    if ('result' in station) {
      expect(station.result).toMatchObject({
        status: 'ok',
        station: {
          type: 'node',
          sessionId: 'semantic-session-1',
          nodeId: 'node-next',
        },
      });
    }

    const pathStation = await kernel.handle({
      id: 'semantic-path-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-path-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-path-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-session-1',
          stationType: 'path',
        },
      }],
    });
    expect('result' in pathStation).toBe(true);
    if ('result' in pathStation) {
      expect(pathStation.result).toMatchObject({
        status: 'ok',
        station: {
          type: 'path',
          sessionId: 'semantic-session-1',
          nodeId: null,
          path: [
            { nodeId: 'node-root', lens: 'assimilation' },
            { nodeId: 'node-next', lens: 'free' },
          ],
          lensHistory: ['assimilation', 'free'],
        },
      });
    }

    const relation = await kernel.handle({
      id: 'semantic-relation',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-relation-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-relation-key',
        command: {
          type: 'accept-relation',
          sessionId: 'semantic-session-1',
          relationId: 'relation-1',
          fromNodeId: 'node-root',
          toNodeId: 'node-next',
          confidence: 0.8,
          reason: 'accepted by user',
        },
      }],
    });
    expect('result' in relation).toBe(true);
    if ('result' in relation) {
      expect(relation.result).toMatchObject({
        status: 'ok',
        relation: {
          relationId: 'relation-1',
          decision: 'accepted',
          source: 'ai',
        },
        event: {
          type: 'ai-relation-accepted',
        },
      });
    }

    const implicitAction = await kernel.handle({
      id: 'semantic-implicit-action',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-implicit-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-implicit-key',
        command: {
          type: 'record-implicit-node-action',
          sessionId: 'semantic-session-1',
          nodeId: 'implicit-node-1',
          action: 'expand',
        },
      }],
    });
    expect('result' in implicitAction).toBe(true);
    if ('result' in implicitAction) {
      expect(implicitAction.result).toMatchObject({
        status: 'ok',
        event: {
          type: 'implicit-node-action',
          nodeId: 'implicit-node-1',
          payload: {
            action: 'expand',
          },
        },
      });
    }

    const projectionRow = database.getOne<{
      session_id: string | null;
      node_memory_json: string;
      edge_memory_json: string;
    }>(
      `SELECT session_id, node_memory_json, edge_memory_json
       FROM semantic_projection_cache
       WHERE projection_key = ?`,
      ['semantic-session-1'],
    );
    expect(projectionRow?.session_id).toBe('semantic-session-1');
    const nodeMemory = JSON.parse(projectionRow?.node_memory_json ?? '[]') as Array<Record<string, unknown>>;
    const edgeMemory = JSON.parse(projectionRow?.edge_memory_json ?? '[]') as Array<Record<string, unknown>>;
    expect(nodeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: 'node-root',
      }),
      expect.objectContaining({
        nodeId: 'node-next',
      }),
      expect.objectContaining({
        nodeId: 'implicit-node-1',
      }),
    ]));
    expect(edgeMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromNodeId: 'node-root',
        toNodeId: 'node-next',
        traversalCount: 1,
      }),
    ]));

    const ended = await kernel.handle({
      id: 'semantic-end',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-end-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-end-key',
        command: {
          type: 'end-session',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in ended).toBe(true);
    if ('result' in ended) {
      expect(ended.result).toMatchObject({
        status: 'ok',
        session: {
          sessionId: 'semantic-session-1',
          endedAt: expect.any(Number),
        },
        event: {
          type: 'session-ended',
        },
      });
    }

    const restored = await kernel.handle({
      id: 'semantic-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-restore-key',
        command: {
          type: 'restore-session',
          sessionId: 'semantic-session-1',
        },
      }],
    });
    expect('result' in restored).toBe(true);
    if ('result' in restored) {
      expect(restored.result).toMatchObject({
        status: 'ok',
        session: {
          sessionId: 'semantic-session-1',
          rootFocusNodeId: 'node-root',
          currentNodeId: 'node-next',
          activeLens: 'free',
          endedAt: expect.any(Number),
        },
      });
    }

    const replay = await kernel.handle({
      id: 'semantic-start-replay',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-start-2',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'other-root',
          sessionId: 'semantic-session-2',
        },
      }],
    });
    expect('result' in replay).toBe(true);
    if ('result' in replay) {
      expect(replay.result).toMatchObject({
        status: 'ok',
        commandId: 'semantic-start-1',
        session: {
          sessionId: 'semantic-session-1',
        },
      });
    }
  });

  it('returns explicit semantic session unavailable instead of fallback writes', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'semantic-missing-session',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-missing-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic',
        idempotencyKey: 'semantic-missing-key',
        command: {
          type: 'create-station',
          sessionId: 'missing-session',
          stationType: 'node',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'unavailable',
        unavailableReason: 'session-unavailable',
      });
    }
  });

  it('archives semantic stations and restores path stations without replaying traversal events', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-restore-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root',
          sessionId: 'semantic-restore-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-restore-follow-a',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-follow-a-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-follow-a-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-restore-session',
          candidateId: 'node-a',
          lens: 'free',
        },
      }],
    });
    const pathStation = await kernel.handle({
      id: 'semantic-restore-path-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-path-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-path-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-restore-session',
          stationType: 'path',
        },
      }],
    });
    expect('result' in pathStation).toBe(true);
    await kernel.handle({
      id: 'semantic-restore-follow-b',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-restore-follow-b-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-restore-follow-b-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-restore-session',
          candidateId: 'node-b',
          lens: 'accommodation',
        },
      }],
    });

    const beforeRestoreEdges = database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM semantic_events WHERE session_id = ? AND event_type = ?`,
      ['semantic-restore-session', 'edge-traversed'],
    )?.count ?? 0;
    const restored = await kernel.handle({
      id: 'semantic-path-station-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-path-station-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-path-station-restore-key',
        command: {
          type: 'restore-path-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in restored).toBe(true);
    if ('result' in restored) {
      expect(restored.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'node-a',
          narrativePath: [
            { nodeId: 'root', lens: 'assimilation' },
            { nodeId: 'node-a', lens: 'free' },
          ],
        },
        event: {
          type: 'station-restored',
        },
      });
    }
    const afterRestoreEdges = database.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM semantic_events WHERE session_id = ? AND event_type = ?`,
      ['semantic-restore-session', 'edge-traversed'],
    )?.count ?? 0;
    expect(afterRestoreEdges).toBe(beforeRestoreEdges);

    const archived = await kernel.handle({
      id: 'semantic-station-archive',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-station-archive-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-station-archive-key',
        command: {
          type: 'archive-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in archived).toBe(true);
    if ('result' in archived) {
      expect(archived.result).toMatchObject({
        status: 'ok',
        archivedStationId: 'semantic-station:semantic-restore-path-station-1',
        station: {
          archivedAt: expect.any(Number),
        },
        event: {
          type: 'station-archived',
        },
      });
    }

    const archivedRestore = await kernel.handle({
      id: 'semantic-archived-station-restore',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-archived-station-restore-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-station-restore',
        idempotencyKey: 'semantic-archived-station-restore-key',
        command: {
          type: 'restore-path-station',
          sessionId: 'semantic-restore-session',
          stationId: 'semantic-station:semantic-restore-path-station-1',
        },
      }],
    });
    expect('result' in archivedRestore).toBe(true);
    if ('result' in archivedRestore) {
      expect(archivedRestore.result).toMatchObject({
        status: 'failed',
        unavailableReason: 'inactive-station',
      });
    }
  });

  it('serves Browser Semantic read models without UI SQL and scopes stations to the current root', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-browser-root-a-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-a',
          sessionId: 'semantic-browser-session-a',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-a-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-browser-session-a',
          candidateId: 'old-node-a',
          lens: 'free',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-a-node-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-a-node-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-a-node-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-browser-session-a',
          stationType: 'node',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-b-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-b-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-b-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-b',
          sessionId: 'semantic-browser-session-b',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-browser-root-b-node-station',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-browser-root-b-node-station-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-browser-read',
        idempotencyKey: 'semantic-browser-root-b-node-station-key',
        command: {
          type: 'create-station',
          sessionId: 'semantic-browser-session-b',
          stationType: 'node',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-browser-read-root-a',
      jsonrpc: '2.0',
      method: 'semantic.browser.read' as never,
      params: [{
        requestId: 'semantic-browser-read-root-a-1',
        method: 'semantic.browser.read',
        callerIntent: 'test-semantic-browser-read',
        rootFocusNodeId: 'root-a',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        activeSession: {
          sessionId: 'semantic-browser-session-a',
          rootFocusNodeId: 'root-a',
          currentNodeId: 'old-node-a',
        },
        session: {
          sessionId: 'semantic-browser-session-a',
        },
        rootNode: {
          nodeId: 'root-a',
          nodeType: 'concept',
        },
        currentNode: {
          nodeId: 'old-node-a',
        },
        projection: {
          session: {
            sessionId: 'semantic-browser-session-a',
          },
          activePath: [
            { nodeId: 'root-a' },
            { nodeId: 'old-node-a' },
          ],
        },
        selectedNode: {
          nodeId: 'old-node-a',
          presentation: expect.objectContaining({
            debugId: 'old-node-a',
          }),
        },
      });
      expect(response.result.edgeExplanations).toEqual([
        expect.objectContaining({
          fromNodeId: 'root-a',
          toNodeId: 'old-node-a',
          primaryExplanation: 'Semantic path step',
        }),
      ]);
      expect(response.result.archivedBranches).toEqual([]);
      expect(response.result.later).toEqual([]);
      expect(response.result.suggestions).toEqual([]);
      expect(response.result.rootScopedStations.map((station: { sessionId: string }) => station.sessionId)).toEqual([
        'semantic-browser-session-a',
      ]);
      expect(response.result.stations.map((station: { stationId: string }) => station.stationId)).toEqual([
        'semantic-station:semantic-browser-root-a-node-station-1',
      ]);
      expect(response.result.candidates.free.map((candidate: { candidateId: string }) => candidate.candidateId)).not.toContain('root-b');
    }
  });

  it('serves presentation-ready Semantic session read models without bare ids as primary labels', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-session-read-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-session-read-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-session-read',
        idempotencyKey: 'semantic-session-read-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-session-read',
          sessionId: 'semantic-session-read-1',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-session-read-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-session-read-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-session-read',
        idempotencyKey: 'semantic-session-read-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-session-read-1',
          candidateId: '20260517130000-abc1234',
          lens: 'accommodation',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-session-read',
      jsonrpc: '2.0',
      method: 'semantic.session.read',
      params: [{
        requestId: 'semantic-session-read-1',
        method: 'semantic.session.read',
        callerIntent: 'test-semantic-session-read',
        sessionId: 'semantic-session-read-1',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        projection: {
          session: {
            sessionId: 'semantic-session-read-1',
            currentNodeId: '20260517130000-abc1234',
          },
          activePath: [
            { nodeId: 'root-session-read', lens: 'assimilation' },
            { nodeId: '20260517130000-abc1234', lens: 'accommodation' },
          ],
          ended: false,
        },
      });
      expect(response.result.projection.tree).toEqual(expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'root-session-read',
          childNodeIds: ['20260517130000-abc1234'],
        }),
      ]));
      expect(response.result.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          nodeId: '20260517130000-abc1234',
          presentation: expect.objectContaining({
            displayTitle: 'Content unavailable',
            availability: expect.objectContaining({
              status: 'unavailable',
              reason: 'content-missing',
            }),
            debugId: '20260517130000-abc1234',
          }),
        }),
      ]));
    }
  });

  it('executes Semantic cursor and branch commands for Review sidebar interactions', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-sidebar-action-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-action',
          sessionId: 'semantic-sidebar-action-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-action-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-sidebar-action-session',
          candidateId: 'node-action-next',
          lens: 'free',
        },
      }],
    });

    const moved = await kernel.handle({
      id: 'semantic-sidebar-action-move',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-move-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-move-key',
        command: {
          type: 'move-active-cursor',
          sessionId: 'semantic-sidebar-action-session',
          nodeId: 'root-action',
        },
      }],
    });
    expect('result' in moved).toBe(true);
    if ('result' in moved) {
      expect(moved.result).toMatchObject({
        status: 'ok',
        session: {
          currentNodeId: 'root-action',
        },
      });
    }

    await kernel.handle({
      id: 'semantic-sidebar-action-branch',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-branch-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-branch-key',
        command: {
          type: 'create-branch-edge',
          sessionId: 'semantic-sidebar-action-session',
          fromNodeId: 'root-action',
          toNodeId: 'node-action-branch',
          lens: 'assimilation',
        },
      }],
    });
    const withBranch = await kernel.handle({
      id: 'semantic-sidebar-action-read',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-action-read-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-action',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-action-session',
      }],
    });
    expect('result' in withBranch).toBe(true);
    let branchId = '';
    if ('result' in withBranch) {
      branchId = withBranch.result.model.branches[0]?.branchId ?? '';
      expect(withBranch.result.model.branches[0]).toEqual(expect.objectContaining({
        rootNodeId: 'root-action',
        activeCursorNodeId: 'node-action-branch',
      }));
    }

    await kernel.handle({
      id: 'semantic-sidebar-action-archive',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-action-archive-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-action',
        idempotencyKey: 'semantic-sidebar-action-archive-key',
        command: {
          type: 'archive-branch',
          sessionId: 'semantic-sidebar-action-session',
          branchId,
        },
      }],
    });
    const afterArchive = await kernel.handle({
      id: 'semantic-sidebar-action-after-archive',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-action-after-archive-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-action',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-action-session',
      }],
    });
    expect('result' in afterArchive).toBe(true);
    if ('result' in afterArchive) {
      expect(afterArchive.result.model.branches).toEqual([]);
    }
  });

  it('serves Review sidebar Semantic read models for follow-current and pinned sessions without auto-creating sessions', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    const kernel = new BackendKernel({ database });

    const empty = await kernel.handle({
      id: 'semantic-sidebar-empty',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-empty-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'follow-current',
        currentNodeId: 'root-sidebar',
      }],
    });

    expect('result' in empty).toBe(true);
    if ('result' in empty) {
      expect(empty.result).toMatchObject({
        status: 'ok',
        model: {
          bindingState: { type: 'follow-current', rootFocusNodeId: 'root-sidebar' },
          session: null,
          candidates: { assimilation: [], accommodation: [], free: [] },
        },
      });
    }

    await kernel.handle({
      id: 'semantic-sidebar-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-sidebar',
          sessionId: 'semantic-sidebar-session-1',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-follow',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-follow-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-follow-key',
        command: {
          type: 'follow-candidate',
          sessionId: 'semantic-sidebar-session-1',
          candidateId: 'node-sidebar-next',
          lens: 'free',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-later',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-later-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-later-key',
        command: {
          type: 'add-later',
          sessionId: 'semantic-sidebar-session-1',
          nodeId: 'node-sidebar-later',
          reason: 'compare after current path',
        },
      }],
    });

    const pinned = await kernel.handle({
      id: 'semantic-sidebar-pinned',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-pinned-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-session-1',
        currentNodeId: 'other-review-item',
      }],
    });

    expect('result' in pinned).toBe(true);
    if ('result' in pinned) {
      expect(pinned.result).toMatchObject({
        status: 'ok',
        model: {
          bindingState: { type: 'pinned-session', sessionId: 'semantic-sidebar-session-1' },
          session: {
            sessionId: 'semantic-sidebar-session-1',
            currentNodeId: 'node-sidebar-next',
          },
          currentNode: {
            nodeId: 'node-sidebar-next',
            presentation: expect.objectContaining({
              debugId: 'node-sidebar-next',
            }),
          },
          activePath: [
            { nodeId: 'root-sidebar' },
            { nodeId: 'node-sidebar-next' },
          ],
          later: [
            expect.objectContaining({
              nodeId: 'node-sidebar-later',
              reason: 'compare after current path',
              removedAt: null,
            }),
          ],
        },
      });
    }

    await kernel.handle({
      id: 'semantic-sidebar-later-remove',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-later-remove-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-later-remove-key',
        command: {
          type: 'remove-later',
          sessionId: 'semantic-sidebar-session-1',
          nodeId: 'node-sidebar-later',
        },
      }],
    });
    const afterRemove = await kernel.handle({
      id: 'semantic-sidebar-after-remove',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-after-remove-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-session-1',
      }],
    });
    expect('result' in afterRemove).toBe(true);
    if ('result' in afterRemove) {
      expect(afterRemove.result.model.later).toEqual([]);
    }

    await kernel.handle({
      id: 'semantic-sidebar-irrelevant-root',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-irrelevant-root-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-irrelevant-root-key',
        command: {
          type: 'mark-irrelevant',
          sessionId: 'semantic-sidebar-session-1',
          nodeId: 'node-sidebar-nope',
          scope: 'root',
        },
      }],
    });
    const feedback = database.getOne<{ scope: string; root_focus_node_id: string | null }>(
      `SELECT scope, root_focus_node_id
       FROM semantic_irrelevant_feedback
       WHERE feedback_id = ?`,
      ['semantic-irrelevant:semantic-sidebar-irrelevant-root-1'],
    );
    expect(feedback).toEqual({
      scope: 'root',
      root_focus_node_id: 'root-sidebar',
    });

    await kernel.handle({
      id: 'semantic-sidebar-suggestion-create',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-suggestion-create-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-suggestion-create-key',
        command: {
          type: 'create-suggestion',
          sessionId: 'semantic-sidebar-session-1',
          suggestionId: 'suggestion-sidebar-1',
          source: 'ai',
          summary: 'bind this idea to a real note',
          targetNodeId: 'node-sidebar-next',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-suggestion-bind',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-suggestion-bind-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-read',
        idempotencyKey: 'semantic-sidebar-suggestion-bind-key',
        command: {
          type: 'bind-suggestion',
          sessionId: 'semantic-sidebar-session-1',
          suggestionId: 'suggestion-sidebar-1',
          nodeId: 'node-sidebar-bound',
        },
      }],
    });
    const afterSuggestion = await kernel.handle({
      id: 'semantic-sidebar-after-suggestion',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-after-suggestion-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-read',
        bindingMode: 'pinned-session',
        sessionId: 'semantic-sidebar-session-1',
      }],
    });
    expect('result' in afterSuggestion).toBe(true);
    if ('result' in afterSuggestion) {
      expect(afterSuggestion.result.model.suggestions).toEqual([
        expect.objectContaining({
          suggestionId: 'suggestion-sidebar-1',
          status: 'bound',
          boundNodeId: 'node-sidebar-bound',
        }),
      ]);
      expect(afterSuggestion.result.model.session.currentNodeId).toBe('node-sidebar-next');
      expect(afterSuggestion.result.model.activePath.map((entry: { nodeId: string }) => entry.nodeId)).toEqual([
        'root-sidebar',
        'node-sidebar-next',
      ]);
    }
  });

  it('surfaces most recent ended Semantic session for Review sidebar restore without auto-creating a session', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-sidebar-ended-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-ended-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-ended',
        idempotencyKey: 'semantic-sidebar-ended-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'root-ended',
          sessionId: 'semantic-sidebar-ended-session',
        },
      }],
    });
    await kernel.handle({
      id: 'semantic-sidebar-ended-end',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-sidebar-ended-end-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-sidebar-ended',
        idempotencyKey: 'semantic-sidebar-ended-end-key',
        command: {
          type: 'end-session',
          sessionId: 'semantic-sidebar-ended-session',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-sidebar-ended-read',
      jsonrpc: '2.0',
      method: 'semantic.sidebar.read',
      params: [{
        requestId: 'semantic-sidebar-ended-read-1',
        method: 'semantic.sidebar.read',
        callerIntent: 'test-semantic-sidebar-ended',
        bindingMode: 'follow-current',
        currentNodeId: 'root-ended',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        model: {
          bindingState: { type: 'follow-current', rootFocusNodeId: 'root-ended' },
          session: null,
          recentEndedSession: {
            sessionId: 'semantic-sidebar-ended-session',
            rootFocusNodeId: 'root-ended',
            endedAt: expect.any(Number),
          },
        },
      });
    }
  });

  it('starts Semantic sessions from real review-card roots instead of forcing Concept-only roots', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    await kernel.handle({
      id: 'semantic-real-root-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-real-root-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-real-root',
        idempotencyKey: 'semantic-real-root-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'review-root-block',
          rootFocusNodeType: 'real-review-card',
          sessionId: 'semantic-real-root-session',
        },
      }],
    });

    const response = await kernel.handle({
      id: 'semantic-real-root-read',
      jsonrpc: '2.0',
      method: 'semantic.session.read',
      params: [{
        requestId: 'semantic-real-root-read-1',
        method: 'semantic.session.read',
        callerIntent: 'test-semantic-real-root',
        sessionId: 'semantic-real-root-session',
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        projection: {
          session: {
            rootFocusNodeId: 'review-root-block',
            rootFocusNodeType: 'real-review-card',
          },
        },
      });
      expect(response.result.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'review-root-block',
          nodeType: 'real-review-card',
          presentation: expect.objectContaining({
            nodeKind: 'flashcard',
          }),
        }),
      ]));
    }
  });

  it('uses old neural-roam pools as read-only semantic projection boosts', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const oldState = {
      version: 8,
      engineMode: 'hyperspace',
      orbit: {
        seedPool: [{ nodeId: 'old-orbit-seed', priority: 0.5, label: 'Orbit seed' }],
        anchorPool: [{ nodeId: 'old-orbit-anchor', priority: 1, label: 'Orbit anchor' }],
        session: { active: false },
      },
      hyperspace: {
        sourcePool: [{ nodeId: 'old-hyperspace-source', priority: 0.25, label: 'Hyperspace source' }],
        anchorPool: [{ nodeId: 'old-hyperspace-anchor', priority: 0.75, label: 'Hyperspace anchor' }],
        session: { active: false },
      },
      pendingAssociatedReviewCardIds: ['card-pending'],
      seenAssociatedReviewCardIds: ['card-seen'],
    };
    await database.setQueueStateValue('neuralRoamQueue', oldState);
    const before = await database.getQueueStateValue('neuralRoamQueue');
    const kernel = new BackendKernel({ database });

    const response = await kernel.handle({
      id: 'semantic-old-mode-start',
      jsonrpc: '2.0',
      method: 'semantic.command.execute',
      params: [{
        requestId: 'semantic-old-mode-start-1',
        method: 'semantic.command.execute',
        callerIntent: 'test-semantic-old-mode',
        idempotencyKey: 'semantic-old-mode-start-key',
        command: {
          type: 'start-session',
          rootFocusNodeId: 'semantic-root',
          sessionId: 'semantic-old-mode-session',
        },
      }],
    });

    expect('result' in response).toBe(true);
    if ('result' in response) {
      expect(response.result).toMatchObject({
        status: 'ok',
        changed: {
          semanticSessionIds: ['semantic-old-mode-session'],
        },
      });
    }
    await expect(database.getQueueStateValue('neuralRoamQueue')).resolves.toEqual(before);
    const projectionRow = database.getOne<{
      node_memory_json: string;
      edge_memory_json: string;
    }>(
      `SELECT node_memory_json, edge_memory_json
       FROM semantic_projection_cache
       WHERE projection_key = ?`,
      ['semantic-old-mode-session'],
    );
    const nodeMemory = JSON.parse(projectionRow?.node_memory_json ?? '[]') as Array<Record<string, unknown>>;
    const edgeMemory = JSON.parse(projectionRow?.edge_memory_json ?? '[]') as Array<Record<string, unknown>>;
    expect(edgeMemory).toEqual([]);
    for (const nodeId of ['old-orbit-seed', 'old-orbit-anchor', 'old-hyperspace-source', 'old-hyperspace-anchor']) {
      const node = nodeMemory.find((entry) => entry.nodeId === nodeId);
      expect(node?.manualBoost).toBeGreaterThan(0);
      expect(node?.oldKnowledgeScore).toBeGreaterThan(0);
    }
  });

  it('answers P6 ownership query and command contracts instead of METHOD_NOT_FOUND', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const query = await kernel.handle({
      id: 'p6-query',
      jsonrpc: '2.0',
      method: 'p6.ownership.query',
      params: [{
        requestId: 'p6-query-1',
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        payload: { blockId: 'block-1' },
      }],
    });
    const command = await kernel.handle({
      id: 'p6-command',
      jsonrpc: '2.0',
      method: 'p6.ownership.command',
      params: [{
        requestId: 'p6-command-1',
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        idempotencyKey: 'p6-command-key',
        payload: { blockId: 'block-1' },
      }],
    });

    expect('result' in query).toBe(true);
    if ('result' in query) {
      expect(query.result).toMatchObject({
        ok: true,
        surface: 'dialog-manager',
        operation: 'read-block-meta',
        owner: 'compatibility-read',
        status: 'completed',
        unavailableClass: null,
      });
      expect(query.result.diagnosticEventId).toContain('p6-ownership:dialog-manager:read-block-meta');
    }
    expect('result' in command).toBe(true);
    if ('result' in command) {
      expect(command.result).toMatchObject({
        ok: true,
        surface: 'autocard-scanner',
        operation: 'execute-side-effect',
        owner: 'writer-relay',
        status: 'completed',
        unavailableClass: null,
      });
      expect(command.result.diagnosticEventId).toContain('p6-ownership:autocard-scanner:execute-side-effect');
    }
  });
});
