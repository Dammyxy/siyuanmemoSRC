/**
 * PostponeEngine - 实现 SuperMemo Postpone 算法
 * 
 * 功能：
 * - 根据延迟因子计算新的 due date
 * - 应用跳过条件过滤卡片
 * - 动态调整延迟因子（基于 Retrievability 和 Priority）
 * - 批量更新卡片
 */

import type { FSRSCard } from '@/types/card';
import type { PostponeConfig, PostponeResult } from '@/types/reschedule';
import type { RescheduleLog } from '@/types/scheduler';
import { BatchProcessor } from './BatchProcessor';
import type { CardUpdatePort, RescheduleStoragePort } from './ports';

/**
 * PostponeEngine - 实现 SuperMemo Postpone 算法
 * 
 * 使用 DDD 架构：
 * - 依赖 UnifiedStorageManager 进行数据查询
 * - 依赖 CardApplicationService 进行数据更新
 */
export class PostponeEngine {
    private batchProcessor: BatchProcessor;
    
    constructor(
        private storage: RescheduleStoragePort,
        private cardUpdater: CardUpdatePort
    ) {
        this.batchProcessor = new BatchProcessor();
    }
    /**
     * 执行 Postpone 操作
     * @param cards 要处理的卡片列表
     * @param config Postpone 配置
     * @param isDilute 是否为 Dilute 操作（处理所有卡片，不仅仅是 outstanding 卡片）
     * @param source 操作来源（用于日志记录）
     * @param onProgress 进度回调函数
     * @returns 操作结果
     */
    async execute(
        cards: FSRSCard[],
        config: PostponeConfig,
        isDilute: boolean = false,
        source: string = 'unknown',
        onProgress?: (processed: number, total: number, percentage: number) => void
    ): Promise<PostponeResult> {
        const now = Date.now();

        // 1. 过滤卡片（应用跳过条件）
        const { filtered, skippedReasons } = this.filterCards(cards, config, isDilute, now);
        
        // 2. 计算新的 Due Date
        const updatedCards = filtered.map(card => this.calculateNewDue(card, config, now));
        
        // 3. 批量更新（使用优化的批处理器）
        const batchResult = await this.batchProcessor.processBatchWithRetry(
            updatedCards,
            async (batch) => {
                await this.updateBatch(batch, isDilute ? 'dilute' : 'postpone', source);
                return batch;
            },
            {
                batchSize: 200,
                parallelBatches: 3,
                onProgress
            },
            2 // 最大重试 2 次
        );
        
        // 4. 构建结果
        const result: PostponeResult = {
            updated: batchResult.successCount,
            skipped: cards.length - filtered.length,
            skippedReasons,
            errors: batchResult.failures.length > 0 
                ? batchResult.failures.map(f => `Card ${f.item.cardId}: ${f.error.message}`)
                : undefined
        };
        
        return result;
    }
    
    /**
     * 过滤卡片（应用跳过条件）
     * @param cards 原始卡片列表
     * @param config Postpone 配置
     * @param isDilute 是否为 Dilute 操作
     * @returns 过滤后的卡片和跳过原因统计
     */
    private filterCards(
        cards: FSRSCard[],
        config: PostponeConfig,
        isDilute: boolean,
        now: number
    ): { filtered: FSRSCard[]; skippedReasons: Record<string, number> } {
        const skippedReasons: Record<string, number> = {};
        const filtered: FSRSCard[] = [];
        
        // 🆕 使用配置选项来决定是否包含未到期的卡片
        const includeNonOutstanding = config.includeNonOutstanding ?? false;
        
        for (const card of cards) {
            // 如果不是 Dilute 且不包含未到期卡片，只处理 Outstanding 卡片
            if (!isDilute && !includeNonOutstanding && card.due > now) {
                skippedReasons['not-outstanding'] = (skippedReasons['not-outstanding'] || 0) + 1;
                continue;
            }
            
            // 应用跳过条件
            const skipReason = this.checkSkipConditions(card, config, now);
            if (skipReason) {
                skippedReasons[skipReason] = (skippedReasons[skipReason] || 0) + 1;
                continue;
            }
            
            filtered.push(card);
        }
        
        return { filtered, skippedReasons };
    }
    
    /**
     * 检查卡片是否满足跳过条件
     * @param card 卡片
     * @param config Postpone 配置
     * @returns 跳过原因，如果不跳过则返回 null
     */
    private checkSkipConditions(card: FSRSCard, config: PostponeConfig, now: number): string | null {
        // 按优先级跳过
        if (config.skipConditions.skipByPriority?.enabled) {
            const priority = card.priority ?? 50;
            if (priority <= config.skipConditions.skipByPriority.threshold) {
                return 'skip-by-priority';
            }
        }
        
        // 按间隔跳过
        if (config.skipConditions.skipByInterval?.enabled) {
            if (card.scheduledDays > config.skipConditions.skipByInterval.threshold) {
                return 'skip-by-interval';
            }
        }
        
        // 按 Retrievability 跳过
        if (config.skipConditions.skipByRetrievability?.enabled) {
            const retrievability = this.calculateRetrievability(card, now);
            if (retrievability >= config.skipConditions.skipByRetrievability.threshold) {
                return 'skip-by-retrievability';
            }
        }
        
        // 按 A-Factor 跳过（仅 Topic 卡片）
        if (config.skipConditions.skipByAFactor?.enabled) {
            if (card.type === 'topic' && card.aFactor !== undefined) {
                if (card.aFactor < config.skipConditions.skipByAFactor.threshold) {
                    return 'skip-by-afactor';
                }
            }
        }
        
        // 按推迟次数跳过
        if (config.skipConditions.skipByPostponeCount?.enabled) {
            const postponeCount = card.postponeCount ?? 0;
            if (postponeCount >= config.skipConditions.skipByPostponeCount.threshold) {
                return 'skip-by-postpone-count';
            }
        }
        
        return null;
    }
    
