import type { BackendIntegrationClientFacet } from '@/application/clients/backend';
import { createLogger } from '@/utils/logger';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';
import type { KernelTransactionWriterUnavailableDetail } from '@/application/handlers/KernelTransactionWriterUnavailableEvent';
import {
  KernelCompanionBackgroundWorkRegistry,
  type KernelCompanionBackgroundWorkHandlerResult,
  type KernelCompanionBackgroundWorkRegistryInterface,
  type KernelCompanionBackgroundWorkRunContext,
  type KernelCompanionTransactionActionPollingDiagnostics,
} from '@/application/backgroundWork/KernelCompanionBackgroundWorkRegistry';

const logger = createLogger('KernelTransactionActionPump');

type FrontendRuntimeLike = {
  getMode: () => 'writer' | 'follower';
  getInstanceId: () => string;
  ensureWritable?: () => Promise<void>;
};

type FollowerCommandClientLike = {
  submitAndWait: <TResult>(request: {
    instanceId: string;
    method: string;
    params?: unknown;
  }, timeoutMs?: number) => Promise<TResult>;
};

type AutoCardHandlerLike = {
  handle: (transactions: Array<{
    doOperations: Array<{
      action: string;
      id: string;
    }>;
    undoOperations: null;
  }>) => void;
};

interface KernelTransactionActionPumpOptions {
  pollIntervalMs?: number;
  maxActionsPerPoll?: number;
  relayTimeoutMs?: number;
  autoCardCooldownMs?: number;
  emptyPollBackoffMaxMs?: number;
  writerRelayRequired?: boolean;
  onWriterUnavailable?: (detail: KernelTransactionWriterUnavailableDetail) => void;
  backgroundWorkRegistry?: KernelCompanionBackgroundWorkRegistryInterface | null;
}

type AutoCardActionType = 'insert' | 'update' | 'delete';

function coalesceAutoCardOperations(
  operations: Array<{ action: AutoCardActionType; blockId: string }>,
): Array<{ action: AutoCardActionType; blockId: string }> {
  const byBlockId = new Map<string, AutoCardActionType | null>();
  for (const operation of operations) {
    const action = String(operation.action || '').trim() as AutoCardActionType;
    const blockId = String(operation.blockId || '').trim();
    if (!blockId || (action !== 'insert' && action !== 'update' && action !== 'delete')) {
      continue;
    }
    const current = byBlockId.get(blockId) ?? null;
    if (action === 'delete') {
      byBlockId.set(blockId, current === 'insert' ? null : 'delete');
      continue;
    }
    if (action === 'insert') {
      byBlockId.set(blockId, 'insert');
      continue;
    }
    if (current === null) {
      byBlockId.set(blockId, 'update');
    }
  }
  const normalized: Array<{ action: AutoCardActionType; blockId: string }> = [];
  for (const [blockId, action] of byBlockId.entries()) {
    if (!action) {
      continue;
    }
    normalized.push({ action, blockId });
  }
  return normalized;
}

export class KernelTransactionActionPump {
  private readonly pollIntervalMs: number;
  private readonly maxActionsPerPoll: number;
  private readonly relayTimeoutMs: number;
  private readonly autoCardCooldownMs: number;
  private readonly emptyPollBackoffMaxMs: number;
  private readonly writerRelayRequired: boolean;
  private readonly onWriterUnavailable?: (detail: KernelTransactionWriterUnavailableDetail) => void;
  private readonly backgroundWorkRegistry: KernelCompanionBackgroundWorkRegistryInterface;
  private nextPollTimer: ReturnType<typeof setTimeout> | null = null;
  private activePollingJobId: string | null = null;
  private pollingStarted = false;
  private pollingInFlight = false;
  private lastPollingDiagnostics: KernelCompanionTransactionActionPollingDiagnostics = {};
  private emptyPollStreak = 0;
  private nextEmptyPollAllowedAt = 0;
  private noWriterUnavailableStreak = 0;
  private nextNoWriterUnavailablePollAllowedAt = 0;
  private backendHealthUnavailableStreak = 0;
  private nextBackendHealthUnavailablePollAllowedAt = 0;
  private readonly pendingAutoCardOpsByBlock = new Map<string, AutoCardActionType | null>();
  private nextAutoCardAt = 0;
  private disposed = false;

