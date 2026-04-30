import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import { createLogger } from '@/utils/logger';
import type { ITransactionHandler, Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';

const logger = createLogger('KernelTransactionIngestHandler');

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

interface KernelTransactionIngestHandlerOptions {
  batchDebounceMs?: number;
  maxBatchTransactions?: number;
  relayTimeoutMs?: number;
  maxAttempts?: number;
}

type PendingBatch = {
  transactions: Transaction[];
  receivedAt: number;
  idempotencyKey: string;
};

export class KernelTransactionIngestHandler implements ITransactionHandler {
  private readonly batchDebounceMs: number;
  private readonly maxBatchTransactions: number;
  private readonly relayTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly pendingTransactions: Transaction[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight = false;
  private sequence = 0;

  constructor(
    private readonly srsBackendClient: Pick<SrsBackendClient, 'ingestKernelTransactions'>,
    private readonly runtime: FrontendRuntimeLike | null,
    private readonly followerCommandClient: FollowerCommandClientLike | null,
    options: KernelTransactionIngestHandlerOptions = {},
  ) {
    this.batchDebounceMs = Math.max(10, Math.floor(options.batchDebounceMs ?? 120));
    this.maxBatchTransactions = Math.max(1, Math.floor(options.maxBatchTransactions ?? 256));
    this.relayTimeoutMs = Math.max(1_000, Math.floor(options.relayTimeoutMs ?? 15_000));
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  }

  handle(transactions: Transaction[]): void {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }
    this.pendingTransactions.push(...transactions);
    this.scheduleFlush();
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingTransactions.length = 0;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPendingTransactions();
    }, this.batchDebounceMs);
  }

  private async flushPendingTransactions(): Promise<void> {
    if (this.flushInFlight) {
      return;
    }
    this.flushInFlight = true;
    try {
      while (this.pendingTransactions.length > 0) {
        const batch = this.pendingTransactions.splice(0, this.maxBatchTransactions);
        const receivedAt = Date.now();
        const pending: PendingBatch = {
          transactions: batch,
          receivedAt,
          idempotencyKey: `ws-main:${receivedAt}:${++this.sequence}:${batch.length}`,
        };
        await this.sendWithRetry(pending);
      }
    } finally {
      this.flushInFlight = false;
      if (this.pendingTransactions.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private async sendWithRetry(batch: PendingBatch): Promise<void> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.sendBatch(batch);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        const retriable = message.startsWith('BACKEND_UNAVAILABLE:');
        if (!retriable || attempt >= this.maxAttempts) {
          logger.warn('Failed to ingest kernel transactions', {
            batchSize: batch.transactions.length,
            attempt,
            retriable,
            message,
          });
          return;
        }
        await this.sleep(Math.min(1_000, 200 * attempt));
      }
    }
  }

  private async sendBatch(batch: PendingBatch): Promise<void> {
    const payload = {
      source: 'ws-main' as const,
      transactions: batch.transactions,
      receivedAt: batch.receivedAt,
      idempotencyKey: batch.idempotencyKey,
    };

    if (this.runtime && this.followerCommandClient && this.runtime.getMode() !== 'writer') {
      await this.followerCommandClient.submitAndWait(
        {
          instanceId: this.runtime.getInstanceId(),
          method: 'kernel.transaction.ingest',
          params: payload,
        },
        this.relayTimeoutMs,
      );
      return;
    }

    await this.srsBackendClient.ingestKernelTransactions(payload);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

