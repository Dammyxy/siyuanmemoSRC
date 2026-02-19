# Phase 11：完全 DDD 迁移计划

生成时间：2026-02-19
状态：📋 规划中

## 目标

彻底完成 DDD 架构迁移，删除所有旧代码和过渡期服务，实现 100% DDD 合规。

## 当前状态分析

### DDD 合规率：82%

**已完成**：
- ✅ 核心领域层（Card, Xiuyuan）
- ✅ 应用服务层（CardApplicationService, ReviewApplicationService, BrowserApplicationService）
- ✅ 新架构管理器（DialogManager, MenuManager, TabManager）
- ✅ 统一数据源架构
- ✅ 事件总线和领域事件

**待迁移**：
- ⚠️ DialogService → DialogManager（功能不完整）
- ⚠️ MenuService → MenuManager（功能不完整）
- ⚠️ ReviewDialogManager → DialogManager（功能不完整）
- ⚠️ BlockMenuHandler（部分依赖旧服务）

### 旧服务依赖分析

#### 1. DialogService（标记为 @deprecated）

**被使用的地方**：
- ApplicationContext.getDialogService()
- 可能被一些旧代码直接调用

**功能**：
- 管理对话框的创建和销毁
- 提供统一的对话框接口

**迁移目标**：
- 完全迁移到 DialogManager
- DialogManager 需要实现所有 DialogService 的功能

#### 2. MenuService（标记为 @deprecated）

**被使用的地方**：
- ApplicationContext.getMenuService()
- 可能被一些旧代码直接调用

**功能**：
- 管理菜单的创建和更新
- 提供统一的菜单接口

**迁移目标**：
- 完全迁移到 MenuManager
- MenuManager 需要实现所有 MenuService 的功能

#### 3. ReviewDialogManager（标记为 @deprecated）

**被使用的地方**：
- ApplicationContext.getReviewDialogManager()
- BlockMenuHandler（大量使用）

**功能**：
- 打开各种复习对话框
- 管理复习会话

**迁移目标**：
- 完全迁移到 DialogManager
- DialogManager 需要实现所有复习对话框功能

#### 4. BlockMenuHandler（已 DDD 化，但依赖旧服务）

**依赖的旧服务**：
- ReviewDialogManager（用于打开复习对话框）

**功能**：
- 处理块菜单事件
- 创建和管理块菜单项

**迁移目标**：
- 移除对 ReviewDialogManager 的依赖
- 直接使用 DialogManager

## 迁移策略

### 方案 A：激进迁移（推荐）

**优点**：
- 彻底清理旧代码
- 实现 100% DDD 合规
- 代码库更清晰

**缺点**：
- 需要大量测试
- 可能引入新 bug
- 开发时间较长（4-6 小时）

**步骤**：
1. 完善 DialogManager 功能
2. 完善 MenuManager 功能
3. 将 ReviewDialogManager 的所有功能迁移到 DialogManager
4. 更新 BlockMenuHandler，移除对 ReviewDialogManager 的依赖
5. 删除 DialogService、MenuService、ReviewDialogManager
6. 更新 ApplicationContext，移除旧服务
7. 全面测试

### 方案 B：保守迁移（不推荐）

**优点**：
- 风险低
- 开发时间短

**缺点**：
- 无法实现 100% DDD 合规
- 代码库仍有技术债务
- 未来仍需迁移

**步骤**：
1. 保留所有旧服务
2. 标记为 @deprecated
3. 在未来版本中逐步迁移

## Phase 11 任务分解

### Task 11.1：完善 DialogManager（1.5 小时）

**目标**：实现 ReviewDialogManager 的所有功能

**子任务**：
1. ✅ 分析 ReviewDialogManager 的所有方法
2. ✅ 在 DialogManager 中实现缺失的方法：
   - `openRetrievalPracticeWithFilter(options)`
   - `openIncrementalLearningWithFilter(options)`
   - `openTemporaryDrill(blockIds)`
   - `openFinalDrill()`
   - `openNeuralRoam()`
   - `openDrillWithCards(cards, source)`
3. ✅ 确保所有方法的功能与 ReviewDialogManager 一致
4. ✅ 添加单元测试

**验收标准**：
- DialogManager 实现了 ReviewDialogManager 的所有功能
- 所有测试通过
- 编译成功

### Task 11.2：更新 BlockMenuHandler（1 小时）

**目标**：移除对 ReviewDialogManager 的依赖

**子任务**：
1. ✅ 将 BlockMenuHandler 的 `reviewDialogManager` 依赖改为 `dialogManager`
2. ✅ 更新所有调用 ReviewDialogManager 方法的地方
3. ✅ 确保所有功能正常工作
4. ✅ 添加单元测试

