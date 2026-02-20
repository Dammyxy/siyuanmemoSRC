# XiuYuan 统一化手动测试指南

## 测试目标

验证 XiuYuan 完全统一化功能的所有核心场景，确保：
- 所有卡片创建流程正常工作
- 数据一致性和完整性
- 性能满足要求
- 用户体验流畅

## 测试环境准备

### 前置条件
- [ ] 思源笔记已安装并运行
- [ ] SiYuanMemo 插件已安装最新版本
- [ ] 插件已启用
- [ ] 准备测试笔记本（建议创建专门的测试笔记本）

### 测试数据准备
- [ ] 创建测试文档，包含不同类型的块
- [ ] 准备包含 `<>` 符号的块
- [ ] 准备列表块（用于列表模版卡测试）
- [ ] 准备概念-描述符对（两个连续的块）

---

## 测试场景

### 场景 1: 创建概念卡（块菜单）

**测试步骤：**
1. 在思源笔记中创建一个块，内容为："领域驱动设计"
2. 右键点击该块，打开块菜单
3. 选择"创建概念卡"选项
4. 观察卡片创建结果

**预期结果：**
- [ ] 卡片创建成功，显示成功提示
- [ ] 卡片类型为 `concept`
- [ ] 卡片使用 `builtin-concept-simple` 模板
- [ ] 卡片有有效的 `xiuyuanID`
- [ ] 卡片默认优先级为 50
- [ ] 卡片调度器类型为 `a-factor`（单块概念卡）

**验证方法：**
```javascript
// 在浏览器控制台执行
const storage = window.siyuanMemo.storage;
const cards = storage.getCardsByBlockId('块ID');
console.log(cards);
// 检查 xiuyuanID, type, templateID, schedulerType
```

---

### 场景 2: 创建概念卡（自动检测）

**测试步骤：**
1. 创建两个连续的块：
   - 块 1: "DDD"
   - 块 2: "Domain-Driven Design，一种软件设计方法论"
2. 选中第一个块
3. 触发自动卡片创建（如果启用了自动检测功能）

**预期结果：**
- [ ] 系统自动检测到概念-描述符对
- [ ] 创建概念卡，类型为 `concept`
- [ ] 使用 `builtin-concept-descriptor` 模板
- [ ] 卡片有有效的 `xiuyuanID`
- [ ] 卡片调度器类型为 `fsrs-v6`（有描述符的概念卡）
- [ ] 正面显示"DDD"，背面显示描述

**验证方法：**
```javascript
const cards = storage.getCardsByBlockId('块1的ID');
console.log(cards[0].schedulerType); // 应该是 'fsrs-v6'
console.log(cards[0].templateID); // 应该是 'builtin-concept-descriptor'
```

---

### 场景 3: 创建符号检测卡（<>）

**测试步骤：**
1. 创建一个包含 `<>` 符号的块：
   - "DDD <> 领域驱动设计"
2. 触发卡片创建（块菜单或自动检测）

**预期结果：**
- [ ] 系统自动检测到 `<>` 符号
- [ ] 使用 `builtin-symbol-qa` 模板
- [ ] 卡片类型为 `item`
- [ ] 正面显示 "DDD"，背面显示 "领域驱动设计"
- [ ] 卡片元数据包含 `symbolDetected: true`

**验证方法：**
```javascript
const cards = storage.getCardsByBlockId('块ID');
console.log(cards[0].templateID); // 应该是 'builtin-symbol-qa'
console.log(cards[0].meta.symbolDetected); // 应该是 true
```

---

### 场景 4: 创建快速卡片

**测试步骤：**
1. 创建一个简单的块："什么是 FSRS？"
2. 使用快速卡片创建功能（如快捷键或菜单）

**预期结果：**
- [ ] 卡片创建成功
- [ ] 使用 `builtin-quick-card` 模板
- [ ] 卡片类型为 `item`
- [ ] 卡片有有效的 `xiuyuanID`
- [ ] 创建速度快（< 50ms）

**验证方法：**
```javascript
const cards = storage.getCardsByBlockId('块ID');
console.log(cards[0].templateID); // 应该是 'builtin-quick-card'
```

---

### 场景 5: 创建模板卡片

