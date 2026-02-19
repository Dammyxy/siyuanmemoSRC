# 思源笔记插件 DDD 架构全面审计报告

生成时间：2026-02-19
审计范围：siyuan-plugin-siyuanmemo 全部源码

## 📊 总体评估

### 架构迁移状态
- ✅ 已完成 DDD 化：约 60%
- ⚠️ 部分 DDD 化：约 25%
- ❌ 未 DDD 化：约 15%

### 核心问题
1. **旧服务层未完全迁移**：src/services/ 下仍有 24 个服务文件直接访问基础设施
2. **UI 组件违反分层**：多个 Vue 组件和 composables 直接访问 plugin 对象
3. **同步服务职责混乱**：XiuyuanSyncService 直接操作 storage，未使用仓储模式
4. **控制器未集成**：ReviewViewController 等控制器未通过应用层协调

---

## 🔴 高优先级问题（阻塞功能）

### 1. 旧服务层直接访问基础设施

#### 问题文件

**src/services/CardService.ts**
- 行 82, 136, 144, 174, 182：直接访问 `plugin.storage`
- 问题：跳过应用层，违反 DDD 分层原则
- 影响：CardService 应该被 CardApplicationService 替代
- 建议：将所有卡片操作迁移到 `CardApplicationService`

**src/services/ReviewService.ts**
- 行 91, 93, 136：直接访问 `plugin.storage`
- 行 102, 151, 201, 262, 309, 354, 433：直接传递 `plugin.app` 给 UI 组件
- 问题：服务层直接与 UI 层和存储层耦合
- 建议：使用 `ReviewApplicationService` 协调

**src/services/MenuService.ts**
- 依赖注入不完整，缺少 DialogManager
- 问题：直接调用回调函数而不是通过应用服务
- 建议：在 ApplicationContext 中注入 DialogManager

**src/services/BlockMenuHandler.ts**
- 行 1006：直接访问 `plugin.unifiedDataSourceManager`
- 问题：未通过构造函数注入依赖
- 建议：通过依赖注入获取 UnifiedDataSourceManager

### 2. UI 组件直接访问 plugin

**src/ui/browser/composables/useContextMenu.ts**
- 行 492-493, 498-499：直接访问 `plugin.app`
- 问题：表现层跳过应用层直接访问基础设施
- 建议：创建 `TabApplicationService` 统一管理标签页操作

**src/ui/browser/composables/useGridInteractions.ts**
- 行 103-104, 109-110：直接访问 `plugin.app`
- 问题：同上
- 建议：使用 `TabApplicationService`

**src/ui/browser/datasource/DeckDataSource.ts**
- 行 542, 546：直接修改 `plugin.storage`
- 问题：数据源层直接修改存储，违反 CQRS 原则
- 建议：分离读写职责，写操作通过 CardApplicationService

**src/ui/browser/datasource/MenuActions.ts**
- 行 438：直接访问 `plugin.storage` 创建 RescheduleService
- 问题：UI 层直接创建服务实例
- 建议：通过依赖注入获取服务

### 3. 同步服务直接操作存储

**src/services/XiuyuanSyncService.ts**
- 多处直接调用 `this.storage.getCard()`, `this.storage.setCard()`, `this.storage.removeCard()`
- 问题：同步服务应该通过应用层协调，而不是直接操作存储
- 影响：
  - 绕过领域事件系统
  - 无法触发卡片创建/删除事件
  - 难以测试和维护
- 建议：
  1. 创建 `SyncApplicationService`
  2. 使用 `CardApplicationService` 的批量操作方法
  3. 确保所有卡片操作都触发领域事件

### 4. 控制器未集成到应用层

**src/controllers/ReviewViewController.ts**
- 虽然是 DDD 风格，但未集成到应用层
- 问题：控制器逻辑未通过应用服务协调
- 建议：将控制器逻辑迁移到 `ReviewApplicationService`

**src/handlers/BlockEventHandler.ts**
- 直接访问 plugin，未使用应用服务
- 问题：事件处理器应该通过应用服务协调业务逻辑
- 建议：使用 `CardApplicationService` 处理块事件

---

## 🟡 中优先级问题（功能不完整）

### 5. 应用服务不完整

**CardApplicationService**
- 缺少模板卡片创建方法
- 缺少批量删除方法（同步服务需要）
- 建议：添加 `createFromTemplate()` 和 `batchDelete()` 方法

**ReviewApplicationService**
- 缺少复习队列管理方法
- 缺少 `rescheduleCard()` 方法（SrsEditorDialog 需要）
- 建议：添加队列管理和重新调度方法

**TabManager**
- 缺少 `openDocumentTab()` 方法
- 问题：UI 组件直接调用 `plugin.app.openTab()`
- 建议：创建 `TabApplicationService` 统一管理标签页

### 6. 数据源层职责混乱

**DeckDataSource**
- 既读又写，违反 CQRS 原则
- 问题：数据源应该只负责读取，写操作应该通过命令
- 建议：
  1. 保留读取方法
  2. 移除写入方法（如 `updatePriority`）
  3. 写操作通过 `CardApplicationService`

