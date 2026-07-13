import { afterEach, describe, expect, it, vi } from 'vitest';
import { decode, encode } from '@msgpack/msgpack';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type BackendStartupIdentityDisposition,
  type BackendStorageMaintenanceFrontier,
  type MessagePackCardAggregateChangesetTruthRecord,
  type StorageDurabilityReceipt,
} from '../../packages/contracts/src/backend-rpc';
import { CardState, CardType } from '@/types/card';
import {
  createSqliteFileServiceAdapter,
  WorkerSqliteDatabaseService,
} from '../db/SqliteDatabaseService';
import {
  createInMemorySqlitePersistenceBridge,
  type SqlitePersistenceBridge,
} from '../db/SqlitePersistenceBridge';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthRecord,
} from '../truth/MessagePackTruthSegmentStore';
import { MessagePackTruthSnapshotGenerationStore } from '../truth/MessagePackTruthSnapshotGenerationStore';
import { RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH } from '../truth/LegacyUnifiedCardsMigrationReceipt';

const SQLITE_DELTA_V2_MANIFEST = 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json';
const SQLITE_DELTA_V2_OPEN_SEGMENT = 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack';
const SQLITE_DELTA_V2_SEALED_SEGMENT = 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-398.msgpack';
const WORKER_TRUTH_DEVICE_ID = 'device-worker-test';

type InMemorySqliteBridge = ReturnType<typeof createInMemorySqlitePersistenceBridge>;

