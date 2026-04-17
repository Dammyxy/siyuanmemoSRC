/**
 * Final Drill Queue
 * 最终训练队列
 * 
 * 静态队列，仅包含手动管理的卡片。
 * 
 * 核心功能：
 * - 仅包含手动添加或自动失败的卡片
 * - 评分不计入调度算法
 * - 评分 4 移除卡片，1/2/3 保留
 * - 自动清理超过 3 天的自动失败卡片
 * - 持久化所有条目（包括源类型和时间戳）
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueAddSource, QueueReviewResult, QueueType } from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { QueuePersistencePort } from './ports';
import { loadQueueState, saveQueueState } from './queuePersistence';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FinalDrillQueue');

/**
 * 最终训练条目接口
 * 
 * 记录卡片的来源和添加时间。
 */
export interface FinalDrillEntry {
    cardId: string;
    source: 'manual' | 'auto-failed';
    timestamp: number;
}

interface FinalDrillRollbackSnapshot {
    temporaryBlacklist: string[];
    customOrder: string[] | null;
    entries: FinalDrillEntry[];
}

function isFinalDrillRollbackSnapshot(value: unknown): value is FinalDrillRollbackSnapshot {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as {
        temporaryBlacklist?: unknown;
        customOrder?: unknown;
        entries?: unknown;
    };

    if (!Array.isArray(candidate.temporaryBlacklist)) {
        return false;
    }
    if (!(candidate.customOrder === null || Array.isArray(candidate.customOrder))) {
        return false;
    }
    if (!Array.isArray(candidate.entries)) {
        return false;
    }

    return true;
}

/**
 * 最终训练队列类
 * 
 * 静态队列，仅包含手动管理的卡片。
 * 
 * 队列行为：
 * - 仅包含手动添加或自动失败的卡片
 * - 评分不计入调度算法（练习模式）
 * - 评分 4：从队列移除
 * - 评分 1/2/3：保留在队列中
 * - 自动清理超过 3 天的自动失败卡片
 * - 手动添加的卡片永久保留
 * 
 * @see 需求 6.1, 6.3, 8.1, 8.2, 8.3, 9.4, 9.5, 13.1, 13.3, 13.5
 */
export class FinalDrillQueue extends BaseReviewQueue {
    public name = 'FinalDrillQueue';
    /**
     * 队列条目映射
     * 
     * 键：卡片 ID
     * 值：条目信息（来源和时间戳）
     */
    private entries: Map<string, FinalDrillEntry>;
    
    /**
     * 自动清理天数阈值
     * 
     * 超过此天数的自动失败卡片将被自动清理。
     */
    private readonly AUTO_CLEANUP_DAYS = 3;
    
    /**
     * FlipElement 算法参数
     * 
     * 基于 SuperMemo 的 Final Drill 动态算法：
     * FlipElement(5, 3, 6)
     * 
     * @see H:\project-F\flashcard\资料\supermemo\finaldrill.md
     */
    private readonly FLIP_LOWEST_PICK = 5;
    private readonly FLIP_LOWEST_INSERT = 3;
    private readonly FLIP_HIGHEST_INSERT = 6;
    
    /**
     * 持久化存储键
     */
    private readonly STORAGE_KEY = 'finalDrillQueue';
    
    /**
     * 队列持久化服务
     */
    private readonly queuePersistence: QueuePersistencePort;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param queuePersistence 队列持久化服务（依赖注入）
     */
    constructor(manager: UnifiedDataSourceManager, queuePersistence: QueuePersistencePort) {
        super(manager, QueueType.FinalDrill);
        
        this.queuePersistence = queuePersistence;
        this.entries = new Map<string, FinalDrillEntry>();
        
        // 注意：不在构造函数中调用 load()，由外部调用
        // this.loadPersistedEntries();
        
        // 启动时自动清理过期的自动失败卡片
        this.cleanupExpiredAutoFailed().catch(error => {
            logger.error('Failed to cleanup expired auto-failed cards on startup:', error);
        });
    }
    
