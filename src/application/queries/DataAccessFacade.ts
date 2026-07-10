/**
 * Data Access Facade
 * 数据访问门面
 * 
 * 提供统一的数据访问接口,封装底层存储细节。
 * 实现 Facade 模式,简化数据访问逻辑。
 * 
 * DDD 架构:
 * - 通过 CardApplicationService 访问数据
 * - 过滤逻辑委托给领域服务
 * - SQL 查询封装在基础设施层
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import {
    IDataRouter,
    CardFilter,
    QueueType,
    ContextMenuOption,
    getAdvancedModeQueueTypes,
    getAdvancedModeContextMenuOptions,
    type BatchCardDeleteResult,
    type BatchCardMutationResult,
    type CardMutationOptions,
} from '../../types/unified-data-source';
import { FSRSCard } from '../../types/card';
import type { Plugin } from 'siyuan';
import type { StorageManager } from '../../core/storage/manager';
import type { CardApplicationService } from '../services/CardApplicationService';
import { CardFilterService } from '../../core/card/domain/services/CardFilterService';
import { BlockRepository } from '../../core/storage/infrastructure/BlockRepository';
import { getCurrentDayEnd } from '../../utils/dateUtils';
import { getDayStartHour } from '../../utils/configUtils';
import { migrateCard } from '../../utils/cardMigration';
import type { QuerySiyuanPort } from '../ports/QuerySiyuanPort';
import {
    createUnavailableHostBlockQueryPort,
    type HostBlockQueryPort,
} from '@/application/ports/HostBlockQueryPort';
import type { CardFilter as QueryCardFilter } from './card/GetCardsQuery';
import {
    isCardDismissed,
} from '@/core/card/domain/services/dismissState';
import { isErr } from '@/types/result';
import { createLogger } from '@/utils/logger';

type BlockContentResult = {
    content: string;
    type: string;
    isDocument: boolean;
};

interface CardContentQueryServiceLike {
    getBlockContentsWithType(blockIds: string[]): Promise<Map<string, BlockContentResult>>;
}

interface DataAccessContextLike {
    getCardContentQueryService?: () => CardContentQueryServiceLike;
    getI18n?: () => Record<string, string>;
    getHybridSyncService?: () => unknown;
}

type DataAccessPlugin = Plugin & {
    getContext?: () => DataAccessContextLike | null;
    i18n?: Record<string, string>;
};

interface SettingsServiceLike {
    getSettings?: () => {
        riffIntegration?: {
            deleteSync?: {
                enabled?: boolean;
            };
        };
    };
}

const logger = createLogger('DataAccessFacade');
const SIYUAN_BLOCK_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/i;

/**
 * DataAccessFacade 类
 * 
 * 数据访问门面,负责:
 * - 从应用服务获取卡片数据
 * - 更新和删除卡片
 * - 显式同步到 Riff(通过 syncToRiff 方法)
 * - 提供可用的队列类型和上下文菜单选项
 * 
 * 采用 Facade 模式,为 UnifiedDataSourceManager 提供简化的数据访问接口。
 * 
 * @see 需求 3.1, 3.2, 3.3, 3.4, 3.5
 */
export class DataAccessFacade implements IDataRouter {
    // ========================================================================
    // 私有属性
    // ========================================================================
    
    /**
     * 卡片应用服务
     * 
     * 用于访问卡片数据的 DDD 应用服务层
     */
    private cardService: CardApplicationService;
    
    /**
     * 卡片过滤服务
     * 
     * 用于过滤卡片的领域服务
     */
    private cardFilterService: CardFilterService;
    
    /**
     * 块数据仓储
     * 
     * 用于查询块数据的基础设施层
     */
    private blockRepository: BlockRepository;
    
    /**
     * 本地存储管理器
     * 
     * 用于访问本地持久化的卡片数据
     * 
     * 注意:仅用于 fillMissingRootIds 中的 setCard 调用
     * 其他地方应该通过 cardService 访问
     */
    private storage: StorageManager;
    
    /**
     * 设置服务
     * 
     * 用于访问插件设置
     */
    private settingsService?: SettingsServiceLike;
    
    /**
     * 插件实例
     * 
     * 用于访问插件配置(如 dayStartHour)
     */
    private plugin?: DataAccessPlugin;
    
    /**
     * ApplicationContext 实例
     * 
     * 用于访问应用服务（如 CardContentQueryService）
     */
    private applicationContext: DataAccessContextLike | null;
    
    /**
     * Riff 同步启用标志
     * 
     * 控制是否自动同步到 Riff(默认不同步)
     * @see 需求 17.2
     */
    private riffSyncEnabled: boolean = false;
    
    // 🚀 性能优化：缓存 getCards() 结果
    private cardsCache: FSRSCard[] | null = null;
    private cardsCacheTimestamp: number = 0;
    private readonly CACHE_TTL = 1000; // 缓存有效期 1 秒
    private readonly committedBackendReviewCardsById = new Map<string, FSRSCard>();
    private readonly committedBackendReviewCardIdsByBlockId = new Map<string, string>();

