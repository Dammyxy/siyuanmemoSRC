# Phase 3: 移除全局状态 - 执行计划

**创建时间**: 2026-02-19
**预计完成**: 2-3 天

## 目标

移除 `window.siyuanMemoPlugin` 全局状态，使用依赖注入替代。

## 审计结果

### 需要移除的全局状态

1. **src/index.ts** (Line 145)
   ```typescript
   (window as any).siyuanMemoPlugin = this;
   ```

2. **src/core/card/quick-card/infrastructure/QuickCardRepository.ts** (Line 164)
   ```typescript
   const plugin = (window as any).siyuanMemoPlugin;
   ```

3. **src/application/adapters/UnifiedQueueStrategy.ts** (Line 488)
   ```typescript
   const plugin = (window as any).siyuanMemoPlugin;
   ```

### 不需要移除的全局状态

以下是思源笔记提供的全局对象，应该保留：
- `(window as any).siyuan` - 思源笔记核心对象
- `(window as any).Lute` - Markdown 解析器
- `(window as any).MathJax` - 数学公式渲染

## 执行步骤

### Step 1: 分析依赖关系

#### QuickCardRepository 的依赖
- 需要访问 `plugin.storage` 来获取卡片数据
- 解决方案：通过构造函数注入 `ICardStorage` 接口

#### UnifiedQueueStrategy 的依赖
- 需要访问 `plugin.schedulerRouter` 来获取调度器
- 解决方案：通过构造函数注入 `ISchedulerRouter` 接口

### Step 2: 定义接口

#### 2.1 定义 ICardStorage 接口

**文件**: `src/application/interfaces/ICardStorage.ts`

```typescript
/**
 * 卡片存储接口
 */
export interface ICardStorage {
  /**
   * 获取卡片
   */
  getCard(blockId: string): Promise<FSRSCard | null>;
  
  /**
   * 保存卡片
   */
  setCard(card: FSRSCard): Promise<void>;
  
  /**
   * 删除卡片
   */
  deleteCard(blockId: string): Promise<void>;
  
  /**
   * 获取所有卡片
   */
  getAllCards(): Promise<FSRSCard[]>;
}
```

#### 2.2 定义 ISchedulerRouter 接口

**文件**: `src/application/interfaces/ISchedulerRouter.ts`

```typescript
/**
 * 调度器路由接口
 */
export interface ISchedulerRouter {
  /**
   * 获取指定类型的调度器
   */
  getScheduler(type: string): any;
  
  /**
   * 获取所有调度器
   */
  getAllSchedulers(): Map<string, any>;
}
```

### Step 3: 更新 QuickCardRepository

**文件**: `src/core/card/quick-card/infrastructure/QuickCardRepository.ts`

**修改前**:
```typescript
async findByBlockId(blockId: string): Promise<QuickCard | null> {
  try {
    // 通过全局插件实例获取 storage
    const plugin = (window as any).siyuanMemoPlugin;
    if (!plugin?.storage) {
      return null;
    }
    // ...
  }
}
```

**修改后**:
```typescript
constructor(private cardStorage: ICardStorage) {}

async findByBlockId(blockId: string): Promise<QuickCard | null> {
  try {
    const fsrsCard = await this.cardStorage.getCard(blockId);
    if (!fsrsCard) {
      return null;
    }
    // ...
  }
}
```

### Step 4: 更新 UnifiedQueueStrategy

**文件**: `src/application/adapters/UnifiedQueueStrategy.ts`

**修改前**:
```typescript
// 从全局获取插件实例
const plugin = (window as any).siyuanMemoPlugin;
if (!plugin || !plugin.schedulerRouter) {
  console.warn('[SiYuanMemo][UnifiedQueueStrategy] ⚠️ Plugin or schedulerRouter not found');
  return null;
}
```

