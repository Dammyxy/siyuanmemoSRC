/**
 * Advanced Data Router
 * 高级模式数据路由器
 * 
 * 高级模式路由器，所有请求转发到本地存储。
 * 高级模式允许完全读写访问，支持所有队列类型和上下文菜单选项。
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
} from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import type { StorageManager } from '../core/storage/manager';
import { batchSetRiffCardsDueTime } from '../core/siyuan/riff';
import { sql } from '../core/siyuan/api';
import { getCurrentDayEnd } from '../utils/dateUtils';
import { getDayStartHour } from '../utils/configUtils';
import { getBlockText } from '../core/siyuan/block';

/**
 * AdvancedDataRouter 类
 * 
 * 高级模式数据路由器，负责：
 * - 从本地存储获取卡片数据
 * - 更新和删除卡片
 * - 显式同步到 Riff（通过 syncToRiff 方法）
 * - 提供高级模式下的队列类型和上下文菜单选项
 * 
 * @see 需求 3.1, 3.2, 3.3, 3.4, 3.5
 */
export class AdvancedDataRouter implements IDataRouter {
    // ========================================================================
    // 私有属性
    // ========================================================================
    
    /**
     * 本地存储管理器
     * 
     * 用于访问本地持久化的卡片数据
     */
    private storage: StorageManager;
    
    /**
     * 插件实例
     * 
     * 用于访问插件配置（如 dayStartHour）
     */
    private plugin: any;
    
    /**
     * Riff 同步启用标志
     * 
     * 控制是否自动同步到 Riff（默认不同步）
     * @see 需求 17.2
     */
    private riffSyncEnabled: boolean = false;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 构造函数
     * 
     * @param storage 本地存储管理器实例
     * @param plugin 插件实例（用于访问配置）
     */
    constructor(storage: StorageManager, plugin?: any) {
        this.storage = storage;
        this.plugin = plugin;
    }
    
    // ========================================================================
    // 数据访问方法
    // ========================================================================
    
    /**
     * 获取单个卡片
     * 
     * 通过本地存储获取卡片数据。
     * 
     * @param cardId 卡片 ID
     * @returns 卡片数据
     * @throws Error 如果卡片不存在
     * @see 需求 3.5
     */
    async getCard(cardId: string): Promise<FSRSCard> {
        const card = this.storage.getCard(cardId);
        
        if (!card) {
            throw new Error(`Card not found: ${cardId}`);
        }
        
        return card;
    }
    
    /**
     * 获取卡片列表
     * 
     * 通过本地存储获取卡片列表，支持过滤。
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     * @see 需求 3.5
     */
    async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        // 获取所有卡片
        let cards = this.storage.getAllCards();
        
        console.log(`[AdvancedDataRouter] 🔍 getAllCards() returned ${cards.length} cards`);
        
