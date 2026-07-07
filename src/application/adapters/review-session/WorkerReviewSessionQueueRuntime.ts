import type {
  BackendReviewFeedbackQueueImpact,
  BackendReviewSessionFeedbackResult,
  BackendReviewSessionRepairGateEvidence,
  BackendReviewSessionSkipResult,
  BackendReviewSessionState,
  BackendReviewSessionUndoResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { FSRSCard } from '@/types/card';
import {
  QueueType,
  type QueueCounterSnapshot,
  type QueueFeedbackImpactEvidence,
} from '@/types/unified-data-source';
import type {
  ReviewSessionAnswerCommand,
  ReviewSessionQueueResult,
  ReviewSessionQueueRuntime,
  ReviewSessionRebuildTrigger,
  ReviewSessionUndoResult,
} from './ReviewSessionQueueRuntime';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WorkerReviewSessionQueueRuntime');

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
  reviewSessionUndo(request: {
    sessionId: string;
    undoToken?: string | null;
  }): Promise<BackendReviewSessionUndoResult>;
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
  private lastUndoToken: string | null = null;
  private readonly locallyDiscardedCurrentCardIds = new Set<string>();

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
    if (this.currentCard && this.locallyDiscardedCurrentCardIds.has(this.currentCard.id)) {
      this.currentCard = null;
      this.sessionCards = [];
    }
    return cloneCard(this.currentCard);
  }

  async answerAndAdvance(input: ReviewSessionAnswerCommand): Promise<ReviewSessionQueueResult> {
    await this.ensureSessionStarted();
    if (!this.sessionId) {
      return this.unavailableResult(input, 'WORKER_REVIEW_SESSION_UNAVAILABLE: session start returned no sessionId');
    }
    if (input.feedback.action === 'skip') {
      const previousCounterSnapshot = this.getCounterSnapshot();
      try {
        const result = await this.backend.reviewSessionSkip({
          sessionId: this.sessionId,
          cardId: input.card.id,
        });
        this.applyState(result);
        this.lastUndoToken = normalizeString(result.undoToken);
        return this.withQueueImpactEvidence(
          this.buildResult(this.currentCard ? 'advanced' : 'exhausted', this.currentCard, this.lastUndoToken),
          previousCounterSnapshot,
          null,
        );
      } catch (error) {
        return this.unavailableResult(input, error instanceof Error ? error.message : String(error));
      }
    }
    if (input.feedback.action !== 'rate' || !input.feedback.rating) {
      return this.buildResult('advanced', this.currentCard, null);
    }
    try {
      const previousCounterSnapshot = this.getCounterSnapshot();
      const result = await this.backend.reviewSessionFeedback({
        sessionId: this.sessionId,
        cardId: input.card.id,
        rating: normalizeRating(input.feedback.rating),
        reviewedAt: this.now(),
        idempotencyKey: input.feedback.commitIdempotencyKey ?? null,
        repairGate: input.feedback.repairGate as BackendReviewSessionRepairGateEvidence | null | undefined,
      });
      this.applyState(result);
      this.lastUndoToken = normalizeString(result.undoToken);
      return {
        ...this.withQueueImpactEvidence(
          this.buildResult(this.currentCard ? 'advanced' : 'exhausted', this.currentCard, this.lastUndoToken),
          previousCounterSnapshot,
          result.feedback.queueImpact ?? null,
        ),
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

  canUndoLast(): boolean {
    return Boolean(this.sessionId && this.lastUndoToken);
  }

  async undoLast(token?: string | null): Promise<ReviewSessionUndoResult | null> {
    if (!this.sessionId) {
      return null;
    }
    const undoToken = normalizeString(token) ?? this.lastUndoToken;
    if (!undoToken) {
      return null;
    }
    const result = await this.backend.reviewSessionUndo({
      sessionId: this.sessionId,
      undoToken,
    });
    this.applyState(result);
    this.lastUndoToken = null;
    return {
      restoredCurrentCard: cloneCard(this.currentCard),
      counterSnapshot: this.getCounterSnapshot(),
      undoToken: result.undoToken,
    };
  }

  reset(): void {
    this.sessionId = null;
    this.currentCard = null;
    this.counterSnapshot = null;
    this.sessionCards = [];
    this.lastUndoToken = null;
    this.locallyDiscardedCurrentCardIds.clear();
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
    const cardId = String(card.id || '').trim();
    if (cardId) {
      this.locallyDiscardedCurrentCardIds.add(cardId);
    }
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
    this.locallyDiscardedCurrentCardIds.delete(card.id);
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
    const current = isFsrsCard(state.current) ? cloneRequiredCard(state.current) : null;
    this.currentCard = current && !this.locallyDiscardedCurrentCardIds.has(current.id) ? current : null;
    this.counterSnapshot = normalizeCounterSnapshot(state.counters);
    const lookaheadCards = Array.isArray(state.lookaheadCards)
      ? state.lookaheadCards
        .filter(isFsrsCard)
        .filter((card) => !this.locallyDiscardedCurrentCardIds.has(card.id))
        .map(cloneRequiredCard)
      : [];
    this.sessionCards = [
      ...(this.currentCard ? [cloneRequiredCard(this.currentCard)] : []),
      ...lookaheadCards.filter((card) => card.id !== this.currentCard?.id),
    ];
    logger.trace('[SiYuanMemo][WorkerReviewSessionQueueRuntime] review session lookahead state', {
      queueType: this.queueType,
      sessionId: this.sessionId,
      currentCardId: this.currentCard?.id ?? null,
      currentBlockId: this.currentCard?.blockId ?? null,
      rawLookaheadCount: Array.isArray(state.lookaheadCards) ? state.lookaheadCards.length : 0,
      acceptedLookaheadCount: lookaheadCards.length,
      sessionCardsCount: this.sessionCards.length,
      lookaheadCardIds: lookaheadCards.map((card) => card.id),
      projectionState: state.projectionState,
      projectionGeneration: state.projectionGeneration,
    });
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

  private withQueueImpactEvidence(
    result: ReviewSessionQueueResult,
    previousSnapshot: QueueCounterSnapshot | null,
    backendQueueImpact: BackendReviewFeedbackQueueImpact | null,
  ): ReviewSessionQueueResult {
    const counterSnapshot = cloneCounterSnapshot(result.counterSnapshot);
    const activeQueueCount = normalizeCount(counterSnapshot.remaining);
    const previousCount = previousSnapshot
      ? normalizeCount(previousSnapshot.remaining)
      : activeQueueCount;
    const countDelta = activeQueueCount - previousCount;
    const affectedQueueTypes = this.resolveAffectedQueueTypes(backendQueueImpact);
    const queueImpact: QueueFeedbackImpactEvidence = {
      activeQueueType: this.queueType,
      affectedQueueTypes,
      counterSnapshot,
      activeQueueCount,
      countDelta,
      source: 'session-counter',
    };

    return {
      ...result,
      affectedQueueTypes,
      activeQueueCount,
      countDelta,
      queueImpact,
    };
  }

  private resolveAffectedQueueTypes(backendQueueImpact: BackendReviewFeedbackQueueImpact | null): QueueType[] {
    const affected = new Set<QueueType>([this.queueType]);
    for (const entry of backendQueueImpact?.affectedQueues ?? []) {
      const queueType = normalizeQueueType(entry.queueType);
      if (queueType) {
        affected.add(queueType);
      }
    }
    return Array.from(affected);
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

function normalizeQueueType(value: unknown): QueueType | null {
  return Object.values(QueueType).includes(value as QueueType)
    ? value as QueueType
    : null;
}

function normalizeCount(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
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