**测试步骤：**
1. 创建两个块：
   - 块 1: "问题：什么是 DDD？"
   - 块 2: "答案：领域驱动设计"
2. 选择使用特定模板创建卡片（如 `builtin-basic-qa`）

**预期结果：**
- [ ] 卡片使用指定的模板
- [ ] 正面显示问题，背面显示答案
- [ ] 卡片有有效的 `xiuyuanID`
- [ ] 字段映射正确

**验证方法：**
```javascript
const cards = storage.getCardsByBlockId('块1的ID');
console.log(cards[0].templateID); // 应该是 'builtin-basic-qa'
console.log(cards[0].meta.frontFields); // 应该包含问题字段
console.log(cards[0].meta.backFields); // 应该包含答案字段
```

---

### 场景 6: 创建列表模版卡

**测试步骤：**
1. 创建一个列表块，包含多个子项：
   ```
   - 父项：编程语言
     - JavaScript
     - Python
     - TypeScript
   ```
2. 选择父项，创建列表模版卡

**预期结果：**
- [ ] 为每个子项创建一张卡片（3 张卡片）
- [ ] 所有卡片共享同一个 `xiuyuanID`
- [ ] 每张卡片的 `meta.currentIndex` 不同
- [ ] 每张卡片的 `meta.cue` 和 `meta.answer` 对应不同的子项
- [ ] 使用 `builtin-list-item` 模板

**验证方法：**
```javascript
const cards = storage.getCardsByBlockId('父项块ID');
console.log(cards.length); // 应该是 3
console.log(cards[0].xiuyuanID === cards[1].xiuyuanID); // 应该是 true
console.log(cards.map(c => c.meta.currentIndex)); // 应该是 [0, 1, 2]
```

---

### 场景 7: 删除卡片

**测试步骤：**
1. 创建一张测试卡片
2. 记录卡片的 `id` 和 `xiuyuanID`
3. 删除该卡片（通过浏览器或 API）
4. 验证删除结果

**预期结果：**
- [ ] 卡片从存储中删除
- [ ] 如果是该 XiuYuan 的最后一张卡片，XiuYuan 也被删除
- [ ] 所有索引更新正确
- [ ] 查询该卡片返回 `undefined`

**验证方法：**
```javascript
const cardId = '卡片ID';
const xiuyuanId = '修缘ID';

// 删除前
console.log(storage.getCard(cardId)); // 应该返回卡片对象

// 执行删除
await storage.deleteCard(cardId);

// 删除后
console.log(storage.getCard(cardId)); // 应该返回 undefined
console.log(storage.getXiuYuan(xiuyuanId)); // 如果是最后一张卡片，应该返回 undefined
```

---

### 场景 8: 删除双向卡片

**测试步骤：**
1. 创建一张双向卡片（生成 2 张卡片）
2. 删除其中一张卡片
3. 验证另一张卡片和 XiuYuan 的状态

**预期结果：**
- [ ] 被删除的卡片不存在
- [ ] 另一张卡片仍然存在
- [ ] XiuYuan 仍然存在（因为还有一张卡片）
- [ ] 删除第二张卡片后，XiuYuan 也被删除

**验证方法：**
```javascript
const xiuyuanId = '修缘ID';
const cards = storage.getCardsByXiuyuanId(xiuyuanId);
console.log(cards.length); // 删除一张后应该是 1

// 删除第二张
await storage.deleteCard(cards[0].id);
console.log(storage.getXiuYuan(xiuyuanId)); // 应该返回 undefined
```

---

### 场景 9: 复习卡片

**测试步骤：**
1. 创建几张测试卡片
2. 打开复习界面
3. 复习卡片，选择不同的评分（Again, Hard, Good, Easy）
4. 观察卡片状态变化

**预期结果：**
- [ ] 卡片正确显示正面和背面内容
- [ ] 评分后卡片状态更新（due, stability, difficulty 等）
- [ ] 卡片从到期队列中移除
- [ ] 下次到期时间正确计算
- [ ] 数据自动保存（1 秒延迟）

