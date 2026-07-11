export const STORAGE_MUTATION_ENVELOPE_VERSION = 1 as const;
export const STORAGE_DURABILITY_RECEIPT_VERSION = 1 as const;
export const TRUTH_GENERATION_RECORD_VERSION = 1 as const;
export const TRUTH_COVERAGE_WATERMARK_VERSION = 1 as const;
export const STORAGE_INVENTORY_RECORD_VERSION = 1 as const;
export const STORAGE_PRESSURE_RECORD_VERSION = 1 as const;
export const STORAGE_RECOVERY_STATE_VERSION = 1 as const;
export const TRUTH_DEVICE_IDENTITY_RECORD_VERSION = 2 as const;

export type StorageMutationFamily =
  | 'review'
  | 'card-schedule'
  | 'queue'
  | 'card-crud'
  | 'import'
  | 'repair';

export interface StorageAggregateReference {
  family: string;
  aggregateId: string;
  causalBaseRevision: string | null;
}

export interface StorageMutationOperation {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  primaryKey: Record<string, string | number | null>;
  row: Record<string, unknown> | null;
}

export interface StorageRequiredTruthOutput {
  family: string;
  kind: 'event' | 'changeset' | 'snapshot' | 'tombstone' | 'metadata';
  aggregateIds: string[];
}

export interface StorageMutationEnvelope {
  version: typeof STORAGE_MUTATION_ENVELOPE_VERSION;
  mutationId: string;
  family: StorageMutationFamily;
  deviceId: string;
  identityEpoch: string;
  journalSequence: number | null;
  createdAt: number;
  affectedAggregates: StorageAggregateReference[];
  operations: StorageMutationOperation[];
  requiredTruthOutputs: StorageRequiredTruthOutput[];
}

export type StorageDurabilityStage = 'failed' | 'journaled' | 'truth-committed';

export interface StorageDurabilityRetryState {
  attemptCount: number;
  nextAttemptAt: number | null;
  lastError: string | null;
}

export interface StorageDurabilityReceipt {
  version: typeof STORAGE_DURABILITY_RECEIPT_VERSION;
  mutationId: string;
  family: StorageMutationFamily;
  stage: StorageDurabilityStage;
  journalSequence: number | null;
  affectedAggregates: StorageAggregateReference[];
  requiredTruthOutputs: StorageRequiredTruthOutput[];
  truthGenerationId: string | null;
  retry: StorageDurabilityRetryState;
  diagnosticCode: string | null;
  diagnosticMessage: string | null;
  updatedAt: number;
}

export interface TruthGenerationFamilyPublication {
  family: string;
  manifestPath: string;
  segmentPaths: string[];
  checksum: string;
}

export interface TruthGenerationRecord {
  version: typeof TRUTH_GENERATION_RECORD_VERSION;
  generationId: string;
  previousGenerationId: string | null;
  deviceId: string;
  identityEpoch: string;
  status: 'candidate' | 'verified' | 'published' | 'orphaned';
  families: TruthGenerationFamilyPublication[];
  createdAt: number;
  verifiedAt: number | null;
  publishedAt: number | null;
}

export interface TruthCoverageWatermark {
  version: typeof TRUTH_COVERAGE_WATERMARK_VERSION;
  deviceId: string;
  identityEpoch: string;
  coveredJournalSequence: number;
  coveredMutationId: string;
  truthGenerationId: string;
  updatedAt: number;
}

export type StoragePressureLevel = 'normal' | 'soft' | 'high' | 'hard';

export type StorageInventoryCompactionStatus =
  | 'not-applicable'
  | 'idle'
  | 'eligible'
  | 'blocked-uncovered'
  | 'running'
  | 'unavailable';

export interface StorageInventoryMetric {
  family: string;
  deviceId: string | null;
  identityEpoch: string | null;
  files: number;
  bytes: number;
  oldestAgeMs: number | null;
  generationCount: number;
  currentGenerationId: string | null;
  previousGenerationId: string | null;
  uncoveredMutationCount: number;
  compactionStatus: StorageInventoryCompactionStatus;
}

export interface StoragePressureMetric {
  family: string;
  deviceId: string | null;
  identityEpoch: string | null;
  level: StoragePressureLevel;
  files: number;
  bytes: number;
  oldestAgeMs: number | null;
  targetFiles: number | null;
  softFiles: number | null;
  highFiles: number | null;
  hardFiles: number | null;
  targetBytes: number | null;
  softBytes: number | null;
  highBytes: number | null;
  hardBytes: number | null;
  targetOldestAgeMs: number | null;
  softOldestAgeMs: number | null;
  highOldestAgeMs: number | null;
  hardOldestAgeMs: number | null;
  targetGenerations: number | null;
  softGenerations: number | null;
  highGenerations: number | null;
  hardGenerations: number | null;
  reason: string | null;
}

export interface StoragePressureRecord {
  version: typeof STORAGE_PRESSURE_RECORD_VERSION;
  level: StoragePressureLevel;
  measuredAt: number;
  metrics: StoragePressureMetric[];
  blockingMutationGrowth: boolean;
  code: 'STORAGE_PRESSURE' | null;
  reason: string | null;
}

export interface StorageInventoryRecord {
  version: typeof STORAGE_INVENTORY_RECORD_VERSION;
  measuredAt: number;
  metrics: StorageInventoryMetric[];
  pressure: StoragePressureRecord;
}

export type StorageRecoveryStatus =
  | 'ready'
  | 'rebuilding-projection'
  | 'read-only-recovery-required';

export interface StorageRecoveryState {
  version: typeof STORAGE_RECOVERY_STATE_VERSION;
  status: StorageRecoveryStatus;
  code: 'STORAGE_RECOVERY_REQUIRED' | null;
  lastVerifiedGenerationId: string | null;
  replayFromJournalSequence: number | null;
  quarantinedPaths: string[];
  disabledCapabilities: string[];
  diagnosticReason: string | null;
  updatedAt: number;
}

export interface TruthDeviceIdentityRecordContract {
  version: typeof TRUTH_DEVICE_IDENTITY_RECORD_VERSION;
  deviceId: string;
  identityEpoch: string;
  hostFingerprint: string | null;
  createdAt: number;
  lastSeenAt: number;
}
