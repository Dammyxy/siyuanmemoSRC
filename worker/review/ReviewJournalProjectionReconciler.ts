import { buildQueueProjectionRows } from '@/application/services/queue-projection/QueueProjectionBuilder';
import type {
  QueueProjectionCounters,
  QueueProjectionGeneration,
  QueueProjectionReplaceInput,
  QueueProjectionRow,
  QueueProjectionRowsQuery,
} from '@/application/ports/QueueProjectionPort';
import type { StructuredCardQuery } from '@/types/card-query';
import { CardType, type FSRSCard } from '@/types/card';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { QueueType } from '@/types/unified-data-source';
import type { BackendReviewFeedbackRequest } from '../../packages/contracts/src/backend-rpc';
import type {
  ReviewFeedbackJournalEntryStatus,
  ReviewFeedbackJournalStoreStats,
} from '../db/ReviewFeedbackJournalStore';

const DEFAULT_REPLAY_BATCH_LIMIT = 512;
const REVIEW_FEEDBACK_JOURNAL_STATUSES = new Set<ReviewFeedbackJournalEntryStatus>([
  'prepared',
  'projection-applied',
  'truth-flushed',
  'projection-failed',
  'unavailable',
  'repair-required',
]);

type ReviewJournalProjectionQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

type ReviewJournalProjectionEntry = {
  id: string;
  requestId: string | null;
  cardId: string;
  idempotencyKey: string | null;
  status: ReviewFeedbackJournalEntryStatus;
  recordedAt: number;
  request: BackendReviewFeedbackRequest;
  appliedAt: number | null;
  projectionAppliedAt: number | null;
  projectionFailedAt: number | null;
  lastError: string | null;
};

type ReviewJournalProjectionDurableEvent = {
  card_id: string | null;
  rating: number | null;
  reviewed_at: number | null;
  payload_json: string | null;
};

type ReviewJournalProjectionReversalEvent = {
  payload_json: string | null;
};

type ReviewJournalProjectionReconciliation = {
  queueType: ReviewJournalProjectionQueueType;
  policyHash: string;
  generation: number;
  reviewedAt: number;
  cardIds: string[];
  blockIds: string[];
  preparedEntryIds: string[];
};

export type ReviewJournalProjectionReconcilerDeps = {
  journalStore: {
    listEntriesByStatus(status: ReviewFeedbackJournalEntryStatus, limit: number): Promise<unknown[]>;
    updateEntryStatus(
      id: string,
      status: ReviewFeedbackJournalEntryStatus,
      patch?: Record<string, unknown>,
    ): Promise<ReviewFeedbackJournalStoreStats>;
  } | null;
  queueProjection: {
    readGeneration(queueType: QueueType): QueueProjectionGeneration | null;
    listReadyGenerations(queueType: QueueType): QueueProjectionGeneration[];
    readCounters(queueType: QueueType, policyHash?: string | null): QueueProjectionCounters | null;
    readRows(query: QueueProjectionRowsQuery): QueueProjectionRow[];
    replaceQueueProjection(input: QueueProjectionReplaceInput): void;
  } | null;
  repository: {
    queryCards(query?: StructuredCardQuery): FSRSCard[];
  } | null;
  getDurableReviewEventByIdempotencyKey(idempotencyKey: string): ReviewJournalProjectionDurableEvent | null;
  getUndoReversalEventByReviewIdempotencyKey?(idempotencyKey: string): ReviewJournalProjectionReversalEvent | null;
  runTransaction<T>(
    label: string,
    task: () => T | Promise<T>,
    options?: { persist?: boolean },
  ): Promise<T>;
  replayBatchLimit?: number;
  now?: () => number;
};

export class ReviewJournalProjectionReconciler {
  constructor(private readonly deps: ReviewJournalProjectionReconcilerDeps) {}

  async reconcile(): Promise<void> {
    if (!this.deps.journalStore || !this.deps.queueProjection || !this.deps.repository) {
      return;
    }
    const entries = await this.readProjectionEntries();
    if (entries.length === 0) {
      return;
    }

    const groups = new Map<string, ReviewJournalProjectionReconciliation>();
    for (const entry of entries) {
      const reconciliation = this.buildReconciliation(entry);
      if (!reconciliation) {
        continue;
      }
      for (const expanded of this.expandReconciliationPolicies(reconciliation)) {
        this.mergeReconciliation(groups, expanded);
      }
    }

    const appliedPreparedEntries = new Map<string, number>();
    for (const reconciliation of groups.values()) {
      if (this.needsReconciliation(reconciliation)) {
        await this.deps.runTransaction('reviewFeedback.journal-projection-reconcile', () => {
          this.replaceProjection(reconciliation);
        }, { persist: false });
      }
      for (const entryId of reconciliation.preparedEntryIds) {
        appliedPreparedEntries.set(entryId, reconciliation.reviewedAt);
      }
    }

    for (const [entryId, appliedAt] of appliedPreparedEntries) {
      await this.markPreparedEntryProjectionApplied(entryId, appliedAt);
    }
  }

