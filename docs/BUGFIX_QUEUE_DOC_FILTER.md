# Bugfix: 队列视图文档筛选功能修复

## 问题描述

在 SRS 浏览器中，当用户点击队列（如"提取练习"）时，队列表格视图正常显示卡片，但文档区（左侧层级视图）没有显示任何文档，导致无法进行文档筛选。

## 根本原因

队列表格视图中的卡片缺少 `rootId` 字段，导致 `focusedDocIds` 计算结果为 `null`，文档区无法正确显示文档列表。

具体原因：
1. **SimpleDataRouter**: 在将 `RiffBlock` 转换为 `FSRSCard` 时，未将 `RiffBlock.box` 字段映射到 `FSRSCard.meta.rootId`
2. **AdvancedDataRouter**: 本地存储的卡片可能缺少 `meta.rootId`（旧版本迁移的数据）

## 修复内容

### 1. SimpleDataRouter.ts
- 在 `convertRiffBlockToFSRSCard` 方法的 `meta` 对象中添加了 `rootId: riffBlock.box || ''`
- 添加了警告日志，当 `box` 字段缺失时输出警告

### 2. AdvancedDataRouter.ts
- 添加了 `sql` 导入
- 修改了 `getCards` 方法，添加了 rootId 填充逻辑
- 实现了 `fillMissingRootIds` 私有方法：自动检测并填充缺失的 rootId
- 实现了 `batchQueryRootIds` 私有方法：分批查询 blocks 表的 root_id 字段（每批 500 个）
- 实现了 `escapeSQL` 私有方法：防止 SQL 注入

### 3. SRSBrowser.vue
- 增强了 `focusedDocIds` 计算的日志，添加了 `cardsWithRootId` 统计
- 添加了警告日志，当所有卡片都缺少 rootId 时输出警告

## 验证结果

所有队列数据源都正确处理 rootId：
- ✅ RetrievalDataSource
- ✅ FinalDrillDataSource
- ✅ IncrementalLearningDataSource
- ✅ FilterGroupDataSource

## 测试建议

1. 打开 SRS 浏览器
2. 点击任意队列（如"提取练习"）
3. 验证文档区是否显示文档列表
4. 点击文档，验证表格是否正确筛选
5. 检查浏览器控制台，确认无错误日志

## 相关文件

- `siyuan-plugin-fsrs/src/routers/SimpleDataRouter.ts`
- `siyuan-plugin-fsrs/src/routers/AdvancedDataRouter.ts`
- `siyuan-plugin-fsrs/src/ui/browser/SRSBrowser.vue`
- `siyuan-plugin-fsrs/src/ui/browser/datasource/RetrievalDataSource.ts`
- `siyuan-plugin-fsrs/src/ui/browser/datasource/FinalDrillDataSource.ts`
- `siyuan-plugin-fsrs/src/ui/browser/datasource/IncrementalLearningDataSource.ts`
- `siyuan-plugin-fsrs/src/ui/browser/datasource/FilterGroupDataSource.ts`

## Spec 文档

详细的需求、设计和任务文档位于：
- `.kiro/specs/queue-doc-filter-rootid-fix/requirements.md`
- `.kiro/specs/queue-doc-filter-rootid-fix/design.md`
- `.kiro/specs/queue-doc-filter-rootid-fix/tasks.md`
