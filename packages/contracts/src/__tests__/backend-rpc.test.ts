import { describe, expect, it } from 'vitest';
import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_FAMILY_SCHEMAS,
  MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES,
  SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH,
  SIYUANMEMO_TEMP_PROJECTION_DB_PATH,
  SIYUANMEMO_TRUTH_ROOT_PATH,
  SQL_PROJECTION_FAMILY_SCHEMAS,
  STORAGE_DIAGNOSTIC_KINDS,
  STORAGE_ERROR_CODES,
  STORAGE_SLIMMING_FAMILY_POLICIES,
} from '../backend-rpc';
import type {
  BackendBrowserAggregateFocusRequest,
  BackendBrowserAggregatePageResult,
  BackendGraphQueryRequest,
  BackendGraphQueryResult,
  BackendHotspotCommandSubmitRequest,
  BackendHotspotCommandSubmitResult,
  BackendRpcRequest,
  BackendStorageProjectionRebuildRequest,
  BackendStorageProjectionRebuildResult,
  BackendXiuyuanRiffReadAuditRequest,
  BackendXiuyuanRiffReadAuditResult,
  BackendXiuyuanSyncExecuteRequest,
  BackendXiuyuanSyncExecuteResult,
  BackendDomainSyncRepairApplyRequest,
  BackendDomainSyncRepairApplyResult,
  BackendDomainSyncRepairPreviewRequest,
  BackendDomainSyncRepairPreviewResult,
  BackendDomainSyncStatusResult,
  MessagePackTruthFamily,
  MessagePackTruthRecord,
  SqlProjectionFamily,
  QueueProjectionReadiness,
  QueueProjectionReadinessCause,
  BackendDiagnosticsStatusResult,
  BackendReviewFeedbackResult,
  BackendStorageDiagnostic,
  BackendStorageErrorCode,
} from '../backend-rpc';

describe('MessagePack truth first-family schema contracts', () => {
  it('defines explicit schemas for first migrated truth families', () => {
    expect(MESSAGEPACK_TRUTH_FAMILY_SCHEMAS.map((schema) => schema.family)).toEqual([
      'review-events',
      'card-memory-facts',
      'domain-sync-operations',
      'ai-session-payload-refs',
      'semantic-arena-payload-refs',
      'diagnostics-records',
    ] satisfies MessagePackTruthFamily[]);
    expect(MESSAGEPACK_TRUTH_FAMILY_SCHEMAS.every((schema) => schema.schemaVersion === 1)).toBe(true);
    expect(MESSAGEPACK_TRUTH_FAMILY_SCHEMAS.every((schema) => schema.payloadPolicy !== 'sql-payload')).toBe(true);
  });

  it('defines segment budgets, compaction thresholds, and retention for first migrated families', () => {
    expect(MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES.map((policy) => policy.family)).toEqual(
      MESSAGEPACK_TRUTH_FAMILY_SCHEMAS.map((schema) => schema.family),
    );
    expect(MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES.every((policy) => (
      policy.maxSegmentBytes >= 1024 * 1024
      && policy.maxSegmentBytes <= 4 * 1024 * 1024
      && policy.compaction.closedSegmentThreshold > policy.compaction.targetClosedSegments
      && policy.compaction.targetClosedSegments >= 1
      && policy.retention.keepUntilProjectionCheckpointed === true
      && policy.retention.compactedInputRetainDays >= 7
    ))).toBe(true);
    expect(MESSAGEPACK_TRUTH_FAMILY_STORAGE_POLICIES.find((policy) => policy.family === 'diagnostics-records'))
      .toMatchObject({
        retention: {
          mode: 'ttl-after-compaction',
          compactedInputRetainDays: 14,
        },
      });
  });

  it('serializes Review event truth with stable schema, refs, and replay guards', () => {
    const record = {
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      idempotencyKey: 'review:key-a',
      logicalTime: 1_700_000_000_010,
      recordedAt: 1_700_000_000_000,
      source: {
        cardId: 'card-a',
        blockId: 'block-a',
        sourceBlockId: 'block-a',
        deckId: 'deck-a',
        xiuyuanId: 'xiuyuan-a',
        sourceHash: 'sha256:source-a',
      },
      review: {
        action: 'rating',
        rating: 3,
        reviewedAt: 1_700_000_000_010,
        scheduler: 'fsrs-v6',
      },
      memory: {
        baseMemoryHash: 'sha256:base-a',
        afterMemoryHash: 'sha256:after-a',
        projectionGeneration: 12,
      },
      queue: {
        queueType: 'RetrievalPractice',
        queueMode: 'review',
        commitPolicy: 'formal',
      },
    } satisfies MessagePackTruthRecord;

    expect(JSON.parse(JSON.stringify(record))).toMatchObject({
      family: 'review-events',
      schemaVersion: 1,
      source: { cardId: 'card-a' },
      review: { action: 'rating', rating: 3 },
      memory: { projectionGeneration: 12 },
    });
  });
});

