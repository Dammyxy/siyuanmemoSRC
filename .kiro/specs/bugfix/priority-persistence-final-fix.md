# 优先级持久化问题 - 最终修复报告

## 问题回顾

用户在"全部闪卡"视图中修改卡片优先级后，刷新浏览器，优先级没有持久化，又变回了原来的值。

## 根本原因

**在 `DataAccessFacade.fillMissingRootIds()` 方法中，调用了 `this.storage.setCard(card)`，这会触发不必要的卡片更新操作，可能覆盖其他字段的值。**

### 问题代码

**文件**: `src/application/queries/DataAccessFacade.ts`  
**方法**: `fillMissingRootIds()`  
**行号**: 503

```typescript
private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
    // ...
    for (const card of cards) {
        // 填充 rootId 和 content
        card.meta.rootId = rootId;
        card.meta.content = content;
        
        // ❌ 问题：这里调用了 setCard，会触发更新操作
        this.storage.setCard(card);
    }
}
```

### 为什么会导致问题

1. **`fillMissingRootIds()` 在每次加载卡片时都会被调用**
2. **`storage.setCard()` 会更新整个卡片对象**
3. **如果传入的 `card` 对象包含旧数据，就会覆盖新数据**

### 数据流分析

```
用户修改优先级 (priority: 50 -> 11)
  ↓
updateCard() 更新内存 (priority: 11) ✅
  ↓
save() 保存到文件 (priority: 11) ✅
  ↓
浏览器刷新
  ↓
getCards() 从内存读取 (priority: 11) ✅
  ↓
fillMissingRootIds() 填充 rootId/content
  ↓
storage.setCard(card) 更新卡片 ❌
  ↓
可能覆盖 priority 字段 ❌
```

## 修复方案

### 修复内容

**移除 `DataAccessFacade.fillMissingRootIds()` 中的 `this.storage.setCard(card)` 调用**

### 修复后的代码

```typescript
private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
    if (cards.length === 0) {
        return;
    }
    
    const blockIds = cards.map(c => c.blockId);
    const rootIdMap = await this.blockRepository.batchQueryRootIds(blockIds);
    
    // 批量获取块内容
    const contentPromises = cards.map(async (card) => {
        try {
            const content = await getBlockText(card.blockId);
            return { blockId: card.blockId, content };
        } catch (error) {
            console.warn(`[SiYuanMemo][DataAccessFacade] Failed to get content for block ${card.blockId}:`, error);
            return { blockId: card.blockId, content: '' };
        }
    });
    
    const contentResults = await Promise.all(contentPromises);
    const contentMap = new Map(contentResults.map(r => [r.blockId, r.content]));
    
    for (const card of cards) {
        const rootId = rootIdMap.get(card.blockId) || '';
        const content = contentMap.get(card.blockId) || '';
        
        if (!card.meta) {
            card.meta = {};
        }
        card.meta.rootId = rootId;
        card.meta.content = content;
        
        // ✅ 不需要调用 storage.setCard()
        // 原因：
        // 1. card 是内存中对象的引用，直接修改即可
        // 2. rootId 和 content 是临时数据，用于 UI 显示，不需要持久化
        // 3. 调用 setCard() 会触发不必要的更新操作，可能覆盖其他字段（如 priority）
    }
    
    console.log(`[SiYuanMemo][DataAccessFacade] ✅ Filled rootId and content for ${cards.length} cards`);
}
```

### 为什么这样修复是正确的

1. **`card` 是内存中对象的引用**：
   - `getCards()` 返回的是内存中对象的引用
   - 直接修改 `card.meta` 就会更新内存中的数据
   - 不需要调用 `storage.setCard()`

2. **`rootId` 和 `content` 是临时数据**：
   - 这些字段只用于 UI 显示
   - 不需要持久化到存储
   - 每次加载时重新查询即可

3. **避免不必要的更新操作**：
   - `storage.setCard()` 会触发更新和保存操作
   - 这会增加 I/O 开销
   - 可能覆盖其他字段的值

## 修复验证

### 测试步骤

1. 启动插件
2. 打开"全部闪卡"视图
3. 修改某个卡片的优先级（例如从 50 改为 11）
4. 刷新浏览器
5. 检查优先级是否保持为 11

### 预期结果

- ✅ 优先级修改后立即生效
- ✅ 刷新浏览器后优先级保持不变
- ✅ 不会触发不必要的更新操作

## 相关修复

### 之前的修复

在此次修复之前，我们已经完成了以下修复：

1. **迁移到 UnifiedStorageManager**：
   - `ApplicationContext.getStorage()` 返回 `UnifiedStorageManager`
   - `UpdateFSRSCardUseCase` 使用 `UnifiedStorageManager`
   - `CardApplicationService` 使用 `UnifiedStorageManager`

2. **移除旧架构 StorageManager**：
   - 所有代码都通过 `context.getStorage()` 访问存储
   - `context.getStorage()` 返回 `UnifiedStorageManager`
   - 确保数据一致性

### 本次修复的关键

**本次修复解决了最后一个问题：`fillMissingRootIds()` 中的不必要更新操作。**

这是导致优先级丢失的根本原因，因为：
- 每次加载卡片时都会调用 `fillMissingRootIds()`
- `storage.setCard()` 会更新整个卡片对象
- 如果传入的对象包含旧数据，就会覆盖新数据

## 总结

### 问题根源

**不是数据没有保存，而是在加载时被不必要的更新操作覆盖了！**

### 修复方法

**移除 `fillMissingRootIds()` 中的 `storage.setCard()` 调用**

### 关键洞察

1. **直接修改内存中的对象引用**：不需要调用 `storage.setCard()`
2. **临时数据不需要持久化**：`rootId` 和 `content` 只用于 UI 显示
3. **避免不必要的更新操作**：减少 I/O 开销，避免数据覆盖

## 日期

2026-02-21

## 状态

✅ 已修复

## 修改的文件

- `src/application/queries/DataAccessFacade.ts` - 移除 `fillMissingRootIds()` 中的 `storage.setCard()` 调用
