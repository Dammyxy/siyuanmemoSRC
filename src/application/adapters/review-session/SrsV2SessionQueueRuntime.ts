import { CardState, type FSRSCard } from '@/types/card';
import {
  QueueType,
  type IReviewQueue,
  type QueueCounterSnapshot,
  type QueueReviewResult,
} from '@/types/unified-data-source';
import {
  createSrsV2QueueProfile,
} from './SrsV2QueueProfiles';
import type {
  ReviewSessionAnswerCommand,
  ReviewSessionCommandAuthority,
  ReviewSessionIdempotencyRecord,
  ReviewSessionMutationOwner,
  ReviewSessionQueueEntry,
  ReviewSessionQueueEntryKind,
  ReviewSessionQueueResult,
  ReviewSessionQueueRuntime,
  ReviewSessionQueueStatus,
  ReviewSessionRebuildTrigger,
  ReviewSessionUndoResult,
  SrsV2QueueProfile,
} from './ReviewSessionQueueRuntime';

export type SrsV2SessionAnswerStatus = ReviewSessionQueueStatus;

export interface SrsV2SessionQueueRuntimeOptions {
  queueType: QueueType;
  queue: IReviewQueue;
  profile?: SrsV2QueueProfile;
  mutationOwner?: ReviewSessionMutationOwner | null;
  commandAuthority?: ReviewSessionCommandAuthority | null;
  learnAheadMs?: number;
  now?: () => number;
}

export type SrsV2AnswerAndAdvanceInput = ReviewSessionAnswerCommand;

export type SrsV2AnswerAndAdvanceResult = ReviewSessionQueueResult;

interface SessionEntry extends ReviewSessionQueueEntry {
  card: FSRSCard;
}

interface RuntimeStateSnapshot {
  mainQueue: SessionEntry[];
  learningQueue: SessionEntry[];
  currentCard: FSRSCard | null;
  counterSnapshot: QueueCounterSnapshot | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  sequence: number;
}

interface RuntimeUndoEntry {
  token: string;
  before: RuntimeStateSnapshot;
}

type PendingReviewCommit = {
  reviewedCard: FSRSCard;
  rating: number;
  key: string;
};

const DEFAULT_LEARN_AHEAD_MS = 10 * 60 * 1000;
const DEFAULT_MAX_UNDO_ENTRIES = 20;

export class SrsV2SessionQueueRuntime implements ReviewSessionQueueRuntime {
  private readonly queueType: QueueType;
  private readonly queue: IReviewQueue;
  private readonly profile: SrsV2QueueProfile;
  private readonly mutationOwner: ReviewSessionMutationOwner | null;
  private readonly commandAuthority: ReviewSessionCommandAuthority | null;
  private readonly learnAheadMs: number;
  private readonly now: () => number;
  private mainQueue: SessionEntry[] = [];
  private learningQueue: SessionEntry[] = [];
  private loaded = false;
  private currentCard: FSRSCard | null = null;
  private counterSnapshot: QueueCounterSnapshot | null = null;
  private idempotencyRecords = new Map<string, ReviewSessionIdempotencyRecord>();
  private avoidOnceCardId: string | null = null;
  private avoidOnceBlockId: string | null = null;
  private sequence = 0;
  private undoSequence = 0;
  private undoStack: RuntimeUndoEntry[] = [];
  private loadedReviewDayKey: string | null = null;

  constructor(options: SrsV2SessionQueueRuntimeOptions) {
    this.queueType = options.queueType;
    this.queue = options.queue;
    this.profile = options.profile ?? createSrsV2QueueProfile(options.queueType);
    this.mutationOwner = options.mutationOwner ?? null;
    this.commandAuthority = options.commandAuthority ?? null;
    this.learnAheadMs = Math.max(0, Number(options.learnAheadMs ?? DEFAULT_LEARN_AHEAD_MS));
    this.now = options.now ?? (() => Date.now());
  }

  async next(): Promise<FSRSCard | null> {
    if (this.loaded && this.loadedReviewDayKey !== this.currentReviewDayKey()) {
      await this.rebuild('day-rollover');
    }
    await this.ensureLoaded();
    const nextCard = await this.selectNextCard();
    this.currentCard = nextCard ? cloneCard(nextCard) : null;
    return nextCard ? cloneCard(nextCard) : null;
  }