**验收标准**：
- BlockMenuHandler 不再依赖 ReviewDialogManager
- 所有功能正常工作
- 编译成功

### Task 11.3：删除旧服务（30 分钟）

**目标**：删除 DialogService、MenuService、ReviewDialogManager

**子任务**：
1. ✅ 删除 `src/services/DialogService.ts`
2. ✅ 删除 `src/services/MenuService.ts`
3. ✅ 删除 `src/services/ReviewDialogManager.ts`
4. ✅ 更新 `src/services/index.ts`，移除导出
5. ✅ 确保编译成功

**验收标准**：
- 旧服务文件已删除
- 编译成功
- 无引用错误

### Task 11.4：更新 ApplicationContext（30 分钟）

**目标**：移除对旧服务的引用

**子任务**：
1. ✅ 移除 `dialogService`、`menuService`、`reviewDialogManager` 字段
2. ✅ 移除 `getDialogService()`、`getMenuService()`、`getReviewDialogManager()` 方法
3. ✅ 更新构造函数，移除旧服务参数
4. ✅ 更新 `create()` 工厂方法，移除旧服务创建
5. ✅ 确保编译成功

**验收标准**：
- ApplicationContext 不再引用旧服务
- 编译成功
- 所有功能正常工作

### Task 11.5：清理可选服务（30 分钟）

**目标**：评估并删除可选服务

**可选服务列表**：
- MigrationService（一次性迁移工具）
- MigrateQueueDataService（一次性迁移工具）
- RiffCleanupService（维护工具）
- QueueHelpers（工具模块）
- ReviewSyncManager（需要重构）

**子任务**：
1. ✅ 评估每个服务的使用情况
2. ✅ 决定保留或删除
3. ✅ 如果删除，更新所有引用
4. ✅ 确保编译成功

**建议**：
- 删除 MigrationService（已完成迁移）
- 删除 MigrateQueueDataService（已完成迁移）
- 保留 RiffCleanupService（维护工具）
- 将 QueueHelpers 迁移到 utils
- 重构 ReviewSyncManager

**验收标准**：
- 可选服务已评估
- 不需要的服务已删除
- 编译成功

### Task 11.6：全面测试（1 小时）

**目标**：确保所有功能正常工作

**测试范围**：
1. ✅ 块菜单功能
   - 提取练习
   - 渐进学习
   - 临时练习
   - 添加到刻意练习
   - 制作概念卡
2. ✅ 对话框功能
   - 复习对话框
   - 浏览器对话框
   - 设置对话框
3. ✅ 菜单功能
   - 顶栏菜单
   - 块菜单
   - 文档树菜单
4. ✅ 卡片操作
   - 创建卡片
   - 删除卡片
   - 更新卡片
   - 复习卡片

**验收标准**：
- 所有功能正常工作
- 无明显 bug
- 用户体验良好

## 时间估算

| 任务 | 预计时间 | 优先级 |
|------|---------|--------|
| Task 11.1 | 1.5h | 高 |
| Task 11.2 | 1h | 高 |
| Task 11.3 | 30m | 高 |
| Task 11.4 | 30m | 高 |
| Task 11.5 | 30m | 中 |
| Task 11.6 | 1h | 高 |
| **总计** | **5h** | - |

## 风险评估

### 高风险

1. **功能缺失**：DialogManager 可能缺少某些 ReviewDialogManager 的功能
   - 缓解措施：仔细对比两者的方法，确保完全实现
   
2. **引用错误**：可能有隐藏的旧服务引用
   - 缓解措施：使用 grepSearch 全面搜索引用

### 中风险

1. **测试不充分**：可能遗漏某些边缘情况
   - 缓解措施：制定详细的测试计划

2. **用户体验变化**：新架构可能改变某些行为
   - 缓解措施：确保行为一致性

### 低风险

1. **编译错误**：TypeScript 会捕获大部分错误
   - 缓解措施：逐步迁移，每步都编译测试

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

### 可选达成

1. ⏭️ 性能优化
2. ⏭️ 添加更多单元测试
3. ⏭️ 改进文档

## 回滚计划

如果迁移失败，可以回滚到 Phase 10 的状态：

1. 恢复删除的文件（从 git 历史）
2. 恢复 ApplicationContext 的旧服务引用
3. 恢复 BlockMenuHandler 的旧依赖
4. 重新编译和测试

## 下一步

**立即开始 Task 11.1**：完善 DialogManager 功能

---

**Phase 11 状态：📋 规划完成，等待执行**
