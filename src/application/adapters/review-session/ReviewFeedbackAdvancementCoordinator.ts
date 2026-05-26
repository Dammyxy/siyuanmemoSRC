import type { QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { FSRSCard } from '@/types/card';
import {
  QueueType,
  isDynamicQueueType,
  type QueueCounterSnapshot,
  type QueueReviewResult,
} from '@/types/unified-data-source';
import type { ProjectionPatchOutcome, QueueReviewResultWithProjection } from '../ReviewSessionProjectionApplier';
import type { ReviewCurrentItemCommand } from './ReviewCurrentItemCommand';
import type { ReviewLearnAheadAdvancePolicy } from './ReviewLearnAheadAdvancePolicy';
import type { ReviewSessionCursor } from './ReviewSessionCursor';

export type ReviewFeedbackAdvancementOutcomeKind =
  | 'learn-ahead'
  | 'requery'
  | 'projection-patched'
  | 'projection-refresh-required'
  | 'local-patched'
  | 'local-refresh-required';

export interface ReviewFeedbackAdvancementOutcome {
  kind: ReviewFeedbackAdvancementOutcomeKind;
  patched?: boolean;
  learnAheadSession?: boolean;
}

export interface ReviewFeedbackAdvancementCoordinatorDependencies {
  queueType: QueueType;
  cursor: ReviewSessionCursor;
  currentItem: ReviewCurrentItemCommand;
  learnAheadAdvancePolicy: ReviewLearnAheadAdvancePolicy;
  applyProjectionQueueImpact: (
    reviewedCard: FSRSCard,
    result: QueueReviewResultWithProjection,
    options?: { forceRemove?: boolean },
  ) => Promise<ProjectionPatchOutcome>;
  refreshLocalCounterSnapshot: (
    source: QueueCounterSnapshot['source'],
    baseSnapshot?: QueueCounterSnapshot | null,
  ) => void;
  invalidateCache: () => void;
}

export interface ReviewFeedbackRateAdvancementInput {
  activeItem: FSRSCard;
  feedback: QueueFeedback;
  reviewResult: QueueReviewResultWithProjection;
  learnAheadSession: boolean;
}

export class ReviewFeedbackAdvancementCoordinator {
  constructor(private readonly deps: ReviewFeedbackAdvancementCoordinatorDependencies) {}

  applyUnavailableItem(card: FSRSCard): void {
    const identities = collectCardIdentities(card);
    this.deps.cursor.addUnavailableItemSessionExclusion(card);
    this.deps.cursor.removeMatching(identities);
    if (this.deps.cursor.pendingRotation && identities.has(this.deps.cursor.pendingRotation)) {
      this.deps.cursor.clearPendingRotation();
    }
    const current = this.deps.currentItem.current;
    if (current && matchesAnyCardIdentity(current, identities)) {
      this.deps.currentItem.clear();
    }
    if (
      (this.deps.cursor.avoidCardId && identities.has(this.deps.cursor.avoidCardId))
      || (this.deps.cursor.avoidBlockId && identities.has(this.deps.cursor.avoidBlockId))
    ) {
      this.deps.cursor.clearAvoidOnce();
    }
    this.deps.invalidateCache();
  }

  async applyRateResult(input: ReviewFeedbackRateAdvancementInput): Promise<ReviewFeedbackAdvancementOutcome> {
    this.deps.cursor.counterSnapshot = input.reviewResult.counterSnapshot ?? null;
    this.deps.currentItem.clear();

    if (input.learnAheadSession) {
      this.deps.cursor.clearPendingRotation();
      this.deps.cursor.applyRemoval(input.activeItem.id);
      this.deps.cursor.markValid();
      const learnAheadSession = !this.deps.learnAheadAdvancePolicy.shouldExitAfterFeedback({
        currentIndex: this.deps.cursor.index,
        cachedCardsLength: this.deps.cursor.length,
      });
      this.deps.refreshLocalCounterSnapshot('hot', input.reviewResult.counterSnapshot);
      return { kind: 'learn-ahead', learnAheadSession };
    }

    const excludeFromCurrentSession = this.shouldExcludeReviewedCardFromSession(input.feedback);
    if (excludeFromCurrentSession) {
      this.deps.cursor.addSessionExcludedCardIdentity(input.activeItem);
    }

    const projectionPatchOutcome = await this.deps.applyProjectionQueueImpact(input.activeItem, input.reviewResult, {
      forceRemove: excludeFromCurrentSession,
    });
    if (this.usesRequeryAfterFeedback()) {
      if (projectionPatchOutcome === 'patched') {
        this.applyRequeryTransition(input.activeItem, { invalidate: false });
        this.deps.cursor.markValid();
        return { kind: 'projection-patched' };
      }
      if (projectionPatchOutcome === 'refresh-required') {
        this.applyRequeryTransition(input.activeItem);
        return { kind: 'projection-refresh-required' };
      }
      this.applyRequeryTransition(input.activeItem);
      return { kind: 'requery' };
    }

    if (projectionPatchOutcome === 'patched') {
      this.deps.cursor.clearPendingRotation();
      this.deps.cursor.markValid();
      return { kind: 'projection-patched' };
    }
    if (projectionPatchOutcome === 'refresh-required') {
      this.deps.cursor.clearPendingRotation();
      this.deps.invalidateCache();
      return { kind: 'projection-refresh-required' };
    }

    const patched = this.deps.cursor.applyReviewResult(input.activeItem, input.reviewResult, {
      forceRemove: excludeFromCurrentSession,
    });
    this.applyPostRateRotation(input.activeItem, input.feedback, input.reviewResult, patched);

    if (patched && this.deps.cursor.hasSessionExclusions()) {
      this.deps.refreshLocalCounterSnapshot('hot', input.reviewResult.counterSnapshot);
    }

    if (!patched || this.shouldReloadAfterReviewResult(input.reviewResult)) {
      this.deps.invalidateCache();
      return { kind: 'local-refresh-required', patched };
    }

    this.deps.cursor.markValid();
    return { kind: 'local-patched', patched };
  }

  applySkipResult(activeItem: FSRSCard): ReviewFeedbackAdvancementOutcome {
    this.deps.cursor.clearForward();
    this.deps.currentItem.clear();
    this.deps.cursor.clearPendingRotation();

    if (this.usesRequeryAfterFeedback()) {
      this.deps.cursor.setAvoidOnce(activeItem);
      this.deps.cursor.resetIndex();
      this.deps.invalidateCache();
      return { kind: 'requery' };
    }

    const patched = this.deps.cursor.applySkip(activeItem.id);
    if (!patched) {
      this.deps.invalidateCache();
      return { kind: 'local-refresh-required', patched };
    }

    this.deps.cursor.markValid();
    return { kind: 'local-patched', patched };
  }

  applyHideCurrentInScopeResult(activeItem: FSRSCard): ReviewFeedbackAdvancementOutcome {
    this.deps.cursor.clearForward();
    this.deps.currentItem.clear();
    this.deps.cursor.clearPendingRotation();
    this.deps.cursor.clearAvoidOnce();

    const patched = this.deps.cursor.applyRemoval(activeItem.id);
    if (!patched) {
      this.deps.invalidateCache();
      return { kind: 'local-refresh-required', patched };
    }

    this.deps.cursor.markValid();
    return { kind: 'local-patched', patched };
  }

  applyCustomSessionOnlyResult(): void {
    this.deps.cursor.clearForward();
    this.deps.currentItem.clear();
    this.deps.cursor.clearPendingRotation();
    if (this.usesRequeryAfterFeedback()) {
      this.deps.cursor.clearAvoidOnce();
      this.deps.cursor.resetIndex();
      this.deps.invalidateCache();
    }
  }

  applyFailedFeedbackCompensation(restoredItem: FSRSCard): void {
    this.deps.cursor.clearForward();
    this.deps.cursor.clearPendingRotation();
    this.deps.cursor.clearAvoidOnce();
    this.deps.currentItem.select(restoredItem);
    this.deps.invalidateCache();
  }

  private applyRequeryTransition(activeItem: FSRSCard, options: { invalidate?: boolean } = {}): void {
    this.deps.cursor.clearForward();
    this.deps.currentItem.clear();
    this.deps.cursor.clearPendingRotation();
    this.deps.cursor.resetIndex();
    if (options.invalidate !== false) {
      this.deps.invalidateCache();
    }
    this.deps.cursor.setAvoidOnce(activeItem);
  }

  private applyPostRateRotation(
    activeItem: FSRSCard,
    feedback: QueueFeedback,
    reviewResult: QueueReviewResult,
    patched: boolean,
  ): void {
    if (this.shouldRotateAfterLowRating(feedback) && reviewResult.remainsInQueue) {
      const rotated = patched ? this.deps.cursor.rotateToTail(activeItem.id) : false;
      this.deps.cursor.setPendingRotation(rotated ? null : activeItem.id);
      if (!rotated && patched) {
        this.deps.cursor.clampToLastWhenPastEnd();
      }
      return;
    }

    this.deps.cursor.clearPendingRotation();
  }

  private usesRequeryAfterFeedback(): boolean {
    return this.deps.queueType === QueueType.IncrementalLearning;
  }

  private shouldRotateAfterLowRating(feedback: QueueFeedback): boolean {
    if (feedback.action !== 'rate') {
      return false;
    }

    const rating = feedback.rating ?? 0;
    return rating > 0 && rating < 3 && isDynamicQueueType(this.deps.queueType);
  }

  private shouldExcludeReviewedCardFromSession(feedback: QueueFeedback): boolean {
    if (!this.supportsSessionCompletionExclusion() || feedback.action !== 'rate') {
      return false;
    }

    return (feedback.rating ?? 0) >= 3;
  }

  private supportsSessionCompletionExclusion(): boolean {
    return this.deps.queueType === QueueType.FilterGroup
      || this.deps.queueType === QueueType.RetrievalPractice;
  }

  private shouldReloadAfterReviewResult(result: QueueReviewResult): boolean {
    if (!result.counterSnapshot) {
      return true;
    }

    if (!this.supportsHotPatchAfterReview()) {
      return result.requiresCurrentViewReorder || result.queueChanged;
    }

    return result.requiresCurrentViewReorder;
  }

  private supportsHotPatchAfterReview(): boolean {
    return this.deps.queueType === QueueType.RetrievalPractice
      || this.deps.queueType === QueueType.IncrementalLearning
      || this.deps.queueType === QueueType.FilterGroup
      || this.deps.queueType === QueueType.FinalDrill
      || this.deps.queueType === QueueType.Leech;
  }
}

function collectCardIdentities(card: Pick<FSRSCard, 'id' | 'blockId'>): Set<string> {
  return new Set([normalizeCardId(card.id), normalizeCardId(card.blockId)].filter(Boolean));
}

function matchesAnyCardIdentity(card: Pick<FSRSCard, 'id' | 'blockId'>, identities: Set<string>): boolean {
  return identities.has(normalizeCardId(card.id)) || identities.has(normalizeCardId(card.blockId));
}

function normalizeCardId(cardId: string | null | undefined): string {
  return String(cardId || '').trim();
}