**验证方法：**
```javascript
const cardId = '卡片ID';
const cardBefore = storage.getCard(cardId);
console.log('复习前:', cardBefore.due, cardBefore.state);

// 执行复习...

const cardAfter = storage.getCard(cardId);
console.log('复习后:', cardAfter.due, cardAfter.state);
// due 应该更新，state 可能从 New 变为 Learning 或 Review
```

---

### 场景 10: 浏览器查看卡片

**测试步骤：**
1. 创建多张不同类型的卡片
2. 打开卡片浏览器
3. 测试以下功能：
   - 按类型筛选
   - 按优先级排序
   - 搜索卡片
   - 查看卡片详情

**预期结果：**
- [ ] 所有卡片正确显示
- [ ] 筛选功能正常工作
- [ ] 排序功能正常工作
- [ ] 搜索功能正常工作
- [ ] 卡片详情显示完整（包括 xiuyuanID, templateID, schedulerType 等）
- [ ] 查询性能良好（< 100ms）

**验证方法：**
```javascript
// 测试查询性能
console.time('getDueCards');
const dueCards = storage.getDueCards(100);
console.timeEnd('getDueCards'); // 应该 < 100ms

// 测试按类型查询
const conceptCards = storage.getCardsByType('concept');
console.log('概念卡数量:', conceptCards.length);
```

---

### 场景 11: 优先级设置

**测试步骤：**
1. 创建一张测试卡片
2. 在浏览器中修改卡片优先级（例如从 50 改为 80）
3. 验证优先级更新

**预期结果：**
- [ ] 优先级更新成功
- [ ] 优先级只存储在 `FSRSCard.priority` 中
- [ ] 块属性中没有 `custom-fsrs-priority` 属性
- [ ] 优先级索引更新正确
- [ ] 数据自动保存

**验证方法：**
```javascript
const cardId = '卡片ID';
const card = storage.getCard(cardId);

// 更新优先级
card.priority = 80;
await storage.updateCard(card);

// 验证
const updatedCard = storage.getCard(cardId);
console.log(updatedCard.priority); // 应该是 80

// 验证块属性（应该没有优先级）
const blockAttrs = await getBlockAttrs(card.blockId);
console.log(blockAttrs['custom-fsrs-priority']); // 应该是 undefined
```

---

### 场景 12: 性能测试（10 万卡片）

**测试步骤：**
1. 使用脚本生成 100,000 张测试卡片
2. 测试加载时间
3. 测试查询性能
4. 测试创建/删除/更新性能

**预期结果：**
- [ ] 加载 100,000 卡片 < 2 秒
- [ ] 查询到期卡片 < 100ms
- [ ] 创建卡片 < 50ms
- [ ] 删除卡片 < 50ms
- [ ] 更新卡片 < 50ms
- [ ] 内存使用合理（< 500MB）