  async answerAndAdvance(input: SrsV2AnswerAndAdvanceInput): Promise<SrsV2AnswerAndAdvanceResult> {
    if (this.commandAuthority) {
      return this.commandAuthority.answerAndAdvance(input, () => this.answerAndAdvanceLocally(input));
    }
    return this.answerAndAdvanceLocally(input);
  }

  private async answerAndAdvanceLocally(input: SrsV2AnswerAndAdvanceInput): Promise<SrsV2AnswerAndAdvanceResult> {
    await this.ensureLoaded();
    const key = normalizeId(input.feedback.commitIdempotencyKey);
    const fingerprint = this.buildAnswerFingerprint(input);
    if (key) {
      const existing = this.idempotencyRecords.get(key);
      if (existing) {
        return existing.fingerprint === fingerprint
          ? cloneAnswerResult(existing.result)
          : this.conflictResult('idempotency-conflict');
      }
    }

    if (!this.currentCard || normalizeId(this.currentCard.id) !== normalizeId(input.card.id)) {
      return this.conflictResult('current-card-mismatch');
    }

    if (this.profile.fingerprint(input.card) !== this.profile.fingerprint(this.currentCard)) {
      return this.conflictResult('current-card-stale');
    }

    const ownerUnavailable = await this.ensureMutationOwnerAvailable(input);
    if (ownerUnavailable) {
      return ownerUnavailable;
    }

    if (input.feedback.action === 'skip') {
      const before = this.captureRuntimeState();
      try {
        await this.queue.skip(input.card.id);
      } catch (error) {
        return this.unavailableResult(error);
      }
      this.rotateCurrentToTail();
      const nextCard = await this.selectNextCard();
      this.currentCard = nextCard ? cloneCard(nextCard) : null;
      const undoToken = this.nextUndoToken();
      this.pushUndoEntry({ token: undoToken, before });
      const result = this.buildAdvanceResult(nextCard, undoToken);
      this.storeIdempotencyRecord(key, fingerprint, result);
      return cloneAnswerResult(result);
    }

    if (input.feedback.action !== 'rate' || !input.feedback.rating) {
      const result = this.buildResult('advanced', this.currentCard, null, 'session-only-action');
      this.storeIdempotencyRecord(key, fingerprint, result);
      return cloneAnswerResult(result);
    }

    const before = this.captureRuntimeState();
    this.applyOptimisticRateAdvance(input.card, input.feedback.rating);
    const nextCard = await this.selectNextCard();
    this.currentCard = nextCard ? cloneCard(nextCard) : null;
    const undoToken = this.nextUndoToken();
    this.pushUndoEntry({ token: undoToken, before });
    const pendingCommit = this.createPendingRateCommit({
      reviewedCard: input.card,
      rating: input.feedback.rating,
      key,
    });
    const result = this.buildAdvanceResult(nextCard, undoToken, {
      commitStatus: 'pending',
      commitIdempotencyKey: key,
      commit: pendingCommit,
    });
    this.storeIdempotencyRecord(key, fingerprint, result);
    return cloneAnswerResult(result);
  }

  async rebuild(trigger: ReviewSessionRebuildTrigger): Promise<void> {
    this.commandAuthority?.assertLocalSessionMutation?.('rebuild');
    if (!isAllowedRebuildTrigger(trigger)) {
      throw new Error(`REVIEW_SESSION_REBUILD_UNAVAILABLE: unsupported trigger ${trigger}`);
    }
    this.mainQueue = [];
    this.learningQueue = [];
    this.currentCard = null;
    this.counterSnapshot = null;
    this.avoidOnceCardId = null;
    this.avoidOnceBlockId = null;
    this.pendingRebuild(trigger);
    await this.ensureLoaded();
  }

