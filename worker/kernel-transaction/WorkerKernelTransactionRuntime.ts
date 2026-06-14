import type { DoOperation } from '@/core/infrastructure/websocket/transaction-types';
import { createLogger } from '@/utils/logger';
import type {
  BackendKernelTransactionAction,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueResult,
} from '../../packages/contracts/src/backend-rpc';

type KernelTransactionSource = 'kernel-sidecar' | 'ws-main';

type KernelTransactionIngestEntry = {
  source: KernelTransactionSource;
  transactions: unknown[];
  receivedAt: number;
  idempotencyKey: string;
  acceptedAt: number;
};

type KernelTransactionFileService = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
};

type WorkerKernelTransactionRuntimeDeps = {
  fileService: KernelTransactionFileService;
  now?: () => number;
  maxKernelTransactionQueueLength?: number;
  maxKernelQueuedTransactions?: number;
  maxKernelActionQueueLength?: number;
  kernelTransactionDedupeTtlMs?: number;
};

type KernelTransactionIngestSnapshot = {
  version?: number;
  queue?: unknown[];
  recentKeys?: Array<{ key?: unknown; expiresAt?: unknown }>;
  metrics?: {
    acceptedTotal?: number;
    deduplicatedTotal?: number;
    rejectedTotal?: number;
    drainedTotal?: number;
    lastAcceptedAt?: number | null;
    lastDrainAt?: number | null;
  };
};

type KernelTransactionActionSnapshot = {
  version?: number;
  actions?: unknown[];
  metrics?: {
    actionEnqueuedTotal?: number;
    actionDequeuedTotal?: number;
    actionRequeuedTotal?: number;
    actionRejectedTotal?: number;
    removeActionQueuedTotal?: number;
    upsertActionQueuedTotal?: number;
    autoCardActionQueuedTotal?: number;
  };
};

type KernelTransactionStatus = {
  queueLength: number;
  queuedTransactions: number;
  maxQueueLength: number;
  acceptedTotal: number;
  deduplicatedTotal: number;
  rejectedTotal: number;
  drainedTotal: number;
  actionQueueLength: number;
  actionEnqueuedTotal: number;
  actionDequeuedTotal: number;
  actionRequeuedTotal: number;
  actionRejectedTotal: number;
  removeActionQueuedTotal: number;
  upsertActionQueuedTotal: number;
  autoCardActionQueuedTotal: number;
  maxActionQueueLength: number;
  lastAcceptedAt: number | null;
  lastDrainAt: number | null;
};

const logger = createLogger('WorkerKernelTransactionRuntime');
const KERNEL_INGEST_QUEUE_SNAPSHOT_FILE = 'kernel-transaction-ingest.snapshot.json';
const KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION = 1;
const KERNEL_ACTION_QUEUE_SNAPSHOT_FILE = 'kernel-transaction-actions.snapshot.json';
const KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION = 1;
const RELEVANT_UPSERT_ACTIONS = new Set(['insert', 'update', 'delete', 'setAttrs', 'updateAttrs']);
const REMOVE_FLASHCARDS_ACTION = 'removeFlashcards';
const ADD_FLASHCARDS_ACTION = 'addFlashcards';
const AUTO_CARD_RELEVANT_ACTIONS = new Set(['insert', 'update', 'delete']);
const QUICK_CARD_MARKERS = [
  '>>',
  '》》',
  '<<',
  '《《',
  '<>',
  '《》',
  '>>>',
  '》》》',
  '::',
  '：：',
  ';;',
  '；；',
  ';<',
  '；<',
  '；《',
  ';<>',
  '；<>',
  '；《》',
  '{{',
  '}}',
  '==',
  '\\cloze',
  'data-type="mark"',
];
const QUICK_CARD_CONTENT_KEYS = new Set([
  'content',
  'markdown',
  'kramdown',
  'text',
  'html',
  'data',
]);
const NATIVE_RIFF_MARKERS = [
  'custom-riff-decks',
  'custom-is-flashcard',
  'flashcard',
  'riffCardID',
  'riffCardId',
  'riffCard',
  'custom-card-type',
];

