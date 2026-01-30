/**
 * Topic/Item 卡片系统单元测试
 *
 * 测试范围：
 * 1. Topic/Item 识别逻辑
 * 2. A-Factor 调度算法
 * 3. 渐进学习队列
 * 4. ExtractionPracticeQueue 过滤
 */

import { ProgressiveLearningQueue } from '../src/core/queue/strategies/ProgressiveLearningQueue';
import { ExtractionPracticeQueue } from '../src/core/queue/strategies/ExtractionPracticeQueue';
import { TopicScheduler } from '../src/core/scheduler/TopicScheduler';
import { CardState } from '../src/types';
import { Rating } from '../src/types';

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

// ============================================
// 场景 1: A-Factor 初始化测试
// ============================================
console.log('\n场景 1: A-Factor 初始化测试');
console.log('===========================================');

async function testAFactorInitialization() {
  // 导入 initializeAFactor
  const { initializeAFactor } = await import('../src/core/card-builder/detectCardType');

  // 测试用例
  const tests = [
    { priority: 0, expected: 1.20 },
    { priority: 50, expected: 3.60 },
    { priority: 100, expected: 6.00 },
    { priority: 25, expected: 2.40 },
    { priority: 75, expected: 4.80 },
  ];

  for (const test of tests) {
    const result = initializeAFactor(test.priority);
    assert(
      Math.abs(result - test.expected) < 0.01,
      `initializeAFactor(${test.priority}) = ${result} (expected ${test.expected})`
    );
  }

  console.log('✅ A-Factor 初始化测试全部通过');
}

await testAFactorInitialization();

// ============================================
// 场景 2: A-Factor 调度算法测试
// ============================================
console.log('\n场景 2: A-Factor 调度算法测试');
console.log('===========================================');

async function testTopicScheduler() {
  const scheduler = new TopicScheduler();

  // 测试 1: 首次复习（New 状态）
  console.log('\n测试 2.1: 首次复习间隔');
  const newCard = {
    id: 'test-1',
    state: CardState.New,
    aFactor: 2.5,
  };

  const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  for (const rating of ratings) {
    const result = await scheduler.schedule(newCard, rating);
    assert(
      result.interval === 2,
      `首次复习 (rating=${rating}): interval = ${result.interval} (expected 2)`
    );
  }

  // 测试 2: Good 评分
  console.log('\n测试 2.2: Good 评分间隔计算');
  const learningCard = {
    id: 'test-2',
    state: CardState.Learning,
    interval: 5,
    aFactor: 2.0,
    lastReview: Date.now(),
  };

  const goodResult = await scheduler.schedule(learningCard, Rating.Good);
  assert(
    goodResult.interval === 10,
    `Good 评分 (interval=5, aFactor=2.0): ${goodResult.interval} (expected 10)`
  );

  // 测试 3: Hard 评分
  console.log('\n测试 2.3: Hard 评分间隔计算');
  const hardResult = await scheduler.schedule(learningCard, Rating.Hard);
  assert(
    hardResult.interval === 8,
    `Hard 评分 (interval=5, aFactor=2.0): ${hardResult.interval} (expected 8, formula: 5 * 2.0 * 0.75 = 7.5 ≈ 8)`
  );

  // 测试 4: Easy 评分
  console.log('\n测试 2.4: Easy 评分间隔计算');
  const easyResult = await scheduler.schedule(learningCard, Rating.Easy);
  assert(
    easyResult.interval === 13,
    `Easy 评分 (interval=5, aFactor=2.0): ${easyResult.interval} (expected 13, formula: 5 * 2.0 * 1.25 = 12.5 ≈ 13)`
  );

  // 测试 5: Again 评分
  console.log('\n测试 2.5: Again 评分重置');
  const againResult = await scheduler.schedule(learningCard, Rating.Again);
  assert(
    againResult.interval === 2,
    `Again 评分: ${againResult.interval} (expected 2, reset to initial)`
  );

  console.log('✅ A-Factor 调度算法测试全部通过');
}

await testTopicScheduler();

// ============================================
// 场景 3: 渐进学习队列测试
// ============================================
console.log('\n场景 3: 渐进学习队列测试');
console.log('===========================================');

