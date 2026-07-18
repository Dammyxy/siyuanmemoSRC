import {
  FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
  FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
  hashRecoveryContent,
  type BackendForeignEpochRecoveryApplyRequest,
  type BackendForeignEpochRecoveryApplyResult,
  type BackendForeignEpochRecoveryAuditSummary,
  type BackendForeignEpochRecoveryAuthorityPublicationIntent,
  type BackendForeignEpochRecoveryBlocker,
  type BackendForeignEpochRecoveryContinuityPlan,
  type BackendForeignEpochRecoveryPhase,
  type BackendForeignEpochRecoveryPhaseReceipt,
  type BackendForeignEpochRecoveryPlan,
  type BackendForeignEpochRecoveryPreviewRequest,
  type BackendForeignEpochRecoveryPreviewResult,
  type BackendForeignEpochRecoveryStatusRequest,
  type BackendForeignEpochRecoveryStatusResult,
  type BackendRecoveryContentHash,
  type BackendStartupReadinessDisposition,
} from '../../packages/contracts/src/backend-rpc';
import type { WorkerForeignEpochRecoveryPlanner } from './WorkerForeignEpochRecoveryPlanner';
import type { WorkerForeignEpochRecoveryReceiptStore } from './WorkerForeignEpochRecoveryReceiptStore';

export interface WorkerForeignEpochAuthorityPublisher {
  publish(input: {
    operationId: string;
    planHash: BackendRecoveryContentHash;
    intent: BackendForeignEpochRecoveryAuthorityPublicationIntent;
  }): Promise<{ authorityHash: BackendRecoveryContentHash }>;
}

export interface WorkerForeignEpochContinuityApplier {
  runExclusive<T>(
    plan: BackendForeignEpochRecoveryContinuityPlan,
    operation: () => Promise<T>,
  ): Promise<T>;
  publishOriginalEpoch(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): Promise<{ artifactHashes: BackendRecoveryContentHash[] }>;
  transitionFrontier(
    plan: BackendForeignEpochRecoveryContinuityPlan,
  ): Promise<{ artifactHashes: BackendRecoveryContentHash[] }>;
}

export interface WorkerForeignEpochRecoveryRuntimeOptions {
  planner: Pick<WorkerForeignEpochRecoveryPlanner, 'preview' | 'revalidate'>;
  receiptStore: Pick<WorkerForeignEpochRecoveryReceiptStore, 'list' | 'append' | 'latestOperationId'>;
  authorityPublisher: WorkerForeignEpochAuthorityPublisher;
  recoveryAuthority: {
    acquire(input: {
      operationId: string;
      planHash: BackendRecoveryContentHash;
      stage: BackendForeignEpochRecoveryPlan['stage'];
    }): Promise<void>;
  };
  continuityApplier?: WorkerForeignEpochContinuityApplier | null;
  readRestartEvidence(): Promise<{
    currentIdentityEpoch: string | null;
    journalSequenceFrontier: number;
    truthCoverageFrontier: number;
    nextJournalSequence: number;
    recoveryStatus: string | null;
  }>;
  now?: () => number;
}

function blocked(code: BackendForeignEpochRecoveryBlocker['code'], message: string): BackendForeignEpochRecoveryBlocker {
  return { code, message, evidence: [] };
}

