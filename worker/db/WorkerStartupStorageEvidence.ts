import {
  STORAGE_RECOVERY_STATE_VERSION,
  type BackendStartupIdentityDisposition,
  type StorageRecoveryState,
} from '../../packages/contracts/src/backend-rpc';

export const WORKER_STARTUP_STORAGE_EVIDENCE_VERSION = 1 as const;

type EvidenceStatus = 'verified' | 'missing' | 'invalid' | 'unavailable';

export interface WorkerStartupStorageEvidenceInput {
  now?: number;
  identity: {
    deviceId: string | null;
    identityEpoch: string | null;
    disposition?: BackendStartupIdentityDisposition | null;
  };
  truth: {
    manifestCount: number;
    segmentCount: number;
    currentGenerationId: string | null;
    previousGenerationId: string | null;
    selectedGenerationId: string | null;
    generationFallbackReason: string | null;
    validationError: string | null;
    quarantinedPaths: string[];
  };
  delta: {
    files: number;
    entries: number;
    checkpoint: {
      clearedAt: number;
      coveredSegmentPaths: string[];
      reason: string;
    } | null;
    truthCoverageFrontier: number | null;
    uncoveredMutationCount: number | null;
    validationError: string | null;
    quarantinedPaths?: string[];
  };
  projection: {
    status: 'present' | 'missing' | 'corrupt' | 'rebuilt';
    byteLength: number;
    reason: string | null;
  };
}

export interface WorkerStartupStorageEvidence {
  version: typeof WORKER_STARTUP_STORAGE_EVIDENCE_VERSION;
  classifiedAt: number;
  identity: {
    status: EvidenceStatus;
    deviceId: string | null;
    identityEpoch: string | null;
    reason: string | null;
  };
  manifests: {
    status: EvidenceStatus;
    count: number;
    reason: string | null;
  };
  generations: {
    status: EvidenceStatus;
    currentGenerationId: string | null;
    previousGenerationId: string | null;
    selectedGenerationId: string | null;
    reason: string | null;
  };
  truthSegments: {
    status: EvidenceStatus;
    count: number;
    reason: string | null;
  };
  deltaCoverage: {
    status: EvidenceStatus;
    files: number;
    entries: number;
    truthCoverageFrontier: number | null;
    uncoveredMutationCount: number | null;
    reason: string | null;
  };
  checkpoint: {
    status: EvidenceStatus;
    clearedAt: number | null;
    coveredSegmentPaths: string[];
    reason: string | null;
  };
  temporarySqlite: {
    status: WorkerStartupStorageEvidenceInput['projection']['status'];
    byteLength: number;
    reason: string | null;
  };
  recoveryState: StorageRecoveryState;
}

