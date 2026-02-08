/**
 * Neural Roam Queue
 * 神经漫游队列
 * 
 * 静态队列，集成现有的神经漫游实现。
 * 
 * 核心功能：
 * - 支持所有类型的块（item、topic、普通块）
 * - 种子块管理和锁定功能
 * - 扩散激活（基于链接、层级、标签、兄弟块）
 * - 加权随机游走
 * - 历史过滤避免重复
 * - 评分计入调度（仅 item 卡片），永不自动移除
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType } from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import type { QueueItem } from '../core/queue/types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { NeuralQueue } from '../core/queue/neural/NeuralQueue';
import { NeuralQueueStorage } from '../core/queue/neural/NeuralQueueStorage';
import type { NeuralQueueConfig } from '../core/queue/neural/types';
import { resolveCardId } from '../diagnostics/type-guards';

/**
 * 种子块数据接口
 */
interface SeedBlockData {
    seeds: string[];
    currentSeed: string | null;
}

/**
 * 神经漫游队列类
 * 
 * 静态队列，集成现有的神经漫游实现。
 * 
 * 队列行为：
 * - 支持所有类型的块（item、topic、普通块）
 * - 种子块管理：添加、移除、锁定
 * - 扩散激活：从种子块开始，基于知识图谱关系发现相关块
 * - 评分计入调度（仅 item 卡片），永不自动移除
 * 
 * @see 需求 6.2, 6.4, 6.5, 13.2, 13.4, 19.1-19.5, 20.1-20.5, 21.1-21.5
 */
export class NeuralRoamQueue extends BaseReviewQueue {
    public name = 'NeuralRoamQueue';
    /**
     * 现有神经队列实例
     */
    private neuralQueue: NeuralQueue;
    
    /**
     * 种子块集合（用户锁定的种子）
     */
    private seedBlocks: Set<string>;
    
    /**
     * 当前激活的种子块
     */
    private currentSeed: string | null;
    
