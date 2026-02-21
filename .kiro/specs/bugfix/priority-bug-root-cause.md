# 优先级持久化 Bug 根本原因分析

## 问题定位

### 根本原因

**在 `DataAccessFacade.fillMissingRootIds()` 方法中，调用了 `this.storage.setCard(card)`，这会触发不必要的卡片更新操作。**

### 问题代码位置

**文件**: `src/application/queries/DataAccessFacade.ts`  
**方法**: `fillMissingRootIds()`  
**行号**: 503

```typescript
private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
    // ...
    for (const card of cards) {
        const rootId = rootIdMap.get(card.blockId) || '';
        const content = contentMap.get(card.blockId) || '';
        
        if (!card.meta) {
            card.meta = {};
        }
        card.meta.rootId = rootId;
        card.meta.content = content;
        
        // ❌ 问题：这里调用了 setCard，会触发更新操作
        this.storage.setCard(card);
    }
}
```

### 为什么会导致优先级丢失

1. **浏览器加载卡片时**：
   - 调用 `getCards()` 获取所有卡片
   - 发现部分卡片缺少 `rootId` 或 `content`
   - 调用 `fillMissingRootIds()` 填充数据
   - **问题**：`fillMissingRootIds()` 调用 `storage.setCard(card)` 更新卡片

2. **`storage.setCard()` 的行为**：
   ```typescript
   setCard(card: FSRSCard): void {
       const existing = this.cards.get(card.id);
       if (existing) {
           // 更新现有卡片
           this.updateCard(card);  // ❌ 这里会覆盖内存中的数据
       } else {
           // 创建新卡片
           this.createCard(xiuyuan, card);
       }
   }
   ```

3. **数据覆盖流程**：
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
   storage.setCard(card) 更新卡片
     ↓
   ❌ 但是传入的 card 对象是从内存读取的旧对象
     ↓
   ❌ 如果这个对象的 priority 是旧值，就会覆盖新值
   ```

### 为什么会有旧值

**关键问题**：`fillMissingRootIds()` 接收的 `cards` 参数是从哪里来的？

查看调用链：
```typescript
// DataAccessFacade.getCards()
async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
    // 1. 从 CardApplicationService 获取卡片
    const result = await this.cardService.getCards({});
    let cards = result.cards;  // ✅ 这里的 cards 是从内存读取的
    
    // 2. 检查并填充缺失的 rootId 和 content
    const cardsNeedingData = cards.filter(c => !c.meta?.rootId || !c.meta?.content);
    if (cardsNeedingData.length > 0) {
        await this.fillMissingRootIds(cardsNeedingData);  // ❌ 传入的是内存中的对象
    }
    
    // ...
}
```

**问题**：
- `cards` 是从 `CardApplicationService.getCards()` 返回的
- `CardApplicationService.getCards()` 从 `UnifiedStorageManager.getAllCards()` 读取
- `UnifiedStorageManager.getAllCards()` 返回内存中的卡片对象
- **这些对象是引用，不是副本！**

### 真正的问题

**`fillMissingRootIds()` 不应该调用 `storage.setCard()`！**

原因：
1. `fillMissingRootIds()` 只是填充 `meta.rootId` 和 `meta.content` 字段
2. 这些字段是临时数据，用于 UI 显示
3. **不需要持久化到存储！**
4. 调用 `storage.setCard()` 会触发不必要的更新和保存操作

### 正确的做法

**直接修改内存中的对象，不调用 `storage.setCard()`**：

```typescript
private async fillMissingRootIds(cards: FSRSCard[]): Promise<void> {
    // ...
    for (const card of cards) {
        const rootId = rootIdMap.get(card.blockId) || '';
        const content = contentMap.get(card.blockId) || '';
        
        if (!card.meta) {
            card.meta = {};
        }
        card.meta.rootId = rootId;
        card.meta.content = content;
        
        // ✅ 不需要调用 storage.setCard()
        // 因为 card 是内存中对象的引用，直接修改即可
    }
}
```

## 修复方案

### 方案 1：移除 `storage.setCard()` 调用（推荐）

**优点**：
- 简单直接
- 不会触发不必要的更新
- 性能更好

**缺点**：
- `rootId` 和 `content` 不会持久化（但这是正确的行为）

### 方案 2：只在需要时持久化

如果确实需要持久化 `rootId` 和 `content`，应该：
1. 检查字段是否真的缺失
2. 只更新缺失的字段
3. 使用 `updateCard()` 而不是 `setCard()`

但是，**`rootId` 和 `content` 是临时数据，不应该持久化！**

## 实施步骤

1. ✅ 移除 `DataAccessFacade.fillMissingRootIds()` 中的 `this.storage.setCard(card)` 调用
2. ✅ 添加注释说明为什么不需要持久化
3. ✅ 测试优先级修改是否正常持久化

## 日期

2026-02-21

## 状态

🔧 待修复