describe('SQL projection skinny schema contracts', () => {
  it('defines projection ownership for first SQL projection families', () => {
    expect(SQL_PROJECTION_FAMILY_SCHEMAS.map((schema) => schema.family)).toEqual([
      'cards',
      'review-event-indexes',
      'domain-sync-indexes',
      'queue-projections',
      'semantic-ai-indexes',
      'diagnostics-indexes',
    ] satisfies SqlProjectionFamily[]);
    expect(SQL_PROJECTION_FAMILY_SCHEMAS.every((schema) => schema.schemaVersion === 1)).toBe(true);
  });

  it('keeps payload JSON columns out of canonical SQL truth ownership', () => {
    const payloadColumns = SQL_PROJECTION_FAMILY_SCHEMAS.flatMap((schema) => (
      schema.columns.filter((column) => column.column.endsWith('_json') || column.column === 'payload_json')
    ));

    expect(payloadColumns).not.toEqual([]);
    expect(payloadColumns.every((column) => (
      column.payloadPolicy === 'skinny-index-json'
      || column.payloadPolicy === 'truth-ref-json'
      || column.payloadPolicy === 'retained-import-input'
    ))).toBe(true);
  });

  it('requires truth refs and projection generation metadata for rebuildable index tables', () => {
    const columnsByFamily = new Map(SQL_PROJECTION_FAMILY_SCHEMAS.map((schema) => [
      schema.family,
      schema.columns.map((column) => `${column.table}.${column.column}`),
    ]));

    expect(columnsByFamily.get('cards')).toEqual(expect.arrayContaining([
      'cards.msgpack_ref',
      'cards.truth_hash',
      'cards.projection_generation',
      'cards.source_hash',
    ]));
    expect(columnsByFamily.get('review-event-indexes')).toEqual(expect.arrayContaining([
      'review_events.msgpack_ref',
      'review_events.commit_idempotency_key',
      'review_events.projection_generation',
    ]));
    expect(columnsByFamily.get('domain-sync-indexes')).toEqual(expect.arrayContaining([
      'domain_sync_operations.msgpack_ref',
      'domain_sync_operations.idempotency_key',
      'domain_sync_operations.projection_generation',
    ]));
    expect(columnsByFamily.get('queue-projections')).toEqual(expect.arrayContaining([
      'queue_projection_rows.truth_refs_json',
      'queue_projection_rows.source_hash',
      'queue_projection_generations.truth_generation_id',
    ]));
    expect(columnsByFamily.get('semantic-ai-indexes')).toEqual(expect.arrayContaining([
      'semantic_sessions.payload_ref_json',
      'semantic_projection_cache.payload_hash',
      'ai_arena_events.payload_ref_json',
      'arena_outcomes.payload_hash',
    ]));
    expect(columnsByFamily.get('diagnostics-indexes')).toEqual(expect.arrayContaining([
      'diagnostics_indexes.diagnostic_event_id',
      'diagnostics_indexes.payload_ref_json',
      'diagnostics_indexes.projection_generation',
    ]));
  });
});

