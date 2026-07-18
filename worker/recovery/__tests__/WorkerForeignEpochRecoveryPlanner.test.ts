import { describe, expect, it } from 'vitest';
import {
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  type BackendForeignEpochRecoveryPhaseReceipt,
  type StorageRecoveryState,
  type TruthDeviceIdentityAuthorityEnvelopeContract,
  type TruthGenerationRecord,
} from '../../../packages/contracts/src/backend-rpc';
import type {
  WorkerVerifiedMutationFrontierJournalEvidence,
  WorkerVerifiedMutationFrontierRecord,
} from '../../truth/WorkerVerifiedMutationFrontier';
import type { WorkerTruthPromotionState } from '../../truth/WorkerTruthPromotionModule';
import { FOREIGN_EPOCH_JOURNAL_CONTINUITY_INCIDENT_FIXTURE } from '../__fixtures__/foreignEpochJournalContinuityIncident';
import { hashRecoveryContent } from '../ForeignEpochJournalContinuityInvariant';
import {
  WorkerForeignEpochRecoveryEvidenceInventory,
  type WorkerForeignEpochRecoveryEvidenceSource,
} from '../WorkerForeignEpochRecoveryEvidenceInventory';
import { WorkerForeignEpochRecoveryPlanner } from '../WorkerForeignEpochRecoveryPlanner';

interface MutableIncidentEvidence {
  currentAuthority: unknown | null;
  previousAuthority: unknown | null;
  tempLocalIdentity: unknown | null;
  browserCacheObservations: unknown[];
  frontier: WorkerVerifiedMutationFrontierRecord | null;
  journal: WorkerVerifiedMutationFrontierJournalEvidence;
  promotionStates: WorkerTruthPromotionState[];
  truthGenerations: TruthGenerationRecord[];
  storageRecoveryState: StorageRecoveryState | null;
  recoveryReceipts: BackendForeignEpochRecoveryPhaseReceipt[];
}

class MemoryEvidenceSource implements WorkerForeignEpochRecoveryEvidenceSource {
  readonly reads: string[] = [];

  constructor(readonly evidence: MutableIncidentEvidence) {}

  async readCurrentAuthority(): Promise<unknown | null> {
    this.reads.push('current-authority');
    return structuredClone(this.evidence.currentAuthority);
  }

  async readPreviousAuthority(): Promise<unknown | null> {
    this.reads.push('previous-authority');
    return structuredClone(this.evidence.previousAuthority);
  }

  async readTempLocalIdentity(): Promise<unknown | null> {
    this.reads.push('temp-local');
    return structuredClone(this.evidence.tempLocalIdentity);
  }

  async readBrowserCacheObservations(): Promise<unknown[]> {
    this.reads.push('browser-cache');
    return structuredClone(this.evidence.browserCacheObservations);
  }

  async readFrontier(): Promise<WorkerVerifiedMutationFrontierRecord | null> {
    this.reads.push('frontier');
    return structuredClone(this.evidence.frontier);
  }

  async readJournalEvidence(): Promise<WorkerVerifiedMutationFrontierJournalEvidence> {
    this.reads.push('journal');
    return structuredClone(this.evidence.journal);
  }

  async listPromotionStates(): Promise<WorkerTruthPromotionState[]> {
    this.reads.push('promotion-states');
    return structuredClone(this.evidence.promotionStates);
  }

  async listTruthGenerations(): Promise<TruthGenerationRecord[]> {
    this.reads.push('truth-generations');
    return structuredClone(this.evidence.truthGenerations);
  }

  async readStorageRecoveryState(): Promise<StorageRecoveryState | null> {
    this.reads.push('storage-recovery');
    return structuredClone(this.evidence.storageRecoveryState);
  }

  async listRecoveryReceipts(): Promise<BackendForeignEpochRecoveryPhaseReceipt[]> {
    this.reads.push('recovery-receipts');
    return structuredClone(this.evidence.recoveryReceipts);
  }
}