  undoLast(token?: string | null): ReviewSessionUndoResult | null {
    this.commandAuthority?.assertLocalSessionMutation?.('undo');
    const normalizedToken = normalizeId(token);
    const entry = normalizedToken
      ? this.popUndoEntryByToken(normalizedToken)
      : this.undoStack.pop() ?? null;
    if (!entry) {
      return null;
    }
    this.restoreRuntimeState(entry.before);
    return {
      restoredCurrentCard: this.currentCard ? cloneCard(this.currentCard) : null,
      counterSnapshot: this.counterSnapshot ? cloneCounterSnapshot(this.counterSnapshot) : null,
      undoToken: entry.token,
    };
  }

  restoreAfterGoBack(input: {
    previous: FSRSCard;
    forward: FSRSCard | null;
    undoToken?: string | null;
  }): ReviewSessionUndoResult | null {
    const undo = this.undoLast(input.undoToken);
    this.removeEntriesForCard(input.previous.id);
    if (input.forward) {
      this.removeEntriesForCard(input.forward.id);
    }

    const replayEntries = [
      ...(input.forward ? [this.toEntry(input.forward, 'main')] : []),
      this.toEntry(input.previous, 'main'),
    ];
    this.mainQueue = [
      ...replayEntries,
      ...this.mainQueue,
    ];
    this.currentCard = cloneCard(input.previous);

    return undo;
  }

  getCounterSnapshot(): QueueCounterSnapshot | null {
    return this.counterSnapshot ? cloneCounterSnapshot(this.counterSnapshot) : null;
  }

  getSessionCards(): FSRSCard[] {
    return [
      ...(this.currentCard ? [this.currentCard] : []),
      ...this.learningQueue.map((entry) => entry.card),
      ...this.mainQueue.map((entry) => entry.card),
    ].map(cloneCard);
  }

  appendCardsToTail(cards: FSRSCard[]): number {
    if (!Array.isArray(cards) || cards.length === 0) {
      return 0;
    }

    const existingCardIds = new Set(
      [
        ...(this.currentCard ? [this.currentCard] : []),
        ...this.learningQueue.map((entry) => entry.card),
        ...this.mainQueue.map((entry) => entry.card),
      ]
        .map((card) => normalizeId(card.id))
        .filter(Boolean),
    );
    const previous = this.counterSnapshot
      ?? this.buildCounterSnapshot(this.mainQueue.length + this.learningQueue.length);
    let appendedCount = 0;

    for (const card of cards) {
      const cardId = normalizeId(card.id);
      if (!cardId || existingCardIds.has(cardId) || !this.profile.isEligible(card)) {
        continue;
      }
      existingCardIds.add(cardId);
      this.mainQueue.push(this.toEntry(card, 'main'));
      appendedCount += 1;
    }

    if (appendedCount > 0) {
      const remaining = Math.max(0, Number(previous.remaining) || 0) + appendedCount;
      this.counterSnapshot = {
        ...previous,
        remaining,
        due: Math.max(0, Number(previous.due) || 0) + appendedCount,
        total: typeof previous.total === 'number' ? Math.max(0, previous.total) + appendedCount : previous.total,
        buckets: {
          ...previous.buckets,
          all: Math.max(0, Number(previous.buckets.all) || 0) + appendedCount,
        },
        source: 'hot',
      };
      this.loaded = true;
      this.loadedReviewDayKey = this.currentReviewDayKey();
    }

    return appendedCount;
  }

  replaceCurrentCard(card: FSRSCard): boolean {
    const currentId = normalizeId(this.currentCard?.id);
    const replacementId = normalizeId(card.id);
    if (!currentId || !replacementId || currentId !== replacementId) {
      return false;
    }

    this.currentCard = cloneCard(card);
    return true;
  }

  reset(): void {
    this.mainQueue = [];
    this.learningQueue = [];
    this.loaded = false;
    this.currentCard = null;
    this.counterSnapshot = null;
    this.idempotencyRecords.clear();
    this.sequence = 0;
    this.undoSequence = 0;
    this.undoStack = [];
    this.loadedReviewDayKey = null;
  }

