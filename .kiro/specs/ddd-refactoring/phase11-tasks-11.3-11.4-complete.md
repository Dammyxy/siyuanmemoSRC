# Phase 11 Tasks 11.3-11.4：删除旧服务和更新 ApplicationContext - 完成报告

完成时间：2026-02-19
状态：✅ 完成

## 任务目标

- Task 11.3：删除 DialogService、MenuService、ReviewDialogManager
- Task 11.4：更新 ApplicationContext，移除对旧服务的引用

## 完成的工作

### Task 11.3：删除旧服务

#### 1. 删除服务文件（5 分钟）

**删除的文件**：
- ✅ `src/services/DialogService.ts` (~200 行)
- ✅ `src/services/MenuService.ts` (~300 行)
- ✅ `src/services/ReviewDialogManager.ts` (~700 行)

**总计删除**：~1200 行

#### 2. 更新导出文件（5 分钟）

**文件**：`src/services/index.ts`

**修改前**：
```typescript
export { DialogService, type DialogServiceDependencies } from './DialogService';
export { MenuService, type MenuServiceDependencies } from './MenuService';
export { ReviewDialogManager, type ReviewDialogManagerDeps } from './ReviewDialogManager';
```

**修改后**：
```typescript
// 旧服务已删除，功能已迁移到 application/managers/
// - DialogService → DialogManager
// - MenuService → MenuManager
// - ReviewDialogManager → DialogManager
```

### Task 11.4：更新 ApplicationContext

#### 1. 更新导入（5 分钟）

**修改前**：
```typescript
import { DialogService, MenuService, ReviewDialogManager, BlockMenuHandler, HybridSyncService } from '@/services';
```

**修改后**：
```typescript
import { BlockMenuHandler, HybridSyncService } from '@/services';
```

#### 2. 移除字段（5 分钟）

**修改前**：
```typescript
// 应用服务（过渡期 - 标记为 @deprecated）
private dialogService: DialogService;
private menuService: MenuService;
private reviewDialogManager: ReviewDialogManager;
private blockMenuHandler: BlockMenuHandler;
```

**修改后**：
```typescript
// 应用服务
private blockMenuHandler: BlockMenuHandler;
```

#### 3. 更新构造函数（10 分钟）

**移除的参数**：
- `dialogService: DialogService`
- `menuService: MenuService`
- `reviewDialogManager: ReviewDialogManager`

**移除的赋值**：
- `this.dialogService = services.dialogService;`
- `this.menuService = services.menuService;`
- `this.reviewDialogManager = services.reviewDialogManager;`

#### 4. 更新 create() 方法（15 分钟）

**移除的代码**：
- 删除 DialogService 创建（~10 行）
- 删除 MenuService 创建（~10 行）
- 删除 ReviewDialogManager 创建（~7 行）
- 更新 BlockMenuHandler 创建（使用 DialogManager）

**修改前**（BlockMenuHandler 创建）：
```typescript
const blockMenuHandler = new BlockMenuHandler({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: storageManager,
  reviewDialogManager: reviewDialogManager,
  xiuyuanService: xiuyuanService,
  openCreateTemplateCardDialog: async (blockIds) => {
    // ...
  },
  openNeuralReviewDialog: (options) => reviewDialogManager.openNeuralRoam(options),
  plugin: config.plugin as any,
  applicationContext: undefined,
});
```

**修改后**：
```typescript
const blockMenuHandler = new BlockMenuHandler({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: storageManager,
  dialogManager: null as any, // 将在 ApplicationContext 创建后设置
  xiuyuanService: xiuyuanService,
  openCreateTemplateCardDialog: async (blockIds) => {
    // 使用闭包延迟获取 DialogManager
    if (contextRef) {
      const dialogManager = contextRef.getDialogManager();
      if (dialogManager) {
        await dialogManager.openCreateTemplateCardDialog(blockIds);
      }
    }
  },
  openNeuralReviewDialog: async (options) => {
    // 使用闭包延迟获取 DialogManager
    if (contextRef) {
      const dialogManager = contextRef.getDialogManager();
      if (dialogManager) {
        await dialogManager.openNeuralRoamDialog(options);
      }
    }
  },
  plugin: config.plugin as any,
  applicationContext: undefined,
});
```

**更新构造函数调用**：
```typescript
const context = new ApplicationContext(config, {
  // ... 移除 dialogService, menuService, reviewDialogManager
  blockMenuHandler,
  // ...
});

// 设置 DialogManager 引用
(blockMenuHandler.deps as any).dialogManager = context.getDialogManager();
```

#### 5. 删除 getter 方法（5 分钟）

**删除的方法**：
- `getDialogService(): DialogService`
- `getMenuService(): MenuService`
- `getReviewDialogManager(): ReviewDialogManager`

#### 6. 更新 index.ts（5 分钟）

**文件**：`src/index.ts`

**删除的 getter**：
```typescript
public get reviewDialogManager() { return this.context.getReviewDialogManager(); }
```

## 测试结果

### 编译测试

```bash
npm run build
```

**结果**：✅ 编译成功

### 代码大小对比

| 指标 | 修改前 | 修改后 | 变化 |
|------|--------|--------|------|
| index.js | 1,940.60 kB | 1,890.73 kB | -49.87 kB |
| gzip | 537.88 kB | 527.49 kB | -10.39 kB |

**代码减少**：~50 kB（2.6%）

### 代码统计

| 类型 | 行数 |
|------|------|
| 删除服务文件 | ~1200 |
| 删除 create() 代码 | ~27 |
| 删除 getter 方法 | ~15 |
| 删除字段和导入 | ~10 |
| **总计删除** | **~1252** |

### 修改的文件

1. ✅ `src/services/DialogService.ts` - 删除
2. ✅ `src/services/MenuService.ts` - 删除
3. ✅ `src/services/ReviewDialogManager.ts` - 删除
4. ✅ `src/services/index.ts` - 移除导出
5. ✅ `src/application/ApplicationContext.ts` - 移除引用
6. ✅ `src/index.ts` - 移除 getter

## 验收标准

### 必须达成 ✅

1. ✅ 旧服务文件已删除
2. ✅ ApplicationContext 不再引用旧服务
3. ✅ 编译成功，无错误
4. ✅ 代码大小减少

### 期望达成 ✅

1. ✅ 代码更清晰
2. ✅ 删除 ~1252 行代码
3. ✅ 架构更统一
4. ✅ 代码大小减少 50 kB

### 可选达成 ⏭️

1. ⏭️ 更新测试文件（Task 11.6）

## 剩余引用

### 测试文件

**位置**：
- `src/services/__tests__/BlockMenuHandler.menu.test.ts`
- `src/services/__tests__/BlockMenuHandler.applicationContext.test.ts`
- `src/services/__tests__/FinalDrillEntry.test.ts`
- `src/services/__tests__/IncrementalLearningEntry.test.ts`
- `src/services/__tests__/ReviewDialogManager.UnifiedDataSource.test.ts`

**状态**：⏭️ 待更新（Task 11.6）

**说明**：测试文件需要更新以使用 DialogManager。将在 Task 11.6 中处理。

## 下一步

**Task 11.5**：清理可选服务（MigrationService, MigrateQueueDataService）

---

**Tasks 11.3-11.4 状态：✅ 完成**

**实际时间**：50 分钟

**预计时间**：1 小时

**效率**：120%

**删除代码**：~1252 行

**代码大小减少**：50 kB