describe('storage slimming migration contracts', () => {
  it('declares explicit owner, write mode, and legacy expiry for every phase 5 family', () => {
    expect(STORAGE_SLIMMING_FAMILY_POLICIES.map((policy) => policy.family)).toEqual([
      'review-events',
      'card-memory',
      'domain-sync-operations',
      'queue-projections',
      'semantic-projections',
      'arena-evidence',
      'ai-sessions',
      'progressive-topic-lineage',
      'diagnostics',
      'block-attrs',
    ]);

    expect(STORAGE_SLIMMING_FAMILY_POLICIES.every((policy) => (
      policy.sqlPayloadRole !== 'canonical-truth'
      && policy.legacyCompatibility.expiryCondition.length > 0
      && policy.legacyCompatibility.removalValidation.length > 0
    ))).toBe(true);
    expect(STORAGE_SLIMMING_FAMILY_POLICIES.find((policy) => policy.family === 'block-attrs'))
      .toMatchObject({
        owner: 'siyuan-source-metadata',
        writeMode: 'strict-allowlist-only',
      });
  });

  it('marks Review, card memory, and domain-sync payloads as MessagePack truth with SQL refs', () => {
    expect(STORAGE_SLIMMING_FAMILY_POLICIES.find((policy) => policy.family === 'review-events'))
      .toMatchObject({
        owner: 'messagepack-truth',
        truthFamily: 'review-events',
        sqlPayloadRole: 'skinny-index-plus-truth-ref',
        writeMode: 'messagepack-truth-sql-projection',
      });
    expect(STORAGE_SLIMMING_FAMILY_POLICIES.find((policy) => policy.family === 'card-memory'))
      .toMatchObject({
        owner: 'messagepack-truth',
        truthFamily: 'card-memory-facts',
        sqlPayloadRole: 'skinny-index-plus-truth-ref',
      });
    expect(STORAGE_SLIMMING_FAMILY_POLICIES.find((policy) => policy.family === 'domain-sync-operations'))
      .toMatchObject({
        owner: 'messagepack-truth',
        truthFamily: 'domain-sync-operations',
        sqlPayloadRole: 'skinny-index-plus-truth-ref',
      });
  });

  it('keeps queue, semantic, arena, AI, progressive, and diagnostics payloads out of permanent SQL truth', () => {
    const byFamily = new Map(STORAGE_SLIMMING_FAMILY_POLICIES.map((policy) => [policy.family, policy]));
    expect(byFamily.get('queue-projections')).toMatchObject({
      owner: 'sql-projection-cache',
      sqlPayloadRole: 'rebuildable-cache',
    });
    expect(byFamily.get('semantic-projections')).toMatchObject({
      owner: 'messagepack-truth-or-ref',
      sqlPayloadRole: 'skinny-index-plus-truth-ref',
    });
    expect(byFamily.get('arena-evidence')).toMatchObject({
      owner: 'messagepack-truth-or-ref',
      sqlPayloadRole: 'skinny-index-plus-truth-ref',
    });
    expect(byFamily.get('ai-sessions')).toMatchObject({
      owner: 'messagepack-truth-or-ref',
      sqlPayloadRole: 'skinny-index-plus-truth-ref',
    });
    expect(byFamily.get('progressive-topic-lineage')).toMatchObject({
      owner: 'messagepack-truth-or-siyuan-source',
      sqlPayloadRole: 'skinny-index-plus-truth-ref',
    });
    expect(byFamily.get('diagnostics')).toMatchObject({
      owner: 'ttl-diagnostics-truth',
      sqlPayloadRole: 'ttl-index-plus-truth-ref',
    });
  });
});