export class WorkerKernelTransactionRuntime {
  private readonly now: () => number;
  private readonly maxKernelTransactionQueueLength: number;
  private readonly maxKernelQueuedTransactions: number;
  private readonly maxKernelActionQueueLength: number;
  private readonly kernelTransactionDedupeTtlMs: number;
  private readonly kernelTransactionQueue: KernelTransactionIngestEntry[] = [];
  private readonly recentKernelTransactionKeys = new Map<string, number>();
  private readonly kernelTransactionActions: BackendKernelTransactionAction[] = [];
  private kernelQueuedTransactions = 0;
  private kernelAcceptedTotal = 0;
  private kernelDeduplicatedTotal = 0;
  private kernelRejectedTotal = 0;
  private kernelDrainedTotal = 0;
  private kernelActionEnqueuedTotal = 0;
  private kernelActionDequeuedTotal = 0;
  private kernelActionRequeuedTotal = 0;
  private kernelActionRejectedTotal = 0;
  private kernelRemoveActionQueuedTotal = 0;
  private kernelUpsertActionQueuedTotal = 0;
  private kernelAutoCardActionQueuedTotal = 0;
  private lastKernelAcceptedAt: number | null = null;
  private lastKernelDrainAt: number | null = null;

  constructor(private readonly deps: WorkerKernelTransactionRuntimeDeps) {
    this.now = deps.now ?? Date.now;
    this.maxKernelTransactionQueueLength = Math.max(
      1,
      Math.floor(Number(deps.maxKernelTransactionQueueLength ?? 256)),
    );
    this.maxKernelQueuedTransactions = Math.max(
      1,
      Math.floor(Number(deps.maxKernelQueuedTransactions ?? 8_192)),
    );
    this.maxKernelActionQueueLength = Math.max(
      8,
      Math.floor(Number(deps.maxKernelActionQueueLength ?? 4_096)),
    );
    this.kernelTransactionDedupeTtlMs = Math.max(
      5_000,
      Math.floor(Number(deps.kernelTransactionDedupeTtlMs ?? 120_000)),
    );
  }

  async restoreSnapshots(): Promise<void> {
    await this.restoreKernelIngestQueueSnapshot();
    await this.restoreKernelActionQueueSnapshot();
  }

  async persistSnapshots(): Promise<void> {
    await this.persistKernelIngestQueueSnapshot();
    await this.persistKernelActionQueueSnapshot();
  }

  getStatus(): KernelTransactionStatus {
    return {
      queueLength: this.kernelTransactionQueue.length,
      queuedTransactions: this.kernelQueuedTransactions,
      maxQueueLength: this.maxKernelTransactionQueueLength,
      acceptedTotal: this.kernelAcceptedTotal,
      deduplicatedTotal: this.kernelDeduplicatedTotal,
      rejectedTotal: this.kernelRejectedTotal,
      drainedTotal: this.kernelDrainedTotal,
      actionQueueLength: this.kernelTransactionActions.length,
      actionEnqueuedTotal: this.kernelActionEnqueuedTotal,
      actionDequeuedTotal: this.kernelActionDequeuedTotal,
      actionRequeuedTotal: this.kernelActionRequeuedTotal,
      actionRejectedTotal: this.kernelActionRejectedTotal,
      removeActionQueuedTotal: this.kernelRemoveActionQueuedTotal,
      upsertActionQueuedTotal: this.kernelUpsertActionQueuedTotal,
      autoCardActionQueuedTotal: this.kernelAutoCardActionQueuedTotal,
      maxActionQueueLength: this.maxKernelActionQueueLength,
      lastAcceptedAt: this.lastKernelAcceptedAt,
      lastDrainAt: this.lastKernelDrainAt,
    };
  }

