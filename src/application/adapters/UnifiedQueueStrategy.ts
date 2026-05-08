import {
    QueueItemUnavailableError,
    type IQueueStrategy,
    type QueueFeedback,
} from '@/core/queue/abstraction/Strategy';
import type { QueueStats, QueueUIConfig } from '@/core/queue/types';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { DataChangeEvent, IDataSourceObserver, IReviewQueue, QueueCounterSnapshot, QueueReviewResult, QueueReviewSchedulingContext } from '@/types/unified-data-source';
import type { ReviewQueueSessionSnapshot } from '@/types/review-tab';
import { QueueType, isDynamicQueueType } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import { isHideCurrentInScopeCommandId } from '@/core/queue/abstraction/customActionIds';
import { formatNextDue } from '@/application/helpers/formatNextDue';
import type { ISchedulerRouter } from '../interfaces/ISchedulerRouter';
import { CacheManagerObserver } from '../observers/CacheManagerObserver';
import { buildFsrsSchedulingFingerprint } from '@/core/scheduler/fsrsReviewStateRepair';
import { resolveEffectiveSchedulerTypeForCard } from '@/core/scheduler/schedulerPolicy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('UnifiedQueueStrategy');

type RatingValue = 1 | 2 | 3 | 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SUSPICIOUS_HISTORY_DAYS = 7;

type CardWithNextDues = FSRSCard & {
    nextDues?: Partial<Record<RatingValue, string>>;
};

type QueueWithInsertAt = IReviewQueue & {
    insertAt: (cardId: string, position: number) => Promise<void>;
};

type SchedulerPreviewRouter = ISchedulerRouter & {
    preview: (card: FSRSCard, options?: { reviewTime?: Date | number; memoryStateAsOf?: Date | number }) => Map<number, FSRSCard>;
};

type ReviewSchedulingContextQueue = IReviewQueue & {
    getReviewSchedulingContext: (card: FSRSCard) => QueueReviewSchedulingContext | null;
};

type QueueRollbackCapable = IReviewQueue & {
    createRollbackSnapshot?: () => Promise<unknown>;
    restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
};

type QueueSnapshotRecord = {
    queueType: QueueType;
    queue: QueueRollbackCapable;
    snapshot: unknown;
};

type ReviewTransaction = {
    action: QueueFeedback['action'];
    cardId: string;
    cardBefore: FSRSCard | null;
    queueSnapshots: QueueSnapshotRecord[];
    sessionExcludedCardIdsBefore: string[];
    sessionExcludedLogicalKeysBefore: string[];
};

type ReviewHistoryEntry = {
    item: FSRSCard;
    transaction: ReviewTransaction | null;
};

type FeedbackMutationContext = {
    queueType: QueueType;
    cardId: string;
    action: QueueFeedback['action'];
    rating?: number;
};

type ProjectionPatchOutcome = 'patched' | 'refresh-required' | 'not-applicable';

type ProjectionImpactEntryLike = {
    queueType: string;
    hotPatchable?: boolean;
    refreshRequired?: boolean;
    removedRowIds?: unknown[];
    insertedRows?: unknown[];
    updatedRows?: unknown[];
    counters?: unknown;
};

type ProjectionImpactRowLike = {
    rowId: string;
    cardId: string;
    blockId: string | null;
    queueIndexHint: number | null;
};

function supportsInsertAt(queue: IReviewQueue): queue is QueueWithInsertAt {
    const candidate = queue as Partial<QueueWithInsertAt>;
    return typeof candidate.insertAt === 'function';
}

function supportsPreview(router: ISchedulerRouter): router is SchedulerPreviewRouter {
    return typeof (router as Partial<SchedulerPreviewRouter>).preview === 'function';
}

