# Phase 2: 移除 "God Object" 实施计划

**日期**: 2026-02-19  
**预计时间**: 3-4 天  
**当前 DDD 合规度**: 90%  
**目标 DDD 合规度**: 95%

---

## 📋 现状分析

### 当前 Plugin 实例暴露的方法/属性

#### 1. 公开属性（2个）
- `isMobile: boolean`
- `isBrowser: boolean`

#### 2. 向后兼容访问器（18个，已标记 @deprecated）
- `storage` → `context.getStorage()`
- `scheduler` → `context.getLegacyScheduler()`
- `schedulerRouter` → `context.getScheduler()`
- `rescheduleService` → `context.getRescheduleService()`
- `queueContext` → `context.getQueueContext()`
- `retrievalQueue` → `context.getRetrievalQueue()`
- `finalDrillQueue` → `context.getFinalDrillQueue()`
- `leechQueue` → `context.getLeechQueue()`
- `incrementalQueue` → `context.getIncrementalQueue()`
- `subsetQueue` → `context.getSubsetQueue()`
- `xiuyuanService` → `context.getXiuyuanService()`
- `xiuyuanStorage` → `context.getXiuyuanStorage()`
- `unifiedDataSourceManager` → `context.getUnifiedDataSourceManager()`
- `deliberateQueue` → `finalDrillQueue`
- `neuralQueue` → `unifiedDataSourceManager.getQueue('neural-roam')`
- `neuralRoamQueue` → `neuralQueue`
- `filterGroupQueue` → `subsetQueue`
- `hybridSyncService` → `context.getHybridSyncService()`

#### 3. DialogManager 方法代理（6个，已标记 @deprecated）
- `openReviewDialog()`
- `openIncrementalLearningDialog()`
- `openFinalDrillDialog()`
- `openNeuralRoamDialog(options?)`
- `openFilterGroupPracticeDialog()`
- `openLeechReviewDialog()`

#### 4. 其他公开方法（3个）
- `getEventBus()` - 已标记 @deprecated
- `openSetting(defaultTab?)` - 未标记 @deprecated
- `getDueCount()` - 未标记 @deprecated

### 评估

✅ **优点**:
- 大部分方法已标记 @deprecated
- 已经委托给 ApplicationContext
- 代码结构清晰

⚠️ **问题**:
1. 仍然暴露了 27 个公开方法/属性
2. 外部代码可能仍在使用这些废弃方法
3. 缺少统一的 Facade 接口
4. `openSetting()` 和 `getDueCount()` 未标记废弃

---

## 🎯 Phase 2 目标

### 1. 创建 PluginFacade 接口
定义插件对外暴露的最小接口，只包含必要的方法。

### 2. 简化 Plugin 实例
- 保留必要的公开方法（生命周期、设置、基本信息）
- 将所有业务逻辑委托给 ApplicationContext
- 标记所有向后兼容方法为 @deprecated

### 3. 更新调用点
- 识别所有使用废弃方法的地方
- 更新为使用 ApplicationContext 或应用服务
- 添加迁移指南

---

## 📝 实施步骤

### Step 1: 创建 PluginFacade 接口（1小时）

创建 `src/application/interfaces/IPluginFacade.ts`:

```typescript
/**
 * IPluginFacade - 插件外观接口
 * 
 * 定义插件对外暴露的最小接口。
 * 这是 DDD 架构中的 Facade 模式。
 * 
 * 职责：
 * - 提供插件基本信息
 * - 提供设置访问
 * - 提供应用上下文访问
 */
export interface IPluginFacade {
  /**
   * 是否为移动端
   */
  readonly isMobile: boolean;
  
  /**
   * 是否为浏览器端
   */
  readonly isBrowser: boolean;
  
  /**
   * 获取应用上下文
   * 
   * 通过上下文可以访问所有应用服务。
   */
  getContext(): ApplicationContext;
  
  /**
   * 打开设置对话框
   * 
   * @param defaultTab - 默认标签页（可选）
   */
  openSettings(defaultTab?: string): void;
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   */
  getDueCount(): Promise<number>;
}
```

### Step 2: 更新 Plugin 实例实现 IPluginFacade（2小时）

修改 `src/index.ts`:

