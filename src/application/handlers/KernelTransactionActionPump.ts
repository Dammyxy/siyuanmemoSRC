import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import { createLogger } from '@/utils/logger';

const logger = createLogger('KernelTransactionActionPump');

type FrontendRuntimeLike = {
  getMode: () => 'writer' | 'follower';
  getInstanceId: () => string;
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
}

export class KernelTransactionActionPump {
  private readonly pollIntervalMs: number;
  private readonly maxActionsPerPoll: number;
  private readonly relayTimeoutMs: number;
  private readonly upsertCooldownMs: number;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private pollingInFlight = false;
  private pendingUpsert = false;
  private nextUpsertAt = 0;

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
        return;
      }
      const hybridSyncService = this.getHybridSyncService();
      const removeBlockIds = new Set<string>();
      const autoCardOperations: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
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

        if (autoCardOperations.length > 0) {
          const autoCardHandler = this.getAutoCardHandler();
          if (!autoCardHandler) {
            logger.warn('Skip auto-card-candidates action because AutoCardHandler is unavailable', {
              operations: autoCardOperations.length,
            });
          } else {
            autoCardHandler.handle([{
              doOperations: autoCardOperations.map((operation) => ({
                action: operation.action,
                id: operation.blockId,
              })),
              undoOperations: null,
            }]);
          }
        }
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
    const params = { maxActions: this.maxActionsPerPoll };
    if (this.runtime && this.followerCommandClient && this.runtime.getMode() !== 'writer') {
      return this.followerCommandClient.submitAndWait(
        {
          instanceId: this.runtime.getInstanceId(),
          method: 'kernel.transaction.dequeue',
          params,
        },
        this.relayTimeoutMs,
      );
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
      if (this.runtime && this.followerCommandClient && this.runtime.getMode() !== 'writer') {
        await this.followerCommandClient.submitAndWait(
          {
            instanceId: this.runtime.getInstanceId(),
            method: 'kernel.transaction.requeue',
            params: { actions },
          },
          this.relayTimeoutMs,
        );
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
}