**UnifiedDataSourceManager**
- 直接访问 storage
- 问题：数据源管理器应该通过仓储访问数据
- 建议：使用 `CardRepository` 而不是直接访问 storage

### 7. 事件处理未完全迁移

**src/services/handlers/AutoCardHandler.ts**
- 行 178, 234, 271, 340, 357, 372, 556, 677-678, 732-733, 975-976, 1127-1128, 1236-1237, 1348, 1626-1627, 1819-1820：直接访问 storage
- 问题：自动制卡处理器应该通过应用服务创建卡片
- 建议：使用 `CardApplicationService.createCard()`

**src/services/BlockMenuHandler.ts**
- 复习入口类未通过应用层
- 问题：菜单处理器直接调用服务
- 建议：通过 `ReviewApplicationService` 协调

---

## 🟢 低优先级问题（遗留代码）

### 8. 废弃代码未清理

**src/ui/menu/TopBar.ts**
- 行 165：旧菜单实现
- 问题：可能已被 MenuManager 替代
- 建议：确认是否还在使用，如果不用则删除

**src/services/PluginService.ts**
- 行 60, 84：传递 `plugin.app`
- 问题：应该被 DialogManager 替代
- 建议：迁移到 DialogManager 或删除

**src/services/ReviewDialogManager.ts**
- 旧对话框管理
- 问题：应该被 ReviewApplicationService 替代
- 建议：评估是否可以完全迁移到应用服务

**src/services/HybridSyncService.ts.backup**
- 备份文件
- 建议：删除备份文件

### 9. 迁移服务未 DDD 化

**src/services/MigrationService.ts**
- 直接调用 `xiuyuanService`，未通过应用层
- 问题：迁移逻辑应该在应用层协调
- 建议：创建 `MigrationApplicationService`

---

## 📋 完整问题清单

| 优先级 | 文件 | 行号 | 问题描述 | 建议方案 |
|--------|------|------|----------|----------|
| 🔴 高 | CardService.ts | 82, 136, 144, 174, 182 | 直接访问 storage | 迁移到 CardApplicationService |
| 🔴 高 | ReviewService.ts | 91, 93, 136 | 直接访问 plugin.storage | 使用 CardApplicationService |
| 🔴 高 | ReviewService.ts | 102, 151, 201, 262, 309, 354, 433 | 直接传递 plugin.app | 使用 DialogManager |
| 🔴 高 | MenuService.ts | 全文 | 依赖注入不完整 | 注入 DialogManager |
| 🔴 高 | BlockMenuHandler.ts | 1006 | 直接访问 plugin.unifiedDataSourceManager | 构造函数注入 |
| 🔴 高 | useContextMenu.ts | 492-493, 498-499 | 直接访问 plugin.app | 创建 TabApplicationService |
| 🔴 高 | useGridInteractions.ts | 103-104, 109-110 | 直接访问 plugin.app | 使用 TabApplicationService |
| 🔴 高 | DeckDataSource.ts | 542, 546 | 直接修改 storage | 分离读写职责 |
| 🔴 高 | MenuActions.ts | 438 | 直接创建服务实例 | 依赖注入 |
| 🔴 高 | XiuyuanSyncService.ts | 多处 | 直接操作 storage | 创建 SyncApplicationService |
| 🔴 高 | ReviewViewController.ts | 全文 | 未集成到应用层 | 迁移到 ReviewApplicationService |
| 🔴 高 | BlockEventHandler.ts | 全文 | 直接访问 plugin | 使用 CardApplicationService |
| 🟡 中 | CardApplicationService | - | 缺少模板卡片创建 | 添加 createFromTemplate() |
| 🟡 中 | CardApplicationService | - | 缺少批量删除 | 添加 batchDelete() |
| 🟡 中 | ReviewApplicationService | - | 缺少 rescheduleCard | 添加 rescheduleCard() |
| 🟡 中 | TabManager | - | 缺少 openDocumentTab | 创建 TabApplicationService |
| 🟡 中 | DeckDataSource | 全文 | 读写混合 | 分离 CQRS |
| 🟡 中 | UnifiedDataSourceManager | 全文 | 直接访问 storage | 使用 CardRepository |
| 🟡 中 | AutoCardHandler.ts | 多处 | 直接访问 storage | 使用 CardApplicationService |
| 🟡 中 | BlockMenuHandler.ts | 全文 | 未通过应用层 | 使用 ReviewApplicationService |
| 🟢 低 | TopBar.ts | 165 | 旧菜单实现 | 删除或迁移 |
| 🟢 低 | PluginService.ts | 60, 84 | 传递 plugin.app | 迁移到 DialogManager |
| 🟢 低 | ReviewDialogManager.ts | 全文 | 旧对话框管理 | 评估迁移可能性 |
| 🟢 低 | MigrationService.ts | 全文 | 未通过应用层 | 创建 MigrationApplicationService |

---

## 🎯 修复建议与优先级

### 第一阶段：立即修复（1-2 天）

#### 1.1 创建缺失的应用服务方法（5 小时）
