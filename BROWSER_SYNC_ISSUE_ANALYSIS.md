# 浏览器数据同步问题分析

## 问题描述

在思源块菜单里使用原生的快速制卡后，打开 SRS 浏览器会自动更新，但这个更新没有获取最新的卡片，点全量更新按钮才会获取新的卡片。

## 问题根源

### 1. 函数签名不匹配

**browserService.ts 中的定义：**
```typescript
export async function loadQueueCards(
    blockIds: string[],
    queryText: string | undefined,
    unifiedDataSourceManager: UnifiedDataSourceManager
): Promise<BrowserCard[]>
```

**SRSBrowser.vue 中的调用（3 处）：**
```typescript
// 第 654 行
const updatedCards = await loadQueueCards(blockIds);

// 第 1363 行（handleCardUpdatedIncremental）
const updatedCards = await loadQueueCards(cardIds);

// 第 1829 行
const cards = await loadQueueCards(blockIds);
```

**问题：** 所有调用都只传了 1 个参数，缺少 `queryText` 和 `unifiedDataSourceManager`。

### 2. 数据流问题

当缺少参数时：
1. `queryText` 为 `undefined` → 可能导致查询逻辑异常
2. `unifiedDataSourceManager` 为 `undefined` → 无法从统一数据源获取最新数据
3. 函数会尝试从缓存读取，但缓存可能是旧的
4. 回退逻辑无法执行（因为 `unifiedDataSourceManager` 为 `undefined`）

### 3. 缓存机制

`loadQueueCards` 的逻辑：
```typescript
// 从缓存或统一数据源获取卡片
const cachedCards = cardCache.get();
if (cachedCards) {
    // 使用缓存数据
    const cardMap = new Map(cachedCards.map(c => [c.blockId, c]));
    let cards = ids.map(id => cardMap.get(id)).filter(Boolean) as BrowserCard[];
    // ...
    return cards;
}

// 回退：从统一数据源加载
const router = unifiedDataSourceManager.getRouter();  // ❌ undefined!
const allCards = await router.getCards();
```

**问题：**
- 如果缓存存在，直接返回缓存数据（可能是旧的）
- 如果缓存不存在，`unifiedDataSourceManager` 为 `undefined`，无法获取新数据
- 新制的卡片不在缓存中，也无法从数据源获取

### 4. 全量更新为什么有效

全量更新调用 `loadData(true)`：
```typescript
async function loadData(forceRefresh = false) {
    // ...
    const allCards = await loadAllCardsRaw(unifiedDataSourceManager, forceRefresh);
    // forceRefresh = true 会清除缓存并重新加载
}
```

`loadAllCardsRaw` 会：
1. 清除缓存（`forceRefresh = true`）
2. 从统一数据源重新加载所有卡片
3. 更新缓存

## 解决方案

### 方案 1：修复函数调用（推荐）

在 SRSBrowser.vue 中修复所有 `loadQueueCards` 调用，传入完整参数：

```typescript
// 需要在组件中获取这些值
const queryText = searchQuery.value;
const manager = props.plugin.unifiedDataSourceManager;

// 修复调用
const updatedCards = await loadQueueCards(blockIds, queryText, manager);
```

### 方案 2：修改函数签名

修改 `loadQueueCards` 使用全局或默认值：

```typescript
export async function loadQueueCards(
    blockIds: string[],
    queryText?: string,
    unifiedDataSourceManager?: UnifiedDataSourceManager
): Promise<BrowserCard[]> {
    // 使用全局实例或从其他地方获取
}
```

### 方案 3：增量更新时强制刷新缓存

在 `handleCardUpdatedIncremental` 中：

```typescript
async function handleCardUpdatedIncremental(cardIds: string[]) {
    // 强制清除缓存，确保获取最新数据
    invalidateCardCache();
    
    // 然后重新加载
    await loadData(true);
}
```

## 推荐方案

**方案 1** 是最正确的解决方案，因为：
1. 保持函数签名的完整性
2. 确保数据源的一致性
3. 不破坏现有的缓存机制
4. 符合设计意图

## 需要修改的位置

### 1. SRSBrowser.vue 中的所有 loadQueueCards 调用

需要修改的位置：
- **第 654 行**（卡片类型检测后更新）
- **第 1363 行**（handleCardUpdatedIncremental - 增量更新）
- **第 1829 行**（队列卡片加载）

### 2. 其他文件中的调用

- **useCardData.ts 第 196 行**
- **QueryDataSource.ts 第 86 行**
- **BlockIdsDataSource.ts 第 57 行**

## 实施步骤

### 步骤 1：创建包装函数（推荐）

在 `browserService.ts` 中添加一个包装函数，使用全局上下文：

```typescript
// 全局上下文（需要在初始化时设置）
let globalUnifiedDataSourceManager: UnifiedDataSourceManager | null = null;
let globalQueryText: string = '';

export function setGlobalBrowserContext(
    manager: UnifiedDataSourceManager,
    queryText: string = ''
) {
    globalUnifiedDataSourceManager = manager;
    globalQueryText = queryText;
}

// 包装函数：使用全局上下文
export async function loadQueueCardsSimple(
    blockIds: string[]
): Promise<BrowserCard[]> {
    if (!globalUnifiedDataSourceManager) {
        console.error('[browserService] Global context not initialized');
        return [];
    }
    return loadQueueCards(blockIds, globalQueryText, globalUnifiedDataSourceManager);
}
```

### 步骤 2：在 SRSBrowser.vue 中初始化全局上下文

```typescript
// 在组件 mounted 或 watch 中
watch([() => props.plugin, searchQuery], () => {
    if (props.plugin?.unifiedDataSourceManager) {
        setGlobalBrowserContext(
            props.plugin.unifiedDataSourceManager,
            searchQuery.value
        );
    }
}, { immediate: true });
```

### 步骤 3：替换所有调用

将所有 `loadQueueCards(blockIds)` 替换为 `loadQueueCardsSimple(blockIds)`。

### 或者：直接修复调用（更直接）

在每个调用点直接传入参数：

```typescript
// SRSBrowser.vue 第 654 行
const updatedCards = await loadQueueCards(
    blockIds,
    searchQuery.value,
    props.plugin.unifiedDataSourceManager
);

// SRSBrowser.vue 第 1363 行
const updatedCards = await loadQueueCards(
    cardIds,
    searchQuery.value,
    props.plugin.unifiedDataSourceManager
);

// SRSBrowser.vue 第 1829 行
const cards = await loadQueueCards(
    blockIds,
    searchQuery.value,
    props.plugin.unifiedDataSourceManager
);
```

## 验证方法

修复后，测试以下场景：

1. 在思源块菜单中使用快速制卡
2. 打开 SRS 浏览器
3. 验证新卡片是否立即显示（无需点击全量更新）
4. 检查控制台日志，确认 `loadQueueCards` 正确获取了数据

## 根本原因总结

这是一个**函数签名不匹配**的问题，可能是由于：
1. 代码重构时遗漏了更新调用点
2. 函数签名变更但没有更新所有使用方
3. TypeScript 类型检查可能被绕过（使用了 `any` 或类型断言）

建议启用更严格的 TypeScript 检查，避免类似问题。
