# Riff 数据源解耦 - 需求文档

## 1. 概述

### 1.1 背景

当前架构中，Riff 系统扮演双重角色：
1. **数据源**：提供卡片列表（`getRiffDueCards()`）
2. **调度控制器**：管理排期（`reviewRiffCard()` 更新 `nextDues`）

这导致了以下问题：
- 在 Card Browser 中删除 Riff 卡片后，刷新又出现（因为只从本地 buffer 移除）
- 通过系统调整的复习时间会被 Riff API 返回的旧数据覆盖
- IncrementalLearningQueue 无法使用本地调度器（FSRS/SM-15）

### 1.2 目标

让 Riff 只作为**数据源**（提供卡片列表），所有排期由本地调度器控制：
- ✅ Riff 提供卡片列表（可读）
- ✅ 所有排期由 SchedulerRouter 控制
- ✅ 删除、时间调整永久生效
- ❌ 不依赖 Riff 的排期算法

### 1.3 范围

**包含**：
- IncrementalLearningQueue 集成 SchedulerRouter
- RiffDataSource 优先使用本地 nextDues
- removeItems() 同步删除 Riff 数据库
- 统一的 nextDues 存储策略

**不包含**：
- 修改 Riff API 本身
- 修改 RetrievalPracticeQueue（已有 SchedulerRouter）
- 修改其他队列策略

---

## 2. 用户故事

### 2.1 作为用户，我希望在 Card Browser 中删除 Riff 卡片后永久生效

**验收标准**：
- 在 Card Browser 中删除 Riff 卡片
- 刷新页面后，卡片不再出现
- Riff 数据库中的卡片已被移除

### 2.2 作为用户，我希望调整复习时间后不被覆盖

**验收标准**：
- 通过系统调整卡片的复习时间
- 下次加载时，使用调整后的时间
- Riff API 返回的旧数据不会覆盖本地数据

### 2.3 作为用户，我希望 IncrementalLearningQueue 使用本地调度器

**验收标准**：
- IncrementalLearningQueue 支持 FSRS/SM-15 调度器
- 评分后使用本地算法计算 nextDues
- nextDues 保存到本地数据库
- Riff 数据库同步更新（可选）

---

## 3. 功能需求

### 3.1 IncrementalLearningQueue 集成 SchedulerRouter

**需求**：
- 构造函数接受 `schedulerRouter` 参数
- `onFeedback()` 方法使用 SchedulerRouter 进行复习
- 支持本地卡片和 Riff 卡片的统一调度

**优先级**：P0（必须实现）

### 3.2 RiffDataSource 优先使用本地 nextDues

**需求**：
- `getAll()` 方法检查本地数据库
- 如果本地有 nextDues，使用本地数据
- 如果本地没有，使用 Riff API 数据

**优先级**：P0（必须实现）

### 3.3 removeItems() 同步删除 Riff 数据库

**需求**：
- `removeItems()` 调用 `removeRiffCards()` API
- 从 Riff 数据库中删除卡片
- 从本地 buffer 中移除卡片

**优先级**：P0（必须实现）

### 3.4 统一的 nextDues 存储策略

**需求**：
- 定义 nextDues 的唯一来源（本地数据库）
- Riff API 数据作为备份
- 提供数据迁移工具（Riff → 本地）

**优先级**：P1（应该实现）

---

## 4. 非功能需求

### 4.1 性能

- 批量查询本地数据库（避免逐个查询）
- 缓存策略（减少重复查询）

### 4.2 兼容性

- 向后兼容现有数据
- 支持 Riff API 数据迁移

### 4.3 可维护性

- 清晰的数据流向
- 统一的调度器接口

---

## 5. 约束条件

### 5.1 技术约束

- 不能修改 Riff API 本身
- 必须保持与 RetrievalPracticeQueue 的一致性

### 5.2 业务约束

- 不能破坏现有功能
- 必须支持数据迁移

---

## 6. 依赖关系

### 6.1 依赖的组件

- SchedulerRouter（已存在）
- StorageManager（已存在）
- Riff API（已存在）

### 6.2 被依赖的组件

- Card Browser
- Review Dialog

---

## 7. 风险评估

### 7.1 高风险

- **数据不一致**：本地和 Riff 数据不同步
  - 缓解措施：提供同步工具

### 7.2 中风险

- **性能问题**：批量查询本地数据库
  - 缓解措施：使用缓存

### 7.3 低风险

- **兼容性问题**：现有数据迁移
  - 缓解措施：提供迁移工具

---

## 8. 成功标准

### 8.1 功能完整性

- 所有 P0 需求已实现
- 所有验收标准已通过

### 8.2 性能指标

- 批量查询时间 < 100ms
- 删除操作时间 < 50ms

### 8.3 质量指标

- 单元测试覆盖率 > 80%
- 集成测试通过率 100%

---

## 9. 附录

### 9.1 相关文档

- [AI_HANDOFF_GUIDE.md](../../siyuan-plugin-fsrs/docs/AI_HANDOFF_GUIDE.md)
- [问题总结.md](../../siyuan-plugin-fsrs/docs/问题总结.md)

### 9.2 术语表

- **Riff**：思源笔记的原生闪卡系统
- **SchedulerRouter**：调度器路由器，根据卡片类型选择调度器
- **nextDues**：下次复习时间（4 个评分对应的时间）
- **Outstanding Queue**：SuperMemo 的队列模式，包含所有待复习卡片
