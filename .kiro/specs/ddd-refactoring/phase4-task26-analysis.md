# Phase 4 - Task 26 分析：移除旧架构组件

> 分析时间：2026-02-19

## 🔍 旧架构组件使用情况

### 1. RetrievalPracticeProvider（已标记 @deprecated）
**定义位置：** `src/ui/review/v2/providers/RetrievalPracticeProvider.ts`

**使用情况：**
- ✅ 测试文件中使用（可保留）
- ❌ 生产代码中使用：
  - `src/managers/UIManager.ts`
  - `src/services/DialogService.ts`
  - `src/services/ReviewService.ts`
  - `src/services/ReviewDialogManager.ts`

**说明：** 旧架构 Provider 层，新代码应直接使用 `RetrievalPracticeQueue`

### 2. FinalDrillProvider（已标记 @deprecated）
**定义位置：** `src/ui/review/v2/providers/FinalDrillProvider.ts`

**使用情况：**
- ❌ 生产代码中使用：
  - `src/managers/UIManager.ts`
  - `src/services/ReviewService.ts`

**说明：** 旧架构 Provider 层，新代码应直接使用 `FinalDrillQueue`

### 3. IncrementalLearningProvider（已标记 @deprecated）
**定义位置：** `src/ui/review/v2/providers/IncrementalLearningProvider.ts`

**使用情况：** 需要进一步检查

### 4. 旧的 Adapter 类（已标记 @deprecated）
**定义位置：**
- `src/ui/review/v2/adapters/RetrievalPracticeAdapter.ts`
- `src/ui/review/v2/adapters/FinalDrillAdapter.ts`
- `src/ui/review/v2/adapters/LeechAdapter.ts`

**使用情况：**
- ❌ 大量生产代码使用：
  - `src/managers/UIManager.ts`
  - `src/services/DialogService.ts`
  - `src/services/ReviewService.ts`
  - `src/services/ReviewDialogManager.ts`

**说明：** 应使用 `UnifiedReviewAdapter` 代替

### 5. PluginAssembler（已标记 @deprecated）
**定义位置：** `src/core/application/PluginAssembler.ts`

**使用情况：**
- ❌ 生产代码中使用：
  - `src/managers/UIManager.ts` - 导入 `PluginUIAssembler`
  - `src/handlers/BlockEventHandler.ts` - 导入 `BlockMenuAssembler`

**说明：** 旧架构的组装器，已被 `ApplicationContext` 替代

### 6. 旧的 DockManager（已标记 @deprecated）
**定义位置：** `src/ui/dock/DockManager.ts`

**使用情况：**
- ✅ 没有生产代码使用（已完全迁移）

**说明：** 可以安全删除

### 7. MigrateQueueDataService
**定义位置：** `src/services/MigrateQueueDataService.ts`

**使用情况：**
- ✅ 只在示例代码中出现，没有实际使用

**说明：** 一次性迁移工具，如果迁移已完成可以删除

---

## 📊 问题分析

### 核心问题
1. **Provider 层还在使用**：虽然标记为 @deprecated，但大量生产代码还在使用
2. **Adapter 层还在使用**：应该迁移到 `UnifiedReviewAdapter`
3. **PluginAssembler 还在使用**：应该迁移到 `ApplicationContext`

### 迁移难度评估
- 🔴 **高难度**：Adapter 和 Provider 的迁移（涉及多个服务类）
- 🟡 **中难度**：PluginAssembler 的迁移
- 🟢 **低难度**：删除旧的 DockManager 和 MigrateQueueDataService

---

## 🎯 Task 26 调整建议

由于发现大量旧架构组件还在使用，建议将 Task 26 拆分为多个子任务：

### Task 26.1: 删除完全未使用的组件（快速胜利）✅
- [x] 删除 `src/ui/dock/DockManager.ts`（旧的 DockManager）
- [x] 评估并决定是否删除 `MigrateQueueDataService`

### Task 26.2: 迁移 PluginAssembler 使用方（中等优先级）
- [ ] 重构 `src/managers/UIManager.ts` 移除 `PluginUIAssembler`
- [ ] 重构 `src/handlers/BlockEventHandler.ts` 移除 `BlockMenuAssembler`
- [ ] 删除 `src/core/application/PluginAssembler.ts`

### Task 26.3: 迁移到 UnifiedReviewAdapter（低优先级，可延后）
- [ ] 分析 `UnifiedReviewAdapter` 的功能
- [ ] 重构所有使用旧 Adapter 的地方
- [ ] 删除旧的 Adapter 类

### Task 26.4: 移除 Provider 层（低优先级，可延后）
- [ ] 重构所有使用 Provider 的地方直接使用 Queue
- [ ] 删除 Provider 类

---

## 💡 建议

1. **先做 Task 26.1**：快速删除完全未使用的代码，获得快速胜利
2. **Task 26.2 可以做**：PluginAssembler 的迁移相对独立
3. **Task 26.3 和 26.4 可以延后**：这些涉及复习界面的核心逻辑，需要更多测试

---

## 🔗 相关文档

- [统一架构计划](./unified-architecture-plan.md)
- [任务列表](./tasks.md)
