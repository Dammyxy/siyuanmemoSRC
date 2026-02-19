# 全面 DDD 重构计划 - 中长期

## 执行概述

基于之前的 DDD 架构审视和改进，我们制定了一个全面的重构计划，目标是将 DDD 符合度从当前的 85% 提升到 95%+。

## 当前状态评估

### ✅ 已完成（85%）
1. 核心架构层次清晰
2. ApplicationContext 依赖注入容器
3. 显式 EventBus 注入
4. 数据源工厂方法
5. 废弃方法标记

### ⚠️ 需要改进（15%）
1. 插件实例仍是"上帝对象"
2. 缺少接口抽象层
3. 存在全局状态访问
4. 部分服务未完全 DDD 化
5. UI 组件直接访问底层服务

---

## 阶段 1: 接口抽象层（2-3 天）

### 目标
定义清晰的接口契约，实现依赖倒置原则（DIP）。

### 任务清单

#### 1.1 定义核心接口

**文件**: `src/application/interfaces/ICardDataSource.ts`

```typescript
/**
 * 卡片数据源接口
 * 
 * 定义数据源的标准契约，UI 层依赖此接口而非具体实现。
 */
export interface ICardDataSource {
  /**
   * 获取数据行
   */
  fetchRows(options: FetchRowsOptions): Promise<FetchRowsResult>;
  
  /**
   * 获取支持的操作
   */
  getSupportedActions(): CardBrowserAction[];
  
  /**
   * 执行操作
   */
  performAction(actionId: string, cards: BrowserCard[], context?: any): Promise<any>;
  
  /**
   * 获取数据源 ID
   */
  getId(): string;
}
```

**影响的文件**:
- `src/ui/browser/datasource/DeckDataSource.ts` - 实现接口
- `src/ui/browser/datasource/QueryDataSource.ts` - 实现接口
- `src/ui/browser/SRSBrowser.vue` - 依赖接口

#### 1.2 定义管理器接口

**文件**: `src/application/interfaces/IDialogManager.ts`

```typescript
export interface IDialogManager {
  openReviewDialog(): Promise<void>;
  openIncrementalLearningDialog(): Promise<void>;
  openFinalDrillDialog(): Promise<void>;
  openNeuralRoamDialog(options?: any): Promise<void>;
  openFilterGroupPracticeDialog(): Promise<void>;
  openBrowserDialog(): void;
  openSettingsDialog(defaultTab?: string): void;
}
```

#### 1.3 定义应用服务接口

**文件**: `src/application/interfaces/IBrowserApplicationService.ts`

```typescript
export interface IBrowserApplicationService {
  getBrowserCards(query: GetBrowserCardsQuery): Promise<GetBrowserCardsQueryResult>;
  getDueCount(): Promise<number>;
  getStats(): Promise<any>;
  createDataSource(options: DataSourceOptions): ICardDataSource;
  getUnifiedDataSourceManager(): any;
}
```

---

## 阶段 2: 移除"上帝对象"（3-4 天）

### 目标
简化插件实例，只保留必要的公共 API。

### 任务清单

#### 2.1 创建 PluginFacade

**文件**: `src/application/PluginFacade.ts`

```typescript
/**
 * PluginFacade - 插件门面
 * 
 * 为外部提供简洁的 API，隐藏内部复杂性。
 */
export class PluginFacade {
  constructor(private context: ApplicationContext) {}
  
  // 只暴露必要的公共方法
  async getDueCount(): Promise<number> {
    return this.context.getCardService().getDueCount();
  }
  
  openBrowser(): void {
    this.context.getDialogManager().openBrowserDialog();
  }
  
  openSettings(tab?: string): void {
    this.context.getDialogManager().openSettingsDialog(tab);
  }
}
```

#### 2.2 简化插件实例

**文件**: `src/index.ts`

```typescript
export default class FSRSPlugin extends Plugin {
  private context!: ApplicationContext;
  private facade!: PluginFacade;
  
  // 公共 API
  public get api() { return this.facade; }
  
  // 向后兼容（标记废弃，计划在 v2.0 移除）
  /** @deprecated 使用 api.getDueCount() 代替 */
  async getDueCount() { return this.facade.getDueCount(); }
  
  // 移除所有其他 getter 和方法
}
```

#### 2.3 更新调用方

**影响的文件**:
- `src/ui/browser/SRSBrowser.vue`
- `src/ui/review/v2/ReviewView.vue`
- 所有直接访问 `plugin.storage` 等的地方

