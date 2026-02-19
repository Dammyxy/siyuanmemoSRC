# 运行时修复的 DDD 架构审视

## 修复内容回顾

### 修复 1：添加 EventBus 访问方法
```typescript
// src/index.ts
public getEventBus() { return this.context.getEventBus(); }
```

### 修复 2：添加 DialogManager 方法代理
```typescript
// src/index.ts
public openReviewDialog() { return this.context.getDialogManager()?.openReviewDialog(); }
public openIncrementalLearningDialog() { return this.context.getDialogManager()?.openIncrementalLearningDialog(); }
// ... 其他方法
```

### 修复 3：在全部卡片模式下创建 DeckDataSource
```typescript
// src/ui/browser/SRSBrowser.vue
const unifiedDataSourceManager = props.browserService?.getUnifiedDataSourceManager?.() || props.plugin?.unifiedDataSourceManager;
if (unifiedDataSourceManager) {
  currentDataSource.value = new DeckDataSource(
    unifiedDataSourceManager,
    props.plugin,
    { preset, queryText, cardType }
  );
}
```

## DDD 架构符合性分析

### ✅ 符合 DDD 的方面

#### 1. 依赖注入原则
- **修复 1 和 2**：通过 `ApplicationContext` 获取服务，而不是直接创建实例
- 插件实例作为门面（Facade），代理到 ApplicationContext
- 符合依赖倒置原则（DIP）

#### 2. 分层架构
- **修复 3**：UI 层（SRSBrowser.vue）通过 `browserService`（应用层）获取 `UnifiedDataSourceManager`
- 没有跨层直接访问基础设施层
- 保持了正确的依赖方向：UI → Application → Domain

#### 3. 单一职责
- 插件实例（`src/index.ts`）职责清晰：生命周期管理 + 服务门面
- 不包含业务逻辑，只是代理调用

### ⚠️ 需要改进的方面

#### 1. 插件实例作为"上帝对象"（God Object）

**问题**：
```typescript
// src/index.ts 暴露了太多方法
public get storage() { ... }
public get scheduler() { ... }
public get schedulerRouter() { ... }
public get rescheduleService() { ... }
public get queueContext() { ... }
public get retrievalQueue() { ... }
public get finalDrillQueue() { ... }
// ... 还有很多
public openReviewDialog() { ... }
public openIncrementalLearningDialog() { ... }
// ... 还有很多
```

**DDD 视角**：
- 插件实例暴露了过多的内部细节
- 违反了"最少知识原则"（Law of Demeter）
- UI 组件可以直接访问任何服务，缺乏约束

**理想方案**：
```typescript
// 只暴露必要的门面
export default class FSRSPlugin extends Plugin {
  // 核心服务访问
  public get context() { return this._context; }
  
  // 向后兼容（标记为 @deprecated）
  /** @deprecated 使用 context.getStorage() */
  public get storage() { return this.context.getStorage(); }
}

// UI 组件通过 context 访问服务
const cardService = plugin.context.getCardService();
```

#### 2. 直接实例化 DeckDataSource

**问题**：
```typescript
// src/ui/browser/SRSBrowser.vue
currentDataSource.value = new DeckDataSource(
  unifiedDataSourceManager,
  props.plugin,
  { preset, queryText, cardType }
);
```

**DDD 视角**：
- UI 层直接 `new` 创建对象，违反了依赖注入原则
- 应该通过工厂或服务创建

**理想方案**：
```typescript
// 使用工厂方法
const dataSourceFactory = props.browserService.getDataSourceFactory();
currentDataSource.value = dataSourceFactory.createDeckDataSource({
  preset, queryText, cardType
});

// 或者通过应用服务
currentDataSource.value = props.browserService.createDataSource({
  type: 'deck',
  options: { preset, queryText, cardType }
});
```

#### 3. EventBus 访问方式不一致

**问题**：
```typescript
// src/application/factories/createUnifiedReviewDialog.ts
const eventBus: EventBus = 
  (plugin as any).getEventBus?.() || 
  (plugin as any).eventBus || 
  (window as any).siyuanMemoPlugin?.getEventBus?.() || 
  (window as any).siyuanMemoPlugin?.eventBus;
```

**DDD 视角**：
- 多种回退方式表明依赖注入不够清晰
- 使用 `(window as any)` 是全局状态的反模式
- 应该通过构造函数注入，而不是运行时查找

**理想方案**：
```typescript
// 工厂函数接收 EventBus 作为参数
export function createUnifiedReviewDialog(options: {
  plugin: any;
  queueType: QueueType;
  title: string;
  eventBus: EventBus;  // ✅ 显式依赖
  onClose?: () => void;
}) {
  const { plugin, queueType, title, eventBus, onClose } = options;
  // 直接使用 eventBus，不需要查找
}

// 调用方负责提供依赖
const dialog = createUnifiedReviewDialog({
  plugin: this.plugin,
  queueType: QueueType.IncrementalLearning,
  title: '渐进学习',
  eventBus: this.context.getEventBus(),  // ✅ 显式传递
  onClose: () => { ... }
});
```