export function classifyWorkerStartupStorageEvidence(
  input: WorkerStartupStorageEvidenceInput,
): WorkerStartupStorageEvidence {
  const classifiedAt = Math.max(0, Math.floor(Number(input.now ?? Date.now()) || 0));
  const deviceId = normalizeOptionalString(input.identity.deviceId);
  const identityEpoch = normalizeOptionalString(input.identity.identityEpoch);
  const identityDisposition = input.identity.disposition ?? deriveIdentityDisposition(deviceId, identityEpoch);
  const identityAuthorityUnavailable = identityDisposition?.status === 'read-only-authority-unavailable';
  const identityRecoveryRequired = identityDisposition?.status === 'read-only-recovery-required';
  const identityVerified = Boolean(
    deviceId
    && identityEpoch
    && (!identityDisposition || identityDisposition.status === 'verified'),
  );
  const truthValidationError = normalizeOptionalString(input.truth.validationError);
  const deltaValidationError = normalizeOptionalString(input.delta.validationError);
  const manifestCount = normalizeCount(input.truth.manifestCount);
  const segmentCount = normalizeCount(input.truth.segmentCount);
  const currentGenerationId = normalizeOptionalString(input.truth.currentGenerationId);
  const previousGenerationId = normalizeOptionalString(input.truth.previousGenerationId);
  const selectedGenerationId = normalizeOptionalString(input.truth.selectedGenerationId);
  const generationFallbackReason = normalizeOptionalString(input.truth.generationFallbackReason);
  const files = normalizeCount(input.delta.files);
  const entries = normalizeCount(input.delta.entries);
  const truthCoverageFrontier = normalizeOptionalSequence(input.delta.truthCoverageFrontier);
  const uncoveredMutationCount = normalizeOptionalCount(input.delta.uncoveredMutationCount);
  const projectionReason = normalizeOptionalString(input.projection.reason);
  const canonicalTruthAvailable = manifestCount > 0
    || segmentCount > 0
    || currentGenerationId !== null;
  const projectionNeedsRebuild = canonicalTruthAvailable && (
    input.projection.status === 'missing'
    || input.projection.status === 'corrupt'
  );
  const identityRecoveryReason = normalizeOptionalString(identityDisposition?.reason);
  const recoveryRequired = Boolean(
    truthValidationError
    || deltaValidationError
    || identityRecoveryRequired
    || identityAuthorityUnavailable
  );
  const recoveryDiagnosticReason = uniqueStrings([
    ...(identityRecoveryReason ? [identityRecoveryReason] : []),
    ...(truthValidationError ? [truthValidationError] : []),
    ...(deltaValidationError ? [deltaValidationError] : []),
    ...(projectionNeedsRebuild && projectionReason ? [projectionReason] : []),
    ...(generationFallbackReason ? [generationFallbackReason] : []),
  ]).join('; ') || null;
  const recoveryState: StorageRecoveryState = {
    version: STORAGE_RECOVERY_STATE_VERSION,
    status: recoveryRequired
      ? 'read-only-recovery-required'
      : projectionNeedsRebuild
        ? 'rebuilding-projection'
        : 'ready',
    code: recoveryRequired ? 'STORAGE_RECOVERY_REQUIRED' : null,
    lastVerifiedGenerationId: selectedGenerationId,
    replayFromJournalSequence: uncoveredMutationCount && truthCoverageFrontier !== null
      ? truthCoverageFrontier + 1
      : null,
    quarantinedPaths: uniqueStrings([
      ...input.truth.quarantinedPaths,
      ...(input.delta.quarantinedPaths ?? []),
    ]),
    disabledCapabilities: recoveryRequired
      ? [
          'formal-writes',
          'review',
          'card-edit',
          'queue-edit',
          'maintenance',
          'sync-upload',
          'truth-promotion',
          'truth-compaction',
        ]
      : projectionNeedsRebuild
        ? ['formal-writes', 'review', 'sync-upload']
        : [],
    diagnosticReason: recoveryDiagnosticReason,
    updatedAt: classifiedAt,
  };

  return {
    version: WORKER_STARTUP_STORAGE_EVIDENCE_VERSION,
    classifiedAt,
    identity: {
      status: identityVerified
        ? 'verified'
        : identityAuthorityUnavailable
          ? 'unavailable'
          : identityRecoveryRequired
            ? 'invalid'
            : 'missing',
      deviceId,
      identityEpoch,
      reason: identityVerified
        ? null
        : identityRecoveryReason ?? 'storage identity requires both deviceId and identityEpoch',
    },
    manifests: {
      status: truthValidationError ? 'invalid' : manifestCount > 0 ? 'verified' : 'missing',
      count: manifestCount,
      reason: truthValidationError,
    },
    generations: {
      status: truthValidationError ? 'invalid' : selectedGenerationId ? 'verified' : 'missing',
      currentGenerationId,
      previousGenerationId,
      selectedGenerationId,
      reason: truthValidationError ?? generationFallbackReason,
    },
    truthSegments: {
      status: truthValidationError ? 'invalid' : segmentCount > 0 ? 'verified' : 'missing',
      count: segmentCount,
      reason: truthValidationError,
    },
    deltaCoverage: {
      status: deltaValidationError
        ? 'invalid'
        : truthCoverageFrontier === null
          ? 'unavailable'
          : 'verified',
      files,
      entries,
      truthCoverageFrontier,
      uncoveredMutationCount,
      reason: deltaValidationError,
    },
    checkpoint: input.delta.checkpoint
      ? {
          status: 'verified',
          clearedAt: normalizeCount(input.delta.checkpoint.clearedAt),
          coveredSegmentPaths: uniqueStrings(input.delta.checkpoint.coveredSegmentPaths),
          reason: normalizeOptionalString(input.delta.checkpoint.reason),
        }
      : {
          status: 'missing',
          clearedAt: null,
          coveredSegmentPaths: [],
          reason: null,
        },
    temporarySqlite: {
      status: input.projection.status,
      byteLength: normalizeCount(input.projection.byteLength),
      reason: projectionReason,
    },
    recoveryState,
  };
}

function deriveIdentityDisposition(
  deviceId: string | null,
  identityEpoch: string | null,
): BackendStartupIdentityDisposition | null {
  if (!deviceId && !identityEpoch) {
    return null;
  }
  if (deviceId && identityEpoch) {
    return {
      version: 1,
      status: 'verified',
      writable: true,
      retryable: false,
      deviceId,
      identityEpoch,
      source: 'not-provided',
      reason: null,
    };
  }
  return {
    version: 1,
    status: 'read-only-recovery-required',
    writable: false,
    retryable: false,
    deviceId,
    identityEpoch,
    source: 'not-provided',
    reason: 'storage identity requires both deviceId and identityEpoch',
  };
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeCount(value: unknown): number {
  const normalized = Math.floor(Number(value) || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeOptionalCount(value: unknown): number | null {
  return value === null || value === undefined ? null : normalizeCount(value);
}

function normalizeOptionalSequence(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  return Array.from(new Set(
    Array.from(values)
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  ));
}
