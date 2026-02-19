# 完整 DDD 迁移路线图

生成时间：2026-02-19
状态：📋 规划完成

## 概述

本文档描述了从当前 82% DDD 合规率到 100% DDD 合规率的完整迁移路线图。

## 当前状态

### DDD 合规率：82%

**已完成的工作**：
- ✅ Phase 1-9：核心领域层、应用服务层、UI 管理器
- ✅ Phase 10：删除 ~2660 行遗留代码
- ✅ 统一数据源架构
- ✅ 事件总线和领域事件

**剩余工作**：
- ⚠️ 3 个过渡期服务（DialogService, MenuService, ReviewDialogManager）
- ⚠️ BlockMenuHandler 依赖旧服务

## 迁移目标

### 最终目标

1. **100% DDD 合规**：删除所有标记为 @deprecated 的旧服务
2. **架构统一**：所有功能使用新架构实现
3. **代码清晰**：易于维护和扩展
4. **功能完整**：保留所有现有功能

### 成功标准

1. ✅ 编译成功，无错误
2. ✅ 所有功能正常工作
3. ✅ 无旧服务引用
4. ✅ 代码库更清晰

## Phase 11：完全 DDD 迁移

### 总览

| 任务 | 目标 | 预计时间 | 优先级 |
|------|------|---------|--------|
| Task 11.1 | 完善 DialogManager | 1.5h | 高 |
| Task 11.2 | 更新 BlockMenuHandler | 1h | 高 |
| Task 11.3 | 删除旧服务 | 30m | 高 |
| Task 11.4 | 更新 ApplicationContext | 30m | 高 |
| Task 11.5 | 清理可选服务 | 30m | 中 |
| Task 11.6 | 全面测试 | 1h | 高 |
| **总计** | - | **5h** | - |

### Task 11.1：完善 DialogManager（1.5 小时）

**目标**：实现 ReviewDialogManager 的所有功能

**需要实现的方法**：
1. `openRetrievalPracticeWithFilter(options)` - 打开提取练习（带过滤）
2. `openIncrementalLearningWithFilter(options)` - 打开渐进学习（带过滤）
3. `openTemporaryDrill(blockIds)` - 打开临时练习
4. `openFinalDrill()` - 打开刻意练习
5. `openNeuralRoam(options?)` - 打开神经漫游

**详细计划**：见 `phase11-task11.1-dialogmanager-implementation.md`

### Task 11.2：更新 BlockMenuHandler（1 小时）

**目标**：移除对 ReviewDialogManager 的依赖

**步骤**：
1. 将 `reviewDialogManager` 依赖改为 `dialogManager`
2. 更新所有调用 ReviewDialogManager 方法的地方
3. 确保所有功能正常工作
4. 添加单元测试

**修改的文件**：
- `src/services/BlockMenuHandler.ts`

**修改的方法**：
- `openRetrievalPractice()` → 调用 `dialogManager.openRetrievalPracticeWithFilter()`
- `openIncrementalLearning()` → 调用 `dialogManager.openIncrementalLearningWithFilter()`
- `openTemporaryDrill()` → 调用 `dialogManager.openTemporaryDrill()`
- `addToFinalDrill()` → 调用 `dialogManager.openFinalDrill()`
- `makeConceptAndAddToRoam()` → 调用 `dialogManager.openNeuralRoam()`

### Task 11.3：删除旧服务（30 分钟）

**目标**：删除 DialogService、MenuService、ReviewDialogManager

**删除的文件**：
1. `src/services/DialogService.ts` (~200 行)
2. `src/services/MenuService.ts` (~300 行)
3. `src/services/ReviewDialogManager.ts` (~700 行)

**更新的文件**：
- `src/services/index.ts` - 移除导出

**预期结果**：
- 删除 ~1200 行代码
- 编译成功
- 无引用错误

### Task 11.4：更新 ApplicationContext（30 分钟）

**目标**：移除对旧服务的引用

