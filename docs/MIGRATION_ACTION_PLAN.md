# 队列架构迁移行动计划

## 🎯 目标

将所有使用旧架构的代码迁移到新统一架构（`src/queues/`）。

## 📊 当前状态

根据静态分析，需要迁移的文件：

### 🔴 高优先级（主要入口和服务）
1. `src/index.ts` - 插件入口文件
2. `src/managers/LifecycleManager.ts` - 生命周期管理
3. `src/managers/UIManager.ts` - UI 管理
4. `src/services/DialogService.ts` - 对话框服务
5. `src/services/ReviewDialogManager.ts` - 复习对话框管理
6. `src/services/ReviewService.ts` - 复习服务

### 🟡 中优先级（UI 提供者）
7. `src/ui/review/v2/providers/IncrementalLearningProvider.ts`
8. `src/ui/review/v2/providers/RetrievalPracticeProvider.ts`

### 🟢 低优先级（旧架构本身 - 保留）
9. `src/core/queue/strategies/FilterGroupQueue.ts` - 标记为 @deprecated
10. `src/core/queue/strategies/FinalDrillQueue.ts` - 标记为 @deprecated
11. `src/core/queue/strategies/LeechQueue.ts` - 标记为 @deprecated
12. `src/core/queue/strategies/NeuralRoamQueue.ts` - 标记为 @deprecated
13. `src/core/queue/strategies/RetrievalPracticeQueue.ts` - 标记为 @deprecated

### ⚪ 工具和测试（保留或更新）
14. `src/core/native/adapter.ts` - 原生适配器
15. `src/core/queue/datasource/DataSourceFactory.ts` - 数据源工厂
16. `src/core/queue/datasource/HybridDataSource.ts` - 混合数据源
17. `src/core/storage/manager.ts` - 存储管理器
18. `src/diagnostics/__tests__/setup.ts` - 测试设置
19. `src/migration/StaticCodeAnalyzer.ts` - 静态分析工具（已知）

## 🚀 迁移步骤

### 第一步：标记旧架构为 @deprecated（5分钟）

为旧架构文件添加弃用警告：

```typescript
/**
 * @deprecated 此文件属于旧队列架构，将在未来版本中移除。
 * 请使用 src/queues/ 中的新架构。
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
 */
```

**文件列表**：
- `src/core/queue/strategies/*.ts`（5个文件）
- `src/core/queue/composite/BaseCompositeQueue.ts`
- `src/core/queue/datasource/RiffDataSource.ts`
- `src/core/queue/datasource/HybridDataSource.ts`

### 第二步：迁移主入口文件（30分钟）

#### 2.1 更新 `src/index.ts`

**当前代码**：
```typescript
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
```

**迁移后**：
```typescript
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
// 移除旧架构导入
```

**变更点**：
1. 移除旧架构队列导入
2. 在插件初始化时创建 `UnifiedDataSourceManager`
3. 通过管理器获取队列实例

### 第三步：迁移服务层（1小时）

#### 3.1 `src/services/ReviewDialogManager.ts`

**迁移要点**：
- 使用 `UnifiedDataSourceManager` 获取队列
- 替换 `QueueItem` 为 `FSRSCard`
- 使用 `getAllCards()` 替代 `getAllItems()`
- 使用 `handleReview()` 替代 `onFeedback()`

#### 3.2 `src/services/DialogService.ts`

**迁移要点**：
- 更新队列创建逻辑
- 使用新架构 API

#### 3.3 `src/services/ReviewService.ts`

**迁移要点**：
- 更新队列访问方式
- 实现 `IDataSourceObserver` 接口（可选）

### 第四步：迁移管理器（1小时）

#### 4.1 `src/managers/LifecycleManager.ts`

**迁移要点**：
- 在插件启动时初始化 `UnifiedDataSourceManager`
- 在插件卸载时清理资源

#### 4.2 `src/managers/UIManager.ts`

**迁移要点**：
- 使用新架构队列
- 注册为观察者以自动刷新 UI

### 第五步：迁移 UI 提供者（1小时）

#### 5.1 `src/ui/review/v2/providers/RetrievalPracticeProvider.ts`

**迁移要点**：
- 使用新架构 `RetrievalPracticeQueue`
- 更新类型注解

#### 5.2 `src/ui/review/v2/providers/IncrementalLearningProvider.ts`

**迁移要点**：
- 使用新架构 `IncrementalLearningQueue`
- 更新类型注解

### 第六步：测试和验证（30分钟）

1. 运行 TypeScript 编译：`npx tsc --noEmit`
2. 运行测试套件：`npm test`
3. 手动测试核心功能
4. 运行静态分析：`node scripts/run-static-analysis.mjs`

## 📚 参考资源

- [迁移指南](./docs/MIGRATION_GUIDE.md) - 详细的迁移步骤和示例
- [API 参考](./docs/API_REFERENCE.md) - 新架构 API 文档
- [开发者指南](./docs/DEVELOPER_GUIDE.md) - 如何使用新架构
- [架构文档](./docs/QUEUE_ARCHITECTURE.md) - 新旧架构对比

## ✅ 迁移检查清单