function incidentEvidence(): MutableIncidentEvidence {
  const fixture = structuredClone(FOREIGN_EPOCH_JOURNAL_CONTINUITY_INCIDENT_FIXTURE);
  return {
    currentAuthority: fixture.authority.current,
    previousAuthority: fixture.authority.previous,
    tempLocalIdentity: fixture.authority.tempLocal,
    browserCacheObservations: [],
    frontier: fixture.blockedCurrentEpochFrontier,
    journal: fixture.journal,
    promotionStates: [fixture.predecessorPromotionState],
    truthGenerations: fixture.truthGenerations,
    storageRecoveryState: fixture.recoveryState,
    recoveryReceipts: [],
  };
}

function verifiedAuthority(overrides: Partial<TruthDeviceIdentityAuthorityEnvelopeContract> = {}): TruthDeviceIdentityAuthorityEnvelopeContract {
  return {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
    revision: 1,
    identity: {
      version: TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
      deviceId: 'device-incident-redacted',
      identityEpoch: 'epoch-4afa-redacted',
      hostFingerprint: null,
      createdAt: 1_784_212_406_000,
      lastSeenAt: 1_784_212_406_000,
    },
    previousRevision: null,
    publishedAt: 1_784_212_406_000,
    ...overrides,
  };
}

function createPlanner(evidence = incidentEvidence()) {
  const source = new MemoryEvidenceSource(evidence);
  const inventory = new WorkerForeignEpochRecoveryEvidenceInventory(source, () => 1_784_212_406_000);
  return {
    evidence,
    source,
    inventory,
    planner: new WorkerForeignEpochRecoveryPlanner(inventory),
  };
}

describe('WorkerForeignEpochRecoveryEvidenceInventory', () => {
  it('reads every evidence class, clones it, and produces a stable content hash without write access', async () => {
    const { evidence, source, inventory } = createPlanner();
    const before = await hashRecoveryContent(evidence);
    const first = await inventory.read();
    first.journal.entries[0].mutationEnvelope.mutationId = 'changed-in-clone';
    const second = await inventory.read();
    const after = await hashRecoveryContent(evidence);

    expect(first.evidenceHash).toBe(second.evidenceHash);
    expect(second.journal.entries[0].mutationEnvelope.mutationId).toBe('mutation-sequence-404-redacted');
    expect(after).toBe(before);
    expect(new Set(source.reads)).toEqual(new Set([
      'current-authority',
      'previous-authority',
      'temp-local',
      'browser-cache',
      'frontier',
      'journal',
      'promotion-states',
      'truth-generations',
      'storage-recovery',
      'recovery-receipts',
    ]));
  });
});

