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

interface KernelTransactionActionPumpOptions {
  pollIntervalMs?: number;
  maxActionsPerPoll?: number;
  relayTimeoutMs?: number;
}

export class KernelTransactionActionPump {
  private readonly pollIntervalMs: number;
  private readonly maxActionsPerPoll: number;
  private readonly relayTimeoutMs: number;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private pollingInFlight = false;

  constructor(
    private readonly srsBackendClient: Pick<SrsBackendClient, 'dequeueKernelTransactions'>,
    private readonly runtime: FrontendRuntimeLike | null,
    private readonly followerCommandClient: FollowerCommandClientLike | null,
    private readonly getHybridSyncService: () => HybridSyncServiceLike | undefined,
    options: KernelTransactionActionPumpOptions = {},
  ) {
    this.pollIntervalMs = Math.max(200, Math.floor(options.pollIntervalMs ?? 1_000));
    this.maxActionsPerPoll = Math.max(1, Math.floor(options.maxActionsPerPoll ?? 8));
    this.relayTimeoutMs = Math.max(1_000, Math.floor(options.relayTimeoutMs ?? 15_000));
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
        return;
      }
      const hybridSyncService = this.getHybridSyncService();
      const removeBlockIds = new Set<string>();
      let shouldRunUpsert = false;
      for (const action of actions) {
        if (action.type === 'native-riff-upsert') {
          shouldRunUpsert = true;
        } else if (action.type === 'native-riff-remove') {
          for (const blockId of action.blockIds || []) {
            const normalized = String(blockId || '').trim();
            if (normalized) {
              removeBlockIds.add(normalized);
            }
          }
        }
      }

      if (shouldRunUpsert) {
        if (typeof hybridSyncService?.handleNativeRiffUpsert === 'function') {
          await hybridSyncService.handleNativeRiffUpsert();
        } else if (typeof hybridSyncService?.incrementalSync === 'function') {
          await hybridSyncService.incrementalSync(undefined, {
            source: 'native-riff-transaction',
            persistIdleCheckpoint: false,
          });
        } else {
          logger.warn('Skip native-riff-upsert action because hybrid sync service is unavailable');
        }
      }

      if (removeBlockIds.size > 0) {
        if (typeof hybridSyncService?.handleNativeRiffRemove !== 'function') {
          logger.warn('Skip native-riff-remove action because hybrid sync service is unavailable', {
            blockIds: Array.from(removeBlockIds),
          });
          return;
        }
        await hybridSyncService.handleNativeRiffRemove(Array.from(removeBlockIds));
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
      type: 'native-riff-remove' | 'native-riff-upsert';
      blockIds: string[];
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
}
