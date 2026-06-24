import type { BackendIntegrationClientFacet } from '@/application/clients/backend';
import type { BackendKernelTransactionActionType } from '../../../packages/contracts/src/backend-rpc';
import { createLogger } from '@/utils/logger';
import type { ITransactionHandler, Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import {
  classifyTransactionBatch,
  type TransactionClassification,
} from '@/core/infrastructure/websocket/transaction-classifier';
import {
  shouldDispatchKernelTransactionIngestFromFanoutPlan,
  type TransactionFanoutPlan,
  type TransactionProvenanceSnapshot,
} from '@/core/infrastructure/websocket/transaction-fanout-coordinator';
import { incrementRuntimePerformanceCounter } from '@/utils/runtimePerformanceDiagnostics';

const logger = createLogger('KernelTransactionIngestHandler');
const ALL_KERNEL_TRANSACTION_ACTION_TYPES: readonly BackendKernelTransactionActionType[] = [
  'native-riff-remove',
  'native-riff-upsert',
  'auto-card-candidates',
];

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
  writerRelayRequired?: boolean;
  enabledActionTypes?: BackendKernelTransactionActionType[];
  onIngested?: () => void;
  provenanceRegistry?: {
    createSnapshot(now?: number): TransactionProvenanceSnapshot;
  };
}

type PendingBatch = {
  transactions: Transaction[];
  receivedAt: number;
  idempotencyKey: string;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class KernelTransactionIngestHandler implements ITransactionHandler {
  private readonly batchDebounceMs: number;
  private readonly maxBatchTransactions: number;
  private readonly relayTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly writerRelayRequired: boolean;
  private readonly enabledActionTypes: BackendKernelTransactionActionType[] | null;
  private readonly enabledActionTypeSet: ReadonlySet<BackendKernelTransactionActionType> | null;
  private readonly onIngested: (() => void) | undefined;
  private readonly provenanceRegistry: KernelTransactionIngestHandlerOptions['provenanceRegistry'];
  private readonly pendingTransactions: Transaction[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight = false;

  constructor(
    private readonly srsBackendClient: Pick<BackendIntegrationClientFacet, 'ingestKernelTransactions'>,
    private readonly runtime: FrontendRuntimeLike | null,
    private readonly followerCommandClient: FollowerCommandClientLike | null,
    options: KernelTransactionIngestHandlerOptions = {},
  ) {
    this.batchDebounceMs = Math.max(10, Math.floor(options.batchDebounceMs ?? 120));
    this.maxBatchTransactions = Math.max(1, Math.floor(options.maxBatchTransactions ?? 256));
    this.relayTimeoutMs = Math.max(1_000, Math.floor(options.relayTimeoutMs ?? 15_000));
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
    this.writerRelayRequired = options.writerRelayRequired === true;
    this.enabledActionTypes = normalizeEnabledActionTypes(options.enabledActionTypes);
    this.enabledActionTypeSet = this.enabledActionTypes ? new Set(this.enabledActionTypes) : null;
    this.onIngested = options.onIngested;
    this.provenanceRegistry = options.provenanceRegistry;
  }

  getTransactionConsumerId(): string {
    return 'kernel-transaction-ingest';
  }

  shouldHandleTransactionBatch(classification: TransactionClassification, fanoutPlan?: TransactionFanoutPlan): boolean {
    if (!this.enabledActionTypeSet) {
      return fanoutPlan
        ? shouldDispatchKernelTransactionIngestFromFanoutPlan(fanoutPlan)
        : (
          classification.autoCard.candidateOperations.length > 0
          || classification.autoCard.cancelBlockIds.length > 0
          || classification.nativeRiff.hasSignal
          || classification.documentTree.hasHint
        );
    }

    const autoCardEnabled = this.isActionTypeEnabled('auto-card-candidates');
    const nativeRiffEnabled = this.isActionTypeEnabled('native-riff-remove')
      || this.isActionTypeEnabled('native-riff-upsert');
    if (fanoutPlan) {
      return (autoCardEnabled && fanoutPlan.autoCard.shouldDispatch)
        || (nativeRiffEnabled && fanoutPlan.nativeRiff.shouldDispatch);
    }
    return (autoCardEnabled && (
      classification.autoCard.candidateOperations.length > 0
      || classification.autoCard.cancelBlockIds.length > 0
    ))
      || (nativeRiffEnabled && classification.nativeRiff.hasSignal);
  }

  handle(
    transactions: Transaction[],
    classification: TransactionClassification = classifyTransactionBatch(transactions),
    fanoutPlan?: TransactionFanoutPlan,
  ): void {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }
    if (!this.shouldHandleTransactionBatch(classification, fanoutPlan)) {
      incrementRuntimePerformanceCounter('daily-editing', 'kernel-transaction-ingest-skipped');
      return;
    }
    incrementRuntimePerformanceCounter('daily-editing', 'kernel-transaction-ingest-queued');
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
          idempotencyKey: this.createBatchIdempotencyKey(batch),
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
        this.onIngested?.();
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
    if (this.writerRelayRequired && !this.runtime) {
      throw new Error('BACKEND_UNAVAILABLE: kernel.transaction.ingest requires writer relay runtime');
    }

    const payload = {
      source: 'ws-main' as const,
      transactions: batch.transactions,
      receivedAt: batch.receivedAt,
      idempotencyKey: batch.idempotencyKey,
      ...(this.enabledActionTypes ? { enabledActionTypes: this.enabledActionTypes } : {}),
      provenanceSnapshot: this.provenanceRegistry?.createSnapshot(batch.receivedAt),
    };

    if (this.runtime && this.runtime.getMode() !== 'writer') {
      if (!this.followerCommandClient) {
        throw new Error('BACKEND_UNAVAILABLE: kernel.transaction.ingest relay is unavailable in follower mode');
      }
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

  private createBatchIdempotencyKey(transactions: Transaction[]): string {
    const signature = fnv1a32(stableStringify(transactions));
    return `ws-main:${transactions.length}:${signature}`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isActionTypeEnabled(type: BackendKernelTransactionActionType): boolean {
    return !this.enabledActionTypeSet || this.enabledActionTypeSet.has(type);
  }
}

function normalizeEnabledActionTypes(
  values: readonly BackendKernelTransactionActionType[] | undefined,
): BackendKernelTransactionActionType[] | null {
  if (!Array.isArray(values)) {
    return null;
  }
  const allowed = new Set<BackendKernelTransactionActionType>(ALL_KERNEL_TRANSACTION_ACTION_TYPES);
  const seen = new Set<BackendKernelTransactionActionType>();
  const normalized: BackendKernelTransactionActionType[] = [];
  for (const value of values) {
    if (!allowed.has(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}
