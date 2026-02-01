# ADR-001: Trait 模式用于队列能力扩展

## 状态

已接受

## 背景

在设计队列系统时，我们面临一个关键问题：如何为不同的队列提供不同的可选功能（如插入、删除、优先级管理等），同时避免复杂的继承层次结构？

### 问题

1. **功能组合爆炸**：如果使用传统继承，每种功能组合都需要一个新类
   - 可插入队列（MutableQueue）
   - 可删除队列（RemovableQueue）
   - 可插入且可删除队列（MutableRemovableQueue）
   - 可插入、可删除且可优先级管理队列（MutableRemovablePrioritizableQueue）
   - ...

2. **类型安全**：需要在编译时确保队列实现了声称支持的功能

3. **运行时发现**：消费者需要能够在运行时检查队列是否支持某个功能

4. **单一职责**：每个功能应该独立定义，便于理解和维护

## 决策

我们决定采用 **Trait 模式**来解决这个问题。

### 核心设计

1. **定义 Trait 接口**：每个 Trait 是一个独立的接口，定义一组相关的方法
   ```typescript
   interface IMutableTrait<TItem> extends IQueueTrait {
     id: 'mutable';
     insertAt(items: TItem[], index: number): Promise<void>;
   }
   ```

2. **队列实现 Trait**：队列类可以实现任意数量的 Trait
   ```typescript
   class MyQueue implements IQueueStrategy<T>, IMutableTrait<T>, IRemovableTrait<T> {
     // 实现所有接口的方法
   }
   ```

3. **运行时访问**：通过 `getTrait(id)` 方法动态获取 Trait
   ```typescript
   const mutableTrait = queue.getTrait?.('mutable') as IMutableTrait<T>;
   if (mutableTrait) {
     await mutableTrait.insertAt([item], 0);
   }
   ```

### 已实现的 Trait

1. **IMutableTrait** - 插入能力
   - `insertAt(items, index)` - 在指定位置插入项目

2. **IRemovableTrait** - 删除能力
   - `removeItems(items)` - 删除指定项目

3. **IPrioritizableTrait** - 优先级管理
   - `setPriority(item, priority)` - 设置项目优先级

4. **IInterceptiveTrait** - 预处理钩子
   - `beforeNext(context)` - 在返回项目前拦截和修改

5. **IAutoSortableTrait** - 自动排序
   - `sort()` - 重新排序队列

## 后果

### 正面影响

1. **灵活性**
   - 队列可以自由组合任意数量的 Trait
   - 不需要为每种组合创建新类
   - 易于添加新的 Trait 而不影响现有代码

2. **类型安全**
   - TypeScript 在编译时验证 Trait 实现
   - IDE 提供完整的类型提示和自动补全
   - 防止运行时类型错误

3. **可发现性**
   - 消费者可以在运行时检查队列支持哪些功能
   - 代码可以优雅地处理不支持的功能
   - 便于调试和测试

4. **单一职责**
   - 每个 Trait 专注于一个功能
   - 代码更易理解和维护
   - 便于单独测试每个 Trait

5. **向后兼容**
   - 添加新 Trait 不会破坏现有队列
   - 旧代码可以继续工作
   - 渐进式采用新功能

### 负面影响

1. **运行时检查开销**
   - 需要在运行时检查 Trait 是否存在
   - 相比直接方法调用有轻微性能开销
   - **缓解措施**：开销极小（仅一次类型检查），可以忽略

2. **学习曲线**
   - 开发者需要理解 Trait 模式
   - 需要知道如何使用 `getTrait()` 方法
   - **缓解措施**：提供详细文档和示例代码

3. **类型转换**
   - 需要手动将 `getTrait()` 返回值转换为具体 Trait 类型
   - 代码略显冗长
   - **缓解措施**：可以创建辅助函数简化类型转换

### 风险

1. **Trait ID 冲突**
   - 如果两个 Trait 使用相同的 ID 会导致冲突
   - **缓解措施**：使用 TypeScript 字面量类型确保 ID 唯一性

