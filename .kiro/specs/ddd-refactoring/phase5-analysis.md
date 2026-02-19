# Phase 5 分析：统一数据源 DDD 化

> 分析时间：2026-02-19

## 🎯 目标

将 `UnifiedDataSourceManager` 和 `AdvancedDataRouter` 从直接访问 Storage 改为通过应用服务访问数据。

## 📊 当前架构

### 调用链
```
UnifiedDataSourceManager
    ↓
AdvancedDataRouter (IDataRouter)
    ↓
StorageManager (直接访问)
```

### 组件职责

#### UnifiedDataSourceManager
**位置：** `src/managers/UnifiedDataSourceManager.ts`

**职责：**
1. 单例管理器
2. 数据路由（通过 `AdvancedDataRouter`）
3. 观察者模式（注册、通知观察者）
4. 队列工厂（通过 `QueueFactory` 获取队列实例）
5. 数据访问代理（getCard, getCards, updateCard, deleteCard）

**问题：**
- 通过 `AdvancedDataRouter` 直接访问 `StorageManager`
- 没有使用应用服务层
- 混合了多种职责（路由、观察者、队列、数据访问）

#### AdvancedDataRouter
**位置：** `src/routers/AdvancedDataRouter.ts`

**职责：**
1. 实现 `IDataRouter` 接口
2. 从本地存储获取卡片数据
3. 更新和删除卡片
4. 同步到 Riff
5. 提供队列类型和上下文菜单选项

**问题：**
- 直接访问 `this.storage`（StorageManager）
- 包含业务逻辑（过滤、迁移、填充数据）
- 名称中的 "Advanced" 已过时（简单模式已移除）

## 🤔 DDD 化方案

### 方案 A：保守重构（推荐）

保留现有结构，引入应用服务作为中间层：

```
UnifiedDataSourceManager
    ↓
AdvancedDataRouter (IDataRouter)
    ↓
CardApplicationService (新增)
    ↓
QueryHandler / UseCase
    ↓
DomainService / Repository
    ↓
StorageManager
```

**优点：**
- 最小化改动
- 保持现有接口不变
- 逐步迁移

**缺点：**
- 增加了一层间接调用
- `AdvancedDataRouter` 的职责仍然不够清晰

### 方案 B：激进重构

完全重构，移除 Router 层：

```
UnifiedDataSourceManager
    ↓
CardApplicationService
    ↓
QueryHandler / UseCase
    ↓
DomainService / Repository
    ↓
StorageManager
```

**优点：**
- 架构更清晰
- 符合 DDD 分层

**缺点：**
- 改动较大
- 可能影响现有功能
- 需要更多测试

### 方案 C：重命名 + 重构（折中）

重命名 `AdvancedDataRouter` 为 `DataAccessFacade`，并引入应用服务：

```
UnifiedDataSourceManager
    ↓
DataAccessFacade (重命名自 AdvancedDataRouter)
    ↓
CardApplicationService
    ↓
QueryHandler / UseCase
    ↓
DomainService / Repository
    ↓
StorageManager
```

**优点：**
- 名称更准确（Facade 模式）
- 保持现有接口
- 引入应用服务层

**缺点：**
- 仍然有额外的 Facade 层

## 💡 推荐方案

**采用方案 A：保守重构**

理由：
1. 最小化风险
2. 可以逐步迁移
3. 保持现有功能稳定
4. 后续可以继续优化

## 📋 实施计划

### Task 27: 重构 UnifiedDataSourceManager

#### 27.1 分析职责 ✅
已完成上述分析

#### 27.2 引入 CardApplicationService
`AdvancedDataRouter` 改为使用 `CardApplicationService` 而不是直接访问 `StorageManager`

**改动：**
```typescript
// 之前
class AdvancedDataRouter {
  private storage: StorageManager;
  
  async getCard(cardId: string): Promise<FSRSCard> {
    return this.storage.getCard(cardId);
  }
}

// 之后
class AdvancedDataRouter {
  private cardService: CardApplicationService;
  
  async getCard(cardId: string): Promise<FSRSCard> {
    const result = await this.cardService.getCard(cardId);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.data;
  }
}
```

#### 27.3 更新 UnifiedDataSourceManager
无需改动，因为它通过 `AdvancedDataRouter` 访问数据

#### 27.4 编写单元测试
测试 `AdvancedDataRouter` 使用 `CardApplicationService` 的逻辑

#### 27.5 更新文档
更新架构文档

### Task 28: 重构队列系统

队列系统已经通过 `UnifiedDataSourceManager` 访问数据，无需额外改动。

## 🚧 注意事项

1. **CardApplicationService 还没有 getCard 方法**
   - 需要先扩展 `CardApplicationService` 添加查询方法
   - 或者创建新的 Query 和 QueryHandler

2. **Result 类型**
   - 需要确保 `CardApplicationService` 返回 `Result<T>` 类型
   - 或者使用异常处理

3. **向后兼容**
   - 保持 `IDataRouter` 接口不变
   - 确保现有调用方不受影响

## 🔗 相关文件

- `src/managers/UnifiedDataSourceManager.ts`
- `src/routers/AdvancedDataRouter.ts`
- `src/application/services/CardApplicationService.ts`
- `src/types/unified-data-source.ts`
