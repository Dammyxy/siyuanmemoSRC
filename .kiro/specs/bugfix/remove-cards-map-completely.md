# 彻底移除 cards Map - 修复方案

## 问题

`UnifiedStorageManager` 维护了两个 Map：
- `cards: Map<string, FSRSCard>` - 旧架构
- `cardDTOs: Map<string, CardPersistenceDTO>` - 新架构

这导致数据不一致问题，因为两个 Map 需要保持同步。

## 解决方案

**只维护 `cardDTOs` Map，彻底移除 `cards` Map。**

所有需要 `FSRSCard` 的地方，动态转换：
```typescript
const dto = this.cardDTOs.get(cardId);
if (!dto) return undefined;
return CardMapper.toDomain(dto);
```

## 需要修改的地方

### 1. 移除 cards Map 声明 ✅

```typescript
// 移除
private cards: Map<string, FSRSCard> = new Map();

// 只保留
private cardDTOs: Map<string, CardPersistenceDTO> = new Map();
```

### 2. 修改 load() 方法 ✅

只从 `cardDTOs` 加载，不再加载 `cards`。

### 3. 修改 clear() 方法

```typescript
this.xiuyuans.clear();
this.cardDTOs.clear();  // 只清除 cardDTOs
```

### 4. 修改 rebuildIndexes() 方法

```typescript
for (const dto of this.cardDTOs.values()) {
    const card = CardMapper.toDomain(dto);
    this.updateIndexesForCard(card, 'add');
}
```

### 5. 修改 batchCreateCards() 方法

移除所有 `this.cards.set()` 和 `this.cards.delete()` 调用。

### 6. 修改 createCardDTO() 方法

移除 `this.cards.set()` 调用。

### 7. 修改 updateCardDTO() 方法

移除 `this.cards.set()` 调用和相关日志。

### 8. 修改 batchCreateCardsDTO() 方法

移除所有 `this.cards` 相关操作。

### 9. 修改 deleteCard() 方法

```typescript
const dto = this.cardDTOs.get(cardId);
if (!dto) {
    return err(new Error(`Card not found: ${cardId}`));
}

const card = CardMapper.toDomain(dto);
this.updateIndexesForCard(card, 'remove');
this.cardDTOs.delete(cardId);
```

### 10. 修改 deleteXiuYuan() 方法

```typescript
for (const cardId of [...cardIds]) {
    const dto = this.cardDTOs.get(cardId);
    if (dto) {
        const card = CardMapper.toDomain(dto);
        this.updateIndexesForCard(card, 'remove');
        this.cardDTOs.delete(cardId);
    }
}
```

### 11. 修改 validateConsistency() 方法

```typescript
for (const dto of this.cardDTOs.values()) {
    const card = CardMapper.toDomain(dto);
    // ...
}
```

### 12. 修改 autoFix() 方法

```typescript
for (const dto of this.cardDTOs.values()) {
    const card = CardMapper.toDomain(dto);
    // ...
}
```

### 13. 修改 getStats() 方法

```typescript
totalCards: this.cardDTOs.size,

for (const dto of this.cardDTOs.values()) {
    const card = CardMapper.toDomain(dto);
    // ...
}
```

### 14. 修改 setCard() 方法

```typescript
const existing = this.cardDTOs.get(card.id);
if (existing) {
    this.updateCard(card);
} else {
    // 创建新卡片
    const xiuyuanId = (card.meta as any)?.xiuyuanID;
    if (!xiuyuanId) {
        throw new Error(`Cannot create card without xiuyuanID`);
    }
    const xiuyuan = this.xiuyuans.get(xiuyuanId);
    if (!xiuyuan) {
        throw new Error(`Xiuyuan not found: ${xiuyuanId}`);
    }
    this.createCard(xiuyuan, card);
}
```

### 15. 修改 removeCard() 方法

```typescript
const dto = this.cardDTOs.get(cardId);
if (!dto) {
    return false;
}

const card = CardMapper.toDomain(dto);
this.cardDTOs.delete(cardId);
this.updateIndexesForCard(card, 'remove');
this.dirty = true;
this.scheduleSave();
return true;
```

### 16. 修改 getStatsExtended() 方法

```typescript
cardCount: this.cardDTOs.size,
cardDTOCount: this.cardDTOs.size,
```

## 性能考虑

动态转换会有一定的性能开销，但是：
1. 避免了数据不一致的问题
2. 减少了内存占用（只维护一份数据）
3. 代码更简洁，更容易维护

如果性能成为瓶颈，可以考虑：
1. 缓存最近访问的 FSRSCard
2. 使用 LRU 缓存策略
3. 批量转换优化

## 实施步骤

1. ✅ 移除 `cards` Map 声明
2. ✅ 修改所有 `getCard()` 等查询方法
3. ⏳ 修改所有内部方法，移除 `this.cards` 引用
4. ⏳ 测试所有功能
5. ⏳ 性能测试

## 日期

2026-02-21

## 状态

🔧 进行中