function toQueueType(value: unknown): QueueType | undefined {
    return typeof value === 'string' ? (value as QueueType) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export class UnifiedQueueStrategy implements IQueueStrategy<FSRSCard>, IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    private schedulerRouter: ISchedulerRouter | null;
    private queue: IReviewQueue;
    private queueType: QueueType;
    private cachedCards: FSRSCard[] = [];
    private currentIndex = 0;
    private cacheValid = false;
    private cacheManager: CacheManagerObserver;
    private currentItem: FSRSCard | null = null;
    private historyStack: ReviewHistoryEntry[] = [];
    private forwardBuffer: FSRSCard[] = [];
    private pendingRotateCardId: string | null = null;
    private avoidOnceCardId: string | null = null;
    private avoidOnceBlockId: string | null = null;
    private readonly maxHistorySize = 100;
    private lastCounterSnapshot: QueueCounterSnapshot | null = null;
    private managerObserverRegistered = false;
    private readonly sessionExcludedCardIds = new Set<string>();
    private readonly sessionExcludedLogicalKeys = new Set<string>();
    private feedbackMutation: FeedbackMutationContext | null = null;
    private readonly suspiciousNextDuesLogKeys = new Set<string>();

    constructor(
        queueTypeOrQueue: QueueType | IReviewQueue,
        manager: UnifiedDataSourceManager,
        _eventBus: EventBus,
        schedulerRouter: ISchedulerRouter | null = null
    ) {
        this.manager = manager;
        this.schedulerRouter = schedulerRouter;

        if (typeof queueTypeOrQueue === 'string') {
            this.queueType = queueTypeOrQueue;
            this.queue = this.manager.getQueue(queueTypeOrQueue);
        } else {
            this.queue = queueTypeOrQueue;
            this.queueType = queueTypeOrQueue.getType();
        }

        this.cacheManager = new CacheManagerObserver({
            nextDuesCacheSize: 100,
            cardTypeCacheSize: 50,
            formattedDataCacheSize: 50,
            debugMode: false,
        });

        this.queue.subscribe(this.cacheManager);
        this.subscribeToQueueChanges();

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Created for queue: ${this.queueType}`);
    }

    async next(): Promise<FSRSCard | null> {
        try {
            if (this.forwardBuffer.length > 0) {
                const replayCard = this.forwardBuffer.shift() || null;
                if (!replayCard) {
                    return null;
                }
                const replayCardWithNextDues = await this.maybeAddNextDues(replayCard);
                this.currentItem = replayCardWithNextDues;
                return replayCardWithNextDues;
            }

            if (this.queueType === QueueType.FinalDrill) {
                await this.reloadCards();
                if (this.cachedCards.length === 0) {
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                    return null;
                }

                const card = this.cachedCards[0];
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (dynamic draw):`, {
                    queueType: this.queueType,
                    cardId: card.id,
                    total: this.cachedCards.length,
                });
                this.currentItem = card;
                return card;
            }

            if (this.queueType === QueueType.NeuralRoam) {
                const nextCard = await this.queue.getNextCard();
                if (!nextCard) {
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] No more cards from spreading activation`);
                    return null;
                }

                const cardWithNextDues = await this.maybeAddNextDues(nextCard);
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (spreading activation):`, {
                    queueType: this.queueType,
                    cardId: nextCard.id,
                });
                this.currentItem = cardWithNextDues;
                return cardWithNextDues;
            }

            if (this.usesRequeryAfterFeedback()) {
                return await this.nextFromRequeryQueue();
            }

            if (!this.cacheValid || this.currentIndex > this.cachedCards.length) {
                await this.reloadCards();
            }

            if (this.cachedCards.length === 0) {
                this.pendingRotateCardId = null;
                this.currentItem = null;
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                return null;
            }

            this.applyPendingRotationIfNeeded();
            if (this.currentIndex >= this.cachedCards.length) {
                this.pendingRotateCardId = null;
                this.currentItem = null;
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue exhausted without reload: ${this.queueType}`);
                return null;
            }
            const card = this.cachedCards[this.currentIndex++];
            const cardWithNextDues = await this.maybeAddNextDues(card);

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card:`, {
                queueType: this.queueType,
                cardId: card.id,
                index: this.currentIndex - 1,
                total: this.cachedCards.length,
                due: new Date(card.due).toISOString(),
                now: new Date(Date.now()).toISOString(),
            });

            this.currentItem = cardWithNextDues;
            return cardWithNextDues;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to get next card:`, {
                queueType: this.queueType,
                error: errorMessage,
            });
            throw new Error(`Failed to get next card: ${errorMessage}`);
        }
    }

    async onFeedback(currentItem: FSRSCard | null, feedback: QueueFeedback): Promise<void> {
        const activeItem = currentItem || this.currentItem;
        if (!activeItem) {
            this.pendingRotateCardId = null;
            logger.warn(`[SiYuanMemo][UnifiedQueueStrategy] No current item for feedback`);
            return;
        }

        let activeTransaction: ReviewTransaction | null = null;
        let activeTransactionPushed = false;

        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Processing feedback:`, {
                queueType: this.queueType,
                cardId: activeItem.id,
                blockId: activeItem.blockId,
                action: feedback.action,
                rating: feedback.rating,
            });

            if (feedback.action === 'rate' && feedback.rating) {
                activeTransaction = await this.createReviewTransaction(activeItem, feedback);
                this.forwardBuffer = [];
                const reviewResult = await this.handleReviewWithFeedbackContext(activeItem, feedback);
                this.pushHistory(activeItem, activeTransaction);
                activeTransactionPushed = true;
                this.currentItem = null;
                if (reviewResult.counterSnapshot) {
                    this.lastCounterSnapshot = reviewResult.counterSnapshot;
                } else {
                    this.lastCounterSnapshot = null;
                }

                if (this.usesRequeryAfterFeedback()) {
                    this.applyRequeryStateAfterReview(activeItem, feedback, reviewResult);
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated with requery-after-feedback flow:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        rating: feedback.rating,
                        avoidOnceCardId: this.avoidOnceCardId,
                        avoidOnceBlockId: this.avoidOnceBlockId,
                        removedFromQueue: reviewResult.removedFromQueue,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }

                const excludeFromCurrentSession = this.shouldExcludeReviewedCardFromSession(feedback);
                if (excludeFromCurrentSession) {
                    this.addSessionExcludedCardIdentity(activeItem);
                }

                const projectionPatchOutcome = await this.applyProjectionQueueImpactToCache(activeItem, reviewResult, {
                    forceRemove: excludeFromCurrentSession,
                });
                if (projectionPatchOutcome === 'patched') {
                    this.pendingRotateCardId = null;
                    this.cacheValid = true;
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated with projection queueImpact patch:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        rating: feedback.rating,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }
                if (projectionPatchOutcome === 'refresh-required') {
                    this.pendingRotateCardId = null;
                    this.invalidateCache();
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated with projection refresh requirement:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        rating: feedback.rating,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }

                const patched = this.applyReviewResultToCache(activeItem, reviewResult, {
                    forceRemove: excludeFromCurrentSession,
                });
                if (this.shouldRotateAfterLowRating(feedback) && reviewResult.remainsInQueue) {
                    const rotated = patched ? this.rotateCachedCardToTail(activeItem.id) : false;
                    this.pendingRotateCardId = rotated ? null : activeItem.id;
                    if (!rotated && patched && this.currentIndex >= this.cachedCards.length && this.cachedCards.length > 0) {
                        this.currentIndex = this.cachedCards.length - 1;
                    }
                } else {
                    this.pendingRotateCardId = null;
                }

                if (patched && this.hasSessionExclusions()) {
                    this.refreshLocalCounterSnapshot('hot', reviewResult.counterSnapshot);
                }

                if (!patched || this.shouldReloadAfterReviewResult(reviewResult)) {
                    this.invalidateCache();
                } else {
                    this.cacheValid = true;
                }

                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated:`, {
                    queueType: this.queueType,
                    cardId: activeItem.id,
                    rating: feedback.rating,
                    removedFromQueue: reviewResult.removedFromQueue,
                    requiresCurrentViewReorder: reviewResult.requiresCurrentViewReorder,
                });
                activeTransaction = null;
                activeTransactionPushed = false;
                return;
            }

            if (feedback.action === 'skip') {
                activeTransaction = await this.createReviewTransaction(activeItem, feedback, {
                    includeCardSnapshot: false,
                });
                await this.queue.skip(activeItem.id);
                this.pushHistory(activeItem, activeTransaction);
                activeTransactionPushed = true;
                this.forwardBuffer = [];
                this.currentItem = null;
                this.pendingRotateCardId = null;
                if (this.usesRequeryAfterFeedback()) {
                    this.setAvoidOnceIdentity(activeItem);
                    this.currentIndex = 0;
                    this.cacheValid = false;
                    this.lastCounterSnapshot = await this.queue.getCounterSnapshot().catch(() => this.lastCounterSnapshot);
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card skipped with requery-after-feedback flow:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        avoidOnceCardId: this.avoidOnceCardId,
                        avoidOnceBlockId: this.avoidOnceBlockId,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }
                const patched = this.applySkipToCache(activeItem.id);
                this.lastCounterSnapshot = await this.queue.getCounterSnapshot().catch(() => this.lastCounterSnapshot);
                if (!patched) {
                    this.invalidateCache();
                } else {
                    this.cacheValid = true;
                }
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card skipped:`, {
                    queueType: this.queueType,
                    cardId: activeItem.id,
                });
                activeTransaction = null;
                activeTransactionPushed = false;
                return;
            }

            if (feedback.action === 'custom' && feedback.customActionId) {
                if (this.shouldHandleHideCurrentInScope(activeItem, feedback.customActionId)) {
                    activeTransaction = await this.createReviewTransaction(activeItem, feedback, {
                        includeCardSnapshot: false,
                    });
                    await this.queue.removeCard(activeItem.id);
                    this.pushHistory(activeItem, activeTransaction);
                    activeTransactionPushed = true;
                    this.forwardBuffer = [];
                    this.currentItem = null;
                    this.pendingRotateCardId = null;
                    this.clearAvoidOnceIdentity();
                    const patched = this.applyRemovalToCache(activeItem.id);
                    this.lastCounterSnapshot = await this.queue.getCounterSnapshot().catch(() => this.lastCounterSnapshot);
                    if (!patched) {
                        this.invalidateCache();
                    } else {
                        this.cacheValid = true;
                    }
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Current card hidden from active scope:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        actionId: feedback.customActionId,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }

                this.pushHistory(activeItem, null);
                this.forwardBuffer = [];
                this.currentItem = null;
                this.pendingRotateCardId = null;
                if (this.usesRequeryAfterFeedback()) {
                    this.clearAvoidOnceIdentity();
                    this.currentIndex = 0;
                    this.cacheValid = false;
                }
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Custom action:`, {
                    queueType: this.queueType,
                    cardId: activeItem.id,
                    actionId: feedback.customActionId,
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            if (this.isUnavailableCurrentItemError(error, activeItem)) {
                this.clearUnavailableItemFromLocalState(activeItem);
                logger.warn(`[SiYuanMemo][UnifiedQueueStrategy] Current queue item disappeared before feedback completed:`, {
                    queueType: this.queueType,
                    cardId: activeItem.id,
                    blockId: activeItem.blockId,
                    action: feedback.action,
                    error: errorMessage,
                    stack: errorStack,
                });
                throw new QueueItemUnavailableError(
                    `Queue item is no longer available: ${activeItem.id}`,
                    {
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        queueType: this.queueType,
                    },
                    error,
                );
            }

            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to process feedback:`, {
                queueType: this.queueType,
                cardId: activeItem.id,
                action: feedback.action,
                error: errorMessage,
                stack: errorStack,
            });

            if (activeTransactionPushed && activeTransaction) {
                this.discardFailedHistoryEntry(activeItem, activeTransaction);
            }
            await this.compensateFailedFeedback(activeItem, activeTransaction);
            this.pendingRotateCardId = null;
            this.clearAvoidOnceIdentity();
            throw new Error(`Failed to process feedback: ${errorMessage}`);
        }
    }

    async hydrateCurrentItem(card: FSRSCard | null): Promise<FSRSCard | null> {
        if (!card) {
            return null;
        }

        if (!this.shouldComputeNextDues(card)) {
            return card;
        }

        return this.addNextDues(card);
    }

    canGoBack(): boolean {
        return this.historyStack.length > 0;
    }

    async goBack(currentItem: FSRSCard | null): Promise<FSRSCard | null> {
        this.pendingRotateCardId = null;
        this.clearAvoidOnceIdentity();
        const activeItem = currentItem || this.currentItem;
        if (this.historyStack.length === 0) {
            return activeItem;
        }

        const historyEntry = this.historyStack.pop();
        if (!historyEntry) {
            return activeItem;
        }

        if (historyEntry.transaction) {
            await this.rollbackTransaction(historyEntry.transaction);
        }

        const previous = historyEntry.item;

        if (activeItem) {
            this.pushForwardItem(activeItem);
        }

        const previousWithNextDues = await this.maybeAddNextDues(previous);
        this.currentItem = previousWithNextDues;
        return previousWithNextDues;
    }

    getUIConfig(currentItem: FSRSCard | null): QueueUIConfig {
        if (!currentItem) {
            return {
                statsType: 'queue-size',
                showRatingButtons: false,
                allowSkip: true,
            };
        }

        if (currentItem.type === 'item' || currentItem.type === 'descriptor') {
            return {
                statsType: 'queue-size',
                showRatingButtons: true,
                allowSkip: true,
            };
        }

        return {
            statsType: 'queue-size',
            showRatingButtons: false,
            allowSkip: true,
            customButtons: [
                {
                    actionId: 'insert',
                    label: 'Insert',
                    icon: 'iconAdd',
                },
            ],
        };
    }

    async getStats(): Promise<QueueStats> {
        try {
            if (this.queueType === QueueType.NeuralRoam) {
                const size = await this.queue.getSize();
                const stats: QueueStats = {
                    size,
                    label: `${size} due`,
                    extra: `${size} total`,
                };

                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Stats:`, {
                    queueType: this.queueType,
                    ...stats,
                });

                return stats;
            }

            const counterSnapshot = await this.getCounterSnapshot();
            if (counterSnapshot) {
                const stats: QueueStats = {
                    size: counterSnapshot.remaining,
                    label: `${counterSnapshot.due} due`,
                    extra: `${counterSnapshot.total ?? counterSnapshot.remaining} total`,
                };

                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Stats:`, {
                    queueType: this.queueType,
                    ...stats,
                });

                return stats;
            }

            const { size, dueToday } = this.calculateStatsFromCards(this.cachedCards, Date.now());

            const stats: QueueStats = {
                size,
                label: `${dueToday} due`,
                extra: `${size} total`,
            };

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Stats:`, {
                queueType: this.queueType,
                ...stats,
            });

            return stats;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to get stats:`, {
                queueType: this.queueType,
                error: errorMessage,
            });

            return {
                size: 0,
                label: '0 due',
                extra: '',
            };
        }
    }

    private calculateStatsFromCards(cards: FSRSCard[], now: number): { size: number; dueToday: number } {
        let dueToday = 0;
        for (const card of cards) {
            if (card.due <= now) {
                dueToday += 1;
            }
        }

        return {
            size: cards.length,
            dueToday,
        };
    }

    private buildCounterSnapshotFromCachedCards(
        source: QueueCounterSnapshot['source'],
        baseSnapshot?: QueueCounterSnapshot | null
    ): QueueCounterSnapshot {
        const buckets = {
            all: 0,
            item: 0,
            descriptor: 0,
            topic: 0,
            concept: 0,
        };
        let due = 0;
        const now = Date.now();

        for (const card of this.cachedCards) {
            buckets.all += 1;
            const cardType = String(card.type || '').trim();
            if (cardType === 'item') {
                buckets.item += 1;
            } else if (cardType === 'descriptor') {
                buckets.descriptor += 1;
            } else if (cardType === 'topic') {
                buckets.topic += 1;
            } else if (cardType === 'concept') {
                buckets.concept += 1;
            }

            if (Number(card.due) <= now) {
                due += 1;
            }
        }

        return {
            version: Math.max(
                Number(baseSnapshot?.version) || 0,
                Number(this.lastCounterSnapshot?.version) || 0,
            ) + 1,
            remaining: this.cachedCards.length,
            due,
            total: this.cachedCards.length,
            buckets,
            source,
        };
    }

    private refreshLocalCounterSnapshot(
        source: QueueCounterSnapshot['source'],
        baseSnapshot?: QueueCounterSnapshot | null
    ): void {
        this.lastCounterSnapshot = this.buildCounterSnapshotFromCachedCards(source, baseSnapshot);
    }

    private cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
        return {
            ...snapshot,
            buckets: {
                ...snapshot.buckets,
            },
        };
    }

    private usesRequeryAfterFeedback(): boolean {
        return this.queueType === QueueType.IncrementalLearning;
    }

    private async nextFromRequeryQueue(): Promise<FSRSCard | null> {
        if (!this.cacheValid || this.currentIndex > this.cachedCards.length) {
            await this.reloadCards();
        }

        if (this.cachedCards.length === 0) {
            this.pendingRotateCardId = null;
            this.clearAvoidOnceIdentity();
            this.currentItem = null;
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
            return null;
        }

        const selectedIndex = this.resolveRequeryNextIndex();
        if (selectedIndex === -1) {
            this.clearAvoidOnceIdentity();
            this.currentItem = null;
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue exhausted after requery: ${this.queueType}`);
            return null;
        }

        const card = this.cachedCards[selectedIndex];
        const avoidedCardId = this.avoidOnceCardId;
        const avoidedBlockId = this.avoidOnceBlockId;
        this.currentIndex = Math.min(this.cachedCards.length, selectedIndex + 1);
        this.pendingRotateCardId = null;
        this.clearAvoidOnceIdentity();
        const cardWithNextDues = await this.maybeAddNextDues(card);

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (requery-after-feedback):`, {
            queueType: this.queueType,
            cardId: card.id,
            selectedBlockId: card.blockId,
            avoidedCardId,
            avoidedBlockId,
            index: selectedIndex,
            total: this.cachedCards.length,
            due: new Date(card.due).toISOString(),
            now: new Date(Date.now()).toISOString(),
        });

        this.currentItem = cardWithNextDues;
        return cardWithNextDues;
    }

    private resolveRequeryNextIndex(): number {
        const avoidCardId = String(this.avoidOnceCardId || '').trim();
        const avoidBlockId = String(this.avoidOnceBlockId || '').trim();
        if (!avoidCardId && !avoidBlockId) {
            return this.cachedCards.length > 0 ? 0 : -1;
        }

        const differentBlockIndex = this.cachedCards.findIndex((card) => (
            !this.matchesAvoidedCard(card, avoidCardId)
            && !this.matchesAvoidedBlock(card, avoidBlockId)
        ));
        if (differentBlockIndex >= 0) {
            this.logRequeryAvoidanceIfNeeded(differentBlockIndex, 'different-block');
            return differentBlockIndex;
        }

        const differentCardIndex = this.cachedCards.findIndex((card) => (
            !this.matchesAvoidedCard(card, avoidCardId)
        ));
        if (differentCardIndex >= 0) {
            this.logRequeryAvoidanceIfNeeded(differentCardIndex, 'same-block-different-card');
            return differentCardIndex;
        }

        this.logRequeryAvoidanceIfNeeded(0, 'same-visible-card-fallback');
        return this.cachedCards.length > 0 ? 0 : -1;
    }

    private applyRequeryStateAfterReview(
        reviewedCard: FSRSCard,
        _feedback: QueueFeedback,
        _reviewResult: QueueReviewResult
    ): void {
        this.forwardBuffer = [];
        this.currentItem = null;
        this.pendingRotateCardId = null;
        this.currentIndex = 0;
        this.cacheValid = false;
        this.setAvoidOnceIdentity(reviewedCard);
    }

    private async handleReviewWithFeedbackContext(
        activeItem: FSRSCard,
        feedback: QueueFeedback
    ): Promise<QueueReviewResult> {
        this.feedbackMutation = {
            queueType: this.queueType,
            cardId: activeItem.id,
            action: feedback.action,
            rating: feedback.rating,
        };

        try {
            return await this.queue.handleReview(activeItem.id, feedback.rating || 0);
        } finally {
            this.feedbackMutation = null;
        }
    }

    private setAvoidOnceIdentity(card: FSRSCard | null): void {
        const cardId = String(card?.id || '').trim();
        const blockId = String(card?.blockId || '').trim();
        this.avoidOnceCardId = cardId || null;
        this.avoidOnceBlockId = blockId || null;
    }

    private clearAvoidOnceIdentity(): void {
        this.avoidOnceCardId = null;
        this.avoidOnceBlockId = null;
    }

    private matchesAvoidedCard(card: FSRSCard, avoidCardId: string): boolean {
        if (!avoidCardId) {
            return false;
        }
        return String(card.id || '').trim() === avoidCardId;
    }

    private matchesAvoidedBlock(card: FSRSCard, avoidBlockId: string): boolean {
        if (!avoidBlockId) {
            return false;
        }
        return String(card.blockId || '').trim() === avoidBlockId;
    }

    private logRequeryAvoidanceIfNeeded(selectedIndex: number, mode: 'different-block' | 'same-block-different-card' | 'same-visible-card-fallback'): void {
        const avoidCardId = String(this.avoidOnceCardId || '').trim();
        const avoidBlockId = String(this.avoidOnceBlockId || '').trim();
        if (!avoidCardId && !avoidBlockId) {
            return;
        }

        const skippedSameBlockCount = avoidBlockId
            ? this.cachedCards
                .slice(0, Math.max(0, selectedIndex))
                .filter((card) => this.matchesAvoidedBlock(card, avoidBlockId))
                .length
            : 0;

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Requery next-card avoidance:', {
            queueType: this.queueType,
            mode,
            avoidedCardId: avoidCardId || null,
            avoidedBlockId: avoidBlockId || null,
            selectedIndex,
            selectedCardId: this.cachedCards[selectedIndex]?.id,
            selectedBlockId: this.cachedCards[selectedIndex]?.blockId,
            skippedSameBlockCount,
            total: this.cachedCards.length,
        });
    }

    private shouldRotateAfterLowRating(feedback: QueueFeedback): boolean {
        if (feedback.action !== 'rate') {
            return false;
        }

        const rating = feedback.rating ?? 0;
        return rating > 0 && rating < 3 && isDynamicQueueType(this.queueType);
    }

    private applyPendingRotationIfNeeded(): void {
        const pendingCardId = this.pendingRotateCardId;
        if (!pendingCardId) {
            return;
        }
        this.pendingRotateCardId = null;

        if (this.currentIndex >= this.cachedCards.length) {
            return;
        }

        const currentCard = this.cachedCards[this.currentIndex];
        if (!currentCard || currentCard.id !== pendingCardId) {
            return;
        }

        if (this.currentIndex >= this.cachedCards.length - 1) {
            logger.info('[SiYuanMemo][UnifiedQueueStrategy] Pending rotation skipped (no alternative card):', {
                queueType: this.queueType,
                cardId: pendingCardId,
                currentIndex: this.currentIndex,
                total: this.cachedCards.length,
            });
            return;
        }

        const [rotatedCard] = this.cachedCards.splice(this.currentIndex, 1);
        if (!rotatedCard) {
            return;
        }
        this.cachedCards.push(rotatedCard);

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Pending rotation applied:', {
            queueType: this.queueType,
            cardId: pendingCardId,
            currentIndex: this.currentIndex,
            total: this.cachedCards.length,
        });
    }

    private rotateCachedCardToTail(cardId: string): boolean {
        if (!this.cacheValid) {
            return false;
        }

        const normalizedCardId = this.normalizeCardId(cardId);
        if (!normalizedCardId || this.cachedCards.length <= 1) {
            return false;
        }

        const cachedIndex = this.findCachedCardIndexByCardId(normalizedCardId);
        if (cachedIndex === -1 || cachedIndex >= this.cachedCards.length - 1) {
            return false;
        }

        const [rotatedCard] = this.cachedCards.splice(cachedIndex, 1);
        if (!rotatedCard) {
            return false;
        }
        this.cachedCards.push(rotatedCard);
        if (cachedIndex < this.currentIndex) {
            this.currentIndex = Math.max(0, this.currentIndex - 1);
        }

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Low-rated card rotated to tail:', {
            queueType: this.queueType,
            cardId: normalizedCardId,
            currentIndex: this.currentIndex,
            total: this.cachedCards.length,
        });

        return true;
    }

    private async applyProjectionQueueImpactToCache(
        reviewedCard: FSRSCard,
        result: QueueReviewResult,
        options: { forceRemove?: boolean } = {}
    ): Promise<ProjectionPatchOutcome> {
        if (!this.cacheValid) {
            return 'not-applicable';
        }

        const entry = this.resolveProjectionImpactEntry(result.queueImpact);
        if (!entry) {
            return 'not-applicable';
        }
        if (entry.refreshRequired === true || entry.hotPatchable !== true) {
            return 'refresh-required';
        }

        const patchRows = [
            ...this.normalizeProjectionImpactRows(entry.updatedRows),
            ...this.normalizeProjectionImpactRows(entry.insertedRows),
        ];
        const hydrateIds = Array.from(new Set(
            patchRows
                .map((row) => row.rowId || row.cardId)
                .filter(Boolean),
        ));
        const hydratedCards = hydrateIds.length > 0
            ? await this.queue.getCardsBySnapshotIds(hydrateIds)
            : [];
        if (hydrateIds.length > 0 && hydratedCards.length === 0) {
            return 'refresh-required';
        }

        const orderHintByIdentity = this.buildProjectionOrderHintMap(patchRows);
        const removeIds = new Set(
            (entry.removedRowIds || [])
                .map((id) => String(id || '').trim())
                .filter(Boolean),
        );
        if (options.forceRemove) {
            removeIds.add(reviewedCard.id);
            if (reviewedCard.riffCardId) {
                removeIds.add(reviewedCard.riffCardId);
            }
        }

        const previousOrder = new Map<string, number>();
        this.cachedCards.forEach((card, index) => {
            previousOrder.set(this.normalizeCardId(card.id), index);
            if (card.riffCardId) {
                previousOrder.set(this.normalizeCardId(card.riffCardId), index);
            }
            if (card.blockId) {
                previousOrder.set(this.normalizeCardId(card.blockId), index);
            }
        });

        this.cachedCards = this.cachedCards.filter((card) => !this.matchesProjectionRemovedIdentity(card, removeIds));
        for (const card of hydratedCards) {
            const existingIndex = this.findCachedCardIndexByIdentity(card.id, card.blockId);
            if (existingIndex >= 0) {
                this.cachedCards.splice(existingIndex, 1);
            }
            this.cachedCards.push(this.cloneCard(card));
        }

        this.cachedCards.sort((a, b) => {
            const hintA = this.resolveProjectionOrderHint(a, orderHintByIdentity);
            const hintB = this.resolveProjectionOrderHint(b, orderHintByIdentity);
            if (hintA !== null && hintB !== null && hintA !== hintB) {
                return hintA - hintB;
            }
            if (hintA !== null && hintB === null) {
                return -1;
            }
            if (hintA === null && hintB !== null) {
                return 1;
            }
            return this.resolvePreviousOrder(a, previousOrder) - this.resolvePreviousOrder(b, previousOrder);
        });

        this.currentIndex = 0;
        this.forwardBuffer = [];
        this.lastCounterSnapshot = this.normalizeProjectionImpactCounterSnapshot(entry, result.counterSnapshot);
        return 'patched';
    }

    private resolveProjectionImpactEntry(queueImpact: unknown): ProjectionImpactEntryLike | null {
        if (!isRecord(queueImpact)) {
            return null;
        }
        const affectedQueues = Array.isArray(queueImpact.affectedQueues)
            ? queueImpact.affectedQueues
            : [];
        const entry = affectedQueues.find((candidate) => (
            isRecord(candidate)
            && String(candidate.queueType || '') === this.queueType
        ));
        return isRecord(entry) ? entry as ProjectionImpactEntryLike : null;
    }

    private normalizeProjectionImpactRows(rows: unknown[] | undefined): ProjectionImpactRowLike[] {
        if (!Array.isArray(rows)) {
            return [];
        }
        return rows
            .map((row) => {
                if (!isRecord(row)) {
                    return null;
                }
                const rowId = String(row.rowId || '').trim();
                const cardId = String(row.cardId || '').trim();
                if (!rowId || !cardId) {
                    return null;
                }
                const queueIndexHint = Number(row.queueIndexHint);
                return {
                    rowId,
                    cardId,
                    blockId: String(row.blockId || '').trim() || null,
                    queueIndexHint: Number.isFinite(queueIndexHint) ? queueIndexHint : null,
                };
            })
            .filter((row): row is ProjectionImpactRowLike => Boolean(row));
    }

    private buildProjectionOrderHintMap(rows: ProjectionImpactRowLike[]): Map<string, number> {
        const hints = new Map<string, number>();
        for (const row of rows) {
            if (row.queueIndexHint === null) {
                continue;
            }
            hints.set(row.rowId, row.queueIndexHint);
            hints.set(row.cardId, row.queueIndexHint);
            if (row.blockId) {
                hints.set(row.blockId, row.queueIndexHint);
            }
        }
        return hints;
    }

    private matchesProjectionRemovedIdentity(card: FSRSCard, removeIds: Set<string>): boolean {
        if (removeIds.size === 0) {
            return false;
        }
        return removeIds.has(this.normalizeCardId(card.id))
            || removeIds.has(this.normalizeCardId(card.blockId))
            || (card.riffCardId ? removeIds.has(this.normalizeCardId(card.riffCardId)) : false);
    }

    private resolveProjectionOrderHint(card: FSRSCard, hints: Map<string, number>): number | null {
        const ids = [
            this.normalizeCardId(card.id),
            this.normalizeCardId(card.blockId),
            this.normalizeCardId(card.riffCardId),
        ].filter(Boolean);
        for (const id of ids) {
            const hint = hints.get(id);
            if (Number.isFinite(hint)) {
                return Number(hint);
            }
        }
        return null;
    }

    private resolvePreviousOrder(card: FSRSCard, previousOrder: Map<string, number>): number {
        const ids = [
            this.normalizeCardId(card.id),
            this.normalizeCardId(card.blockId),
            this.normalizeCardId(card.riffCardId),
        ].filter(Boolean);
        for (const id of ids) {
            const order = previousOrder.get(id);
            if (Number.isFinite(order)) {
                return Number(order);
            }
        }
        return Number.MAX_SAFE_INTEGER;
    }

    private normalizeProjectionImpactCounterSnapshot(
        entry: ProjectionImpactEntryLike,
        fallback: QueueCounterSnapshot | null,
    ): QueueCounterSnapshot | null {
        if (!isRecord(entry.counters)) {
            return fallback ? this.cloneCounterSnapshot(fallback) : null;
        }
        const counters = entry.counters;
        const buckets = isRecord(counters.buckets) ? counters.buckets : {};
        return {
            version: Math.max(0, Math.floor(Number(counters.version || counters.generation || 0))),
            remaining: Math.max(0, Math.floor(Number(counters.remaining || 0))),
            due: Math.max(0, Math.floor(Number(counters.due || 0))),
            total: Math.max(0, Math.floor(Number(counters.total || 0))),
            buckets: {
                all: Math.max(0, Math.floor(Number(buckets.all || 0))),
                item: Math.max(0, Math.floor(Number(buckets.item || 0))),
                descriptor: Math.max(0, Math.floor(Number(buckets.descriptor || 0))),
                topic: Math.max(0, Math.floor(Number(buckets.topic || 0))),
                concept: Math.max(0, Math.floor(Number(buckets.concept || 0))),
            },
            source: 'hot',
        };
    }

    private supportsHotPatchAfterReview(): boolean {
        return this.queueType === QueueType.RetrievalPractice
            || this.queueType === QueueType.IncrementalLearning
            || this.queueType === QueueType.FilterGroup;
    }

    private applyReviewResultToCache(
        reviewedCard: FSRSCard,
        result: QueueReviewResult,
        options: { forceRemove?: boolean } = {}
    ): boolean {
        if (!this.cacheValid) {
            return false;
        }

        const cachedIndex = options.forceRemove
            ? this.findCachedCardIndexByCardId(reviewedCard.id)
            : this.findCachedCardIndexByIdentity(reviewedCard.id, reviewedCard.blockId);
        if (cachedIndex === -1) {
            return false;
        }

        if (options.forceRemove || result.removedFromQueue) {
            this.cachedCards.splice(cachedIndex, 1);
            if (cachedIndex < this.currentIndex) {
                this.currentIndex = Math.max(0, this.currentIndex - 1);
            }
        } else if (result.updatedCard) {
            this.cachedCards[cachedIndex] = this.cloneCard(result.updatedCard);
        }

        if (this.currentIndex > this.cachedCards.length) {
            this.currentIndex = this.cachedCards.length;
        }

        return true;
    }

    private applySkipToCache(cardId: string): boolean {
        if (!this.cacheValid) {
            return false;
        }

        const cachedIndex = this.findCachedCardIndexByIdentity(cardId);
        if (cachedIndex === -1) {
            return false;
        }

        const [skippedCard] = this.cachedCards.splice(cachedIndex, 1);
        if (!skippedCard) {
            return false;
        }

        this.cachedCards.push(skippedCard);
        if (cachedIndex < this.currentIndex) {
            this.currentIndex = Math.max(0, this.currentIndex - 1);
        }
        return true;
    }

    private applyRemovalToCache(cardId: string): boolean {
        if (!this.cacheValid) {
            return false;
        }

        const cachedIndex = this.findCachedCardIndexByIdentity(cardId);
        if (cachedIndex === -1) {
            return false;
        }

        this.cachedCards.splice(cachedIndex, 1);
        if (cachedIndex < this.currentIndex) {
            this.currentIndex = Math.max(0, this.currentIndex - 1);
        }
        if (this.currentIndex > this.cachedCards.length) {
            this.currentIndex = this.cachedCards.length;
        }
        return true;
    }

    private findCachedCardIndexByIdentity(cardId: string, blockId?: string): number {
        const normalizedCardId = String(cardId || '').trim();
        if (normalizedCardId) {
            const exactIndex = this.cachedCards.findIndex((card) => card.id === normalizedCardId);
            if (exactIndex >= 0) {
                return exactIndex;
            }
        }

        const normalizedBlockId = String(blockId || '').trim();
        if (normalizedBlockId) {
            return this.cachedCards.findIndex((card) => card.blockId === normalizedBlockId);
        }

        return -1;
    }

    private findCachedCardIndexByCardId(cardId: string): number {
        const normalizedCardId = this.normalizeCardId(cardId);
        if (!normalizedCardId) {
            return -1;
        }

        return this.cachedCards.findIndex((card) => this.normalizeCardId(card.id) === normalizedCardId);
    }

    private normalizeCardId(cardId: string | null | undefined): string {
        return String(cardId || '').trim();
    }

    private shouldExcludeReviewedCardFromSession(feedback: QueueFeedback): boolean {
        if (!this.supportsSessionCompletionExclusion() || feedback.action !== 'rate') {
            return false;
        }

        return (feedback.rating ?? 0) >= 3;
    }

    private hasSessionExclusions(): boolean {
        return this.supportsSessionCompletionExclusion()
            && (this.sessionExcludedCardIds.size > 0 || this.sessionExcludedLogicalKeys.size > 0);
    }

    private addSessionExcludedCardId(cardId: string | null | undefined): boolean {
        if (!this.supportsSessionCompletionExclusion()) {
            return false;
        }

        const normalizedCardId = this.normalizeCardId(cardId);
        if (!normalizedCardId) {
            return false;
        }

        const previousSize = this.sessionExcludedCardIds.size;
        this.sessionExcludedCardIds.add(normalizedCardId);
        return this.sessionExcludedCardIds.size !== previousSize;
    }

    private addSessionExcludedCardIdentity(card: FSRSCard): boolean {
        if (!this.supportsSessionCompletionExclusion()) {
            return false;
        }

        let changed = this.addSessionExcludedCardId(card.id);
        for (const logicalKey of this.buildSessionExclusionLogicalKeys(card)) {
            const previousSize = this.sessionExcludedLogicalKeys.size;
            this.sessionExcludedLogicalKeys.add(logicalKey);
            changed = changed || this.sessionExcludedLogicalKeys.size !== previousSize;
        }
        return changed;
    }

    private removeSessionExcludedCardIds(cardIds: Array<string | null | undefined>): number {
        let removed = 0;
        for (const cardId of cardIds) {
            const normalizedCardId = this.normalizeCardId(cardId);
            if (normalizedCardId && this.sessionExcludedCardIds.delete(normalizedCardId)) {
                removed += 1;
            }
        }
        return removed;
    }

    private clearSessionExcludedCardIds(): void {
        this.sessionExcludedCardIds.clear();
        this.sessionExcludedLogicalKeys.clear();
    }

    private restoreSessionExcludedCardIds(
        cardIds: Array<string | null | undefined>,
        logicalKeys: Array<string | null | undefined> = []
    ): void {
        this.sessionExcludedCardIds.clear();
        this.sessionExcludedLogicalKeys.clear();
        if (!this.supportsSessionCompletionExclusion()) {
            return;
        }

        for (const cardId of cardIds) {
            const normalizedCardId = this.normalizeCardId(cardId);
            if (normalizedCardId) {
                this.sessionExcludedCardIds.add(normalizedCardId);
            }
        }
        for (const logicalKey of logicalKeys) {
            const normalizedLogicalKey = this.normalizeCardId(logicalKey);
            if (normalizedLogicalKey) {
                this.sessionExcludedLogicalKeys.add(normalizedLogicalKey);
            }
        }
    }

    private applySessionExclusions(cards: FSRSCard[]): FSRSCard[] {
        if (!this.hasSessionExclusions()) {
            return cards.map((card) => this.cloneCard(card));
        }

        return cards
            .filter((card) => !this.isSessionExcludedCard(card))
            .map((card) => this.cloneCard(card));
    }

    private isSessionExcludedCard(card: FSRSCard): boolean {
        if (this.sessionExcludedCardIds.has(this.normalizeCardId(card.id))) {
            return true;
        }

        return this.buildSessionExclusionLogicalKeys(card)
            .some((logicalKey) => this.sessionExcludedLogicalKeys.has(logicalKey));
    }

    private buildSessionExclusionLogicalKeys(card: Pick<FSRSCard, 'blockId' | 'xiuyuanID' | 'meta'>): string[] {
        const faceIndex = this.readSessionExclusionFaceIndex(card.meta);
        const blockId = String(card.blockId || '').trim();
        const xiuyuanId = String(card.xiuyuanID || '').trim();
        const keys: string[] = [];
        if (blockId) {
            keys.push(`block:${blockId}::face:${faceIndex}`);
        }
        if (xiuyuanId) {
            keys.push(`xiuyuan:${xiuyuanId}::face:${faceIndex}`);
        }
        return keys;
    }

    private readSessionExclusionFaceIndex(meta: unknown): number {
        if (!isRecord(meta)) {
            return 0;
        }

        const rawFaceIndex = meta.faceIndex ?? meta.ruleIndex;
        const numericFaceIndex = typeof rawFaceIndex === 'number'
            ? rawFaceIndex
            : typeof rawFaceIndex === 'string' && rawFaceIndex.trim().length > 0
                ? Number(rawFaceIndex)
                : 0;
        return Number.isFinite(numericFaceIndex) ? Math.max(0, Math.floor(numericFaceIndex)) : 0;
    }

    private supportsSessionCompletionExclusion(): boolean {
        return this.queueType === QueueType.FilterGroup
            || this.queueType === QueueType.RetrievalPractice;
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

    async insertAt(cardId: string, position: number): Promise<void> {
        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] insertAt called:`, {
                queueType: this.queueType,
                cardId,
                position,
            });

            if (!supportsInsertAt(this.queue)) {
                logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Queue does not support insertAt:`, {
                    queueType: this.queueType,
                    queueTypeActual: this.queue.constructor.name,
                });
                throw new Error(`Queue type ${this.queueType} does not support insertAt`);
            }

            await this.queue.insertAt(cardId, position);
            this.lastCounterSnapshot = await this.queue.getCounterSnapshot().catch(() => this.lastCounterSnapshot);
            this.invalidateCache();

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card inserted via queue.insertAt:`, {
                queueType: this.queueType,
                cardId,
                position,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to insert card:`, {
                queueType: this.queueType,
                cardId,
                position,
                error: errorMessage,
            });
            throw error;
        }
    }

    appendCardsToTail(cards: FSRSCard[]): number {
        if (!Array.isArray(cards) || cards.length === 0) {
            return 0;
        }

        const existingCardIds = new Set(this.cachedCards.map((card) => String(card.id || '').trim()).filter(Boolean));
        const appendedCards = cards
            .filter((card) => {
                const cardId = String(card.id || '').trim();
                return cardId.length > 0 && !existingCardIds.has(cardId);
            })
            .map((card) => {
                existingCardIds.add(String(card.id || '').trim());
                return this.cloneCard(card);
            });

        if (appendedCards.length === 0) {
            return 0;
        }

        this.cachedCards.push(...appendedCards);
        this.lastCounterSnapshot = null;

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Appended cards to tail without resetting session pointer:`, {
            queueType: this.queueType,
            appendedCount: appendedCards.length,
            currentIndex: this.currentIndex,
            cachedSize: this.cachedCards.length,
        });

        return appendedCards.length;
    }

    async getRemainingSize(): Promise<number> {
        try {
            if (this.queueType === QueueType.NeuralRoam) {
                return await this.queue.getSize();
            }

            const counterSnapshot = await this.getCounterSnapshot();
            if (counterSnapshot) {
                return counterSnapshot.remaining;
            }

            if (this.cacheValid) {
                return Math.max(0, this.cachedCards.length - this.currentIndex);
            }

            await this.reloadCards();
            return this.cachedCards.length;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to get remaining size:`, {
                queueType: this.queueType,
                error: errorMessage,
            });
            return 0;
        }
    }

    async getCounterSnapshot(): Promise<QueueCounterSnapshot | null> {
        if (this.hasSessionExclusions()) {
            if (!this.cacheValid) {
                await this.reloadCards();
            } else {
                this.refreshLocalCounterSnapshot('hot', this.lastCounterSnapshot);
            }
        }

        if (this.lastCounterSnapshot) {
            return this.cloneCounterSnapshot(this.lastCounterSnapshot);
        }

        if (typeof this.queue.getCounterSnapshot !== 'function') {
            return null;
        }

        try {
            const snapshot = await this.queue.getCounterSnapshot();
            this.lastCounterSnapshot = snapshot;
            return this.cloneCounterSnapshot(snapshot);
        } catch (error) {
            logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Failed to read queue counter snapshot:', {
                queueType: this.queueType,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    private subscribeToQueueChanges(): void {
        const manager = this.manager as Partial<{
            registerObserver: (observer: IDataSourceObserver) => void;
        }>;
        if (typeof manager.registerObserver !== 'function') {
            return;
        }

        manager.registerObserver(this);
        this.managerObserverRegistered = true;
    }

    onDataChanged(event: DataChangeEvent): void {
        if (event.type === 'queue-changed') {
            const queueType = toQueueType(event.queueType);
            if (!this.eventAffectsCurrentQueue(queueType)) {
                return;
            }

            if (event.requiresFullRefresh) {
                this.clearSessionExcludedCardIds();
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue full refresh requested, invalidating cache: ${this.queueType}`);
                this.invalidateCache();
                return;
            }

            if (this.shouldSuppressQueueChangedDuringFeedback(queueType, event)) {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Suppressed self-triggered queue change during feedback:`, {
                    queueType: this.queueType,
                    cardId: this.feedbackMutation?.cardId,
                    action: this.feedbackMutation?.action,
                    rating: this.feedbackMutation?.rating,
                });
                return;
            }

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue changed, invalidating cache: ${this.queueType}`);
            this.invalidateCache();
            return;
        }

        if (event.type === 'card-deleted') {
            this.removeSessionExcludedCardIds(event.cardIds || []);
            const removed = this.removeDeletedCardsFromLocalState(event.cardIds || []);
            if (removed > 0) {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Removed deleted cards from local review state:`, {
                    queueType: this.queueType,
                    removed,
                    cardIds: event.cardIds,
                    blockIds: event.blockIds,
                });
                this.invalidateCache();
            }
            return;
        }

        if (event.type === 'mode-switched') {
            this.clearSessionExcludedCardIds();
            this.invalidateCache();
        }
    }

    private eventAffectsCurrentQueue(queueType: QueueType | undefined): boolean {
        return !queueType || queueType === this.queueType;
    }

    private shouldSuppressQueueChangedDuringFeedback(
        queueType: QueueType | undefined,
        event: DataChangeEvent
    ): boolean {
        if (!this.feedbackMutation || event.requiresFullRefresh) {
            return false;
        }

        if (this.feedbackMutation.queueType !== this.queueType) {
            return false;
        }

        return this.eventAffectsCurrentQueue(queueType);
    }

    private clearUnavailableItemFromLocalState(card: FSRSCard): void {
        const identities = this.collectCardIdentities(card);
        this.removeMatchingCardsFromLocalState(identities);
        this.pendingRotateCardId = this.pendingRotateCardId && identities.has(this.pendingRotateCardId)
            ? null
            : this.pendingRotateCardId;
        if (this.currentItem && this.matchesAnyCardIdentity(this.currentItem, identities)) {
            this.currentItem = null;
        }
        if (
            (this.avoidOnceCardId && identities.has(this.avoidOnceCardId))
            || (this.avoidOnceBlockId && identities.has(this.avoidOnceBlockId))
        ) {
            this.clearAvoidOnceIdentity();
        }
        this.invalidateCache();
    }

    private removeDeletedCardsFromLocalState(cardIds: string[]): number {
        const identities = this.normalizeIdentitySet(cardIds);
        if (identities.size === 0) {
            return 0;
        }

        return this.removeMatchingCardsFromLocalState(identities);
    }

    private removeMatchingCardsFromLocalState(identities: Set<string>): number {
        let removed = 0;
        let removedBeforeCurrentIndex = 0;

        this.cachedCards = this.cachedCards.filter((card, index) => {
            const shouldRemove = this.matchesAnyCardIdentity(card, identities);
            if (shouldRemove) {
                removed += 1;
                if (index < this.currentIndex) {
                    removedBeforeCurrentIndex += 1;
                }
            }
            return !shouldRemove;
        });
        if (removedBeforeCurrentIndex > 0) {
            this.currentIndex = Math.max(0, this.currentIndex - removedBeforeCurrentIndex);
        }
        if (this.currentIndex > this.cachedCards.length) {
            this.currentIndex = this.cachedCards.length;
        }

        const previousForwardLength = this.forwardBuffer.length;
        this.forwardBuffer = this.forwardBuffer.filter((card) => !this.matchesAnyCardIdentity(card, identities));
        removed += previousForwardLength - this.forwardBuffer.length;

        if (this.currentItem && this.matchesAnyCardIdentity(this.currentItem, identities)) {
            this.currentItem = null;
        }

        return removed;
    }

    private isUnavailableCurrentItemError(error: unknown, card: FSRSCard): boolean {
        const message = error instanceof Error ? error.message : String(error);
        const hasMissingCardSignal = message.includes('Card not found')
            || message.includes('获取卡片失败')
            || message.includes('卡片不存在');
        if (!hasMissingCardSignal) {
            return false;
        }

        const identities = this.collectCardIdentities(card);
        for (const identity of identities) {
            if (message.includes(identity)) {
                return true;
            }
        }

        return false;
    }

    private collectCardIdentities(card: Pick<FSRSCard, 'id' | 'blockId'>): Set<string> {
        return this.normalizeIdentitySet([card.id, card.blockId]);
    }

    private normalizeIdentitySet(values: Array<string | null | undefined>): Set<string> {
        return new Set(
            values
                .map((value) => String(value || '').trim())
                .filter((value) => value.length > 0)
        );
    }

    private matchesAnyCardIdentity(card: Pick<FSRSCard, 'id' | 'blockId'>, identities: Set<string>): boolean {
        return identities.has(String(card.id || '').trim())
            || identities.has(String(card.blockId || '').trim());
    }

    private async addNextDues(card: FSRSCard): Promise<CardWithNextDues> {
        try {
            const schedulingContext = this.getReviewSchedulingContext(card);
            const reviewTime = this.normalizeReviewTime(schedulingContext?.reviewTime);
            const memoryStateAsOf = this.normalizeReviewTime(schedulingContext?.memoryStateAsOf);
            const cacheKey = `${card.id}-${buildFsrsSchedulingFingerprint(card)}-reviewTime=${reviewTime ?? 'now'}-memoryStateAsOf=${memoryStateAsOf ?? 'none'}`;
            const cache = this.cacheManager.getNextDuesCache();

            const cached = cache.get(cacheKey);
            if (cached) {
                logger.info('[SiYuanMemo][UnifiedQueueStrategy] nextDues from cache:', card.id);
                return {
                    ...card,
                    nextDues: cached,
                };
            }

            if (!this.schedulerRouter || !supportsPreview(this.schedulerRouter)) {
                logger.warn('[SiYuanMemo][UnifiedQueueStrategy] SchedulerRouter.preview not available');
                return card;
            }

            const previewOptions = {
                ...(reviewTime ? { reviewTime } : {}),
                ...(memoryStateAsOf ? { memoryStateAsOf } : {}),
            };
            const previews = Object.keys(previewOptions).length > 0
                ? this.schedulerRouter.preview(card, previewOptions)
                : this.schedulerRouter.preview(card);
            const nextDues: Partial<Record<RatingValue, string>> = {};

            for (const [rating, previewCard] of previews.entries()) {
                if (rating < 1 || rating > 4) {
                    continue;
                }
                const diffMs = new Date(previewCard.due).getTime() - Date.now();
                nextDues[rating as RatingValue] = formatNextDue(diffMs);
            }

            cache.set(cacheKey, nextDues);

            logger.info('[SiYuanMemo][UnifiedQueueStrategy] nextDues calculated and cached:', nextDues);
            this.logSuspiciousRetrievalNextDues(card, nextDues);

            return {
                ...card,
                nextDues,
            };
        } catch (error) {
            logger.error('[SiYuanMemo][UnifiedQueueStrategy] Failed to calculate nextDues:', error);
            return card;
        }
    }

    private async maybeAddNextDues(card: FSRSCard): Promise<CardWithNextDues> {
        if (!this.shouldComputeNextDues(card)) {
            return card;
        }
        return this.addNextDues(card);
    }

    private getReviewSchedulingContext(card: FSRSCard): QueueReviewSchedulingContext | null {
        const queue = this.queue as Partial<ReviewSchedulingContextQueue>;
        if (typeof queue.getReviewSchedulingContext !== 'function') {
            return null;
        }

        return queue.getReviewSchedulingContext(card);
    }

    private normalizeReviewTime(value: unknown): number | null {
        const timestamp = value instanceof Date ? value.getTime() : Number(value);
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
    }

    private logSuspiciousRetrievalNextDues(
        card: FSRSCard,
        nextDues: Partial<Record<RatingValue, string>>
    ): void {
        if (this.queueType !== QueueType.RetrievalPractice) {
            return;
        }

        if (card.state !== CardState.Review && card.state !== CardState.Relearning) {
            return;
        }

        if (card.type !== CardType.Item && card.type !== CardType.Descriptor) {
            return;
        }

        const historicalIntervalDays = Number.isFinite(card.due) && Number.isFinite(card.lastReview) && card.due > card.lastReview
            ? Math.floor((card.due - card.lastReview) / DAY_MS)
            : Math.floor(Number(card.scheduledDays) || 0);
        if (historicalIntervalDays < MIN_SUSPICIOUS_HISTORY_DAYS) {
            return;
        }

        const reviewDayLabels = [nextDues[2], nextDues[3], nextDues[4]];
        const suspiciousTinyDays = reviewDayLabels.every((label) => {
            const match = typeof label === 'string' ? label.trim().match(/^(\d+) d$/) : null;
            return match ? Number(match[1]) >= 1 && Number(match[1]) <= 4 : false;
        });
        if (!suspiciousTinyDays) {
            return;
        }

        const fingerprint = buildFsrsSchedulingFingerprint(card);
        const logKey = `${card.id}:${fingerprint}`;
        if (this.suspiciousNextDuesLogKeys.has(logKey)) {
            return;
        }
        this.suspiciousNextDuesLogKeys.add(logKey);

        logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Suspicious retrieval nextDues after scheduler normalization:', {
            cardId: card.id,
            blockId: card.blockId,
            type: card.type,
            effectiveSchedulerType: resolveEffectiveSchedulerTypeForCard(card),
            storedSchedulerType: card.schedulerType,
            state: card.state,
            stability: card.stability,
            difficulty: card.difficulty,
            scheduledDays: card.scheduledDays,
            elapsedDays: card.elapsedDays,
            due: card.due,
            dueDate: Number.isFinite(card.due) && card.due > 0 ? new Date(card.due).toISOString() : undefined,
            lastReview: card.lastReview,
            lastReviewDate: Number.isFinite(card.lastReview) && card.lastReview > 0 ? new Date(card.lastReview).toISOString() : undefined,
            reps: card.reps,
            lapses: card.lapses,
            nextDues,
        });
    }

    private shouldComputeNextDues(card: FSRSCard): boolean {
        if (this.queueType !== QueueType.NeuralRoam) {
            return true;
        }

        const neuralContext = isRecord(card.meta?.neuralContext)
            ? card.meta.neuralContext as Record<string, unknown>
            : null;

        return neuralContext?.isFlashcard === true;
    }

    private async reloadCards(): Promise<void> {
        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Reloading cards: ${this.queueType}`);

            const startTime = Date.now();
            const loadedCards = await this.queue.getCards();
            this.cachedCards = this.applySessionExclusions(loadedCards);
            this.currentIndex = 0;
            this.cacheValid = true;
            const queueCounterSnapshot = await this.queue.getCounterSnapshot().catch(() => null);
            this.lastCounterSnapshot = this.hasSessionExclusions()
                ? this.buildCounterSnapshotFromCachedCards('reconciled', queueCounterSnapshot)
                : queueCounterSnapshot;
            const duration = Date.now() - startTime;

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cards reloaded:`, {
                queueType: this.queueType,
                cardCount: this.cachedCards.length,
                duration: `${duration}ms`,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to reload cards:`, {
                queueType: this.queueType,
                error: errorMessage,
            });

            this.cachedCards = [];
            this.currentIndex = 0;
            this.cacheValid = false;
            throw error;
        }
    }

    private invalidateCache(): void {
        this.cacheValid = false;
        this.lastCounterSnapshot = null;
        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cache invalidated: ${this.queueType}`);
    }

    private pushHistory(item: FSRSCard, transaction: ReviewTransaction | null): void {
        this.historyStack.push({
            item: this.cloneCard(item),
            transaction,
        });
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
        }
    }

    private discardFailedHistoryEntry(item: FSRSCard, transaction: ReviewTransaction): void {
        const last = this.historyStack[this.historyStack.length - 1];
        if (!last || last.transaction !== transaction || last.item.id !== item.id) {
            return;
        }
        this.historyStack.pop();
    }

    private pushForwardItem(card: FSRSCard): void {
        this.forwardBuffer.unshift(this.cloneCard(card));
    }

    private async createReviewTransaction(
        currentItem: FSRSCard,
        feedback: QueueFeedback,
        options: { includeCardSnapshot?: boolean } = {}
    ): Promise<ReviewTransaction> {
        const includeCardSnapshot = options.includeCardSnapshot !== false;
        let cardBefore: FSRSCard | null = null;
        if (includeCardSnapshot) {
            try {
                cardBefore = await this.resolvePreReviewCardSnapshot(currentItem);
                if (!cardBefore && this.queueType !== QueueType.NeuralRoam) {
                    logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Unable to resolve pre-review card snapshot:', {
                        queueType: this.queueType,
                        cardId: currentItem.id,
                        blockId: currentItem.blockId,
                    });
                }
            } catch (error) {
                logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Failed to capture pre-review card snapshot:', {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const queueSnapshots = await this.captureQueueSnapshots(feedback);

        return {
            action: feedback.action,
            cardId: currentItem.id,
            cardBefore,
            queueSnapshots,
            sessionExcludedCardIdsBefore: Array.from(this.sessionExcludedCardIds),
            sessionExcludedLogicalKeysBefore: Array.from(this.sessionExcludedLogicalKeys),
        };
    }

    private async resolvePreReviewCardSnapshot(currentItem: FSRSCard): Promise<FSRSCard | null> {
        // NeuralRoam may surface non-card nodes as synthetic review items (id=blockId).
        // These blocks do not necessarily exist in card storage, so snapshot lookup is intentionally skipped.
        if (this.queueType === QueueType.NeuralRoam) {
            return null;
        }

        const byCardId = await this.manager.getCard(currentItem.id, { silent: true }).catch(() => null);
        if (byCardId) {
            return this.cloneCard(byCardId);
        }

        const blockId = String(currentItem.blockId || currentItem.id || '').trim();
        if (!blockId) {
            return null;
        }

        const byBlockId = await this.manager.getCards({ blockIds: [blockId] }).catch(() => []);
        if (byBlockId.length > 0) {
            return this.cloneCard(byBlockId[0]);
        }

        return null;
    }

    private async captureQueueSnapshots(feedback: QueueFeedback): Promise<QueueSnapshotRecord[]> {
        const targets = new Map<QueueType, QueueRollbackCapable>();
        this.addSnapshotTarget(targets, this.queueType, this.queue as QueueRollbackCapable);

        if (this.shouldSnapshotFinalDrill(feedback)) {
            this.addSnapshotTarget(
                targets,
                QueueType.FinalDrill,
                this.manager.getQueue(QueueType.FinalDrill) as QueueRollbackCapable
            );
        }

        const records: QueueSnapshotRecord[] = [];
        for (const [queueType, queue] of targets.entries()) {
            if (typeof queue.createRollbackSnapshot !== 'function') {
                continue;
            }
            const snapshot = await queue.createRollbackSnapshot();
            records.push({ queueType, queue, snapshot });
        }
        return records;
    }

    private addSnapshotTarget(
        targets: Map<QueueType, QueueRollbackCapable>,
        queueType: QueueType,
        queue: QueueRollbackCapable
    ): void {
        if (!targets.has(queueType)) {
            targets.set(queueType, queue);
        }
    }

    private shouldSnapshotFinalDrill(feedback: QueueFeedback): boolean {
        if (feedback.action !== 'rate') {
            return false;
        }

        const rating = feedback.rating ?? 0;
        if (rating >= 3) {
            return false;
        }

        return this.queueType === QueueType.RetrievalPractice
            || this.queueType === QueueType.IncrementalLearning
            || this.queueType === QueueType.FilterGroup;
    }

    private shouldHandleHideCurrentInScope(currentItem: FSRSCard, actionId: string): boolean {
        if (this.queueType !== QueueType.FilterGroup || !isHideCurrentInScopeCommandId(actionId)) {
            return false;
        }

        const cardType = String(currentItem.type || '').trim();
        return cardType === 'topic' || cardType === 'concept';
    }

    private async restoreReviewTransaction(
        transaction: ReviewTransaction,
        options: { persistCardRestore: boolean }
    ): Promise<void> {
        for (const record of transaction.queueSnapshots) {
            if (typeof record.queue.restoreRollbackSnapshot !== 'function') {
                continue;
            }
            await record.queue.restoreRollbackSnapshot(record.snapshot);
        }

        if (transaction.cardBefore) {
            const cardSnapshot = this.cloneCard(transaction.cardBefore);
            if (options.persistCardRestore) {
                await this.manager.updateCard(cardSnapshot);
            } else if (typeof this.manager.restoreCardSnapshotForFailedFeedback === 'function') {
                await this.manager.restoreCardSnapshotForFailedFeedback(cardSnapshot);
            } else {
                logger.warn('[SiYuanMemo][UnifiedQueueStrategy] No no-persist card restore port for failed feedback:', {
                    queueType: this.queueType,
                    cardId: transaction.cardId,
                });
            }
        }

        this.restoreSessionExcludedCardIds(
            transaction.sessionExcludedCardIdsBefore,
            transaction.sessionExcludedLogicalKeysBefore
        );
    }

    private async rollbackTransaction(transaction: ReviewTransaction): Promise<void> {
        await this.restoreReviewTransaction(transaction, { persistCardRestore: true });
        this.lastCounterSnapshot = null;
        this.invalidateCache();
    }

    private async compensateFailedFeedback(activeItem: FSRSCard, transaction: ReviewTransaction | null): Promise<void> {
        const restoredItem = transaction?.cardBefore || activeItem;
        try {
            if (transaction) {
                await this.restoreReviewTransaction(transaction, { persistCardRestore: false });
            }
        } catch (rollbackError) {
            logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Failed to compensate failed feedback:', {
                queueType: this.queueType,
                cardId: activeItem.id,
                error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            });
        }

        this.forwardBuffer = [];
        this.pendingRotateCardId = null;
        this.clearAvoidOnceIdentity();
        this.currentItem = await this.maybeAddNextDues(this.cloneCard(restoredItem))
            .catch(() => this.cloneCard(restoredItem));
        this.invalidateCache();
    }

    private cloneCard(card: FSRSCard): FSRSCard {
        const cloned = JSON.parse(JSON.stringify(card)) as CardWithNextDues;
        delete cloned.nextDues;
        return cloned;
    }

    serializeSessionSnapshot(): ReviewQueueSessionSnapshot {
        return {
            version: 1,
            queueType: this.queueType,
            cacheValid: this.cacheValid,
            currentIndex: Math.max(0, this.currentIndex),
            cachedCards: this.cachedCards.map((card) => this.cloneCard(card)),
            currentItem: this.currentItem ? this.cloneCard(this.currentItem) : null,
            forwardBuffer: this.forwardBuffer.map((card) => this.cloneCard(card)),
            pendingRotateCardId: this.pendingRotateCardId,
            // Legacy readers may still look at deferOnceCardId; keep it in sync with
            // the card-level part of the visible identity.
            deferOnceCardId: this.avoidOnceCardId,
            avoidOnceCardId: this.avoidOnceCardId,
            avoidOnceBlockId: this.avoidOnceBlockId,
            sessionExcludedCardIds: Array.from(this.sessionExcludedCardIds),
            sessionExcludedLogicalKeys: Array.from(this.sessionExcludedLogicalKeys),
            lastCounterSnapshot: this.lastCounterSnapshot
                ? this.cloneCounterSnapshot(this.lastCounterSnapshot)
                : null,
        };
    }

    restoreSessionSnapshot(snapshot: ReviewQueueSessionSnapshot | null | undefined): void {
        if (!snapshot || snapshot.version !== 1 || snapshot.queueType !== this.queueType) {
            return;
        }

        this.restoreSessionExcludedCardIds(
            Array.isArray(snapshot.sessionExcludedCardIds)
                ? snapshot.sessionExcludedCardIds
                : [],
            Array.isArray(snapshot.sessionExcludedLogicalKeys)
                ? snapshot.sessionExcludedLogicalKeys
                : []
        );
        this.cachedCards = Array.isArray(snapshot.cachedCards)
            ? this.applySessionExclusions(snapshot.cachedCards)
            : [];
        this.currentItem = snapshot.currentItem ? this.cloneCard(snapshot.currentItem) : null;
        this.forwardBuffer = Array.isArray(snapshot.forwardBuffer)
            ? this.applySessionExclusions(snapshot.forwardBuffer)
            : [];
        this.pendingRotateCardId = typeof snapshot.pendingRotateCardId === 'string'
            ? snapshot.pendingRotateCardId
            : null;
        this.avoidOnceCardId = typeof snapshot.avoidOnceCardId === 'string'
            ? snapshot.avoidOnceCardId
            : typeof snapshot.deferOnceCardId === 'string'
                ? snapshot.deferOnceCardId
                : null;
        this.avoidOnceBlockId = typeof snapshot.avoidOnceBlockId === 'string'
            ? snapshot.avoidOnceBlockId
            : null;
        this.lastCounterSnapshot = snapshot.lastCounterSnapshot
            ? this.cloneCounterSnapshot(snapshot.lastCounterSnapshot)
            : null;
        if (this.hasSessionExclusions() && this.lastCounterSnapshot) {
            this.refreshLocalCounterSnapshot('hot', this.lastCounterSnapshot);
        }
        this.historyStack = [];
        this.currentIndex = Math.max(0, Math.min(
            Number(snapshot.currentIndex) || 0,
            this.cachedCards.length,
        ));
        this.cacheValid = snapshot.cacheValid === true;
    }

    getType(): QueueType {
        return this.queueType;
    }

    getUnderlyingQueue(): IReviewQueue {
        return this.queue;
    }

    resetSessionState(): void {
        this.forwardBuffer = [];
        this.historyStack = [];
        this.pendingRotateCardId = null;
        this.clearSessionExcludedCardIds();
        this.feedbackMutation = null;
        this.clearAvoidOnceIdentity();
        this.currentItem = null;
        this.currentIndex = 0;
        this.cachedCards = [];
        this.lastCounterSnapshot = null;
        this.cacheManager.clear();
        this.invalidateCache();
        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Session state reset: ${this.queueType}`);
    }

    getCacheStats() {
        return this.cacheManager.getStats();
    }

    cleanup(): void {
        this.queue.unsubscribe(this.cacheManager);
        if (this.managerObserverRegistered) {
            const manager = this.manager as Partial<{
                unregisterObserver: (observer: IDataSourceObserver) => void;
            }>;
            manager.unregisterObserver?.(this);
            this.managerObserverRegistered = false;
        }
        this.cacheManager.clear();
        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cleaned up: ${this.queueType}`);
    }
}
