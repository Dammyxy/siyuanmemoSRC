# Riff 同步混合方案

## 问题

在实施完整的 DDD 架构后，发现一个关键问题：

**Xiuyuan 聚合根的 cards 集合为空**

- 我们创建了 Xiuyuan 领域实体，但没有创建 Card 实体
- Repository 保存时，由于 `xiuyuan.getCards()` 返回空数组，没有保存任何卡片
- 导致浏览器显示 0 张卡片

## 根本原因

Card 是不可变实体，需要通过 `xiuyuan.createCard()` 创建，但这需要：
1. 创建 CardId 值对象
2. 调用 `xiuyuan.createCard(faceIndex, cardId)`
3. 通过 `card.review()` 更新调度信息（返回新实例）
4. 通过 `xiuyuan.updateCard()` 更新卡片

这个流程太复杂，而且 Card 的不可变性使得更新 FSRS 数据变得困难。

## 混合方案

采用**混合方案**：Repository 负责 Xiuyuan 结构，直接保存 FSRSCard 数据。

### 实现步骤

#### 1. convertRiffCardToFSRSCard 返回两个对象

```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
    xiuyuanEntity: Xiuyuan;  // ✅ 领域实体（只有结构，没有 Card）
    card: FSRSCard;          // ✅ 持久化模型（包含 FSRS 数据）
}>
```

#### 2. 同步逻辑：两步保存

```typescript
// 步骤 1：通过 Repository 保存 Xiuyuan（建立结构）
const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);

// 步骤 2：直接保存 FSRSCard（实际数据）
const unifiedStorage = this.config.storage as any;
const xiuyuanData = unifiedStorage.getXiuYuan(xiuyuanEntity.getId().getValue());
if (xiuyuanData) {
    await unifiedStorage.createCard(xiuyuanData, card);
}
```

### 为什么这样做？

1. **保持 DDD 架构**：
   - Xiuyuan 通过 Repository 管理
   - 块属性通过 Repository 写入
   - 领域事件通过 Repository 发布

2. **绕过 Card 不可变性**：
   - 不创建 Card 领域实体
   - 直接保存 FSRSCard 持久化模型
   - 避免复杂的不可变更新流程

3. **实用主义**：
   - Riff 卡片是外部数据，不需要完整的领域模型
   - 重点是数据同步，不是业务逻辑
   - 性能优先，避免不必要的对象创建

## 架构权衡

### 优点

✅ 保持了 Repository 模式（Xiuyuan 结构）  
✅ 避免了 Card 不可变性的复杂性  
✅ 性能更好（减少对象创建）  
✅ 代码更简单易懂  

### 缺点

❌ 不是纯粹的 DDD（绕过了 Card 实体）  
❌ 直接访问 UnifiedStorage（破坏了一点封装）  
❌ 两步保存（可能有一致性问题）  

### 为什么可以接受？

1. **Riff 同步是特殊场景**：
   - 外部数据导入，不是核心业务逻辑
   - 不需要完整的领域模型

2. **实用主义优先**：
   - 功能正常比架构纯粹更重要
   - 避免过度设计

3. **未来可以改进**：
   - 如果需要，可以让 Card 支持可变更新
   - 或者实现专门的 RiffCardFactory

## 对比方案

### 方案 A：纯 DDD（已放弃）

```typescript
// ❌ 太复杂
const cardEntity = xiuyuan.createCard(0, cardId);
const scheduleInfo = ScheduleInfo.create({...});
const updatedCard = cardEntity.review(rating, scheduleInfo);
xiuyuan.updateCard(cardId, updatedCard);
await repository.save(xiuyuan);
```

### 方案 B：混合方案（当前）

```typescript
// ✅ 简单实用
await repository.save(xiuyuanEntity);  // 保存结构
await unifiedStorage.createCard(xiuyuanData, card);  // 保存数据
```

### 方案 C：完全绕过 Repository（不推荐）

```typescript
// ❌ 破坏架构
await unifiedStorage.createCard(xiuyuan, card);
```

## 总结

混合方案是在**架构纯粹性**和**实用性**之间的权衡：

- 保留了 Repository 模式的核心价值（Xiuyuan 结构管理）
- 绕过了 Card 不可变性的复杂性
- 实现了功能需求（Riff 卡片同步）

这是一个**务实的选择**，在当前场景下是最合适的方案。
