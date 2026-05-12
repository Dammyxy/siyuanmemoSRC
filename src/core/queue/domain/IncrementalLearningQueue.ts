/**
 * Incremental Learning Queue
 * 渐进学习队列
 * 
 * 动态队列，自动获取所有到期卡片（项目卡片和主题卡片）。
 * 
 * 核心功能：
 * - 自动包含所有到期的项目卡片和主题卡片
 * - 支持手动添加未到期卡片
 * - 按到期日期和优先级排序
 * - 评分 3/4 移除卡片，1/2 保留并添加到最终训练
 * - 持久化手动添加的卡片列表
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { ManualCardCollectionQueue } from './ManualCardCollectionQueue';
import {
    QueueAddSource,
    type QueueBulkAddInput,
    type QueueBulkMutationResult,
    QueueReviewResult,
    QueueReviewSchedulingContext,
    QueueType,
    QueueUIConfig,
    ReviewButtonConfig,
} from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { AutoFailedCardSinkPort, QueuePersistencePort } from './ports';
import { NOOP_AUTO_FAILED_CARD_SINK } from './ports';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { getCurrentDayEnd } from '../../../utils/dateUtils';
import { createLogger } from '@/utils/logger';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { SrsV2QueuePolicy } from './SrsV2QueuePolicy';
import { createDependencyUnavailableError } from '../dependencyErrors';

const logger = createLogger('IncrementalLearningQueue');

interface IncrementalLearningQueueOptions {
    autoFailedSink?: AutoFailedCardSinkPort;
}

/**
 * 渐进学习队列类
 * 
 * 动态队列，自动获取所有到期卡片（项目和主题）。
 * 
 * 队列行为：
 * - 自动包含所有到期的卡片（项目和主题）
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 评分 3/4：更新到期日期，从队列移除
 * - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
 * 
 * @see 需求 5.2, 7.3, 7.4, 9.2
 */
export class IncrementalLearningQueue extends ManualCardCollectionQueue {
    public name = 'IncrementalLearningQueue';
    private static readonly MANUAL_PREFETCH_THRESHOLD = 32;
    private readonly autoFailedSink: AutoFailedCardSinkPort;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param queuePersistence 队列持久化服务（依赖注入）
     */
    constructor(
        manager: UnifiedDataSourceManager,
        queuePersistence: QueuePersistencePort,
        options: IncrementalLearningQueueOptions = {}
    ) {
        super(manager, QueueType.IncrementalLearning, {
            queuePersistence,
            storageKey: 'incrementalLearningQueue',
            persistenceContext: 'IncrementalLearningQueue',
        });

        this.autoFailedSink = options.autoFailedSink ?? NOOP_AUTO_FAILED_CARD_SINK;
        if (!options.autoFailedSink) {
            logger.warn('AutoFailedCardSinkPort not provided. Failed reviews will not be escalated.');
        }
        
        // 注意：不在构造函数中调用 load()，由外部调用
        // this.loadManuallyAddedCards();
    }
    
    /**
     * 从持久化服务加载状态
     * 
     * 加载手动添加的卡片 ID 列表。
     * 如果没有保存的数据，初始化为空集合。
     * 
     * @see 需求 4.2, 4.5
     */
    async load(): Promise<void> {
        this.logManualCardStateLoad(logger);
    }
    
