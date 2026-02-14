/**
 * TSFSRSScheduler 缓存功能测试
 * 
 * 测试 preview() 方法的缓存策略。
 * 
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TSFSRSScheduler } from '../TSFSRSScheduler';
import { CardState, Rating, type FSRSCard, type FSRSParameters } from '@/types';

describe('TSFSRSScheduler - 缓存功能', () => {
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
    
    describe('缓存命中测试', () => {
        it('应该在同一分钟内缓存 preview() 结果', () => {
            console.log('\n--- 测试：缓存命中 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 第一次调用 preview
            const result1 = scheduler.preview(testCard, now);
            console.log('第一次 preview:', {
                Again: result1.get(Rating.Again)?.scheduledDays,
                Good: result1.get(Rating.Good)?.scheduledDays,
            });
            
            // 第二次调用 preview（同一时间）
            const result2 = scheduler.preview(testCard, now);
            console.log('第二次 preview:', {
                Again: result2.get(Rating.Again)?.scheduledDays,
                Good: result2.get(Rating.Good)?.scheduledDays,
            });
            
            // 验证返回的是同一个 Map 对象（缓存命中）
            expect(result1).toBe(result2);
            
            console.log('✓ 缓存命中成功');
        });
        
        it('应该在同一分钟内的不同秒数缓存结果', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 同一分钟内的不同时间点
            const time1 = new Date('2024-01-01T12:00:00Z');
            const time2 = new Date('2024-01-01T12:00:30Z'); // 30秒后
            const time3 = new Date('2024-01-01T12:00:59Z'); // 59秒后
            
            const result1 = scheduler.preview(testCard, time1);
            const result2 = scheduler.preview(testCard, time2);
            const result3 = scheduler.preview(testCard, time3);
            
            // 验证都是同一个缓存结果
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
        });
    });
    
    describe('缓存未命中测试', () => {
        it('应该在不同分钟重新计算 preview() 结果', () => {
            console.log('\n--- 测试：缓存未命中（不同分钟）---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 不同分钟的时间点
            const time1 = new Date('2024-01-01T12:00:00Z');
            const time2 = new Date('2024-01-01T12:01:00Z'); // 1分钟后
            
            const result1 = scheduler.preview(testCard, time1);
            const result2 = scheduler.preview(testCard, time2);
            
            console.log('时间1 preview:', {
                Again: result1.get(Rating.Again)?.scheduledDays,
                Good: result1.get(Rating.Good)?.scheduledDays,
            });
            console.log('时间2 preview:', {
                Again: result2.get(Rating.Again)?.scheduledDays,
                Good: result2.get(Rating.Good)?.scheduledDays,
            });
            
            // 验证不是同一个对象（缓存未命中）
            expect(result1).not.toBe(result2);
            
            console.log('✓ 不同分钟正确重新计算');
        });
        
        it('应该为不同卡片使用不同的缓存', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            const card1 = { ...testCard, id: 'card-1' };
            const card2 = { ...testCard, id: 'card-2' };
            
            const result1 = scheduler.preview(card1, now);
            const result2 = scheduler.preview(card2, now);
            
            // 验证不是同一个对象（不同卡片）
            expect(result1).not.toBe(result2);
        });
    });
    
    describe('缓存过期测试', () => {
        it('应该在缓存过期后重新计算', () => {
            console.log('\n--- 测试：缓存过期 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            
            // 使用固定时间
            const time1 = new Date('2024-01-01T12:00:00Z');
            const time2 = new Date('2024-01-01T12:06:00Z'); // 6分钟后（超过5分钟TTL）
            
            const result1 = scheduler.preview(testCard, time1);
            console.log('初始 preview:', {
                Again: result1.get(Rating.Again)?.scheduledDays,
                Good: result1.get(Rating.Good)?.scheduledDays,
            });
            
            // 6分钟后再次调用（缓存应该过期）
            const result2 = scheduler.preview(testCard, time2);
            console.log('6分钟后 preview:', {
                Again: result2.get(Rating.Again)?.scheduledDays,
                Good: result2.get(Rating.Good)?.scheduledDays,
            });
            
            // 验证不是同一个对象（缓存已过期）
            expect(result1).not.toBe(result2);
            
            console.log('✓ 缓存正确过期');
        });
    });
    
    describe('缓存清理测试', () => {
        it('应该在参数更新时清空缓存', () => {
            console.log('\n--- 测试：参数更新清空缓存 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 第一次 preview
            const result1 = scheduler.preview(testCard, now);
            console.log('初始 preview:', {
                Good: result1.get(Rating.Good)?.scheduledDays,
            });
            
            // 更新参数
            scheduler.updateParams({
                ...defaultParams,
                requestRetention: 0.85, // 修改保留率
            });
            
            // 再次 preview（应该重新计算，因为缓存已清空）
            const result2 = scheduler.preview(testCard, now);
            console.log('参数更新后 preview:', {
                Good: result2.get(Rating.Good)?.scheduledDays,
            });
            
            // 验证不是同一个对象（缓存已清空）
            expect(result1).not.toBe(result2);
            
            console.log('✓ 参数更新正确清空缓存');
        });
    });
    
    describe('性能测试', () => {
        it('应该显著提升重复 preview 的性能', () => {
            console.log('\n--- 测试：缓存性能提升 ---');
            
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 第一次调用（无缓存）
            const start1 = performance.now();
            scheduler.preview(testCard, now);
            const time1 = performance.now() - start1;
            
            // 第二次调用（有缓存）
            const start2 = performance.now();
            scheduler.preview(testCard, now);
            const time2 = performance.now() - start2;
            
            console.log('性能对比:', {
                无缓存: `${time1.toFixed(3)}ms`,
                有缓存: `${time2.toFixed(3)}ms`,
                提升: `${((time1 / time2).toFixed(1))}x`,
            });
            
            // 缓存命中应该更快（至少快2倍）
            expect(time2).toBeLessThan(time1 / 2);
            
            console.log('✓ 缓存显著提升性能');
        });
        
        it('应该处理大量连续 preview 请求', () => {
            const scheduler = new TSFSRSScheduler(defaultParams);
            const now = new Date();
            
            // 连续调用100次
            const results: Map<Rating, FSRSCard>[] = [];
            for (let i = 0; i < 100; i++) {
                results.push(scheduler.preview(testCard, now));
            }
            
            // 验证所有结果都是同一个对象（缓存命中）
            for (let i = 1; i < results.length; i++) {
                expect(results[i]).toBe(results[0]);
            }
        });
    });
});
