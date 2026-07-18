import { describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
  FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
  FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
  TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
  TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryAuthorityPlan,
  type BackendForeignEpochRecoveryBackupReceipt,
  type BackendForeignEpochRecoveryContinuityPlan,
  type BackendForeignEpochRecoveryPhase,
  type BackendForeignEpochRecoveryPhaseReceipt,
  type BackendForeignEpochRecoveryPlan,
  type BackendForeignEpochRecoveryPreviewResult,
  type BackendRecoveryContentHash,
} from '../../../packages/contracts/src/backend-rpc';
import { WorkerForeignEpochRecoveryReceiptStore } from '../WorkerForeignEpochRecoveryReceiptStore';
import { WorkerForeignEpochRecoveryRuntime } from '../WorkerForeignEpochRecoveryRuntime';

class MemoryReceiptFileStore {
  readonly json = new Map<string, unknown>();

  async readJSON<T>(path: string): Promise<T | null> {
    return (structuredClone(this.json.get(path)) as T | undefined) ?? null;
  }

  async writeJSON(path: string, value: unknown): Promise<void> {
    this.json.set(path, structuredClone(value));
  }

  async listFiles(prefix: string): Promise<string[]> {
    return Array.from(this.json.keys()).filter((path) => path.startsWith(prefix));
  }
}

async function authorityPlan(suffix = 'a'): Promise<BackendForeignEpochRecoveryAuthorityPlan> {
  const evidenceHash = await hashRecoveryContent({ incident: suffix });
  const authority = {
    version: TRUTH_DEVICE_IDENTITY_AUTHORITY_VERSION,
    revision: 1,
    identity: {
      version: TRUTH_DEVICE_IDENTITY_RECORD_VERSION,
      deviceId: `device-${suffix}`,
      identityEpoch: `epoch-current-${suffix}`,
      hostFingerprint: null,
      createdAt: 100,
      lastSeenAt: 100,
    },
    previousRevision: null,
    publishedAt: 100,
  } as const;
  const proof = {
    identity: {
      deviceIdHash: await hashRecoveryContent(authority.identity.deviceId),
      identityEpoch: authority.identity.identityEpoch,
    },
    provingEvidence: [],
    corroboratingEvidence: [],
    contradictingEvidence: [],
  };
  const expectedAuthorityStateHash = await hashRecoveryContent({ currentAuthority: null, previousAuthority: null });
  const intentMaterial = {
    version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
    expectedAuthorityStateHash,
    authority,
    proof,
  };
  const base = {
    version: FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
    operationId: `authority-operation-${suffix}`,
    stage: 'authority-publication' as const,
    evidenceHash,
    backupScopeHash: await hashRecoveryContent({ backup: suffix }),
    createdAt: 100,
    blockers: [],
    authorityPublicationIntent: {
      ...intentMaterial,
      intentHash: await hashRecoveryContent(intentMaterial),
    },
    continuityIntent: null,
  };
  return {
    ...base,
    planHash: await hashRecoveryContent(base),
  };
}

async function continuityPlan(): Promise<BackendForeignEpochRecoveryContinuityPlan> {
  const evidenceHash = await hashRecoveryContent({ incident: 'continuity' });
  const base = {
    version: FOREIGN_EPOCH_RECOVERY_PLAN_VERSION,
    operationId: 'continuity-operation',
    stage: 'continuity' as const,
    evidenceHash,
    backupScopeHash: await hashRecoveryContent({ backup: 'continuity' }),
    createdAt: 200,
    blockers: [],
    authorityPublicationIntent: null,
    continuityIntent: {
      originalMutation: {
        mutationId: 'mutation-404',
        family: 'review' as const,
        deviceId: 'device-a',
        identityEpoch: 'epoch-original',
        journalSequence: 404,
        createdAt: 100,
        envelopeHash: await hashRecoveryContent('envelope'),
        payloadHash: await hashRecoveryContent('payload'),
        requiredTruthOutputsHash: await hashRecoveryContent('outputs'),
        durabilityReceiptIdentityHash: await hashRecoveryContent('receipt'),
        idempotencyKeyHashes: [await hashRecoveryContent('idempotency')],
      },
      predecessorIdentityEpoch: 'epoch-predecessor',
      predecessorCoverageSequence: 403,
      predecessorCoverageHash: await hashRecoveryContent('coverage'),
      expectedAuthorityRevision: 1,
      expectedAuthorityHash: await hashRecoveryContent('authority'),
      expectedCurrentIdentityEpoch: 'epoch-current',
      expectedNextJournalSequence: 405,
      expectedNextJournalSequenceAfterRecovery: 405,
      requiredTruthManifestHashes: [await hashRecoveryContent('manifest')],
    },
  };
  return {
    ...base,
    planHash: await hashRecoveryContent(base),
  };
}