2. **忘记实现 getTrait()**
   - 队列可能忘记实现 `getTrait()` 方法
   - **缓解措施**：在基类中提供默认实现

## 替代方案

### 方案 A: 传统继承

```typescript
class Queue { }
class MutableQueue extends Queue { }
class RemovableQueue extends Queue { }
class MutableRemovableQueue extends Queue { }
// ... 组合爆炸
```

**优点**:
- 简单直观
- 不需要运行时检查
- TypeScript 原生支持

**缺点**:
- 组合爆炸：N 个功能需要 2^N 个类
- 难以维护
- 代码重复

**为什么没有选择**: 组合爆炸问题无法接受，维护成本太高

### 方案 B: 组合模式

```typescript
class Queue {
  mutable?: MutableCapability;
  removable?: RemovableCapability;
}

// 使用
queue.mutable?.insertAt([item], 0);
```

**优点**:
- 清晰的能力分离
- 易于理解
- 不需要继承

**缺点**:
- 需要更多样板代码
- 每个能力需要单独的对象
- 初始化更复杂
- API 不够简洁

**为什么没有选择**: API 不够简洁，样板代码过多

### 方案 C: Mixin 模式

```typescript
function Mutable<T extends Constructor>(Base: T) {
  return class extends Base {
    insertAt(items: any[], index: number) { }
  };
}

class MyQueue extends Mutable(Removable(Queue)) { }
```

**优点**:
- 可以组合多个功能
- TypeScript 支持
- 不需要运行时检查

**缺点**:
- 类型推导复杂
- 难以调试
- IDE 支持不佳
- 运行时性能开销

**为什么没有选择**: TypeScript 的 Mixin 支持不够成熟，类型推导困难

## 实现示例

### 定义 Trait

```typescript
// src/core/queue/abstraction/traits.ts
export interface IMutableTrait<TItem> extends IQueueTrait {
  id: 'mutable';
  insertAt(items: TItem[], index: number): Promise<void>;
}
```

### 实现 Trait

```typescript
// src/core/queue/strategies/RetrievalPracticeQueue.ts
export class RetrievalPracticeQueue 
  implements IQueueStrategy<ReviewCard>, IMutableTrait<ReviewCard> {
  
  // IQueueStrategy 方法
  async next(): Promise<ReviewCard | null> { /* ... */ }
  
  // IMutableTrait 方法
  async insertAt(items: ReviewCard[], index: number): Promise<void> {
    // 实现插入逻辑
  }
  
  // Trait 访问
  getTrait(id: string): IQueueTrait | undefined {
    if (id === 'mutable') return this as IMutableTrait<ReviewCard>;
    return undefined;
  }
}
```

### 使用 Trait

```typescript
// src/ui/review/v2/providers/RetrievalPracticeProvider.ts
async function addCards(queue: IQueueStrategy<ReviewCard>, cards: ReviewCard[]) {
  const mutableTrait = queue.getTrait?.('mutable') as IMutableTrait<ReviewCard>;
  
  if (!mutableTrait) {
    throw new Error('Queue does not support insertion');
  }
  
  await mutableTrait.insertAt(cards, 0);
}
```

## 参考资料

- [Trait Pattern 文档](../../src/core/queue/abstraction/TRAIT_PATTERN.md)
- [Trait Pattern (Wikipedia)](https://en.wikipedia.org/wiki/Trait_(computer_programming))
- [Composition over Inheritance](https://en.wikipedia.org/wiki/Composition_over_inheritance)
- [TypeScript Mixins](https://www.typescriptlang.org/docs/handbook/mixins.html)

## 元数据

- **作者**: Kiro AI Assistant
- **日期**: 2026-02-02
- **审阅者**: Architecture Team
- **相关 ADR**: ADR-002 (观察者模式)
- **相关需求**: 需求 15.1, 15.2, 15.4
