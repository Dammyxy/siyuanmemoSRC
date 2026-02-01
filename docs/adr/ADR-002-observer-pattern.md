# ADR-002: 观察者模式用于缓存失效

## 状态

已接受

## 背景

在队列系统中，Sequencer 组件会缓存从 DataSource 获取的数据以提高性能。但是当 DataSource 的数据发生变化时（如删除或添加卡片），Sequencer 的缓存会变得过时，导致用户看到错误的数据。

### 问题

1. **手动缓存失效**：需要在每次数据变化后手动调用 `sequencer.reset()`
   ```typescript
   await dataSource.remove([card]);
   sequencer.reset(); // 容易忘记！
   ```

2. **容易出错**：开发者可能忘记调用 `reset()`，导致缓存不一致

3. **紧耦合**：调用方需要知道 Sequencer 的存在和缓存机制

4. **多个 Sequencer**：如果有多个 Sequencer 观察同一个 DataSource，需要手动重置所有 Sequencer

5. **代码分散**：缓存失效逻辑分散在多个地方，难以维护

### 具体案例

在 `BaseCompositeQueue.rotateToEnd()` 方法中：

```typescript
async rotateToEnd(item: TItem): Promise<void> {
  await this.dataSource.remove([item]);
  await this.dataSource.add([item]);
  
  // ❌ 问题：容易忘记重置
  // ❌ 问题：如果有多个 sequencer 怎么办？
  this.sequencer.reset();
}
```

## 决策

我们决定采用 **观察者模式（Observer Pattern）**来自动化缓存失效过程。

### 核心设计

1. **定义观察者接口**
   ```typescript
   interface IDataSourceObserver {
     onDataChanged(): void;
   }
   ```

2. **定义可观察数据源接口**
   ```typescript
   interface IObservableDataSource<TItem> extends IDataSource<TItem> {
     addObserver(observer: IDataSourceObserver): void;
     removeObserver(observer: IDataSourceObserver): void;
   }
   ```

3. **Sequencer 实现观察者接口**
   ```typescript
   class PrioritySequencer implements ISequencer, IDataSourceObserver {
     private loaded = false;
     
     onDataChanged(): void {
       this.loaded = false; // 自动失效缓存
       this.items.length = 0;
     }
   }
   ```

4. **DataSource 在数据变化时通知观察者**
   ```typescript
   class RiffDataSource implements IObservableDataSource {
     async remove(items: TItem[]): Promise<number> {
       const count = await this.doRemove(items);
       this.notifyObservers(); // 自动通知
       return count;
     }
   }
   ```

### 工作流程

```
┌─────────────┐
│   Queue     │
└──────┬──────┘
       │ 1. remove(card)
       ▼
┌─────────────┐
│ DataSource  │
└──────┬──────┘
       │ 2. notifyObservers()
       ▼
┌─────────────┐
│  Sequencer  │ ◄─── 3. onDataChanged()
└─────────────┘      4. loaded = false
```

## 后果

### 正面影响

1. **自动化**
   - 缓存失效完全自动化
   - 不需要手动调用 `reset()`
   - 减少人为错误

2. **解耦**
   - DataSource 不需要知道具体的 Sequencer 实现
   - Sequencer 不需要暴露 `reset()` 方法
   - 调用方不需要管理缓存失效

3. **可扩展**
   - 支持多个观察者
   - 可以添加新的观察者类型
   - 观察者之间相互独立

4. **错误隔离**
   - 一个观察者失败不影响其他观察者
   - 通知过程有错误处理
   - 系统更加健壮

5. **代码简化**
   - 消除了所有手动 `reset()` 调用
   - 代码更清晰易懂
   - 减少了样板代码

### 负面影响

1. **间接性**
   - 缓存失效不再显式可见
   - 需要理解观察者模式
   - 调试时需要追踪通知链

   **缓解措施**：
   - 添加详细的日志记录
   - 在文档中清楚说明机制
   - 提供调试工具

2. **注册管理**
   - 需要在初始化时注册观察者
   - 需要在销毁时取消注册（防止内存泄漏）
   - 增加了初始化复杂度

   **缓解措施**：
   - 在构造函数中自动注册
   - 提供清晰的生命周期管理
   - 添加注册检查

3. **通知开销**
   - 每次数据变化都会通知所有观察者
   - 可能导致不必要的缓存失效
   - 轻微的性能开销

   **缓解措施**：
   - 观察者数量通常很少（1-3个）
   - 通知操作非常快（仅设置标志）
   - 性能影响可以忽略

### 风险

1. **忘记注册观察者**
   - 如果忘记注册，缓存不会失效
   - **缓解措施**：在基类构造函数中自动注册

2. **循环通知**
   - 观察者在 `onDataChanged()` 中修改数据可能导致循环
   - **缓解措施**：观察者只应失效缓存，不应修改数据

3. **内存泄漏**
   - 未取消注册的观察者会导致内存泄漏
   - **缓解措施**：使用弱引用或确保正确的生命周期管理

## 替代方案

### 方案 A: 手动缓存失效（当前方案）

```typescript
async rotateToEnd(item: TItem): Promise<void> {
  await this.dataSource.remove([item]);
  await this.dataSource.add([item]);
  this.sequencer.reset(); // 手动重置
}
```

**优点**:
- 简单直接
- 显式可见
- 不需要额外的模式

**缺点**:
- 容易忘记
- 代码分散
- 难以维护
- 不支持多个 Sequencer

**为什么没有选择**: 容易出错，维护成本高

### 方案 B: 事件总线

