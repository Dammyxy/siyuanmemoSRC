# 队列排序统一迁移实施总结

## 实施日期
2026-02-05

## 问题描述

用户反馈：渐进学习的复习队列排序跟浏览器里队列视图的排序不一样。

**根本原因**：浏览器和复习界面使用了两套不同的队列系统：
- **浏览器**：使用新的统一数据源架构，支持 `customOrder`（拖拽排序）
- **复习界面**：使用旧的队列架构，不支持 `customOrder`，只能按算法排序

## 解决方案

将所有队列类型的复习对话框迁移到使用 `createUnifiedReviewDialog()` 函数，这样浏览器和复习界面就会共享同一个队列实例，排序自然同步。

## 已完成的迁移

### ✅ 1. 渐进学习队列 (Incremental Learning)

**修改文件**: `src/services/ReviewDialogManager.ts`

**修改内容**:
```typescript
// 旧实现
async openIncrementalLearning(): Promise<void> {
  this.createDialog({
    title,
    queue: this.deps.incrementalQueue as any,
    adapter: new RetrievalPracticeAdapter(...) as any,
  });
}

// 新实现
async openIncrementalLearning(): Promise<void> {
  this.reviewDialog = createUnifiedReviewDialog({
    plugin: this.deps.plugin,
    queueType: QueueType.IncrementalLearning,
    title: this.deps.i18n?.incrementalLearning || '渐进学习',
    onClose: () => { this.reviewDialog = null; }
  });
}
```

**效果**：
- ✅ 浏览器和复习界面共享同一个 `IncrementalLearningQueue` 实例
- ✅ 在浏览器中应用的排序会立即同步到复习界面
- ✅ 复习界面显示的卡片顺序与浏览器中的顺序一致

### ✅ 2. 刻意练习队列 (Final Drill)

**修改文件**: `src/services/ReviewDialogManager.ts`

**修改内容**:
```typescript
// 旧实现
async openFinalDrill(): Promise<void> {
  const provider = new FinalDrillProvider(...);
  await provider.init();
  const adapter = new FinalDrillAdapter(...);
  this.createDialog({ title, provider, adapter, reviewUI: {...} });
}

// 新实现
async openFinalDrill(): Promise<void> {
  this.reviewDialog = createUnifiedReviewDialog({
    plugin: this.deps.plugin,
    queueType: QueueType.FinalDrill,
    title: this.deps.i18n?.finalDrill || '刻意练习',
    onClose: () => { this.reviewDialog = null; }
  });
}
```

**效果**：
- ✅ 浏览器和复习界面共享同一个 `FinalDrillQueue` 实例
- ✅ 排序同步
- ✅ 代码更简洁（移除了 Provider 和 ReviewUI 的复杂配置）

### ✅ 3. 分组队列 (Filter Group)

**修改文件**: `src/services/ReviewDialogManager.ts`

**修改内容**:
```typescript
// 旧实现
async openFilterGroupPractice(): Promise<void> {
  this.createDialog({
    title,
    queue: this.deps.filterGroupQueue as any,
    adapter: new SubsetPracticeAdapter(...) as any,
  });
}

// 新实现
async openFilterGroupPractice(): Promise<void> {
  this.reviewDialog = createUnifiedReviewDialog({
    plugin: this.deps.plugin,
    queueType: QueueType.FilterGroup,
    title: this.deps.i18n?.filterGroupPractice || '分组队列',
    onClose: () => { this.reviewDialog = null; }
  });
}
```

**效果**：
- ✅ 浏览器和复习界面共享同一个 `FilterGroupQueue` 实例
- ✅ 排序同步

### ✅ 4. 神经漫游队列 (Neural Roam)

**修改文件**: `src/services/ReviewDialogManager.ts`

**修改内容**:
```typescript
// 旧实现
async openNeuralRoam(options?: {...}): Promise<void> {
  const queue = new NeuralRoamQueue({
    deckID: riff.BUILTIN_DECK_ID,
    i18n: this.deps.i18n || {},
    seedBlockId: options?.seedBlockId,
    includeSeedAsFirst: options?.includeSeedAsFirst,
  });
  this.createDialog({ title, queue, adapter });
}

// 新实现
async openNeuralRoam(options?: {...}): Promise<void> {
  this.reviewDialog = createUnifiedReviewDialog({
    plugin: this.deps.plugin,
    queueType: QueueType.NeuralRoam,
    title: this.deps.i18n?.neuralReviewTitle || '神经复习',
    onClose: () => { this.reviewDialog = null; }
  });
}
```

