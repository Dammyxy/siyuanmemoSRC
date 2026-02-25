/**
 * SpreadEngine - 实现 SuperMemo Spread/Mercy 算法
 * 
 * 功能：
 * - 收集 Collecting Period 内的卡片
 * - 支持考虑未来复习（considerFutureRepetitions）
 * - 按指定标准排序卡片（Random、ByPriority、ByInterval、ByLateness、ByEasiness、ByRecency）
 * - 均匀分散卡片到 Rescheduling Period
 * - 批量更新卡片
 */

import type { FSRSCard } from '@/types/card';
import type { SpreadConfig, SpreadResult, SortingCriterion } from '@/types/reschedule';
import type { RescheduleLog } from '@/types/scheduler';
import { BatchProcessor } from './BatchProcessor';
import type { CardUpdatePort, RescheduleStoragePort } from './ports';

/**
 * SpreadEngine - 实现 SuperMemo Spread/Mercy 算法
 * 
 * 使用 DDD 架构：
 * - 依赖 UnifiedStorageManager 进行数据查询
 * - 依赖 CardApplicationService 进行数据更新
 */
export class SpreadEngine {
    private batchProcessor: BatchProcessor;
    
    constructor(
        private storage: RescheduleStoragePort,
        private cardUpdater: CardUpdatePort
    ) {
        this.batchProcessor = new BatchProcessor();
    }

