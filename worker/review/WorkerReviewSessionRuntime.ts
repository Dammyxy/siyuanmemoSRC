import type {
  QueueProjectionGeneration,
  QueueProjectionRow,
  QueueProjectionRowsQuery,
} from '@/application/ports/QueueProjectionPort';
import type { FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type {
  BackendReviewFeedbackRequest,
  BackendReviewFeedbackResult,
  BackendReviewSessionRepairGateEvidence,
} from '../../packages/contracts/src/backend-rpc';
import { recordBackendWorkerInnerStep } from '../bootstrap/ReviewFeedbackTimingScope';
import type {
  ReviewTransactionUndoJournal,
  ReviewTransactionUndoJournalEntry,
  ReviewTransactionUndoJournalFrontier,
  ReviewTransactionUndoOperation,
} from './ReviewTransactionUndoJournal';

const REVIEW_SESSION_FEEDBACK_STEP_SLOW_MS = 120;

type WorkerReviewSessionQueueProjection = {
  readGeneration(queueType: QueueType): QueueProjectionGeneration | null | Promise<QueueProjectionGeneration | null>;
  readRows(query: QueueProjectionRowsQuery): QueueProjectionRow[] | Promise<QueueProjectionRow[]>;
};

type WorkerReviewSessionRepository = {
  getCard(cardId: string): FSRSCard | null | undefined | Promise<FSRSCard | null | undefined>;
  upsertCards?(cards: FSRSCard[]): void | Promise<void>;
};

type WorkerReviewSessionFeedbackRuntime = {
  reviewFeedback(request: BackendReviewFeedbackRequest): Promise<BackendReviewFeedbackResult>;
};

export interface WorkerReviewSessionStartRequest {
  sessionId?: string | null;
  queueType?: QueueType | string | null;
  limit?: number | null;
}

export interface WorkerReviewSessionFeedbackRequest {
  sessionId: string;
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt?: number | null;
  idempotencyKey?: string | null;
  repairGate?: BackendReviewSessionRepairGateEvidence | null;
}

export interface WorkerReviewSessionSkipRequest {
  sessionId: string;
  cardId: string;
}

export interface WorkerReviewSessionUndoRequest {
  sessionId: string;
  undoToken?: string | null;
}

export interface WorkerReviewSessionCounterSnapshot {
  remaining: number;
  due: number;
  total: number;
  source: 'worker-session';
}

export interface WorkerReviewSessionState {
  sessionId: string;
  queueType: QueueType;
  current: FSRSCard | null;
  lookaheadCards: FSRSCard[];
  counters: WorkerReviewSessionCounterSnapshot;
  projectionState: 'ready' | 'stale' | 'deferred' | 'refresh-required' | 'not-used';
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

export interface WorkerReviewSessionFeedbackResult extends WorkerReviewSessionState {
  answeredCardId: string;
  feedback: BackendReviewFeedbackResult;
  undoToken?: string | null;
}

export interface WorkerReviewSessionSkipResult extends WorkerReviewSessionState {
  skippedCardId: string;
  undoToken?: string | null;
}

export interface WorkerReviewSessionUndoResult extends WorkerReviewSessionState {
  restoredCardId: string | null;
  replayedCardId: string | null;
  undoToken: string;
}

type WorkerReviewSessionUndoSnapshot = {
  cards: FSRSCard[];
  current: FSRSCard | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
};

type WorkerReviewSessionUndoEntry = {
  token: string;
  snapshot: WorkerReviewSessionUndoSnapshot;
  replayedCardId: string | null;
};

type WorkerReviewSession = {
  sessionId: string;
  queueType: QueueType;
  cards: FSRSCard[];
  current: FSRSCard | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
  undoSequence: number;
  undoStack: WorkerReviewSessionUndoEntry[];
};

export class WorkerReviewSessionRuntime {
  private readonly sessions = new Map<string, WorkerReviewSession>();
  private nextSessionId = 1;
  private readonly maxUndoEntries = 20;

  constructor(private readonly deps: {
    repository: WorkerReviewSessionRepository;
    queueProjection: WorkerReviewSessionQueueProjection | null;
    feedbackRuntime: WorkerReviewSessionFeedbackRuntime;
    undoJournal?: ReviewTransactionUndoJournal | null;
  }) {}

  async startSession(request: WorkerReviewSessionStartRequest = {}): Promise<WorkerReviewSessionState> {
    const queueType = normalizeQueueType(request.queueType);
    const sessionId = normalizeString(request.sessionId) ?? `worker-review-session:${this.nextSessionId++}`;
    const generation = this.deps.queueProjection
      ? await this.deps.queueProjection.readGeneration(queueType)
      : null;
    if (!generation || generation.status !== 'ready') {
      const session: WorkerReviewSession = {
        sessionId,
        queueType,
        cards: [],
        current: null,
        avoidOnceCardId: null,
        avoidOnceBlockId: null,
        projectionGeneration: generation?.generation ?? null,
        projectionPolicyHash: generation?.policyHash ?? null,
        undoSequence: 0,
        undoStack: [],
      };
      this.sessions.set(sessionId, session);
      return this.toState(session, generation ? 'refresh-required' : 'not-used');
    }

    const rows = await this.deps.queueProjection!.readRows({
      queueType,
      policyHash: generation.policyHash,
      generation: generation.generation,
      limit: normalizeLimit(request.limit),
    });
    const hydratedCards = await Promise.all(
      rows.map((row) => this.deps.repository.getCard(row.cardId)),
    );
    const cards = hydratedCards.filter((card): card is FSRSCard => Boolean(card));
    const session: WorkerReviewSession = {
      sessionId,
      queueType,
      cards,
      current: null,
      avoidOnceCardId: null,
      avoidOnceBlockId: null,
      projectionGeneration: generation.generation,
      projectionPolicyHash: generation.policyHash,
      undoSequence: 0,
      undoStack: [],
    };
    session.current = this.selectNextCard(session);
    this.sessions.set(sessionId, session);
    return this.toState(session, 'ready');
  }

  getSessionState(sessionId: string): WorkerReviewSessionState {
    const session = this.requireSession(sessionId);
    if (!session.current) {
      session.current = this.selectNextCard(session);
    }
    return this.toState(session, 'ready');
  }

  async feedback(request: WorkerReviewSessionFeedbackRequest): Promise<WorkerReviewSessionFeedbackResult> {
    const totalStartedAt = Date.now();
    const session = this.requireSession(request.sessionId);
    const undoEntry = this.measureFeedbackStep(
      'session-feedback-preflight',
      session,
      request,
      () => {
        this.requireCurrentCard(session, request.cardId);
        this.requireValidRepairGate(request);
        return this.pushUndoSnapshot(session, request.cardId);
      },
    );

    const feedback = await this.measureFeedbackStep(
      'session-feedback-commit',
      session,
      request,
      () => this.deps.feedbackRuntime.reviewFeedback({
      cardId: request.cardId,
      rating: request.rating,
      queueType: session.queueType,
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      sessionId: session.sessionId,
      reviewedAt: request.reviewedAt ?? Date.now(),
      idempotencyKey: request.idempotencyKey ?? null,
      }),
    );
    if (!feedback.committed) {
      throw new Error(`WORKER_REVIEW_SESSION_COMMIT_FAILED: ${request.sessionId}`);
    }

    this.measureFeedbackStep(
      'session-feedback-advance',
      session,
      request,
      () => this.advanceAfterRating(session, request.cardId, request.rating),
    );
    await this.measureFeedbackStep(
      'session-feedback-undo-journal-append',
      session,
      request,
      () => this.appendUndoJournalEntry(session, undoEntry, 'answer', {
        afterCard: feedback.updatedCard ?? null,
        idempotencyKey: feedback.idempotencyKey ?? request.idempotencyKey ?? null,
        queueImpact: feedback.queueImpact ?? null,
      }),
    );
    const state = this.measureFeedbackStep(
      'session-feedback-state',
      session,
      request,
      () => this.toState(session, resolveProjectionState(feedback)),
    );
    this.recordFeedbackStep('session-feedback-total', session, request, Date.now() - totalStartedAt);

    return {
      ...state,
      answeredCardId: request.cardId,
      feedback,
      undoToken: undoEntry.token,
    };
  }

  private async measureFeedbackStep<TResult>(
    step: string,
    session: WorkerReviewSession,
    request: WorkerReviewSessionFeedbackRequest,
    task: () => Promise<TResult>,
  ): Promise<TResult>;
  private measureFeedbackStep<TResult>(
    step: string,
    session: WorkerReviewSession,
    request: WorkerReviewSessionFeedbackRequest,
    task: () => TResult,
  ): TResult;
  private measureFeedbackStep<TResult>(
    step: string,
    session: WorkerReviewSession,
    request: WorkerReviewSessionFeedbackRequest,
    task: () => TResult | Promise<TResult>,
  ): TResult | Promise<TResult> {
    const startedAt = Date.now();
    const record = (): void => {
      this.recordFeedbackStep(step, session, request, Date.now() - startedAt);
    };
    try {
      const result = task();
      if (result && typeof (result as Promise<TResult>).then === 'function') {
        return (result as Promise<TResult>).finally(record);
      }
      record();
      return result;
    } catch (error) {
      record();
      throw error;
    }
  }

  private recordFeedbackStep(
    step: string,
    session: WorkerReviewSession,
    request: WorkerReviewSessionFeedbackRequest,
    durationMs: number,
  ): void {
    if (durationMs < REVIEW_SESSION_FEEDBACK_STEP_SLOW_MS) {
      return;
    }
    recordBackendWorkerInnerStep({
      layer: 'session',
      step,
      durationMs,
      cardId: request.cardId,
      queueType: session.queueType,
      extra: {
        backendMethod: 'review.session.feedback',
        sessionId: session.sessionId,
        rating: request.rating,
      },
    });
  }

  async skip(request: WorkerReviewSessionSkipRequest): Promise<WorkerReviewSessionSkipResult> {
    const session = this.requireSession(request.sessionId);
    const current = this.requireCurrentCard(session, request.cardId);
    const undoEntry = this.pushUndoSnapshot(session, request.cardId);

    this.removeCard(session, request.cardId);
    session.cards.push(cloneCard(current));
    this.setAvoidOnce(session, current);
    session.current = this.selectNextCard(session);
    await this.appendUndoJournalEntry(session, undoEntry, 'skip', {
      afterCard: null,
      idempotencyKey: null,
      queueImpact: null,
    });

    return {
      ...this.toState(session, 'ready'),
      skippedCardId: request.cardId,
      undoToken: undoEntry.token,
    };
  }

  async undo(request: WorkerReviewSessionUndoRequest): Promise<WorkerReviewSessionUndoResult> {
    if (this.deps.undoJournal) {
      const journalEntry = await this.consumeUndoJournalEntry(request);
      if (!journalEntry) {
        throw new Error(`WORKER_REVIEW_SESSION_UNDO_UNAVAILABLE: ${request.sessionId}`);
      }
      return this.restoreFromJournalEntry(journalEntry);
    }
    const session = this.sessions.get(request.sessionId);
    const entry = session ? this.popUndoEntry(session, request.undoToken) : null;
    if (!entry) {
      throw new Error(`WORKER_REVIEW_SESSION_UNDO_UNAVAILABLE: ${request.sessionId}`);
    }
    return this.restoreSessionFromSnapshot(
      session!,
      entry.snapshot,
      entry.replayedCardId,
      entry.token,
      true,
    );
  }

  private requireSession(sessionId: string): WorkerReviewSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`WORKER_REVIEW_SESSION_UNAVAILABLE: ${sessionId}`);
    }
    return session;
  }

  private requireCurrentCard(session: WorkerReviewSession, cardId: string): FSRSCard {
    const current = session.current ?? this.selectNextCard(session);
    if (!current || current.id !== cardId) {
      throw new Error(`WORKER_REVIEW_SESSION_CURRENT_MISMATCH: ${session.sessionId}`);
    }
    session.current = current;
    return current;
  }

  private requireValidRepairGate(request: WorkerReviewSessionFeedbackRequest): void {
    const gate = request.repairGate;
    if (!gate) {
      throw new Error('WORKER_REVIEW_SESSION_REPAIR_GATE_UNAVAILABLE: missing repair gate');
    }
    const reason = normalizeString(gate.reason) ?? 'unsafe repair gate';
    if (gate.state === 'blocking') {
      throw new Error(`WORKER_REVIEW_SESSION_REPAIR_GATE_BLOCKED: ${reason}`);
    }
    if (gate.state === 'unavailable') {
      throw new Error(`WORKER_REVIEW_SESSION_REPAIR_GATE_UNAVAILABLE: ${reason}`);
    }
    if (gate.state !== 'clean' && gate.state !== 'accepted-repairable') {
      throw new Error(`WORKER_REVIEW_SESSION_REPAIR_GATE_UNAVAILABLE: unknown repair gate state ${String(gate.state)}`);
    }
    if (!Number.isFinite(Number(gate.createdAt)) || Number(gate.createdAt) <= 0) {
      throw new Error(`WORKER_REVIEW_SESSION_REPAIR_GATE_UNAVAILABLE: stale repair gate ${reason}`);
    }
    const gateCardId = normalizeString(gate.cardId);
    if (gateCardId && gateCardId !== request.cardId) {
      throw new Error(`WORKER_REVIEW_SESSION_REPAIR_GATE_BLOCKED: current-card-conflict ${gateCardId}`);
    }
  }

  private advanceAfterRating(session: WorkerReviewSession, cardId: string, rating: 1 | 2 | 3 | 4): void {
    const current = this.requireCurrentCard(session, cardId);
    this.removeCard(session, cardId);
    this.setAvoidOnce(session, current);
    if (rating < 3) {
      session.cards.push(cloneCard(current));
    }
    session.current = this.selectNextCard(session);
  }

  private selectNextCard(session: WorkerReviewSession): FSRSCard | null {
    if (session.cards.length === 0) {
      this.clearAvoidOnce(session);
      return null;
    }
    const index = this.selectNextCardIndex(session);
    const [selected] = session.cards.splice(index, 1);
    if (!selected) {
      this.clearAvoidOnce(session);
      return null;
    }
    this.clearAvoidOnce(session);
    return cloneCard(selected);
  }

  private selectNextCardIndex(session: WorkerReviewSession): number {
    const avoidCardId = normalizeCardId(session.avoidOnceCardId);
    const avoidBlockId = normalizeCardId(session.avoidOnceBlockId);
    if (!avoidCardId && !avoidBlockId) {
      return 0;
    }
    const differentBlockIndex = session.cards.findIndex((card) => (
      (!avoidCardId || normalizeCardId(card.id) !== avoidCardId)
      && (!avoidBlockId || normalizeCardId(card.blockId) !== avoidBlockId)
    ));
    if (differentBlockIndex >= 0) {
      return differentBlockIndex;
    }
    const differentCardIndex = session.cards.findIndex((card) => (
      !avoidCardId || normalizeCardId(card.id) !== avoidCardId
    ));
    return differentCardIndex >= 0 ? differentCardIndex : 0;
  }

  private removeCard(session: WorkerReviewSession, cardId: string): void {
    const normalized = normalizeCardId(cardId);
    session.cards = session.cards.filter((card) => normalizeCardId(card.id) !== normalized);
  }

  private setAvoidOnce(session: WorkerReviewSession, card: Pick<FSRSCard, 'id' | 'blockId'>): void {
    session.avoidOnceCardId = normalizeCardId(card.id) || null;
    session.avoidOnceBlockId = normalizeCardId(card.blockId) || null;
  }

  private clearAvoidOnce(session: WorkerReviewSession): void {
    session.avoidOnceCardId = null;
    session.avoidOnceBlockId = null;
  }

  private pushUndoSnapshot(session: WorkerReviewSession, replayedCardId: string | null): WorkerReviewSessionUndoEntry {
    session.undoSequence += 1;
    const token = `worker-review-session-undo:${session.sessionId}:${session.undoSequence}`;
    const entry: WorkerReviewSessionUndoEntry = {
      token,
      replayedCardId,
      snapshot: {
        cards: session.cards.map(cloneCard),
        current: session.current ? cloneCard(session.current) : null,
        avoidOnceCardId: session.avoidOnceCardId,
        avoidOnceBlockId: session.avoidOnceBlockId,
        projectionGeneration: session.projectionGeneration,
        projectionPolicyHash: session.projectionPolicyHash,
      },
    };
    session.undoStack.push(entry);
    if (session.undoStack.length > this.maxUndoEntries) {
      session.undoStack.shift();
    }
    return entry;
  }

  private popUndoEntry(session: WorkerReviewSession, token?: string | null): WorkerReviewSessionUndoEntry | null {
    if (!token) {
      return session.undoStack.pop() ?? null;
    }
    const index = session.undoStack.findIndex((entry) => entry.token === token);
    if (index < 0) {
      return null;
    }
    const [entry] = session.undoStack.splice(index, 1);
    return entry ?? null;
  }

  private toState(
    session: WorkerReviewSession,
    projectionState: WorkerReviewSessionState['projectionState'],
  ): WorkerReviewSessionState {
    const remaining = Math.max(0, session.cards.length + (session.current ? 1 : 0));
    return {
      sessionId: session.sessionId,
      queueType: session.queueType,
      current: session.current ? cloneCard(session.current) : null,
      lookaheadCards: this.peekLookaheadCards(session, 1),
      counters: {
        remaining,
        due: remaining,
        total: remaining,
        source: 'worker-session',
      },
      projectionState,
      projectionGeneration: session.projectionGeneration,
      projectionPolicyHash: session.projectionPolicyHash,
    };
  }

  private async appendUndoJournalEntry(
    session: WorkerReviewSession,
    undoEntry: WorkerReviewSessionUndoEntry,
    operation: ReviewTransactionUndoOperation,
    evidence: {
      afterCard: FSRSCard | null;
      idempotencyKey: string | null;
      queueImpact: BackendReviewFeedbackResult['queueImpact'] | null;
    },
  ): Promise<void> {
    const journal = this.deps.undoJournal;
    if (!journal) {
      return;
    }
    const entry: ReviewTransactionUndoJournalEntry = {
      schemaVersion: 1,
      transactionId: undoEntry.token,
      undoToken: undoEntry.token,
      sessionId: session.sessionId,
      queueType: session.queueType,
      operation,
      cardId: undoEntry.replayedCardId ?? undoEntry.snapshot.current?.id ?? '',
      replayedCardId: undoEntry.replayedCardId,
      originalReviewIdempotencyKey: evidence.idempotencyKey,
      beforeCard: undoEntry.snapshot.current ? cloneCard(undoEntry.snapshot.current) : null,
      afterCard: evidence.afterCard ? cloneCard(evidence.afterCard) : null,
      frontierBefore: this.cloneFrontier(undoEntry.snapshot),
      frontierAfter: this.captureFrontier(session),
      queueImpact: evidence.queueImpact ?? null,
      projectionGeneration: session.projectionGeneration,
      projectionPolicyHash: session.projectionPolicyHash,
      recordedAt: Date.now(),
      status: 'open',
      undoneAt: null,
    };
    try {
      await journal.append(entry);
    } catch (error) {
      throw new Error(
        `WORKER_REVIEW_SESSION_UNDO_JOURNAL_UNAVAILABLE: ${session.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async consumeUndoJournalEntry(
    request: WorkerReviewSessionUndoRequest,
  ): Promise<ReviewTransactionUndoJournalEntry | null> {
    const journal = this.deps.undoJournal;
    if (!journal) {
      return null;
    }
    return journal.consume(request);
  }

  private async restoreFromJournalEntry(entry: ReviewTransactionUndoJournalEntry): Promise<WorkerReviewSessionUndoResult> {
    const session = this.sessions.get(entry.sessionId) ?? {
      sessionId: entry.sessionId,
      queueType: normalizeQueueType(entry.queueType),
      cards: [],
      current: null,
      avoidOnceCardId: null,
      avoidOnceBlockId: null,
      projectionGeneration: null,
      projectionPolicyHash: null,
      undoSequence: 0,
      undoStack: [],
    };
    this.sessions.set(entry.sessionId, session);
    return this.restoreSessionFromSnapshot(
      session,
      entry.frontierBefore,
      entry.replayedCardId,
      entry.undoToken,
      entry.scheduleRestoreApplied !== true,
    );
  }

  private async restoreSessionFromSnapshot(
    session: WorkerReviewSession,
    snapshot: ReviewTransactionUndoJournalFrontier,
    replayedCardId: string | null,
    undoToken: string,
    restoreCardSchedule: boolean,
  ): Promise<WorkerReviewSessionUndoResult> {
    session.cards = snapshot.cards.map(cloneCard);
    session.current = snapshot.current ? cloneCard(snapshot.current) : null;
    session.avoidOnceCardId = snapshot.avoidOnceCardId;
    session.avoidOnceBlockId = snapshot.avoidOnceBlockId;
    session.projectionGeneration = snapshot.projectionGeneration;
    session.projectionPolicyHash = snapshot.projectionPolicyHash;
    if (restoreCardSchedule && snapshot.current && this.deps.repository.upsertCards) {
      await this.deps.repository.upsertCards([cloneCard(snapshot.current)]);
    }
    return {
      ...this.toState(session, 'ready'),
      restoredCardId: session.current?.id ?? null,
      replayedCardId,
      undoToken,
    };
  }

  private cloneFrontier(snapshot: WorkerReviewSessionUndoSnapshot): ReviewTransactionUndoJournalFrontier {
    return {
      cards: snapshot.cards.map(cloneCard),
      current: snapshot.current ? cloneCard(snapshot.current) : null,
      avoidOnceCardId: snapshot.avoidOnceCardId,
      avoidOnceBlockId: snapshot.avoidOnceBlockId,
      projectionGeneration: snapshot.projectionGeneration,
      projectionPolicyHash: snapshot.projectionPolicyHash,
    };
  }

  private captureFrontier(session: WorkerReviewSession): ReviewTransactionUndoJournalFrontier {
    return {
      cards: session.cards.map(cloneCard),
      current: session.current ? cloneCard(session.current) : null,
      avoidOnceCardId: session.avoidOnceCardId,
      avoidOnceBlockId: session.avoidOnceBlockId,
      projectionGeneration: session.projectionGeneration,
      projectionPolicyHash: session.projectionPolicyHash,
    };
  }

  private peekLookaheadCards(session: WorkerReviewSession, limit: number): FSRSCard[] {
    const count = Math.max(0, Math.floor(limit));
    if (count <= 0 || session.cards.length === 0) {
      return [];
    }
    const index = this.selectNextCardIndex(session);
    const selected = session.cards[index];
    return selected ? [cloneCard(selected)] : [];
  }
}

function normalizeQueueType(value: unknown): QueueType {
  const normalized = String(value || '').trim();
  if (normalized === QueueType.IncrementalLearning) {
    return QueueType.IncrementalLearning;
  }
  if (normalized === QueueType.FilterGroup) {
    return QueueType.FilterGroup;
  }
  return QueueType.RetrievalPractice;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeCardId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(value: unknown): number {
  return Math.max(1, Math.min(5000, Math.floor(Number(value) || 500)));
}

function cloneCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function resolveProjectionState(
  feedback: BackendReviewFeedbackResult,
): WorkerReviewSessionState['projectionState'] {
  if (feedback.queueImpact?.refreshRequired) {
    return 'refresh-required';
  }
  const outcomes = feedback.queueImpact?.affectedQueues.map((entry) => entry.outcome) ?? [];
  if (outcomes.includes('deferred')) {
    return 'deferred';
  }
  if (outcomes.includes('refresh-required')) {
    return 'refresh-required';
  }
  return feedback.queueImpact ? 'ready' : 'not-used';
}