describe('backend SQL projection rebuild contract', () => {
  it('serializes Review feedback storage state without implying sync-directory flush or SQL checkpoint success', () => {
    const result = {
      cardId: 'card-review-storage',
      committed: true,
      reviewedAt: 1_700_000_000_100,
      queueType: 'retrieval-practice',
      updatedCard: { id: 'card-review-storage' },
      idempotencyKey: 'review-storage-key',
      duplicate: false,
      queueImpact: {
        hotPatchable: true,
        refreshRequired: false,
        affectedQueues: [],
      },
      storage: {
        localIntent: {
          status: 'recorded',
          durable: true,
          storage: 'non-siyuan',
          entryId: 'review-feedback:review-storage-key',
          idempotencyKey: 'review-storage-key',
          journalStatus: 'projection-applied',
          pendingCount: 1,
          pendingBytes: 512,
          error: null,
        },
        truthFlush: {
          status: 'pending',
          family: 'review-events',
          syncVisible: false,
          pendingCount: 1,
          oldestPendingAgeMs: 25,
          lastError: null,
        },
        sqlProjection: {
          status: 'patched',
          hotPatchable: true,
          refreshRequired: false,
          affectedQueueCount: 1,
          projectionGeneration: 12,
        },
        sqlCheckpoint: {
          status: 'not-run',
          hotPath: false,
          cause: null,
          initiator: null,
          projectionGeneration: null,
          byteLength: null,
          error: null,
        },
      },
    } satisfies BackendReviewFeedbackResult;

    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      storage: {
        localIntent: {
          status: 'recorded',
          durable: true,
          storage: 'non-siyuan',
          journalStatus: 'projection-applied',
        },
        truthFlush: {
          status: 'pending',
          syncVisible: false,
        },
        sqlProjection: {
          status: 'patched',
          hotPatchable: true,
        },
        sqlCheckpoint: {
          status: 'not-run',
          hotPath: false,
        },
      },
    });
  });

  it('serializes SQL checkpoint/export diagnostics with cause, initiator, bytes, generation, and hot-path status', () => {
    const status = {
      runtime: 'srs-backend-worker',
      initialized: true,
      dbFile: 'siyuanmemo.db',
      storage: {
        sqliteDelta: {
          fileName: 'sqlite-delta-log.v2.manifest.json',
          version: 2,
          registeredTables: ['queue_projection_generations'],
          pendingCount: 0,
          pendingBytes: 0,
          affectedTables: [],
          deltaWritesTotal: 1,
          checkpointWritesTotal: 1,
          checkpointOnlyTotal: 0,
          replayedEntriesTotal: 1,
          lastWrite: {
            ok: true,
            at: 1_700_000_000_000,
            classification: 'delta',
            label: 'queue.projection.replace',
            cause: 'queue.projection.replace',
            initiator: 'queue.projection.replace',
            projectionGeneration: 7,
            hotPath: false,
            byteLength: null,
          },
          lastReplay: null,
          lastCheckpoint: {
            ok: true,
            at: 1_700_000_000_100,
            classification: 'checkpoint',
            cause: 'worker.persist',
            initiator: 'db.persist',
            projectionGeneration: 7,
            hotPath: false,
            reason: 'worker.persist',
            byteLength: 4096,
            cleared: true,
            checkpointStorageClass: 'durable-checkpoint',
          },
        },
      },
    } satisfies BackendDiagnosticsStatusResult;

    expect(JSON.parse(JSON.stringify(status))).toMatchObject({
      storage: {
        sqliteDelta: {
          lastCheckpoint: {
            cause: 'worker.persist',
            initiator: 'db.persist',
            projectionGeneration: 7,
            hotPath: false,
            byteLength: 4096,
            checkpointStorageClass: 'durable-checkpoint',
          },
        },
      },
    });
  });

  it('binds rebuild to an explicit backend command with family diagnostics', () => {
    const request = {
      jsonrpc: '2.0',
      id: 'projection-rebuild-a',
      method: 'storage.projection.rebuild',
      params: {
        rebuildId: 'rebuild-a',
        cause: 'sql-missing',
        families: ['review-event-indexes'],
        deviceId: 'device-a',
        generationId: 'truth-generation-a',
        schemaVersion: 1,
      },
    } satisfies BackendRpcRequest<BackendStorageProjectionRebuildRequest>;
    const result = {
      status: 'ready',
      at: 1_700_000_000_000,
      rebuildId: 'rebuild-a',
      cause: 'sql-missing',
      projectionGeneration: 1,
      rowsRead: 1,
      rowsWritten: 1,
      sourceReadCount: 1,
      missingSourceIds: [],
      families: [{
        family: 'review-event-indexes',
        status: 'ready',
        projectionGeneration: 1,
        rowsRead: 1,
        rowsWritten: 1,
        sourceReadCount: 1,
        missingSourceIds: [],
        error: null,
      }],
      error: null,
    } satisfies BackendStorageProjectionRebuildResult;

    expect(JSON.parse(JSON.stringify({ request, result }))).toMatchObject({
      request: {
        method: 'storage.projection.rebuild',
        params: {
          families: ['review-event-indexes'],
          cause: 'sql-missing',
        },
      },
      result: {
        status: 'ready',
        families: [{ family: 'review-event-indexes', status: 'ready' }],
      },
    });
  });

  it('declares truth storage paths, storage error codes, and storage diagnostic kinds', () => {
    const codes = new Set<BackendStorageErrorCode>(STORAGE_ERROR_CODES);
    const diagnostic: BackendStorageDiagnostic = {
      kind: 'legacy-petal-db-ignored',
      severity: 'warning',
      at: 1_700_000_000_000,
      message: 'petal sqlite projection ignored',
      path: SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH,
    };

    expect(SIYUANMEMO_TRUTH_ROOT_PATH).toBe('truth');
    expect(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH)
      .toBe('truth/migrations/legacy-unified-cards-to-truth.v1.json');
    expect(SIYUANMEMO_TEMP_PROJECTION_DB_PATH).toBe('temp/siyuan-plugin-siyuanmemo/siyuanmemo.db');
    expect(SIYUANMEMO_FORBIDDEN_PETAL_SQLITE_DB_PATH)
      .toBe('storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db');
    expect(codes).toEqual(new Set<BackendStorageErrorCode>([
      'TRUTH_DEVICE_ID_UNAVAILABLE',
      'LEGACY_MIGRATION_FAILED',
      'LEGACY_DIVERGENCE_DETECTED',
      'TRUTH_VALIDATION_FAILED',
      'PROJECTION_REBUILD_FAILED',
      'SOURCE_READ_UNAVAILABLE',
    ]));
    expect(STORAGE_DIAGNOSTIC_KINDS).toEqual(expect.arrayContaining([
      'legacy-petal-db-ignored',
      'orphan-truth-segment',
      'quarantined-review-log',
      'repaired-scheduling-memory',
      'skipped-non-formal-review-log',
      'projection-rebuild-status',
    ]));
    expect(JSON.parse(JSON.stringify(diagnostic))).toMatchObject({
      kind: 'legacy-petal-db-ignored',
      path: 'storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
    });
  });

  it('represents unsupported or missing-source rebuild as explicit unavailable state', () => {
    const result = {
      status: 'unavailable',
      at: 1_700_000_000_100,
      rebuildId: 'rebuild-b',
      cause: 'source-missing',
      projectionGeneration: 0,
      rowsRead: 1,
      rowsWritten: 0,
      sourceReadCount: 1,
      missingSourceIds: ['block-missing'],
      families: [{
        family: 'cards',
        status: 'unavailable',
        unavailableReason: 'missing-source',
        projectionGeneration: 0,
        rowsRead: 1,
        rowsWritten: 0,
        sourceReadCount: 1,
        missingSourceIds: ['block-missing'],
        error: 'missing source blocks: block-missing',
      }],
      error: 'missing source blocks: block-missing',
    } satisfies BackendStorageProjectionRebuildResult;

    expect(result.status).toBe('unavailable');
    expect(result.families[0]).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'missing-source',
    });
  });
});