  discardCard(card: Pick<FSRSCard, 'id'>): void {
    const cardId = normalizeId(card.id);
    this.removeEntriesForCard(cardId);
    if (this.currentCard && normalizeId(this.currentCard.id) === cardId) {
      this.currentCard = null;
    }
    const previous = this.counterSnapshot ?? this.buildCounterSnapshot(this.mainQueue.length + this.learningQueue.length);
    this.counterSnapshot = {
      ...previous,
      remaining: Math.max(0, Number(previous.remaining) - 1),
      due: Math.max(0, Number(previous.due) - 1),
      total: typeof previous.total === 'number' ? Math.max(0, previous.total - 1) : previous.total,
      buckets: {
        ...previous.buckets,
        all: Math.max(0, Number(previous.buckets.all) - 1),
      },
      source: 'hot',
    };
  }

  restoreFromSnapshot(input: {
    cards: FSRSCard[];
    currentCard: FSRSCard | null;
    avoidCardId?: string | null;
    avoidBlockId?: string | null;
    counterSnapshot?: QueueCounterSnapshot | null;
  }): void {
    const currentId = normalizeId(input.currentCard?.id);
    this.mainQueue = input.cards
      .filter((card) => normalizeId(card.id) !== currentId)
      .map((card) => this.toEntry(card, this.isLearningCard(card) ? 'learning' : 'main'));
    this.learningQueue = this.mainQueue.filter((entry) => entry.kind === 'learning');
    this.mainQueue = this.mainQueue.filter((entry) => entry.kind === 'main');
    this.currentCard = input.currentCard ? cloneCard(input.currentCard) : null;
    this.avoidOnceCardId = normalizeId(input.avoidCardId) || null;
    this.avoidOnceBlockId = normalizeId(input.avoidBlockId) || null;
    this.counterSnapshot = input.counterSnapshot
      ? cloneCounterSnapshot(input.counterSnapshot)
      : this.buildCounterSnapshot(input.cards.length);
    this.loaded = true;
    this.loadedReviewDayKey = this.currentReviewDayKey();
  }

  restoreReviewedCardToLearning(card: FSRSCard): void {
    this.removeEntriesForCard(card.id);
    this.learningQueue.unshift(this.toEntry(card, 'learning'));
    this.currentCard = cloneCard(card);
  }

  private captureRuntimeState(): RuntimeStateSnapshot {
    return {
      mainQueue: this.mainQueue.map(cloneEntry),
      learningQueue: this.learningQueue.map(cloneEntry),
      currentCard: this.currentCard ? cloneCard(this.currentCard) : null,
      counterSnapshot: this.counterSnapshot ? cloneCounterSnapshot(this.counterSnapshot) : null,
      avoidOnceCardId: this.avoidOnceCardId,
      avoidOnceBlockId: this.avoidOnceBlockId,
      sequence: this.sequence,
    };
  }

  private restoreRuntimeState(snapshot: RuntimeStateSnapshot): void {
    this.mainQueue = snapshot.mainQueue.map(cloneEntry);
    this.learningQueue = snapshot.learningQueue.map(cloneEntry);
    this.currentCard = snapshot.currentCard ? cloneCard(snapshot.currentCard) : null;
    this.counterSnapshot = snapshot.counterSnapshot ? cloneCounterSnapshot(snapshot.counterSnapshot) : null;
    this.avoidOnceCardId = snapshot.avoidOnceCardId;
    this.avoidOnceBlockId = snapshot.avoidOnceBlockId;
    this.sequence = snapshot.sequence;
    this.loaded = true;
  }

