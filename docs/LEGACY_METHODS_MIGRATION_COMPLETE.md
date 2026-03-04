# 旧架构方法迁移完成总结

## 修复日期
2026-02-06

## 问题描述
代码库中大量使用了旧架构的队列方法（`addItems()`, `getAllItems()` 等），导致与新架构（`UnifiedDataSourceManager`）不兼容。

## 修复策略
采用**兼容层**策略，在关键位置添加新旧架构兼容代码，确保向后兼容。

## 已修复的文件

### 1. `src/ui/browser/datasource/MenuActions.ts` ✅
**修复内容**：
- **刻意练习队列**：优先使用 `addCard()`，fallback 到 `addItems()`
- **神经漫游队列**：优先使用 `addCard()`，fallback 到 `addItems()`
- **渐进学习队列**：优先使用 `addCard()`，fallback 到 `addItems()`
- **筛选复习队列**：优先使用 `addCard()`，fallback 到 `addItems()`
- **提取练习队列**：优先使用 `addCard()`，fallback 到 `addItems()`

### 2. `src/ui/menu/BlockMenu.ts` ✅
**修复内容**：
- 块菜单"加入练习队列"功能
- 块菜单"加入分组队列"功能（FilterGroupQueue）
- 优先使用 `addCard()`，fallback 到 `addItem()`

### 3. `src/services/QueueHelpers.ts` ✅
**修复内容**：
- `addPracticeQueue()` - 优先使用 `addCard()`
- `startPracticeQueue()` - 优先使用 `getAllCards()` 和 `getSize()`

### 4. `src/index.ts` ✅
**修复内容**：
- `addPracticeQueue()` - 优先使用 `addCard()`
- `startPracticeQueue()` - 优先使用 `getAllCards()` 和 `getSize()`

### 5. 所有队列类添加兼容方法 ✅
- `src/queues/FinalDrillQueue.ts`
- `src/queues/FilterGroupQueue.ts`
- `src/queues/IncrementalLearningQueue.ts`
- `src/queues/NeuralRoamQueue.ts`
- `src/queues/RetrievalPracticeQueue.ts`

**新增方法**：
```typescript
/**
 * ✅ 兼容方法：获取所有队列项（同步）
 * @deprecated 使用 getAllCards() 代替
 */
public getAllItems(): any[] {
    console.warn('[QueueName] getAllItems() is deprecated, use getAllCards() instead');
    return this.cards;
}
```

### 6. `src/ui/browser/SRSBrowser.vue` ✅
**修复内容**：
- 队列数量显示：使用 `await getSize()`
- 文档聚焦：填充 `rootId` 字段

## 新旧架构方法对照表

| 功能 | 旧架构方法 | 新架构方法 | 兼容策略 |
|------|-----------|-----------|---------|
| 添加卡片 | `addItems(items)` | `addCard(blockId, source)` | 优先新架构，fallback 旧架构 |
| 获取所有卡片 | `getAllItems()` (同步) | `getAllCards()` (异步) | 队列类提供兼容方法 |
| 获取队列大小 | `size()` (同步) | `getSize()` (异步) | 使用 `await getSize()` |
| 移除卡片 | `discard(item)` | `removeCard(cardId)` | 使用新方法 |

## 兼容方法说明

所有新架构队列类都添加了 `getAllItems()` 兼容方法：
- 返回当前缓存的卡片数组（`this.cards`）
- 打印警告信息，提示使用新方法
- 标记为 `@deprecated`
- 允许旧代码继续工作

## 已通过兼容方法解决的文件

以下文件使用 `getAllItems()`，通过队列类的兼容方法已解决：
- `src/ui/review/v2/providers/FinalDrillProvider.ts`
- `src/ui/review/v2/adapters/FinalDrillAdapter.ts`
- `src/ui/review/v2/sessions/FinalDrillV2Session.ts`
- `src/services/QueueHelpers.ts`
- `src/ui/browser/SRSBrowser.vue`
- `src/ui/browser/composables/useContextMenu.ts`

## 编译状态

✅ **编译成功** - 所有修改已通过编译验证

## 测试建议

1. **块菜单测试**：
   - 右键点击块 → "加入练习队列"
   - 验证卡片是否成功添加

2. **浏览器测试**：
   - 点击队列 → 验证队列数量显示
   - 点击队列 → 验证文档区聚焦
   - 右键菜单 → 测试所有队列的添加功能

3. **复习界面测试**：
   - 开始各类复习 → 验证队列卡片显示
   - 评分后 → 验证队列更新

## 兼容性保证

1. ✅ **向后兼容**：所有修复都保留了对旧架构的支持
2. ✅ **优雅降级**：优先使用新架构方法，不存在则 fallback
3. ✅ **渐进迁移**：可以逐步迁移，不会破坏现有功能
4. ✅ **兼容方法**：所有队列类都提供 `getAllItems()` 兼容方法

## 后续工作

1. **性能优化**：考虑将 `addCard()` 的逐个添加改为批量添加
2. **完全迁移**：逐步将所有旧架构方法调用替换为新架构方法
3. **移除兼容层**：当所有代码迁移完成后，移除兼容方法
4. **更新文档**：更新 API 文档，标记旧方法为 deprecated

## 相关文档

- [统一数据源架构设计](.kiro/specs/unified-data-source-architecture/design.md)
- [统一数据源 UI 集成](.kiro/specs/unified-data-source-ui-integration/design.md)
- [队列架构迁移计划](.kiro/specs/queue-architecture-migration/design.md)