    private readonly BLOCK_CHECK_BATCH_SIZE = 500;
    private readonly knownMissingBlockIds = new Set<string>();
    private readonly siyuanApi: QuerySiyuanPort;
    private readonly blockQuery: Pick<HostBlockQueryPort, 'getExistingBlockIds'>;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 构造函数
     * 
     * @param cardService 卡片应用服务实例
     * @param storage 本地存储管理器实例(用于 fillMissingRootIds)
     * @param plugin 插件实例(用于访问配置)
     * @param settingsService 设置服务实例(用于访问设置)
     * @param siyuanApi 查询与 Riff due 同步端口
     */
    constructor(
        cardService: CardApplicationService,
        storage: StorageManager,
        plugin: DataAccessPlugin | undefined,
        settingsService: SettingsServiceLike | undefined,
        siyuanApi: QuerySiyuanPort,
        blockQuery?: Pick<HostBlockQueryPort, 'getExistingBlockIds'>
    ) {
        if (!siyuanApi) {
            throw new Error('[SiYuanMemo][DataAccessFacade] QuerySiyuanPort is required');
        }

        this.cardService = cardService;
        this.cardFilterService = new CardFilterService();
        this.blockRepository = new BlockRepository();
        this.storage = storage;
        this.plugin = plugin;
        this.settingsService = settingsService;
        this.siyuanApi = siyuanApi;
        this.blockQuery = blockQuery ?? createUnavailableHostBlockQueryPort('DataAccessFacade was constructed without HostBlockQueryPort');
        this.applicationContext = null;  // 将在 setApplicationContext() 中设置
        
        // 🔍 调试日志：检查 plugin 是否正确传递
        logger.debug('[DataAccessFacade] Constructor called with plugin/context', {
            hasPlugin: !!plugin,
            hasContextProvider: !!plugin?.getContext,
        });
    }
    
    /**
     * 设置 ApplicationContext 引用
     * 
     * 用于访问应用服务（如 CardContentQueryService）
     * 必须在 ApplicationContext 创建完成后调用
     * 
     * @param context ApplicationContext 实例
     */
    setApplicationContext(context: DataAccessContextLike): void {
        this.applicationContext = context;
        logger.debug('[DataAccessFacade] ApplicationContext set');
    }
    
    // ========================================================================
    // 数据访问方法
    // ========================================================================
    
    /**
     * 获取单个卡片
     * 
     * 通过卡片应用服务获取卡片数据。
     * 
     * @param cardId 卡片 ID
     * @param options 可选参数（如 silent: true 避免记录错误日志）
     * @returns 卡片数据
     * @throws Error 如果卡片不存在
     * @see 需求 3.5
     */
    async getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard> {
        void options;
        const overlayCard = this.resolveCommittedBackendReviewCard(cardId);
        const result = overlayCard
            ? { card: overlayCard }
            : await this.cardService.getCard({ cardId });
        
        if (!result.card) {
            throw new Error(`Card not found: ${cardId}`);
        }
        
        const card = migrateCard(result.card as FSRSCard);
        const blockId = String(card.blockId || '').trim();
        if (!blockId) {
            throw new Error(`Card has invalid blockId: ${cardId}`);
        }

        const { missingBlockIds } = await this.collectMissingBlockIds([blockId]);
        if (missingBlockIds.has(blockId)) {
            throw new Error(`Block not found for card ${cardId}: ${blockId}`);
        }
        
        // ✅ 填充缺失的 rootId 和 content
        const needsRootId = !card.meta?.rootId;
        const needsContent = !card.meta?.content || String(card.meta.content).trim() === '';
        
        if (needsRootId || needsContent) {
            await this.fillMissingRootIds([card]);
        }

        return card;
    }
    
    /**
     * 获取卡片列表
     * 
     * 通过卡片应用服务获取卡片列表,支持过滤。
     * 
     * 🆕 自动填充 rootId：
     * - 无论是否使用缓存，都会检查并填充缺失的 rootId
     * - 确保数据源筛选（如文档筛选）能够正常工作
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组（已填充 rootId）
     * @see 需求 3.5
     * @see .kiro/specs/bugfix/browser-document-filter-bug.md
     */
    async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        // 🚀 性能优化：使用缓存避免重复加载
        const now = Date.now();
        const cacheValid = this.cardsCache && (now - this.cardsCacheTimestamp) < this.CACHE_TTL;
        const { prefilter, residual } = this.splitFilter(filter);
        
        let cards: FSRSCard[];
        
        if (cacheValid && !filter) {
            // 使用缓存（仅在无过滤器时）
            logger.debug(`[SiYuanMemo][DataAccessFacade] Using cached cards (${this.cardsCache!.length} cards)`);
            cards = this.cardsCache!;
        } else {
            // 通过 CardApplicationService 获取所有卡片
            const result = await this.cardService.getCards(prefilter ? { filter: prefilter } : {});
            cards = result.cards;
            
            logger.debug(`[SiYuanMemo][DataAccessFacade] getCards() returned ${cards.length} cards`);
            
            // 应用迁移逻辑:确保所有卡片都有 learning_step 字段
            cards = cards.map(card => migrateCard(card));
            cards = this.applyCommittedBackendReviewOverlay(cards, prefilter);
            
            // 缓存写入统一在过滤和补全之后执行
        }
        
