/**
 * Neural Roam Queue
 * 神经漫游队列（重构版）
 * 
 * 使用新的 ConceptNeuralQueue 实现，专门为概念卡优化。
 * 
 * 核心功能：
 * - 只支持概念卡作为种子
 * - 邻居包括：反链、正链、描述符卡
 * - 简化的状态管理
 * - 清晰的漫游逻辑
 * 
 * @see concept-neural-roam-redesign.md
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import { QueueType } from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { ConceptNeuralQueue } from '../core/queue/neural/ConceptNeuralQueue';
import { resolveCardId } from '../diagnostics/type-guards';
import * as api from '../core/siyuan/api';

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
 * 使用新的 ConceptNeuralQueue 实现，专注于概念卡神经漫游。
 */
export class NeuralRoamQueue extends BaseReviewQueue {
    public name = 'NeuralRoamQueue';
    
    /**
     * 概念神经队列实例
     */
    private conceptQueue: ConceptNeuralQueue;

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

        // 创建概念神经队列实例
        this.conceptQueue = new ConceptNeuralQueue();

        // 加载持久化的种子块
        this.loadPersistedSeeds();

        console.log('[SiYuanMemo][NeuralRoamQueue] Initialized with ConceptNeuralQueue');
    }

    /**
     * 判断是否为动态队列
     * 
     * @returns false（静态队列，手动管理种子）
     */
    public isDynamic(): boolean {
        return false;
    }

    /**
     * 获取队列中的所有卡片
     * 
     * 神经漫游队列不支持预加载所有卡片，返回空数组
     * 
     * @returns 空数组
     */
    public async getCards(): Promise<FSRSCard[]> {
        return [];
    }

    /**
     * 添加卡片到队列
     * 
     * 对于神经漫游队列，添加卡片意味着添加种子块
     * 
     * @param card 卡片、队列项或块 ID
     * @param priority 优先级（'normal' | 'high'），默认 'normal'
     */
    public async addCard(card: FSRSCard | any | string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
        try {
            const blockId = typeof card === 'string' ? card : resolveCardId(card);
            
            if (!blockId) {
                console.error('[SiYuanMemo][NeuralRoamQueue] Invalid card or block ID');
                return;
            }

            await this.conceptQueue.addSeed(blockId, priority);
            await this.persistSeeds();
            
            console.log(`[SiYuanMemo][NeuralRoamQueue] Added seed: ${blockId} (priority: ${priority})`);
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to add seed:', error);
            throw error;
        }
    }

    /**
     * 从队列中移除卡片
     * 
     * 对于神经漫游队列，移除卡片意味着移除种子块
     * 
     * @param cardIdOrBlockId 卡片 ID 或块 ID
     */
    public async removeCard(cardIdOrBlockId: string): Promise<void> {
        try {
            this.conceptQueue.removeSeed(cardIdOrBlockId);
            await this.persistSeeds();
            
            console.log(`[SiYuanMemo][NeuralRoamQueue] Removed seed: ${cardIdOrBlockId}`);
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to remove seed:', error);
        }
    }

    /**
     * 处理卡片评分
     * 
     * 神经漫游队列不处理评分，由 FSRS 系统处理
     * 
     * @param cardId 卡片 ID
     * @param rating 评分
     */
    public async handleReview(cardId: string, rating: number): Promise<void> {
        // 神经漫游队列不处理评分
        console.log(`[SiYuanMemo][NeuralRoamQueue] Review handled by FSRS system: ${cardId}, rating: ${rating}`);
    }

    /**
     * 获取下一张卡片
     * 
     * 使用概念神经队列获取下一张卡片
     * 
     * @returns 下一张卡片，如果队列耗尽则返回 null
     */
    public async getNextCard(): Promise<FSRSCard | null> {
        try {
            console.log('[SiYuanMemo][NeuralRoamQueue] getNextCard called');
            console.log('[SiYuanMemo][NeuralRoamQueue] Current seeds:', this.conceptQueue.getSeeds());
            console.log('[SiYuanMemo][NeuralRoamQueue] Queue size:', this.conceptQueue.size());
            
            const queueItem = await this.conceptQueue.getNextCard();
            
            if (!queueItem) {
                console.log('[SiYuanMemo][NeuralRoamQueue] Queue exhausted');
                return null;
            }

            console.log('[SiYuanMemo][NeuralRoamQueue] Got queue item:', queueItem.blockId);
            
            // 转换为 FSRSCard
            const fsrsCard = await this.convertToFSRSCard(queueItem);
            return fsrsCard;
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to get next card:', error);
            return null;
        }
    }

    /**
     * 锁定当前卡片为种子
     * 
     * @param cardId 卡片 ID
     * @param priority 优先级（'normal' | 'high'），默认 'normal'
     */
    public async lockCurrentAsSeed(cardId: string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
        try {
            await this.conceptQueue.addSeed(cardId, priority);
            await this.persistSeeds();
            
            console.log(`[SiYuanMemo][NeuralRoamQueue] Locked as seed: ${cardId} (priority: ${priority})`);
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to lock seed:', error);
            throw error;
        }
    }

    /**
     * 清空历史记录
     */
    public clearHistory(): void {
        this.conceptQueue.clearHistory();
        console.log('[SiYuanMemo][NeuralRoamQueue] History cleared');
    }

    /**
     * 获取种子块列表
     * 
     * @returns 种子块 ID 列表
     */
    public getSeedBlocks(): string[] {
        return this.conceptQueue.getSeeds();
    }

    /**
     * 获取队列统计信息
     * 
     * @returns 统计信息
     */
    public getFilterStats(): { listBlocks: number; deletedBlocks: number; total: number } {
        return {
            listBlocks: 0,
            deletedBlocks: 0,
            total: 0,
        };
    }

    /**
     * 重新排序卡片
     * 
     * 神经漫游队列不支持重新排序
     * 
     * @returns false
     */
    public async reorder(): Promise<boolean> {
        console.warn('[SiYuanMemo][NeuralRoamQueue] Reorder not supported');
        return false;
    }

    /**
     * 获取所有项目（种子列表）
     * 
     * 返回所有种子块的信息，用于浏览器显示
     * 注意：不设置 deckId 和 rootId，让 loadQueueCards 从数据库查询真实值
     * 
     * @returns 种子项目列表
     */
    public getAllItems(): any[] {
        const seeds = this.conceptQueue.getSeeds();
        
        // 将种子 ID 转换为队列项格式
        // 注意：只设置必要的字段，让 loadQueueCards 补充其他信息
        return seeds.map(blockId => ({
            id: blockId,
            blockId: blockId,
            cardID: blockId,
            type: 'concept',
        }));
    }

    /**
     * 获取队列大小（种子数量）
     * 
     * @returns 种子数量
     */
    public async getSize(): Promise<number> {
        const seedCount = this.conceptQueue.getSeeds().length;
        console.log(`[SiYuanMemo][NeuralRoamQueue] getSize: returning ${seedCount} seeds`);
        return seedCount;
    }

    /**
     * 转换队列项为 FSRSCard
     * 
     * 根据块是否有答案来决定卡片类型：
     * - 有 custom-card-id 属性：item 卡片（普通复习界面）
     * - 没有 custom-card-id 属性：topic 卡片（虚拟卡，topic 界面）
     * 
     * @param queueItem 队列项
     * @returns FSRSCard
     */
    private async convertToFSRSCard(queueItem: any): Promise<FSRSCard> {
        const now = Date.now();
        
        // 检查块是否有 custom-card-id 属性（判断是否为真实卡片）
        let cardType: 'item' | 'topic' = 'topic'; // 默认为 topic（虚拟卡）
        
        try {
            const stmt = `
                SELECT value
                FROM attributes
                WHERE block_id = '${this.escapeSQL(queueItem.blockId)}'
                  AND name = 'custom-card-id'
            `;
            const rows = await api.sql(stmt);
            
            if (rows && rows.length > 0 && rows[0].value) {
                cardType = 'item'; // 有 custom-card-id，是真实卡片
                console.log(`[SiYuanMemo][NeuralRoamQueue] Block ${queueItem.blockId} is an item card`);
            } else {
                console.log(`[SiYuanMemo][NeuralRoamQueue] Block ${queueItem.blockId} is a topic card (virtual)`);
            }
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to check card type:', error);
        }
        
        return {
            id: queueItem.blockId,
            blockId: queueItem.blockId,
            due: now,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            lastReview: now,
            priority: 50,
            type: cardType, // 根据是否有答案设置类型
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
            // 神经上下文
            neuralContext: {
                associationType: queueItem.associationType,
                reason: queueItem.reason,
            },
        } as FSRSCard;
    }

    /**
     * SQL 转义
     */
    private escapeSQL(value: string): string {
        return value.replace(/'/g, "''");
    }

    /**
     * 加载持久化的种子块
     */
    private loadPersistedSeeds(): void {
        try {
            console.log('[SiYuanMemo][NeuralRoamQueue] Loading persisted seeds from:', this.STORAGE_KEY);
            const dataStr = localStorage.getItem(this.STORAGE_KEY);
            
            if (!dataStr) {
                console.log('[SiYuanMemo][NeuralRoamQueue] No persisted seeds found');
                return;
            }
            
            const data: SeedBlockData = JSON.parse(dataStr);
            console.log('[SiYuanMemo][NeuralRoamQueue] Parsed seed data:', data);
            
            if (data && data.seeds && Array.isArray(data.seeds)) {
                this.conceptQueue.restoreSeeds(data.seeds);
                console.log(`[SiYuanMemo][NeuralRoamQueue] Loaded ${data.seeds.length} persisted seeds:`, data.seeds);
            } else {
                console.warn('[SiYuanMemo][NeuralRoamQueue] Invalid seed data format');
            }
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to load persisted seeds:', error);
        }
    }

    /**
     * 持久化种子块
     */
    private async persistSeeds(): Promise<void> {
        try {
            const data: SeedBlockData = {
                seeds: this.conceptQueue.getSeeds(),
                currentSeed: null,
            };
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            console.log(`[SiYuanMemo][NeuralRoamQueue] Persisted ${data.seeds.length} seeds`);
        } catch (error) {
            console.error('[SiYuanMemo][NeuralRoamQueue] Failed to persist seeds:', error);
        }
    }
}
