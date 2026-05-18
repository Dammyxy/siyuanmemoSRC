import { recordRuntimePerformanceSpan } from '@/utils/runtimePerformanceDiagnostics';

export type CandidateBlockContext = {
  candidateId: string;
  blockId: string;
  txBatchId: string;
  actions: string[];
  enqueuedAt: number;
  opIds: string[];
  retryAttempt: number;
  followUpRequested?: boolean;
};

export type AutoCardCheckStatus = string;

export type AutoCardListenerBusinessIdentity = {
  key: string;
  sourceBlockId: string;
  symbolRangeFingerprint: string;
  resolvedCardType: 'topic' | 'item';
  envelopeKind: string;
  targetTopicContainerId: string | null;
  selectedDecisionId: string | null;
  enabledDecisionIds: string[];
  matchedRuleIds: string[];
};

export type ListenerCandidateLifecycleStatus =
  | 'accepted'
  | 'retry-scheduled'
  | 'created'
  | 'skipped'
  | 'retry-exhausted'
  | 'failed';

export interface AutoCardListenerCandidateDiagnostic {
  candidateId: string;
  blockId: string;
  status: ListenerCandidateLifecycleStatus;
  reason: string;
  terminal: boolean;
  txBatchId?: string;
  actions: string[];
  opIds: string[];
  attempt: number;
  delayMs?: number;
  runId?: string;
  businessIdentity?: AutoCardListenerBusinessIdentity;
  createdAt: number;
  updatedAt: number;
}

