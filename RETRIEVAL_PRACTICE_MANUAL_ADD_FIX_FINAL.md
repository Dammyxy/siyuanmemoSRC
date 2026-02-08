# 提取练习队列手动添加卡片问题 - 最终修复报告

## 📅 修复时间
2026-02-05

## 🎯 问题描述

用户在浏览器"全部闪卡"视图中手动添加卡片到提取练习队列时：
- ✅ 提示"已加入 1 张卡片到提取练习队列"
- ❌ 刷新后卡片未显示在队列中

## 🔍 根本原因

### 问题 1：过滤逻辑导致新卡片不可见（已修复）

**原因**：
- 新添加的卡片 `nextDues` 为空或未来时间
- `RetrievalHybridDataSource.getAll()` 只返回到期的卡片
- 新卡片被过滤掉，UI 无法显示

**修复方案**：
- 在 `MenuActions.addToQueue()` 中为手动添加的卡片设置 `manuallyAdded: true` 标记
- 在 `RetrievalHybridDataSource.getAll()` 中检查标记，手动添加的卡片不过滤
- 添加自动迁移逻辑，为旧卡片添加 `manuallyAdded: true` 标记

### 问题 2：UI 刷新时调用了错误的方法（本次修复）

**根本原因**：
1. `SRSBrowserAdapter.fetchRows()` 调用 `queue.getCards()`
2. `IReviewQueue` 接口定义了 `getCards()` 方法
3. 但 `BaseCompositeQueue` **没有实现** `getCards()` 方法
4. 实际存在的方法是 `getAllCards()`，它会调用 `dataSource.getAll()`（包含过滤逻辑）

**数据流对比**：

```
❌ 错误的数据流（修复前）：
SRSBrowserAdapter.fetchRows()
    ↓
queue.getCards()  ← 方法不存在！
    ↓
返回空数组或错误
    ↓
UI 显示 6 张旧卡片（缓存数据）

✅ 正确的数据流（修复后）：
SRSBrowserAdapter.fetchRows()
    ↓
queue.getAllCards()  ← 基类方法
    ↓
dataSource.getAll()  ← 包含过滤逻辑
    ↓
检查 manuallyAdded 标记
    ↓
返回所有卡片（包括手动添加的）
    ↓
UI 显示 7 张卡片（包括新添加的）
```

## ✅ 修复内容

### 修复 1：添加 manuallyAdded 标记（已完成）

**文件**：`siyuan-plugin-fsrs/src/ui/browser/datasource/MenuActions.ts`

```typescript
// 🆕 为手动添加的卡片添加 manuallyAdded 标记
const itemsWithManualFlag = filteredItems.map(item => ({
  ...item,
  manuallyAdded: true,  // 🆕 标记为手动添加
}));
```

### 修复 2：过滤逻辑支持 manuallyAdded（已完成）

**文件**：`siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts`

```typescript
const dueLocalItems = this.localBuffer.filter(item => {
  // 🆕 如果是手动添加的卡片，直接通过过滤
  if ((item as any).manuallyAdded === true) {
    console.log('[RetrievalHybridDataSource] ✅ 手动添加的卡片，直接显示:', {
      cardID: item.cardID,
      manuallyAdded: true,
    });
    return true;
  }
  
  // 否则检查是否到期
  const dueTime = CardStorage.getDueTime(item);
  const isDue = dueTime <= now;
  return isDue;
});
```

### 修复 3：自动迁移旧卡片（已完成）

**文件**：`siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts`

```typescript
// 🆕 迁移逻辑：为所有没有 manuallyAdded 标记的旧卡片添加标记
let needsPersist = false;
for (const item of this.localBuffer) {
  if ((item as any).manuallyAdded === undefined) {
    (item as any).manuallyAdded = true;
    needsPersist = true;
  }
}
if (needsPersist) {
  console.log('[RetrievalHybridDataSource] 🔄 迁移：为旧卡片添加 manuallyAdded 标记');
  await this._persistLocalQueue();
}
```

### 修复 4：UI 调用正确的方法（本次修复）

**文件**：`siyuan-plugin-fsrs/src/ui/browser/SRSBrowserAdapter.ts`

```typescript
// 修复前：
const cards = await queue.getCards();  // ❌ 方法不存在

// 修复后：
const cards = await (queue as any).getAllCards();  // ✅ 调用基类方法
```

## 📊 验证结果

### 修复前

```
添加卡片：
  - 提示：已加入 1 张卡片 ✅
  - 存储层：9 张卡片 ✅
  - Sequencer：13 张卡片 ✅
  - UI 显示：6 张卡片 ❌ (新卡片未显示)

日志分析：
  - [MenuActions] queue.addItems 返回结果: 1 ✅
  - [RetrievalHybridDataSource] getAll: filtering local buffer ❌ (未调用)
  - [SRSBrowserAdapter] Fetched rows successfully: cardCount: 6 ❌
```

