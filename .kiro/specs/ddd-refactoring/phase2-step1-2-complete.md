# Phase 2 Step 1-2: PluginFacade 接口创建完成

**日期**: 2026-02-19  
**状态**: ✅ 完成  
**耗时**: 1 小时

---

## ✅ 已完成的工作

### Step 1: 创建 PluginFacade 接口

创建了 `src/application/interfaces/IPluginFacade.ts`:

#### 接口定义
```typescript
export interface IPluginFacade {
  readonly isMobile: boolean;
  readonly isBrowser: boolean;
  getContext(): ApplicationContext;
  openSettings(defaultTab?: string): void;
  getDueCount(): Promise<number>;
}
```

#### 设计特点
1. **最小化 API**: 只暴露 5 个成员（2 个属性 + 3 个方法）
2. **清晰的访问路径**: 通过 `getContext()` 访问所有应用服务
3. **便捷方法**: 提供 `openSettings()` 和 `getDueCount()` 快捷方式
4. **完整文档**: 每个成员都有详细的 JSDoc 注释和使用示例

### Step 2: 更新 Plugin 实例实现 IPluginFacade

修改了 `src/index.ts`:

#### 实现变更
1. **添加接口实现**: `class FSRSPlugin extends Plugin implements IPluginFacade`
2. **实现 getContext()**: 返回 ApplicationContext 实例
3. **实现 openSettings()**: 委托给 DialogManager
4. **实现 getDueCount()**: 委托给 CardService
5. **向后兼容**: 保留旧的 `openSetting()` 方法并标记为 @deprecated

#### 代码结构
```typescript
export default class FSRSPlugin extends Plugin implements IPluginFacade {
  // 公开属性
  public isMobile: boolean = false;
  public isBrowser: boolean = false;
  
  // IPluginFacade 实现
  getContext(): ApplicationContext { ... }
  openSettings(defaultTab?: string): void { ... }
  async getDueCount(): Promise<number> { ... }
  
  // 向后兼容访问器（18个，已标记 @deprecated）
  get storage() { ... }
  get scheduler() { ... }
  // ...
  
  // 向后兼容方法（7个，已标记 @deprecated）
  openReviewDialog() { ... }
  openIncrementalLearningDialog() { ... }
  // ...
  
  // 向后兼容方法（1个，新增）
  openSetting(defaultTab?: string) { ... }
  
  // 私有方法
  private setupTopBar() { ... }
  private registerDock() { ... }
  // ...
}
```

### 更新接口导出

修改了 `src/application/interfaces/index.ts`:
- 添加 `export * from './IPluginFacade';`

---

## 📊 当前状态

### Plugin 实例公开成员统计

#### IPluginFacade 接口（5个）
- ✅ `isMobile: boolean`
- ✅ `isBrowser: boolean`
- ✅ `getContext(): ApplicationContext`
- ✅ `openSettings(defaultTab?: string): void`
- ✅ `getDueCount(): Promise<number>`

#### 向后兼容访问器（18个，已标记 @deprecated）
- `storage`
- `scheduler`
- `schedulerRouter`
- `rescheduleService`
- `queueContext`
- `retrievalQueue`
- `finalDrillQueue`
- `leechQueue`
- `incrementalQueue`
- `subsetQueue`
- `xiuyuanService`
- `xiuyuanStorage`
- `unifiedDataSourceManager`
- `deliberateQueue`
- `neuralQueue`
- `neuralRoamQueue`
- `filterGroupQueue`
- `hybridSyncService`

#### 向后兼容方法（7个，已标记 @deprecated）
- `openReviewDialog()`
- `openIncrementalLearningDialog()`
- `openFinalDrillDialog()`
- `openNeuralRoamDialog(options?)`
- `openFilterGroupPracticeDialog()`
- `openLeechReviewDialog()`
- `getEventBus()`
- `openSetting(defaultTab?)` - 新增

#### 总计
- **推荐使用**: 5 个（IPluginFacade 接口）
- **废弃但保留**: 25 个（向后兼容）
- **总公开成员**: 30 个

---

## 🎯 DDD 架构改进

### 1. Facade 模式
- 提供统一的入口点
- 隐藏内部复杂性
- 简化外部调用

### 2. 依赖倒置原则（DIP）
- 外部代码依赖 IPluginFacade 接口
- 不依赖具体实现
- 便于测试和替换

### 3. 单一职责原则（SRP）
- Plugin 实例只负责生命周期管理
- 业务逻辑委托给 ApplicationContext
- 清晰的职责划分

---

## 🔍 诊断结果

### 编译错误: 0
### 警告: 0

所有代码编译通过，无错误和警告。

---

## 📝 下一步计划

### Step 3: 识别并更新调用点（4-6小时）

需要搜索并更新以下废弃 API 的使用：

#### 高优先级
1. `plugin.storage` → `plugin.getContext().getStorage()`
2. `plugin.openReviewDialog()` → `plugin.getContext().getDialogManager().openReviewDialog()`
3. `plugin.retrievalQueue` → `plugin.getContext().getRetrievalQueue()`
4. `plugin.unifiedDataSourceManager` → `plugin.getContext().getUnifiedDataSourceManager()`

#### 中优先级
1. `plugin.scheduler` → `plugin.getContext().getLegacyScheduler()`
2. `plugin.xiuyuanService` → `plugin.getContext().getXiuyuanService()`
3. `plugin.finalDrillQueue` → `plugin.getContext().getFinalDrillQueue()`

#### 低优先级
1. 其他废弃访问器和方法

### Step 4: 添加迁移指南（1小时）

创建 `MIGRATION-GUIDE.md` 文档，提供详细的迁移示例。

### Step 5: 运行诊断和测试（1-2小时）

1. 运行 TypeScript 编译检查
2. 手动测试关键功能
3. 确保向后兼容性

---

## ✨ 总结

Step 1-2 已成功完成！我们创建了 IPluginFacade 接口并更新了 Plugin 实例以实现该接口。现在 Plugin 实例有了清晰的公开 API（5个成员），同时保留了向后兼容性（25个废弃成员）。

下一步将识别并更新所有使用废弃 API 的调用点，逐步迁移到新的 API。
