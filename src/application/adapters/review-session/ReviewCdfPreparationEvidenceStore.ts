import type { CdfCurrentReviewDuplicateOutcome } from '@/core/card/cdf-live-relation';
import type { FSRSCard } from '@/types/card';
import type { DataChangeEvent, QueueType } from '@/types/unified-data-source';

export type ReviewCdfPreparationRefreshResult = {
  updatedCard?: FSRSCard | null;
  currentReviewDuplicateOutcome?: CdfCurrentReviewDuplicateOutcome | null;
};

export type ReviewCdfPreparationEvidence<TPreparedCard extends FSRSCard | null = FSRSCard | null> = {
  key: string;
  preparedCard: TPreparedCard;
  refreshResult: ReviewCdfPreparationRefreshResult;
};

export type ReviewCdfPreparationStoreLogger = {
  info: (message: string, context?: Record<string, unknown>) => void;
  trace?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
};

export type ReviewCdfPreparationEvidenceStoreOptions<TPreparedCard extends FSRSCard | null> = {
  queueType: QueueType;
  buildKey: (card: FSRSCard) => string;
  matchesAnyCardIdentity: (card: FSRSCard, identities: Set<string>) => boolean;
  getCurrentCardId: () => string | null;
  logger: ReviewCdfPreparationStoreLogger;
  logPrefix?: string;
  onPendingFailure?: (card: FSRSCard, error: unknown) => void;
};

type PendingReviewCdfPreparationEvidence<TPreparedCard extends FSRSCard | null> = {
  key: string;
  cardId: string;
  blockId?: string;
  startedAt: number;
  selfInvalidationEventCount: number;
  promise: Promise<ReviewCdfPreparationEvidence<TPreparedCard>>;
};

export type ReviewCdfPreparationEvidenceDiagnosticStatus =
  | 'hit-pending'
  | 'hit-completed'
  | 'miss-pending-failed'
  | 'miss-pending-key-mismatch'
  | 'miss-no-evidence';

export type ReviewCdfPreparationPrimeStatus =
  | 'skip-no-refresher'
  | 'skip-no-candidate'
  | 'skip-completed-evidence'
  | 'skip-pending-evidence'
  | 'start'
  | 'ready'
  | 'failed';

export class ReviewCdfPreparationEvidenceStore<TPreparedCard extends FSRSCard | null = FSRSCard | null> {
  private completedEvidence: ReviewCdfPreparationEvidence<TPreparedCard> | null = null;
  private pendingEvidence: PendingReviewCdfPreparationEvidence<TPreparedCard> | null = null;

  constructor(private readonly options: ReviewCdfPreparationEvidenceStoreOptions<TPreparedCard>) {}

  async consume(
    card: FSRSCard,
    prepare: (card: FSRSCard, key: string) => Promise<ReviewCdfPreparationEvidence<TPreparedCard>>,
  ): Promise<{
    evidence: ReviewCdfPreparationEvidence<TPreparedCard>;
    reused: boolean;
  }> {
    const key = this.options.buildKey(card);
    let cachedEvidence = this.completedEvidence?.key === key ? this.completedEvidence : null;

    if (!cachedEvidence && this.pendingEvidence?.key === key) {
      try {
        cachedEvidence = await this.pendingEvidence.promise;
        this.logPreparationDiagnostic('hit-pending', card);
      } catch {
        cachedEvidence = null;
        this.logPreparationDiagnostic('miss-pending-failed', card);
      }
    } else if (cachedEvidence) {
      this.logPreparationDiagnostic('hit-completed', card);
    } else if (this.pendingEvidence) {
      this.logPreparationDiagnostic('miss-pending-key-mismatch', card, {
        pendingCardId: this.pendingEvidence.cardId,
        pendingBlockId: this.pendingEvidence.blockId ?? null,
        pendingAgeMs: Date.now() - this.pendingEvidence.startedAt,
      });
    } else {
      this.logPreparationDiagnostic('miss-no-evidence', card);
    }

    const evidence = cachedEvidence ?? await prepare(card, key);
    this.completedEvidence = evidence;
    return {
      evidence,
      reused: Boolean(cachedEvidence),
    };
  }

