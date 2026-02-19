# Xiuyuan 模版卡删除功能修复

## 问题描述

Xiuyuan 模版卡无法正确删除。右键菜单中的"取消闪卡"功能只调用了 Riff API 删除，没有从本地数据中删除。

## 根本原因

### 问题 1：缺少 `deleteCards` 方法

`browserService.ts` 中的 `batchDelete` 函数调用了不存在的方法：

```typescript
// ❌ 错误：StorageManager 没有 deleteCards 方法
await storageManager.deleteCards(blockIds);
```

`StorageManager` 只有 `removeCard`（单数）方法，且只删除本地数据，不处理 Riff 卡组。

### 问题 2：缺少 `storageManager` 参数

`DeckDataSource.ts` 调用 `batchDelete` 时没有传递 `storageManager` 参数：

```typescript
// ❌ 错误：缺少 storageManager 参数
let deleted = await batchDelete(blockIds);
```

导致运行时错误：`Cannot read properties of undefined (reading 'deleteCards')`

## 修复方案

### 1. 添加 `deleteCards` 方法到 `StorageManager`

文件：`src/core/storage/manager.ts`

```typescript
/**
 * 批量删除卡片（同时从本地和 Riff 删除）
 * 
 * @param blockIds 块 ID 列表
 */
async deleteCards(blockIds: string[]): Promise<void> {
    // ... 实现代码
}
```

### 2. 修复 `DeckDataSource` 的调用

文件：`src/ui/browser/datasource/DeckDataSource.ts`

```typescript
if (actionId === 'delete-card') {
    const blockIds = selectedRows.map(row => row.blockId);
    
    // ✅ 检查是否有 storage
    if (!this.plugin?.storage) {
        console.error('[DeckDataSource] Storage not available!');
        return 0;
    }
    
    // ✅ 传递 storage 参数
    let deleted = await batchDelete(blockIds, this.plugin.storage);
    
    return deleted;
}
```

## 删除流程详解

### 正确的删除流程

删除卡片包含三个步骤：

1. **从本地存储删除** - 删除 FSRS 卡片数据
2. **从 Riff 卡组删除** - 调用 `removeRiffCards` API
3. **取消块标记** - 移除块的 `custom-fsrs-*` 属性

### `deleteCards` 方法实现

```typescript
async deleteCards(blockIds: string[]): Promise<void> {
    if (blockIds.length === 0) return;

    console.log('[StorageManager] Deleting cards:', blockIds.length);

    // 1. 从本地存储删除
    let deletedCount = 0;
    for (const blockId of blockIds) {
        const card = this.getCardByBlockId(blockId);
        if (card) {
            this.removeCard(card.id);
            deletedCount++;
        }
    }

    // 2. 保存更改
    if (deletedCount > 0) {
        await this.saveCards();
        console.log('[StorageManager] Deleted from local storage:', deletedCount);
    }

    // 3. 从 Riff 卡组删除
    try {
        const { removeRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
        await removeRiffCards(BUILTIN_DECK_ID, blockIds);
        console.log('[StorageManager] Deleted from Riff deck:', blockIds.length);
    } catch (error) {
        console.error('[StorageManager] Failed to delete from Riff:', error);
        // 不抛出错误，因为本地已经删除成功
    }

    // 4. 取消块的卡片标记
    try {
        const { unmarkBlockAsCard } = await import('@/core/siyuan/block');
        for (const blockId of blockIds) {
            await unmarkBlockAsCard(blockId);
        }
        console.log('[StorageManager] Unmarked blocks:', blockIds.length);
    } catch (error) {
        console.error('[StorageManager] Failed to unmark blocks:', error);
        // 不抛出错误
    }
}
```

### 1. 从本地存储删除

```typescript
for (const blockId of blockIds) {
    const card = this.getCardByBlockId(blockId);
    if (card) {
        this.removeCard(card.id);  // 删除 FSRS 卡片数据
        deletedCount++;
    }
}
await this.saveCards();  // 保存到文件
```

- 通过 `blockId` 查找对应的 FSRS 卡片
- 调用 `removeCard` 从内存缓存中删除
- 调用 `saveCards` 持久化到文件

### 2. 从 Riff 卡组删除

```typescript
const { removeRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
await removeRiffCards(BUILTIN_DECK_ID, blockIds);
```