    /**
     * 从持久化服务加载状态
     * 
     * 加载队列条目（包括来源和时间戳）。
     * 如果没有保存的数据，初始化为空 Map。
     * 
     * @see 需求 4.2, 4.5, 13.1, 13.3
     */
    async load(): Promise<void> {
        const { value: data, fromStorage } = loadQueueState<FinalDrillEntry[]>({
            persistence: this.queuePersistence,
            key: this.STORAGE_KEY,
            initialValue: [],
            validate: (candidate): candidate is FinalDrillEntry[] => Array.isArray(candidate),
            logger,
            context: 'FinalDrillQueue',
        });

        this.entries = new Map();
        for (const entry of data) {
            this.entries.set(entry.cardId, entry);
        }

        if (fromStorage) {
            logger.info(`Loaded ${this.entries.size} entries`);
        } else {
            logger.info('No saved data found, starting with empty queue');
        }
    }
    
    /**
     * 保存状态到持久化服务
     * 
     * 保存队列条目列表。
     * 使用键名 "finalDrillQueue"。
     * 
     * @see 需求 4.2, 4.5, 4.6, 13.1
     */
    async save(): Promise<void> {
        const data = Array.from(this.entries.values());
        await saveQueueState({
            persistence: this.queuePersistence,
            key: this.STORAGE_KEY,
            value: data,
            logger,
            context: 'FinalDrillQueue',
        });
        logger.info(`Saved ${data.length} entries`);
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns false（静态队列）
     * @see 需求 6.1
     */
    public isDynamic(): boolean {
        return false;
    }

    protected override buildDefaultOrder(cards: FSRSCard[]): FSRSCard[] {
        return super.buildDefaultOrder(cards, {
            mode: 'priority-due',
        });
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 使用 SuperMemo 的 FlipElement 动态算法：
     * 1. 🆕 等待持久化数据加载完成（如果还未加载）
     * 2. 清理过期的自动失败卡片
     * 3. 获取所有条目对应的卡片数据（按插入顺序）
     * 4. 执行 FlipElement(5, 3, 6) 局部洗牌
     * 
     * FlipElement 算法：
     * - 从位置 5 或更后面随机选择一张卡片
     * - 将它移动到位置 3-6 之间的随机位置
     * - 保持大致顺序，但避免卡片一直待在队尾
     * 
     * 注意：每次调用都会执行 FlipElement，确保每次复习前都重新洗牌
     * 
     * @returns 卡片数组（经过 FlipElement 处理的顺序）
     * @see 需求 6.1, 9.4, 13.5
     * @see H:\project-F\flashcard\资料\supermemo\finaldrill.md
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            await this.ensureInitialLoad();
            
            // 清理过期的自动失败卡片
            await this.cleanupExpiredAutoFailed();
            
            // 获取所有卡片（按 Map 的插入顺序）
            const cards: FSRSCard[] = [];
            const cardsToRemove: string[] = [];
            
            for (const entry of this.entries.values()) {
                try {
                    // 使用 silent 选项避免记录错误日志
                    const card = await this.manager.getCard(entry.cardId, { silent: true });
                    cards.push(card);
                } catch (error) {
                    // 如果卡片不存在，标记为待移除
                    logger.debug(`Card ${entry.cardId} not found, removing from queue`);
                    cardsToRemove.push(entry.cardId);
                }
            }
            
            // 批量移除不存在的卡片
            for (const cardId of cardsToRemove) {
                this.entries.delete(cardId);
            }
            
            // 持久化（如果有卡片被移除）
            if (cardsToRemove.length > 0) {
                await this.save();
            }
            
            // ⚠️ 重要：每次调用都执行 FlipElement 算法
            // 这样可以确保每次复习前都重新洗牌，避免总是复习同一张卡片
            const visibleCards = cards.filter((card) => !isCardDismissed(card));

            if (visibleCards.length > 0) {
                this.applyFlipElement(visibleCards);
                logger.debug(`Applied FlipElement algorithm to ${visibleCards.length} cards`);
            }
            
            return this.cacheResolvedCards(visibleCards, 'reconciled');
        } catch (error) {
            logger.error('Failed to get cards:', error);
            throw error;
        }
    }
    
