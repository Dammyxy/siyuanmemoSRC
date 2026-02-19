# Phase 11 Tasks 11.3-11.4：删除旧服务和更新 ApplicationContext

生成时间：2026-02-19
状态：📋 规划中

## 概述

Task 11.3 和 11.4 紧密相关，将一起完成：
- Task 11.3：删除旧服务文件
- Task 11.4：更新 ApplicationContext，移除对旧服务的引用

## Task 11.3：删除旧服务

### 目标

删除 DialogService、MenuService、ReviewDialogManager 三个旧服务文件。

### 删除的文件

1. **src/services/DialogService.ts** (~200 行)
   - 功能：对话框管理服务
   - 状态：已被 DialogManager 替代

2. **src/services/MenuService.ts** (~300 行)
   - 功能：菜单管理服务
   - 状态：已被 MenuManager 替代

3. **src/services/ReviewDialogManager.ts** (~700 行)
   - 功能：复习对话框管理
   - 状态：已被 DialogManager 替代

### 更新的文件

- **src/services/index.ts** - 移除导出

**修改前**：
```typescript
export { DialogService, type DialogServiceDependencies } from './DialogService';
export { MenuService, type MenuServiceDependencies } from './MenuService';
export { ReviewDialogManager, type ReviewDialogManagerDeps } from './ReviewDialogManager';
```

**修改后**：
```typescript
// DialogService, MenuService, ReviewDialogManager 已删除
// 功能已迁移到 application/managers/
```

### 预期结果

- 删除 ~1200 行代码
- 编译成功
- 无引用错误

## Task 11.4：更新 ApplicationContext

### 目标

移除 ApplicationContext 中对旧服务的所有引用。

### 修改的内容

#### 1. 移除字段

**修改前**：
```typescript
// 应用服务（过渡期 - 标记为 @deprecated）
private dialogService: DialogService;
private menuService: MenuService;
private reviewDialogManager: ReviewDialogManager;
```

**修改后**：
```typescript
// 旧服务已删除，功能已迁移到 DialogManager 和 MenuManager
```

#### 2. 移除方法

**删除的方法**：
- `getDialogService(): DialogService`
- `getMenuService(): MenuService`
- `getReviewDialogManager(): ReviewDialogManager`

#### 3. 更新构造函数

**修改前**：
```typescript
private constructor(
  config: ApplicationConfig,
  services: {
    // ...
    dialogService: DialogService;
    menuService: MenuService;
    reviewDialogManager: ReviewDialogManager;
    // ...
  }
) {
  // ...
  this.dialogService = services.dialogService;
  this.menuService = services.menuService;
  this.reviewDialogManager = services.reviewDialogManager;
  // ...
}
```

**修改后**：
```typescript
private constructor(
  config: ApplicationConfig,
  services: {
    // ... 移除旧服务参数
  }
) {
  // ... 移除旧服务赋值
}
```

#### 4. 更新 create() 工厂方法

**修改前**：
```typescript
// 创建旧服务
const dialogService = new DialogService({...});
const menuService = new MenuService({...});
const reviewDialogManager = new ReviewDialogManager({...});

// 传递给构造函数
return new ApplicationContext(config, {
  // ...
  dialogService,
  menuService,
  reviewDialogManager,
  // ...
});
```

**修改后**：
```typescript
// 移除旧服务创建和传递
return new ApplicationContext(config, {
  // ... 不再包含旧服务
});
```

### 预期结果

- ApplicationContext 不再引用旧服务
- 编译成功
- 所有功能正常工作

## 执行计划

### Step 1：删除旧服务文件（10 分钟）

```bash
# 删除文件
rm src/services/DialogService.ts
rm src/services/MenuService.ts
rm src/services/ReviewDialogManager.ts
```

### Step 2：更新 services/index.ts（5 分钟）

移除导出语句。

### Step 3：更新 ApplicationContext（15 分钟）

1. 移除字段声明
2. 移除方法定义
3. 更新构造函数
4. 更新 create() 工厂方法

### Step 4：编译测试（5 分钟）

```bash
npm run build
```

### Step 5：检查引用（5 分钟）

使用 grepSearch 检查是否还有遗漏的引用。

## 风险评估

### 高风险

1. **隐藏的引用**：可能有未发现的旧服务引用
   - 缓解措施：使用 grepSearch 全面搜索
   - 回滚计划：从 git 恢复文件

### 中风险

1. **测试文件**：测试文件可能需要更新
   - 缓解措施：在 Task 11.6 中处理
   - 回滚计划：暂时跳过测试

### 低风险

1. **编译错误**：TypeScript 会捕获大部分错误
   - 缓解措施：逐步修改，每步都编译
   - 回滚计划：修复编译错误

## 验收标准

### 必须达成

1. ✅ 旧服务文件已删除
2. ✅ ApplicationContext 不再引用旧服务
3. ✅ 编译成功，无错误
4. ✅ 无隐藏的引用

### 期望达成

1. ✅ 代码更清晰
2. ✅ 删除 ~1200 行代码
3. ✅ 架构更统一

## 时间估算

| 步骤 | 预计时间 |
|------|---------|
| Step 1 | 10m |
| Step 2 | 5m |
| Step 3 | 15m |
| Step 4 | 5m |
| Step 5 | 5m |
| **总计** | **40m** |

## 下一步

**立即开始 Step 1**：删除旧服务文件

---

**Tasks 11.3-11.4 状态：📋 规划完成，等待执行**
