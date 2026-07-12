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
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_ERROR_CODES,
  STORAGE_INVENTORY_RECORD_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  STORAGE_PRESSURE_RECORD_VERSION,
  STORAGE_RECOVERY_STATE_VERSION,
  STORAGE_SLIMMING_FAMILY_POLICIES,
  TRUTH_COVERAGE_WATERMARK_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  TRUTH_GENERATION_RECORD_VERSION,
  isMessagePackCardAggregateTruthRecord,
  isMessagePackQueueTruthRecord,
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
  BackendReviewTruthMaintenanceStatusResult,
  BackendStorageDiagnostic,
  BackendStorageErrorCode,
  MessagePackCardAggregateSnapshotTruthRecord,
  MessagePackCardAggregateTombstoneTruthRecord,
  MessagePackQueueStateChangesetTruthRecord,
  StorageDurabilityReceipt,
  StorageInventoryRecord,
  StorageMutationEnvelope,
  StoragePressureRecord,
  StorageRecoveryState,
  TruthCoverageWatermark,
  TruthDeviceIdentityRecordContract,
  TruthGenerationRecord,
} from '../backend-rpc';

describe('storage durability contract versions', () => {
  it('defines one explicit version for each durable storage boundary', () => {
    expect({
      mutationEnvelope: STORAGE_MUTATION_ENVELOPE_VERSION,
      durabilityReceipt: STORAGE_DURABILITY_RECEIPT_VERSION,
      truthGeneration: TRUTH_GENERATION_RECORD_VERSION,
      coverageWatermark: TRUTH_COVERAGE_WATERMARK_VERSION,
      storageInventory: STORAGE_INVENTORY_RECORD_VERSION,
      storagePressure: STORAGE_PRESSURE_RECORD_VERSION,
      recoveryState: STORAGE_RECOVERY_STATE_VERSION,
      identityRecord: TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
    }).toEqual({
      mutationEnvelope: 1,
      durabilityReceipt: 1,
      truthGeneration: 1,
      coverageWatermark: 1,
      storageInventory: 1,
      storagePressure: 1,
      recoveryState: 1,
      identityRecord: 2,
    });
  });

  it('serializes the shared mutation, receipt, generation, coverage, pressure, recovery, and identity shapes', () => {
    const mutation = {
      version: 1,
      mutationId: 'mutation-1',
      family: 'review',
      deviceId: 'device-A',
      identityEpoch: 'epoch-1',
      journalSequence: 42,
      createdAt: 100,
      affectedAggregates: [{ family: 'card', aggregateId: 'card-1', causalBaseRevision: 'rev-1' }],
      operations: [{ table: 'review_events', operation: 'insert', primaryKey: { id: 'review-1' }, row: { rating: 3 } }],
      requiredTruthOutputs: [{ family: 'review-events', kind: 'event', aggregateIds: ['card-1'] }],
    } satisfies StorageMutationEnvelope;
    const receipt = {
      version: 1,
      mutationId: mutation.mutationId,
      family: mutation.family,
      stage: 'journaled',
      journalSequence: 42,
      affectedAggregates: mutation.affectedAggregates,
      requiredTruthOutputs: mutation.requiredTruthOutputs,
      truthGenerationId: null,
      retry: { attemptCount: 0, nextAttemptAt: null, lastError: null },
      diagnosticCode: null,
      diagnosticMessage: null,
      updatedAt: 101,
    } satisfies StorageDurabilityReceipt;
    const generation = {
      version: 1,
      generationId: 'generation-1',
      previousGenerationId: null,
      deviceId: 'device-A',
      identityEpoch: 'epoch-1',
      status: 'published',
      families: [{ family: 'review-events', manifestPath: 'truth/review-events/manifest.v1.json', segmentPaths: [], checksum: 'sha256:test' }],
      createdAt: 100,
      verifiedAt: 102,
      publishedAt: 103,
    } satisfies TruthGenerationRecord;
    const coverage = {
      version: 1,
      deviceId: 'device-A',
      identityEpoch: 'epoch-1',
      coveredJournalSequence: 42,
      coveredMutationId: 'mutation-1',
      truthGenerationId: 'generation-1',
      updatedAt: 103,
    } satisfies TruthCoverageWatermark;
    const pressure = {
      version: 1,
      level: 'hard',
      measuredAt: 104,
      metrics: [{
        family: 'delta',
        deviceId: 'device-A',
        identityEpoch: 'epoch-1',
        level: 'hard',
        files: 192,
        bytes: 0,
        oldestAgeMs: null,
        targetFiles: 16,
        softFiles: 32,
        highFiles: 48,
        hardFiles: 64,
        targetBytes: null,
        softBytes: null,
        highBytes: null,
        hardBytes: null,
        targetOldestAgeMs: null,
        softOldestAgeMs: null,
        highOldestAgeMs: null,
        hardOldestAgeMs: null,
        targetGenerations: null,
        softGenerations: null,
        highGenerations: null,
        hardGenerations: null,
        reason: 'sealed segment hard limit reached',
      }],
      blockingMutationGrowth: true,
      code: 'STORAGE_PRESSURE',
      reason: 'uncovered mutations prevent safe reclamation',
    } satisfies StoragePressureRecord;
    const inventory = {
      version: 1,
      measuredAt: 104,
      metrics: [{
        family: 'sqlite-delta',
        deviceId: 'device-A',
        identityEpoch: 'epoch-1',
        files: 4,
        bytes: 4096,
        oldestAgeMs: 500,
        generationCount: 0,
        currentGenerationId: null,
        previousGenerationId: null,
        uncoveredMutationCount: 1,
        compactionStatus: 'blocked-uncovered',
      }],
      pressure,
    } satisfies StorageInventoryRecord;
    const recovery = {
      version: 1,
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      lastVerifiedGenerationId: 'generation-1',
      replayFromJournalSequence: 43,
      quarantinedPaths: ['truth/corrupt.msgpack'],
      disabledCapabilities: ['review', 'edit', 'sync-upload'],
      diagnosticReason: 'uncovered delta failed verification',
      updatedAt: 105,
    } satisfies StorageRecoveryState;
    const identity = {
      version: 2,
      deviceId: 'device-A',
      identityEpoch: 'epoch-1',
      hostFingerprint: 'host-A',
      createdAt: 1,
      lastSeenAt: 2,
    } satisfies TruthDeviceIdentityRecordContract;

    expect(JSON.parse(JSON.stringify({
      mutation,
      receipt,
      generation,
      coverage,
      inventory,
      pressure,
      recovery,
      identity,
    })))
      .toMatchObject({
        mutation: { mutationId: 'mutation-1', journalSequence: 42 },
        receipt: { stage: 'journaled' },
        generation: { status: 'published' },
        coverage: { coveredJournalSequence: 42 },
        inventory: {
          metrics: [{ family: 'sqlite-delta', uncoveredMutationCount: 1 }],
        },
        pressure: { level: 'hard', code: 'STORAGE_PRESSURE' },
        recovery: { code: 'STORAGE_RECOVERY_REQUIRED' },
        identity: { version: 2, identityEpoch: 'epoch-1' },
      });
  });
});