- 调用思源的 Riff API
- 从内置卡组中移除块
- 即使失败也不抛出错误（本地已删除）

### 3. 取消块标记

```typescript
const { unmarkBlockAsCard } = await import('@/core/siyuan/block');
for (const blockId of blockIds) {
    await unmarkBlockAsCard(blockId);
}
```

- 移除块的 `custom-fsrs-card-id` 属性
- 移除块的 `custom-fsrs-priority` 属性
- 移除块的 `custom-fsrs-card-type` 属性
- 块恢复为普通块

## 适用场景

此修复适用于所有类型的卡片删除：

1. **普通卡片** - 通过 `>>`, `::`, `;;` 等符号创建的卡片
2. **Xiuyuan 模版卡** - 通过 Xiuyuan 模版创建的多块卡片
3. **手动创建的卡片** - 通过块菜单创建的卡片

## 测试验证

### 测试步骤

1. 创建一个 Xiuyuan 模版卡（例如概念+描述符）
2. 在浏览器中找到该卡片
3. 右键选择"取消闪卡"
4. 验证以下内容：
   - 卡片从浏览器列表中消失
   - 块的卡片图标消失
   - 块的 `custom-fsrs-*` 属性被移除
   - Riff 卡组中不再包含该块

### 验证脚本

在思源控制台运行：

```javascript
// 测试删除功能
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const storage = plugin.storage;

// 假设要删除的块 ID
const testBlockId = 'your-block-id-here';

// 删除前检查
console.log('删除前:');
console.log('- 本地卡片:', storage.getCardByBlockId(testBlockId));

// 执行删除
await storage.deleteCards([testBlockId]);

// 删除后检查
console.log('删除后:');
console.log('- 本地卡片:', storage.getCardByBlockId(testBlockId));  // 应该是 undefined
```

## 错误处理

### Riff API 失败

如果 Riff API 调用失败（例如网络问题），不会影响本地删除：

```typescript
try {
    await removeRiffCards(BUILTIN_DECK_ID, blockIds);
} catch (error) {
    console.error('[StorageManager] Failed to delete from Riff:', error);
    // 不抛出错误，因为本地已经删除成功
}
```

### 块标记移除失败

如果块标记移除失败，也不会影响删除：

```typescript
try {
    await unmarkBlockAsCard(blockId);
} catch (error) {
    console.error('[StorageManager] Failed to unmark blocks:', error);
    // 不抛出错误
}
```

## 与 HybridSyncService 的关系

删除卡片后，`HybridSyncService` 会通过 WebSocket 监听到变化：

1. **增量同步** - 检测到 Riff 卡组变化
2. **删除同步** - 如果启用，会同步删除操作
3. **黑名单** - 如果删除失败，可能会加入黑名单

## 相关文件

- `src/core/storage/manager.ts` - 添加 `deleteCards` 方法
- `src/ui/browser/datasource/DeckDataSource.ts` - 修复调用，传递 `storage` 参数
- `src/ui/browser/browserService.ts` - `batchDelete` 函数签名
- `src/core/siyuan/riff.ts` - Riff API 封装
- `src/core/siyuan/block.ts` - 块标记管理

## 完成时间

2026-02-15

## 状态

✅ 已修复并编译通过  
✅ 需要重新加载插件才能生效

## 补充修复：CardCacheManager 缺少方法

### 问题
`CardCacheManager` 类缺少 `updateCard` 和 `removeCards` 方法，导致运行时错误：
```
TypeError: cardCache.removeCards is not a function
```

### 修复
在 `src/ui/browser/browserService.ts` 中添加缺失的方法：

```typescript
/**
 * 更新单个卡片的缓存
 */
updateCard(blockId: string, updates: Partial<BrowserCard>): void {
    if (!this.cache) return;
    
    const card = this.cache.cards.find(c => c.blockId === blockId);
    if (card) {
        Object.assign(card, updates);
    }
}

/**
 * 从缓存中移除多个卡片
 */
removeCards(blockIds: string[]): void {
    if (!this.cache) return;
    
    const blockIdSet = new Set(blockIds);
    this.cache.cards = this.cache.cards.filter(c => !blockIdSet.has(c.blockId));
    this.cache.blockIdSet = new Set(this.cache.cards.map(c => c.blockId));
}
```

### 状态
✅ 已修复并编译通过