---

## 阶段 3: 移除全局状态（2-3 天）

### 目标
移除 `window.siyuanMemoPlugin`，使用依赖注入。

### 任务清单

#### 3.1 审计全局状态使用

**命令**: 
```bash
grep -r "window.siyuanMemoPlugin" src/
grep -r "window as any" src/
```

#### 3.2 替换为依赖注入

**修改前**:
```typescript
const plugin = (window as any).siyuanMemoPlugin;
const eventBus = plugin?.eventBus;
```

**修改后**:
```typescript
// 通过构造函数注入
constructor(private eventBus: EventBus) {}
```

#### 3.3 更新工厂函数

所有工厂函数都应该接收必要的依赖作为参数，而不是从全局查找。

---

## 阶段 4: 服务层完全 DDD 化（4-5 天）

### 目标
将所有服务移到应用层，使用依赖注入。

### 任务清单

#### 4.1 迁移 CardService

**当前位置**: `src/services/CardService.ts`
**目标位置**: `src/application/services/CardApplicationService.ts`

**问题**:
```typescript
// ❌ 直接访问 storage
this.plugin.storage.setCard(card);
```

**解决方案**:
```typescript
// ✅ 通过 Repository
constructor(private cardRepository: ICardRepository) {}
await this.cardRepository.save(card);
```

#### 4.2 迁移 AutoCardHandler

**当前位置**: `src/services/handlers/AutoCardHandler.ts`
**目标位置**: `src/application/handlers/AutoCardHandler.ts`

**改进**:
- 通过构造函数注入依赖
- 使用 CardApplicationService 而非直接访问 storage

#### 4.3 迁移 BlockMenuHandler

**当前位置**: `src/services/BlockMenuHandler.ts`
**目标位置**: `src/application/managers/BlockMenuHandler.ts`

**改进**:
- 移除对 `plugin.unifiedDataSourceManager` 的直接访问
- 通过 ApplicationContext 获取服务

---

## 阶段 5: UI 组件完全 DDD 化（3-4 天）

### 目标
UI 组件只依赖接口，不直接访问底层服务。

### 任务清单

#### 5.1 扩展 TabManager

**文件**: `src/application/managers/TabManager.ts`

```typescript
export class TabManager {
  /**
   * 打开文档标签页
   */
  openDocumentTab(blockId: string): void {
    openTab({
      app: this.app,
      doc: { id: blockId },
    });
  }
  
  /**
   * 打开搜索标签页
   */
  openSearchTab(query: string): void {
    // 实现
  }
}
```

#### 5.2 更新 useContextMenu

**文件**: `src/ui/browser/composables/useContextMenu.ts`

**修改前**:
```typescript
(props.plugin.app as any).openTab({ ... });
```

**修改后**:
```typescript
// 通过 props 传递 tabManager
props.tabManager.openDocumentTab(blockId);
```

#### 5.3 更新 useGridInteractions

**文件**: `src/ui/browser/composables/useGridInteractions.ts`

**修改前**:
```typescript
openTab({ app: props.app, doc: { id: blockId } });
```

**修改后**:
```typescript
props.tabManager.openDocumentTab(blockId);
```

---

## 阶段 6: 清理废弃代码（2-3 天）

### 目标
移除所有标记为 @deprecated 的代码。

### 任务清单

#### 6.1 审计废弃代码

**命令**:
```bash
grep -r "@deprecated" src/
```

#### 6.2 确认无调用

对每个废弃方法，确认没有调用方：
```bash
grep -r "plugin.storage" src/
grep -r "plugin.scheduler" src/
```

#### 6.3 移除废弃代码

**文件**: `src/index.ts`

移除所有标记为 @deprecated 的 getter 和方法。

#### 6.4 更新文档

更新所有文档，移除对废弃 API 的引用。

---

## 阶段 7: 添加单元测试（5-7 天）

### 目标
为关键组件添加单元测试，确保重构不破坏功能。

### 任务清单

#### 7.1 测试应用服务

**文件**: `src/application/services/__tests__/BrowserApplicationService.test.ts`

```typescript
describe('BrowserApplicationService', () => {
  it('should create data source via factory', () => {
    const service = new BrowserApplicationService(...);
    const dataSource = service.createDataSource({ type: 'deck' });
    expect(dataSource).toBeInstanceOf(DeckDataSource);
  });
  
  it('should get browser cards', async () => {
    const result = await service.getBrowserCards({ preset: 'due' });
    expect(result.cards).toBeDefined();
  });
});
```

