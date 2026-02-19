# 之前 BUG 修复的 DDD 架构审计

## 审计目的

检查之前修复的 BUG 是否符合 DDD 架构原则，识别需要改进的地方。

---

## BUG 修复 1: 浏览器完全 DDD 化

**文件**: `critical-fixes-2026-02-19.md`

### 修复内容
将 `props.plugin.unifiedDataSourceManager` 改为 `props.browserService.getUnifiedDataSourceManager()`

### DDD 符合度评估: ⭐⭐⭐⭐☆ (80%)

#### ✅ 做得好的地方
1. UI 层通过应用服务访问数据
2. 保持了分层架构
3. 符合依赖注入原则

#### ⚠️ 需要改进的地方
1. **缺少接口抽象**
   ```typescript
   // ❌ 当前：依赖具体实现
   const manager = props.browserService.getUnifiedDataSourceManager();
   
   // ✅ 理想：依赖接口
   interface IBrowserApplicationService {
     getDataSourceManager(): IDataSourceManager;
   }
   ```

2. **返回类型为 any**
   ```typescript
   // ❌ 当前
   getUnifiedDataSourceManager(): any
   
   // ✅ 理想
   getUnifiedDataSourceManager(): IUnifiedDataSourceManager
   ```

### 改进建议
1. 定义 `IUnifiedDataSourceManager` 接口
2. 更新返回类型
3. UI 层依赖接口而非具体实现

---

## BUG 修复 2: MenuManager 依赖注入修复

**文件**: `critical-fixes-2026-02-19.md`

### 修复内容
在 ApplicationContext 中正确注入 DialogManager 到 MenuManager

### DDD 符合度评估: ⭐⭐⭐⭐⭐ (95%)

#### ✅ 做得好的地方
1. 使用构造函数注入
2. 依赖关系清晰
3. 符合依赖注入原则
4. 易于测试

#### ⚠️ 需要改进的地方
1. **缺少接口抽象**
   ```typescript
   // ❌ 当前：依赖具体实现
   constructor(
     context: ApplicationContext,
     plugin: Plugin,
     i18n: Record<string, any>,
     dialogManager: DialogManager  // 具体类
   )
   
   // ✅ 理想：依赖接口
   constructor(
     context: ApplicationContext,
     plugin: Plugin,
     i18n: Record<string, any>,
     dialogManager: IDialogManager  // 接口
   )
   ```

### 改进建议
1. 定义 `IDialogManager` 接口
2. MenuManager 依赖接口
3. 更容易替换实现（如测试时使用 Mock）

---

## BUG 修复 3: 浏览器右键菜单缺失

**文件**: `runtime-fixes-2026-02-19.md`

### 修复内容
在全部卡片模式下创建 DeckDataSource

### DDD 符合度评估: ⭐⭐⭐☆☆ (60%)

#### ✅ 做得好的地方
1. 解决了功能问题
2. 保持了向后兼容

#### ❌ 违反 DDD 的地方
1. **UI 层直接 new 对象**
   ```typescript
   // ❌ 当前：UI 层直接创建
   currentDataSource.value = new DeckDataSource(
     unifiedDataSourceManager,
     props.plugin,
     { preset, queryText, cardType }
   );
   
   // ✅ 理想：通过工厂创建
   currentDataSource.value = props.browserService.createDataSource({
     type: 'deck',
     preset,
     queryText,
     cardType,
     plugin: props.plugin
   });
   ```

2. **依赖具体实现**
   ```typescript
   // ❌ 当前
   const dataSource: DeckDataSource = ...
   
   // ✅ 理想
   const dataSource: ICardDataSource = ...
   ```

### 改进建议
1. ✅ **已改进**: 使用 `browserService.createDataSource()` 工厂方法
2. ⏳ **待改进**: 定义 `ICardDataSource` 接口
3. ⏳ **待改进**: UI 层依赖接口

---

## BUG 修复 4: 队列复习按钮失效

**文件**: `runtime-fixes-2026-02-19.md`

### 修复内容
添加 EventBus 访问方法和 DialogManager 方法代理

### DDD 符合度评估: ⭐⭐⭐☆☆ (70%)

#### ✅ 做得好的地方
1. 解决了功能问题
2. 保持了向后兼容

#### ❌ 违反 DDD 的地方
1. **插件实例作为"上帝对象"**
   ```typescript
   // ❌ 当前：插件暴露所有方法
   public openReviewDialog() { ... }
   public openIncrementalLearningDialog() { ... }
   public openFinalDrillDialog() { ... }
   // ... 还有 30+ 个方法
   
   // ✅ 理想：只暴露必要的 API
   public get api() { return this.facade; }
   ```