function preview(plan: BackendForeignEpochRecoveryPlan): BackendForeignEpochRecoveryPreviewResult {
  return {
    version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
    available: true,
    authority: {
      state: plan.stage === 'authority-publication' ? 'missing' : 'verified',
      currentAuthorityHash: plan.stage === 'continuity' ? plan.continuityIntent.expectedAuthorityHash : null,
      previousAuthorityHash: null,
      tempLocalCompleteness: 'device-id-only',
      tempLocalDeviceIdHash: null,
    },
    evidenceHash: plan.evidenceHash,
    plan,
    blockers: [],
  };
}

function backupReceipt(plan: BackendForeignEpochRecoveryPlan): BackendForeignEpochRecoveryBackupReceipt {
  return {
    version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
    receiptId: `backup-${plan.operationId}`,
    planHash: plan.planHash,
    backupArtifactHash: `sha256:${'f'.repeat(64)}`,
    capturedAt: 90,
    verifiedAt: 95,
  };
}

async function phaseReceipt(
  plan: BackendForeignEpochRecoveryPlan,
  phase: BackendForeignEpochRecoveryPhase,
): Promise<BackendForeignEpochRecoveryPhaseReceipt> {
  return {
    version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
    operationId: plan.operationId,
    planHash: plan.planHash,
    phase,
    evidenceHash: plan.evidenceHash,
    artifactHashes: [await hashRecoveryContent(phase)],
    completedAt: 250,
  };
}

function runtimeHarness(input: {
  plans: BackendForeignEpochRecoveryPlan[];
  publisher?: (plan: BackendForeignEpochRecoveryAuthorityPlan) => Promise<BackendRecoveryContentHash>;
  valid?: boolean;
  fileStore?: MemoryReceiptFileStore;
  continuity?: boolean;
  restartRecoveryStatus?: string | null;
}) {
  let previewIndex = 0;
  const planner = {
    preview: vi.fn(async () => preview(input.plans[Math.min(previewIndex++, input.plans.length - 1)])),
    revalidate: vi.fn(async (plan: BackendForeignEpochRecoveryPlan) => ({
      valid: input.valid ?? true,
      evidenceHash: plan.evidenceHash,
      blockers: input.valid === false
        ? [{ code: 'PLAN_STALE' as const, message: 'changed', evidence: [] }]
        : [],
    })),
  };
  const fileStore = input.fileStore ?? new MemoryReceiptFileStore();
  const receiptStore = new WorkerForeignEpochRecoveryReceiptStore(fileStore);
  const authorityPublisher = {
    publish: vi.fn(async ({ intent }: { intent: BackendForeignEpochRecoveryAuthorityPlan['authorityPublicationIntent'] }) => ({
      authorityHash: input.publisher
        ? await input.publisher(input.plans.find((plan) => plan.stage === 'authority-publication') as BackendForeignEpochRecoveryAuthorityPlan)
        : await hashRecoveryContent(intent.authority),
    })),
  };
  const recoveryAuthority = {
    acquire: vi.fn(async () => undefined),
  };
  const continuityRunExclusive = vi.fn();
  const continuityApplier = input.continuity
    ? {
        async runExclusive<T>(
          _plan: BackendForeignEpochRecoveryContinuityPlan,
          operation: () => Promise<T>,
        ): Promise<T> {
          continuityRunExclusive();
          return operation();
        },
        publishOriginalEpoch: vi.fn(async () => ({ artifactHashes: [await hashRecoveryContent('original-published')] })),
        transitionFrontier: vi.fn(async () => ({ artifactHashes: [await hashRecoveryContent('frontier-transitioned')] })),
      }
    : null;
  return {
    planner,
    fileStore,
    receiptStore,
    authorityPublisher,
    recoveryAuthority,
    continuityRunExclusive,
    continuityApplier,
    runtime: new WorkerForeignEpochRecoveryRuntime({
      planner,
      receiptStore,
      authorityPublisher,
      recoveryAuthority,
      continuityApplier,
      readRestartEvidence: async () => ({
        currentIdentityEpoch: 'epoch-current',
        journalSequenceFrontier: 404,
        truthCoverageFrontier: 404,
        nextJournalSequence: 405,
        recoveryStatus: input.restartRecoveryStatus ?? null,
      }),
      now: () => 300,
    }),
  };
}

