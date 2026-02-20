# Queue Manager DDD 重构

## 问题描述

所有队列报错：`this.manager.getCards is not a function`

```
plugin:siyuan-plugin-siyuanmemo:89742 [SiYuanMemo][SRSBrowser] Failed to refresh queue counts: 
TypeError: this.manager.getCards is not a function
    at RetrievalPracticeQueue.getCards (plugin:siyuan-plugin-siyuanmemo:10503:15)
    at QueueFactory.createQueue (plugin:siyuan-plugin-siyuanmemo:10477:27)
    at _UnifiedDataSourceManager.getQueue (plugin:siyuan-plugin-siyuanmemo:12400:30)
```

## 根本原因分析

### 架构问题

**问题根源**：QueueFactory（基础设施层）试图创建需要 UnifiedDataSourceManager（应用层）的队列，违反了 DDD 分层原则。

```
❌ 旧架构（违反 DDD 分层）：
┌─────────────────────────────────────┐
│   Application Layer                 │
│   - UnifiedDataSourceManager        │
│     └─ queueFactory.getQueue()      │  ⬇️ 依赖基础设施层
└─────────────────────────────────────┘
           ⬇️
┌─────────────────────────────────────┐
│   Infrastructure Layer              │
│   - QueueFactory                    │
│     └─ new Queue(queuePersistence)  │  ⬆️ 需要应用层的 manager
└─────────────────────────────────────┘
           ⬆️ 循环依赖！
┌─────────────────────────────────────┐
│   Domain Layer                      │
│   - BaseReviewQueue                 │
│     constructor(manager, ...)       │  需要 UnifiedDataSourceManager
└─────────────────────────────────────┘
```

### 具体错误

1. **QueueFactory 只传递 `queuePersistence`**：
   ```typescript
   // QueueFactory.createQueue()
   return new RetrievalPracticeQueue(this.queuePersistence);
   ```

2. **但队列构造函数需要 `manager` 作为第一个参数**：
   ```typescript
   // BaseReviewQueue.constructor()
   constructor(manager: UnifiedDataSourceManager, type: QueueType) {
       this.manager = manager;  // ❌ manager 是 undefined
   }
   ```

3. **导致 `this.manager.getCards()` 失败**：
   ```typescript
   // RetrievalPracticeQueue.getCards()
   const dueCards = await this.manager.getCards({...});
   // ❌ TypeError: this.manager.getCards is not a function
   ```

## 解决方案

### 方案选择

考虑了 3 种方案：

1. ❌ **修改 QueueFactory 传递 manager**：仍然违反 DDD 分层
2. ❌ **修改队列构造函数不需要 manager**：破坏队列功能
3. ✅ **UnifiedDataSourceManager 直接创建队列**：符合 DDD 架构

### 新架构（符合 DDD 分层）

```
✅ 新架构（符合 DDD 分层）：
┌─────────────────────────────────────┐
│   Application Layer                 │
│   - UnifiedDataSourceManager        │
│     ├─ queueInstances: Map          │  直接管理队列
│     ├─ createQueue(type)            │  创建队列
│     └─ getQueue(type)               │  获取队列
└─────────────────────────────────────┘
           ⬇️ 只依赖领域层
┌─────────────────────────────────────┐
│   Domain Layer                      │
│   - BaseReviewQueue                 │
│     constructor(manager, ...)       │  接收 manager
│   - RetrievalPracticeQueue          │
│   - IncrementalLearningQueue        │
│   - FilterGroupQueue                │
│   - FinalDrillQueue                 │
│   - NeuralRoamQueue                 │
└─────────────────────────────────────┘
           ⬇️ 依赖基础设施层
┌─────────────────────────────────────┐
│   Infrastructure Layer              │
│   - QueuePersistenceService         │  只负责持久化
│   - QueueFactory (DEPRECATED)       │  已废弃
└─────────────────────────────────────┘
```

### 实现细节

#### 1. UnifiedDataSourceManager 改造

**移除**：
- `queueFactory: QueueFactory`
- `leechQueue: IReviewQueue`

**新增**：
- `queueInstances: Map<QueueType, IReviewQueue>` - 队列缓存
- `createQueue(type: QueueType): IReviewQueue` - 创建队列的私有方法
- `invalidateQueue(type: QueueType): void` - 使队列缓存失效
- `invalidateAllQueues(): void` - 使所有队列缓存失效

