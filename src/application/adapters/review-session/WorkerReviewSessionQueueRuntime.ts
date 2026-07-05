import type {
  BackendReviewSessionFeedbackResult,
  BackendReviewSessionRepairGateEvidence,
  BackendReviewSessionSkipResult,
  BackendReviewSessionState,
} from '../../../../packages/contracts/src/backend-rpc';
import type { FSRSCard } from '@/types/card';
import {
  QueueType,
  type QueueCounterSnapshot,
} from '@/types/unified-data-source';
import type {
  ReviewSessionAnswerCommand,
  ReviewSessionQueueResult,
  ReviewSessionQueueRuntime,
  ReviewSessionRebuildTrigger,
  ReviewSessionUndoResult,
} from './ReviewSessionQueueRuntime';

export interface WorkerReviewSessionBackendClient {
  reviewSessionStart(request: {
    sessionId?: string | null;
    queueType?: string | null;
    limit?: number | null;
  }): Promise<BackendReviewSessionState>;
  reviewSessionCurrent(request: {
    sessionId: string;
  }): Promise<BackendReviewSessionState>;
  reviewSessionFeedback(request: {
    sessionId: string;
    cardId: string;
    rating: 1 | 2 | 3 | 4;
    reviewedAt?: number | null;
    idempotencyKey?: string | null;
    repairGate?: BackendReviewSessionRepairGateEvidence | null;
  }): Promise<BackendReviewSessionFeedbackResult>;
  reviewSessionSkip(request: {
    sessionId: string;
    cardId: string;
  }): Promise<BackendReviewSessionSkipResult>;
}

export interface WorkerReviewSessionQueueRuntimeOptions {
  queueType: QueueType;
  backend: WorkerReviewSessionBackendClient;
  sessionId?: string | null;
  limit?: number | null;
  now?: () => number;
}

export class WorkerReviewSessionQueueRuntime implements ReviewSessionQueueRuntime {
  private readonly queueType: QueueType;
  private readonly backend: WorkerReviewSessionBackendClient;
  private readonly configuredSessionId: string | null;
  private readonly limit: number | null;
  private readonly now: () => number;
  private sessionId: string | null = null;
  private currentCard: FSRSCard | null = null;
  private counterSnapshot: QueueCounterSnapshot | null = null;
  private sessionCards: FSRSCard[] = [];

  constructor(options: WorkerReviewSessionQueueRuntimeOptions) {
    this.queueType = options.queueType;
    this.backend = options.backend;
    this.configuredSessionId = normalizeString(options.sessionId);
    this.limit = normalizeLimit(options.limit);
    this.now = options.now ?? (() => Date.now());
  }

  async next(): Promise<FSRSCard | null> {
    const state = this.sessionId
      ? await this.backend.reviewSessionCurrent({ sessionId: this.sessionId })
      : await this.backend.reviewSessionStart({
        sessionId: this.configuredSessionId,
        queueType: this.queueType,
        limit: this.limit,
      });
    this.applyState(state);
    return cloneCard(this.currentCard);
  }

  async answerAndAdvance(input: ReviewSessionAnswerCommand): Promise<ReviewSessionQueueResult> {
    await this.ensureSessionStarted();
    if (!this.sessionId) {
      return this.unavailableResult(input, 'WORKER_REVIEW_SESSION_UNAVAILABLE: session start returned no sessionId');
    }
    if (input.feedback.action === 'skip') {
      try {
        const result = await this.backend.reviewSessionSkip({
          sessionId: this.sessionId,
          cardId: input.card.id,
        });
        this.applyState(result);
        return this.buildResult(this.currentCard ? 'advanced' : 'exhausted', this.currentCard, null);
      } catch (error) {
        return this.unavailableResult(input, error instanceof Error ? error.message : String(error));
      }
    }
    if (input.feedback.action !== 'rate' || !input.feedback.rating) {
      return this.buildResult('advanced', this.currentCard, null);
    }
    try {
      const result = await this.backend.reviewSessionFeedback({
        sessionId: this.sessionId,
        cardId: input.card.id,
        rating: normalizeRating(input.feedback.rating),
        reviewedAt: this.now(),
        idempotencyKey: input.feedback.commitIdempotencyKey ?? null,
        repairGate: input.feedback.repairGate as BackendReviewSessionRepairGateEvidence | null | undefined,
      });
      this.applyState(result);
      return {
        ...this.buildResult(this.currentCard ? 'advanced' : 'exhausted', this.currentCard, null),
        commitStatus: 'applied',
        commitIdempotencyKey: result.feedback.idempotencyKey ?? input.feedback.commitIdempotencyKey,
      };
    } catch (error) {
      return this.unavailableResult(input, error instanceof Error ? error.message : String(error));
    }
  }

  async rebuild(trigger: ReviewSessionRebuildTrigger): Promise<void> {
    if (!isAllowedRebuildTrigger(trigger)) {
      throw new Error(`WORKER_REVIEW_SESSION_REBUILD_UNAVAILABLE: unsupported trigger ${trigger}`);
    }
    this.reset();
    await this.ensureSessionStarted();
  }

  getCounterSnapshot(): QueueCounterSnapshot | null {
    return this.counterSnapshot ? cloneCounterSnapshot(this.counterSnapshot) : null;
  }

