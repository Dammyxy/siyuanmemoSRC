import {
  TRUTH_COVERAGE_WATERMARK_VERSION,
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryContinuityPlan,
  type BackendRecoveryContentHash,
  type TruthCoverageWatermark,
  type TruthDeviceIdentityAuthorityEnvelopeContract,
} from '../../packages/contracts/src/backend-rpc';
import type {
  WorkerForeignEpochRecoveryTruthConfiguration,
  WorkerSqliteDatabaseService,
} from '../db/SqliteDatabaseService';
import { MessagePackTruthPromotionStateStore } from '../truth/MessagePackTruthPromotionStateStore';
import type { MessagePackTruthSegmentFileStore } from '../truth/MessagePackTruthSegmentStore';
import { MessagePackVerifiedMutationFrontierStore } from '../truth/MessagePackVerifiedMutationFrontierStore';
import {
  WORKER_TRUTH_PROMOTION_STATE_VERSION,
  WorkerTruthPromotionModule,
  type WorkerTruthPromotionJournalEntry,
} from '../truth/WorkerTruthPromotionModule';
import { WorkerTruthPublicationModule } from '../truth/WorkerTruthPublicationModule';
import { WorkerVerifiedMutationFrontier } from '../truth/WorkerVerifiedMutationFrontier';
import {
  assertImmutableMutationIdentity,
  snapshotImmutableMutationIdentity,
} from './ForeignEpochJournalContinuityInvariant';
import type { WorkerForeignEpochContinuityApplier } from './WorkerForeignEpochRecoveryRuntime';

interface WorkerForeignEpochContinuityIdentityEvidencePort {
  readCurrentAuthority(): Promise<unknown | null>;
}

type RecoveryDatabasePort = Pick<
  WorkerSqliteDatabaseService,
  'getForeignEpochRecoveryTruthConfiguration' | 'readForeignEpochRecoveryJournalEvidence'
>;

export interface WorkerSqliteForeignEpochContinuityApplierOptions {
  database: RecoveryDatabasePort;
  truthFileStore: MessagePackTruthSegmentFileStore;
  identityEvidence: WorkerForeignEpochContinuityIdentityEvidencePort;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthorityEnvelope(value: unknown): value is TruthDeviceIdentityAuthorityEnvelopeContract {
  return isRecord(value)
    && value.version === TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION
    && Number.isSafeInteger(value.revision)
    && Number(value.revision) > 0
    && isRecord(value.identity)
    && typeof value.identity.deviceId === 'string'
    && typeof value.identity.identityEpoch === 'string';
}

function assertExactPublication(
  mutationId: string,
  verifiedMutationIds: string[],
): void {
  if (verifiedMutationIds.length !== 1 || verifiedMutationIds[0] !== mutationId) {
    throw new Error('RECOVERY_TRUTH_PUBLICATION_INCOMPLETE: exact mutation output verification failed');
  }
}

export class WorkerSqliteForeignEpochContinuityApplier implements WorkerForeignEpochContinuityApplier {
  private activeOperationId: string | null = null;

  constructor(private readonly options: WorkerSqliteForeignEpochContinuityApplierOptions) {}

  async runExclusive<T>(
    plan: BackendForeignEpochRecoveryContinuityPlan,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.activeOperationId) {
      throw new Error(
        `RECOVERY_OPERATION_CONFLICT: ${this.activeOperationId} already owns the continuity recovery fence`,
      );
    }
    this.activeOperationId = plan.operationId;
    try {
      return await operation();
    } finally {
      this.activeOperationId = null;
    }
  }