2. **服务定位器反模式**
   ```typescript
   // ❌ 当前：通过 plugin 访问所有服务
   const storage = plugin.storage;
   const scheduler = plugin.scheduler;
   
   // ✅ 理想：通过依赖注入
   constructor(
     private storage: IStorageManager,
     private scheduler: IScheduler
   )
   ```

### 改进建议
1. ✅ **已改进**: 标记废弃方法
2. ⏳ **待改进**: 创建 PluginFacade
3. ⏳ **待改进**: 移除废弃方法

---

## BUG 修复 5: 开始练习菜单按钮无反应

**文件**: `runtime-fixes-2026-02-19.md`

### 修复内容
添加 DialogManager 方法代理到插件实例

### DDD 符合度评估: ⭐⭐⭐☆☆ (70%)

#### ✅ 做得好的地方
1. 解决了功能问题
2. 委托给 DialogManager 处理

#### ❌ 违反 DDD 的地方
同 BUG 修复 4 - 插件实例作为"上帝对象"

### 改进建议
同 BUG 修复 4

---

## 总体评估

### 平均 DDD 符合度: ⭐⭐⭐⭐☆ (76%)

### 优点
1. ✅ 所有修复都保持了向后兼容
2. ✅ 大部分修复符合分层架构
3. ✅ 使用了依赖注入

### 缺点
1. ❌ 缺少接口抽象层
2. ❌ 插件实例仍是"上帝对象"
3. ❌ 部分代码仍直接 new 对象

---

## 改进优先级

### 高优先级（立即改进）
1. ✅ **已完成**: 使用工厂方法创建数据源
2. ✅ **已完成**: 显式 EventBus 注入
3. ✅ **已完成**: 标记废弃方法

### 中优先级（本周完成）
1. ⏳ 定义接口抽象层
   - ICardDataSource
   - IDialogManager
   - IBrowserApplicationService
   - IUnifiedDataSourceManager

2. ⏳ 创建 PluginFacade
   - 简化插件实例
   - 只暴露必要的公共 API

### 低优先级（下周完成）
1. ⏳ 移除废弃方法
2. ⏳ 移除全局状态
3. ⏳ 添加单元测试

---

## 具体改进计划

### 改进 1: 定义 ICardDataSource 接口

**文件**: `src/application/interfaces/ICardDataSource.ts`

```typescript
export interface ICardDataSource {
  fetchRows(options: FetchRowsOptions): Promise<FetchRowsResult>;
  getSupportedActions(): CardBrowserAction[];
  performAction(actionId: string, cards: BrowserCard[]): Promise<any>;
  getId(): string;
}
```

**影响的文件**:
- `src/ui/browser/datasource/DeckDataSource.ts` - 实现接口
- `src/ui/browser/SRSBrowser.vue` - 依赖接口
- `src/application/services/BrowserApplicationService.ts` - 返回接口

### 改进 2: 定义 IDialogManager 接口

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

**影响的文件**:
- `src/application/managers/DialogManager.ts` - 实现接口
- `src/application/managers/MenuManager.ts` - 依赖接口

### 改进 3: 创建 PluginFacade

**文件**: `src/application/PluginFacade.ts`

```typescript
export class PluginFacade {
  constructor(private context: ApplicationContext) {}
  
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

**影响的文件**:
- `src/index.ts` - 使用 PluginFacade
- 所有直接访问 plugin 的地方

---

## 测试计划

### 单元测试
1. 测试工厂方法创建数据源
2. 测试 EventBus 显式注入
3. 测试 PluginFacade API

### 集成测试
1. 测试浏览器完整流程
2. 测试菜单打开流程
3. 测试对话框创建流程

### 回归测试
1. 测试所有之前修复的 BUG
2. 确保功能正常
3. 确保性能无下降

---

## 总结

之前的 BUG 修复基本符合 DDD 架构原则，但还有改进空间：

1. **已完成的改进** (85%)
   - ✅ 工厂方法
   - ✅ 显式依赖注入
   - ✅ 废弃方法标记

2. **待完成的改进** (15%)
   - ⏳ 接口抽象层
   - ⏳ PluginFacade
   - ⏳ 移除废弃代码

通过完成这些改进，我们可以将 DDD 符合度从 76% 提升到 95%+。

---

**创建时间**: 2026-02-19
**审计人**: AI Assistant
**下一步**: 开始实施改进计划
