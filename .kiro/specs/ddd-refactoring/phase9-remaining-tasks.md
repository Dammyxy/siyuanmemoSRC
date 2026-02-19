# Phase 9 剩余任务清单

更新时间：2026-02-19

## 已完成任务 ✅

1. ✅ Task 1: 创建 TabApplicationService
2. ✅ Task 2: 增强 CardApplicationService 批量操作
3. ✅ Task 3: 重构 UI Composables 使用 TabApplicationService
4. ✅ Task 4: 重构 DeckDataSource 移除直接 storage 访问
5. ✅ Task 5: 重构 XiuyuanSyncService DDD 化
6. ✅ Task 6: 重构 CardService DDD 化

## 高优先级剩余任务 🔴

### Task 7: AutoCardHandler.ts ⏭️

**问题**：15+ 处直接访问 storage

**直接 storage 访问位置**：
- 行 200, 256, 293: `this.storage.getSettings()` - 获取设置
- 行 362: `await this.storage.saveCards()` - 保存卡片
- 行 379, 578: `this.storage.getSettings()` - 获取设置
- 行 394, 1370: `this.storage.getCardByBlockId()` - 查询卡片
- 行 699-700, 754-755, 997-998, 1149-1150, 1258-1259, 1648-1649, 1841-1842: `this.storage.setCard()` + `saveCards()` - 创建卡片

**重构策略**：
1. 添加 `getCardService()` 方法
2. 使用 `cardService.batchCreateCardsWithoutEvents()` 批量创建
3. 保持向后兼容

**预计时间**：2-3 小时

### Task 8: ReviewService.ts ⏭️

**问题**：10+ 处直接访问 storage 和 plugin.app

**直接访问位置**：
- 行 91, 93, 136: 直接访问 `plugin.storage`
- 行 102, 151, 201, 262, 309, 354, 433: 直接传递 `plugin.app` 给 UI 组件

**重构策略**：
1. 使用 ReviewApplicationService
2. 使用 DialogManager 替代直接传递 plugin.app
3. 保持向后兼容

**预计时间**：2-3 小时

### Task 9: MenuService.ts ⏭️

**问题**：依赖注入不完整，缺少 DialogManager

**重构策略**：
1. 在 ApplicationContext 中注入 DialogManager
2. 更新 MenuService 构造函数
3. 移除直接回调函数调用

**预计时间**：1-2 小时

### Task 10: BlockMenuHandler.ts ⏭️

**问题**：行 1006 直接访问 `plugin.unifiedDataSourceManager`

**重构策略**：
1. 通过构造函数注入 UnifiedDataSourceManager
2. 更新 ApplicationContext 中的创建逻辑

**预计时间**：1 小时

### Task 11: MenuActions.ts ⏭️

**问题**：行 438 直接创建服务实例

**重构策略**：
1. 通过依赖注入获取服务
2. 更新调用方传递服务实例

**预计时间**：1 小时

### Task 12: ReviewViewController.ts ⏭️

**问题**：未集成到应用层

**重构策略**：
1. 将控制器逻辑迁移到 ReviewApplicationService
2. 或者通过 ApplicationContext 注入依赖

**预计时间**：2-3 小时

### Task 13: BlockEventHandler.ts ⏭️

**问题**：直接访问 plugin

**重构策略**：
1. 使用 CardApplicationService 处理块事件
2. 通过依赖注入获取服务

**预计时间**：1-2 小时

## 中优先级剩余任务 🟡

### Task 14: 完善 CardApplicationService

**缺少的方法**：
- `createFromTemplate()` - 从模板创建卡片
- 其他便捷方法

**预计时间**：1-2 小时

### Task 15: 完善 ReviewApplicationService

**缺少的方法**：
- `rescheduleCard()` - 重新调度卡片
- 复习队列管理方法

**预计时间**：1-2 小时

### Task 16: UnifiedDataSourceManager

**问题**：直接访问 storage

**重构策略**：
1. 使用 CardRepository 而不是直接访问 storage
2. 分离读写职责（CQRS）

**预计时间**：2-3 小时

### Task 17: 其他数据源层

**问题**：读写混合，违反 CQRS

**重构策略**：
1. 保留读取方法
2. 移除写入方法
3. 写操作通过命令

**预计时间**：2-3 小时

## 低优先级剩余任务 🟢

### Task 18: 清理遗留代码

**文件**：
- TopBar.ts - 旧菜单实现
- PluginService.ts - 应该被 DialogManager 替代
- ReviewDialogManager.ts - 旧对话框管理
- HybridSyncService.ts.backup - 备份文件

**预计时间**：1-2 小时

### Task 19: MigrationService.ts

**问题**：未通过应用层

**重构策略**：
1. 创建 MigrationApplicationService
2. 迁移逻辑到应用层

**预计时间**：2-3 小时

## 时间估算

### 高优先级（7 个任务）
- Task 7: 2-3 小时
- Task 8: 2-3 小时
- Task 9: 1-2 小时
- Task 10: 1 小时
- Task 11: 1 小时
- Task 12: 2-3 小时
- Task 13: 1-2 小时

**总计**：10-17 小时（约 2-3 个工作日）

### 中优先级（4 个任务）
- Task 14: 1-2 小时
- Task 15: 1-2 小时
- Task 16: 2-3 小时
- Task 17: 2-3 小时

**总计**：6-10 小时（约 1-2 个工作日）

### 低优先级（2 个任务）
- Task 18: 1-2 小时
- Task 19: 2-3 小时

**总计**：3-5 小时（约 0.5-1 个工作日）

## 总时间估算

**全部完成**：19-32 小时（约 3-5 个工作日）

## 优先级建议

### 第一批（立即开始）
1. Task 7: AutoCardHandler.ts
2. Task 8: ReviewService.ts
3. Task 9: MenuService.ts

### 第二批（第一批完成后）
4. Task 10: BlockMenuHandler.ts
5. Task 11: MenuActions.ts
6. Task 12: ReviewViewController.ts

### 第三批（核心功能完成后）
7. Task 13: BlockEventHandler.ts
8. Task 14-17: 完善应用服务和数据源层

### 第四批（最后清理）
9. Task 18-19: 清理遗留代码

## 关键里程碑

1. **第一批完成** → 核心服务 DDD 化完成（约 60% → 75%）
2. **第二批完成** → 所有高优先级任务完成（约 75% → 85%）
3. **第三批完成** → 中优先级任务完成（约 85% → 95%）
4. **第四批完成** → 全部 DDD 迁移完成（约 95% → 100%）

## 下一步行动

建议按照优先级顺序继续重构：
1. 先完成 AutoCardHandler.ts（最复杂，影响最大）
2. 然后 ReviewService.ts（核心服务）
3. 最后其他高优先级任务

每完成一个任务，更新进度摘要和完成文档。
