import type {
  StorageMutationFamily,
  TruthDeviceIdentityAuthorityEnvelopeContract,
} from './storage-durability-contracts';
import type {
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION = 1 as const;
export const FOREIGN_EPOCH_RECOVERY_PLAN_VERSION = 1 as const;
export const FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION = 1 as const;

export type BackendRecoveryContentHash = `sha256:${string}`;

export type BackendForeignEpochRecoveryStage =
  | 'authority-publication'
  | 'continuity';

export type BackendForeignEpochRecoveryPhase =
  | 'validated'
  | 'installation-authority-published'
  | 'original-epoch-published'
  | 'frontier-transitioned'
  | 'restart-verified';

export type BackendForeignEpochRecoveryBlockerCode =
  | 'IDENTITY_AUTHORITY_EVIDENCE_INSUFFICIENT'
  | 'IDENTITY_AUTHORITY_EVIDENCE_CONFLICT'
  | 'IDENTITY_AUTHORITY_CHANGED'
  | 'PREDECESSOR_COVERAGE_UNVERIFIED'
  | 'DEVICE_OWNERSHIP_CONFLICT'
  | 'JOURNAL_SEQUENCE_GAP'
  | 'JOURNAL_SEQUENCE_CONFLICT'
  | 'MUTATION_IDENTITY_CHANGED'
  | 'TRUTH_OUTPUT_CONFLICT'
  | 'BACKUP_RECEIPT_REQUIRED'
  | 'PLAN_STALE'
  | 'RESTART_REQUIRED';

export type BackendForeignEpochRecoveryEvidenceKind =
  | 'installation-authority-current'
  | 'installation-authority-previous'
  | 'temp-local-identity'
  | 'browser-cache-observation'
  | 'verified-mutation-frontier'
  | 'journal-envelope'
  | 'journal-allocation'
  | 'truth-coverage'
  | 'truth-manifest'
  | 'durability-receipt'
  | 'recovery-receipt';

export interface BackendForeignEpochRecoveryIdentityReference {
  deviceIdHash: BackendRecoveryContentHash;
  identityEpoch: string;
}

export interface BackendForeignEpochRecoveryEvidenceReference {
  kind: BackendForeignEpochRecoveryEvidenceKind;
  contentHash: BackendRecoveryContentHash;
  identity: BackendForeignEpochRecoveryIdentityReference | null;
  journalSequence: number | null;
}

export interface BackendForeignEpochRecoveryBlocker {
  code: BackendForeignEpochRecoveryBlockerCode;
  message: string;
  evidence: BackendForeignEpochRecoveryEvidenceReference[];
}

export interface BackendForeignEpochRecoveryAuthorityEvidence {
  state: 'missing' | 'verified' | 'invalid';
  currentAuthorityHash: BackendRecoveryContentHash | null;
  previousAuthorityHash: BackendRecoveryContentHash | null;
  tempLocalCompleteness: 'missing' | 'device-id-only' | 'complete' | 'invalid';
  tempLocalDeviceIdHash: BackendRecoveryContentHash | null;
}

export interface BackendForeignEpochRecoveryImmutableMutationIdentity {
  mutationId: string;
  family: StorageMutationFamily;
  deviceId: string;
  identityEpoch: string;
  journalSequence: number;
  createdAt: number;
  envelopeHash: BackendRecoveryContentHash;
  payloadHash: BackendRecoveryContentHash;
  requiredTruthOutputsHash: BackendRecoveryContentHash;
  durabilityReceiptIdentityHash: BackendRecoveryContentHash;
  idempotencyKeyHashes: BackendRecoveryContentHash[];
}

export interface BackendForeignEpochRecoveryAuthorityCandidateProof {
  identity: BackendForeignEpochRecoveryIdentityReference;
  provingEvidence: BackendForeignEpochRecoveryEvidenceReference[];
  corroboratingEvidence: BackendForeignEpochRecoveryEvidenceReference[];
  contradictingEvidence: BackendForeignEpochRecoveryEvidenceReference[];
}

export interface BackendForeignEpochRecoveryAuthorityPublicationIntent {
  version: typeof FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION;
  intentHash: BackendRecoveryContentHash;
  expectedAuthorityStateHash: BackendRecoveryContentHash;
  authority: TruthDeviceIdentityAuthorityEnvelopeContract;
  proof: BackendForeignEpochRecoveryAuthorityCandidateProof;
}

export interface BackendForeignEpochRecoveryContinuityIntent {
  originalMutation: BackendForeignEpochRecoveryImmutableMutationIdentity;
  predecessorIdentityEpoch: string;
  predecessorCoverageSequence: number;
  predecessorCoverageHash: BackendRecoveryContentHash;
  expectedAuthorityRevision: number;
  expectedAuthorityHash: BackendRecoveryContentHash;
  expectedCurrentIdentityEpoch: string;
  expectedNextJournalSequence: number;
  expectedNextJournalSequenceAfterRecovery: number;
  requiredTruthManifestHashes: BackendRecoveryContentHash[];
}

export interface BackendForeignEpochRecoveryAuditSummary {
  originalIdentityEpoch: string;
  currentIdentityEpoch: string;
  recoveredJournalSequence: number;
  expectedNextJournalSequence: number;
  authorityRevision: number;
}

interface BackendForeignEpochRecoveryPlanBase {
  version: typeof FOREIGN_EPOCH_RECOVERY_PLAN_VERSION;
  operationId: string;
  stage: BackendForeignEpochRecoveryStage;
  planHash: BackendRecoveryContentHash;
  evidenceHash: BackendRecoveryContentHash;
  backupScopeHash: BackendRecoveryContentHash;
  createdAt: number;
  blockers: BackendForeignEpochRecoveryBlocker[];
}

export interface BackendForeignEpochRecoveryAuthorityPlan extends BackendForeignEpochRecoveryPlanBase {
  stage: 'authority-publication';
  authorityPublicationIntent: BackendForeignEpochRecoveryAuthorityPublicationIntent;
  continuityIntent: null;
}

export interface BackendForeignEpochRecoveryContinuityPlan extends BackendForeignEpochRecoveryPlanBase {
  stage: 'continuity';
  authorityPublicationIntent: null;
  continuityIntent: BackendForeignEpochRecoveryContinuityIntent;
}

export type BackendForeignEpochRecoveryPlan =
  | BackendForeignEpochRecoveryAuthorityPlan
  | BackendForeignEpochRecoveryContinuityPlan;

export interface BackendForeignEpochRecoveryPreviewRequest {
  expectedStage?: BackendForeignEpochRecoveryStage | null;
}

export interface BackendForeignEpochRecoveryPreviewResult {
  version: typeof FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION;
  available: boolean;
  authority: BackendForeignEpochRecoveryAuthorityEvidence;
  evidenceHash: BackendRecoveryContentHash;
  plan: BackendForeignEpochRecoveryPlan | null;
  blockers: BackendForeignEpochRecoveryBlocker[];
}

export interface BackendForeignEpochRecoveryBackupReceipt {
  version: typeof FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION;
  receiptId: string;
  planHash: BackendRecoveryContentHash;
  backupArtifactHash: BackendRecoveryContentHash;
  capturedAt: number;
  verifiedAt: number;
}

export interface BackendForeignEpochRecoveryApplyRequest {
  operationId: string;
  planHash: BackendRecoveryContentHash;
  backupReceipt: BackendForeignEpochRecoveryBackupReceipt;
}

export interface BackendForeignEpochRecoveryApplyResult {
  version: typeof FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION;
  operationId: string;
  stage: BackendForeignEpochRecoveryStage;
  status:
    | 'rejected'
    | 'authority-published-restart-required'
    | 'continuity-applied-restart-required'
    | 'already-applied';
  completedPhase: BackendForeignEpochRecoveryPhase | null;
  restartRequired: boolean;
  blockers: BackendForeignEpochRecoveryBlocker[];
}

export interface BackendForeignEpochRecoveryPhaseReceipt {
  version: typeof FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION;
  operationId: string;
  planHash: BackendRecoveryContentHash;
  phase: BackendForeignEpochRecoveryPhase;
  evidenceHash: BackendRecoveryContentHash;
  artifactHashes: BackendRecoveryContentHash[];
  audit?: BackendForeignEpochRecoveryAuditSummary | null;
  completedAt: number;
}

export interface BackendForeignEpochRecoveryStatusRequest {
  operationId?: string | null;
}

export interface BackendForeignEpochRecoveryStatusResult {
  version: typeof FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION;
  operationId: string | null;
  stage: BackendForeignEpochRecoveryStage | null;
  state: 'idle' | 'blocked' | 'restart-required' | 'in-progress' | 'completed';
  latestPhase: BackendForeignEpochRecoveryPhase | null;
  planHash: BackendRecoveryContentHash | null;
  receipts: BackendForeignEpochRecoveryPhaseReceipt[];
  audit?: BackendForeignEpochRecoveryAuditSummary | null;
  blockers: BackendForeignEpochRecoveryBlocker[];
}

export const BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHODS = [
  'recovery.foreignEpoch.preview',
  'recovery.foreignEpoch.apply',
  'recovery.foreignEpoch.status',
] as const satisfies readonly BackendRpcMethod[];

export type BackendForeignEpochRecoveryRpcMethod =
  typeof BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHODS[number];

export type BackendForeignEpochRecoveryRpcMethodContractMap = {
  readonly 'recovery.foreignEpoch.preview': BackendRpcMethodContract<
    'recovery.foreignEpoch.preview',
    BackendForeignEpochRecoveryPreviewRequest | void,
    BackendForeignEpochRecoveryPreviewResult
  >;
  readonly 'recovery.foreignEpoch.apply': BackendRpcMethodContract<
    'recovery.foreignEpoch.apply',
    BackendForeignEpochRecoveryApplyRequest,
    BackendForeignEpochRecoveryApplyResult
  >;
  readonly 'recovery.foreignEpoch.status': BackendRpcMethodContract<
    'recovery.foreignEpoch.status',
    BackendForeignEpochRecoveryStatusRequest | void,
    BackendForeignEpochRecoveryStatusResult
  >;
};

export const BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'recovery.foreignEpoch.preview', family: 'recovery', clientExposure: 'facade' },
  { method: 'recovery.foreignEpoch.apply', family: 'recovery', clientExposure: 'facade' },
  { method: 'recovery.foreignEpoch.status', family: 'recovery', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_FOREIGN_EPOCH_RECOVERY_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendForeignEpochRecoveryRpcMethodContractMap>;
