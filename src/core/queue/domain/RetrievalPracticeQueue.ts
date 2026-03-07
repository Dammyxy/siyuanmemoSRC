﻿/**
 * Retrieval Practice Queue
 * 检索练习队列
 * 
 * 动态队列，自动获取到期的项目卡片，支持手动添加卡片。
 * 
 * 核心功能：
 * - 自动包含所有到期的项目卡片（item、concept、descriptor）
 * - 支持手动添加未到期卡片
 * - 按到期日期和优先级排序
 * - 评分 3/4 移除卡片，1/2 保留并添加到最终训练
 * - 持久化手动添加的卡片列表
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { ManualCardCollectionQueue } from './ManualCardCollectionQueue';
import { QueueAddSource, QueueType } from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { AutoFailedCardSinkPort, QueuePersistencePort } from './ports';
import { NOOP_AUTO_FAILED_CARD_SINK, NOOP_QUEUE_PERSISTENCE } from './ports';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { getCurrentDayEnd, getTodayRange } from '../../../utils/dateUtils';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RetrievalPracticeQueue');

/**
 * 检索练习队列类
 * 
 * 动态队列，自动获取到期的项目卡片。
 * 
 * 队列行为：
 * - 自动包含所有到期的项目卡片（cardType === 'item' | 'concept' | 'descriptor'）
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 评分 3/4：更新到期日期，从队列移除
 * - 评分 1/2：保持今天到期，保留在队列中，自动添加到最终训练
 * 
 * @see 需求 5.1, 5.4, 7.1, 7.2, 9.1
 */
export class RetrievalPracticeQueue extends ManualCardCollectionQueue {
    public name = 'RetrievalPracticeQueue';
    private static readonly MANUAL_PREFETCH_THRESHOLD = 32;
    private readonly autoFailedSink: AutoFailedCardSinkPort;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(
        manager: UnifiedDataSourceManager,
        queuePersistence?: QueuePersistencePort,
        options: { autoFailedSink?: AutoFailedCardSinkPort } = {}
    ) {
        super(manager, QueueType.RetrievalPractice, {
            queuePersistence: queuePersistence ?? NOOP_QUEUE_PERSISTENCE,
            storageKey: 'retrievalPracticeQueue',
            persistenceContext: 'RetrievalPracticeQueue',
        });

        this.autoFailedSink = options.autoFailedSink ?? NOOP_AUTO_FAILED_CARD_SINK;
        if (!queuePersistence) {
            logger.warn('QueuePersistencePort not provided. Retrieval manual additions will not persist.');
        }
        if (!options.autoFailedSink) {
            logger.warn('AutoFailedCardSinkPort not provided. Failed reviews will not be escalated.');
        }
    }

    async load(): Promise<void> {
        this.logManualCardStateLoad(logger);
    }

    async save(): Promise<void> {
        await this.logManualCardStateSave(logger);
    }
    
