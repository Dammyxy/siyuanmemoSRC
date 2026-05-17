import type { Database, ParamsObject, SqlValue } from 'sql.js';
import { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite/SqlQueueStateRepository';
import { SqlSemanticActivationRepository } from '@/infrastructure/persistence/sqlite/SqlSemanticActivationRepository';
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
  BackendSemanticBrowserReadRequest,
  BackendSemanticBrowserReadResult,
  BackendSemanticBranchEdge,
  BackendSemanticCandidateColumns,
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticNode,
  BackendSemanticSidebarReadRequest,
  BackendSemanticSidebarReadResult,
  BackendSemanticSessionBranchProjection,
  BackendSemanticSessionReadRequest,
  BackendSemanticSessionReadResult,
} from '../../packages/contracts/src/backend-rpc';
import type {
  SemanticEvent,
  SemanticBranchEdge,
  SemanticSessionBranchProjection,
  SemanticLens,
  SemanticMemoryProjection,
  SemanticPathEntry,
  SemanticRelation,
  SemanticSessionProjection,
  SemanticSessionSnapshot,
  SemanticStation,
} from '@/core/semantic/semanticActivationTypes';
import {
  buildSemanticEdgeExplanation,
  buildSemanticNodePresentation,
} from '@/core/semantic/SemanticActivationPresentation';
import { buildSemanticSessionProjection } from '@/core/semantic/SemanticSessionProjectionBuilder';
import {
  buildSemanticMemoryProjection,
  type SemanticOldModeManualBoostEvidence,
} from '@/core/semantic/SemanticMemoryProjectionBuilder';
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
  private semanticActivation: SqlSemanticActivationRepository | null = null;
  private initialized = false;
  private readonly semanticCommandResultsByIdempotencyKey = new Map<string, BackendSemanticCommandResult>();
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
    this.semanticActivation = new SqlSemanticActivationRepository(this.runtime);
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
      learnAheadWindowEnd: input.reviewedAt
        + DEFAULT_SETTINGS.scheduler.srsV2.learnAhead.windowMinutes * 60 * 1000,
      learnAheadMaxCards: DEFAULT_SETTINGS.scheduler.srsV2.learnAhead.maxCards,
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

  async executeSemanticCommand(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    await this.init();
    const requestId = normalizeString(request.requestId);
    const callerIntent = normalizeString(request.callerIntent);
    const idempotencyKey = normalizeString(request.idempotencyKey);
    if (!requestId || !callerIntent || !idempotencyKey || request.method !== 'semantic.command.execute') {
      return this.semanticFailed(requestId || 'semantic-command', 'invalid-request', 'semantic.command.execute requires requestId/callerIntent/idempotencyKey');
    }
    const cached = this.semanticCommandResultsByIdempotencyKey.get(idempotencyKey);
    if (cached) {
      return cached;
    }
    const command = request.command;
    if (!command || typeof command !== 'object') {
      return this.semanticFailed(requestId, 'invalid-request', 'semantic.command.execute requires command');
    }
    const result = await this.runtime.runTransaction('semantic.command.execute', () => {
      return this.executeSemanticCommandInTransaction(requestId, idempotencyKey, command);
    });
    this.semanticCommandResultsByIdempotencyKey.set(idempotencyKey, result);
    return result;
  }

  readSemanticBrowser(request: BackendSemanticBrowserReadRequest): BackendSemanticBrowserReadResult {
    const requestId = normalizeString(request.requestId) || 'semantic-browser-read';
    if (!request || request.method !== 'semantic.browser.read') {
      return this.semanticBrowserReadFailed(requestId, 'invalid-request', 'semantic.browser.read requires request');
    }
    if (!this.semanticActivation) {
      return this.semanticBrowserReadFailed(requestId, 'session-unavailable', 'semantic activation repository is unavailable');
    }
    const rootFocusNodeId = normalizeString(request.rootFocusNodeId);
    const requestedSessionId = normalizeString(request.sessionId);
    if (!rootFocusNodeId && !requestedSessionId) {
      return this.semanticBrowserReadFailed(requestId, 'focus-unavailable', 'semantic.browser.read requires rootFocusNodeId or sessionId');
    }

    const requestedSession = requestedSessionId ? this.semanticActivation.getSession(requestedSessionId) : null;
    const activeSession = rootFocusNodeId ? this.semanticActivation.findActiveSessionByRoot(rootFocusNodeId) : null;
    const session = requestedSession ?? activeSession;
    if (!session) {
      return {
        status: 'ok',
        requestId,
        activeSession: activeSession ?? null,
        session: null,
        rootNode: rootFocusNodeId ? this.semanticNode(rootFocusNodeId, 'concept') : null,
        currentNode: null,
        projection: null,
        nodes: rootFocusNodeId ? [this.semanticPresentedNode(rootFocusNodeId, 'concept')] : [],
        selectedNode: null,
        edgeExplanations: [],
        later: [],
        suggestions: [],
        archivedBranches: [],
        candidates: this.emptySemanticCandidateColumns(),
        stations: [],
        stationNodes: [],
        rootScopedStations: rootFocusNodeId ? this.semanticActivation.listStationsByRoot(rootFocusNodeId) : [],
        diagnosticEventId: `semantic-browser-read:${requestId}`,
      };
    }

    const effectiveRoot = rootFocusNodeId || session.rootFocusNodeId;
    if (rootFocusNodeId && session.rootFocusNodeId !== rootFocusNodeId) {
      return this.semanticBrowserReadFailed(requestId, 'session-unavailable', 'semantic session root does not match requested Browser root');
    }
    const stations = this.semanticActivation.listStations(session.sessionId)
      .filter((station) => typeof station.archivedAt !== 'number');
    const rootScopedStations = this.semanticActivation.listStationsByRoot(effectiveRoot)
      .filter((station) => typeof station.archivedAt !== 'number');
    const stationNodeIds = this.semanticStationNodeIds(rootScopedStations);
    const projection = this.semanticActivation.getProjection(session.sessionId) ?? this.semanticActivation.getProjection(null);
    const relations = this.semanticActivation.listRelations();
    const irrelevantFeedback = this.semanticActivation.listIrrelevantFeedback(session.sessionId);
    const candidates = this.semanticBrowserCandidateColumns(session, rootScopedStations, projection, relations, irrelevantFeedback);
    const stationNodes = Array.from(stationNodeIds)
      .filter((nodeId) => nodeId !== session.rootFocusNodeId && nodeId !== session.currentNodeId)
      .map((nodeId) => this.semanticNode(nodeId, 'implicit-knowledge'));
    const sessionProjection = buildSemanticSessionProjection({
      session,
      events: this.semanticActivation.listEvents(session.sessionId, 5000),
      branchEdges: this.semanticActivation.listBranchEdges(session.sessionId),
      branchStates: this.semanticActivation.listBranchStates(session.sessionId),
      laterEntries: this.semanticActivation.listLaterEntries(session.sessionId),
      irrelevantFeedback: this.semanticActivation.listIrrelevantFeedback(session.sessionId),
      suggestions: this.semanticActivation.listSuggestions(session.sessionId),
    });
    const nodeIds = this.semanticProjectionNodeIds(sessionProjection);
    const nodes = Array.from(nodeIds).map((nodeId) => this.semanticPresentedNode(nodeId, this.semanticNodeTypeForProjection(session, nodeId)));
    const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
    const selectedNodeId = normalizeString(request.selectedNodeId) || session.currentNodeId;

    return {
      status: 'ok',
      requestId,
      activeSession: activeSession ?? (typeof session.endedAt === 'number' ? null : session),
      session,
      rootNode: this.semanticNode(session.rootFocusNodeId, this.semanticNodeTypeForProjection(session, session.rootFocusNodeId)),
      currentNode: this.semanticNode(session.currentNodeId, session.currentNodeId === session.rootFocusNodeId ? 'concept' : 'implicit-knowledge'),
      projection: this.backendSemanticSessionProjection(sessionProjection),
      nodes,
      selectedNode: nodesById.get(selectedNodeId) ?? null,
      edgeExplanations: this.semanticSessionEdgeExplanations(sessionProjection),
      later: sessionProjection.later,
      suggestions: sessionProjection.suggestions,
      archivedBranches: sessionProjection.archivedBranches.map((branch) => this.backendSemanticBranchProjection(branch)),
      candidates,
      stations,
      stationNodes,
      rootScopedStations,
      diagnosticEventId: `semantic-browser-read:${requestId}`,
    };
  }

  readSemanticSession(request: BackendSemanticSessionReadRequest): BackendSemanticSessionReadResult {
    const requestId = normalizeString(request.requestId) || 'semantic-session-read';
    if (!request || request.method !== 'semantic.session.read') {
      return this.semanticSessionReadFailed(requestId, 'invalid-request', 'semantic.session.read requires request');
    }
    if (!this.semanticActivation) {
      return this.semanticSessionReadFailed(requestId, 'session-unavailable', 'semantic activation repository is unavailable');
    }
    const sessionId = normalizeString(request.sessionId);
    if (!sessionId) {
      return this.semanticSessionReadFailed(requestId, 'session-unavailable', 'semantic.session.read requires sessionId');
    }
    const session = this.semanticActivation.getSession(sessionId);
    if (!session) {
      return this.semanticSessionReadFailed(requestId, 'session-unavailable', `semantic session not found: ${sessionId}`);
    }

    const projection = buildSemanticSessionProjection({
      session,
      events: this.semanticActivation.listEvents(session.sessionId, 5000),
      branchEdges: this.semanticActivation.listBranchEdges(session.sessionId),
      branchStates: this.semanticActivation.listBranchStates(session.sessionId),
      laterEntries: this.semanticActivation.listLaterEntries(session.sessionId),
      irrelevantFeedback: this.semanticActivation.listIrrelevantFeedback(session.sessionId),
      suggestions: this.semanticActivation.listSuggestions(session.sessionId),
    });
    const nodeIds = this.semanticProjectionNodeIds(projection);
    const nodes = Array.from(nodeIds).map((nodeId) => this.semanticPresentedNode(nodeId, this.semanticNodeTypeForProjection(session, nodeId)));

    return {
      status: 'ok',
      requestId,
      projection: {
        ...projection,
        branches: projection.branches.map((branch) => this.backendSemanticBranchProjection(branch)),
        archivedBranches: projection.archivedBranches.map((branch) => this.backendSemanticBranchProjection(branch)),
      },
      nodes,
      diagnosticEventId: `semantic-session-read:${requestId}`,
    };
  }

  readSemanticSidebar(request: BackendSemanticSidebarReadRequest): BackendSemanticSidebarReadResult {
    const requestId = normalizeString(request.requestId) || 'semantic-sidebar-read';
    if (!request || request.method !== 'semantic.sidebar.read') {
      return this.semanticSidebarReadFailed(requestId, 'invalid-request', 'semantic.sidebar.read requires request');
    }
    if (!this.semanticActivation) {
      return this.semanticSidebarReadFailed(requestId, 'session-unavailable', 'semantic activation repository is unavailable');
    }
    const requestedSessionId = normalizeString(request.sessionId);
    const rootFocusNodeId = normalizeString(request.rootFocusNodeId || request.currentNodeId);
    const bindingMode = request.bindingMode === 'pinned-session' ? 'pinned-session' : 'follow-current';
    if (bindingMode === 'pinned-session' && !requestedSessionId) {
      return this.semanticSidebarReadFailed(requestId, 'session-unavailable', 'semantic.sidebar.read pinned-session requires sessionId');
    }
    if (bindingMode === 'follow-current' && !rootFocusNodeId) {
      return {
        status: 'ok',
        requestId,
        model: {
          bindingState: { type: 'current-node-unavailable', reason: 'missing-root' },
          session: null,
          currentNode: null,
          activePath: [],
          activePathNodes: [],
          branches: [],
          candidates: this.emptySemanticCandidateColumns(),
          later: [],
          suggestions: [],
          nodes: [],
        },
        diagnosticEventId: `semantic-sidebar-read:${requestId}`,
      };
    }

    const session = requestedSessionId
      ? this.semanticActivation.getSession(requestedSessionId)
      : this.semanticActivation.findActiveSessionByRoot(rootFocusNodeId);
    if (!session) {
      const rootNode = rootFocusNodeId ? this.semanticPresentedNode(rootFocusNodeId, 'real-review-card') : null;
      return {
        status: 'ok',
        requestId,
        model: {
          bindingState: requestedSessionId
            ? { type: 'pinned-session', sessionId: requestedSessionId }
            : { type: 'follow-current', rootFocusNodeId },
          session: null,
          currentNode: rootNode,
          activePath: [],
          activePathNodes: rootNode ? [rootNode] : [],
          branches: [],
          candidates: this.emptySemanticCandidateColumns(),
          later: [],
          suggestions: [],
          nodes: rootNode ? [rootNode] : [],
        },
        diagnosticEventId: `semantic-sidebar-read:${requestId}`,
      };
    }

    const projection = buildSemanticSessionProjection({
      session,
      events: this.semanticActivation.listEvents(session.sessionId, 5000),
      branchEdges: this.semanticActivation.listBranchEdges(session.sessionId),
      branchStates: this.semanticActivation.listBranchStates(session.sessionId),
      laterEntries: this.semanticActivation.listLaterEntries(session.sessionId),
      irrelevantFeedback: this.semanticActivation.listIrrelevantFeedback(session.sessionId),
      suggestions: this.semanticActivation.listSuggestions(session.sessionId),
    });
    const stationScope = this.semanticActivation.listStationsByRoot(session.rootFocusNodeId)
      .filter((station) => typeof station.archivedAt !== 'number');
    const projectionMemory = this.semanticActivation.getProjection(session.sessionId) ?? this.semanticActivation.getProjection(null);
    const candidates = this.semanticBrowserCandidateColumns(
      session,
      stationScope,
      projectionMemory,
      this.semanticActivation.listRelations(),
      this.semanticActivation.listIrrelevantFeedback(session.sessionId),
    );
    const nodeIds = this.semanticProjectionNodeIds(projection);
    const nodes = Array.from(nodeIds).map((nodeId) => this.semanticPresentedNode(nodeId, this.semanticNodeTypeForProjection(session, nodeId)));
    const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
    const activePathNodes = projection.activePath
      .map((entry) => nodesById.get(entry.nodeId) ?? this.semanticPresentedNode(entry.nodeId, this.semanticNodeTypeForProjection(session, entry.nodeId)));

    return {
      status: 'ok',
      requestId,
      model: {
        bindingState: requestedSessionId
          ? { type: 'pinned-session', sessionId: session.sessionId }
          : { type: 'follow-current', rootFocusNodeId: session.rootFocusNodeId },
        session,
        currentNode: nodesById.get(session.currentNodeId) ?? this.semanticPresentedNode(session.currentNodeId, this.semanticNodeTypeForProjection(session, session.currentNodeId)),
        activePath: projection.activePath,
        activePathNodes,
        branches: projection.branches.map((branch) => this.backendSemanticBranchProjection(branch)),
        candidates,
        later: projection.later,
        suggestions: projection.suggestions,
        nodes,
      },
      diagnosticEventId: `semantic-sidebar-read:${requestId}`,
    };
  }

  private executeSemanticCommandInTransaction(
    requestId: string,
    idempotencyKey: string,
    command: BackendSemanticCommandRequest['command'],
  ): BackendSemanticCommandResult {
    switch (command.type) {
      case 'start-session':
        return this.startSemanticSession(requestId, idempotencyKey, command);
      case 'follow-candidate':
        return this.followSemanticCandidate(requestId, command);
      case 'switch-lens':
        return this.switchSemanticLens(requestId, command);
      case 'create-station':
        return this.createSemanticStation(requestId, command);
      case 'record-implicit-node-action':
        return this.recordImplicitSemanticNodeAction(requestId, command);
      case 'accept-relation':
      case 'reject-relation':
        return this.decideSemanticRelation(requestId, command);
      case 'mark-irrelevant':
        return this.markSemanticNodeIrrelevant(requestId, command);
      case 'add-later':
        return this.addSemanticLaterEntry(requestId, command);
      case 'remove-later':
        return this.removeSemanticLaterEntry(requestId, command);
      case 'create-suggestion':
        return this.createSemanticSuggestion(requestId, command);
      case 'ignore-suggestion':
        return this.updateSemanticSuggestionStatus(requestId, command, 'ignored');
      case 'bind-suggestion':
        return this.updateSemanticSuggestionStatus(requestId, command, 'bound');
      case 'materialize-suggestion':
        return this.updateSemanticSuggestionStatus(requestId, command, 'materialized');
      case 'archive-station':
        return this.archiveSemanticStation(requestId, command);
      case 'restore-path-station':
        return this.restoreSemanticPathStation(requestId, command);
      case 'end-session':
        return this.endSemanticSession(requestId, command);
      case 'restore-session':
        return this.restoreSemanticSession(requestId, command);
      default:
        return this.semanticFailed(requestId, 'invalid-request', `unsupported semantic command: ${(command as { type?: unknown }).type || '<missing>'}`);
    }
  }

  private startSemanticSession(
    requestId: string,
    idempotencyKey: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'start-session' }>,
  ): BackendSemanticCommandResult {
    const rootFocusNodeId = normalizeString(command.rootFocusNodeId);
    if (!rootFocusNodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'start-session requires rootFocusNodeId');
    }
    const rootFocusNodeType = this.normalizeSemanticNodeType(command.rootFocusNodeType) ?? 'concept';
    const now = Date.now();
    const sessionId = normalizeString(command.sessionId) || `semantic-session:${idempotencyKey}`;
    const eventId = `semantic-event:${idempotencyKey}:session-started`;
    const entry: SemanticPathEntry = {
      nodeId: rootFocusNodeId,
      lens: 'assimilation',
      eventId,
      visitedAt: now,
    };
    const session: SemanticSessionSnapshot = {
      sessionId,
      rootFocusNodeId,
      rootFocusNodeType,
      currentNodeId: rootFocusNodeId,
      activeLens: 'assimilation',
      narrativePath: [entry],
      startedAt: now,
      endedAt: null,
    };
    const event = this.semanticEvent(eventId, sessionId, 'session-started', {
      nodeId: rootFocusNodeId,
      lens: 'assimilation',
      occurredAt: now,
      payload: { rootFocusNodeId, rootFocusNodeType },
    });
    const visitEvent = this.semanticEvent(`semantic-event:${idempotencyKey}:node-visited`, sessionId, 'node-visited', {
      nodeId: rootFocusNodeId,
      lens: 'assimilation',
      occurredAt: now,
      payload: { reason: 'session-started' },
    });
    this.semanticActivation!.saveSession(session);
    this.semanticActivation!.appendEvent(event);
    this.semanticActivation!.appendEvent(visitEvent);
    return this.semanticOk(requestId, sessionId, { session, event: visitEvent, events: [event, visitEvent] });
  }

  private followSemanticCandidate(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'follow-candidate' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const candidateId = normalizeString(command.candidateId);
    const lens = this.normalizeSemanticLens(command.lens) ?? session.activeLens;
    if (!candidateId) {
      return this.semanticFailed(requestId, 'invalid-request', 'follow-candidate requires candidateId');
    }
    const now = Date.now();
    const events: SemanticEvent[] = [];
    if (lens !== session.activeLens) {
      events.push(this.semanticEvent(`semantic-event:${requestId}:lens-switched`, session.sessionId, 'lens-switched', {
        nodeId: session.currentNodeId,
        lens,
        occurredAt: now,
        payload: { previousLens: session.activeLens, nextLens: lens, reason: 'follow-candidate' },
      }));
    }
    const edgeEventId = `semantic-event:${requestId}:edge-traversed`;
    events.push(this.semanticEvent(edgeEventId, session.sessionId, 'edge-traversed', {
      nodeId: candidateId,
      fromNodeId: session.currentNodeId,
      toNodeId: candidateId,
      lens,
      occurredAt: now,
      payload: { candidateId },
    }));
    const visitEvent = this.semanticEvent(`semantic-event:${requestId}:node-visited`, session.sessionId, 'node-visited', {
      nodeId: candidateId,
      lens,
      occurredAt: now,
      payload: { reason: 'follow-candidate', candidateId },
    });
    events.push(visitEvent);
    const updated: SemanticSessionSnapshot = {
      ...session,
      currentNodeId: candidateId,
      activeLens: lens,
      narrativePath: [
        ...session.narrativePath,
        { nodeId: candidateId, lens, eventId: visitEvent.eventId, visitedAt: now },
      ],
    };
    this.semanticActivation!.saveSession(updated);
    for (const event of events) {
      this.semanticActivation!.appendEvent(event);
    }
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event: visitEvent, events });
  }

  private switchSemanticLens(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'switch-lens' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const lens = this.normalizeSemanticLens(command.lens);
    if (!lens) {
      return this.semanticFailed(requestId, 'invalid-request', 'switch-lens requires lens');
    }
    const event = this.semanticEvent(`semantic-event:${requestId}:lens-switched`, session.sessionId, 'lens-switched', {
      nodeId: session.currentNodeId,
      lens,
      payload: { previousLens: session.activeLens, nextLens: lens },
    });
    const updated = { ...session, activeLens: lens };
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event });
  }

  private createSemanticStation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'create-station' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const stationType = command.stationType === 'path' ? 'path' : 'node';
    const station: SemanticStation = {
      stationId: `semantic-station:${requestId}`,
      type: stationType,
      sessionId: session.sessionId,
      nodeId: stationType === 'node' ? session.currentNodeId : null,
      path: stationType === 'path' ? session.narrativePath : null,
      lensHistory: stationType === 'path' ? session.narrativePath.map((entry) => entry.lens) : [session.activeLens],
      createdAt: Date.now(),
    };
    const event = this.semanticEvent(`semantic-event:${requestId}:station-created`, session.sessionId, 'station-created', {
      nodeId: station.nodeId,
      lens: session.activeLens,
      payload: { stationId: station.stationId, stationType },
    });
    this.semanticActivation!.saveStation(station);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event, station });
  }

  private recordImplicitSemanticNodeAction(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'record-implicit-node-action' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    const action = normalizeString(command.action);
    if (!nodeId || !action) {
      return this.semanticFailed(requestId, 'invalid-request', 'record-implicit-node-action requires nodeId/action');
    }
    const lens = this.normalizeSemanticLens(command.lens) ?? session.activeLens;
    const event = this.semanticEvent(`semantic-event:${requestId}:implicit-node-action`, session.sessionId, 'implicit-node-action', {
      nodeId,
      lens,
      payload: { nodeId, action },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event, events: [event] });
  }

  private decideSemanticRelation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'accept-relation' | 'reject-relation' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const relationId = normalizeString(command.relationId);
    const fromNodeId = normalizeString(command.fromNodeId);
    const toNodeId = normalizeString(command.toNodeId);
    if (!relationId || !fromNodeId || !toNodeId) {
      return this.semanticFailed(requestId, 'invalid-request', `${command.type} requires relationId/fromNodeId/toNodeId`);
    }
    const decision = command.type === 'accept-relation' ? 'accepted' : 'rejected';
    const eventType = command.type === 'accept-relation' ? 'ai-relation-accepted' : 'ai-relation-rejected';
    const relation: SemanticRelation = {
      relationId,
      fromNodeId,
      toNodeId,
      decision,
      source: command.source === 'manual' ? 'manual' : 'ai',
      confidence: Number.isFinite(Number(command.confidence)) ? Number(command.confidence) : 1,
      reason: normalizeOptionalString(command.reason),
      decidedAt: Date.now(),
    };
    const event = this.semanticEvent(`semantic-event:${requestId}:${eventType}`, session.sessionId, eventType, {
      fromNodeId,
      toNodeId,
      lens: session.activeLens,
      payload: { relationId, decision },
    });
    this.semanticActivation!.saveRelation(relation);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event, relation });
  }

  private markSemanticNodeIrrelevant(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'mark-irrelevant' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'mark-irrelevant requires nodeId');
    }
    const scope = command.scope === 'root' ? 'root' : 'session';
    const event = this.semanticEvent(`semantic-event:${requestId}:node-marked-irrelevant`, session.sessionId, 'node-marked-irrelevant', {
      nodeId,
      lens: session.activeLens,
      payload: { nodeId, scope },
    });
    this.semanticActivation!.saveIrrelevantFeedback({
      feedbackId: `semantic-irrelevant:${requestId}`,
      sessionId: session.sessionId,
      nodeId,
      scope,
      rootFocusNodeId: session.rootFocusNodeId,
      createdAt: event.occurredAt,
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private addSemanticLaterEntry(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'add-later' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'add-later requires nodeId');
    }
    const now = Date.now();
    const entryId = `semantic-later:${session.sessionId}:${nodeId}`;
    this.semanticActivation!.saveLaterEntry({
      entryId,
      sessionId: session.sessionId,
      nodeId,
      reason: normalizeOptionalString(command.reason),
      createdAt: now,
      removedAt: null,
    });
    const event = this.semanticEvent(`semantic-event:${requestId}:later-added`, session.sessionId, 'later-added', {
      nodeId,
      lens: session.activeLens,
      occurredAt: now,
      payload: { entryId, reason: normalizeOptionalString(command.reason) },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private removeSemanticLaterEntry(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'remove-later' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const nodeId = normalizeString(command.nodeId);
    if (!nodeId) {
      return this.semanticFailed(requestId, 'invalid-request', 'remove-later requires nodeId');
    }
    const now = Date.now();
    const existing = this.semanticActivation!.listLaterEntries(session.sessionId)
      .find((entry) => entry.nodeId === nodeId && typeof entry.removedAt !== 'number');
    const entryId = existing?.entryId ?? `semantic-later:${session.sessionId}:${nodeId}`;
    this.semanticActivation!.saveLaterEntry({
      entryId,
      sessionId: session.sessionId,
      nodeId,
      reason: existing?.reason ?? null,
      createdAt: existing?.createdAt ?? now,
      removedAt: now,
    });
    const event = this.semanticEvent(`semantic-event:${requestId}:later-removed`, session.sessionId, 'later-removed', {
      nodeId,
      lens: session.activeLens,
      occurredAt: now,
      payload: { entryId },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private createSemanticSuggestion(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'create-suggestion' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const suggestionId = normalizeString(command.suggestionId);
    const summary = normalizeString(command.summary);
    if (!suggestionId || !summary) {
      return this.semanticFailed(requestId, 'invalid-request', 'create-suggestion requires suggestionId/summary');
    }
    const now = Date.now();
    this.semanticActivation!.saveSuggestion({
      suggestionId,
      sessionId: session.sessionId,
      source: command.source === 'system' ? 'system' : 'ai',
      summary,
      status: 'active',
      targetNodeId: normalizeOptionalString(command.targetNodeId),
      boundNodeId: null,
      materializedBlockId: null,
      materializedCardId: null,
      createdAt: now,
      updatedAt: now,
    });
    const event = this.semanticEvent(`semantic-event:${requestId}:suggestion-created`, session.sessionId, 'suggestion-created', {
      nodeId: normalizeOptionalString(command.targetNodeId),
      lens: session.activeLens,
      occurredAt: now,
      payload: { suggestionId, source: command.source === 'system' ? 'system' : 'ai' },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private updateSemanticSuggestionStatus(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'ignore-suggestion' | 'bind-suggestion' | 'materialize-suggestion' }>,
    status: 'ignored' | 'bound' | 'materialized',
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const suggestionId = normalizeString(command.suggestionId);
    if (!suggestionId) {
      return this.semanticFailed(requestId, 'invalid-request', `${command.type} requires suggestionId`);
    }
    const existing = this.semanticActivation!.listSuggestions(session.sessionId)
      .find((suggestion) => suggestion.suggestionId === suggestionId);
    if (!existing) {
      return this.semanticFailed(requestId, 'candidate-unavailable', `semantic suggestion not found: ${suggestionId}`);
    }
    const now = Date.now();
    const boundNodeId = command.type === 'bind-suggestion'
      ? normalizeOptionalString(command.nodeId)
      : existing.boundNodeId ?? null;
    const materializedBlockId = command.type === 'materialize-suggestion'
      ? normalizeOptionalString(command.blockId)
      : existing.materializedBlockId ?? null;
    this.semanticActivation!.saveSuggestion({
      ...existing,
      status,
      boundNodeId,
      materializedBlockId,
      materializedCardId: command.type === 'materialize-suggestion'
        ? normalizeOptionalString(command.cardId)
        : existing.materializedCardId ?? null,
      updatedAt: now,
    });
    const eventType = status === 'ignored'
      ? 'suggestion-ignored'
      : status === 'bound'
        ? 'suggestion-bound'
        : 'suggestion-materialized';
    const event = this.semanticEvent(`semantic-event:${requestId}:${eventType}`, session.sessionId, eventType, {
      nodeId: boundNodeId ?? materializedBlockId ?? existing.targetNodeId ?? null,
      lens: session.activeLens,
      occurredAt: now,
      payload: { suggestionId, status },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session, event });
  }

  private archiveSemanticStation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'archive-station' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const stationId = normalizeString(command.stationId);
    if (!stationId) {
      return this.semanticFailed(requestId, 'invalid-request', 'archive-station requires stationId');
    }
    const station = this.semanticActivation!.getStation(stationId);
    if (!station || station.sessionId !== session.sessionId) {
      return this.semanticFailed(requestId, 'station-unavailable', `semantic station not found: ${stationId}`);
    }
    const now = Date.now();
    const archived = this.semanticActivation!.archiveStation(stationId, now);
    const event = this.semanticEvent(`semantic-event:${requestId}:station-archived`, session.sessionId, 'station-archived', {
      nodeId: archived?.nodeId ?? null,
      lens: session.activeLens,
      occurredAt: now,
      payload: { stationId, stationType: station.type, archivedAt: now },
    });
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, {
      session,
      event,
      station: archived,
      archivedStationId: stationId,
    });
  }

  private restoreSemanticPathStation(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'restore-path-station' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const stationId = normalizeString(command.stationId);
    if (!stationId) {
      return this.semanticFailed(requestId, 'invalid-request', 'restore-path-station requires stationId');
    }
    const station = this.semanticActivation!.getStation(stationId);
    if (!station || station.sessionId !== session.sessionId || station.type !== 'path') {
      return this.semanticFailed(requestId, 'station-unavailable', `semantic path station not found: ${stationId}`);
    }
    if (typeof station.archivedAt === 'number') {
      return this.semanticFailed(requestId, 'inactive-station', `semantic path station is archived: ${stationId}`);
    }
    const path = Array.isArray(station.path) ? station.path.filter((entry) => normalizeString(entry.nodeId)) : [];
    if (path.length === 0) {
      return this.semanticFailed(requestId, 'invalid-request', 'restore-path-station requires a non-empty path');
    }
    const terminal = path[path.length - 1]!;
    const event = this.semanticEvent(`semantic-event:${requestId}:station-restored`, session.sessionId, 'station-restored', {
      nodeId: terminal.nodeId,
      lens: terminal.lens ?? session.activeLens,
      payload: { stationId, stationType: station.type, restoredPathLength: path.length },
    });
    const updated: SemanticSessionSnapshot = {
      ...session,
      currentNodeId: terminal.nodeId,
      activeLens: terminal.lens ?? session.activeLens,
      narrativePath: path.map((entry) => ({ ...entry })),
    };
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, updated.sessionId, { session: updated, event, station });
  }

  private endSemanticSession(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'end-session' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    const now = Date.now();
    const updated = { ...session, endedAt: now };
    const event = this.semanticEvent(`semantic-event:${requestId}:session-ended`, session.sessionId, 'session-ended', {
      nodeId: session.currentNodeId,
      lens: session.activeLens,
      occurredAt: now,
    });
    this.semanticActivation!.saveSession(updated);
    this.semanticActivation!.appendEvent(event);
    return this.semanticOk(requestId, session.sessionId, { session: updated, event });
  }

  private restoreSemanticSession(
    requestId: string,
    command: Extract<BackendSemanticCommandRequest['command'], { type: 'restore-session' }>,
  ): BackendSemanticCommandResult {
    const session = this.requireSemanticSession(requestId, command.sessionId);
    if (!('sessionId' in session)) {
      return session;
    }
    return this.semanticReadOk(requestId, session.sessionId, { session });
  }

  private requireSemanticSession(requestId: string, sessionIdInput: unknown): SemanticSessionSnapshot | BackendSemanticCommandResult {
    const sessionId = normalizeString(sessionIdInput);
    if (!sessionId) {
      return this.semanticFailed(requestId, 'invalid-request', 'semantic command requires sessionId');
    }
    const session = this.semanticActivation!.getSession(sessionId);
    if (!session) {
      return {
        status: 'unavailable',
        unavailableReason: 'session-unavailable',
        message: `SESSION_UNAVAILABLE: semantic session not found: ${sessionId}`,
        diagnosticEventId: `semantic-command-unavailable:${requestId}`,
      };
    }
    return session;
  }

  private semanticEvent(
    eventId: string,
    sessionId: string,
    type: SemanticEvent['type'],
    input: {
      nodeId?: string | null;
      fromNodeId?: string | null;
      toNodeId?: string | null;
      lens?: SemanticLens | null;
      occurredAt?: number;
      payload?: Record<string, unknown> | null;
    },
  ): SemanticEvent {
    return {
      eventId,
      sessionId,
      type,
      nodeId: normalizeOptionalString(input.nodeId),
      fromNodeId: normalizeOptionalString(input.fromNodeId),
      toNodeId: normalizeOptionalString(input.toNodeId),
      lens: input.lens ?? null,
      occurredAt: Number.isFinite(Number(input.occurredAt)) ? Number(input.occurredAt) : Date.now(),
      payload: input.payload ?? null,
    };
  }

  private normalizeSemanticLens(value: unknown): SemanticLens | null {
    const lens = normalizeString(value);
    return lens === 'assimilation' || lens === 'accommodation' || lens === 'free'
      ? lens
      : null;
  }

  private normalizeSemanticNodeType(value: unknown): BackendSemanticNode['nodeType'] | null {
    const nodeType = normalizeString(value);
    return nodeType === 'real-review-card' || nodeType === 'implicit-knowledge' || nodeType === 'concept'
      ? nodeType
      : null;
  }

  private emptySemanticCandidateColumns(): BackendSemanticCandidateColumns {
    return {
      assimilation: [],
      accommodation: [],
      free: [],
    };
  }

  private semanticNode(nodeId: string, nodeType: BackendSemanticNode['nodeType']): BackendSemanticNode {
    return {
      nodeId,
      nodeType,
      title: nodeId,
      preview: nodeId,
      location: {
        blockId: nodeId,
        breadcrumb: [],
        backlinkBlockIds: [],
      },
    };
  }

  private semanticPresentedNode(nodeId: string, nodeType: BackendSemanticNode['nodeType']): BackendSemanticNode {
    const node = this.semanticNode(nodeId, nodeType);
    return {
      ...node,
      presentation: buildSemanticNodePresentation({
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: node.title,
        preview: node.preview,
        location: node.location,
      }),
    };
  }

  private semanticNodeTypeForProjection(session: SemanticSessionSnapshot, nodeId: string): BackendSemanticNode['nodeType'] {
    if (nodeId === session.rootFocusNodeId) {
      return this.normalizeSemanticNodeType(session.rootFocusNodeType) ?? 'concept';
    }
    return 'real-review-card';
  }

  private semanticProjectionNodeIds(projection: SemanticSessionProjection): Set<string> {
    const nodeIds = new Set<string>();
    nodeIds.add(projection.session.rootFocusNodeId);
    nodeIds.add(projection.session.currentNodeId);
    for (const entry of projection.activePath) {
      nodeIds.add(entry.nodeId);
    }
    for (const branch of [...projection.branches, ...projection.archivedBranches]) {
      nodeIds.add(branch.rootNodeId);
      nodeIds.add(branch.activeCursorNodeId);
      for (const edge of branch.edges) {
        nodeIds.add(edge.fromNodeId);
        nodeIds.add(edge.toNodeId);
      }
    }
    for (const entry of projection.later) {
      nodeIds.add(entry.nodeId);
    }
    for (const suggestion of projection.suggestions) {
      const boundNodeId = normalizeString(suggestion.boundNodeId);
      const targetNodeId = normalizeString(suggestion.targetNodeId);
      const materializedBlockId = normalizeString(suggestion.materializedBlockId);
      if (boundNodeId) {
        nodeIds.add(boundNodeId);
      }
      if (targetNodeId) {
        nodeIds.add(targetNodeId);
      }
      if (materializedBlockId) {
        nodeIds.add(materializedBlockId);
      }
    }
    return nodeIds;
  }

  private backendSemanticBranchProjection(branch: SemanticSessionBranchProjection): BackendSemanticSessionBranchProjection {
    return {
      ...branch,
      edges: branch.edges.map((edge) => this.backendSemanticBranchEdge(edge)),
    };
  }

  private backendSemanticBranchEdge(edge: SemanticBranchEdge): BackendSemanticBranchEdge {
    return {
      ...edge,
      lens: edge.lens,
    };
  }

  private backendSemanticSessionProjection(projection: SemanticSessionProjection): NonNullable<Extract<BackendSemanticSessionReadResult, { status: 'ok' }>['projection']> {
    return {
      ...projection,
      branches: projection.branches.map((branch) => this.backendSemanticBranchProjection(branch)),
      archivedBranches: projection.archivedBranches.map((branch) => this.backendSemanticBranchProjection(branch)),
    };
  }

  private semanticSessionEdgeExplanations(projection: SemanticSessionProjection): ReturnType<typeof buildSemanticEdgeExplanation>[] {
    const explanations = new Map<string, ReturnType<typeof buildSemanticEdgeExplanation>>();
    for (const branch of [...projection.branches, ...projection.archivedBranches]) {
      for (const edge of branch.edges) {
        const explanation = edge.explanation ?? buildSemanticEdgeExplanation({
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          lens: edge.lens,
          primaryExplanation: 'Semantic traversal',
          reasonTags: [edge.lens],
          evidence: [{ eventId: edge.edgeId, label: 'branch-edge' }],
          createdBy: edge.createdBy,
          createdAt: edge.createdAt,
        });
        explanations.set(`${edge.fromNodeId}->${edge.toNodeId}:${edge.lens}:${edge.createdAt}`, explanation);
      }
    }
    for (let index = 1; index < projection.activePath.length; index += 1) {
      const previous = projection.activePath[index - 1];
      const current = projection.activePath[index];
      if (!previous || !current) {
        continue;
      }
      const key = `${previous.nodeId}->${current.nodeId}:${current.lens}:${current.visitedAt}`;
      if (explanations.has(key)) {
        continue;
      }
      explanations.set(key, buildSemanticEdgeExplanation({
        fromNodeId: previous.nodeId,
        toNodeId: current.nodeId,
        lens: current.lens,
        primaryExplanation: 'Semantic path step',
        reasonTags: [current.lens],
        evidence: [{ eventId: current.eventId, label: 'path-event' }],
        createdBy: { kind: 'system', id: 'semantic-session', label: 'session path' },
        createdAt: current.visitedAt,
      }));
    }
    return Array.from(explanations.values()).sort((left, right) => left.createdAt - right.createdAt);
  }

  private semanticStationNodeIds(stations: SemanticStation[]): Set<string> {
    const nodeIds = new Set<string>();
    for (const station of stations) {
      const nodeId = normalizeString(station.nodeId);
      if (nodeId) {
        nodeIds.add(nodeId);
      }
      for (const entry of station.path ?? []) {
        const pathNodeId = normalizeString(entry.nodeId);
        if (pathNodeId) {
          nodeIds.add(pathNodeId);
        }
      }
    }
    return nodeIds;
  }

  private semanticBrowserCandidateColumns(
    session: SemanticSessionSnapshot,
    stations: SemanticStation[],
    projection: SemanticMemoryProjection | null,
    relations: SemanticRelation[],
    irrelevantFeedback: Array<{ nodeId: string; rootFocusNodeId?: string | null; scope?: string | null }> = [],
  ): BackendSemanticCandidateColumns {
    const columns = this.emptySemanticCandidateColumns();
    const blocked = new Set([
      session.rootFocusNodeId,
      session.currentNodeId,
      ...irrelevantFeedback
        .filter((feedback) => feedback.scope !== 'root' || !feedback.rootFocusNodeId || feedback.rootFocusNodeId === session.rootFocusNodeId)
        .map((feedback) => feedback.nodeId),
    ].filter(Boolean));
    const pushCandidate = (
      lens: SemanticLens,
      nodeId: string,
      score: number,
      code: BackendSemanticCandidateColumns[SemanticLens][number]['reasons'][number]['code'],
      explanation: Record<string, unknown>,
    ): void => {
      const normalized = normalizeString(nodeId);
      if (!normalized || blocked.has(normalized) || columns[lens].some((candidate) => candidate.candidateId === normalized)) {
        return;
      }
      const node = this.semanticNode(normalized, 'real-review-card');
      const presentation = buildSemanticNodePresentation({
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        title: node.title,
        preview: node.preview,
        location: node.location,
      });
      if (presentation.availability.status !== 'available') {
        return;
      }
      columns[lens].push({
        candidateId: normalized,
        node: {
          ...node,
          presentation,
        },
        score: Math.max(0, Math.min(1, Number(score) || 0)),
        lens,
        reasons: [{ code, weight: Math.max(0, Math.min(1, Number(score) || 0)) }],
        explanation,
      });
    };

    for (const memory of projection?.nodeMemory ?? []) {
      pushCandidate('assimilation', memory.nodeId, Math.max(memory.oldKnowledgeScore, memory.semanticFamiliarity), 'memory-projection', {
        source: 'memory-projection',
      });
      pushCandidate('accommodation', memory.nodeId, Math.max(memory.novelty, memory.tension), memory.tension >= memory.novelty ? 'tension' : 'novelty', {
        source: 'memory-projection',
      });
      pushCandidate('free', memory.nodeId, Math.max(memory.manualBoost, memory.semanticFamiliarity, memory.novelty), 'free-association', {
        source: 'memory-projection',
      });
    }

    for (const station of stations) {
      if (typeof station.archivedAt === 'number') {
        continue;
      }
      if (station.type === 'node') {
        pushCandidate('assimilation', station.nodeId ?? '', 1, 'station-boost', {
          stationId: station.stationId,
          stationType: station.type,
        });
        pushCandidate('free', station.nodeId ?? '', 0.82, 'station-boost', {
          stationId: station.stationId,
          stationType: station.type,
        });
        continue;
      }
      for (const entry of station.path ?? []) {
        pushCandidate(entry.lens, entry.nodeId, 0.82, 'station-boost', {
          stationId: station.stationId,
          stationType: station.type,
        });
      }
    }

    for (const relation of relations) {
      if (relation.decision !== 'accepted') {
        continue;
      }
      const fromNodeId = normalizeString(relation.fromNodeId);
      const toNodeId = normalizeString(relation.toNodeId);
      const relatedFrom = fromNodeId === session.currentNodeId || fromNodeId === session.rootFocusNodeId;
      const relatedTo = toNodeId === session.currentNodeId || toNodeId === session.rootFocusNodeId;
      if (!relatedFrom && !relatedTo) {
        continue;
      }
      const candidateNodeId = relatedFrom ? toNodeId : fromNodeId;
      pushCandidate('accommodation', candidateNodeId, relation.confidence, 'accepted-ai-relation', {
        relationId: relation.relationId,
        source: relation.source,
      });
      pushCandidate('free', candidateNodeId, relation.confidence, 'accepted-ai-relation', {
        relationId: relation.relationId,
        source: relation.source,
      });
    }

    for (const lens of ['assimilation', 'accommodation', 'free'] as const) {
      columns[lens].sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
    }
    return columns;
  }

  private semanticBrowserReadFailed(
    requestId: string,
    unavailableReason: Extract<BackendSemanticBrowserReadResult, { status: 'unavailable' | 'failed' }>['unavailableReason'],
    message: string,
  ): BackendSemanticBrowserReadResult {
    return {
      status: unavailableReason === 'failed' ? 'failed' : 'unavailable',
      unavailableReason,
      message,
      diagnosticEventId: `semantic-browser-read-failed:${requestId}`,
    };
  }

  private semanticSessionReadFailed(
    requestId: string,
    unavailableReason: Extract<BackendSemanticSessionReadResult, { status: 'unavailable' | 'failed' }>['unavailableReason'],
    message: string,
  ): BackendSemanticSessionReadResult {
    return {
      status: unavailableReason === 'failed' ? 'failed' : 'unavailable',
      unavailableReason,
      message,
      diagnosticEventId: `semantic-session-read-failed:${requestId}`,
    };
  }

  private semanticSidebarReadFailed(
    requestId: string,
    unavailableReason: Extract<BackendSemanticSidebarReadResult, { status: 'unavailable' | 'failed' }>['unavailableReason'],
    message: string,
  ): BackendSemanticSidebarReadResult {
    return {
      status: unavailableReason === 'failed' ? 'failed' : 'unavailable',
      unavailableReason,
      message,
      diagnosticEventId: `semantic-sidebar-read-failed:${requestId}`,
    };
  }

  private semanticOk(
    requestId: string,
    sessionId: string,
    payload: Partial<Pick<Extract<BackendSemanticCommandResult, { status: 'ok' }>, 'session' | 'event' | 'events' | 'station' | 'relation' | 'archivedStationId'>>,
  ): BackendSemanticCommandResult {
    this.rebuildSemanticProjectionCache(sessionId);
    return {
      status: 'ok',
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: {
        semanticSessionIds: [sessionId],
      },
      diagnosticEventId: `semantic-command:${requestId}`,
      ...payload,
    };
  }

  private semanticReadOk(
    requestId: string,
    sessionId: string,
    payload: Partial<Pick<Extract<BackendSemanticCommandResult, { status: 'ok' }>, 'session' | 'event' | 'events' | 'station' | 'relation'>>,
  ): BackendSemanticCommandResult {
    return {
      status: 'ok',
      commandId: requestId,
      writerInstanceId: 'backend-worker',
      changed: {
        semanticSessionIds: [sessionId],
      },
      diagnosticEventId: `semantic-command:${requestId}`,
      ...payload,
    };
  }

  private rebuildSemanticProjectionCache(sessionId: string): void {
    const events = this.semanticActivation!.listEvents(sessionId, 5000);
    const stations = this.semanticActivation!.listStations(sessionId);
    const relations = this.semanticActivation!.listRelations();
    this.semanticActivation!.saveProjection(buildSemanticMemoryProjection({
      sessionId,
      events,
      stations,
      relations,
      oldModeManualBoosts: this.readOldNeuralRoamManualBoostEvidence(),
    }));
  }

  private readOldNeuralRoamManualBoostEvidence(): SemanticOldModeManualBoostEvidence[] {
    const state = this.readQueueStateValueSync<Record<string, unknown>>('neuralRoamQueue');
    if (!state || !isRecord(state)) {
      return [];
    }
    const evidence: SemanticOldModeManualBoostEvidence[] = [];
    const orbit = isRecord(state.orbit) ? state.orbit : state;
    this.collectOldNeuralRoamPoolEvidence(evidence, 'orbit-seed', orbit.seedPool);
    this.collectOldNeuralRoamPoolEvidence(evidence, 'orbit-anchor', orbit.anchorPool);
    const hyperspace = isRecord(state.hyperspace) ? state.hyperspace : {};
    this.collectOldNeuralRoamPoolEvidence(evidence, 'hyperspace-source', hyperspace.sourcePool);
    this.collectOldNeuralRoamPoolEvidence(evidence, 'hyperspace-anchor', hyperspace.anchorPool);
    return evidence;
  }

  private readQueueStateValueSync<T>(key: string): T | null {
    if (!this.queueState) {
      return null;
    }
    const values = this.queueState.loadAll();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] as T : null;
  }

  private collectOldNeuralRoamPoolEvidence(
    evidence: SemanticOldModeManualBoostEvidence[],
    source: SemanticOldModeManualBoostEvidence['source'],
    entries: unknown,
  ): void {
    if (!Array.isArray(entries)) {
      return;
    }
    for (const entry of entries) {
      if (!isRecord(entry)) {
        continue;
      }
      const nodeId = normalizeString(entry.nodeId);
      if (!nodeId) {
        continue;
      }
      evidence.push({
        nodeId,
        source,
        weight: this.oldNeuralRoamEvidenceWeight(source, entry),
      });
    }
  }

  private oldNeuralRoamEvidenceWeight(
    source: SemanticOldModeManualBoostEvidence['source'],
    entry: Record<string, unknown>,
  ): number {
    const base = source === 'orbit-anchor' || source === 'hyperspace-anchor' ? 0.32 : 0.24;
    const priority = Number(entry.priority);
    const priorityBoost = Number.isFinite(priority) ? this.clamp01(priority) * 0.18 : 0;
    return this.clamp01(base + priorityBoost);
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  private semanticFailed(
    requestId: string,
    unavailableReason: Extract<BackendSemanticCommandResult, { status: 'failed' }>['unavailableReason'],
    message: string,
  ): BackendSemanticCommandResult {
    return {
      status: 'failed',
      unavailableReason,
      message,
      diagnosticEventId: `semantic-command-failed:${requestId}`,
    };
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
  let currentLearningDue = 0;
  let todayReviewDue = 0;
  let allowedNew = 0;

  for (const row of input.rows) {
    buckets.all += 1;
    buckets[resolveQueueProjectionCounterBucket(row)] += 1;
    if (row.membershipReason === 'learning-due') {
      currentLearningDue += 1;
    } else if (row.membershipReason === 'review-due') {
      todayReviewDue += 1;
    } else if (row.membershipReason === 'new') {
      allowedNew += 1;
    }
  }

  return {
    queueType: input.queueType,
    policyHash: input.policyHash,
    generation: input.generation,
    version: input.generation,
    remaining: input.rows.length,
    due: input.rows.length,
    total: input.rows.length,
    currentLearningDue,
    todayReviewDue,
    allowedNew,
    scheduledTotal: input.rows.length,
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
