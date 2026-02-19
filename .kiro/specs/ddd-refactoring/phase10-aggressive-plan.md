# Phase 10：激进重构计划

生成时间：2026-02-19
策略：🔥 激进但安全

## 战略目标

**从 85% → 95%+ DDD 合规度**

### 核心原则
1. 🔥 **激进删除** - 不保留任何遗留代码
2. ✅ **完全迁移** - 所有功能迁移到新架构
3. 🧪 **持续测试** - 每步都验证功能
4. 📝 **详细记录** - 记录所有变更

## 📋 执行计划

### Phase 10.1：删除 PluginService（最简单）

**目标**：完全移除服务定位器反模式

**步骤**：
1. ✅ 检查所有引用 PluginService 的地方
2. ✅ 更新为直接使用 BlockMenuHandler
3. ✅ 删除 PluginService.ts
4. ✅ 测试所有菜单功能

**预计时间**：30 分钟
**风险**：低

---

### Phase 10.2：删除 CardService（核心）

**目标**：将所有卡片操作迁移到 CardApplicationService

**当前问题**：
- CardService 有 7 个方法
- BlockMenuHandler 已有 3 个相同方法
- 需要迁移 4 个方法

**步骤**：
1. ✅ 将缺失方法添加到 BlockMenuHandler
   - `getDrillBlockElements()`
   - `buildDrillCardsFromElements()`
   - `getDrillCardsFromDocTree()`
2. ✅ 更新所有引用
3. ✅ 删除 CardService.ts
4. ✅ 测试所有功能

**预计时间**：1 小时
**风险**：中

---

### Phase 10.3：重构 AutoCardHandler（关键）

**目标**：移除所有跨层调用

**当前问题**：
- 直接访问 Storage（25 处）
- 使用 `getCardService()` 辅助方法
- 混合新旧架构

**步骤**：
1. ✅ 在构造函数注入 CardApplicationService
2. ✅ 在构造函数注入 XiuyuanApplicationService
3. ✅ 移除 `storage` getter
4. ✅ 移除 `getCardService()` 方法
5. ✅ 更新所有使用 Storage 的地方
6. ✅ 测试自动制卡功能

**预计时间**：2 小时
**风险**：高

---

### Phase 10.4：删除 ReviewService（复杂）

**目标**：将复习对话框管理迁移到 DialogManager

**当前问题**：
- ReviewService 混合了对话框管理和复习逻辑
- 有 5 个打开对话框的方法
- DialogManager 可能需要扩展

**步骤**：
1. ✅ 扩展 DialogManager 支持所有复习对话框
2. ✅ 将 ReviewService 的方法迁移到 DialogManager
3. ✅ 更新所有引用
4. ✅ 删除 ReviewService.ts
5. ✅ 测试所有复习功能

**预计时间**：2 小时
**风险**：高

---

### Phase 10.5：删除其他 Service 文件

**目标**：清理所有剩余的 Service 文件

**文件列表**：
1. MenuService.ts - 已符合 DDD，但可以移到 managers
2. DialogService.ts - 合并到 DialogManager
3. XiuyuanSyncService.ts - 迁移到 XiuyuanApplicationService
4. ReviewDialogManager.ts - 合并到 DialogManager
5. ReviewSyncManager.ts - 迁移到 ReviewApplicationService
6. MigrationService.ts - 迁移到应用层
7. MigrateQueueDataService.ts - 迁移到应用层
8. QuickCardWebSocketService.ts - 迁移到基础设施层
9. TransactionWebSocketService.ts - 迁移到基础设施层
10. RiffCleanupService.ts - 迁移到应用层
11. QueueHelpers.ts - 移到 utils 或删除

**步骤**：
1. ✅ 逐个评估每个文件
2. ✅ 迁移或删除
3. ✅ 更新所有引用
4. ✅ 测试相关功能

**预计时间**：3 小时
**风险**：中

---

### Phase 10.6：删除 ReviewEntry 类（6 个文件）

**目标**：移除所有 ReviewEntry 类

**文件列表**：
1. ReviewEntryBase.ts
2. FinalDrillEntry.ts
3. IncrementalLearningEntry.ts
4. RetrievalPracticeEntry.ts
5. TemporaryDrillEntry.ts
6. AddToFinalDrillEntry.ts

**步骤**：
1. ✅ 将逻辑迁移到 ReviewApplicationService
2. ✅ 使用用例模式
3. ✅ 更新 BlockMenuHandler
4. ✅ 删除所有 Entry 文件
5. ✅ 测试所有复习功能

**预计时间**：2 小时
**风险**：高

---

### Phase 10.7：删除整个 src/services/ 目录

**目标**：完全移除 services 目录

**步骤**：
1. ✅ 确认所有文件已迁移或删除
2. ✅ 删除 src/services/ 目录
3. ✅ 更新所有导入
4. ✅ 运行完整测试套件

**预计时间**：30 分钟
**风险**：低（如果前面步骤都完成）

---

## 📊 时间估算

| Phase | 任务 | 预计时间 | 风险 |
|-------|------|---------|------|
| 10.1 | 删除 PluginService | 30m | 低 |
| 10.2 | 删除 CardService | 1h | 中 |
| 10.3 | 重构 AutoCardHandler | 2h | 高 |
| 10.4 | 删除 ReviewService | 2h | 高 |
| 10.5 | 删除其他 Service | 3h | 中 |
| 10.6 | 删除 ReviewEntry 类 | 2h | 高 |
| 10.7 | 删除 services 目录 | 30m | 低 |
| **总计** | **7 个阶段** | **11h** | **中-高** |

## 🎯 成功标准

### 代码质量
- [ ] 零编译错误
- [ ] 所有测试通过
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告

### 架构质量
- [ ] DDD 合规度 95%+
- [ ] 无跨层调用
- [ ] 无服务定位器
- [ ] 完全依赖注入

### 功能完整性
- [ ] 所有菜单功能正常
- [ ] 所有复习功能正常
- [ ] 自动制卡功能正常
- [ ] 浏览器功能正常

## 🔥 激进策略

### 为什么激进？

1. **Phase 9 已经铺好路** - 新架构已经完善
2. **向后兼容已验证** - 功能都能正常工作
3. **技术债务清零** - 不留任何遗留代码
4. **架构纯净** - 达到真正的 DDD

### 如何保证安全？

1. **逐步执行** - 每个 Phase 独立完成
2. **持续测试** - 每步都验证功能
3. **Git 提交** - 每个 Phase 提交一次
4. **可回滚** - 出问题立即回滚

## 📝 执行日志

### Phase 10.1：删除 PluginService
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

### Phase 10.2：删除 CardService
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

### Phase 10.3：重构 AutoCardHandler
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

### Phase 10.4：删除 ReviewService
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

### Phase 10.5：删除其他 Service
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

### Phase 10.6：删除 ReviewEntry 类
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

### Phase 10.7：删除 services 目录
- [ ] 开始时间：
- [ ] 完成时间：
- [ ] 状态：
- [ ] 备注：

---

**准备好了吗？让我们开始激进重构！** 🔥

**第一步：Phase 10.1 - 删除 PluginService**
