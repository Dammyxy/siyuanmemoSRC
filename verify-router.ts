/**
 * SchedulerRouter 验证脚本
 * 用于验证基本功能是否正常工作
 */

import { SchedulerRouter } from '../src/core/scheduler/SchedulerRouter';
import type { FSRSCard } from '../src/types';
import { CardState, CardType } from '../src/types';

// Mock StorageManager
class MockStorageManager {
    cards = new Map<string, FSRSCard>();

    setCard(card: FSRSCard): void {
        this.cards.set(card.id, card);
        console.log(`[MockStorage] Saved card ${card.id}`);
    }

    async saveCards(): Promise<void> {
        console.log(`[MockStorage] Saved ${this.cards.size} cards`);
    }

    getCard(id: string): FSRSCard | undefined {
        return this.cards.get(id);
    }
}

// 测试数据
const mockParams = {
    requestRetention: 0.9,
    maximumInterval: 36500,
    weights: new Array(19).fill(0.5),
    enableFuzz: false,
    enableShortTerm: true,
};

function createTestCard(overrides?: Partial<FSRSCard>): FSRSCard {
    return {
        id: 'test-card-1',
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
async function verify() {
    console.log('=== SchedulerRouter 验证 ===\n');

    const storage = new MockStorageManager();
    const router = new SchedulerRouter(
        {
            defaultScheduler: 'fsrs-v5',
            enableRiffSync: false,
            fsrsParams: mockParams,
        },
        storage
    );

    console.log('✅ SchedulerRouter 创建成功');

    // 测试 1: getSchedulerType
    console.log('\n--- 测试 1: getSchedulerType ---');

    const itemCard = createTestCard({ type: CardType.Item });
    const topicCard = createTestCard({ type: CardType.Topic });

    const itemType = router.getSchedulerType(itemCard);
    const topicType = router.getSchedulerType(topicCard);

    console.log(`Item 卡片调度器: ${itemType}`);
    console.log(`Topic 卡片调度器: ${topicType}`);

    if (itemType === 'fsrs-v5' && topicType === 'a-factor') {
        console.log('✅ getSchedulerType 测试通过');
    } else {
        console.error('❌ getSchedulerType 测试失败');
        return false;
    }

    // 测试 2: route
    console.log('\n--- 测试 2: route ---');

    try {
        const updatedCard = await router.route(itemCard, 3); // Good rating
        console.log(`卡片 ${updatedCard.id} 复习完成`);
        console.log(`调度器类型: ${updatedCard.schedulerType}`);
        console.log(`复习次数: ${updatedCard.reps}`);
        console.log(`稳定性: ${updatedCard.stability.toFixed(2)}`);
        console.log('✅ route 测试通过');
    } catch (error) {
        console.error('❌ route 测试失败:', error);
        return false;
    }

    // 测试 3: switchScheduler
    console.log('\n--- 测试 3: switchScheduler ---');

    try {
        const success = await router.switchScheduler(itemCard, 'sm2');
        console.log(`切换结果: ${success ? '成功' : '失败'}`);
        if (success) {
            console.log('✅ switchScheduler 测试通过');
        } else {
            console.error('❌ switchScheduler 测试失败');
            return false;
        }
    } catch (error) {
        console.error('❌ switchScheduler 测试失败:', error);
        return false;
    }

    // 测试 4: preview
    console.log('\n--- 测试 4: preview ---');

    try {
        const previews = router.preview(itemCard);
        console.log(`预览数量: ${previews.size}`);
        previews.forEach((card, rating) => {
            console.log(`Rating ${rating}: stability=${card.stability.toFixed(2)}, reps=${card.reps}`);
        });
        if (previews.size === 4) {
            console.log('✅ preview 测试通过');
        } else {
            console.error('❌ preview 测试失败');
            return false;
        }
    } catch (error) {
        console.error('❌ preview 测试失败:', error);
        return false;
    }

    // 测试 5: _convertCardState
    console.log('\n--- 测试 5: _convertCardState ---');

    try {
        const cardWithAFactor = createTestCard({ aFactor: 3.0 });
        const converted = (router as any)._convertCardState(
            cardWithAFactor,
            'a-factor',
            'fsrs-v5'
        );
        console.log(`A-Factor ${cardWithAFactor.aFactor} → Difficulty ${converted.difficulty.toFixed(2)}`);
        const expectedDifficulty = 1 + ((3.0 - 1.2) / 4.8) * 9;
        if (Math.abs(converted.difficulty - expectedDifficulty) < 0.1) {
            console.log('✅ _convertCardState 测试通过');
        } else {
            console.error('❌ _convertCardState 测试失败');
            return false;
        }
    } catch (error) {
        console.error('❌ _convertCardState 测试失败:', error);
        return false;
    }

    console.log('\n=== 所有测试通过 ✅ ===');
    return true;
}

// 运行验证
verify().then((success) => {
    if (!success) {
        process.exit(1);
    }
});