  prime(
    candidate: FSRSCard | null,
    options: {
      enabled: boolean;
      sessionCards?: FSRSCard[];
      prepare: (card: FSRSCard, key: string) => Promise<ReviewCdfPreparationEvidence<TPreparedCard>>;
    },
  ): void {
    if (!options.enabled) {
      this.logPrimeDiagnostic('skip-no-refresher', null, options.sessionCards);
      return;
    }
    if (!candidate) {
      this.logPrimeDiagnostic('skip-no-candidate', null, options.sessionCards);
      return;
    }

    const key = this.options.buildKey(candidate);
    if (this.completedEvidence?.key === key) {
      this.logPrimeDiagnostic('skip-completed-evidence', candidate, options.sessionCards);
      return;
    }
    if (this.pendingEvidence?.key === key) {
      this.logPrimeDiagnostic('skip-pending-evidence', candidate, options.sessionCards, {
        pendingAgeMs: Date.now() - this.pendingEvidence.startedAt,
      });
      return;
    }

    this.logPrimeDiagnostic('start', candidate, options.sessionCards);
    const promise = options.prepare(candidate, key)
      .then((evidence) => {
        if (this.pendingEvidence?.key === key) {
          this.completedEvidence = evidence;
          this.pendingEvidence = null;
        }
        this.logPrimeDiagnostic('ready', candidate, options.sessionCards);
        return evidence;
      })
      .catch((error) => {
        if (this.pendingEvidence?.key === key) {
          this.pendingEvidence = null;
        }
        this.logPrimeDiagnostic('failed', candidate, options.sessionCards, {
          error: error instanceof Error ? error.message : String(error),
        });
        this.options.onPendingFailure?.(candidate, error);
        return Promise.reject(error);
      });

    promise.catch(() => undefined);
    this.pendingEvidence = {
      key,
      cardId: candidate.id,
      blockId: candidate.blockId,
      startedAt: Date.now(),
      selfInvalidationEventCount: 0,
      promise,
    };
  }

  clear(reason: string): void {
    if (this.completedEvidence || this.pendingEvidence) {
      this.options.logger.trace?.(this.message('CDF preparation evidence invalidated'), {
        queueType: this.options.queueType,
        reason,
        currentCardId: this.options.getCurrentCardId(),
        hadCompletedEvidence: Boolean(this.completedEvidence),
        pendingCardId: this.pendingEvidence?.cardId ?? null,
      });
    }
    this.completedEvidence = null;
    this.pendingEvidence = null;
  }

  preserveAcrossCacheInvalidation(reason: string): void {
    if (!this.completedEvidence && !this.pendingEvidence) {
      return;
    }
    this.options.logger.trace?.(this.message('CDF preparation evidence preserved across cache invalidation'), {
      queueType: this.options.queueType,
      reason,
      currentCardId: this.options.getCurrentCardId(),
      hasCompletedEvidence: Boolean(this.completedEvidence),
      pendingCardId: this.pendingEvidence?.cardId ?? null,
    });
  }

