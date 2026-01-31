# Riff 数据源解耦

> **状态**: 📋 规划中  
> **优先级**: P0（必须实现）  
> **估算时间**: 6-10 天  
> **创建日期**: 2026-01-31

---

## 📋 概述

将 Riff 系统从双重角色（数据源 + 调度控制器）解耦为单一角色（仅数据源），所有排期由本地调度器（SchedulerRouter）统一管理。

### 核心问题

1. **删除操作不同步**：在 Card Browser 中删除 Riff 卡片后，刷新又出现
2. **时间调整被覆盖**：通过系统调整的复习时间被 Riff API 返回的旧数据覆盖
3. **架构不一致**：IncrementalLearningQueue 直接调用 Riff API，而 RetrievalPracticeQueue 使用 SchedulerRouter

### 目标架构

```
Riff 系统（仅数据源）
  ↓ 提供卡片列表
本地调度器（唯一控制器）
  ↓ 计算 nextDues
StorageManager（唯一数据源）
  ↓ 存储排期结果
（可选）同步到 Riff
```

---

## 📂 文档结构

- **[requirements.md](./requirements.md)** - 需求文档（用户故事、验收标准）
- **[design.md](./design.md)** - 设计文档（架构设计、技术方案）
- **[tasks.md](./tasks.md)** - 任务清单（实施计划、验收标准）
- **README.md** - 本文档（概述、快速参考）

---

## 🎯 关键需求

### P0（必须实现）

1. **IncrementalLearningQueue 集成 SchedulerRouter**
   - 构造函数接受 `schedulerRouter` 参数
   - `onFeedback()` 使用 SchedulerRouter 进行复习
   - 支持本地卡片和 Riff 卡片的统一调度

2. **RiffDataSource 优先使用本地 nextDues**
   - `getAll()` 方法检查本地数据库
   - 如果本地有 nextDues，使用本地数据
   - 如果本地没有，使用 Riff API 数据

3. **removeItems() 同步删除 Riff 数据库**
   - `removeItems()` 调用 `removeRiffCards()` API
   - 从 Riff 数据库中删除卡片
   - 添加到黑名单（防止重新加载）

### P1（应该实现）

4. **统一的 nextDues 存储策略**
   - 定义 nextDues 的唯一来源（本地数据库）
   - Riff API 数据作为备份
   - 提供数据迁移工具（Riff → 本地）

---

## 🏗️ 架构设计

### 当前架构问题

```
┌─────────────────────────────────────┐
│ Riff 系统                           │
├─────────────────────────────────────┤
│ 1. 数据源：提供卡片列表              │
│ 2. 控制器：管理排期 ❌               │
└─────────────────────────────────────┘
         ↓
    问题：双重角色导致数据不一致
```

### 目标架构

```
┌─────────────────────────────────────┐
│ Riff 系统（仅数据源）✅              │
│ - getRiffDueCards() 提供卡片列表     │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ 本地调度器（唯一控制器）✅           │
│ - SchedulerRouter 计算 nextDues     │
│ - StorageManager 存储排期结果        │
│   (使用 msgpack 格式，性能更好) 🆕   │
└─────────────────────────────────────┘
```

### 存储格式优化

**思源开发者建议**：
- ✅ 使用 **msgpack** 格式（性能更好）
- ✅ 避免使用数据库（会有同步冲突）
- ✅ 文件存储更适合插件数据

**实施方案**：
```typescript
// 使用 @msgpack/msgpack 库
import { encode, decode } from '@msgpack/msgpack';

// 保存数据（msgpack 格式）
const buffer = encode(data);
await putFile(path, new Blob([buffer]));

// 加载数据（msgpack 格式）
const content = await getFile(path);
const data = decode(new Uint8Array(await content.arrayBuffer()));
```

---

## 📊 实施计划

### Phase 1: 基础设施（2-3 天）
- **迁移到 msgpack 存储格式**（思源开发者建议）
- StorageManager 添加黑名单管理
- RiffDataSource 添加 storage 参数
- 实现 mergeLocalNextDues() 方法

### Phase 2: IncrementalLearningQueue 集成（2-3 天）
- 添加 schedulerRouter 参数
- 修改 onFeedback() 方法
- 修改 removeItems() 方法