describe('backend queue projection readiness contract', () => {
  it('represents ready, refreshing, and unavailable states as a discriminated union', () => {
    const ready = {
      status: 'ready',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      generation: 1,
    } satisfies QueueProjectionReadiness;
    const refreshing = {
      status: 'refreshing',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      cause: 'materialization_in_progress',
      retryAfterMs: 150,
    } satisfies QueueProjectionReadiness;
    const unavailable = {
      status: 'unavailable',
      queueId: 'retrieval-practice',
      policyId: 'policy-a',
      cause: 'writer_unavailable',
      reason: 'writer unavailable',
      recoverable: true,
      retryAfterMs: 300,
    } satisfies QueueProjectionReadiness;

    expect([ready.status, refreshing.status, unavailable.status]).toEqual([
      'ready',
      'refreshing',
      'unavailable',
    ]);
  });

  it('uses machine-readable causes instead of UI copy strings', () => {
    const cause: QueueProjectionReadinessCause = 'contract_mismatch';
    expect(cause).toBe('contract_mismatch');
  });
});

describe('backend hotspot command placeholder contracts', () => {
  it('serializes command envelope, writer expectation, progress, and terminal unavailable result', () => {
    const request = {
      envelope: {
        family: 'xiuyuan.sync',
        commandId: 'sync-1',
        idempotencyKey: 'xiuyuan-sync:deck-a:generation-1',
        caller: {
          instanceId: 'instance-a',
          runtimeRole: 'follower',
          surface: 'background',
        },
        writerExpectation: {
          mode: 'required',
          expectedWriterInstanceId: 'writer-a',
          relayAllowed: true,
        },
        deadlineAt: 1_700_000_100_000,
        submittedAt: 1_700_000_000_000,
        payload: {
          mode: 'incremental',
          dryRun: false,
        },
      },
    } satisfies BackendHotspotCommandSubmitRequest;

    const result = {
      ok: false,
      family: 'xiuyuan.sync',
      commandId: 'sync-1',
      idempotencyKey: 'xiuyuan-sync:deck-a:generation-1',
      state: 'unavailable',
      unavailableClass: 'WRITER_UNAVAILABLE',
      reason: 'writer relay unavailable',
      recoverable: true,
      progress: {
        state: 'unavailable',
        currentStep: 'writer-relay',
        completedUnits: 0,
        totalUnits: 1,
        updatedAt: 1_700_000_000_100,
      },
      diagnostics: {
        diagnosticEventId: 'hotspot:sync-1',
        family: 'xiuyuan.sync',
        commandId: 'sync-1',
        errorCategory: 'WRITER_UNAVAILABLE',
      },
    } satisfies BackendHotspotCommandSubmitResult;

    expect(JSON.parse(JSON.stringify({ request, result }))).toMatchObject({
      request: {
        envelope: {
          family: 'xiuyuan.sync',
          caller: { runtimeRole: 'follower' },
          writerExpectation: { relayAllowed: true },
        },
      },
      result: {
        ok: false,
        state: 'unavailable',
        unavailableClass: 'WRITER_UNAVAILABLE',
      },
    });
  });
});