        // 🆕 无论是否使用缓存，都检查并填充缺失的 rootId 和 content
        // 这确保了数据源筛选（如文档筛选）能够正常工作
        const beforeValidBlockId = cards.length;
        cards = this.filterValidSiyuanBlockIdCards(cards);
        const invalidBlockCount = beforeValidBlockId - cards.length;
        if (invalidBlockCount > 0) {
            logger.debug(`[SiYuanMemo][DataAccessFacade] Filtered out ${invalidBlockCount} cards with invalid blockId`);
        }

        const { missingBlockIds, uncheckedBlockIds } = await this.collectMissingBlockIds(cards.map((card) => card.blockId));
        const missingBlockIdsToFilter = this.filterMissingBlockIdsWithCompleteSourceMetadata(cards, missingBlockIds);
        if (missingBlockIdsToFilter.size > 0) {
            const beforeMissingFilter = cards.length;
            cards = cards.filter((card) => !missingBlockIdsToFilter.has(card.blockId));
            logger.debug(`[SiYuanMemo][DataAccessFacade] Filtered out ${beforeMissingFilter - cards.length} cards with missing blocks`);
        }
        if (uncheckedBlockIds.size > 0) {
            logger.debug(
                `[SiYuanMemo][DataAccessFacade] Kept ${uncheckedBlockIds.size} block IDs due to block-check fail-open`
            );
        }

        const cardsNeedingData = cards.filter(c => {
            const needsRootId = !c.meta?.rootId;
            const needsContent = !c.meta?.content || String(c.meta.content).trim() === '';
            return needsRootId || needsContent;
        });
        
        if (cardsNeedingData.length > 0) {
            logger.debug(`[SiYuanMemo][DataAccessFacade] Filling missing rootId/content for ${cardsNeedingData.length} cards`);
            await this.fillMissingRootIds(cardsNeedingData);
        }

        if (!filter) {
            this.cardsCache = cards;
            if (!cacheValid) {
                this.cardsCacheTimestamp = now;
            }
            logger.debug(`[SiYuanMemo][DataAccessFacade] Cards cached (${cards.length} cards)`);
        }
        
        // 应用过滤器
        if (residual) {
            logger.debug(`[SiYuanMemo][DataAccessFacade] Applying residual filter:`, residual);
            cards = this.applyFilter(cards, residual);
            logger.debug(`[SiYuanMemo][DataAccessFacade] After applyFilter: ${cards.length} cards`);
        }
        