**测试脚本：**
```javascript
// 生成测试数据
async function generateTestCards(count) {
  console.log(`开始生成 ${count} 张测试卡片...`);
  const startTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const xiuyuan = {
      id: `xy_test_${i}`,
      blockIDs: [`block_test_${i}`],
      templateID: 'builtin-quick-card',
      fields: [{ name: 'content', blockID: `block_test_${i}` }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const card = {
      id: `card_test_${i}`,
      xiuyuanID: xiuyuan.id,
      blockId: xiuyuan.blockIDs[0],
      type: 'item',
      templateID: 'builtin-quick-card',
      schedulerType: 'fsrs-v6',
      priority: 50,
      due: Date.now() + Math.random() * 86400000 * 30, // 随机 0-30 天
      stability: 1,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learning_step: 0,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      meta: {
        xiuyuanID: xiuyuan.id,
        templateID: 'builtin-quick-card',
        ruleIndex: 0,
        frontBlockIDs: [xiuyuan.blockIDs[0]],
        backBlockIDs: [],
        fieldMapping: {},
        frontFields: ['content'],
        backFields: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await storage.createCard(xiuyuan, card);
    
    if (i % 10000 === 0) {
      console.log(`已生成 ${i} 张卡片...`);
    }
  }
  
  const endTime = Date.now();
  console.log(`生成完成，耗时: ${(endTime - startTime) / 1000} 秒`);
}

// 测试加载性能
async function testLoadPerformance() {
  console.log('测试加载性能...');
  console.time('load');
  await storage.load();
  console.timeEnd('load'); // 应该 < 2000ms
}

// 测试查询性能
function testQueryPerformance() {
  console.log('测试查询性能...');
  
  console.time('getDueCards');
  const dueCards = storage.getDueCards(100);
  console.timeEnd('getDueCards'); // 应该 < 100ms
  
  console.time('getCardsByType');
  const itemCards = storage.getCardsByType('item');
  console.timeEnd('getCardsByType'); // 应该 < 100ms
  
  console.time('getCardsByBlockId');
  const cards = storage.getCardsByBlockId('block_test_50000');
  console.timeEnd('getCardsByBlockId'); // 应该 < 100ms
}

// 测试 CRUD 性能
async function testCRUDPerformance() {
  console.log('测试 CRUD 性能...');
  
  // 创建
  console.time('createCard');
  const xiuyuan = {
    id: 'xy_perf_test',
    blockIDs: ['block_perf_test'],
    templateID: 'builtin-quick-card',
    fields: [{ name: 'content', blockID: 'block_perf_test' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const card = {
    id: 'card_perf_test',
    xiuyuanID: xiuyuan.id,
    blockId: xiuyuan.blockIDs[0],
    type: 'item',
    templateID: 'builtin-quick-card',
    schedulerType: 'fsrs-v6',
    priority: 50,
    due: Date.now(),
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learning_step: 0,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    meta: {
      xiuyuanID: xiuyuan.id,
      templateID: 'builtin-quick-card',
      ruleIndex: 0,
      frontBlockIDs: [xiuyuan.blockIDs[0]],
      backBlockIDs: [],
      fieldMapping: {},
      frontFields: ['content'],
      backFields: [],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await storage.createCard(xiuyuan, card);
  console.timeEnd('createCard'); // 应该 < 50ms
  
  // 更新
  console.time('updateCard');
  card.priority = 80;
  await storage.updateCard(card);
  console.timeEnd('updateCard'); // 应该 < 50ms
  
  // 删除
  console.time('deleteCard');
  await storage.deleteCard(card.id);
  console.timeEnd('deleteCard'); // 应该 < 50ms
}

// 运行所有性能测试
async function runPerformanceTests() {
  // 1. 生成测试数据
  await generateTestCards(100000);
  
  // 2. 测试加载性能
  await testLoadPerformance();
  
  // 3. 测试查询性能
  testQueryPerformance();
  
  // 4. 测试 CRUD 性能
  await testCRUDPerformance();
  
  // 5. 显示统计信息
  const stats = storage.getStats();
  console.log('存储统计:', stats);
}

// 执行测试
runPerformanceTests();
```

---

## 数据一致性验证

### 验证 1: 所有卡片都有有效的 xiuyuanID

```javascript
function validateXiuyuanReferences() {
  const allCards = storage.getAllCards();
  const invalidCards = allCards.filter(card => {
    const xiuyuan = storage.getXiuYuan(card.xiuyuanID);
    return !xiuyuan;
  });
  
  console.log(`总卡片数: ${allCards.length}`);
  console.log(`无效引用: ${invalidCards.length}`);
  
  if (invalidCards.length > 0) {
    console.error('发现孤儿卡片:', invalidCards);
  } else {
    console.log('✓ 所有卡片都有有效的 xiuyuanID');
  }
}
```

### 验证 2: 没有空的 XiuYuan

```javascript
function validateEmptyXiuyuans() {
  const issues = await storage.validateConsistency();
  const emptyXiuyuans = issues.filter(issue => issue.includes('empty XiuYuan'));
  
  console.log(`一致性问题: ${issues.length}`);
  console.log(`空 XiuYuan: ${emptyXiuyuans.length}`);
  
  if (emptyXiuyuans.length > 0) {
    console.error('发现空 XiuYuan:', emptyXiuyuans);
  } else {
    console.log('✓ 没有空的 XiuYuan');
  }
}
```

### 验证 3: 索引一致性