    /**
     * 判断是否为动态队列
     * 
     * 检索练习队列是动态队列，自动获取到期卡片。
     * 
     * @returns true（动态队列）
     * @see 需求 5.1
     */
    public isDynamic(): boolean {
        return true;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 获取所有到期的项目卡片（cardType === 'item' | 'descriptor', due <= now）
     * 2. 获取手动添加的卡片
     * 3. 合并并去重
     * 4. 过滤临时黑名单中的卡片
     * 5. 按到期日期和优先级排序
     * 6. 应用自定义排序（如果存在）
     * 
     * 注意：不包括 concept 卡片，因为它们使用 A-Factor 调度器。
     * 
     * @returns 卡片数组
     * @see 需求 5.1, 5.4, 15.1, 15.4
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            // 🔧 修复：使用 getCurrentDayEnd() 获取今天的结束时间
            const dayStartHour = this.getDayStartHour();
            const dayEnd = getCurrentDayEnd(dayStartHour);
            const now = Date.now();
            
            logger.debug(`Using dayStartHour=${dayStartHour}, dayEnd=${new Date(dayEnd).toISOString()}, now=${new Date(now).toISOString()}`);
            await this.ensureInitialLoad();

            const baseCards = await this.manager.getCards({
                cardType: ['item', 'descriptor'],
                dueDate: { lte: new Date(dayEnd) }
            });
            const manualCount = this.manualCards.size();
            let manualCards: FSRSCard[] = [];
            if (manualCount > 0) {
                if (manualCount > RetrievalPracticeQueue.MANUAL_PREFETCH_THRESHOLD) {
                    const cardPool = await this.manager.getCards({ cardType: ['item', 'descriptor'] });
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

            return this.buildOutstandingQueueCards(baseCards, manualCards, {
                logger,
                baseCardsLabel: 'due cards from manager',
                warnInvalidBlockId: true,
                everyNthElement: this.getAddToOutstandingEveryNth(2),
            });
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
        source: QueueAddSource = 'manual'
    ): Promise<void> {
        const { cardId, existingCard } = await this.resolveTargetCardForAdd(card);

        if (source !== 'manual-add-all' && existingCard && this.hasReviewedToday(existingCard)) {
            const message = `卡片 ${cardId} 今日已复习，不能重复加入提取练习队列`;
            logger.info(`[Add to outstanding] Reject card ${cardId}: already reviewed today (source=${source})`);
            throw new Error(message);
        }

        await this.addCardToCollection(cardId, { logger });
        await this.boostPrioritySlightly(existingCard);
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
     * @see 需求 5.5, 12.1
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        await this.removeCardFromCollection(cardIdOrBlockId, { logger });
    }

    public async syncManualMembershipForScheduledCard(card: FSRSCard): Promise<boolean> {
        const dayEnd = getCurrentDayEnd(this.getDayStartHour());
        if (card.due <= dayEnd) {
            return false;
        }

        return this.syncManualMembershipForCard(card, logger);
    }

    protected override async removeCardAfterReview(cardIdOrBlockId: string): Promise<void> {
        await this.removeCardFromCollection(cardIdOrBlockId, {
            logger,
            addToTemporaryBlacklist: false,
        });
    }
    
    /**
     * 处理卡片复习
     * 
     * 使用基类的通用调度器集成方法处理复习。
     * 
     * 复习逻辑：
     * - 调用 SchedulerRouter 更新卡片（应用 FSRS 算法和 learning step）
     * - 根据新的到期日期决定是否从队列移除
     * - 评分 < 3 时自动添加到最终训练队列
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 7.1, 7.2, 7.7, 9.1, 18.2, 18.3
     * @see .kiro/specs/queue-scheduler-separation/requirements.md
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        await this.handleReviewWithAutoFailed(cardId, rating, {
            logger,
            autoFailedSink: this.autoFailedSink,
        });
    }
    
    /**
     * 判断卡片是否应该从队列移除
     * 
     * SuperMemo 风格的手动添加逻辑：
     * - 手动添加的卡片：评分后立即移除（已经提前练习过了）
     * - 普通到期卡片：按基类逻辑判断（due 超过今天或 scheduledDays >= 1）
     * 
     * 设计理念：
     * - 手动添加 = "提前复习"，不改变原有到期时间
     * - 评分会影响 FSRS 参数（stability, difficulty）
     * - 但不会改变原定的复习日期
     * - 评分后从队列移除，避免重复出现
     * 
     * @param card 卡片
     * @returns true 表示应该移除，false 表示保留
     * @see SuperMemo "Add to outstanding" 功能
     * @see H:\project-F\flashcard\资料\supermemo\Add to outstanding - SuperMemo Help.md
     */
    protected shouldRemoveFromQueue(card: FSRSCard): boolean {
        // 手动添加的卡片：评分后立即移除
        if (this.manualCards.has(card.id)) {
            logger.debug(`shouldRemoveFromQueue: Card ${card.id} is manually added, will be removed after review`);
            return true;
        }
        
        // 普通卡片：使用基类逻辑
        return super.shouldRemoveFromQueue(card);
    }

    private async resolveTargetCardForAdd(
        card: FSRSCard | QueueItem | string
    ): Promise<{ cardId: string; existingCard: FSRSCard | null }> {
        const candidateId = resolveCardId(card);
        const byCardId = await this.manager.getCard(candidateId, { silent: true }).catch(() => null);
        if (byCardId) {
            return { cardId: byCardId.id, existingCard: byCardId };
        }

        const byBlockId = await this.manager.getCards({ blockIds: [candidateId] }).catch(() => []);
        const existingCard = byBlockId[0] ?? null;
        if (existingCard) {
            return { cardId: existingCard.id, existingCard };
        }

        return { cardId: candidateId, existingCard: null };
    }

    private hasReviewedToday(card: FSRSCard): boolean {
        const dayStartHour = this.getDayStartHour();
        const today = getTodayRange(dayStartHour);
        const lastReview = Number(card.lastReview ?? 0);
        return Number.isFinite(lastReview) && lastReview >= today.start && lastReview < today.end;
    }

    private async boostPrioritySlightly(card: FSRSCard | null): Promise<void> {
        if (!card) {
            return;
        }

        const currentPriority = Number.isFinite(card.priority) ? Number(card.priority) : 50;
        const boostedPriority = Math.max(0, Math.floor(currentPriority) - 1);
        if (boostedPriority === currentPriority) {
            return;
        }

        try {
            await this.manager.updateCard({
                ...card,
                priority: boostedPriority,
            });
        } catch (error) {
            logger.warn(`[Add to outstanding] Failed to slightly boost priority for card ${card.id}:`, error);
        }
    }

}
