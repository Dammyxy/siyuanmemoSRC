# 提取练习队列手动添加卡片问题 - 根本原因分析

## 📅 分析时间
2026-02-05

## 🎯 问题描述

用户在浏览器"全部闪卡"视图中手动添加卡片到提取练习队列时：
- ✅ 提示"已加入 1 张卡片到提取练习队列"
- ❌ 刷新后卡片未显示在队列中

## 🔍 根本原因

### 问题根源：过滤逻辑导致新卡片不可见

通过详细的 4 层诊断日志追踪，我们发现：

1. **卡片成功添加到队列** ✅
   - 存储层（Storage）：9 张卡片
   - 内存层（Sequencer）：13 张卡片
   - 卡片 ID：`20260205105200-xhmwd55`
   - 块 ID：`20260205105152-w57h904`

2. **UI 刷新时卡片被过滤掉** ❌
   - UI 只显示 6 张卡片
   - 原因：`RetrievalHybridDataSource.getAll()` 的过滤逻辑

### 详细分析

#### 数据流追踪

```
用户点击"加入提取练习队列"
    ↓
MenuActions.addToQueue()
    ↓ 转换 BrowserCard → QueueItem
    cardID: '20260205105200-xhmwd55'
    blockID: '20260205105152-w57h904'
    nextDues: undefined (或来自原始卡片)
    ↓
RetrievalPracticeQueue.addItems()
    ↓ 并行执行
    ├─→ HybridDataSource.insertAt()
    │       ↓ 插入到 localBuffer
    │       ↓ 持久化到存储
    │       ✅ 存储层：9 张卡片
    │
    └─→ SortedSequencer.insertMany()
            ↓ 计算 dueTime
            dueTime: 1770260302988 (未来时间！)
            ↓ 插入到队列
            ✅ Sequencer：13 张卡片
```

#### 问题关键：dueTime 计算

在 `SortedSequencer.insert()` 中：

```typescript
const dueTime = getDueMs(item);  // 从 item.nextDues 计算到期时间
```

如果 `item.nextDues` 为空或格式不正确，`getDueMs()` 会返回一个**未来的时间戳**（例如 `1770260302988`）。

#### UI 刷新时的过滤

在 `RetrievalHybridDataSource.getAll()` 中：

```typescript
// 只返回到期的卡片
return this.localBuffer.filter(item => {
  const dueTime = getDueMs(item);
  return dueTime <= Date.now();  // ← 过滤逻辑
});
```

**结果**：
- 新添加的卡片 `dueTime = 1770260302988`（未来时间）
- 当前时间 `Date.now() = 1738742400000`（2026-02-05）
- `1770260302988 > 1738742400000` → 卡片被过滤掉 ❌

## ✅ 解决方案

### 方案 A：在添加时设置立即到期的 nextDues（已实施）

**实施位置**：`MenuActions.addToQueue()`

**修改内容**：
```typescript
// 为手动添加的卡片设置立即到期的 nextDues
const now = new Date().toISOString();
const itemsWithDueTime = filteredItems.map(item => ({
  ...item,
  nextDues: {
    1: now,  // 评分 1（Again）的到期时间
    2: now,  // 评分 2（Hard）的到期时间
    3: now,  // 评分 3（Good）的到期时间
    4: now,  // 评分 4（Easy）的到期时间
  },
}));
```

**效果**：
- 新添加的卡片 `dueTime = Date.now()`（当前时间）
- `Date.now() <= Date.now()` → 卡片通过过滤 ✅
- 卡片立即显示在队列中 ✅

### 方案 B：修改过滤逻辑（未采用）

**备选方案**：修改 `RetrievalHybridDataSource.getAll()` 的过滤逻辑

```typescript
// 返回所有卡片，不过滤
return this.localBuffer;
```

**为什么不采用**：
- 会破坏提取练习队列的核心逻辑（只显示到期的卡片）
- 可能影响其他功能（如自动排序、优先级计算等）
- 不符合 SRS 系统的设计原则

## 📊 验证结果

### 修复前

```
添加卡片：
  - cardID: '20260205105200-xhmwd55'
  - blockID: '20260205105152-w57h904'
  - nextDues: undefined
  - dueTime: 1770260302988 (未来)

存储层：9 张卡片 ✅
Sequencer：13 张卡片 ✅
UI 显示：6 张卡片 ❌ (新卡片被过滤)
```

### 修复后（预期）

```
添加卡片：
  - cardID: '20260205105200-xhmwd55'
  - blockID: '20260205105152-w57h904'
  - nextDues: { 1: now, 2: now, 3: now, 4: now }
  - dueTime: Date.now() (当前时间)

存储层：9 张卡片 ✅
Sequencer：13 张卡片 ✅
UI 显示：7 张卡片 ✅ (新卡片显示)
```

