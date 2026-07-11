import { describe, expect, it } from 'vitest';
import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type MessagePackCardAggregateChangesetTruthRecord,
  type MessagePackQueueStateChangesetTruthRecord,
} from '../../packages/contracts/src/backend-rpc';
import { CardState } from '@/types/card';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { createMessagePackTruthSegmentStore } from '../truth/MessagePackTruthSegmentStore';

const LOCAL_DEVICE_ID = 'device-storage-lifecycle-local';
const LOCAL_IDENTITY_EPOCH = 'epoch-storage-lifecycle-local';
const REMOTE_DEVICE_ID = 'device-storage-lifecycle-remote';
const REMOTE_IDENTITY_EPOCH = 'epoch-storage-lifecycle-remote';

async function seedLocalCardTruth(
  bridge: ReturnType<typeof createInMemorySqlitePersistenceBridge>,
): Promise<void> {
  const store = createMessagePackTruthSegmentStore({
    fileStore: bridge.truthFileStore!,
    family: 'card-memory-facts',
    deviceId: LOCAL_DEVICE_ID,
    generationId: 'card-memory-facts-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  });
  const record: MessagePackCardAggregateChangesetTruthRecord = {
    family: 'card-memory-facts',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: 'card-aggregate.changeset.v1',
    idempotencyKey: 'card:storage-lifecycle:seed',
    mutationId: 'card:storage-lifecycle:seed',
    aggregateId: 'card-local',
    causalBaseRevision: null,
    revision: 'revision:storage-lifecycle:seed',
    journalSequence: 1,
    logicalTime: 1,
    recordedAt: 1,
    card: {
      id: 'card-local',
      blockId: 'block-card-local',
      xiuyuanId: 'xy-card-local',
      faceKey: null,
      type: 'item',
      priority: 50,
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
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
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

describe('storage truth lifecycle integration', () => {
  it('carries identity through journal, promotion, compaction, restart rebuild, and reconciliation', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    await seedLocalCardTruth(bridge);
    const first = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      { truthPromotionScheduleDelayMs: 60_000 },
    );
    await first.load({
      truthDeviceId: LOCAL_DEVICE_ID,
      identityEpoch: LOCAL_IDENTITY_EPOCH,
    });

    await expect(first.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        available: true,
        deviceId: LOCAL_DEVICE_ID,
        identityEpoch: LOCAL_IDENTITY_EPOCH,
      },
      recovery: {
        status: 'ready',
      },
    });

    const committed = await first.commitQueueStateBatch({
      mutationId: 'queue:storage-lifecycle:local',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: {
          cardIds: ['card-local'],
        },
      }],
    });
    expect(committed.durabilityReceipt).toMatchObject({
      mutationId: 'queue:storage-lifecycle:local',
      family: 'queue',
      stage: 'journaled',
      journalSequence: expect.any(Number),
    });
    await expect(first.getTruthPromotionDiagnostics()).resolves.toMatchObject({
      pendingMutationCount: 1,
      truthCoverageFrontier: 0,
    });

    await expect(first.promotePendingTruth()).resolves.toMatchObject({
      ok: true,
      promotedMutationIds: ['queue:storage-lifecycle:local'],
      coveredJournalSequence: committed.durabilityReceipt.journalSequence,
    });
    await expect(
      first.resolveTruthDurabilityReceipt(committed.durabilityReceipt),
    ).resolves.toMatchObject({
      mutationId: 'queue:storage-lifecycle:local',
      stage: 'truth-committed',
      truthGenerationId: expect.stringContaining('truth-promotion-'),
    });

    await expect(first.compactTruthStorage()).resolves.toMatchObject({
      families: expect.arrayContaining([
        expect.objectContaining({
          family: 'queue-facts',
          status: 'compacted',
        }),
      ]),
    });
    await expect(first.getStorageInventory()).resolves.toMatchObject({
      pressure: {
        level: 'normal',
        blockingMutationGrowth: false,
      },
    });
    await first.shutdown();

    await bridge.deleteFile?.('siyuanmemo.db');
    const restarted = new WorkerSqliteDatabaseService(
      bridge,
      undefined,
      { truthPromotionScheduleDelayMs: 60_000 },
    );
    await restarted.load({
      truthDeviceId: LOCAL_DEVICE_ID,
      identityEpoch: LOCAL_IDENTITY_EPOCH,
    });
    expect(restarted.getStartupStorageEvidence()).toMatchObject({
      identity: {
        status: 'verified',
        deviceId: LOCAL_DEVICE_ID,
        identityEpoch: LOCAL_IDENTITY_EPOCH,
      },
      temporarySqlite: {
        status: 'rebuilt',
        reason: 'temp-projection-missing',
      },
      recoveryState: {
        status: 'ready',
      },
    });
    await expect(restarted.loadQueueState()).resolves.toMatchObject({
      retrievalPracticeQueue: {
        cardIds: ['card-local'],
      },
    });

    const remoteStore = createMessagePackTruthSegmentStore({
      fileStore: bridge.truthFileStore!,
      family: 'queue-facts',
      deviceId: REMOTE_DEVICE_ID,
      generationId: 'queue-facts-v1',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    });
    const remoteRecord: MessagePackQueueStateChangesetTruthRecord = {
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-state.changeset.v1',
      idempotencyKey: 'queue:storage-lifecycle:remote',
      mutationId: 'queue:storage-lifecycle:remote',
      queueFamily: 'finalDrillQueue',
      causalBaseRevision: null,
      revision: 'revision:storage-lifecycle:remote',
      journalSequence: 1,
      logicalTime: 2,
      recordedAt: 2,
      members: null,
      changes: null,
      stateChange: {
        operation: 'set',
        key: 'finalDrillQueue',
        value: {
          cardIds: ['card-remote'],
          deviceId: REMOTE_DEVICE_ID,
          identityEpoch: REMOTE_IDENTITY_EPOCH,
        },
      },
    };
    await remoteStore.appendRecords([remoteRecord]);

    const reconciliation = await restarted.reconcileCanonicalTruth({
      reason: 'storage-lifecycle-integration',
    });
    expect(reconciliation).toMatchObject({
      ok: true,
      acceptedMutationIds: expect.arrayContaining([
        'queue:storage-lifecycle:local',
        'queue:storage-lifecycle:remote',
      ]),
      blockedAggregateIds: [],
      conflicts: [],
      projectionRebuilt: true,
    });
    expect(reconciliation.sourceCount).toBeGreaterThanOrEqual(3);
    await expect(restarted.loadQueueState()).resolves.toMatchObject({
      retrievalPracticeQueue: {
        cardIds: ['card-local'],
      },
      finalDrillQueue: {
        cardIds: ['card-remote'],
        deviceId: REMOTE_DEVICE_ID,
        identityEpoch: REMOTE_IDENTITY_EPOCH,
      },
    });
    await expect(restarted.getCombinedStorageDiagnostics()).resolves.toMatchObject({
      identity: {
        deviceId: LOCAL_DEVICE_ID,
        identityEpoch: LOCAL_IDENTITY_EPOCH,
      },
      reconciliation: {
        status: 'succeeded',
        reason: 'storage-lifecycle-integration',
        sourceCount: reconciliation.sourceCount,
        conflictCount: 0,
        projectionRebuilt: true,
      },
      disabledCapabilities: [],
    });

    await restarted.shutdown();
  });
});
