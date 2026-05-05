import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import { createLogger } from '@/utils/logger';

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

type HybridSyncServiceLike = {
  handleNativeRiffUpsert?: () => Promise<unknown>;
  incrementalSync?: (_onProgress?: unknown, _options?: { source?: string; persistIdleCheckpoint?: boolean }) => Promise<unknown>;
  handleNativeRiffRemove?: (blockIds: string[]) => Promise<unknown>;
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
  upsertCooldownMs?: number;
  autoCardCooldownMs?: number;
  writerRelayRequired?: boolean;
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
  private readonly upsertCooldownMs: number;
  private readonly autoCardCooldownMs: number;
  private readonly writerRelayRequired: boolean;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private pollingInFlight = false;
  private pendingUpsert = false;
  private nextUpsertAt = 0;
  private readonly pendingAutoCardOpsByBlock = new Map<string, AutoCardActionType | null>();
  private nextAutoCardAt = 0;

  constructor(
    private readonly srsBackendClient: Pick<SrsBackendClient, 'dequeueKernelTransactions' | 'requeueKernelTransactions'>,
    private readonly runtime: FrontendRuntimeLike | null,
    private readonly followerCommandClient: FollowerCommandClientLike | null,
    private readonly getHybridSyncService: () => HybridSyncServiceLike | undefined,
    private readonly getAutoCardHandler: () => AutoCardHandlerLike | undefined,
    options: KernelTransactionActionPumpOptions = {},
  ) {
    this.pollIntervalMs = Math.max(200, Math.floor(options.pollIntervalMs ?? 1_000));
    this.maxActionsPerPoll = Math.max(1, Math.floor(options.maxActionsPerPoll ?? 8));
    this.relayTimeoutMs = Math.max(1_000, Math.floor(options.relayTimeoutMs ?? 15_000));
    this.upsertCooldownMs = Math.max(250, Math.floor(options.upsertCooldownMs ?? 1_500));
    this.autoCardCooldownMs = Math.max(250, Math.floor(options.autoCardCooldownMs ?? 1_000));
    this.writerRelayRequired = options.writerRelayRequired === true;
  }

  start(): void {
    if (this.pollingTimer) {
      return;
    }
    this.pollingTimer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  async dispose(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.pollingInFlight) {
      return;
    }
    this.pollingInFlight = true;
    try {
      const result = await this.dequeueActions();
      const actions = result.actions || [];
      if (actions.length === 0) {
        await this.maybeRunDeferredUpsert();
        this.maybeRunDeferredAutoCard();
        return;
      }
      const hybridSyncService = this.getHybridSyncService();
      const removeBlockIds = new Set<string>();
      const autoCardOperations: Array<{ action: AutoCardActionType; blockId: string }> = [];
      let sawUpsertAction = false;
      for (const action of actions) {
        if (action.type === 'native-riff-upsert') {
          sawUpsertAction = true;
        } else if (action.type === 'native-riff-remove') {
          for (const blockId of action.blockIds || []) {
            const normalized = String(blockId || '').trim();
            if (normalized) {
              removeBlockIds.add(normalized);
            }
          }
        } else if (action.type === 'auto-card-candidates') {
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
        if (sawUpsertAction) {
          this.pendingUpsert = true;
        }

        if (removeBlockIds.size > 0) {
          if (typeof hybridSyncService?.handleNativeRiffRemove !== 'function') {
            logger.warn('Skip native-riff-remove action because hybrid sync service is unavailable', {
              blockIds: Array.from(removeBlockIds),
            });
          } else {
            await hybridSyncService.handleNativeRiffRemove(Array.from(removeBlockIds));
          }
        }

        await this.maybeRunDeferredUpsert();

        this.bufferAutoCardOperations(autoCardOperations);
        this.maybeRunDeferredAutoCard();
      } catch (error) {
        await this.requeueActions(actions, error);
        throw error;
      }
    } catch (error) {
      logger.warn('Kernel transaction action polling failed', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    } finally {
      this.pollingInFlight = false;
    }
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
      logger.warn('Skip auto-card-candidates action because AutoCardHandler is unavailable', {
        operations: operations.length,
      });
      this.nextAutoCardAt = now + this.autoCardCooldownMs;
      return;
    }

    autoCardHandler.handle([{
      doOperations: operations.map((operation) => ({
        action: operation.action,
        id: operation.blockId,
      })),
      undoOperations: null,
    }]);
    this.pendingAutoCardOpsByBlock.clear();
    this.nextAutoCardAt = now + this.autoCardCooldownMs;
  }

  private async dequeueActions(): Promise<{
    actions: Array<{
      type: 'native-riff-remove' | 'native-riff-upsert' | 'auto-card-candidates';
      blockIds?: string[];
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
        return await this.followerCommandClient.submitAndWait(
          {
            instanceId: this.runtime.getInstanceId(),
            method: 'kernel.transaction.dequeue',
            params,
          },
          this.relayTimeoutMs,
        );
      } catch (error) {
        if (!this.isSelfRelaySubmissionError(error)) {
          throw error;
        }
        await this.refreshStaleWriterModeAfterSelfRelay();
      }
    }
    return this.srsBackendClient.dequeueKernelTransactions(params);
  }

  private async maybeRunDeferredUpsert(): Promise<void> {
    if (!this.pendingUpsert) {
      return;
    }
    const now = Date.now();
    if (now < this.nextUpsertAt) {
      return;
    }
    const hybridSyncService = this.getHybridSyncService();
    if (typeof hybridSyncService?.handleNativeRiffUpsert === 'function') {
      await hybridSyncService.handleNativeRiffUpsert();
    } else if (typeof hybridSyncService?.incrementalSync === 'function') {
      await hybridSyncService.incrementalSync(undefined, {
        source: 'native-riff-transaction',
        persistIdleCheckpoint: false,
      });
    } else {
      logger.warn('Skip native-riff-upsert action because hybrid sync service is unavailable');
      return;
    }
    this.pendingUpsert = false;
    this.nextUpsertAt = now + this.upsertCooldownMs;
  }

  private async requeueActions(
    actions: Array<{
      type: 'native-riff-remove' | 'native-riff-upsert' | 'auto-card-candidates';
      blockIds?: string[];
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
          await this.followerCommandClient.submitAndWait(
            {
              instanceId: this.runtime.getInstanceId(),
              method: 'kernel.transaction.requeue',
              params: { actions },
            },
            this.relayTimeoutMs,
          );
        } catch (error) {
          if (!this.isSelfRelaySubmissionError(error)) {
            throw error;
          }
          await this.refreshStaleWriterModeAfterSelfRelay();
          await this.srsBackendClient.requeueKernelTransactions({ actions });
        }
        return;
      }
      await this.srsBackendClient.requeueKernelTransactions({ actions });
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
