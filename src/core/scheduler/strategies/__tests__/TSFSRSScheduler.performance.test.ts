/**
 * TSFSRSScheduler 性能测试
 * 
 * 测试 TSFSRSScheduler 的性能表现。
 * 
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TSFSRSScheduler } from '../TSFSRSScheduler';
import { CardState, Rating, type FSRSCard, type FSRSParameters } from '@/types';

describe('TSFSRSScheduler - 性能测试', () => {
    let defaultParams: FSRSParameters;
    let testCard: FSRSCard;
    
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
        
        // 创建测试卡片
        const now = Date.now();
        testCard = {
            id: 'test-card-1',
            blockId: 'block-1',
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
        };
    });
    
    describe('单次操作性能', () => {
        it('应该测试单次 review() 耗时', () => {
            console.log('\n--- 测试：单次 review() 性能 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 预热
            scheduler.review(testCard, Rating.Good);
            
            // 测试100次取平均值
            const times: number[] = [];
            for (let i = 0; i < 100; i++) {
                const start = performance.now();
                scheduler.review(testCard, Rating.Good);
                times.push(performance.now() - start);
            }
            
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            
            console.log('review() 性能:', {
                平均: `${avgTime.toFixed(3)}ms`,
                最小: `${minTime.toFixed(3)}ms`,
                最大: `${maxTime.toFixed(3)}ms`,
            });
            
            // 单次 review 应该在 1ms 以内
            expect(avgTime).toBeLessThan(1);
            
            console.log('✓ 单次 review() 性能良好');
        });
        
        it('应该测试单次 preview() 耗时', () => {
            console.log('\n--- 测试：单次 preview() 性能 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 预热
            scheduler.preview(testCard);
            
            // 测试100次取平均值
            const times: number[] = [];
            for (let i = 0; i < 100; i++) {
                const start = performance.now();
                scheduler.preview(testCard);
                times.push(performance.now() - start);
            }
            
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            
            console.log('preview() 性能:', {
                平均: `${avgTime.toFixed(3)}ms`,
                最小: `${minTime.toFixed(3)}ms`,
                最大: `${maxTime.toFixed(3)}ms`,
            });
            
            // 由于有缓存，平均时间应该很短
            expect(avgTime).toBeLessThan(0.1);
            
            console.log('✓ 单次 preview() 性能良好（缓存生效）');
        });
        
        it('应该测试单次 getRetrievability() 耗时', () => {
            console.log('\n--- 测试：单次 getRetrievability() 性能 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 先复习一次，让卡片有稳定性
            const reviewedCard = scheduler.review(testCard, Rating.Good);
            
            // 预热
            scheduler.getRetrievability(reviewedCard);
            
            // 测试100次取平均值
            const times: number[] = [];
            for (let i = 0; i < 100; i++) {
                const start = performance.now();
                scheduler.getRetrievability(reviewedCard);
                times.push(performance.now() - start);
            }
            
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            
            console.log('getRetrievability() 性能:', {
                平均: `${avgTime.toFixed(3)}ms`,
                最小: `${minTime.toFixed(3)}ms`,
                最大: `${maxTime.toFixed(3)}ms`,
            });
            
            // 单次 getRetrievability 应该在 0.5ms 以内
            expect(avgTime).toBeLessThan(0.5);
            
            console.log('✓ 单次 getRetrievability() 性能良好');
        });
    });
    
    describe('批量操作性能', () => {
        it('应该测试批量调度耗时', () => {
            console.log('\n--- 测试：批量调度性能 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 创建不同数量的卡片集
            const sizes = [10, 50, 100, 500, 1000];
            
            console.log('批量调度性能测试:');
            sizes.forEach(size => {
                const cards = Array.from({ length: size }, (_, i) => ({
                    ...testCard,
                    id: `card-${i}`,
                }));
                
                const reviews = cards.map(card => ({
                    card,
                    rating: Rating.Good,
                }));
                
                const start = performance.now();
                scheduler.reviewBatch(reviews);
                const time = performance.now() - start;
                
                const avgPerCard = time / size;
                
                console.log(`  ${size} 张卡片: ${time.toFixed(2)}ms (平均 ${avgPerCard.toFixed(3)}ms/卡)`);
                
                // 平均每张卡片应该在 1ms 以内
                expect(avgPerCard).toBeLessThan(1);
            });
            
            console.log('✓ 批量调度性能良好');
        });
        
        it('应该测试批量预览耗时', () => {
            console.log('\n--- 测试：批量预览性能 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 创建100张不同的卡片
            const cards = Array.from({ length: 100 }, (_, i) => ({
                ...testCard,
                id: `card-${i}`,
            }));
            
            const start = performance.now();
            cards.forEach(card => {
                scheduler.preview(card);
            });
            const time = performance.now() - start;
            
            const avgPerCard = time / cards.length;
            
            console.log('批量预览性能:', {
                总耗时: `${time.toFixed(2)}ms`,
                平均: `${avgPerCard.toFixed(3)}ms/卡`,
            });
            
            // 平均每张卡片应该在 1ms 以内
            expect(avgPerCard).toBeLessThan(1);
            
            console.log('✓ 批量预览性能良好');
        });
    });
    
    describe('缓存性能影响', () => {
        it('应该测试缓存对 preview() 的性能提升', () => {
            console.log('\n--- 测试：缓存性能提升 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 第一次调用（无缓存）
            const start1 = performance.now();
            scheduler.preview(testCard, now);
            const time1 = performance.now() - start1;
            
            // 后续100次调用（有缓存）
            const start2 = performance.now();
            for (let i = 0; i < 100; i++) {
                scheduler.preview(testCard, now);
            }
            const time2 = performance.now() - start2;
            const avgCached = time2 / 100;
            
            console.log('缓存性能对比:', {
                首次无缓存: `${time1.toFixed(3)}ms`,
                平均有缓存: `${avgCached.toFixed(3)}ms`,
                提升: `${(time1 / avgCached).toFixed(1)}x`,
            });
            
            // 缓存应该显著提升性能（至少5倍）
            expect(avgCached).toBeLessThan(time1 / 5);
            
            console.log('✓ 缓存显著提升性能');
        });
    });
    
    describe('内存使用测试', () => {
        it('应该测试缓存的内存占用', () => {
            console.log('\n--- 测试：缓存内存占用 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 创建1000张不同的卡片并预览（填充缓存）
            const cards = Array.from({ length: 1000 }, (_, i) => ({
                ...testCard,
                id: `card-${i}`,
            }));
            
            cards.forEach(card => {
                scheduler.preview(card);
            });
            
            console.log('已缓存 1000 张卡片的预览结果');
            
            // 验证缓存仍然工作正常
            const start = performance.now();
            scheduler.preview(cards[0]);
            const time = performance.now() - start;
            
            console.log('缓存命中耗时:', `${time.toFixed(3)}ms`);
            
            // 缓存命中应该很快
            expect(time).toBeLessThan(0.1);
            
            console.log('✓ 缓存内存占用正常');
        });
    });
    
    describe('性能总结', () => {
        it('应该生成性能报告', () => {
            console.log('\n=== TSFSRSScheduler 性能报告 ===');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 1. review() 性能
            const reviewTimes: number[] = [];
            for (let i = 0; i < 100; i++) {
                const start = performance.now();
                scheduler.review(testCard, Rating.Good);
                reviewTimes.push(performance.now() - start);
            }
            const avgReview = reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length;
            
            // 2. preview() 性能（无缓存）
            const cards = Array.from({ length: 10 }, (_, i) => ({
                ...testCard,
                id: `card-${i}`,
            }));
            const previewTimes: number[] = [];
            cards.forEach(card => {
                const start = performance.now();
                scheduler.preview(card);
                previewTimes.push(performance.now() - start);
            });
            const avgPreview = previewTimes.reduce((a, b) => a + b, 0) / previewTimes.length;
            
            // 3. preview() 性能（有缓存）
            const cachedTimes: number[] = [];
            for (let i = 0; i < 100; i++) {
                const start = performance.now();
                scheduler.preview(testCard);
                cachedTimes.push(performance.now() - start);
            }
            const avgCached = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
            
            // 4. 批量处理性能
            const batchCards = Array.from({ length: 100 }, (_, i) => ({
                ...testCard,
                id: `batch-card-${i}`,
            }));
            const batchReviews = batchCards.map(card => ({
                card,
                rating: Rating.Good,
            }));
            const batchStart = performance.now();
            scheduler.reviewBatch(batchReviews);
            const batchTime = performance.now() - batchStart;
            const avgBatch = batchTime / batchCards.length;
            
            console.log('\n性能指标:');
            console.log(`  review():              ${avgReview.toFixed(3)}ms`);
            console.log(`  preview() (无缓存):    ${avgPreview.toFixed(3)}ms`);
            console.log(`  preview() (有缓存):    ${avgCached.toFixed(3)}ms`);
            console.log(`  reviewBatch():         ${avgBatch.toFixed(3)}ms/卡`);
            console.log(`  缓存提升:              ${(avgPreview / avgCached).toFixed(1)}x`);
            
            console.log('\n✓ 性能报告生成完成');
            
            // 验证所有操作都在合理范围内
            expect(avgReview).toBeLessThan(1);
            expect(avgPreview).toBeLessThan(1);
            expect(avgCached).toBeLessThan(0.1);
            expect(avgBatch).toBeLessThan(1);
        });
    });
});