#### 7.2 测试管理器

**文件**: `src/application/managers/__tests__/DialogManager.test.ts`

```typescript
describe('DialogManager', () => {
  it('should open review dialog with EventBus', async () => {
    const mockEventBus = new EventBus();
    const manager = new DialogManager(context, plugin);
    await manager.openReviewDialog();
    // 验证对话框创建
  });
});
```

#### 7.3 测试工厂函数

**文件**: `src/application/factories/__tests__/createUnifiedReviewDialog.test.ts`

```typescript
describe('createUnifiedReviewDialog', () => {
  it('should create dialog with provided EventBus', () => {
    const mockEventBus = new EventBus();
    const dialog = createUnifiedReviewDialog({
      plugin: mockPlugin,
      queueType: QueueType.RetrievalPractice,
      title: 'Test',
      eventBus: mockEventBus,
    });
    expect(dialog).toBeDefined();
  });
});
```

---

## 阶段 8: 性能优化（3-4 天）

### 目标
优化依赖注入和服务创建的性能。

### 任务清单

#### 8.1 懒加载优化

确保服务只在需要时创建：
```typescript
// ApplicationContext.ts
getService<T>(serviceName: string): T {
  // 如果已创建，直接返回
  if (this.serviceContainer.has(serviceName)) {
    return this.serviceContainer.get(serviceName);
  }
  // 否则创建并缓存
  const service = this.serviceFactories.get(serviceName)(this);
  this.serviceContainer.set(serviceName, service);
  return service;
}
```

#### 8.2 循环依赖检测

添加循环依赖检测：
```typescript
private creatingServices = new Set<string>();

getService<T>(serviceName: string): T {
  if (this.creatingServices.has(serviceName)) {
    throw new Error(`Circular dependency detected: ${serviceName}`);
  }
  this.creatingServices.add(serviceName);
  try {
    // 创建服务
  } finally {
    this.creatingServices.delete(serviceName);
  }
}
```

#### 8.3 性能监控

添加性能监控：
```typescript
getService<T>(serviceName: string): T {
  const start = performance.now();
  const service = // 创建服务
  const duration = performance.now() - start;
  if (duration > 100) {
    console.warn(`Service ${serviceName} took ${duration}ms to create`);
  }
  return service;
}
```

---

## 时间线和里程碑

### 第 1 周（阶段 1-2）
- Day 1-3: 定义接口抽象层
- Day 4-7: 移除"上帝对象"

**里程碑**: UI 层完全依赖接口

### 第 2 周（阶段 3-4）
- Day 1-3: 移除全局状态
- Day 4-7: 服务层完全 DDD 化

**里程碑**: 无全局状态，所有服务通过依赖注入

### 第 3 周（阶段 5-6）
- Day 1-4: UI 组件完全 DDD 化
- Day 5-7: 清理废弃代码

**里程碑**: 代码库完全 DDD 化

### 第 4 周（阶段 7-8）
- Day 1-5: 添加单元测试
- Day 6-7: 性能优化

**里程碑**: 测试覆盖率 > 80%，性能优化完成

---

## 风险评估

### 高风险
1. **破坏现有功能** - 通过单元测试和集成测试降低风险
2. **性能下降** - 通过性能监控和优化降低风险

### 中风险
1. **迁移成本高** - 分阶段实施，每个阶段独立验证
2. **学习曲线** - 提供详细文档和示例

### 低风险
1. **向后兼容性** - 保留废弃 API 直到 v2.0

---

## 成功标准

### 代码质量
- ✅ DDD 符合度 > 95%
- ✅ 测试覆盖率 > 80%
- ✅ 无循环依赖
- ✅ 无全局状态

### 性能
- ✅ 服务创建时间 < 100ms
- ✅ 内存使用无明显增加
- ✅ 响应时间无明显下降

### 可维护性
- ✅ 接口清晰
- ✅ 依赖关系明确
- ✅ 易于测试
- ✅ 易于扩展

---

## 下一步行动

1. **立即开始**: 阶段 1 - 定义接口抽象层
2. **准备工作**: 设置测试环境
3. **沟通计划**: 与团队同步重构计划

---

**创建时间**: 2026-02-19
**预计完成**: 2026-03-19 (4 周)
**负责人**: AI Assistant + 开发团队