  async ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> {
    const now = this.now();
    this.cleanupKernelTransactionDeduplication(now);

    const source = this.normalizeKernelTransactionSource(request.source);
    const receivedAt = Number.isFinite(Number(request.receivedAt))
      ? Math.max(0, Math.floor(Number(request.receivedAt)))
      : now;
    const transactions = (Array.isArray(request.transactions) ? request.transactions : [])
      .filter((transaction) => transaction != null && typeof transaction === 'object');
    const idempotencyKey = this.resolveKernelTransactionIdempotencyKey({
      source,
      transactions,
      receivedAt,
      requestIdempotencyKey: request.idempotencyKey,
    });

    if (transactions.length === 0) {
      return {
        accepted: 0,
        queued: this.kernelQueuedTransactions,
        receivedAt,
        duplicate: false,
        queueLength: this.kernelTransactionQueue.length,
        maxQueueLength: this.maxKernelTransactionQueueLength,
      };
    }

    if (this.recentKernelTransactionKeys.has(idempotencyKey)) {
      this.kernelDeduplicatedTotal += transactions.length;
      await this.persistKernelIngestQueueSnapshot();
      return {
        accepted: 0,
        queued: this.kernelQueuedTransactions,
        receivedAt,
        duplicate: true,
        queueLength: this.kernelTransactionQueue.length,
        maxQueueLength: this.maxKernelTransactionQueueLength,
      };
    }

    if (this.kernelTransactionQueue.length >= this.maxKernelTransactionQueueLength) {
      this.kernelRejectedTotal += transactions.length;
      await this.persistKernelIngestQueueSnapshot();
      throw new Error(
        `SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=${this.kernelTransactionQueue.length}, limit=${this.maxKernelTransactionQueueLength})`,
      );
    }
    if (this.kernelQueuedTransactions + transactions.length > this.maxKernelQueuedTransactions) {
      this.kernelRejectedTotal += transactions.length;
      await this.persistKernelIngestQueueSnapshot();
      throw new Error(
        `SrsBackendWorker kernel.transaction.ingest unavailable: transaction backpressure (pending=${this.kernelQueuedTransactions}, incoming=${transactions.length}, limit=${this.maxKernelQueuedTransactions})`,
      );
    }

    const actions = collectKernelTransactionActions({
      source,
      transactions,
      receivedAt,
      idempotencyKey,
    });
    if (this.kernelTransactionActions.length + actions.length > this.maxKernelActionQueueLength) {
      this.kernelRejectedTotal += transactions.length;
      this.kernelActionRejectedTotal += actions.length;
      await this.persistKernelActionQueueSnapshot();
      throw new Error(
        `SrsBackendWorker kernel.transaction.ingest unavailable: action queue backpressure `
        + `(pending=${this.kernelTransactionActions.length}, incoming=${actions.length}, limit=${this.maxKernelActionQueueLength})`,
      );
    }

    this.recentKernelTransactionKeys.set(idempotencyKey, now + this.kernelTransactionDedupeTtlMs);
    this.kernelTransactionQueue.push({
      source,
      transactions,
      receivedAt,
      idempotencyKey,
      acceptedAt: now,
    });
    if (actions.length > 0) {
      this.kernelTransactionActions.push(...actions);
      this.kernelActionEnqueuedTotal += actions.length;
      for (const action of actions) {
        if (action.type === 'native-riff-remove') {
          this.kernelRemoveActionQueuedTotal += 1;
        } else if (action.type === 'native-riff-upsert') {
          this.kernelUpsertActionQueuedTotal += 1;
        } else if (action.type === 'auto-card-candidates') {
          this.kernelAutoCardActionQueuedTotal += 1;
        }
      }
      await this.persistKernelActionQueueSnapshot();
    }
    this.kernelQueuedTransactions += transactions.length;
    this.kernelAcceptedTotal += transactions.length;
    this.lastKernelAcceptedAt = now;
    await this.persistKernelIngestQueueSnapshot();

    return {
      accepted: transactions.length,
      queued: this.kernelQueuedTransactions,
      receivedAt,
      duplicate: false,
      queueLength: this.kernelTransactionQueue.length,
      maxQueueLength: this.maxKernelTransactionQueueLength,
    };
  }

  async dequeueKernelTransactionActions(maxActions = 16): Promise<BackendKernelTransactionDequeueResult> {
    const limit = Math.max(1, Math.floor(Number(maxActions) || 0));
    const rawActions = this.kernelTransactionActions.splice(0, limit);
    this.drainKernelTransactions(Math.max(256, limit * 32));
    this.kernelActionDequeuedTotal += rawActions.length;
    if (rawActions.length > 0) {
      await this.persistKernelActionQueueSnapshot();
    }
    const actions = coalesceDequeuedKernelActions(rawActions);
    return {
      actions,
      remaining: this.kernelTransactionActions.length,
    };
  }

  async requeueKernelTransactionActions(
    actions: BackendKernelTransactionAction[],
  ): Promise<BackendKernelTransactionRequeueResult> {
    const normalized = (Array.isArray(actions) ? actions : [])
      .filter((action): action is BackendKernelTransactionAction => (
        Boolean(action)
        && typeof action === 'object'
        && typeof action.type === 'string'
        && typeof action.idempotencyKey === 'string'
      ));
    if (normalized.length === 0) {
      return {
        requeued: 0,
        queueLength: this.kernelTransactionActions.length,
        maxQueueLength: this.maxKernelActionQueueLength,
      };
    }
    const available = Math.max(0, this.maxKernelActionQueueLength - this.kernelTransactionActions.length);
    const accepted = normalized.slice(0, available);
    if (accepted.length > 0) {
      this.kernelTransactionActions.unshift(...accepted);
      this.kernelActionRequeuedTotal += accepted.length;
      await this.persistKernelActionQueueSnapshot();
    }
    const dropped = normalized.length - accepted.length;
    if (dropped > 0) {
      this.kernelActionRejectedTotal += dropped;
      if (accepted.length === 0) {
        await this.persistKernelActionQueueSnapshot();
      }
    }
    return {
      requeued: accepted.length,
      queueLength: this.kernelTransactionActions.length,
      maxQueueLength: this.maxKernelActionQueueLength,
    };
  }