**修改的内容**：
1. 移除字段：
   - `private dialogService: DialogService`
   - `private menuService: MenuService`
   - `private reviewDialogManager: ReviewDialogManager`

2. 移除方法：
   - `getDialogService()`
   - `getMenuService()`
   - `getReviewDialogManager()`

3. 更新构造函数：
   - 移除旧服务参数

4. 更新 `create()` 工厂方法：
   - 移除旧服务创建

**预期结果**：
- ApplicationContext 不再引用旧服务
- 编译成功
- 所有功能正常工作

### Task 11.5：清理可选服务（30 分钟）

**目标**：评估并删除可选服务

**可选服务列表**：
1. MigrationService（一次性迁移工具）
2. MigrateQueueDataService（一次性迁移工具）
3. RiffCleanupService（维护工具）
4. QueueHelpers（工具模块）
5. ReviewSyncManager（需要重构）

**建议**：
- ✅ 删除 MigrationService（已完成迁移）
- ✅ 删除 MigrateQueueDataService（已完成迁移）
- ✅ 保留 RiffCleanupService（维护工具）
- ✅ 将 QueueHelpers 迁移到 utils
- ✅ 重构 ReviewSyncManager

**预期结果**：
- 删除 ~500 行代码
- 编译成功
- 代码库更清晰

### Task 11.6：全面测试（1 小时）

**目标**：确保所有功能正常工作

**测试范围**：

#### 1. 块菜单功能
- ✅ 提取练习 - 到期
- ✅ 提取练习 - 全部
- ✅ 渐进学习 - 到期
- ✅ 渐进学习 - 全部
- ✅ 临时练习
- ✅ 添加到刻意练习
- ✅ 制作概念卡并加入队列
- ✅ 制作概念卡并立即漫游

#### 2. 对话框功能
- ✅ 提取练习对话框
- ✅ 渐进学习对话框
- ✅ 刻意练习对话框
- ✅ 神经漫游对话框
- ✅ 浏览器对话框
- ✅ 设置对话框

#### 3. 菜单功能
- ✅ 顶栏菜单
- ✅ 块菜单
- ✅ 文档树菜单
- ✅ 编辑器标题图标菜单
- ✅ 面包屑更多菜单

#### 4. 卡片操作
- ✅ 创建卡片
- ✅ 删除卡片
- ✅ 更新卡片
- ✅ 复习卡片
- ✅ 编辑 SRS 数据

**测试方法**：
1. 手动测试所有功能
2. 检查控制台是否有错误
3. 验证用户体验是否一致

## 迁移后的架构

### 服务层次

```
┌─────────────────────────────────────────┐
│         UI Layer (Vue Components)       │
├─────────────────────────────────────────┤
│      Application Layer (Managers)       │
│  - DialogManager                        │
│  - MenuManager                          │
│  - TabManager                           │
│  - DockManager                          │
│  - PracticeQueueManager                 │
├─────────────────────────────────────────┤
│   Application Layer (Services)          │
│  - CardApplicationService               │
│  - ReviewApplicationService             │
│  - BrowserApplicationService            │
│  - XiuyuanApplicationService            │
│  - TabApplicationService                │
├─────────────────────────────────────────┤
│         Domain Layer (Entities)         │
│  - Card                                 │
│  - Xiuyuan                              │
│  - Queue                                │
├─────────────────────────────────────────┤
│    Infrastructure Layer (Repositories)  │
│  - XiuyuanRepository                    │
│  - StorageManager                       │
└─────────────────────────────────────────┘
```

### 依赖关系

```
UI Components
    ↓
Managers (DialogManager, MenuManager, etc.)
    ↓
Application Services (CardApplicationService, etc.)
    ↓
Domain Services & Entities
    ↓
Repositories & Infrastructure
```

### 数据流

```
User Action
    ↓
UI Component
    ↓
Manager (DialogManager)
    ↓
Application Service (CardApplicationService)
    ↓
Use Case (CreateCardUseCase)
    ↓
Domain Service (CardCreationService)
    ↓
Repository (XiuyuanRepository)
    ↓
Infrastructure (StorageManager)
```

