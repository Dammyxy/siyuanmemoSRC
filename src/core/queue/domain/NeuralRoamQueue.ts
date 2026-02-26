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
import { QueueType } from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem as ReviewQueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { NeuralRoamCardTypeResolverPort, QueuePersistencePort } from './ports';
import { loadQueueState, saveQueueState } from './queuePersistence';
import { ConceptNeuralQueue, type QueueItem as ConceptQueueItem } from '../neural/ConceptNeuralQueue';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NeuralRoamQueue');

/**
 * 种子块数据接口
 */
interface SeedBlockData {
    seeds: string[];
    currentSeed: string | null;
}

interface NeuralRoamQueueOptions {
    cardTypeResolver?: NeuralRoamCardTypeResolverPort;
}

interface NeuralRoamSeedItem {
    id: string;
    blockId: string;
    cardID: string;
    type: 'concept';
}

const DEFAULT_CARD_TYPE_RESOLVER: NeuralRoamCardTypeResolverPort = {
    async resolveCardType(): Promise<'item' | 'topic'> {
        return 'topic';
    }
};

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
    private readonly STORAGE_KEY = 'neuralRoamQueue';
    
    /**
     * 队列持久化服务
     */
    private readonly queuePersistence: QueuePersistencePort;
    private readonly cardTypeResolver: NeuralRoamCardTypeResolverPort;

    /**
     * 构造函数
     *
     * @param manager 统一数据源管理器实例
     * @param queuePersistence 队列持久化服务（依赖注入）
     */
    constructor(
        manager: UnifiedDataSourceManager,
        queuePersistence: QueuePersistencePort,
        options: NeuralRoamQueueOptions = {}
    ) {
        super(manager, QueueType.NeuralRoam);

        this.queuePersistence = queuePersistence;
        this.cardTypeResolver = options.cardTypeResolver ?? DEFAULT_CARD_TYPE_RESOLVER;
        
        // 创建概念神经队列实例
        this.conceptQueue = new ConceptNeuralQueue();

        // 注意：不在构造函数中调用 load()，由外部调用
        // this.loadPersistedSeeds();

        logger.info('Initialized with ConceptNeuralQueue');
    }

    /**
     * 从持久化服务加载状态
     * 
     * 加载种子块列表。
     * 如果没有保存的数据，初始化为空列表。
     * 
     * @see 需求 4.2, 4.5
     */
    async load(): Promise<void> {
        const { value: data, fromStorage } = loadQueueState<SeedBlockData | null>({
            persistence: this.queuePersistence,
            key: this.STORAGE_KEY,
            initialValue: null,
            validate: (candidate): candidate is SeedBlockData =>
                Boolean(candidate) &&
                typeof candidate === 'object' &&
                Array.isArray((candidate as SeedBlockData).seeds),
            logger,
            context: 'NeuralRoamQueue',
        });

        if (data?.seeds && Array.isArray(data.seeds)) {
            this.conceptQueue.restoreSeeds(data.seeds);
            if (fromStorage) {
                logger.info(`Loaded ${data.seeds.length} persisted seeds`);
            }
            return;
        }

        logger.info('No saved data found, starting with empty seeds');
    }
    
    /**
     * 保存状态到持久化服务
     * 
     * 保存种子块列表。
     * 使用键名 "neuralRoamQueue"。
     * 
     * @see 需求 4.2, 4.5, 4.6
     */
    async save(): Promise<void> {
        const data: SeedBlockData = {
            seeds: this.conceptQueue.getSeeds(),
            currentSeed: null
        };

        await saveQueueState({
            persistence: this.queuePersistence,
            key: this.STORAGE_KEY,
            value: data,
            logger,
            context: 'NeuralRoamQueue',
        });

        logger.info(`Saved ${data.seeds.length} seeds`);
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
        await this.ensureInitialLoad();
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
    public async addCard(card: FSRSCard | ReviewQueueItem | string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
        try {
            await this.ensureInitialLoad();
            const blockId = typeof card === 'string' ? card : resolveCardId(card);
            
            if (!blockId) {
                logger.error('Invalid card or block ID');
                return;
            }

            await this.conceptQueue.addSeed(blockId, priority);
            await this.save();
            
            logger.info(`Added seed: ${blockId} (priority: ${priority})`);
        } catch (error) {
            logger.error('Failed to add seed:', error);
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
            await this.ensureInitialLoad();
            this.conceptQueue.removeSeed(cardIdOrBlockId);
            await this.save();
            
            logger.info(`Removed seed: ${cardIdOrBlockId}`);
        } catch (error) {
            logger.error('Failed to remove seed:', error);
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
        logger.debug(`Review handled by FSRS system: ${cardId}, rating: ${rating}`);
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
            await this.ensureInitialLoad();
            logger.debug('getNextCard called');
            logger.debug('Current seeds:', this.conceptQueue.getSeeds());
            logger.debug('Queue size:', this.conceptQueue.size());
            
            const queueItem = await this.conceptQueue.getNextCard();
            
            if (!queueItem) {
                logger.debug('Queue exhausted');
                return null;
            }

            logger.debug('Got queue item:', queueItem.blockId);
            
            // 转换为 FSRSCard
            const fsrsCard = await this.convertToFSRSCard(queueItem);
            return fsrsCard;
        } catch (error) {
            logger.error('Failed to get next card:', error);
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
            await this.ensureInitialLoad();
            await this.conceptQueue.addSeed(cardId, priority);
            await this.save();
            
            logger.info(`Locked as seed: ${cardId} (priority: ${priority})`);
        } catch (error) {
            logger.error('Failed to lock seed:', error);
            throw error;
        }
    }

    /**
     * 清空历史记录
     */
    public clearHistory(): void {
        this.conceptQueue.clearHistory();
        logger.info('History cleared');
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
        logger.warn('Reorder not supported');
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
    public getAllItems(): NeuralRoamSeedItem[] {
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
        await this.ensureInitialLoad();
        const seedCount = this.conceptQueue.getSeeds().length;
        logger.debug(`getSize: returning ${seedCount} seeds`);
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
    private async convertToFSRSCard(queueItem: ConceptQueueItem): Promise<FSRSCard> {
        const now = Date.now();

        // 通过端口解析卡片类型，避免领域层直接依赖思源 API。
        let cardType: 'item' | 'topic' = 'topic';
        try {
            cardType = await this.cardTypeResolver.resolveCardType(queueItem.blockId);
            if (cardType === 'item') {
                logger.debug(`Block ${queueItem.blockId} is an item card`);
            } else {
                logger.debug(`Block ${queueItem.blockId} is a topic card (virtual)`);
            }
        } catch (error) {
            logger.error('Failed to check card type:', error);
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
}
