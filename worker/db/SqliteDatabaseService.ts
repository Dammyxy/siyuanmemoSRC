import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite/SqlQueueStateRepository';
import { SchedulerRouter } from '@/core/scheduler';
import { createReviewLogV2 } from '@/types/review';
import type { StructuredCardQuery } from '@/types/card-query';
import type { BrowserStats } from '@/application/queries/browser/GetBrowserCardsQuery';
import { CardType, type FSRSCard } from '@/types/card';
import type { SchedulerType } from '@/core/scheduler/schedulerPolicy';
import type {
  QueueProjectionCounters,
  QueueProjectionDueBucket,
  QueueProjectionGeneration,
  QueueProjectionRow,
} from '@/application/ports/QueueProjectionPort';
import { buildQueueProjectionRows } from '@/application/services/queue-projection/QueueProjectionBuilder';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { QueueType } from '@/types/unified-data-source';
import type {
  BrowserDeckCardPageResult,
  BrowserDeckPageRequest,
  BrowserDeckSnapshotQuery,
} from '@/application/queries/browser/browser-deck-query';
import type {
  BackendAutoCardDecisionResolveRequest,
  BackendAutoCardDecisionResolveResult,
  BackendQueueProjectionRowsByIdsRequest,
  BackendQueueProjectionRowsByIdsResult,
  BackendQueueProjectionReplaceRequest,
  BackendQueueProjectionReplaceResult,
  BackendQueueProjectionSnapshotRequest,
  BackendQueueProjectionSnapshotResult,
  BackendQueueProjectionSnapshotRow,
  BackendReviewFeedbackQueueImpact,
  BackendReviewFeedbackQueueImpactEntry,
  BackendReviewFeedbackQueueImpactReorderHint,
  BackendKernelTransactionAction,
  BackendKernelTransactionDequeueResult,
  BackendKernelTransactionIngestRequest,
  BackendKernelTransactionIngestResult,
  BackendKernelTransactionRequeueResult,
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
} from '../../packages/contracts/src/backend-rpc';
import type {
  SourceExistenceRefreshCandidate,
  SourceExistenceRefreshRequest,
  SourceExistenceSummary,
  SourceExistenceUpdate,
} from '@/application/ports/BrowserDeckReadPort';
import type { SqlitePersistenceBridge } from './SqlitePersistenceBridge';
import { DEFAULT_SETTINGS, type FSRSParameters } from '@/types/settings';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import { createLogger } from '@/utils/logger';
import type { DoOperation } from '@/core/infrastructure/websocket/transaction-types';
import { AutoCardDecisionService } from './AutoCardDecisionService';

type SqlParams = SqlValue[] | ParamsObject;
const logger = createLogger('WorkerSqliteDatabaseService');
const KERNEL_INGEST_QUEUE_SNAPSHOT_FILE = 'kernel-transaction-ingest.snapshot.json';
const KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION = 1;
const KERNEL_ACTION_QUEUE_SNAPSHOT_FILE = 'kernel-transaction-actions.snapshot.json';
const KERNEL_ACTION_QUEUE_SNAPSHOT_VERSION = 1;

type ProjectionWorkerQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning
  | QueueType.FilterGroup
  | QueueType.FinalDrill
  | QueueType.Leech
  | QueueType.NeuralRoam;

type SrsProjectionWorkerQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

type SqliteFileServiceAdapter = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  readBinary(fileName: string): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array): Promise<void>;
};

function createSqliteFileServiceAdapter(bridge: SqlitePersistenceBridge): SqliteFileServiceAdapter {
  return {
    readJSON: async <T>(fileName: string): Promise<T | null> => {
      if (!bridge.readJSON) {
        return null;
      }
      return bridge.readJSON<T>(fileName);
    },
    writeJSON: async (fileName: string, data: unknown): Promise<void> => {
      if (!bridge.writeJSON) {
        throw new Error(`JSON persistence is not available for ${fileName}`);
      }
      await bridge.writeJSON(fileName, data);
    },
    readBinary: (fileName: string) => bridge.readBinary(fileName),
    writeBinary: (fileName: string, bytes: Uint8Array) => bridge.writeBinary(fileName, bytes),
  };
}

function isProjectionWorkerQueueType(queueType: string): queueType is ProjectionWorkerQueueType {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning
    || queueType === QueueType.FilterGroup
    || queueType === QueueType.FinalDrill
    || queueType === QueueType.Leech
    || queueType === QueueType.NeuralRoam;
}

function isSrsProjectionQueueType(queueType: ProjectionWorkerQueueType): queueType is SrsProjectionWorkerQueueType {
  return queueType === QueueType.RetrievalPractice || queueType === QueueType.IncrementalLearning;
}

export class WorkerSqliteDatabaseService {
  private readonly fileService: SqliteFileServiceAdapter;
  private readonly runtime: RuntimeSqliteDatabaseService;
  private readonly autoCardDecisionService = new AutoCardDecisionService();
  private repository: SqlUnifiedStorageRepository | null = null;
  private queueProjection: SqlQueueProjectionRepository | null = null;
  private queueState: SqlQueueStateRepository | null = null;
  private initialized = false;
  private readonly kernelTransactionQueue: Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> = [];
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
  private autoCardDecisionTotal = 0;
  private autoCardDecisionSelectedTotal = 0;
  private autoCardDecisionSkippedTotal = 0;
  private autoCardDecisionNoOpTotal = 0;
  private autoCardDecisionUnavailableTotal = 0;
  private autoCardDecisionFailedTotal = 0;
  private autoCardExecuteTotal = 0;
  private autoCardExecuteCreatedTotal = 0;
  private autoCardExecuteSkippedTotal = 0;
  private autoCardExecuteUnavailableTotal = 0;
  private autoCardExecuteFailedTotal = 0;
  private reviewFeedbackTotal = 0;
  private reviewFeedbackCommittedTotal = 0;
  private reviewFeedbackPreviewTotal = 0;
  private reviewFeedbackUnavailableTotal = 0;
  private aiSessionCreateTotal = 0;
  private aiSessionUpdateTotal = 0;
  private aiSessionCancelTotal = 0;
  private aiStreamStartTotal = 0;
  private aiStreamCancelTotal = 0;
  private aiJobCreatedTotal = 0;
  private aiJobCompletedTotal = 0;
  private aiJobCanceledTotal = 0;
  private aiJobTimeoutTotal = 0;
  private aiJobFailedTotal = 0;
  private lastKernelAcceptedAt: number | null = null;
  private lastKernelDrainAt: number | null = null;
  private readonly maxKernelTransactionQueueLength: number;
  private readonly maxKernelQueuedTransactions: number;
  private readonly maxKernelActionQueueLength: number;
  private readonly kernelTransactionDedupeTtlMs: number;

