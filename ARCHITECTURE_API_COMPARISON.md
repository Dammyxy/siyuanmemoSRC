# 新旧架构 API 对比分析

## 问题：新架构是否设计错误？

**答案：不是设计错误，而是设计理念的根本性转变。**

## 核心差异

### 旧架构：队列中心模式（Queue-Centric）

旧架构的队列是**自包含的**，负责：
- 数据获取（从 Riff API）
- 数据存储（本地持久化）
- 复习逻辑（评分处理）
- 统计信息（队列状态）
- UI 配置（界面设置）

### 新架构：数据源中心模式（Data-Source-Centric）

新架构的队列是**轻量级的**，只负责：
- 队列逻辑（哪些卡片应该在队列中）
- 复习行为（评分后如何处理）

数据管理由 `UnifiedDataSourceManager` 统一负责。

## 详细 API 对比

### 1. 实例化方式

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **创建方式** | `new IncrementalLearningQueue(options)` | `manager.getQueue(QueueType.IncrementalLearning)` |
| **依赖注入** | 需要传入 storage, scheduler, schedulerRouter | 只需要 UnifiedDataSourceManager |
| **单例模式** | 否，每次 new 创建新实例 | 是，通过 manager 获取同一实例 |
| **设计理念** | 队列自己管理所有依赖 | 依赖由中央管理器统一管理 |

**评价**：✅ 新架构更好
- 单例模式避免重复创建
- 依赖注入更简洁
- 符合单一职责原则

### 2. 数据获取

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **方法名** | `getAllItems()` / `getAllCards()` | `getCards()` |
| **返回类型** | `QueueItem[]` | `FSRSCard[]` |
| **数据来源** | 队列自己从 Riff API 获取 | 通过 manager 从统一数据源获取 |
| **数据格式** | QueueItem（Riff 格式） | FSRSCard（标准格式） |

**评价**：✅ 新架构更好
- 统一使用 FSRSCard 格式
- 数据来源集中管理
- 避免格式混乱

### 3. 复习处理

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **方法名** | `onFeedback(card, { action, rating })` | `handleReview(cardId, rating)` |
| **参数** | 需要完整的 card 对象 + action 对象 | 只需要 cardId + rating |
| **职责** | 处理评分 + 更新 Riff + 更新本地 | 只处理队列逻辑 |
| **数据更新** | 队列自己调用 Riff API | 通过 manager 更新数据 |

**评价**：✅ 新架构更好
- API 更简洁
- 职责更清晰
- 数据更新统一管理

### 4. 统计信息

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **方法** | `getStats()` | 无此方法 |
| **返回值** | `{ total, remaining, new, reviewed, learning }` | N/A |
| **实现位置** | 队列内部 | 需要在 UI 层计算 |

**评价**：⚠️ 这是一个权衡
- 旧架构：方便，但队列职责过重
- 新架构：需要 UI 层自己计算，但职责更清晰

### 5. 队列操作

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **添加卡片** | `addItems(items[])` | `addCard(card)` |
| **移除卡片** | `remove(items[])` (通过 trait) | `removeCard(cardId)` |
| **重排序** | `reorder(items[])` | `reorder(cards[])` (继承自 BaseReviewQueue) |
| **跳过卡片** | `onFeedback(card, { action: 'skip' })` | 无此方法 |

**评价**：⚠️ 新架构缺少一些便利方法
- `skip()` 方法缺失
- 批量操作支持较弱

### 6. UI 配置

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **方法** | `getUIConfig()` | 无此方法 |
| **返回值** | `{ statsType, showRatingButtons, allowSkip }` | N/A |
| **实现位置** | 队列内部 | 需要在 UI 层硬编码 |

**评价**：⚠️ 新架构缺失
- UI 配置应该由队列提供
- 现在需要 UI 层自己知道每个队列的配置

### 7. Trait 系统

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **Prioritizable** | `getPrioritizableTrait()` | 无 |
| **Mutable** | `getMutableTrait()` | 无 |
| **Removable** | `getRemovableTrait()` | 无 |
| **设计理念** | 通过 trait 扩展队列能力 | 直接在队列类中实现 |

**评价**：⚠️ 新架构简化了，但失去了灵活性
- Trait 系统提供了更好的扩展性
- 新架构更直接，但不够灵活

## 设计理念对比

### 旧架构：自包含队列

```
┌─────────────────────────────────┐
│   IncrementalLearningQueue      │
│                                 │
│  ┌──────────────────────────┐  │
│  │ 数据获取 (Riff API)      │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ 数据存储 (LocalStorage)  │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ 复习逻辑                 │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ 统计信息                 │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ UI 配置                  │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

**优点**：
- 功能完整，开箱即用
- 不需要外部依赖
- 方便独立测试

**缺点**：
- 职责过重，违反单一职责原则
- 数据来源分散，难以统一管理
- 容易产生数据不一致

### 新架构：分层职责

```
┌─────────────────────────────────┐
│  UnifiedDataSourceManager       │
│  ┌──────────────────────────┐  │
│  │ 数据获取                 │  │
│  │ 数据存储                 │  │
│  │ 数据同步                 │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│   IncrementalLearningQueue      │
│  ┌──────────────────────────┐  │
│  │ 队列逻辑                 │  │
│  │ 复习行为                 │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│   UI Layer (Provider/Adapter)   │
│  ┌──────────────────────────┐  │
│  │ 统计信息计算             │  │
│  │ UI 配置                  │  │
│  │ 数据格式转换             │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

**优点**：
- 职责清晰，符合单一职责原则
- 数据来源统一，易于管理
- 避免数据不一致

**缺点**：
- 需要多层协作
- API 不够完整
- 使用起来不够方便