        // 🔍 调试：统计卡片类型分布
        const typeStats = cards.reduce((acc, card) => {
            const type = card.type || 'undefined';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        console.log(`[AdvancedDataRouter] 🔍 Card type distribution:`, typeStats);
        
        // ✅ 检查并填充缺失的 rootId 和 content
        const cardsNeedingData = cards.filter(c => !c.meta?.rootId || !c.meta?.content);
        if (cardsNeedingData.length > 0) {
            console.log(`[AdvancedDataRouter] 🔧 Filling missing rootId/content for ${cardsNeedingData.length} cards`);
            await this.fillMissingRootIds(cardsNeedingData);
        }
        
        // 应用过滤器
        if (filter) {
            console.log(`[AdvancedDataRouter] 🔍 Applying filter:`, filter);
            cards = this.applyFilter(cards, filter);
            console.log(`[AdvancedDataRouter] 🔍 After applyFilter: ${cards.length} cards`);
        }
        
        // 过滤掉 blockId 无效的卡片（在应用其他过滤器之后）
        const invalidCards = cards.filter(card => !card.blockId || card.blockId === 'undefined' || card.blockId === '');
        if (invalidCards.length > 0) {
            console.warn(`[AdvancedDataRouter] ⚠️ Filtering out ${invalidCards.length} cards with invalid blockId:`, invalidCards.map(c => ({ id: c.id, blockId: c.blockId })));
            cards = cards.filter(card => card.blockId && card.blockId !== 'undefined' && card.blockId !== '');
            console.log(`[AdvancedDataRouter] 🔍 After blockId filtering: ${cards.length} cards`);
        }
        
        return cards;
    }
    
    /**
     * 更新卡片
     * 
     * 高级模式允许完全读写访问，可以更新卡片数据。
     * 更新后保存到本地存储。
     * 
     * 如果启用了 Riff 同步且卡片使用 Riff 调度器，则自动同步到 Riff。
     * 
     * @param card 要更新的卡片
     * @see 需求 3.4, 17.2, 17.3
     */
    async updateCard(card: FSRSCard): Promise<void> {
        // 更新本地存储
        this.storage.setCard(card);
        await this.storage.saveCards();
        
        // 仅在用户明确选择 Riff 调度器时才同步
        if (this.riffSyncEnabled && card.schedulerType === 'riff') {
            await this.syncToRiff(card.id);
        }
    }
    
    /**
     * 删除卡片
     * 
     * 从本地存储中删除卡片。
     * 
     * @param cardId 要删除的卡片 ID
     * @see 需求 3.4
     */
    async deleteCard(cardId: string): Promise<void> {
        // 从本地存储删除
        this.storage.removeCard(cardId);
        await this.storage.saveCards();
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
            
            console.log(`[AdvancedDataRouter] Synced card ${cardId} to Riff`);
        } catch (error) {
            // 同步失败不应该影响本地操作
            console.error(`[AdvancedDataRouter] Failed to sync card ${cardId} to Riff:`, error);
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
     * 
     * @param cards 卡片数组
     * @param filter 过滤条件
     * @returns 过滤后的卡片数组
     */
    private applyFilter(cards: FSRSCard[], filter: CardFilter): FSRSCard[] {
        let filtered = cards;
        
        // 过滤卡片类型
        if (filter.cardType) {
            const allowedTypes = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
            console.log(`[AdvancedDataRouter] 🔍 Filtering by cardType:`, allowedTypes);
            console.log(`[AdvancedDataRouter] 🔍 Sample card types:`, cards.slice(0, 5).map(c => ({ id: c.id, type: c.type, typeOf: typeof c.type })));

            // 🔍 调试：统计过滤前的类型分布
            const beforeTypeStats = cards.reduce((acc, card) => {
                const type = card.type || 'undefined';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            console.log(`[AdvancedDataRouter] 🔍 Before cardType filter - type distribution:`, beforeTypeStats);

            filtered = filtered.filter(card => {
                // 高级模式严格区分主题/项目卡片（需求 3.2）
                const matches = allowedTypes.includes(card.type);
                if (!matches && cards.length <= 10) {
                    // 如果卡片很少,打印不匹配的卡片详情
                    console.log(`[AdvancedDataRouter] 🔍 Card ${card.id} filtered out: type=${card.type}, allowed=`, allowedTypes);
                }
                return matches;
            });

            console.log(`[AdvancedDataRouter] 🔍 After cardType filter: ${filtered.length} cards`);
        }
        
        /**
         * 过滤到期日期（使用自定义每日刷新时间）
         * 
         * 根据用户配置的 dayStartHour 计算"今天"的结束时间，
         * 而不是使用固定的午夜 23:59:59。
         * 
         * 例如：如果 dayStartHour = 4，则"今天"的结束时间是明天凌晨 4:00，
         * 而不是今天的 23:59:59。
         * 
         * @see .kiro/specs/advanced-mode-due-cards-fix-and-custom-day-start/requirements.md
         */
        if (filter.dueDate) {
            console.log(`[AdvancedDataRouter] 🔍 Filtering by dueDate:`, filter.dueDate);
            
            // 🔍 调试：统计过滤前的到期状态
            const now = Date.now();
            const beforeDueStats = {
                overdue: 0,
                dueToday: 0,
                dueFuture: 0,
            };
            for (const card of filtered) {
                if (card.due < now - 24 * 60 * 60 * 1000) {
                    beforeDueStats.overdue++;
                } else if (card.due <= now) {
                    beforeDueStats.dueToday++;
                } else {
                    beforeDueStats.dueFuture++;
                }
            }
            console.log(`[AdvancedDataRouter] 🔍 Before dueDate filter - due status:`, beforeDueStats);
            
            // 🔍 调试：显示前5张卡片的到期时间
            console.log(`[AdvancedDataRouter] 🔍 Sample due dates (first 5 cards):`, 
                filtered.slice(0, 5).map(c => ({
                    id: c.id.substring(0, 8),
                    due: new Date(c.due).toISOString(),
                    dueTimestamp: c.due
                }))
            );
            
            // 获取自定义每日刷新时间
            const dayStartHour = this.plugin ? getDayStartHour(this.plugin) : 4;
            const dayEnd = getCurrentDayEnd(dayStartHour);
            
            console.log(`[AdvancedDataRouter] 🔍 Using dayStartHour=${dayStartHour}, dayEnd=${new Date(dayEnd).toISOString()}, now=${new Date(now).toISOString()}`);
            
            // 🔍 记录被过滤掉的卡片
            const filteredOutCards: any[] = [];
            
            filtered = filtered.filter(card => {
                const cardDueDate = new Date(card.due);
                
                if (filter.dueDate!.lte) {
                    // 使用 dayEnd 作为今天的结束时间
                    if (card.due > dayEnd) {
                        // 记录被过滤掉的卡片
                        filteredOutCards.push({
                            id: card.id.substring(0, 12),
                            blockId: card.blockId.substring(0, 8),
                            due: new Date(card.due).toISOString(),
                            dueLocal: new Date(card.due).toLocaleString('zh-CN'),
                            state: card.state,
                            createdAt: new Date(card.createdAt).toLocaleString('zh-CN'),
                        });
                        return false;
                    }
                }
                
                if (filter.dueDate!.gte) {
                    const filterGteOnly = new Date(filter.dueDate!.gte);
                    filterGteOnly.setHours(0, 0, 0, 0);
                    
                    if (cardDueDate < filterGteOnly) {
                        return false;
                    }
                }
                
                return true;
            });
            
            console.log(`[AdvancedDataRouter] 🔍 After dueDate filter: ${filtered.length} cards`);
            
            // 🔍 显示被过滤掉的卡片
            if (filteredOutCards.length > 0) {
                console.log(`[AdvancedDataRouter] 🔍 Filtered out ${filteredOutCards.length} cards (due > dayEnd):`, filteredOutCards);
            }
        }
        
        // 过滤标签
        if (filter.tags && filter.tags.length > 0) {
            filtered = filtered.filter(card => {
                // 检查卡片是否包含任何指定的标签
                if (!card.tags || card.tags.length === 0) {
                    return false;
                }
                
                return filter.tags!.some(tag => card.tags.includes(tag));
            });
        }
        
        // 过滤优先级
        if (filter.priority) {
            filtered = filtered.filter(card => {
                const priority = card.priority;
                
                if (filter.priority!.min !== undefined && priority < filter.priority!.min) {
                    return false;
                }
                
                if (filter.priority!.max !== undefined && priority > filter.priority!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // ====================================================================
        // 新增过滤条件（filter-group-queue-ui 功能）
        // @see 需求 6.2, 6.3, 9.1, 9.2, 9.3, 9.4
        // ====================================================================
        
        // 过滤复习次数
        if (filter.repetitions) {
            filtered = filtered.filter(card => {
                const reps = card.reps;
                
                if (filter.repetitions!.min !== undefined && reps < filter.repetitions!.min) {
                    return false;
                }
                
                if (filter.repetitions!.max !== undefined && reps > filter.repetitions!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤遗忘次数
        if (filter.lapses) {
            filtered = filtered.filter(card => {
                const lapses = card.lapses;
                
                if (filter.lapses!.min !== undefined && lapses < filter.lapses!.min) {
                    return false;
                }
                
                if (filter.lapses!.max !== undefined && lapses > filter.lapses!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤间隔天数
        if (filter.interval) {
            filtered = filtered.filter(card => {
                // 计算间隔天数（当前日期到到期日期的天数）
                const now = new Date();
                const dueDate = new Date(card.due);
                const intervalDays = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                
                if (filter.interval!.min !== undefined && intervalDays < filter.interval!.min) {
                    return false;
                }
                
                if (filter.interval!.max !== undefined && intervalDays > filter.interval!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤上次复习日期
        if (filter.lastReview) {
            filtered = filtered.filter(card => {
                // 使用 updatedAt 作为上次复习日期
                const lastReviewDate = new Date(card.updatedAt);
                
                if (filter.lastReview!.lte && lastReviewDate > filter.lastReview!.lte) {
                    return false;
                }
                
                if (filter.lastReview!.gte && lastReviewDate < filter.lastReview!.gte) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤难度
        if (filter.difficulty) {
            filtered = filtered.filter(card => {
                const difficulty = card.difficulty;
                
                if (filter.difficulty!.min !== undefined && difficulty < filter.difficulty!.min) {
                    return false;
                }
                
                if (filter.difficulty!.max !== undefined && difficulty > filter.difficulty!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤稳定性
        if (filter.stability) {
            filtered = filtered.filter(card => {
                const stability = card.stability;
                
                if (filter.stability!.min !== undefined && stability < filter.stability!.min) {
                    return false;
                }
                
                if (filter.stability!.max !== undefined && stability > filter.stability!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤可提取性
        if (filter.retrievability) {
            filtered = filtered.filter(card => {
                // 计算可提取性（基于 FSRS 算法）
                // R = e^(-t/S)，其中 t 是经过的时间，S 是稳定性
                const now = new Date();
                const lastReview = new Date(card.updatedAt);
                const elapsedDays = (now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24);
                const retrievability = Math.exp(-elapsedDays / card.stability);
                
                if (filter.retrievability!.min !== undefined && retrievability < filter.retrievability!.min) {
                    return false;
                }
                
                if (filter.retrievability!.max !== undefined && retrievability > filter.retrievability!.max) {
                    return false;
                }
                
                return true;
            });
        }
        
        // 过滤卡片状态
        if (filter.cardStatus && filter.cardStatus.length > 0) {
            filtered = filtered.filter(card => {
                // 根据卡片的 state 字段判断状态
                // state: 0=New, 1=Learning, 2=Review, 3=Relearning
                let cardStatus: 'new' | 'learning' | 'review' | 'relearning';
                
                switch (card.state) {
                    case 0:
                        cardStatus = 'new';
                        break;
                    case 1:
                        cardStatus = 'learning';
                        break;
                    case 2:
                        cardStatus = 'review';
                        break;
                    case 3:
                        cardStatus = 'relearning';
                        break;
                    default:
                        cardStatus = 'new';
                }
                
                return filter.cardStatus!.includes(cardStatus);
            });
        }
        
        return filtered;
    }
    
    // ========================================================================
    // ✅ rootId 填充方法（queue-doc-filter-rootid-fix）
    // ========================================================================
    
    /**
     * 填充缺失的 rootId 和 content
     * 
     * 对于缺少 meta.rootId 或 meta.content 的卡片，通过 blockId 查询思源 API 获取并填充。
     * 
     * @param cards 需要填充的卡片数组
     * @see 需求 3.1, 3.2
     */
    private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
        if (cards.length === 0) {
            return;
        }
        
        const blockIds = cards.map(c => c.blockId);
        const rootIdMap = await this.batchQueryRootIds(blockIds);
        
        // 批量获取块内容
        const contentPromises = cards.map(async (card) => {
            try {
                const content = await getBlockText(card.blockId);
                return { blockId: card.blockId, content };
            } catch (error) {
                console.warn(`[AdvancedDataRouter] Failed to get content for block ${card.blockId}:`, error);
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
            
            // 更新本地存储（使用 setCard 而不是 updateCard）
            this.storage.setCard(card);
        }
        
        console.log(`[AdvancedDataRouter] ✅ Filled rootId and content for ${cards.length} cards`);
    }
    
    /**
     * 批量查询 rootId
     * 
     * 使用 SQL 查询 blocks 表的 root_id 字段，分批查询以提高性能。
     * 
     * @param blockIds 块 ID 数组
     * @returns Map<blockId, rootId>
     * @see 需求 3.2, 3.4
     */
    private async batchQueryRootIds(blockIds: string[]): Promise<Map<string, string>> {
        const rootIdMap = new Map<string, string>();
        
        if (blockIds.length === 0) {
            return rootIdMap;
        }
        
        // 分批查询（每批 500 个）
        const BATCH_SIZE = 500;
        for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
            const batchIds = blockIds.slice(i, i + BATCH_SIZE);
            const inClause = batchIds.map(id => `'${this.escapeSQL(id)}'`).join(',');
            
            try {
                const result = await sql(`SELECT id, root_id FROM blocks WHERE id IN (${inClause})`);
                
                for (const row of result || []) {
                    rootIdMap.set(row.id, row.root_id || '');
                }
            } catch (error) {
                console.error('[AdvancedDataRouter] Failed to query rootIds:', error);
                // 为失败的批次设置空字符串
                for (const blockId of batchIds) {
                    if (!rootIdMap.has(blockId)) {
                        rootIdMap.set(blockId, '');
                    }
                }
            }
        }
        
        return rootIdMap;
    }
    
    /**
     * 转义 SQL 字符串
     * 
     * 转义 SQL 字符串中的单引号，防止 SQL 注入。
     * 
     * @param str 待转义的字符串
     * @returns 转义后的字符串
     * @see 需求 3.2
     */
    private escapeSQL(str: string): string {
        return str.replace(/'/g, "''");
    }
}
