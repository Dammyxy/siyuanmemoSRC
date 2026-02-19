# DDD 架构审计总结

生成时间：2026-02-19

## 🎯 核心发现

经过全面审计，发现插件源码中仍有以下未 DDD 化的关键问题：

### 1. 旧服务层（src/services/）- 24 个文件
- CardService.ts：直接访问 storage
- ReviewService.ts：直接访问 storage 和 app
- XiuyuanSyncService.ts：直接操作 storage，绕过领域事件
- MenuService.ts：依赖注入不完整
- BlockMenuHandler.ts：直接访问 plugin 属性
- AutoCardHandler.ts：多处直接访问 storage
- MigrationService.ts：未通过应用层协调

### 2. UI 组件违反分层
- useContextMenu.ts：直接访问 plugin.app
- useGridInteractions.ts：直接访问 plugin.app
- DeckDataSource.ts：直接修改 storage
- MenuActions.ts：直接创建服务实例

### 3. 应用服务不完整
- CardApplicationService：缺少批量删除、模板创建
- ReviewApplicationService：缺少 rescheduleCard
- TabManager：缺少 openDocumentTab

### 4. 控制器未集成
- ReviewViewController：未通过应用层
- BlockEventHandler：直接访问 plugin

## 📊 统计数据

- 高优先级问题：12 个
- 中优先级问题：8 个
- 低优先级问题：4 个
- 总计：24 个待修复问题

## 🚀 修复路线图

### 阶段 1：应用服务完善（1-2 天）
1. 创建 TabApplicationService
2. 完善 CardApplicationService（批量操作）
3. 完善 ReviewApplicationService（reschedule）
4. 创建 SyncApplicationService

### 阶段 2：旧服务迁移（2-3 天）
5. 迁移 CardService → CardApplicationService
6. 迁移 ReviewService → ReviewApplicationService
7. 迁移 AutoCardHandler → CardApplicationService
8. 修复 MenuService 依赖注入

### 阶段 3：UI 层重构（1-2 天）
9. 重构 useContextMenu 使用 TabApplicationService
10. 重构 useGridInteractions 使用 TabApplicationService
11. 分离 DeckDataSource 读写职责
12. 修复 MenuActions 依赖注入

### 阶段 4：清理遗留代码（1 天）
13. 删除或迁移 TopBar.ts
14. 删除或迁移 PluginService.ts
15. 评估 ReviewDialogManager 迁移
16. 删除备份文件

## ⚠️ 关键风险

1. **同步服务重构**：XiuyuanSyncService 直接操作 storage，重构可能影响同步逻辑
2. **UI 组件依赖**：多个组件直接依赖 plugin，需要逐步迁移
3. **向后兼容**：部分旧服务可能被外部代码引用

## ✅ 建议行动

1. 优先修复高优先级问题（阻塞功能）
2. 逐步迁移中优先级问题（功能不完整）
3. 最后清理低优先级问题（遗留代码）
4. 每个阶段完成后进行全面测试

详细审计报告：comprehensive-ddd-audit-2026-02-19.md
