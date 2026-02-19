# Phase 10：Services 目录分析

生成时间：2026-02-19

## 当前状态

### services/ 目录中剩余的文件（19 个）

| 文件 | 状态 | 是否被使用 | 建议 |
|------|------|-----------|------|
| **已删除** ||||
| ~~PluginService.ts~~ | ✅ 已删除 | ❌ | - |
| ~~CardService.ts~~ | ✅ 已删除 | ❌ | - |
| ~~ReviewService.ts~~ | ✅ 已删除 | ❌ | - |
| **核心服务** ||||
| DialogService.ts | ⚠️ 过渡 | ✅ ApplicationContext | 🔄 正在被 DialogManager 替代 |
| MenuService.ts | ⚠️ 过渡 | ✅ ApplicationContext | 🔄 正在被 MenuManager 替代 |
| ReviewDialogManager.ts | ⚠️ 过渡 | ✅ ApplicationContext, BlockMenuHandler | 🔄 功能应迁移到 DialogManager |
| BlockMenuHandler.ts | ✅ 活跃 | ✅ ApplicationContext | ✅ 保留（DDD 化） |
| **同步服务** ||||
| XiuyuanSyncService.ts | ✅ 活跃 | ✅ ApplicationContext | ✅ 保留（已 DDD 化） |
| XiuyuanSyncService.types.ts | ✅ 活跃 | ✅ | ✅ 保留 |
| ReviewSyncManager.ts | ⚠️ 可选 | ✅ | 🔄 可能需要重构 |
| **WebSocket 服务** ||||
| TransactionWebSocketService.ts | ✅ 活跃 | ✅ ApplicationContext | ✅ 保留 |
| QuickCardWebSocketService.ts | ✅ 活跃 | ✅ | ✅ 保留 |
| **Handler** ||||
| handlers/AutoCardHandler.ts | ✅ 活跃 | ✅ ApplicationContext | ✅ 保留（已 DDD 化） |
| handlers/RiffSyncHandler.ts | ✅ 活跃 | ✅ ApplicationContext | ✅ 保留 |
| **ReviewEntry 类** ||||
| ReviewEntryBase.ts | ⚠️ 遗留 | ✅ 其他 Entry 类 | 🗑️ 应删除 |
| FinalDrillEntry.ts | ⚠️ 遗留 | ✅ BlockMenuHandler | 🗑️ 应删除 |
| IncrementalLearningEntry.ts | ⚠️ 遗留 | ✅ BlockMenuHandler | 🗑️ 应删除 |
| RetrievalPracticeEntry.ts | ⚠️ 遗留 | ✅ BlockMenuHandler | 🗑️ 应删除 |
| TemporaryDrillEntry.ts | ⚠️ 遗留 | ✅ BlockMenuHandler | 🗑️ 应删除 |
| AddToFinalDrillEntry.ts | ⚠️ 遗留 | ✅ BlockMenuHandler | 🗑️ 应删除 |
| **其他** ||||
| MigrationService.ts | ⚠️ 可选 | ✅ 测试 | 🔄 可能需要迁移 |
| MigrateQueueDataService.ts | ⚠️ 可选 | ✅ | 🔄 可能需要迁移 |
| RiffCleanupService.ts | ⚠️ 可选 | ✅ | 🔄 可能需要迁移 |
| QueueHelpers.ts | ⚠️ 可选 | ✅ | 🔄 可能需要迁移到 utils |
| HybridSyncService.ts.backup | 🗑️ 备份 | ❌ | 🗑️ 应删除 |
| index.ts | ✅ 导出 | ✅ | ✅ 保留 |

## 双系统并存

### 对话框管理

**旧系统**（services/）：
- DialogService
- ReviewDialogManager

**新系统**（application/managers/）：
- DialogManager

**状态**：
- ApplicationContext 同时使用两套系统
- DialogService 和 ReviewDialogManager 还在被使用
- DialogManager 已经实现但功能可能不完整

### 菜单管理

**旧系统**（services/）：
- MenuService

**新系统**（application/managers/）：
- MenuManager

**状态**：
- ApplicationContext 同时使用两套系统
- MenuService 还在被使用
- MenuManager 已经实现

## 问题分析

### 为什么还保留旧系统？

1. **功能完整性**：新系统可能还没有实现所有功能
2. **向后兼容**：保证现有代码正常运行
3. **渐进迁移**：Phase 9 采用了渐进式策略

### 迁移风险

如果现在删除 DialogService、MenuService、ReviewDialogManager：
- ❌ 可能破坏现有功能
- ❌ 需要大量测试
- ❌ 可能需要补充 DialogManager 的功能

## 建议方案

### 方案 A：激进删除（高风险）

**步骤**：
1. 删除 DialogService、MenuService、ReviewDialogManager
2. 将所有引用改为使用 DialogManager、MenuManager
3. 补充缺失的功能
4. 大量测试

**风险**：高
**时间**：4-6 小时

### 方案 B：保守保留（低风险）

**步骤**：
1. 保留 DialogService、MenuService、ReviewDialogManager
2. 只删除明确的遗留代码（ReviewEntry 类等）
3. 标记为 @deprecated
4. 在未来版本中逐步迁移

**风险**：低
**时间**：1-2 小时

### 方案 C：混合策略（推荐）

**步骤**：
1. 删除明确的遗留代码：
   - ✅ ReviewEntry 类（6 个文件）
   - ✅ HybridSyncService.ts.backup
   - ✅ 可选的 Migration 和 Cleanup 服务
2. 保留核心服务：
   - ✅ DialogService、MenuService、ReviewDialogManager
   - ✅ BlockMenuHandler
   - ✅ XiuyuanSyncService
   - ✅ TransactionWebSocketService
   - ✅ QuickCardWebSocketService
3. 标记为 @deprecated，计划未来迁移

**风险**：低
**时间**：1-2 小时

## 决定

**采用方案 C：混合策略**

### 立即删除（Phase 10.5-10.6）

1. ✅ ReviewEntry 类（6 个文件）
2. ✅ HybridSyncService.ts.backup
3. ⏭️ MigrationService.ts（可选）
4. ⏭️ MigrateQueueDataService.ts（可选）
5. ⏭️ RiffCleanupService.ts（可选）
6. ⏭️ QueueHelpers.ts（可选）

### 保留并标记 @deprecated

1. ✅ DialogService
2. ✅ MenuService
3. ✅ ReviewDialogManager
4. ✅ BlockMenuHandler
5. ✅ XiuyuanSyncService
6. ✅ TransactionWebSocketService
7. ✅ QuickCardWebSocketService
8. ✅ ReviewSyncManager

### 未来迁移（Phase 11+）

1. 完善 DialogManager 功能
2. 将 DialogService 功能迁移到 DialogManager
3. 将 MenuService 功能迁移到 MenuManager
4. 将 ReviewDialogManager 功能迁移到 DialogManager
5. 删除旧系统

## 时间估算

| 任务 | 预计时间 |
|------|---------|
| 删除 ReviewEntry 类（6 个） | 30m |
| 删除备份文件 | 5m |
| 删除可选服务（4 个） | 30m |
| 标记 @deprecated | 15m |
| 测试编译 | 10m |
| **总计** | **1.5h** |

---

**结论**：采用混合策略，删除明确的遗留代码，保留核心服务并标记为 @deprecated。