### Phase 3: 测试和优化（2-3 天）
- 单元测试
- 集成测试
- 性能优化（msgpack vs JSON）

### Phase 4: 数据迁移和部署（1-2 天）
- 实现迁移工具（JSON → msgpack）
- 文档更新
- 发布

---

## ✅ 验收标准

### 功能完整性
- ✅ 所有 P0 需求已实现
- ✅ 所有验收标准已通过

### 性能指标
- ✅ 批量查询时间 < 100ms
- ✅ 删除操作时间 < 50ms

### 质量指标
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过率 100%

---

## 🔍 关键代码位置

### 需要修改的文件

1. **IncrementalLearningQueue.ts** (266-311 行)
   - `onFeedback()` 方法
   - `removeItems()` 方法

2. **RiffDataSource.ts** (124-178 行)
   - `getAll()` 方法
   - 新增 `mergeLocalNextDues()` 方法

3. **StorageManager.ts**
   - 新增黑名单管理方法

4. **RetrievalHybridDataSource.ts**
   - `remove()` 方法

### 参考实现

- **RetrievalPracticeQueue.ts** (298-329 行)
  - SchedulerRouter 集成示例

- **SchedulerRouter.ts** (81-106 行)
  - `route()` 方法

---

## 🚨 风险和缓解

### 高风险

- **数据不一致**：本地和 Riff 数据不同步
  - 缓解：提供同步工具、定期检查一致性

### 中风险

- **性能问题**：批量查询本地数据库
  - 缓解：使用缓存、批量查询优化

### 低风险

- **兼容性问题**：现有数据迁移
  - 缓解：提供迁移工具、数据备份

---

## 📚 相关文档

### 架构文档
- [AI_HANDOFF_GUIDE.md](../../../siyuan-plugin-fsrs/docs/AI_HANDOFF_GUIDE.md) - 项目架构总览
- [问题总结.md](../../../siyuan-plugin-fsrs/docs/问题总结.md) - 问题详细描述

### 代码文档
- [SchedulerRouter.ts](../../../siyuan-plugin-fsrs/src/core/scheduler/SchedulerRouter.ts) - 调度器路由器
- [IncrementalLearningQueue.ts](../../../siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts) - 渐进学习队列
- [RiffDataSource.ts](../../../siyuan-plugin-fsrs/src/core/queue/datasource/RiffDataSource.ts) - Riff 数据源

---

## 🎯 下一步行动

1. **阅读文档**
   - 阅读 [requirements.md](./requirements.md) 了解需求
   - 阅读 [design.md](./design.md) 了解技术方案
   - 阅读 [tasks.md](./tasks.md) 了解实施计划

2. **准备工作**
   - 阅读相关代码，理解现有逻辑
   - 准备测试数据和测试环境
   - 设置开发环境

3. **开始实施**
   - 从 Phase 1.1 开始（StorageManager 黑名单管理）
   - 每个任务完成后更新 tasks.md
   - 每个 Phase 完成后进行代码审查

---

## 💡 建议

### 对于 AI 助手

1. **先读文档**：完整阅读 requirements.md 和 design.md
2. **理解架构**：理解当前架构和目标架构的区别
3. **参考实现**：参考 RetrievalPracticeQueue 的 SchedulerRouter 集成
4. **测试驱动**：先写测试，再写实现
5. **渐进式修改**：每次只修改一个组件，确保测试通过

### 对于开发者

1. **功能开关**：使用功能开关控制新功能
2. **数据备份**：修改前备份 Riff 数据
3. **渐进式部署**：先小范围测试，再全面部署
4. **监控日志**：添加详细日志，便于调试
5. **文档更新**：及时更新文档

---

## 📞 需要帮助？

- 查看 [AI_HANDOFF_GUIDE.md](../../../siyuan-plugin-fsrs/docs/AI_HANDOFF_GUIDE.md) 了解项目架构
- 查看 [问题总结.md](../../../siyuan-plugin-fsrs/docs/问题总结.md) 了解问题详情
- 查看 [design.md](./design.md) 了解技术方案
- 查看 [tasks.md](./tasks.md) 了解实施计划

---

**创建时间**: 2026-01-31  
**最后更新**: 2026-01-31  
**维护者**: AI Assistant