**修改**：
```typescript
// 旧代码
public getQueue(type: QueueType): IReviewQueue {
    if (!this.queueFactory) {
        throw new Error('QueueFactory not initialized');
    }
    return this.queueFactory.getQueue(type);
}

// 新代码
public getQueue(type: QueueType): IReviewQueue {
    // 检查缓存
    if (this.queueInstances.has(type)) {
        return this.queueInstances.get(type)!;
    }
    
    // 创建新队列实例
    const queue = this.createQueue(type);
    this.queueInstances.set(type, queue);
    
    return queue;
}

private createQueue(type: QueueType): IReviewQueue {
    switch (type) {
        case QueueType.RetrievalPractice:
            return new RetrievalPracticeQueue(this);  // ✅ 传递 this
        
        case QueueType.FinalDrill:
            return new FinalDrillQueue(this, this.queuePersistence);
        
        // ... 其他队列
    }
}
```

#### 2. QueueFactory 废弃

标记为 `@deprecated`，添加废弃说明：

```typescript
/**
 * ⚠️ DEPRECATED: 此类已废弃，不再使用
 * 
 * 原因：违反 DDD 分层原则
 * - QueueFactory 位于基础设施层
 * - 但它试图创建需要应用层服务的队列
 * - 这导致基础设施层依赖应用层
 * 
 * 新架构：
 * - UnifiedDataSourceManager 直接创建和管理队列
 * 
 * @deprecated 使用 UnifiedDataSourceManager.getQueue() 代替
 */
export class QueueFactory { ... }
```

## DDD 架构原则

### 分层依赖规则

```
Presentation Layer (UI)
    ⬇️ 只能依赖应用层
Application Layer (Services, Use Cases)
    ⬇️ 只能依赖领域层
Domain Layer (Entities, Value Objects, Domain Services)
    ⬇️ 只能依赖基础设施层接口
Infrastructure Layer (Repositories, External Services)
    ❌ 不能依赖应用层
```

### 本次重构的改进

1. **消除循环依赖**：
   - 旧架构：Application → Infrastructure → Domain → Application（循环）
   - 新架构：Application → Domain → Infrastructure（单向）

2. **职责清晰**：
   - UnifiedDataSourceManager（应用层）：负责队列访问和生命周期管理
   - QueuePersistenceService（基础设施层）：只负责数据持久化
   - BaseReviewQueue（领域层）：只负责队列业务逻辑

3. **符合 DDD 原则**：
   - 应用层服务协调领域对象
   - 领域对象不依赖应用层
   - 基础设施层只提供技术支持

## 测试验证

### 验证点

1. ✅ 所有队列类型都能正常创建
2. ✅ `this.manager.getCards()` 正常工作
3. ✅ 队列缓存机制正常
4. ✅ 队列失效机制正常
5. ✅ LeechQueue（旧架构）仍然可用

### 测试命令

```bash
# 编译检查
npm run build

# 运行测试
npm test

# 手动测试
# 1. 打开 SRS 浏览器
# 2. 切换不同队列类型
# 3. 检查队列统计是否正确
# 4. 执行卡片复习
```

## 影响范围

### 修改的文件

1. `src/application/services/UnifiedDataSourceManager.ts`
   - 移除 QueueFactory 依赖
   - 添加队列创建逻辑
   - 添加队列缓存管理

2. `src/core/queue/factories/QueueFactory.ts`
   - 标记为 `@deprecated`
   - 添加废弃说明

### 不需要修改的文件

1. `src/application/ApplicationContext.ts`
   - 已经通过 UnifiedDataSourceManager 访问队列
   - 不直接使用 QueueFactory

2. 所有队列类（`RetrievalPracticeQueue` 等）
   - 构造函数签名不变
   - 业务逻辑不变

## 总结

### 问题根源

QueueFactory（基础设施层）试图创建需要 UnifiedDataSourceManager（应用层）的队列，违反了 DDD 分层原则，导致循环依赖和初始化失败。

### 解决方案

UnifiedDataSourceManager（应用层）直接创建和管理队列，符合 DDD 架构原则：
- 应用层协调领域对象
- 领域对象不依赖应用层
- 基础设施层只提供技术支持

### DDD 收益

1. **架构清晰**：分层依赖单向，无循环依赖
2. **职责明确**：每层只负责自己的职责
3. **易于维护**：符合 DDD 原则，便于理解和扩展
4. **根本修复**：从架构层面解决问题，不是临时方案

## 相关文档

- [DDD 架构设计](../ddd-refactoring/design.md)
- [队列初始化重构](./queue-initialization-ddd-refactoring.md)
- [初始化顺序修复](./initialization-order-fix.md)