    /**
     * 保存状态到持久化服务
     * 
     * 保存手动添加的卡片 ID 列表。
     * 使用键名 "incrementalLearningQueue"。
     * 
     * @see 需求 4.2, 4.5, 4.6
     */
    async save(): Promise<void> {
        await this.logManualCardStateSave(logger);
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns true（动态队列）
     * @see 需求 5.2
     */
    public isDynamic(): boolean {
        return true;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 获取所有到期的卡片（项目和主题）
     * 2. 获取手动添加的卡片
     * 3. 合并并去重
     * 4. 过滤临时黑名单中的卡片
     * 5. 按到期日期和优先级排序
     * 6. 应用自定义排序（如果存在）
     * 
     * @returns 卡片数组
     * @see 需求 5.2, 15.1, 15.4
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            const now = Date.now();
            const dayStartHour = this.getDayStartHour();
            const dayEnd = getCurrentDayEnd(dayStartHour);
            await this.ensureInitialLoad();

            const cardTypeFilter = ['item', 'concept', 'descriptor', 'topic', 'incremental', 'webpage'] as const;
            const baseCards = await this.manager.getCards({
                cardType: [...cardTypeFilter],
                dueDate: { lte: new Date(dayEnd) },
                includeSuspended: false,
            });
            const manualCount = this.manualCards.size();
            let manualCards: FSRSCard[] = [];
            if (manualCount > 0) {
                if (manualCount > IncrementalLearningQueue.MANUAL_PREFETCH_THRESHOLD) {
                    const cardPool = await this.manager.getCards({
                        cardType: [...cardTypeFilter],
                    });
                    manualCards = await this.resolveManuallyAddedCards(logger, {
                        persist: async () => this.save(),
                        cardPool,
                    });
                } else {
                    manualCards = await this.resolveManuallyAddedCards(logger, {
                        persist: async () => this.save(),
                    });
                }
            }

            const orderedCards = SrsV2QueuePolicy.buildIncrementalLearningQueue({
                baseCards,
                manualCards,
                now,
                dayEnd,
                newCardsPerDay: this.getNewCardsPerDay(),
                reviewsPerDay: this.getReviewsPerDay(),
                priorityRandomness: this.getPriorityRandomness(),
                stableSalt: `${this.type}:${dayEnd}`,
                isBlacklisted: (card) => this.temporaryBlacklist.has(card.id) || this.temporaryBlacklist.has(card.blockId),
                isDismissed: isCardDismissed,
            });

            return this.cacheResolvedCards(this.applyCustomOrder(orderedCards), 'reconciled');
        } catch (error) {
            logger.error('Failed to get cards:', error);
            throw error;
        }
    }
    
    /**
     * 添加卡片到队列
     * 
     * 将卡片 ID 添加到手动添加的卡片集合中，并持久化。
     * 支持添加未到期的卡片，用于提前复习。
     * 
     * 如果卡片在临时黑名单中，会自动从黑名单中移除。
     * 
     * @param card 卡片对象、QueueItem 或卡片 ID
     * @see 需求 5.4, 18.1, 18.4, 6.4
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async addCard(
        card: FSRSCard | QueueItem | string,
        _source: QueueAddSource = 'manual'
    ): Promise<void> {
        const { cardId, existingCard } = await this.resolveTargetCardForAdd(card);

        await this.addCardToCollection(cardId, { logger });
        await this.boostPrioritySlightly(existingCard);
    }

    public override async addCards(
        cards: QueueBulkAddInput[],
        _source: QueueAddSource = 'manual'
    ): Promise<QueueBulkMutationResult> {
        const resolvedCards: QueueBulkAddInput[] = [];
        const existingCards: FSRSCard[] = [];
        const failedIds: string[] = [];

        for (const card of cards || []) {
            try {
                const { cardId, existingCard } = await this.resolveTargetCardForAdd(card);
                if (!String(cardId || '').trim()) {
                    failedIds.push('');
                    continue;
                }
                resolvedCards.push(cardId);
                if (existingCard) {
                    existingCards.push(existingCard);
                }
            } catch (error) {
                failedIds.push(this.safeResolveId(card));
                logger.warn('[Add to outstanding] Failed to resolve card for bulk add:', error);
            }
        }

        const result = await this.addCardsToCollection(resolvedCards, { logger });
        await this.boostPrioritiesSlightly(existingCards);

        return {
            attemptedCount: result.attemptedCount + failedIds.length,
            changedCount: result.changedCount,
            failedIds: this.uniqueIds([...result.failedIds, ...failedIds]),
        };
    }
    
    /**
     * 从队列中移除卡片
     * 
     * 移除逻辑：
     * 1. 从手动添加的卡片集合中移除（如果存在）
     * 2. 将卡片 ID 加入临时黑名单
     * 3. 持久化手动添加的卡片列表
     * 
     * 注意：临时黑名单不持久化，关闭浏览器后自动清空。
     * 
     * @param cardIdOrBlockId 卡片 ID 或块 ID
     * @see 需求 5.5, 12.2
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        await this.removeCardFromCollection(cardIdOrBlockId, { logger });
    }

    public override async removeCards(cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult> {
        return this.removeCardsFromCollection(cardIdsOrBlockIds, { logger });
    }

    public async syncManualMembershipForScheduledCard(card: FSRSCard): Promise<boolean> {
        const dayEnd = getCurrentDayEnd(this.getDayStartHour());
        if (card.due <= dayEnd) {
            return false;
        }

        return this.syncManualMembershipForCard(card, logger);
    }

    protected override async removeCardAfterReview(cardIdOrBlockId: string): Promise<void> {
        const { existingCard } = await this.resolveTargetCardForAdd(cardIdOrBlockId);
        if (existingCard) {
            const removed = await this.syncManualMembershipForCard(existingCard, logger, {
                notifyObservers: false,
            });
            if (removed) {
                return;
            }
        }

        await this.removeCardFromCollection(cardIdOrBlockId, {
            logger,
            addToTemporaryBlacklist: false,
        });
    }
    
    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 评分 3/4：使用调度器更新卡片状态，从队列移除
     * - 评分 1/2：使用调度器更新卡片状态，根据新日期决定是否保留，并自动添加到最终训练
     * 
     * 使用基类的 handleReviewWithScheduler() 方法处理调度器集成。
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 7.3, 7.4, 7.7, 9.2, 18.2, 18.3
     * @see .kiro/specs/queue-scheduler-separation/requirements.md
     */
    public async handleReview(cardId: string, rating: number): Promise<QueueReviewResult> {
        return this.handleReviewWithAutoFailed(cardId, rating, {
            logger,
            autoFailedSink: this.autoFailedSink,
            logEscalation: true,
        });
    }