  constructor(
    bridge: SqlitePersistenceBridge,
    private readonly dbFile = SQLITE_DB_FILE,
    options?: {
      maxKernelTransactionQueueLength?: number;
      maxKernelQueuedTransactions?: number;
      maxKernelActionQueueLength?: number;
      kernelTransactionDedupeTtlMs?: number;
    },
  ) {
    this.fileService = createSqliteFileServiceAdapter(bridge);
    this.runtime = new RuntimeSqliteDatabaseService(this.fileService, dbFile);
    this.maxKernelTransactionQueueLength = Math.max(
      1,
      Math.floor(Number(options?.maxKernelTransactionQueueLength ?? 256)),
    );
    this.maxKernelQueuedTransactions = Math.max(
      1,
      Math.floor(Number(options?.maxKernelQueuedTransactions ?? 8_192)),
    );
    this.maxKernelActionQueueLength = Math.max(
      8,
      Math.floor(Number(options?.maxKernelActionQueueLength ?? 4_096)),
    );
    this.kernelTransactionDedupeTtlMs = Math.max(
      5_000,
      Math.floor(Number(options?.kernelTransactionDedupeTtlMs ?? 120_000)),
    );
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.runtime.init();
    this.repository = new SqlUnifiedStorageRepository(this.runtime);
    this.queueProjection = new SqlQueueProjectionRepository(this.runtime);
    this.queueState = new SqlQueueStateRepository(this.runtime);
    await this.restoreKernelIngestQueueSnapshot();
    await this.restoreKernelActionQueueSnapshot();
    this.initialized = true;
  }

  async load(): Promise<{ ok: true; initialized: true; dbFile: string }> {
    await this.init();
    return {
      ok: true,
      initialized: true,
      dbFile: this.dbFile,
    };
  }

  async persist(): Promise<{ ok: true; persisted: true; dbFile: string }> {
    await this.init();
    await this.runtime.persist();
    return {
      ok: true,
      persisted: true,
      dbFile: this.dbFile,
    };
  }