describe('backend Xiuyuan sync contracts', () => {
  it('serializes read/audit facts and execute planning without leaking Riff content into diagnostics', () => {
    const readRequest = {
      requestId: 'riff-read-1',
      mode: 'incremental',
      deckId: 'deck-a',
      since: 1_700_000_000_000,
      scope: {
        blockIds: ['block-a'],
        includeNew: true,
      },
      deadlineAt: 1_700_000_030_000,
    } satisfies BackendXiuyuanRiffReadAuditRequest;
    const readResult = {
      status: 'ready',
      requestId: 'riff-read-1',
      mode: 'incremental',
      deckId: 'deck-a',
      readAt: 1_700_000_000_010,
      blocks: [
        {
          id: 'block-a',
          content: 'Q <> A',
          ial: {
            'custom-fsrs-card-type': 'item',
          },
          riffCard: {
            due: '2026-05-24T00:00:00.000Z',
            reps: 1,
            lapses: 0,
            state: 2,
          },
        },
      ],
      diagnostics: {
        source: 'renderer-host-effect',
        blockCount: 1,
        normalizedBlockCount: 1,
        malformedBlockCount: 0,
        truncated: false,
      },
    } satisfies BackendXiuyuanRiffReadAuditResult;
    const executeRequest = {
      requestId: 'sync-request-1',
      commandId: 'sync-command-1',
      idempotencyKey: 'xiuyuan-sync:deck-a:incremental:1700000000000',
      mode: 'incremental',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
      scope: {
        blockIds: ['block-a'],
      },
      caller: {
        instanceId: 'worker',
        runtimeRole: 'worker',
        surface: 'background',
      },
    } satisfies BackendXiuyuanSyncExecuteRequest;
    const executeResult = {
      status: 'planned',
      commandId: 'sync-command-1',
      idempotencyKey: 'xiuyuan-sync:deck-a:incremental:1700000000000',
      mode: 'incremental',
      dryRun: true,
      progress: {
        state: 'succeeded',
        currentStep: 'planned',
        completedUnits: 3,
        totalUnits: 3,
        updatedAt: 1_700_000_000_020,
      },
      plan: {
        localXiuyuanCount: 1,
        localCardCount: 1,
        localManagedRiffCount: 1,
        nativeRiffCount: 1,
        normalizedNativeRiffCount: 1,
        malformedNativeRiffCount: 0,
        duplicateNativeRiffCount: 0,
        createCount: 0,
        updateCount: 1,
        deleteCount: 0,
        skippedLocalOwnedCount: 0,
        candidateBlockIds: {
          create: [],
          update: ['block-a'],
          delete: [],
          skippedLocalOwned: [],
        },
      },
      applyImpact: {
        requested: false,
        applied: false,
        reason: 'dry-run',
        changed: {},
      },
      diagnostics: {
        diagnosticEventId: 'xiuyuan-sync:sync-command-1',
        readSource: 'renderer-host-effect',
        localLoadedAt: 1_700_000_000_005,
        nativeReadAt: 1_700_000_000_010,
        timingMs: 20,
      },
    } satisfies BackendXiuyuanSyncExecuteResult;

    expect(JSON.parse(JSON.stringify({ readRequest, readResult, executeRequest, executeResult }))).toMatchObject({
      readRequest: { mode: 'incremental', deckId: 'deck-a' },
      readResult: { status: 'ready', diagnostics: { blockCount: 1 } },
      executeRequest: { dryRun: true },
      executeResult: {
        status: 'planned',
        plan: { updateCount: 1 },
        applyImpact: { applied: false, reason: 'dry-run' },
      },
    });
    expect(JSON.stringify(executeResult.diagnostics)).not.toContain('Q <> A');
  });
});