    /**
     * 持久化存储键
     */
    private readonly STORAGE_KEY = 'neural-roam-seeds';
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: UnifiedDataSourceManager) {
        super(manager, QueueType.NeuralRoam);
        
        // 初始化种子块集合
        this.seedBlocks = new Set<string>();
        this.currentSeed = null;
        this.loadPersistedSeeds();
        
        // 创建神经队列实例
        const config = this.loadNeuralConfig();
        this.neuralQueue = new NeuralQueue(config, this.currentSeed || undefined);
        
        console.log('[NeuralRoamQueue] Initialized with', this.seedBlocks.size, 'seed blocks');
    }
    
    /**
     * 判断是否为动态队列
     * 
     * @returns false（静态队列，手动管理种子）
     * @see 需求 6.2
     */
    public isDynamic(): boolean {
        return false;
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 神经漫游队列返回种子块列表。
     * 历史记录可以通过 getHistorySnapshot() 获取。
     * 
     * @returns 种子块卡片数组
     * @see 需求 6.2, 20.4
     */
    public async getCards(): Promise<FSRSCard[]> {
        try {
            // 返回种子块列表
            const cards: FSRSCard[] = [];
            for (const seedId of this.seedBlocks) {
                try {
                    const card = await this.manager.getCard(seedId);
                    cards.push(card);
                } catch (error) {
                    console.warn(`[NeuralRoamQueue] Seed block ${seedId} not found`);
                }
            }
            
            return cards;
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to get cards:', error);
            throw error;
        }
    }
    
    /**
     * 添加种子块
     * 
     * 将块锁定为种子，用于漫游起点。
     * 
     * @param cardId 卡片 ID
     * @see 需求 19.2, 19.5, 6.4
     */
    public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
        try {
            const cardId = resolveCardId(card);
            this.seedBlocks.add(cardId);
            await this.persistSeeds();
            
            // 触发观察者通知（需求 6.4：卡片添加的队列统计更新）
            this.manager.notifyObservers({
                type: 'queue-changed',
                queueType: this.getType(),
                timestamp: Date.now()
            });
            
            console.log(`[NeuralRoamQueue] Seed block added: ${cardId}`);
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to add seed block:', error);
            throw error;
        }
    }
    
    /**
     * 移除种子块
     * 
     * @param cardId 卡片 ID
     * @see 需求 19.2
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            this.seedBlocks.delete(cardIdOrBlockId);
            
            // 如果移除的是当前种子，清空当前种子
            if (this.currentSeed === cardIdOrBlockId) {
                this.currentSeed = null;
            }
            
            await this.persistSeeds();
            console.log(`[NeuralRoamQueue] Seed block removed: ${cardIdOrBlockId}`);
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to remove seed block:', error);
            throw error;
        }
    }
    
    /**
     * 处理卡片复习
     * 
     * 神经漫游队列的复习逻辑：
     * - 对于 item 卡片：评分计入调度
     * - 对于 topic 卡片：不评分，支持插入和跳过操作
     * - 永不自动移除卡片
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 6.4, 13.2
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        try {
            const card = await this.manager.getCard(cardId);
            
            // 仅对 item 卡片评分
            if (card.type === 'item') {
                card.due = this.calculateNextDueDate(card, rating);
                await this.manager.updateCard(card);
                
                console.log(`[NeuralRoamQueue] Card ${cardId} reviewed with rating ${rating}`);
            } else {
                console.log(`[NeuralRoamQueue] Skipped rating for non-item card ${cardId}`);
            }
            
            // 通知观察者
            this.manager.notifyObservers({
                type: 'card-updated',
                cardIds: [cardId],
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to handle review:', error);
            throw error;
        }
    }
    
    /**
     * 获取下一张卡片（扩散激活）
     * 
     * 使用现有的神经队列实现获取下一张卡片。
     * 
     * @returns 下一张卡片，如果没有则返回 null
     * @see 需求 20.1, 20.2, 20.3, 20.4, 20.5
     */
    public async getNextCard(): Promise<FSRSCard | null> {
        try {
            const queueItem = await this.neuralQueue.getNextItem();
            if (!queueItem) {
                console.log('[NeuralRoamQueue] No more cards available');
                return null;
            }
            
            // 转换为 FSRSCard 对象
            const card = await this.manager.getCard(queueItem.cardID);
            return card;
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to get next card:', error);
            return null;
        }
    }
    
    /**
     * 锁定当前块为种子
     * 
     * 将当前正在复习的块锁定为种子块。
     * 
     * @param cardId 卡片 ID
     * @see 需求 19.1, 19.2
     */
    public async lockCurrentAsSeed(cardId: string): Promise<void> {
        try {
            this.currentSeed = cardId;
            await this.addCard(cardId);
            
            // 重新初始化神经队列，使用新种子
            const config = this.loadNeuralConfig();
            this.neuralQueue = new NeuralQueue(config, this.currentSeed);
            
            console.log(`[NeuralRoamQueue] Current block locked as seed: ${cardId}`);
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to lock current as seed:', error);
            throw error;
        }
    }
    
    /**
     * 从指定种子开始漫游
     * 
     * @param seedId 种子块 ID
     * @see 需求 19.3, 19.4
     */
    public async startRoamingFromSeed(seedId: string): Promise<void> {
        try {
            this.currentSeed = seedId;
            
            // 重新初始化神经队列
            const config = this.loadNeuralConfig();
            this.neuralQueue = new NeuralQueue(config, this.currentSeed);
            
            console.log(`[NeuralRoamQueue] Started roaming from seed: ${seedId}`);
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to start roaming from seed:', error);
            throw error;
        }
    }
    
    /**
     * 清空历史记录
     * 
     * @see 需求 21.5
     */
    public clearHistory(): void {
        this.neuralQueue.clearHistory();
        console.log('[NeuralRoamQueue] History cleared');
    }
    
    /**
     * 获取所有种子块
     * 
     * @returns 种子块 ID 数组
     * @see 需求 19.4
     */
    public getSeedBlocks(): string[] {
        return Array.from(this.seedBlocks);
    }
    
    /**
     * 获取当前种子
     * 
     * @returns 当前种子块 ID，如果没有则返回 null
     * @see 需求 19.4
     */
    public getCurrentSeed(): string | null {
        return this.currentSeed;
    }
    
    /**
     * 获取历史快照
     * 
     * @returns 历史记录中的卡片 ID 数组
     */
    public getHistorySnapshot(): string[] {
        return this.neuralQueue.getHistorySnapshot();
    }
    
    /**
     * 恢复历史记录
     * 
     * @param snapshot 历史快照
     */
    public restoreHistory(snapshot: string[]): void {
        this.neuralQueue.restoreHistory(snapshot);
        console.log(`[NeuralRoamQueue] History restored with ${snapshot.length} cards`);
    }
    
    /**
     * 重新排序队列
     * 
     * 神经漫游队列支持重排序种子块列表。
     * 注意：这不会影响扩散激活的顺序，仅影响种子块的显示顺序。
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功
     */
    public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
        try {
            console.log(`[NeuralRoamQueue] Reordering ${orderedCards.length} seed blocks`);
            
            // 创建新的 Set 以保持顺序（虽然 Set 不保证顺序，但我们可以用数组）
            const newSeeds: string[] = [];
            
            // 按照 orderedCards 的顺序重新添加种子
            for (const card of orderedCards) {
                if (this.seedBlocks.has(card.id)) {
                    newSeeds.push(card.id);
                }
            }
            
            // 添加不在 orderedCards 中的种子（保持在末尾）
            for (const seedId of this.seedBlocks) {
                if (!newSeeds.includes(seedId)) {
                    newSeeds.push(seedId);
                }
            }
            
            // 更新种子块集合
            this.seedBlocks = new Set(newSeeds);
            
            // 持久化新顺序
            await this.persistSeeds();
            
            console.log(`[NeuralRoamQueue] Reorder completed successfully`);
            return true;
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to reorder:', error);
            return false;
        }
    }
    
    // ========================================================================
    // 私有辅助方法
    // ========================================================================
    
    /**
     * 计算下次到期日期
     * 
     * 使用简化的 FSRS 算法计算下次复习日期。
     */
    private calculateNextDueDate(card: FSRSCard, rating: number): number {
        const currentInterval = card.scheduledDays || 1;
        const newInterval = rating === 3 ? currentInterval * 2 : currentInterval * 4;
        const now = Date.now();
        return now + newInterval * 24 * 60 * 60 * 1000;
    }
    
    /**
     * 加载神经队列配置
     * 
     * 从存储加载配置，或使用默认配置。
     */
    private loadNeuralConfig(): Partial<NeuralQueueConfig> {
        try {
            return NeuralQueueStorage.loadConfig();
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to load neural config:', error);
            return {};
        }
    }
    
    /**
     * 从持久化存储加载种子块
     * 
     * @see 需求 19.5
     */
    private loadPersistedSeeds(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const data: SeedBlockData = JSON.parse(stored);
                this.seedBlocks = new Set(data.seeds || []);
                this.currentSeed = data.currentSeed || null;
                console.log(`[NeuralRoamQueue] Loaded ${this.seedBlocks.size} seed blocks from storage`);
            }
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to load persisted seeds:', error);
            this.seedBlocks = new Set();
            this.currentSeed = null;
        }
    }
    
    /**
     * 持久化种子块到存储
     * 
     * @see 需求 19.5
     */
    private async persistSeeds(): Promise<void> {
        try {
            const data: SeedBlockData = {
                seeds: Array.from(this.seedBlocks),
                currentSeed: this.currentSeed
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            console.log(`[NeuralRoamQueue] Persisted ${this.seedBlocks.size} seed blocks`);
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to persist seeds:', error);
            throw error;
        }
    }
    
    /**
     * ✅ 兼容方法：获取所有队列项（同步）
     * 
     * 这是为了兼容旧架构的 getAllItems() 方法。
     * 新代码应该使用 getAllCards() 方法。
     * 
     * @deprecated 使用 getAllCards() 代替
     */
    public getAllItems(): any[] {
        console.warn('[NeuralRoamQueue] getAllItems() is deprecated, use getAllCards() instead');
        // 返回当前缓存的卡片
        return this.cards;
    }
}
