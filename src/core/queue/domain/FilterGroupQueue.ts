/**
 * Filter Group Queue
 * 过滤组队列
 * 
 * 动态队列，根据过滤条件获取卡片。
 * 
 * 核心功能：
 * - 根据过滤条件自动获取卡片
 * - 支持手动添加未到期卡片
 * - 按稳定默认顺序展示过滤结果
 * - 复习后按当前 filter 决定是否继续留队
 * - 持久化手动添加的卡片列表
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { ManualCardCollectionQueue } from './ManualCardCollectionQueue';
import {
    QueueType,
    CardFilter,
    type QueueBulkAddInput,
    type QueueBulkMutationResult,
    type QueueProjectionReadMode,
    QueueReviewResult,
    type FilterGroupQueueSessionSnapshot,
    type QueueReviewSchedulingContext,
} from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { AutoFailedCardSinkPort, QueuePersistencePort } from './ports';
import { NOOP_AUTO_FAILED_CARD_SINK } from './ports';
import { loadQueueState, saveQueueState } from './queuePersistence';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FilterGroupQueue');
const cardFilterService = new CardFilterService();

function cloneCardFilter(filter: CardFilter): CardFilter {
    try {
        const structuredCloneFn = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
        if (typeof structuredCloneFn === 'function') {
            return structuredCloneFn(filter);
        }
    } catch {}

    try {
        return JSON.parse(JSON.stringify(filter)) as CardFilter;
    } catch {
        return { ...filter };
    }
}

interface FilterGroupQueueOptions {
    autoFailedSink?: AutoFailedCardSinkPort;
}

/**
 * 过滤组队列持久化数据结构
 */
interface FilterGroupQueueData {
    /** 手动添加的卡片 ID 列表 */
    manuallyAddedCards: string[];
    /** 过滤条件 */
    filter: CardFilter;
    /** 临时黑名单 */
    temporaryBlacklist: string[];
}

/**
 * 过滤组队列类
 * 
 * 动态队列，根据过滤条件获取卡片。
 * 
 * 队列行为：
 * - 根据过滤条件自动获取卡片
 * - 支持手动添加卡片（包括未到期卡片）
 * - 手动添加的卡片会被持久化
 * - 复习后是否留队完全由当前过滤条件决定
 * - 显式 remove/blacklist 仍然优先于过滤条件
 * 
 * @see 需求 5.3, 7.5, 7.6, 9.3
 */
export class FilterGroupQueue extends ManualCardCollectionQueue {
    public name = 'FilterGroupQueue';
    /**
     * 持久化存储键
     */
    private readonly STORAGE_KEY = 'filterGroupQueue';
    
    /**
     * 过滤条件
     */
    private cardFilter: CardFilter;
    private readonly autoFailedSink: AutoFailedCardSinkPort;
    private pendingFullRefreshOnRebuild = false;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param queuePersistence 队列持久化服务（依赖注入）
     * @param filter 过滤条件（可选）
     */
    constructor(
        manager: UnifiedDataSourceManager,
        queuePersistence: QueuePersistencePort,
        filter: CardFilter = {},
        options: FilterGroupQueueOptions = {}
    ) {
        super(manager, QueueType.FilterGroup, {
            queuePersistence,
            storageKey: 'filterGroupQueue',
            persistenceContext: 'FilterGroupQueue',
        });

        this.autoFailedSink = options.autoFailedSink ?? NOOP_AUTO_FAILED_CARD_SINK;
        
        // 优先使用传入的过滤条件，否则使用空对象（将在 load() 中加载）
        this.cardFilter = Object.keys(filter).length > 0 ? filter : {};
        
        // 注意：不在构造函数中调用 load()，由外部调用
        // this.loadManuallyAddedCards();
        // this.loadTemporaryBlacklist();
        if (!options.autoFailedSink) {
            logger.warn('AutoFailedCardSinkPort not provided. Failed reviews will not be escalated.');
        }
        
        logger.info('Initialized with filter:', this.cardFilter);
    }
    