**修改后**:
```typescript
constructor(private schedulerRouter: ISchedulerRouter) {}

// 直接使用注入的 schedulerRouter
if (!this.schedulerRouter) {
  console.warn('[SiYuanMemo][UnifiedQueueStrategy] ⚠️ SchedulerRouter not found');
  return null;
}
```

### Step 5: 更新 ApplicationContext

**文件**: `src/application/ApplicationContext.ts`

添加新的服务注册：

```typescript
export class ApplicationContext {
  // 注册 CardStorage
  registerCardStorage(storage: ICardStorage): void {
    this.serviceContainer.set('cardStorage', storage);
  }
  
  getCardStorage(): ICardStorage {
    return this.getService<ICardStorage>('cardStorage');
  }
  
  // 注册 SchedulerRouter
  registerSchedulerRouter(router: ISchedulerRouter): void {
    this.serviceContainer.set('schedulerRouter', router);
  }
  
  getSchedulerRouter(): ISchedulerRouter {
    return this.getService<ISchedulerRouter>('schedulerRouter');
  }
}
```

### Step 6: 更新插件初始化

**文件**: `src/index.ts`

**修改前**:
```typescript
async onload() {
  // ...
  (window as any).siyuanMemoPlugin = this;
  console.log('[SiYuanMemo] Plugin loaded successfully');
}
```

**修改后**:
```typescript
async onload() {
  // ...
  
  // 注册服务到 ApplicationContext
  this.context.registerCardStorage(this.storage);
  this.context.registerSchedulerRouter(this.schedulerRouter);
  
  // ❌ 移除全局状态
  // (window as any).siyuanMemoPlugin = this;
  
  console.log('[SiYuanMemo] Plugin loaded successfully');
}
```

### Step 7: 更新工厂函数

所有创建 QuickCardRepository 和 UnifiedQueueStrategy 的地方都需要更新：

#### 7.1 更新 QuickCardRepository 创建

**位置**: 查找所有 `new QuickCardRepository()` 的地方

**修改**:
```typescript
// 修改前
const repository = new QuickCardRepository();

// 修改后
const cardStorage = context.getCardStorage();
const repository = new QuickCardRepository(cardStorage);
```

#### 7.2 更新 UnifiedQueueStrategy 创建

**位置**: 查找所有 `new UnifiedQueueStrategy()` 的地方

**修改**:
```typescript
// 修改前
const strategy = new UnifiedQueueStrategy();

// 修改后
const schedulerRouter = context.getSchedulerRouter();
const strategy = new UnifiedQueueStrategy(schedulerRouter);
```

## 验证清单

### 编译检查
- [ ] TypeScript 编译无错误
- [ ] 无 ESLint 警告

### 功能测试
- [ ] 快速卡片创建功能正常
- [ ] 卡片查询功能正常
- [ ] 队列策略功能正常
- [ ] 调度器路由功能正常

### 代码审查
- [ ] 无 `window.siyuanMemoPlugin` 引用
- [ ] 所有依赖通过构造函数注入
- [ ] 接口定义清晰
- [ ] 文档更新完整

## 风险评估

### 高风险
- **QuickCardRepository 依赖变更** - 可能影响快速卡片功能
  - 缓解措施：添加单元测试，确保功能不变

### 中风险
- **UnifiedQueueStrategy 依赖变更** - 可能影响队列功能
  - 缓解措施：集成测试验证

### 低风险
- **接口定义** - 新增接口，不影响现有代码
  - 缓解措施：遵循 DDD 最佳实践

## 成功标准

- ✅ 移除所有 `window.siyuanMemoPlugin` 引用
- ✅ 所有依赖通过依赖注入
- ✅ 编译无错误
- ✅ 功能测试通过
- ✅ 代码符合 DDD 原则

## 下一步

完成 Phase 3 后，进入 Phase 4: 服务层完全 DDD 化

---

**状态**: 🚀 准备开始
**优先级**: 高
**预计工作量**: 2-3 天