```typescript
export default class FSRSPlugin extends Plugin implements IPluginFacade {
  public readonly isMobile: boolean = false;
  public readonly isBrowser: boolean = false;
  private context!: ApplicationContext;

  // ========================================================================
  // IPluginFacade 实现
  // ========================================================================
  
  /**
   * 获取应用上下文
   * 
   * 推荐使用此方法访问所有应用服务。
   */
  getContext(): ApplicationContext {
    return this.context;
  }
  
  /**
   * 打开设置对话框
   * 
   * @param defaultTab - 默认标签页（可选）
   */
  openSettings(defaultTab?: string): void {
    this.context.getDialogManager()?.openSettingsDialog(defaultTab);
  }
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   */
  async getDueCount(): Promise<number> {
    const cardService = this.context.getCardService();
    return await cardService.getDueCount();
  }
  
  // ========================================================================
  // 向后兼容方法（将在下一个主版本中移除）
  // ========================================================================
  
  /** @deprecated 使用 getContext().getStorage() 代替 */
  public get storage() { return this.context.getStorage(); }
  
  // ... 其他废弃方法保持不变 ...
}
```

### Step 3: 识别并更新调用点（4-6小时）

#### 3.1 搜索所有使用废弃方法的地方

使用 grepSearch 查找：
- `plugin.storage`
- `plugin.scheduler`
- `plugin.retrievalQueue`
- `plugin.openReviewDialog()`
- 等等...

#### 3.2 更新调用点

**之前**:
```typescript
// 直接访问 plugin 属性
const cards = await plugin.storage.getAllCards();
plugin.openReviewDialog();
```

**之后**:
```typescript
// 通过 ApplicationContext 访问
const context = plugin.getContext();
const cards = await context.getStorage().getAllCards();
context.getDialogManager().openReviewDialog();
```

### Step 4: 添加迁移指南（1小时）

创建 `MIGRATION-GUIDE.md`:

```markdown
# 插件 API 迁移指南

## 从废弃 API 迁移到新 API

### 访问存储

**废弃**:
\`\`\`typescript
plugin.storage.getAllCards()
\`\`\`

**推荐**:
\`\`\`typescript
plugin.getContext().getStorage().getAllCards()
\`\`\`

### 打开对话框

**废弃**:
\`\`\`typescript
plugin.openReviewDialog()
\`\`\`

**推荐**:
\`\`\`typescript
plugin.getContext().getDialogManager().openReviewDialog()
\`\`\`

... 更多示例 ...
```

### Step 5: 运行诊断和测试（1-2小时）

1. 运行 TypeScript 编译检查
2. 检查是否有编译错误
3. 手动测试关键功能
4. 确保向后兼容性

---

## 🔍 需要更新的文件（预估）

### 高优先级（必须更新）
1. `src/ui/browser/SRSBrowser.vue` - 浏览器组件
2. `src/ui/review/v2/ReviewView.vue` - 复习视图
3. `src/application/managers/MenuManager.ts` - 菜单管理器
4. `src/application/managers/BlockMenuHandler.ts` - 块菜单处理器
5. `src/ui/browser/datasource/*.ts` - 数据源文件

### 中优先级（建议更新）
1. `src/application/factories/*.ts` - 工厂函数
2. `src/application/adapters/*.ts` - 适配器
3. `src/ui/settings/*.vue` - 设置面板

### 低优先级（可选更新）
1. 测试文件
2. 示例代码
3. 文档

---

## 📊 预期成果

### DDD 合规度提升
- **之前**: 90% (4.5/5 星)
- **之后**: 95% (4.75/5 星)

### 改进点
1. ✅ 统一的 Facade 接口
2. ✅ 最小化公开 API
3. ✅ 清晰的迁移路径
4. ✅ 更好的封装性
5. ✅ 降低耦合度

### 向后兼容性
- ✅ 保留所有废弃方法
- ✅ 添加 @deprecated 标记
- ✅ 提供迁移指南
- ✅ 逐步迁移策略

---

## ⚠️ 风险和注意事项

### 1. 向后兼容性
- **风险**: 外部代码可能依赖废弃 API
- **缓解**: 保留废弃方法，添加警告日志

### 2. 迁移工作量
- **风险**: 更新所有调用点需要时间
- **缓解**: 分阶段迁移，优先更新核心文件

### 3. 测试覆盖
- **风险**: 可能引入回归问题
- **缓解**: 手动测试关键功能，添加集成测试

---

## 📚 相关文档

- [Phase 1: 接口抽象层实现完成](./phase1-interface-implementation-complete.md)
- [综合 DDD 重构计划](./COMPREHENSIVE-DDD-REFACTORING-PLAN.md)
- [DDD 指南](../../DDD-GUIDE.md)

---

## ✅ 验收标准

1. ✅ 创建 IPluginFacade 接口
2. ✅ Plugin 实例实现 IPluginFacade
3. ✅ 所有核心文件更新为使用新 API
4. ✅ 添加迁移指南
5. ✅ 无编译错误
6. ✅ 关键功能正常工作
7. ✅ DDD 合规度达到 95%

---

## 🚀 下一步

完成 Phase 2 后，继续 Phase 3: 移除全局状态（2-3 天）