describe('backend Browser aggregate placeholder contracts', () => {
  it('binds aggregate pages and focus reads to snapshot identity', () => {
    const identity = {
      snapshotId: 'snapshot-a',
      generation: 3,
      datasourceId: 'deck:deck-a',
      policyHash: 'policy-a',
      queryFingerprint: 'query-a',
    };
    const page = {
      status: 'ready',
      identity,
      rows: [{ cardId: 'card-a' }],
      nextCursor: 'cursor-b',
      totalCount: 120,
    } satisfies BackendBrowserAggregatePageResult;
    const focus = {
      requestId: 'focus-a',
      identity,
      focus: { type: 'card', cardId: 'card-a' },
      limitBefore: 5,
      limitAfter: 5,
    } satisfies BackendBrowserAggregateFocusRequest;

    expect(JSON.parse(JSON.stringify({ page, focus }))).toMatchObject({
      page: { identity: { snapshotId: 'snapshot-a', generation: 3 } },
      focus: { focus: { type: 'card', cardId: 'card-a' } },
    });
  });
});

describe('backend graph query placeholder contracts', () => {
  it('returns presentation-ready graph read models and content-safe diagnostics', () => {
    const request = {
      queryId: 'graph-a',
      kind: 'neighbors',
      sourceNodeId: 'block-a',
      limit: 20,
      deadlineAt: 1_700_000_000_200,
    } satisfies BackendGraphQueryRequest;
    const result = {
      status: 'ready',
      queryId: 'graph-a',
      kind: 'neighbors',
      nodes: [
        {
          nodeId: 'block-b',
          kind: 'concept',
          title: 'Concept B',
          summary: 'display-safe summary',
          sourceIdentity: { blockId: 'block-b' },
          breadcrumb: ['Notebook', 'Doc'],
          availability: 'available',
          debugId: 'node:block-b',
        },
      ],
      edges: [
        {
          edgeId: 'edge-a',
          sourceNodeId: 'block-a',
          targetNodeId: 'block-b',
          kind: 'backlink',
          rationale: 'linked source',
        },
      ],
      limitReached: false,
      diagnostics: {
        timingMs: 12,
        nodeCount: 1,
        edgeCount: 1,
        sourceAvailability: 'available',
      },
    } satisfies BackendGraphQueryResult;

    expect(JSON.parse(JSON.stringify({ request, result }))).toMatchObject({
      request: { kind: 'neighbors', sourceNodeId: 'block-a' },
      result: {
        status: 'ready',
        nodes: [{ title: 'Concept B', availability: 'available' }],
        diagnostics: { nodeCount: 1, edgeCount: 1 },
      },
    });
  });
});