function isContentHash(value: unknown): value is BackendRecoveryContentHash {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

export class WorkerForeignEpochRecoveryRuntime {
  private readonly plans = new Map<BackendRecoveryContentHash, BackendForeignEpochRecoveryPlan>();
  private readonly now: () => number;
  private activeApply: {
    operationId: string;
    promise: Promise<BackendForeignEpochRecoveryApplyResult>;
  } | null = null;
  private readonly restartBlockers = new Map<string, BackendForeignEpochRecoveryBlocker[]>();

  constructor(private readonly options: WorkerForeignEpochRecoveryRuntimeOptions) {
    this.now = options.now ?? Date.now;
  }

  async preview(request: BackendForeignEpochRecoveryPreviewRequest = {}): Promise<BackendForeignEpochRecoveryPreviewResult> {
    const result = await this.options.planner.preview();
    if (result.plan && request.expectedStage && result.plan.stage !== request.expectedStage) {
      return {
        ...result,
        available: false,
        plan: null,
        blockers: [blocked('RESTART_REQUIRED', `Recovery stage ${request.expectedStage} is not available before restart.`)],
      };
    }
    if (result.plan) {
      this.plans.set(result.plan.planHash, structuredClone(result.plan));
    }
    return structuredClone(result);
  }

  apply(request: BackendForeignEpochRecoveryApplyRequest): Promise<BackendForeignEpochRecoveryApplyResult> {
    const requestError = this.validateApplyRequest(request);
    if (requestError) {
      return Promise.resolve(this.rejected(request.operationId, null, [requestError]));
    }
    if (this.activeApply) {
      if (this.activeApply.operationId === request.operationId) {
        return this.activeApply.promise;
      }
      return Promise.resolve(this.rejected(request.operationId, null, [blocked(
        'PLAN_STALE',
        'Another recovery operation currently owns the exclusive apply fence.',
      )]));
    }
    const promise = this.runApply(request).finally(() => {
      if (this.activeApply?.promise === promise) this.activeApply = null;
    });
    this.activeApply = { operationId: request.operationId, promise };
    return promise;
  }

  async status(request: BackendForeignEpochRecoveryStatusRequest = {}): Promise<BackendForeignEpochRecoveryStatusResult> {
    const operationId = String(request.operationId || '').trim()
      || this.activeApply?.operationId
      || await this.options.receiptStore.latestOperationId();
    if (!operationId) {
      return {
        version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
        operationId: null,
        stage: null,
        state: 'idle',
        latestPhase: null,
        planHash: null,
        receipts: [],
        blockers: [],
      };
    }
    const receipts = await this.options.receiptStore.list(operationId);
    const latest = receipts.at(-1) ?? null;
    const plan = latest ? this.plans.get(latest.planHash) ?? null : null;
    const latestPhase = latest?.phase ?? null;
    const restartBlockers = this.restartBlockers.get(operationId) ?? [];
    const state = restartBlockers.length > 0
      ? 'blocked'
      : latestPhase === 'restart-verified'
      ? 'completed'
      : latestPhase === 'installation-authority-published' || latestPhase === 'frontier-transitioned'
        ? 'restart-required'
        : this.activeApply?.operationId === operationId
          ? 'in-progress'
          : latest ? 'blocked' : 'idle';
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      operationId,
      stage: plan?.stage ?? (latestPhase === 'installation-authority-published' ? 'authority-publication' : latest ? 'continuity' : null),
      state,
      latestPhase,
      planHash: latest?.planHash ?? null,
      receipts,
      audit: latest?.audit ?? null,
      blockers: structuredClone(restartBlockers),
    };
  }

  async verifyRestart(readiness: BackendStartupReadinessDisposition | null | undefined): Promise<boolean> {
    const operationId = await this.options.receiptStore.latestOperationId();
    if (!operationId) return false;
    const receipts = await this.options.receiptStore.list(operationId);
    if (receipts.some((receipt) => receipt.phase === 'restart-verified')) {
      this.restartBlockers.delete(operationId);
      return true;
    }
    const frontierReceipt = receipts.find((receipt) => receipt.phase === 'frontier-transitioned') ?? null;
    if (!frontierReceipt?.audit) return false;
    const evidence = await this.options.readRestartEvidence();
    const audit = frontierReceipt.audit;
    const identity = readiness?.identity ?? null;
    const verified = readiness?.status === 'ready'
      && readiness.writable
      && readiness.projectionReadable
      && (readiness.recovery === null || readiness.recovery.status === 'ready')
      && identity?.status === 'verified'
      && identity.identityEpoch === audit.currentIdentityEpoch
      && evidence.currentIdentityEpoch === audit.currentIdentityEpoch
      && evidence.journalSequenceFrontier === audit.recoveredJournalSequence
      && evidence.truthCoverageFrontier === audit.recoveredJournalSequence
      && evidence.nextJournalSequence === audit.expectedNextJournalSequence
      && (evidence.recoveryStatus === null || evidence.recoveryStatus === 'ready');
    if (!verified) {
      this.restartBlockers.set(operationId, [blocked(
        'RESTART_REQUIRED',
        'Normal startup has not verified authority, Frontier, journal, truth, projection, and writable readiness.',
      )]);
      return false;
    }
    await this.options.receiptStore.append({
      version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
      operationId,
      planHash: frontierReceipt.planHash,
      phase: 'restart-verified',
      evidenceHash: frontierReceipt.evidenceHash,
      artifactHashes: [
        await hashRecoveryContent(readiness),
        await hashRecoveryContent(evidence),
      ],
      audit: structuredClone(audit),
      completedAt: this.now(),
    });
    this.restartBlockers.delete(operationId);
    return true;
  }

  private async runApply(request: BackendForeignEpochRecoveryApplyRequest): Promise<BackendForeignEpochRecoveryApplyResult> {
    const plan = this.plans.get(request.planHash) ?? null;
    if (!plan || plan.operationId !== request.operationId) {
      return this.rejected(request.operationId, plan?.stage ?? null, [blocked(
        'PLAN_STALE',
        'Apply requires a plan previewed by this Worker runtime.',
      )]);
    }
    const existing = await this.options.receiptStore.list(plan.operationId);
    const terminalPhase = plan.stage === 'authority-publication'
      ? 'installation-authority-published'
      : 'frontier-transitioned';
    if (existing.some((receipt) => receipt.phase === terminalPhase && receipt.planHash === plan.planHash)) {
      return {
        version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
        operationId: plan.operationId,
        stage: plan.stage,
        status: 'already-applied',
        completedPhase: terminalPhase,
        restartRequired: true,
        blockers: [],
      };
    }
    await this.options.recoveryAuthority.acquire({
      operationId: plan.operationId,
      planHash: plan.planHash,
      stage: plan.stage,
    });
    if (plan.stage === 'continuity') {
      if (!this.options.continuityApplier) {
        return this.rejected(plan.operationId, plan.stage, [blocked(
          'TRUTH_OUTPUT_CONFLICT',
          'Continuity apply is unavailable in this Worker runtime.',
        )]);
      }
      return this.options.continuityApplier.runExclusive(
        plan,
        () => this.runContinuityApply(plan, request, existing),
      );
    }
    const revalidated = await this.options.planner.revalidate(plan);
    if (!revalidated.valid) {
      return this.rejected(plan.operationId, plan.stage, revalidated.blockers);
    }
    await this.appendPhase(plan, 'validated', [request.backupReceipt.backupArtifactHash]);
    const publication = await this.options.authorityPublisher.publish({
      operationId: plan.operationId,
      planHash: plan.planHash,
      intent: plan.authorityPublicationIntent,
    });
    const expectedAuthorityHash = await hashRecoveryContent(plan.authorityPublicationIntent.authority);
    if (publication.authorityHash !== expectedAuthorityHash) {
      throw new Error('RECOVERY_AUTHORITY_VERIFICATION_FAILED: publisher read-back hash mismatch');
    }
    await this.appendPhase(plan, 'installation-authority-published', [publication.authorityHash]);
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      operationId: plan.operationId,
      stage: plan.stage,
      status: 'authority-published-restart-required',
      completedPhase: 'installation-authority-published',
      restartRequired: true,
      blockers: [],
    };
  }

  private async runContinuityApply(
    plan: BackendForeignEpochRecoveryContinuityPlan,
    request: BackendForeignEpochRecoveryApplyRequest,
    existing: BackendForeignEpochRecoveryPhaseReceipt[],
  ): Promise<BackendForeignEpochRecoveryApplyResult> {
    const revalidated = await this.options.planner.revalidate(plan);
    if (!revalidated.valid) {
      return this.rejected(plan.operationId, plan.stage, revalidated.blockers);
    }
    await this.appendPhase(plan, 'validated', [request.backupReceipt.backupArtifactHash]);
    const originalEpochAlreadyPublished = existing.some(
      (receipt) => receipt.phase === 'original-epoch-published' && receipt.planHash === plan.planHash,
    );
    if (!originalEpochAlreadyPublished) {
      const publication = await this.options.continuityApplier!.publishOriginalEpoch(plan);
      await this.appendPhase(plan, 'original-epoch-published', publication.artifactHashes);
    }
    const transition = await this.options.continuityApplier!.transitionFrontier(plan);
    await this.appendPhase(plan, 'frontier-transitioned', transition.artifactHashes);
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      operationId: plan.operationId,
      stage: plan.stage,
      status: 'continuity-applied-restart-required',
      completedPhase: 'frontier-transitioned',
      restartRequired: true,
      blockers: [],
    };
  }

  private validateApplyRequest(request: BackendForeignEpochRecoveryApplyRequest): BackendForeignEpochRecoveryBlocker | null {
    if (!String(request.operationId || '').trim() || !isContentHash(request.planHash)) {
      return blocked('PLAN_STALE', 'Recovery apply operationId or planHash is invalid.');
    }
    const receipt = request.backupReceipt;
    if (
      !receipt
      || receipt.version !== FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION
      || receipt.planHash !== request.planHash
      || !String(receipt.receiptId || '').trim()
      || !isContentHash(receipt.backupArtifactHash)
      || !Number.isFinite(receipt.capturedAt)
      || !Number.isFinite(receipt.verifiedAt)
      || receipt.verifiedAt < receipt.capturedAt
    ) {
      return blocked('BACKUP_RECEIPT_REQUIRED', 'A verified backup receipt bound to the approved plan is required.');
    }
    return null;
  }

  private async appendPhase(
    plan: BackendForeignEpochRecoveryPlan,
    phase: BackendForeignEpochRecoveryPhase,
    artifactHashes: BackendRecoveryContentHash[],
  ): Promise<void> {
    const existing = await this.options.receiptStore.list(plan.operationId);
    if (existing.some((receipt) => receipt.phase === phase && receipt.planHash === plan.planHash)) return;
    const receipt: BackendForeignEpochRecoveryPhaseReceipt = {
      version: FOREIGN_EPOCH_RECOVERY_RECEIPT_VERSION,
      operationId: plan.operationId,
      planHash: plan.planHash,
      phase,
      evidenceHash: plan.evidenceHash,
      artifactHashes: [...artifactHashes],
      audit: this.createAuditSummary(plan),
      completedAt: this.now(),
    };
    await this.options.receiptStore.append(receipt);
  }

  private createAuditSummary(
    plan: BackendForeignEpochRecoveryPlan,
  ): BackendForeignEpochRecoveryAuditSummary | null {
    if (plan.stage === 'continuity') {
      return {
        originalIdentityEpoch: plan.continuityIntent.originalMutation.identityEpoch,
        currentIdentityEpoch: plan.continuityIntent.expectedCurrentIdentityEpoch,
        recoveredJournalSequence: plan.continuityIntent.originalMutation.journalSequence,
        expectedNextJournalSequence: plan.continuityIntent.expectedNextJournalSequenceAfterRecovery,
        authorityRevision: plan.continuityIntent.expectedAuthorityRevision,
      };
    }
    const originalEvidence = plan.authorityPublicationIntent.proof.provingEvidence.find(
      (evidence) => evidence.kind === 'journal-envelope' && evidence.identity?.identityEpoch,
    );
    const recoveredJournalSequence = originalEvidence?.journalSequence ?? null;
    if (!originalEvidence?.identity || recoveredJournalSequence === null) return null;
    return {
      originalIdentityEpoch: originalEvidence.identity.identityEpoch,
      currentIdentityEpoch: plan.authorityPublicationIntent.authority.identity.identityEpoch,
      recoveredJournalSequence,
      expectedNextJournalSequence: recoveredJournalSequence + 1,
      authorityRevision: plan.authorityPublicationIntent.authority.revision,
    };
  }

  private rejected(
    operationId: string,
    stage: BackendForeignEpochRecoveryPlan['stage'] | null,
    blockers: BackendForeignEpochRecoveryBlocker[],
  ): BackendForeignEpochRecoveryApplyResult {
    return {
      version: FOREIGN_EPOCH_RECOVERY_CONTRACT_VERSION,
      operationId: String(operationId || '').trim() || 'unknown-operation',
      stage: stage ?? 'authority-publication',
      status: 'rejected',
      completedPhase: null,
      restartRequired: false,
      blockers,
    };
  }
}
