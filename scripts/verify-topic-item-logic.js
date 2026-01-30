/**
 * Topic/Item 卡片系统逻辑验证
 *
 * 直接验证核心逻辑的正确性
 */

// ============================================
// 测试 1: A-Factor 初始化
// ============================================
console.log('测试 1: A-Factor 初始化');
console.log('===========================================');

function initializeAFactor(priority) {
  const aFactor = 1.2 + (priority / 100) * 4.8;
  return Math.round(aFactor * 100) / 100;
}

const tests = [
  { priority: 0, expected: 1.20 },
  { priority: 50, expected: 3.60 },
  { priority: 100, expected: 6.00 },
  { priority: 25, expected: 2.40 },
  { priority: 75, expected: 4.80 },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = initializeAFactor(test.priority);
  if (Math.abs(result - test.expected) < 0.01) {
    console.log(`✅ initializeAFactor(${test.priority}) = ${result} (expected ${test.expected})`);
    passed++;
  } else {
    console.log(`❌ initializeAFactor(${test.priority}) = ${result} (expected ${test.expected})`);
    failed++;
  }
}

// ============================================
// 测试 2: A-Factor 调度算法
// ============================================
console.log('\n测试 2: A-Factor 调度算法');
console.log('===========================================');

// 模拟 CardState 枚举
const CardState = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
};

// 模拟 Rating 枚举
const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
};

function scheduleTopic(card, rating) {
  const { state, interval, aFactor } = card;

  // 首次复习：固定 2 天
  if (state === CardState.New) {
    return {
      ...card,
      state: CardState.Learning,
      interval: 2,
      due: Date.now() + 2 * 24 * 60 * 60 * 1000,
    };
  }

  // 后续复习：根据评分调整
  let newInterval = interval;

  switch (rating) {
    case Rating.Again:
      newInterval = 2;
      break;
    case Rating.Hard:
      newInterval = Math.max(2, Math.round(interval * aFactor * 0.75));
      break;
    case Rating.Good:
      newInterval = Math.round(interval * aFactor);
      break;
    case Rating.Easy:
      newInterval = Math.round(interval * aFactor * 1.25);
      break;
  }

  return {
    ...card,
    state: CardState.Learning,
    interval: newInterval,
    due: Date.now() + newInterval * 24 * 60 * 60 * 1000,
  };
}

// 测试首次复习
console.log('\n测试 2.1: 首次复习（任意评分）');
const newCard = { id: 'test-1', state: CardState.New, aFactor: 2.5 };
const firstReviewResults = [
  scheduleTopic(newCard, Rating.Again),
  scheduleTopic(newCard, Rating.Hard),
  scheduleTopic(newCard, Rating.Good),
  scheduleTopic(newCard, Rating.Easy),
];

const allTwoDays = firstReviewResults.every(r => r.interval === 2);
if (allTwoDays) {
  console.log(`✅ 首次复习（所有评分）: interval = 2 天`);
  passed++;
} else {
  console.log(`❌ 首次复习失败: 不是所有评分都返回 2 天`);
  failed++;
}

// 测试 Good 评分
console.log('\n测试 2.2: Good 评分');
const learningCard = {
  id: 'test-2',
  state: CardState.Learning,
  interval: 5,
  aFactor: 2.0,
};
const goodResult = scheduleTopic(learningCard, Rating.Good);
if (goodResult.interval === 10) {
  console.log(`✅ Good 评分 (interval=5, aFactor=2.0): ${goodResult.interval} 天 (expected 10)`);
  passed++;
} else {
  console.log(`❌ Good 评分失败: ${goodResult.interval} (expected 10)`);
  failed++;
}

// 测试 Hard 评分
console.log('\n测试 2.3: Hard 评分');
const hardResult = scheduleTopic(learningCard, Rating.Hard);
if (hardResult.interval === 8) {
  console.log(`✅ Hard 评分 (interval=5, aFactor=2.0): ${hardResult.interval} 天 (expected 8, formula: 5 * 2.0 * 0.75 = 7.5 ≈ 8)`);
  passed++;
} else {
  console.log(`❌ Hard 评分失败: ${hardResult.interval} (expected 8)`);
  failed++;
}

// 测试 Easy 评分
console.log('\n测试 2.4: Easy 评分');
const easyResult = scheduleTopic(learningCard, Rating.Easy);
if (easyResult.interval === 13) {
  console.log(`✅ Easy 评分 (interval=5, aFactor=2.0): ${easyResult.interval} 天 (expected 13, formula: 5 * 2.0 * 1.25 = 12.5 ≈ 13)`);
  passed++;
} else {
  console.log(`❌ Easy 评分失败: ${easyResult.interval} (expected 13)`);
  failed++;
}