  async ensureCounterSnapshot(): Promise<QueueCounterSnapshot | null> {
    await this.ensureSessionStarted();
    return this.getCounterSnapshot();
  }

  getSessionCards(): FSRSCard[] {
    return this.sessionCards.map(cloneRequiredCard);
  }

  appendCardsToTail(_cards: FSRSCard[]): number {
    return 0;
  }

  replaceCurrentCard(card: FSRSCard): boolean {
    if (!this.currentCard || this.currentCard.id !== card.id) {
      return false;
    }
    this.currentCard = cloneRequiredCard(card);
    this.sessionCards = [
      cloneRequiredCard(card),
      ...this.sessionCards.filter((entry) => entry.id !== card.id),
    ];
    return true;
  }

  undoLast(_token?: string | null): ReviewSessionUndoResult | null {
    return null;
  }

  reset(): void {
    this.sessionId = null;
    this.currentCard = null;
    this.counterSnapshot = null;
    this.sessionCards = [];
  }

  restoreFromSnapshot(_input: {
    cards: FSRSCard[];
    currentCard: FSRSCard | null;
    avoidCardId?: string | null;
    avoidBlockId?: string | null;
    counterSnapshot?: QueueCounterSnapshot | null;
  }): void {
    this.reset();
  }

  discardCard(card: Pick<FSRSCard, 'id'>): void {
    this.sessionCards = this.sessionCards.filter((entry) => entry.id !== card.id);
    if (this.currentCard?.id === card.id) {
      this.currentCard = null;
    }
    if (this.counterSnapshot) {
      const remaining = Math.max(0, this.counterSnapshot.remaining - 1);
      this.counterSnapshot = {
        ...this.counterSnapshot,
        remaining,
        due: Math.min(this.counterSnapshot.due, remaining),
        total: Math.max(remaining, this.counterSnapshot.total - 1),
        buckets: {
          ...this.counterSnapshot.buckets,
          all: remaining,
        },
      };
    }
  }

  restoreReviewedCardToLearning(card: FSRSCard): void {
    this.currentCard = cloneRequiredCard(card);
    this.sessionCards = [
      cloneRequiredCard(card),
      ...this.sessionCards.filter((entry) => entry.id !== card.id),
    ];
  }

  private async ensureSessionStarted(): Promise<void> {
    if (this.sessionId) {
      return;
    }
    const state = await this.backend.reviewSessionStart({
      sessionId: this.configuredSessionId,
      queueType: this.queueType,
      limit: this.limit,
    });
    this.applyState(state);
  }

  private applyState(state: BackendReviewSessionState): void {
    this.sessionId = String(state.sessionId || '').trim() || this.sessionId;
    this.currentCard = isFsrsCard(state.current) ? cloneRequiredCard(state.current) : null;
    this.counterSnapshot = normalizeCounterSnapshot(state.counters);
    this.sessionCards = this.currentCard ? [cloneRequiredCard(this.currentCard)] : [];
  }

  private buildResult(
    status: ReviewSessionQueueResult['status'],
    nextCard: FSRSCard | null,
    undoToken: string | null,
    reason?: string,
  ): ReviewSessionQueueResult {
    return {
      status,
      nextCard: cloneCard(nextCard),
      waitingUntil: null,
      counterSnapshot: this.counterSnapshot ?? buildEmptyCounterSnapshot(),
      undoToken,
      ...(reason ? { reason } : {}),
    };
  }

  private unavailableResult(input: ReviewSessionAnswerCommand, reason: string): ReviewSessionQueueResult {
    return {
      ...this.buildResult('unavailable', input.card, null, reason),
      reason,
    };
  }
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeLimit(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? Math.max(1, numeric) : null;
}

function normalizeRating(value: unknown): 1 | 2 | 3 | 4 {
  const numeric = Math.max(1, Math.min(4, Math.floor(Number(value) || 1)));
  return numeric as 1 | 2 | 3 | 4;
}

function isFsrsCard(value: unknown): value is FSRSCard {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string';
}

function normalizeCounterSnapshot(
  counters: BackendReviewSessionState['counters'] | null | undefined,
): QueueCounterSnapshot {
  const remaining = Math.max(0, Math.floor(Number(counters?.remaining) || 0));
  const due = Math.max(0, Math.floor(Number(counters?.due) || remaining));
  const total = Math.max(remaining, Math.floor(Number(counters?.total) || remaining));
  return {
    version: 1,
    remaining,
    due: Math.min(due, remaining),
    total,
    buckets: {
      all: remaining,
      item: remaining,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'hot',
  };
}

function buildEmptyCounterSnapshot(): QueueCounterSnapshot {
  return normalizeCounterSnapshot({ remaining: 0, due: 0, total: 0, source: 'worker-session' });
}

function cloneCard(card: FSRSCard | null): FSRSCard | null {
  return card ? cloneRequiredCard(card) : null;
}

function cloneRequiredCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as QueueCounterSnapshot;
}

function isAllowedRebuildTrigger(trigger: string): trigger is ReviewSessionRebuildTrigger {
  return trigger === 'session-start'
    || trigger === 'exhausted-continue'
    || trigger === 'day-rollover'
    || trigger === 'user-refresh'
    || trigger === 'scope-switch'
    || trigger === 'generation-conflict'
    || trigger === 'major-structural-change'
    || trigger === 'unsafe-reconcile';
}
