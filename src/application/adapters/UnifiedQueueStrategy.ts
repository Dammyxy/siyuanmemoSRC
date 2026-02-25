import type { IQueueStrategy, QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { QueueStats, QueueUIConfig } from '@/core/queue/types';
import type { FSRSCard } from '@/types/card';
import type { IReviewQueue } from '@/types/unified-data-source';
import { QueueType } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
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

function formatNextDue(diffMs: number): string {
    if (diffMs < 60 * 1000) {
        return '< 1 min';
    }
    if (diffMs < 60 * 60 * 1000) {
        const minutes = Math.round(diffMs / (60 * 1000));
        return `${minutes} min`;
    }
    if (diffMs < 24 * 60 * 60 * 1000) {
        const hours = Math.round(diffMs / (60 * 60 * 1000));
        return `${hours} h`;
    }
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return `${days} d`;
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
                return card;
            }

            if (this.queueType === QueueType.NeuralRoam) {
                const nextCard = await this.queue.getNextCard();
                if (!nextCard) {
                    logger.info(`[SiYuanMemo][UnifiedQueueStrategy] No more cards from spreading activation`);
                    return null;
                }

                const cardWithNextDues = await this.addNextDues(nextCard);
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card (spreading activation):`, {
                    queueType: this.queueType,
                    cardId: nextCard.id,
                });
                return cardWithNextDues;
            }

            if (!this.cacheValid || this.currentIndex >= this.cachedCards.length) {
                await this.reloadCards();
            }

            if (this.cachedCards.length === 0) {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue is empty: ${this.queueType}`);
                return null;
            }

            const card = this.cachedCards[this.currentIndex++];
            const cardWithNextDues = await this.addNextDues(card);

            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Next card:`, {
                queueType: this.queueType,
                cardId: card.id,
                index: this.currentIndex - 1,
                total: this.cachedCards.length,
                due: new Date(card.due).toISOString(),
                now: new Date(Date.now()).toISOString(),
            });

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
        if (!currentItem) {
            logger.warn(`[SiYuanMemo][UnifiedQueueStrategy] No current item for feedback`);
            return;
        }

        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Processing feedback:`, {
                queueType: this.queueType,
                cardId: currentItem.id,
                action: feedback.action,
                rating: feedback.rating,
            });

            if (feedback.action === 'rate' && feedback.rating) {
                await this.queue.handleReview(currentItem.id, feedback.rating);

                if (this.queueType !== QueueType.FinalDrill) {
                    this.invalidateCache();
                }

                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card rated:`, {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                    rating: feedback.rating,
                });
                return;
            }

            if (feedback.action === 'skip') {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Card skipped:`, {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                });
                return;
            }

            if (feedback.action === 'custom' && feedback.customActionId) {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Custom action:`, {
                    queueType: this.queueType,
                    cardId: currentItem.id,
                    actionId: feedback.customActionId,
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            logger.error(`[SiYuanMemo][UnifiedQueueStrategy] Failed to process feedback:`, {
                queueType: this.queueType,
                cardId: currentItem.id,
                action: feedback.action,
                error: errorMessage,
                stack: errorStack,
            });

            throw new Error(`Failed to process feedback: ${errorMessage}`);
        }
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
            const cards = await this.queue.getCards();
            const now = Date.now();
            const dueToday = cards.filter(c => c.due <= now).length;

            const stats: QueueStats = {
                size: cards.length,
                label: `${dueToday} due`,
                extra: `${cards.length} total`,
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

    async getRemainingSize(): Promise<number> {
        try {
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

    private subscribeToQueueChanges(): void {
        this.eventBus.subscribe('queue.changed', (event) => {
            const queueType = toQueueType((event as { queueType?: unknown })?.queueType);
            if (queueType === this.queueType) {
                logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Queue changed, invalidating cache: ${this.queueType}`);
                this.invalidateCache();
            }
        });
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

    private async reloadCards(): Promise<void> {
        try {
            logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Reloading cards: ${this.queueType}`);

            const startTime = Date.now();
            this.cachedCards = await this.queue.getCards();
            this.currentIndex = 0;
            this.cacheValid = true;
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
        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cache invalidated: ${this.queueType}`);
    }

    getType(): QueueType {
        return this.queueType;
    }

    getUnderlyingQueue(): IReviewQueue {
        return this.queue;
    }

    getCacheStats() {
        return this.cacheManager.getStats();
    }

    cleanup(): void {
        this.queue.unsubscribe(this.cacheManager);
        this.cacheManager.clear();
        logger.info(`[SiYuanMemo][UnifiedQueueStrategy] Cleaned up: ${this.queueType}`);
    }
}
