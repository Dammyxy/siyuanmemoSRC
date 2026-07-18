import { describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  TRUTH_COVERAGE_WATERMARK_VERSION,
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryContinuityPlan,
  type TruthDeviceIdentityAuthorityEnvelopeContract,
} from '../../../packages/contracts/src/backend-rpc';
import { createInMemorySqlitePersistenceBridge } from '../../db/SqlitePersistenceBridge';
import { createMessagePackTruthSegmentStore } from '../../truth/MessagePackTruthSegmentStore';
import { WORKER_VERIFIED_MUTATION_FRONTIER_VERSION } from '../../truth/WorkerVerifiedMutationFrontier';
import { WORKER_TRUTH_PROMOTION_STATE_VERSION } from '../../truth/WorkerTruthPromotionModule';
import { snapshotImmutableMutationIdentity } from '../ForeignEpochJournalContinuityInvariant';
import { WorkerSqliteForeignEpochContinuityApplier } from '../WorkerSqliteForeignEpochContinuityApplier';

const DEVICE_ID = 'device-recovery';
const PREDECESSOR_EPOCH = 'epoch-predecessor';
const ORIGINAL_EPOCH = 'epoch-original';
const CURRENT_EPOCH = 'epoch-current';
const MUTATION_ID = 'mutation-404';

function journalEntry404() {
  const requiredTruthOutputs = [{
    family: 'review',
    kind: 'event' as const,
    aggregateIds: ['card-1'],
  }];
  return {
    createdAt: 404_000,
    mutationEnvelope: {
      version: STORAGE_MUTATION_ENVELOPE_VERSION,
      mutationId: MUTATION_ID,
      family: 'review' as const,
      deviceId: DEVICE_ID,
      identityEpoch: ORIGINAL_EPOCH,
      journalSequence: 404,
      createdAt: 404_000,
      affectedAggregates: [],
      operations: [{
        table: 'review_events',
        operation: 'insert' as const,
        primaryKey: { id: 'review-404' },
        row: { card_id: 'card-1', rating: 3, idempotencyKey: 'review-404-key' },
      }],
      requiredTruthOutputs,
    },
    durabilityReceipt: {
      version: STORAGE_DURABILITY_RECEIPT_VERSION,
      mutationId: MUTATION_ID,
      family: 'review' as const,
      stage: 'journaled' as const,
      journalSequence: 404,
      affectedAggregates: [],
      requiredTruthOutputs,
      truthGenerationId: null,
      retry: { attemptCount: 0, nextAttemptAt: null, lastError: null },
      diagnosticCode: null,
      diagnosticMessage: null,
      updatedAt: 404_000,
    },
  };
}

