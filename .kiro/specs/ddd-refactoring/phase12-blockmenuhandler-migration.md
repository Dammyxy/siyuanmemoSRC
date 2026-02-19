# Phase 12: BlockMenuHandler 迁移到 DDD 架构

**日期**: 2026-02-19  
**优先级**: P0（高）  
**预计时间**: 2 小时

---

## 📋 迁移目标

将 `src/services/BlockMenuHandler.ts` (1397 行) 迁移到符合 DDD 架构的结构。

---

## 🔍 当前问题分析

### 主要问题

1. **跨层调用**: 直接访问 Storage，虽然尝试使用 ApplicationContext，但有回退风险
2. **职责混乱**: 混合了菜单处理、业务逻辑、UI 交互
3. **代码量大**: 1397 行代码，职责过多

### 违反的 DDD 原则

- ❌ 单一职责原则
- ❌ 分层架构原则
- ❌ 依赖倒置原则

---

## 🎯 迁移策略

### 方案 1: 完全重构（推荐）

将 BlockMenuHandler 拆分为多个符合 DDD 的组件：

1. **MenuManager** (application/managers/)
   - 负责菜单项的注册和管理
   - 协调各个菜单处理器

2. **BlockMenuService** (application/services/)
   - 处理块菜单相关的业务逻辑
   - 调用 CardApplicationService 进行卡片操作

3. **MenuItemFactory** (ui/menu/)
   - 负责创建菜单项
   - 纯 UI 逻辑

### 方案 2: 渐进式迁移（保守）

保留 BlockMenuHandler，但：
1. 移除所有 Storage 直接访问
2. 强制使用 ApplicationContext
3. 将业务逻辑提取到应用服务

**选择**: 方案 2（渐进式迁移）
- 风险更低
- 不影响现有功能
- 可以逐步优化

---

## 📝 迁移步骤

### Step 1: 移除 Storage 直接访问

**目标**: 完全移除 `this.deps.storage` 的使用

**修改点**:
- `collectCardsFromElements()` - 使用 CardApplicationService
- `filterDueCards()` - 保留（纯函数）
- `getCardService()` - 移除回退逻辑，强制使用 ApplicationContext

### Step 2: 强化 ApplicationContext 依赖

**目标**: 确保 ApplicationContext 始终可用

**修改点**:
- 构造函数添加 ApplicationContext 必需检查
- 移除所有 `if (!this.deps.applicationContext)` 的回退逻辑

### Step 3: 提取业务逻辑到应用服务

**目标**: 将复杂的业务逻辑移到 CardApplicationService

**修改点**:
- `addToFinalDrill()` - 移到 CardApplicationService
- `openRetrievalPractice()` - 保留（调用 DialogManager）
- `openIncrementalLearning()` - 保留（调用 DialogManager）

### Step 4: 更新依赖注入

**目标**: 简化依赖，只保留必要的依赖

**修改点**:
```typescript
export interface BlockMenuHandlerDeps {
  app: App;
  i18n: Record<string, string>;
  dialogManager: DialogManager;
  xiuyuanService: XiuyuanService;
  openCreateTemplateCardDialog: (blockIds: string[]) => Promise<void>;
  openNeuralReviewDialog: (options?: {...}) => Promise<void>;
  applicationContext: ApplicationContext;  // ✅ 必需
}
```

---

## ✅ 验收标准

- [ ] 移除所有 `this.deps.storage` 的使用
- [ ] ApplicationContext 成为必需依赖
- [ ] 所有业务逻辑通过 ApplicationContext 访问
- [ ] 编译成功，无类型错误
- [ ] 功能测试通过

---

## 🚀 开始实施

让我们开始迁移...