describe('WorkerForeignEpochRecoveryPlanner', () => {
  it('creates a certified authority-publication plan from durable evidence and treats temp-local as corroboration only', async () => {
    const { planner } = createPlanner();

    const preview = await planner.preview();

    expect(preview.available).toBe(true);
    expect(preview.authority).toMatchObject({
      state: 'missing',
      tempLocalCompleteness: 'device-id-only',
    });
    expect(preview.plan).toMatchObject({
      stage: 'authority-publication',
      authorityPublicationIntent: {
        authority: {
          revision: 1,
          identity: {
            deviceId: 'device-incident-redacted',
            identityEpoch: 'epoch-4afa-redacted',
          },
        },
        proof: {
          provingEvidence: expect.arrayContaining([
            expect.objectContaining({ kind: 'verified-mutation-frontier' }),
            expect.objectContaining({ kind: 'truth-coverage' }),
            expect.objectContaining({ kind: 'journal-envelope', journalSequence: 404 }),
            expect.objectContaining({ kind: 'journal-allocation', journalSequence: 405 }),
          ]),
          corroboratingEvidence: [expect.objectContaining({ kind: 'temp-local-identity' })],
          contradictingEvidence: [],
        },
      },
      continuityIntent: null,
      blockers: [],
    });
    expect(JSON.stringify(preview)).not.toContain('card-aggregate-redacted');
    expect(JSON.stringify(preview)).not.toContain('review-sequence-404-redacted');
  });

  it('creates a continuity plan only after a verified authority matches the durable current epoch', async () => {
    const evidence = incidentEvidence();
    evidence.currentAuthority = verifiedAuthority();
    const { planner } = createPlanner(evidence);

    const preview = await planner.preview();

    expect(preview.available).toBe(true);
    expect(preview.plan).toMatchObject({
      stage: 'continuity',
      authorityPublicationIntent: null,
      continuityIntent: {
        predecessorIdentityEpoch: 'epoch-7b49-redacted',
        predecessorCoverageSequence: 403,
        expectedAuthorityRevision: 1,
        expectedNextJournalSequence: 405,
        expectedNextJournalSequenceAfterRecovery: 405,
        originalMutation: {
          mutationId: 'mutation-sequence-404-redacted',
          identityEpoch: 'epoch-f771-redacted',
          journalSequence: 404,
        },
      },
    });
  });

  it('revalidates an unchanged plan and rejects any evidence drift', async () => {
    const { evidence, planner } = createPlanner();
    const preview = await planner.preview();
    expect(preview.plan).not.toBeNull();

    await expect(planner.revalidate(preview.plan!)).resolves.toMatchObject({
      valid: true,
      blockers: [],
    });

    evidence.journal.entries[0].mutationEnvelope.operations[0].row!.rating = 4;
    await expect(planner.revalidate(preview.plan!)).resolves.toMatchObject({
      valid: false,
      blockers: [expect.objectContaining({ code: 'PLAN_STALE' })],
    });
  });

  it('rejects a changed authority independently from the whole-evidence stale-plan check', async () => {
    const evidence = incidentEvidence();
    evidence.currentAuthority = verifiedAuthority();
    const { planner } = createPlanner(evidence);
    const preview = await planner.preview();
    expect(preview.plan?.stage).toBe('continuity');

    evidence.currentAuthority = verifiedAuthority({ revision: 2, previousRevision: 1 });
    const result = await planner.revalidate(preview.plan!);

    expect(result.valid).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PLAN_STALE' }),
      expect.objectContaining({ code: 'IDENTITY_AUTHORITY_CHANGED' }),
    ]));
  });

  it.each([
    ['missing Frontier', (evidence: MutableIncidentEvidence) => { evidence.frontier = null; }, 'PREDECESSOR_COVERAGE_UNVERIFIED'],
    ['conflicting temp identity', (evidence: MutableIncidentEvidence) => { evidence.tempLocalIdentity = { version: 1, deviceId: 'other-device' }; }, 'IDENTITY_AUTHORITY_EVIDENCE_CONFLICT'],
    ['duplicate sequence owner', (evidence: MutableIncidentEvidence) => { evidence.journal.entries.push(structuredClone(evidence.journal.entries[0])); }, 'JOURNAL_SEQUENCE_CONFLICT'],
    ['journal allocation gap', (evidence: MutableIncidentEvidence) => { evidence.journal.nextJournalSequence = 406; }, 'JOURNAL_SEQUENCE_GAP'],
    ['device ownership mismatch', (evidence: MutableIncidentEvidence) => { evidence.journal.entries[0].mutationEnvelope.deviceId = 'other-device'; }, 'DEVICE_OWNERSHIP_CONFLICT'],
  ])('rejects %s without mutating any evidence bytes', async (_label, mutate, expectedCode) => {
    const evidence = incidentEvidence();
    mutate(evidence);
    const { planner } = createPlanner(evidence);
    const before = await hashRecoveryContent(evidence);

    const preview = await planner.preview();
    const after = await hashRecoveryContent(evidence);

    expect(preview.available).toBe(false);
    expect(preview.plan).toBeNull();
    expect(preview.blockers[0]?.code).toBe(expectedCode);
    expect(after).toBe(before);
  });

  it('rejects a verified authority that disagrees with the durable current-epoch Frontier', async () => {
    const evidence = incidentEvidence();
    const authority = verifiedAuthority();
    authority.identity.identityEpoch = 'epoch-other';
    evidence.currentAuthority = authority;

    const preview = await createPlanner(evidence).planner.preview();

    expect(preview.available).toBe(false);
    expect(preview.blockers[0]?.code).toBe('DEVICE_OWNERSHIP_CONFLICT');
  });
});