## 缺失的功能

### 1. 统计信息 (`getStats()`)

**旧架构**：
```typescript
const stats = await queue.getStats();
// { total: 10, remaining: 5, new: 2, reviewed: 3, learning: 1 }
```

**新架构**：
```typescript
// 需要自己计算
const cards = await queue.getCards();
const stats = {
  total: cards.length,
  due: cards.filter(c => c.due <= Date.now()).length,
  new: cards.filter(c => c.reps === 0).length,
  // ...
};
```

**建议**：✅ 应该在 `BaseReviewQueue` 中添加 `getStats()` 方法

### 2. 跳过功能 (`skip()`)

**旧架构**：
```typescript
await queue.onFeedback(card, { action: 'skip' });
```

**新架构**：
```typescript
// 无此方法，需要在 Provider 层实现
```

**建议**：✅ 应该在 `IReviewQueue` 接口中添加 `skip(cardId)` 方法

### 3. UI 配置 (`getUIConfig()`)

**旧架构**：
```typescript
const config = queue.getUIConfig(currentItem);
// { statsType: 'riff-counts', showRatingButtons: true, allowSkip: true }
```

**新架构**：
```typescript
// 无此方法，需要 UI 层硬编码
```

**建议**：✅ 应该在 `IReviewQueue` 接口中添加 `getUIConfig()` 方法

### 4. Trait 系统

**旧架构**：
```typescript
const prioritizable = queue.getPrioritizableTrait();
if (prioritizable) {
  await prioritizable.setPriority(item, 80);
}
```

**新架构**：
```typescript
// 无 trait 系统，直接调用方法
// 但缺少能力检测机制
```

**建议**：⚠️ Trait 系统可以保留，用于能力检测

## 建议的改进

### 1. 在 `IReviewQueue` 接口中添加缺失的方法

```typescript
interface IReviewQueue {
  // 现有方法
  getCards(): Promise<FSRSCard[]>;
  addCard(card: FSRSCard | QueueItem | string): Promise<void>;
  removeCard(cardId: string): Promise<void>;
  handleReview(cardId: string, rating: number): Promise<void>;
  
  // 🆕 建议添加
  getStats(): Promise<QueueStats>;
  skip(cardId: string): Promise<void>;
  getUIConfig(): QueueUIConfig;
}

interface QueueStats {
  total: number;
  due: number;
  new: number;
  reviewed: number;
  learning: number;
}

interface QueueUIConfig {
  statsType: 'riff-counts' | 'fsrs-stats';
  showRatingButtons: boolean;
  allowSkip: boolean;
}
```

### 2. 在 `BaseReviewQueue` 中提供默认实现

```typescript
abstract class BaseReviewQueue implements IReviewQueue {
  // 现有方法...
  
  // 🆕 默认实现
  public async getStats(): Promise<QueueStats> {
    const cards = await this.getCards();
    const now = Date.now();
    
    return {
      total: cards.length,
      due: cards.filter(c => c.due <= now).length,
      new: cards.filter(c => c.reps === 0).length,
      reviewed: 0, // 子类可以覆盖
      learning: cards.filter(c => c.state === 1).length,
    };
  }
  
  public async skip(cardId: string): Promise<void> {
    // 默认实现：移到队列末尾
    const index = this.cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
      const card = this.cards.splice(index, 1)[0];
      this.cards.push(card);
      this.notifyObservers();
    }
  }
  
  public getUIConfig(): QueueUIConfig {
    // 默认配置，子类可以覆盖
    return {
      statsType: 'fsrs-stats',
      showRatingButtons: true,
      allowSkip: true,
    };
  }
}
```

### 3. 子类覆盖特定行为

```typescript
class IncrementalLearningQueue extends BaseReviewQueue {
  // 覆盖 UI 配置
  public getUIConfig(): QueueUIConfig {
    return {
      statsType: 'riff-counts',
      showRatingButtons: true,
      allowSkip: true,
    };
  }
  
  // 覆盖统计信息（如果需要特殊逻辑）
  public async getStats(): Promise<QueueStats> {
    const baseStats = await super.getStats();
    // 添加特定于渐进学习的统计
    return {
      ...baseStats,
      // 自定义字段
    };
  }
}
```

## 总结

### 新架构不是设计错误，而是设计权衡

**优点**：
- ✅ 职责清晰，符合单一职责原则
- ✅ 数据来源统一，避免数据污染
- ✅ 依赖注入简洁，易于测试
- ✅ 单例模式，避免重复创建

**缺点**：
- ❌ API 不够完整，缺少便利方法
- ❌ 使用起来不够方便，需要多层协作
- ❌ 缺少能力检测机制（trait 系统）

### 建议的改进方向

1. **补充缺失的方法**：`getStats()`, `skip()`, `getUIConfig()`
2. **在基类中提供默认实现**：减少子类的重复代码
3. **保持设计理念**：数据管理由 manager 负责，队列只负责队列逻辑
4. **考虑添加能力检测**：类似 trait 系统，但更轻量级

### 当前的解决方案

在迁移过程中，我们在 `IncrementalLearningProvider` 层实现了缺失的功能：
- `getStats()` - 基于本地数据计算
- `skip()` - 本地移到末尾
- UI 配置 - 硬编码在 Provider 中

这是一个**临时方案**，长期来看应该将这些功能下沉到队列层。

## 行动建议

1. **短期**：保持当前实现，在 Provider 层补充功能
2. **中期**：在 `BaseReviewQueue` 中添加 `getStats()`, `skip()`, `getUIConfig()` 方法
3. **长期**：考虑重新设计接口，平衡职责分离和使用便利性