    /**
     * 从持久化服务加载状态
     * 
     * 加载手动添加的卡片、过滤条件和临时黑名单。
     * 如果没有保存的数据，初始化为空集合。
     * 
     * @see 需求 4.2, 4.5
     */
    async load(): Promise<void> {
        const { value: data, fromStorage } = loadQueueState<FilterGroupQueueData | null>({
            persistence: this.queuePersistence,
            key: this.STORAGE_KEY,
            initialValue: null,
            validate: (candidate): candidate is FilterGroupQueueData =>
                Boolean(candidate) &&
                typeof candidate === 'object' &&
                Array.isArray((candidate as FilterGroupQueueData).manuallyAddedCards) &&
                Array.isArray((candidate as FilterGroupQueueData).temporaryBlacklist),
            logger,
            context: 'FilterGroupQueue',
        });

        if (!data) {
            this.manualCards.replace([]);
            this.temporaryBlacklist = new Set();
            logger.info('No saved data found, starting with empty sets');
            return;
        }

        this.manualCards.replace(data.manuallyAddedCards);

        if (Object.keys(this.cardFilter).length === 0 && data.filter) {
            this.cardFilter = data.filter;
        }

        this.temporaryBlacklist = new Set(data.temporaryBlacklist);
        if (fromStorage) {
            logger.info(`Loaded ${this.manualCards.size()} manually added cards, ${this.temporaryBlacklist.size} blacklisted cards`);
        }
    }
    
