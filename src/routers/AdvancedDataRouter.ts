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
     */
    constructor(storage: StorageManager) {
        this.storage = storage;
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
        
        // 应用过滤器
        if (filter) {
            cards = this.applyFilter(cards, filter);
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
            filtered = filtered.filter(card => {
                // 高级模式严格区分主题/项目卡片（需求 3.2）
                return card.type === filter.cardType;
            });
        }
        
        // 过滤到期日期
        if (filter.dueDate) {
            filtered = filtered.filter(card => {
                const dueDate = new Date(card.due);
                
                if (filter.dueDate!.lte && dueDate > filter.dueDate!.lte) {
                    return false;
                }
                
                if (filter.dueDate!.gte && dueDate < filter.dueDate!.gte) {
                    return false;
                }
                
                return true;
            });
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
        
        return filtered;
    }
}