## 风险评估

### 高风险

1. **功能缺失**：DialogManager 可能缺少某些 ReviewDialogManager 的功能
   - 缓解措施：仔细对比两者的方法，确保完全实现
   - 回滚计划：从 git 历史恢复旧服务

2. **引用错误**：可能有隐藏的旧服务引用
   - 缓解措施：使用 grepSearch 全面搜索引用
   - 回滚计划：修复引用或恢复旧服务

### 中风险

1. **测试不充分**：可能遗漏某些边缘情况
   - 缓解措施：制定详细的测试计划
   - 回滚计划：修复 bug 或恢复旧服务

2. **用户体验变化**：新架构可能改变某些行为
   - 缓解措施：确保行为一致性
   - 回滚计划：调整实现或恢复旧服务

### 低风险

1. **编译错误**：TypeScript 会捕获大部分错误
   - 缓解措施：逐步迁移，每步都编译测试
   - 回滚计划：修复编译错误

## 回滚计划

如果迁移失败，可以回滚到 Phase 10 的状态：

### 回滚步骤

1. **恢复删除的文件**：
   ```bash
   git checkout HEAD~1 -- src/services/DialogService.ts
   git checkout HEAD~1 -- src/services/MenuService.ts
   git checkout HEAD~1 -- src/services/ReviewDialogManager.ts
   ```

2. **恢复 ApplicationContext**：
   ```bash
   git checkout HEAD~1 -- src/application/ApplicationContext.ts
   ```

3. **恢复 BlockMenuHandler**：
   ```bash
   git checkout HEAD~1 -- src/services/BlockMenuHandler.ts
   ```

4. **重新编译和测试**：
   ```bash
   npm run build
   ```

### 回滚条件

触发回滚的条件：
1. 编译失败且无法快速修复
2. 核心功能无法正常工作
3. 发现严重 bug 且无法快速修复
4. 用户体验严重下降

## 成功标准

### 必须达成

1. ✅ DDD 合规率达到 100%
2. ✅ 删除所有标记为 @deprecated 的旧服务
3. ✅ 编译成功，无错误
4. ✅ 所有核心功能正常工作

### 期望达成

1. ✅ 代码库更清晰，易于维护
2. ✅ 架构更统一，符合 DDD 原则
3. ✅ 技术债务大幅减少
4. ✅ 删除 ~1700 行代码（旧服务 + 可选服务）

### 可选达成

1. ⏭️ 性能优化
2. ⏭️ 添加更多单元测试
3. ⏭️ 改进文档
4. ⏭️ 重构 ReviewSyncManager

## 时间线

### 预计时间：5 小时

| 时间段 | 任务 | 状态 |
|--------|------|------|
| 0:00 - 1:30 | Task 11.1：完善 DialogManager | 📋 待开始 |
| 1:30 - 2:30 | Task 11.2：更新 BlockMenuHandler | 📋 待开始 |
| 2:30 - 3:00 | Task 11.3：删除旧服务 | 📋 待开始 |
| 3:00 - 3:30 | Task 11.4：更新 ApplicationContext | 📋 待开始 |
| 3:30 - 4:00 | Task 11.5：清理可选服务 | 📋 待开始 |
| 4:00 - 5:00 | Task 11.6：全面测试 | 📋 待开始 |

### 里程碑

1. **Milestone 1**（1.5h）：DialogManager 功能完整
2. **Milestone 2**（2.5h）：BlockMenuHandler 迁移完成
3. **Milestone 3**（3.5h）：旧服务全部删除
4. **Milestone 4**（5h）：全面测试通过，100% DDD 合规

## 下一步

**立即开始 Task 11.1**：完善 DialogManager 功能

详细计划见：`phase11-task11.1-dialogmanager-implementation.md`

---

**Phase 11 状态：📋 规划完成，等待执行**

**预计完成时间：5 小时**

**预计 DDD 合规率：100%**

**预计删除代码：~1700 行**
