/**
 * BatchProcessor 单元测试
 * 
 * 测试批量操作优化功能：
 * - 批量处理（每批 200 张卡片）
 * - 并行处理多个批次
 * - 进度指示器
 * - 部分失败处理
 */

import { describe, it, expect, vi } from 'vitest';
import { BatchProcessor } from '../BatchProcessor';
import type { FSRSCard } from '@/types/card';

// 创建测试卡片
function createTestCard(id: string): FSRSCard {
    return {
        id,
        cardId: id,
        blockId: `block-${id}`,
        due: Date.now(),
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now()
    } as FSRSCard;
}

describe('BatchProcessor', () => {
    describe('processBatch', () => {
        it('should process small batch in single call', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 50 }, (_, i) => createTestCard(`card-${i}`));
            
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => batch);
            
            const result = await processor.processBatch(items, mockProcessor);
            
            expect(result.total).toBe(50);
            expect(result.successCount).toBe(50);
            expect(result.failureCount).toBe(0);
            expect(mockProcessor).toHaveBeenCalledTimes(1);
        });
        
        it('should split large batch into multiple calls', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 500 }, (_, i) => createTestCard(`card-${i}`));
            
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => batch);
            
            const result = await processor.processBatch(items, mockProcessor, {
                batchSize: 200
            });
            
            expect(result.total).toBe(500);
            expect(result.successCount).toBe(500);
            expect(result.failureCount).toBe(0);
            // 500 cards / 200 per batch = 3 batches
            expect(mockProcessor).toHaveBeenCalledTimes(3);
        });
        
        it('should call progress callback', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 300 }, (_, i) => createTestCard(`card-${i}`));
            
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => batch);
            const mockProgress = vi.fn();
            
            await processor.processBatch(items, mockProcessor, {
                batchSize: 100,
                onProgress: mockProgress
            });
            
            // Should be called 3 times (once per batch)
            expect(mockProgress).toHaveBeenCalledTimes(3);
            
            // Check progress values
            expect(mockProgress).toHaveBeenNthCalledWith(1, 100, 300, 33);
            expect(mockProgress).toHaveBeenNthCalledWith(2, 200, 300, 66);
            expect(mockProgress).toHaveBeenNthCalledWith(3, 300, 300, 100);
        });
        
        it('should handle partial failures', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 300 }, (_, i) => createTestCard(`card-${i}`));
            
            let callCount = 0;
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => {
                callCount++;
                if (callCount === 2) {
                    throw new Error('Batch 2 failed');
                }
                return batch;
            });
            
            const result = await processor.processBatch(items, mockProcessor, {
                batchSize: 100
            });
            
            expect(result.total).toBe(300);
            expect(result.successCount).toBe(200); // Batch 1 and 3 succeeded
            expect(result.failureCount).toBe(100); // Batch 2 failed
            expect(result.failures).toHaveLength(100);
        });
        
        it('should process batches in parallel', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 600 }, (_, i) => createTestCard(`card-${i}`));
            
            const processingTimes: number[] = [];
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => {
                const start = Date.now();
                await new Promise(resolve => setTimeout(resolve, 100));
                processingTimes.push(Date.now() - start);
                return batch;
            });
            
            const startTime = Date.now();
            await processor.processBatch(items, mockProcessor, {
                batchSize: 200,
                parallelBatches: 3
            });
            const totalTime = Date.now() - startTime;
            
            // 3 batches processed in parallel should take ~100ms, not 300ms
            expect(totalTime).toBeLessThan(200);
            expect(mockProcessor).toHaveBeenCalledTimes(3);
        });
    });
    
    describe('processBatchWithRetry', () => {
        it('should retry failed batches', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 300 }, (_, i) => createTestCard(`card-${i}`));
            
            let attemptCount = 0;
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => {
                attemptCount++;
                // Fail on first attempt, succeed on retry
                if (attemptCount === 2) {
                    throw new Error('First attempt failed');
                }
                return batch;
            });
            
            const result = await processor.processBatchWithRetry(
                items,
                mockProcessor,
                { batchSize: 100 },
                2 // maxRetries
            );
            
            expect(result.total).toBe(300);
            expect(result.successCount).toBe(300); // All succeeded after retry
            expect(result.failureCount).toBe(0);
            // Initial 3 batches + 1 retry batch
            expect(mockProcessor.mock.calls.length).toBeGreaterThan(3);
        });
        
        it('should give up after max retries', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 100 }, (_, i) => createTestCard(`card-${i}`));
            
            const mockProcessor = vi.fn(async () => {
                throw new Error('Always fails');
            });
            
            const result = await processor.processBatchWithRetry(
                items,
                mockProcessor,
                { batchSize: 100 },
                2 // maxRetries
            );
            
            expect(result.total).toBe(100);
            expect(result.successCount).toBe(0);
            expect(result.failureCount).toBe(100);
            // Initial attempt + 2 retries = 3 calls
            expect(mockProcessor).toHaveBeenCalledTimes(3);
        });
    });
    
    describe('chunk', () => {
        it('should split array into chunks', () => {
            const items = Array.from({ length: 250 }, (_, i) => i);
            const chunks = BatchProcessor.chunk(items, 100);
            
            expect(chunks).toHaveLength(3);
            expect(chunks[0]).toHaveLength(100);
            expect(chunks[1]).toHaveLength(100);
            expect(chunks[2]).toHaveLength(50);
        });
        
        it('should handle empty array', () => {
            const chunks = BatchProcessor.chunk([], 100);
            expect(chunks).toHaveLength(0);
        });
        
        it('should handle array smaller than chunk size', () => {
            const items = [1, 2, 3];
            const chunks = BatchProcessor.chunk(items, 100);
            
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toEqual([1, 2, 3]);
        });
    });
    
    describe('parallelLimit', () => {
        it('should limit concurrent execution', async () => {
            const executing: number[] = [];
            const maxConcurrent = { value: 0 };
            
            const tasks = Array.from({ length: 10 }, (_, i) => async () => {
                executing.push(i);
                maxConcurrent.value = Math.max(maxConcurrent.value, executing.length);
                await new Promise(resolve => setTimeout(resolve, 50));
                executing.splice(executing.indexOf(i), 1);
                return i;
            });
            
            const results = await BatchProcessor.parallelLimit(tasks, 3);
            
            expect(results).toHaveLength(10);
            expect(maxConcurrent.value).toBeLessThanOrEqual(3);
        });
        
        it('should return all results in order', async () => {
            const tasks = Array.from({ length: 5 }, (_, i) => async () => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
                return i;
            });
            
            const results = await BatchProcessor.parallelLimit(tasks, 2);
            
            expect(results).toEqual([0, 1, 2, 3, 4]);
        });
    });
    
    describe('Performance', () => {
        it('should handle 1000 cards efficiently', async () => {
            const processor = new BatchProcessor();
            const items = Array.from({ length: 1000 }, (_, i) => createTestCard(`card-${i}`));
            
            const mockProcessor = vi.fn(async (batch: FSRSCard[]) => {
                // Simulate some processing time
                await new Promise(resolve => setTimeout(resolve, 10));
                return batch;
            });
            
            const startTime = Date.now();
            const result = await processor.processBatch(items, mockProcessor, {
                batchSize: 200,
                parallelBatches: 3
            });
            const totalTime = Date.now() - startTime;
            
            expect(result.total).toBe(1000);
            expect(result.successCount).toBe(1000);
            // Should complete in reasonable time (< 5 seconds as per requirements)
            expect(totalTime).toBeLessThan(5000);
        });
    });
});