function checksumSqliteDeltaFixture(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function stripSqliteDeltaMutationEnvelopes(
  bridge: InMemorySqliteBridge,
): Promise<void> {
  const manifest = structuredClone(bridge.jsonSnapshot(SQLITE_DELTA_V2_MANIFEST)) as {
    sealedSegments: Array<Record<string, unknown> & { path: string }>;
    openSegment: (Record<string, unknown> & { path: string }) | null;
    nextMutationSequence: number;
    checkpoint: unknown;
  };
  const segments = [
    ...manifest.sealedSegments,
    ...(manifest.openSegment ? [manifest.openSegment] : []),
  ];
  const updatedByPath = new Map<string, Record<string, unknown>>();
  for (const segment of segments) {
    const bytes = await bridge.readBinary(segment.path);
    if (!bytes) {
      throw new Error(`Missing SQLite delta test segment ${segment.path}`);
    }
    const envelope = structuredClone(decode(bytes)) as {
      entries: Array<Record<string, unknown>>;
    };
    envelope.entries = envelope.entries.map((entry) => ({
      ...entry,
      mutationEnvelope: null,
      durabilityReceipt: null,
    }));
    const rewritten = encode(envelope);
    await bridge.writeBinary(segment.path, rewritten);
    updatedByPath.set(segment.path, {
      ...segment,
      checksum: checksumSqliteDeltaFixture(rewritten),
      byteSize: rewritten.byteLength,
    });
  }
  manifest.sealedSegments = manifest.sealedSegments.map((segment) => updatedByPath.get(segment.path)!);
  manifest.openSegment = manifest.openSegment
    ? updatedByPath.get(manifest.openSegment.path) as typeof manifest.openSegment
    : null;
  manifest.nextMutationSequence = 1;
  manifest.checkpoint = null;
  await bridge.writeJSON!(SQLITE_DELTA_V2_MANIFEST, manifest);
}

async function seedCardMemoryTruth(
  bridge: InMemorySqliteBridge,
  cardId = 'truth-rebuild-card',
  overrides: {
    memory?: Partial<{
      stability: number;
      difficulty: number;
      due: number;
      elapsedDays: number;
      scheduledDays: number;
      reps: number;
      lapses: number;
      state: CardState;
      lastReview: number;
      priority: number;
      schedulerType: string;
    }>;
    payload?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const store = createMessagePackTruthSegmentStore({
    fileStore: bridge.truthFileStore!,
    family: 'card-memory-facts',
    deviceId: WORKER_TRUTH_DEVICE_ID,
    generationId: 'card-memory-facts-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  });
  await store.appendRecords([{
    id: `seed:${cardId}`,
    family: 'card-memory-facts',
    type: 'card-memory.snapshot-imported',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    createdAt: 1_700_000_010_000,
    updatedAt: 1_700_000_010_000,
    source: {
      cardId,
      sourceBlockId: `block-${cardId}`,
      legacySource: 'test-truth-seed',
    },
    memory: {
      stability: 0,
      difficulty: 0,
      due: 1_700_086_400_000,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      priority: 42,
      schedulerType: 'fsrs-v6',
      ...overrides.memory,
    },
    payload: {
      cardId,
      xiuyuanId: `xy-${cardId}`,
      blockId: `block-${cardId}`,
      type: CardType.Item,
      tags: ['truth', 'startup'],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_010_000,
      meta: {
        sourceHash: `source-hash-${cardId}`,
      },
      ...overrides.payload,
    },
  }]);
}

function createGenerationCardSnapshotRecord(
  cardId: string,
  memory: {
    due: number;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: CardState;
    lastReview: number;
    elapsedDays: number;
    scheduledDays: number;
  },
  recordedAt: number,
): MessagePackTruthRecord {
  return {
    id: `generation:${cardId}:${recordedAt}`,
    family: 'card-memory-facts',
    type: 'card-memory.snapshot-imported',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    createdAt: 1_700_000_000_000,
    updatedAt: recordedAt,
    source: {
      cardId,
      sourceBlockId: `block-${cardId}`,
      legacySource: 'generation-recovery-test',
    },
    memory: {
      ...memory,
      priority: 42,
      schedulerType: 'fsrs-v6',
    },
    payload: {
      cardId,
      xiuyuanId: `xy-${cardId}`,
      blockId: `block-${cardId}`,
      type: CardType.Item,
      tags: ['truth', 'generation-recovery'],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_700_000_000_000,
      updatedAt: recordedAt,
      meta: {
        sourceHash: `source-hash-${cardId}`,
      },
    },
  };
}

async function seedCompactableCardTruth(
  bridge: InMemorySqliteBridge,
  cardId = 'compactable-card',
): Promise<void> {
  const store = createMessagePackTruthSegmentStore({
    fileStore: bridge.truthFileStore!,
    family: 'card-memory-facts',
    deviceId: WORKER_TRUTH_DEVICE_ID,
    generationId: 'card-memory-facts-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  });
  const record: MessagePackCardAggregateChangesetTruthRecord = {
    family: 'card-memory-facts',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: 'card-aggregate.changeset.v1',
    idempotencyKey: `card:${cardId}:1`,
    mutationId: `mutation:${cardId}:1`,
    aggregateId: cardId,
    causalBaseRevision: null,
    revision: `revision:${cardId}:1`,
    journalSequence: 1,
    logicalTime: 1,
    recordedAt: 1,
    card: {
      id: cardId,
      blockId: `block-${cardId}`,
      xiuyuanId: null,
      faceKey: null,
      type: 'item',
      priority: 10,
      tags: [],
      cardTypeMarker: null,
      neuralRoamSeed: false,
      skipped: false,
      skipNote: null,
      skipUntil: null,
      sourceUrl: null,
      extractedFrom: null,
      createdAt: 1,
      updatedAt: 1,
      meta: null,
    },
    schedule: {
      schedulerType: 'fsrs-v6',
      due: 1,
      stability: 1,
      difficulty: 1,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
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
  };
  await store.appendRecords([record]);
}

async function loadWorkerDatabaseFromBridge(
  bridge: SqlitePersistenceBridge,
): Promise<WorkerSqliteDatabaseService> {
  const database = new WorkerSqliteDatabaseService(bridge);
  await database.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
  return database;
}

function startupReceiptRequest(frontier: BackendStorageMaintenanceFrontier) {
  const fingerprint = [
    frontier.pluginInstallationId,
    frontier.identityEpoch,
    frontier.inputVersion,
    frontier.frontierHash,
  ].map((part) => String(part || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 48)).join(':');
  const operationId = `startup-storage-maintenance-receipt-v2:startup-storage-maintenance:${fingerprint}`;
  return {
    operationId,
    migrationId: operationId,
  };
}

async function persistStartupReceipt(
  database: WorkerSqliteDatabaseService,
  frontier: BackendStorageMaintenanceFrontier,
  preSuccessFrontier: BackendStorageMaintenanceFrontier = frontier,
): Promise<void> {
  await database.applyStorageMaintenanceBatch({
    ...startupReceiptRequest(frontier),
    batchIndex: 0,
    totalBatches: 1,
    batch: {
      kind: 'startup-maintenance-receipt',
      appliedAt: 1_777_804_699_944,
      receiptVersion: 'startup-storage-maintenance-receipt-v2',
      maintenanceKind: 'startup-storage-maintenance',
      preSuccessFrontier,
      postSuccessFrontier: frontier,
    },
  });
}

async function listTruthFiles(bridge: InMemorySqliteBridge): Promise<string[]> {
  return bridge.truthFileStore!.listFiles!('truth/');
}

function wrapBridgeWithTrackedTruthWrites(bridge: InMemorySqliteBridge) {
  const truthWriteBinary = vi.fn(bridge.truthFileStore!.writeBinary.bind(bridge.truthFileStore));
  const truthWriteJSON = vi.fn(bridge.truthFileStore!.writeJSON.bind(bridge.truthFileStore));
  return {
    bridge: {
      ...bridge,
      truthFileStore: {
        ...bridge.truthFileStore!,
        writeBinary: truthWriteBinary,
        writeJSON: truthWriteJSON,
      },
    },
    truthWriteBinary,
    truthWriteJSON,
  };
}

describe('WorkerSqliteDatabaseService', () => {
  it('advertises SQLite delete and list capabilities only when the bridge implements them', async () => {
    const bridge: SqlitePersistenceBridge = {
      readBinary: async () => null,
      writeBinary: async () => undefined,
    };

    const adapter = createSqliteFileServiceAdapter(bridge);

    expect(adapter.listFiles).toBeUndefined();
    expect(adapter.deleteFile).toBeUndefined();
  });

  it('fails SQLite deletion when the bridge reports success but the file remains', async () => {
    const path = 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack';
    const bridge: SqlitePersistenceBridge = {
      readBinary: async (candidate) => candidate === path ? new Uint8Array([1]) : null,
      writeBinary: async () => undefined,
      deleteFile: async () => undefined,
    };
    const adapter = createSqliteFileServiceAdapter(bridge);

    await expect(adapter.deleteFile?.(path)).rejects.toThrow(
      `SQLite persistence delete verification failed for ${path}`,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes combined storage inventory from Worker-owned persistence evidence', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCardMemoryTruth(bridge, 'storage-inventory-card');
    const database = await loadWorkerDatabaseFromBridge(bridge);

    const inventory = await database.getStorageInventory();

    expect(inventory.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'card-memory-facts',
        deviceId: WORKER_TRUTH_DEVICE_ID,
        identityEpoch: 'epoch-worker-test',
        files: 1,
        currentGenerationId: 'card-memory-facts-v1',
      }),
      expect.objectContaining({
        family: 'sqlite-delta',
        deviceId: WORKER_TRUTH_DEVICE_ID,
        identityEpoch: 'epoch-worker-test',
      }),
    ]));
  });

  it('exposes identity, receipt, promotion, coverage, budget, recovery, and reconciliation diagnostics together', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCompactableCardTruth(bridge, 'combined-diagnostics-card');
    const database = await loadWorkerDatabaseFromBridge(bridge);

    await expect(database.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        available: true,
        deviceId: WORKER_TRUTH_DEVICE_ID,
        identityEpoch: 'epoch-worker-test',
      },
      receipts: {
        stageCounts: {
          failed: null,
          journaled: 0,
          'truth-committed': 0,
        },
        latestRetryReason: null,
      },
      promotion: {
        available: true,
        pendingMutationCount: 0,
        truthCoverageFrontier: 0,
      },
      coverage: {
        available: true,
        uncoveredMutationCount: 0,
        lag: 0,
      },
      budget: {
        version: 1,
        level: 'normal',
      },
      recovery: {
        status: 'ready',
        disabledCapabilities: [],
      },
      reconciliation: {
        status: 'never-run',
        projectionRebuilt: false,
      },
      disabledCapabilities: [],
    });

    await expect(database.reconcileCanonicalTruth({
      reason: 'combined-diagnostics-test',
    })).resolves.toMatchObject({
      ok: true,
      projectionRebuilt: true,
    });

    await expect(database.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      reconciliation: {
        status: 'succeeded',
        reason: 'combined-diagnostics-test',
        sourceCount: 1,
        acceptedMutationCount: 1,
        duplicateMutationCount: 0,
        blockedAggregateIds: [],
        conflictCount: 0,
        projectionRebuilt: true,
        lastError: null,
      },
      disabledCapabilities: [],
    });
  });

  it('requires matching identity epoch for Review truth publication stores', async () => {
    const database = await loadWorkerDatabaseFromBridge(createInMemorySqlitePersistenceBridge());

    await expect(database.getReviewTruthPublicationStore({
      deviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
      generationId: 'review-events-v1',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    })).resolves.toMatchObject({
      appendRecords: expect.any(Function),
      replayRecords: expect.any(Function),
    });
    await expect(database.getReviewTruthPublicationStore({
      deviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-other',
      generationId: 'review-events-v1',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    })).rejects.toThrow('TRUTH_DEVICE_ID_UNAVAILABLE: Review truth publication requires matching deviceId and identityEpoch');
    await expect(database.getReviewTruthPublicationStore({
      deviceId: 'device-other',
      identityEpoch: 'epoch-worker-test',
      generationId: 'review-events-v1',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    })).rejects.toThrow('TRUTH_DEVICE_ID_UNAVAILABLE: Review truth publication requires matching deviceId and identityEpoch');
  });

  it('classifies startup identity, truth, delta, checkpoint, and temp projection evidence', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCardMemoryTruth(bridge, 'startup-evidence-card');
    const database = await loadWorkerDatabaseFromBridge(bridge);

    expect(database.getStartupStorageEvidence()).toMatchObject({
      version: 1,
      identity: {
        status: 'verified',
        deviceId: WORKER_TRUTH_DEVICE_ID,
        identityEpoch: 'epoch-worker-test',
      },
      manifests: {
        status: 'verified',
        count: 1,
      },
      generations: {
        status: 'verified',
        currentGenerationId: 'card-memory-facts-v1',
      },
      truthSegments: {
        status: 'verified',
        count: 1,
      },
      deltaCoverage: {
        status: 'verified',
        truthCoverageFrontier: 0,
        uncoveredMutationCount: 0,
      },
      temporarySqlite: {
        status: 'rebuilt',
        reason: 'temp-projection-missing',
      },
      recoveryState: {
        status: 'ready',
        code: null,
        lastVerifiedGenerationId: 'card-memory-facts-v1',
        disabledCapabilities: [],
      },
    });
  });

  it('reads maintenance status before db.load without consuming startup identity', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());

    await expect(database.getStorageMaintenanceStatus({
      operationId: 'startup-storage-maintenance-v1:schedule:scope',
      migrationId: 'startup-storage-maintenance-v1:schedule:scope',
    })).resolves.toMatchObject({
      required: true,
      status: 'pending',
    });

    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });

    expect(loadResult.readiness).toMatchObject({
      status: 'ready',
      writable: true,
    });
    expect(loadResult.deferredWork[0]?.frontier).toMatchObject({
      pluginInstallationId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
      inputVersion: 'startup-maintenance-input-v1',
    });
  });

  it('reads completed maintenance receipt metadata before db.load on warm restart', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = await loadWorkerDatabaseFromBridge(bridge);
    const receiptRequest = {
      operationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:input:frontier',
      migrationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:input:frontier',
    };
    await first.applyStorageMaintenanceBatch({
      ...receiptRequest,
      batchIndex: 0,
        totalBatches: 1,
        batch: {
          kind: 'startup-maintenance-receipt',
          appliedAt: 1_777_804_699_944,
          receiptVersion: 'startup-storage-maintenance-receipt-v2',
          maintenanceKind: 'startup-storage-maintenance',
          preSuccessFrontier: {
            pluginInstallationId: 'plugin-A',
            identityEpoch: 'epoch-A',
            inputVersion: 'input',
            frontierHash: 'frontier',
            recoveryStatus: null,
            journalSequenceFrontier: null,
            truthCoverageFrontier: null,
            externalInputDirtyGeneration: 0,
            pendingExternalMerge: false,
          },
          postSuccessFrontier: {
            pluginInstallationId: 'plugin-A',
            identityEpoch: 'epoch-A',
            inputVersion: 'input',
            frontierHash: 'frontier',
            recoveryStatus: null,
            journalSequenceFrontier: null,
            truthCoverageFrontier: null,
            externalInputDirtyGeneration: 0,
            pendingExternalMerge: false,
          },
        },
      });

    const restarted = new WorkerSqliteDatabaseService(bridge);

    await expect(restarted.getStorageMaintenanceStatus(receiptRequest)).resolves.toMatchObject({
      required: false,
      status: 'completed',
      completedBatches: 1,
      totalBatches: 1,
    });

    const loadResult = await restarted.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    expect(loadResult.readiness.status).toBe('ready');
    expect(loadResult.deferredWork[0]?.frontier.identityEpoch).toBe('epoch-worker-test');
  });

  it('rejects startup maintenance receipts keyed to the pre-success frontier', async () => {
    const database = await loadWorkerDatabaseFromBridge(createInMemorySqlitePersistenceBridge());

    await expect(database.applyStorageMaintenanceBatch({
      operationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:input:frontier-before',
      migrationId: 'startup-storage-maintenance-receipt-v2:startup-storage-maintenance:plugin-A:epoch-A:input:frontier-before',
      batchIndex: 0,
      totalBatches: 1,
      batch: {
        kind: 'startup-maintenance-receipt',
        appliedAt: 1_777_804_699_944,
        receiptVersion: 'startup-storage-maintenance-receipt-v2',
        maintenanceKind: 'startup-storage-maintenance',
        preSuccessFrontier: {
          pluginInstallationId: 'plugin-A',
          identityEpoch: 'epoch-A',
          inputVersion: 'input',
          frontierHash: 'frontier-before',
          recoveryStatus: null,
          journalSequenceFrontier: null,
          truthCoverageFrontier: null,
          externalInputDirtyGeneration: 0,
          pendingExternalMerge: false,
        },
        postSuccessFrontier: {
          pluginInstallationId: 'plugin-A',
          identityEpoch: 'epoch-A',
          inputVersion: 'input',
          frontierHash: 'frontier-after',
          recoveryStatus: null,
          journalSequenceFrontier: null,
          truthCoverageFrontier: null,
          externalInputDirtyGeneration: 0,
          pendingExternalMerge: false,
        },
      },
    })).rejects.toThrow(
      'INVALID_REQUEST: startup maintenance receipt must be keyed by post-success frontier',
    );
  });

  it('invalidates completed startup maintenance receipts while an external merge is pending', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    const frontier = loadResult.deferredWork![0]!.frontier;
    const receiptRequest = startupReceiptRequest(frontier);
    await persistStartupReceipt(database, frontier);

    await expect(database.getStorageMaintenanceStatus(receiptRequest)).resolves.toMatchObject({
      required: false,
      status: 'completed',
      currentFrontier: {
        frontierHash: frontier.frontierHash,
        pendingExternalMerge: false,
      },
    });

    await bridge.writeBinary('siyuanmemo.db', new Uint8Array([1, 2, 3, 4]));
    await database.mergeExternalDatabaseIfChanged(1_700_000_200_000, {
      context: 'read-only-preflight',
      skipMainDbRead: true,
      externalInputDirty: true,
    });

    const status = await database.getStorageMaintenanceStatus(receiptRequest);
    expect(status).toMatchObject({
      required: true,
      status: 'pending',
      error: expect.stringContaining('STORAGE_MAINTENANCE_FRONTIER_MISMATCH'),
      currentFrontier: {
        pendingExternalMerge: true,
      },
    });
    expect(status.currentFrontier!.externalInputDirtyGeneration).toBeGreaterThan(
      frontier.externalInputDirtyGeneration,
    );
    expect(status.currentFrontier!.frontierHash).not.toBe(frontier.frontierHash);
  });

  it('advances the frontier when a pending external merge commits', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    const frontier = loadResult.deferredWork![0]!.frontier;
    const receiptRequest = startupReceiptRequest(frontier);
    await persistStartupReceipt(database, frontier);

    await bridge.writeBinary('siyuanmemo.db', new Uint8Array([5, 6, 7, 8]));
    await database.mergeExternalDatabaseIfChanged(1_700_000_200_000, {
      context: 'read-only-preflight',
      skipMainDbRead: true,
      externalInputDirty: true,
    });
    const pendingStatus = await database.getStorageMaintenanceStatus(receiptRequest);

    await database.mergeExternalDatabaseIfChanged(1_700_000_200_100);
    const committedStatus = await database.getStorageMaintenanceStatus(receiptRequest);

    expect(pendingStatus.currentFrontier!.pendingExternalMerge).toBe(true);
    expect(committedStatus.currentFrontier).toMatchObject({
      pendingExternalMerge: false,
    });
    expect(committedStatus.currentFrontier!.externalInputDirtyGeneration).toBeGreaterThan(
      pendingStatus.currentFrontier!.externalInputDirtyGeneration,
    );
    expect(committedStatus.currentFrontier!.frontierHash).not.toBe(pendingStatus.currentFrontier!.frontierHash);
  });

  it('reuses a startup receipt across ephemeral runtimes only when durable frontier evidence is unchanged', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = new WorkerSqliteDatabaseService(bridge);
    const firstLoad = await first.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    const firstFrontier = firstLoad.deferredWork![0]!.frontier;
    await persistStartupReceipt(first, firstFrontier);

    const restarted = new WorkerSqliteDatabaseService(bridge);
    const restartedLoad = await restarted.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    const restartedFrontier = restartedLoad.deferredWork![0]!.frontier;

    expect(startupReceiptRequest(restartedFrontier).operationId).toBe(
      startupReceiptRequest(firstFrontier).operationId,
    );
    await expect(restarted.getStorageMaintenanceStatus(
      startupReceiptRequest(restartedFrontier),
    )).resolves.toMatchObject({
      required: false,
      status: 'completed',
    });
  });

  it('keeps startup readable but not writable when hard storage pressure cannot clear', async () => {
    const database = new WorkerSqliteDatabaseService(
      createInMemorySqlitePersistenceBridge(),
      undefined,
      {
        storageBudgetPolicies: [{
          family: 'sqlite-delta',
          files: { target: 0, soft: 0, high: 0, hard: 0 },
        }],
      },
    );
    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });

    expect(loadResult.readiness).toMatchObject({
      status: 'read-only-storage-pressure',
      projectionReadable: true,
      writable: false,
      recovery: {
        status: 'ready',
      },
    });
    expect(loadResult.deferredWork).toEqual([
      expect.objectContaining({
        kind: 'storage-pressure-recovery',
        owner: 'application-context',
        phase: 'post-ready',
        reason: 'db.load',
        safeToDefer: true,
        statusReference: {
          kind: 'kernel-companion-background-work',
          workKind: 'storage-pressure-recovery',
        },
        frontier: expect.objectContaining({
          pluginInstallationId: WORKER_TRUTH_DEVICE_ID,
          identityEpoch: 'epoch-worker-test',
          inputVersion: 'startup-maintenance-input-v1',
          frontierHash: expect.any(String),
          recoveryStatus: 'ready',
        }),
      }),
    ]);
    await expect(database.getStorageMaintenanceStatus({
      operationId: 'startup-storage-maintenance-v1:hard-pressure-test',
      migrationId: 'startup-storage-maintenance-v1',
    })).resolves.toMatchObject({
      required: true,
      status: 'pending',
    });
    await expect(database.getStorageInventory()).resolves.toMatchObject({
      pressure: {
        level: 'hard',
        blockingMutationGrowth: true,
        code: 'STORAGE_PRESSURE',
        metrics: [
          expect.objectContaining({
            family: 'sqlite-delta',
            level: 'hard',
            hardFiles: 0,
          }),
        ],
      },
    });
    await expect(database.commitQueueStateBatch({
      mutationId: 'queue:startup-hard-pressure-block',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['startup-hard-pressure-card'],
      }],
    })).rejects.toThrow('STORAGE_PRESSURE');
  });

  it('does not relocate fully uncovered legacy delta during hard-pressure db.load', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const now = Date.now();
    const segmentPaths = Array.from(
      { length: 17 },
      (_, index) => `sqlite-delta/v2/sqlite-delta-log.v2.sealed-${index + 1}.msgpack`,
    );
    const sealedSegments = [];
    for (const [index, path] of segmentPaths.entries()) {
      const sequence = index + 1;
      const bytes = encode({
        version: 2,
        kind: 'sqlite-delta-segment',
        path,
        sequence,
        sealed: true,
        createdAt: now + index,
        updatedAt: now + index,
        entries: [{
          id: `legacy-startup-${sequence}`,
          version: 1,
          label: 'review.feedback',
          createdAt: now + index,
          schemaFingerprints: {},
          tables: [],
          changes: [],
          mutationEnvelope: null,
          durabilityReceipt: null,
          byteEstimate: 1,
        }],
      });
      await bridge.writeBinary(path, bytes);
      sealedSegments.push({
        version: 2,
        path,
        sequence,
        sealed: true,
        checksum: checksumSqliteDeltaFixture(bytes),
        entryCount: 1,
        byteSize: bytes.byteLength,
        minCreatedAt: now + index,
        maxCreatedAt: now + index,
        sealedAt: now + index,
      });
    }
    await bridge.writeJSON!(SQLITE_DELTA_V2_MANIFEST, {
      version: 2,
      path: SQLITE_DELTA_V2_MANIFEST,
      openSegment: null,
      sealedSegments,
      updatedAt: now,
      nextSequence: segmentPaths.length + 1,
      nextMutationSequence: 1,
      checkpoint: null,
    });
    const orphanPaths = [
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-100.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-101.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-102.msgpack',
    ];
    for (const [index, path] of orphanPaths.entries()) {
      await bridge.writeBinary(path, new Uint8Array(10 + index));
    }
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const deleteFile = vi.fn(bridge.deleteFile!.bind(bridge));
    const database = new WorkerSqliteDatabaseService(
      {
        ...bridge,
        writeBinary,
        writeJSON,
        deleteFile,
      },
      undefined,
      {
        storageBudgetPolicies: [{
          family: 'sqlite-delta',
          files: { target: 1, soft: 1, high: 1, hard: 1 },
        }],
      },
    );

    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-legacy-pressure',
    });

    expect(loadResult.readiness).toMatchObject({
      status: 'read-only-storage-pressure',
      projectionReadable: true,
      writable: false,
    });
    expect(writeBinary.mock.calls.filter(([path]) => (
      String(path).startsWith('sqlite-delta/v2/')
    ))).toEqual([]);
    expect(writeJSON.mock.calls.filter(([path]) => (
      String(path) === SQLITE_DELTA_V2_MANIFEST
    ))).toEqual([]);
    expect(deleteFile.mock.calls.filter(([path]) => (
      segmentPaths.includes(String(path))
    ))).toEqual([]);
    await expect(database.getStorageInventory()).resolves.toMatchObject({
      metrics: expect.arrayContaining([
        expect.objectContaining({
          family: 'sqlite-delta',
          files: 17,
        }),
      ]),
      pressure: {
        level: 'hard',
        blockingMutationGrowth: true,
        reason: expect.stringContaining('no-progress-uncovered'),
      },
    });

    expect((await bridge.listFiles!('sqlite-delta/v2/')).map((entry) => entry.path))
      .toEqual(expect.arrayContaining(orphanPaths));
    await expect(database.cleanupSqliteDeltaOrphans({ dryRun: true })).resolves.toMatchObject({
      cleanup: {
        status: 'dry-run',
        orphanFileCount: 3,
        orphanBytes: 33,
        deletedFiles: [],
      },
      inventory: {
        pressure: {
          level: 'hard',
          blockingMutationGrowth: true,
        },
      },
    });
    const firstCleanup = await database.cleanupSqliteDeltaOrphans({
      maxFiles: 2,
      maxBytes: 1_000,
    });
    expect(firstCleanup).toMatchObject({
      cleanup: {
        status: 'partial',
        remainingOrphanFileCount: 1,
      },
      inventory: {
        pressure: {
          level: 'hard',
          blockingMutationGrowth: true,
        },
      },
    });
    expect(firstCleanup.cleanup.deletedFiles.map((entry) => entry.path)).toEqual(orphanPaths.slice(0, 2));
    expect(await Promise.all(segmentPaths.map(async (path) => Boolean(await bridge.readBinary(path)))))
      .toEqual(segmentPaths.map(() => true));
    await expect(database.cleanupSqliteDeltaOrphans({
      maxFiles: 2,
      maxBytes: 1_000,
    })).resolves.toMatchObject({
      cleanup: {
        status: 'completed',
        remainingOrphanFileCount: 0,
      },
      inventory: {
        pressure: {
          level: 'hard',
          blockingMutationGrowth: true,
        },
      },
    });
  });

  it('adopts legacy card delta, verifies truth, compacts active storage, and rebuilds after restart', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writer = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      { truthPromotionScheduleDelayMs: 60_000 },
    );
    await writer.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-legacy-recovery',
    });
    for (let index = 1; index <= 17; index += 1) {
      const cardId = `legacy-recovery-card-${index}`;
      await writer.commitCardScheduleBatch({
        mutationId: `legacy-recovery-seed-${index}`,
        schedulingWriteSource: 'manual-reschedule',
        cards: [{
          id: cardId,
          xiuyuanID: `xy-${cardId}`,
          blockId: `block-${cardId}`,
          due: 1_700_000_000_000 + index,
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
          state: CardState.New,
          lastReview: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          priority: 50,
          type: CardType.Item,
          tags: [],
          leechCount: 0,
          isLeech: false,
          skipped: false,
          createdAt: 1_600_000_000_000,
          updatedAt: 1_700_000_000_000 + index,
          schedulerType: 'fsrs-v6',
        }],
      });
    }
    await writer.shutdown();
    await stripSqliteDeltaMutationEnvelopes(bridge);

    const recovering = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      {
        truthPromotionScheduleDelayMs: 60_000,
        storageBudgetPolicies: [{
          family: 'sqlite-delta',
          files: { target: 0, soft: 1, high: 1, hard: 1 },
        }],
      },
    );
    const loadResult = await recovering.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-legacy-recovery',
    });
    expect(loadResult.readiness).toMatchObject({
      status: 'read-only-storage-pressure',
      projectionReadable: true,
      writable: false,
    });

    const recovery = await recovering.recoverLegacyDeltaStoragePressure({
      maxCleanupFiles: 64,
      maxCleanupBytes: 16 * 1024 * 1024,
    });

    expect(recovery).toMatchObject({
      ok: true,
      phase: 'completed',
      adoption: {
        status: 'adopted',
        adoptedEntryCount: 17,
        firstJournalSequence: 1,
        lastJournalSequence: 17,
      },
      promotion: {
        truthCoverageFrontier: 17,
        pendingMutationCount: 0,
        batchCount: 1,
      },
      deltaCompaction: {
        status: 'compacted',
        retainedEntryCount: 0,
        remainingSealedSegmentCount: 0,
      },
      orphanCleanup: {
        status: 'completed',
        remainingOrphanFileCount: 0,
      },
      inventory: {
        pressure: {
          level: 'normal',
          blockingMutationGrowth: false,
        },
      },
      error: null,
    });
    await expect(recovering.getCard('legacy-recovery-card-17')).resolves.toMatchObject({
      id: 'legacy-recovery-card-17',
      reps: 0,
    });
    await recovering.shutdown();

    await bridge.deleteFile?.('siyuanmemo.db');
    const restarted = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      { truthPromotionScheduleDelayMs: 60_000 },
    );
    await restarted.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-legacy-recovery',
    });
    await expect(restarted.getCard('legacy-recovery-card-17')).resolves.toMatchObject({
      id: 'legacy-recovery-card-17',
      reps: 0,
    });
    await restarted.shutdown();
  });

  it('runs production truth compaction behind the Worker publication lock', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCompactableCardTruth(bridge);
    const database = await loadWorkerDatabaseFromBridge(bridge);

    await expect(database.compactTruthStorage()).resolves.toMatchObject({
      families: [
        {
          family: 'card-memory-facts',
          status: 'compacted',
          generationId: 'compact-card-memory-facts-1-1',
          coveredJournalSequence: 1,
        },
        {
          family: 'queue-facts',
          status: 'noop',
          generationId: null,
        },
      ],
    });
    expect(bridge.jsonSnapshot(
      `truth/card-memory-facts/device-${WORKER_TRUTH_DEVICE_ID}/generation-fence.v1.json`,
    )).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-1-1',
      },
    });
  });

  it('does not run startup compaction for soft-pressure baseline backlog', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCompactableCardTruth(bridge, 'startup-over-budget-card');
    const database = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      {
        storageBudgetPolicies: [{
          family: 'card-memory-facts',
          files: { target: 0, soft: 1, high: 2, hard: 3 },
        }],
      },
    );

    await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });

    expect(bridge.jsonSnapshot(
      `truth/card-memory-facts/device-${WORKER_TRUTH_DEVICE_ID}/generation-fence.v1.json`,
    )).toBeNull();
    await expect(database.getStorageInventory()).resolves.toMatchObject({
      pressure: {
        level: 'soft',
        blockingMutationGrowth: false,
      },
    });
  });

  it('fails closed with STORAGE_PRESSURE when hard-pressure maintenance cannot publish', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      {
        storageBudgetPolicies: [{
          family: 'card-memory-facts',
          files: { target: 0, soft: 1, high: 1, hard: 1 },
        }],
      },
    );
    await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    await seedCompactableCardTruth(bridge, 'hard-pressure-card');
    const originalWriteJSON = bridge.truthFileStore!.writeJSON.bind(bridge.truthFileStore);
    bridge.truthFileStore!.writeJSON = async (path, data) => {
      if (path.endsWith('/generation-fence.v1.json')) {
        throw new Error('hard-pressure-publication-failed');
      }
      await originalWriteJSON(path, data);
    };

    await expect(database.commitQueueStateBatch({
      mutationId: 'queue:hard-pressure-block',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['hard-pressure-card'],
      }],
    })).rejects.toThrow('STORAGE_PRESSURE');

    await expect(database.getStorageInventory()).resolves.toMatchObject({
      pressure: {
        level: 'hard',
        blockingMutationGrowth: true,
        code: 'STORAGE_PRESSURE',
        reason: expect.stringContaining('hard-pressure-publication-failed'),
      },
    });
    await expect(database.loadQueueState()).resolves.toEqual({});
  });

  it('schedules background maintenance without blocking mutations at soft pressure', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      {
        storageBudgetPolicies: [{
          family: 'card-memory-facts',
          files: { target: 0, soft: 1, high: 3, hard: 4 },
        }],
      },
    );
    await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    await seedCompactableCardTruth(bridge, 'soft-pressure-card');
    vi.useFakeTimers();

    await expect(database.commitQueueStateBatch({
      mutationId: 'queue:soft-pressure-allowed',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['soft-pressure-card'],
      }],
    })).resolves.toMatchObject({
      updatedKeys: ['retrievalPracticeQueue'],
    });
    expect(bridge.jsonSnapshot(
      `truth/card-memory-facts/device-${WORKER_TRUTH_DEVICE_ID}/generation-fence.v1.json`,
    )).toBeNull();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.runAllTimersAsync();
    await database.shutdown();

    expect(bridge.jsonSnapshot(
      `truth/card-memory-facts/device-${WORKER_TRUTH_DEVICE_ID}/generation-fence.v1.json`,
    )).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-1-1',
      },
    });
  });

  it('runs bounded maintenance synchronously before accepting high-pressure growth', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      {
        storageBudgetPolicies: [{
          family: 'card-memory-facts',
          files: { target: 0, soft: 1, high: 1, hard: 8 },
        }],
      },
    );
    await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });
    await seedCompactableCardTruth(bridge, 'high-pressure-card');

    await expect(database.commitQueueStateBatch({
      mutationId: 'queue:high-pressure-maintained',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['high-pressure-card'],
      }],
    })).resolves.toMatchObject({
      updatedKeys: ['retrievalPracticeQueue'],
    });

    expect(bridge.jsonSnapshot(
      `truth/card-memory-facts/device-${WORKER_TRUTH_DEVICE_ID}/generation-fence.v1.json`,
    )).toMatchObject({
      current: {
        generationId: 'compact-card-memory-facts-1-1',
      },
    });
  });

  it('loads previously persisted database bytes with sql.js runtime', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();

    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.runTransaction('seed-worker-db', (db) => {
      db.run('CREATE TABLE worker_db_seed (id TEXT PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO worker_db_seed (id, value) VALUES (?, ?)', ['a', 'persisted']);
    });
    await first.persist();
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();
    const row = second.getOne<{ value: string }>(
      'SELECT value FROM worker_db_seed WHERE id = ?',
      ['a'],
    );

    expect(row).toEqual({ value: 'persisted' });
  });

  it('returns the initialized unified projection snapshot from db.load', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.init();
    await database.upsertCards([{
      id: 'renderer-snapshot-card',
      blockId: 'renderer-snapshot-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'renderer snapshot card' },
    }]);

    const loadResult = await database.load();
    expect(loadResult).toMatchObject({
      ok: true,
      initialized: true,
      readiness: {
        status: 'ready',
        projectionReadable: true,
        writable: true,
      },
      projectionSnapshot: {
        version: 2,
        cards: {
          'renderer-snapshot-card': {
            id: 'renderer-snapshot-card',
            blockId: 'renderer-snapshot-block',
          },
        },
      },
    });
    expect(loadResult.deferredWork).toEqual([
      expect.objectContaining({
        kind: 'startup-storage-maintenance',
        owner: 'application-context',
        phase: 'post-ready',
        reason: 'db.load',
        safeToDefer: true,
        statusReference: {
          kind: 'kernel-companion-background-work',
          workKind: 'startup-storage-maintenance',
        },
        frontier: expect.objectContaining({
          pluginInstallationId: null,
          identityEpoch: null,
          inputVersion: 'startup-maintenance-input-v1',
          frontierHash: expect.any(String),
          journalSequenceFrontier: null,
          truthCoverageFrontier: null,
        }),
      }),
    ]);
  });

  it('returns startup readiness and deferred descriptors from db.reload', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-reload-test',
    });

    const reloadResult = await database.reloadFromDisk({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-reload-test',
    });

    expect(reloadResult).toMatchObject({
      ok: true,
      reloaded: true,
      readiness: {
        status: 'ready',
        projectionReadable: true,
        writable: true,
      },
    });
    expect(reloadResult.deferredWork).toEqual([
      expect.objectContaining({
        kind: 'startup-storage-maintenance',
        owner: 'application-context',
        phase: 'post-ready',
        reason: 'db.reload',
        safeToDefer: true,
        statusReference: {
          kind: 'kernel-companion-background-work',
          workKind: 'startup-storage-maintenance',
        },
        frontier: expect.objectContaining({
          pluginInstallationId: WORKER_TRUTH_DEVICE_ID,
          identityEpoch: 'epoch-worker-reload-test',
          inputVersion: 'startup-maintenance-input-v1',
          frontierHash: expect.any(String),
          journalSequenceFrontier: expect.any(Number),
          truthCoverageFrontier: expect.any(Number),
        }),
      }),
    ]);
  });

  it('keeps unproven startup phases synchronous before deferred descriptor publication', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/db/SqliteDatabaseService.ts'), 'utf8');
    const orderedAnchors = [
      'domainSyncLedger.hasMissingBackfillOperations()',
      "this.runtime.runTransaction('domain-sync.backfill-existing'",
      'await this.replayPendingReviewFeedbackJournalEntries();',
      'await this.reconcileReviewFeedbackJournalProjectionState();',
      'await this.kernelTransactionRuntime.restoreSnapshots();',
      'await this.runOneTimeStorageGrowthBaseline();',
      'const startupPromotionDiagnostics = await this.truthPromotionModule?.diagnostics();',
      'this.startupStorageEvidence = classifyWorkerStartupStorageEvidence({',
      'this.startupTruthPromotionPending = (startupPromotionDiagnostics?.pendingMutationCount ?? 0) > 0;',
      'this.initialized = true;',
    ];

    let previousPosition = -1;
    const positions = orderedAnchors.map((anchor) => {
      const position = source.indexOf(anchor, previousPosition + 1);
      expect(position, anchor).toBeGreaterThanOrEqual(0);
      previousPosition = position;
      return position;
    });
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]).toBeGreaterThan(positions[index - 1]);
    }
    expect(source).toContain("kind: 'truth-promotion'");
    expect(source).toContain('statusReference: {');
    expect(source).toContain("workKind: 'truth-promotion'");
  });

  it('applies read-only recovery readiness and mutation gates during db.reload', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-reload-test',
    });
    const disposition: BackendStartupIdentityDisposition = {
      version: 1,
      status: 'read-only-authority-unavailable',
      writable: false,
      retryable: true,
      deviceId: null,
      identityEpoch: null,
      source: 'unavailable',
      reason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
    };

    const reloadResult = await database.reloadFromDisk({
      startupIdentityDisposition: disposition,
    });

    expect(reloadResult).toMatchObject({
      ok: true,
      reloaded: true,
      readiness: {
        status: 'read-only-authority-unavailable',
        projectionReadable: true,
        writable: false,
        recovery: {
          status: 'read-only-recovery-required',
          code: 'STORAGE_RECOVERY_REQUIRED',
          diagnosticReason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
        },
      },
    });
    expect(reloadResult.deferredWork).toEqual([]);
    await expect(database.upsertCards([])).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
  });

  it('keeps db.load available when pending Review journal replay waits for mutation identity', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'review-journal-waits-for-identity-card';
    const reviewedAt = 1_779_188_700_000;
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await first.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: reviewedAt - 10_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'review journal waits for identity card' },
    }]);
    await first.persist();
    await bridge.reviewFeedbackJournalStore!.appendEntry({
      id: 'review-feedback:identity-wait-key',
      requestId: null,
      cardId,
      idempotencyKey: 'identity-wait-key',
      status: 'prepared',
      recordedAt: reviewedAt,
      request: {
        cardId,
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'identity-wait-key',
      },
      appliedAt: null,
      projectionAppliedAt: null,
      projectionFailedAt: null,
      lastError: null,
    });
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await expect(second.load()).resolves.toMatchObject({
      ok: true,
      initialized: true,
    });
    await expect(second.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastReplay: {
        ok: false,
        pendingCount: 1,
        replayedCount: 0,
        error: expect.stringContaining('TRUTH_DEVICE_ID_UNAVAILABLE'),
      },
    });
    await expect(second.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        available: false,
      },
      disabledCapabilities: expect.arrayContaining([
        'storage-mutations',
      ]),
    });
  });

  it('keeps typed authority-unavailable recovery read-only and preserves pending Review journal work', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'review-journal-authority-unavailable-card';
    const reviewedAt = 1_779_188_710_000;
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await first.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: reviewedAt - 10_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'review journal authority unavailable card' },
    }]);
    await first.persist();
    await bridge.reviewFeedbackJournalStore!.appendEntry({
      id: 'review-feedback:authority-unavailable-key',
      requestId: null,
      cardId,
      idempotencyKey: 'authority-unavailable-key',
      status: 'prepared',
      recordedAt: reviewedAt,
      request: {
        cardId,
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'authority-unavailable-key',
      },
      appliedAt: null,
      projectionAppliedAt: null,
      projectionFailedAt: null,
      lastError: null,
    });
    first.dispose();
    const tracked = wrapBridgeWithTrackedTruthWrites(bridge);
    const disposition: BackendStartupIdentityDisposition = {
      version: 1,
      status: 'read-only-authority-unavailable',
      writable: false,
      retryable: true,
      deviceId: null,
      identityEpoch: null,
      source: 'unavailable',
      reason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
    };

    const second = new WorkerSqliteDatabaseService(tracked.bridge);
    const loadResult = await second.load({ startupIdentityDisposition: disposition });

    expect(loadResult).toMatchObject({
      ok: true,
      initialized: true,
      readiness: {
        status: 'read-only-authority-unavailable',
        projectionReadable: true,
        writable: false,
        recovery: {
          status: 'read-only-recovery-required',
          code: 'STORAGE_RECOVERY_REQUIRED',
          diagnosticReason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
        },
      },
    });
    expect(loadResult.deferredWork).toEqual([]);
    await expect(second.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      statusCounts: expect.objectContaining({
        prepared: 1,
      }),
      lastReplay: {
        ok: false,
        pendingCount: 1,
        replayedCount: 0,
        error: expect.stringContaining('IDENTITY_AUTHORITY_UNAVAILABLE'),
      },
    });
    expect(second.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['authority-unavailable-key'],
    )?.count).toBe(0);
    expect(tracked.truthWriteBinary).not.toHaveBeenCalled();
    expect(tracked.truthWriteJSON).not.toHaveBeenCalled();
    await expect(second.reviewFeedback({
      cardId,
      rating: 3,
      reviewedAt,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'authority-unavailable-write',
    })).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(second.upsertCards([])).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(second.applyStorageMaintenanceBatch({
      operationId: 'authority-unavailable-maintenance',
      migrationId: 'authority-unavailable-maintenance',
      batchIndex: 0,
      totalBatches: 1,
      batch: {
        kind: 'legacy-storage-import-begin',
        appliedAt: reviewedAt,
      },
    })).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(second.promotePendingTruth()).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
  });

  it('exposes only read-only recovery capabilities until verified authority returns', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    const disposition: BackendStartupIdentityDisposition = {
      version: 1,
      status: 'read-only-authority-unavailable',
      writable: false,
      retryable: true,
      deviceId: null,
      identityEpoch: null,
      source: 'unavailable',
      reason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
    };

    const loadResult = await database.load({ startupIdentityDisposition: disposition });

    expect(loadResult.readiness).toMatchObject({
      status: 'read-only-authority-unavailable',
      projectionReadable: true,
      writable: false,
      recovery: {
        status: 'read-only-recovery-required',
        code: 'STORAGE_RECOVERY_REQUIRED',
      },
    });
    expect(loadResult.deferredWork).toEqual([]);
    await expect(database.loadQueueState()).resolves.toEqual({});
    expect(database.getStartupStorageEvidence()).toMatchObject({
      recoveryState: {
        status: 'read-only-recovery-required',
        diagnosticReason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
      },
    });
    await expect(database.getStorageMaintenanceStatus({
      operationId: 'startup-storage-maintenance-v1:read-only-matrix',
      migrationId: 'startup-storage-maintenance-v1',
    })).resolves.toMatchObject({
      required: true,
      status: 'pending',
      currentFrontier: {
        pluginInstallationId: null,
        identityEpoch: null,
        recoveryStatus: 'read-only-recovery-required',
      },
    });
    await expect(database.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: { available: false },
      recovery: {
        status: 'read-only-recovery-required',
        code: 'STORAGE_RECOVERY_REQUIRED',
      },
      disabledCapabilities: expect.arrayContaining([
        'formal-writes',
        'maintenance',
        'review',
        'storage-mutations',
        'truth-promotion',
      ]),
    });
    await expect(database.commitQueueStateBatch({
      mutationId: 'read-only-matrix-queue-state',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: { ids: ['read-only-matrix-card'] },
      }],
    })).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(database.load()).resolves.toMatchObject({
      readiness: {
        status: 'read-only-authority-unavailable',
        writable: false,
      },
    });
    await expect(database.reviewFeedback({
      cardId: 'read-only-matrix-card',
      rating: 3,
      reviewedAt: 1_779_188_730_000,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'read-only-matrix-feedback',
    })).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(database.applyStorageMaintenanceBatch({
      operationId: 'read-only-matrix-maintenance',
      migrationId: 'read-only-matrix-maintenance',
      batchIndex: 0,
      totalBatches: 1,
      batch: {
        kind: 'legacy-storage-import-begin',
        appliedAt: 1_779_188_730_000,
      },
    })).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(database.rebuildSqlProjections({
      rebuildId: 'read-only-matrix-projection-rebuild',
      cause: 'read-only-recovery-capability-matrix',
      families: ['cards'],
      deviceId: WORKER_TRUTH_DEVICE_ID,
      generationId: 'card-memory-facts-v1',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      truthRecords: [],
      truthManifest: {} as never,
      sourceReads: [],
    })).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');

    const repaired = await database.reloadFromDisk({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-repaired',
    });
    expect(repaired.readiness).toMatchObject({
      status: 'ready',
      projectionReadable: true,
      writable: true,
    });
    expect(repaired.deferredWork).toEqual([
      expect.objectContaining({
        kind: 'startup-storage-maintenance',
        frontier: expect.objectContaining({
          pluginInstallationId: WORKER_TRUTH_DEVICE_ID,
          identityEpoch: 'epoch-worker-repaired',
        }),
      }),
    ]);
  });

  it('resumes pending Review journal work once after verified identity returns', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'review-journal-verified-resume-card';
    const reviewedAt = 1_779_188_720_000;
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await first.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: reviewedAt - 10_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'review journal verified resume card' },
    }]);
    await first.persist();
    await bridge.reviewFeedbackJournalStore!.appendEntry({
      id: 'review-feedback:verified-resume-key',
      requestId: null,
      cardId,
      idempotencyKey: 'verified-resume-key',
      status: 'prepared',
      recordedAt: reviewedAt,
      request: {
        cardId,
        rating: 3,
        reviewedAt,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'verified-resume-key',
      },
      appliedAt: null,
      projectionAppliedAt: null,
      projectionFailedAt: null,
      lastError: null,
    });
    first.dispose();
    const blocked = new WorkerSqliteDatabaseService(bridge);
    await blocked.load({
      startupIdentityDisposition: {
        version: 1,
        status: 'read-only-authority-unavailable',
        writable: false,
        retryable: true,
        deviceId: null,
        identityEpoch: null,
        source: 'unavailable',
        reason: 'IDENTITY_AUTHORITY_UNAVAILABLE: indexedDB read denied',
      },
    });
    await expect(blocked.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastReplay: {
        ok: false,
        replayedCount: 0,
      },
    });
    await blocked.shutdown();

    const resumed = new WorkerSqliteDatabaseService(bridge);
    await resumed.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await expect(resumed.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastReplay: {
        ok: true,
        replayedCount: 1,
      },
    });
    expect(resumed.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['verified-resume-key'],
    )?.count).toBe(1);
    const promotion = await resumed.promotePendingTruth();
    expect(promotion).toMatchObject({
      ok: true,
      promotedMutationIds: ['verified-resume-key'],
    });
    await resumed.shutdown();

    const repeatedTracker = wrapBridgeWithTrackedTruthWrites(bridge);
    const repeated = new WorkerSqliteDatabaseService(repeatedTracker.bridge);
    await repeated.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    expect(repeated.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['verified-resume-key'],
    )?.count).toBe(1);
    await expect(repeated.getReviewFeedbackJournalDiagnostics()).resolves.toMatchObject({
      lastReplay: {
        ok: true,
        replayedCount: 0,
      },
    });
    expect(repeatedTracker.truthWriteBinary).not.toHaveBeenCalled();
    expect(repeatedTracker.truthWriteJSON.mock.calls.filter(([path]) => (
      path !== LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH
    ))).toHaveLength(0);
  });

  it('reads Native Riff import exclusions and reports missing records', async () => {
    const database = await loadWorkerDatabaseFromBridge(
      createInMemorySqlitePersistenceBridge(),
    );
    const exclusion = {
      version: 1,
      blockId: 'native-riff-excluded-block',
      nativeCardId: 'native-riff-card',
      deckId: 'native-riff-deck',
      excludedAt: 1_700_000_000_000,
      source: 'user',
      reason: 'user-excluded',
    };
    database.run(
      `INSERT INTO tombstones (
        kind, id, deleted_at, deleted_by, payload_json
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        'native-riff-import-exclusion',
        exclusion.blockId,
        exclusion.excludedAt,
        exclusion.source,
        JSON.stringify(exclusion),
      ],
    );

    await expect(database.findNativeRiffImportExclusion({
      blockId: exclusion.blockId,
    })).resolves.toEqual({ exclusion });
    await expect(database.findNativeRiffImportExclusion({
      blockId: 'native-riff-not-excluded',
    })).resolves.toEqual({ exclusion: null });
  });

  it('rejects Native Riff import exclusion reads without blockId', async () => {
    const database = await loadWorkerDatabaseFromBridge(
      createInMemorySqlitePersistenceBridge(),
    );

    await expect(database.findNativeRiffImportExclusion({ blockId: '   ' }))
      .rejects.toThrow('INVALID_REQUEST: card.nativeRiffImportExclusion.find requires blockId');
  });

  it('fails closed when Native Riff import exclusion evidence is invalid', async () => {
    const database = await loadWorkerDatabaseFromBridge(
      createInMemorySqlitePersistenceBridge(),
    );
    database.run(
      `INSERT INTO tombstones (
        kind, id, deleted_at, deleted_by, payload_json
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        'native-riff-import-exclusion',
        'native-riff-corrupt-block',
        1_700_000_000_000,
        'user',
        JSON.stringify({
          version: 1,
          blockId: 'different-block',
          excludedAt: -1,
          source: 'unknown',
        }),
      ],
    );

    await expect(database.findNativeRiffImportExclusion({
      blockId: 'native-riff-corrupt-block',
    })).rejects.toThrow(
      'STORAGE_RECOVERY_REQUIRED: invalid native Riff import exclusion record',
    );
  });

  it('commits Card/Schedule updates as one journaled Worker mutation', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = await loadWorkerDatabaseFromBridge(bridge);
    const cardId = 'card-schedule-worker-1';

    const result = await database.commitCardScheduleBatch({
      mutationId: 'card-schedule:test-worker-1',
      schedulingWriteSource: 'manual-reschedule',
      cards: [{
        id: cardId,
        xiuyuanID: `xy-${cardId}`,
        blockId: `block-${cardId}`,
        due: 1_700_864_000_000,
        stability: 10,
        difficulty: 5,
        reps: 4,
        lapses: 0,
        state: CardState.Review,
        lastReview: 1_700_000_000_000,
        elapsedDays: 10,
        scheduledDays: 10,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_600_000_000_000,
        updatedAt: 1_700_000_000_000,
        schedulerType: 'fsrs-v6',
      }],
    });

    expect(result).toMatchObject({
      updatedCardIds: [cardId],
      durabilityReceipt: {
        mutationId: 'card-schedule:test-worker-1',
        family: 'card-schedule',
        stage: 'journaled',
        journalSequence: expect.any(Number),
        affectedAggregates: [{
          family: 'card-schedule',
          aggregateId: cardId,
        }],
        requiredTruthOutputs: [{
          family: 'card-schedule',
          kind: 'changeset',
          aggregateIds: [cardId],
        }],
      },
    });
    await expect(database.getCard(cardId)).resolves.toMatchObject({
      id: cardId,
      due: 1_700_864_000_000,
      scheduledDays: 10,
      schedulerType: 'fsrs-v6',
    });
  });

  it('commits Card CRUD upserts and deletions as one journaled Worker mutation', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = await loadWorkerDatabaseFromBridge(bridge);
    const oldCardId = 'card-crud-worker-old';
    const newCardId = 'card-crud-worker-new';

    await database.upsertCards([{
      id: oldCardId,
      xiuyuanID: 'xy-crud-worker-old',
      blockId: 'block-crud-worker-old',
      due: 1_700_000_000_000,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_600_000_000_000,
      updatedAt: 1_700_000_000_000,
    }]);
    await database.runTransaction('seed-card-crud-xiuyuan', (db) => {
      db.run(
        'INSERT INTO xiuyuans (id, updated_at, payload_json) VALUES (?, ?, ?)',
        [
          'xy-crud-worker-old',
          1_700_000_000_000,
          JSON.stringify({
            id: 'xy-crud-worker-old',
            blockIDs: ['block-crud-worker-old'],
            fields: [],
            templateID: 'builtin-quick-card',
            createdAt: 1_600_000_000_000,
            updatedAt: 1_700_000_000_000,
          }),
        ],
      );
    });

    const result = await database.commitCardCrudBatch({
      mutationId: 'card-crud:test-worker-1',
      upsertCards: [{
        id: newCardId,
        xiuyuanID: 'xy-crud-worker-new',
        blockId: 'block-crud-worker-new',
        due: 1_800_000_000_000,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 60,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }],
      upsertXiuyuans: [{
        id: 'xy-crud-worker-new',
        blockIDs: ['block-crud-worker-new'],
        fields: [],
        templateID: 'builtin-quick-card',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }],
      deleteCardIds: [oldCardId],
      deleteXiuyuanIds: ['xy-crud-worker-old'],
    });

    expect(result).toMatchObject({
      upsertedCardIds: [newCardId],
      upsertedXiuyuanIds: ['xy-crud-worker-new'],
      deletedCardIds: [oldCardId],
      deletedXiuyuanIds: ['xy-crud-worker-old'],
      durabilityReceipt: {
        mutationId: 'card-crud:test-worker-1',
        family: 'card-crud',
        stage: 'journaled',
        journalSequence: expect.any(Number),
        requiredTruthOutputs: [{
          family: 'card-crud',
          kind: 'changeset',
          aggregateIds: [newCardId],
        }, {
          family: 'card-crud',
          kind: 'tombstone',
          aggregateIds: [oldCardId],
        }],
      },
    });
    await expect(database.getCard(newCardId)).resolves.toMatchObject({
      id: newCardId,
      xiuyuanID: 'xy-crud-worker-new',
    });
    await expect(database.getCard(oldCardId)).resolves.toBeUndefined();
    expect(database.getOne<{ id: string }>(
      'SELECT id FROM xiuyuans WHERE id = ?',
      ['xy-crud-worker-new'],
    )).toEqual({ id: 'xy-crud-worker-new' });
    expect(database.getOne<{ id: string }>(
      'SELECT id FROM xiuyuans WHERE id = ?',
      ['xy-crud-worker-old'],
    )).toBeNull();
    expect(database.getOne<{ id: string }>(
      'SELECT id FROM tombstones WHERE kind = ? AND id = ?',
      ['card', oldCardId],
    )).toEqual({ id: oldCardId });
  });

  it('commits Queue set and delete changes as one journaled Worker mutation', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = await loadWorkerDatabaseFromBridge(bridge);

    await database.commitQueueStateBatch({
      mutationId: 'queue:test-worker-seed',
      mutations: [{
        operation: 'set',
        key: 'finalDrillQueue',
        value: ['card-old'],
      }],
    });

    const result = await database.commitQueueStateBatch({
      mutationId: 'queue:test-worker-1',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['card-1', 'card-2'],
      }, {
        operation: 'delete',
        key: 'finalDrillQueue',
      }],
    });

    expect(result).toMatchObject({
      updatedKeys: ['retrievalPracticeQueue'],
      deletedKeys: ['finalDrillQueue'],
      durabilityReceipt: {
        mutationId: 'queue:test-worker-1',
        family: 'queue',
        stage: 'journaled',
        journalSequence: expect.any(Number),
        affectedAggregates: [{
          family: 'queue',
          aggregateId: 'finalDrillQueue',
        }, {
          family: 'queue',
          aggregateId: 'retrievalPracticeQueue',
        }],
        requiredTruthOutputs: [{
          family: 'queue',
          kind: 'changeset',
          aggregateIds: ['finalDrillQueue', 'retrievalPracticeQueue'],
        }],
      },
    });
    await expect(database.loadQueueState()).resolves.toEqual({
      retrievalPracticeQueue: ['card-1', 'card-2'],
    });
  });

  it('exposes transferable array buffer helper for binary bridge payloads', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const service = new WorkerSqliteDatabaseService(bridge);
    await service.init();
    await service.persist();

    const snapshot = bridge.snapshot();
    expect(snapshot.bytes).toBeTruthy();
    expect(snapshot.bytes!.byteLength).toBeGreaterThan(16);
  });

  it('does not rewrite the sqlite file during worker init', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));

    const first = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await first.init();
    await first.persist();
    const writesAfterSeed = writeBinary.mock.calls.length;
    first.dispose();

    const second = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await second.init();

    expect(writeBinary).toHaveBeenCalledTimes(writesAfterSeed);
  });

  it('does not import retired unified-cards startup snapshots into truth or projection', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await bridge.writeBinary(RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3]));

    const database = await loadWorkerDatabaseFromBridge(bridge);

    expect(database.getOne<{ id: string }>(
      'SELECT id FROM cards WHERE id = ?',
      ['legacy-startup-card'],
    )).toBeNull();
    expect(bridge.jsonSnapshot(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH)).toBeNull();
    await expect(listTruthFiles(bridge)).resolves.toEqual([]);
  });

  it('rebuilds a deleted temp projection from truth without legacy MessagePack bytes', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCardMemoryTruth(bridge, 'truth-rebuild-card');
    const truthFilesBeforeRestart = await listTruthFiles(bridge);
    await bridge.deleteFile!('siyuanmemo.db');

    const { bridge: trackedBridge, truthWriteBinary, truthWriteJSON } = wrapBridgeWithTrackedTruthWrites(bridge);
    const second = await loadWorkerDatabaseFromBridge(trackedBridge);

    expect(second.getOne<{
      id: string;
      block_id: string;
      msgpack_ref: string;
    }>('SELECT id, block_id, msgpack_ref FROM cards WHERE id = ?', ['truth-rebuild-card']))
      .toMatchObject({
        id: 'truth-rebuild-card',
        block_id: 'block-truth-rebuild-card',
        msgpack_ref: expect.stringContaining('truth/card-memory-facts/'),
      });
    await expect(listTruthFiles(bridge)).resolves.toEqual(expect.arrayContaining([
      ...truthFilesBeforeRestart,
      LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
    ]));
    expect(truthWriteBinary).not.toHaveBeenCalled();
    expect(truthWriteJSON).toHaveBeenCalledWith(
      LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
      expect.objectContaining({ status: 'reconciled' }),
    );
  });

  it('rebuilds a missing temp projection from verified truth plus uncovered delta', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'truth-plus-uncovered-delta-card';
    await seedCardMemoryTruth(bridge, cardId);
    const first = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      { truthPromotionScheduleDelayMs: 60_000 },
    );
    await first.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });

    await first.commitCardScheduleBatch({
      mutationId: 'card-schedule:uncovered-rebuild',
      schedulingWriteSource: 'manual-reschedule',
      cards: [{
        id: cardId,
        xiuyuanID: `xy-${cardId}`,
        blockId: `block-${cardId}`,
        due: 1_800_000_000_000,
        stability: 9,
        difficulty: 4,
        reps: 5,
        lapses: 1,
        state: CardState.Review,
        lastReview: 1_799_000_000_000,
        elapsedDays: 8,
        scheduledDays: 9,
        priority: 70,
        type: CardType.Item,
        tags: ['uncovered'],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_800_000_000_000,
        schedulerType: 'fsrs-v6',
      }],
    });
    await first.shutdown();
    await bridge.deleteFile?.('siyuanmemo.db');

    const recovered = await loadWorkerDatabaseFromBridge(bridge);

    await expect(recovered.getCard(cardId)).resolves.toMatchObject({
      id: cardId,
      due: 1_800_000_000_000,
      stability: 9,
      difficulty: 4,
      reps: 5,
      lastReview: 1_799_000_000_000,
      scheduledDays: 9,
    });
    expect(recovered.getStartupStorageEvidence()).toMatchObject({
      temporarySqlite: {
        status: 'rebuilt',
        reason: 'temp-projection-missing',
      },
      recoveryState: {
        status: 'ready',
        code: null,
      },
    });
  });

  it('falls back to the previous verified generation and replays every later delta mutation', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'previous-generation-delta-recovery-card';
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore: bridge.truthFileStore!,
      family: 'card-memory-facts',
      deviceId: WORKER_TRUTH_DEVICE_ID,
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    });
    const previousState = {
      due: 1_700_100_000_000,
      stability: 2,
      difficulty: 6,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_700_000_000_000,
      elapsedDays: 1,
      scheduledDays: 2,
    };
    const previous = await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-0-1',
      expectedCurrentGenerationId: null,
      records: [createGenerationCardSnapshotRecord(cardId, previousState, 1_700_000_000_000)],
    });
    const first = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      { truthPromotionScheduleDelayMs: 60_000 },
    );
    await first.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });

    const firstDeltaState = {
      due: 1_800_100_000_000,
      stability: 7,
      difficulty: 5,
      reps: 4,
      lapses: 1,
      state: CardState.Review,
      lastReview: 1_799_000_000_000,
      elapsedDays: 5,
      scheduledDays: 7,
    };
    await first.commitCardScheduleBatch({
      mutationId: 'card-schedule:previous-generation-replay:1',
      schedulingWriteSource: 'manual-reschedule',
      cards: [{
        id: cardId,
        xiuyuanID: `xy-${cardId}`,
        blockId: `block-${cardId}`,
        ...firstDeltaState,
        priority: 60,
        type: CardType.Item,
        tags: ['delta-one'],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_800_100_000_000,
        schedulerType: 'fsrs-v6',
      }],
    });
    const current = await generationStore.publishGeneration({
      generationId: 'compact-card-memory-facts-1-1',
      expectedCurrentGenerationId: previous.generation.generationId,
      records: [createGenerationCardSnapshotRecord(cardId, firstDeltaState, 1_800_100_000_000)],
    });

    const finalDeltaState = {
      due: 1_900_100_000_000,
      stability: 11,
      difficulty: 3,
      reps: 8,
      lapses: 1,
      state: CardState.Review,
      lastReview: 1_899_000_000_000,
      elapsedDays: 9,
      scheduledDays: 11,
    };
    await first.commitCardScheduleBatch({
      mutationId: 'card-schedule:previous-generation-replay:2',
      schedulingWriteSource: 'manual-reschedule',
      cards: [{
        id: cardId,
        xiuyuanID: `xy-${cardId}`,
        blockId: `block-${cardId}`,
        ...finalDeltaState,
        priority: 80,
        type: CardType.Item,
        tags: ['delta-two'],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_900_100_000_000,
        schedulerType: 'fsrs-v6',
      }],
    });
    await first.shutdown();
    const corruptSegmentPath = current.generation.manifest.segments[0].path;
    const corruptBytes = await bridge.readBinary(corruptSegmentPath);
    corruptBytes![0] ^= 0xff;
    await bridge.writeBinary(corruptSegmentPath, corruptBytes!);
    await bridge.deleteFile?.('siyuanmemo.db');

    vi.useFakeTimers();
    try {
      const recovered = new WorkerSqliteDatabaseService(
        bridge,
        undefined,
        { truthPromotionScheduleDelayMs: 60_000 },
      );
      await recovered.load({
        truthDeviceId: WORKER_TRUTH_DEVICE_ID,
        identityEpoch: 'epoch-worker-test',
      });

      await expect(recovered.getCard(cardId)).resolves.toMatchObject({
        id: cardId,
        due: finalDeltaState.due,
        stability: finalDeltaState.stability,
        difficulty: finalDeltaState.difficulty,
        reps: finalDeltaState.reps,
        lastReview: finalDeltaState.lastReview,
        scheduledDays: finalDeltaState.scheduledDays,
      });
      expect(recovered.getStartupStorageEvidence()).toMatchObject({
        generations: {
          currentGenerationId: 'compact-card-memory-facts-1-1',
          previousGenerationId: 'compact-card-memory-facts-0-1',
          selectedGenerationId: 'compact-card-memory-facts-0-1',
          reason: expect.stringContaining('checksum-mismatch'),
        },
        recoveryState: {
          status: 'ready',
          lastVerifiedGenerationId: 'compact-card-memory-facts-0-1',
          diagnosticReason: expect.stringContaining('checksum-mismatch'),
        },
      });
      await expect(recovered.getTruthPromotionDiagnostics()).resolves.toMatchObject({
        pendingMutationCount: 2,
        truthCoverageFrontier: 0,
      });

      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      await vi.waitFor(async () => {
        await expect(recovered.getTruthPromotionDiagnostics()).resolves.toMatchObject({
          pendingMutationCount: 0,
          truthCoverageFrontier: 2,
          retryReason: null,
        });
      });
      expect(await bridge.readBinary(corruptSegmentPath)).not.toBeNull();
      expect(bridge.jsonSnapshot(generationStore.fencePath)).toMatchObject({
        current: { generationId: 'compact-card-memory-facts-1-1' },
        previous: { generationId: 'compact-card-memory-facts-0-1' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a corrupt temp projection and rebuilds it from verified truth', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'corrupt-temp-projection-card';
    await seedCardMemoryTruth(bridge, cardId);
    await bridge.writeBinary('siyuanmemo.db', new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

    const recovered = await loadWorkerDatabaseFromBridge(bridge);

    expect(recovered.getOne<{ id: string; block_id: string }>(
      'SELECT id, block_id FROM cards WHERE id = ?',
      [cardId],
    )).toEqual({
      id: cardId,
      block_id: `block-${cardId}`,
    });
    expect(recovered.getStartupStorageEvidence()).toMatchObject({
      temporarySqlite: {
        status: 'rebuilt',
        reason: 'temp-projection-corrupt',
      },
      recoveryState: {
        status: 'ready',
        code: null,
      },
    });
  });

  it('keeps the last projection readable and quarantines corrupt canonical truth across restart', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'corrupt-canonical-read-only-card';
    await seedCardMemoryTruth(bridge, cardId);
    const first = await loadWorkerDatabaseFromBridge(bridge);
    await first.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'corrupt canonical read-only card' },
    }]);
    first.run(
      `INSERT OR REPLACE INTO domain_sync_processed_sources
        (source_id, source_fingerprint, source_kind, path, processed_at,
         imported_operations, ignored_operations, imported_review_events, ignored_review_events,
         imported_cards, ignored_cards, skipped_reason, latest_sanity_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'siyuan-sync-conflict:stale-recovery-source',
        'stale-recovery-fingerprint',
        'unknown',
        null,
        1_700_000_000_000,
        0,
        0,
        0,
        0,
        0,
        0,
        'unknown',
        null,
        '{}',
      ],
    );
    await first.persist();
    expect(bridge.snapshot().bytes).not.toBeNull();
    await first.shutdown();
    await bridge.deleteFile?.('kernel-transaction-ingest.snapshot.json');
    await bridge.deleteFile?.('kernel-transaction-actions.snapshot.json');

    const manifestPath = `truth/card-memory-facts/card-memory-facts-v1/device-${WORKER_TRUTH_DEVICE_ID}/manifest.v1.json`;
    const manifest = bridge.jsonSnapshot(manifestPath) as {
      segments: Array<Record<string, unknown>>;
    };
    const corruptSegmentPath = String(manifest.segments[0].path);
    await bridge.writeJSON!(manifestPath, {
      ...manifest,
      segments: manifest.segments.map((segment) => ({
        ...segment,
        checksum: 'sha256:corrupt',
      })),
    });
    const truthFilesBeforeRecovery = await listTruthFiles(bridge);

    const recovered = await loadWorkerDatabaseFromBridge(bridge);

    await expect(recovered.getCard(cardId)).resolves.toMatchObject({
      id: cardId,
      blockId: `block-${cardId}`,
    });
    await expect(recovered.load()).resolves.toMatchObject({
      projectionSnapshot: expect.objectContaining({
        cards: expect.objectContaining({
          [cardId]: expect.objectContaining({
            id: cardId,
          }),
        }),
      }),
    });
    expect(recovered.getStorageRecoveryState()).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      quarantinedPaths: expect.arrayContaining([
        manifestPath,
        corruptSegmentPath,
      ]),
      disabledCapabilities: expect.arrayContaining([
        'formal-writes',
        'review',
        'maintenance',
        'sync-upload',
        'truth-promotion',
      ]),
      diagnosticReason: expect.stringContaining('TRUTH_VALIDATION_FAILED'),
    });
    const repairPlanCountBeforeDiagnostics = recovered.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_repair_plans',
    )?.count ?? 0;
    const staleSourceCountBeforeDiagnostics = recovered.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['siyuan-sync-conflict:stale-recovery-source'],
    )?.count ?? 0;
    await expect(recovered.previewDomainSyncRepair()).resolves.toMatchObject({
      ok: true,
    });
    await expect(recovered.listDomainSyncConflictSourceCleanupCandidates()).resolves.toMatchObject({
      ok: true,
    });
    expect(recovered.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM domain_sync_repair_plans',
    )?.count).toBe(repairPlanCountBeforeDiagnostics);
    expect(recovered.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM domain_sync_processed_sources
       WHERE source_id = ?`,
      ['siyuan-sync-conflict:stale-recovery-source'],
    )?.count).toBe(staleSourceCountBeforeDiagnostics);
    expect(() => recovered.run(
      'UPDATE cards SET priority = priority + 1 WHERE id = ?',
      [cardId],
    )).toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(recovered.applySourceExistenceSweepFromCandidates(
      [],
      [],
      1_700_000_000_001,
    )).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    const undoJournal = recovered.createReviewTransactionUndoJournal();
    expect(() => undoJournal.append({} as never)).toThrow('STORAGE_RECOVERY_REQUIRED');
    expect(() => undoJournal.consume({} as never)).toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(recovered.persist()).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(recovered.promotePendingTruth()).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
    await expect(listTruthFiles(bridge)).resolves.toEqual(truthFilesBeforeRecovery);

    await recovered.shutdown();
    expect(bridge.jsonSnapshot('kernel-transaction-ingest.snapshot.json')).toBeNull();
    expect(bridge.jsonSnapshot('kernel-transaction-actions.snapshot.json')).toBeNull();
    const restarted = await loadWorkerDatabaseFromBridge(bridge);
    expect(restarted.getStorageRecoveryState()).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      quarantinedPaths: expect.arrayContaining([
        manifestPath,
        corruptSegmentPath,
      ]),
    });
    await expect(restarted.getCard(cardId)).resolves.toMatchObject({ id: cardId });
  });

  it('uses existing truth and ignores retired legacy source divergence', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedCardMemoryTruth(bridge, 'legacy-divergence-card');
    await bridge.writeBinary(RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3]));
    const first = await loadWorkerDatabaseFromBridge(bridge);
    first.dispose();

    const truthFilesAfterMigration = await listTruthFiles(bridge);
    await bridge.deleteFile!('siyuanmemo.db');
    const unchanged = wrapBridgeWithTrackedTruthWrites(bridge);
    const second = await loadWorkerDatabaseFromBridge(unchanged.bridge);

    await expect(listTruthFiles(bridge)).resolves.toEqual(truthFilesAfterMigration);
    expect(unchanged.truthWriteBinary).not.toHaveBeenCalled();
    expect(unchanged.truthWriteJSON).not.toHaveBeenCalled();
    expect(second.getOne<{ id: string }>(
      'SELECT id FROM cards WHERE id = ?',
      ['legacy-divergence-card'],
    )).toEqual({ id: 'legacy-divergence-card' });

    await bridge.deleteFile!('siyuanmemo.db');
    await bridge.writeBinary(RETIRED_LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([9, 9, 9]));
    const diverged = wrapBridgeWithTrackedTruthWrites(bridge);
    const third = await loadWorkerDatabaseFromBridge(diverged.bridge);

    expect(third.getOne<{ id: string }>(
      'SELECT id FROM cards WHERE id = ?',
      ['legacy-divergence-card'],
    )).toEqual({ id: 'legacy-divergence-card' });
    await expect(listTruthFiles(bridge)).resolves.toEqual(truthFilesAfterMigration);
    expect(diverged.truthWriteBinary).not.toHaveBeenCalled();
    expect(diverged.truthWriteJSON).not.toHaveBeenCalled();
  });

  it('keeps repeated queue projection replacements out of durable main database writes', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
      writeJSON,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-card',
      blockId: 'projection-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.length;

    for (const queueType of ['retrieval-practice', 'incremental-learning', 'final-drill']) {
      await database.replaceQueueProjection({
        queueType,
        policyHash: `${queueType}:policy`,
        generation: 1,
        rows: [{
          rowId: `${queueType}:row`,
          cardId: 'projection-card',
          blockId: 'projection-block',
          deckId: null,
          membershipReason: 'test',
          dueAt: 1_700_000_000_000,
          dueBucket: 'due',
          priorityScore: 40,
          sortKey: `0001:${queueType}`,
          queueIndexHint: 1,
          payload: { source: 'test' },
        }],
        reason: 'test-materialization',
      });
    }

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    expect(writeJSON.mock.calls.filter(([path]) => path === 'sqlite-delta-log.v1.json')).toHaveLength(0);
    expect(writeJSON.mock.calls.filter(([path]) => path === SQLITE_DELTA_V2_MANIFEST)).toHaveLength(0);
    expect(writeBinary.mock.calls.filter(([path]) => path === SQLITE_DELTA_V2_OPEN_SEGMENT)).toHaveLength(0);
    await database.persist();

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        deltaEntriesWritten: 0,
        affectedTables: [],
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
        ]),
        skippedDerivedChangeCount: expect.any(Number),
      },
      lastCheckpoint: {
        ok: true,
        cleared: false,
        cause: 'worker.persist',
        initiator: 'db.persist',
        hotPath: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('does not use explicit persist as a durable delta checkpoint for the temp projection', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-flush-card',
      blockId: 'projection-flush-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection flush card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:flush-policy',
      generation: 1,
      rows: [{
        rowId: 'retrieval-practice:flush-row',
        cardId: 'projection-flush-card',
        blockId: 'projection-flush-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:retrieval-practice',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-flush',
    });

    await database.persist();
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);

    await database.persist();
    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        deltaEntriesWritten: 0,
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
        ]),
      },
      lastCheckpoint: {
        ok: true,
        cleared: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('skips queue projection replacement from sqlite delta without writing the main database hot path', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
      writeJSON,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-delta-card',
      blockId: 'projection-delta-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection delta card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:delta-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-delta-row',
        cardId: 'projection-delta-card',
        blockId: 'projection-delta-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-delta',
        queueIndexHint: 1,
        payload: { source: 'test' },
      }],
      reason: 'test-delta-hot-path',
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    expect(writeJSON.mock.calls.some(([path]) => path === 'sqlite-delta-log.v1.json')).toBe(false);
    expect(writeJSON.mock.calls.some(([path]) => path === SQLITE_DELTA_V2_MANIFEST)).toBe(false);
    expect(writeBinary.mock.calls.some(([path]) => path === SQLITE_DELTA_V2_OPEN_SEGMENT)).toBe(false);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      fileName: SQLITE_DELTA_V2_MANIFEST,
      version: 2,
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        deltaEntriesWritten: 0,
        affectedTables: [],
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_generations',
          'queue_projection_rows',
          'queue_projection_counters',
        ]),
      },
    });
  });

  it('replays review feedback canonical sqlite deltas without queue projection rows', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.persist();
    await first.runTransaction('review.feedback', (db) => {
      db.run(
        `INSERT OR REPLACE INTO cards
          (id, block_id, type, state, due, priority, scheduler_type, updated_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-replay-card',
          'review-replay-block',
          CardType.Item,
          CardState.Review,
          1_700_000_000_000,
          40,
          'fsrs',
          1_700_000_000_100,
          JSON.stringify({ content: 'review replay card' }),
        ],
      );
      db.run(
        `INSERT OR REPLACE INTO algorithm_card_state
          (card_id, algorithm_id, state_json, updated_at)
         VALUES (?, ?, ?, ?)`,
        [
          'review-replay-card',
          'fsrs',
          JSON.stringify({ stability: 4, difficulty: 5 }),
          1_700_000_000_100,
        ],
      );
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-replay-event',
          'review-replay-card',
          'review-replay-attempt',
          3,
          1_700_000_000_100,
          'review-replay-commit',
          2026,
          5,
          'review-v2',
          JSON.stringify({ source: 'test' }),
        ],
      );
      db.run(
        `INSERT INTO domain_sync_operations
          (operation_id, source_id, source_device_id, source_generation, operation_type,
           entity_type, entity_id, entity_block_id, occurred_at, observed_at,
           payload_fingerprint, idempotency_key, review_event_id, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-replay-domain-sync',
          'source-review-replay',
          null,
          1,
          'review-committed',
          'card',
          'review-replay-card',
          'review-replay-block',
          1_700_000_000_100,
          1_700_000_000_101,
          'fingerprint-review-replay',
          'domain-sync-review-replay',
          'review-replay-event',
          JSON.stringify({ source: 'test' }),
        ],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_generations
          (queue_type, policy_hash, generation, status, rebuild_reason, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['retrieval-practice', 'review-replay-policy', 1, 'ready', null, 1_700_000_000_100, '{}'],
      );
      db.run(
        `INSERT OR REPLACE INTO queue_projection_rows
          (queue_type, row_id, card_id, block_id, membership_reason, due_at, due_bucket, priority_score,
           sort_key, queue_index_hint, policy_hash, source_generation, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'retrieval-practice',
          'review-replay-projection-row',
          'review-replay-card',
          'review-replay-block',
          'test',
          1_700_000_000_000,
          'due',
          40,
          '0001:review-replay-projection',
          1,
          'review-replay-policy',
          1,
          '{}',
          1_700_000_000_100,
        ],
      );
    });
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();

    expect(second.getOne<{ id: string }>('SELECT id FROM cards WHERE id = ?', ['review-replay-card']))
      .toEqual({ id: 'review-replay-card' });
    expect(second.getOne<{ id: string }>('SELECT id FROM review_events WHERE id = ?', ['review-replay-event']))
      .toEqual({ id: 'review-replay-event' });
    expect(second.getOne<{ operation_id: string }>(
      'SELECT operation_id FROM domain_sync_operations WHERE operation_id = ?',
      ['review-replay-domain-sync'],
    )).toEqual({ operation_id: 'review-replay-domain-sync' });
    expect(second.getOne<{ row_id: string }>(
      'SELECT row_id FROM queue_projection_rows WHERE queue_type = ? AND row_id = ?',
      ['retrieval-practice', 'review-replay-projection-row'],
    )).toBeNull();
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastReplay: { ok: true, replayedCount: 1 },
    });

    await second.persist();
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastCheckpoint: {
        ok: true,
        cleared: false,
        checkpointStorageClass: 'volatile-projection',
      },
    });
  });

  it('keeps projection-applied review feedback durable across restart before truth flush', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'review-projection-applied-restart-card';
    const reviewedAt = 1_779_188_900_000;
    await seedCardMemoryTruth(bridge, cardId, {
      memory: {
        due: reviewedAt - 10_000,
        lastReview: reviewedAt - 86_400_000,
        reps: 42,
        stability: 4,
        difficulty: 5,
        state: CardState.Review,
      },
      payload: {
        blockId: `block-${cardId}`,
        createdAt: reviewedAt - 7 * 86_400_000,
        updatedAt: reviewedAt - 86_400_000,
      },
    });
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await first.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: reviewedAt - 10_000,
      stability: 4,
      difficulty: 5,
      reps: 42,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'review projection-applied restart card' },
    }]);
    await first.persist();
    expect((await first.getCard(cardId))?.reps).toBe(42);

    const feedback = await first.reviewFeedback({
      cardId,
      rating: 3,
      reviewedAt,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'review-projection-applied-restart-key',
    });

    expect(feedback.committed).toBe(true);
    expect(feedback.durabilityReceipt).toMatchObject({
      mutationId: 'review-projection-applied-restart-key',
      stage: 'journaled',
      journalSequence: expect.any(Number),
    });
    const promotion = await first.promotePendingTruth();
    expect(promotion).toMatchObject({
      ok: true,
      promotedMutationIds: ['review-projection-applied-restart-key'],
      coveredJournalSequence: feedback.durabilityReceipt?.journalSequence,
    });
    await expect(first.resolveTruthDurabilityReceipt(feedback.durabilityReceipt!)).resolves.toMatchObject({
      mutationId: 'review-projection-applied-restart-key',
      stage: 'truth-committed',
      truthGenerationId: expect.stringContaining('truth-promotion-'),
    });
    const reviewedCard = await first.getCard(cardId);
    expect(reviewedCard?.reps).toBeGreaterThan(42);
    expect(first.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['review-projection-applied-restart-key'],
    )?.count).toBe(1);
    await bridge.reviewFeedbackJournalStore.updateEntryStatus(
      'review-feedback:review-projection-applied-restart-key',
      'projection-applied',
      {
        appliedAt: reviewedAt,
        projectionAppliedAt: reviewedAt + 1,
      },
    );
    first.dispose();

    const restarted = await loadWorkerDatabaseFromBridge(bridge);
    const restartedCard = await restarted.getCard(cardId);
    expect(restartedCard?.reps).toBe(reviewedCard?.reps);
    expect(restartedCard?.lastReview).toBe(reviewedAt);
    expect(restarted.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
      ['review-projection-applied-restart-key'],
    )?.count).toBe(1);
  });

  it('resumes uncovered journaled truth promotion after restart', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'truth-promotion-restart-card';
    const reviewedAt = 1_779_188_950_000;
    await seedCardMemoryTruth(bridge, cardId, {
      memory: {
        due: reviewedAt - 10_000,
        lastReview: reviewedAt - 86_400_000,
        reps: 4,
        stability: 4,
        difficulty: 5,
        state: CardState.Review,
      },
    });
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await first.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: reviewedAt - 10_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'truth promotion restart card' },
    }]);

    vi.useFakeTimers();
    const feedback = await first.reviewFeedback({
      cardId,
      rating: 3,
      reviewedAt,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'truth-promotion-restart-mutation',
    });
    await expect(first.getTruthPromotionDiagnostics()).resolves.toMatchObject({
      pendingMutationCount: 1,
      truthCoverageFrontier: 0,
    });
    await first.shutdown();
    vi.useRealTimers();

    vi.useFakeTimers();
    try {
      const restarted = new WorkerSqliteDatabaseService(bridge, undefined, {
        truthPromotionScheduleDelayMs: 60_000,
      });
      const loadResult = await restarted.load({
        truthDeviceId: WORKER_TRUTH_DEVICE_ID,
        identityEpoch: 'epoch-worker-test',
      });
      expect(loadResult).toMatchObject({
        readiness: {
          status: 'ready',
          projectionReadable: true,
          writable: true,
        },
        projectionSnapshot: {
          cards: {
            [cardId]: expect.objectContaining({
              id: cardId,
              lastReview: reviewedAt,
            }),
          },
        },
      });
      await expect(restarted.getCard(cardId)).resolves.toMatchObject({
        id: cardId,
        lastReview: reviewedAt,
      });
      expect(restarted.getOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM review_events WHERE commit_idempotency_key = ?',
        ['truth-promotion-restart-mutation'],
      )?.count).toBe(1);
      expect(loadResult.deferredWork).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'startup-storage-maintenance',
          safeToDefer: true,
        }),
        expect.objectContaining({
          kind: 'truth-promotion',
          owner: 'application-context',
          phase: 'post-ready',
          reason: 'db.load',
          safeToDefer: true,
          statusReference: {
            kind: 'kernel-companion-background-work',
            workKind: 'truth-promotion',
          },
          frontier: expect.objectContaining({
            pluginInstallationId: WORKER_TRUTH_DEVICE_ID,
            identityEpoch: 'epoch-worker-test',
            truthCoverageFrontier: 0,
            journalSequenceFrontier: feedback.durabilityReceipt?.journalSequence,
          }),
        }),
      ]));
      await expect(restarted.getTruthPromotionDiagnostics()).resolves.toMatchObject({
        pendingMutationCount: 1,
        truthCoverageFrontier: 0,
      });

      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();
      await vi.waitFor(async () => {
        await expect(restarted.getTruthPromotionDiagnostics()).resolves.toMatchObject({
          pendingMutationCount: 0,
          truthCoverageFrontier: feedback.durabilityReceipt?.journalSequence,
        });
      });
      await expect(restarted.resolveTruthDurabilityReceipt(feedback.durabilityReceipt!)).resolves.toMatchObject({
        stage: 'truth-committed',
        mutationId: 'truth-promotion-restart-mutation',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('automatically continues consecutive bounded truth-promotion batches', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const cardId = 'truth-promotion-bounded-card';
    const reviewedAt = 1_779_188_975_000;
    await seedCardMemoryTruth(bridge, cardId, {
      memory: {
        due: reviewedAt - 10_000,
        lastReview: reviewedAt - 86_400_000,
        reps: 4,
        stability: 4,
        difficulty: 5,
        state: CardState.Review,
      },
    });
    const database = new WorkerSqliteDatabaseService(bridge, undefined, {
      truthPromotionMaxBatchSize: 2,
      truthPromotionScheduleDelayMs: 1_000,
    });
    await database.load({ truthDeviceId: WORKER_TRUTH_DEVICE_ID, identityEpoch: 'epoch-worker-test' });
    await database.upsertCards([{
      id: cardId,
      blockId: `block-${cardId}`,
      due: reviewedAt - 10_000,
      stability: 4,
      difficulty: 5,
      reps: 4,
      lapses: 0,
      state: CardState.Review,
      lastReview: reviewedAt - 86_400_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: reviewedAt - 7 * 86_400_000,
      updatedAt: reviewedAt - 86_400_000,
      meta: { content: 'truth promotion bounded card' },
    }]);

    vi.useFakeTimers();
    const receipts: StorageDurabilityReceipt[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await database.reviewFeedback({
        cardId,
        rating: 3,
        reviewedAt: reviewedAt + index,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: `truth-promotion-bounded-${index + 1}`,
      });
      receipts.push(result.durabilityReceipt!);
    }
    await expect(database.getTruthPromotionDiagnostics()).resolves.toMatchObject({
      pendingMutationCount: 3,
      truthCoverageFrontier: 0,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    vi.useRealTimers();
    await vi.waitFor(async () => {
      await expect(database.getTruthPromotionDiagnostics()).resolves.toMatchObject({
        active: false,
        pendingMutationCount: 0,
        truthCoverageFrontier: receipts[2].journalSequence,
        retryReason: null,
      });
    });
    for (const receipt of receipts) {
      await expect(database.resolveTruthDurabilityReceipt(receipt)).resolves.toMatchObject({
        stage: 'truth-committed',
      });
    }
  });

  it('previews domain sync repair without missing hash helper errors', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    await database.init();
    await database.upsertCards([{
      id: 'repair-preview-card',
      blockId: 'repair-preview-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'repair preview card' },
    }]);
    await database.runTransaction('seed.repair-preview-review-history', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'repair-preview-event',
          'repair-preview-card',
          'repair-preview-attempt',
          3,
          1_700_100_000_000,
          'repair-preview-commit',
          2026,
          5,
          'review-v2',
          JSON.stringify({
            rating: 3,
            reviewedAt: 1_700_100_000_000,
            after: {
              due: 1_700_200_000_000,
              stability: 6,
              difficulty: 4,
              lastReview: 1_700_100_000_000,
              reps: 2,
              lapses: 0,
              state: CardState.Review,
              elapsedDays: 2,
              scheduledDays: 5,
              schedulerType: 'fsrs',
            },
          }),
        ],
      );
    });

    await expect(database.previewDomainSyncRepair({
      cardIds: ['repair-preview-card'],
      includeUnrepairable: true,
      limit: 10,
    }, 1_700_300_000_000)).resolves.toMatchObject({
      ok: true,
      status: 'preview',
      affectedCardCount: 1,
      plannedMutations: [
        expect.objectContaining({ cardId: 'repair-preview-card' }),
      ],
      schedulerEvidence: expect.objectContaining({
        configHash: expect.any(String),
      }),
    });
    expect(database.getOne<{ plan_id: string }>(
      'SELECT plan_id FROM domain_sync_repair_plans WHERE affected_card_count = ?',
      [1],
    )?.plan_id).toContain('domain-sync-repair-preview:1700300000000:');
  });

  it('reads domain sync status without scanning host conflict database sources', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const readSyncConflictDatabaseSources = vi.fn(async () => {
      throw new Error('backend worker host effect sqlite.readSyncConflictDatabaseSources timed out after 5000ms');
    });
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      readSyncConflictDatabaseSources,
    });
    await database.init();

    await expect(database.getDomainSyncStatus(1_700_300_000_000)).resolves.toMatchObject({
      ok: true,
      sanity: {
        checkedAt: 1_700_300_000_000,
      },
    });
    expect(readSyncConflictDatabaseSources).not.toHaveBeenCalled();
  });

  it('replays registered table deletes by primary key rather than rowid', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const first = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await first.init();
    await first.runTransaction('seed.review-event-row-for-delete', (db) => {
      db.run(
        `INSERT INTO review_events
          (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'review-delete-row',
          'review-delete-card',
          'review-delete-attempt',
          3,
          1_700_000_000_000,
          'review-delete-commit',
          2026,
          5,
          'review-v2',
          JSON.stringify({ source: 'delete-test' }),
        ],
      );
    });
    await first.persist();
    const writesBeforeDelete = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await first.runTransaction('review-events.delete-row', (db) => {
      db.run(
        'DELETE FROM review_events WHERE id = ?',
        ['review-delete-row'],
      );
    });
    first.dispose();

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeDelete);
    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();

    expect(second.getOne<{ id: string }>(
      'SELECT id FROM review_events WHERE id = ?',
      ['review-delete-row'],
    )).toBeNull();
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 2,
      lastReplay: { ok: true, replayedCount: 2 },
    });
  });

  it('uses explicit checkpoint mode for unregistered table transactions', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.runTransaction('seed.unsupported-fixture-table', (db) => {
      db.run('CREATE TABLE delta_unsupported_fixture (id TEXT PRIMARY KEY, value TEXT)');
    });
    await database.persist();
    const writesBeforeUnsupported = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.runTransaction('unsupported.fixture.update', (db) => {
      db.run(
        'INSERT OR REPLACE INTO delta_unsupported_fixture (id, value) VALUES (?, ?)',
        ['unsupported-checkpoint-row', 'changed'],
      );
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeUnsupported + 1);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        reason: 'unsupported-table:delta_unsupported_fixture',
      },
    });
  });

  it('uses explicit checkpoint mode for schema-mutating transactions', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.persist();
    const writesBeforeSchemaChange = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.runTransaction('schema.delta-barrier', (db) => {
      db.run('CREATE TABLE schema_delta_barrier (id TEXT PRIMARY KEY, value TEXT)');
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeSchemaChange + 1);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'checkpoint',
        reason: 'schema-dirty',
      },
    });
  });

  it('skips projection-only payloads even when their derived cache rows exceed the delta threshold', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await database.init();
    await database.upsertCards([{
      id: 'projection-threshold-card',
      blockId: 'projection-threshold-block',
      due: 1_700_000_000_000,
      stability: 4,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      state: CardState.Review,
      lastReview: 1_699_900_000_000,
      elapsedDays: 1,
      scheduledDays: 3,
      priority: 40,
      type: CardType.Item,
      tags: [],
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_699_800_000_000,
      updatedAt: 1_700_000_000_000,
      meta: { content: 'projection threshold card' },
    }]);
    await database.persist();
    const writesBeforeProjection = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;

    await database.replaceQueueProjection({
      queueType: 'retrieval-practice',
      policyHash: 'retrieval-practice:threshold-policy',
      generation: 1,
      rows: [{
        rowId: 'projection-threshold-row',
        cardId: 'projection-threshold-card',
        blockId: 'projection-threshold-block',
        deckId: null,
        membershipReason: 'test',
        dueAt: 1_700_000_000_000,
        dueBucket: 'due',
        priorityScore: 40,
        sortKey: '0001:projection-threshold',
        queueIndexHint: 1,
        payload: { source: 'test', large: 'x'.repeat(600_000) },
      }],
      reason: 'test-delta-threshold',
    });

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeProjection);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: true,
        classification: 'delta',
        reason: 'derived-cache-only',
        cause: 'queue.projection.replace',
        initiator: 'queue.projection.replace',
        projectionGeneration: null,
        hotPath: false,
        checkpointStorageClass: 'volatile-projection',
        deltaEntriesWritten: 0,
        skippedDerivedTables: expect.arrayContaining([
          'queue_projection_rows',
        ]),
      },
    });
  });

  it('fails explicitly when a delta-eligible transaction cannot write the sqlite delta log', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    let failDeltaWrite = false;
    const writeJSON = vi.fn(bridge.writeJSON!.bind(bridge));
    const writeBinary = vi.fn(async (path: string, bytes: Uint8Array) => {
      if (path === SQLITE_DELTA_V2_OPEN_SEGMENT && failDeltaWrite) {
        throw new Error('mock delta write failed');
      }
      await bridge.writeBinary(path, bytes);
    });
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
      writeJSON,
    });
    await database.init();
    await database.persist();
    const writesBeforeDurableDelta = writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db').length;
    failDeltaWrite = true;

    await expect(database.runTransaction('metadata.delta-write-fail', (db) => {
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['delta-write-fail', JSON.stringify({ source: 'test' }), 1_700_000_000_000],
      );
    })).rejects.toThrow('mock delta write failed');

    expect(writeBinary.mock.calls.filter(([path]) => path === 'siyuanmemo.db')).toHaveLength(writesBeforeDurableDelta);
    await expect(database.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 0,
      lastWrite: {
        ok: false,
        classification: 'delta',
        error: 'mock delta write failed',
      },
    });
  });

  it('keeps sqlite delta pending when checkpoint write fails after replay', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.persist();
    await first.runTransaction('metadata.checkpoint-fail', (db) => {
      db.run(
        'INSERT OR REPLACE INTO store_metadata (key, value_json, updated_at) VALUES (?, ?, ?)',
        ['checkpoint-fail', JSON.stringify({ source: 'test' }), 1_700_000_000_000],
      );
    });
    first.dispose();

    let failMainDbWrite = true;
    const writeBinary = vi.fn(async (path: string, bytes: Uint8Array) => {
      if (path === 'siyuanmemo.db' && failMainDbWrite) {
        failMainDbWrite = false;
        throw new Error('mock checkpoint failed');
      }
      await bridge.writeBinary(path, bytes);
    });
    const second = new WorkerSqliteDatabaseService({
      ...bridge,
      writeBinary,
    });
    await second.init();

    await expect(second.persist()).rejects.toThrow('mock checkpoint failed');
    await expect(second.getSqliteDeltaDiagnostics()).resolves.toMatchObject({
      pendingCount: 1,
      lastCheckpoint: { ok: false, cleared: false },
    });
  });

  it('enters read-only recovery when sqlite delta log is corrupt', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await bridge.writeJSON!('sqlite-delta-log.v2.manifest.json', {
      version: 99,
      updatedAt: Date.now(),
    });
    const database = new WorkerSqliteDatabaseService(bridge);

    await expect(database.init()).resolves.toBeUndefined();
    await expect(database.load()).resolves.toMatchObject({
      ok: true,
      initialized: true,
    });
    expect(database.getStorageRecoveryState()).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      quarantinedPaths: expect.arrayContaining([
        'sqlite-delta-log.v2.manifest.json',
      ]),
      disabledCapabilities: expect.arrayContaining([
        'formal-writes',
        'review',
        'sync-upload',
      ]),
      diagnosticReason: expect.stringContaining('SQLite delta log unsupported'),
    });
    await expect(database.setQueueStateValue('recovery-write', true)).rejects.toThrow(
      'STORAGE_RECOVERY_REQUIRED',
    );
  });

  it('keeps startup readable and fail-closed when a v2 sealed sqlite delta checksum mismatches', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const now = Date.now();
    const sealedBytes = encode({
      version: 2,
      kind: 'sqlite-delta-segment',
      path: SQLITE_DELTA_V2_SEALED_SEGMENT,
      sequence: 398,
      sealed: true,
      createdAt: now,
      updatedAt: now,
      entries: [],
    });
    await bridge.writeBinary(SQLITE_DELTA_V2_SEALED_SEGMENT, sealedBytes);
    await bridge.writeJSON!(SQLITE_DELTA_V2_MANIFEST, {
      version: 2,
      path: SQLITE_DELTA_V2_MANIFEST,
      openSegment: null,
      sealedSegments: [{
        version: 2,
        path: SQLITE_DELTA_V2_SEALED_SEGMENT,
        sequence: 398,
        sealed: true,
        checksum: 'sha256:corrupt',
        entryCount: 0,
        byteSize: sealedBytes.byteLength,
        minCreatedAt: now,
        maxCreatedAt: now,
        sealedAt: now,
      }],
      updatedAt: now,
      nextSequence: 399,
      nextMutationSequence: 1,
      checkpoint: null,
    });
    const database = new WorkerSqliteDatabaseService(bridge);

    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-test',
    });

    expect(loadResult).toMatchObject({
      ok: true,
      initialized: true,
      readiness: {
        status: 'read-only-recovery-required',
        projectionReadable: true,
        writable: false,
      },
    });
    expect(loadResult.deferredWork).toEqual([]);
    expect(database.getStorageRecoveryState()).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      quarantinedPaths: expect.arrayContaining([
        SQLITE_DELTA_V2_MANIFEST,
        'sqlite-delta-log.v2.manifest.json',
        SQLITE_DELTA_V2_SEALED_SEGMENT,
      ]),
      disabledCapabilities: expect.arrayContaining([
        'formal-writes',
        'review',
        'maintenance',
        'truth-promotion',
      ]),
      diagnosticReason: expect.stringContaining(
        `SQLite delta segment checksum mismatch: ${SQLITE_DELTA_V2_SEALED_SEGMENT}`,
      ),
    });
    await expect(database.setQueueStateValue('recovery-write', true)).rejects.toThrow(
      'STORAGE_RECOVERY_REQUIRED',
    );
    await expect(database.promotePendingTruth()).rejects.toThrow('STORAGE_RECOVERY_REQUIRED');
  });

  it('reads each verified sealed sqlite delta segment once during db.load startup', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const now = Date.now();
    const segmentPaths = Array.from(
      { length: 12 },
      (_, index) => `sqlite-delta/v2/sqlite-delta-log.v2.sealed-${3_047 + index}.msgpack`,
    );
    const sealedSegments = [];
    for (const [index, path] of segmentPaths.entries()) {
      const sequence = 3_047 + index;
      const bytes = encode({
        version: 2,
        kind: 'sqlite-delta-segment',
        path,
        sequence,
        sealed: true,
        createdAt: now + index,
        updatedAt: now + index,
        entries: [{
          id: `startup-segment-${sequence}`,
          version: 1,
          label: 'startup-segment-read-bound',
          createdAt: now + index,
          schemaFingerprints: {},
          tables: [],
          changes: [],
          mutationEnvelope: null,
          durabilityReceipt: null,
          byteEstimate: 1,
        }],
      });
      await bridge.writeBinary(path, bytes);
      sealedSegments.push({
        version: 2,
        path,
        sequence,
        sealed: true,
        checksum: checksumSqliteDeltaFixture(bytes),
        entryCount: 1,
        byteSize: bytes.byteLength,
        minCreatedAt: now + index,
        maxCreatedAt: now + index,
        sealedAt: now + index,
      });
    }
    await bridge.writeJSON!(SQLITE_DELTA_V2_MANIFEST, {
      version: 2,
      path: SQLITE_DELTA_V2_MANIFEST,
      openSegment: null,
      sealedSegments,
      updatedAt: now,
      nextSequence: 3_047 + segmentPaths.length,
      nextMutationSequence: 1,
      checkpoint: null,
    });
    const readBinary = vi.fn(bridge.readBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      readBinary,
    });

    const loadResult = await database.load({
      truthDeviceId: WORKER_TRUTH_DEVICE_ID,
      identityEpoch: 'epoch-worker-startup-read-bound',
    });

    expect(loadResult).toMatchObject({
      ok: true,
      initialized: true,
      readiness: {
        status: 'ready',
        projectionReadable: true,
        writable: true,
      },
    });
    const sealedSegmentReads = readBinary.mock.calls
      .map(([path]) => path)
      .filter((path) => segmentPaths.includes(path));
    expect(sealedSegmentReads).toEqual(segmentPaths);
  });

  it('quarantines an uncovered delta mutation that cannot be replayed', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const now = Date.now();
    const entry = {
      id: 'sqlite-delta:unsupported-table',
      version: 1,
      label: 'unsupported-table',
      createdAt: now,
      schemaFingerprints: { delta_unsupported_fixture: 'unsupported' },
      tables: ['delta_unsupported_fixture'],
      changes: [{
        table: 'delta_unsupported_fixture',
        operation: 'delete',
        primaryKey: { id: 'card-a' },
        row: null,
      }],
      byteEstimate: 1,
    };
    await bridge.writeBinary('sqlite-delta-log.v2.open.msgpack', encode({
      version: 2,
      kind: 'sqlite-delta-segment',
      path: 'sqlite-delta-log.v2.open.msgpack',
      sequence: 1,
      sealed: false,
      createdAt: now,
      updatedAt: Date.now(),
      entries: [entry],
    }));
    await bridge.writeJSON!('sqlite-delta-log.v2.manifest.json', {
      version: 2,
      path: 'sqlite-delta-log.v2.manifest.json',
      openSegment: {
        version: 2,
        path: 'sqlite-delta-log.v2.open.msgpack',
        sequence: 1,
        sealed: false,
        checksum: '',
        entryCount: 1,
        byteSize: 1,
        minCreatedAt: now,
        maxCreatedAt: now,
        sealedAt: null,
      },
      sealedSegments: [],
      updatedAt: now,
      nextSequence: 2,
    });
    const database = new WorkerSqliteDatabaseService(bridge);

    await expect(database.init()).resolves.toBeUndefined();
    expect(database.getStorageRecoveryState()).toMatchObject({
      status: 'read-only-recovery-required',
      code: 'STORAGE_RECOVERY_REQUIRED',
      quarantinedPaths: expect.arrayContaining([
        'sqlite-delta-log.v2.manifest.json',
        'sqlite-delta-log.v2.open.msgpack',
      ]),
      diagnosticReason: expect.stringContaining(
        'SQLite delta replay unsupported table: delta_unsupported_fixture',
      ),
    });
    expect(await bridge.readBinary('sqlite-delta-log.v2.open.msgpack')).not.toBeNull();
  });

  it('keeps read-only sync preflight off persisted SQLite and conflict copies', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const readBinary = vi.fn(bridge.readBinary.bind(bridge));
    const writeBinary = vi.fn(bridge.writeBinary.bind(bridge));
    const database = new WorkerSqliteDatabaseService({
      ...bridge,
      readBinary,
      writeBinary,
    });
    await database.init();
    readBinary.mockClear();
    writeBinary.mockClear();

    const result = await database.mergeExternalDatabaseIfChanged(
      1_700_000_200_000,
      {
        context: 'read-only-preflight',
        skipMainDbRead: true,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      checked: true,
      changed: false,
      mainDbReadSkipped: true,
      mainDbReadSkipReason: 'sqlite-conflict-copies-non-authoritative',
      conflictSourceCount: 0,
      mergedCards: 0,
      mergedReviewEvents: 0,
    });
    expect(readBinary).not.toHaveBeenCalled();
    expect(writeBinary).not.toHaveBeenCalled();
  });

  it('rejects retired SQLite conflict-copy merge authority explicitly', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());

    await expect(database.mergeSyncConflictDatabases({
      mergedAt: 1_700_000_200_000,
      sources: [{ sourceId: 'legacy-conflict-copy', bytes: new Uint8Array([1]) }],
    })).rejects.toThrow(
      'BACKEND_UNAVAILABLE: SQLite conflict copies are non-authoritative; use truth.reconciliation.run',
    );
  });

  it('imports bounded legacy storage batches through Worker maintenance authority', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = await loadWorkerDatabaseFromBridge(bridge);
    const operation = {
      operationId: 'initial-msgpack-json-import-v1',
      migrationId: 'initial-msgpack-json-import-v1',
      totalBatches: 5,
    };

    await database.applyStorageMaintenanceBatch({
      ...operation,
      batchIndex: 0,
      batch: { kind: 'legacy-storage-import-begin', appliedAt: 1_700_000_000_000 },
    });
    await database.applyStorageMaintenanceBatch({
      ...operation,
      batchIndex: 1,
      batch: { kind: 'legacy-unified-reset' },
    });
    await database.applyStorageMaintenanceBatch({
      ...operation,
      batchIndex: 2,
      batch: {
        kind: 'legacy-unified-records',
        records: [{
          kind: 'card',
          id: 'legacy-worker-card',
          card: {
            id: 'legacy-worker-card',
            blockId: 'legacy-worker-block',
            xiuyuanID: 'legacy-worker-xiuyuan',
            due: 1_700_000_100_000,
            stability: 0,
            difficulty: 0,
            reps: 0,
            lapses: 0,
            state: CardState.New,
            lastReview: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            priority: 50,
            type: CardType.Item,
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
            schedulerType: 'fsrs-v6',
          },
        }],
      },
    });
    await database.applyStorageMaintenanceBatch({
      ...operation,
      batchIndex: 3,
      batch: {
        kind: 'legacy-queue-records',
        entries: [['legacyQueue', { ids: ['legacy-worker-card'] }]],
      },
    });
    const completed = await database.applyStorageMaintenanceBatch({
      ...operation,
      batchIndex: 4,
      batch: {
        kind: 'legacy-unified-finalize',
        version: 2,
        syncMetadata: { source: 'legacy-worker-test' },
        appliedAt: 1_700_000_000_100,
      },
    });

    expect(completed).toMatchObject({
      status: 'completed',
      completedBatches: 5,
      lastMutationId: 'maintenance:initial-msgpack-json-import-v1:batch:4',
    });
    await expect(database.getCard('legacy-worker-card')).resolves.toMatchObject({
      id: 'legacy-worker-card',
      blockId: 'legacy-worker-block',
    });
    await expect(database.loadQueueState()).resolves.toEqual({
      legacyQueue: { ids: ['legacy-worker-card'] },
    });

    const duplicate = await database.applyStorageMaintenanceBatch({
      ...operation,
      batchIndex: 0,
      batch: { kind: 'legacy-storage-import-begin', appliedAt: 1_700_000_000_200 },
    });
    expect(duplicate.status).toBe('completed');
    expect(duplicate.completedBatches).toBe(5);
  });

  it('executes legacy review, arena, Native Riff, and neural-route migrations in Worker transactions', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = await loadWorkerDatabaseFromBridge(bridge);
    const applySingleBatch = (
      operationId: string,
      batch: Parameters<WorkerSqliteDatabaseService['applyStorageMaintenanceBatch']>[0]['batch'],
    ) => database.applyStorageMaintenanceBatch({
      operationId,
      migrationId: operationId,
      batchIndex: 0,
      totalBatches: 1,
      batch,
    });

    await applySingleBatch('legacy-review-import-test-v1', {
      kind: 'legacy-review-records',
      records: [{
        kind: 'review',
        value: {
          id: 'legacy-review-1',
          cardId: 'legacy-card-1',
          rating: 3,
          state: CardState.Review,
          scheduledDays: 3,
          elapsedDays: 2,
          review: 1_700_000_000_000,
          stability: 4,
          difficulty: 5,
        },
      }],
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM review_events WHERE id = ?',
      ['legacy-review-1'],
    )?.count).toBe(1);

    await applySingleBatch('legacy-arena-import-test-v1', {
      kind: 'legacy-arena-records',
      records: [
        {
          kind: 'match',
          value: {
            id: 'legacy-arena-match-1',
            domain: 'ai',
            poolKey: 'ai::test',
            createdAt: 1_700_000_000_010,
            ai: {
              exposureId: 'exposure-1',
              sessionId: null,
              packId: 'pack-1',
              challengerPackIds: [],
              skillId: null,
              tabId: null,
              eventType: 'exposure',
              scoreDelta: 0,
            },
          },
        },
        {
          kind: 'score',
          value: {
            id: 'legacy-arena-score-1',
            domain: 'ai',
            poolKey: 'ai::test',
            createdAt: 1_700_000_000_020,
            entries: [],
          },
        },
        {
          kind: 'attribution',
          value: {
            cardId: 'legacy-card-1',
            poolKey: 'ai::test',
            surface: 'standalone-dialog',
            scenarioId: 'candidate-card-generation',
            targetKind: 'item',
            sourcePackId: 'pack-1',
            sourcePackTitle: 'Pack 1',
            exposureId: 'exposure-1',
            createdAt: 1_700_000_000_030,
            updatedAt: 1_700_000_000_030,
            reviewCount: 0,
            lastReviewAt: null,
            lastOutcome: null,
          },
        },
      ],
    });
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM ai_arena_events WHERE id = ?',
      ['legacy-arena-match-1'],
    )?.count).toBe(1);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM arena_score_snapshots WHERE id = ?',
      ['legacy-arena-score-1'],
    )?.count).toBe(1);
    expect(database.getOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM ai_card_attributions WHERE card_id = ?',
      ['legacy-card-1'],
    )?.count).toBe(1);

    database.run('CREATE TABLE riff_sync (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)');
    database.run(
      'INSERT INTO riff_sync (key, value_json) VALUES (?, ?)',
      ['blacklist', JSON.stringify(['stored-block', 'direct-block'])],
    );
    await applySingleBatch('native-riff-retirement-test-v1', {
      kind: 'native-riff-retirement',
      blockIds: ['direct-block'],
      appliedAt: 1_700_000_000_040,
      includeStoredBlacklist: true,
      dropLegacyTable: true,
    });
    expect(database.getAll<{ id: string }>(
      `SELECT id FROM tombstones
       WHERE kind = 'native-riff-import-exclusion'
       ORDER BY id`,
    )).toEqual([
      { id: 'direct-block' },
      { id: 'stored-block' },
    ]);
    expect(database.getOne<{ present: number }>(
      `SELECT 1 AS present FROM sqlite_master
       WHERE type = 'table' AND name = 'riff_sync'`,
    )).toBeNull();

    await applySingleBatch('legacy-neural-queue-seed-test-v1', {
      kind: 'legacy-queue-records',
      entries: [['neuralRoamQueue', {
        version: 6,
        seedPool: [{
          nodeId: 'concept-a',
          nodeKind: 'concept',
          priority: 0.5,
          neighborsViewed: 0,
          addedAt: 1,
          nodePreview: 'Concept A',
        }],
        anchorPool: [],
        session: {
          displayPath: [],
          currentPathIndex: -1,
          navigationMode: 'explore',
          bookmarkPathIndex: null,
          history: [],
          currentFocus: null,
          currentSessionId: null,
          visitedBlocks: [],
          exhaustedFocuses: [],
        },
      }]],
    });
    await applySingleBatch('neural-roam-route-migration-test-v1', {
      kind: 'neural-roam-route-migration',
      appliedAt: 1_700_000_000_050,
    });
    expect(database.getOne<{ route_id: string }>(
      'SELECT route_id FROM neural_roam_routes LIMIT 1',
    )?.route_id).toBe('default');
    expect(database.getOne<{ node_id: string }>(
      `SELECT node_id FROM neural_roam_route_pool_entries
       WHERE route_id = 'default' AND kind = 'seed'
       LIMIT 1`,
    )?.node_id).toBe('concept-a');
  });

  it('rebuilds queue state and queue projection rows from canonical truth', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await database.load();
    const generationId = 'reconciliation-queue-generation';
    const projection = await database.rebuildSqlProjections({
      rebuildId: 'reconcile-queue-projection',
      cause: 'truth-reconciliation:test',
      families: ['queue-projections'],
      deviceId: WORKER_TRUTH_DEVICE_ID,
      generationId,
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      truthRecords: [{
        family: 'queue-facts',
        schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
        type: 'queue-state.changeset.v1',
        idempotencyKey: 'queue-state:manual:set',
        mutationId: 'mutation-queue-state',
        queueFamily: 'retrievalPracticeQueue',
        causalBaseRevision: null,
        revision: 'revision-queue-state',
        journalSequence: 1,
        logicalTime: 10,
        recordedAt: 10,
        members: null,
        changes: null,
        stateChange: {
          operation: 'set',
          key: 'retrievalPracticeQueue',
          value: {
            cardIds: ['card-queue-1'],
          },
        },
      }, {
        family: 'queue-facts',
        schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
        type: 'queue-family.snapshot.v1',
        idempotencyKey: 'queue-family:retrieval-practice:snapshot',
        mutationId: 'mutation-queue-members',
        queueFamily: 'retrieval-practice',
        causalBaseRevision: null,
        revision: 'revision-queue-members',
        journalSequence: 2,
        logicalTime: 20,
        recordedAt: 20,
        members: [{
          cardId: 'card-queue-1',
          due: 100,
          priority: 75,
          state: CardState.Review,
          schedulerType: 'fsrs-v6',
          membershipReason: 'reconciled',
          sortKey: '0001',
        }],
        changes: null,
      }],
      truthManifest: {
        version: 1,
        path: `truth/queue-facts/${generationId}/device-${WORKER_TRUTH_DEVICE_ID}/manifest.v1.json`,
        family: 'queue-facts',
        deviceId: WORKER_TRUTH_DEVICE_ID,
        generationId,
        schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
        segments: [],
        updatedAt: 20,
      },
      sourceReads: [],
    });

    expect(projection).toMatchObject({
      status: 'ready',
      families: [{
        family: 'queue-projections',
        status: 'ready',
        rowsRead: 2,
        rowsWritten: 2,
      }],
    });
    expect(database.getOne<{ value_json: string }>(
      'SELECT value_json FROM queue_state WHERE key = ?',
      ['retrievalPracticeQueue'],
    )?.value_json).toBe(JSON.stringify({
      cardIds: ['card-queue-1'],
    }));
    expect(database.getAll<{
      queue_type: string;
      card_id: string;
      membership_reason: string;
      policy_hash: string;
    }>(
      `SELECT queue_type, card_id, membership_reason, policy_hash
       FROM queue_projection_rows
       ORDER BY queue_type, card_id`,
    )).toEqual([{
      queue_type: 'retrieval-practice',
      card_id: 'card-queue-1',
      membership_reason: 'reconciled',
      policy_hash: `canonical-truth:${generationId}:revision-queue-members`,
    }]);
  });
});
