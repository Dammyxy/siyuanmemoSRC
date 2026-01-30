/**
 * SM-15 调试脚本
 * 追踪 optimumInterval 的变化
 */

import { SM15Scheduler } from './src/core/scheduler/strategies/SM15Scheduler';
import type { FSRSCard } from './src/types';
import { CardState, CardType } from './src/types';

const mockParams = {
    requestRetention: 0.9,
    maximumInterval: 36500,
    weights: new Array(19).fill(0.5),
    enableFuzz: false,
    enableShortTerm: true,
};

function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
    return {
        id: 'debug-card-1',
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

function debug() {
    console.log('=== SM-15 调试 ===\n');

    const scheduler = new SM15Scheduler(mockParams);
    let card = createTestCard();

    console.log('初始状态:');
    console.log(`  reps: ${card.reps}`);
    console.log(`  scheduledDays: ${card.scheduledDays}`);
    console.log(`  optimumInterval: ${card.schedulerMeta?.sm15?.optimumInterval}`);
    console.log(`  of: ${card.schedulerMeta?.sm15?.of}`);
    console.log('');

    // 第 1 次复习
    console.log('第 1 次复习 (Good):');
    card = scheduler.review(card, 3);
    console.log(`  reps: ${card.reps}`);
    console.log(`  scheduledDays: ${card.scheduledDays}`);
    console.log(`  optimumInterval: ${card.schedulerMeta?.sm15?.optimumInterval}`);
    console.log(`  of: ${card.schedulerMeta?.sm15?.of}`);
    console.log(`  afs: ${JSON.stringify(card.schedulerMeta?.sm15?.afs)}`);
    console.log('');

    // 第 2 次复习
    console.log('第 2 次复习 (Good):');
    const cardBeforeReview = { ...card };
    card = scheduler.review(card, 3);
    console.log(`  复习前 optimumInterval: ${cardBeforeReview.schedulerMeta?.sm15?.optimumInterval}`);
    console.log(`  复习前 of: ${cardBeforeReview.schedulerMeta?.sm15?.of}`);
    console.log(`  复习后 reps: ${card.reps}`);
    console.log(`  复习后 scheduledDays: ${card.scheduledDays}`);
    console.log(`  复习后 optimumInterval: ${card.schedulerMeta?.sm15?.optimumInterval}`);
    console.log(`  复习后 of: ${card.schedulerMeta?.sm15?.of}`);
    console.log(`  复习后 afs: ${JSON.stringify(card.schedulerMeta?.sm15?.afs)}`);
    console.log('');

    // 计算 NaN
    const ofBefore = cardBeforeReview.schedulerMeta?.sm15?.of || 1;
    const optIntervalBefore = cardBeforeReview.schedulerMeta?.sm15?.optimumInterval || 1;
    console.log('计算检查:');
    console.log(`  of (复习前): ${ofBefore} (类型: ${typeof ofBefore})`);
    console.log(`  optimumInterval (复习前): ${optIntervalBefore} (类型: ${typeof optIntervalBefore})`);
    console.log(`  optimumInterval * of = ${optIntervalBefore * ofBefore}`);
    console.log(`  Math.round(optimumInterval * of) = ${Math.round(optIntervalBefore * ofBefore)}`);
}

debug();
