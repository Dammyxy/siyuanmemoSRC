import {
  STORAGE_DURABILITY_RECEIPT_VERSION,
  TRUTH_COVERAGE_WATERMARK_VERSION,
  type StorageDurabilityReceipt,
  type StorageMutationEnvelope,
  type TruthCoverageWatermark,
} from '../../packages/contracts/src/backend-rpc';

export const WORKER_TRUTH_PROMOTION_STATE_VERSION = 1 as const;

export interface WorkerTruthPromotionJournalEntry {
  createdAt: number;
  mutationEnvelope: StorageMutationEnvelope;
  durabilityReceipt: StorageDurabilityReceipt;
}

export interface WorkerTruthPromotionState {
  version: typeof WORKER_TRUTH_PROMOTION_STATE_VERSION;
  deviceId: string;
  identityEpoch: string;
  coverage: TruthCoverageWatermark | null;
  retry: {
    mutationId: string;
    journalSequence: number;
    attemptCount: number;
    nextAttemptAt: number | null;
    lastError: string;
  } | null;
  lastSuccessfulPromotionAt: number | null;
  updatedAt: number;
}

export interface WorkerTruthPromotionJournalSource {
  listJournaledMutations(input: {
    afterJournalSequence: number;
    limit: number;
  }): Promise<WorkerTruthPromotionJournalEntry[]>;
}

export interface WorkerTruthPromotionStateStore {
  read(): Promise<WorkerTruthPromotionState | null>;
  write(state: WorkerTruthPromotionState): Promise<void>;
}

export interface WorkerTruthPromotionPublisherResult {
  generationId: string;
  verifiedMutationIds: string[];
}

export interface WorkerTruthPromotionPublisher {
  publishBatch(entries: WorkerTruthPromotionJournalEntry[]): Promise<WorkerTruthPromotionPublisherResult>;
}

export interface WorkerTruthPromotionResult {
  ok: boolean;
  promotedMutationIds: string[];
  coveredJournalSequence: number;
  truthGenerationId: string | null;
  error: string | null;
}

export interface WorkerTruthPromotionRequest {
  maxBatchSize?: number;
}

export interface WorkerTruthPromotionDiagnostics {
  active: boolean;
  shutdownStarted: boolean;
  pendingMutationCount: number;
  oldestPendingAgeMs: number | null;
  journalSequenceFrontier: number;
  truthCoverageFrontier: number;
  retryReason: string | null;
  lastSuccessfulPromotionAt: number | null;
}