describe('backend domain sync contract', () => {
  it('serializes status diagnostics with ledger, processed source, sanity, and repair fields', () => {
    const status = {
      ok: true,
      ledger: {
        operationCount: 2,
        newestOperationAt: 1_700_000_000_001,
        operationTypes: {
          'review-committed': 1,
          'card-deleted': 1,
        },
      },
      processedSources: {
        recent: [
          {
            sourceId: 'conflict-a',
            sourceKind: 'siyuan-conflict-db',
            fingerprint: 'sha256-a',
            path: 'temp/repo/sync/conflicts/a.db',
            processedAt: 1_700_000_000_002,
            importedOperations: 1,
            ignoredOperations: 0,
            importedReviewEvents: 1,
            ignoredReviewEvents: 0,
            importedCards: 0,
            ignoredCards: 0,
            skippedReason: null,
            latestSanityStatus: 'merged',
          },
        ],
        skipped: [],
        totalProcessed: 1,
        totalSkipped: 0,
      },
      sanity: {
        status: 'repairable',
        checkedAt: 1_700_000_000_003,
        ledgerOperationCount: 2,
        pendingImportCount: 0,
        processedSourceCount: 1,
        skippedSourceCount: 0,
        repairableDivergenceCount: 1,
        divergentCardCount: 1,
        reasonCounts: {
          'review-history-newer-than-card-state': 1,
        },
        affectedCardIds: ['card-a'],
        truncated: false,
      },
      repair: {
        available: true,
        repairableDivergenceCount: 1,
        latestPlanId: 'plan-a',
      },
    } satisfies BackendDomainSyncStatusResult;

    expect(JSON.parse(JSON.stringify(status))).toMatchObject({
      ok: true,
      sanity: { status: 'repairable' },
      repair: { latestPlanId: 'plan-a' },
    });
  });

  it('serializes repair preview request and result without mutating ordinary RPC shapes', () => {
    const request = {
      cardIds: ['card-a'],
      limit: 50,
      includeUnrepairable: true,
    } satisfies BackendDomainSyncRepairPreviewRequest;
    const result = {
      ok: true,
      planId: 'plan-a',
      status: 'preview',
      createdAt: 1_700_000_000_010,
      affectedCardCount: 1,
      evidence: [
        {
          cardId: 'card-a',
          blockId: 'block-a',
          reason: 'review-event-count-exceeds-card-reps',
          newestReviewEventAt: 1_700_000_000_001,
          cardLastReview: 1_699_000_000_000,
          reviewEventCount: 2,
          cardReps: 1,
        },
      ],
      plannedMutations: [
        {
          cardId: 'card-a',
          mutationType: 'card-state-repair',
          summary: 'repair review counters from review history',
          before: { reps: 1 },
          after: { reps: 2 },
        },
      ],
      unrepairableReasons: [],
      schedulerEvidence: {
        schedulerType: 'fsrs-v6',
        configHash: 'config-a',
        capturedAt: 1_700_000_000_010,
      },
      truncated: false,
      limit: 50,
    } satisfies BackendDomainSyncRepairPreviewResult;

    expect(JSON.parse(JSON.stringify({ request, result }))).toMatchObject({
      request: { cardIds: ['card-a'] },
      result: { planId: 'plan-a', affectedCardCount: 1 },
    });
  });

  it('serializes repair apply request and duplicate-safe result states', () => {
    const request = {
      planId: 'plan-a',
      idempotencyKey: 'apply-a',
      confirmedAt: 1_700_000_000_020,
      confirmedBy: 'user',
      confirmationText: 'apply repair',
    } satisfies BackendDomainSyncRepairApplyRequest;
    const applied = {
      ok: true,
      status: 'applied',
      planId: 'plan-a',
      idempotencyKey: 'apply-a',
      appliedAt: 1_700_000_000_021,
      appliedCards: 1,
      skippedCards: 0,
      invalidatedQueueProjections: 2,
    } satisfies BackendDomainSyncRepairApplyResult;
    const stale = {
      ok: false,
      status: 'stale-plan',
      planId: 'plan-a',
      idempotencyKey: 'apply-a',
      reason: 'card state changed since preview',
    } satisfies BackendDomainSyncRepairApplyResult;

    expect(JSON.parse(JSON.stringify({ request, applied, stale }))).toMatchObject({
      applied: { status: 'applied', appliedCards: 1 },
      stale: { ok: false, status: 'stale-plan' },
    });
  });
});