### 代码迁移
- [x] 标记旧架构为 @deprecated
- [x] 迁移 `src/index.ts` - **无需迁移，保持向后兼容**
- [x] 迁移 `src/services/ReviewDialogManager.ts` - **已使用 createUnifiedReviewDialog**
- [ ] 迁移 `src/services/DialogService.ts`
- [ ] 迁移 `src/services/ReviewService.ts`
- [ ] 迁移 `src/managers/LifecycleManager.ts`
- [ ] 迁移 `src/managers/UIManager.ts`
- [ ] 迁移 UI 提供者（2个文件）

### 验证
- [ ] TypeScript 编译无错误
- [ ] 所有测试通过
- [ ] 静态分析显示减少的旧架构使用
- [ ] 手动测试核心功能

### 文档
- [ ] 更新 CHANGELOG.md
- [ ] 添加迁移说明到 README.md

## 🎯 预期结果

迁移完成后：
- ✅ 主代码使用新架构
- ✅ 旧架构仅作为兼容层保留
- ✅ 代码更清晰、更易维护
- ✅ 支持观察者模式和自动 UI 刷新
- ✅ 统一的 API 和类型系统

## ⏱️ 预计时间

- **总计**: 约 4-5 小时
- **第一步**: 5 分钟
- **第二步**: 30 分钟
- **第三步**: 1 小时
- **第四步**: 1 小时
- **第五步**: 1 小时
- **第六步**: 30 分钟
- **缓冲时间**: 1 小时（处理意外问题）

## 🚨 注意事项

1. **增量迁移**: 一次迁移一个文件，每次都测试
2. **保留备份**: 使用 Git 提交保存进度
3. **参考文档**: 遇到问题查看迁移指南
4. **测试优先**: 每次变更后运行测试
5. **不要删除旧架构**: 保留作为兼容层

## 🆘 遇到问题？

1. 查看 [迁移指南的故障排除部分](./docs/MIGRATION_GUIDE.md#故障排除)
2. 查看 [开发者指南的调试技巧](./docs/DEVELOPER_GUIDE.md#调试技巧)
3. 运行静态分析查看进度：`node scripts/run-static-analysis.mjs`


---

## 🐛 修复记录

### SRS Browser 数据显示修复 (2026-02-06)

**问题描述**:
SRS Browser 显示的卡片数据不完整，缺少 FSRS 调度字段（due, stability, difficulty, state 等），所有字段都显示为 0 或默认值。

**根本原因**:
1. **第一个问题**：插件初始化时没有根据用户设置切换到高级模式
   - `UnifiedDataSourceManager` 默认使用简单模式（Simple Mode）
   - 即使用户设置了 `riffIntegration.mode = 'advanced'`，插件也没有切换模式
   - 导致高级模式用户实际使用的是简单模式的 `SimpleDataRouter`

2. **第二个问题**：`SimpleDataRouter` 从 Riff API 获取数据时，手动添加的卡片没有 `riffCard` 调度信息
   - 手动添加到检索练习队列的卡片还没有进行过复习
   - Riff 系统中没有这些卡片的调度信息
   - `RiffBlock.riffCard` 字段为 `undefined`

**修复方案**:

1. **修改 `src/index.ts` 插件初始化逻辑**:
   - 添加 `OperationMode` 导入
   - 在初始化 `UnifiedDataSourceManager` 后，读取用户设置
   - 根据 `settings.riffIntegration.mode` 切换到正确的模式
   - 添加错误处理，如果切换失败则继续使用默认模式

2. **修改 `SimpleDataRouter.convertRiffBlockToFSRSCard()`**:
   - 添加详细的警告日志，记录 `riffCard` 缺失的情况
   - 使用合理的默认值：
     - `due`: 当前时间（表示立即到期）
     - `stability`: 0（新卡片）
     - `difficulty`: 0（新卡片）
     - `state`: 0（New 状态）
     - `reps`: 0（未复习过）
     - `lapses`: 0（未遗忘过）
   - 将原始块数据存储到 `meta` 字段：
     - `content`: 块内容
     - `path`: 块路径
     - `hPath`: 人类可读路径
     - `deckId`: 卡包 ID
     - `isIncomplete`: 标记数据是否不完整

3. **修改 `SRSBrowserAdapter.convertToBrowserCard()`**:
   - 优先从 `meta` 字段读取内容和 deckId
   - 添加数据完整性检查（`meta.isIncomplete`）
   - 记录详细的警告日志，便于调试

**影响范围**:
- SRS Browser 卡片列表显示
- 所有使用 `SimpleDataRouter` 的队列（RetrievalPractice, FinalDrill）
- 所有使用 `AdvancedDataRouter` 的队列（高级模式用户）

**测试建议**:
1. 打开 SRS Browser，查看卡片列表
2. 检查控制台日志，确认模式切换成功：`✅ Switched to advanced mode based on user settings`
3. 验证卡片内容、due、stability 等字段是否正确显示
4. 如果有警告，检查为什么 Riff API 返回的数据不完整

**相关文件**:
- `src/index.ts` - 插件初始化（添加模式切换逻辑）
- `src/routers/SimpleDataRouter.ts` - 简单模式数据路由器（容错处理）
- `src/ui/browser/SRSBrowserAdapter.ts` - UI 适配器（容错处理）
- `src/types/card.ts` (FSRSCard 接口)