  private async readProjectionEntries(): Promise<ReviewJournalProjectionEntry[]> {
    if (!this.deps.journalStore) {
      return [];
    }
    const entries: ReviewJournalProjectionEntry[] = [];
    for (const status of ['projection-applied', 'truth-flushed', 'prepared'] satisfies ReviewFeedbackJournalEntryStatus[]) {
      entries.push(...normalizeReviewJournalProjectionEntries(
        await this.deps.journalStore.listEntriesByStatus(status, this.replayBatchLimit),
      ));
    }
    return entries
      .sort((a, b) => a.recordedAt - b.recordedAt)
      .slice(0, this.replayBatchLimit);
  }

  private buildReconciliation(
    entry: ReviewJournalProjectionEntry,
  ): ReviewJournalProjectionReconciliation | null {
    const queueType = resolveReviewJournalProjectionQueueType(entry.request.queueType);
    if (!queueType) {
      return null;
    }
    const idempotencyKey = normalizeString(entry.idempotencyKey)
      || normalizeString(entry.request.idempotencyKey);
    if (!idempotencyKey) {
      return null;
    }
    const event = this.deps.getDurableReviewEventByIdempotencyKey(idempotencyKey);
    if (!event || !reviewJournalMatchesDurableEvent(entry, event)) {
      return null;
    }
    if (this.hasUndoReversalEvidence(idempotencyKey)) {
      return this.buildReversalReconciliation(entry, event, queueType);
    }

    const requestedGeneration = Math.max(0, Math.floor(Number(entry.request.projectionGeneration || 0)));
    const generation = Math.max(
      requestedGeneration + 1,
      1,
    );
    const reviewedAt = Math.max(
      1,
      Math.floor(Number(event.reviewed_at ?? entry.request.reviewedAt ?? entry.appliedAt ?? this.now()) || this.now()),
    );
    const policyHash = normalizeString(entry.request.projectionPolicyHash)
      || this.deps.queueProjection?.readGeneration(queueType)?.policyHash
      || '';
    if (!policyHash) {
      return null;
    }
    const cardId = normalizeString(entry.cardId) || normalizeString(entry.request.cardId);
    const payload = parseSqlJsonRecord(event.payload_json);
    const blockId = readRecordString(payload, ['blockId', 'sourceBlockId']);
    return {
      queueType,
      policyHash,
      generation,
      reviewedAt,
      cardIds: cardId ? [cardId] : [],
      blockIds: blockId ? [blockId] : [],
      preparedEntryIds: entry.status === 'prepared' ? [entry.id] : [],
    };
  }

  private buildReversalReconciliation(
    entry: ReviewJournalProjectionEntry,
    event: ReviewJournalProjectionDurableEvent,
    queueType: ReviewJournalProjectionQueueType,
  ): ReviewJournalProjectionReconciliation | null {
    const requestedGeneration = Math.max(0, Math.floor(Number(entry.request.projectionGeneration || 0)));
    const generation = Math.max(requestedGeneration + 1, 1);
    const reviewedAt = Math.max(
      1,
      Math.floor(Number(event.reviewed_at ?? entry.request.reviewedAt ?? entry.appliedAt ?? this.now()) || this.now()),
    );
    const policyHash = normalizeString(entry.request.projectionPolicyHash)
      || this.deps.queueProjection?.readGeneration(queueType)?.policyHash
      || '';
    if (!policyHash) {
      return null;
    }
    const cardId = normalizeString(entry.cardId) || normalizeString(entry.request.cardId);
    const payload = parseSqlJsonRecord(event.payload_json);
    const blockId = readRecordString(payload, ['blockId', 'sourceBlockId']);
    return {
      queueType,
      policyHash,
      generation,
      reviewedAt,
      cardIds: cardId ? [cardId] : [],
      blockIds: blockId ? [blockId] : [],
      preparedEntryIds: entry.status === 'prepared' ? [entry.id] : [],
    };
  }

  private hasUndoReversalEvidence(idempotencyKey: string): boolean {
    const event = this.deps.getUndoReversalEventByReviewIdempotencyKey?.(idempotencyKey);
    if (!event) {
      return false;
    }
    const payload = parseSqlJsonRecord(event.payload_json);
    return normalizeString(payload.originalReviewIdempotencyKey) === idempotencyKey;
  }

