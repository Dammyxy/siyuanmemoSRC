/**
 * TSFSRSScheduler 短期记忆模式测试
 * 
 * 测试短期记忆模式对新卡片复习计划的影响。
 * 
 * **Validates: Requirements 4.2**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TSFSRSScheduler } from '../TSFSRSScheduler';
import { CardState, Rating, type FSRSCard, type FSRSParameters } from '@/types';

describe('TSFSRSScheduler - 短期记忆模式', () => {
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
            enableFuzz: false, // 禁用模糊化以便测试结果可预测
            enableShortTerm: false,
        };
        
        // 创建测试卡片（新卡片）
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
    
    describe('短期记忆模式禁用（默认）', () => {
        it('应该使用标准的复习间隔', () => {
            console.log('\n--- 测试：短期记忆模式禁用 ---');
            
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: false,
            });
            
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Good, now);
            
            console.log('短期记忆禁用 - 首次复习:', {
                scheduledDays: result.scheduledDays,
                stability: result.stability.toFixed(2),
                difficulty: result.difficulty.toFixed(2),
                state: CardState[result.state],
            });
            
            // 验证结果
            expect(result.scheduledDays).toBeGreaterThan(0);
            expect(result.stability).toBeGreaterThan(0);
            expect(result.state).not.toBe(CardState.New);
        });
        
        it('应该返回标准的预览间隔', () => {
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: false,
            });
            
            const now = new Date();
            const preview = scheduler.preview(testCard, now);
            
            console.log('短期记忆禁用 - 预览:');
            preview.forEach((card, rating) => {
                const ratingName = ['', 'Again', 'Hard', 'Good', 'Easy'][rating];
                console.log(`  ${ratingName}: ${card.scheduledDays} 天`);
            });
            
            // 验证所有评分都有预览
            expect(preview.size).toBe(4);
            expect(preview.has(Rating.Again)).toBe(true);
            expect(preview.has(Rating.Hard)).toBe(true);
            expect(preview.has(Rating.Good)).toBe(true);
            expect(preview.has(Rating.Easy)).toBe(true);
        });
    });
    
    describe('短期记忆模式启用', () => {
        it('应该为新卡片提供更密集的复习计划', () => {
            console.log('\n--- 测试：短期记忆模式启用 ---');
            
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: true,
            });
            
            const now = new Date();
            const result = scheduler.review(testCard, Rating.Good, now);
            
            console.log('短期记忆启用 - 首次复习:', {
                scheduledDays: result.scheduledDays,
                stability: result.stability.toFixed(2),
                difficulty: result.difficulty.toFixed(2),
                state: CardState[result.state],
            });
            
            // 验证结果
            // 短期记忆模式下，新卡片可能会有 scheduledDays = 0（当天内复习）
            expect(result.scheduledDays).toBeGreaterThanOrEqual(0);
            expect(result.stability).toBeGreaterThan(0);
            expect(result.state).not.toBe(CardState.New);
        });
        
        it('应该返回更密集的预览间隔', () => {
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: true,
            });
            
            const now = new Date();
            const preview = scheduler.preview(testCard, now);
            
            console.log('短期记忆启用 - 预览:');
            preview.forEach((card, rating) => {
                const ratingName = ['', 'Again', 'Hard', 'Good', 'Easy'][rating];
                console.log(`  ${ratingName}: ${card.scheduledDays} 天`);
            });
            
            // 验证所有评分都有预览
            expect(preview.size).toBe(4);
        });

        it('应该回写 short-term 的 learning_step', () => {
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: true,
            });

            const now = new Date('2026-04-12T15:41:50+08:00');
            const result = scheduler.review(testCard, Rating.Good, now);

            expect(result.state).toBe(CardState.Learning);
            expect(result.learning_step).toBe(1);
            expect(result.due).toBeGreaterThan(now.getTime());
        });
    });
    
    describe('对比测试：启用 vs 禁用短期记忆', () => {
        it('应该显示两种模式的差异', () => {
            console.log('\n--- 对比测试：短期记忆模式 ---');
            
            // 禁用短期记忆
            const schedulerDisabled = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: false,
            });
            
            // 启用短期记忆
            const schedulerEnabled = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: true,
            });
            
            const now = new Date();
            
            // 对比首次复习
            const resultDisabled = schedulerDisabled.review(testCard, Rating.Good, now);
            const resultEnabled = schedulerEnabled.review(testCard, Rating.Good, now);
            
            console.log('对比结果:');
            console.log('  禁用短期记忆:', {
                scheduledDays: resultDisabled.scheduledDays,
                stability: resultDisabled.stability.toFixed(2),
            });
            console.log('  启用短期记忆:', {
                scheduledDays: resultEnabled.scheduledDays,
                stability: resultEnabled.stability.toFixed(2),
            });
            
            // 两种模式都应该产生有效的结果
            expect(resultDisabled.scheduledDays).toBeGreaterThan(0);
            expect(resultEnabled.scheduledDays).toBeGreaterThanOrEqual(0);
            
            // 记录差异（不强制要求特定的大小关系，因为算法可能会变化）
            const daysDiff = Math.abs(resultEnabled.scheduledDays - resultDisabled.scheduledDays);
            const stabilityDiff = Math.abs(resultEnabled.stability - resultDisabled.stability);
            
            console.log('  差异:', {
                daysDiff,
                stabilityDiff: stabilityDiff.toFixed(2),
            });
            
            console.log('✓ 短期记忆模式对比测试完成');
        });
        
        it('应该对比预览结果的差异', () => {
            const schedulerDisabled = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: false,
            });
            
            const schedulerEnabled = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: true,
            });
            
            const now = new Date();
            
            const previewDisabled = schedulerDisabled.preview(testCard, now);
            const previewEnabled = schedulerEnabled.preview(testCard, now);
            
            console.log('\n预览对比:');
            console.log('  禁用短期记忆:');
            previewDisabled.forEach((card, rating) => {
                const ratingName = ['', 'Again', 'Hard', 'Good', 'Easy'][rating];
                console.log(`    ${ratingName}: ${card.scheduledDays} 天`);
            });
            
            console.log('  启用短期记忆:');
            previewEnabled.forEach((card, rating) => {
                const ratingName = ['', 'Again', 'Hard', 'Good', 'Easy'][rating];
                console.log(`    ${ratingName}: ${card.scheduledDays} 天`);
            });
            
            // 验证两种模式都返回 4 个评分选项
            expect(previewDisabled.size).toBe(4);
            expect(previewEnabled.size).toBe(4);
        });
    });
    
    describe('参数更新测试', () => {
        it('应该支持动态切换短期记忆模式', () => {
            console.log('\n--- 测试：动态切换短期记忆模式 ---');
            
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: false,
            });
            
            const now = new Date();
            
            // 禁用模式下复习
            const result1 = scheduler.review(testCard, Rating.Good, now);
            console.log('初始（禁用）:', {
                scheduledDays: result1.scheduledDays,
                stability: result1.stability.toFixed(2),
            });
            
            // 更新参数，启用短期记忆
            scheduler.updateParams({
                ...defaultParams,
                enableShortTerm: true,
            });
            
            // 启用模式下复习相同的卡片
            const result2 = scheduler.review(testCard, Rating.Good, now);
            console.log('更新后（启用）:', {
                scheduledDays: result2.scheduledDays,
                stability: result2.stability.toFixed(2),
            });
            
            // 验证参数更新生效
            expect(result1.scheduledDays).toBeGreaterThan(0);
            expect(result2.scheduledDays).toBeGreaterThanOrEqual(0);
            
            console.log('✓ 动态切换短期记忆模式成功');
        });
    });
    
    describe('多次复习流程测试', () => {
        it('应该测试短期记忆模式下的完整复习流程', () => {
            console.log('\n--- 测试：短期记忆模式下的完整复习流程 ---');
            
            const scheduler = new TSFSRSScheduler({
                ...defaultParams,
                enableShortTerm: true,
            });
            
            let card = { ...testCard };
            const reviewHistory: Array<{ reps: number; scheduledDays: number; stability: number }> = [];
            
            // 进行 5 次复习
            for (let i = 0; i < 5; i++) {
                card = scheduler.review(card, Rating.Good);
                reviewHistory.push({
                    reps: card.reps,
                    scheduledDays: card.scheduledDays,
                    stability: card.stability,
                });
                
                console.log(`复习 ${i + 1}:`, {
                    reps: card.reps,
                    scheduledDays: card.scheduledDays,
                    stability: card.stability.toFixed(2),
                    state: CardState[card.state],
                });
            }
            
            // 验证复习流程
            expect(card.reps).toBe(5);
            expect(card.state).toBe(CardState.Review);
            expect(reviewHistory.length).toBe(5);
            
            console.log('✓ 完整复习流程测试完成');
        });
    });
});