    /**
     * 添加卡片到队列
     * 
     * 添加逻辑：
     * - 如果卡片已存在且为手动添加，不覆盖
     * - 如果卡片已存在且为自动失败，可以被手动添加覆盖
     * - 新卡片记录来源和时间戳
     * 
     * @param cardId 卡片 ID
     * @param source 来源类型（'manual' 或 'auto-failed'）
     * @see 需求 6.1, 9.1, 9.5, 6.4
     */
    public async addCard(card: FSRSCard | QueueItem | string, source: QueueAddSource = 'manual'): Promise<void> {
        try {
            await this.ensureInitialLoad();
            const cardId = resolveCardId(card);

            const normalizedSource: FinalDrillEntry['source'] = source === 'auto-failed' ? 'auto-failed' : 'manual';
            const changed = this.addOrUpdateEntry(cardId, normalizedSource);
            if (!changed) {
                return;
            }

            await this.persistEntries({ emitQueueChanged: true });
            
            logger.info(`Card ${cardId} added with source ${normalizedSource}`);
        } catch (error) {
            logger.error('Failed to add card:', error);
            throw error;
        }
    }
    
    /**
     * 从队列中移除卡片
     * 
     * @param cardId 卡片 ID
     * @see 需求 6.1, 8.2
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            await this.ensureInitialLoad();
            const changed = this.removeEntry(cardIdOrBlockId);
            if (!changed) {
                return;
            }
            await this.persistEntries();
            logger.info(`Card ${cardIdOrBlockId} removed`);
        } catch (error) {
            logger.error('Failed to remove card:', error);
            throw error;
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 复习逻辑：
     * - 评分不计入调度算法（练习模式）
     * - 评分 4：从队列移除
     * - 评分 1/2/3：将卡片移到队列后面，确保下次 FlipElement 可以选中它
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 8.1, 8.2, 8.3
     */
    public async handleReview(cardId: string, rating: number): Promise<QueueReviewResult> {
        try {
            await this.ensureInitialLoad();
            // 注意：评分不计入调度算法
            // 不更新卡片的到期日期或其他调度数据
            
            if (rating === 4) {
                // 评分 4：从队列移除
                await this.removeCard(cardId);
                logger.info(`Card ${cardId} reviewed with rating 4, removed from queue`);
                this.emitQueueChangedEvent();
                const counterSnapshot = await this.getCounterSnapshot(true);
                return {
                    updatedCard: null,
                    removedFromQueue: true,
                    remainsInQueue: false,
                    queueChanged: true,
                    requiresCurrentViewReorder: false,
                    counterSnapshot,
                    version: counterSnapshot.version,
                };
            } else {
                // 评分 1/2/3：将卡片移到队列后面
                // 这样下次 FlipElement 可以选中它，避免总是复习同一张卡片
                await this.moveCardToBack(cardId);
                logger.info(`Card ${cardId} reviewed with rating ${rating}, moved to back`);
                this.emitQueueChangedEvent();
                const counterSnapshot = await this.getCounterSnapshot(true);
                return {
                    updatedCard: null,
                    removedFromQueue: false,
                    remainsInQueue: true,
                    queueChanged: true,
                    requiresCurrentViewReorder: true,
                    counterSnapshot,
                    version: counterSnapshot.version,
                };
            }
        } catch (error) {
            logger.error('Failed to handle review:', error);
            throw error;
        }
    }

    public override async skip(cardId: string): Promise<void> {
        try {
            await this.ensureInitialLoad();

            if (!this.entries.has(cardId)) {
                logger.warn(`Card ${cardId} not found in queue`);
                return;
            }

            await this.moveCardToBack(cardId);
            this.emitQueueChangedEvent();
            logger.info(`Card ${cardId} skipped, moved to back`);
        } catch (error) {
            logger.error('Failed to skip card:', error);
            throw error;
        }
    }
    
    /**
     * 获取条目信息
     * 
     * 用于调试和测试。
     * 
     * @param cardId 卡片 ID
     * @returns 条目信息，如果不存在则返回 undefined
     */
    public getEntry(cardId: string): FinalDrillEntry | undefined {
        return this.entries.get(cardId);
    }
    