  private mergeReconciliation(
    groups: Map<string, ReviewJournalProjectionReconciliation>,
    reconciliation: ReviewJournalProjectionReconciliation,
  ): void {
    const key = `${reconciliation.queueType}:${reconciliation.policyHash}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, reconciliation);
      return;
    }
    existing.generation = Math.max(existing.generation, reconciliation.generation);
    existing.reviewedAt = Math.max(existing.reviewedAt, reconciliation.reviewedAt);
    existing.cardIds = uniqueStrings([...existing.cardIds, ...reconciliation.cardIds]);
    existing.blockIds = uniqueStrings([...existing.blockIds, ...reconciliation.blockIds]);
    existing.preparedEntryIds = uniqueStrings([...existing.preparedEntryIds, ...reconciliation.preparedEntryIds]);
  }

  private expandReconciliationPolicies(
    reconciliation: ReviewJournalProjectionReconciliation,
  ): ReviewJournalProjectionReconciliation[] {
    if (!this.deps.queueProjection) {
      return [reconciliation];
    }
    const readyGenerations = this.deps.queueProjection
      .listReadyGenerations(reconciliation.queueType)
      .filter((generation) => normalizeString(generation.policyHash));
    if (readyGenerations.length === 0) {
      return [reconciliation];
    }
    const expanded = new Map<string, ReviewJournalProjectionReconciliation>();
    for (const generation of readyGenerations) {
      const policyHash = normalizeString(generation.policyHash);
      expanded.set(policyHash, {
        ...reconciliation,
        policyHash,
        generation: Math.max(reconciliation.generation, Math.floor(Number(generation.generation) || 0) + 1),
      });
    }
    if (!expanded.has(reconciliation.policyHash)) {
      expanded.set(reconciliation.policyHash, reconciliation);
    }
    return [...expanded.values()];
  }

  private async markPreparedEntryProjectionApplied(entryId: string, appliedAt: number): Promise<void> {
    if (!this.deps.journalStore) {
      return;
    }
    await this.deps.journalStore.updateEntryStatus(entryId, 'projection-applied', {
      appliedAt,
      projectionAppliedAt: this.now(),
      projectionFailedAt: null,
      lastError: null,
    });
  }

  private needsReconciliation(reconciliation: ReviewJournalProjectionReconciliation): boolean {
    if (!this.deps.queueProjection) {
      return false;
    }
    const current = this.deps.queueProjection
      .listReadyGenerations(reconciliation.queueType)
      .find((generation) => generation.policyHash === reconciliation.policyHash)
      ?? this.deps.queueProjection.readGeneration(reconciliation.queueType);
    if (!current || current.status !== 'ready' || current.generation < reconciliation.generation) {
      return true;
    }
    if (current.generation > reconciliation.generation) {
      return false;
    }
    const counters = this.deps.queueProjection.readCounters(reconciliation.queueType, reconciliation.policyHash);
    if (!counters) {
      return true;
    }
    const rows = this.deps.queueProjection.readRows({
      queueType: reconciliation.queueType,
      policyHash: reconciliation.policyHash,
      generation: current.generation,
    });
    const expectedTotal = Math.max(0, Math.floor(Number(counters.total ?? counters.remaining ?? 0)));
    if (expectedTotal > rows.length) {
      return true;
    }
    const reconciledCardIds = new Set(reconciliation.cardIds);
    return rows.some((row) => reconciledCardIds.has(normalizeString(row.cardId)));
  }

  private replaceProjection(reconciliation: ReviewJournalProjectionReconciliation): void {
    if (!this.deps.queueProjection || !this.deps.repository) {
      return;
    }
    const dayEnd = getReviewJournalProjectionDayEnd(reconciliation.reviewedAt);
    const cardTypes = reconciliation.queueType === QueueType.RetrievalPractice
      ? [CardType.Item, CardType.Descriptor]
      : [
        CardType.Item,
        CardType.Descriptor,
        CardType.Topic,
        CardType.Concept,
        CardType.Incremental,
        CardType.Webpage,
      ];
    const baseCards = this.deps.repository.queryCards({
      cardTypes,
      dueDate: { lte: dayEnd },
      includeSuspended: false,
      sourceStatus: 'active',
    } satisfies StructuredCardQuery);
    const buildResult = buildQueueProjectionRows({
      queueType: reconciliation.queueType,
      baseCards,
      now: reconciliation.reviewedAt,
      dayEnd,
      newCardsPerDay: DEFAULT_SETTINGS.newCardsPerDay,
      reviewsPerDay: DEFAULT_SETTINGS.reviewsPerDay,
      priorityRandomness: DEFAULT_SETTINGS.priorityRandomness,
      learnAheadWindowEnd: reconciliation.reviewedAt
        + DEFAULT_SETTINGS.scheduler.srsV2.learnAhead.windowMinutes * 60 * 1000,
      learnAheadMaxCards: DEFAULT_SETTINGS.scheduler.srsV2.learnAhead.maxCards,
      stableSalt: `${reconciliation.queueType}:${reconciliation.policyHash}`,
      policyHash: reconciliation.policyHash,
      sourceGeneration: reconciliation.generation,
      updatedAt: reconciliation.reviewedAt,
    });
    this.deps.queueProjection.replaceQueueProjection({
      queueType: reconciliation.queueType,
      policyHash: reconciliation.policyHash,
      generation: reconciliation.generation,
      rows: buildResult.rows,
      counters: buildResult.counters,
      metadata: {
        reason: 'review-feedback-journal-reconciliation',
        source: 'review-feedback-journal',
        reconciledCardIds: reconciliation.cardIds,
        reconciledBlockIds: reconciliation.blockIds,
      },
    });
  }

  private get replayBatchLimit(): number {
    return Math.max(1, Math.floor(Number(this.deps.replayBatchLimit ?? DEFAULT_REPLAY_BATCH_LIMIT) || DEFAULT_REPLAY_BATCH_LIMIT));
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

function normalizeReviewJournalProjectionEntries(entries: unknown[]): ReviewJournalProjectionEntry[] {
  return entries.filter((entry): entry is ReviewJournalProjectionEntry => {
    return typeof entry === 'object'
      && entry !== null
      && typeof (entry as ReviewJournalProjectionEntry).id === 'string'
      && typeof (entry as ReviewJournalProjectionEntry).cardId === 'string'
      && typeof (entry as ReviewJournalProjectionEntry).recordedAt === 'number'
      && typeof (entry as ReviewJournalProjectionEntry).request === 'object'
      && (entry as ReviewJournalProjectionEntry).request !== null;
  }).map((entry) => ({
    ...entry,
    status: normalizeReviewJournalEntryStatus((entry as Partial<ReviewJournalProjectionEntry>).status),
    appliedAt: typeof entry.appliedAt === 'number' && Number.isFinite(entry.appliedAt) ? entry.appliedAt : null,
    projectionAppliedAt: typeof entry.projectionAppliedAt === 'number' && Number.isFinite(entry.projectionAppliedAt)
      ? entry.projectionAppliedAt
      : null,
    projectionFailedAt: typeof entry.projectionFailedAt === 'number' && Number.isFinite(entry.projectionFailedAt)
      ? entry.projectionFailedAt
      : null,
    lastError: typeof entry.lastError === 'string' ? entry.lastError : null,
  }));
}

function normalizeReviewJournalEntryStatus(status: unknown): ReviewFeedbackJournalEntryStatus {
  return typeof status === 'string' && REVIEW_FEEDBACK_JOURNAL_STATUSES.has(status as ReviewFeedbackJournalEntryStatus)
    ? status as ReviewFeedbackJournalEntryStatus
    : 'prepared';
}

function reviewJournalMatchesDurableEvent(
  entry: ReviewJournalProjectionEntry,
  event: ReviewJournalProjectionDurableEvent,
): boolean {
  const request = entry.request;
  const payload = parseSqlJsonRecord(event.payload_json);
  const requestCardId = normalizeString(request.cardId) || normalizeString(entry.cardId);
  const eventCardId = normalizeString(event.card_id) || readRecordString(payload, ['cardId']);
  if (!requestCardId || requestCardId !== eventCardId) {
    return false;
  }
  const requestRating = Math.floor(Number(request.rating));
  const eventRating = Math.floor(Number(event.rating ?? payload.rating));
  if (!Number.isFinite(requestRating) || requestRating !== eventRating) {
    return false;
  }
  const requestReviewedAt = Math.floor(Number(request.reviewedAt ?? entry.appliedAt));
  const eventReviewedAt = Math.floor(Number(event.reviewed_at ?? payload.reviewedAt));
  if (!Number.isFinite(requestReviewedAt) || requestReviewedAt !== eventReviewedAt) {
    return false;
  }
  const payloadQueueType = normalizeString(payload.queueType);
  return !payloadQueueType || payloadQueueType === normalizeString(request.queueType);
}

function resolveReviewJournalProjectionQueueType(
  value: unknown,
): ReviewJournalProjectionQueueType | null {
  const queueType = normalizeString(value);
  if (queueType === QueueType.RetrievalPractice || queueType === QueueType.IncrementalLearning) {
    return queueType;
  }
  return null;
}

function parseSqlJsonRecord(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || '').trim() || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const normalized = normalizeString(record[key]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function getReviewJournalProjectionDayEnd(timestamp: number): number {
  const dayStartHour = Math.max(0, Math.min(23, Math.floor(Number(DEFAULT_SETTINGS.fsrs.dayStartHour) || 0)));
  const now = new Date(timestamp);
  const start = new Date(now);
  if (now.getHours() < dayStartHour) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(dayStartHour, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  return start.getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