  drainKernelTransactions(maxTransactions = 256): Array<KernelTransactionIngestEntry> {
    const budget = Math.max(1, Math.floor(Number(maxTransactions) || 0));
    let consumed = 0;
    const drained: KernelTransactionIngestEntry[] = [];

    while (this.kernelTransactionQueue.length > 0 && consumed < budget) {
      const next = this.kernelTransactionQueue[0];
      const nextCount = next.transactions.length;
      if (drained.length > 0 && consumed + nextCount > budget) {
        break;
      }
      this.kernelTransactionQueue.shift();
      drained.push(next);
      consumed += nextCount;
      this.kernelQueuedTransactions = Math.max(0, this.kernelQueuedTransactions - nextCount);
    }

    if (drained.length > 0) {
      this.kernelDrainedTotal += consumed;
      this.lastKernelDrainAt = this.now();
      void this.persistKernelIngestQueueSnapshot();
      logger.debug('Drained kernel transaction batch', {
        envelopes: drained.length,
        transactions: consumed,
        remaining: this.kernelQueuedTransactions,
      });
    }

    return drained;
  }

  private async restoreKernelActionQueueSnapshot(): Promise<void> {
    try {
      const snapshot = await this.deps.fileService.readJSON<KernelTransactionActionSnapshot>(
        KERNEL_ACTION_QUEUE_SNAPSHOT_FILE,
      );
      if (!snapshot || snapshot.version !== KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION) {
        return;
      }
      const normalized = this.normalizeKernelActions(snapshot.actions || []);
      if (normalized.length > 0) {
        const restored = normalized.slice(0, this.maxKernelActionQueueLength);
        this.kernelTransactionActions.push(...restored);
      }
      const metrics = snapshot.metrics;
      if (metrics && typeof metrics === 'object') {
        this.kernelActionEnqueuedTotal = Math.max(
          this.kernelActionEnqueuedTotal,
          Math.max(0, Math.floor(Number(metrics.actionEnqueuedTotal || 0))),
        );
        this.kernelActionDequeuedTotal = Math.max(
          this.kernelActionDequeuedTotal,
          Math.max(0, Math.floor(Number(metrics.actionDequeuedTotal || 0))),
        );
        this.kernelActionRequeuedTotal = Math.max(
          this.kernelActionRequeuedTotal,
          Math.max(0, Math.floor(Number(metrics.actionRequeuedTotal || 0))),
        );
        this.kernelActionRejectedTotal = Math.max(
          this.kernelActionRejectedTotal,
          Math.max(0, Math.floor(Number(metrics.actionRejectedTotal || 0))),
        );
        this.kernelRemoveActionQueuedTotal = Math.max(
          this.kernelRemoveActionQueuedTotal,
          Math.max(0, Math.floor(Number(metrics.removeActionQueuedTotal || 0))),
        );
        this.kernelUpsertActionQueuedTotal = Math.max(
          this.kernelUpsertActionQueuedTotal,
          Math.max(0, Math.floor(Number(metrics.upsertActionQueuedTotal || 0))),
        );
        this.kernelAutoCardActionQueuedTotal = Math.max(
          this.kernelAutoCardActionQueuedTotal,
          Math.max(0, Math.floor(Number(metrics.autoCardActionQueuedTotal || 0))),
        );
      }
    } catch (error) {
      logger.warn('Failed to restore kernel action queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private async restoreKernelIngestQueueSnapshot(): Promise<void> {
    try {
      const snapshot = await this.deps.fileService.readJSON<KernelTransactionIngestSnapshot>(
        KERNEL_INGEST_QUEUE_SNAPSHOT_FILE,
      );
      if (!snapshot || snapshot.version !== KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION) {
        return;
      }
      const now = this.now();
      const normalizedQueue = this.normalizeKernelTransactionQueue(snapshot.queue || []);
      let queuedTransactions = 0;
      for (const entry of normalizedQueue) {
        if (this.kernelTransactionQueue.length >= this.maxKernelTransactionQueueLength) {
          break;
        }
        const nextCount = entry.transactions.length;
        if (nextCount <= 0) {
          continue;
        }
        if (queuedTransactions + nextCount > this.maxKernelQueuedTransactions) {
          break;
        }
        this.kernelTransactionQueue.push(entry);
        queuedTransactions += nextCount;
        this.recentKernelTransactionKeys.set(
          entry.idempotencyKey,
          Math.max(entry.acceptedAt + this.kernelTransactionDedupeTtlMs, now + this.kernelTransactionDedupeTtlMs),
        );
      }
      this.kernelQueuedTransactions = queuedTransactions;
      if (Array.isArray(snapshot.recentKeys)) {
        for (const entry of snapshot.recentKeys) {
          if (!entry || typeof entry !== 'object') {
            continue;
          }
          const key = String(entry.key || '').trim();
          const expiresAt = Number(entry.expiresAt);
          if (!key || !Number.isFinite(expiresAt)) {
            continue;
          }
          if (expiresAt <= now) {
            continue;
          }
          this.recentKernelTransactionKeys.set(key, Math.floor(expiresAt));
        }
      }
      const metrics = snapshot.metrics;
      if (metrics && typeof metrics === 'object') {
        this.kernelAcceptedTotal = Math.max(
          this.kernelAcceptedTotal,
          Math.max(0, Math.floor(Number(metrics.acceptedTotal || 0))),
        );
        this.kernelDeduplicatedTotal = Math.max(
          this.kernelDeduplicatedTotal,
          Math.max(0, Math.floor(Number(metrics.deduplicatedTotal || 0))),
        );
        this.kernelRejectedTotal = Math.max(
          this.kernelRejectedTotal,
          Math.max(0, Math.floor(Number(metrics.rejectedTotal || 0))),
        );
        this.kernelDrainedTotal = Math.max(
          this.kernelDrainedTotal,
          Math.max(0, Math.floor(Number(metrics.drainedTotal || 0))),
        );
        this.lastKernelAcceptedAt = Number.isFinite(Number(metrics.lastAcceptedAt))
          ? Math.max(0, Math.floor(Number(metrics.lastAcceptedAt)))
          : this.lastKernelAcceptedAt;
        this.lastKernelDrainAt = Number.isFinite(Number(metrics.lastDrainAt))
          ? Math.max(0, Math.floor(Number(metrics.lastDrainAt)))
          : this.lastKernelDrainAt;
      }
    } catch (error) {
      logger.warn('Failed to restore kernel ingest queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private async persistKernelIngestQueueSnapshot(): Promise<void> {
    try {
      await this.deps.fileService.writeJSON(KERNEL_INGEST_QUEUE_SNAPSHOT_FILE, {
        version: KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION,
        queue: this.kernelTransactionQueue,
        recentKeys: Array.from(this.recentKernelTransactionKeys.entries()).map(([key, expiresAt]) => ({
          key,
          expiresAt,
        })),
        metrics: {
          acceptedTotal: this.kernelAcceptedTotal,
          deduplicatedTotal: this.kernelDeduplicatedTotal,
          rejectedTotal: this.kernelRejectedTotal,
          drainedTotal: this.kernelDrainedTotal,
          lastAcceptedAt: this.lastKernelAcceptedAt,
          lastDrainAt: this.lastKernelDrainAt,
        },
      });
    } catch (error) {
      logger.warn('Failed to persist kernel ingest queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private async persistKernelActionQueueSnapshot(): Promise<void> {
    try {
      await this.deps.fileService.writeJSON(KERNEL_ACTION_QUEUE_SNAPSHOT_FILE, {
        version: KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION,
        actions: this.kernelTransactionActions,
        metrics: {
          actionEnqueuedTotal: this.kernelActionEnqueuedTotal,
          actionDequeuedTotal: this.kernelActionDequeuedTotal,
          actionRequeuedTotal: this.kernelActionRequeuedTotal,
          actionRejectedTotal: this.kernelActionRejectedTotal,
          removeActionQueuedTotal: this.kernelRemoveActionQueuedTotal,
          upsertActionQueuedTotal: this.kernelUpsertActionQueuedTotal,
          autoCardActionQueuedTotal: this.kernelAutoCardActionQueuedTotal,
        },
      });
    } catch (error) {
      logger.warn('Failed to persist kernel action queue snapshot', {
        message: error instanceof Error ? error.message : String(error || ''),
      });
    }
  }

  private normalizeKernelActions(actions: unknown[]): BackendKernelTransactionAction[] {
    const normalized: BackendKernelTransactionAction[] = [];
    for (const action of actions) {
      if (!action || typeof action !== 'object') {
        continue;
      }
      const record = action as Record<string, unknown>;
      const source = record.source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
      const receivedAt = Number.isFinite(Number(record.receivedAt))
        ? Math.max(0, Math.floor(Number(record.receivedAt)))
        : this.now();
      const idempotencyKey = String(record.idempotencyKey || '').trim();
      const type = String(record.type || '').trim();
      if (!idempotencyKey) {
        continue;
      }
      if (type === 'native-riff-remove' || type === 'native-riff-upsert') {
        const blockIds = Array.isArray(record.blockIds)
          ? uniqueStrings(record.blockIds)
          : [];
        normalized.push({
          type,
          blockIds,
          source,
          receivedAt,
          idempotencyKey,
        });
        continue;
      }
      if (type === 'auto-card-candidates') {
        const operations = Array.isArray(record.operations)
          ? record.operations
            .filter((entry): entry is { action: 'insert' | 'update' | 'delete'; blockId: string } => {
              if (!entry || typeof entry !== 'object') {
                return false;
              }
              const candidate = entry as Record<string, unknown>;
              const actionType = String(candidate.action || '').trim();
              const blockId = String(candidate.blockId || '').trim();
              return (
                (actionType === 'insert' || actionType === 'update' || actionType === 'delete')
                && Boolean(blockId)
              );
            })
            .map((entry) => ({
              action: entry.action,
              blockId: String(entry.blockId).trim(),
            }))
          : [];
        normalized.push({
          type: 'auto-card-candidates',
          operations,
          source,
          receivedAt,
          idempotencyKey,
        });
      }
    }
    return normalized;
  }

  private normalizeKernelTransactionQueue(queue: unknown[]): KernelTransactionIngestEntry[] {
    const normalized: KernelTransactionIngestEntry[] = [];
    for (const entry of queue) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const source = record.source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
      const transactions = Array.isArray(record.transactions) ? record.transactions : [];
      const idempotencyKey = String(record.idempotencyKey || '').trim();
      if (!idempotencyKey || transactions.length === 0) {
        continue;
      }
      const receivedAt = Number.isFinite(Number(record.receivedAt))
        ? Math.max(0, Math.floor(Number(record.receivedAt)))
        : this.now();
      const acceptedAt = Number.isFinite(Number(record.acceptedAt))
        ? Math.max(0, Math.floor(Number(record.acceptedAt)))
        : receivedAt;
      normalized.push({
        source,
        transactions,
        receivedAt,
        idempotencyKey,
        acceptedAt,
      });
    }
    return normalized;
  }

  private cleanupKernelTransactionDeduplication(now: number): void {
    for (const [key, expiresAt] of this.recentKernelTransactionKeys.entries()) {
      if (expiresAt <= now) {
        this.recentKernelTransactionKeys.delete(key);
      }
    }
  }

  private normalizeKernelTransactionSource(source: unknown): KernelTransactionSource {
    return source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
  }

  private resolveKernelTransactionIdempotencyKey(input: {
    source: KernelTransactionSource;
    transactions: unknown[];
    receivedAt: number;
    requestIdempotencyKey?: string;
  }): string {
    const explicit = String(input.requestIdempotencyKey || '').trim();
    if (explicit) {
      return explicit.slice(0, 256);
    }
    const signatureRaw = JSON.stringify(input.transactions) || '[]';
    const signature = fnv1a32(signatureRaw);
    return `${input.source}:${input.receivedAt}:${input.transactions.length}:${signature}`;
  }
}

function collectKernelTransactionActions(input: {
  source: KernelTransactionSource;
  transactions: unknown[];
  receivedAt: number;
  idempotencyKey: string;
}): BackendKernelTransactionAction[] {
  const actions: BackendKernelTransactionAction[] = [];
  const nativeRiffRemoveBlockIds = collectNativeRiffRemoveBlockIds(input.transactions);
  if (nativeRiffRemoveBlockIds.length > 0) {
    actions.push({
      type: 'native-riff-remove',
      blockIds: nativeRiffRemoveBlockIds,
      source: input.source,
      receivedAt: input.receivedAt,
      idempotencyKey: input.idempotencyKey,
    });
  }
  const nativeRiffUpsertBlockIds = collectNativeRiffUpsertBlockIds(input.transactions);
  if (nativeRiffUpsertBlockIds.length > 0) {
    actions.push({
      type: 'native-riff-upsert',
      blockIds: nativeRiffUpsertBlockIds,
      source: input.source,
      receivedAt: input.receivedAt,
      idempotencyKey: input.idempotencyKey,
    });
  }
  const autoCardOperations = collectAutoCardCandidateOperations(input.transactions);
  if (autoCardOperations.length > 0) {
    actions.push({
      type: 'auto-card-candidates',
      operations: autoCardOperations,
      source: input.source,
      receivedAt: input.receivedAt,
      idempotencyKey: input.idempotencyKey,
    });
  }
  return actions;
}

function collectNativeRiffRemoveBlockIds(transactions: unknown[]): string[] {
  const ids: unknown[] = [];
  for (const transaction of transactions) {
    if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
      continue;
    }
    for (const operation of transaction.doOperations) {
      if (!isRecord(operation)) {
        continue;
      }
      if (normalizeString(operation.action) !== REMOVE_FLASHCARDS_ACTION) {
        continue;
      }
      ids.push(...extractOperationBlockIds(operation as DoOperation));
    }
  }
  return uniqueStrings(ids);
}

function collectNativeRiffUpsertBlockIds(transactions: unknown[]): string[] {
  const ids: unknown[] = [];
  for (const transaction of transactions) {
    if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
      continue;
    }
    for (const operation of transaction.doOperations) {
      if (!isRecord(operation)) {
        continue;
      }
      const typed = operation as DoOperation;
      if (!looksLikeNativeRiffUpsert(typed)) {
        continue;
      }
      ids.push(...extractOperationBlockIds(typed));
    }
  }
  return uniqueStrings(ids);
}

function collectAutoCardCandidateOperations(
  transactions: unknown[],
): Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> {
  const operations: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
  for (const transaction of transactions) {
    if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
      continue;
    }
    for (const operation of transaction.doOperations) {
      if (!isRecord(operation)) {
        continue;
      }
      const typed = operation as DoOperation;
      const action = normalizeString(typed.action);
      if (!AUTO_CARD_RELEVANT_ACTIONS.has(action)) {
        continue;
      }
      if (!shouldCollectAutoCardOperation(typed)) {
        continue;
      }
      const blockId = normalizeString(typed.id);
      if (!blockId) {
        continue;
      }
      operations.push({
        action: action as 'insert' | 'update' | 'delete',
        blockId,
      });
    }
  }
  return coalesceAutoCardOperationList(operations);
}

function coalesceAutoCardOperationList(
  operations: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }>,
): Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> {
  const byBlockId = new Map<string, 'insert' | 'update' | 'delete' | null>();
  for (const operation of operations) {
    const blockId = normalizeString(operation.blockId);
    if (!blockId) {
      continue;
    }
    const nextAction = operation.action;
    const current = byBlockId.get(blockId) ?? null;
    if (nextAction === 'delete') {
      byBlockId.set(blockId, current === 'insert' ? null : 'delete');
      continue;
    }
    if (nextAction === 'insert') {
      byBlockId.set(blockId, current === 'delete' ? 'insert' : 'insert');
      continue;
    }
    if (current === null) {
      byBlockId.set(blockId, 'update');
    }
  }
  const coalesced: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
  for (const [blockId, action] of byBlockId.entries()) {
    if (!action) {
      continue;
    }
    coalesced.push({ action, blockId });
  }
  return coalesced;
}

function coalesceDequeuedKernelActions(
  actions: BackendKernelTransactionAction[],
): BackendKernelTransactionAction[] {
  if (actions.length <= 1) {
    return actions;
  }
  const removeBlockIds: string[] = [];
  const upsertBlockIds: string[] = [];
  const autoCardOps: Array<{ action: 'insert' | 'update' | 'delete'; blockId: string }> = [];
  let removeEnvelope: BackendKernelTransactionAction | null = null;
  let upsertEnvelope: BackendKernelTransactionAction | null = null;
  let autoCardEnvelope: BackendKernelTransactionAction | null = null;
  const passthrough: BackendKernelTransactionAction[] = [];

  for (const action of actions) {
    if (action.type === 'native-riff-remove') {
      removeEnvelope = removeEnvelope ?? action;
      removeBlockIds.push(...(Array.isArray(action.blockIds) ? action.blockIds : []));
      continue;
    }
    if (action.type === 'native-riff-upsert') {
      upsertEnvelope = upsertEnvelope ?? action;
      upsertBlockIds.push(...(Array.isArray(action.blockIds) ? action.blockIds : []));
      continue;
    }
    if (action.type === 'auto-card-candidates') {
      autoCardEnvelope = autoCardEnvelope ?? action;
      autoCardOps.push(...(Array.isArray(action.operations) ? action.operations : []));
      continue;
    }
    passthrough.push(action);
  }

  const merged: BackendKernelTransactionAction[] = [...passthrough];
  if (removeEnvelope) {
    merged.push({
      type: 'native-riff-remove',
      blockIds: uniqueStrings(removeBlockIds),
      source: removeEnvelope.source,
      receivedAt: removeEnvelope.receivedAt,
      idempotencyKey: removeEnvelope.idempotencyKey,
    });
  }
  if (upsertEnvelope) {
    merged.push({
      type: 'native-riff-upsert',
      blockIds: uniqueStrings(upsertBlockIds),
      source: upsertEnvelope.source,
      receivedAt: upsertEnvelope.receivedAt,
      idempotencyKey: upsertEnvelope.idempotencyKey,
    });
  }
  if (autoCardEnvelope) {
    const coalesced = coalesceAutoCardOperationList(autoCardOps);
    if (coalesced.length > 0) {
      merged.push({
        type: 'auto-card-candidates',
        operations: coalesced,
        source: autoCardEnvelope.source,
        receivedAt: autoCardEnvelope.receivedAt,
        idempotencyKey: autoCardEnvelope.idempotencyKey,
      });
    }
  }
  return merged;
}

function containsNativeRiffMarker(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }
    return NATIVE_RIFF_MARKERS.some((marker) => normalized.includes(marker));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsNativeRiffMarker(entry));
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => (
    NATIVE_RIFF_MARKERS.includes(key)
    || containsNativeRiffMarker(nested)
  ));
}