    protected override isCardInActiveWindow(card: FSRSCard, now = Date.now()): boolean {
        if (this.isManualCard(card)) {
            logger.debug(`isCardInActiveWindow: Card ${card.id} is manually added, remove after review`);
            return false;
        }

        const due = Number(card.due);
        if (this.isSrsLearningStep(card)) {
            return due <= now;
        }

        return due <= this.getCurrentDayEnd(this.getDayStartHour(), now);
    }

    public async getLearnAheadCards(): Promise<FSRSCard[]> {
        const now = Date.now();
        const windowMinutes = this.getLearnAheadWindowMinutes();
        const maxCards = this.getLearnAheadMaxCards();
        const windowEnd = now + windowMinutes * 60 * 1000;
        if (windowMinutes <= 0 || maxCards <= 0) {
            return [];
        }

        const baseCards = await this.manager.getCards({
            cardType: ['item', 'descriptor'],
            dueDate: { lte: new Date(windowEnd) },
            includeSuspended: false,
        });

        return SrsV2QueuePolicy.buildLearnAheadQueue({
            baseCards,
            manualCards: [],
            now,
            dayEnd: this.getCurrentDayEnd(this.getDayStartHour(), now),
            windowEnd,
            maxCards,
            newCardsPerDay: this.getNewCardsPerDay(),
            reviewsPerDay: this.getReviewsPerDay(),
            priorityRandomness: this.getPriorityRandomness(),
            stableSalt: `${this.type}:learn-ahead:${windowEnd}`,
            isBlacklisted: (card) => this.temporaryBlacklist.has(card.id) || this.temporaryBlacklist.has(card.blockId),
            isDismissed: isCardDismissed,
        });
    }

    private isManualCard(card: Pick<FSRSCard, 'id' | 'blockId'>): boolean {
        return this.manualCards.has(card.id) || this.manualCards.has(card.blockId);
    }

    public override getReviewSchedulingContext(card: FSRSCard): QueueReviewSchedulingContext | null {
        if (!this.isManualCard(card)) {
            return null;
        }

        const due = Number(card.due);
        if (!Number.isFinite(due) || due <= 0) {
            return null;
        }

        const dayEnd = this.getCurrentDayEnd(this.getDayStartHour());
        if (due <= dayEnd) {
            return null;
        }

        const filteredDefault = this.getFilteredReviewDefault();
        return {
            memoryStateAsOf: due,
            queueMode: filteredDefault === 'reschedule' ? 'filtered-rescheduling' : 'filtered-preview',
            commitPolicy: filteredDefault === 'reschedule' ? 'write-schedule' : 'preview-only',
            isFiltered: true,
            customStudy: true,
            reason: 'manual-early-review',
        };
    }
    