    /**
     * 执行 Spread 操作
     * @param cards 要处理的卡片列表
     * @param config Spread 配置
     * @param source 操作来源（用于日志记录）
     * @param onProgress 进度回调函数
     * @returns 操作结果
     */
    async execute(
        cards: FSRSCard[],
        config: SpreadConfig,
        source: string = 'unknown',
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<SpreadResult> {
        const now = Date.now();

        // 1. 收集卡片
        const collectedCards = this.collectCards(cards, config, now);
        
        // 2. 排序卡片
        const sortedCards = this.sortCards(collectedCards, config.sortingCriterion, now);
        
        // 3. 分散卡片
        const updatedCards = this.spreadCards(sortedCards, config, now);
        
        // 4. 批量更新（使用优化的批处理器）
        const batchResult = await this.batchProcessor.processBatchWithRetry(
            updatedCards,
            async (batch) => {
                await this.updateBatch(batch, source);
                return batch;
            },
            {
                batchSize: 200,
                parallelBatches: 3,
                onProgress
            },
            2 // 最大重试 2 次
        );
        
        // 5. 计算平均每天的卡片数量
        const averageCardsPerDay = config.reschedulingPeriod > 0 
            ? batchResult.successCount / config.reschedulingPeriod 
            : 0;
        
        // 6. 构建结果
        const result: SpreadResult = {
            updated: batchResult.successCount,
            averageCardsPerDay,
            errors: batchResult.failures.length > 0 
                ? batchResult.failures.map(f => `Card ${f.item.cardId}: ${f.error.message}`)
                : undefined
        };
        
        return result;
    }

    /**
     * 收集卡片
     * 根据 considerFutureRepetitions 决定收集范围：
     * - true: 收集所有在 Collecting Period 内的卡片（包括未到期的）
     * - false: 只收集 Outstanding 卡片（due <= now）
     * 
     * @param cards 原始卡片列表
     * @param config Spread 配置
     * @returns 收集的卡片列表
     */
    private collectCards(
        cards: FSRSCard[],
        config: SpreadConfig,
        now: number
    ): FSRSCard[] {
        const dayMs = 24 * 60 * 60 * 1000;
        const collectingEndDate = now + config.collectingPeriod * dayMs;
        
        if (config.considerFutureRepetitions) {
            // 收集所有在 Collecting Period 内的卡片（包括未到期的）
            return cards.filter(card => card.due <= collectingEndDate);
        } else {
            // 只收集 Outstanding 卡片
            return cards.filter(card => card.due <= now);
        }
    }

    /**
     * 排序卡片
     * 根据指定的排序标准对卡片进行排序
     * 
     * @param cards 要排序的卡片列表
     * @param criterion 排序标准
     * @returns 排序后的卡片列表
     */
    private sortCards(
        cards: FSRSCard[],
        criterion: SortingCriterion,
        now: number
    ): FSRSCard[] {
        const sorted = [...cards];
        
        switch (criterion) {
            case 'random':
                // Fisher-Yates 洗牌算法
                for (let i = sorted.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
                }
                break;
                
            case 'by-priority':
                // 按优先级从高到低排序（priority 越小越重要）
                sorted.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
                break;
                
            case 'by-interval':
                // 按间隔从短到长排序
                sorted.sort((a, b) => a.scheduledDays - b.scheduledDays);
                break;
                
            case 'by-lateness':
                // 按延迟程度从大到小排序（越晚的越靠前）
                sorted.sort((a, b) => {
                    const latenessA = now - a.due;
                    const latenessB = now - b.due;
                    return latenessB - latenessA;  // 越晚的越靠前
                });
                break;
                
            case 'by-easiness':
                // 按难度从易到难排序（difficulty 越小越容易）
                sorted.sort((a, b) => a.difficulty - b.difficulty);
                break;
                
            case 'by-recency':
                // 按添加时间从新到旧排序（createdAt 越大越新）
                sorted.sort((a, b) => b.createdAt - a.createdAt);
                break;
        }
        
        return sorted;
    }

    /**
     * 分散卡片
     * 将排序后的卡片均匀分散到 Rescheduling Period 内
     * 
     * 算法：
     * - 将卡片按顺序分配到不同的天
     * - 第 i 张卡片分配到第 floor((i / total) * reschedulingPeriod) 天
     * - 这样可以确保卡片均匀分散
     * 
     * @param cards 排序后的卡片列表
     * @param config Spread 配置
     * @returns 更新后的卡片列表
     */
    private spreadCards(
        cards: FSRSCard[],
        config: SpreadConfig,
        now: number
    ): FSRSCard[] {
        const dayMs = 24 * 60 * 60 * 1000;
        const total = cards.length;
        
        return cards.map((card, index) => {
            // 计算该卡片应该分配到第几天
            const dayIndex = Math.floor((index / total) * config.reschedulingPeriod);
            const newDue = now + dayIndex * dayMs;
            
            // 计算新的间隔
            const newInterval = Math.floor((newDue - card.lastReview) / dayMs);
            
            return {
                ...card,
                due: newDue,
                scheduledDays: Math.max(1, newInterval),
                updatedAt: now,
                rescheduleHistory: [
                    ...(card.rescheduleHistory ?? []),
                    {
                        type: 'spread',
                        timestamp: now,
                        oldDue: card.due,
                        newDue: newDue
                    }
                ]
            };
        });
    }

    /**
     * 批量更新卡片到存储（单个批次）
     * @param cards 要更新的卡片列表
     * @param source 操作来源
     */
    private async updateBatch(
        cards: FSRSCard[],
        source: string
    ): Promise<void> {
        if (cards.length === 0) {
            return;
        }

        // ✅ 通过 CardApplicationService 批量更新
        await this.cardUpdater.batchUpdateCardsWithoutEvents(cards);

        // 记录操作日志
        await this.logOperation(cards, source);
    }
    
    /**
     * 批量更新卡片到存储（已废弃，使用 updateBatch 代替）
     * @deprecated 使用 updateBatch 代替
     */
    private async batchUpdate(
        cards: FSRSCard[],
        source: string
    ): Promise<void> {
        return this.updateBatch(cards, source);
    }

    /**
     * 记录操作日志
     * @param cards 更新的卡片列表
     * @param source 操作来源
     */
    private async logOperation(
        cards: FSRSCard[],
        source: string
    ): Promise<void> {
        // 选择最多 3 个样本卡片
        const sampleSize = Math.min(3, cards.length);
        const sampleCards = cards.slice(0, sampleSize);

        const log: RescheduleLog = {
            ts: Date.now(),
            action: 'spread',
            source: source,
            targets: cards.map(c => c.cardId),
            result: {
                updated: cards.length,
                skipped: 0
            },
            sample: sampleCards.map(card => {
                const history = card.rescheduleHistory ?? [];
                const lastEntry = history[history.length - 1];
                return {
                    cardId: card.cardId,
                    blockId: card.blockId,
                    oldDue: lastEntry?.oldDue ? new Date(lastEntry.oldDue).toISOString() : undefined,
                    newDue: new Date(card.due).toISOString()
                };
            })
        };

        // TODO: 将 addRescheduleLog 迁移到应用服务层
        await this.storage.addRescheduleLog?.(log);
    }
}
