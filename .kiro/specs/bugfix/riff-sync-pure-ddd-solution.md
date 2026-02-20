# Riff 同步纯 DDD 解决方案

## 问题描述

在实施 Riff 同步的 DDD 架构重构时，遇到了一个关键问题：

```typescript
// ❌ 错误：尝试使用 updateCard() 添加新 Card
const updateResult = xiuyuanEntity.updateCard(cardIdResult.value, cardResult.value);
// 失败原因：updateCard() 要求 Card 必须已存在于 cards 集合中
```

错误信息：
```
Failed to add Card to Xiuyuan: Card not found: 20250819213613-gc5xc9t
```

## 根本原因

`Xiuyuan.updateCard()` 方法的设计目的是**更新已存在的卡片**，它会先检查 `this.cards.has(cardId)`。但在同步场景中，我们需要**添加新创建的 Card**，而不是更新已有的。

## 解决方案：添加 `addCard()` 方法

### 1. 在 Xiuyuan 领域模型中添加 `addCard()` 方法

**文件**：`src/core/xiuyuan/domain/Xiuyuan.ts`

```typescript
/**
 * 添加已创建的卡片到 Xiuyuan
 * 
 * 用于将外部创建的 Card 实体添加到聚合根中。
 * 与 createCard() 不同，此方法接受已经创建好的 Card 实例。
 * 
 * @param card - 已创建的卡片实体
 * @returns Result<void> - 成功返回 void，失败返回错误
 */
addCard(card: Card): Result<void> {
  // 验证：卡片必须属于当前 Xiuyuan
  if (!card.getXiuyuanId().equals(this.id)) {
    return err(new Error('Card does not belong to this Xiuyuan'));
  }

  // 验证：卡片不能已存在
  if (this.cards.has(card.getId())) {
    return err(new Error(`Card already exists: ${card.getId().getValue()}`));
  }

  // 验证：faceIndex 必须有效
  const faceIndex = card.getFaceIndex();
  if (faceIndex < 0 || faceIndex >= this.faces.length) {
    return err(new Error(`Invalid faceIndex: ${faceIndex}. Must be between 0 and ${this.faces.length - 1}`));
  }

  // 添加到卡片集合
  this.cards.set(card.getId(), card);

  // 更新时间戳
  this.updatedAt = new Date();

  // 发布领域事件
  this.addDomainEvent(new CardCreatedEvent(
    this.id.getValue(),
    card.getId().getValue(),
    faceIndex
  ));

  return ok(undefined);
}
```

### 2. 修改 XiuyuanSyncService 使用 `addCard()`

**文件**：`src/application/services/XiuyuanSyncService.ts`

```typescript
// ✅ 将 Card 添加到 Xiuyuan（使用新的 addCard 方法）
const addResult = xiuyuanEntity.addCard(cardResult.value);
if (!addResult.ok) {
    const errorMsg = addResult.ok === false ? addResult.error.message : 'Failed to add card';
    throw new Error(`Failed to add Card to Xiuyuan: ${errorMsg}`);
}

// ✅ 返回完整的 Xiuyuan 实体（包含 Card）
return { xiuyuanEntity };
```

## 架构优势

### ✅ 完全符合 DDD 原则

1. **封装性**：通过公共方法 `addCard()` 添加卡片，而不是直接操作私有字段
2. **业务规则验证**：
   - 验证 Card 属于当前 Xiuyuan
   - 验证 Card 不重复
   - 验证 faceIndex 有效
3. **领域事件**：自动发布 `CardCreatedEvent`
4. **不变性维护**：自动更新 `updatedAt` 时间戳

### ✅ 清晰的职责划分

- `createCard()`：由 Xiuyuan 创建新 Card（生成 ID）
- `addCard()`：添加外部创建的 Card（已有 ID）
- `updateCard()`：更新已存在的 Card

### ✅ 完整的数据流

```
Riff API
  ↓
convertRiffCardToFSRSCard()
  ├─ 创建 Xiuyuan 实体
  ├─ 创建 Card 实体（包含完整 FSRS 数据）
  └─ xiuyuan.addCard(card)  ← 通过聚合根添加
      ↓
XiuyuanRepository.save(xiuyuan)
  ↓
UnifiedStorage（自动保存 Xiuyuan 和 Card）
```

## 与其他方案的对比

### ❌ 方案 A：直接访问私有字段（已废弃）

```typescript
// ❌ 破坏封装
(unifiedStorage as any).xiuyuans.set(xiuyuan.id, xiuyuan);
```

**问题**：
- 破坏封装性
- 绕过业务逻辑
- 缺少索引更新
- 缺少保存调度

### ❌ 方案 B：使用 `updateCard()`（失败）

```typescript
// ❌ 要求 Card 已存在
xiuyuan.updateCard(cardId, card);
```

**问题**：
- `updateCard()` 检查 `this.cards.has(cardId)`
- 新 Card 还未添加到集合，检查失败

### ✅ 方案 C：添加 `addCard()` 方法（最终方案）

```typescript
// ✅ 专门用于添加新 Card
xiuyuan.addCard(card);
```

**优势**：
- 符合 DDD 封装原则
- 清晰的语义（add vs update）
- 完整的验证和事件发布
- 保持架构纯粹性

## 测试验证

### 构建测试

```bash
npm run build
# ✅ 构建成功，无错误
```

### 运行时测试

1. 删除本地插件数据
2. 启动插件，触发增量同步
3. 验证：
   - Xiuyuan 正确创建
   - Card 正确添加到 Xiuyuan
   - Repository 正确保存
   - 浏览器能显示卡片

## 总结

通过在 Xiuyuan 聚合根中添加 `addCard()` 方法，我们实现了：

1. **完全符合 DDD 架构**：所有操作通过聚合根的公共方法
2. **保持封装性**：不直接访问私有字段
3. **清晰的语义**：`addCard()` vs `createCard()` vs `updateCard()`
4. **完整的业务规则**：验证、事件、时间戳自动处理

这是一个**纯 DDD 解决方案**，没有任何技术债务或架构妥协。
