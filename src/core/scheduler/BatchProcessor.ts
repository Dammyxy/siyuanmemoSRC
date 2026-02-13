/**
 * BatchProcessor - 批量操作优化工具
 * 
 * 功能：
 * - 将大量卡片分批处理（每批 200 张）
 * - 并行处理多个批次
 * - 提供进度回调
 * - 处理部分失败情况
 * 
 * Requirements: 13.4, 13.5, 16.1, 16.2, 16.3, 16.4, 16.5
 */

import type { FSRSCard } from '@/types/card';

/**
 * 批处理配置
 */
export interface BatchConfig {
    /** 每批处理的卡片数量（默认 200） */
    batchSize?: number;
    /** 并行处理的批次数量（默认 3） */
    parallelBatches?: number;
    /** 进度回调函数 */
    onProgress?: (processed: number, total: number, percentage: number) => void;
}

/**
 * 批处理结果
 */
export interface BatchResult<T> {
    /** 成功处理的结果 */
    successes: T[];
    /** 失败的项目 */
    failures: Array<{
        item: FSRSCard;
        error: Error;
    }>;
    /** 总处理数量 */
    total: number;
    /** 成功数量 */
    successCount: number;
    /** 失败数量 */
    failureCount: number;
}

/**
 * 批处理器类
 */
export class BatchProcessor {
    private readonly DEFAULT_BATCH_SIZE = 200;
    private readonly DEFAULT_PARALLEL_BATCHES = 3;

    /**
     * 批量处理卡片
     * 
     * @param items 要处理的卡片列表
     * @param processor 处理函数，接收一批卡片并返回处理结果
     * @param config 批处理配置
     * @returns 批处理结果
     */
    async processBatch<T>(
        items: FSRSCard[],
        processor: (batch: FSRSCard[]) => Promise<T[]>,
        config: BatchConfig = {}
    ): Promise<BatchResult<T>> {
        const batchSize = config.batchSize ?? this.DEFAULT_BATCH_SIZE;
        const parallelBatches = config.parallelBatches ?? this.DEFAULT_PARALLEL_BATCHES;
        const onProgress = config.onProgress;

        const total = items.length;
        const successes: T[] = [];
        const failures: Array<{ item: FSRSCard; error: Error }> = [];
        let processed = 0;

        // 将卡片分批
        const batches: FSRSCard[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }

        // 并行处理批次
        for (let i = 0; i < batches.length; i += parallelBatches) {
            const currentBatches = batches.slice(i, i + parallelBatches);
            
            // 并行处理当前批次组
            const results = await Promise.allSettled(
                currentBatches.map(batch => this.processSingleBatch(batch, processor))
            );

            // 收集结果
            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                const batch = currentBatches[j];

                if (result.status === 'fulfilled') {
                    successes.push(...result.value);
                    processed += batch.length;
                } else {
                    // 批次失败，记录所有卡片为失败
                    for (const item of batch) {
                        failures.push({
                            item,
                            error: result.reason
                        });
                    }
                    processed += batch.length;
                }

                // 报告进度
                if (onProgress) {
                    const percentage = Math.floor((processed / total) * 100);
                    onProgress(processed, total, percentage);
                }
            }
        }

        return {
            successes,
            failures,
            total,
            successCount: successes.length,
            failureCount: failures.length
        };
    }

    /**
     * 处理单个批次
     * 
     * @param batch 批次卡片
     * @param processor 处理函数
     * @returns 处理结果
     */
    private async processSingleBatch<T>(
        batch: FSRSCard[],
        processor: (batch: FSRSCard[]) => Promise<T[]>
    ): Promise<T[]> {
        try {
            return await processor(batch);
        } catch (error) {
            console.error('[BatchProcessor] Batch processing failed:', error);
            throw error;
        }
    }

    /**
     * 批量处理卡片（带重试机制）
     * 
     * @param items 要处理的卡片列表
     * @param processor 处理函数
     * @param config 批处理配置
     * @param maxRetries 最大重试次数（默认 2）
     * @returns 批处理结果
     */
    async processBatchWithRetry<T>(
        items: FSRSCard[],
        processor: (batch: FSRSCard[]) => Promise<T[]>,
        config: BatchConfig = {},
        maxRetries: number = 2
    ): Promise<BatchResult<T>> {
        let result = await this.processBatch(items, processor, config);

        // 重试失败的项目
        for (let retry = 0; retry < maxRetries && result.failures.length > 0; retry++) {
            console.log(`[BatchProcessor] Retrying ${result.failures.length} failed items (attempt ${retry + 1}/${maxRetries})`);
            
            const failedItems = result.failures.map(f => f.item);
            const retryResult = await this.processBatch(failedItems, processor, {
                ...config,
                onProgress: undefined // 不报告重试进度
            });

            // 合并结果
            result.successes.push(...retryResult.successes);
            result.successCount = result.successes.length;
            result.failures = retryResult.failures;
            result.failureCount = retryResult.failures.length;
        }

        return result;
    }

    /**
     * 将数组分批
     * 
     * @param items 要分批的数组
     * @param batchSize 每批大小
     * @returns 分批后的数组
     */
    static chunk<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * 并行执行多个任务，限制并发数
     * 
     * @param tasks 任务列表
     * @param concurrency 并发数
     * @returns 所有任务的结果
     */
    static async parallelLimit<T>(
        tasks: (() => Promise<T>)[],
        concurrency: number
    ): Promise<T[]> {
        const results: T[] = new Array(tasks.length);
        let index = 0;

        async function runNext(): Promise<void> {
            while (index < tasks.length) {
                const currentIndex = index++;
                results[currentIndex] = await tasks[currentIndex]();
            }
        }

        // Start concurrent workers
        const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext());
        await Promise.all(workers);

        return results;
    }
}