function containsQuickCardMarkerText(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && QUICK_CARD_MARKERS.some((marker) => normalized.includes(marker));
}

function inspectQuickCardPayload(value: unknown, key = ''): { inspected: boolean; hasMarker: boolean } {
  if (typeof value === 'string') {
    const inspectString = key === '' || QUICK_CARD_CONTENT_KEYS.has(key.toLowerCase());
    return {
      inspected: inspectString,
      hasMarker: inspectString && containsQuickCardMarkerText(value),
    };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (summary, entry) => {
        const next = inspectQuickCardPayload(entry, key);
        return {
          inspected: summary.inspected || next.inspected,
          hasMarker: summary.hasMarker || next.hasMarker,
        };
      },
      { inspected: false, hasMarker: false },
    );
  }
  if (!isRecord(value)) {
    return { inspected: false, hasMarker: false };
  }
  return Object.entries(value).reduce(
    (summary, [childKey, childValue]) => {
      const next = inspectQuickCardPayload(childValue, childKey);
      return {
        inspected: summary.inspected || next.inspected,
        hasMarker: summary.hasMarker || next.hasMarker,
      };
    },
    { inspected: false, hasMarker: false },
  );
}

function shouldCollectAutoCardOperation(operation: DoOperation): boolean {
  const action = normalizeString(operation.action);
  if (action === 'delete') {
    return true;
  }
  if (action !== 'insert' && action !== 'update') {
    return false;
  }

  const newPayload = inspectQuickCardPayload(operation.data?.new);
  const oldPayload = inspectQuickCardPayload(operation.data?.old);
  if (newPayload.hasMarker || oldPayload.hasMarker) {
    return true;
  }
  if (newPayload.inspected || oldPayload.inspected) {
    return false;
  }
  return true;
}