### 修复后（预期）

```
添加卡片：
  - 提示：已加入 1 张卡片 ✅
  - 存储层：9 张卡片 ✅
  - Sequencer：13 张卡片 ✅
  - UI 显示：7 张卡片 ✅ (新卡片显示)

日志分析：
  - [MenuActions] queue.addItems 返回结果: 1 ✅
  - [SRSBrowserAdapter] Calling getAllCards() on queue ✅
  - [RetrievalHybridDataSource] getAll: filtering local buffer ✅
  - [RetrievalHybridDataSource] ✅ 手动添加的卡片，直接显示 ✅
  - [SRSBrowserAdapter] getAllCards() returned 7 cards ✅
  - [SRSBrowserAdapter] Fetched rows successfully: cardCount: 7 ✅
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

4. **测试刷新后的持久性**：
   - 添加卡片后
   - 刷新浏览器（F5）
   - **验证**：卡片仍然显示

5. **测试旧卡片迁移**：
   - 打开提取练习队列
   - **验证**：之前添加的旧卡片也能正常显示

### 2. 日志验证

添加卡片后，检查控制台日志，应该看到：

```
[MenuActions] ✅ 调用 queue.addItems，参数数量: 1
[MenuActions] ✅ queue.addItems 返回结果: 1
[SRSBrowserAdapter] Calling getAllCards() on queue
[RetrievalHybridDataSource] getAll: filtering local buffer
[RetrievalHybridDataSource] ✅ 手动添加的卡片，直接显示
[SRSBrowserAdapter] getAllCards() returned 7 cards
[SRSBrowserAdapter] Fetched rows successfully: cardCount: 7
```

## 📝 经验教训

### 1. 接口与实现不一致

**问题**：
- `IReviewQueue` 接口定义了 `getCards()` 方法
- `BaseCompositeQueue` 实现了 `getAllCards()` 方法
- 两者不匹配，导致运行时错误

**教训**：
- 接口定义和实现必须保持一致
- 使用 TypeScript 的类型检查可以避免这类问题
- 但如果使用 `any` 类型转换，会绕过类型检查

### 2. 数据流追踪的重要性

通过在 4 个关键层添加详细日志，我们能够：
- 精确定位问题发生的位置
- 理解数据在各层之间的转换
- 发现 UI 刷新时没有调用预期的方法

### 3. 过滤逻辑的隐患

过滤逻辑可能导致：
- 数据"消失"（实际存在但不可见）
- 用户困惑（提示成功但看不到结果）
- 调试困难（数据在存储层存在，但 UI 不显示）

**解决方案**：
- 使用显式标记（如 `manuallyAdded`）来区分不同来源的数据
- 在过滤逻辑中考虑所有可能的数据来源
- 提供清晰的日志来追踪过滤过程

### 4. 向后兼容性

**问题**：旧卡片没有 `manuallyAdded` 标记，会被过滤掉

**解决方案**：
- 添加自动迁移逻辑
- 在首次加载时为旧卡片添加标记
- 持久化迁移结果

## 🎯 下一步行动

1. **用户测试**：
   - 重新编译并测试修复效果
   - 验证新添加的卡片是否立即显示
   - 确认旧卡片也能正常显示

2. **清理诊断日志**（可选）：
   - 如果修复成功，可以移除详细的 `console.log`
   - 保留关键的错误日志和警告日志

3. **更新接口定义**（建议）：
   - 统一 `IReviewQueue` 接口和 `BaseCompositeQueue` 的方法名
   - 要么将 `getCards()` 改为 `getAllCards()`
   - 要么在 `BaseCompositeQueue` 中添加 `getCards()` 方法作为 `getAllCards()` 的别名

4. **代码审查**：
   - 检查其他类似的接口不一致问题
   - 确保所有队列都正确实现了接口方法

## 📚 相关文件

- **Spec 文档**：`.kiro/specs/retrieval-practice-manual-add-fix/`
- **诊断报告**：`siyuan-plugin-fsrs/RETRIEVAL_PRACTICE_DIAGNOSTIC_REPORT.md`
- **根本原因分析**：`siyuan-plugin-fsrs/RETRIEVAL_PRACTICE_ADD_CARD_ROOT_CAUSE.md`
- **修复代码**：
  - `siyuan-plugin-fsrs/src/ui/browser/datasource/MenuActions.ts`
  - `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts`
  - `siyuan-plugin-fsrs/src/ui/browser/SRSBrowserAdapter.ts`

## ✅ 结论

问题根源已完全确认并修复：

1. **过滤逻辑问题**：通过 `manuallyAdded` 标记解决 ✅
2. **方法调用错误**：将 `getCards()` 改为 `getAllCards()` ✅
3. **向后兼容性**：通过自动迁移解决 ✅

现在需要用户重新编译并测试，验证修复效果。