describe('MessagePack truth first-family schema contracts', () => {
  it('defines explicit schemas for first migrated truth families', () => {
    expect(MESSAGEPACK_TRUTH_FAMILY_SCHEMAS.map((schema) => schema.family)).toEqual([
      'review-events',
      'card-memory-facts',
      'queue-facts',
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

  it('defines Card Aggregate snapshot and tombstone truth with causal revision evidence', () => {
    const snapshot = {
      family: 'card-memory-facts',
      schemaVersion: 1,
      type: 'card-aggregate.snapshot.v1',
      idempotencyKey: 'card-snapshot:card-a:revision-2',
      mutationId: 'mutation-2',
      aggregateId: 'card-a',
      causalBaseRevision: 'revision-1',
      revision: 'revision-2',
      journalSequence: 2,
      logicalTime: 2_000,
      recordedAt: 2_000,
      card: {
        id: 'card-a',
        blockId: 'block-a',
        xiuyuanId: 'xiuyuan-a',
        faceKey: { ruleId: 'item', faceIndex: 0 },
        type: 'item',
        priority: 10,
        tags: ['topic'],
        cardTypeMarker: null,
        neuralRoamSeed: false,
        skipped: false,
        skipNote: null,
        skipUntil: null,
        sourceUrl: null,
        extractedFrom: null,
        createdAt: 1_000,
        updatedAt: 2_000,
        meta: null,
      },
      schedule: {
        schedulerType: 'fsrs-v6',
        due: 3_000,
        stability: 4.5,
        difficulty: 5.5,
        reps: 3,
        lapses: 1,
        state: 2,
        lastReview: 2_000,
        elapsedDays: 2,
        scheduledDays: 7,
        learningStep: null,
        leechCount: 0,
        isLeech: false,
        aFactor: null,
        riffCardId: null,
        schedulerMeta: null,
        postponeCount: 0,
        lastPostponeDate: null,
        rescheduleHistory: [],
      },
      tombstone: null,
    } satisfies MessagePackCardAggregateSnapshotTruthRecord;
    const tombstone = {
      family: 'card-memory-facts',
      schemaVersion: 1,
      type: 'card-aggregate.tombstone.v1',
      idempotencyKey: 'card-tombstone:card-a:revision-3',
      mutationId: 'mutation-3',
      aggregateId: 'card-a',
      causalBaseRevision: 'revision-2',
      revision: 'revision-3',
      journalSequence: 3,
      logicalTime: 3_000,
      recordedAt: 3_000,
      card: null,
      schedule: null,
      tombstone: {
        deletedAt: 3_000,
        deletedByMutationId: 'mutation-3',
        deletedByDeviceId: 'device-A',
        identityEpoch: 'epoch-A',
        reason: 'user-delete',
      },
    } satisfies MessagePackCardAggregateTombstoneTruthRecord;

    expect(isMessagePackCardAggregateTruthRecord(snapshot)).toBe(true);
    expect(isMessagePackCardAggregateTruthRecord(tombstone)).toBe(true);
    expect(isMessagePackCardAggregateTruthRecord({
      ...snapshot,
      revision: '',
    })).toBe(false);
    expect(JSON.parse(JSON.stringify({ snapshot, tombstone }))).toMatchObject({
      snapshot: {
        aggregateId: 'card-a',
        causalBaseRevision: 'revision-1',
        revision: 'revision-2',
        card: { blockId: 'block-a' },
        schedule: { schedulerType: 'fsrs-v6', state: 2 },
        tombstone: null,
      },
      tombstone: {
        aggregateId: 'card-a',
        causalBaseRevision: 'revision-2',
        revision: 'revision-3',
        card: null,
        schedule: null,
        tombstone: {
          deletedByMutationId: 'mutation-3',
          deletedByDeviceId: 'device-A',
          identityEpoch: 'epoch-A',
        },
      },
    });
  });

  it('validates opaque Queue state changesets and rejects non-JSON state values', () => {
    const changeset = {
      family: 'queue-facts',
      schemaVersion: 1,
      type: 'queue-state.changeset.v1',
      idempotencyKey: 'queue-state:mutation-4:retrievalPracticeQueue:set',
      mutationId: 'mutation-4',
      queueFamily: 'retrievalPracticeQueue',
      causalBaseRevision: null,
      revision: 'device-A:epoch-A:4:mutation-4:retrievalPracticeQueue',
      journalSequence: 4,
      logicalTime: 4_000,
      recordedAt: 4_000,
      members: null,
      changes: null,
      stateChange: {
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['card-a', { cardId: 'card-b', priority: 2 }],
      },
    } satisfies MessagePackQueueStateChangesetTruthRecord;

    expect(isMessagePackQueueTruthRecord(changeset)).toBe(true);
    expect(isMessagePackQueueTruthRecord({
      ...changeset,
      stateChange: {
        ...changeset.stateChange,
        value: undefined,
      },
    })).toBe(false);
    expect(isMessagePackQueueTruthRecord({
      ...changeset,
      stateChange: {
        operation: 'delete',
        key: 'otherQueue',
        value: null,
      },
    })).toBe(false);
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
          status: 'delta-recorded',
          hotPath: true,
          cause: 'review.feedback',
          initiator: 'review.feedback',
          projectionGeneration: 12,
          byteLength: 512,
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
          status: 'delta-recorded',
          hotPath: true,
        },
      },
    });
  });

  it('serializes Review truth maintenance status without broad diagnostics', () => {
    const status = {
      family: 'review-events',
      journal: {
        fileName: 'review-feedback-journal.v1',
        storage: 'non-siyuan',
        version: 1,
        pendingCount: 2,
        pendingBytes: 512,
        statusCounts: {
          'projection-applied': 2,
        },
        appliedInMemoryCount: 0,
        lastWrite: null,
        lastReplay: null,
        lastCheckpoint: null,
      },
      truthBackfill: {
        family: 'review-events',
        source: 'review_events',
        storage: 'truth-segments',
        pendingSqlRows: 3,
        pendingSqlRowsCheckedAt: 1_700_000_000_000,
        syncVisible: false,
        last: null,
        lastError: null,
      },
      truthPromotion: {
        available: true,
        active: false,
        shutdownStarted: false,
        pendingMutationCount: 4,
        oldestPendingAgeMs: 2_500,
        journalSequenceFrontier: 18,
        truthCoverageFrontier: 14,
        retryReason: null,
        lastSuccessfulPromotionAt: 1_700_000_000_000,
      },
    } satisfies BackendReviewTruthMaintenanceStatusResult;

    expect(JSON.parse(JSON.stringify(status))).toMatchObject({
      family: 'review-events',
      journal: {
        pendingCount: 2,
        statusCounts: {
          'projection-applied': 2,
        },
      },
      truthBackfill: {
        source: 'review_events',
        pendingSqlRows: 3,
      },
      truthPromotion: {
        pendingMutationCount: 4,
        journalSequenceFrontier: 18,
        truthCoverageFrontier: 14,
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
          fileName: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
          version: 2,
          registeredTables: ['queue_projection_generations'],
          durableReplayTables: ['cards', 'review_events'],
          derivedCacheTables: ['queue_projection_generations', 'queue_projection_rows'],
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
            skippedDerivedTables: ['queue_projection_rows'],
            skippedDerivedChangeCount: 12,
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
      'TRUTH_VALIDATION_FAILED',
      'PROJECTION_REBUILD_FAILED',
      'SOURCE_READ_UNAVAILABLE',
      'STORAGE_PRESSURE',
      'STORAGE_RECOVERY_REQUIRED',
      'STORAGE_MAINTENANCE_EXTERNAL_INPUT_DIRTY',
    ]));
    expect(STORAGE_DIAGNOSTIC_KINDS).toEqual(expect.arrayContaining([
      'legacy-petal-db-ignored',
      'orphan-truth-segment',
      'quarantined-review-log',
      'repaired-scheduling-memory',
      'skipped-non-formal-review-log',
      'projection-rebuild-status',
      'external-input-dirty',
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
    const missingCacheCause: QueueProjectionReadinessCause = 'missing_derived_cache';
    expect(missingCacheCause).toBe('missing_derived_cache');
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
