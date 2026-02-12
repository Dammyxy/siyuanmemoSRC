/**
 * Simple Data Router
 * 简单模式数据路由器
 * 
 * 简单模式路由器，所有请求转发到 Riff API。
 * 简单模式只允许删除操作（通过黑名单），不允许更新卡片。
 * 
 * 实现了网络错误重试机制（需求 11.5）：
 * - 最多重试 3 次
 * - 指数退避策略（100ms, 200ms, 400ms）
 * - 只对网络错误重试，不对业务错误重试
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 * @see .kiro/specs/queue-architecture-migration/requirements.md - 需求 11.5
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
    getRiffCardsByBlockIDs,
    getRiffDueCards,
    removeRiffCards,
    BUILTIN_DECK_ID,
    type RiffBlock,
} from '../core/siyuan/riff';
import { sql } from '../core/siyuan/api';  // ✅ 添加 sql 导入
import { migrateCard } from '../utils/cardMigration';  // ✅ 添加迁移工具导入

/**
 * SimpleDataRouter 类
 * 
 * 简单模式数据路由器，负责：
 * - 从 Riff API 获取卡片数据
 * - 通过黑名单删除卡片
 * - 拒绝更新操作（简单模式限制）
 * - 提供简单模式下的队列类型和上下文菜单选项
 * - 网络错误自动重试（最多 3 次，指数退避）
 * 
 * @see 需求 2.1, 2.2, 2.3, 2.4, 2.5, 11.5
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
    
    /**
     * 最大重试次数
     * 
     * 网络错误时的最大重试次数
     * @see 需求 11.5
     */
    private readonly maxRetries: number = 3;
    
    /**
     * 初始重试延迟（毫秒）
     * 
     * 第一次重试的延迟时间，后续重试使用指数退避
     * @see 需求 11.5
     */
    private readonly initialRetryDelay: number = 100;
    
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
     * 网络错误时自动重试（最多 3 次）。
     * 
     * @param cardId 卡片 ID（块 ID）
     * @returns 卡片数据
     * @throws Error 如果卡片不存在或网络错误超过重试次数
     * @see 需求 2.5, 11.5
     */
    async getCard(cardId: string): Promise<FSRSCard> {
        // 使用重试机制调用 Riff API
        const riffBlocks = await this.retryOnNetworkError(
            async () => await getRiffCardsByBlockIDs([cardId]),
            'getCard'
        );
        
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
     * 网络错误时自动重试（最多 3 次）。
     * 
     * 🔧 修复说明：
     * 使用 getRiffDueCards 而不是 getRiffCards，因为：
     * - getRiffCards 返回所有块，但不包含 riffCard 调度信息
     * - getRiffDueCards 返回到期卡片，包含完整的 riffCard 调度信息
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     * @throws Error 如果网络错误超过重试次数
     * @see 需求 2.5, 11.5
     */
    async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
        // 使用重试机制调用 Riff API
        // 🔧 修复：使用 getRiffDueCards 获取包含完整调度信息的卡片
        const riffReviewData = await this.retryOnNetworkError(
            async () => await getRiffDueCards(this.deckId),
            'getCards'
        );
        
        // 如果没有到期卡片，返回空数组
        if (!riffReviewData || !riffReviewData.cards || riffReviewData.cards.length === 0) {
            return [];
        }
        
        // 获取卡片的块 ID
        const blockIDs = riffReviewData.cards.map(c => c.blockID);
        
        // 通过块 ID 获取完整的 RiffBlock 数据
        const riffBlocks = await this.retryOnNetworkError(
            async () => await getRiffCardsByBlockIDs(blockIDs),
            'getRiffCardsByBlockIDs'
        );
        
        // 🔍 调试：显示 Riff API 返回的原始 RiffBlock 数据
        console.log('[SimpleDataRouter] 🔍 RiffBlocks from Riff API:', 
            riffBlocks.map(b => ({ blockId: b.id, box: b.box, content: b.content?.substring(0, 30) }))
        );
        
        // 🔍 调试：查询思源数据库中这些块的实际 root_id
        const rootIdMap = new Map<string, string>();
        try {
            const blockIds = riffBlocks.map(b => b.id);
            const inClause = blockIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            const result = await sql(`SELECT id, root_id FROM blocks WHERE id IN (${inClause})`);
            console.log('[SimpleDataRouter] 🔍 Actual root_id from SiYuan database:', 
                result.map((r: any) => ({ blockId: r.id, actualRootId: r.root_id }))
            );
            
            // 构建 blockId -> root_id 映射
            for (const row of result) {
                rootIdMap.set(row.id, row.root_id || '');
            }
            
            // 🔍 对比 Riff API 的 box 和数据库的 root_id
            const comparison = riffBlocks.map(b => {
                const dbRootId = rootIdMap.get(b.id);
                return {
                    blockId: b.id,
                    riffBox: b.box,
                    dbRootId,
                    match: b.box === dbRootId
                };
            });
            console.log('[SimpleDataRouter] 🔍 Comparison (Riff box vs DB root_id):', comparison);
        } catch (error) {
            console.error('[SimpleDataRouter] Failed to query root_id from database:', error);
        }
        
        // 转换为 FSRSCard（使用数据库的 root_id 而不是 Riff 的 box）
        let cards = riffBlocks.map(block => this.convertRiffBlockToFSRSCard(block, rootIdMap));
        
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
     * @param _card 要更新的卡片（未使用）
     * @throws Error 简单模式不允许更新操作
     * @see 需求 2.4
     */
    async updateCard(_card: FSRSCard): Promise<void> {
        // 简单模式只允许删除（通过黑名单）
        throw new Error('Update not allowed in Simple Mode');
    }
    
    /**
     * 删除卡片
     * 
     * 通过 Riff API 将卡片添加到黑名单（从卡包中移除）。
     * 网络错误时自动重试（最多 3 次）。
     * 
     * @param cardId 要删除的卡片 ID
     * @throws Error 如果网络错误超过重试次数
     * @see 需求 2.4, 11.5
     */
    async deleteCard(cardId: string): Promise<void> {
        // 使用重试机制调用 Riff API
        await this.retryOnNetworkError(
            async () => await removeRiffCards(this.deckId, [cardId]),
            'deleteCard'
        );
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
     * 网络错误重试包装器
     * 
     * 对网络请求进行重试，使用指数退避策略。
     * 只对网络错误重试，不对业务错误（如卡片不存在）重试。
     * 
     * @param fn 要执行的异步函数
     * @param operation 操作名称（用于日志）
     * @returns 函数执行结果
     * @throws Error 如果超过最大重试次数
     * @see 需求 11.5
     */
    private async retryOnNetworkError<T>(
        fn: () => Promise<T>,
        operation: string
    ): Promise<T> {
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                // 尝试执行函数
                return await fn();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                // 检查是否是网络错误
                const isNetworkError = this.isNetworkError(lastError);
                
                // 如果不是网络错误，或者已经达到最大重试次数，直接抛出
                if (!isNetworkError || attempt >= this.maxRetries) {
                    console.error(
                        `[SimpleDataRouter] ${operation} failed after ${attempt} attempts:`,
                        lastError
                    );
                    throw lastError;
                }
                
                // 计算退避延迟（指数退避）
                const delay = this.initialRetryDelay * Math.pow(2, attempt);
                
                console.warn(
                    `[SimpleDataRouter] ${operation} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), ` +
                    `retrying in ${delay}ms...`,
                    lastError.message
                );
                
                // 等待后重试
                await this.sleep(delay);
            }
        }
        
        // 理论上不会到达这里，但为了类型安全
        throw lastError || new Error(`${operation} failed after ${this.maxRetries} retries`);
    }
    
    /**
     * 判断是否是网络错误
     * 
     * 检查错误是否是由网络问题引起的（如超时、连接失败等）。
     * 
     * @param error 错误对象
     * @returns 是否是网络错误
     */
    private isNetworkError(error: Error): boolean {
        const message = error.message.toLowerCase();
        
        // 常见的网络错误关键词
        const networkErrorKeywords = [
            'network',
            'timeout',
            'fetch',
            'connection',
            'econnrefused',
            'enotfound',
            'etimedout',
            'socket',
            'abort',
        ];
        
        return networkErrorKeywords.some(keyword => message.includes(keyword));
    }
    
    /**
     * 异步睡眠
     * 
     * @param ms 睡眠时间（毫秒）
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 转换 RiffBlock 为 FSRSCard
     * 
     * 将 Riff API 返回的 RiffBlock 转换为统一的 FSRSCard 格式。
     * 
     * 🔧 修复说明：
     * Riff API 返回的 RiffBlock 中，riffCard 字段可能为 undefined。
     * 这通常发生在以下情况：
     * 1. 卡片是新创建的，还没有复习记录
     * 2. 卡片不在当前卡包中
     * 3. API 返回的数据不完整
     * 
     * 当 riffCard 缺失时，我们使用合理的默认值：
     * - due: 当前时间（表示立即到期）
     * - stability: 0（新卡片）
     * - difficulty: 0（新卡片）
     * - state: 0（New 状态）
     * - reps: 0（未复习过）
     * - lapses: 0（未遗忘过）
     * 
     * @param riffBlock Riff 卡片块
     * @returns FSRSCard
     */
    private convertRiffBlockToFSRSCard(riffBlock: RiffBlock, rootIdMap: Map<string, string>): FSRSCard {
        // 从 RiffBlock 提取卡片信息
        const riffCard = riffBlock.riffCard;
        
        // 🔧 修复：如果 riffCard 不存在，记录详细警告
        if (!riffCard) {
            console.warn(`[SimpleDataRouter] ⚠️ RiffCard data missing for block ${riffBlock.id}`, {
                blockId: riffBlock.id,
                blockType: riffBlock.type,
                blockSubType: riffBlock.subType,
                hasRiffCardID: !!(riffBlock.riffCardID || riffBlock.riffCardId),
                riffCardID: riffBlock.riffCardID || riffBlock.riffCardId,
                ial: riffBlock.ial,
            });
        }
        
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
            
            // 🔧 新增：存储原始块数据到 meta 字段，供 UI 使用
            meta: {
                content: riffBlock.content,
                path: riffBlock.path,
                hPath: riffBlock.hPath,
                deckId: riffCard?.deckID,
                rootId: rootIdMap.get(riffBlock.id) || '',  // ✅ 使用数据库的 root_id（文档 ID），而不是 Riff 的 box（笔记本 ID）
                // 如果 riffCard 缺失，标记为不完整数据
                isIncomplete: !riffCard,
            },
        };
        
        // 🔧 调试日志：记录转换结果（仅在 riffCard 缺失时输出详细日志）
        if (!riffCard) {
            console.log('[SimpleDataRouter] ⚠️ Converted RiffBlock with missing riffCard:', {
                blockId: riffBlock.id,
                hasRiffCard: false,
                due: new Date(card.due).toISOString(),
                stability: card.stability,
                difficulty: card.difficulty,
                state: card.state,
                type: card.type,
                content: riffBlock.content?.substring(0, 50) + '...',
            });
        }
        
        // ✅ 调试日志：记录 rootId 来源
        const dbRootId = rootIdMap.get(riffBlock.id);
        if (!dbRootId) {
            console.warn('[SimpleDataRouter] ⚠️ Block not found in database (rootId unavailable):', {
                blockId: riffBlock.id,
                content: riffBlock.content?.substring(0, 50),
                path: riffBlock.path,
                riffBox: riffBlock.box,  // Riff 的 box 是笔记本 ID，不是文档 ID
            });
        }
        
        // ✅ 应用迁移逻辑：确保 learning_step 字段存在
        return migrateCard(card);
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
                let cardStatus: 'memorized' | 'pending' | 'dismissed';
                
                if (card.state === 2) {
                    // Review 状态视为已记忆
                    cardStatus = 'memorized';
                } else if (card.state === 0 || card.state === 1 || card.state === 3) {
                    // New, Learning, Relearning 状态视为待复习
                    cardStatus = 'pending';
                } else {
                    // 其他状态视为已忽略
                    cardStatus = 'dismissed';
                }
                
                return filter.cardStatus!.includes(cardStatus);
            });
        }
        
        return filtered;
    }
}

