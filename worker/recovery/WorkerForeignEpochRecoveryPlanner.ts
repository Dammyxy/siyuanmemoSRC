import {
  FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
  FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  type BackendForeignEpochRecoveryAuthorityEvidence,
  type BackendForeignEpochRecoveryAuthorityPlan,
  type BackendForeignEpochRecoveryBlocker,
  type BackendForeignEpochRecoveryBlockerCode,
  type BackendForeignEpochRecoveryContinuityPlan,
  type BackendForeignEpochRecoveryEvidenceKind,
  type BackendForeignEpochRecoveryEvidenceReference,
  type BackendForeignEpochRecoveryIdentityReference,
  type BackendForeignEpochRecoveryPlan,
  type BackendForeignEpochRecoveryPreviewResult,
  type BackendRecoveryContentHash,
  type TruthDeviceIdentityAuthorityEnvelopeContract,
  type TruthDeviceIdentityRecordContract,
} from '../../packages/contracts/src/backend-rpc';
import type { WorkerTruthPromotionJournalEntry, WorkerTruthPromotionState } from '../truth/WorkerTruthPromotionModule';
import {
  hashRecoveryContent,
  snapshotImmutableMutationIdentity,
} from './ForeignEpochJournalContinuityInvariant';
import type {
  WorkerForeignEpochRecoveryEvidenceInventory,
  WorkerForeignEpochRecoveryEvidenceInventoryRecord,
} from './WorkerForeignEpochRecoveryEvidenceInventory';

interface AdjacentIncidentEvidence {
  frontier: NonNullable<WorkerForeignEpochRecoveryEvidenceInventoryRecord['frontier']>;
  predecessor: WorkerTruthPromotionState;
  entry: WorkerTruthPromotionJournalEntry;
  targetSequence: number;
}