  constructor(
    private readonly srsBackendClient: Pick<BackendIntegrationClientFacet, 'dequeueKernelTransactions' | 'requeueKernelTransactions'>,
    private readonly runtime: FrontendRuntimeLike | null,
    private readonly followerCommandClient: FollowerCommandClientLike | null,
    private readonly getAutoCardHandler: () => AutoCardHandlerLike | undefined,
    options: KernelTransactionActionPumpOptions = {},
  ) {
    this.pollIntervalMs = Math.max(200, Math.floor(options.pollIntervalMs ?? 1_000));
    this.maxActionsPerPoll = Math.max(1, Math.floor(options.maxActionsPerPoll ?? 8));
    this.relayTimeoutMs = Math.max(1_000, Math.floor(options.relayTimeoutMs ?? 15_000));
    this.autoCardCooldownMs = Math.max(250, Math.floor(options.autoCardCooldownMs ?? 1_000));
    this.emptyPollBackoffMaxMs = Math.max(this.pollIntervalMs, Math.floor(options.emptyPollBackoffMaxMs ?? 2_000));
    this.writerRelayRequired = options.writerRelayRequired === true;
    this.onWriterUnavailable = options.onWriterUnavailable;
    this.backgroundWorkRegistry = options.backgroundWorkRegistry ?? new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => run(),
    });
  }

  start(): void {
    if (this.disposed || this.pollingStarted) {
      return;
    }
    incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-started');
    this.pollingStarted = true;
    this.scheduleNextPoll(this.pollIntervalMs);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.pollingStarted = false;
    this.clearNextPollTimer();
    if (this.activePollingJobId) {
      this.backgroundWorkRegistry.cancel(this.activePollingJobId, 'action-pump-dispose');
      this.activePollingJobId = null;
    }
  }

  notifyActivity(reason = 'external'): void {
    if (this.disposed) {
      return;
    }
    incrementRuntimePerformanceCounter('daily-editing', `kernel-action-pump-wake-${reason}`);
    if (!this.pollingStarted || this.activePollingJobId || this.pollingInFlight) {
      return;
    }
    if (this.shouldSkipForNoWriterUnavailableBackoff()) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-wake-bounded-by-no-writer-backoff');
      return;
    }
    if (this.shouldSkipForBackendHealthUnavailableBackoff()) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-wake-bounded-by-backend-health-backoff');
      return;
    }
    if (this.shouldSkipForEmptyPollBackoff()) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-wake-bounded-by-empty-backoff');
      return;
    }
    this.resetEmptyPollBackoff();
    this.clearNextPollTimer();
    this.submitPollingJob(`wake-${reason}`);
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.disposed || !this.pollingStarted || this.activePollingJobId || this.nextPollTimer) {
      return;
    }
    this.nextPollTimer = setTimeout(() => {
      this.nextPollTimer = null;
      this.submitPollingJob('timer');
    }, Math.max(0, Math.floor(delayMs)));
  }

  private clearNextPollTimer(): void {
    if (!this.nextPollTimer) {
      return;
    }
    clearTimeout(this.nextPollTimer);
    this.nextPollTimer = null;
  }

  private submitPollingJob(reason: string): void {
    if (this.disposed || !this.pollingStarted || this.activePollingJobId) {
      return;
    }
    const result = this.backgroundWorkRegistry.submit<KernelCompanionTransactionActionPollingDiagnostics>({
      kind: 'kernel-transaction-action-polling',
      diagnostics: {
        reason,
        mode: this.runtime?.getMode?.() ?? 'none',
        writerRelayRequired: this.writerRelayRequired,
        maxActionsPerPoll: this.maxActionsPerPoll,
      },
      run: (context) => this.runPollingJob(context, reason),
    });
    if (!result.accepted) {
      this.lastPollingDiagnostics = {
        reason,
        status: 'registry-unavailable',
        unavailable: true,
      };
      return;
    }
    this.activePollingJobId = result.job.jobId;
  }

  private async runPollingJob(
    context: KernelCompanionBackgroundWorkRunContext,
    reason: string,
  ): Promise<KernelCompanionBackgroundWorkHandlerResult<KernelCompanionTransactionActionPollingDiagnostics>> {
    try {
      await this.pollOnce(context);
      if (this.isPollingCanceled(context)) {
        return {
          state: 'canceled',
          reason: this.disposed ? 'action-pump-dispose' : 'action-pump-canceled',
          diagnostics: {
            ...this.lastPollingDiagnostics,
            reason,
            status: this.lastPollingDiagnostics.status ?? 'canceled',
          },
        };
      }
      return {
        diagnostics: {
          ...this.lastPollingDiagnostics,
          reason,
        },
      };
    } finally {
      if (this.activePollingJobId === context.jobId) {
        this.activePollingJobId = null;
      }
      if (!this.isPollingCanceled(context)) {
        this.scheduleNextPoll(this.pollIntervalMs);
      }
    }
  }

  private isPollingCanceled(context?: KernelCompanionBackgroundWorkRunContext): boolean {
    return this.disposed || context?.isCanceled() === true;
  }

  private async pollOnce(context?: KernelCompanionBackgroundWorkRunContext): Promise<void> {
    if (this.isPollingCanceled(context)) {
      this.lastPollingDiagnostics = { status: 'canceled' };
      return;
    }
    if (this.shouldSkipForNoWriterUnavailableBackoff()) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-no-writer-backoff-skips');
      this.lastPollingDiagnostics = { status: 'skipped-no-writer-backoff' };
      return;
    }
    if (this.shouldSkipForBackendHealthUnavailableBackoff()) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-backend-health-backoff-skips');
      this.lastPollingDiagnostics = { status: 'skipped-backend-health-backoff' };
      return;
    }
    if (this.shouldSkipForEmptyPollBackoff()) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-empty-backoff-skips');
      this.lastPollingDiagnostics = { status: 'skipped-empty-backoff' };
      return;
    }
    const finishPollSpan = startRuntimePerformanceSpan('daily-editing', 'kernel-action-pump.poll-once', {
      mode: this.runtime?.getMode?.() ?? 'none',
      writerRelayRequired: this.writerRelayRequired,
    });
    let actionCount = 0;
    let remainingActions: number | undefined;
    let pollStatus = 'started';
    if (this.pollingInFlight) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-skipped-inflight');
      finishPollSpan({ status: 'skipped-inflight' });
      this.lastPollingDiagnostics = { status: 'skipped-inflight' };
      return;
    }
    this.pollingInFlight = true;
    try {
      const result = await this.dequeueActions();
      remainingActions = result.remaining;
      if (this.isPollingCanceled(context)) {
        pollStatus = 'canceled';
        return;
      }
      this.resetNoWriterUnavailableBackoff();
      this.resetBackendHealthUnavailableBackoff();
      const actions = result.actions || [];
      actionCount = actions.length;
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-actions-dequeued', actions.length);
      if (actions.length === 0) {
        if (!this.isPollingCanceled(context)) {
          this.maybeRunDeferredAutoCard();
        }
        pollStatus = 'empty';
        return;
      }
      this.resetEmptyPollBackoff();
      const autoCardOperations: Array<{ action: AutoCardActionType; blockId: string }> = [];
      for (const action of actions) {
        if (action.type === 'auto-card-candidates') {
          for (const operation of action.operations || []) {
            const actionType = String(operation.action || '').trim();
            const blockId = String(operation.blockId || '').trim();
            if (!blockId) {
              continue;
            }
            if (actionType === 'insert' || actionType === 'update' || actionType === 'delete') {
              autoCardOperations.push({
                action: actionType,
                blockId,
              });
            }
          }
        }
      }
      try {
        if (this.isPollingCanceled(context)) {
          return;
        }

        measureRuntimePerformance(
          'daily-editing',
          'kernel-action-pump.buffer-autocard-operations',
          () => this.bufferAutoCardOperations(autoCardOperations),
          { operationCount: autoCardOperations.length },
        );
        if (!this.isPollingCanceled(context)) {
          this.maybeRunDeferredAutoCard();
        }
      } catch (error) {
        if (this.isPollingCanceled(context)) {
          return;
        }
        await this.requeueActions(actions, error);
        throw error;
      }
    } catch (error) {
      if (this.isPollingCanceled(context)) {
        pollStatus = 'canceled';
        return;
      }
      pollStatus = 'error';
      this.resetEmptyPollBackoff();
      if (this.recordFollowerWriterLeaseContentionBackoff(error)) {
        incrementRuntimePerformanceCounter('daily-editing', 'kernel-action-pump-follower-writer-lease-contention-skips');
      } else if (this.recordNoWriterUnavailableBackoff(error)) {
        logger.warn('Kernel transaction action polling failed', {
          message: error instanceof Error ? error.message : String(error || ''),
        });
      } else if (this.recordBackendHealthUnavailableBackoff(error)) {
        logger.warn('Kernel transaction action polling failed', {
          message: error instanceof Error ? error.message : String(error || ''),
        });
      } else {
        logger.warn('Kernel transaction action polling failed', {
          message: error instanceof Error ? error.message : String(error || ''),
        });
      }
    } finally {
      this.pollingInFlight = false;
      if (pollStatus === 'empty') {
        this.recordEmptyPollBackoff();
      }
      finishPollSpan({
        status: pollStatus,
        actionCount,
        remainingActions,
        pendingAutoCardBlocks: this.pendingAutoCardOpsByBlock.size,
        emptyPollStreak: this.emptyPollStreak,
      });
      this.lastPollingDiagnostics = {
        status: pollStatus,
        actionCount,
        ...(typeof remainingActions === 'number' ? { remainingActions } : {}),
        pendingAutoCardBlocks: this.pendingAutoCardOpsByBlock.size,
        emptyPollStreak: this.emptyPollStreak,
      };
    }
  }

  private shouldSkipForEmptyPollBackoff(): boolean {
    if (this.hasPendingFollowUpWork()) {
      return false;
    }
    return Date.now() < this.nextEmptyPollAllowedAt;
  }

  private recordEmptyPollBackoff(): void {
    if (this.hasPendingFollowUpWork()) {
      this.resetEmptyPollBackoff();
      return;
    }
    this.emptyPollStreak += 1;
    const delayMs = Math.min(
      this.emptyPollBackoffMaxMs,
      this.pollIntervalMs * (2 ** this.emptyPollStreak),
    );
    this.nextEmptyPollAllowedAt = Date.now() + delayMs;
  }

  private resetEmptyPollBackoff(): void {
    this.emptyPollStreak = 0;
    this.nextEmptyPollAllowedAt = 0;
  }

  private shouldSkipForNoWriterUnavailableBackoff(): boolean {
    return Date.now() < this.nextNoWriterUnavailablePollAllowedAt;
  }

  private shouldSkipForBackendHealthUnavailableBackoff(): boolean {
    return Date.now() < this.nextBackendHealthUnavailablePollAllowedAt;
  }

  private recordNoWriterUnavailableBackoff(error: unknown): boolean {
    if (!this.isNoActiveWriterRelayUnavailableError(error)) {
      this.resetNoWriterUnavailableBackoff();
      return false;
    }
    this.noWriterUnavailableStreak += 1;
    const delayMs = Math.min(
      this.emptyPollBackoffMaxMs,
      this.pollIntervalMs * (2 ** this.noWriterUnavailableStreak),
    );
    this.nextNoWriterUnavailablePollAllowedAt = Date.now() + delayMs;
    return true;
  }

  private recordBackendHealthUnavailableBackoff(error: unknown): boolean {
    if (!this.isBackendHealthUnavailableError(error)) {
      this.resetBackendHealthUnavailableBackoff();
      return false;
    }
    this.backendHealthUnavailableStreak += 1;
    const delayMs = Math.min(
      this.emptyPollBackoffMaxMs,
      this.pollIntervalMs * (2 ** this.backendHealthUnavailableStreak),
    );
    this.nextBackendHealthUnavailablePollAllowedAt = Date.now() + delayMs;
    return true;
  }

  private recordFollowerWriterLeaseContentionBackoff(error: unknown): boolean {
    if (!this.isFollowerWriterLeaseContentionError(error)) {
      return false;
    }
    this.noWriterUnavailableStreak += 1;
    const delayMs = Math.min(
      this.emptyPollBackoffMaxMs,
      this.pollIntervalMs * (2 ** this.noWriterUnavailableStreak),
    );
    this.nextNoWriterUnavailablePollAllowedAt = Date.now() + delayMs;
    return true;
  }

  private resetNoWriterUnavailableBackoff(): void {
    this.noWriterUnavailableStreak = 0;
    this.nextNoWriterUnavailablePollAllowedAt = 0;
  }

  private resetBackendHealthUnavailableBackoff(): void {
    this.backendHealthUnavailableStreak = 0;
    this.nextBackendHealthUnavailablePollAllowedAt = 0;
  }

  private hasPendingFollowUpWork(): boolean {
    return this.pendingAutoCardOpsByBlock.size > 0;
  }

  private bufferAutoCardOperations(
    operations: Array<{ action: AutoCardActionType; blockId: string }>,
  ): void {
    const coalesced = coalesceAutoCardOperations(operations);
    for (const operation of coalesced) {
      const blockId = String(operation.blockId || '').trim();
      if (!blockId) {
        continue;
      }
      const current = this.pendingAutoCardOpsByBlock.get(blockId) ?? null;
      const nextAction = operation.action;
      if (nextAction === 'delete') {
        this.pendingAutoCardOpsByBlock.set(blockId, current === 'insert' ? null : 'delete');
        continue;
      }
      if (nextAction === 'insert') {
        this.pendingAutoCardOpsByBlock.set(blockId, 'insert');
        continue;
      }
      if (current === null) {
        this.pendingAutoCardOpsByBlock.set(blockId, 'update');
      }
    }
  }

  private maybeRunDeferredAutoCard(): void {
    if (this.pendingAutoCardOpsByBlock.size === 0) {
      return;
    }
    const now = Date.now();
    if (now < this.nextAutoCardAt) {
      return;
    }
    const operations: Array<{ action: AutoCardActionType; blockId: string }> = [];
    for (const [blockId, action] of this.pendingAutoCardOpsByBlock.entries()) {
      if (!action) {
        continue;
      }
      operations.push({ action, blockId });
    }
    if (operations.length === 0) {
      this.pendingAutoCardOpsByBlock.clear();
      this.nextAutoCardAt = now + this.autoCardCooldownMs;
      return;
    }

    const autoCardHandler = this.getAutoCardHandler();
    if (!autoCardHandler) {
      logger.debug('Drop auto-card-candidates action because AutoCardHandler is unavailable', {
        operations: operations.length,
      });
      this.pendingAutoCardOpsByBlock.clear();
      this.nextAutoCardAt = now + this.autoCardCooldownMs;
      return;
    }

    measureRuntimePerformance('autocard', 'kernel-action-pump.autocard-handler-handoff', () => {
      autoCardHandler.handle([{
        doOperations: operations.map((operation) => ({
          action: operation.action,
          id: operation.blockId,
        })),
        undoOperations: null,
      }]);
    }, { operationCount: operations.length });
    this.pendingAutoCardOpsByBlock.clear();
    this.nextAutoCardAt = now + this.autoCardCooldownMs;
  }

  private async dequeueActions(): Promise<{
    actions: Array<{
      type: 'auto-card-candidates';
      operations?: Array<{
        action: 'insert' | 'update' | 'delete';
        blockId: string;
      }>;
      source: 'kernel-sidecar' | 'ws-main';
      receivedAt: number;
      idempotencyKey: string;
    }>;
    remaining: number;
  }> {
    if (this.writerRelayRequired && !this.runtime) {
      throw new Error('BACKEND_UNAVAILABLE: kernel.transaction.dequeue requires writer relay runtime');
    }
    const params = { maxActions: this.maxActionsPerPoll };
    if (this.runtime && this.runtime.getMode() !== 'writer') {
      if (!this.followerCommandClient) {
        throw new Error('BACKEND_UNAVAILABLE: kernel.transaction.dequeue relay is unavailable in follower mode');
      }
      try {
        return await measureRuntimePerformance('daily-editing', 'kernel-action-pump.dequeue-relay', () => this.followerCommandClient!.submitAndWait(
          {
            instanceId: this.runtime.getInstanceId(),
            method: 'kernel.transaction.dequeue',
            params,
          },
          this.relayTimeoutMs,
        ), { maxActions: this.maxActionsPerPoll });
      } catch (error) {
        if (this.isSelfRelaySubmissionError(error)) {
          await this.refreshStaleWriterModeAfterSelfRelay();
        } else if (await this.tryRecoverNoActiveWriterDequeue(error)) {
          // Runtime recovered writer ownership; fall through to local writer dequeue.
        } else {
          this.reportDequeueWriterUnavailable(error);
          throw error;
        }
      }
    }
    return measureRuntimePerformance(
      'daily-editing',
      'kernel-action-pump.dequeue-local',
      () => this.srsBackendClient.dequeueKernelTransactions(params),
      { maxActions: this.maxActionsPerPoll },
    );
  }

  private reportDequeueWriterUnavailable(error: unknown): void {
    if (!this.onWriterUnavailable || !this.isWriterUnavailableError(error)) {
      return;
    }
    const instanceId = this.runtime?.getInstanceId?.();
    this.onWriterUnavailable({
      method: 'kernel.transaction.dequeue',
      message: error instanceof Error ? error.message : String(error || ''),
      runtimeMode: this.runtime?.getMode?.() ?? 'none',
      ...(instanceId ? { instanceId } : {}),
      ...this.readRelayErrorDiagnostics(error),
      occurredAt: Date.now(),
    });
  }

  private isWriterUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.startsWith('BACKEND_UNAVAILABLE:')
      && (
        message.includes('writer relay timeout')
        || message.includes('writer relay unavailable')
        || message.includes('writer unavailable')
        || message.includes('writer command unavailable')
        || message.includes('writer lease')
      );
  }

  private isBackendHealthUnavailableError(error: unknown): boolean {
    if (this.isNoActiveWriterRelayUnavailableError(error) || this.isWriterUnavailableError(error)) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error || '');
    return message.startsWith('BACKEND_UNAVAILABLE:')
      || /timeout/i.test(message);
  }

  private async tryRecoverNoActiveWriterDequeue(error: unknown): Promise<boolean> {
    if (!this.isNoActiveWriterRelayUnavailableError(error) || typeof this.runtime?.ensureWritable !== 'function') {
      return false;
    }
    try {
      await this.runtime.ensureWritable();
    } catch (recoveryError) {
      this.markNoActiveWriterRelayUnavailable(recoveryError);
      this.reportDequeueWriterUnavailable(recoveryError);
      throw recoveryError;
    }
    return this.runtime?.getMode?.() === 'writer';
  }

  private isNoActiveWriterRelayUnavailableError(error: unknown): boolean {
    if (error && typeof error === 'object' && (error as { noActiveWriterRelay?: unknown }).noActiveWriterRelay === true) {
      return true;
    }
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('writer command unavailable: no active writer lease');
  }

  private isFollowerWriterLeaseContentionError(error: unknown): boolean {
    if (this.runtime?.getMode?.() === 'writer') {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error || '');
    return message.startsWith('BACKEND_UNAVAILABLE:')
      && message.includes('writer lease held by another instance');
  }

  private markNoActiveWriterRelayUnavailable(error: unknown): void {
    if (!error || typeof error !== 'object') {
      return;
    }
    try {
      Object.defineProperty(error, 'noActiveWriterRelay', {
        value: true,
        configurable: true,
      });
    } catch {
      // Diagnostic marker only; keep the original explicit unavailable error.
    }
  }

  private readRelayErrorDiagnostics(error: unknown): Partial<KernelTransactionWriterUnavailableDetail> {
    if (!error || typeof error !== 'object') {
      return {};
    }
    const record = error as { commandId?: unknown; timeoutMs?: unknown };
    return {
      ...(typeof record.commandId === 'string' && record.commandId.trim() ? { commandId: record.commandId.trim() } : {}),
      ...(typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs) ? { timeoutMs: record.timeoutMs } : {}),
    };
  }

  private async requeueActions(
    actions: Array<{
      type: 'auto-card-candidates';
      operations?: Array<{
        action: 'insert' | 'update' | 'delete';
        blockId: string;
      }>;
      source: 'kernel-sidecar' | 'ws-main';
      receivedAt: number;
      idempotencyKey: string;
    }>,
    error: unknown,
  ): Promise<void> {
    try {
      if (this.writerRelayRequired && !this.runtime) {
        throw new Error('BACKEND_UNAVAILABLE: kernel.transaction.requeue requires writer relay runtime');
      }
      if (this.runtime && this.runtime.getMode() !== 'writer') {
        if (!this.followerCommandClient) {
          throw new Error('BACKEND_UNAVAILABLE: kernel.transaction.requeue relay is unavailable in follower mode');
        }
        try {
          await measureRuntimePerformance('daily-editing', 'kernel-action-pump.requeue-relay', () => this.followerCommandClient!.submitAndWait(
            {
              instanceId: this.runtime.getInstanceId(),
              method: 'kernel.transaction.requeue',
              params: { actions },
            },
            this.relayTimeoutMs,
          ), { actionCount: actions.length });
        } catch (error) {
          if (!this.isSelfRelaySubmissionError(error)) {
            throw error;
          }
          await this.refreshStaleWriterModeAfterSelfRelay();
          await this.srsBackendClient.requeueKernelTransactions({ actions });
        }
        return;
      }
      await measureRuntimePerformance(
        'daily-editing',
        'kernel-action-pump.requeue-local',
        () => this.srsBackendClient.requeueKernelTransactions({ actions }),
        { actionCount: actions.length },
      );
    } catch (requeueError) {
      logger.warn('Failed to requeue kernel transaction actions after processing error', {
        message: requeueError instanceof Error ? requeueError.message : String(requeueError || ''),
        originalError: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private isSelfRelaySubmissionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return message.includes('INVALID_REQUEST: writer instance should execute command locally instead of submitCommand');
  }

  private async refreshStaleWriterModeAfterSelfRelay(): Promise<void> {
    if (typeof this.runtime?.ensureWritable !== 'function') {
      return;
    }
    try {
      await this.runtime.ensureWritable();
    } catch {
      // The kernel submitCommand rejection already proved this instance owns the active lease.
      // Keep processing local so action polling does not stall on a stale frontend mode flag.
    }
  }
}