  handleCardUpdated(event: DataChangeEvent, reason = 'card-updated'): void {
    if (!this.completedEvidence && !this.pendingEvidence) {
      return;
    }
    const identities = this.normalizeIdentitySet([
      ...(event.cardIds ?? []),
      ...(event.blockIds ?? []),
    ]);
    if (identities.size === 0) {
      return;
    }

    const completedCard = this.completedEvidence?.preparedCard ?? null;
    const completedAffected = completedCard ? this.options.matchesAnyCardIdentity(completedCard, identities) : false;
    const pendingAffected = this.pendingMatchesAnyIdentity(identities);

    if (!completedAffected && !pendingAffected) {
      return;
    }
    if (pendingAffected && !completedAffected && this.shouldPreserveSelfPendingInvalidation()) {
      this.pendingEvidence!.selfInvalidationEventCount += 1;
      this.options.logger.trace?.(this.message('CDF preparation evidence preserved across self update'), {
        queueType: this.options.queueType,
        reason,
        currentCardId: this.options.getCurrentCardId(),
        pendingCardId: this.pendingEvidence?.cardId ?? null,
        pendingBlockId: this.pendingEvidence?.blockId ?? null,
        selfInvalidationEventCount: this.pendingEvidence?.selfInvalidationEventCount ?? 0,
      });
      return;
    }
    if (completedAffected && pendingAffected) {
      this.clear(reason);
      return;
    }
    if (completedAffected) {
      this.options.logger.trace?.(this.message('CDF preparation evidence invalidated'), {
        queueType: this.options.queueType,
        reason,
        currentCardId: this.options.getCurrentCardId(),
        hadCompletedEvidence: true,
        pendingCardId: this.pendingEvidence?.cardId ?? null,
        invalidatedCompletedEvidence: true,
        invalidatedPendingEvidence: false,
      });
      this.completedEvidence = null;
    }
    if (pendingAffected) {
      this.options.logger.trace?.(this.message('CDF preparation evidence invalidated'), {
        queueType: this.options.queueType,
        reason,
        currentCardId: this.options.getCurrentCardId(),
        hadCompletedEvidence: Boolean(this.completedEvidence),
        pendingCardId: this.pendingEvidence?.cardId ?? null,
        invalidatedCompletedEvidence: false,
        invalidatedPendingEvidence: true,
      });
      this.pendingEvidence = null;
    }
  }

  hasAnyEvidence(): boolean {
    return Boolean(this.completedEvidence || this.pendingEvidence);
  }

  private shouldPreserveSelfPendingInvalidation(): boolean {
    return Boolean(this.pendingEvidence && this.pendingEvidence.selfInvalidationEventCount === 0);
  }

  private pendingMatchesAnyIdentity(identities: Set<string>): boolean {
    const pendingCardId = this.pendingEvidence?.cardId ?? null;
    const pendingBlockId = this.pendingEvidence?.blockId ?? null;
    return Boolean(
      (pendingCardId && identities.has(pendingCardId))
      || (pendingBlockId && identities.has(pendingBlockId)),
    );
  }

  private normalizeIdentitySet(values: Array<string | null | undefined>): Set<string> {
    const identities = new Set<string>();
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized) {
        identities.add(normalized);
      }
    }
    return identities;
  }

  private logPreparationDiagnostic(
    status: ReviewCdfPreparationEvidenceDiagnosticStatus,
    card: FSRSCard,
    extra: Record<string, unknown> = {},
  ): void {
    this.options.logger.trace?.(this.message('CDF preparation evidence diagnostic'), {
      queueType: this.options.queueType,
      status,
      cardId: card.id,
      blockId: card.blockId,
      currentCardId: this.options.getCurrentCardId(),
      hasCompletedEvidence: Boolean(this.completedEvidence),
      hasPendingEvidence: Boolean(this.pendingEvidence),
      completedEvidenceMatches: this.completedEvidence?.key === this.options.buildKey(card),
      pendingEvidenceMatches: this.pendingEvidence?.key === this.options.buildKey(card),
      ...extra,
    });
  }

  private logPrimeDiagnostic(
    status: ReviewCdfPreparationPrimeStatus,
    candidate: FSRSCard | null,
    sessionCards: FSRSCard[] = [],
    extra: Record<string, unknown> = {},
  ): void {
    this.options.logger.trace?.(this.message('CDF next-card prime diagnostic'), {
      queueType: this.options.queueType,
      status,
      currentCardId: this.options.getCurrentCardId(),
      candidateCardId: candidate?.id ?? null,
      candidateBlockId: candidate?.blockId ?? null,
      sessionCardsCount: sessionCards.length,
      sessionCardIds: sessionCards.slice(0, 4).map((card) => card.id),
      hasCompletedEvidence: Boolean(this.completedEvidence),
      hasPendingEvidence: Boolean(this.pendingEvidence),
      pendingCardId: this.pendingEvidence?.cardId ?? null,
      ...extra,
    });
  }

  private message(message: string): string {
    return `${this.options.logPrefix ?? '[SiYuanMemo][UnifiedQueueStrategy]'} ${message}`;
  }
}