        // 根层已完成 blockId 与块存在性过滤
        return cards;
    }
    
    /**
     * 🚀 性能优化：失效缓存
     * 在卡片更新/删除后调用
     */
    invalidateCardsCache(): void {
        this.cardsCache = null;
        this.cardsCacheTimestamp = 0;
        logger.debug(`[SiYuanMemo][DataAccessFacade] Cards cache invalidated`);
    }

    async refreshCommittedBackendReviewCard(card: FSRSCard): Promise<void> {
        const normalizedId = String(card?.id || '').trim();
        if (!normalizedId) {
            logger.error('[SiYuanMemo][DataAccessFacade] LOCAL_REVIEW_READ_MODEL_REFRESH_INVALID_CARD: missing card id');
            return;
        }

        const previous = this.committedBackendReviewCardsById.get(normalizedId);
        const previousBlockId = String(previous?.blockId || '').trim();
        if (previousBlockId) {
            this.committedBackendReviewCardIdsByBlockId.delete(previousBlockId);
        }

        const refreshedCard = this.cloneCard(card);
        this.committedBackendReviewCardsById.set(normalizedId, refreshedCard);
        const blockId = String(refreshedCard.blockId || '').trim();
        if (blockId) {
            this.committedBackendReviewCardIdsByBlockId.set(blockId, normalizedId);
        }
        this.invalidateCardsCache();
    }
    
    /**
     * 更新卡片
     * 
     * 高级模式允许完全读写访问，可以更新卡片数据。
     * 通过卡片应用服务更新卡片。
     * 
     * 如果启用了 Riff 同步且卡片使用 Riff 调度器，则自动同步到 Riff。
     * 
     * @param card 要更新的卡片
     * @see 需求 3.4, 17.2, 17.3
     */
    async updateCard(card: FSRSCard, options: CardMutationOptions = {}): Promise<void> {
        // 通过 CardApplicationService 更新卡片
        const result = await this.cardService.batchUpdateCardsWithoutEvents([card], options);

        if (isErr(result)) {
            throw new Error(`Failed to update card ${card.id}: ${result.error}`);
        }

        if (result.value.updatedCount !== 1 || result.value.failedCount !== 0) {
            throw new Error(
                `Failed to fully persist card ${card.id}: updated=${result.value.updatedCount}, failed=${result.value.failedCount}`
            );
        }
        
        // 🚀 性能优化：失效缓存
        this.clearCommittedBackendReviewCard(card.id);
        this.invalidateCardsCache();
        
        // 仅在用户明确选择 Riff 调度器时才同步
        if (this.riffSyncEnabled && card.schedulerType === 'riff') {
            await this.syncToRiff(card.id);
        }
    }

    async batchUpdateCards(
        cards: FSRSCard[],
        options: CardMutationOptions = {},
    ): Promise<BatchCardMutationResult> {
        const cardsToUpdate = this.normalizeCards(cards);
        if (cardsToUpdate.length === 0) {
            return {
                attemptedCount: 0,
                updatedCount: 0,
                updatedCardIds: [],
                failedCardIds: [],
            };
        }

        const result = await this.cardService.batchUpdateCardsWithoutEvents(cardsToUpdate, options);
        if (isErr(result)) {
            throw new Error(`Failed to batch update cards: ${result.error}`);
        }

        const value = result.value;
        const updatedCardIds = value.updatedCardIds.length > 0
            ? value.updatedCardIds
            : cardsToUpdate.slice(0, value.updatedCount).map((card) => card.id);
        const failedCardIds = value.failedCardIds.length > 0
            ? value.failedCardIds
            : cardsToUpdate
                .filter((card) => !updatedCardIds.includes(card.id))
                .map((card) => card.id);

        if (updatedCardIds.length > 0) {
            for (const cardId of updatedCardIds) {
                this.clearCommittedBackendReviewCard(cardId);
            }
            this.invalidateCardsCache();
            await this.syncUpdatedRiffCards(cardsToUpdate, updatedCardIds);
        }

        return {
            attemptedCount: cardsToUpdate.length,
            updatedCount: value.updatedCount,
            updatedCardIds,
            failedCardIds,
        };
    }
    
    /**
     * 删除卡片
     * 
     * 通过卡片应用服务删除卡片。默认只做本地 tombstone，不删除 native Riff。
     * 
     * @param cardId 要删除的卡片 ID
     * @see 需求 3.4
     */
    async deleteCard(cardId: string): Promise<void> {
        // 通过 CardApplicationService 删除卡片
        const result = await this.cardService.deleteFSRSCard({
            cardId
        });
        
        if (isErr(result)) {
            throw new Error(`Failed to delete card ${cardId}: ${result.error}`);
        }
        this.clearCommittedBackendReviewCard(cardId);
        this.invalidateCardsCache();
    }

    async batchDeleteCards(cardIds: string[]): Promise<BatchCardDeleteResult> {
        const normalizedCardIds = this.normalizeIds(cardIds);
        if (normalizedCardIds.length === 0) {
            return {
                attemptedCount: 0,
                deletedCount: 0,
                deletedCardIds: [],
                failedCardIds: [],
            };
        }

        const result = await this.cardService.batchDeleteFSRSCards({
            cardIds: normalizedCardIds,
        });
        if (isErr(result)) {
            throw new Error(`Failed to batch delete cards: ${result.error}`);
        }

        const deletedCardIds = this.normalizeIds(result.value.deletedCardIds);
        for (const cardId of deletedCardIds) {
            this.clearCommittedBackendReviewCard(cardId);
        }
        this.invalidateCardsCache();
        return {
            attemptedCount: normalizedCardIds.length,
            deletedCount: result.value.deletedCount,
            deletedCardIds,
            failedCardIds: this.normalizeIds(result.value.failedCardIds),
        };
    }
    
    // ========================================================================
    // 高级模式特定方法
    // ========================================================================
    
    /**
     * 启用或禁用 Riff 同步
     * 
     * 控制是否在更新卡片时自动同步到 Riff。
     * 
     * @param enabled 是否启用同步
     * @see 需求 17.2
     */
    enableRiffSync(enabled: boolean): void {
        this.riffSyncEnabled = enabled;
    }
    
    /**
     * 同步卡片到 Riff
     * 
     * 显式将卡片的调度数据同步到 Riff API。
     * 这是一个手动操作，通过上下文菜单"同步到 Riff"触发。
     * 
     * 注意：由于 Riff API 限制，目前只能同步 due 字段。
     * 
     * @param cardId 要同步的卡片 ID
     * @see 需求 17.3
     */
    async syncToRiff(cardId: string): Promise<void> {
        const card = await this.getCard(cardId);
        
        // 将 due 时间戳转换为 ISO 字符串
        const dueDate = new Date(card.due).toISOString();
        
        // 使用 Riff API 同步
        await this.siyuanApi.batchSetRiffCardsDueTime([
            { id: cardId, due: dueDate }
        ]);
        
        logger.info(`[SiYuanMemo][AdvancedDataRouter] Synced card ${cardId} to Riff`);
    }

    private async syncUpdatedRiffCards(cards: FSRSCard[], updatedCardIds: string[]): Promise<void> {
        if (!this.riffSyncEnabled || updatedCardIds.length === 0) {
            return;
        }

        const updatedIdSet = new Set(updatedCardIds);
        const dueUpdates = cards
            .filter((card) => updatedIdSet.has(card.id) && card.schedulerType === 'riff')
            .map((card) => ({
                id: card.id,
                due: new Date(card.due).toISOString(),
            }));

        if (dueUpdates.length === 0) {
            return;
        }

        await this.siyuanApi.batchSetRiffCardsDueTime(dueUpdates);
    }
    
    // ========================================================================
    // 模式特定方法
    // ========================================================================
    
    /**
     * 获取当前模式下可用的队列类型
     * 
     * 高级模式提供恰好 5 种队列类型：
     * - 检索练习（RetrievalPractice）
     * - 最终训练（FinalDrill）
     * - 渐进学习（IncrementalLearning）
     * - 过滤组（FilterGroup）
     * - 神经漫游（NeuralRoam）
     * 
     * @returns 队列类型数组
     * @see 需求 3.1
     */
    getAvailableQueueTypes(): QueueType[] {
        return getAdvancedModeQueueTypes();
    }
    
    /**
     * 获取当前模式下的上下文菜单选项
     * 
     * 高级模式提供恰好 7 个上下文菜单选项：
     * - 打开（open）
     * - 删除（delete）
     * - 添加到最终训练（add-to-final-drill）
     * - 切换调度器（switch-scheduler）
     * - 修改卡片类型（modify-card-type）
     * - 设置优先级（set-priority）
     * - 同步到 Riff（sync-to-riff）
     * 
     * @returns 上下文菜单选项数组
     * @see 需求 3.3
     */
    getContextMenuOptions(): ContextMenuOption[] {
        return getAdvancedModeContextMenuOptions(this.getI18nDictionary());
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 应用过滤器
     * 
     * 根据过滤条件过滤卡片列表。
     * 委托给 CardFilterService 处理所有过滤逻辑。
     * 
     * @param cards 卡片数组
     * @param filter 过滤条件
     * @returns 过滤后的卡片数组
     */
    private splitFilter(filter?: CardFilter): { prefilter?: QueryCardFilter; residual?: CardFilter } {
        if (!filter) {
            return {};
        }

        const cardTypes = filter.cardType
            ? (Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType]) as QueryCardFilter['cardTypes']
            : undefined;

        const dueDate = filter.dueDate
            ? {
                lte: filter.dueDate.lte
                    ? new Date(this.getDueDateUpperBound(filter.dueDate.lte))
                    : undefined,
                gte: filter.dueDate.gte
                    ? new Date(this.getDueDateLowerBound(filter.dueDate.gte))
                    : undefined,
            }
            : undefined;

        const prefilter: QueryCardFilter = {
            blockIds: filter.blockIds,
            cardTypes,
            dueDate,
            cardStatus: filter.cardStatus,
        };

        const residual: CardFilter = {
            scopeDocIds: filter.scopeDocIds,
            tags: filter.tags,
            priority: filter.priority,
            repetitions: filter.repetitions,
            lapses: filter.lapses,
            interval: filter.interval,
            lastReview: filter.lastReview,
            difficulty: filter.difficulty,
            stability: filter.stability,
            retrievability: filter.retrievability,
            includeSuspended: filter.includeSuspended,
            keyword: filter.keyword,
        };

        return {
            prefilter: this.hasStructuredPrefilter(prefilter) ? prefilter : undefined,
            residual: this.hasResidualFilter(residual) ? residual : undefined,
        };
    }

    private hasStructuredPrefilter(filter: QueryCardFilter): boolean {
        return !!(
            (filter.blockIds && filter.blockIds.length > 0) ||
            (filter.cardTypes && filter.cardTypes.length > 0) ||
            filter.dueDate ||
            (filter.cardStatus && filter.cardStatus.length > 0)
        );
    }

    private hasResidualFilter(filter: CardFilter): boolean {
        return !!(
            (filter.scopeDocIds && filter.scopeDocIds.length > 0) ||
            (filter.tags && filter.tags.length > 0) ||
            filter.priority ||
            filter.repetitions ||
            filter.lapses ||
            filter.interval ||
            filter.lastReview ||
            filter.difficulty ||
            filter.stability ||
            filter.retrievability ||
            filter.includeSuspended === false ||
            (filter.keyword && filter.keyword.trim())
        );
    }

    private getDueDateUpperBound(_lte: Date): number {
        const dayStartHour = this.plugin ? getDayStartHour(this.plugin) : 4;
        return getCurrentDayEnd(dayStartHour);
    }

    private applyCommittedBackendReviewOverlay(cards: FSRSCard[], filter?: QueryCardFilter): FSRSCard[] {
        if (this.committedBackendReviewCardsById.size === 0) {
            return cards;
        }

        const overlaidCards: FSRSCard[] = [];
        const seenIds = new Set<string>();

        for (const card of cards) {
            const overlay = this.resolveCommittedBackendReviewCard(card.id)
                || this.resolveCommittedBackendReviewCard(card.blockId);
            const candidate = overlay ?? card;
            if (!this.matchesQueryPrefilter(candidate, filter)) {
                continue;
            }
            overlaidCards.push(candidate);
            seenIds.add(String(candidate.id || '').trim());
        }

        for (const overlay of this.committedBackendReviewCardsById.values()) {
            const cardId = String(overlay.id || '').trim();
            if (!cardId || seenIds.has(cardId)) {
                continue;
            }
            if (!this.matchesQueryPrefilter(overlay, filter)) {
                continue;
            }
            overlaidCards.push(this.cloneCard(overlay));
            seenIds.add(cardId);
        }

        return filter?.dueDate
            ? overlaidCards.sort((left, right) => left.due - right.due || left.id.localeCompare(right.id))
            : overlaidCards;
    }

    private resolveCommittedBackendReviewCard(cardIdOrBlockId: unknown): FSRSCard | null {
        const normalized = String(cardIdOrBlockId || '').trim();
        if (!normalized) {
            return null;
        }
        const byId = this.committedBackendReviewCardsById.get(normalized);
        if (byId) {
            return this.cloneCard(byId);
        }
        const cardId = this.committedBackendReviewCardIdsByBlockId.get(normalized);
        const byBlockId = cardId ? this.committedBackendReviewCardsById.get(cardId) : undefined;
        return byBlockId ? this.cloneCard(byBlockId) : null;
    }

    private clearCommittedBackendReviewCard(cardIdOrBlockId: unknown): void {
        const normalized = String(cardIdOrBlockId || '').trim();
        if (!normalized) {
            return;
        }
        const existingById = this.committedBackendReviewCardsById.get(normalized);
        const cardId = existingById
            ? normalized
            : this.committedBackendReviewCardIdsByBlockId.get(normalized);
        if (!cardId) {
            return;
        }
        const existing = this.committedBackendReviewCardsById.get(cardId);
        const blockId = String(existing?.blockId || '').trim();
        this.committedBackendReviewCardsById.delete(cardId);
        if (blockId) {
            this.committedBackendReviewCardIdsByBlockId.delete(blockId);
        }
    }

    private matchesQueryPrefilter(card: FSRSCard, filter?: QueryCardFilter): boolean {
        if (!filter) {
            return true;
        }

        if (filter.blockIds && filter.blockIds.length > 0) {
            const blockIds = new Set(filter.blockIds.map((blockId) => String(blockId || '').trim()).filter(Boolean));
            if (!blockIds.has(String(card.blockId || '').trim()) && !blockIds.has(String(card.id || '').trim())) {
                return false;
            }
        }

        if (filter.cardTypes && filter.cardTypes.length > 0) {
            const cardTypes = new Set(filter.cardTypes.map((type) => String(type || '').trim()).filter(Boolean));
            if (!cardTypes.has(String(card.type || '').trim())) {
                return false;
            }
        }

        if (filter.cardStatus && filter.cardStatus.length > 0) {
            const states = new Set(filter.cardStatus.map((status) => this.toCardStateNumber(status)));
            if (!states.has(Number(card.state))) {
                return false;
            }
        }

        if (filter.dueDate?.lte && card.due > filter.dueDate.lte.getTime()) {
            return false;
        }
        if (filter.dueDate?.gte && card.due < filter.dueDate.gte.getTime()) {
            return false;
        }

        return true;
    }

    private toCardStateNumber(status: NonNullable<QueryCardFilter['cardStatus']>[number]): number {
        switch (status) {
            case 'new':
                return 0;
            case 'learning':
                return 1;
            case 'review':
                return 2;
            case 'relearning':
                return 3;
            default:
                return Number.NaN;
        }
    }

    private cloneCard(card: FSRSCard): FSRSCard {
        return {
            ...card,
            tags: [...(card.tags ?? [])],
            meta: card.meta ? { ...card.meta } : card.meta,
        } as FSRSCard;
    }

    private getDueDateLowerBound(gte: Date): number {
        const next = new Date(gte);
        next.setHours(0, 0, 0, 0);
        return next.getTime();
    }

    /*
    private applyFilter(cards: FSRSCard[], filter: CardFilter): FSRSCard[] {
        let filtered = cards;
        
        // 过滤块 ID
        // 过滤卡片类型
        // 过滤到期日期
            
            // 获取自定义每日刷新时间
        }
        
        // 过滤标签
        if (filter.tags && filter.tags.length > 0) {
            filtered = this.cardFilterService.filterByTags(filtered, filter.tags);
        }
        
        // 过滤优先级
        if (filter.priority) {
            filtered = this.cardFilterService.filterByPriority(filtered, filter.priority);
        }
        
        // 过滤复习次数
        if (filter.repetitions) {
            filtered = this.cardFilterService.filterByRepetitions(filtered, filter.repetitions);
        }
        
        // 过滤遗忘次数
        if (filter.lapses) {
            filtered = this.cardFilterService.filterByLapses(filtered, filter.lapses);
        }
        
        // 过滤间隔天数
        if (filter.interval) {
            filtered = this.cardFilterService.filterByInterval(filtered, filter.interval);
        }
        
        // 过滤上次复习日期
        if (filter.lastReview) {
            filtered = this.cardFilterService.filterByLastReview(filtered, filter.lastReview);
        }
        
        // 过滤难度
        if (filter.difficulty) {
            filtered = this.cardFilterService.filterByDifficulty(filtered, filter.difficulty);
        }
        
        // 过滤稳定性
        if (filter.stability) {
            filtered = this.cardFilterService.filterByStability(filtered, filter.stability);
        }
        
        // 过滤可提取性
        if (filter.retrievability) {
            filtered = this.cardFilterService.filterByRetrievability(filtered, filter.retrievability);
        }
        
        // 过滤卡片状态
        // 过滤关键词
        if (filter.keyword && filter.keyword.trim()) {
            const keyword = filter.keyword.trim();
            logger.debug(`[SiYuanMemo][DataAccessFacade] Filtering by keyword: "${keyword}"`);
            filtered = this.cardFilterService.filterByKeyword(filtered, keyword);
            logger.debug(`[SiYuanMemo][DataAccessFacade] After keyword filter: ${filtered.length} cards`);

        if (filter.includeSuspended === false) {
            filtered = filtered.filter((card) => !isCardDismissed(card));
        }
        
        return filtered;
    }

    */

    private applyFilter(cards: FSRSCard[], filter: CardFilter): FSRSCard[] {
        let filtered = cards;

        if (filter.scopeDocIds && filter.scopeDocIds.length > 0) {
            filtered = this.cardFilterService.filterByDocIds(filtered, filter.scopeDocIds);
        }

        if (filter.tags && filter.tags.length > 0) {
            filtered = this.cardFilterService.filterByTags(filtered, filter.tags);
        }

        if (filter.priority) {
            filtered = this.cardFilterService.filterByPriority(filtered, filter.priority);
        }

        if (filter.repetitions) {
            filtered = this.cardFilterService.filterByRepetitions(filtered, filter.repetitions);
        }

        if (filter.lapses) {
            filtered = this.cardFilterService.filterByLapses(filtered, filter.lapses);
        }

        if (filter.interval) {
            filtered = this.cardFilterService.filterByInterval(filtered, filter.interval);
        }

        if (filter.lastReview) {
            filtered = this.cardFilterService.filterByLastReview(filtered, filter.lastReview);
        }

        if (filter.difficulty) {
            filtered = this.cardFilterService.filterByDifficulty(filtered, filter.difficulty);
        }

        if (filter.stability) {
            filtered = this.cardFilterService.filterByStability(filtered, filter.stability);
        }

        if (filter.retrievability) {
            filtered = this.cardFilterService.filterByRetrievability(filtered, filter.retrievability);
        }

        if (filter.keyword && filter.keyword.trim()) {
            const keyword = filter.keyword.trim();
            logger.debug(`[SiYuanMemo][DataAccessFacade] Filtering by keyword: "${keyword}"`);
            filtered = this.cardFilterService.filterByKeyword(filtered, keyword);
            logger.debug(`[SiYuanMemo][DataAccessFacade] After keyword filter: ${filtered.length} cards`);
        }

        if (filter.includeSuspended === false) {
            filtered = filtered.filter((card) => !isCardDismissed(card));
        }

        return filtered;
    }

    private getI18nDictionary(): Record<string, string> | undefined {
        return this.applicationContext?.getI18n?.()
            || this.plugin?.getContext?.()?.getI18n?.()
            || this.plugin?.i18n;
    }

    private normalizeBlockIds(blockIds: string[]): string[] {
        const unique = new Set<string>();
        for (const blockId of blockIds) {
            const normalized = String(blockId || '').trim();
            if (!normalized) {
                continue;
            }
            unique.add(normalized);
        }
        return [...unique];
    }

    private normalizeIds(ids: readonly string[] | undefined): string[] {
        return Array.from(new Set(
            (ids ?? [])
                .map((id) => String(id || '').trim())
                .filter(Boolean)
        ));
    }

    private normalizeCards(cards: readonly FSRSCard[] | undefined): FSRSCard[] {
        const deduped = new Map<string, FSRSCard>();
        for (const card of cards ?? []) {
            const cardId = String(card?.id || '').trim();
            if (!cardId) {
                continue;
            }
            deduped.set(cardId, card);
        }
        return Array.from(deduped.values());
    }

    private filterValidSiyuanBlockIdCards(cards: FSRSCard[]): FSRSCard[] {
        return this.cardFilterService.filterValidBlockIds(cards)
            .filter((card) => this.isSiyuanBlockId(card.blockId));
    }

    private filterMissingBlockIdsWithCompleteSourceMetadata(cards: FSRSCard[], missingBlockIds: Set<string>): Set<string> {
        if (missingBlockIds.size === 0) {
            return missingBlockIds;
        }
        const result = new Set<string>();
        for (const card of cards) {
            const blockId = String(card.blockId || '').trim();
            if (!blockId || !missingBlockIds.has(blockId)) {
                continue;
            }
            if (!this.isSiyuanBlockId(blockId) || this.hasSourceRootId(card)) {
                result.add(blockId);
            }
        }
        return result;
    }

    private isSiyuanBlockId(blockId: unknown): boolean {
        return SIYUAN_BLOCK_ID_PATTERN.test(String(blockId || '').trim());
    }

    private hasSourceRootId(card: FSRSCard): boolean {
        const meta = card.meta && typeof card.meta === 'object' ? card.meta as Record<string, unknown> : {};
        const rootId = String(meta.rootId || '').trim();
        return Boolean(rootId);
    }

    private async collectMissingBlockIds(blockIds: string[]): Promise<{
        missingBlockIds: Set<string>;
        uncheckedBlockIds: Set<string>;
    }> {
        const normalizedBlockIds = this.normalizeBlockIds(blockIds);
        const missingBlockIds = new Set<string>();
        const uncheckedBlockIds = new Set<string>();

        if (normalizedBlockIds.length === 0) {
            return { missingBlockIds, uncheckedBlockIds };
        }

        for (let i = 0; i < normalizedBlockIds.length; i += this.BLOCK_CHECK_BATCH_SIZE) {
            const batchBlockIds = normalizedBlockIds.slice(i, i + this.BLOCK_CHECK_BATCH_SIZE);
            try {
                const existingBlockIds = await this.blockQuery.getExistingBlockIds(batchBlockIds);

                for (const blockId of batchBlockIds) {
                    if (existingBlockIds.has(blockId)) {
                        this.knownMissingBlockIds.delete(blockId);
                    } else {
                        missingBlockIds.add(blockId);
                        this.knownMissingBlockIds.add(blockId);
                    }
                }
            } catch (error) {
                for (const blockId of batchBlockIds) {
                    uncheckedBlockIds.add(blockId);
                }
                logger.debug(
                    `[SiYuanMemo][DataAccessFacade] Block existence check failed for batch, keeping cards (fail-open)`,
                    {
                        batchSize: batchBlockIds.length,
                        error,
                    }
                );
            }
        }

        return { missingBlockIds, uncheckedBlockIds };
    }

    // ========================================================================
    // rootId 填充方法
    // ========================================================================
    
    /**
     * 填充缺失的 rootId 和 content
     * 
     * 对于缺少 meta.rootId 或 meta.content 的卡片,通过 blockId 查询思源 API 获取并填充。
     * 
     * ✅ 使用 CardContentQueryService（符合 DDD 架构）：
     * - 文档块：获取文档标题
     * - 普通块：获取块内容
     * - 支持缓存，提高性能
     * 
     * @param cards 需要填充的卡片数组
     * @see 需求 3.1, 3.2
     */
    private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
        if (cards.length === 0) {
            return;
        }

        // ✅ 只查询那些真正缺失 rootId 或 content 的卡片
        const cardsNeedingRootId = cards.filter(c => !c.meta?.rootId);
        const cardsNeedingContent = cards.filter(c =>
            (!c.meta?.content || String(c.meta.content).trim() === '')
            && !this.knownMissingBlockIds.has(c.blockId)
        );
        
        logger.debug(`[SiYuanMemo][DataAccessFacade] Cards needing data: ${cardsNeedingRootId.length} need rootId, ${cardsNeedingContent.length} need content`);
        
        // 查询 rootId（如果需要）
        let rootIdMap = new Map<string, string>();
        if (cardsNeedingRootId.length > 0) {
            const blockIds = cardsNeedingRootId.map(c => c.blockId);
            rootIdMap = await this.blockRepository.batchQueryRootIds(blockIds);
        }
        
        // ✅ 使用 CardContentQueryService 批量获取块内容（如果需要）
        if (cardsNeedingContent.length > 0) {
            const context = this.applicationContext || this.plugin?.getContext?.();
            const cardContentQueryService = context?.getCardContentQueryService?.();
            
            if (!cardContentQueryService) {
                throw new Error('[SiYuanMemo][DataAccessFacade] CardContentQueryService is required but not available');
            }
            
            const blockIds = cardsNeedingContent.map(c => c.blockId);
            logger.debug(`[SiYuanMemo][DataAccessFacade] Querying content for blockIds:`, blockIds);
            
            const contentResults = await cardContentQueryService.getBlockContentsWithType(blockIds);
            logger.debug(`[SiYuanMemo][DataAccessFacade] Got ${contentResults.size} results from CardContentQueryService`);
            
            // 更新需要 content 的卡片
            let successCount = 0;
            let emptyCount = 0;
            let notFoundCount = 0;
            
            for (const card of cardsNeedingContent) {
                const contentResult = contentResults.get(card.blockId);
                
                if (!contentResult) {
                    notFoundCount++;
                    this.knownMissingBlockIds.add(card.blockId);
                    logger.debug(`[SiYuanMemo][DataAccessFacade] Block not found in content query: ${card.blockId}`);
                    continue;
                }
                
                const content = contentResult.content || '';
                
                if (!card.meta) {
                    card.meta = {};
                }
                card.meta.content = content;
                
                // 🆕 记录块类型信息
                card.meta.blockType = contentResult.type;
                card.meta.isDocument = contentResult.isDocument;
                
                if (content) {
                    successCount++;
                    logger.debug(`[SiYuanMemo][DataAccessFacade] Filled ${contentResult.isDocument ? 'document title' : 'block content'} for ${card.blockId}`);
                } else {
                    emptyCount++;
                    logger.debug(`[SiYuanMemo][DataAccessFacade] Empty content for ${card.blockId} (type: ${contentResult.type})`);
                }
            }
            
            logger.debug(`[SiYuanMemo][DataAccessFacade] Content fill summary: ${successCount} success, ${emptyCount} empty, ${notFoundCount} not found`);
        }
        
        // 更新需要 rootId 的卡片
        for (const card of cardsNeedingRootId) {
            const rootId = rootIdMap.get(card.blockId);
            if (!card.meta) {
                card.meta = {};
            }
            card.meta.rootId = rootId || card.meta.rootId || '';
        }
        
        logger.debug(`[SiYuanMemo][DataAccessFacade] Filled rootId for ${cardsNeedingRootId.length} cards, content for ${cardsNeedingContent.length} cards`);
    }
}

// ==================== 向后兼容 ====================

/**
 * @deprecated 使用 DataAccessFacade 代替
 * 
 * 为了向后兼容，保留旧名称作为类型别名。
 * 此别名将在下一个主版本中移除。
 */
export type AdvancedDataRouter = DataAccessFacade;

/**
 * @deprecated 使用 DataAccessFacade 代替
 * 
 * 为了向后兼容，导出类的别名。
 * 此导出将在下一个主版本中移除。
 */
export const AdvancedDataRouter = DataAccessFacade;
