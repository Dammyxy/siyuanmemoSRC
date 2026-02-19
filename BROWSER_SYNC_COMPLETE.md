# 浏览器数据同步问题 - 完整解决方案

## 问题描述

使用思源原生快速制卡后，打开 SRS 浏览器没有自动显示新卡片，需要手动点击"全量同步"按钮才能看到。

## 问题根源

### 1. loadQueueCards 函数签名不匹配
- **问题**：函数需要 3 个参数，但所有调用点只传了 1 个
- **影响**：增量更新无法正确获取数据

### 2. 自动同步未触发
- **问题**：`riffConfig.mode` 为 `undefined`，检查逻辑 `mode === 'advanced'` 失败
- **原因**：简单模式已移除，配置迁移后 mode 字段被删除
- **影响**：浏览器打开时不触发同步

### 3. 增量同步时间戳不同步（根本原因）
- **问题**：`lastSyncTime`（本地时间）与 `card.created`（riff 时间）可能不同步
- **影响**：新卡片被错误过滤，获取到 0 张新卡片

## 完整解决方案

### 修复 1：全局上下文 + 包装函数

**文件：** `src/ui/browser/browserService.ts`

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

### 修复 2：初始化和管理全局上下文

**文件：** `src/ui/browser/SRSBrowser.vue`

```typescript
// onMounted - 初始化
if (props.plugin?.unifiedDataSourceManager) {
    setGlobalBrowserContext(props.plugin.unifiedDataSourceManager, searchQuery.value);
}

// watch - 更新
watch(searchQuery, () => {
    if (props.plugin?.unifiedDataSourceManager) {
        setGlobalBrowserContext(props.plugin.unifiedDataSourceManager, searchQuery.value);
    }
});

// onBeforeUnmount - 清理
clearGlobalBrowserContext();
```

### 修复 3：修复 mode 检查逻辑

```typescript
// mode 为 undefined 时默认为 advanced（简单模式已移除）
const isAdvancedMode = !riffConfig?.mode || riffConfig.mode === 'advanced';
```

### 修复 4：使用全量同步

```typescript
// 浏览器打开时使用全量同步，避免时间戳不同步问题
if (isAdvancedMode && riffConfig?.fullSync?.enabled) {
    await plugin.hybridSyncService.fullSync();
    await loadData(true); // 强制刷新缓存
}
```

### 修复 5：替换所有调用点

将所有 `loadQueueCards(blockIds)` 替换为 `loadQueueCardsSimple(blockIds)`：

- ✅ `SRSBrowser.vue` - 3 处
- ✅ `useCardData.ts` - 1 处
- ✅ `QueryDataSource.ts` - 1 处
- ✅ `BlockIdsDataSource.ts` - 1 处

## 修复后的流程

### 原生快速制卡后打开浏览器

1. 用户使用思源原生快速制卡
2. 卡片数据写入 riff 数据库
3. 打开 SRS 浏览器
4. **自动触发全量同步**
5. 从 riff 获取所有卡片（包括新卡片）
6. 更新本地数据
7. **新卡片自动显示**

### 复习后的增量更新

1. 用户在复习对话框中评分
2. 触发 `card-updated` 事件
3. 浏览器收到事件，调用 `handleCardUpdatedIncremental`
4. 调用 `loadQueueCardsSimple(cardIds)`
5. **使用全局上下文获取最新数据**
6. 更新浏览器显示

## 技术细节

### 为什么使用全局上下文？

1. **简化调用**：避免在每个调用点传递相同参数
2. **集中管理**：在组件级别统一管理上下文
3. **向后兼容**：保留原有函数，不破坏现有代码
4. **易于维护**：只需在一个地方更新上下文

### 为什么使用全量同步？

1. **避免时间戳问题**：不依赖 `lastSyncTime` 和 `card.created` 比较
2. **确保数据完整**：获取所有卡片，不会漏掉新卡片
3. **简单可靠**：逻辑简单，不容易出错

### 性能考虑

- 全量同步比增量同步慢，但：
  - 只在浏览器打开时执行一次
  - 用户可以接受短暂的加载时间
  - 确保数据准确性更重要

## 测试验证

### 测试场景 1：原生快速制卡

1. 使用思源原生快速制卡创建新卡片
2. 打开 SRS 浏览器
3. ✅ 新卡片自动显示，无需手动同步

### 测试场景 2：复习后更新

1. 在复习对话框中评分
2. 关闭对话框
3. ✅ 浏览器自动更新卡片状态

### 测试场景 3：队列操作

1. 在浏览器中添加卡片到队列
2. ✅ 队列统计自动更新

## 相关文档

- `BROWSER_SYNC_ISSUE_ANALYSIS.md` - 详细问题分析
- `BROWSER_SYNC_ISSUE_FIX.md` - loadQueueCards 修复
- `BROWSER_AUTO_SYNC_FIX.md` - 自动同步修复

## 修复日期

2026-02-14

## 修复人员

Kiro AI Assistant

## 总结

通过三层修复（全局上下文、mode 检查、全量同步），彻底解决了浏览器数据同步问题。现在：

- ✅ 原生快速制卡后，新卡片自动显示
- ✅ 复习后，卡片状态自动更新
- ✅ 队列操作后，统计自动刷新
- ✅ 数据源统一，避免不一致

问题已完全解决！
