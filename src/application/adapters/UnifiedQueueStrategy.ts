import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { QueueStats, QueueUIConfig } from '@/core/queue/types';
import type { FSRSCard } from '@/types/card';
import type { IReviewQueue, QueueCounterSnapshot, QueueReviewResult } from '@/types/unified-data-source';
import type { ReviewQueueSessionSnapshot } from '@/types/review-tab';
import { QueueType, isDynamicQueueType } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import { formatNextDue } from '@/application/helpers/formatNextDue';
import type { ISchedulerRouter } from '../interfaces/ISchedulerRouter';
import { CacheManagerObserver } from '../observers/CacheManagerObserver';
import { createLogger } from '@/utils/logger';

const logger = createLogger('UnifiedQueueStrategy');

type RatingValue = 1 | 2 | 3 | 4;

type CardWithNextDues = FSRSCard & {
    nextDues?: Partial<Record<RatingValue, string>>;
};

type QueueWithInsertAt = IReviewQueue & {
    insertAt: (cardId: string, position: number) => Promise<void>;
};

type SchedulerPreviewRouter = ISchedulerRouter & {
    preview: (card: FSRSCard) => Map<number, FSRSCard>;
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
};

type ReviewHistoryEntry = {
    item: FSRSCard;
    transaction: ReviewTransaction | null;
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

export class UnifiedQueueStrategy implements IQueueStrategy<FSRSCard> {
    private manager: UnifiedDataSourceManager;
    private eventBus: EventBus;
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
    private readonly maxHistorySize = 100;
    private lastCounterSnapshot: QueueCounterSnapshot | null = null;
    private queueChangedHandler: ((event: unknown) => void) | null = null;

    constructor(
        queueTypeOrQueue: QueueType | IReviewQueue,
        manager: UnifiedDataSourceManager,
        eventBus: EventBus,
        schedulerRouter: ISchedulerRouter | null = null
    ) {
        this.manager = manager;
        this.eventBus = eventBus;
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

        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Processing feedback:`, {
                queueType: this.queueType,
                cardId: activeItem.id,
                action: feedback.action,
                rating: feedback.rating,
            });

            if (feedback.action === 'rate' && feedback.rating) {
                const transaction = await this.createReviewTransaction(activeItem, feedback);
                this.forwardBuffer = [];
                const reviewResult = await this.queue.handleReview(activeItem.id, feedback.rating);
                this.pushHistory(activeItem, transaction);
                this.currentItem = null;
                if (reviewResult.counterSnapshot) {
                    this.lastCounterSnapshot = reviewResult.counterSnapshot;
                } else {
                    this.lastCounterSnapshot = null;
                }

                const patched = this.applyReviewResultToCache(activeItem, reviewResult);
                if (this.shouldRotateAfterLowRating(feedback) && reviewResult.remainsInQueue) {
                    this.pendingRotateCardId = activeItem.id;
                    if (patched && this.currentIndex >= this.cachedCards.length && this.cachedCards.length > 0) {
                        this.currentIndex = this.cachedCards.length - 1;
                    }
                } else {
                    this.pendingRotateCardId = null;
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
                return;
            }

            if (feedback.action === 'skip') {
                const transaction = await this.createReviewTransaction(activeItem, feedback, {
                    includeCardSnapshot: false,
                });
                await this.queue.skip(activeItem.id);
                this.pushHistory(activeItem, transaction);
                this.forwardBuffer = [];
                this.currentItem = null;
                this.pendingRotateCardId = null;
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
                return;
            }

            if (feedback.action === 'custom' && feedback.customActionId) {
                this.pushHistory(activeItem, null);
                this.forwardBuffer = [];
                this.currentItem = null;
                this.pendingRotateCardId = null;
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Custom action:`, {
                    queueType: this.queueType,
                    cardId: activeItem.id,
                    actionId: feedback.customActionId,
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to process feedback:`, {
                queueType: this.queueType,
                cardId: activeItem.id,
                action: feedback.action,
                error: errorMessage,
                stack: errorStack,
            });

            this.pendingRotateCardId = null;
            throw new Error(`Failed to process feedback: ${errorMessage}`);
        }
    }

    canGoBack(): boolean {
        return this.historyStack.length > 0;
    }

    async goBack(currentItem: FSRSCard | null): Promise<FSRSCard | null> {
        this.pendingRotateCardId = null;
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

    private supportsHotPatchAfterReview(): boolean {
        return this.queueType === QueueType.RetrievalPractice
            || this.queueType === QueueType.IncrementalLearning
            || this.queueType === QueueType.FilterGroup;
    }

    private applyReviewResultToCache(reviewedCard: FSRSCard, result: QueueReviewResult): boolean {
        if (!this.cacheValid) {
            return false;
        }

        const cachedIndex = this.cachedCards.findIndex((card) =>
            card.id === reviewedCard.id || card.blockId === reviewedCard.blockId,
        );
        if (cachedIndex === -1) {
            return false;
        }

        if (result.removedFromQueue) {
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

        const cachedIndex = this.cachedCards.findIndex((card) => card.id === cardId || card.blockId === cardId);
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
        if (this.lastCounterSnapshot) {
            return {
                ...this.lastCounterSnapshot,
                buckets: {
                    ...this.lastCounterSnapshot.buckets,
                },
            };
        }

        if (typeof this.queue.getCounterSnapshot !== 'function') {
            return null;
        }

        try {
            const snapshot = await this.queue.getCounterSnapshot();
            this.lastCounterSnapshot = snapshot;
            return {
                ...snapshot,
                buckets: {
                    ...snapshot.buckets,
                },
            };
        } catch (error) {
            logger.warn('[SiYuanMemo][UnifiedQueueStrategy] Failed to read queue counter snapshot:', {
                queueType: this.queueType,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    private subscribeToQueueChanges(): void {
        this.queueChangedHandler = (event) => {
            const queueType = toQueueType((event as { queueType?: unknown })?.queueType);
            if (queueType === this.queueType) {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue changed, invalidating cache: ${this.queueType}`);
                this.lastCounterSnapshot = null;
                this.invalidateCache();
            }
        };
        this.eventBus.subscribe('queue.changed', this.queueChangedHandler);
    }

    private async addNextDues(card: FSRSCard): Promise<CardWithNextDues> {
        try {
            const cacheKey = `${card.id}-${card.state}-${card.due}-${card.reps}`;
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

            const previews = this.schedulerRouter.preview(card);
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
            this.cachedCards = await this.queue.getCards();
            this.currentIndex = 0;
            this.cacheValid = true;
            this.lastCounterSnapshot = await this.queue.getCounterSnapshot().catch(() => null);
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

    private async rollbackTransaction(transaction: ReviewTransaction): Promise<void> {
        for (const record of transaction.queueSnapshots) {
            if (typeof record.queue.restoreRollbackSnapshot !== 'function') {
                continue;
            }
            await record.queue.restoreRollbackSnapshot(record.snapshot);
        }

        if (transaction.cardBefore) {
            await this.manager.updateCard(this.cloneCard(transaction.cardBefore));
        }

        this.lastCounterSnapshot = null;
        this.invalidateCache();
    }

    private cloneCard(card: FSRSCard): FSRSCard {
        return JSON.parse(JSON.stringify(card)) as FSRSCard;
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
            lastCounterSnapshot: this.lastCounterSnapshot
                ? {
                    ...this.lastCounterSnapshot,
                    buckets: {
                        ...this.lastCounterSnapshot.buckets,
                    },
                }
                : null,
        };
    }

    restoreSessionSnapshot(snapshot: ReviewQueueSessionSnapshot | null | undefined): void {
        if (!snapshot || snapshot.version !== 1 || snapshot.queueType !== this.queueType) {
            return;
        }

        this.cachedCards = Array.isArray(snapshot.cachedCards)
            ? snapshot.cachedCards.map((card) => this.cloneCard(card))
            : [];
        this.currentItem = snapshot.currentItem ? this.cloneCard(snapshot.currentItem) : null;
        this.forwardBuffer = Array.isArray(snapshot.forwardBuffer)
            ? snapshot.forwardBuffer.map((card) => this.cloneCard(card))
            : [];
        this.pendingRotateCardId = typeof snapshot.pendingRotateCardId === 'string'
            ? snapshot.pendingRotateCardId
            : null;
        this.lastCounterSnapshot = snapshot.lastCounterSnapshot
            ? {
                ...snapshot.lastCounterSnapshot,
                buckets: {
                    ...snapshot.lastCounterSnapshot.buckets,
                },
            }
            : null;
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
        if (this.queueChangedHandler) {
            this.eventBus.unsubscribe('queue.changed', this.queueChangedHandler);
            this.queueChangedHandler = null;
        }
        this.cacheManager.clear();
        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cleaned up: ${this.queueType}`);
    }
}
