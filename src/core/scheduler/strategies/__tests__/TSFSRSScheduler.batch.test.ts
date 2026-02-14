/**
 * TSFSRSScheduler 批量处理测试
 * 
 * 测试 reviewBatch() 方法的批量处理功能。
 * 
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TSFSRSScheduler } from '../TSFSRSScheduler';
import { CardState, Rating, type FSRSCard, type FSRSParameters } from '@/types';

describe('TSFSRSScheduler - 批量处理', () => {
    let defaultParams: FSRSParameters;
    let testCards: FSRSCard[];
    
    beforeEach(() => {
        // 创建默认参数
        defaultParams = {
            requestRetention: 0.9,
            maximumInterval: 36500,
            weights: [
                0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
                0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61, 0.0, 0.0
            ],
            enableFuzz: false,
            enableShortTerm: false,
        };
        
        // 创建测试卡片数组
        const now = Date.now();
        testCards = Array.from({ length: 10 }, (_, i) => ({
            id: `test-card-${i}`,
            blockId: `block-${i}`,
            due: now,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: CardState.New,
            lastReview: 0,
            priority: 50,
            type: 'item' as any,
            tags: [],
            leechCount: 0,
            isLeech: false,
            skipped: false,
            createdAt: now,
            updatedAt: now,
        }));
    });
    
    describe('基本功能测试', () => {
        it('应该批量处理多张卡片', () => {
            console.log('\n--- 测试：批量处理 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 准备批量复习请求
            const reviews = testCards.map(card => ({
                card,
                rating: Rating.Good,
            }));
            
            // 批量复习
            const results = scheduler.reviewBatch(reviews);
            
            console.log(`批量处理 ${results.length} 张卡片`);
            console.log('第一张卡片结果:', {
                id: results[0].id,
                scheduledDays: results[0].scheduledDays,
                stability: results[0].stability.toFixed(2),
                reps: results[0].reps,
            });
            
            // 验证结果
            expect(results).toHaveLength(testCards.length);
            results.forEach((result, i) => {
                expect(result.id).toBe(testCards[i].id);
                expect(result.reps).toBe(1);
                expect(result.scheduledDays).toBeGreaterThan(0);
                expect(result.state).not.toBe(CardState.New);
            });
            
            console.log('✓ 批量处理成功');
        });
        
        it('应该支持不同的评分', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 准备不同评分的复习请求
            const reviews = [
                { card: testCards[0], rating: Rating.Again },
                { card: testCards[1], rating: Rating.Hard },
                { card: testCards[2], rating: Rating.Good },
                { card: testCards[3], rating: Rating.Easy },
            ];
            
            const results = scheduler.reviewBatch(reviews);
            
            // 验证不同评分产生不同结果
            expect(results).toHaveLength(4);
            expect(results[0].scheduledDays).toBeLessThan(results[1].scheduledDays);
            expect(results[1].scheduledDays).toBeLessThan(results[2].scheduledDays);
            expect(results[2].scheduledDays).toBeLessThan(results[3].scheduledDays);
        });
        
        it('应该保留每张卡片的业务字段', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            const reviews = testCards.slice(0, 3).map(card => ({
                card,
                rating: Rating.Good,
            }));
            
            const results = scheduler.reviewBatch(reviews);
            
            results.forEach((result, i) => {
                expect(result.id).toBe(testCards[i].id);
                expect(result.blockId).toBe(testCards[i].blockId);
                expect(result.type).toBe(testCards[i].type);
            });
        });
    });
    
    describe('正确性测试', () => {
        it('批量处理结果应该与单独处理一致', () => {
            console.log('\n--- 测试：批量处理正确性 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 单独处理
            const singleResults = testCards.slice(0, 5).map(card =>
                scheduler.review(card, Rating.Good, now)
            );
            
            // 批量处理
            const batchReviews = testCards.slice(0, 5).map(card => ({
                card,
                rating: Rating.Good,
            }));
            const batchResults = scheduler.reviewBatch(batchReviews, now);
            
            console.log('对比结果:');
            singleResults.forEach((single, i) => {
                const batch = batchResults[i];
                console.log(`卡片 ${i}:`, {
                    单独: { scheduledDays: single.scheduledDays, stability: single.stability.toFixed(2) },
                    批量: { scheduledDays: batch.scheduledDays, stability: batch.stability.toFixed(2) },
                    一致: single.scheduledDays === batch.scheduledDays,
                });
                
                // 验证结果一致
                expect(batch.scheduledDays).toBe(single.scheduledDays);
                expect(batch.stability).toBe(single.stability);
                expect(batch.difficulty).toBe(single.difficulty);
                expect(batch.reps).toBe(single.reps);
                expect(batch.state).toBe(single.state);
            });
            
            console.log('✓ 批量处理结果与单独处理一致');
        });
    });
    
    describe('性能测试', () => {
        it('应该测试批量处理的性能', () => {
            console.log('\n--- 测试：批量处理性能 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 创建大量卡片
            const largeCardSet = Array.from({ length: 100 }, (_, i) => ({
                ...testCards[0],
                id: `card-${i}`,
            }));
            
            // 单独处理
            const start1 = performance.now();
            largeCardSet.forEach(card => {
                scheduler.review(card, Rating.Good, now);
            });
            const time1 = performance.now() - start1;
            
            // 批量处理
            const batchReviews = largeCardSet.map(card => ({
                card,
                rating: Rating.Good,
            }));
            const start2 = performance.now();
            scheduler.reviewBatch(batchReviews, now);
            const time2 = performance.now() - start2;
            
            console.log('性能对比 (100张卡片):', {
                单独处理: `${time1.toFixed(2)}ms`,
                批量处理: `${time2.toFixed(2)}ms`,
                比率: `${((time2 / time1).toFixed(2))}`,
            });
            
            // 批量处理应该与单独处理性能相当（允许30%误差）
            // 注意：由于我们的实现是简单循环，性能提升不明显
            expect(time2).toBeLessThanOrEqual(time1 * 1.3);
            
            console.log('✓ 批量处理性能测试完成');
        });
    });
    
    describe('边界情况测试', () => {
        it('应该处理空数组', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            const results = scheduler.reviewBatch([]);
            
            expect(results).toHaveLength(0);
        });
        
        it('应该处理单张卡片', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            const reviews = [{ card: testCards[0], rating: Rating.Good }];
            const results = scheduler.reviewBatch(reviews);
            
            expect(results).toHaveLength(1);
            expect(results[0].reps).toBe(1);
        });
        
        it('应该处理大量卡片', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 创建1000张卡片
            const largeCardSet = Array.from({ length: 1000 }, (_, i) => ({
                ...testCards[0],
                id: `card-${i}`,
            }));
            
            const reviews = largeCardSet.map(card => ({
                card,
                rating: Rating.Good,
            }));
            
            const results = scheduler.reviewBatch(reviews);
            
            expect(results).toHaveLength(1000);
            results.forEach(result => {
                expect(result.reps).toBe(1);
            });
        });
    });
});
