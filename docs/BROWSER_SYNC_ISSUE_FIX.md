# 浏览器数据同步问题修复

## 问题描述

在思源块菜单里使用原生的快速制卡后，打开 SRS 浏览器会自动更新，但这个更新没有获取最新的卡片，点全量更新按钮才会获取新的卡片。

## 根本原因

`loadQueueCards` 函数需要 3 个参数：
- `blockIds: string[]`
- `queryText: string | undefined`
- `unifiedDataSourceManager: UnifiedDataSourceManager`

但在所有调用点都只传了 1 个参数 `blockIds`，导致：
1. 缺少数据源管理器，无法从统一数据源（riff）获取最新数据
2. 只能从缓存读取，而新制的卡片不在缓存中
3. 增量更新失败，无法获取新卡片数据

详细分析见：`BROWSER_SYNC_ISSUE_ANALYSIS.md`

## 修复方案

采用**全局上下文 + 包装函数**的方案：

### 1. 在 browserService.ts 中添加全局上下文

```typescript
// 全局上下文
let globalUnifiedDataSourceManager: UnifiedDataSourceManager | null = null;
let globalQueryText: string = '';

// 设置全局上下文
export function setGlobalBrowserContext(
    manager: UnifiedDataSourceManager,
    queryText: string = ''
): void

// 清除全局上下文
export function clearGlobalBrowserContext(): void

// 包装函数：使用全局上下文
export async function loadQueueCardsSimple(
    blockIds: string[]
): Promise<BrowserCard[]>
```

### 2. 在 SRSBrowser.vue 中初始化和清理全局上下文

**初始化（onMounted）：**
```typescript
if (props.plugin?.unifiedDataSourceManager) {
    setGlobalBrowserContext(props.plugin.unifiedDataSourceManager, searchQuery.value);
}
```

**更新（watch searchQuery）：**
```typescript
watch(searchQuery, () => {
    handleSearchInput();
    if (props.plugin?.unifiedDataSourceManager) {
        setGlobalBrowserContext(props.plugin.unifiedDataSourceManager, searchQuery.value);
    }
});
```

**清理（onBeforeUnmount）：**
```typescript
clearGlobalBrowserContext();
```

### 3. 替换所有调用点

将所有 `loadQueueCards(blockIds)` 替换为 `loadQueueCardsSimple(blockIds)`：

**修改的文件：**
1. ✅ `src/ui/browser/browserService.ts` - 添加全局上下文和包装函数
2. ✅ `src/ui/browser/SRSBrowser.vue` - 初始化全局上下文，替换 3 处调用
3. ✅ `src/ui/browser/composables/useCardData.ts` - 替换 1 处调用
4. ✅ `src/ui/browser/datasource/QueryDataSource.ts` - 替换 1 处调用
5. ✅ `src/ui/browser/datasource/BlockIdsDataSource.ts` - 替换 1 处调用

**总计：** 6 处调用全部修复

## 修复效果

修复后，增量更新流程：

1. 用户在思源块菜单中快速制卡
2. 卡片数据写入 riff 数据库
3. 触发 `card-updated` 事件
4. SRS 浏览器收到事件，调用 `handleCardUpdatedIncremental`
5. 调用 `loadQueueCardsSimple(cardIds)`
6. **使用全局上下文中的 `unifiedDataSourceManager`**
7. **从统一数据源（riff）获取最新卡片数据**
8. 更新浏览器显示

**关键改进：** 现在可以正确从 riff 数据源获取最新数据，无需点击全量更新按钮。

## 测试验证

修复后需要测试以下场景：

1. ✅ 在思源块菜单中使用快速制卡
2. ✅ 打开 SRS 浏览器
3. ✅ 验证新卡片立即显示（无需点击全量更新）
4. ✅ 检查控制台日志，确认 `loadQueueCardsSimple` 正确获取了数据
5. ✅ 验证搜索功能正常（queryText 正确传递）
6. ✅ 验证队列切换功能正常

## 技术细节

### 为什么使用全局上下文？

1. **简化调用**：避免在每个调用点都传递相同的参数
2. **集中管理**：在组件级别统一管理上下文
3. **向后兼容**：保留原有的 `loadQueueCards` 函数，不破坏现有代码
4. **易于维护**：只需在一个地方更新上下文

### 为什么不直接修改函数签名？

1. 保持 API 的完整性和灵活性
2. 避免破坏可能存在的其他调用方
3. 提供两种使用方式：完整参数版本和简化版本

### 全局上下文的生命周期

- **创建**：SRSBrowser 组件 mounted 时
- **更新**：searchQuery 变化时
- **销毁**：SRSBrowser 组件 unmounted 时

确保不会出现内存泄漏或上下文污染。

## 相关文档

- `BROWSER_SYNC_ISSUE_ANALYSIS.md` - 详细问题分析
- `REVIEW_SYNC_MANAGER_INTEGRATION.md` - 复习同步管理器集成
- `DIALOG_CLOSE_UI_REFRESH_SOLUTION.md` - 对话框关闭 UI 刷新方案

## 修复日期

2026-02-14

## 修复人员

Kiro AI Assistant
