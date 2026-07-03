import {
    QueueItemUnavailableError,
    type IQueueStrategy,
    type QueueFeedback,
} from '@/core/queue/abstraction/Strategy';
import type { QueueStats, QueueUIConfig } from '@/core/queue/types';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { DataChangeEvent, IDataSourceObserver, IReviewQueue, QueueCounterSnapshot, QueueReviewResult, QueueReviewSchedulingContext, NeuralEngineMode, NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import type { ReviewQueueSessionSnapshot } from '@/types/review-tab';
import { QueueType } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import { isHideCurrentInScopeCommandId } from '@/core/queue/abstraction/customActionIds';
import { shouldReadQueueLocally } from '@/core/queue/domain/queueProjectionReadPolicy';
import { formatNextDue } from '@/application/helpers/formatNextDue';
import type { CdfCurrentReviewDuplicateOutcome } from '@/core/card/cdf-live-relation';
import type { ISchedulerRouter } from '../interfaces/ISchedulerRouter';
import { CacheManagerObserver } from '../observers/CacheManagerObserver';
import {
    type ProjectionPatchOutcome,
    type QueueReviewResultWithProjection,
} from './ReviewSessionProjectionApplier';
import {
    NeuralRoamAdvanceOutcomePolicy,
    NeuralRoamAdvanceCoordinator,
    ReviewCurrentItemCommand,
    ReviewFeedbackAdvancementCoordinator,
    ReviewFeedbackCompensationPolicy,
    ReviewLearnAheadAdvancePolicy,
    ReviewSessionCursor,
    ReviewSessionProjectionAdvancePolicy,
    ReviewTransactionRuntime,
    SrsV2SessionQueueRuntime,
    type ReviewSessionAnswerCommand,
    type ReviewSessionCommandAuthority,
    type ReviewSessionQueueResult,
    type ReviewTransaction,
} from './review-session';
import { resolveEffectiveSchedulerTypeForCard } from '@/core/scheduler/schedulerPolicy';
import { buildSchedulerPreviewSnapshotKey } from '@/core/scheduler/schedulerStateSnapshot';
import { createLogger } from '@/utils/logger';
import type {
    BackendNeuralRoamAdvanceRequest,
    BackendNeuralRoamAdvanceResult,
    BackendNeuralRoamCommandResult,
    BackendNeuralRoamCommandRequest,
    BackendNeuralRoamStartFromFocusRequest,
    BackendNeuralRoamViewState,
} from '../../../packages/contracts/src/backend-rpc';

const logger = createLogger('UnifiedQueueStrategy');

type RatingValue = 1 | 2 | 3 | 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SUSPICIOUS_HISTORY_DAYS = 7;
const REVIEW_FEEDBACK_STEP_SLOW_MS = 500;

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

type FeedbackMutationContext = {
    queueType: QueueType;
    cardId: string;
    action: QueueFeedback['action'];
    rating?: number;
};

type ReviewSessionAuthorityRuntime = {
    getMode?: () => 'writer' | 'follower' | string;
    getInstanceId?: () => string;
    ensureWritable?: () => Promise<void>;
};

type ReviewSessionAuthorityContext = {
    getFrontendInstanceRuntime?: () => ReviewSessionAuthorityRuntime | null | undefined;
};

type CdfLiveRelationReviewOpenRefresher = {
    refreshCdfLiveRelationOnOpen: (card: FSRSCard | string) => Promise<{
        updatedCard?: FSRSCard | null;
        currentReviewDuplicateOutcome?: CdfCurrentReviewDuplicateOutcome | null;
    }>;
};

type ReviewSessionAuthorityManager = UnifiedDataSourceManager & {
    resolvePluginContext?: () => ReviewSessionAuthorityContext | null | undefined;
};

type NeuralRoamAdvanceManager = UnifiedDataSourceManager & {
    neuralRoamAdvance?: (request: BackendNeuralRoamAdvanceRequest) => Promise<BackendNeuralRoamAdvanceResult>;
    neuralRoamCommand?: (request: BackendNeuralRoamCommandRequest) => Promise<BackendNeuralRoamCommandResult>;
};

type NeuralRoamBackendStateSyncQueue = IReviewQueue & {
    syncFromBackendState?: (state: Record<string, unknown>) => Promise<void>;
    setBackendViewState?: (viewState: BackendNeuralRoamViewState | null) => void;
};

type NeuralRoamRouteSwitchQueue = IReviewQueue & {
    switchRoute?: (routeId: string) => Promise<unknown>;
    getActiveRouteId?: () => string | null;
    getEngineMode?: () => NeuralEngineMode | string;
    syncActiveRouteState?: () => Promise<void>;
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

function isQueueProjectionNotReadyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === 'QUEUE_PROJECTION_NOT_READY') {
        return true;
    }
    if (typeof candidate.message === 'string' && candidate.message.includes('QUEUE_PROJECTION_NOT_READY')) {
        return true;
    }
    return candidate.cause !== undefined && isQueueProjectionNotReadyError(candidate.cause);
}

function resolveNeuralRoamBatchSnapshot(queue: IReviewQueue): NeuralRoamBatchSnapshot | null {
    const candidate = queue as Partial<IReviewQueue & {
        getCurrentBatchSnapshot: () => NeuralRoamBatchSnapshot | null;
    }>;
    if (typeof candidate.getCurrentBatchSnapshot !== 'function') {
        return null;
    }
    return candidate.getCurrentBatchSnapshot();
}