export interface WorkerForeignEpochRecoveryRevalidationResult {
  valid: boolean;
  evidenceHash: BackendRecoveryContentHash;
  blockers: BackendForeignEpochRecoveryBlocker[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUnavailableCacheObservation(value: unknown): boolean {
  return isRecord(value)
    && value.status === 'unavailable'
    && typeof value.cacheKind === 'string'
    && typeof value.errorHash === 'string';
}

function normalizedString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function isIdentityRecord(value: unknown): value is TruthDeviceIdentityRecordContract {
  if (!isRecord(value)) return false;
  return value.version === TRUTH_DEVICE_IDENTITY_RECORD_VERSION
    && !!normalizedString(value.deviceId)
    && !!normalizedString(value.identityEpoch)
    && (value.hostFingerprint === null || typeof value.hostFingerprint === 'string')
    && Number.isFinite(value.createdAt)
    && Number.isFinite(value.lastSeenAt);
}

function isAuthorityEnvelope(value: unknown): value is TruthDeviceIdentityAuthorityEnvelopeContract {
  if (!isRecord(value)) return false;
  return value.version === TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION
    && Number.isSafeInteger(value.revision)
    && Number(value.revision) > 0
    && (value.previousRevision === null || (Number.isSafeInteger(value.previousRevision) && Number(value.previousRevision) > 0))
    && Number.isFinite(value.publishedAt)
    && Number(value.publishedAt) > 0
    && isIdentityRecord(value.identity);
}

function readLegacyDeviceId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return normalizedString(value.deviceId);
}

function journalSequence(entry: WorkerTruthPromotionJournalEntry): number | null {
  const value = entry.mutationEnvelope.journalSequence;
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function blocker(
  code: BackendForeignEpochRecoveryBlockerCode,
  message: string,
  evidence: BackendForeignEpochRecoveryEvidenceReference[] = [],
): BackendForeignEpochRecoveryBlocker {
  return { code, message, evidence };
}

async function identityReference(deviceId: string, identityEpoch: string): Promise<BackendForeignEpochRecoveryIdentityReference> {
  return {
    deviceIdHash: await hashRecoveryContent(deviceId),
    identityEpoch,
  };
}

async function evidenceReference(input: {
  kind: BackendForeignEpochRecoveryEvidenceKind;
  value: unknown;
  deviceId?: string | null;
  identityEpoch?: string | null;
  journalSequence?: number | null;
}): Promise<BackendForeignEpochRecoveryEvidenceReference> {
  return {
    kind: input.kind,
    contentHash: await hashRecoveryContent(input.value),
    identity: input.deviceId && input.identityEpoch
      ? await identityReference(input.deviceId, input.identityEpoch)
      : null,
    journalSequence: input.journalSequence ?? null,
  };
}

async function authorityStateHash(inventory: WorkerForeignEpochRecoveryEvidenceInventoryRecord): Promise<BackendRecoveryContentHash> {
  return hashRecoveryContent({
    currentAuthority: inventory.currentAuthority,
    previousAuthority: inventory.previousAuthority,
  });
}

async function planHash(plan: Omit<BackendForeignEpochRecoveryPlan, 'planHash'>): Promise<BackendRecoveryContentHash> {
  return hashRecoveryContent(plan);
}

function selectPredecessor(inventory: WorkerForeignEpochRecoveryEvidenceInventoryRecord): WorkerTruthPromotionState | null {
  const candidates = inventory.promotionStates
    .filter((state) => state.coverage && Number.isSafeInteger(state.coverage.coveredJournalSequence))
    .sort((left, right) => (
      (right.coverage?.coveredJournalSequence ?? 0) - (left.coverage?.coveredJournalSequence ?? 0)
      || left.identityEpoch.localeCompare(right.identityEpoch)
    ));
  return candidates[0] ?? null;
}

function validateAdjacentIncident(
  inventory: WorkerForeignEpochRecoveryEvidenceInventoryRecord,
): { incident: AdjacentIncidentEvidence | null; blockers: BackendForeignEpochRecoveryBlocker[] } {
  const blockers: BackendForeignEpochRecoveryBlocker[] = [];
  const frontier = inventory.frontier;
  if (!frontier || frontier.blockingCode !== 'FRONTIER_FOREIGN_EPOCH_UNCOVERED') {
    blockers.push(blocker(
      'PREDECESSOR_COVERAGE_UNVERIFIED',
      'Stored Frontier does not prove the foreign-epoch recovery incident.',
    ));
    return { incident: null, blockers };
  }
  const predecessor = selectPredecessor(inventory);
  const predecessorCoverage = predecessor?.coverage ?? null;
  if (!predecessor || !predecessorCoverage) {
    blockers.push(blocker(
      'PREDECESSOR_COVERAGE_UNVERIFIED',
      'Verified predecessor coverage is unavailable.',
    ));
    return { incident: null, blockers };
  }
  const targetSequence = predecessorCoverage.coveredJournalSequence + 1;
  const sequenceOwners = inventory.journal.entries.filter((entry) => journalSequence(entry) === targetSequence);
  if (sequenceOwners.length > 1) {
    blockers.push(blocker(
      'JOURNAL_SEQUENCE_CONFLICT',
      'More than one mutation owns the next journal sequence.',
    ));
    return { incident: null, blockers };
  }
  const entry = sequenceOwners[0] ?? null;
  if (!entry || inventory.journal.nextJournalSequence !== targetSequence + 1) {
    blockers.push(blocker(
      'JOURNAL_SEQUENCE_GAP',
      'The journal allocation does not prove one unique adjacent mutation.',
    ));
    return { incident: null, blockers };
  }
  const envelope = entry.mutationEnvelope;
  if (
    envelope.deviceId !== predecessor.deviceId
    || envelope.deviceId !== frontier.deviceId
    || envelope.identityEpoch === frontier.activeIdentityEpoch
  ) {
    blockers.push(blocker(
      'DEVICE_OWNERSHIP_CONFLICT',
      'Durable identity evidence does not prove one same-device epoch transition.',
    ));
    return { incident: null, blockers };
  }
  if (
    entry.durabilityReceipt.mutationId !== envelope.mutationId
    || entry.durabilityReceipt.family !== envelope.family
    || entry.durabilityReceipt.journalSequence !== envelope.journalSequence
  ) {
    blockers.push(blocker(
      'MUTATION_IDENTITY_CHANGED',
      'The durability receipt identity does not match the journal envelope.',
    ));
    return { incident: null, blockers };
  }
  const expectedReason = `frontier-foreign-epoch-uncovered:${targetSequence}:${envelope.identityEpoch}`;
  if (frontier.blockingReason !== expectedReason) {
    blockers.push(blocker(
      'PREDECESSOR_COVERAGE_UNVERIFIED',
      'Stored Frontier blocker does not match the adjacent mutation evidence.',
    ));
    return { incident: null, blockers };
  }
  return {
    incident: { frontier, predecessor, entry, targetSequence },
    blockers,
  };
}

async function describeAuthorityEvidence(
  inventory: WorkerForeignEpochRecoveryEvidenceInventoryRecord,
): Promise<BackendForeignEpochRecoveryAuthorityEvidence> {
  const currentHash = inventory.currentAuthority == null ? null : await hashRecoveryContent(inventory.currentAuthority);
  const previousHash = inventory.previousAuthority == null ? null : await hashRecoveryContent(inventory.previousAuthority);
  const tempDeviceId = readLegacyDeviceId(inventory.tempLocalIdentity);
  return {
    state: inventory.currentAuthority == null
      ? 'missing'
      : isAuthorityEnvelope(inventory.currentAuthority) ? 'verified' : 'invalid',
    currentAuthorityHash: currentHash,
    previousAuthorityHash: previousHash,
    tempLocalCompleteness: inventory.tempLocalIdentity == null
      ? 'missing'
      : isIdentityRecord(inventory.tempLocalIdentity)
        ? 'complete'
        : tempDeviceId ? 'device-id-only' : 'invalid',
    tempLocalDeviceIdHash: tempDeviceId ? await hashRecoveryContent(tempDeviceId) : null,
  };
}

export class WorkerForeignEpochRecoveryPlanner {
  constructor(
    private readonly inventory: Pick<WorkerForeignEpochRecoveryEvidenceInventory, 'read'>,
  ) {}

  async preview(): Promise<BackendForeignEpochRecoveryPreviewResult> {
    const evidence = await this.inventory.read();
    const authority = await describeAuthorityEvidence(evidence);
    if (authority.state === 'invalid') {
      const blockers = [blocker(
        'IDENTITY_AUTHORITY_EVIDENCE_CONFLICT',
        'The installation authority exists but is invalid or unsupported.',
      )];
      return this.blocked(authority, evidence.evidenceHash, blockers);
    }
    const adjacency = validateAdjacentIncident(evidence);
    if (!adjacency.incident) {
      return this.blocked(authority, evidence.evidenceHash, adjacency.blockers);
    }
    if (authority.state === 'missing') {
      return this.previewAuthorityPublication(evidence, authority, adjacency.incident);
    }
    return this.previewContinuity(evidence, authority, adjacency.incident);
  }

  async revalidate(plan: BackendForeignEpochRecoveryPlan): Promise<WorkerForeignEpochRecoveryRevalidationResult> {
    const evidence = await this.inventory.read();
    const expectedPlanHash = await this.recomputePlanHash(plan);
    const blockers: BackendForeignEpochRecoveryBlocker[] = [];
    if (expectedPlanHash !== plan.planHash) {
      blockers.push(blocker('PLAN_STALE', 'The approved recovery plan hash is invalid.'));
    }
    if (evidence.evidenceHash !== plan.evidenceHash) {
      blockers.push(blocker('PLAN_STALE', 'Recovery evidence changed after preview.'));
    }
    if (plan.stage === 'authority-publication') {
      const currentAuthorityStateHash = await authorityStateHash(evidence);
      if (currentAuthorityStateHash !== plan.authorityPublicationIntent.expectedAuthorityStateHash) {
        blockers.push(blocker('IDENTITY_AUTHORITY_CHANGED', 'Installation authority state changed after preview.'));
      }
    } else {
      const currentHash = evidence.currentAuthority == null
        ? null
        : await hashRecoveryContent(evidence.currentAuthority);
      if (
        !isAuthorityEnvelope(evidence.currentAuthority)
        || currentHash !== plan.continuityIntent.expectedAuthorityHash
        || evidence.currentAuthority.revision !== plan.continuityIntent.expectedAuthorityRevision
      ) {
        blockers.push(blocker('IDENTITY_AUTHORITY_CHANGED', 'Verified installation authority changed after preview.'));
      }
    }
    return {
      valid: blockers.length === 0,
      evidenceHash: evidence.evidenceHash,
      blockers,
    };
  }

  private async previewAuthorityPublication(
    evidence: WorkerForeignEpochRecoveryEvidenceInventoryRecord,
    authorityEvidence: BackendForeignEpochRecoveryAuthorityEvidence,
    incident: AdjacentIncidentEvidence,
  ): Promise<BackendForeignEpochRecoveryPreviewResult> {
    const { frontier, predecessor, entry, targetSequence } = incident;
    const tempDeviceId = readLegacyDeviceId(evidence.tempLocalIdentity);
    const provingEvidence = await Promise.all([
      evidenceReference({
        kind: 'verified-mutation-frontier',
        value: frontier,
        deviceId: frontier.deviceId,
        identityEpoch: frontier.activeIdentityEpoch,
      }),
      evidenceReference({
        kind: 'truth-coverage',
        value: predecessor.coverage,
        deviceId: predecessor.deviceId,
        identityEpoch: predecessor.identityEpoch,
        journalSequence: predecessor.coverage!.coveredJournalSequence,
      }),
      evidenceReference({
        kind: 'journal-envelope',
        value: entry,
        deviceId: entry.mutationEnvelope.deviceId,
        identityEpoch: entry.mutationEnvelope.identityEpoch,
        journalSequence: targetSequence,
      }),
      evidenceReference({
        kind: 'journal-allocation',
        value: { nextJournalSequence: evidence.journal.nextJournalSequence },
        journalSequence: evidence.journal.nextJournalSequence,
      }),
    ]);
    const corroboratingEvidence: BackendForeignEpochRecoveryEvidenceReference[] = [];
    const contradictingEvidence: BackendForeignEpochRecoveryEvidenceReference[] = [];
    if (evidence.tempLocalIdentity != null && !isUnavailableCacheObservation(evidence.tempLocalIdentity)) {
      const tempReference = await evidenceReference({
        kind: 'temp-local-identity',
        value: evidence.tempLocalIdentity,
      });
      if (tempDeviceId === frontier.deviceId) corroboratingEvidence.push(tempReference);
      else contradictingEvidence.push(tempReference);
    }
    for (const observation of evidence.browserCacheObservations) {
      if (isUnavailableCacheObservation(observation)) continue;
      const observedDeviceId = readLegacyDeviceId(observation);
      const observedEpoch = isRecord(observation) ? normalizedString(observation.identityEpoch) : null;
      const reference = await evidenceReference({
        kind: 'browser-cache-observation',
        value: observation,
        deviceId: observedDeviceId,
        identityEpoch: observedEpoch,
      });
      if (observedDeviceId === frontier.deviceId && (!observedEpoch || observedEpoch === frontier.activeIdentityEpoch)) {
        corroboratingEvidence.push(reference);
      } else {
        contradictingEvidence.push(reference);
      }
    }
    if (contradictingEvidence.length > 0) {
      return this.blocked(authorityEvidence, evidence.evidenceHash, [blocker(
        'IDENTITY_AUTHORITY_EVIDENCE_CONFLICT',
        'Corroborating identity observations conflict with durable incident evidence.',
        contradictingEvidence,
      )]);
    }
    if (!frontier.activeIdentityEpoch || frontier.activeIdentityEpoch === predecessor.identityEpoch) {
      return this.blocked(authorityEvidence, evidence.evidenceHash, [blocker(
        'IDENTITY_AUTHORITY_EVIDENCE_INSUFFICIENT',
        'Durable evidence does not identify one intended current epoch.',
        provingEvidence,
      )]);
    }
    const identity: TruthDeviceIdentityRecordContract = {
      version: TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
      deviceId: frontier.deviceId,
      identityEpoch: frontier.activeIdentityEpoch,
      hostFingerprint: null,
      createdAt: evidence.capturedAt,
      lastSeenAt: evidence.capturedAt,
    };
    const previousAuthority = isAuthorityEnvelope(evidence.previousAuthority)
      ? evidence.previousAuthority
      : null;
    if (previousAuthority && (
      previousAuthority.identity.deviceId !== identity.deviceId
      || previousAuthority.identity.identityEpoch !== identity.identityEpoch
    )) {
      const previousReference = await evidenceReference({
        kind: 'installation-authority-previous',
        value: previousAuthority,
        deviceId: previousAuthority.identity.deviceId,
        identityEpoch: previousAuthority.identity.identityEpoch,
      });
      return this.blocked(authorityEvidence, evidence.evidenceHash, [blocker(
        'IDENTITY_AUTHORITY_EVIDENCE_CONFLICT',
        'Previous authority conflicts with the durable current identity candidate.',
        [previousReference],
      )]);
    }
    const authority: TruthDeviceIdentityAuthorityEnvelopeContract = {
      version: TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
      revision: previousAuthority ? previousAuthority.revision + 1 : 1,
      identity,
      previousRevision: previousAuthority?.revision ?? null,
      publishedAt: evidence.capturedAt,
    };
    const proof = {
      identity: await identityReference(identity.deviceId, identity.identityEpoch),
      provingEvidence,
      corroboratingEvidence,
      contradictingEvidence,
    };
    const expectedAuthorityStateHash = await authorityStateHash(evidence);
    const intentMaterial = {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      expectedAuthorityStateHash,
      authority,
      proof,
    };
    const authorityPublicationIntent = {
      ...intentMaterial,
      intentHash: await hashRecoveryContent(intentMaterial),
    };
    const operationId = `foreign-epoch-authority-${evidence.evidenceHash.slice('sha256:'.length, 'sha256:'.length + 16)}`;
    const basePlan = {
      version: FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
      operationId,
      stage: 'authority-publication' as const,
      evidenceHash: evidence.evidenceHash,
      backupScopeHash: await hashRecoveryContent({ evidenceHash: evidence.evidenceHash, stage: 'authority-publication' }),
      createdAt: evidence.capturedAt,
      blockers: [],
      authorityPublicationIntent,
      continuityIntent: null,
    };
    const plan: BackendForeignEpochRecoveryAuthorityPlan = {
      ...basePlan,
      planHash: await planHash(basePlan),
    };
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      available: true,
      authority: authorityEvidence,
      evidenceHash: evidence.evidenceHash,
      plan,
      blockers: [],
    };
  }

  private async previewContinuity(
    evidence: WorkerForeignEpochRecoveryEvidenceInventoryRecord,
    authorityEvidence: BackendForeignEpochRecoveryAuthorityEvidence,
    incident: AdjacentIncidentEvidence,
  ): Promise<BackendForeignEpochRecoveryPreviewResult> {
    const currentAuthority = evidence.currentAuthority;
    if (!isAuthorityEnvelope(currentAuthority)) {
      return this.blocked(authorityEvidence, evidence.evidenceHash, [blocker(
        'IDENTITY_AUTHORITY_EVIDENCE_CONFLICT',
        'Continuity recovery requires a verified installation authority.',
      )]);
    }
    const { frontier, predecessor, entry, targetSequence } = incident;
    if (
      currentAuthority.identity.deviceId !== frontier.deviceId
      || currentAuthority.identity.identityEpoch !== frontier.activeIdentityEpoch
    ) {
      return this.blocked(authorityEvidence, evidence.evidenceHash, [blocker(
        'DEVICE_OWNERSHIP_CONFLICT',
        'Verified authority does not match the stored current-epoch Frontier.',
      )]);
    }
    const predecessorCoverage = predecessor.coverage!;
    const predecessorCoverageHash = await hashRecoveryContent(predecessorCoverage);
    const generation = evidence.truthGenerations.find(
      (candidate) => candidate.generationId === predecessorCoverage.truthGenerationId,
    );
    if (!generation || generation.status !== 'published') {
      return this.blocked(authorityEvidence, evidence.evidenceHash, [blocker(
        'PREDECESSOR_COVERAGE_UNVERIFIED',
        'Predecessor Truth Generation is not durably published.',
      )]);
    }
    const expectedAuthorityHash = await hashRecoveryContent(currentAuthority);
    const continuityIntent = {
      originalMutation: await snapshotImmutableMutationIdentity(entry),
      predecessorIdentityEpoch: predecessor.identityEpoch,
      predecessorCoverageSequence: predecessorCoverage.coveredJournalSequence,
      predecessorCoverageHash,
      expectedAuthorityRevision: currentAuthority.revision,
      expectedAuthorityHash,
      expectedCurrentIdentityEpoch: currentAuthority.identity.identityEpoch,
      expectedNextJournalSequence: evidence.journal.nextJournalSequence,
      expectedNextJournalSequenceAfterRecovery: targetSequence + 1,
      requiredTruthManifestHashes: await Promise.all(generation.families.map(hashRecoveryContent)),
    };
    const operationId = `foreign-epoch-continuity-${evidence.evidenceHash.slice('sha256:'.length, 'sha256:'.length + 16)}`;
    const basePlan = {
      version: FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
      operationId,
      stage: 'continuity' as const,
      evidenceHash: evidence.evidenceHash,
      backupScopeHash: await hashRecoveryContent({ evidenceHash: evidence.evidenceHash, stage: 'continuity' }),
      createdAt: evidence.capturedAt,
      blockers: [],
      authorityPublicationIntent: null,
      continuityIntent,
    };
    const plan: BackendForeignEpochRecoveryContinuityPlan = {
      ...basePlan,
      planHash: await planHash(basePlan),
    };
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      available: true,
      authority: authorityEvidence,
      evidenceHash: evidence.evidenceHash,
      plan,
      blockers: [],
    };
  }

  private blocked(
    authority: BackendForeignEpochRecoveryAuthorityEvidence,
    evidenceHash: BackendRecoveryContentHash,
    blockers: BackendForeignEpochRecoveryBlocker[],
  ): BackendForeignEpochRecoveryPreviewResult {
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      available: false,
      authority,
      evidenceHash,
      plan: null,
      blockers,
    };
  }

  private recomputePlanHash(plan: BackendForeignEpochRecoveryPlan): Promise<BackendRecoveryContentHash> {
    const { planHash: _ignored, ...material } = plan;
    return planHash(material);
  }
}