    /**
     * 获取所有条目
     * 
     * 用于调试和测试。
     * 
     * @returns 所有条目数组
     */
    public getAllEntries(): FinalDrillEntry[] {
        return Array.from(this.entries.values());
    }

    public override async createRollbackSnapshot(): Promise<FinalDrillRollbackSnapshot> {
        const base = await super.createRollbackSnapshot();
        return {
            temporaryBlacklist: [...base.temporaryBlacklist],
            customOrder: base.customOrder ? [...base.customOrder] : null,
            entries: this.getAllEntries().map(entry => ({ ...entry })),
        };
    }

    public override async restoreRollbackSnapshot(snapshot: unknown): Promise<void> {
        if (!isFinalDrillRollbackSnapshot(snapshot)) {
            throw new Error('[FinalDrillQueue] Invalid rollback snapshot');
        }

        await super.restoreRollbackSnapshot(snapshot);
        this.entries = new Map(snapshot.entries.map(entry => [entry.cardId, { ...entry }]));
        this.cards = [];
        this.clearSizeCache();
        await this.save();
    }
    
    /**
     * 重新排序队列
     * 
     * 最终训练队列支持手动重排序。
     * 重排序逻辑：
     * 1. 将 entries Map 转换为数组
     * 2. 根据 orderedCards 的顺序重新排列
     * 3. 更新 entries Map（使用 Map 保持插入顺序）
     * 4. 持久化新顺序
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功
     */
    public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
        try {
            await this.ensureInitialLoad();
            logger.info(`Reordering ${orderedCards.length} cards`);
            
            // 创建新的 Map 以保持顺序
            const newEntries = new Map<string, FinalDrillEntry>();
            
            // 按照 orderedCards 的顺序重新添加条目
            for (const card of orderedCards) {
                const entry = this.entries.get(card.id);
                if (entry) {
                    newEntries.set(card.id, entry);
                }
            }
            
            // 添加不在 orderedCards 中的条目（保持在末尾）
            for (const [cardId, entry] of this.entries.entries()) {
                if (!newEntries.has(cardId)) {
                    newEntries.set(cardId, entry);
                }
            }
            
            // 更新 entries
            this.entries = newEntries;
            
            // 持久化新顺序
            await this.save();
            this.invalidateCachedCards();
            this.clearSizeCache();
            
            logger.info('Reorder completed successfully');
            return true;
        } catch (error) {
            logger.error('Failed to reorder:', error);
            return false;
        }
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================

    private addOrUpdateEntry(cardId: string, source: 'manual' | 'auto-failed'): boolean {
        const existing = this.entries.get(cardId);

        if (existing?.source === 'manual') {
            // 手动添加的卡片不覆盖
            logger.debug(`Card ${cardId} already exists as manual, skipping`);
            return false;
        }

        if (existing?.source === 'auto-failed' && source === 'auto-failed') {
            // 自动失败的卡片重复添加，不更新时间戳（保留最早失败时间）
            logger.debug(`Card ${cardId} already exists as auto-failed, keeping original timestamp`);
            return false;
        }

        this.entries.set(cardId, {
            cardId,
            source,
            timestamp: Date.now(),
        });

        return true;
    }

    private removeEntry(cardId: string): boolean {
        if (!this.entries.has(cardId)) {
            return false;
        }
        this.entries.delete(cardId);
        return true;
    }

    private async persistEntries(options: { emitQueueChanged?: boolean } = {}): Promise<void> {
        await this.save();
        this.invalidateCachedCards();
        this.clearSizeCache();
        if (options.emitQueueChanged) {
            this.emitQueueChangedEvent();
        }
    }
    