    /**
     * 获取队列 UI 配置
     * 
     * 渐进学习队列使用自定义按钮配置，包括额外的操作按钮。
     * 
     * @returns UI 配置对象
     */
    public getUIConfig(): QueueUIConfig {
        return {
            displayName: '渐进学习',
            buttons: this.getIncrementalLearningButtons(),
            showSkipButton: true,
            showProgressBar: true,
            customClass: 'incremental-learning-queue',
        };
    }
    
    /**
     * 获取渐进学习队列的按钮配置
     * 
     * 包括标准的 4 个评分按钮和额外的操作按钮。
     * 
     * @returns 按钮配置数组
     */
    private getIncrementalLearningButtons(): ReviewButtonConfig[] {
        return [
            { type: 'rating', label: 'Again', value: 1 },
            { type: 'rating', label: 'Hard', value: 2 },
            { type: 'rating', label: 'Good', value: 3 },
            { type: 'rating', label: 'Easy', value: 4 },
            { type: 'action', label: 'Insert', action: 'insert' },
            { type: 'action', label: 'Next', action: 'next' },
        ];
    }

    private async resolveTargetCardForAdd(
        card: FSRSCard | QueueItem | string
    ): Promise<{ cardId: string; existingCard: FSRSCard | null }> {
        const candidateId = resolveCardId(card);
        let byCardId: FSRSCard | null;
        try {
            byCardId = await this.manager.getCard(candidateId, { silent: true });
        } catch (error) {
            throw createDependencyUnavailableError(
                'QUEUE_CARD_LOOKUP_UNAVAILABLE',
                `failed to resolve incremental-learning add target by card id ${candidateId}`,
                error,
            );
        }
        if (byCardId) {
            return { cardId: byCardId.id, existingCard: byCardId };
        }

        let byBlockId: FSRSCard[];
        try {
            byBlockId = await this.manager.getCards({ blockIds: [candidateId] });
        } catch (error) {
            throw createDependencyUnavailableError(
                'QUEUE_CARD_LOOKUP_UNAVAILABLE',
                `failed to resolve incremental-learning add target by block id ${candidateId}`,
                error,
            );
        }
        const existingCard = byBlockId[0] ?? null;
        if (existingCard) {
            return { cardId: existingCard.id, existingCard };
        }

        return { cardId: candidateId, existingCard: null };
    }

    private async boostPrioritySlightly(card: FSRSCard | null): Promise<void> {
        await this.boostPrioritiesSlightly(card ? [card] : []);
    }

    private async boostPrioritiesSlightly(cards: FSRSCard[]): Promise<void> {
        const boostedCards = this.uniqueCards(cards)
            .map((card) => {
                const currentPriority = Number.isFinite(card.priority) ? Number(card.priority) : 50;
                const boostedPriority = Math.max(0, Math.floor(currentPriority) - 1);
                if (boostedPriority === currentPriority) {
                    return null;
                }

                return {
                    ...card,
                    priority: boostedPriority,
                };
            })
            .filter((card): card is FSRSCard => Boolean(card));

        if (boostedCards.length === 0) {
            return;
        }

        try {
            if (typeof this.manager.batchUpdateCards === 'function') {
                await this.manager.batchUpdateCards(boostedCards);
                return;
            }

            for (const card of boostedCards) {
                await this.manager.updateCard(card);
            }
        } catch (error) {
            logger.warn(`[Add to outstanding] Failed to slightly boost priority for ${boostedCards.length} cards:`, error);
        }
    }

    private uniqueCards(cards: FSRSCard[]): FSRSCard[] {
        const map = new Map<string, FSRSCard>();
        for (const card of cards) {
            const id = String(card?.id || '').trim();
            if (id && !map.has(id)) {
                map.set(id, card);
            }
        }
        return Array.from(map.values());
    }

    private uniqueIds(ids: string[]): string[] {
        return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
    }

    private safeResolveId(card: QueueBulkAddInput): string {
        try {
            return String(resolveCardId(card) || '').trim();
        } catch {
            return '';
        }
    }
}