    /**
     * 计算新的 Due Date
     * @param card 卡片
     * @param config Postpone 配置
     * @returns 更新后的卡片
     */
    private calculateNewDue(card: FSRSCard, config: PostponeConfig, now: number): FSRSCard {
        let delayFactor = config.delayFactor;
        
        // 根据 Retrievability 调整延迟因子
        if (config.modifyDelayByRetrievability) {
            const retrievability = this.calculateRetrievability(card, now);
            // Retrievability 越低，延迟因子越大
            delayFactor *= (1 + (1 - retrievability));
        }
        
        // 根据 Priority 调整延迟因子
        if (config.modifyDelayByPriority) {
            const priority = card.priority ?? 50;
            // Priority 越低（数值越大），延迟因子越大
            delayFactor *= (1 + priority / 100);
        }
        
        // 限制延迟因子范围
        delayFactor = Math.max(0.1, Math.min(10.0, delayFactor));
        
        // 计算新的间隔
        const currentInterval = card.scheduledDays;
        let newInterval = Math.floor(currentInterval * delayFactor);
        
        // 应用最小/最大间隔限制
        newInterval = Math.max(config.minInterval, newInterval);
        newInterval = Math.min(config.maxInterval, newInterval);
        
        // 确保至少推迟 1 天
        const minDue = now + 24 * 60 * 60 * 1000;
        const calculatedDue = now + newInterval * 24 * 60 * 60 * 1000;
        const newDue = Math.max(minDue, calculatedDue);
        
        // 更新卡片
        return {
            ...card,
            due: newDue,
            scheduledDays: newInterval,
            postponeCount: (card.postponeCount ?? 0) + 1,
            lastPostponeDate: now,
            updatedAt: now,
            rescheduleHistory: [
                ...(card.rescheduleHistory ?? []),
                {
                    type: 'postpone',
                    timestamp: now,
                    oldDue: card.due,
                    newDue: newDue
                }
            ]
        };
    }
    
    /**
     * 计算 Retrievability（可提取性）
     * 使用 FSRS 公式：R = exp(ln(0.9) * t / S)
     * 其中 t = 距上次复习的天数，S = stability
     * 
     * @param card 卡片
     * @returns Retrievability (0-1)
     */
    private calculateRetrievability(card: FSRSCard, now: number): number {
        // 处理边界情况
        if (card.stability <= 0) {
            return 0;
        }
        
        if (card.lastReview === 0) {
            return 1; // 从未复习过，认为记忆完整
        }
        
        // 计算距上次复习的天数
        const t = (now - card.lastReview) / (24 * 60 * 60 * 1000);
        
        // 使用 FSRS 公式计算 Retrievability
        // R = exp(ln(0.9) * t / S)
        const S = card.stability;
        const R = Math.exp(Math.log(0.9) * t / S);
        
        // 限制在 [0, 1] 范围内
        return Math.max(0, Math.min(1, R));
    }
    
    /**
     * 批量更新卡片到存储（单个批次）
     * @param cards 要更新的卡片列表
     * @param action 操作类型
     * @param source 操作来源
     */
    private async updateBatch(
        cards: FSRSCard[],
        action: 'postpone' | 'dilute',
        source: string
    ): Promise<void> {
        if (cards.length === 0) {
            return;
        }
        
        // ✅ 通过 CardApplicationService 批量更新
        await this.cardUpdater.batchUpdateCardsWithoutEvents(cards);
        
        // 记录操作日志
        await this.logOperation(cards, action, source);
    }
    
    /**
     * 批量更新卡片到存储（已废弃，使用 updateBatch 代替）
     * @deprecated 使用 updateBatch 代替
     */
    private async batchUpdate(
        cards: FSRSCard[],
        action: 'postpone' | 'dilute',
        source: string
    ): Promise<void> {
        return this.updateBatch(cards, action, source);
    }
    
    /**
     * 记录操作日志
     * @param cards 更新的卡片列表
     * @param action 操作类型
     * @param source 操作来源
     */
    private async logOperation(
        cards: FSRSCard[],
        action: 'postpone' | 'dilute',
        source: string
    ): Promise<void> {
        // 选择最多 3 个样本卡片
        const sampleSize = Math.min(3, cards.length);
        const sampleCards = cards.slice(0, sampleSize);
        
        const log: RescheduleLog = {
            ts: Date.now(),
            action: action,
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