```typescript
eventBus.on('data-changed', () => {
  sequencer.reset();
});

await dataSource.remove([item]);
eventBus.emit('data-changed');
```

**优点**:
- 完全解耦
- 灵活性高
- 支持多个监听器

**缺点**:
- 需要全局事件总线
- 事件名称是字符串（类型不安全）
- 难以追踪事件流
- 过度设计

**为什么没有选择**: 对于这个简单场景过于复杂

### 方案 C: 回调函数

```typescript
class DataSource {
  constructor(private onDataChanged: () => void) {}
  
  async remove(items: TItem[]): Promise<number> {
    const count = await this.doRemove(items);
    this.onDataChanged(); // 调用回调
    return count;
  }
}
```

**优点**:
- 简单直接
- 类型安全
- 不需要接口

**缺点**:
- 只支持一个回调
- 不支持多个观察者
- 回调管理复杂

**为什么没有选择**: 不支持多个观察者

### 方案 D: 响应式编程（RxJS）

```typescript
const dataChanges$ = new Subject<void>();

dataChanges$.subscribe(() => {
  sequencer.reset();
});

await dataSource.remove([item]);
dataChanges$.next();
```

**优点**:
- 强大的响应式能力
- 支持复杂的数据流
- 丰富的操作符

**缺点**:
- 需要引入 RxJS 库
- 学习曲线陡峭
- 对于简单场景过于复杂
- 增加包大小

**为什么没有选择**: 过度设计，不需要响应式编程的复杂性

## 实现示例

### 定义接口

```typescript
// src/core/queue/abstraction/types.ts
export interface IDataSourceObserver {
  onDataChanged(): void;
}

export interface IObservableDataSource<TItem> extends IDataSource<TItem> {
  addObserver(observer: IDataSourceObserver): void;
  removeObserver(observer: IDataSourceObserver): void;
}
```

### 实现 ObservableDataSource

```typescript
// src/core/queue/datasource/ObservableDataSource.ts
export abstract class ObservableDataSource<TItem> implements IObservableDataSource<TItem> {
  private observers: IDataSourceObserver[] = [];
  
  addObserver(observer: IDataSourceObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }
  
  removeObserver(observer: IDataSourceObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }
  
  protected notifyObservers(): void {
    for (const observer of this.observers) {
      try {
        observer.onDataChanged();
      } catch (error) {
        console.error('Observer notification failed:', error);
      }
    }
  }
  
  async remove(items: TItem[]): Promise<Result<number>> {
    const result = await this.doRemove(items);
    if (result.ok && result.value > 0) {
      this.notifyObservers();
    }
    return result;
  }
  
  protected abstract doRemove(items: TItem[]): Promise<Result<number>>;
}
```

### Sequencer 实现观察者

```typescript
// src/core/queue/sequencers/PrioritySequencer.ts
export class PrioritySequencer<TItem> implements ISequencer<TItem>, IDataSourceObserver {
  private loaded = false;
  private items: TItem[] = [];
  
  onDataChanged(): void {
    console.log('[PrioritySequencer] Cache invalidated');
    this.loaded = false;
    this.items.length = 0;
  }
  
  async next(): Promise<TItem | null> {
    if (!this.loaded) {
      this.loaded = true;
      const fetched = await this.fetchAll();
      this.items.push(...fetched);
    }
    return this.items.shift() || null;
  }
}
```

### 注册观察者

```typescript
// src/core/queue/composite/BaseCompositeQueue.ts
export class BaseCompositeQueue<TItem> {
  constructor(config: QueueConfig<TItem>) {
    this.dataSource = config.dataSource;
    this.sequencer = config.sequencer;
    
    // 自动注册观察者
    if (this.dataSource.addObserver) {
      this.dataSource.addObserver(this.sequencer);
    }
  }
  
  async rotateToEnd(item: TItem): Promise<void> {
    await this.dataSource.remove([item]);
    await this.dataSource.add([item]);
    // ✅ 不需要手动 reset()！
  }
}
```

## 测试验证

### 单元测试

```typescript
// src/core/queue/abstraction/__tests__/observer.test.ts
describe('Observer Pattern', () => {
  it('should notify observer when data changes', () => {
    const dataSource = new MockObservableDataSource();
    const observer = new MockObserver();
    
    dataSource.addObserver(observer);
    dataSource.remove([item]);
    
    expect(observer.notified).toBe(true);
  });
});
```

### 属性测试

```typescript
// src/core/queue/datasource/__tests__/ObservableDataSource.property.test.ts
it('Property 1: DataSource notifies all observers', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }),
      (observerCount) => {
        const dataSource = new MockObservableDataSource();
        const observers = Array.from({ length: observerCount }, () => new MockObserver());
        
        observers.forEach(o => dataSource.addObserver(o));
        dataSource.remove([item]);
        
        return observers.every(o => o.notified);
      }
    )
  );
});
```

## 参考资料

- [Observer Pattern 文档](../../src/core/queue/abstraction/OBSERVER_PATTERN.md)
- [Observer Pattern (Wikipedia)](https://en.wikipedia.org/wiki/Observer_pattern)
- [Design Patterns: Observer](https://refactoring.guru/design-patterns/observer)
- [ObservableDataSource 实现](../../src/core/queue/datasource/ObservableDataSource.ts)

## 元数据

- **作者**: Kiro AI Assistant
- **日期**: 2026-02-02
- **审阅者**: Architecture Team
- **相关 ADR**: ADR-001 (Trait 模式)
- **相关需求**: 需求 1.1, 1.2, 1.3, 1.4, 1.5
- **替代**: 无（这是新的决策）