```javascript
function validateIndexConsistency() {
  const allCards = storage.getAllCards();
  
  // 验证 blockID 索引
  for (const card of allCards) {
    const cardsFromIndex = storage.getCardsByBlockId(card.blockId);
    if (!cardsFromIndex.some(c => c.id === card.id)) {
      console.error(`卡片 ${card.id} 不在 blockID 索引中`);
    }
  }
  
  // 验证 xiuyuanID 索引
  for (const card of allCards) {
    const cardsFromIndex = storage.getCardsByXiuyuanId(card.xiuyuanID);
    if (!cardsFromIndex.some(c => c.id === card.id)) {
      console.error(`卡片 ${card.id} 不在 xiuyuanID 索引中`);
    }
  }
  
  // 验证 type 索引
  for (const card of allCards) {
    const cardsFromIndex = storage.getCardsByType(card.type);
    if (!cardsFromIndex.some(c => c.id === card.id)) {
      console.error(`卡片 ${card.id} 不在 type 索引中`);
    }
  }
  
  console.log('✓ 索引一致性验证完成');
}
```

---

## 测试检查清单

### 功能测试
- [ ] 场景 1: 创建概念卡（块菜单）
- [ ] 场景 2: 创建概念卡（自动检测）
- [ ] 场景 3: 创建符号检测卡（<>）
- [ ] 场景 4: 创建快速卡片
- [ ] 场景 5: 创建模板卡片
- [ ] 场景 6: 创建列表模版卡
- [ ] 场景 7: 删除卡片
- [ ] 场景 8: 删除双向卡片
- [ ] 场景 9: 复习卡片
- [ ] 场景 10: 浏览器查看卡片
- [ ] 场景 11: 优先级设置

### 性能测试
- [ ] 场景 12: 性能测试（10 万卡片）
  - [ ] 加载性能 < 2s
  - [ ] 查询性能 < 100ms
  - [ ] 创建性能 < 50ms
  - [ ] 删除性能 < 50ms
  - [ ] 更新性能 < 50ms

### 数据一致性
- [ ] 验证 1: 所有卡片都有有效的 xiuyuanID
- [ ] 验证 2: 没有空的 XiuYuan
- [ ] 验证 3: 索引一致性

### 回归测试
- [ ] Riff 同步功能正常
- [ ] 旧卡片数据迁移正常
- [ ] 插件启动和关闭正常
- [ ] 没有控制台错误

---

## 问题记录

如果在测试过程中发现问题，请记录以下信息：

### 问题模板

**问题编号:** #001

**场景:** 场景 X - XXX

**重现步骤:**
1. 
2. 
3. 

**预期结果:**


**实际结果:**


**错误信息:**
```
粘贴错误日志
```

**环境信息:**
- 思源笔记版本:
- 插件版本:
- 操作系统:
- 浏览器:

**严重程度:** [ ] 严重 [ ] 中等 [ ] 轻微

**附加信息:**


---

## 测试完成标准

所有测试场景通过，且满足以下条件：

- [ ] 所有功能测试通过（场景 1-11）
- [ ] 性能测试通过（场景 12）
- [ ] 数据一致性验证通过
- [ ] 没有严重或中等级别的未解决问题
- [ ] 用户体验流畅，没有明显卡顿
- [ ] 没有数据丢失或损坏

---

## 附录

### 常用调试命令

```javascript
// 获取存储实例
const storage = window.siyuanMemo.storage;

// 查看统计信息
console.log(storage.getStats());

// 查看所有卡片
console.log(storage.getAllCards());

// 查看所有 XiuYuan
console.log(Array.from(storage.xiuyuans.values()));

// 验证一致性
const issues = await storage.validateConsistency();
console.log('一致性问题:', issues);

// 自动修复
const fixedCount = await storage.autoFix();
console.log('修复了', fixedCount, '个问题');

// 强制保存
await storage.save();
console.log('数据已保存');

// 重新加载
await storage.load();
console.log('数据已重新加载');
```

### 测试数据清理

```javascript
// 删除所有测试卡片
async function cleanupTestData() {
  const allCards = storage.getAllCards();
  const testCards = allCards.filter(card => 
    card.id.includes('test') || card.xiuyuanID.includes('test')
  );
  
  console.log(`找到 ${testCards.length} 张测试卡片`);
  
  for (const card of testCards) {
    await storage.deleteCard(card.id);
  }
  
  console.log('测试数据清理完成');
}
```
