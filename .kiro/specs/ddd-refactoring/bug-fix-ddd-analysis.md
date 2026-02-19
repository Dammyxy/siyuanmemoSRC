# Bug 修复的 DDD 符合性分析

## 修复概述

我们修复了两个主要问题：
1. `MenuManager.getDueCount()` 调用了不存在的 `scheduler.getScheduleInfo()` 方法
2. `reviewDialogManager` 和 `hybridSyncService` 没有在 plugin 实例上暴露

## DDD 符合性分析

### ✅ 符合 DDD 的方面

#### 1. 遵循依赖方向
- **修复前问题**：`MenuManager`（应用层）试图直接调用 `SchedulerRouter`（基础设施层）的不存在方法
- **修复后**：`MenuManager` 通过 `StorageManager` 获取到期卡片，遵循了正确的依赖方向
  ```typescript
  // 修复后：应用层 → 基础设施层（通过接口）
  private getDueCount(): number {
    const storage = this.context.getStorage();
    return storage.getDueCards().length;
  }
  ```

#### 2. 使用 ApplicationContext 作为服务定位器
- **修复**：在 `index.ts` 中添加 getter，通过 `ApplicationContext` 暴露服务
  ```typescript
  public get reviewDialogManager() { return this.context.getReviewDialogManager(); }
  public get hybridSyncService() { return this.context.getHybridSyncService(); }
  ```
- **符合原则**：所有服务都通过 `ApplicationContext` 统一管理和访问

#### 3. 保持层次边界清晰
- `MenuManager` 属于应用层，只依赖 `ApplicationContext` 提供的服务
- 没有直接访问领域层或基础设施层的实现细节

#### 4. 使用已有的查询方法
- `StorageManager.getDueCards()` 是一个已经存在的、经过测试的查询方法
- 避免了在应用层重复实现业务逻辑

### ⚠️ 需要改进的方面

#### 1. 服务访问方式不够优雅

**当前问题**：
```typescript
// MenuManager 中
private openReviewDialog(): void {
  const reviewDialogManager = this.context.getReviewDialogManager();
  if (reviewDialogManager) {
    reviewDialogManager.openRetrievalPractice();
  }
}
```

**改进建议**：
`MenuManager` 应该在构造函数中注入 `ReviewDialogManager`，而不是每次使用时都通过 `context` 获取。

```typescript
export class MenuManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    private i18n: Record<string, any>,
    private reviewDialogManager: ReviewDialogManager  // 注入依赖
  ) {}
  
  private openReviewDialog(): void {
    this.reviewDialogManager.openRetrievalPractice();
  }
}
```

#### 2. Plugin 实例暴露过多内部服务

**当前问题**：
```typescript
// index.ts 中暴露了大量内部服务
public get reviewDialogManager() { return this.context.getReviewDialogManager(); }
public get hybridSyncService() { return this.context.getHybridSyncService(); }
public get storage() { return this.context.getStorage(); }
// ... 等等
```

**DDD 问题**：
- Plugin 作为表现层入口，不应该暴露这么多内部服务
- 违反了"最小知识原则"（Law of Demeter）
- 外部代码可以直接访问内部服务，破坏了封装性

**改进建议**：
只暴露必要的门面方法，而不是直接暴露服务：

```typescript
export default class FSRSPlugin extends Plugin {
  private context!: ApplicationContext;

  // ❌ 不要这样
  // public get reviewDialogManager() { return this.context.getReviewDialogManager(); }
  
  // ✅ 应该这样
  public async openRetrievalPractice(): Promise<void> {
    await this.context.getReviewDialogManager().openRetrievalPractice();
  }
  
  public async openBrowser(): Promise<void> {
    this.context.getDialogManager().openBrowserDialog();
  }
}
```

#### 3. MenuManager 和 DialogManager 的职责重叠

**当前问题**：
- `MenuManager` 有 `openReviewDialog()` 方法
- `DialogManager` 也有 `openReviewDialog()` 方法
- 两者都是通过 `ReviewDialogManager` 实现

**改进建议**：
明确职责分离：
- `MenuManager`：只负责菜单的构建和显示
- `DialogManager`：负责所有对话框的打开和管理
- `MenuManager` 应该调用 `DialogManager`，而不是直接调用 `ReviewDialogManager`

```typescript
export class MenuManager {
  constructor(
    private context: ApplicationContext,
    private dialogManager: DialogManager  // 注入 DialogManager
  ) {}
  
  private openReviewDialog(): void {
    this.dialogManager.openReviewDialog();  // 委托给 DialogManager
  }
}
```

## 推荐的重构方案

### 方案 1：构造函数注入（最符合 DDD）

```typescript
// ApplicationContext.ts
static async create(config: ApplicationConfig): Promise<ApplicationContext> {
  // ... 创建所有服务
  
  const menuManager = new MenuManager(
    context,
    config.plugin,
    config.i18n,
    dialogManager,  // 注入依赖
    reviewDialogManager
  );
  
  return context;
}

// MenuManager.ts
export class MenuManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    private i18n: Record<string, any>,
    private dialogManager: DialogManager,
    private reviewDialogManager: ReviewDialogManager
  ) {}
  
  private openReviewDialog(): void {
    this.reviewDialogManager.openRetrievalPractice();
  }
}
```

**优点**：
- 依赖关系明确
- 易于测试（可以注入 mock）
- 符合依赖注入原则

### 方案 2：使用门面模式简化 Plugin 接口

```typescript
// index.ts
export default class FSRSPlugin extends Plugin {
  private context!: ApplicationContext;

  // 只暴露高层次的业务操作
  async openRetrievalPractice(): Promise<void> {
    await this.context.getReviewDialogManager().openRetrievalPractice();
  }
  
  async openBrowser(): Promise<void> {
    this.context.getDialogManager().openBrowserDialog();
  }
  
  getDueCount(): number {
    return this.context.getStorage().getDueCards().length;
  }
  
  // 向后兼容：只暴露最基础的服务
  get storage() { return this.context.getStorage(); }
  get unifiedDataSourceManager() { return this.context.getUnifiedDataSourceManager(); }
}
```

## 总结

### 当前修复的 DDD 符合度：7/10

**优点**：
- ✅ 遵循了依赖方向
- ✅ 使用了 ApplicationContext 统一管理服务
- ✅ 保持了层次边界
- ✅ 使用了已有的查询方法

**需要改进**：
- ⚠️ 服务访问方式不够优雅（应该使用构造函数注入）
- ⚠️ Plugin 暴露了过多内部服务（违反封装原则）
- ⚠️ MenuManager 和 DialogManager 职责重叠

### 建议的后续改进

1. **短期**（保持向后兼容）：
   - 保持当前修复
   - 添加文档说明这是过渡方案

2. **中期**（逐步重构）：
   - 在 MenuManager 中使用构造函数注入
   - 明确 MenuManager 和 DialogManager 的职责边界

3. **长期**（完全符合 DDD）：
   - 重构 Plugin 接口，使用门面模式
   - 移除不必要的服务暴露
   - 完善依赖注入容器

## 结论

当前的 Bug 修复**基本符合 DDD 原则**，解决了紧急问题，但还有改进空间。建议在后续迭代中逐步优化，使架构更加清晰和符合 DDD 最佳实践。