    /**
     * 将卡片移到队列后面
     * 
     * 将卡片从当前位置移除，然后添加到队列末尾。
     * 这样可以确保下次 FlipElement 可以选中它，避免总是复习同一张卡片。
     * 
     * Map 保持插入顺序，所以删除后重新添加会将卡片移到末尾。
     * 
     * @param cardId 卡片 ID
     */
    private async moveCardToBack(cardId: string): Promise<void> {
        const entry = this.entries.get(cardId);
        if (!entry) {
            logger.warn(`Card ${cardId} not found in queue`);
            return;
        }
        
        // 从当前位置移除
        this.entries.delete(cardId);
        
        // 重新添加到队列末尾（Map 保持插入顺序）
        this.entries.set(cardId, entry);
        
        // 持久化
        await this.save();
        this.invalidateCachedCards();
        this.clearSizeCache();
        
        logger.debug(`Card ${cardId} moved to back of queue`);
    }
    
    /**
     * 应用 SuperMemo 的 FlipElement 算法
     * 
     * FlipElement(lowestPick, lowestInsert, highestInsert)
     * 
     * 算法步骤：
     * 1. 从位置 >= lowestPick 随机选择一张卡片
     * 2. 将它移动到 [lowestInsert, highestInsert] 之间的随机位置
     * 3. 如果原位置 == 新位置，向后移动 1 位
     * 4. 如果移动后超出队列大小，则停止
     * 
     * 注意：位置从 1 开始计数（SuperMemo 规范），但数组索引从 0 开始
     * 
     * @param cards 卡片数组（会被原地修改）
     * @see H:\project-F\flashcard\资料\supermemo\finaldrill.md
     */
    private applyFlipElement(cards: FSRSCard[]): void {
        const queueSize = cards.length;
        
        // 需要至少 lowestPick 张卡片才能洗牌
        if (queueSize < this.FLIP_LOWEST_PICK) {
            return;
        }
        
        // 从 [lowestPick, queueSize) 随机选择一个位置
        // 注意：规范中位置从 1 开始，代码中从 0 开始
        const pickStart = this.FLIP_LOWEST_PICK - 1; // 转换为 0 索引
        const pickEnd = queueSize - 1;
        const pickPos = pickStart + Math.floor(Math.random() * (pickEnd - pickStart + 1));
        
        // 从 [lowestInsert, highestInsert] 随机选择插入位置
        const insertStart = this.FLIP_LOWEST_INSERT - 1; // 转换为 0 索引
        const insertEnd = Math.min(this.FLIP_HIGHEST_INSERT - 1, queueSize - 1); // 不超过队列大小
        let insertPos = insertStart + Math.floor(Math.random() * (insertEnd - insertStart + 1));
        
        // 重叠检查：如果 pick == insert，向后移动 1 位
        if (pickPos === insertPos) {
            insertPos = pickPos + 1;
            // 如果移动后超出队列大小，停止
            if (insertPos >= queueSize) {
                return;
            }
        }
        
        // 执行洗牌
        const card = cards[pickPos];
        
        // 从原位置移除
        cards.splice(pickPos, 1);
        
        // 调整插入位置（如果在移除点之前移除了一个元素）
        const adjustedInsertPos = pickPos < insertPos ? insertPos - 1 : insertPos;
        
        // 插入到新位置
        cards.splice(adjustedInsertPos, 0, card);
        
        logger.debug(`FlipElement: picked pos ${pickPos + 1}, inserted at pos ${adjustedInsertPos + 1}, card ${card.id}`);
    }
    
    /**
     * 清理过期的自动失败卡片
     * 
     * 删除时间戳超过 3 天的自动失败卡片。
     * 手动添加的卡片不受影响。
     * 
     * @see 需求 9.4, 13.5
     */
    private async cleanupExpiredAutoFailed(): Promise<void> {
        try {
            const now = Date.now();
            const threeDaysMs = this.AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
            
            let cleanedCount = 0;
            for (const [cardId, entry] of this.entries.entries()) {
                if (entry.source === 'auto-failed' && now - entry.timestamp > threeDaysMs) {
                    this.entries.delete(cardId);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                await this.save();
                logger.info(`Cleaned up ${cleanedCount} expired auto-failed cards`);
            }
        } catch (error) {
            logger.error('Failed to cleanup expired auto-failed cards:', error);
            throw error;
        }
    }
    
}
