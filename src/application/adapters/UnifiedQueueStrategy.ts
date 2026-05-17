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
import { shouldReadQueueLocally } from '@/core/queue/domain/queueProjectionReadPolicy';
import { formatNextDue } from '@/application/helpers/formatNextDue';
import type { ISchedulerRouter } from '../interfaces/ISchedulerRouter';
import { CacheManagerObserver } from '../observers/CacheManagerObserver';
import {
    type ProjectionPatchOutcome,
    type QueueReviewResultWithProjection,
} from './ReviewSessionProjectionApplier';
import {
    NeuralRoamAdvanceOutcomePolicy,
    ReviewCurrentItemCommand,
    ReviewFeedbackCompensationPolicy,
    ReviewLearnAheadAdvancePolicy,
    ReviewSessionCursor,
    ReviewSessionProjectionAdvancePolicy,
} from './review-session';
import { resolveEffectiveSchedulerTypeForCard } from '@/core/scheduler/schedulerPolicy';
import { buildSchedulerPreviewSnapshotKey } from '@/core/scheduler/schedulerStateSnapshot';
import { createLogger } from '@/utils/logger';
import type {
    BackendNeuralRoamAdvanceRequest,
    BackendNeuralRoamAdvanceResult,
    BackendNeuralRoamStartFromFocusRequest,
    BackendNeuralRoamItem,
} from '../../../packages/contracts/src/backend-rpc';

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

type NeuralRoamAdvanceManager = UnifiedDataSourceManager & {
    neuralRoamAdvance?: (request: BackendNeuralRoamAdvanceRequest) => Promise<BackendNeuralRoamAdvanceResult>;
};

