/**
 * Simple Data Router
 * 简单模式数据路由器
 * 
 * 简单模式路由器，所有请求转发到 Riff API。
 * 简单模式只允许删除操作（通过黑名单），不允许更新卡片。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import {
    IDataRouter,
    CardFilter,
    QueueType,
    ContextMenuOption,
    getSimpleModeQueueTypes,
    getSimpleModeContextMenuOptions,
} from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import {
    getRiffCards,
    getRiffCardsByBlockIDs,
    removeRiffCards,
    BUILTIN_DECK_ID,
    type RiffBlock,
} from '../core/siyuan/riff';

/**
 * SimpleDataRouter 类
 * 
 * 简单模式数据路由器，负责：
 * - 从 Riff API 获取卡片数据
 * - 通过黑名单删除卡片
 * - 拒绝更新操作（简单模式限制）
 * - 提供简单模式下的队列类型和上下文菜单选项
 * 
 * @see 需求 2.1, 2.2, 2.3, 2.4, 2.5
 */
export class SimpleDataRouter implements IDataRouter {
    // ========================================================================
    // 私有属性
    // ========================================================================
    
    /**
     * 卡包 ID
     * 
     * 默认使用内置卡包 ID
     */
    private deckId: string;
    
    // ========================================================================
    // 构造函数
    // ========================================================================
    
    /**
     * 构造函数
     * 
     * @param deckId 卡包 ID（可选，默认使用内置卡包）
     */
    constructor(deckId: string = BUILTIN_DECK_ID) {
        this.deckId = deckId;
    }
    
    // ========================================================================
    // 数据访问方法
    // ========================================================================
    
    /**
     * 获取单个卡片
     * 
     * 通过 Riff API 获取卡片数据。
     * 
     * @param cardId 卡片 ID（块 ID）
     * @returns 卡片数据
     * @see 需求 2.5
     */
    async getCard(cardId: string): Promise<FSRSCard> {
        // 通过块 ID 获取 Riff 卡片
        const riffBlocks = await getRiffCardsByBlockIDs([cardId]);
        
        if (riffBlocks.length === 0) {
            throw new Error(`Card not found: ${cardId}`);
        }
        
        // 转换 RiffBlock 为 FSRSCard
        return this.convertRiffBlockToFSRSCard(riffBlocks[0]);
    }
    
    /**
     * 获取卡片列表
     * 
     * 通过 Riff API 获取卡片列表，支持过滤。
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     * @see 需求 2.5
     */
    async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        // 获取所有 Riff 卡片
        const riffBlocks = await getRiffCards(this.deckId, {
            includeNew: true,
        });
        
        // 转换为 FSRSCard
        let cards = riffBlocks.map(block => this.convertRiffBlockToFSRSCard(block));
        
        // 应用过滤器
        if (filter) {
            cards = this.applyFilter(cards, filter);
        }
        
        return cards;
    }
    
    /**
     * 更新卡片
     * 
     * 简单模式不允许更新卡片，抛出错误。
     * 
     * @param card 要更新的卡片
     * @throws Error 简单模式不允许更新操作
     * @see 需求 2.4
     */
    async updateCard(card: FSRSCard): Promise<void> {
        // 简单模式只允许删除（通过黑名单）
        throw new Error('Update not allowed in Simple Mode');
    }
    
    /**
     * 删除卡片
     * 
     * 通过 Riff API 将卡片添加到黑名单（从卡包中移除）。
     * 
     * @param cardId 要删除的卡片 ID
     * @see 需求 2.4
     */
    async deleteCard(cardId: string): Promise<void> {
        // 通过 Riff API 从卡包中移除卡片（黑名单）
        await removeRiffCards(this.deckId, [cardId]);
    }
    
    // ========================================================================
    // 模式特定方法
    // ========================================================================
    
    /**
     * 获取当前模式下可用的队列类型
     * 
     * 简单模式提供恰好 2 种队列类型：
     * - 检索练习（RetrievalPractice）
     * - 最终训练（FinalDrill）
     * 
     * @returns 队列类型数组
     * @see 需求 2.1
     */
    getAvailableQueueTypes(): QueueType[] {
        return getSimpleModeQueueTypes();
    }
    
    /**
     * 获取当前模式下的上下文菜单选项
     * 
     * 简单模式提供恰好 3 个上下文菜单选项：
     * - 打开（open）
     * - 删除（delete）
     * - 添加到最终训练（add-to-final-drill）
     * 
     * @returns 上下文菜单选项数组
     * @see 需求 2.3
     */
    getContextMenuOptions(): ContextMenuOption[] {
        return getSimpleModeContextMenuOptions();
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 转换 RiffBlock 为 FSRSCard
     * 
     * 将 Riff API 返回的 RiffBlock 转换为统一的 FSRSCard 格式。
     * 
     * @param riffBlock Riff 卡片块
     * @returns FSRSCard
     */
    private convertRiffBlockToFSRSCard(riffBlock: RiffBlock): FSRSCard {
        // 从 RiffBlock 提取卡片信息
        const riffCard = riffBlock.riffCard;
        
        // 解析时间戳（转换为毫秒）
        const due = riffCard?.due ? new Date(riffCard.due).getTime() : Date.now();
        const createdAt = new Date(riffBlock.created).getTime();
        const updatedAt = new Date(riffBlock.updated).getTime();
        const lastReview = riffCard?.lastReview ? new Date(riffCard.lastReview).getTime() : 0;
        
        // 🔧 修复：从块属性读取实际的 cardType
        // 块属性存储在 riffBlock.ial 中
        const cardTypeAttr = riffBlock.ial?.['custom-fsrs-card-type'];
        let cardType: 'item' | 'topic' | 'incremental' | 'webpage' = 'item';
        if (cardTypeAttr === 'topic' || cardTypeAttr === 'incremental' || cardTypeAttr === 'webpage') {
            cardType = cardTypeAttr;
        }
        
        // 构造 FSRSCard
        const card: FSRSCard = {
            // 标识
            id: riffBlock.id,
            blockId: riffBlock.id,
            
            // FSRS 核心字段
            due: due,
            stability: riffCard?.stability ?? 0,
            difficulty: riffCard?.difficulty ?? 0,
            reps: riffCard?.reps ?? 0,
            lapses: riffCard?.lapses ?? 0,
            state: riffCard?.state ?? 0,
            lastReview: lastReview,
            elapsedDays: riffCard?.elapsedDays ?? 0,
            scheduledDays: riffCard?.scheduledDays ?? 0,
            
            // 扩展功能
            priority: 50, // 默认优先级
            type: cardType as any, // 🔧 使用从块属性读取的实际类型
            tags: [],
            
            // 难点攻克
            leechCount: 0,
            isLeech: false,
            
            // 跳过/留言
            skipped: false,
            
            // 元数据
            createdAt: createdAt,
            updatedAt: updatedAt,
            
            // 调度器相关
            schedulerType: 'riff',
            syncToRiff: true,
            riffCardId: riffCard?.id,
        };
        
        return card;
    }
    
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
                // 🔧 修复：检查卡片的实际类型是否与过滤器匹配
                // 将 CardType 枚举转换为字符串进行比较
                const cardTypeStr = String(card.type);
                return cardTypeStr === filter.cardType;
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