  async publishOriginalEpoch(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): Promise<{ artifactHashes: BackendRecoveryContentHash[] }> {
    this.assertFenceOwner(plan);
    const config = this.requireConfiguration(plan);
    const entry = await this.readExactMutation(plan);
    const { stateStore, promotion, publisher } = this.createOriginalEpochPromotion(plan, config, entry);
    await this.readVerifiedPredecessorCoverage(plan);
    const prior = await stateStore.read();
    const priorCoverage = prior?.coverage ?? null;
    const targetSequence = plan.continuityIntent.originalMutation.journalSequence;

    if (priorCoverage?.coveredJournalSequence === targetSequence) {
      this.assertRecoveredCoverage(plan, priorCoverage);
      const verified = await promotion.runExclusivePublication(() => publisher.publishBatch([entry]));
      assertExactPublication(entry.mutationEnvelope.mutationId, verified.verifiedMutationIds);
    } else {
      if (priorCoverage) {
        throw new Error('RECOVERY_ORIGINAL_EPOCH_COVERAGE_CONFLICT: original epoch already has incompatible coverage');
      }
      let publication: Awaited<ReturnType<typeof publisher.publishBatch>>;
      try {
        publication = await promotion.runExclusivePublication(() => publisher.publishBatch([entry]));
      } catch (error) {
        throw new Error(
          `RECOVERY_TRUTH_PUBLICATION_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      assertExactPublication(entry.mutationEnvelope.mutationId, publication.verifiedMutationIds);
      const completedAt = Date.now();
      await stateStore.write({
        version: WORKER_TRUTH_PROMOTION_STATE_VERSION,
        deviceId: entry.mutationEnvelope.deviceId,
        identityEpoch: entry.mutationEnvelope.identityEpoch,
        coverage: {
          version: TRUTH_COVERAGE_WATERMARK_VERSION,
          deviceId: entry.mutationEnvelope.deviceId,
          identityEpoch: entry.mutationEnvelope.identityEpoch,
          coveredJournalSequence: targetSequence,
          coveredMutationId: entry.mutationEnvelope.mutationId,
          truthGenerationId: publication.generationId,
          updatedAt: completedAt,
        },
        retry: null,
        lastSuccessfulPromotionAt: completedAt,
        updatedAt: completedAt,
      });
    }

    const verifiedState = await stateStore.read();
    if (!verifiedState?.coverage) {
      throw new Error('RECOVERY_TRUTH_PUBLICATION_INCOMPLETE: original epoch coverage read-back is absent');
    }
    this.assertRecoveredCoverage(plan, verifiedState.coverage);
    return {
      artifactHashes: [
        await hashRecoveryContent(verifiedState.coverage),
        await hashRecoveryContent({
          mutationId: entry.mutationEnvelope.mutationId,
          requiredTruthOutputs: entry.mutationEnvelope.requiredTruthOutputs,
        }),
      ],
    };
  }

  async transitionFrontier(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): Promise<{ artifactHashes: BackendRecoveryContentHash[] }> {
    this.assertFenceOwner(plan);
    const config = this.requireConfiguration(plan);
    const authority = await this.readVerifiedAuthority(plan, config);
    const entry = await this.readExactMutation(plan);
    const { stateStore, promotion, publisher } = this.createOriginalEpochPromotion(plan, config, entry);
    const originalState = await stateStore.read();
    if (!originalState?.coverage) {
      throw new Error('RECOVERY_TRUTH_PUBLICATION_INCOMPLETE: original epoch coverage is absent');
    }
    this.assertRecoveredCoverage(plan, originalState.coverage);
    const outputVerification = await promotion.runExclusivePublication(() => publisher.publishBatch([entry]));
    assertExactPublication(entry.mutationEnvelope.mutationId, outputVerification.verifiedMutationIds);

    const frontierStore = new MessagePackVerifiedMutationFrontierStore({
      fileStore: this.options.truthFileStore,
      deviceId: config.deviceId,
    });
    const frontier = new WorkerVerifiedMutationFrontier({
      deviceId: config.deviceId,
      identityEpoch: config.currentIdentityEpoch,
      store: frontierStore,
      readJournalEvidence: () => this.options.database.readForeignEpochRecoveryJournalEvidence(),
      listLegacyPromotionStates: () => frontierStore.listLegacyPromotionStates(),
    });
    const initialized = await frontier.initialize();
    if (initialized.ready) {
      const existing = await frontierStore.read();
      if (
        existing?.coverage?.coveredJournalSequence !== plan.continuityIntent.originalMutation.journalSequence
        || existing.transition?.fromIdentityEpoch !== plan.continuityIntent.originalMutation.identityEpoch
      ) {
        throw new Error('RECOVERY_FRONTIER_CONFLICT: an incompatible ready Frontier already exists');
      }
    } else {
      await frontier.recoverFromVerifiedForeignEpochCoverage({
        verifiedOriginalCoverage: originalState.coverage,
        expectedRecoveredMutationId: plan.continuityIntent.originalMutation.mutationId,
        expectedRecoveredJournalSequence: plan.continuityIntent.originalMutation.journalSequence,
        expectedNextJournalSequence: plan.continuityIntent.expectedNextJournalSequenceAfterRecovery,
      });
    }
    const verifiedFrontier = await frontierStore.read();
    if (
      !verifiedFrontier
      || verifiedFrontier.status !== 'ready'
      || verifiedFrontier.activeIdentityEpoch !== config.currentIdentityEpoch
      || verifiedFrontier.coverage?.coveredJournalSequence !== plan.continuityIntent.originalMutation.journalSequence
      || verifiedFrontier.transition?.fromIdentityEpoch !== plan.continuityIntent.originalMutation.identityEpoch
      || verifiedFrontier.journalSequenceFrontier !== plan.continuityIntent.expectedNextJournalSequenceAfterRecovery - 1
    ) {
      throw new Error('RECOVERY_FRONTIER_VERIFICATION_FAILED: exact Frontier read-back mismatch');
    }
    return {
      artifactHashes: [
        await hashRecoveryContent(verifiedFrontier),
        await hashRecoveryContent(authority),
        await hashRecoveryContent(originalState.coverage),
      ],
    };
  }

  private assertFenceOwner(plan: BackendForeignEpochRecoveryContinuityPlan): void {
    if (this.activeOperationId !== plan.operationId) {
      throw new Error('RECOVERY_OPERATION_FENCE_REQUIRED: continuity mutation is not inside its recovery fence');
    }
  }

  private requireConfiguration(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): WorkerForeignEpochRecoveryTruthConfiguration {
    const config = this.options.database.getForeignEpochRecoveryTruthConfiguration();
    const mutation = plan.continuityIntent.originalMutation;
    if (
      config.deviceId !== mutation.deviceId
      || config.currentIdentityEpoch !== plan.continuityIntent.expectedCurrentIdentityEpoch
      || config.currentIdentityEpoch === mutation.identityEpoch
      || plan.continuityIntent.expectedNextJournalSequence !== mutation.journalSequence + 1
      || plan.continuityIntent.expectedNextJournalSequenceAfterRecovery !== mutation.journalSequence + 1
    ) {
      throw new Error('RECOVERY_CONFIGURATION_CONFLICT: recovery truth configuration does not match the plan');
    }
    return config;
  }

  private async readExactMutation(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): Promise<WorkerTruthPromotionJournalEntry> {
    const evidence = await this.options.database.readForeignEpochRecoveryJournalEvidence();
    if (
      evidence.nextJournalSequence !== plan.continuityIntent.expectedNextJournalSequence
      || evidence.nextJournalSequence !== plan.continuityIntent.expectedNextJournalSequenceAfterRecovery
    ) {
      throw new Error('RECOVERY_JOURNAL_ALLOCATION_CHANGED: expected next sequence no longer matches');
    }
    const targetSequence = plan.continuityIntent.originalMutation.journalSequence;
    const candidates = evidence.entries.filter(
      (entry) => entry.mutationEnvelope.journalSequence === targetSequence,
    );
    if (candidates.length !== 1) {
      throw new Error('RECOVERY_JOURNAL_EVIDENCE_CONFLICT: exact recovered sequence is not unique');
    }
    const entry = structuredClone(candidates[0]);
    assertImmutableMutationIdentity(
      plan.continuityIntent.originalMutation,
      await snapshotImmutableMutationIdentity(entry),
    );
    return entry;
  }

  private createOriginalEpochPromotion(
    plan: BackendForeignEpochRecoveryContinuityPlan,
    config: WorkerForeignEpochRecoveryTruthConfiguration,
    entry: WorkerTruthPromotionJournalEntry,
  ) {
    const mutation = plan.continuityIntent.originalMutation;
    const stateStore = new MessagePackTruthPromotionStateStore({
      fileStore: this.options.truthFileStore,
      deviceId: mutation.deviceId,
      identityEpoch: mutation.identityEpoch,
    });
    const publisher = new WorkerTruthPublicationModule({
      fileStore: this.options.truthFileStore,
      deviceId: mutation.deviceId,
      identityEpoch: mutation.identityEpoch,
      generationIds: config.generationIds,
      schemaVersion: config.schemaVersion,
      maxSegmentBytes: config.maxSegmentBytes,
    });
    const promotion = new WorkerTruthPromotionModule({
      deviceId: mutation.deviceId,
      identityEpoch: mutation.identityEpoch,
      stateStore,
      publisher,
      maxBatchSize: 1,
      journalSource: {
        listJournaledMutations: async ({ afterJournalSequence, limit }) => (
          entry.mutationEnvelope.journalSequence! > afterJournalSequence && limit > 0
            ? [structuredClone(entry)]
            : []
        ),
      },
    });
    return { stateStore, publisher, promotion };
  }

  private async readVerifiedPredecessorCoverage(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): Promise<TruthCoverageWatermark> {
    const mutation = plan.continuityIntent.originalMutation;
    const predecessorStateStore = new MessagePackTruthPromotionStateStore({
      fileStore: this.options.truthFileStore,
      deviceId: mutation.deviceId,
      identityEpoch: plan.continuityIntent.predecessorIdentityEpoch,
    });
    const predecessor = await predecessorStateStore.read();
    const coverage = predecessor?.coverage ?? null;
    if (
      !coverage
      || coverage.deviceId !== mutation.deviceId
      || coverage.identityEpoch !== plan.continuityIntent.predecessorIdentityEpoch
      || coverage.coveredJournalSequence !== plan.continuityIntent.predecessorCoverageSequence
      || coverage.coveredJournalSequence + 1 !== mutation.journalSequence
      || await hashRecoveryContent(coverage) !== plan.continuityIntent.predecessorCoverageHash
    ) {
      throw new Error('RECOVERY_PREDECESSOR_COVERAGE_CHANGED: verified predecessor coverage no longer matches the plan');
    }
    return coverage;
  }

  private assertRecoveredCoverage(
    plan: BackendForeignEpochRecoveryContinuityPlan,
    coverage: TruthCoverageWatermark,
  ): void {
    const mutation = plan.continuityIntent.originalMutation;
    if (
      coverage.deviceId !== mutation.deviceId
      || coverage.identityEpoch !== mutation.identityEpoch
      || coverage.coveredJournalSequence !== mutation.journalSequence
      || coverage.coveredMutationId !== mutation.mutationId
      || !String(coverage.truthGenerationId || '').trim()
    ) {
      throw new Error('RECOVERY_TRUTH_COVERAGE_MISMATCH: original epoch coverage is not exact');
    }
  }

  private async readVerifiedAuthority(
    plan: BackendForeignEpochRecoveryContinuityPlan,
    config: WorkerForeignEpochRecoveryTruthConfiguration,
  ): Promise<TruthDeviceIdentityAuthorityEnvelopeContract> {
    const authority = await this.options.identityEvidence.readCurrentAuthority();
    if (
      !isAuthorityEnvelope(authority)
      || authority.revision !== plan.continuityIntent.expectedAuthorityRevision
      || authority.identity.deviceId !== config.deviceId
      || authority.identity.identityEpoch !== config.currentIdentityEpoch
      || await hashRecoveryContent(authority) !== plan.continuityIntent.expectedAuthorityHash
    ) {
      throw new Error('RECOVERY_AUTHORITY_CHANGED: verified installation authority changed before Frontier transition');
    }
    return structuredClone(authority);
  }
}
