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
    IncrementalRequeryAdvancePolicy,
    NeuralRoamAdvanceOutcomePolicy,
    ReviewFeedbackCompensationPolicy,
    ReviewLearnAheadAdvancePolicy,
    ReviewSessionProjectionAdvancePolicy,
} from './review-session';
import { buildFsrsSchedulingFingerprint } from '@/core/scheduler/fsrsReviewStateRepair';
import { resolveEffectiveSchedulerTypeForCard } from '@/core/scheduler/schedulerPolicy';
import { createLogger } from '@/utils/logger';
import type {
    BackendNeuralRoamAdvanceRequest,
    BackendNeuralRoamAdvanceResult,
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
    private pendingNeuralRoamAdvanceNext: FSRSCard | null = null;
    private pendingNeuralRoamAdvanceNextReady = false;
    private learnAheadSession = false;
    private readonly projectionAdvancePolicy: ReviewSessionProjectionAdvancePolicy;
    private readonly feedbackCompensationPolicy = new ReviewFeedbackCompensationPolicy();
    private readonly incrementalRequeryPolicy = new IncrementalRequeryAdvancePolicy();
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
                return await this.nextFromNeuralRoamAdvance();
            }

            if (this.usesRequeryAfterFeedback() && !this.learnAheadSession) {
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

            if (this.queueType === QueueType.NeuralRoam) {
                await this.handleNeuralRoamAdvanceFeedback(activeItem, feedback);
                return;
            }

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

                if (this.learnAheadSession) {
                    this.pendingRotateCardId = null;
                    this.applyRemovalToCache(activeItem.id);
                    this.cacheValid = true;
                    if (this.learnAheadAdvancePolicy.shouldExitAfterFeedback({
                        currentIndex: this.currentIndex,
                        cachedCardsLength: this.cachedCards.length,
                    })) {
                        this.learnAheadSession = false;
                    }
                    this.refreshLocalCounterSnapshot('hot', reviewResult.counterSnapshot);
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated in learn-ahead session:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        rating: feedback.rating,
                        remaining: this.cachedCards.length,
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
                    await this.refreshQueueCounterSnapshot('skip requery');
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
                await this.refreshQueueCounterSnapshot('skip');
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
                    await this.refreshQueueCounterSnapshot('hide current in scope');
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
                Number(this.lastCounterSnapshot?.version) || 0,
            ) + 1,
            remaining: this.cachedCards.length,
            due: this.cachedCards.length,
            total: this.cachedCards.length,
            currentLearningDue,
            todayReviewDue,
            allowedNew,
            learnAheadAvailable: baseSnapshot?.learnAheadAvailable,
            scheduledTotal: this.cachedCards.length + Math.max(0, Number(baseSnapshot?.learnAheadAvailable || 0)),
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

        const selection = this.incrementalRequeryPolicy.selectNext(this.cachedCards, {
            cardId: this.avoidOnceCardId,
            blockId: this.avoidOnceBlockId,
        });
        if (selection.index === -1) {
            this.clearAvoidOnceIdentity();
            this.currentItem = null;
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue exhausted after requery: ${this.queueType}`);
            return null;
        }

        const card = this.cachedCards[selection.index];
        const avoidedCardId = this.avoidOnceCardId;
        const avoidedBlockId = this.avoidOnceBlockId;
        this.currentIndex = Math.min(this.cachedCards.length, selection.index + 1);
        this.pendingRotateCardId = null;
        this.clearAvoidOnceIdentity();
        const cardWithNextDues = await this.maybeAddNextDues(card);

        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (requery-after-feedback):`, {
            queueType: this.queueType,
            cardId: card.id,
            selectedBlockId: card.blockId,
            avoidedCardId,
            avoidedBlockId,
            index: selection.index,
            mode: selection.mode,
            total: this.cachedCards.length,
            due: new Date(card.due).toISOString(),
            now: new Date(Date.now()).toISOString(),
        });

        this.currentItem = cardWithNextDues;
        return cardWithNextDues;
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
        const identity = this.incrementalRequeryPolicy.captureVisibleIdentity(card);
        this.avoidOnceCardId = identity.cardId;
        this.avoidOnceBlockId = identity.blockId;
    }

    private clearAvoidOnceIdentity(): void {
        this.avoidOnceCardId = null;
        this.avoidOnceBlockId = null;
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
        result: QueueReviewResultWithProjection,
        options: { forceRemove?: boolean } = {}
    ): Promise<ProjectionPatchOutcome> {
        const applyResult = await this.projectionAdvancePolicy.advance({
            reviewedCard,
            result,
            forceRemove: options.forceRemove,
            state: {
                cacheValid: this.cacheValid,
                cachedCards: this.cachedCards,
                currentIndex: this.currentIndex,
                forwardBuffer: this.forwardBuffer,
                lastCounterSnapshot: this.lastCounterSnapshot,
            },
        });

        if (applyResult.outcome === 'patched') {
            this.cachedCards = applyResult.state.cachedCards;
            this.currentIndex = applyResult.state.currentIndex;
            this.forwardBuffer = applyResult.state.forwardBuffer;
            this.lastCounterSnapshot = applyResult.state.lastCounterSnapshot;
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
                this.currentItem = null;
                logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam advance queue exhausted');
                return null;
            }
            const cardWithNextDues = await this.maybeAddNextDues(pending);
            this.currentItem = cardWithNextDues;
            return cardWithNextDues;
        }

        const result = await this.submitNeuralRoamAdvance({
            queueType: 'neural-roam',
            sessionId: null,
            currentItem: this.currentItem ? this.toNeuralRoamAdvanceItem(this.currentItem) : null,
            feedback: null,
        });
        return this.consumeNeuralRoamAdvanceResult(result, 'next');
    }

    private async handleNeuralRoamAdvanceFeedback(
        activeItem: FSRSCard,
        feedback: QueueFeedback,
    ): Promise<void> {
        if (feedback.action !== 'rate' && feedback.action !== 'skip') {
            this.pushHistory(activeItem, null);
            this.pendingNeuralRoamAdvanceNext = null;
            this.pendingNeuralRoamAdvanceNextReady = false;
            this.currentItem = null;
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
        this.forwardBuffer = [];
        this.pendingRotateCardId = null;
        this.currentItem = null;
        this.pendingNeuralRoamAdvanceNext = result.nextItem
            ? this.fromNeuralRoamAdvanceItem(result.nextItem)
            : null;
        this.pendingNeuralRoamAdvanceNextReady = true;
        this.lastCounterSnapshot = this.toCounterSnapshotFromNeuralRoamAdvance(result);

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
        this.lastCounterSnapshot = this.toCounterSnapshotFromNeuralRoamAdvance(result);
        const outcome = this.neuralRoamAdvanceOutcomePolicy.consume(result);
        if (outcome.kind === 'exhausted') {
            await this.syncNeuralRoamQueueFromBackendState(result);
            this.currentItem = null;
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
        this.currentItem = cardWithNextDues;
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

        this.cachedCards = [...result.cards];
        this.currentIndex = 0;
        this.cacheValid = true;
        this.learnAheadSession = true;
        this.currentItem = null;
        this.pendingRotateCardId = null;
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
        return this.sessionExcludedCardIds.size > 0 || this.sessionExcludedLogicalKeys.size > 0;
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

    private addUnavailableItemSessionExclusion(card: FSRSCard): void {
        const normalizedCardId = this.normalizeCardId(card.id);
        if (normalizedCardId) {
            this.sessionExcludedCardIds.add(normalizedCardId);
        }
        for (const logicalKey of this.buildSessionExclusionLogicalKeys(card)) {
            this.sessionExcludedLogicalKeys.add(logicalKey);
        }
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
            if (this.queueType === QueueType.NeuralRoam && !this.isProjectionBackedQueue()) {
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
            throw this.createQueueCountUnavailableError('remaining size read', error);
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

        return this.refreshQueueCounterSnapshot('counter snapshot read');
    }

    private async refreshQueueCounterSnapshot(operation: string): Promise<QueueCounterSnapshot | null> {
        if (typeof this.queue.getCounterSnapshot !== 'function') {
            return null;
        }

        try {
            const snapshot = await this.queue.getCounterSnapshot();
            this.lastCounterSnapshot = snapshot;
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
            this.cachedCards = this.applySessionExclusions(loadedCards);
            if (this.learnAheadSession && this.learnAheadAdvancePolicy.shouldSupersedeWithNormalQueue(this.cachedCards.length)) {
                this.learnAheadSession = false;
            }
            this.currentIndex = 0;
            this.cacheValid = true;
            const queueCounterSnapshot = await this.refreshQueueCounterSnapshot('reload cards');
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
        const requerySnapshot = this.incrementalRequeryPolicy.serialize({
            cardId: this.avoidOnceCardId,
            blockId: this.avoidOnceBlockId,
        });
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
            deferOnceCardId: requerySnapshot.deferOnceCardId,
            avoidOnceCardId: requerySnapshot.avoidOnceCardId,
            avoidOnceBlockId: requerySnapshot.avoidOnceBlockId,
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
        const requeryIdentity = this.incrementalRequeryPolicy.restore(snapshot);
        this.avoidOnceCardId = requeryIdentity.cardId;
        this.avoidOnceBlockId = requeryIdentity.blockId;
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
        this.pendingNeuralRoamAdvanceNext = null;
        this.pendingNeuralRoamAdvanceNextReady = false;
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