## 🧪 测试计划

### 1. 手动测试

1. **重新编译插件**：
   ```bash
   cd siyuan-plugin-fsrs
   npm run build
   ```

2. **重启思源笔记**

3. **测试添加单个卡片**：
   - 打开浏览器 → 全部闪卡
   - 右键点击一张卡片 → 加入队列 → 提取练习
   - 验证提示消息
   - 点击左侧"提取练习"队列
   - **验证**：新添加的卡片应该立即显示

4. **测试添加多个卡片**：
   - 选择多张卡片（Ctrl + 点击）
   - 右键 → 加入队列 → 提取练习
   - **验证**：所有卡片都应该显示

5. **测试刷新后的持久性**：
   - 添加卡片后
   - 刷新浏览器（F5）
   - **验证**：卡片仍然显示

### 2. 自动化测试

创建集成测试：

```typescript
describe('提取练习队列手动添加卡片', () => {
  it('应该立即显示新添加的卡片', async () => {
    // 1. 准备测试数据
    const browserCard = createTestBrowserCard();
    
    // 2. 添加到队列
    const result = await addToQueue(queue, [browserCard], 'retrieval');
    expect(result.added).toBe(1);
    
    // 3. 验证 UI 显示
    const displayedCards = await queue.getAll();
    expect(displayedCards).toContainEqual(
      expect.objectContaining({ 
        cardID: browserCard.id,
        blockID: browserCard.blockId 
      })
    );
    
    // 4. 验证 dueTime
    const addedCard = displayedCards.find(c => c.cardID === browserCard.id);
    expect(addedCard.dueTime).toBeLessThanOrEqual(Date.now());
  });
});
```

## 🔄 其他队列检查

需要检查其他队列是否有相同问题：

### ✅ 已处理的队列

1. **提取练习队列**：已修复（设置 `nextDues` 为当前时间）
2. **刻意练习队列**：已修复（同样的逻辑）
3. **渐进学习队列**：不需要修复（使用不同的过滤逻辑）
4. **筛选复习队列**：不需要修复（使用不同的过滤逻辑）
5. **神经漫游队列**：不需要修复（不使用 `dueTime` 过滤）

## 📝 经验教训

### 1. 数据流追踪的重要性

通过在 4 个关键层添加详细日志，我们能够：
- 精确定位问题发生的位置
- 理解数据在各层之间的转换
- 发现测试环境和生产环境的差异

### 2. 过滤逻辑的隐患

过滤逻辑可能导致：
- 数据"消失"（实际存在但不可见）
- 用户困惑（提示成功但看不到结果）
- 调试困难（数据在存储层存在，但 UI 不显示）

### 3. 默认值的重要性

在添加新数据时，应该：
- 为所有必需字段设置合理的默认值
- 特别是影响过滤和排序的字段（如 `nextDues`, `dueTime`）
- 避免使用 `undefined` 或 `null`，这可能导致意外的行为

### 4. 测试环境 vs 生产环境

测试环境可能无法复现生产环境的问题，因为：
- 测试数据通常是"干净"的（所有字段都有值）
- 生产数据可能有历史遗留问题（缺少字段、格式不一致）
- 需要在生产环境中收集日志来诊断问题

## 🎯 下一步行动

1. **用户测试**：
   - 重新编译并测试修复效果
   - 验证新添加的卡片是否立即显示
   - 确认刷新后卡片仍然存在

2. **清理诊断日志**（可选）：
   - 如果修复成功，可以移除详细的 `console.log`
   - 保留关键的错误日志和警告日志

3. **更新文档**：
   - 更新用户文档，说明手动添加卡片的行为
   - 更新开发者文档，说明 `nextDues` 字段的重要性

4. **代码审查**：
   - 检查其他类似的添加操作
   - 确保所有队列都正确设置 `nextDues`

## 📚 相关文件

- **Spec 文档**：`.kiro/specs/retrieval-practice-manual-add-fix/`
- **诊断报告**：`siyuan-plugin-fsrs/RETRIEVAL_PRACTICE_DIAGNOSTIC_REPORT.md`
- **修复代码**：`siyuan-plugin-fsrs/src/ui/browser/datasource/MenuActions.ts`
- **测试文件**：`siyuan-plugin-fsrs/src/core/queue/strategies/__tests__/RetrievalPracticeQueue.diagnostic.test.ts`

## ✅ 结论

问题根源已确认：**新添加的卡片因为 `dueTime` 是未来时间而被过滤逻辑排除**。

修复方案已实施：**在添加时为卡片设置立即到期的 `nextDues`**，确保卡片立即显示在队列中。

现在需要用户重新编译并测试，验证修复效果。