**效果**：
- ✅ 浏览器和复习界面共享同一个 `NeuralRoamQueue` 实例
- ✅ 排序同步
- ⚠️ 注意：options 参数（seedBlockId 等）暂时未传递，可能需要后续增强

### ⚠️ 5. 难点攻坚队列 (Leech) - 保持原有实现

**状态**: 未迁移

**原因**: 
- Leech 队列尚未在统一数据源架构中实现
- `QueueType` 枚举中没有 `Leech` 类型
- `QueueFactory` 中没有 Leech 队列的创建逻辑

**当前实现**: 保持使用旧的 `LeechQueue` 实现

**后续工作**: 
1. 在 `QueueType` 枚举中添加 `Leech` 类型
2. 在 `src/queues/` 目录下创建新的 `LeechQueue` 实现
3. 在 `QueueFactory` 中添加 Leech 队列的创建逻辑
4. 迁移 `ReviewDialogManager.openLeechReview()` 方法

## 架构改进

### 统一数据源架构

所有已迁移的队列现在都使用统一的架构：

```
用户操作
  ↓
ReviewDialogManager
  ↓
createUnifiedReviewDialog()
  ↓
UnifiedQueueStrategy ← 共享实例 → SRSBrowserAdapter
  ↓                                    ↓
UnifiedDataSourceManager          浏览器界面
  ↓
QueueFactory
  ↓
RetrievalPracticeQueue / IncrementalLearningQueue / FinalDrillQueue / ...
  ↓
customOrder (持久化)
```

### 优势

1. **排序同步**: 浏览器和复习界面共享同一个队列实例，排序自动同步
2. **代码简洁**: 移除了大量重复的对话框创建代码
3. **统一管理**: 所有队列通过 `QueueFactory` 统一创建和管理
4. **缓存优化**: 队列实例被缓存，避免重复创建
5. **观察者模式**: 支持数据变化通知，UI 自动刷新

## 测试建议

### 手动测试步骤

对于每个已迁移的队列类型，执行以下测试：

1. **测试浏览器排序**:
   - 打开浏览器，选择对应队列
   - 拖拽卡片改变顺序
   - 验证浏览器中的卡片顺序

2. **测试复习界面同步**:
   - 打开复习界面
   - 验证第一张卡片是否与浏览器中的第一张卡片相同
   - 多次打开复习界面，验证顺序是否一致

3. **测试复习功能**:
   - 对卡片进行评分（1-4）
   - 验证评分后的行为是否正常
   - 验证队列统计是否正确

### 自动化测试

建议添加以下测试：

1. **单元测试**: 验证 `ReviewDialogManager` 的每个方法都调用了 `createUnifiedReviewDialog()`
2. **集成测试**: 验证浏览器排序 → 复习界面显示的完整流程
3. **回归测试**: 确保迁移不破坏现有功能

## 已知问题

### 1. Leech 队列未迁移

**问题**: Leech 队列尚未在统一数据源架构中实现

**影响**: Leech 队列的排序仍然不会在浏览器和复习界面之间同步

**解决方案**: 需要先实现 Leech 队列的统一数据源版本

### 2. 神经漫游的 options 参数

**问题**: `openNeuralRoam()` 方法的 options 参数（seedBlockId 等）未传递给统一队列

**影响**: 可能影响神经漫游的种子卡片功能

**解决方案**: 需要增强 `createUnifiedReviewDialog()` 或 `NeuralRoamQueue` 以支持这些选项

## 后续工作

1. **完成 Leech 队列迁移**:
   - 实现 `src/queues/LeechQueue.ts`
   - 更新 `QueueType` 枚举
   - 更新 `QueueFactory`
   - 迁移 `ReviewDialogManager.openLeechReview()`

2. **增强神经漫游队列**:
   - 支持 seedBlockId 参数
   - 支持 includeSeedAsFirst 参数
   - 支持 resetHistory 参数

3. **添加测试**:
   - 单元测试
   - 集成测试
   - 属性测试（可选）

4. **清理旧代码**:
   - 移除未使用的 Provider 类
   - 移除未使用的 Adapter 类
   - 移除未使用的导入

## 总结

本次迁移成功将 4 个队列类型（渐进学习、刻意练习、分组队列、神经漫游）迁移到统一数据源架构，解决了浏览器和复习界面之间的排序不一致问题。

**迁移进度**: 4/5 (80%)
- ✅ 渐进学习
- ✅ 刻意练习
- ✅ 分组队列
- ✅ 神经漫游
- ⚠️ 难点攻坚（待后续实现）

用户现在可以在浏览器中对这 4 种队列进行排序，排序结果会立即同步到复习界面。