async function createHarness(input: { failManifestOnce?: boolean } = {}) {
  const bridge = createInMemorySqlitePersistenceBridge();
  const truthFileStore = bridge.truthFileStore!;
  const entry = journalEntry404();
  const predecessorCoverage = {
    version: TRUTH_COVERAGE_WATERMARK_VERSION,
    deviceId: DEVICE_ID,
    identityEpoch: PREDECESSOR_EPOCH,
    coveredJournalSequence: 403,
    coveredMutationId: 'mutation-403',
    truthGenerationId: 'truth-generation-403',
    updatedAt: 403_000,
  };
  await truthFileStore.writeJSON(
    `truth/promotion/device-${DEVICE_ID}/epoch-${PREDECESSOR_EPOCH}/state.v1.json`,
    {
      version: WORKER_TRUTH_PROMOTION_STATE_VERSION,
      deviceId: DEVICE_ID,
      identityEpoch: PREDECESSOR_EPOCH,
      coverage: predecessorCoverage,
      retry: null,
      lastSuccessfulPromotionAt: 403_000,
      updatedAt: 403_000,
    },
  );
  await truthFileStore.writeJSON(
    `truth/promotion/device-${DEVICE_ID}/epoch-${ORIGINAL_EPOCH}/state.v1.json`,
    {
      version: WORKER_TRUTH_PROMOTION_STATE_VERSION,
      deviceId: DEVICE_ID,
      identityEpoch: ORIGINAL_EPOCH,
      coverage: null,
      retry: {
        mutationId: MUTATION_ID,
        journalSequence: 404,
        attemptCount: 1,
        nextAttemptAt: null,
        lastError: 'journal-sequence-gap:1:404',
      },
      lastSuccessfulPromotionAt: null,
      updatedAt: 404_000,
    },
  );
  await truthFileStore.writeJSON(`truth/promotion/device-${DEVICE_ID}/frontier.v1.json`, {
    version: WORKER_VERIFIED_MUTATION_FRONTIER_VERSION,
    deviceId: DEVICE_ID,
    activeIdentityEpoch: CURRENT_EPOCH,
    status: 'recovery-required',
    coverage: null,
    journalSequenceFrontier: 0,
    journalMutationId: null,
    pendingLegacyRebindMutationIds: [],
    transition: null,
    retry: null,
    lastSuccessfulPromotionAt: null,
    blockingCode: 'FRONTIER_FOREIGN_EPOCH_UNCOVERED',
    blockingReason: `frontier-foreign-epoch-uncovered:404:${ORIGINAL_EPOCH}`,
    updatedAt: 405_000,
  });
  const authority: TruthDeviceIdentityAuthorityEnvelopeContract = {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
    revision: 1,
    identity: {
      version: TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
      deviceId: DEVICE_ID,
      identityEpoch: CURRENT_EPOCH,
      hostFingerprint: null,
      createdAt: 100,
      lastSeenAt: 100,
    },
    previousRevision: null,
    publishedAt: 100,
  };
  const originalMutation = await snapshotImmutableMutationIdentity(entry);
  const base = {
    version: FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
    operationId: 'continuity-operation',
    stage: 'continuity' as const,
    evidenceHash: await hashRecoveryContent('evidence'),
    backupScopeHash: await hashRecoveryContent('backup'),
    createdAt: 500_000,
    blockers: [],
    authorityPublicationIntent: null,
    continuityIntent: {
      originalMutation,
      predecessorIdentityEpoch: PREDECESSOR_EPOCH,
      predecessorCoverageSequence: 403,
      predecessorCoverageHash: await hashRecoveryContent(predecessorCoverage),
      expectedAuthorityRevision: authority.revision,
      expectedAuthorityHash: await hashRecoveryContent(authority),
      expectedCurrentIdentityEpoch: CURRENT_EPOCH,
      expectedNextJournalSequence: 405,
      expectedNextJournalSequenceAfterRecovery: 405,
      requiredTruthManifestHashes: [],
    },
  };
  const plan: BackendForeignEpochRecoveryContinuityPlan = {
    ...base,
    planHash: await hashRecoveryContent(base),
  };
  const database = {
    getForeignEpochRecoveryTruthConfiguration: vi.fn(() => ({
      deviceId: DEVICE_ID,
      currentIdentityEpoch: CURRENT_EPOCH,
      schemaVersion: 1,
      generationIds: {
        'review-events': 'review-events-v1',
        'card-memory-facts': 'card-memory-facts-v1',
        'queue-facts': 'queue-facts-v1',
      },
    })),
    readForeignEpochRecoveryJournalEvidence: vi.fn(async () => ({
      nextJournalSequence: 405,
      entries: [structuredClone(entry)],
    })),
  };
  if (input.failManifestOnce) {
    const writeJSON = truthFileStore.writeJSON.bind(truthFileStore);
    let shouldFail = true;
    truthFileStore.writeJSON = async (path: string, value: unknown) => {
      if (shouldFail && path.endsWith('/manifest.v1.json')) {
        shouldFail = false;
        throw new Error('injected-manifest-interruption');
      }
      await writeJSON(path, value);
    };
  }
  const readCurrentAuthority = vi.fn(async () => structuredClone(authority));
  return {
    authority,
    plan,
    truthFileStore,
    readCurrentAuthority,
    applier: new WorkerSqliteForeignEpochContinuityApplier({
      database: database as never,
      truthFileStore,
      identityEvidence: { readCurrentAuthority },
    }),
  };
}

