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
import type { CardUpdatePort, RescheduleStoragePort } from './ports';
import { BaseRescheduleEngine } from './BaseRescheduleEngine';

/**
 * AdvanceEngine - 实现 SuperMemo Advance 算法
 * 
 * 使用 DDD 架构：
 * - 依赖 RescheduleStoragePort 进行数据查询
 * - 依赖 CardUpdatePort 进行数据更新
 */
export class AdvanceEngine extends BaseRescheduleEngine {
    constructor(
        storage: RescheduleStoragePort,
        cardUpdater: CardUpdatePort
    ) {
        super(storage, cardUpdater);
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

        // 批量更新（共享基类流程）
        const batchResult = await this.persistInBatches(
            cardsToUpdate,
            'advance',
            source,
            onProgress
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
        if (config.handleOverdueCards && card.lastReview > 0) {
            const daysSinceLastReview = (now - card.lastReview) / dayMs;
            if (daysSinceLastReview > config.maxDays) {
                const overdueInterval = Math.max(1, Math.floor(daysSinceLastReview));
                // 安排到今天
                return {
                    card: {
                        ...card,
                        due: now,
                        scheduledDays: overdueInterval,
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

        // 随机模式：1..N 天；固定模式：统一到 N 天后
        const targetDays = config.randomize
            ? Math.floor(Math.random() * config.maxDays) + 1
            : config.maxDays;
        const newDue = now + targetDays * dayMs;

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
}