describe('WorkerForeignEpochRecoveryReceiptStore', () => {
  it('persists phase receipts with exact read-back and rejects competing phase evidence', async () => {
    const store = new WorkerForeignEpochRecoveryReceiptStore(new MemoryReceiptFileStore());
    const receipt = {
      version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
      operationId: 'operation-a',
      planHash: `sha256:${'a'.repeat(64)}` as const,
      phase: 'validated' as const,
      evidenceHash: `sha256:${'b'.repeat(64)}` as const,
      artifactHashes: [`sha256:${'c'.repeat(64)}` as const],
      completedAt: 1,
    };

    await store.append(receipt);
    await store.append(receipt);
    await expect(store.list('operation-a')).resolves.toEqual([receipt]);
    await expect(store.latestOperationId()).resolves.toBe('operation-a');
    await expect(store.append({ ...receipt, completedAt: 2 })).rejects.toThrow('RECOVERY_RECEIPT_CONFLICT');
  });
});

describe('WorkerForeignEpochRecoveryRuntime', () => {
  it('requires backup evidence before invoking authority publication', async () => {
    const plan = await authorityPlan();
    const harness = runtimeHarness({ plans: [plan] });
    await harness.runtime.preview();

    const result = await harness.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: null as never,
    });

    expect(result).toMatchObject({ status: 'rejected' });
    expect(result.blockers[0]?.code).toBe('BACKUP_RECEIPT_REQUIRED');
    expect(harness.authorityPublisher.publish).not.toHaveBeenCalled();
    expect(harness.recoveryAuthority.acquire).not.toHaveBeenCalled();
  });

  it('publishes only the previewed authority intent, records phases, and stops for restart', async () => {
    const plan = await authorityPlan();
    const harness = runtimeHarness({ plans: [plan] });
    await harness.runtime.preview({ expectedStage: 'authority-publication' });

    const result = await harness.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result).toMatchObject({
      status: 'authority-published-restart-required',
      completedPhase: 'installation-authority-published',
      restartRequired: true,
    });
    expect(harness.authorityPublisher.publish).toHaveBeenCalledWith({
      operationId: plan.operationId,
      planHash: plan.planHash,
      intent: plan.authorityPublicationIntent,
    });
    expect(harness.recoveryAuthority.acquire).toHaveBeenCalledWith({
      operationId: plan.operationId,
      planHash: plan.planHash,
      stage: 'authority-publication',
    });
    await expect(harness.receiptStore.list(plan.operationId)).resolves.toMatchObject([
      { phase: 'validated' },
      { phase: 'installation-authority-published' },
    ]);
    await expect(harness.runtime.status({ operationId: plan.operationId })).resolves.toMatchObject({
      state: 'restart-required',
      latestPhase: 'installation-authority-published',
    });
  });

  it('is idempotent after authority publication and does not republish', async () => {
    const plan = await authorityPlan();
    const harness = runtimeHarness({ plans: [plan] });
    await harness.runtime.preview();
    const request = {
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    };

    await harness.runtime.apply(request);
    const repeated = await harness.runtime.apply(request);

    expect(repeated.status).toBe('already-applied');
    expect(harness.authorityPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('refuses to continue a pre-authority plan in a restarted runtime without a fresh preview', async () => {
    const plan = await authorityPlan();
    const first = runtimeHarness({ plans: [plan] });
    await first.runtime.preview();
    await first.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });
    const restarted = runtimeHarness({ plans: [plan], fileStore: first.fileStore });

    const result = await restarted.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result.status).toBe('rejected');
    expect(result.blockers[0]?.code).toBe('PLAN_STALE');
    await expect(restarted.runtime.status()).resolves.toMatchObject({
      state: 'restart-required',
      latestPhase: 'installation-authority-published',
    });
  });

  it('rejects changed evidence before any publication or phase receipt', async () => {
    const plan = await authorityPlan();
    const harness = runtimeHarness({ plans: [plan], valid: false });
    await harness.runtime.preview();

    const result = await harness.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result.status).toBe('rejected');
    expect(harness.authorityPublisher.publish).not.toHaveBeenCalled();
    await expect(harness.receiptStore.list(plan.operationId)).resolves.toEqual([]);
  });

  it('serializes apply and rejects a competing operation ID', async () => {
    const firstPlan = await authorityPlan('a');
    const secondPlan = await authorityPlan('b');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const harness = runtimeHarness({
      plans: [firstPlan, secondPlan],
      publisher: async (plan) => {
        await gate;
        return hashRecoveryContent(plan.authorityPublicationIntent.authority);
      },
    });
    await harness.runtime.preview();
    const firstApply = harness.runtime.apply({
      operationId: firstPlan.operationId,
      planHash: firstPlan.planHash,
      backupReceipt: backupReceipt(firstPlan),
    });
    await harness.runtime.preview();

    const competing = await harness.runtime.apply({
      operationId: secondPlan.operationId,
      planHash: secondPlan.planHash,
      backupReceipt: backupReceipt(secondPlan),
    });
    release();
    await firstApply;

    expect(competing.status).toBe('rejected');
    expect(competing.blockers[0]?.message).toContain('exclusive apply fence');
  });

  it('persists original publication and Frontier transition as separate resumable phases', async () => {
    const plan = await continuityPlan();
    const harness = runtimeHarness({ plans: [plan], continuity: true });
    await harness.runtime.preview({ expectedStage: 'continuity' });

    const result = await harness.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result).toMatchObject({
      status: 'continuity-applied-restart-required',
      completedPhase: 'frontier-transitioned',
    });
    expect(harness.continuityRunExclusive).toHaveBeenCalledTimes(1);
    await expect(harness.receiptStore.list(plan.operationId)).resolves.toMatchObject([
      { phase: 'validated' },
      { phase: 'original-epoch-published' },
      { phase: 'frontier-transitioned' },
    ]);
  });

  it('resumes after a persisted validated phase without duplicating its receipt', async () => {
    const plan = await authorityPlan();
    const first = runtimeHarness({ plans: [plan] });
    await first.receiptStore.append(await phaseReceipt(plan, 'validated'));
    const restarted = runtimeHarness({ plans: [plan], fileStore: first.fileStore });
    await restarted.runtime.preview();

    const result = await restarted.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result.status).toBe('authority-published-restart-required');
    expect(restarted.authorityPublisher.publish).toHaveBeenCalledTimes(1);
    await expect(restarted.receiptStore.list(plan.operationId)).resolves.toMatchObject([
      { phase: 'validated' },
      { phase: 'installation-authority-published' },
    ]);
  });

  it('resumes after original-epoch publication without publishing the Review fact twice', async () => {
    const plan = await continuityPlan();
    const first = runtimeHarness({ plans: [plan], continuity: true });
    await first.receiptStore.append(await phaseReceipt(plan, 'validated'));
    await first.receiptStore.append(await phaseReceipt(plan, 'original-epoch-published'));
    const restarted = runtimeHarness({ plans: [plan], fileStore: first.fileStore, continuity: true });
    await restarted.runtime.preview({ expectedStage: 'continuity' });

    const result = await restarted.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result.status).toBe('continuity-applied-restart-required');
    expect(restarted.continuityApplier?.publishOriginalEpoch).not.toHaveBeenCalled();
    expect(restarted.continuityApplier?.transitionFrontier).toHaveBeenCalledTimes(1);
    await expect(restarted.receiptStore.list(plan.operationId)).resolves.toMatchObject([
      { phase: 'validated' },
      { phase: 'original-epoch-published' },
      { phase: 'frontier-transitioned' },
    ]);
  });

  it('treats a persisted Frontier transition as terminal after restart', async () => {
    const plan = await continuityPlan();
    const first = runtimeHarness({ plans: [plan], continuity: true });
    await first.receiptStore.append(await phaseReceipt(plan, 'validated'));
    await first.receiptStore.append(await phaseReceipt(plan, 'original-epoch-published'));
    await first.receiptStore.append(await phaseReceipt(plan, 'frontier-transitioned'));
    const restarted = runtimeHarness({ plans: [plan], fileStore: first.fileStore, continuity: true });
    await restarted.runtime.preview({ expectedStage: 'continuity' });

    const result = await restarted.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    expect(result.status).toBe('already-applied');
    expect(restarted.continuityApplier?.publishOriginalEpoch).not.toHaveBeenCalled();
    expect(restarted.continuityApplier?.transitionFrontier).not.toHaveBeenCalled();
  });

  it('records restart verification only after ordinary writable readiness reaches sequence 405', async () => {
    const plan = await continuityPlan();
    const harness = runtimeHarness({
      plans: [plan],
      continuity: true,
      restartRecoveryStatus: 'ready',
    });
    await harness.runtime.preview({ expectedStage: 'continuity' });
    await harness.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    await expect(harness.runtime.verifyRestart({
      status: 'ready',
      identity: {
        version: 1,
        status: 'verified',
        writable: true,
        retryable: false,
        deviceId: 'device-a',
        identityEpoch: 'epoch-current',
        source: 'installation-authority',
        reason: null,
      },
      projectionReadable: true,
      writable: true,
      recovery: {
        version: 1,
        status: 'ready',
        code: null,
        lastVerifiedGenerationId: 'generation-404',
        replayFromJournalSequence: null,
        quarantinedPaths: [],
        disabledCapabilities: [],
        diagnosticReason: null,
        updatedAt: 300,
      },
    })).resolves.toBe(true);
    await expect(harness.runtime.status({ operationId: plan.operationId })).resolves.toMatchObject({
      state: 'completed',
      latestPhase: 'restart-verified',
      audit: {
        originalIdentityEpoch: 'epoch-original',
        currentIdentityEpoch: 'epoch-current',
        recoveredJournalSequence: 404,
        expectedNextJournalSequence: 405,
      },
    });
  });

  it('retains an explicit blocker when ordinary restart is still read-only', async () => {
    const plan = await continuityPlan();
    const harness = runtimeHarness({ plans: [plan], continuity: true });
    await harness.runtime.preview({ expectedStage: 'continuity' });
    await harness.runtime.apply({
      operationId: plan.operationId,
      planHash: plan.planHash,
      backupReceipt: backupReceipt(plan),
    });

    await expect(harness.runtime.verifyRestart({
      status: 'read-only-recovery-required',
      identity: null,
      projectionReadable: true,
      writable: false,
      recovery: null,
    })).resolves.toBe(false);
    await expect(harness.runtime.status({ operationId: plan.operationId })).resolves.toMatchObject({
      state: 'blocked',
      latestPhase: 'frontier-transitioned',
      blockers: [{ code: 'RESTART_REQUIRED' }],
    });
  });
});
