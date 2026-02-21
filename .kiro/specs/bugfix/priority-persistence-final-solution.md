# 优先级持久化问题 - 最终解决方案

## 问题根源

`UnifiedStorageManager` 维护了两个 Map：
- `cards: Map<string, FSRSCard>` - 旧架构
- `cardDTOs: Map<string, CardPersistenceDTO>` - 新架构

**问题**：两个 Map 需要保持同步，但是同步失败导致数据不一致：
- `getCard()` 从 `cards` Map 读取（可能是旧数据）
- `updateCardDTO()` 更新 `cardDTOs` Map（新数据）
- 刷新浏览器时，`load()` 方法同时加载两个 Map，如果 `cards` 中的数据是旧的，就会覆盖新数据

## 解决方案

**彻底移除 `cards` Map，只维护 `cardDTOs` Map。**

所有需要 `FSRSCard` 的地方，动态转换：
```typescript
const dto = this.cardDTOs.get(cardId);
if (!dto) return undefined;
return CardMapper.toDomain(dto);
```

## 修改内容

### 1. 移除 `cards` Map 声明

```typescript
// ❌ 移除
private cards: Map<string, FSRSCard> = new Map();

// ✅ 只保留
private cardDTOs: Map<string, CardPersistenceDTO> = new Map();
```

### 2. 修改所有查询方法

所有返回 `FSRSCard` 的方法都改为动态转换：

```typescript
getCard(cardId: string): FSRSCard | undefined {
    const dto = this.cardDTOs.get(cardId);
    if (!dto) return undefined;
    return CardMapper.toDomain(dto);  // ✅ 动态转换
}

getAllCards(): FSRSCard[] {
    return Array.from(this.cardDTOs.values()).map(dto => CardMapper.toDomain(dto));
}

getCardsByBlockId(blockId: string): FSRSCard[] {
    const cardIds = this.indexByBlockID.get(blockId) || [];
    return cardIds
        .map(id => this.cardDTOs.get(id))
        .filter((dto): dto is CardPersistenceDTO => dto !== undefined)
        .map(dto => CardMapper.toDomain(dto));
}
```

### 3. 修改 `load()` 方法

优先从 `cardDTOs` 加载，自动迁移旧数据：

```typescript
if (store.cardDTOs && Object.keys(store.cardDTOs).length > 0) {
    // 从 CardDTOs 加载（新架构）
    for (const [id, dto] of Object.entries(store.cardDTOs)) {
        this.cardDTOs.set(id, dto);
    }
} else {
    // 降级：从 Cards 加载（旧数据兼容，自动迁移）
    for (const [id, card] of Object.entries(store.cards)) {
        const dto = CardMapper.toPersistence(card);
        this.cardDTOs.set(id, dto);
    }
    console.log('[UnifiedStorageManager] ⚠️ Migrated old cards data to cardDTOs format');
}
```

### 4. 修改所有内部方法

移除所有 `this.cards.set()`, `this.cards.get()`, `this.cards.delete()` 调用，改为操作 `cardDTOs`。

需要 `FSRSCard` 时，动态转换：
```typescript
const dto = this.cardDTOs.get(cardId);
if (dto) {
    const card = CardMapper.toDomain(dto);
    // 使用 card
}
```

### 5. 保持向后兼容

`getStoreData()` 方法仍然保存 `cards` 字段（从 `cardDTOs` 转换），确保旧版本可以读取：

```typescript
getStoreData(): UnifiedCardStore {
    // ...
    
    // ✅ 为了向后兼容，仍然保存 cards 字段（从 cardDTOs 转换）
    const cards: Record<string, FSRSCard> = {};
    for (const [id, dto] of this.cardDTOs.entries()) {
        cards[id] = CardMapper.toDomain(dto);
    }
    
    return {
        version: 1,
        xiuyuans,
        cards,  // 向后兼容
        cardDTOs,  // 主数据源
    };
}
```

## 优势

1. **数据一致性**：只有一个数据源，不会出现不一致
2. **代码简洁**：不需要维护两个 Map 的同步
3. **内存优化**：减少了一半的内存占用
4. **易于维护**：逻辑更清晰，bug 更少

## 性能考虑

动态转换会有一定的性能开销，但是：
1. `CardMapper.toDomain()` 是一个简单的对象映射，性能开销很小
2. 避免了数据不一致的问题，减少了 bug
3. 如果性能成为瓶颈，可以考虑添加 LRU 缓存

## 测试验证

1. 修改优先级：50 → 16
2. 等待 1 秒（防抖延迟）
3. 刷新浏览器
4. 检查优先级是否保持为 16 ✅

## 日期

2026-02-21

## 状态

✅ 已完成
