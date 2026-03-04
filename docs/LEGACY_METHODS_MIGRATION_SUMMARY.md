# 旧架构方法迁移总结

## 修复日期
2026-02-06

## 问题描述
代码库中大量使用了旧架构的队列方法（`addItems()`, `getAllItems()` 等），导致与新架构（`UnifiedDataSourceManager`）不兼容。

## 修复策略
采用**兼容层**策略，在关键位置添加新旧架构兼容代码，而不是完全重写所有代码。

## 已修复的文件

### 1. `src/ui/browser/datasource/MenuActions.ts`
**修复内容**：
- `addToQueue()` 函数中的刻意练习队列添加逻辑
- 优先使用新架构的 `addCard()` 方法
- Fallback 到旧架构的 `addItems()` 方法

**代码变更**：
```typescript
// 新架构：使用 addCard 方法（逐个添加）
if (queue?.addCard) {
    for (const item of filteredItems) {
        await queue.addCard(item.blockID, 'manual');
    }
}
// 旧架构：fallback
else if (queue?.addItems) {
    const added = await queue.addItems(filteredItems);
}
```

### 2. `src/ui/menu/BlockMenu.ts`
**修复内容**：
- 块菜单"加入练习队列"功能
- 优先使用新架构的 `addCard()` 方法
- Fallback 到旧架构的 `addItems()` 方法

### 3. `src/services/QueueHelpers.ts`
**修复内容**：
- `addPracticeQueue()` - 添加卡片到练习队列
- `startPracticeQueue()` - 开始练习队列（检查队列是否为空）
- 更新接口定义，支持新旧架构方法

**接口变更**：
```typescript
export interface QueueHelpersConfig {
  blockMenuHandler: BlockMenuHandler;
  retrievalQueue: { 
    addCard?: (blockId: string, source: 'manual' | 'auto-failed') => Promise<void>;  // 新架构
    addItems?: (items: QueueItem[]) => number;  // 旧架构
    getAllCards?: () => Promise<any[]>;  // 新架构
    getAllItems?: () => any[];  // 旧架构
    getSize?: () => Promise<number>;  // 新架构
  };
}
```

### 4. `src/index.ts`
**修复内容**：
- `addPracticeQueue()` - 添加卡片到练习队列
- `startPracticeQueue()` - 开始练习队列
- 优先使用新架构方法，Fallback 到旧架构

### 5. `src/queues/FinalDrillQueue.ts`
**修复内容**：
- 添加兼容方法 `getAllItems()`
- 返回当前缓存的卡片数组
- 标记为 `@deprecated`，建议使用 `getAllCards()` 代替

**新增方法**：
```typescript
/**
 * ✅ 兼容方法：获取所有队列项（同步）
 * @deprecated 使用 getAllCards() 代替
 */
public getAllItems(): any[] {
    console.warn('[FinalDrillQueue] getAllItems() is deprecated, use getAllCards() instead');
    return this.cards;
}
```

### 6. `src/ui/browser/SRSBrowser.vue`
**修复内容**：
- 队列数量显示：使用 `await getSize()` 代替 `size?.()`
- 文档聚焦：填充 `rootId` 字段（从 `loadCards` 获取）

## 新旧架构方法对照表

| 功能 | 旧架构方法 | 新架构方法 | 说明 |
|------|-----------|-----------|------|
| 添加卡片 | `addItems(items: QueueItem[])` | `addCard(blockId: string, source)` | 新架构逐个添加 |
| 获取所有卡片 | `getAllItems()` (同步) | `getAllCards()` (异步) | 新架构返回 Promise |
| 获取队列大小 | `size()` (同步) | `getSize()` (异步) | 新架构返回 Promise |
| 移除卡片 | `discard(item)` | `removeCard(cardId)` | 方法名不同 |
| 刷新队列 | `refresh()` | `refresh()` | 方法名相同 |

## 未修复的文件

### 测试文件（暂不修复）
- `src/__tests__/*.test.ts` - 测试文件可以继续使用旧架构方法
- `src/core/queue/__tests__/*.test.ts` - 队列测试文件
- `src/core/queue/strategies/__tests__/*.test.ts` - 策略测试文件

### 其他文件（低优先级）
- `src/ui/review/v2/providers/FinalDrillProvider.ts` - 使用 `getAllItems()`，但已通过 `FinalDrillQueue.getAllItems()` 兼容方法解决
- `src/ui/review/v2/adapters/FinalDrillAdapter.ts` - 同上
- `src/ui/review/v2/sessions/FinalDrillV2Session.ts` - 同上

## 兼容性保证

1. **向后兼容**：所有修复都保留了对旧架构的支持
2. **优雅降级**：优先使用新架构方法，如果不存在则 fallback 到旧架构
3. **渐进迁移**：可以逐步将旧架构代码迁移到新架构，不会破坏现有功能

## 测试建议

1. **块菜单测试**：
   - 右键点击块 → "加入练习队列"
   - 验证卡片是否成功添加

2. **浏览器测试**：
   - 点击队列 → 验证队列数量显示
   - 点击队列 → 验证文档区聚焦
   - 右键菜单 → "加入刻意练习队列"

3. **复习界面测试**：
   - 开始刻意练习 → 验证队列卡片显示
   - 评分后 → 验证队列更新

## 后续工作

1. **完全迁移**：逐步将所有旧架构方法调用替换为新架构方法
2. **移除兼容层**：当所有代码迁移完成后，移除 `getAllItems()` 等兼容方法
3. **更新文档**：更新 API 文档，标记旧方法为 deprecated

## 相关文档

- [统一数据源架构设计](.kiro/specs/unified-data-source-architecture/design.md)
- [统一数据源 UI 集成](.kiro/specs/unified-data-source-ui-integration/design.md)
- [队列架构迁移计划](.kiro/specs/queue-architecture-migration/design.md)
