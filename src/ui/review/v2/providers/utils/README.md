# SessionManager - 会话管理工具

## 概述

`SessionManager` 是一个通用的会话管理工具类，用于管理复习会话中的卡片列表。它封装了 `SortedSequencer`，提供更高级的会话管理功能。

## 设计目标

1. **让 Provider 专注于业务逻辑**：Provider 不需要关心排序细节
2. **让排序逻辑独立且可复用**：所有 Provider 都可以使用
3. **支持 SM-15 风格的优先级排序**：失败次数越多的卡片优先复习

## 核心特性

### 1. 有序队列管理
- 使用 `SortedSequencer` 维护有序队列
- 支持按 `dueTime`（到期时间）排序
- 支持按 `priority`（优先级）排序（次键）
- O(log n) 的插入效率（二分查找）

### 2. Lapse Tracking（失败次数追踪）
- 自动追踪卡片的失败次数
- 失败次数越多，优先级越高
- 难卡片自动排在前面，优先复习

### 3. 统计信息
- 总卡片数
- 平均失败次数
- 最大失败次数
- 有失败记录的卡片数

## 使用示例

### 基本用法

```typescript
import { SessionManager } from './utils/SessionManager';

// 创建 SessionManager
const session = new SessionManager<BrowserCard>({
  getDueMs: (card) => card.due || Date.now(),
  getPriority: (card) => {
    // 使用负数：失败次数越多，优先级越高（排在越前面）
    return -(card.lapses || 0) * 10;
  },
});

// 加载卡片
session.load(cards);

// 获取所有卡片（已排序）
const sortedCards = session.getAll();

// 移除卡片
session.remove(c => c.id === cardId);

// 旋转卡片（重新插入，保持排序）
session.rotate(card);

// 旋转卡片并增加失败次数
session.rotateWithLapse(card);

// 获取统计信息
const stats = session.getStats();
console.log('Average lapses:', stats.avgLapses);
```

### 在 Provider 中使用

```typescript
export class RetrievalPracticeProvider {
  private readonly session: SessionManager<BrowserCard>;
  
  constructor() {
    this.session = new SessionManager({
      getDueMs: (card) => card.due || Date.now(),
      getPriority: (card) => -(card.lapses || 0) * 10,
    });
  }
  
  async getDueCards(): Promise<BrowserCard[]> {
    if (!this.session.isLoaded()) {
      const cards = await this.queue.getAllCards();
      this.session.load(cards);
    }
    return this.session.getAll();
  }
  
  async reviewCard(cardId: string, rating: 1 | 2 | 3 | 4): Promise<boolean> {
    const card = this.session.find(c => c.id === cardId);
    this.session.remove(c => c.id === cardId);
    
    if (rating < 3) {
      // 失败：增加 lapse 并重新插入
      this.session.rotateWithLapse(card);
    }
    // 成功：不重新插入（已删除）
    
    return true;
  }
}
```

## 优先级排序说明

### 为什么使用负数？

`SortedSequencer` 使用**升序排序**（从小到大），所以：
- 数值越小 → 排在越前面
- 数值越大 → 排在越后面

我们希望**失败次数越多的卡片排在越前面**，所以需要使用负数：

```typescript
// ✅ 正确：使用负数
getPriority: (card) => -(card.lapses || 0) * 10

// 结果：
// lapses=3 → priority=-30 → 排在最前面
// lapses=1 → priority=-10 → 排在中间
// lapses=0 → priority=0   → 排在最后面
```

```typescript
// ❌ 错误：使用正数
getPriority: (card) => (card.lapses || 0) * 10

// 结果：
// lapses=0 → priority=0  → 排在最前面（不符合预期）
// lapses=1 → priority=10 → 排在中间
// lapses=3 → priority=30 → 排在最后面（不符合预期）
```

## API 文档

### 构造函数

```typescript
constructor(options: SessionManagerOptions<TCard>)
```

**参数**：
- `getDueMs`: 获取卡片的到期时间（毫秒）
- `getPriority`: 获取卡片的优先级（可选）
- `initialCards`: 初始卡片列表（可选）

### 方法

#### `load(cards: TCard[]): void`
加载卡片到会话。

#### `getAll(): TCard[]`
获取所有卡片（已排序）。

#### `next(): Promise<TCard | null>`
获取下一张卡片（并从队列中移除）。

#### `remove(predicate: (card: TCard) => boolean): boolean`
移除卡片。

#### `rotate(card: TCard): void`
旋转卡片到队列中（重新插入，保持排序）。

#### `rotateWithLapse(card: TCard): void`
旋转卡片并增加失败次数。

#### `size(): number`
获取队列大小。

#### `isEmpty(): boolean`
检查队列是否为空。

#### `isLoaded(): boolean`
检查是否已加载。

#### `clear(): void`
清空会话。

#### `getStats(): SessionStats`
获取统计信息。

#### `find(predicate: (card: TCard) => boolean): TCard | null`
查找卡片。

## 与 SortedSequencer 的关系

```
SessionManager (高级封装)
  ↓ 使用
SortedSequencer (底层实现)
  ↓ 使用
二分查找算法（O(log n) 插入）
```

**SessionManager 的价值**：
- 提供更友好的 API
- 封装 Lapse Tracking 逻辑
- 提供统计信息
- 让 Provider 代码更简洁

## 测试

运行测试：
```bash
pnpm test SessionManager
```

测试覆盖：
- ✅ 基本操作（加载、获取、移除、清空）
- ✅ 旋转操作（重新插入、保持排序）
- ✅ Lapse Tracking（失败次数追踪、优先级排序）
- ✅ 统计信息（总数、平均值、最大值）
- ✅ 查找操作

## 未来改进

1. **支持更多排序策略**
   - 按难度排序
   - 按复习次数排序
   - 自定义排序函数

2. **支持批量操作**
   - 批量移除
   - 批量旋转

3. **支持持久化**
   - 保存会话状态
   - 恢复会话状态

4. **支持更多统计**
   - 复习时间统计
   - 成功率统计
   - 学习进度统计
