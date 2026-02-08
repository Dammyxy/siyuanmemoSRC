# 渐进学习队列 type: null 问题根源分析

## 问题描述

浏览器渐进学习队列表格视图获取卡片时失败，错误信息：
```
[normalizeToFSRSCard] Unknown card type at index 40-43: {"id":"...","type":null,...}
```

## 根源定位

### 问题链路

1. **SRSBrowser** → 调用 `UnifiedDataSourceManager` 获取 incremental-learning 队列
2. **AdvancedDataRouter** → 调用 `storage.getAllCards()` 返回 45 张卡片
3. **SRSBrowserAdapter** → 调用 `normalizeToFSRSCard()` 规范化卡片
4. **normalizeToFSRSCard** → 在索引 40-43 的卡片上失败，因为 `type: null`

### 根本原因

**位置**: `src/core/queue/strategies/IncrementalLearningQueue.ts:789-801`

```typescript
// 🆕 如果卡片不存在，创建默认的 FSRSCard
if (!localCard) {
  const now = Date.now();
  localCard = {
    id: cardID,
    blockId: blockID,
    due: now,
    stability: 0,
    difficulty: 5,
    reps: item.reps ?? 0,
    lapses: item.lapses ?? 0,
    state: item.state ?? 0,
    lastReview: item.lastReview ?? 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: item.priority ?? 50,
    type: 'item', // ⚠️ 这里设置为字符串 'item'
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
  };
  
  // 保存到本地存储
  this.storage.setCard(localCard);  // ⚠️ 问题：保存时 type 被转换为 null
  createdCount++;
}
```

### 问题分析

1. **类型不匹配**: 代码中设置 `type: 'item'`（字符串），但 `FSRSCard` 类型定义要求 `type: CardType`（枚举）
2. **存储转换问题**: `storage.setCard()` 在保存时可能进行了类型转换或序列化，导致字符串 `'item'` 被转换为 `null`
3. **类型定义**: 
   ```typescript
   // src/types/card.ts
   export enum CardType {
       Item = 'item',
       Topic = 'topic',
       Incremental = 'incremental',
       Webpage = 'webpage',
   }
   ```

### 为什么会变成 null？

**确认的原因**:

1. **IncrementalLearningQueue.ts:797** - 创建卡片时使用字符串 `'item'`
   ```typescript
   type: 'item', // ⚠️ 字符串而不是枚举
   ```

2. **StorageManager.ts:152** - `setCard()` 直接保存到缓存
   ```typescript
   this.cardsCache.set(card.id, card); // 保存时 type 是字符串 'item'
   ```

3. **StorageManager.ts:333** - `saveCards()` 使用 msgpack 序列化
   ```typescript
   await this.saveMsgpackData(STORAGE_FILES.CARDS, cards);
   ```

4. **StorageManager.ts:259-289** - `normalizeCard()` 加载时的处理
   ```typescript
   type: card.type,  // ⚠️ 不使用 ?? 默认值，保持 undefined
   ```
   
   **关键问题**: 当 `card.type` 是字符串 `'item'` 时，msgpack 序列化/反序列化后可能变成 `null`，因为：
   - msgpack 不保留 TypeScript 枚举类型信息
   - 字符串 `'item'` 在某些情况下可能被解析为 `null`
   - `normalizeCard()` 不提供默认值，所以 `null` 被保留

5. **类型不匹配链**:
   ```
   创建: type: 'item' (string)
     ↓
   保存: msgpack.encode({ type: 'item' })
     ↓
   加载: msgpack.decode() → { type: null } (?)
     ↓
   规范化: type: card.type → type: null
     ↓
   验证失败: isFSRSCard() 检查 type 字段类型
   ```

## 修复方案

### 方案 1: 使用 CardType 枚举（推荐 - 治本）

**位置**: `src/core/queue/strategies/IncrementalLearningQueue.ts:797`

```typescript
import { CardType } from '../../../types/card';

// 修改第 797 行
type: CardType.Item, // ✅ 使用枚举而不是字符串
```