function extractOperationBlockIds(operation: DoOperation): string[] {
  const data = isRecord(operation.data) ? operation.data : undefined;
  return uniqueStrings([
    ...(operation.blockIDs || []),
    ...(operation.ids || []),
    ...(Array.isArray(data?.blockIDs) ? data.blockIDs : []),
    ...(Array.isArray(data?.ids) ? data.ids : []),
    operation.id,
  ]);
}

function looksLikeNativeRiffAttrRemoval(operation: DoOperation): boolean {
  if (operation.action !== 'setAttrs' && operation.action !== 'updateAttrs') {
    return false;
  }
  const oldHasMarker = containsNativeRiffMarker(operation.data?.old);
  const newHasMarker = containsNativeRiffMarker(operation.data?.new);
  return oldHasMarker && !newHasMarker;
}

function looksLikeNativeRiffUpsert(operation: DoOperation): boolean {
  if (operation.action === ADD_FLASHCARDS_ACTION) {
    return extractOperationBlockIds(operation).length > 0;
  }
  if (looksLikeNativeRiffAttrRemoval(operation)) {
    return false;
  }
  if (!RELEVANT_UPSERT_ACTIONS.has(operation.action)) {
    return false;
  }
  return containsNativeRiffMarker(operation.data?.new)
    || containsNativeRiffMarker(operation.data?.old);
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