  private pushUndoEntry(entry: RuntimeUndoEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > DEFAULT_MAX_UNDO_ENTRIES) {
      this.undoStack.shift();
    }
  }

  private popUndoEntryByToken(token: string): RuntimeUndoEntry | null {
    const index = this.undoStack.findIndex((entry) => entry.token === token);
    if (index < 0) {
      return null;
    }
    const [entry] = this.undoStack.splice(index, 1);
    return entry ?? null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    const cards = await this.profile.buildInitialCards(this.queue);
    this.mainQueue = cards.map((card) => this.toEntry(card, 'main'));
    this.learningQueue = [];
    this.counterSnapshot = this.buildCounterSnapshot(this.mainQueue.length);
    this.loaded = true;
    this.loadedReviewDayKey = this.currentReviewDayKey();
  }

  private pendingRebuild(_trigger: ReviewSessionRebuildTrigger): void {
    this.loaded = false;
  }

  private async selectNextCard(): Promise<FSRSCard | null> {
    const now = this.now();
    const dueLearning = await this.takeFirstLearning((entry) => entry.dueAt <= now);
    if (dueLearning) {
      return dueLearning.card;
    }

    const main = await this.takeNextMainEntry();
    if (main) {
      return main.card;
    }

    const aheadLearning = await this.takeFirstLearning((entry) => entry.dueAt <= now + this.learnAheadMs);
    if (aheadLearning) {
      return aheadLearning.card;
    }

    return null;
  }

  private getWaitingUntil(): number | null {
    if (this.learningQueue.length === 0) {
      return null;
    }
    this.learningQueue.sort(compareLearningEntries);
    const earliest = this.learningQueue[0]?.dueAt;
    return typeof earliest === 'number' && Number.isFinite(earliest) ? earliest : null;
  }

  private async takeFirstLearning(predicate: (entry: SessionEntry) => boolean): Promise<SessionEntry | null> {
    this.learningQueue.sort(compareLearningEntries);
    while (true) {
      const index = this.learningQueue.findIndex(predicate);
      if (index < 0) {
        return null;
      }
      const [entry] = this.learningQueue.splice(index, 1);
      const repaired = await this.repairEntryBeforeReturn(entry);
      if (repaired) {
        return repaired;
      }
    }
  }

  private async takeNextMainEntry(): Promise<SessionEntry | null> {
    while (this.mainQueue.length > 0) {
      const avoidCardId = this.avoidOnceCardId;
      const avoidBlockId = this.avoidOnceBlockId;
      const index = (!avoidCardId && !avoidBlockId)
        ? 0
        : Math.max(0, this.mainQueue.findIndex((entry) => (
          avoidBlockId
            ? normalizeId(entry.card.blockId) !== avoidBlockId
            : normalizeId(entry.card.id) !== avoidCardId
        )));
      const [entry] = this.mainQueue.splice(index, 1);
      this.clearAvoidOnce();
      const repaired = await this.repairEntryBeforeReturn(entry);
      if (repaired) {
        return repaired;
      }
    }
    this.clearAvoidOnce();
    return null;
  }

  private async repairEntryBeforeReturn(entry: SessionEntry | undefined): Promise<SessionEntry | null> {
    if (!entry) {
      return null;
    }
    if (!this.profile.isEligible(entry.card)) {
      this.repairCounterForRemovedEntry();
      return null;
    }
    const repair = await this.profile.hydrateEntry(this.queue, entry);
    if (repair.status === 'remove') {
      this.repairCounterForRemovedEntry();
      return null;
    }
    if (repair.status === 'ready' && repair.card && this.profile.fingerprint(repair.card) !== entry.fingerprint) {
      return this.toEntry(repair.card, entry.kind);
    }
    return entry;
  }

  private applyReviewResult(reviewedCard: FSRSCard, rating: number, result: QueueReviewResult): void {
    this.setAvoidOnce(reviewedCard);
    this.removeEntriesForCard(reviewedCard.id);
    const updatedCard = result.updatedCard ? cloneCard(result.updatedCard) : null;
    const remainsToday = result.remainsInQueue || (updatedCard ? this.profile.shouldRemainInLearning(updatedCard) : false);

    if (rating < 3 && updatedCard && remainsToday) {
      this.learningQueue.push(this.toEntry(updatedCard, 'learning'));
      this.counterSnapshot = this.repairCounterSnapshot(result.counterSnapshot, { decrement: false });
      return;
    }

    if (result.removedFromQueue || rating >= 3) {
      this.counterSnapshot = this.repairCounterSnapshot(result.counterSnapshot, { decrement: true });
      return;
    }

    if (updatedCard) {
      this.mainQueue.push(this.toEntry(updatedCard, 'main'));
    }
    this.counterSnapshot = this.repairCounterSnapshot(result.counterSnapshot, { decrement: false });
  }

  private applyOptimisticRateAdvance(reviewedCard: FSRSCard, rating: number): void {
    this.setAvoidOnce(reviewedCard);
    this.removeEntriesForCard(reviewedCard.id);
    if (rating < 3) {
      this.learningQueue.push(this.toEntry(reviewedCard, 'learning'));
      this.counterSnapshot = this.repairCounterSnapshot(this.counterSnapshot, { decrement: false });
      return;
    }
    this.counterSnapshot = this.repairCounterSnapshot(this.counterSnapshot, { decrement: true });
  }

  private rotateCurrentToTail(): void {
    if (!this.currentCard) {
      return;
    }
    this.setAvoidOnce(this.currentCard);
    this.removeEntriesForCard(this.currentCard.id);
    this.mainQueue.push(this.toEntry(this.currentCard, 'main'));
  }

  private restoreCurrentToFront(): void {
    if (!this.currentCard) {
      return;
    }
    const currentId = normalizeId(this.currentCard.id);
    const exists = this.mainQueue.some((entry) => normalizeId(entry.card.id) === currentId)
      || this.learningQueue.some((entry) => normalizeId(entry.card.id) === currentId);
    if (exists) {
      return;
    }
    this.mainQueue.unshift(this.toEntry(this.currentCard, 'main'));
  }

  private setAvoidOnce(card: Pick<FSRSCard, 'id' | 'blockId'>): void {
    this.avoidOnceCardId = normalizeId(card.id) || null;
    this.avoidOnceBlockId = normalizeId(card.blockId) || null;
  }

  private clearAvoidOnce(): void {
    this.avoidOnceCardId = null;
    this.avoidOnceBlockId = null;
  }

  private removeEntriesForCard(cardId: string): void {
    const normalized = normalizeId(cardId);
    this.mainQueue = this.mainQueue.filter((entry) => normalizeId(entry.card.id) !== normalized);
    this.learningQueue = this.learningQueue.filter((entry) => normalizeId(entry.card.id) !== normalized);
  }

  private repairCounterSnapshot(
    baseSnapshot: QueueCounterSnapshot | null | undefined,
    options: { decrement: boolean },
  ): QueueCounterSnapshot {
    const previous = this.counterSnapshot ?? this.buildCounterSnapshot(this.mainQueue.length + this.learningQueue.length);
    const next = baseSnapshot ? cloneCounterSnapshot(baseSnapshot) : cloneCounterSnapshot(previous);
    const previousRemaining = Math.max(0, Number(previous.remaining) || 0);
    const remaining = options.decrement ? Math.max(0, previousRemaining - 1) : previousRemaining;
    return {
      ...next,
      remaining,
      due: remaining,
      total: typeof next.total === 'number' ? remaining : next.total,
      buckets: {
        ...next.buckets,
        all: remaining,
      },
      source: 'hot',
    };
  }

  private buildCounterSnapshot(remaining: number): QueueCounterSnapshot {
    const safeRemaining = Math.max(0, Number(remaining) || 0);
    return {
      version: 1,
      remaining: safeRemaining,
      due: safeRemaining,
      total: safeRemaining,
      buckets: {
        all: safeRemaining,
        item: safeRemaining,
        descriptor: 0,
        topic: 0,
        concept: 0,
      },
      source: 'hot',
    };
  }

  private buildResult(
    status: SrsV2AnswerAndAdvanceResult['status'],
    nextCard: FSRSCard | null,
    undoToken: string | null,
    reason?: string,
    waitingUntil: number | null = null,
    extra?: Pick<SrsV2AnswerAndAdvanceResult, 'commit' | 'commitIdempotencyKey' | 'commitStatus'>,
  ): SrsV2AnswerAndAdvanceResult {
    return {
      status,
      nextCard: nextCard ? cloneCard(nextCard) : null,
      waitingUntil,
      counterSnapshot: cloneCounterSnapshot(this.counterSnapshot ?? this.buildCounterSnapshot(0)),
      undoToken,
      ...(reason ? { reason } : {}),
      ...(extra?.commit ? { commit: extra.commit } : {}),
      ...(extra?.commitIdempotencyKey ? { commitIdempotencyKey: extra.commitIdempotencyKey } : {}),
      ...(extra?.commitStatus ? { commitStatus: extra.commitStatus } : {}),
    };
  }

  private buildAdvanceResult(
    nextCard: FSRSCard | null,
    undoToken: string | null,
    extra?: Pick<SrsV2AnswerAndAdvanceResult, 'commit' | 'commitIdempotencyKey' | 'commitStatus'>,
  ): SrsV2AnswerAndAdvanceResult {
    if (nextCard) {
      return this.buildResult('advanced', nextCard, undoToken, undefined, null, extra);
    }
    const waitingUntil = this.getWaitingUntil();
    return waitingUntil === null
      ? this.buildResult('exhausted', null, undoToken, undefined, null, extra)
      : this.buildResult('waiting', null, undoToken, undefined, waitingUntil, extra);
  }

  private createPendingRateCommit(input: PendingReviewCommit): Promise<QueueReviewResult | void> {
    return this.queue.handleReview(input.reviewedCard.id, input.rating, {
      commitIdempotencyKey: input.key,
    });
  }

  private conflictResult(reason: string): SrsV2AnswerAndAdvanceResult {
    return this.buildResult('conflict', this.currentCard, null, reason);
  }

  private unavailableResult(error: unknown): SrsV2AnswerAndAdvanceResult {
    const message = error instanceof Error ? error.message : String(error);
    return this.buildResult('unavailable', this.currentCard, null, message);
  }

  private async ensureMutationOwnerAvailable(
    input: SrsV2AnswerAndAdvanceInput,
  ): Promise<SrsV2AnswerAndAdvanceResult | null> {
    if (!this.mutationOwner) {
      return null;
    }
    try {
      await this.mutationOwner.ensureAvailable(input);
      return null;
    } catch (error) {
      return this.unavailableResult(error);
    }
  }

  private buildAnswerFingerprint(input: SrsV2AnswerAndAdvanceInput): string {
    return [
      this.queueType,
      normalizeId(input.card.id),
      input.feedback.action,
      input.feedback.rating ?? '',
      input.feedback.customActionId ?? '',
    ].join('|');
  }

  private storeIdempotencyRecord(
    key: string,
    fingerprint: string,
    result: SrsV2AnswerAndAdvanceResult,
  ): void {
    if (!key) {
      return;
    }
    this.idempotencyRecords.set(key, {
      fingerprint,
      result: cloneAnswerResult(result),
    });
  }

  private repairCounterForRemovedEntry(): void {
    this.counterSnapshot = this.repairCounterSnapshot(this.counterSnapshot, { decrement: true });
  }

  private toEntry(card: FSRSCard, kind: ReviewSessionQueueEntryKind): SessionEntry {
    this.sequence += 1;
    return {
      kind,
      cardId: card.id,
      blockId: card.blockId,
      sourceId: card.xiuyuanID || card.blockId || card.id,
      queueType: this.queueType,
      cardType: card.type,
      card: cloneCard(card),
      dueAt: Number(card.due) || 0,
      order: this.sequence,
      fingerprint: this.profile.fingerprint(card),
      profileMetadata: {},
    };
  }

  private isLearningCard(card: FSRSCard): boolean {
    return card.state === CardState.Learning || card.state === CardState.Relearning;
  }

  private nextUndoToken(): string {
    this.undoSequence += 1;
    return `srs-v2-undo:${this.undoSequence}`;
  }

  private currentReviewDayKey(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }
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

function compareLearningEntries(a: SessionEntry, b: SessionEntry): number {
  return a.dueAt - b.dueAt || a.order - b.order;
}

function cloneEntry(entry: SessionEntry): SessionEntry {
  return {
    ...entry,
    card: cloneCard(entry.card),
  };
}

function cloneCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as QueueCounterSnapshot;
}

function cloneAnswerResult(result: SrsV2AnswerAndAdvanceResult): SrsV2AnswerAndAdvanceResult {
  return {
    ...result,
    nextCard: result.nextCard ? cloneCard(result.nextCard) : null,
    waitingUntil: result.waitingUntil ?? null,
    counterSnapshot: cloneCounterSnapshot(result.counterSnapshot),
    ...(result.commit ? { commit: result.commit } : {}),
  };
}

function normalizeId(value: string | null | undefined): string {
  return String(value || '').trim();
}