  getStatus(): {
    initialized: boolean;
    dbFile: string;
    ingest: {
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
    autoCard: {
      decisionTotal: number;
      decisionSelectedTotal: number;
      decisionSkippedTotal: number;
      decisionNoOpTotal: number;
      decisionUnavailableTotal: number;
      decisionFailedTotal: number;
      executeTotal: number;
      executeCreatedTotal: number;
      executeSkippedTotal: number;
      executeUnavailableTotal: number;
      executeFailedTotal: number;
    };
    review: {
      feedbackTotal: number;
      feedbackCommittedTotal: number;
      feedbackPreviewTotal: number;
      feedbackUnavailableTotal: number;
    };
    ai: {
      sessionCreateTotal: number;
      sessionUpdateTotal: number;
      sessionCancelTotal: number;
      streamStartTotal: number;
      streamCancelTotal: number;
      jobCreatedTotal: number;
      jobCompletedTotal: number;
      jobCanceledTotal: number;
      jobTimeoutTotal: number;
      jobFailedTotal: number;
    };
  } {
    return {
      initialized: this.initialized,
      dbFile: this.dbFile,
      ingest: {
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
      },
      autoCard: {
        decisionTotal: this.autoCardDecisionTotal,
        decisionSelectedTotal: this.autoCardDecisionSelectedTotal,
        decisionSkippedTotal: this.autoCardDecisionSkippedTotal,
        decisionNoOpTotal: this.autoCardDecisionNoOpTotal,
        decisionUnavailableTotal: this.autoCardDecisionUnavailableTotal,
        decisionFailedTotal: this.autoCardDecisionFailedTotal,
        executeTotal: this.autoCardExecuteTotal,
        executeCreatedTotal: this.autoCardExecuteCreatedTotal,
        executeSkippedTotal: this.autoCardExecuteSkippedTotal,
        executeUnavailableTotal: this.autoCardExecuteUnavailableTotal,
        executeFailedTotal: this.autoCardExecuteFailedTotal,
      },
      review: {
        feedbackTotal: this.reviewFeedbackTotal,
        feedbackCommittedTotal: this.reviewFeedbackCommittedTotal,
        feedbackPreviewTotal: this.reviewFeedbackPreviewTotal,
        feedbackUnavailableTotal: this.reviewFeedbackUnavailableTotal,
      },
      ai: {
        sessionCreateTotal: this.aiSessionCreateTotal,
        sessionUpdateTotal: this.aiSessionUpdateTotal,
        sessionCancelTotal: this.aiSessionCancelTotal,
        streamStartTotal: this.aiStreamStartTotal,
        streamCancelTotal: this.aiStreamCancelTotal,
        jobCreatedTotal: this.aiJobCreatedTotal,
        jobCompletedTotal: this.aiJobCompletedTotal,
        jobCanceledTotal: this.aiJobCanceledTotal,
        jobTimeoutTotal: this.aiJobTimeoutTotal,
        jobFailedTotal: this.aiJobFailedTotal,
      },
    };
  }

  private async restoreKernelActionQueueSnapshot(): Promise<void> {
    try {
      const snapshot = await this.fileService.readJSON<{
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
      }>(KERNEL_ACTION_QUEUE_SNAPSHOT_FILE);
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
      const snapshot = await this.fileService.readJSON<{
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
      }>(KERNEL_INGEST_QUEUE_SNAPSHOT_FILE);
      if (!snapshot || snapshot.version !== KERNEL_INGEST_QUEUE_SNAPSHOT_VERSION) {
        return;
      }
      const now = Date.now();
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
      await this.fileService.writeJSON(KERNEL_INGEST_QUEUE_SNAPSHOT_FILE, {
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
      await this.fileService.writeJSON(KERNEL_ACTION_QUEUE_SNAPSHOT_FILE, {
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
        : Date.now();
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

  private normalizeKernelTransactionQueue(
    queue: unknown[],
  ): Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> {
    const normalized: Array<{
      source: 'kernel-sidecar' | 'ws-main';
      transactions: unknown[];
      receivedAt: number;
      idempotencyKey: string;
      acceptedAt: number;
    }> = [];
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
        : Date.now();
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

  async queryDeckPage(
    query: BrowserDeckSnapshotQuery,
    page: BrowserDeckPageRequest,
  ): Promise<BrowserDeckCardPageResult | null> {
    await this.init();
    return this.repository!.queryDeckPage(query, page);
  }

  async queryDeckMatchedIds(query: BrowserDeckSnapshotQuery): Promise<string[] | null> {
    await this.init();
    return this.repository!.queryDeckMatchedIds(query);
  }

  async getDeckRowsByIds(ids: string[]): Promise<FSRSCard[]> {
    await this.init();
    return this.repository!.getDeckCardsByIds(ids);
  }

  async queryCards(query?: StructuredCardQuery): Promise<FSRSCard[]> {
    await this.init();
    return this.repository!.queryCards(query);
  }

  async getQueueStateValue<T>(key: string): Promise<T | null> {
    await this.init();
    const values = this.queueState!.loadAll();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] as T : null;
  }

  async setQueueStateValue(key: string, value: unknown): Promise<void> {
    await this.init();
    this.queueState!.set(key, value);
    await this.queueState!.persist();
  }

  async queueProjectionSnapshot(
    request: BackendQueueProjectionSnapshotRequest,
  ): Promise<BackendQueueProjectionSnapshotResult> {
    await this.init();
    const queueType = this.resolveProjectionQueueType(request.queueType);
    if (!queueType || !this.queueProjection) {
      return this.buildUnavailableProjectionSnapshotResult(request.queueType);
    }

    const generation = this.queueProjection.readGeneration(queueType);
    if (!generation) {
      return this.buildUnavailableProjectionSnapshotResult(queueType);
    }

    const policyHash = normalizeOptionalString(request.policyHash) ?? generation.policyHash;
    const requestedGeneration = normalizeOptionalInteger(request.generation) ?? generation.generation;
    const counters = this.queueProjection.readCounters(queueType, policyHash);
    if (generation.status !== 'ready') {
      return {
        queueType,
        policyHash,
        generation: generation.generation,
        status: generation.status,
        rows: [],
        counters,
      };
    }

    const rows = this.queueProjection.readRows({
      queueType,
      policyHash,
      generation: requestedGeneration,
      limit: request.limit,
      offset: request.offset,
    });
    const cards = this.repository!.getCardsByIds(rows.map((row) => row.cardId));
    const snapshotRows = this.buildProjectionSnapshotRows(rows, cards);
    return {
      queueType,
      policyHash,
      generation: requestedGeneration,
      status: 'ready',
      rows: snapshotRows,
      counters: this.reconcileActiveProjectionCounters({
        queueType,
        policyHash,
        generation: requestedGeneration,
        counters,
        rows: snapshotRows,
      }),
    };
  }

  async queueProjectionRowsByIds(
    request: BackendQueueProjectionRowsByIdsRequest,
  ): Promise<BackendQueueProjectionRowsByIdsResult> {
    await this.init();
    const queueType = this.resolveProjectionQueueType(request.queueType);
    const ids = uniqueStrings(Array.isArray(request.ids) ? request.ids : []);
    if (!queueType || !this.queueProjection || ids.length === 0) {
      return {
        ...this.buildUnavailableProjectionSnapshotResult(request.queueType),
        cards: [],
      };
    }

    const generation = this.queueProjection.readGeneration(queueType);
    if (!generation) {
      return {
        ...this.buildUnavailableProjectionSnapshotResult(queueType),
        cards: [],
      };
    }

    const policyHash = normalizeOptionalString(request.policyHash) ?? generation.policyHash;
    const requestedGeneration = normalizeOptionalInteger(request.generation) ?? generation.generation;
    if (generation.status !== 'ready') {
      return {
        queueType,
        policyHash,
        generation: generation.generation,
        status: generation.status,
        rows: [],
        cards: [],
      };
    }

    const projectionRows = this.queueProjection.readRows({
      queueType,
      policyHash,
      generation: requestedGeneration,
      limit: 5000,
    });
    const rowByIdentity = new Map<string, QueueProjectionRow>();
    for (const row of projectionRows) {
      if (row.rowId) {
        rowByIdentity.set(row.rowId, row);
      }
      if (row.cardId) {
        rowByIdentity.set(row.cardId, row);
      }
      if (row.blockId) {
        rowByIdentity.set(row.blockId, row);
      }
    }

    const orderedRows = ids
      .map((id) => rowByIdentity.get(id))
      .filter((row): row is QueueProjectionRow => Boolean(row));
    const cards = this.repository!.getCardsByIds(orderedRows.map((row) => row.cardId));
    const activeCardIds = new Set(cards.map((card) => String(card.id || '').trim()).filter(Boolean));
    const activeRows = orderedRows.filter((row) => activeCardIds.has(String(row.cardId || '').trim()));
    return {
      queueType,
      policyHash,
      generation: requestedGeneration,
      status: 'ready',
      rows: this.buildProjectionSnapshotRows(activeRows, cards),
      cards,
    };
  }

  async replaceQueueProjection(
    request: BackendQueueProjectionReplaceRequest,
  ): Promise<BackendQueueProjectionReplaceResult> {
    await this.init();
    const queueType = this.resolveProjectionQueueType(request.queueType);
    if (!queueType || !this.queueProjection) {
      throw new Error(`BACKEND_UNAVAILABLE: queue projection storage unavailable for ${String(request.queueType || '')}`);
    }

    const policyHash = normalizeOptionalString(request.policyHash);
    if (!policyHash) {
      throw new Error('INVALID_REQUEST: queue.projection.replace requires policyHash');
    }

    const previousGeneration = this.queueProjection.readGeneration(queueType);
    const generation = normalizeOptionalInteger(request.generation)
      ?? Math.max(1, Number(previousGeneration?.generation || 0) + 1);
    if (!Number.isFinite(generation) || generation <= 0) {
      throw new Error('INVALID_REQUEST: queue.projection.replace requires a positive generation');
    }

    const updatedAt = Date.now();
    const rows = this.normalizeProjectionReplaceRows({
      queueType,
      policyHash,
      generation,
      rows: request.rows,
      updatedAt,
    });
    const counters = buildQueueProjectionCountersFromRows({
      queueType,
      policyHash,
      generation,
      updatedAt,
      now: updatedAt,
      rows,
    });
    const reason = normalizeOptionalString(request.reason) ?? 'explicit-repair';
    const metadata = request.metadata && typeof request.metadata === 'object'
      ? { ...request.metadata }
      : {};

    await this.runtime.runTransaction('queue.projection.replace', () => {
      this.queueProjection!.replaceQueueProjection({
        queueType,
        policyHash,
        generation,
        rows,
        counters,
        metadata: {
          ...metadata,
          reason,
          materializedBy: 'application',
        },
      });
    });

    return {
      queueType,
      policyHash,
      generation,
      status: 'ready',
      rows: rows.length,
      counters,
    };
  }

  async getCard(cardId: string): Promise<FSRSCard | undefined> {
    await this.init();
    return this.repository!.getCard(cardId);
  }

  async upsertCards(cards: FSRSCard[]): Promise<void> {
    await this.init();
    this.repository!.upsertCards(cards);
  }

  async countCards(query?: StructuredCardQuery): Promise<number> {
    await this.init();
    return this.repository!.countCards(query);
  }

  async getBrowserStats(now?: number): Promise<BrowserStats> {
    await this.init();
    return this.repository!.getBrowserStats(now);
  }

  async getSourceExistenceRefreshCandidates(
    request?: SourceExistenceRefreshRequest,
  ): Promise<SourceExistenceRefreshCandidate[]> {
    await this.init();
    return this.repository!.getSourceExistenceRefreshCandidates(request);
  }

  async updateSourceExistence(
    updates: SourceExistenceUpdate[],
    checkedAt?: number,
  ): Promise<void> {
    await this.init();
    const previousStatus = this.repository!.getSourceExistenceByBlockIds(
      updates.map((update) => update.blockId),
    );
    await this.repository!.updateSourceExistence(updates, checkedAt);
    const changedBlockIds = uniqueStrings(updates
      .filter((update) => {
        const previous = previousStatus.has(update.blockId)
          ? previousStatus.get(update.blockId)
          : null;
        return previous !== update.exists;
      })
      .map((update) => update.blockId));
    this.invalidateQueueProjectionsForSourceChanges(changedBlockIds, checkedAt ?? Date.now());
  }

  async getSourceExistenceByBlockIds(
    blockIds: string[],
  ): Promise<Array<{ blockId: string; exists: boolean | null }>> {
    await this.init();
    const statusByBlockId = this.repository!.getSourceExistenceByBlockIds(blockIds);
    return Array.from(statusByBlockId.entries())
      .map(([blockId, exists]) => ({ blockId, exists }));
  }

  async getSourceExistenceSummary(staleBefore?: number): Promise<SourceExistenceSummary> {
    await this.init();
    return this.repository!.getSourceExistenceSummary(staleBefore);
  }

  async applySourceExistenceSweep(
    request: SourceExistenceRefreshRequest = {},
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean; changedBlockIds: string[] }> {
    await this.init();

    const candidates = this.repository!.getSourceExistenceRefreshCandidates(request);
    return this.applySourceExistenceSweepFromCandidates(candidates, existingBlockIds, checkedAt);
  }

  async applySourceExistenceSweepFromCandidates(
    candidates: SourceExistenceRefreshCandidate[],
    existingBlockIds: string[],
    checkedAt = Date.now(),
  ): Promise<{ checked: number; updated: number; changed: boolean; changedToMissing: boolean; changedBlockIds: string[] }> {
    await this.init();

    if (candidates.length === 0) {
      return { checked: 0, updated: 0, changed: false, changedToMissing: false, changedBlockIds: [] };
    }

    const existingSet = new Set(
      existingBlockIds
        .map((blockId) => String(blockId || '').trim())
        .filter(Boolean),
    );

    let changed = false;
    let changedToMissing = false;
    const changedBlockIds: string[] = [];
    const updates: SourceExistenceUpdate[] = [];
    for (const candidate of candidates) {
      const exists = existingSet.has(candidate.blockId);
      if (candidate.sourceExists !== exists) {
        changed = true;
        changedBlockIds.push(candidate.blockId);
        if (!exists) {
          changedToMissing = true;
        }
      }
      updates.push({
        cardId: candidate.cardId,
        blockId: candidate.blockId,
        exists,
      });
    }

    await this.repository!.updateSourceExistence(updates, checkedAt);
    if (changedBlockIds.length > 0) {
      this.invalidateQueueProjectionsForSourceChanges(changedBlockIds, checkedAt);
    }

    return {
      checked: candidates.length,
      updated: updates.length,
      changed,
      changedToMissing,
      changedBlockIds,
    };
  }

  async getQueueProjectionGeneration(queueType: string): Promise<QueueProjectionGeneration | null> {
    await this.init();
    const projectionQueueType = this.resolveProjectionQueueType(queueType);
    if (!projectionQueueType || !this.queueProjection) {
      return null;
    }
    return this.queueProjection.readGeneration(projectionQueueType);
  }

  async reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult> {
    await this.init();
    const queueType = String(request.queueType || 'retrieval-practice').trim() || 'retrieval-practice';
    const defaultCommitPolicy = queueType === 'final-drill' ? 'drill-only' : 'write-schedule';
    const commitPolicy = String(request.commitPolicy || defaultCommitPolicy).trim() || defaultCommitPolicy;
    const defaultQueueMode = queueType === 'filter-group'
      ? (commitPolicy === 'preview-only' ? 'filtered-preview' : 'filtered-rescheduling')
      : (queueType === 'final-drill' ? 'drill' : 'formal');
    const queueMode = String(request.queueMode || defaultQueueMode).trim() || defaultQueueMode;
    const reviewedAt = Number(request.reviewedAt || Date.now());
    const rating = Math.max(1, Math.min(4, Math.floor(Number(request.rating) || 0))) as 1 | 2 | 3 | 4;
    const cardId = String(request.cardId || '').trim();
    if (!cardId) {
      this.reviewFeedbackUnavailableTotal += 1;
      throw new Error('review.feedback requires cardId');
    }
    const supportedQueueTypes = new Set([
      'retrieval-practice',
      'incremental-learning',
      'filter-group',
      'neural-roam',
      'leech',
      'final-drill',
    ]);
    if (!supportedQueueTypes.has(queueType)) {
      this.reviewFeedbackUnavailableTotal += 1;
      throw new Error(`SrsBackendWorker review.feedback unavailable for queueType in current phase: ${queueType}`);
    }
    if (queueType === 'filter-group') {
      const allowed = (
        (queueMode === 'filtered-preview' && commitPolicy === 'preview-only')
        || (queueMode === 'filtered-rescheduling' && commitPolicy === 'write-schedule')
      );
      if (!allowed) {
        this.reviewFeedbackUnavailableTotal += 1;
        throw new Error(
          `SrsBackendWorker review.feedback unavailable for filter-group mode/policy in current phase: `
          + `${queueMode}/${commitPolicy}`,
        );
      }
    } else if (queueType === 'final-drill') {
      if (queueMode !== 'drill' || commitPolicy !== 'drill-only') {
        this.reviewFeedbackUnavailableTotal += 1;
        throw new Error(
          `SrsBackendWorker review.feedback unavailable for final-drill mode/policy in current phase: `
          + `${queueMode}/${commitPolicy}`,
        );
      }
    } else {
      if (queueMode !== 'formal') {
        this.reviewFeedbackUnavailableTotal += 1;
        throw new Error(`SrsBackendWorker review.feedback unavailable for queueMode in current phase: ${queueMode}`);
      }
      if (commitPolicy !== 'write-schedule') {
        this.reviewFeedbackUnavailableTotal += 1;
        throw new Error(`SrsBackendWorker review.feedback unavailable for commitPolicy in current phase: ${commitPolicy}`);
      }
    }

    const schedulerConfig = resolveWorkerReviewSchedulerConfig(request);
    const result = await this.runtime.runTransaction('review.feedback', async () => {
      const card = this.repository!.getCard(cardId);
      if (!card) {
        throw new Error(`review.feedback card not found: ${cardId}`);
      }

      const scheduler = new SchedulerRouter(
        {
          defaultScheduler: schedulerConfig.defaultScheduler,
          fsrsParams: schedulerConfig.fsrsParams,
        },
        {
          batchUpdateCardsWithoutEvents: async (cards) => {
            this.repository!.upsertCards(
              cards.map((c) => canonicalizeSchedulingState(c, {
                source: 'review-commit',
                mode: 'assert-internal',
              }).card),
            );
          },
          addReviewLogV2: async () => undefined,
        },
      );

      const decision = scheduler.answer(card, rating, {
        queueType,
        queueMode,
        commitPolicy: commitPolicy as 'write-schedule' | 'preview-only' | 'drill-only',
        source: 'queue',
        sessionId: request.sessionId,
        reviewTime: reviewedAt,
      });
      const commitResult = await scheduler.commit(decision);
      if (commitResult.committed && commitResult.updatedCard) {
        const log = createReviewLogV2({
          attemptId: decision.attempt.id,
          cardId: decision.attempt.cardId,
          rating: decision.attempt.rating,
          reviewedAt: decision.attempt.reviewedAt,
          before: decision.before,
          after: commitResult.updatedCard,
          elapsedMs: decision.attempt.elapsedMs,
          queueType: decision.attempt.queueType,
          queueMode: decision.queueMode,
          source: decision.attempt.source,
          algorithm: decision.algorithm,
          schedulerType: decision.schedulerType,
          commitPolicy: decision.commitPolicy,
          isDrill: decision.attempt.isDrill,
          isFiltered: decision.attempt.isFiltered,
          customStudy: decision.attempt.customStudy,
        });
        const month = new Date(log.reviewedAt);
        this.runtime.run(
          `INSERT OR REPLACE INTO review_events
            (id, card_id, attempt_id, rating, reviewed_at, year, month, event_type, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            log.cardId,
            log.attemptId,
            log.rating,
            log.reviewedAt,
            month.getFullYear(),
            month.getMonth() + 1,
            'review-v2',
            JSON.stringify(log),
          ],
        );
      }
      const queueImpact = this.buildReviewFeedbackQueueImpact({
        queueType,
        request,
        reviewedCard: card,
        reviewedAt,
        committed: commitResult.committed,
        updatedCard: commitResult.updatedCard ?? null,
      });

      return {
        cardId,
        committed: commitResult.committed,
        reviewedAt,
        queueType,
        updatedCard: commitResult.updatedCard ?? null,
        queueImpact,
      };
    });
    this.reviewFeedbackTotal += 1;
    if (result.committed) {
      this.reviewFeedbackCommittedTotal += 1;
    } else {
      this.reviewFeedbackPreviewTotal += 1;
    }
    return result;
  }

  private buildReviewFeedbackQueueImpact(input: {
    queueType: string;
    request: BackendReviewFeedbackRequest;
    reviewedCard: FSRSCard;
    reviewedAt: number;
    committed: boolean;
    updatedCard: FSRSCard | null;
  }): BackendReviewFeedbackQueueImpact | null {
    const projectionQueueType = this.resolveProjectionQueueType(input.queueType);
    if (!projectionQueueType) {
      return null;
    }
    if (isSrsProjectionQueueType(projectionQueueType) && (!input.committed || !input.updatedCard)) {
      return null;
    }

    if (!this.queueProjection) {
      return this.buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'projection-unavailable',
        requestedGeneration: normalizeOptionalInteger(input.request.projectionGeneration),
      });
    }

    const currentGeneration = this.queueProjection.readGeneration(projectionQueueType);
    if (!currentGeneration) {
      return this.buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'projection-unavailable',
        requestedGeneration: normalizeOptionalInteger(input.request.projectionGeneration),
      });
    }

    if (currentGeneration.status !== 'ready') {
      return this.buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'projection-invalidated',
        policyHash: currentGeneration.policyHash,
        currentGeneration: currentGeneration.generation,
        requestedGeneration: normalizeOptionalInteger(input.request.projectionGeneration),
      });
    }

    const requestedGeneration = normalizeOptionalInteger(input.request.projectionGeneration);
    const requestedPolicyHash = normalizeOptionalString(input.request.projectionPolicyHash);
    const hasGenerationMismatch = (
      (requestedGeneration !== null && requestedGeneration !== currentGeneration.generation)
      || (requestedPolicyHash !== null && requestedPolicyHash !== currentGeneration.policyHash)
    );

    const policyHash = currentGeneration.policyHash;
    if (!isSrsProjectionQueueType(projectionQueueType)) {
      return this.buildDeferredReviewFeedbackQueueImpact({
        queueType: projectionQueueType,
        policyHash,
        requestedGeneration,
        requestedCurrentGeneration: currentGeneration.generation,
        hasGenerationMismatch,
        request: input.request,
        reviewedCard: input.reviewedCard,
        committed: input.committed,
        reviewedAt: input.reviewedAt,
      });
    }

    const previousRows = this.queueProjection.readRows({
      queueType: projectionQueueType,
      policyHash,
      limit: 5000,
    });
    const nextGeneration = currentGeneration.generation + 1;
    const updatedAt = input.reviewedAt;
    const dayEnd = getDayEndForTimestamp(
      input.reviewedAt,
      normalizeDayStartHour(DEFAULT_SETTINGS.fsrs.dayStartHour),
    );
    const baseCards = this.readProjectionSourceCards(projectionQueueType, dayEnd);
    const buildResult = buildQueueProjectionRows({
      queueType: projectionQueueType,
      baseCards,
      now: input.reviewedAt,
      dayEnd,
      newCardsPerDay: DEFAULT_SETTINGS.newCardsPerDay,
      reviewsPerDay: DEFAULT_SETTINGS.reviewsPerDay,
      priorityRandomness: DEFAULT_SETTINGS.priorityRandomness,
      stableSalt: `${projectionQueueType}:${policyHash}`,
      policyHash,
      sourceGeneration: nextGeneration,
      updatedAt,
    });

    const nextRows = buildResult.rows;
    const delta = buildQueueProjectionDelta({
      previousRows,
      nextRows,
    });

    this.queueProjection.applyQueueProjectionDelta({
      queueType: projectionQueueType,
      policyHash,
      generation: nextGeneration,
      removeRowIds: delta.removedRowIds,
      upsertRows: nextRows,
      counters: buildResult.counters,
      invalidation: {
        queueType: projectionQueueType,
        reason: 'review-feedback',
        affectedCardIds: [input.updatedCard.id],
        affectedBlockIds: input.updatedCard.blockId ? [input.updatedCard.blockId] : [],
        generation: nextGeneration,
        metadata: {
          reviewedCardId: input.updatedCard.id,
          hotPatchable: true,
        },
      },
    });

    if (hasGenerationMismatch) {
      return this.buildRefreshRequiredQueueImpact({
        queueType: projectionQueueType,
        reason: 'generation-mismatch',
        policyHash,
        currentGeneration: nextGeneration,
        requestedGeneration,
      });
    }

    const affectedQueue: BackendReviewFeedbackQueueImpactEntry = {
      queueType: projectionQueueType,
      policyHash,
      generation: nextGeneration,
      currentGeneration: nextGeneration,
      requestedGeneration: requestedGeneration ?? currentGeneration.generation,
      hotPatchable: true,
      refreshRequired: false,
      reason: 'review-feedback',
      removedRowIds: delta.removedRowIds,
      insertedRows: delta.insertedRows,
      updatedRows: delta.updatedRows,
      reorderHints: delta.reorderHints,
      counterGeneration: buildResult.counters.generation,
      counters: buildResult.counters,
    };

    return {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [affectedQueue],
    };
  }

  private buildDeferredReviewFeedbackQueueImpact(input: {
    queueType: ProjectionWorkerQueueType;
    policyHash: string;
    requestedGeneration: number | null;
    requestedCurrentGeneration: number;
    hasGenerationMismatch: boolean;
    request: BackendReviewFeedbackRequest;
    reviewedCard: FSRSCard;
    committed: boolean;
    reviewedAt: number;
  }): BackendReviewFeedbackQueueImpact {
    if (!this.queueProjection) {
      return this.buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'projection-unavailable',
        requestedGeneration: input.requestedGeneration,
      });
    }

    const previousRows = this.queueProjection.readRows({
      queueType: input.queueType,
      policyHash: input.policyHash,
      limit: 5000,
    });
    const nextGeneration = input.requestedCurrentGeneration + 1;
    const nextRows = buildDeferredReviewFeedbackNextRows({
      queueType: input.queueType,
      previousRows,
      reviewedCard: input.reviewedCard,
      rating: Number(input.request.rating),
      nextGeneration,
      updatedAt: input.reviewedAt,
    });
    if (!nextRows) {
      return this.buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'review-feedback',
        policyHash: input.policyHash,
        currentGeneration: input.requestedCurrentGeneration,
        requestedGeneration: input.requestedGeneration,
      });
    }

    const delta = buildQueueProjectionDelta({
      previousRows,
      nextRows,
    });
    const counters = buildQueueProjectionCountersFromRows({
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: nextGeneration,
      updatedAt: input.reviewedAt,
      now: input.reviewedAt,
      rows: nextRows,
    });

    this.queueProjection.applyQueueProjectionDelta({
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: nextGeneration,
      removeRowIds: delta.removedRowIds,
      upsertRows: nextRows,
      counters,
      invalidation: {
        queueType: input.queueType,
        reason: 'review-feedback',
        affectedCardIds: [input.reviewedCard.id],
        affectedBlockIds: input.reviewedCard.blockId ? [input.reviewedCard.blockId] : [],
        generation: nextGeneration,
        metadata: {
          reviewedCardId: input.reviewedCard.id,
          committed: input.committed,
          commitPolicy: input.request.commitPolicy ?? null,
          hotPatchable: true,
        },
      },
    });

    if (input.hasGenerationMismatch) {
      return this.buildRefreshRequiredQueueImpact({
        queueType: input.queueType,
        reason: 'generation-mismatch',
        policyHash: input.policyHash,
        currentGeneration: nextGeneration,
        requestedGeneration: input.requestedGeneration,
      });
    }

    const affectedQueue: BackendReviewFeedbackQueueImpactEntry = {
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: nextGeneration,
      currentGeneration: nextGeneration,
      requestedGeneration: input.requestedGeneration ?? input.requestedCurrentGeneration,
      hotPatchable: true,
      refreshRequired: false,
      reason: 'review-feedback',
      removedRowIds: delta.removedRowIds,
      insertedRows: delta.insertedRows,
      updatedRows: delta.updatedRows,
      reorderHints: delta.reorderHints,
      counterGeneration: counters.generation,
      counters,
    };

    return {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [affectedQueue],
    };
  }

  private buildRefreshRequiredQueueImpact(input: {
    queueType: QueueType;
    reason: BackendReviewFeedbackQueueImpactEntry['reason'];
    policyHash?: string | null;
    currentGeneration?: number | null;
    requestedGeneration?: number | null;
  }): BackendReviewFeedbackQueueImpact {
    return {
      hotPatchable: false,
      refreshRequired: true,
      affectedQueues: [{
        queueType: input.queueType,
        policyHash: input.policyHash ?? null,
        generation: input.currentGeneration ?? null,
        currentGeneration: input.currentGeneration ?? null,
        requestedGeneration: input.requestedGeneration ?? null,
        hotPatchable: false,
        refreshRequired: true,
        reason: input.reason,
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: null,
        counters: null,
      }],
    };
  }

  private resolveProjectionQueueType(queueType: string): ProjectionWorkerQueueType | null {
    if (isProjectionWorkerQueueType(queueType)) {
      return queueType;
    }
    return null;
  }

  private invalidateQueueProjectionsForSourceChanges(blockIds: string[], checkedAt: number): void {
    const affectedBlockIds = uniqueStrings(blockIds);
    if (!this.queueProjection || affectedBlockIds.length === 0) {
      return;
    }
    this.queueProjection.invalidateQueues({
      queueTypes: [
        QueueType.RetrievalPractice,
        QueueType.IncrementalLearning,
        QueueType.FilterGroup,
        QueueType.FinalDrill,
        QueueType.Leech,
        QueueType.NeuralRoam,
      ],
      reason: 'source-existence-changed',
      affectedBlockIds,
      generation: Math.max(1, Math.floor(Number(checkedAt) || Date.now())),
      createdAt: checkedAt,
      metadata: {
        source: 'source-existence-sweep',
      },
    });
  }

  private buildUnavailableProjectionSnapshotResult(queueType: unknown): BackendQueueProjectionSnapshotResult {
    return {
      queueType: String(queueType || ''),
      policyHash: null,
      generation: null,
      status: 'unavailable',
      rows: [],
      counters: null,
    };
  }

  private normalizeProjectionReplaceRows(input: {
    queueType: ProjectionWorkerQueueType;
    policyHash: string;
    generation: number;
    rows: unknown;
    updatedAt: number;
  }): QueueProjectionRow[] {
    if (!Array.isArray(input.rows)) {
      throw new Error('INVALID_REQUEST: queue.projection.replace requires rows array');
    }

    return input.rows.map((candidate, index) => {
      if (!candidate || typeof candidate !== 'object') {
        throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} must be an object`);
      }
      const row = candidate as Record<string, unknown>;
      const rowId = normalizeOptionalString(row.rowId);
      const cardId = normalizeOptionalString(row.cardId);
      const membershipReason = normalizeOptionalString(row.membershipReason);
      const sortKey = normalizeOptionalString(row.sortKey);
      const dueBucket = normalizeProjectionDueBucket(row.dueBucket);
      if (!rowId || !cardId || !membershipReason || !sortKey || !dueBucket) {
        throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} is missing required projection fields`);
      }
      const priorityScore = Number(row.priorityScore);
      if (!Number.isFinite(priorityScore)) {
        throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} priorityScore must be finite`);
      }
      const payload = row.payload && typeof row.payload === 'object'
        ? { ...(row.payload as Record<string, unknown>) }
        : null;
      if (!payload) {
        throw new Error(`INVALID_REQUEST: queue.projection.replace row ${index} payload must be an object`);
      }

      return {
        queueType: input.queueType,
        rowId,
        cardId,
        blockId: normalizeOptionalString(row.blockId),
        deckId: normalizeOptionalString(row.deckId),
        membershipReason,
        dueAt: normalizeOptionalInteger(row.dueAt),
        dueBucket,
        priorityScore,
        sortKey,
        queueIndexHint: normalizeOptionalInteger(row.queueIndexHint),
        policyHash: input.policyHash,
        sourceGeneration: input.generation,
        payload,
        updatedAt: normalizeOptionalInteger(row.updatedAt) ?? input.updatedAt,
      };
    });
  }

  private buildProjectionSnapshotRows(
    projectionRows: QueueProjectionRow[],
    cards: FSRSCard[],
  ): BackendQueueProjectionSnapshotRow[] {
    const cardById = new Map<string, FSRSCard>();
    for (const card of cards) {
      cardById.set(String(card.id || ''), card);
    }

    return projectionRows
      .map<BackendQueueProjectionSnapshotRow | null>((row, index) => {
        const card = cardById.get(row.cardId);
        if (!card) {
          return null;
        }
        const queueIndex = Number.isFinite(Number(row.queueIndexHint))
          ? Number(row.queueIndexHint)
          : index + 1;
        const snapshot = buildQueueSnapshotRow(card, { queueIndex });
        return {
          ...snapshot,
          id: row.rowId || snapshot.id,
          fsrsCardId: row.cardId || snapshot.fsrsCardId,
          blockId: row.blockId || snapshot.blockId,
          deckId: row.deckId || snapshot.deckId,
          queueIndex,
          tags: [...snapshot.tags],
        };
      })
      .filter((row): row is BackendQueueProjectionSnapshotRow => Boolean(row));
  }

  private reconcileActiveProjectionCounters(input: {
    queueType: ProjectionWorkerQueueType;
    policyHash: string;
    generation: number;
    counters: BackendQueueProjectionSnapshotResult['counters'];
    rows: BackendQueueProjectionSnapshotRow[];
  }): BackendQueueProjectionSnapshotResult['counters'] {
    const buckets = {
      all: 0,
      item: 0,
      descriptor: 0,
      topic: 0,
      concept: 0,
    };
    const now = Date.now();
    let due = 0;
    for (const row of input.rows) {
      buckets.all += 1;
      const cardType = String(row.cardType || '').trim();
      if (cardType === CardType.Descriptor) {
        buckets.descriptor += 1;
      } else if (cardType === CardType.Topic) {
        buckets.topic += 1;
      } else if (cardType === CardType.Concept) {
        buckets.concept += 1;
      } else {
        buckets.item += 1;
      }
      if (Number(row.due) <= now) {
        due += 1;
      }
    }

    return {
      queueType: input.queueType,
      policyHash: input.policyHash,
      generation: input.generation,
      version: Math.max(0, Math.floor(Number(input.counters?.version || input.generation))),
      remaining: input.rows.length,
      due,
      total: input.rows.length,
      buckets,
      updatedAt: Math.max(0, Math.floor(Number(input.counters?.updatedAt || now))),
    };
  }

  private readProjectionSourceCards(
    queueType: SrsProjectionWorkerQueueType,
    dayEnd: number,
  ): FSRSCard[] {
    const cardTypes = queueType === QueueType.RetrievalPractice
      ? [CardType.Item, CardType.Descriptor]
      : [
        CardType.Item,
        CardType.Descriptor,
        CardType.Topic,
        CardType.Concept,
        CardType.Incremental,
        CardType.Webpage,
      ];
    return this.repository!.queryCards({
      cardTypes,
      dueDate: { lte: dayEnd },
      includeSuspended: false,
      sourceStatus: 'active',
    });
  }

  async resolveAutoCardDecision(
    request: BackendAutoCardDecisionResolveRequest,
  ): Promise<BackendAutoCardDecisionResolveResult> {
    await this.init();
    const result = this.autoCardDecisionService.resolve(request);
    this.autoCardDecisionTotal += 1;
    if (result.status === 'selected') {
      this.autoCardDecisionSelectedTotal += 1;
    } else if (result.status === 'skipped') {
      this.autoCardDecisionSkippedTotal += 1;
    } else if (result.status === 'no-op') {
      this.autoCardDecisionNoOpTotal += 1;
    } else if (result.status === 'unavailable') {
      this.autoCardDecisionUnavailableTotal += 1;
    } else if (result.status === 'failed') {
      this.autoCardDecisionFailedTotal += 1;
    }
    return result;
  }

  recordAutoCardExecuteOutcome(input: {
    status: 'created' | 'skipped' | 'no-op' | 'unavailable' | 'failed';
    created?: number;
    skipped?: number;
  }): void {
    this.autoCardExecuteTotal += 1;
    this.autoCardExecuteCreatedTotal += Math.max(0, Math.floor(Number(input.created || 0)));
    this.autoCardExecuteSkippedTotal += Math.max(0, Math.floor(Number(input.skipped || 0)));
    if (input.status === 'unavailable') {
      this.autoCardExecuteUnavailableTotal += 1;
    }
    if (input.status === 'failed') {
      this.autoCardExecuteFailedTotal += 1;
    }
  }

  recordAiSessionOutcome(status: 'create' | 'update' | 'cancel'): void {
    if (status === 'create') {
      this.aiSessionCreateTotal += 1;
      return;
    }
    if (status === 'update') {
      this.aiSessionUpdateTotal += 1;
      return;
    }
    this.aiSessionCancelTotal += 1;
  }

  recordAiStreamOutcome(status: 'start' | 'cancel'): void {
    if (status === 'start') {
      this.aiStreamStartTotal += 1;
      return;
    }
    this.aiStreamCancelTotal += 1;
  }

  recordAiJobOutcome(status: 'created' | 'completed' | 'canceled' | 'timeout' | 'failed'): void {
    if (status === 'created') {
      this.aiJobCreatedTotal += 1;
      return;
    }
    if (status === 'completed') {
      this.aiJobCompletedTotal += 1;
      return;
    }
    if (status === 'canceled') {
      this.aiJobCanceledTotal += 1;
      return;
    }
    if (status === 'timeout') {
      this.aiJobTimeoutTotal += 1;
      return;
    }
    this.aiJobFailedTotal += 1;
  }

  async ingestKernelTransactions(
    request: BackendKernelTransactionIngestRequest,
  ): Promise<BackendKernelTransactionIngestResult> {
    await this.init();

    const now = Date.now();
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
    await this.init();
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
    await this.init();
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

  drainKernelTransactions(maxTransactions = 256): Array<{
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    idempotencyKey: string;
    acceptedAt: number;
  }> {
    const budget = Math.max(1, Math.floor(Number(maxTransactions) || 0));
    let consumed = 0;
    const drained: Array<{
      source: 'kernel-sidecar' | 'ws-main';
      transactions: unknown[];
      receivedAt: number;
      idempotencyKey: string;
      acceptedAt: number;
    }> = [];

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
      this.lastKernelDrainAt = Date.now();
      void this.persistKernelIngestQueueSnapshot();
      logger.debug('Drained kernel transaction batch', {
        envelopes: drained.length,
        transactions: consumed,
        remaining: this.kernelQueuedTransactions,
      });
    }

    return drained;
  }

  private cleanupKernelTransactionDeduplication(now: number): void {
    for (const [key, expiresAt] of this.recentKernelTransactionKeys.entries()) {
      if (expiresAt <= now) {
        this.recentKernelTransactionKeys.delete(key);
      }
    }
  }

  private normalizeKernelTransactionSource(source: unknown): 'kernel-sidecar' | 'ws-main' {
    return source === 'kernel-sidecar' ? 'kernel-sidecar' : 'ws-main';
  }

  private resolveKernelTransactionIdempotencyKey(input: {
    source: 'kernel-sidecar' | 'ws-main';
    transactions: unknown[];
    receivedAt: number;
    requestIdempotencyKey?: string;
  }): string {
    const explicit = String(input.requestIdempotencyKey || '').trim();
    if (explicit) {
      return explicit.slice(0, 256);
    }
    const signatureRaw = JSON.stringify(input.transactions) || '[]';
    const signature = this.fnv1a32(signatureRaw);
    return `${input.source}:${input.receivedAt}:${input.transactions.length}:${signature}`;
  }

  private fnv1a32(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  async runTransaction<T>(
    label: string,
    writer: (db: Database) => T | Promise<T>,
  ): Promise<T> {
    await this.init();
    return this.runtime.runTransaction(label, writer);
  }

  getOne<T extends Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null {
    return this.runtime.getOne<T>(sql, params);
  }

  dispose(): void {
    void this.persistKernelIngestQueueSnapshot();
    void this.persistKernelActionQueueSnapshot();
    this.runtime.dispose();
    this.repository = null;
    this.initialized = false;
  }
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function collectKernelTransactionActions(input: {
  source: 'kernel-sidecar' | 'ws-main';
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

function buildQueueProjectionDelta(input: {
  previousRows: QueueProjectionRow[];
  nextRows: QueueProjectionRow[];
}): {
  removedRowIds: string[];
  insertedRows: QueueProjectionRow[];
  updatedRows: QueueProjectionRow[];
  reorderHints: BackendReviewFeedbackQueueImpactReorderHint[];
} {
  const previousByRowId = new Map(input.previousRows.map((row) => [row.rowId, row] as const));
  const nextByRowId = new Map(input.nextRows.map((row) => [row.rowId, row] as const));
  const removedRowIds = input.previousRows
    .filter((row) => !nextByRowId.has(row.rowId))
    .map((row) => row.rowId);
  const insertedRows: QueueProjectionRow[] = [];
  const updatedRows: QueueProjectionRow[] = [];
  const reorderHints: BackendReviewFeedbackQueueImpactReorderHint[] = [];

  for (const nextRow of input.nextRows) {
    const previousRow = previousByRowId.get(nextRow.rowId);
    if (!previousRow) {
      insertedRows.push(nextRow);
      reorderHints.push({
        rowId: nextRow.rowId,
        cardId: nextRow.cardId,
        sortKey: nextRow.sortKey,
        queueIndexHint: nextRow.queueIndexHint,
        reason: 'inserted',
      });
      continue;
    }

    if (queueProjectionRowSignature(previousRow) !== queueProjectionRowSignature(nextRow)) {
      updatedRows.push(nextRow);
      if (
        previousRow.sortKey !== nextRow.sortKey
        || previousRow.queueIndexHint !== nextRow.queueIndexHint
      ) {
        reorderHints.push({
          rowId: nextRow.rowId,
          cardId: nextRow.cardId,
          sortKey: nextRow.sortKey,
          queueIndexHint: nextRow.queueIndexHint,
          previousSortKey: previousRow.sortKey,
          previousQueueIndexHint: previousRow.queueIndexHint,
          reason: 'updated',
        });
      }
    }
  }

  for (const rowId of removedRowIds) {
    const previousRow = previousByRowId.get(rowId);
    if (previousRow) {
      reorderHints.push({
        rowId,
        cardId: previousRow.cardId,
        sortKey: null,
        queueIndexHint: null,
        previousSortKey: previousRow.sortKey,
        previousQueueIndexHint: previousRow.queueIndexHint,
        reason: 'removed',
      });
    }
  }

  return {
    removedRowIds,
    insertedRows,
    updatedRows,
    reorderHints,
  };
}

function queueProjectionRowSignature(row: QueueProjectionRow): string {
  return JSON.stringify({
    cardId: row.cardId,
    blockId: row.blockId,
    deckId: row.deckId,
    membershipReason: row.membershipReason,
    dueAt: row.dueAt,
    dueBucket: row.dueBucket,
    priorityScore: row.priorityScore,
    sortKey: row.sortKey,
    queueIndexHint: row.queueIndexHint,
    payload: row.payload,
  });
}

function buildDeferredReviewFeedbackNextRows(input: {
  queueType: ProjectionWorkerQueueType;
  previousRows: QueueProjectionRow[];
  reviewedCard: FSRSCard;
  rating: number;
  nextGeneration: number;
  updatedAt: number;
}): QueueProjectionRow[] | null {
  const targetRows = input.previousRows.filter((row) => rowMatchesReviewedCard(row, input.reviewedCard));
  if (targetRows.length === 0) {
    return null;
  }

  const remainingRows = input.previousRows.filter((row) => !rowMatchesReviewedCard(row, input.reviewedCard));
  const shouldMoveFinalDrillToTail = input.queueType === QueueType.FinalDrill && input.rating < 4;
  const nextRows = shouldMoveFinalDrillToTail
    ? [...remainingRows, ...targetRows]
    : remainingRows;

  return reindexDeferredProjectionRows(nextRows, {
    nextGeneration: input.nextGeneration,
    updatedAt: input.updatedAt,
  });
}

function rowMatchesReviewedCard(row: QueueProjectionRow, card: FSRSCard): boolean {
  const identities = new Set(
    [card.id, card.blockId, card.riffCardId]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );
  return identities.has(String(row.rowId || '').trim())
    || identities.has(String(row.cardId || '').trim())
    || identities.has(String(row.blockId || '').trim());
}

function reindexDeferredProjectionRows(
  rows: QueueProjectionRow[],
  input: { nextGeneration: number; updatedAt: number },
): QueueProjectionRow[] {
  return rows.map((row, index) => {
    const queueIndexHint = index + 1;
    return {
      ...row,
      queueIndexHint,
      sortKey: buildProjectionSortKeyFromRow(row, queueIndexHint),
      sourceGeneration: input.nextGeneration,
      updatedAt: input.updatedAt,
      payload: {
        ...row.payload,
        queueIndexHint,
      },
    };
  });
}

function buildProjectionSortKeyFromRow(row: QueueProjectionRow, queueIndexHint: number): string {
  const indexPart = String(queueIndexHint).padStart(9, '0');
  const duePart = String(Math.max(0, Number(row.dueAt) || 0)).padStart(16, '0');
  const priorityPart = String(Math.max(0, Math.min(100, Math.floor(Number(row.priorityScore) || 0)))).padStart(3, '0');
  return `${indexPart}:${duePart}:${priorityPart}:${row.rowId || row.cardId}`;
}

function buildQueueProjectionCountersFromRows(input: {
  queueType: QueueType;
  policyHash: string;
  generation: number;
  updatedAt: number;
  now: number;
  rows: QueueProjectionRow[];
}): QueueProjectionCounters {
  const buckets = {
    all: 0,
    item: 0,
    descriptor: 0,
    topic: 0,
    concept: 0,
  };
  let due = 0;

  for (const row of input.rows) {
    buckets.all += 1;
    buckets[resolveQueueProjectionCounterBucket(row)] += 1;
    if (row.dueAt != null && row.dueAt <= input.now) {
      due += 1;
    }
  }

  return {
    queueType: input.queueType,
    policyHash: input.policyHash,
    generation: input.generation,
    version: input.generation,
    remaining: input.rows.length,
    due,
    total: input.rows.length,
    buckets,
    updatedAt: input.updatedAt,
  };
}

function resolveQueueProjectionCounterBucket(row: QueueProjectionRow): 'item' | 'descriptor' | 'topic' | 'concept' {
  const cardType = String(row.payload.cardType || CardType.Item);
  if (cardType === CardType.Descriptor) {
    return 'descriptor';
  }
  if (cardType === CardType.Topic) {
    return 'topic';
  }
  if (cardType === CardType.Concept) {
    return 'concept';
  }
  return 'item';
}

function getDayEndForTimestamp(timestamp: number, dayStartHour: number): number {
  const now = new Date(timestamp);
  const start = new Date(now);
  if (now.getHours() < dayStartHour) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(dayStartHour, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  return start.getTime();
}

function normalizeDayStartHour(value: unknown): number {
  const hour = Math.floor(Number(value));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4;
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeProjectionDueBucket(value: unknown): QueueProjectionDueBucket | null {
  const normalized = normalizeOptionalString(value);
  if (
    normalized === 'overdue'
    || normalized === 'due'
    || normalized === 'future'
    || normalized === 'new'
    || normalized === 'manual'
    || normalized === 'blocked'
  ) {
    return normalized;
  }
  return null;
}

function resolveWorkerReviewSchedulerConfig(request: BackendReviewFeedbackRequest): {
  defaultScheduler: SchedulerType;
  fsrsParams: FSRSParameters;
} {
  const scheduler = request.scheduler && typeof request.scheduler === 'object'
    ? request.scheduler
    : null;
  const defaultScheduler = isSchedulerType(scheduler?.defaultScheduler)
    ? scheduler.defaultScheduler
    : 'fsrs-v6';
  const candidate = scheduler?.fsrsParams && typeof scheduler.fsrsParams === 'object'
    ? scheduler.fsrsParams as Partial<FSRSParameters>
    : {};
  const candidateWeights = Array.isArray(candidate.weights)
    ? candidate.weights.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : [];
  return {
    defaultScheduler,
    fsrsParams: {
      ...DEFAULT_SETTINGS.fsrs,
      ...candidate,
      weights: candidateWeights.length > 0 ? [...candidateWeights] : [...DEFAULT_SETTINGS.fsrs.weights],
    },
  };
}

function isSchedulerType(value: unknown): value is SchedulerType {
  return value === 'fsrs-v6' || value === 'a-factor-v2';
}