export interface AutoCardListenerCandidateRuntimeDependencies {
  settledEvaluationDelayMs: number;
  candidateRetryDelaysMs: number[];
  followUpEvaluationDelayMs: number;
  maxDiagnostics: number;
  nextCandidateId: () => string;
  evaluateCandidate: (blockId: string) => Promise<void>;
  clearEvaluationFingerprint: (blockId: string) => void;
  getBusinessIdentity: (blockId: string) => AutoCardListenerBusinessIdentity | null;
  clearBusinessIdentity: (blockId: string) => void;
  traceAutoCard: (event: string, payload: Record<string, unknown>) => void;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export class AutoCardListenerCandidateRuntime {
  private readonly candidateTimers = new Map<string, TimerHandle>();
  private readonly candidateContexts = new Map<string, CandidateBlockContext>();
  private readonly listenerCandidateDiagnostics = new Map<string, AutoCardListenerCandidateDiagnostic>();
  private readonly listenerCandidateDiagnosticOrder: string[] = [];

  constructor(private readonly deps: AutoCardListenerCandidateRuntimeDependencies) {}

  getPendingCandidateCount(): number {
    return this.candidateContexts.size;
  }

  getCandidateContext(blockId: string): CandidateBlockContext | null {
    return this.candidateContexts.get(blockId) ?? null;
  }

  getDiagnostics(): AutoCardListenerCandidateDiagnostic[] {
    return this.listenerCandidateDiagnosticOrder
      .map((candidateId) => this.listenerCandidateDiagnostics.get(candidateId))
      .filter((diagnostic): diagnostic is AutoCardListenerCandidateDiagnostic => Boolean(diagnostic))
      .map((diagnostic) => ({
        ...diagnostic,
        actions: [...diagnostic.actions],
        opIds: [...diagnostic.opIds],
        ...(diagnostic.businessIdentity ? {
          businessIdentity: {
            ...diagnostic.businessIdentity,
            enabledDecisionIds: [...diagnostic.businessIdentity.enabledDecisionIds],
            matchedRuleIds: [...diagnostic.businessIdentity.matchedRuleIds],
          },
        } : {}),
      }));
  }

  enqueueCandidateBlock(blockId: string, txBatchId: string, action: string, opId: string): CandidateBlockContext {
    const existingContext = this.candidateContexts.get(blockId);
    const enqueuedAt = Date.now();
    const nextContext: CandidateBlockContext = existingContext
      ? {
        ...existingContext,
        txBatchId,
        actions: [...existingContext.actions, action],
        opIds: [...existingContext.opIds, opId],
        enqueuedAt,
        retryAttempt: 0,
      }
      : {
        candidateId: this.deps.nextCandidateId(),
        blockId,
        txBatchId,
        actions: [action],
        enqueuedAt,
        opIds: [opId],
        retryAttempt: 0,
      };

    this.candidateContexts.set(blockId, nextContext);
    this.recordLifecycle(nextContext, 'accepted', action, {
      terminal: false,
    });

    this.deps.traceAutoCard('candidate.enqueue', {
      candidateId: nextContext.candidateId,
      blockId,
      txBatchId,
      action,
      opId,
      enqueueCount: nextContext.actions.length,
      delayMs: this.deps.settledEvaluationDelayMs,
    });
    this.scheduleCandidateTimer(blockId, this.deps.settledEvaluationDelayMs, 'settled-evaluation', nextContext);
    return nextContext;
  }

  cancelPendingCandidate(blockId: string, txBatchId: string, reason: string): void {
    const existingContext = this.candidateContexts.get(blockId);
    this.clearTimer(blockId);
    if (existingContext) {
      this.recordLifecycle(existingContext, 'skipped', reason, {
        terminal: true,
      });
    }
    this.candidateContexts.delete(blockId);
    this.deps.clearEvaluationFingerprint(blockId);

    this.deps.traceAutoCard('candidate.cancel', {
      blockId,
      txBatchId,
      reason,
    });
  }

  markAlreadyProcessing(blockId: string, runId: string): boolean {
    const candidateContext = this.candidateContexts.get(blockId);
    if (!candidateContext) {
      return false;
    }
    const nextContext: CandidateBlockContext = {
      ...candidateContext,
      followUpRequested: true,
    };
    this.candidateContexts.set(blockId, nextContext);
    this.recordLifecycle(nextContext, 'retry-scheduled', 'already-processing', {
      terminal: false,
      runId,
      delayMs: this.deps.followUpEvaluationDelayMs,
    });
    return true;
  }

  completeCandidateEvaluation(input: {
    blockId: string;
    initialContext: CandidateBlockContext | null;
    checkStatus: AutoCardCheckStatus;
    errorMessage: string | null;
    runId: string;
  }): { scheduledContinuation: boolean } {
    const currentContext = this.candidateContexts.get(input.blockId) ?? input.initialContext ?? null;
    let scheduledContinuation = false;
    if (currentContext) {
      if (!input.errorMessage && this.isTransientReadinessStatus(input.checkStatus)) {
        scheduledContinuation = this.scheduleRetryForTransientCandidate(input.blockId, input.checkStatus, currentContext);
        if (!scheduledContinuation) {
          this.recordLifecycle(currentContext, 'retry-exhausted', input.checkStatus, {
            terminal: true,
            runId: input.runId,
          });
        }
      } else if (!input.errorMessage && currentContext.followUpRequested) {
        scheduledContinuation = true;
        this.scheduleFollowUpCandidate(input.blockId, currentContext, 'already-processing-follow-up');
      } else {
        const terminalOutcome = this.toTerminalCandidateOutcome(input.checkStatus);
        this.recordLifecycle(currentContext, terminalOutcome.status, terminalOutcome.reason, {
          terminal: true,
          runId: input.runId,
        });
      }
    }
    if (!scheduledContinuation && !this.candidateTimers.has(input.blockId)) {
      this.candidateContexts.delete(input.blockId);
      this.deps.clearBusinessIdentity(input.blockId);
    }
    return { scheduledContinuation };
  }

  dispose(): void {
    for (const timer of this.candidateTimers.values()) {
      clearTimeout(timer);
    }
    this.candidateTimers.clear();
    this.candidateContexts.clear();
    this.listenerCandidateDiagnostics.clear();
    this.listenerCandidateDiagnosticOrder.length = 0;
  }

  private recordLifecycle(
    context: CandidateBlockContext,
    status: ListenerCandidateLifecycleStatus,
    reason: string,
    options: {
      terminal?: boolean;
      delayMs?: number;
      runId?: string | null;
      attempt?: number;
    } = {},
  ): void {
    const now = Date.now();
    const existing = this.listenerCandidateDiagnostics.get(context.candidateId);
    if (!existing) {
      this.listenerCandidateDiagnosticOrder.push(context.candidateId);
    }
    const terminal = options.terminal ?? (
      status === 'created'
      || status === 'skipped'
      || status === 'retry-exhausted'
      || status === 'failed'
    );
    const businessIdentity = this.deps.getBusinessIdentity(context.blockId);
    this.listenerCandidateDiagnostics.set(context.candidateId, {
      candidateId: context.candidateId,
      blockId: context.blockId,
      status,
      reason,
      terminal,
      txBatchId: context.txBatchId,
      actions: [...context.actions],
      opIds: [...context.opIds],
      attempt: options.attempt ?? context.retryAttempt,
      ...(typeof options.delayMs === 'number' ? { delayMs: options.delayMs } : {}),
      ...(options.runId ? { runId: options.runId } : {}),
      ...(businessIdentity ? { businessIdentity } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    this.trimDiagnostics();
    this.deps.traceAutoCard('candidate.lifecycle', {
      candidateId: context.candidateId,
      blockId: context.blockId,
      status,
      reason,
      terminal,
      attempt: options.attempt ?? context.retryAttempt,
      delayMs: options.delayMs ?? null,
      txBatchId: context.txBatchId,
      businessIdentityKey: businessIdentity?.key ?? null,
    });
  }

  private trimDiagnostics(): void {
    while (this.listenerCandidateDiagnosticOrder.length > this.deps.maxDiagnostics) {
      const candidateId = this.listenerCandidateDiagnosticOrder.shift();
      if (candidateId) {
        this.listenerCandidateDiagnostics.delete(candidateId);
      }
    }
  }

  private scheduleCandidateTimer(
    blockId: string,
    delayMs: number,
    reason: string,
    context: CandidateBlockContext,
  ): void {
    this.clearTimer(blockId);
    const timer = setTimeout(() => {
      recordRuntimePerformanceSpan(
        'autocard',
        'candidate.settle-latency',
        Date.now() - context.enqueuedAt,
        {
          actionCount: context.actions.length,
          delayMs,
          txBatchId: context.txBatchId,
          reason,
          retryAttempt: context.retryAttempt,
        },
      );
      this.candidateTimers.delete(blockId);
      void this.deps.evaluateCandidate(blockId);
    }, delayMs);

    this.candidateTimers.set(blockId, timer);
  }

  private clearTimer(blockId: string): void {
    const existingTimer = this.candidateTimers.get(blockId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.candidateTimers.delete(blockId);
    }
  }

  private isTransientReadinessStatus(status: AutoCardCheckStatus): boolean {
    return status === 'empty-content' || status === 'missing-block';
  }

  private toTerminalCandidateOutcome(status: AutoCardCheckStatus): {
    status: ListenerCandidateLifecycleStatus;
    reason: string;
  } {
    if (status === 'executed-planner-decision' || status === 'executed-topic-derived') {
      return { status: 'created', reason: status };
    }
    if (status === 'error') {
      return { status: 'failed', reason: status };
    }
    if (status === 'skip-in-flight-duplicate') {
      return { status: 'skipped', reason: 'in-flight duplicate skipped' };
    }
    return { status: 'skipped', reason: status || 'unknown' };
  }

  private scheduleRetryForTransientCandidate(
    blockId: string,
    reason: AutoCardCheckStatus,
    context: CandidateBlockContext,
  ): boolean {
    const nextAttempt = context.retryAttempt + 1;
    if (nextAttempt > this.deps.candidateRetryDelaysMs.length) {
      return false;
    }
    const delayMs = this.deps.candidateRetryDelaysMs[nextAttempt - 1]
      ?? this.deps.candidateRetryDelaysMs[this.deps.candidateRetryDelaysMs.length - 1];
    const nextContext: CandidateBlockContext = {
      ...context,
      retryAttempt: nextAttempt,
      followUpRequested: false,
      enqueuedAt: Date.now(),
    };
    this.candidateContexts.set(blockId, nextContext);
    this.recordLifecycle(nextContext, 'retry-scheduled', reason, {
      terminal: false,
      delayMs,
      attempt: nextAttempt,
    });
    this.scheduleCandidateTimer(blockId, delayMs, 'transient-retry', nextContext);
    return true;
  }

  private scheduleFollowUpCandidate(
    blockId: string,
    context: CandidateBlockContext,
    reason: string,
  ): void {
    const nextContext: CandidateBlockContext = {
      ...context,
      retryAttempt: 0,
      followUpRequested: false,
      enqueuedAt: Date.now(),
    };
    this.candidateContexts.set(blockId, nextContext);
    this.recordLifecycle(nextContext, 'retry-scheduled', reason, {
      terminal: false,
      delayMs: this.deps.followUpEvaluationDelayMs,
    });
    this.scheduleCandidateTimer(blockId, this.deps.followUpEvaluationDelayMs, reason, nextContext);
  }
}