**优点**: 
- 类型安全
- 与 FSRSCard 类型定义一致
- 避免序列化问题

### 方案 2: 在 normalizeCard 中提供默认值（推荐 - 治标）

**位置**: `src/core/storage/manager.ts:280`

```typescript
// 修改第 280 行
type: card.type ?? CardType.Item, // ✅ 为 null/undefined 提供默认值
```

**优点**:
- 容错性强
- 修复已存在的 `type: null` 卡片
- 防止未来出现类似问题

### 方案 3: 在 normalizeToFSRSCard 中容错（推荐 - 双重保险）

**位置**: `src/diagnostics/type-guards.ts:290-304`

```typescript
// 修改 normalizeToFSRSCard 函数
const normalizedCard: FSRSCard = {
    ...card,
    priority: card.priority ?? 50,
    type: card.type ?? CardType.Item, // ✅ 为 null 提供默认值
    tags: card.tags ?? [],
    // ...
};
```

**优点**:
- 最后一道防线
- 确保所有卡片都有有效的 type
- 不影响其他逻辑

### 推荐组合方案

**同时应用方案 1 + 方案 2 + 方案 3**，形成三层防护：

1. **源头修复**: 创建卡片时使用 `CardType.Item`
2. **加载容错**: `normalizeCard()` 提供默认值
3. **验证容错**: `normalizeToFSRSCard()` 提供默认值

这样可以：
- 修复新创建的卡片
- 修复已存在的问题卡片
- 防止未来出现类似问题

## 影响范围

- **受影响的卡片**: 4 张卡片（索引 40-43）
- **卡片 ID**:
  - `20260203222457-raq2sfs`
  - `20260203222510-lg626ip`
  - `20260205105152-w57h904`
  - `20260205110918-j7cej9r`
- **创建时间**: 这些卡片都是在 `_recalculateNextDues()` 中创建的默认卡片

## 验证步骤

1. 检查 `storage.getCard()` 返回的卡片，确认 `type` 字段的值
2. 在 `_recalculateNextDues()` 中添加日志，记录创建的卡片的 `type` 字段
3. 检查 `storage.setCard()` 的实现，确认是否正确保存 `type` 字段

## 建议

1. **立即修复**: 使用 `CardType.Item` 替换字符串 `'item'`
2. **增强容错**: 在 `normalizeToFSRSCard()` 中为 `type: null` 提供默认值
3. **类型安全**: 确保所有创建 FSRSCard 的地方都使用 CardType 枚举
4. **数据修复**: 运行脚本修复已存在的 `type: null` 卡片

## 相关文件

- `src/core/queue/strategies/IncrementalLearningQueue.ts:797` - **问题源头**: 使用字符串 `'item'` 而不是 `CardType.Item`
- `src/core/storage/manager.ts:280` - **加载问题**: `normalizeCard()` 不提供默认值
- `src/diagnostics/type-guards.ts:290-304` - **验证问题**: `normalizeToFSRSCard()` 需要容错
- `src/types/card.ts:15-20` - CardType 枚举定义

## 立即行动

### 第一步：修复源头（IncrementalLearningQueue）

```bash
# 修改 src/core/queue/strategies/IncrementalLearningQueue.ts:797
type: CardType.Item,  // 从 'item' 改为 CardType.Item
```

### 第二步：增强容错（StorageManager）

```bash
# 修改 src/core/storage/manager.ts:280
type: card.type ?? CardType.Item,  // 添加默认值
```

### 第三步：最后防线（type-guards）

```bash
# 修改 src/diagnostics/type-guards.ts:290-304
type: card.type ?? CardType.Item,  // 添加默认值
```

### 第四步：数据修复（可选）

运行脚本修复已存在的 `type: null` 卡片：

```typescript
// 修复脚本
const cards = storage.getAllCards();
let fixedCount = 0;

for (const card of cards) {
  if (card.type === null || card.type === undefined) {
    card.type = CardType.Item;
    storage.setCard(card);
    fixedCount++;
  }
}

await storage.saveCards();
console.log(`Fixed ${fixedCount} cards with null type`);
```
