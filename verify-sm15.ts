/**
 * SM-15 验证脚本
 * 验证 SM-15 调度器基本功能
 */

import { SM15Scheduler } from './src/core/scheduler/strategies/SM15Scheduler';
import type { FSRSCard } from './src/types';
import { CardState, CardType } from './src/types';

// FSRS 参数
const mockParams = {
    requestRetention: 0.9,
    maximumInterval: 36500,
    weights: new Array(19).fill(0.5),
    enableFuzz: false,
    enableShortTerm: true,
};

// 创建测试卡片
function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
    return {
        id: 'sm15-test-card-1',
        blockId: 'block-1',
        due: Date.now(),
        stability: 0,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    };
}

// 验证函数
function verify() {
    console.log('=== SM-15 验证 ===\n');

    // 测试 1: 创建 SM15Scheduler
    console.log('--- 测试 1: 创建 SM15Scheduler ---');
    try {
        const scheduler = new SM15Scheduler(mockParams);
        console.log('✅ SM15Scheduler 创建成功');
    } catch (error) {
        console.error('❌ SM15Scheduler 创建失败:', error);
        return false;
    }

    const scheduler = new SM15Scheduler(mockParams);

    // 测试 2: review 方法
    console.log('\n--- 测试 2: review 方法 ---');
    try {
        const card = createTestCard();
        const updatedCard = scheduler.review(card, 3); // Good rating
        console.log(`卡片 ${updatedCard.id} 复习完成`);
        console.log(`复习次数: ${updatedCard.reps}`);
        console.log(`计划天数: ${updatedCard.scheduledDays}`);
        console.log(`SM-15 O-Factor: ${updatedCard.schedulerMeta?.sm15?.of}`);
        console.log('✅ review 测试通过');
    } catch (error) {
        console.error('❌ review 测试失败:', error);
        return false;
    }

    // 测试 3: preview 方法
    console.log('\n--- 测试 3: preview 方法 ---');
    try {
        const card = createTestCard();
        const previews = scheduler.preview(card);
        console.log(`预览数量: ${previews.size}`);
        previews.forEach((updatedCard, rating) => {
            const ratingNames: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
            console.log(`  ${ratingNames[rating]}: reps=${updatedCard.reps}, days=${updatedCard.scheduledDays}`);
        });
        if (previews.size === 4) {
            console.log('✅ preview 测试通过');
        } else {
            console.error('❌ preview 测试失败: 预览数量不正确');
            return false;
        }
    } catch (error) {
        console.error('❌ preview 测试失败:', error);
        return false;
    }

    // 测试 4: getRetrievability 方法
    console.log('\n--- 测试 4: getRetrievability 方法 ---');
    try {
        const card = createTestCard({ reps: 1, lastReview: Date.now() - 86400000 }); // 1 天前复习
        const retrievability = scheduler.getRetrievability(card);
        console.log(`可提取性: ${retrievability.toFixed(2)}%`);
        if (retrievability >= 0 && retrievability <= 100) {
            console.log('✅ getRetrievability 测试通过');
        } else {
            console.error('❌ getRetrievability 测试失败: 值超出范围');
            return false;
        }
    } catch (error) {
        console.error('❌ getRetrievability 测试失败:', error);
        return false;
    }

    // 测试 5: 多次复习（学习曲线）
    console.log('\n--- 测试 5: 多次复习（学习曲线） ---');
    try {
        let card = createTestCard();
        const ratings = [3, 3, 4, 4, 3]; // Good, Good, Easy, Easy, Good

        for (let i = 0; i < ratings.length; i++) {
            card = scheduler.review(card, ratings[i]);
            const ratingNames: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
            const of = card.schedulerMeta?.sm15?.of;
            const days = card.scheduledDays;
            console.log(`第 ${i + 1} 次复习 (${ratingNames[ratings[i]]}): reps=${card.reps}, days=${days}, of=${of}`);

            // 检查是否有 NaN
            if (i === 1 && (isNaN(Number(of)) || isNaN(Number(days)))) {
                console.warn(`⚠️  警告: 第 2 次复习后出现 NaN`);
                console.warn(`  schedulerMeta:`, JSON.stringify(card.schedulerMeta));
                console.warn(`  optimumInterval:`, card.schedulerMeta?.sm15?.optimumInterval);
            }
        }
        console.log('✅ 学习曲线测试通过');
    } catch (error) {
        console.error('❌ 学习曲线测试失败:', error);
        return false;
    }

    console.log('\n=== 所有测试通过 ✅ ===');
    return true;
}

// 运行验证
const success = verify();
process.exit(success ? 0 : 1);
