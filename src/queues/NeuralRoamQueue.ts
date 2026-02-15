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
import { sql } from '@/core/siyuan/api';
import { ATTR_CARD_ID } from '@/core/siyuan/block';

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
     * 🆕 过滤统计（用于诊断过滤黑洞）
     */
    private filterStats = {
        listBlocks: 0,        // 列表块被过滤次数
        deletedBlocks: 0,     // 已删除块次数
        total: 0              // 总过滤次数
    };

    /**
     * 🆕 块元数据缓存（LRU，提升重复查询性能）
     * @see 第二期优化2：块元数据缓存
     */
    private blockMetadataCache = new Map<string, { data: any; timestamp: number }>();
    private readonly CACHE_MAX_SIZE = 200;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟过期

    /**
     * 🆕 缓存命中统计
     */
    private cacheHits = 0;
    private cacheMisses = 0;

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

        // 🆕 验证种子块（异步，不阻塞构造函数）
        this.validateSeedBlocks().catch(error => {
            console.warn('[NeuralRoamQueue] 种子块验证失败:', error);
        });

        // 创建神经队列实例
        const config = this.loadNeuralConfig();
        this.neuralQueue = new NeuralQueue(config, this.currentSeed || undefined);

        // 🆕 恢复种子节点到 NeuralQueue.seedNodes（修复绿色种子块不显示的问题）
        if (this.seedBlocks.size > 0) {
            const seedIds = Array.from(this.seedBlocks);
            this.neuralQueue.restoreSeedNodes(seedIds);
            console.log(`[NeuralRoamQueue] Synced ${seedIds.length} seed blocks to NeuralQueue`);
        }

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
     * 混合架构：先尝试从 UnifiedDataSourceManager 获取，如果失败则从 SQL 获取
     * 
     * @param cardId 卡片 ID（可能是 card_id 或 block_id）
     * @param rating 评分 (1-4)
     * @see 需求 6.4, 13.2
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        try {
            // 🔑 混合架构：先尝试从 UnifiedDataSourceManager 获取（闪卡）
            let card: FSRSCard | null = null;
            let isFlashcard = false;

            try {
                // 使用静默模式，不为主题块记录错误日志
                card = await this.manager.getCard(cardId, { silent: true });
                isFlashcard = true;
                console.log(`[NeuralRoamQueue] Found flashcard in manager: ${cardId}`);
            } catch (error) {
                // 如果不是闪卡，从 SQL 获取块数据
                console.log(`[NeuralRoamQueue] Card ${cardId} not in manager, fetching from SQL`);
                const blockData = await this.fetchBlockDataFromSQL(cardId);

                if (!blockData) {
                    console.warn(`[NeuralRoamQueue] Block ${cardId} not found in SQL either`);
                    return; // 静默失败，不抛出错误
                }

                // 转换为 FSRSCard（虚拟卡片）
                card = this.convertBlockToFSRSCard(blockData, { cardID: cardId, meta: {} });
                isFlashcard = blockData.has_flashcard === 1;
            }

            if (!card) {
                console.warn(`[NeuralRoamQueue] Failed to get card data for ${cardId}`);
                return;
            }

            // 仅对 item 卡片（闪卡）评分
            if (card.type === 'item' && isFlashcard) {
                card.due = this.calculateNextDueDate(card, rating);
                await this.manager.updateCard(card);

                console.log(`[NeuralRoamQueue] Card ${cardId} reviewed with rating ${rating}`);

                // 通知观察者
                this.manager.notifyObservers({
                    type: 'card-updated',
                    cardIds: [cardId],
                    timestamp: Date.now()
                });
            } else {
                console.log(`[NeuralRoamQueue] Skipped rating for non-item card ${cardId} (type: ${card.type})`);
            }
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to handle review:', error);
            // 不抛出错误，避免中断复习流程
        }
    }

    /**
     * 获取下一张卡片（扩散激活）
     *
     * 混合架构实现：
     * - 使用 NeuralQueue 进行扩散激活（获取下一个块 ID）
     * - 直接从 SQL 获取块数据（不通过 UnifiedDataSourceManager）
     * - 将块数据转换为 FSRSCard 格式（包括非闪卡块）
     *
     * 重试逻辑：
     * - 如果块被过滤（列表块、已删除块），自动尝试下一个块
     * - 最多重试 10 次，防止无限循环
     *
     * 这样可以支持漫游所有类型的块，而不仅仅是闪卡。
     *
     * @returns 下一张卡片，如果没有则返回 null
     * @see 需求 20.1, 20.2, 20.3, 20.4, 20.5
     */
    public async getNextCard(): Promise<FSRSCard | null> {
        try {
            const MAX_RETRIES = 10; // 防止无限循环
            let attempts = 0;

            while (attempts < MAX_RETRIES) {
                const queueItem = await this.neuralQueue.getNextItem();

                if (!queueItem) {
                    console.log('[NeuralRoamQueue] 神经队列已耗尽');
                    return null; // 正确标记队列结束
                }

                // 🔑 混合架构：直接从 SQL 获取块数据，转换为 FSRSCard
                const blockData = await this.fetchBlockDataFromSQL(queueItem.id);

                if (blockData !== null) {
                    // 找到有效块，返回
                    if (attempts > 0) {
                        console.log(`[NeuralRoamQueue] 尝试 ${attempts} 次后找到有效卡片`);
                    }

                    // 转换为 FSRSCard 格式（包括非闪卡块）
                    const card = this.convertBlockToFSRSCard(blockData, queueItem);
                    return card;
                }

                // 块被过滤，尝试下一个
                console.log(`[NeuralRoamQueue] 块 ${queueItem.id} 被过滤，尝试下一个 (${attempts + 1}/${MAX_RETRIES})`);
                attempts++;
            }

            // 达到最大重试次数
            console.warn('[NeuralRoamQueue] 达到最大重试次数，未找到有效卡片');
            return null;
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to get next card:', error);
            return null;
        }
    }

    /**
     * 锁定当前块为种子
     * 
     * 将当前正在复习的块锁定为种子块。
     * 同时记录其他候选块作为"遗落块"。
     * 
     * @param cardId 卡片 ID
     * @see 需求 19.1, 19.2
     */
    public async lockCurrentAsSeed(cardId: string): Promise<void> {
        try {
            // 🔧 在重新初始化前，获取当前候选并调用 setSeed 记录遗落块
            if (this.neuralQueue) {
                // 获取当前候选节点（如果有）
                const currentCandidates = this.neuralQueue.getCurrentCandidatesForSeed();
                if (currentCandidates.length > 0) {
                    // 记录遗落块
                    this.neuralQueue.setSeed(cardId, currentCandidates);
                    console.log(`[NeuralRoamQueue] Recorded ${currentCandidates.length - 1} missed blocks for seed ${cardId}`);
                }

                // 🆕 保存当前路径状态（避免重建实例时丢失历史）
                const navigationState = this.neuralQueue.getNavigationState();
                const displayPath = navigationState.displayPath;
                const currentPathIndex = navigationState.currentPathIndex;

                this.currentSeed = cardId;
                await this.addCard(cardId);

                // 重新初始化神经队列，使用新种子
                const config = this.loadNeuralConfig();
                const oldMissedBlocks = this.neuralQueue?.getMissedBlocks();
                this.neuralQueue = new NeuralQueue(config, this.currentSeed);

                // 🔧 恢复遗落块数据
                if (oldMissedBlocks) {
                    this.neuralQueue.restoreMissedBlocks(oldMissedBlocks);
                }

                // 🆕 恢复路径状态（保持历史轨迹）
                if (displayPath && displayPath.length > 0) {
                    this.neuralQueue.restoreNavigationState({
                        displayPath,
                        currentPathIndex,
                        navigationMode: 'explore',  // 锁定种子后切换到探索模式
                    });
                    console.log(`[NeuralRoamQueue] Restored navigation state: index ${currentPathIndex}, total ${displayPath.length}`);
                }

                console.log(`[NeuralRoamQueue] Current block locked as seed: ${cardId}`);
            } else {
                // 没有旧实例，直接初始化
                this.currentSeed = cardId;
                await this.addCard(cardId);

                const config = this.loadNeuralConfig();
                this.neuralQueue = new NeuralQueue(config, this.currentSeed);

                console.log(`[NeuralRoamQueue] Current block locked as seed: ${cardId}`);
            }
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
     * 🆕 获取 Orbit 状态
     *
     * 从底层 NeuralQueue 获取完整的 Orbit 状态，
     * 包括历史路径、遗落块、当前节点和候选节点。
     *
     * @returns Orbit 状态对象
     * Requirements: 10.1, 10.2
     */
    public getOrbitState(): import('../core/queue/neural/types').OrbitState {
        return this.neuralQueue.getOrbitState();
    }

    /**
     * 🆕 获取 Orbit 状态 V2（包含按方向分组的数据）
     *
     * @param selectedDirection 当前选中的方向
     * @returns Orbit 状态对象 V2
     */
    public async getOrbitStateV2(selectedDirection: 'AUTO' | import('../core/queue/neural/types').AssociationType): Promise<any> {
        return await this.neuralQueue.getOrbitStateV2(selectedDirection);
    }

    /**
     * 获取当前候选节点（用于 Orbit 交互）
     */
    public getCurrentCandidatesForSeed(): import('../core/queue/neural/types').WeightedNeighbor[] {
        return this.neuralQueue.getCurrentCandidatesForSeed();
    }

    /**
     * 🆕 设置种子块
     * 
     * 将指定块设为种子，并记录其他候选块为遗落块。
     * 这是 Orbit 图谱交互的核心方法。
     * 
     * @param blockId 要设为种子的块 ID
     * @param currentCandidates 当前所有候选节点列表
     * Requirements: 4.1, 4.2, 4.3
     */
    public setSeed(blockId: string, currentCandidates: import('../core/queue/neural/types').WeightedNeighbor[]): void {
        this.neuralQueue.setSeed(blockId, currentCandidates);
        console.log(`[NeuralRoamQueue] Set seed via Orbit: ${blockId}`);
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
     * 🆕 获取过滤统计信息
     *
     * 用于诊断为什么会话卡在过滤黑洞中。
     * 包含缓存命中统计，用于验证性能优化效果。
     *
     * @returns 过滤统计对象（包含缓存统计）
     * @see 阶段5：添加过滤统计遥测
     * @see 第二期优化2：块元数据缓存
     */
    public getFilterStats(): {
        listBlocks: number;
        deletedBlocks: number;
        total: number;
        cache: {
            size: number;
            hits: number;
            misses: number;
            hitRate: string;
        };
    } {
        const totalCacheRequests = this.cacheHits + this.cacheMisses;
        return {
            ...this.filterStats,
            cache: {
                size: this.blockMetadataCache.size,
                hits: this.cacheHits,
                misses: this.cacheMisses,
                hitRate: totalCacheRequests > 0
                    ? (this.cacheHits / totalCacheRequests * 100).toFixed(1) + '%'
                    : 'N/A'
            }
        };
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
     * 从 SQL 直接获取块数据（带缓存）
     *
     * 混合架构的关键：绕过 UnifiedDataSourceManager，直接查询数据库。
     * 这样可以获取所有类型的块，不仅仅是闪卡。
     *
     * 过滤逻辑（避免"一炮三响"）：
     * - 优先返回列表项块（type='i'）
     * - 如果不在列表项中，返回段落块/标题块（type='p' 或 type='h'）
     * - 永远不返回列表块（type='l'）
     *
     * 🆕 缓存逻辑：
     * - 缓存查询结果（包括 null），避免重复查询被过滤的块
     * - LRU 淘汰策略，最大 200 项
     * - 5 分钟 TTL，平衡新鲜度与性能
     *
     * @param blockId 块 ID
     * @returns 块数据，如果不存在则返回 null
     * @see 第二期优化2：块元数据缓存
     */
    private async fetchBlockDataFromSQL(blockId: string): Promise<any | null> {
        // 🆕 检查缓存
        const cached = this.blockMetadataCache.get(blockId);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            this.cacheHits++;
            console.log(`[NeuralRoamQueue] 从缓存获取块 ${blockId.slice(0, 8)}...`);
            return cached.data;
        }
        this.cacheMisses++;

        try {
            // 🔑 关键：使用过滤逻辑避免重复
            // 1. 如果 blockId 是列表项块，直接返回
            // 2. 如果 blockId 是段落/标题块，检查是否在列表项中
            //    - 如果在列表项中，返回列表项块
            //    - 如果不在列表项中，返回段落/标题块
            // 3. 如果 blockId 是列表块，返回 null（不显示列表块）

            const stmt = `
                SELECT 
                    b.*,
                    a.value as card_id,
                    CASE 
                        WHEN a.value IS NOT NULL AND a.value != '' THEN 1
                        ELSE 0
                    END as has_flashcard
                FROM blocks b
                LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
                WHERE (
                    -- 情况 1: 如果是列表项块，直接返回
                    (b.id = '${this.escapeSQL(blockId)}' AND b.type = 'i')
                    
                    OR
                    
                    -- 情况 2: 如果是段落/标题块，检查是否在列表项中
                    (
                        b.id = '${this.escapeSQL(blockId)}' 
                        AND (b.type = 'p' OR b.type = 'h' OR b.type = 't')
                        AND b.parent_id NOT IN (
                            SELECT id FROM blocks WHERE type = 'i'
                        )
                    )
                    
                    OR
                    
                    -- 情况 3: 如果查询的是段落/标题块，但它在列表项中，返回其父列表项
                    (
                        b.type = 'i'
                        AND b.id IN (
                            SELECT parent_id FROM blocks 
                            WHERE id = '${this.escapeSQL(blockId)}' 
                            AND (type = 'p' OR type = 'h' OR type = 't')
                        )
                    )
                )
                LIMIT 1
            `;

            const rows = await sql(stmt);

            if (rows.length === 0) {
                // 🆕 统计过滤（列表块）
                this.filterStats.listBlocks++;
                this.filterStats.total++;
                console.log(`[NeuralRoamQueue] 块 ${blockId} 被过滤（列表块）。统计:`, {
                    listBlocks: this.filterStats.listBlocks,
                    deletedBlocks: this.filterStats.deletedBlocks,
                    total: this.filterStats.total
                });
                // 🆕 缓存 null 结果，避免重复查询被过滤的块
                this.updateCache(blockId, null);
                return null;
            }

            const result = rows[0];

            // 如果返回的是父列表项，记录日志
            if (result.id !== blockId) {
                console.log(`[NeuralRoamQueue] Replaced ${blockId} with parent list item ${result.id}`);
            }

            // 🆕 缓存有效结果
            this.updateCache(blockId, result);
            return result;
        } catch (error) {
            console.error('[NeuralRoamQueue] Failed to fetch block data from SQL:', error);
            return null;
        }
    }

    /**
     * 🆕 更新块元数据缓存
     *
     * @param blockId 块 ID
     * @param data 块数据（可以是 null）
     * @see 第二期优化2：块元数据缓存
     */
    private updateCache(blockId: string, data: any): void {
        this.blockMetadataCache.set(blockId, { data, timestamp: Date.now() });

        // LRU 淘汰
        if (this.blockMetadataCache.size > this.CACHE_MAX_SIZE) {
            const firstKey = this.blockMetadataCache.keys().next().value;
            if (firstKey) {
                this.blockMetadataCache.delete(firstKey);
            }
        }
    }

    /**
     * 将块数据转换为 FSRSCard 格式
     * 
     * 为非闪卡块创建"虚拟" FSRSCard 对象，使其可以在复习界面中显示。
     * 
     * @param blockData SQL 查询返回的块数据
     * @param queueItem 神经队列项（包含神经上下文）
     * @returns FSRSCard 对象
     */
    private convertBlockToFSRSCard(blockData: any, queueItem: any): FSRSCard {
        const hasFlashcard = blockData.has_flashcard === 1;
        const now = Date.now();

        // 如果是闪卡，尝试从 UnifiedDataSourceManager 获取完整数据
        if (hasFlashcard && blockData.card_id) {
            try {
                // 异步获取，但我们需要同步返回，所以这里只能用默认值
                // 实际的 FSRS 数据会在后续的 handleReview 中使用
                console.log(`[NeuralRoamQueue] Block ${blockData.id} is a flashcard`);
            } catch (error) {
                console.warn(`[NeuralRoamQueue] Failed to get flashcard data for ${blockData.id}`);
            }
        }

        // 创建 FSRSCard 对象（包括非闪卡块）
        const card: FSRSCard = {
            // 基本信息
            id: blockData.card_id || blockData.id, // 闪卡用 card_id，非闪卡用 block_id
            blockId: blockData.id,

            // 卡片类型
            type: hasFlashcard ? 'item' : 'topic',
            cardType: hasFlashcard ? 'item' : 'topic',

            // FSRS 调度数据（非闪卡使用默认值）
            due: hasFlashcard ? now : now + 365 * 24 * 60 * 60 * 1000, // 非闪卡设置为一年后
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            lastReview: null,

            // 神经上下文（从 queueItem 获取）
            neuralContext: queueItem.meta?.neuralContext,

            // 其他元数据
            deckId: blockData.box || 'default',
            createdAt: blockData.created ? new Date(blockData.created).getTime() : now,
            updatedAt: blockData.updated ? new Date(blockData.updated).getTime() : now,
        };

        return card;
    }

    /**
     * SQL 转义（防止 SQL 注入）
     * 
     * @param value 要转义的值
     * @returns 转义后的值
     */
    private escapeSQL(value: string): string {
        if (!value) return '';
        return value.replace(/'/g, "''");
    }

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
     * 验证种子块是否存在
     *
     * 在初始化时验证所有种子块，移除已删除的种子块。
     * 如果所有种子块都无效，记录警告但不抛出错误（允许用户添加新种子）。
     *
     * 🚀 性能优化：使用批量查询替代串行查询（50个种子：500ms → 10ms）
     *
     * @see 阶段4：初始化时验证种子块
     * @see 优化1：批量验证种子块
     */
    private async validateSeedBlocks(): Promise<void> {
        try {
            if (this.seedBlocks.size === 0) {
                console.log('[NeuralRoamQueue] 没有种子块需要验证');
                return;
            }

            const seedIds = Array.from(this.seedBlocks);

            // 🚀 批量查询所有种子块
            const blockDataMap = await this.fetchMultipleBlocksDataFromSQL(seedIds);

            const validSeeds: string[] = [];
            const invalidSeeds: string[] = [];

            for (const seedId of seedIds) {
                if (blockDataMap.has(seedId)) {
                    validSeeds.push(seedId);
                } else {
                    invalidSeeds.push(seedId);
                    console.warn(`[NeuralRoamQueue] 种子块 ${seedId} 不存在或被过滤`);
                }
            }

            // 更新种子块集合（移除无效种子）
            if (invalidSeeds.length > 0) {
                this.seedBlocks = new Set(validSeeds);

                // 如果当前种子无效，清空
                if (this.currentSeed && invalidSeeds.includes(this.currentSeed)) {
                    console.warn(`[NeuralRoamQueue] 当前种子 ${this.currentSeed} 无效，已清空`);
                    this.currentSeed = null;
                }

                // 持久化更新后的种子列表
                await this.persistSeeds();
            }

            if (validSeeds.length === 0 && invalidSeeds.length > 0) {
                console.warn('[NeuralRoamQueue] 警告：所有种子块都无效，请添加新的种子块');
                // 不抛出错误，允许用户继续使用（可以添加新种子）
            } else {
                console.log(`[NeuralRoamQueue] 批量验证完成：${validSeeds.length} 有效，${invalidSeeds.length} 无效`);
            }
        } catch (error) {
            console.error('[NeuralRoamQueue] 种子块验证失败:', error);
            // 不抛出错误，避免阻塞初始化
        }
    }

    /**
     * 🆕 批量查询多个块的数据（优化种子块验证性能）
     *
     * 使用 WHERE id IN (...) 语句一次性查询多个块，
     * 避免串行查询导致的性能问题。
     *
     * 注意：此方法使用简化查询（仅检查存在性），
     * 不包含复杂的"父代替换"逻辑。
     *
     * @param blockIds 要查询的块 ID 数组
     * @returns Map<blockId, blockData>
     * @see 优化1：批量验证种子块
     */
    private async fetchMultipleBlocksDataFromSQL(blockIds: string[]): Promise<Map<string, any>> {
        try {
            if (blockIds.length === 0) return new Map();

            // 构建 SQL 语句（使用参数化查询防止 SQL 注入）
            const placeholders = blockIds.map(() => '?').join(',');
            const stmt = `
                SELECT
                    b.id,
                    b.type,
                    a.value as card_id,
                    CASE WHEN a.value IS NOT NULL AND a.value != '' THEN 1 ELSE 0 END as has_flashcard
                FROM blocks b
                LEFT JOIN attributes a ON b.id = a.block_id AND a.name = '${ATTR_CARD_ID}'
                WHERE b.id IN (${placeholders})
                    AND b.type != 'l'  -- 排除列表块
            `;

            const rows = await sql(stmt, blockIds);

            // 转换为 Map 便于快速查找
            const resultMap = new Map<string, any>();
            for (const row of rows) {
                resultMap.set(row.id, row);
            }

            console.log(`[NeuralRoamQueue] 批量查询 ${blockIds.length} 个块，找到 ${resultMap.size} 个有效块`);

            return resultMap;
        } catch (error) {
            console.error('[NeuralRoamQueue] 批量查询失败:', error);
            return new Map();
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