export interface WorkerTruthPromotionModuleOptions {
  deviceId: string;
  identityEpoch: string;
  journalSource: WorkerTruthPromotionJournalSource;
  stateStore: WorkerTruthPromotionStateStore;
  publisher: WorkerTruthPromotionPublisher;
  maxBatchSize?: number;
  retryDelayMs?: number;
  now?: () => number;
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Worker truth promotion requires ${label}`);
  }
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function journalSequence(entry: WorkerTruthPromotionJournalEntry): number | null {
  const sequence = entry.mutationEnvelope.journalSequence;
  return typeof sequence === 'number' && Number.isInteger(sequence) && sequence > 0
    ? sequence
    : null;
}

function cloneEntry(entry: WorkerTruthPromotionJournalEntry): WorkerTruthPromotionJournalEntry {
  return structuredClone(entry);
}

export class WorkerTruthPromotionModule {
  private readonly deviceId: string;
  private readonly identityEpoch: string;
  private readonly journalSource: WorkerTruthPromotionJournalSource;
  private readonly stateStore: WorkerTruthPromotionStateStore;
  private readonly publisher: WorkerTruthPromotionPublisher;
  private readonly maxBatchSize: number;
  private readonly retryDelayMs: number;
  private readonly now: () => number;
  private activePromotion: Promise<WorkerTruthPromotionResult> | null = null;
  private publicationQueue: Promise<void> = Promise.resolve();
  private shutdownStarted = false;

  constructor(options: WorkerTruthPromotionModuleOptions) {
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    this.identityEpoch = normalizeIdentity(options.identityEpoch, 'identityEpoch');
    this.journalSource = options.journalSource;
    this.stateStore = options.stateStore;
    this.publisher = options.publisher;
    this.maxBatchSize = Math.max(1, Math.floor(Number(options.maxBatchSize) || 32));
    this.retryDelayMs = Math.max(1, Math.floor(Number(options.retryDelayMs) || 1_000));
    this.now = options.now ?? Date.now;
  }

  promotePending(request: WorkerTruthPromotionRequest = {}): Promise<WorkerTruthPromotionResult> {
    if (this.activePromotion) {
      return this.activePromotion;
    }
    if (this.shutdownStarted) {
      return Promise.resolve({
        ok: false,
        promotedMutationIds: [],
        coveredJournalSequence: 0,
        truthGenerationId: null,
        error: 'truth-promotion-shutdown',
      });
    }
    const requestedBatchSize = Math.floor(Number(request.maxBatchSize));
    const batchSize = Number.isFinite(requestedBatchSize) && requestedBatchSize > 0
      ? requestedBatchSize
      : this.maxBatchSize;
    this.activePromotion = this.enqueuePublication(() => this.runPromotion(batchSize)).finally(() => {
      this.activePromotion = null;
    });
    return this.activePromotion;
  }

  runExclusivePublication<T>(publish: () => Promise<T>): Promise<T> {
    if (this.shutdownStarted) {
      return Promise.reject(new Error('truth-promotion-shutdown'));
    }
    return this.enqueuePublication(publish);
  }

  async resolveReceipt(receipt: StorageDurabilityReceipt): Promise<StorageDurabilityReceipt> {
    const sequence = receipt.journalSequence;
    if (sequence === null || receipt.stage === 'failed') {
      return structuredClone(receipt);
    }
    const state = await this.readState();
    const coverage = state.coverage;
    if (!coverage || sequence > coverage.coveredJournalSequence) {
      return structuredClone(receipt);
    }
    return {
      ...structuredClone(receipt),
      version: STORAGE_DURABILITY_RECEIPT_VERSION,
      stage: 'truth-committed',
      truthGenerationId: coverage.truthGenerationId,
      retry: {
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
      },
      diagnosticCode: null,
      diagnosticMessage: null,
      updatedAt: Math.max(receipt.updatedAt, coverage.updatedAt),
    };
  }

  async diagnostics(): Promise<WorkerTruthPromotionDiagnostics> {
    const state = await this.readState();
    const covered = state.coverage?.coveredJournalSequence ?? 0;
    const pending = await this.readOrderedPending(covered, Number.MAX_SAFE_INTEGER);
    const newest = pending.at(-1);
    const oldest = pending[0];
    return {
      active: this.activePromotion !== null,
      shutdownStarted: this.shutdownStarted,
      pendingMutationCount: pending.length,
      oldestPendingAgeMs: oldest ? Math.max(0, this.now() - oldest.createdAt) : null,
      journalSequenceFrontier: newest ? journalSequence(newest) ?? covered : covered,
      truthCoverageFrontier: covered,
      retryReason: state.retry?.lastError ?? null,
      lastSuccessfulPromotionAt: state.lastSuccessfulPromotionAt,
    };
  }

  async shutdown(): Promise<void> {
    this.shutdownStarted = true;
    await this.activePromotion;
    await this.publicationQueue;
  }

  private async runPromotion(batchSize: number): Promise<WorkerTruthPromotionResult> {
    const state = await this.readState();
    const coveredSequence = state.coverage?.coveredJournalSequence ?? 0;
    const candidates = await this.readOrderedPending(coveredSequence, batchSize);
    if (candidates.length === 0) {
      return {
        ok: true,
        promotedMutationIds: [],
        coveredJournalSequence: coveredSequence,
        truthGenerationId: state.coverage?.truthGenerationId ?? null,
        error: null,
      };
    }

    const firstSequence = journalSequence(candidates[0]);
    if (firstSequence !== coveredSequence + 1) {
      return this.recordFailure(state, candidates[0], `journal-sequence-gap:${coveredSequence + 1}:${firstSequence}`);
    }
    const pending: WorkerTruthPromotionJournalEntry[] = [];
    let expectedSequence = coveredSequence + 1;
    for (const candidate of candidates) {
      if (journalSequence(candidate) !== expectedSequence) {
        break;
      }
      pending.push(candidate);
      expectedSequence += 1;
    }

    try {
      const publication = await this.publisher.publishBatch(pending.map(cloneEntry));
      const expectedMutationIds = pending.map((entry) => entry.mutationEnvelope.mutationId);
      const verifiedMutationIds = Array.from(new Set(publication.verifiedMutationIds));
      if (
        verifiedMutationIds.length !== expectedMutationIds.length
        || expectedMutationIds.some((mutationId) => !verifiedMutationIds.includes(mutationId))
      ) {
        throw new Error('truth-publication-incomplete-verification');
      }
      const last = pending[pending.length - 1];
      const lastSequence = journalSequence(last)!;
      const at = this.now();
      const nextState: WorkerTruthPromotionState = {
        ...state,
        coverage: {
          version: TRUTH_COVERAGE_WATERMARK_VERSION,
          deviceId: this.deviceId,
          identityEpoch: this.identityEpoch,
          coveredJournalSequence: lastSequence,
          coveredMutationId: last.mutationEnvelope.mutationId,
          truthGenerationId: normalizeIdentity(publication.generationId, 'truth generationId'),
          updatedAt: at,
        },
        retry: null,
        lastSuccessfulPromotionAt: at,
        updatedAt: at,
      };
      await this.stateStore.write(nextState);
      return {
        ok: true,
        promotedMutationIds: expectedMutationIds,
        coveredJournalSequence: lastSequence,
        truthGenerationId: nextState.coverage.truthGenerationId,
        error: null,
      };
    } catch (error) {
      return this.recordFailure(state, pending[0], errorMessage(error));
    }
  }

  private async recordFailure(
    state: WorkerTruthPromotionState,
    entry: WorkerTruthPromotionJournalEntry,
    error: string,
  ): Promise<WorkerTruthPromotionResult> {
    const sequence = journalSequence(entry) ?? 0;
    const priorAttempts = state.retry?.mutationId === entry.mutationEnvelope.mutationId
      ? state.retry.attemptCount
      : 0;
    const failedAt = this.now();
    const nextState: WorkerTruthPromotionState = {
      ...state,
      retry: {
        mutationId: entry.mutationEnvelope.mutationId,
        journalSequence: sequence,
        attemptCount: priorAttempts + 1,
        nextAttemptAt: failedAt + this.retryDelayMs,
        lastError: error,
      },
      updatedAt: failedAt,
    };
    await this.stateStore.write(nextState);
    return {
      ok: false,
      promotedMutationIds: [],
      coveredJournalSequence: state.coverage?.coveredJournalSequence ?? 0,
      truthGenerationId: state.coverage?.truthGenerationId ?? null,
      error,
    };
  }

  private async readOrderedPending(
    afterJournalSequence: number,
    limit: number,
  ): Promise<WorkerTruthPromotionJournalEntry[]> {
    const entries = await this.journalSource.listJournaledMutations({
      afterJournalSequence,
      limit,
    });
    const ordered = entries
      .filter((entry) => (
        entry.mutationEnvelope.deviceId === this.deviceId
        && entry.mutationEnvelope.identityEpoch === this.identityEpoch
        && entry.durabilityReceipt.stage !== 'failed'
        && (journalSequence(entry) ?? 0) > afterJournalSequence
      ))
      .sort((left, right) => (journalSequence(left) ?? 0) - (journalSequence(right) ?? 0));
    const seenMutationIds = new Set<string>();
    return ordered
      .filter((entry) => {
        const mutationId = entry.mutationEnvelope.mutationId;
        if (seenMutationIds.has(mutationId)) {
          return false;
        }
        seenMutationIds.add(mutationId);
        return true;
      })
      .slice(0, Math.max(1, Math.floor(limit)));
  }

  private async readState(): Promise<WorkerTruthPromotionState> {
    const stored = await this.stateStore.read();
    if (!stored) {
      return {
        version: WORKER_TRUTH_PROMOTION_STATE_VERSION,
        deviceId: this.deviceId,
        identityEpoch: this.identityEpoch,
        coverage: null,
        retry: null,
        lastSuccessfulPromotionAt: null,
        updatedAt: 0,
      };
    }
    if (
      stored.version !== WORKER_TRUTH_PROMOTION_STATE_VERSION
      || stored.deviceId !== this.deviceId
      || stored.identityEpoch !== this.identityEpoch
    ) {
      throw new Error('truth-promotion-state-identity-mismatch');
    }
    return structuredClone(stored);
  }

  private enqueuePublication<T>(publish: () => Promise<T>): Promise<T> {
    const result = this.publicationQueue.then(publish, publish);
    this.publicationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
