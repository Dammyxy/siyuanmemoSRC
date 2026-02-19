# Phase 9: 全面 DDD 迁移

开始时间：2026-02-19
基于：comprehensive-ddd-audit-2026-02-19.md

## 目标

完成所有未 DDD 化代码的迁移，实现 100% DDD 架构覆盖。

## 进度

### 阶段 1：应用服务完善 ✅

#### Task 1.1: 创建 TabApplicationService ✅
- [x] 创建 `src/application/services/TabApplicationService.ts`
- [x] 实现 `openDocumentTab()` 方法
- [x] 实现 `openCustomTab()` 方法
- [x] 实现 `openCardTab()` 方法

#### Task 1.2: 完善 CardApplicationService ✅
- [x] 添加 `storage` 私有字段
- [x] 修复 `getCardByBlockId()` 方法
- [x] 修复 `setCard()` 方法
- [x] 修复 `removeCard()` 方法
- [x] 修复 `saveCards()` 方法
- [x] 修复 `batchDeleteCards()` 返回类型
- [x] 修复 `batchCreateCardsWithoutEvents()` 返回类型
- [x] 修复 `batchUpdateCardsWithoutEvents()` 返回类型

#### Task 1.3: 在 ApplicationContext 注册服务 🔄
- [ ] 注册 TabApplicationService
- [ ] 添加 `getTabApplicationService()` 方法
- [ ] 更新 TabManager 使用 TabApplicationService

#### Task 1.4: 完善 ReviewApplicationService
- [ ] 添加 `rescheduleCard()` 方法
- [ ] 添加队列管理方法

### 阶段 2：UI 组件重构

#### Task 2.1: 重构 useContextMenu
- [ ] 注入 TabApplicationService
- [ ] 替换 `plugin.app.openTab()` 调用

#### Task 2.2: 重构 useGridInteractions
- [ ] 注入 TabApplicationService
- [ ] 替换 `plugin.app.openTab()` 调用

#### Task 2.3: 重构 DeckDataSource
- [ ] 移除写入方法
- [ ] 写操作通过 CardApplicationService

#### Task 2.4: 修复 MenuActions
- [ ] 通过依赖注入获取服务
- [ ] 移除直接创建服务实例

### 阶段 3：旧服务迁移

#### Task 3.1: 迁移 CardService
- [ ] 所有方法迁移到 CardApplicationService
- [ ] 更新所有引用
- [ ] 标记为 @deprecated

#### Task 3.2: 迁移 ReviewService
- [ ] 迁移到 ReviewApplicationService
- [ ] 更新所有引用
- [ ] 标记为 @deprecated

#### Task 3.3: 迁移 AutoCardHandler
- [ ] 使用 CardApplicationService
- [ ] 移除直接 storage 访问

#### Task 3.4: 修复 MenuService
- [ ] 完善依赖注入
- [ ] 注入 DialogManager

#### Task 3.5: 修复 BlockMenuHandler
- [ ] 构造函数注入依赖
- [ ] 移除直接 plugin 访问

### 阶段 4：同步服务重构

#### Task 4.1: 创建 SyncApplicationService
- [ ] 设计同步服务接口
- [ ] 实现增量同步
- [ ] 实现全量同步
- [ ] 实现删除同步

#### Task 4.2: 重构 XiuyuanSyncService
- [ ] 使用 CardApplicationService 批量方法
- [ ] 确保触发领域事件
- [ ] 移除直接 storage 访问

### 阶段 5：清理遗留代码

#### Task 5.1: 评估并清理
- [ ] TopBar.ts
- [ ] PluginService.ts
- [ ] ReviewDialogManager.ts
- [ ] HybridSyncService.ts.backup

## 当前状态

正在进行：Task 1.3 - 在 ApplicationContext 注册 TabApplicationService

## 下一步

1. 完成 TabApplicationService 注册
2. 更新 TabManager 使用新服务
3. 开始 UI 组件重构