export class UnifiedQueueStrategy implements IQueueStrategy<FSRSCard>, IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    private schedulerRouter: ISchedulerRouter | null;
    private queue: IReviewQueue;
    private queueType: QueueType;
    private cacheManager: CacheManagerObserver;
    private readonly cursor: ReviewSessionCursor;
    private readonly currentItemCommand = new ReviewCurrentItemCommand();
    private readonly transactionRuntime: ReviewTransactionRuntime;
    private managerObserverRegistered = false;
    private feedbackMutation: FeedbackMutationContext | null = null;
    private readonly suspiciousNextDuesLogKeys = new Set<string>();
    private learnAheadSession = false;
    private readonly projectionAdvancePolicy: ReviewSessionProjectionAdvancePolicy;
    private readonly feedbackCompensationPolicy = new ReviewFeedbackCompensationPolicy();
    private readonly learnAheadAdvancePolicy = new ReviewLearnAheadAdvancePolicy();
    private readonly neuralRoamAdvanceOutcomePolicy = new NeuralRoamAdvanceOutcomePolicy();
    private readonly feedbackAdvancement: ReviewFeedbackAdvancementCoordinator;
    private readonly neuralRoamAdvance: NeuralRoamAdvanceCoordinator;
    private readonly srsV2SessionQueueRuntime: SrsV2SessionQueueRuntime | null;
    private pendingSrsV2NextCard: FSRSCard | null | undefined;
    private pendingSrsV2CounterSnapshot: QueueCounterSnapshot | null = null;
    private lastNeuralRoamViewState: BackendNeuralRoamViewState | null = null;

    constructor(
        queueTypeOrQueue: QueueType | IReviewQueue,
        manager: UnifiedDataSourceManager,
        _eventBus: EventBus,
        schedulerRouter: ISchedulerRouter | null = null,
        private readonly cdfLiveRelationReviewOpenRefresher: CdfLiveRelationReviewOpenRefresher | null = null
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
            debugMode: false,
        });
        this.projectionAdvancePolicy = new ReviewSessionProjectionAdvancePolicy({
            shouldReadLocally: () => shouldReadQueueLocally(this.queue),
            hydrateCardsBySnapshotIds: (rowIds) => this.queue.getCardsBySnapshotIds(rowIds),
        });
        this.feedbackAdvancement = new ReviewFeedbackAdvancementCoordinator({
            queueType: this.queueType,
            cursor: this.cursor,
            currentItem: this.currentItemCommand,
            learnAheadAdvancePolicy: this.learnAheadAdvancePolicy,
            applyProjectionQueueImpact: (reviewedCard, result, options) => this.applyProjectionQueueImpactToCache(reviewedCard, result, options),
            refreshLocalCounterSnapshot: (source, baseSnapshot) => this.refreshLocalCounterSnapshot(source, baseSnapshot),
            invalidateCache: () => this.invalidateCache(),
        });
        this.transactionRuntime = new ReviewTransactionRuntime({
            queueType: this.queueType,
            queue: this.queue,
            manager: this.manager,
            cursor: this.cursor,
            getCurrentItem: () => this.currentItem,
            invalidateCache: () => this.invalidateCache(),
            refreshRestoredItem: (item) => this.maybeAddNextDues(item),
        });
        this.neuralRoamAdvance = new NeuralRoamAdvanceCoordinator({
            cursor: this.cursor,
            currentItem: this.currentItemCommand,
            outcomePolicy: this.neuralRoamAdvanceOutcomePolicy,
            submitAdvance: (request) => this.submitNeuralRoamAdvance(request),
            syncFromBackendState: (result) => this.syncNeuralRoamQueueFromBackendState(result),
            applyUnavailableItem: (card) => this.feedbackAdvancement.applyUnavailableItem(card),
            pushHistory: (item, transaction) => this.recordReviewHistory(item, transaction),
            addNextDues: (card) => this.maybeAddNextDues(card),
        });
        this.srsV2SessionQueueRuntime = this.shouldUseSrsV2SessionRuntime()
            ? new SrsV2SessionQueueRuntime({
                queueType: this.queueType,
                queue: this.queue,
                commandAuthority: this.createSrsV2CommandAuthority(),
            })
            : null;

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
                const replayCardWithNextDues = await this.prepareSelectedReviewCard(replayCard);
                if (!replayCardWithNextDues) {
                    return await this.next();
                }
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
                const refreshedCard = await this.prepareSelectedReviewCard(card);
                if (!refreshedCard) {
                    return await this.next();
                }
                this.setCurrentItem(refreshedCard);
                return refreshedCard;
            }

            if (this.queueType === QueueType.NeuralRoam) {
                return await this.nextFromNeuralRoamAdvance();
            }

            if (this.srsV2SessionQueueRuntime && !this.learnAheadSession) {
                if (this.pendingSrsV2NextCard !== undefined) {
                    const pending = this.pendingSrsV2NextCard;
                    this.pendingSrsV2NextCard = undefined;
                    if (!pending) {
                        this.clearCurrentItem();
                        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Runtime-backed queue exhausted: ${this.queueType}`);
                        return null;
                    }
                    const cardWithNextDues = await this.prepareSelectedReviewCard(pending);
                    if (!cardWithNextDues) {
                        return await this.next();
                    }
                    this.srsV2SessionQueueRuntime.replaceCurrentCard?.(cardWithNextDues);
                    this.setCurrentItem(cardWithNextDues);
                    this.syncCursorFromSrsV2Runtime();
                    if (this.pendingSrsV2CounterSnapshot) {
                        this.cursor.counterSnapshot = this.cloneCounterSnapshot(this.pendingSrsV2CounterSnapshot);
                    }
                    return cardWithNextDues;
                }

                const card = await this.srsV2SessionQueueRuntime.next();
                if (!card) {
                    this.clearCurrentItem();
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Runtime-backed queue is empty: ${this.queueType}`);
                    return null;
                }
                const cardWithNextDues = await this.prepareSelectedReviewCard(card);
                if (!cardWithNextDues) {
                    return await this.next();
                }
                this.srsV2SessionQueueRuntime.replaceCurrentCard?.(cardWithNextDues);
                this.setCurrentItem(cardWithNextDues);
                this.syncCursorFromSrsV2Runtime();
                return cardWithNextDues;
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
            const cardWithNextDues = await this.prepareSelectedReviewCard(next.card);
            if (!cardWithNextDues) {
                return await this.next();
            }

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
            if (this.queueType === QueueType.NeuralRoam) {
                await this.handleNeuralRoamAdvanceFeedback(activeItem, feedback);
                return;
            }

            if (this.srsV2SessionQueueRuntime && !this.learnAheadSession && (feedback.action === 'rate' || feedback.action === 'skip')) {
                activeTransaction = await this.measureReviewFeedbackStep(
                    'transaction-capture',
                    activeItem,
                    feedback,
                    () => this.createReviewTransaction(activeItem, feedback, {
                        includeCardSnapshot: feedback.action === 'rate',
                    })
                );
                const result = await this.measureReviewFeedbackStep(
                    'session-runtime-answer',
                    activeItem,
                    feedback,
                    () => this.withFeedbackMutation(activeItem, feedback, () => this.srsV2SessionQueueRuntime!.answerAndAdvance({
                        card: activeItem,
                        feedback,
                    }))
                );
                if (result.status === 'conflict') {
                    this.pendingSrsV2NextCard = activeItem;
                    throw new Error(`REVIEW_SESSION_RUNTIME_CONFLICT: ${result.reason ?? 'answer rejected'}`);
                }
                if (result.status === 'unavailable') {
                    const runtimeUnavailable = new Error(result.reason ?? 'answer unavailable');
                    if (!this.isUnavailableCurrentItemError(runtimeUnavailable, activeItem)) {
                        this.pendingSrsV2NextCard = activeItem;
                    }
                    throw new Error(`REVIEW_SESSION_RUNTIME_UNAVAILABLE: ${result.reason ?? 'answer unavailable'}`);
                }
                this.pendingSrsV2NextCard = result.nextCard;
                this.syncCursorFromSrsV2Runtime();
                this.cursor.counterSnapshot = this.cloneCounterSnapshot(result.counterSnapshot);
                this.pendingSrsV2CounterSnapshot = this.cloneCounterSnapshot(result.counterSnapshot);
                this.recordReviewHistory(activeItem, activeTransaction);
                activeTransactionPushed = true;
                activeTransaction = null;
                activeTransactionPushed = false;
                return;
            }

            if (feedback.action === 'rate' && feedback.rating) {
                activeTransaction = await this.createReviewTransaction(activeItem, feedback);
                this.cursor.clearForward();
                const reviewResult = await this.handleReviewWithFeedbackContext(activeItem, feedback);
                this.recordReviewHistory(activeItem, activeTransaction);
                activeTransactionPushed = true;
                const advancement = await this.feedbackAdvancement.applyRateResult({
                    activeItem,
                    feedback,
                    reviewResult,
                    learnAheadSession: this.learnAheadSession,
                });

                if (advancement.kind === 'learn-ahead') {
                    this.learnAheadSession = advancement.learnAheadSession ?? false;
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

                if (advancement.kind === 'requery') {
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

                if (advancement.kind === 'projection-patched') {
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated with projection queueImpact patch:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        rating: feedback.rating,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
                }
                if (advancement.kind === 'projection-refresh-required') {
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated with projection refresh requirement:`, {
                        queueType: this.queueType,
                        cardId: activeItem.id,
                        rating: feedback.rating,
                    });
                    activeTransaction = null;
                    activeTransactionPushed = false;
                    return;
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
                this.recordReviewHistory(activeItem, activeTransaction);
                activeTransactionPushed = true;
                const advancement = this.feedbackAdvancement.applySkipResult(activeItem);
                if (advancement.kind === 'requery') {
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
                await this.refreshQueueCounterSnapshot('skip');
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
                    this.recordReviewHistory(activeItem, activeTransaction);
                    activeTransactionPushed = true;
                    this.feedbackAdvancement.applyHideCurrentInScopeResult(activeItem);
                    await this.refreshQueueCounterSnapshot('hide current in scope');
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

                this.recordReviewHistory(activeItem, null);
                this.feedbackAdvancement.applyCustomSessionOnlyResult();
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
                this.srsV2SessionQueueRuntime?.discardCard(activeItem);
                this.syncCursorFromSrsV2Runtime();
                this.feedbackAdvancement.applyUnavailableItem(activeItem);
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
            throw new Error(`Failed to process feedback: ${errorMessage}`);
        }
    }

    async hydrateCurrentItem(card: FSRSCard | null): Promise<FSRSCard | null> {
        if (!card) {
            return null;
        }

        const displayHydratedCard = await this.hydrateNeuralRoamVirtualDocumentCard(card);
        const authorityCard = await this.resolveAuthoritativeCurrentItem(displayHydratedCard);
        if (!authorityCard) {
            this.feedbackAdvancement.applyUnavailableItem(displayHydratedCard);
            logger.warn(`[SiYuanMemo][UnifiedQueueStrategy] Restored current queue item is no longer available:`, {
                queueType: this.queueType,
                cardId: displayHydratedCard.id,
                blockId: displayHydratedCard.blockId,
            });
            return await this.next();
        }

        const currentCard = await this.hydrateNeuralRoamVirtualDocumentCard(authorityCard);
        if (!this.shouldComputeNextDues(currentCard)) {
            this.srsV2SessionQueueRuntime?.replaceCurrentCard?.(currentCard);
            this.setCurrentItem(currentCard);
            return currentCard;
        }

        const cardWithNextDues = await this.addNextDues(currentCard);
        this.srsV2SessionQueueRuntime?.replaceCurrentCard?.(cardWithNextDues);
        this.setCurrentItem(cardWithNextDues);
        return cardWithNextDues;
    }

    private async resolveAuthoritativeCurrentItem(card: FSRSCard): Promise<FSRSCard | null> {
        if (this.queueType === QueueType.NeuralRoam) {
            return card;
        }

        try {
            const byCardId = await this.manager.getCard(card.id, { silent: true });
            if (byCardId) {
                return this.cloneCard(byCardId);
            }
        } catch (error) {
            if (!this.isUnavailableCurrentItemError(error, card)) {
                throw error;
            }
        }

        const blockId = String(card.blockId || card.id || '').trim();
        if (!blockId) {
            return null;
        }

        try {
            const byBlockId = await this.manager.getCards({ blockIds: [blockId] });
            if (byBlockId.length > 0) {
                return this.cloneCard(byBlockId[0]);
            }
            return null;
        } catch (error) {
            if (this.isUnavailableCurrentItemError(error, card)) {
                return null;
            }
            throw error;
        }
    }

    private async hydrateNeuralRoamVirtualDocumentCard(card: FSRSCard): Promise<FSRSCard> {
        if (this.queueType !== QueueType.NeuralRoam) {
            return card;
        }

        const meta = isRecord(card.meta) ? card.meta : {};
        const neuralContext = isRecord(meta.neuralContext) ? meta.neuralContext : null;
        if (neuralContext?.isFlashcard !== false) {
            return card;
        }

        if (meta.isDocument === true || meta.blockType === 'd') {
            return card;
        }

        const blockId = String(card.blockId || card.id || '').trim();
        if (!blockId) {
            return card;
        }

        const contentResults = await this.manager.getBlockContentsWithType([blockId]);
        const contentResult = contentResults.get(blockId);
        if (!contentResult || contentResult.isDocument !== true || contentResult.type !== 'd') {
            return card;
        }

        return {
            ...card,
            meta: {
                ...meta,
                content: contentResult.content || '',
                blockType: contentResult.type,
                isDocument: true,
            },
        };
    }

    canGoBack(): boolean {
        return this.transactionRuntime.canGoBack();
    }

    async goBack(currentItem: FSRSCard | null): Promise<FSRSCard | null> {
        this.cursor.clearPendingRotation();
        this.clearAvoidOnceIdentity();
        const activeItem = this.currentItemCommand.resolveActive(currentItem);
        if (!this.transactionRuntime.canGoBack()) {
            return activeItem;
        }

        const goBackResult = await this.transactionRuntime.goBack(activeItem);
        if (!goBackResult) {
            return activeItem;
        }

        if (goBackResult.forwardItem && !this.srsV2SessionQueueRuntime) {
            this.pushForwardItem(goBackResult.forwardItem);
        }

        const previousWithNextDues = await this.maybeAddNextDues(goBackResult.previous);
        if (this.srsV2SessionQueueRuntime) {
            const runtimeUndo = this.srsV2SessionQueueRuntime.restoreAfterGoBack({
                previous: previousWithNextDues,
                forward: goBackResult.forwardItem,
            });
            if (!runtimeUndo) {
                this.srsV2SessionQueueRuntime.restoreReviewedCardToLearning(previousWithNextDues);
            }
            this.pendingSrsV2NextCard = undefined;
            this.syncCursorFromSrsV2Runtime();
        }
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
            if (this.queueType === QueueType.NeuralRoam) {
                if (this.lastNeuralRoamViewState) {
                    const progress = this.lastNeuralRoamViewState.batchProgress;
                    const stats: QueueStats = {
                        size: progress.viewedCount,
                        label: `${this.lastNeuralRoamViewState.engineMode === 'hyperspace' ? '深度' : '已看'} ${progress.viewedCount}`,
                        extra: `${this.lastNeuralRoamViewState.engineMode === 'hyperspace' ? '最大深度' : '本轮总数'} ${progress.totalCount}`,
                    };
                    return stats;
                }
                const batch = resolveNeuralRoamBatchSnapshot(this.queue);
                if (batch) {
                    const viewed = Math.max(0, Math.floor(Number(batch.viewedCount) || 0));
                    const total = Math.max(0, Math.floor(Number(batch.roundSize) || 0));
                    const label = batch.engineMode === 'hyperspace'
                        ? '深度'
                        : '已看';
                    const scope = batch.engineMode === 'hyperspace'
                        ? '最大深度'
                        : '本轮总数';
                    const stats: QueueStats = {
                        size: viewed,
                        label: `${label} ${viewed}`,
                        extra: `${scope} ${total}`,
                    };
                    return stats;
                }

                if (!this.isProjectionBackedQueue()) {
                    if (this.cursor.counterSnapshot) {
                        const stats = this.formatStatsFromCounterSnapshot(this.cursor.counterSnapshot);
                        return stats;
                    }
                    const size = await this.queue.getSize();
                    const stats: QueueStats = {
                        size,
                        label: `${size} due`,
                        extra: `${size} total`,
                    };

                    return stats;
                }
            }

            const counterSnapshot = await this.getCounterSnapshot();
            if (counterSnapshot) {
                const stats = this.formatStatsFromCounterSnapshot(counterSnapshot);

                return stats;
            }

            const { size, dueToday } = this.calculateStatsFromCards(this.cursor.cached(), Date.now());

            const stats: QueueStats = {
                size,
                label: `${dueToday} due`,
                extra: `${size} total`,
            };

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

    private shouldUseSrsV2SessionRuntime(): boolean {
        return this.queueType === QueueType.IncrementalLearning
            || this.queueType === QueueType.RetrievalPractice;
    }

    private createSrsV2CommandAuthority(): ReviewSessionCommandAuthority | null {
        return {
            answerAndAdvance: async (input, localExecute) => {
                const runtime = this.resolveReviewSessionAuthorityContext()?.getFrontendInstanceRuntime?.() ?? null;
                if (!runtime || typeof runtime.getMode !== 'function') {
                    return localExecute();
                }

                if (runtime.getMode() === 'follower') {
                    if (typeof runtime.ensureWritable === 'function') {
                        try {
                            await runtime.ensureWritable();
                        } catch (error) {
                            logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Runtime session writer acquire failed before answer:', {
                                queueType: this.queueType,
                                cardId: input.card.id,
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                    }

                    if (runtime.getMode() === 'writer') {
                        return localExecute();
                    }

                    return this.buildReviewSessionRuntimeUnavailable(
                        input,
                        'writer-unavailable',
                        'REVIEW_SESSION_RUNTIME_UNAVAILABLE: writer authority required for review session queue mutation',
                    );
                }

                if (typeof runtime.ensureWritable === 'function') {
                    await runtime.ensureWritable();
                    if (runtime.getMode() === 'follower') {
                        return this.buildReviewSessionRuntimeUnavailable(
                            input,
                            'writer-unavailable',
                            'REVIEW_SESSION_RUNTIME_UNAVAILABLE: writer authority lost before local session mutation',
                        );
                    }
                }

                return localExecute();
            },
            assertLocalSessionMutation: (operation) => {
                const runtime = this.resolveReviewSessionAuthorityContext()?.getFrontendInstanceRuntime?.() ?? null;
                if (runtime?.getMode?.() === 'follower') {
                    throw new Error(`REVIEW_SESSION_RUNTIME_UNAVAILABLE: writer authority required for ${operation}`);
                }
            },
        };
    }

    private resolveReviewSessionAuthorityContext(): ReviewSessionAuthorityContext | null {
        return (this.manager as ReviewSessionAuthorityManager).resolvePluginContext?.() ?? null;
    }

    private buildReviewSessionRuntimeUnavailable(
        input: ReviewSessionAnswerCommand,
        reason: string,
        message: string
    ): ReviewSessionQueueResult {
        const counterSnapshot = this.srsV2SessionQueueRuntime?.getCounterSnapshot()
            ?? this.cursor.counterSnapshot
            ?? this.buildCounterSnapshotFromCachedCards('hot', null);
        logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Review session runtime unavailable:', {
            queueType: this.queueType,
            cardId: input.card.id,
            action: input.feedback.action,
            rating: input.feedback.rating,
            reason,
            message,
        });
        return {
            status: 'unavailable',
            nextCard: input.card,
            waitingUntil: null,
            counterSnapshot,
            undoToken: null,
            reason: message,
        };
    }

    private syncCursorFromSrsV2Runtime(): void {
        if (!this.srsV2SessionQueueRuntime) {
            return;
        }
        this.cursor.load(this.srsV2SessionQueueRuntime.getSessionCards(), {
            cacheValid: true,
            resetIndex: true,
        });
        this.cursor.counterSnapshot = this.srsV2SessionQueueRuntime.getCounterSnapshot();
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

        const cardWithNextDues = await this.prepareSelectedReviewCard(selection.card);
        if (!cardWithNextDues) {
            return await this.nextFromRequeryQueue();
        }

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

    private async handleReviewWithFeedbackContext(
        activeItem: FSRSCard,
        feedback: QueueFeedback
    ): Promise<QueueReviewResult> {
        return this.withFeedbackMutation(activeItem, feedback, () => this.queue.handleReview(activeItem.id, feedback.rating || 0, {
            commitIdempotencyKey: feedback.commitIdempotencyKey,
        }));
    }

    private async withFeedbackMutation<TResult>(
        activeItem: FSRSCard,
        feedback: QueueFeedback,
        task: () => Promise<TResult>
    ): Promise<TResult> {
        this.feedbackMutation = {
            queueType: this.queueType,
            cardId: activeItem.id,
            action: feedback.action,
            rating: feedback.rating,
        };

        try {
            return await task();
        } finally {
            this.feedbackMutation = null;
        }
    }

    private async measureReviewFeedbackStep<TResult>(
        step: string,
        activeItem: FSRSCard,
        feedback: QueueFeedback,
        task: () => Promise<TResult>
    ): Promise<TResult> {
        const startedAt = Date.now();
        try {
            return await task();
        } finally {
            const durationMs = Date.now() - startedAt;
            if (durationMs >= REVIEW_FEEDBACK_STEP_SLOW_MS) {
                logger.info('[SiYuanMemo][UnifiedQueueStrategy] slow review feedback step', {
                    queueType: this.queueType,
                    step,
                    cardId: activeItem.id,
                    blockId: activeItem.blockId,
                    action: feedback.action,
                    rating: feedback.rating,
                    durationMs,
                });
            }
        }
    }

    private clearAvoidOnceIdentity(): void {
        this.cursor.clearAvoidOnce();
    }

    private async applyProjectionQueueImpactToCache(
        reviewedCard: FSRSCard,
        result: QueueReviewResultWithProjection,
        options: { forceRemove?: boolean } = {}
    ): Promise<ProjectionPatchOutcome> {
        let applyResult: {
            outcome: ProjectionPatchOutcome;
            state: ReturnType<ReviewSessionCursor['projectionState']>;
        };
        try {
            applyResult = await this.projectionAdvancePolicy.advance({
                reviewedCard,
                result,
                forceRemove: options.forceRemove,
                state: this.cursor.projectionState(),
            });
        } catch (error) {
            if (!isQueueProjectionNotReadyError(error)) {
                throw error;
            }
            logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Projection hot patch deferred because projection is refreshing:', {
                queueType: this.queueType,
                cardId: reviewedCard.id,
                error: error instanceof Error ? error.message : String(error),
            });
            this.invalidateCache();
            return 'refresh-required';
        }

        if (applyResult.outcome === 'patched') {
            this.cursor.applyProjectionPatch(applyResult.state);
        }
        return applyResult.outcome;
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
        const boundary = await this.syncAndReadActiveNeuralRoamRouteBoundary();
        this.neuralRoamAdvance.setActiveRouteBoundary(boundary.routeId, boundary.engineMode);
        const outcome = await this.neuralRoamAdvance.next();
        if (!outcome || outcome.kind === 'exhausted') {
            logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam advance queue exhausted');
            return null;
        }
        const displayHydratedCard = await this.hydrateNeuralRoamVirtualDocumentCard(outcome.card);
        if (displayHydratedCard !== outcome.card) {
            this.setCurrentItem(displayHydratedCard);
        }

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Next card (backend NeuralRoam advance):', {
            queueType: this.queueType,
            cardId: displayHydratedCard.id,
            source: outcome.source,
            status: outcome.status,
        });
        return displayHydratedCard;
    }

    public startNeuralRoamFromFocusOnNextAdvance(request: BackendNeuralRoamStartFromFocusRequest | null | undefined): void {
        this.neuralRoamAdvance.startFromFocusOnNextAdvance(request);
    }

    public async switchNeuralRoamRoute(routeId: string): Promise<void> {
        if (this.queueType !== QueueType.NeuralRoam) {
            throw new Error(`Queue ${this.queueType} does not support NeuralRoam route switching`);
        }
        const result = await this.submitNeuralRoamCommand({
            queueType: 'neural-roam',
            command: { type: 'switch-route', routeId },
        });
        if (result.status !== 'ok') {
            throw new Error(`NEURAL_ROAM_ROUTE_UNAVAILABLE: ${result.message}`);
        }
        await this.syncNeuralRoamCommandResult(result);
        this.neuralRoamAdvance.setActiveRouteId(routeId);
        this.transactionRuntime.clear();
        this.feedbackMutation = null;
        this.neuralRoamAdvance.clearRouteBoundaryState();
        this.cacheManager.clear();
        this.invalidateCache();
        logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam route switched and review session boundary cleared:', {
            queueType: this.queueType,
            routeId,
        });
    }

    private async submitNeuralRoamCommand(
        request: BackendNeuralRoamCommandRequest,
    ): Promise<BackendNeuralRoamCommandResult> {
        const manager = this.manager as NeuralRoamAdvanceManager;
        if (typeof manager.neuralRoamCommand !== 'function') {
            throw new Error('NEURAL_ROAM_COMMAND_UNAVAILABLE: manager neural-roam.command contract is unavailable');
        }
        return manager.neuralRoamCommand(request);
    }

    private async syncNeuralRoamCommandResult(result: BackendNeuralRoamCommandResult): Promise<void> {
        if (result.queueState) {
            const queue = this.queue as NeuralRoamBackendStateSyncQueue;
            if (typeof queue.syncFromBackendState === 'function') {
                await queue.syncFromBackendState(result.queueState);
            }
        }
        const queue = this.queue as NeuralRoamBackendStateSyncQueue;
        queue.setBackendViewState?.(result.viewState ?? null);
        this.lastNeuralRoamViewState = result.viewState ?? null;
    }

    private async handleNeuralRoamAdvanceFeedback(
        activeItem: FSRSCard,
        feedback: QueueFeedback,
    ): Promise<void> {
        const boundary = await this.syncAndReadActiveNeuralRoamRouteBoundary();
        this.neuralRoamAdvance.setActiveRouteBoundary(boundary.routeId, boundary.engineMode);
        const outcome = await this.neuralRoamAdvance.handleFeedback(activeItem, feedback);
        if (outcome.kind === 'session-only') {
            logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam custom feedback handled as session-only action:', {
                queueType: this.queueType,
                cardId: activeItem.id,
                action: outcome.action,
                customActionId: outcome.customActionId,
            });
            return;
        }

        logger.info('[SiYuanMemo][UnifiedQueueStrategy] NeuralRoam feedback advanced through backend contract:', {
            queueType: this.queueType,
            cardId: activeItem.id,
            action: feedback.action,
            rating: feedback.rating,
            status: outcome.status,
            nextCardId: outcome.nextCardId,
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

    async learnAhead(): Promise<boolean> {
        const queue = this.queue as IReviewQueue & {
            getLearnAheadCards?: () => Promise<FSRSCard[]>;
        };
        if (typeof queue.getLearnAheadCards !== 'function') {
            return false;
        }

        const result = await this.learnAheadAdvancePolicy.startAfterNormalExhaustion({
            getNormalRemaining: () => this.getVisibleNormalRemainingForLearnAhead(),
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

    private async getVisibleNormalRemainingForLearnAhead(): Promise<number> {
        if (this.cursor.valid) {
            return this.cursor.remainingFromCache();
        }
        return this.queue.getRemainingSize();
    }

    private async syncNeuralRoamQueueFromBackendState(result: BackendNeuralRoamAdvanceResult): Promise<void> {
        this.lastNeuralRoamViewState = result.viewState ?? null;
        if (!result.queueState) {
            throw new Error('NEURAL_ROAM_QUEUE_SYNC_UNAVAILABLE: backend queue state is missing');
        }
        const queue = this.queue as NeuralRoamBackendStateSyncQueue;
        if (typeof queue.syncFromBackendState !== 'function') {
            throw new Error('NEURAL_ROAM_QUEUE_SYNC_UNAVAILABLE: local NeuralRoam queue sync contract is unavailable');
        }
        await queue.syncFromBackendState(result.queueState);
        queue.setBackendViewState?.(result.viewState ?? null);
        this.neuralRoamAdvance.setActiveRouteId(result.routeId ?? result.sessionState.routeId ?? this.readActiveNeuralRoamRouteId());
    }

    private readActiveNeuralRoamRouteId(): string | null {
        if (this.queueType !== QueueType.NeuralRoam) {
            return null;
        }
        const queue = this.queue as NeuralRoamRouteSwitchQueue;
        const routeId = typeof queue.getActiveRouteId === 'function' ? queue.getActiveRouteId() : null;
        return String(routeId || '').trim() || null;
    }

    private readActiveNeuralRoamEngineMode(): NeuralEngineMode | null {
        if (this.queueType !== QueueType.NeuralRoam) {
            return null;
        }
        const queue = this.queue as NeuralRoamRouteSwitchQueue;
        const engineMode = typeof queue.getEngineMode === 'function' ? queue.getEngineMode() : null;
        return engineMode === 'orbit' || engineMode === 'hyperspace' ? engineMode : null;
    }

    private async syncAndReadActiveNeuralRoamRouteBoundary(): Promise<{
        routeId: string | null;
        engineMode: NeuralEngineMode | null;
    }> {
        if (this.queueType !== QueueType.NeuralRoam) {
            return { routeId: null, engineMode: null };
        }
        const queue = this.queue as NeuralRoamRouteSwitchQueue;
        if (typeof queue.syncActiveRouteState === 'function') {
            await queue.syncActiveRouteState();
        }
        return {
            routeId: this.readActiveNeuralRoamRouteId(),
            engineMode: this.readActiveNeuralRoamEngineMode(),
        };
    }

    private hasSessionExclusions(): boolean {
        return this.cursor.hasSessionExclusions();
    }

    private clearSessionExcludedCardIds(): void {
        this.cursor.clearSessionExcludedCardIds();
    }

    private removeSessionExcludedCardIds(cardIds: Array<string | null | undefined>): number {
        return this.cursor.removeSessionExcludedCardIds(cardIds);
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
        const appendedCount = this.srsV2SessionQueueRuntime?.appendCardsToTail(cards)
            ?? this.cursor.appendCardsToTail(cards);
        if (appendedCount === 0) {
            return 0;
        }

        if (this.srsV2SessionQueueRuntime) {
            this.syncCursorFromSrsV2Runtime();
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
                if (this.cursor.counterSnapshot) {
                    return this.cursor.counterSnapshot.remaining;
                }
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

    private formatStatsFromCounterSnapshot(counterSnapshot: QueueCounterSnapshot): QueueStats {
        const extraParts = [
            counterSnapshot.currentLearningDue != null ? `${counterSnapshot.currentLearningDue} learning now` : null,
            counterSnapshot.todayReviewDue != null ? `${counterSnapshot.todayReviewDue} review today` : null,
            counterSnapshot.allowedNew != null ? `${counterSnapshot.allowedNew} new` : null,
            counterSnapshot.learnAheadAvailable ? `${counterSnapshot.learnAheadAvailable} learn ahead` : null,
        ].filter(Boolean);
        return {
            size: counterSnapshot.remaining,
            label: `${counterSnapshot.due} due`,
            extra: extraParts.length > 0
                ? extraParts.join(' · ')
                : `${counterSnapshot.total ?? counterSnapshot.remaining} total`,
        };
    }

    async getCounterSnapshot(): Promise<QueueCounterSnapshot | null> {
        if (this.srsV2SessionQueueRuntime) {
            if (this.pendingSrsV2CounterSnapshot) {
                return this.cloneCounterSnapshot(this.pendingSrsV2CounterSnapshot);
            }
            const runtimeSnapshot = this.srsV2SessionQueueRuntime.getCounterSnapshot();
            if (runtimeSnapshot) {
                this.cursor.counterSnapshot = runtimeSnapshot;
                return this.cloneCounterSnapshot(runtimeSnapshot);
            }
        }

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
            if (isQueueProjectionNotReadyError(error)) {
                try {
                    const snapshot = await this.queue.getCounterSnapshot(true);
                    this.cursor.counterSnapshot = snapshot;
                    logger.info('[SiYuanMemo][UnifiedQueueStrategy] Queue counter snapshot recovered after forced projection refresh:', {
                        queueType: this.queueType,
                        operation,
                    });
                    return snapshot ? this.cloneCounterSnapshot(snapshot) : null;
                } catch (refreshError) {
                    logger.error('[SiYuanMemo][UnifiedQueueStrategy] QUEUE_COUNT_UNAVAILABLE: forced projection refresh failed:', {
                        queueType: this.queueType,
                        operation,
                        error: refreshError instanceof Error ? refreshError.message : String(refreshError),
                    });
                    throw this.createQueueCountUnavailableError(operation, refreshError);
                }
            }
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
                return;
            }

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
        if (!this.feedbackMutation) {
            return false;
        }

        if (this.feedbackMutation.queueType !== this.queueType) {
            return false;
        }

        return this.eventAffectsCurrentQueue(queueType);
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
        const normalizedMessage = message.toLowerCase();
        const hasMissingCardSignal = normalizedMessage.includes('card not found')
            || normalizedMessage.includes('block not found')
            || normalizedMessage.includes('review.feedback card not found')
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
        const result = await this.refreshCdfLiveRelationOnReviewOpen(card);
        const refreshedCard = result.updatedCard ?? card;
        if (!this.shouldComputeNextDues(refreshedCard)) {
            return refreshedCard;
        }
        return this.addNextDues(refreshedCard);
    }

    private async prepareSelectedReviewCard(card: FSRSCard): Promise<CardWithNextDues | null> {
        const result = await this.refreshCdfLiveRelationOnReviewOpen(card);
        if (this.shouldExitCurrentCdfDuplicate(card, result.currentReviewDuplicateOutcome ?? null)) {
            this.discardCurrentCdfDuplicateWithoutScoring(card, result.currentReviewDuplicateOutcome!);
            return null;
        }

        const refreshedCard = result.updatedCard ?? card;
        if (!this.shouldComputeNextDues(refreshedCard)) {
            return refreshedCard;
        }
        return this.addNextDues(refreshedCard);
    }

    private async refreshCdfLiveRelationOnReviewOpen(card: FSRSCard): Promise<{
        updatedCard?: FSRSCard | null;
        currentReviewDuplicateOutcome?: CdfCurrentReviewDuplicateOutcome | null;
    }> {
        if (!this.cdfLiveRelationReviewOpenRefresher) {
            return {};
        }
        return this.cdfLiveRelationReviewOpenRefresher.refreshCdfLiveRelationOnOpen(card);
    }

    private shouldExitCurrentCdfDuplicate(
        card: FSRSCard,
        outcome: CdfCurrentReviewDuplicateOutcome | null
    ): boolean {
        return outcome?.kind === 'current-noncanonical-exits'
            && outcome.cardId === card.id;
    }

    private discardCurrentCdfDuplicateWithoutScoring(
        card: FSRSCard,
        outcome: CdfCurrentReviewDuplicateOutcome
    ): void {
        this.feedbackAdvancement.applyUnavailableItem(card);
        this.srsV2SessionQueueRuntime?.discardCard(card);
        this.syncCursorFromSrsV2Runtime();
        this.pendingSrsV2NextCard = undefined;
        this.pendingSrsV2CounterSnapshot = this.srsV2SessionQueueRuntime?.getCounterSnapshot() ?? null;
        logger.info('[SiYuanMemo][UnifiedQueueStrategy] Current CDF duplicate exited without scoring:', {
            queueType: this.queueType,
            cardId: card.id,
            blockId: card.blockId,
            relationKey: outcome.relationKey,
            canonicalCardId: outcome.canonicalCardId,
        });
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
    }

    private recordReviewHistory(item: FSRSCard, transaction: ReviewTransaction | null): void {
        this.transactionRuntime.record(item, transaction);
    }

    private discardFailedHistoryEntry(item: FSRSCard, transaction: ReviewTransaction): void {
        this.transactionRuntime.discardFailedEntry(item, transaction);
    }

    private pushForwardItem(card: FSRSCard): void {
        this.cursor.pushForward(card);
    }

    private async createReviewTransaction(
        currentItem: FSRSCard,
        feedback: QueueFeedback,
        options: { includeCardSnapshot?: boolean } = {}
    ): Promise<ReviewTransaction> {
        return this.transactionRuntime.capture(currentItem, feedback, options);
    }

    private shouldHandleHideCurrentInScope(currentItem: FSRSCard, actionId: string): boolean {
        if (this.queueType !== QueueType.FilterGroup || !isHideCurrentInScopeCommandId(actionId)) {
            return false;
        }

        const cardType = String(currentItem.type || '').trim();
        return cardType === 'topic' || cardType === 'concept';
    }

    private async compensateFailedFeedback(activeItem: FSRSCard, transaction: ReviewTransaction | null): Promise<void> {
        const restoredWithNextDues = await this.transactionRuntime.compensateFailedFeedback(activeItem, transaction);
        this.feedbackAdvancement.applyFailedFeedbackCompensation(restoredWithNextDues);
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
        this.srsV2SessionQueueRuntime?.restoreFromSnapshot({
            cards: Array.isArray(snapshot.cachedCards) ? snapshot.cachedCards : [],
            currentCard: restored.currentItem,
            avoidCardId: snapshot.avoidOnceCardId ?? snapshot.deferOnceCardId ?? null,
            avoidBlockId: snapshot.avoidOnceBlockId ?? null,
            counterSnapshot: snapshot.lastCounterSnapshot ?? null,
        });
        const lastCounterSnapshot = this.cursor.counterSnapshot;
        if (this.hasSessionExclusions() && lastCounterSnapshot) {
            this.refreshLocalCounterSnapshot('hot', lastCounterSnapshot);
        }
        this.transactionRuntime.clear();
    }

    getType(): QueueType {
        return this.queueType;
    }

    getUnderlyingQueue(): IReviewQueue {
        return this.queue;
    }

    resetSessionState(): void {
        this.transactionRuntime.clear();
        this.feedbackMutation = null;
        this.pendingSrsV2NextCard = undefined;
        this.pendingSrsV2CounterSnapshot = null;
        this.srsV2SessionQueueRuntime?.reset();
        this.clearCurrentItem();
        this.neuralRoamAdvance.reset();
        this.lastNeuralRoamViewState = null;
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
