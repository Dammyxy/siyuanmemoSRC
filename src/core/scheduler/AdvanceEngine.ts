/**
 * AdvanceEngine - 实现 SuperMemo Advance 算法
 * 
 * 功能：
 * - 将卡片复习时间提前到指定范围内
 * - 随机分散卡片到 1-N 天（不包括今天）
 * - 特殊处理极度过期的卡片
 * - 保持短间隔卡片不变
 * - 批量更新卡片
 */

import type { FSRSCard } from '@/types/card';
import type { AdvanceConfig, AdvanceResult } from '@/types/reschedule';
import type { RescheduleLog } from '@/types/scheduler';
import { BatchProcessor } from './BatchProcessor';
import type { CardUpdatePort, RescheduleStoragePort } from './ports';

/**
 * AdvanceEngine - 实现 SuperMemo Advance 算法
 * 
 * 使用 DDD 架构：
 * - 依赖 UnifiedStorageManager 进行数据查询
 * - 依赖 CardApplicationService 进行数据更新
 */
export class AdvanceEngine {
    private batchProcessor: BatchProcessor;
    
    constructor(
        private storage: RescheduleStoragePort,
        private cardUpdater: CardUpdatePort
    ) {
        this.batchProcessor = new BatchProcessor();
    }

    /**
     * 执行 Advance 操作
     * @param cards 要处理的卡片列表
     * @param config Advance 配置
     * @param source 操作来源（用于日志记录）
     * @param onProgress 进度回调函数
     * @returns 操作结果
     */
    async execute(
        cards: FSRSCard[],
        config: AdvanceConfig,
        source: string = 'unknown',
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<AdvanceResult> {
        const now = Date.now(); // 捕获统一的时间戳
        let overdueHandled = 0;
        let unchanged = 0;
        const cardsToUpdate: FSRSCard[] = [];

        // 处理每张卡片
        for (const card of cards) {
            const result = this.calculateNewDue(card, config, now);
            
            if (result.isOverdue) {
                overdueHandled++;
                cardsToUpdate.push(result.card);
            } else if (result.isUnchanged) {
                unchanged++;
            } else {
                cardsToUpdate.push(result.card);
            }
        }

        // 批量更新（使用优化的批处理器）
        const batchResult = await this.batchProcessor.processBatchWithRetry(
            cardsToUpdate,
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

        // 构建结果
        const advanceResult: AdvanceResult = {
            updated: batchResult.successCount,
            overdueHandled,
            unchanged,
            errors: batchResult.failures.length > 0 
                ? batchResult.failures.map(f => `Card ${f.item.id}: ${f.error.message}`)
                : undefined
        };

        return advanceResult;
    }

    /**
     * 计算新的 Due Date
     * 公式：New_Due = Today + Random(1..N)（不包括今天）
     * 
     * @param card 卡片
     * @param config Advance 配置
     * @param now 当前时间戳（用于保持一致性）
     * @returns 更新后的卡片和处理标记
     */
    private calculateNewDue(
        card: FSRSCard,
        config: AdvanceConfig,
        now: number
    ): { card: FSRSCard; isOverdue: boolean; isUnchanged: boolean } {
        const dayMs = 24 * 60 * 60 * 1000;

        // 特殊处理：极度过期的卡片（上次复习距今超过 N 天）
        if (config.handleOverdueCards) {
            const daysSinceLastReview = (now - card.lastReview) / dayMs;
            if (daysSinceLastReview > config.maxDays) {
                // 安排到今天
                return {
                    card: {
                        ...card,
                        due: now,
                        updatedAt: now,
                        rescheduleHistory: [
                            ...(card.rescheduleHistory ?? []),
                            {
                                type: 'advance',
                                timestamp: now,
                                oldDue: card.due,
                                newDue: now,
                                reason: 'overdue'
                            }
                        ]
                    },
                    isOverdue: true,
                    isUnchanged: false
                };
            }
        }

        // 如果当前间隔已经小于指定天数，保持不变
        if (card.scheduledDays < config.maxDays) {
            return {
                card,
                isOverdue: false,
                isUnchanged: true
            };
        }

        // 随机生成 1 到 N 之间的天数（不包括今天）
        const randomDays = Math.floor(Math.random() * config.maxDays) + 1;
        const newDue = now + randomDays * dayMs;

        // 计算新的间隔
        const newInterval = Math.floor((newDue - card.lastReview) / dayMs);

        return {
            card: {
                ...card,
                due: newDue,
                scheduledDays: newInterval,
                updatedAt: now,
                rescheduleHistory: [
                    ...(card.rescheduleHistory ?? []),
                    {
                        type: 'advance',
                        timestamp: now,
                        oldDue: card.due,
                        newDue: newDue
                    }
                ]
            },
            isOverdue: false,
            isUnchanged: false
        };
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
            action: 'advance',
            source: source,
            targets: cards.map(c => c.id),
            result: {
                updated: cards.length,
                skipped: 0
            },
            sample: sampleCards.map(card => {
                const history = card.rescheduleHistory ?? [];
                const lastEntry = history[history.length - 1];
                return {
                    cardId: card.id,
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