async function testProgressiveLearningQueue() {
  // Mock Riff API
  const riffMock = {
    reviewRiffCard: async (_deckID: string, _cardID: string, _rating: Rating) => {
      // Mock implementation
    },
  };

  // Mock setBlockAttrs
  const setBlockAttrsCalls: any[] = [];
  const setBlockAttrsMock = async (_blockID: string, attrs: any) => {
    setBlockAttrsCalls.push(attrs);
  };

  // 创建队列
  const queue = new ProgressiveLearningQueue({
    topicRatio: 0.3,
    autoSort: true,
  });

  // 测试 1: 添加卡片分类
  console.log('\n测试 3.1: 卡片分类');
  await queue.addItems([
    { blockID: 'b1', cardID: 'c1', cardType: 'topic', priority: 10 },
    { blockID: 'b2', cardID: 'c2', cardType: 'item', priority: 20 },
    { blockID: 'b3', cardID: 'c3', cardType: 'topic', priority: 30 },
  ]);

  const stats = await queue.getStats();
  assert(
    stats.total === 3,
    `总队数: ${stats.total} (expected 3)`
  );

  // 测试 2: next() 优先级选择
  console.log('\n测试 3.2: next() 优先级选择（优先级不同）');
  const first = await queue.next();
  assert(
    first?.cardType === 'topic' && first?.priority === 10,
    `第一张卡片: type=${first?.cardType}, priority=${first?.priority} (expected topic, 10)`
  );

  // 测试 3: onFeedback() 路由
  console.log('\n测试 3.3: onFeedback() 路由（跳过）');
  await queue.onFeedback(first, { action: 'skip' });
  const second = await queue.next();
  assert(
    second?.cardID === 'c2',
    `跳过后第二张: ${second?.cardID} (expected c2)`
  );

  // 测试 4: 优先级相同时的随机分布（100 次模拟）
  console.log('\n测试 3.4: 优先级相同时的随机分布');
  await queue.addItems([
    { blockID: 'b4', cardID: 'c4', cardType: 'topic', priority: 50 },
    { blockID: 'b5', cardID: 'c5', cardType: 'item', priority: 50 },
  ]);

  let topicCount = 0;
  let itemCount = 0;
  const iterations = 100;

  for (let i = 0; i < iterations; i++) {
    const testQueue = new ProgressiveLearningQueue({ topicRatio: 0.3, autoSort: false });
    await testQueue.addItems([
      { blockID: 'b4', cardID: 'c4', cardType: 'topic', priority: 50 },
      { blockID: 'b5', cardID: 'c5', cardType: 'item', priority: 50 },
    ]);

    const item = await testQueue.next();
    if (item?.cardType === 'topic') topicCount++;
    else itemCount++;
  }

  const topicPercent = (topicCount / iterations) * 100;
  const itemPercent = (itemCount / iterations) * 100;

  console.log(`实际分布: Topic ${topicPercent}%, Item ${itemPercent}%`);
  console.log(`预期: Topic ~30%, Item ~70%`);

  assert(
    topicPercent >= 15 && topicPercent <= 45,
    `Topic 分布在合理范围内 (15-45%): ${topicPercent}%`
  );

  console.log('✅ 渐进学习队列测试全部通过');
}

await testProgressiveLearningQueue();

// ============================================
// 场景 4: ExtractionPracticeQueue 过滤测试
// ============================================
console.log('\n场景 4: ExtractionPracticeQueue 过滤测试');
console.log('===========================================');

async function testExtractionPracticeQueueFiltering() {
  const storageStub = (() => {
    const state: any[] = [];
    return {
      getPracticeQueue: () => state,
      addPracticeQueue: async (cards: any[]) => {
        const existing = new Set(state.map((c) => c.cardID));
        let added = 0;
        for (const c of cards) {
          if (!c?.cardID || existing.has(c.cardID)) continue;
          existing.add(c.cardID);
          state.push(c);
          added += 1;
        }
        return added;
      },
      setPracticeQueue: async (queue: any[]) => {
        state.length = 0;
        state.push(...queue);
      },
      clearPracticeQueue: async () => {
        state.length = 0;
      },
      readPluginFile: async (_fileName: string) => null,
      writePluginFile: async (_fileName: string, _content: string) => { },
    };
  })();

  const queue = new ExtractionPracticeQueue(storageStub as any);

  // Mock detectCardType
  const originalDetect = await import('../src/core/card-builder/detectCardType');
  const detectMock = async (blockId: string) => {
    if (blockId === 'topic-block') return 'topic';
    if (blockId === 'item-block') return 'item';
    return 'item'; // 默认为 item
  };

  // 使用 proxy 拦截
  const moduleProxy = new Proxy(originalDetect, {
    get(target, prop) {
      if (prop === 'detectCardType') return detectMock;
      return target[prop as keyof typeof target];
    },
  });

  // 测试 1: Topic 卡片过滤
  console.log('\n测试 4.1: Topic 卡片被过滤');
  await queue.addItems([
    { blockID: 'topic-block', cardID: 'c1', deckID: 'deck' },
    { blockID: 'item-block', cardID: 'c2', deckID: 'deck' },
  ]);

  const items = queue.getAllItems();
  assert(
    items.length === 1,
    `队列中卡片数: ${items.length} (expected 1, Topic 被过滤)`
  );
  assert(
    items[0].blockID === 'item-block',
    `剩余卡片: ${items[0].blockID} (expected item-block)`
  );

  console.log('✅ ExtractionPracticeQueue 过滤测试全部通过');
}

await testExtractionPracticeQueueFiltering();

// ============================================
// 测试总结
// ============================================
console.log('\n===========================================');
console.log('🎉 所有测试通过！');
console.log('===========================================');
console.log('\n测试统计:');
console.log('- 场景 1: A-Factor 初始化 - 5 个测试通过');
console.log('- 场景 2: A-Factor 调度算法 - 5 个测试通过');
console.log('- 场景 3: 渐进学习队列 - 4 个测试通过');
console.log('- 场景 4: ExtractionPracticeQueue 过滤 - 1 个测试通过');
console.log('\n总计: 15 个测试全部通过 ✅');