    /**
     * 保存状态到持久化服务
     * 
     * 保存手动添加的卡片、过滤条件和临时黑名单。
     * 使用键名 "filterGroupQueue"。
     * 
     * @see 需求 4.2, 4.5, 4.6
     */
    async save(): Promise<void> {
        const data: FilterGroupQueueData = {
            manuallyAddedCards: this.manualCards.toArray(),
            filter: this.cardFilter,
            temporaryBlacklist: Array.from(this.temporaryBlacklist),
        };

        await saveQueueState({
            persistence: this.queuePersistence,
            key: this.STORAGE_KEY,
            value: data,
            logger,
            context: 'FilterGroupQueue',
        });

        logger.info(`Saved ${data.manuallyAddedCards.length} manually added cards, ${data.temporaryBlacklist.length} blacklisted cards`);
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns true（动态队列）
     * @see 需求 5.3
     */
    public isDynamic(): boolean {
        return true;
    }

    public getProjectionReadMode(): QueueProjectionReadMode {
        return 'backend-projection';
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 获取逻辑：
     * 1. 根据过滤条件获取卡片
     * 2. 获取手动添加的卡片
     * 3. 合并并去重
     * 4. 过滤临时黑名单中的卡片
     * 5. 按稳定默认顺序排序
     * 6. 应用自定义排序（如果存在）
     * 
     * @returns 卡片数组
     * @see 需求 5.3, 15.1, 15.4
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            await this.ensureInitialLoad();
            // 🔍 调试：记录当前过滤条件
            logger.debug('Current cardFilter:', this.cardFilter);
            
            // 根据过滤条件获取卡片
            // ✅ 修复：不强制添加 dueDate 过滤，只使用用户设置的过滤条件
            // 筛选复习队列应该显示所有符合过滤条件的卡片，而不是只显示到期的卡片
            const filteredCards = await this.manager.getCards({
                ...this.cardFilter,
                includeSuspended: false,
            });

            return this.buildDynamicCardsFromBase(filteredCards, {
                logger,
                persist: async () => this.save(),
                baseCardsLabel: 'filtered cards from manager',
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
     */
    public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
        await this.addCardToCollection(card, {
            logger,
            persist: async () => this.save(),
        });
    }

    public override async addCards(cards: QueueBulkAddInput[]): Promise<QueueBulkMutationResult> {
        return this.addCardsToCollection(cards, {
            logger,
            persist: async () => this.save(),
        });
    }
    
    /**
     * 从队列中移除卡片
     * 
     * 移除逻辑：
     * 1. 从手动添加的卡片集合中移除（如果存在）
     * 2. 将卡片 ID 加入临时黑名单
     * 3. 持久化手动添加的卡片列表和临时黑名单
     * 
     * @param cardIdOrBlockId 卡片 ID 或块 ID
     * @see 需求 5.5, 12.2
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        await this.removeCardFromCollection(cardIdOrBlockId, {
            logger,
            persistWhenNotManual: true,
            persist: async () => this.save(),
            persistAfterError: async () => this.save(),
        });
    }

    public override async removeCards(cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult> {
        return this.removeCardsFromCollection(cardIdsOrBlockIds, {
            logger,
            persistWhenNotManual: true,
            persist: async () => this.save(),
            persistAfterError: async () => this.save(),
        });
    }

    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 使用调度器更新卡片状态
     * - 评分 < 3 自动添加到最终训练
     * - 复习后是否留队，按当前 filter 镜像判断，而不是按 today-window 启发式
     * - backend review.feedback 对 filter-group 只接受 filtered-* 模式；到期卡仍是筛选队列写入
     * 
     * 使用基类的 handleReviewWithScheduler() 方法处理调度器集成。
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 7.5, 7.6, 7.7, 9.3, 18.2, 18.3
     * @see .kiro/specs/queue-scheduler-separation/requirements.md
     */
    public async handleReview(cardId: string, rating: number, options?: { commitIdempotencyKey?: string }): Promise<QueueReviewResult> {
        return this.handleReviewWithAutoFailed(cardId, rating, {
            logger,
            autoFailedSink: this.autoFailedSink,
            logEscalation: true,
            commitIdempotencyKey: options?.commitIdempotencyKey,
        });
    }

    public override getReviewSchedulingContext(card: FSRSCard): QueueReviewSchedulingContext | null {
        const due = Number(card.due);
        const isDue = Number.isFinite(due) && due <= this.getCurrentDayEnd(this.getDayStartHour());
        if (isDue) {
            return {
                queueMode: 'filtered-rescheduling',
                commitPolicy: 'write-schedule',
                isFiltered: true,
            };
        }

        const filteredDefault = this.getFilteredReviewDefault();
        return {
            queueMode: filteredDefault === 'reschedule' ? 'filtered-rescheduling' : 'filtered-preview',
            commitPolicy: filteredDefault === 'reschedule' ? 'write-schedule' : 'preview-only',
            isFiltered: true,
            customStudy: true,
        };
    }

    protected override async removeCardAfterReview(cardIdOrBlockId: string): Promise<void> {
        await this.removeCardFromCollection(cardIdOrBlockId, {
            logger,
            addToTemporaryBlacklist: false,
            persist: async () => this.save(),
            persistAfterError: async () => this.save(),
        });
    }

    protected override isCardInActiveWindow(card: FSRSCard, _now = Date.now()): boolean {
        if (this.temporaryBlacklist.has(card.id) || this.temporaryBlacklist.has(card.blockId)) {
            return false;
        }

        return this.matchesCurrentFilter(card);
    }
    
    /**
     * 获取队列大小
     * 
     * 覆盖基类方法，确保返回筛选后的卡片数量。
     * 
     * @returns 筛选后的卡片数量
     */
    public async getSize(): Promise<number> {
        const snapshot = await this.getCounterSnapshot();
        return snapshot.total ?? snapshot.remaining;
    }
    
    /**
     * 设置过滤条件
     * 
     * 更新过滤条件后，下次调用 getCards() 时会使用新的过滤条件。
     * 过滤条件会自动持久化。
     * 
     * @param filter 新的过滤条件
     */
    public async setFilter(filter: CardFilter): Promise<void> {
        await this.ensureInitialLoad();
        this.cardFilter = filter;
        this.invalidateCachedCards();
        this.pendingFullRefreshOnRebuild = true;
        await this.save();
        logger.info('Filter updated and saved:', filter);
    }
    
    /**
     * 获取当前过滤条件
     * 
     * @returns 当前的过滤条件
     */
    public getFilter(): CardFilter {
        return { ...this.cardFilter };
    }

    private matchesCurrentFilter(card: FSRSCard): boolean {
        let filtered: FSRSCard[] = [card];
        const filter: CardFilter = {
            ...this.cardFilter,
            includeSuspended: false,
        };

        if (filter.cardType) {
            const requestedTypes = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
            filtered = cardFilterService.filterByCardTypes(filtered, requestedTypes);
        }

        if (filter.blockIds?.length) {
            filtered = cardFilterService.filterByBlockIds(filtered, filter.blockIds);
        }

        if (filter.scopeDocIds?.length) {
            filtered = cardFilterService.filterByDocIds(filtered, filter.scopeDocIds);
        }

        if (filter.dueDate) {
            filtered = cardFilterService.filterByDueDate(filtered, filter.dueDate);
        }

        if (filter.tags?.length) {
            filtered = cardFilterService.filterByTags(filtered, filter.tags);
        }

        if (filter.priority) {
            filtered = cardFilterService.filterByPriority(filtered, filter.priority);
        }

        if (filter.repetitions) {
            filtered = cardFilterService.filterByRepetitions(filtered, filter.repetitions);
        }

        if (filter.lapses) {
            filtered = cardFilterService.filterByLapses(filtered, filter.lapses);
        }

        if (filter.interval) {
            filtered = cardFilterService.filterByInterval(filtered, filter.interval);
        }

        if (filter.lastReview) {
            filtered = cardFilterService.filterByLastReview(filtered, filter.lastReview);
        }

        if (filter.difficulty) {
            filtered = cardFilterService.filterByDifficulty(filtered, filter.difficulty);
        }

        if (filter.stability) {
            filtered = cardFilterService.filterByStability(filtered, filter.stability);
        }

        if (filter.retrievability) {
            filtered = cardFilterService.filterByRetrievability(filtered, filter.retrievability);
        }

        if (filter.cardStatus?.length) {
            filtered = cardFilterService.filterByCardStatus(filtered, filter.cardStatus);
        }

        if (filter.keyword?.trim()) {
            filtered = cardFilterService.filterByKeyword(filtered, filter.keyword.trim());
        }

        if (filter.includeSuspended === false) {
            filtered = filtered.filter((candidate) => !isCardDismissed(candidate));
        }

        return filtered.length > 0;
    }

    public serializeSessionSnapshot(): FilterGroupQueueSessionSnapshot {
        return {
            filter: cloneCardFilter(this.cardFilter),
            rollbackSnapshot: {
                temporaryBlacklist: Array.from(this.temporaryBlacklist),
                customOrder: this.customOrder ? [...this.customOrder] : null,
                manualCards: this.manualCards.toArray(),
            },
            visibleCardIds: this.cardsTrusted
                ? this.cards
                    .map((card) => String(card.id || '').trim())
                    .filter(Boolean)
                : undefined,
        };
    }

    public restoreSessionSnapshot(snapshot: FilterGroupQueueSessionSnapshot): void {
        const rollbackSnapshot = snapshot?.rollbackSnapshot;
        const visibleCardIds = Array.isArray(snapshot?.visibleCardIds)
            ? snapshot.visibleCardIds
                .map((id) => String(id || '').trim())
                .filter(Boolean)
            : [];

        this.cardFilter = cloneCardFilter(snapshot?.filter ?? {});
        this.temporaryBlacklist = new Set(
            Array.isArray(rollbackSnapshot?.temporaryBlacklist)
                ? rollbackSnapshot.temporaryBlacklist.map((id) => String(id || '').trim()).filter(Boolean)
                : [],
        );
        this.manualCards.replace(
            Array.isArray(rollbackSnapshot?.manualCards)
                ? rollbackSnapshot.manualCards.map((id) => String(id || '').trim()).filter(Boolean)
                : [],
        );
        this.customOrder = visibleCardIds.length > 0
            ? visibleCardIds
            : Array.isArray(rollbackSnapshot?.customOrder)
                ? rollbackSnapshot.customOrder.map((id) => String(id || '').trim()).filter(Boolean)
                : null;
        this.markInitialLoadCompleted();
        this.cards = [];
        this.cardsTrusted = false;
        this.invalidateCachedCards();
        this.clearSizeCache();
        logger.info('Filter-group transfer session restored', {
            filterKeys: Object.keys(this.cardFilter),
            temporaryBlacklistSize: this.temporaryBlacklist.size,
            manualCardCount: this.manualCards.size(),
            customOrderSize: this.customOrder?.length ?? 0,
        });
    }
    
    /**
     * 重新加载队列（Rebuild）
     * 
     * 使用当前保存的过滤条件重新构建可见集合：
     * - 使用当前保存的过滤条件重新加载卡片
     * - 清除显式 remove 留下的临时黑名单
     * - 触发观察者通知
     * 
     * 使用场景：
     * - 想恢复被显式隐藏的卡片
     * - 修改过滤条件后重新加载
     * 
     * @see Anki Filtered Decks - Rebuild button
     */
    public async rebuild(): Promise<void> {
        try {
            await this.ensureInitialLoad();
            logger.info('Rebuilding queue with filter:', this.cardFilter);
            const requiresFullRefresh = this.pendingFullRefreshOnRebuild;
            
            // 清除临时黑名单（重新开始）
            this.temporaryBlacklist.clear();
            this.invalidateCachedCards();
            await this.save();
            
            // 触发观察者通知，让 UI 重新加载数据
            this.emitQueueChangedEvent({
                requiresFullRefresh,
            });
            this.pendingFullRefreshOnRebuild = false;
            
            logger.info('Queue rebuilt successfully');
        } catch (error) {
            logger.error('Failed to rebuild queue:', error);
            throw error;
        }
    }
    
    /**
     * 清除临时黑名单（覆盖基类方法）
     * 
     * 清除内存中的黑名单，并持久化。
     */
    public async clearTemporaryBlacklist(): Promise<void> {
        await this.ensureInitialLoad();
        super.clearTemporaryBlacklist();
        try {
            await this.save();
            logger.info('Temporary blacklist cleared and saved');
        } catch (error) {
            logger.error('Failed to clear temporary blacklist:', error);
        }
    }
}