### ❌ 违反 DDD 的方面

#### 1. 缺少抽象层

**问题**：
- UI 组件直接依赖具体实现（`DeckDataSource`）
- 没有定义清晰的接口契约

**DDD 原则**：
- 依赖倒置原则（DIP）：依赖抽象，不依赖具体
- 接口隔离原则（ISP）：客户端不应该依赖它不需要的接口

**改进方案**：
```typescript
// 定义接口
interface ICardDataSource {
  fetchRows(options: FetchOptions): Promise<{ rows: BrowserCard[] }>;
  getSupportedActions(): CardBrowserAction[];
  performAction(actionId: string, cards: BrowserCard[]): Promise<any>;
}

// UI 组件依赖接口
const dataSource: ICardDataSource = props.browserService.createDataSource(...);
```

#### 2. 服务定位器反模式

**问题**：
```typescript
// 通过 plugin 访问所有服务
const manager = plugin.unifiedDataSourceManager;
const storage = plugin.storage;
const scheduler = plugin.scheduler;
```

**DDD 视角**：
- 这是服务定位器（Service Locator）反模式
- 隐藏了真实的依赖关系
- 难以测试和维护

**理想方案**：
```typescript
// 通过构造函数注入
class SRSBrowser {
  constructor(
    private browserService: BrowserApplicationService,
    private dialogManager: DialogManager,
    private eventBus: EventBus
  ) {}
}

// 或者通过 props 传递
<SRSBrowser
  :browserService="browserService"
  :dialogManager="dialogManager"
  :eventBus="eventBus"
/>
```

## 总体评价

### 🎯 符合度：60%

#### ✅ 做得好的地方（40%）
1. 使用 ApplicationContext 管理依赖
2. 保持了分层架构
3. 没有在 UI 层写业务逻辑
4. 通过应用服务访问数据

#### ⚠️ 需要改进的地方（40%）
1. 插件实例暴露过多细节
2. 直接实例化对象，缺少工厂
3. EventBus 访问方式不一致
4. 缺少抽象层和接口定义

#### ❌ 违反 DDD 的地方（20%）
1. 服务定位器反模式
2. 全局状态访问（window）
3. 依赖具体实现而非抽象

## 改进建议

### 短期改进（不破坏现有功能）

1. **添加工厂方法**
   ```typescript
   // src/application/services/BrowserApplicationService.ts
   createDataSource(options: DataSourceOptions): ICardDataSource {
     switch (options.type) {
       case 'deck':
         return new DeckDataSource(this.manager, this.plugin, options);
       case 'queue':
         return createQueueDataSource(...);
       default:
         throw new Error(`Unknown data source type: ${options.type}`);
     }
   }
   ```

2. **统一 EventBus 访问**
   ```typescript
   // 所有工厂函数都接收 EventBus 参数
   export function createUnifiedReviewDialog(options: {
     eventBus: EventBus;  // 必需参数
     // ... 其他参数
   }) { ... }
   ```

3. **标记废弃方法**
   ```typescript
   /** @deprecated 使用 context.getStorage() */
   public get storage() { return this.context.getStorage(); }
   ```

### 长期改进（重构）

1. **引入接口抽象**
   - 定义 `ICardDataSource` 接口
   - 定义 `IDialogManager` 接口
   - UI 组件依赖接口而非具体实现

2. **移除服务定位器**
   - 通过构造函数注入依赖
   - 使用 Vue 的 provide/inject 机制
   - 避免通过 plugin 访问所有服务

3. **清理全局状态**
   - 移除 `window.siyuanMemoPlugin`
   - 使用依赖注入容器
   - 所有依赖显式传递

## 结论

这次修复**基本符合 DDD 架构理念**，但还有改进空间：

### ✅ 优点
- 保持了分层架构
- 使用了依赖注入
- 没有破坏现有的 DDD 结构

### ⚠️ 缺点
- 插件实例作为"上帝对象"
- 缺少抽象层
- 存在服务定位器反模式

### 🎯 建议
1. **短期**：保持现状，添加 `@deprecated` 标记
2. **中期**：引入工厂方法和接口抽象
3. **长期**：重构为完全的依赖注入架构

这次修复是**务实的选择**：在不破坏现有功能的前提下，快速解决了运行时问题。但我们应该意识到这些技术债务，并在未来逐步改进。

---

**评分**：⭐⭐⭐☆☆ (3/5)
- 功能性：✅ 完全解决问题
- DDD 符合度：⚠️ 基本符合，有改进空间
- 可维护性：⚠️ 中等，需要后续重构
- 向后兼容性：✅ 完全兼容

**总结**：这是一次**合格但不完美**的修复，符合当前项目的实际情况。