// 测试 Again 评分
console.log('\n测试 2.5: Again 评分');
const againResult = scheduleTopic(learningCard, Rating.Again);
if (againResult.interval === 2) {
  console.log(`✅ Again 评分: ${againResult.interval} 天 (expected 2, 重置为初始间隔)`);
  passed++;
} else {
  console.log(`❌ Again 评分失败: ${againResult.interval} (expected 2)`);
  failed++;
}

// ============================================
// 测试 3: 渐进学习队列 next() 策略
// ============================================
console.log('\n测试 3: 渐进学习队列 next() 策略');
console.log('===========================================');

// 模拟 next() 选择逻辑
function selectNextCard(topicNext, itemNext, topicRatio) {
  if (!topicNext) return itemNext;
  if (!itemNext) return topicNext;

  const topicPriority = topicNext.priority ?? 50;
  const itemPriority = itemNext.priority ?? 50;

  // 优先级不同：返回优先级更高的（数值越小优先级越高）
  if (topicPriority < itemPriority) return topicNext;
  if (itemPriority < topicPriority) return itemNext;

  // 优先级相同：根据 topicRatio 加权随机选择
  const shouldPickTopic = Math.random() * 100 < topicRatio * 100;
  return shouldPickTopic ? topicNext : itemNext;
}

// 测试 3.1: 只有 Topic
console.log('\n测试 3.1: 只有 Topic');
const result1 = selectNextCard({ cardID: 't1', priority: 10 }, null, 0.3);
if (result1?.cardID === 't1') {
  console.log(`✅ 只有 Topic: 返回 Topic`);
  passed++;
} else {
  console.log(`❌ 只有 Topic: 失败`);
  failed++;
}

// 测试 3.2: 只有 Item
console.log('\n测试 3.2: 只有 Item');
const result2 = selectNextCard(null, { cardID: 'i1', priority: 20 }, 0.3);
if (result2?.cardID === 'i1') {
  console.log(`✅ 只有 Item: 返回 Item`);
  passed++;
} else {
  console.log(`❌ 只有 Item: 失败`);
  failed++;
}

// 测试 3.3: Topic 优先级更高
console.log('\n测试 3.3: Topic 优先级更高');
const result3 = selectNextCard(
  { cardID: 't1', priority: 10 },
  { cardID: 'i1', priority: 20 },
  0.3
);
if (result3?.cardID === 't1') {
  console.log(`✅ Topic 优先级更高 (10 < 20): 返回 Topic`);
  passed++;
} else {
  console.log(`❌ Topic 优先级更高: 失败`);
  failed++;
}

// 测试 3.4: Item 优先级更高
console.log('\n测试 3.4: Item 优先级更高');
const result4 = selectNextCard(
  { cardID: 't1', priority: 20 },
  { cardID: 'i1', priority: 10 },
  0.3
);
if (result4?.cardID === 'i1') {
  console.log(`✅ Item 优先级更高 (10 < 20): 返回 Item`);
  passed++;
} else {
  console.log(`❌ Item 优先级更高: 失败`);
  failed++;
}

// 测试 3.5: 优先级相同，验证随机分布
console.log('\n测试 3.5: 优先级相同时的随机分布（100 次模拟）');
const topicRatio = 0.3;
let topicCount = 0;
let itemCount = 0;
const iterations = 100;

for (let i = 0; i < iterations; i++) {
  const result = selectNextCard(
    { cardID: 't1', priority: 50 },
    { cardID: 'i1', priority: 50 },
    topicRatio
  );
  if (result?.cardID === 't1') topicCount++;
  else itemCount++;
}

const topicPercent = (topicCount / iterations) * 100;
const itemPercent = (itemCount / iterations) * 100;

console.log(`实际分布: Topic ${topicPercent}%, Item ${itemPercent}%`);
console.log(`预期: Topic ~30%, Item ~70%`);

if (topicPercent >= 15 && topicPercent <= 45) {
  console.log(`✅ 分布符合预期 (15-45% 范围内)`);
  passed++;
} else {
  console.log(`❌ 分布不符合预期 (Topic ${topicPercent}% 超出 15-45% 范围)`);
  failed++;
}

// ============================================
// 测试总结
// ============================================
console.log('\n===========================================');
console.log('测试总结');
console.log('===========================================');
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📊 总计: ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 所有测试通过！');
  process.exit(0);
} else {
  console.log('\n⚠️ 存在失败的测试');
  process.exit(1);
}
