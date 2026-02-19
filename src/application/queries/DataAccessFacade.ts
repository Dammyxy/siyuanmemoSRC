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
} from '../../types/unified-data-source';
import { FSRSCard } from '../../types/card';
import type { StorageManager } from '../../core/storage/manager';
import type { CardApplicationService } from '../services/CardApplicationService';
import { CardFilterService } from '../../core/card/domain/services/CardFilterService';
import { BlockRepository } from '../../core/storage/infrastructure/BlockRepository';
import { batchSetRiffCardsDueTime } from '../../core/siyuan/riff';
import { getCurrentDayEnd } from '../../utils/dateUtils';
import { getDayStartHour } from '../../utils/configUtils';
import { getBlockText } from '../../core/siyuan/block';
import { migrateCard } from '../../utils/cardMigration';

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
     * 插件实例
     * 
     * 用于访问插件配置(如 dayStartHour)
     */
    private plugin: any;
    
    /**
     * Riff 同步启用标志
     * 
     * 控制是否自动同步到 Riff(默认不同步)
     * @see 需求 17.2
     */
    private riffSyncEnabled: boolean = false;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 构造函数
     * 
     * @param cardService 卡片应用服务实例
     * @param storage 本地存储管理器实例(用于 fillMissingRootIds)
     * @param plugin 插件实例(用于访问配置)
     */
    constructor(cardService: CardApplicationService, storage: StorageManager, plugin?: any) {
        this.cardService = cardService;
        this.cardFilterService = new CardFilterService();
        this.blockRepository = new BlockRepository();
        this.storage = storage;
        this.plugin = plugin;
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
     * @returns 卡片数据
     * @throws Error 如果卡片不存在
     * @see 需求 3.5
     */
    async getCard(cardId: string): Promise<FSRSCard> {
        const result = await this.cardService.getCard({ cardId });
        
        if (!result.card) {
            throw new Error(`Card not found: ${cardId}`);
        }
        
        // ✅ 应用迁移逻辑：确保 learning_step 字段存在
        return migrateCard(result.card);
    }
    
    /**
     * 获取卡片列表
     * 
     * 通过卡片应用服务获取卡片列表,支持过滤。
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     * @see 需求 3.5
     */
    async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        // 通过 CardApplicationService 获取所有卡片
        const result = await this.cardService.getCards({});
        let cards = result.cards;
        
        console.log(`[SiYuanMemo][DataAccessFacade] 🔍 getCards() returned ${cards.length} cards`);
        
        // 检查并填充缺失的 rootId 和 content
        const cardsNeedingData = cards.filter(c => !c.meta?.rootId || !c.meta?.content);
        if (cardsNeedingData.length > 0) {
            console.log(`[SiYuanMemo][DataAccessFacade] 🔧 Filling missing rootId/content for ${cardsNeedingData.length} cards`);
            await this.fillMissingRootIds(cardsNeedingData);
        }
        
        // 应用过滤器
        if (filter) {
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 Applying filter:`, filter);
            cards = this.applyFilter(cards, filter);
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 After applyFilter: ${cards.length} cards`);
        }
        
        // 过滤掉 blockId 无效的卡片
        const invalidCards = cards.filter(card => !card.blockId || card.blockId === 'undefined' || card.blockId === '');
        if (invalidCards.length > 0) {
            console.warn(`[SiYuanMemo][DataAccessFacade] ⚠️ Filtering out ${invalidCards.length} cards with invalid blockId`);
            cards = this.cardFilterService.filterValidBlockIds(cards);
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 After blockId filtering: ${cards.length} cards`);
        }
        
        // 应用迁移逻辑:确保所有卡片都有 learning_step 字段
        cards = cards.map(card => migrateCard(card));
        
        return cards;
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
    async updateCard(card: FSRSCard): Promise<void> {
        // 通过 CardApplicationService 更新卡片
        const result = await this.cardService.updateFSRSCard({
            cardId: card.id,
            updates: {
                due: card.due,
                stability: card.stability,
                difficulty: card.difficulty,
                elapsed_days: card.elapsed_days,
                scheduled_days: card.scheduled_days,
                reps: card.reps,
                lapses: card.lapses,
                state: card.state,
                last_review: card.last_review,
                priority: card.priority,
                meta: card.meta,
            }
        });
        
        if (!result.ok) {
            throw new Error(`Failed to update card ${card.id}: ${result.error}`);
        }
        
        // 仅在用户明确选择 Riff 调度器时才同步
        if (this.riffSyncEnabled && card.schedulerType === 'riff') {
            await this.syncToRiff(card.id);
        }
    }
    
    /**
     * 删除卡片
     * 
     * 通过卡片应用服务删除卡片，并尝试从 Riff 删除（如果启用）。
     * 
     * @param cardId 要删除的卡片 ID
     * @see 需求 3.4
     */
    async deleteCard(cardId: string): Promise<void> {
        // 检查是否需要从 Riff 删除
        let deleteFromRiff = false;
        if (this.plugin?.hybridSyncService) {
            const riffConfig = this.storage.getSettings().riffIntegration;
            deleteFromRiff = riffConfig?.deleteSync?.enabled || false;
        }
        
        // 通过 CardApplicationService 删除卡片
        const result = await this.cardService.deleteFSRSCard({
            cardId,
            deleteFromRiff
        });
        
        if (!result.ok) {
            throw new Error(`Failed to delete card ${cardId}: ${result.error}`);
        }
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
        try {
            const card = await this.getCard(cardId);
            
            // 将 due 时间戳转换为 ISO 字符串
            const dueDate = new Date(card.due).toISOString();
            
            // 使用 Riff API 同步
            await batchSetRiffCardsDueTime([
                { id: cardId, due: dueDate }
            ]);
            
            console.log(`[SiYuanMemo][AdvancedDataRouter] Synced card ${cardId} to Riff`);
        } catch (error) {
            // 同步失败不应该影响本地操作
            console.error(`[SiYuanMemo][AdvancedDataRouter] Failed to sync card ${cardId} to Riff:`, error);
        }
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
        return getAdvancedModeContextMenuOptions();
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
    private applyFilter(cards: FSRSCard[], filter: CardFilter): FSRSCard[] {
        let filtered = cards;
        
        // 过滤块 ID
        if (filter.blockIds && filter.blockIds.length > 0) {
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 Filtering by blockIds: ${filter.blockIds.length} blocks`);
            filtered = this.cardFilterService.filterByBlockIds(filtered, filter.blockIds);
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 After blockIds filter: ${filtered.length} cards`);
        }
        
        // 过滤卡片类型
        if (filter.cardType) {
            const allowedTypes = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 Filtering by cardType:`, allowedTypes);
            filtered = this.cardFilterService.filterByCardTypes(filtered, allowedTypes);
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 After cardType filter: ${filtered.length} cards`);
        }
        
        // 过滤到期日期
        if (filter.dueDate) {
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 Filtering by dueDate:`, filter.dueDate);
            
            // 获取自定义每日刷新时间
            const dayStartHour = this.plugin ? getDayStartHour(this.plugin) : 4;
            const dayEnd = getCurrentDayEnd(dayStartHour);
            
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 Using dayStartHour=${dayStartHour}, dayEnd=${new Date(dayEnd).toISOString()}`);
            
            filtered = this.cardFilterService.filterByDueDate(filtered, filter.dueDate, dayEnd);
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 After dueDate filter: ${filtered.length} cards`);
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
        if (filter.cardStatus && filter.cardStatus.length > 0) {
            filtered = this.cardFilterService.filterByCardStatus(filtered, filter.cardStatus);
        }
        
        // 过滤关键词
        if (filter.keyword && filter.keyword.trim()) {
            const keyword = filter.keyword.trim();
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 Filtering by keyword: "${keyword}"`);
            filtered = this.cardFilterService.filterByKeyword(filtered, keyword);
            console.log(`[SiYuanMemo][DataAccessFacade] 🔍 After keyword filter: ${filtered.length} cards`);
        }
        
        return filtered;
    }
    
    // ========================================================================
    // rootId 填充方法
    // ========================================================================
    
    /**
     * 填充缺失的 rootId 和 content
     * 
     * 对于缺少 meta.rootId 或 meta.content 的卡片,通过 blockId 查询思源 API 获取并填充。
     * 使用 BlockRepository 封装 SQL 查询。
     * 
     * @param cards 需要填充的卡片数组
     * @see 需求 3.1, 3.2
     */
    private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
        if (cards.length === 0) {
            return;
        }
        
        const blockIds = cards.map(c => c.blockId);
        const rootIdMap = await this.blockRepository.batchQueryRootIds(blockIds);
        
        // 批量获取块内容
        const contentPromises = cards.map(async (card) => {
            try {
                const content = await getBlockText(card.blockId);
                return { blockId: card.blockId, content };
            } catch (error) {
                console.warn(`[SiYuanMemo][DataAccessFacade] Failed to get content for block ${card.blockId}:`, error);
                return { blockId: card.blockId, content: '' };
            }
        });
        
        const contentResults = await Promise.all(contentPromises);
        const contentMap = new Map(contentResults.map(r => [r.blockId, r.content]));
        
        for (const card of cards) {
            const rootId = rootIdMap.get(card.blockId) || '';
            const content = contentMap.get(card.blockId) || '';
            
            if (!card.meta) {
                card.meta = {};
            }
            card.meta.rootId = rootId;
            card.meta.content = content;
            
            // 更新本地存储(使用 setCard 而不是 updateCard)
            this.storage.setCard(card);
        }
        
        console.log(`[SiYuanMemo][DataAccessFacade] ✅ Filled rootId and content for ${cards.length} cards`);
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