describe('WorkerSqliteForeignEpochContinuityApplier', () => {
  it('publishes the unchanged original-epoch mutation then transitions Frontier to sequence 405', async () => {
    const harness = await createHarness();

    await harness.applier.runExclusive(harness.plan, async () => {
      await expect(harness.applier.publishOriginalEpoch(harness.plan)).resolves.toMatchObject({
        artifactHashes: [expect.stringMatching(/^sha256:/), expect.stringMatching(/^sha256:/)],
      });
      await expect(harness.applier.transitionFrontier(harness.plan)).resolves.toMatchObject({
        artifactHashes: expect.any(Array),
      });
    });

    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/epoch-${ORIGINAL_EPOCH}/state.v1.json`,
    )).resolves.toMatchObject({
      coverage: {
        identityEpoch: ORIGINAL_EPOCH,
        coveredJournalSequence: 404,
        coveredMutationId: MUTATION_ID,
      },
    });
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/frontier.v1.json`,
    )).resolves.toMatchObject({
      status: 'ready',
      activeIdentityEpoch: CURRENT_EPOCH,
      journalSequenceFrontier: 404,
      coverage: { identityEpoch: CURRENT_EPOCH, coveredJournalSequence: 404 },
      transition: { fromIdentityEpoch: ORIGINAL_EPOCH, toIdentityEpoch: CURRENT_EPOCH },
    });
  });

  it('re-verifies idempotent output without duplicating the Review fact', async () => {
    const harness = await createHarness();
    await harness.applier.runExclusive(harness.plan, async () => {
      await harness.applier.publishOriginalEpoch(harness.plan);
      await harness.applier.transitionFrontier(harness.plan);
    });
    const before = await harness.truthFileStore.listFiles?.('truth/review-events/');

    await harness.applier.runExclusive(harness.plan, async () => {
      await harness.applier.publishOriginalEpoch(harness.plan);
      await harness.applier.transitionFrontier(harness.plan);
    });

    const after = await harness.truthFileStore.listFiles?.('truth/review-events/');
    expect(after).toEqual(before);
  });

  it('rejects mutation outside the recovery operation fence', async () => {
    const harness = await createHarness();
    await expect(harness.applier.publishOriginalEpoch(harness.plan)).rejects.toThrow('FENCE_REQUIRED');
  });

  it('resumes after manifest interruption without duplicating the Review fact', async () => {
    const harness = await createHarness({ failManifestOnce: true });

    await expect(harness.applier.runExclusive(
      harness.plan,
      () => harness.applier.publishOriginalEpoch(harness.plan),
    )).rejects.toThrow('RECOVERY_TRUTH_PUBLICATION_FAILED');
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/epoch-${ORIGINAL_EPOCH}/state.v1.json`,
    )).resolves.toMatchObject({ coverage: null });
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/epoch-${PREDECESSOR_EPOCH}/state.v1.json`,
    )).resolves.toMatchObject({ coverage: { coveredJournalSequence: 403 } });

    await harness.applier.runExclusive(harness.plan, async () => {
      await harness.applier.publishOriginalEpoch(harness.plan);
      await harness.applier.transitionFrontier(harness.plan);
    });
    const replay = await createMessagePackTruthSegmentStore({
      fileStore: harness.truthFileStore,
      family: 'review-events',
      deviceId: DEVICE_ID,
      generationId: 'review-events-v1',
      schemaVersion: 1,
    }).replayRecords({ dedupeByIdempotencyKey: false });
    expect(replay.records).toHaveLength(1);
    expect(replay.records[0]).toMatchObject({
      mutationId: MUTATION_ID,
      identityEpoch: ORIGINAL_EPOCH,
      journalSequence: 404,
    });
  });

  it('preserves original publication but rejects authority drift before Frontier transition', async () => {
    const harness = await createHarness();

    await expect(harness.applier.runExclusive(harness.plan, async () => {
      await harness.applier.publishOriginalEpoch(harness.plan);
      harness.readCurrentAuthority.mockResolvedValueOnce({
        ...structuredClone(harness.authority),
        revision: 2,
      });
      await harness.applier.transitionFrontier(harness.plan);
    })).rejects.toThrow('RECOVERY_AUTHORITY_CHANGED');
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/epoch-${ORIGINAL_EPOCH}/state.v1.json`,
    )).resolves.toMatchObject({ coverage: { coveredJournalSequence: 404 } });
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/frontier.v1.json`,
    )).resolves.toMatchObject({ status: 'recovery-required' });
  });

  it.each([
    ['payload rewrite', (plan: BackendForeignEpochRecoveryContinuityPlan) => {
      plan.continuityIntent.originalMutation.payloadHash = `sha256:${'f'.repeat(64)}`;
    }],
    ['epoch rebind', (plan: BackendForeignEpochRecoveryContinuityPlan) => {
      plan.continuityIntent.originalMutation.identityEpoch = CURRENT_EPOCH;
    }],
    ['sequence renumber', (plan: BackendForeignEpochRecoveryContinuityPlan) => {
      plan.continuityIntent.originalMutation.journalSequence = 405;
    }],
  ])('rejects %s before publishing recovery truth', async (_label, tamper) => {
    const harness = await createHarness();
    const tampered = structuredClone(harness.plan);
    tamper(tampered);

    await expect(harness.applier.runExclusive(
      tampered,
      () => harness.applier.publishOriginalEpoch(tampered),
    )).rejects.toThrow(/RECOVERY_(?:MUTATION_IDENTITY_CHANGED|CONFIGURATION_CONFLICT)/);
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/epoch-${ORIGINAL_EPOCH}/state.v1.json`,
    )).resolves.toMatchObject({ coverage: null });
    await expect(harness.truthFileStore.readJSON(
      `truth/promotion/device-${DEVICE_ID}/epoch-${PREDECESSOR_EPOCH}/state.v1.json`,
    )).resolves.toMatchObject({ coverage: { coveredJournalSequence: 403 } });
  });
});