type NeuralRoamBackendStateSyncQueue = IReviewQueue & {
    syncFromBackendState?: (state: Record<string, unknown>) => Promise<void>;
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
    private cacheManager: CacheManagerObserver;
    private readonly cursor: ReviewSessionCursor;
    private readonly currentItemCommand = new ReviewCurrentItemCommand();
    private historyStack: ReviewHistoryEntry[] = [];
    private readonly maxHistorySize = 100;
    private managerObserverRegistered = false;
    private feedbackMutation: FeedbackMutationContext | null = null;
    private readonly suspiciousNextDuesLogKeys = new Set<string>();
    private pendingNeuralRoamAdvanceNext: FSRSCard | null = null;
    private pendingNeuralRoamAdvanceNextReady = false;
    private pendingNeuralRoamStartFromFocus: BackendNeuralRoamStartFromFocusRequest | null = null;
    private learnAheadSession = false;
    private readonly projectionAdvancePolicy: ReviewSessionProjectionAdvancePolicy;
    private readonly feedbackCompensationPolicy = new ReviewFeedbackCompensationPolicy();
    private readonly learnAheadAdvancePolicy = new ReviewLearnAheadAdvancePolicy();
    private readonly neuralRoamAdvanceOutcomePolicy = new NeuralRoamAdvanceOutcomePolicy();

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

        this.cursor = new ReviewSessionCursor(this.queueType);
        this.cacheManager = new CacheManagerObserver({
            nextDuesCacheSize: 100,
            cardTypeCacheSize: 50,
            formattedDataCacheSize: 50,
            debugMode: false,
        });
        this.projectionAdvancePolicy = new ReviewSessionProjectionAdvancePolicy({
            shouldReadLocally: () => shouldReadQueueLocally(this.queue),
            hydrateCardsBySnapshotIds: (rowIds) => this.queue.getCardsBySnapshotIds(rowIds),
        });

        this.queue.subscribe(this.cacheManager);
        this.subscribeToQueueChanges();

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Created for queue: ${this.queueType}`);
    }

    private get currentItem(): FSRSCard | null {
        return this.currentItemCommand.current;
    }

    private setCurrentItem(card: FSRSCard): FSRSCard {
        return this.currentItemCommand.select(card);
    }

    private restoreCurrentItem(restored: { currentItem: FSRSCard | null }): FSRSCard | null {
        return this.currentItemCommand.restore(restored);
    }

    private clearCurrentItem(): null {
        return this.currentItemCommand.clear();
    }

    async next(): Promise<FSRSCard | null> {
        try {
            if (this.cursor.hasForward()) {
                const replayCard = this.cursor.shiftForward();
                if (!replayCard) {
                    return null;
                }
                const replayCardWithNextDues = await this.maybeAddNextDues(replayCard);
                this.setCurrentItem(replayCardWithNextDues);
                return replayCardWithNextDues;
            }

            if (this.queueType === QueueType.FinalDrill) {
                await this.reloadCards();
                if (this.cursor.length === 0) {
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                    return null;
                }

                const card = this.cursor.cached()[0];
                if (!card) {
                    return null;
                }
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (dynamic draw):`, {
                    queueType: this.queueType,
                    cardId: card.id,
                    total: this.cursor.length,
                });
                this.setCurrentItem(card);
                return card;
            }

            if (this.queueType === QueueType.NeuralRoam) {
                return await this.nextFromNeuralRoamAdvance();
            }

            if (this.usesRequeryAfterFeedback() && !this.learnAheadSession) {
                return await this.nextFromRequeryQueue();
            }

            if (!this.cursor.valid || this.cursor.index > this.cursor.length) {
                await this.reloadCards();
            }

            if (this.cursor.length === 0) {
                this.cursor.clearPendingRotation();
                this.clearCurrentItem();
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                return null;
            }

            const next = this.cursor.nextCached();
            if (!next) {
                this.clearCurrentItem();
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue exhausted without reload: ${this.queueType}`);
                return null;
            }
            const cardWithNextDues = await this.maybeAddNextDues(next.card);

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card:`, {
                queueType: this.queueType,
                cardId: next.card.id,
                index: next.index,
                total: next.total,
                due: new Date(next.card.due).toISOString(),
                now: new Date(Date.now()).toISOString(),
            });

            this.setCurrentItem(cardWithNextDues);
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
        const activeItem = this.currentItemCommand.resolveActive(currentItem);
        if (!activeItem) {
            this.cursor.clearPendingRotation();
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

            if (this.queueType === QueueType.NeuralRoam) {
                await this.handleNeuralRoamAdvanceFeedback(activeItem, feedback);
                return;
            }

            if (feedback.action === 'rate' && feedback.rating) {
                activeTransaction = await this.createReviewTransaction(activeItem, feedback);
                this.cursor.clearForward();
                const reviewResult = await this.handleReviewWithFeedbackContext(activeItem, feedback);
                this.pushHistory(activeItem, activeTransaction);
                activeTransactionPushed = true;
                this.clearCurrentItem();
                this.cursor.counterSnapshot = reviewResult.counterSnapshot ?? null;

                if (this.learnAheadSession) {
                    this.cursor.clearPendingRotation();
                    this.applyRemovalToCache(activeItem.id);
                    this.cursor.markValid();
                    if (this.learnAheadAdvancePolicy.shouldExitAfterFeedback({
                        currentIndex: this.cursor.index,
                        cachedCardsLength: this.cursor.length,
                    })) {
                        this.learnAheadSession = false;
                    }
                    this.refreshLocalCounterSnapshot('hot', reviewResult.counterSnapshot);
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated in learn-ahead session:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        rating: feedback.rating,
                        remaining: this.cursor.length,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }

                if (this.usesRequeryAfterFeedback()) {
                    this.applyRequeryStateAfterReview(activeItem, feedback, reviewResult);
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated with requery-after-feedback flow:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        rating: feedback.rating,
                        avoidOnceCardId: this.cursor.avoidCardId,
                        avoidOnceBlockId: this.cursor.avoidBlockId,
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
                    this.cursor.clearPendingRotation();
                    this.cursor.markValid();
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
                    this.cursor.clearPendingRotation();
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
                    this.cursor.setPendingRotation(rotated ? null : activeItem.id);
                    if (!rotated && patched) {
                        this.cursor.clampToLastWhenPastEnd();
                    }
                } else {
                    this.cursor.clearPendingRotation();
                }

                if (patched && this.hasSessionExclusions()) {
                    this.refreshLocalCounterSnapshot('hot', reviewResult.counterSnapshot);
                }

                if (!patched || this.shouldReloadAfterReviewResult(reviewResult)) {
                    this.invalidateCache();
                } else {
                    this.cursor.markValid();
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
                this.cursor.clearForward();
                this.clearCurrentItem();
                this.cursor.clearPendingRotation();
                if (this.usesRequeryAfterFeedback()) {
                    this.setAvoidOnceIdentity(activeItem);
                    this.cursor.resetIndex();
                    this.cursor.invalidate();
                    await this.refreshQueueCounterSnapshot('skip requery');
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card skipped with requery-after-feedback flow:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        avoidOnceCardId: this.cursor.avoidCardId,
                        avoidOnceBlockId: this.cursor.avoidBlockId,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }
                const patched = this.applySkipToCache(activeItem.id);
                await this.refreshQueueCounterSnapshot('skip');
                if (!patched) {
                    this.invalidateCache();
                } else {
                    this.cursor.markValid();
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
                    this.cursor.clearForward();
                    this.clearCurrentItem();
                    this.cursor.clearPendingRotation();
                    this.clearAvoidOnceIdentity();
                    const patched = this.applyRemovalToCache(activeItem.id);
                    await this.refreshQueueCounterSnapshot('hide current in scope');
                    if (!patched) {
                        this.invalidateCache();
                    } else {
                        this.cursor.markValid();
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
                this.cursor.clearForward();
                this.clearCurrentItem();
                this.cursor.clearPendingRotation();
                if (this.usesRequeryAfterFeedback()) {
                    this.clearAvoidOnceIdentity();
                    this.cursor.resetIndex();
                    this.cursor.invalidate();
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

            if (error instanceof QueueItemUnavailableError
                || (isRecord(error) && error.name === 'QueueItemUnavailableError')
                || this.isUnavailableCurrentItemError(error, activeItem)) {
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

            const compensationPlan = this.feedbackCompensationPolicy.plan({
                hasFailedHistoryEntry: activeTransactionPushed && Boolean(activeTransaction),
                hasTransaction: Boolean(activeTransaction),
                hasCardSnapshot: Boolean(activeTransaction?.cardBefore),
            });
            if (compensationPlan.includes('discard-failed-history-entry') && activeTransaction) {
                this.discardFailedHistoryEntry(activeItem, activeTransaction);
            }
            await this.compensateFailedFeedback(activeItem, activeTransaction);
            this.cursor.clearPendingRotation();
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
        this.cursor.clearPendingRotation();
        this.clearAvoidOnceIdentity();
        const activeItem = this.currentItemCommand.resolveActive(currentItem);
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
        this.setCurrentItem(previousWithNextDues);
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
            if (this.queueType === QueueType.NeuralRoam && !this.isProjectionBackedQueue()) {
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
                const extraParts = [
                    counterSnapshot.currentLearningDue != null ? `${counterSnapshot.currentLearningDue} learning now` : null,
                    counterSnapshot.todayReviewDue != null ? `${counterSnapshot.todayReviewDue} review today` : null,
                    counterSnapshot.allowedNew != null ? `${counterSnapshot.allowedNew} new` : null,
                    counterSnapshot.learnAheadAvailable ? `${counterSnapshot.learnAheadAvailable} learn ahead` : null,
                ].filter(Boolean);
                const stats: QueueStats = {
                    size: counterSnapshot.remaining,
                    label: `${counterSnapshot.due} due`,
                    extra: extraParts.length > 0
                        ? extraParts.join(' · ')
                        : `${counterSnapshot.total ?? counterSnapshot.remaining} total`,
                };

                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Stats:`, {
                    queueType: this.queueType,
                    ...stats,
                });

                return stats;
            }

            const { size, dueToday } = this.calculateStatsFromCards(this.cursor.cached(), Date.now());

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

            throw this.createQueueCountUnavailableError('stats read', error);
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
        const now = Date.now();
        let currentLearningDue = 0;
        let todayReviewDue = 0;
        let allowedNew = 0;

        const cachedCards = this.cursor.cached();
        for (const card of cachedCards) {
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

            if ((card.state === CardState.Learning || card.state === CardState.Relearning) && Number(card.due) <= now) {
                currentLearningDue += 1;
            } else if (card.state === CardState.Review) {
                todayReviewDue += 1;
            } else if (card.state === CardState.New || Number(card.reps) === 0) {
                allowedNew += 1;
            }
        }

        return {
            version: Math.max(
                Number(baseSnapshot?.version) || 0,
                Number(this.cursor.counterSnapshot?.version) || 0,
            ) + 1,
            remaining: cachedCards.length,
            due: cachedCards.length,
            total: cachedCards.length,
            currentLearningDue,
            todayReviewDue,
            allowedNew,
            learnAheadAvailable: baseSnapshot?.learnAheadAvailable,
            scheduledTotal: cachedCards.length + Math.max(0, Number(baseSnapshot?.learnAheadAvailable || 0)),
            buckets,
            source,
        };
    }

    private refreshLocalCounterSnapshot(
        source: QueueCounterSnapshot['source'],
        baseSnapshot?: QueueCounterSnapshot | null
    ): void {
        this.cursor.counterSnapshot = this.buildCounterSnapshotFromCachedCards(source, baseSnapshot);
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
        if (!this.cursor.valid || this.cursor.index > this.cursor.length) {
            await this.reloadCards();
        }

        if (this.cursor.length === 0) {
            this.cursor.clearPendingRotation();
            this.clearAvoidOnceIdentity();
            this.clearCurrentItem();
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
            return null;
        }

        const selection = this.cursor.nextRequery();
        if (!selection) {
            this.clearCurrentItem();
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue exhausted after requery: ${this.queueType}`);
            return null;
        }

        const cardWithNextDues = await this.maybeAddNextDues(selection.card);

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (requery-after-feedback):`, {
            queueType: this.queueType,
            cardId: selection.card.id,
            selectedBlockId: selection.card.blockId,
            avoidedCardId: selection.avoidedCardId,
            avoidedBlockId: selection.avoidedBlockId,
            index: selection.index,
            mode: selection.mode,
            total: selection.total,
            due: new Date(selection.card.due).toISOString(),
            now: new Date(Date.now()).toISOString(),
        });

        this.setCurrentItem(cardWithNextDues);
        return cardWithNextDues;
    }

    private applyRequeryStateAfterReview(
        reviewedCard: FSRSCard,
        _feedback: QueueFeedback,
        _reviewResult: QueueReviewResult
    ): void {
        this.cursor.clearForward();
        this.clearCurrentItem();
        this.cursor.clearPendingRotation();
        this.cursor.resetIndex();
        this.cursor.invalidate();
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
        if (card) {
            this.cursor.setAvoidOnce(card);
        } else {
            this.cursor.clearAvoidOnce();
        }
    }

    private clearAvoidOnceIdentity(): void {
        this.cursor.clearAvoidOnce();
    }

    private shouldRotateAfterLowRating(feedback: QueueFeedback): boolean {
        if (feedback.action !== 'rate') {
            return false;
        }

        const rating = feedback.rating ?? 0;
        return rating > 0 && rating < 3 && isDynamicQueueType(this.queueType);
    }

    private rotateCachedCardToTail(cardId: string): boolean {
        const rotated = this.cursor.rotateToTail(cardId);
        if (!rotated) {
            return false;
        }

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Low-rated card rotated to tail:', {
            queueType: this.queueType,
            cardId: this.normalizeCardId(cardId),
            currentIndex: this.cursor.index,
            total: this.cursor.length,
        });

        return true;
    }

    private async applyProjectionQueueImpactToCache(
        reviewedCard: FSRSCard,
        result: QueueReviewResultWithProjection,
        options: { forceRemove?: boolean } = {}
    ): Promise<ProjectionPatchOutcome> {
        const applyResult = await this.projectionAdvancePolicy.advance({
            reviewedCard,
            result,
            forceRemove: options.forceRemove,
            state: this.cursor.projectionState(),
        });

        if (applyResult.outcome === 'patched') {
            this.cursor.applyProjectionPatch(applyResult.state);
        }
        return applyResult.outcome;
    }

    private supportsHotPatchAfterReview(): boolean {
        return this.queueType === QueueType.RetrievalPractice
            || this.queueType === QueueType.IncrementalLearning
            || this.queueType === QueueType.FilterGroup
            || this.queueType === QueueType.FinalDrill
            || this.queueType === QueueType.Leech;
    }

    private isProjectionBackedQueue(): boolean {
        if (shouldReadQueueLocally(this.queue)) {
            return false;
        }

        const manager = this.manager as unknown as {
            getQueueProjectionRolloutDiagnostics?: (queueType?: QueueType) => unknown[];
        };
        const diagnostics = manager.getQueueProjectionRolloutDiagnostics?.(this.queueType);
        return Array.isArray(diagnostics)
            && diagnostics.some((entry) => (
                isRecord(entry)
                && String(entry.queueType || '') === this.queueType
                && (entry.state === 'backend-projection' || entry.readPath === 'backend-projection')
            ));
    }

    private async nextFromNeuralRoamAdvance(): Promise<FSRSCard | null> {
        if (this.pendingNeuralRoamAdvanceNextReady) {
            const pending = this.pendingNeuralRoamAdvanceNext;
            this.pendingNeuralRoamAdvanceNext = null;
            this.pendingNeuralRoamAdvanceNextReady = false;
            if (!pending) {
                this.clearCurrentItem();
                logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam advance queue exhausted');
                return null;
            }
            const cardWithNextDues = await this.maybeAddNextDues(pending);
            this.setCurrentItem(cardWithNextDues);
            return cardWithNextDues;
        }

        const startFromFocus = this.pendingNeuralRoamStartFromFocus;
        this.pendingNeuralRoamStartFromFocus = null;
        const result = await this.submitNeuralRoamAdvance({
            queueType: 'neural-roam',
            sessionId: null,
            currentItem: this.currentItem ? this.toNeuralRoamAdvanceItem(this.currentItem) : null,
            feedback: null,
            startFromFocus,
        });
        return this.consumeNeuralRoamAdvanceResult(result, 'next');
    }

    public startNeuralRoamFromFocusOnNextAdvance(request: BackendNeuralRoamStartFromFocusRequest | null | undefined): void {
        const blockId = String(request?.blockId || '').trim();
        if (!blockId) {
            this.pendingNeuralRoamStartFromFocus = null;
            return;
        }
        this.pendingNeuralRoamStartFromFocus = {
            blockId,
            includeFocusAsFirst: request?.includeFocusAsFirst !== false,
            resetHistory: request?.resetHistory === true,
            startNewSession: request?.startNewSession === true,
        };
        this.clearCurrentItem();
        this.pendingNeuralRoamAdvanceNext = null;
        this.pendingNeuralRoamAdvanceNextReady = false;
        this.cursor.clearForward();
    }

    private async handleNeuralRoamAdvanceFeedback(
        activeItem: FSRSCard,
        feedback: QueueFeedback,
    ): Promise<void> {
        if (feedback.action !== 'rate' && feedback.action !== 'skip') {
            this.pushHistory(activeItem, null);
            this.pendingNeuralRoamAdvanceNext = null;
            this.pendingNeuralRoamAdvanceNextReady = false;
            this.clearCurrentItem();
            logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam custom feedback handled as session-only action:', {
                queueType: this.queueType,
                cardId: activeItem.id,
                action: feedback.action,
                customActionId: feedback.customActionId,
            });
            return;
        }

        const result = await this.submitNeuralRoamAdvance({
            queueType: 'neural-roam',
            sessionId: null,
            currentItem: this.toNeuralRoamAdvanceItem(activeItem),
            feedback: {
                action: feedback.action,
                rating: feedback.action === 'rate' ? feedback.rating : undefined,
                customActionId: feedback.customActionId ?? null,
            },
            reviewedAt: Date.now(),
        });

        const outcome = this.neuralRoamAdvanceOutcomePolicy.consume(result);
        if (outcome.kind === 'item-unavailable' || outcome.kind === 'unavailable') {
            if (outcome.kind === 'item-unavailable') {
                this.clearUnavailableItemFromLocalState(activeItem);
                throw new QueueItemUnavailableError(
                    `Queue item is no longer available: ${activeItem.id}`,
                    {
                        cardId: activeItem.id,
                        blockId: activeItem.blockId,
                        queueType: this.queueType,
                    },
                );
            }
            throw new Error(
                `NEURAL_ROAM_ADVANCE_UNAVAILABLE: ${outcome.reason}: ${outcome.message}`,
            );
        }

        await this.syncNeuralRoamQueueFromBackendState(result);
        this.pushHistory(activeItem, null);
        this.cursor.clearForward();
        this.cursor.clearPendingRotation();
        this.clearCurrentItem();
        this.pendingNeuralRoamAdvanceNext = result.nextItem
            ? this.fromNeuralRoamAdvanceItem(result.nextItem)
            : null;
        this.pendingNeuralRoamAdvanceNextReady = true;
        this.cursor.counterSnapshot = this.toCounterSnapshotFromNeuralRoamAdvance(result);

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam feedback advanced through backend contract:', {
            queueType: this.queueType,
            cardId: activeItem.id,
            action: feedback.action,
            rating: feedback.rating,
            status: result.status,
            nextCardId: result.nextItem?.cardId ?? null,
        });
    }

    private async submitNeuralRoamAdvance(
        request: BackendNeuralRoamAdvanceRequest,
    ): Promise<BackendNeuralRoamAdvanceResult> {
        const manager = this.manager as NeuralRoamAdvanceManager;
        if (typeof manager.neuralRoamAdvance !== 'function') {
            throw new Error('NEURAL_ROAM_ADVANCE_UNAVAILABLE: manager neural-roam.advance contract is unavailable');
        }
        return manager.neuralRoamAdvance(request);
    }

    private async consumeNeuralRoamAdvanceResult(
        result: BackendNeuralRoamAdvanceResult,
        source: 'next' | 'pending',
    ): Promise<FSRSCard | null> {
        this.cursor.counterSnapshot = this.toCounterSnapshotFromNeuralRoamAdvance(result);
        const outcome = this.neuralRoamAdvanceOutcomePolicy.consume(result);
        if (outcome.kind === 'exhausted') {
            await this.syncNeuralRoamQueueFromBackendState(result);
            this.clearCurrentItem();
            return null;
        }
        if (outcome.kind !== 'next' || !result.nextItem) {
            throw new Error(
                `NEURAL_ROAM_ADVANCE_UNAVAILABLE: ${outcome.kind === 'unavailable' ? outcome.reason : outcome.reason || result.status}: ${outcome.kind === 'unavailable' ? outcome.message : result.message || 'advance failed'}`,
            );
        }

        await this.syncNeuralRoamQueueFromBackendState(result);
        const nextCard = this.fromNeuralRoamAdvanceItem(result.nextItem);
        const cardWithNextDues = await this.maybeAddNextDues(nextCard);
        this.setCurrentItem(cardWithNextDues);
        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Next card (backend NeuralRoam advance):', {
            queueType: this.queueType,
            cardId: nextCard.id,
            source,
            status: result.status,
        });
        return cardWithNextDues;
    }

    private toNeuralRoamAdvanceItem(card: FSRSCard): BackendNeuralRoamItem {
        const payload = this.cloneCard(card) as CardWithNextDues;
        const meta = isRecord(payload.meta) ? payload.meta : {};
        const neuralContext = isRecord(meta.neuralContext) ? meta.neuralContext : null;
        return {
            id: String(payload.id || payload.blockId || '').trim(),
            cardId: String(payload.id || payload.blockId || '').trim(),
            blockId: String(payload.blockId || payload.id || '').trim(),
            deckId: typeof (payload as { deckId?: unknown }).deckId === 'string'
                ? String((payload as { deckId?: string }).deckId)
                : null,
            due: Number.isFinite(Number(payload.due)) ? Number(payload.due) : null,
            type: String(payload.type || '').trim() || null,
            meta,
            sourceKind: neuralContext?.isFlashcard === true ? 'associated-review' : 'virtual',
            payload: payload as unknown as Record<string, unknown>,
        };
    }

    private fromNeuralRoamAdvanceItem(item: BackendNeuralRoamItem): FSRSCard {
        if (item.payload && this.isFsrsCardLike(item.payload)) {
            return this.cloneCard(item.payload as unknown as FSRSCard);
        }

        const now = Date.now();
        const id = String(item.cardId || item.id || item.blockId || '').trim();
        const blockId = String(item.blockId || item.cardId || item.id || '').trim();
        return {
            id: id || blockId,
            xiuyuanID: blockId || id,
            blockId: blockId || id,
            due: Number.isFinite(Number(item.due)) ? Number(item.due) : now,
            stability: 0,
            difficulty: 0,
            reps: 0,
            lapses: 0,
            state: CardState.New,
            lastReview: now,
            elapsedDays: 0,
            scheduledDays: 0,
            priority: 50,
            type: this.normalizeAdvanceItemCardType(item.type),
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
            meta: item.meta && typeof item.meta === 'object' ? { ...item.meta } : {},
        };
    }

    private isFsrsCardLike(value: Record<string, unknown>): boolean {
        return typeof value.id === 'string'
            && typeof value.blockId === 'string'
            && typeof value.due === 'number';
    }

    private normalizeAdvanceItemCardType(value: unknown): CardType {
        switch (value) {
            case CardType.Item:
            case CardType.Topic:
            case CardType.Concept:
            case CardType.Descriptor:
            case CardType.Incremental:
            case CardType.Webpage:
                return value;
            default:
                return CardType.Topic;
        }
    }

    private toCounterSnapshotFromNeuralRoamAdvance(
        result: BackendNeuralRoamAdvanceResult,
    ): QueueCounterSnapshot {
        return {
            version: Date.now(),
            remaining: Math.max(0, Math.floor(Number(result.counters.remaining || 0))),
            due: Math.max(0, Math.floor(Number(result.counters.due || 0))),
            total: Math.max(0, Math.floor(Number(result.counters.total || 0))),
            buckets: {
                all: Math.max(0, Math.floor(Number(result.counters.total || 0))),
                item: Math.max(0, Math.floor(Number(result.counters.pendingAssociatedReview || 0))),
                descriptor: 0,
                topic: Math.max(0, Math.floor(Number(result.counters.sourceNodes || 0))),
                concept: 0,
            },
            source: 'hot',
        };
    }

    async learnAhead(): Promise<boolean> {
        const queue = this.queue as IReviewQueue & {
            getLearnAheadCards?: () => Promise<FSRSCard[]>;
        };
        if (typeof queue.getLearnAheadCards !== 'function') {
            return false;
        }

        const result = await this.learnAheadAdvancePolicy.startAfterNormalExhaustion({
            getNormalRemaining: () => this.queue.getRemainingSize(),
            getLearnAheadCards: () => queue.getLearnAheadCards!(),
        });
        if (!result.started) {
            return false;
        }

        this.cursor.load(result.cards);
        this.learnAheadSession = true;
        this.clearCurrentItem();
        this.cursor.clearPendingRotation();
        this.clearAvoidOnceIdentity();
        this.refreshLocalCounterSnapshot('hot', null);

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Learn-ahead session started:`, {
            queueType: this.queueType,
            cardCount: result.cards.length,
        });
        return true;
    }

    private async syncNeuralRoamQueueFromBackendState(result: BackendNeuralRoamAdvanceResult): Promise<void> {
        if (!result.queueState) {
            throw new Error('NEURAL_ROAM_QUEUE_SYNC_UNAVAILABLE: backend queue state is missing');
        }
        const queue = this.queue as NeuralRoamBackendStateSyncQueue;
        if (typeof queue.syncFromBackendState !== 'function') {
            throw new Error('NEURAL_ROAM_QUEUE_SYNC_UNAVAILABLE: local NeuralRoam queue sync contract is unavailable');
        }
        await queue.syncFromBackendState(result.queueState);
    }

    private applyReviewResultToCache(
        reviewedCard: FSRSCard,
        result: QueueReviewResult,
        options: { forceRemove?: boolean } = {}
    ): boolean {
        return this.cursor.applyReviewResult(reviewedCard, result, options);
    }

    private applySkipToCache(cardId: string): boolean {
        return this.cursor.applySkip(cardId);
    }

    private applyRemovalToCache(cardId: string): boolean {
        return this.cursor.applyRemoval(cardId);
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
        return this.cursor.hasSessionExclusions();
    }

    private addSessionExcludedCardIdentity(card: FSRSCard): boolean {
        return this.cursor.addSessionExcludedCardIdentity(card);
    }

    private addUnavailableItemSessionExclusion(card: FSRSCard): void {
        this.cursor.addUnavailableItemSessionExclusion(card);
    }

    private clearSessionExcludedCardIds(): void {
        this.cursor.clearSessionExcludedCardIds();
    }

    private removeSessionExcludedCardIds(cardIds: Array<string | null | undefined>): number {
        return this.cursor.removeSessionExcludedCardIds(cardIds);
    }

    private restoreSessionExcludedCardIds(
        cardIds: Array<string | null | undefined>,
        logicalKeys: Array<string | null | undefined> = []
    ): void {
        this.cursor.restoreSessionExcludedCardIds(cardIds, logicalKeys);
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
        const appendedCount = this.cursor.appendCardsToTail(cards);
        if (appendedCount === 0) {
            return 0;
        }

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Appended cards to tail without resetting session pointer:`, {
            queueType: this.queueType,
            appendedCount,
            currentIndex: this.cursor.index,
            cachedSize: this.cursor.length,
        });

        return appendedCount;
    }

    suppressReviewedCardForCurrentSession(card: FSRSCard): boolean {
        const result = this.cursor.suppressReviewedCardForCurrentSession(card);
        if (!result.changed) {
            return false;
        }

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Suppressed Semantic temporary review card from current session:', {
            queueType: this.queueType,
            cardId: card.id,
            blockId: card.blockId,
            removedCachedCards: result.removedCachedCards,
        });
        return true;
    }

    async getRemainingSize(): Promise<number> {
        try {
            if (this.queueType === QueueType.NeuralRoam && !this.isProjectionBackedQueue()) {
                return await this.queue.getSize();
            }

            const counterSnapshot = await this.getCounterSnapshot();
            if (counterSnapshot) {
                return counterSnapshot.remaining;
            }

            if (this.cursor.valid) {
                return this.cursor.remainingFromCache();
            }

            await this.reloadCards();
            return this.cursor.length;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to get remaining size:`, {
                queueType: this.queueType,
                error: errorMessage,
            });
            throw this.createQueueCountUnavailableError('remaining size read', error);
        }
    }

    async getCounterSnapshot(): Promise<QueueCounterSnapshot | null> {
        if (this.hasSessionExclusions()) {
            if (!this.cursor.valid) {
                await this.reloadCards();
            } else {
                this.refreshLocalCounterSnapshot('hot', this.cursor.counterSnapshot);
            }
        }

        const lastCounterSnapshot = this.cursor.counterSnapshot;
        if (lastCounterSnapshot) {
            return this.cloneCounterSnapshot(lastCounterSnapshot);
        }

        if (typeof this.queue.getCounterSnapshot !== 'function') {
            return null;
        }

        return this.refreshQueueCounterSnapshot('counter snapshot read');
    }

    private async refreshQueueCounterSnapshot(operation: string): Promise<QueueCounterSnapshot | null> {
        if (typeof this.queue.getCounterSnapshot !== 'function') {
            return null;
        }

        try {
            const snapshot = await this.queue.getCounterSnapshot();
            this.cursor.counterSnapshot = snapshot;
            return snapshot ? this.cloneCounterSnapshot(snapshot) : null;
        } catch (error) {
            logger.error('[SiYuanMemo][UnifiedQueueStrategy] QUEUE_COUNT_UNAVAILABLE: failed to read queue counter snapshot:', {
                queueType: this.queueType,
                operation,
                error: error instanceof Error ? error.message : String(error),
            });
            throw this.createQueueCountUnavailableError(operation, error);
        }
    }

    private createQueueCountUnavailableError(operation: string, error: unknown): Error {
        if (
            error instanceof Error
            && /^(QUEUE_COUNT_UNAVAILABLE|QUEUE_PROJECTION_UNAVAILABLE|QUEUE_STATS_UNAVAILABLE)/.test(error.message)
        ) {
            return error;
        }
        const unavailable = new Error(`QUEUE_COUNT_UNAVAILABLE: ${this.queueType} ${operation} unavailable`);
        (unavailable as Error & { cause?: unknown }).cause = error;
        return unavailable;
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
        this.addUnavailableItemSessionExclusion(card);
        this.removeMatchingCardsFromLocalState(identities);
        if (this.cursor.pendingRotation && identities.has(this.cursor.pendingRotation)) {
            this.cursor.clearPendingRotation();
        }
        if (this.currentItem && this.matchesAnyCardIdentity(this.currentItem, identities)) {
            this.clearCurrentItem();
        }
        if (
            (this.cursor.avoidCardId && identities.has(this.cursor.avoidCardId))
            || (this.cursor.avoidBlockId && identities.has(this.cursor.avoidBlockId))
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
        const removed = this.cursor.removeMatching(identities);

        if (this.currentItem && this.matchesAnyCardIdentity(this.currentItem, identities)) {
            this.clearCurrentItem();
        }

        return removed;
    }

    private isUnavailableCurrentItemError(error: unknown, card: FSRSCard): boolean {
        const message = error instanceof Error ? error.message : String(error);
        const hasMissingCardSignal = message.includes('Card not found')
            || message.includes('Block not found')
            || message.includes('获取卡片失败')
            || message.includes('获取块失败')
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
            const cacheKey = buildSchedulerPreviewSnapshotKey(card, {
                source: 'review-next-dues',
                reviewTime,
                memoryStateAsOf,
            });
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

        const fingerprint = buildSchedulerPreviewSnapshotKey(card, { source: 'review-next-dues-log' });
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

    private async loadProjectionBackedCards(forceRefresh = false): Promise<FSRSCard[] | null> {
        if (!this.isProjectionBackedQueue()) {
            return null;
        }

        const rows = await this.queue.getSnapshotRows(forceRefresh);
        const rowIds = rows.map((row) => String(row.id || '')).filter(Boolean);
        if (rowIds.length === 0) {
            return [];
        }

        const cards = await this.queue.getCardsBySnapshotIds(rowIds, forceRefresh);
        if (cards.length !== rowIds.length) {
            throw new Error(
                `QUEUE_PROJECTION_UNAVAILABLE: ${this.queueType} projection hydration returned `
                + `${cards.length}/${rowIds.length} cards`,
            );
        }
        return cards;
    }

    private async reloadCards(): Promise<void> {
        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Reloading cards: ${this.queueType}`);

            const startTime = Date.now();
            const projectionCards = await this.loadProjectionBackedCards(true);
            const loadedCards = projectionCards ?? await this.queue.getCards();
            this.cursor.load(loadedCards);
            if (this.learnAheadSession && this.learnAheadAdvancePolicy.shouldSupersedeWithNormalQueue(this.cursor.length)) {
                this.learnAheadSession = false;
            }
            const queueCounterSnapshot = await this.refreshQueueCounterSnapshot('reload cards');
            this.cursor.counterSnapshot = this.hasSessionExclusions()
                ? this.buildCounterSnapshotFromCachedCards('reconciled', queueCounterSnapshot)
                : queueCounterSnapshot;
            const duration = Date.now() - startTime;

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cards reloaded:`, {
                queueType: this.queueType,
                cardCount: this.cursor.length,
                duration: `${duration}ms`,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to reload cards:`, {
                queueType: this.queueType,
                error: errorMessage,
            });

            this.cursor.reset();
            throw error;
        }
    }

    private invalidateCache(): void {
        this.cursor.invalidate();
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
        this.cursor.pushForward(card);
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
                    throw new QueueItemUnavailableError(
                        `Pre-review card snapshot missing for current queue item: ${currentItem.id}`,
                        {
                            cardId: currentItem.id,
                            blockId: currentItem.blockId,
                            queueType: this.queueType,
                        },
                    );
                }
            } catch (error) {
                if (error instanceof QueueItemUnavailableError
                    || (isRecord(error) && error.name === 'QueueItemUnavailableError')
                    || this.isUnavailableCurrentItemError(error, currentItem)) {
                    throw new QueueItemUnavailableError(
                        `Queue item is no longer available: ${currentItem.id}`,
                        {
                            cardId: currentItem.id,
                            blockId: currentItem.blockId,
                            queueType: this.queueType,
                        },
                        error,
                    );
                }
                logger.error('[SiYuanMemo][UnifiedQueueStrategy] QUEUE_REVIEW_SNAPSHOT_UNAVAILABLE: failed to capture pre-review card snapshot:', {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                const unavailable = new Error(`QUEUE_REVIEW_SNAPSHOT_UNAVAILABLE: ${this.queueType} pre-review card snapshot unavailable`);
                (unavailable as Error & { cause?: unknown }).cause = error;
                throw unavailable;
            }
        }

        const queueSnapshots = await this.captureQueueSnapshots(feedback);
        const cursorSnapshot = this.cursor.serialize(this.queueType, this.currentItem);

        return {
            action: feedback.action,
            cardId: currentItem.id,
            cardBefore,
            queueSnapshots,
            sessionExcludedCardIdsBefore: cursorSnapshot.sessionExcludedCardIds ?? [],
            sessionExcludedLogicalKeysBefore: cursorSnapshot.sessionExcludedLogicalKeys ?? [],
        };
    }

    private async resolvePreReviewCardSnapshot(currentItem: FSRSCard): Promise<FSRSCard | null> {
        // NeuralRoam may surface non-card nodes as synthetic review items (id=blockId).
        // These blocks do not necessarily exist in card storage, so snapshot lookup is intentionally skipped.
        if (this.queueType === QueueType.NeuralRoam) {
            return null;
        }

        const byCardId = await this.manager.getCard(currentItem.id, { silent: true });
        if (byCardId) {
            return this.cloneCard(byCardId);
        }

        const blockId = String(currentItem.blockId || currentItem.id || '').trim();
        if (!blockId) {
            return null;
        }

        const byBlockId = await this.manager.getCards({ blockIds: [blockId] });
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
        this.cursor.counterSnapshot = null;
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

        this.cursor.clearForward();
        this.cursor.clearPendingRotation();
        this.clearAvoidOnceIdentity();
        this.setCurrentItem(await this.maybeAddNextDues(this.cloneCard(restoredItem))
            .catch(() => this.cloneCard(restoredItem)));
        this.invalidateCache();
    }

    private cloneCard(card: FSRSCard): FSRSCard {
        const cloned = JSON.parse(JSON.stringify(card)) as CardWithNextDues;
        delete cloned.nextDues;
        return cloned;
    }

    serializeSessionSnapshot(): ReviewQueueSessionSnapshot {
        return this.cursor.serialize(this.queueType, this.currentItem);
    }

    restoreSessionSnapshot(snapshot: ReviewQueueSessionSnapshot | null | undefined): void {
        if (!snapshot || snapshot.version !== 1 || snapshot.queueType !== this.queueType) {
            return;
        }

        const restored = this.cursor.restore(snapshot);
        this.restoreCurrentItem(restored);
        const lastCounterSnapshot = this.cursor.counterSnapshot;
        if (this.hasSessionExclusions() && lastCounterSnapshot) {
            this.refreshLocalCounterSnapshot('hot', lastCounterSnapshot);
        }
        this.historyStack = [];
    }

    getType(): QueueType {
        return this.queueType;
    }

    getUnderlyingQueue(): IReviewQueue {
        return this.queue;
    }

    resetSessionState(): void {
        this.historyStack = [];
        this.feedbackMutation = null;
        this.clearCurrentItem();
        this.pendingNeuralRoamAdvanceNext = null;
        this.pendingNeuralRoamAdvanceNextReady = false;
        this.cursor.reset();
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
