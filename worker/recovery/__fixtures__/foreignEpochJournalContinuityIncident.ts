import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  STORAGE_MUTATION_ENVELOPE_VERSION,
  STORAGE_RECOVERY_STATE_VERSION,
  TRUTH_COVERAGE_WATERMARK_VERSION,
  TRUTH_GENERATION_RECORD_VERSION,
  type StorageRecoveryState,
  type TruthGenerationRecord,
} from '../../../packages/contracts/src/backend-rpc';
import {
  WORKER_VERIFIED_MUTATION_FRONTIER_VERSION,
  type WorkerVerifiedMutationFrontierRecord,
} from '../../truth/WorkerVerifiedMutationFrontier';
import {
  WORKER_TRUTH_PROMOTION_STATE_VERSION,
  type WorkerTruthPromotionJournalEntry,
  type WorkerTruthPromotionState,
} from '../../truth/WorkerTruthPromotionModule';

const DEVICE_ID = 'device-incident-redacted';
const PREDECESSOR_EPOCH = 'epoch-7b49-redacted';
const ORIGINAL_EPOCH = 'epoch-f771-redacted';
const CURRENT_EPOCH = 'epoch-4afa-redacted';
const SEQUENCE_404_MUTATION_ID = 'mutation-sequence-404-redacted';
const REQUIRED_TRUTH_OUTPUTS = [
  {
    family: 'review-events',
    kind: 'event' as const,
    aggregateIds: ['review-aggregate-redacted'],
  },
  {
    family: 'card-memory-facts',
    kind: 'snapshot' as const,
    aggregateIds: ['card-aggregate-redacted'],
  },
];

const journalEntry404: WorkerTruthPromotionJournalEntry = {
  createdAt: 1_784_212_404_000,
  mutationEnvelope: {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId: SEQUENCE_404_MUTATION_ID,
    family: 'review',
    deviceId: DEVICE_ID,
    identityEpoch: ORIGINAL_EPOCH,
    journalSequence: 404,
    createdAt: 1_784_212_404_000,
    affectedAggregates: [
      {
        family: 'card-schedule',
        aggregateId: 'card-aggregate-redacted',
        causalBaseRevision: 'revision-403-redacted',
      },
    ],
    operations: [
      {
        table: 'review_events',
        operation: 'insert',
        primaryKey: { id: 'review-event-redacted' },
        row: {
          card_id: 'card-aggregate-redacted',
          rating: 3,
          commit_idempotency_key: 'review-sequence-404-redacted',
        },
      },
    ],
    requiredTruthOutputs: REQUIRED_TRUTH_OUTPUTS,
  },
  durabilityReceipt: {
    version: STORAGE_DURABILITY_RECEIPT_VERSION,
    mutationId: SEQUENCE_404_MUTATION_ID,
    family: 'review',
    stage: 'journaled',
    journalSequence: 404,
    affectedAggregates: [
      {
        family: 'card-schedule',
        aggregateId: 'card-aggregate-redacted',
        causalBaseRevision: 'revision-403-redacted',
      },
    ],
    requiredTruthOutputs: REQUIRED_TRUTH_OUTPUTS,
    truthGenerationId: null,
    retry: {
      attemptCount: 0,
      nextAttemptAt: null,
      lastError: null,
    },
    diagnosticCode: null,
    diagnosticMessage: null,
    updatedAt: 1_784_212_404_000,
  },
};

const predecessorPromotionState: WorkerTruthPromotionState = {
  version: WORKER_TRUTH_PROMOTION_STATE_VERSION,
  deviceId: DEVICE_ID,
  identityEpoch: PREDECESSOR_EPOCH,
  coverage: {
    version: TRUTH_COVERAGE_WATERMARK_VERSION,
    deviceId: DEVICE_ID,
    identityEpoch: PREDECESSOR_EPOCH,
    coveredJournalSequence: 403,
    coveredMutationId: 'mutation-sequence-403-redacted',
    truthGenerationId: 'truth-generation-403-redacted',
    updatedAt: 1_784_212_403_000,
  },
  retry: null,
  lastSuccessfulPromotionAt: 1_784_212_403_000,
  updatedAt: 1_784_212_403_000,
};

const blockedCurrentEpochFrontier: WorkerVerifiedMutationFrontierRecord = {
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
  updatedAt: 1_784_212_405_000,
};

const predecessorTruthGeneration: TruthGenerationRecord = {
  version: TRUTH_GENERATION_RECORD_VERSION,
  generationId: 'truth-generation-403-redacted',
  previousGenerationId: 'truth-generation-402-redacted',
  deviceId: DEVICE_ID,
  identityEpoch: PREDECESSOR_EPOCH,
  status: 'published',
  families: [
    {
      family: 'review-events',
      manifestPath: 'truth/review-events/redacted/manifest.v1.json',
      segmentPaths: ['truth/review-events/redacted/seg-000403.msgpack'],
      checksum: `sha256:${'a'.repeat(64)}`,
    },
  ],
  createdAt: 1_784_212_403_000,
  verifiedAt: 1_784_212_403_100,
  publishedAt: 1_784_212_403_200,
};

const recoveryState: StorageRecoveryState = {
  version: STORAGE_RECOVERY_STATE_VERSION,
  status: 'read-only-recovery-required',
  code: 'STORAGE_RECOVERY_REQUIRED',
  lastVerifiedGenerationId: 'truth-generation-403-redacted',
  replayFromJournalSequence: 404,
  quarantinedPaths: [],
  disabledCapabilities: ['review-write', 'truth-promotion'],
  diagnosticReason: 'FRONTIER_FOREIGN_EPOCH_UNCOVERED',
  updatedAt: 1_784_212_405_000,
};

export const FOREIGN_EPOCH_JOURNAL_CONTINUITY_INCIDENT_FIXTURE = Object.freeze({
  identity: {
    deviceId: DEVICE_ID,
    predecessorEpoch: PREDECESSOR_EPOCH,
    originalEpoch: ORIGINAL_EPOCH,
    currentEpoch: CURRENT_EPOCH,
  },
  authority: {
    current: null,
    previous: null,
    tempLocal: {
      version: 1,
      deviceId: DEVICE_ID,
    },
  },
  journal: {
    nextJournalSequence: 405,
    entries: [journalEntry404],
  },
  predecessorPromotionState,
  blockedCurrentEpochFrontier,
  truthGenerations: [predecessorTruthGeneration],
  recoveryState,
});

export type ForeignEpochJournalContinuityIncidentFixture =
  typeof FOREIGN_EPOCH_JOURNAL_CONTINUITY_INCIDENT_FIXTURE;
