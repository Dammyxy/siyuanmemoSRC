# Riff 数据源解耦 - 总结

> **创建时间**: 2026-01-31  
> **状态**: ✅ 规范完成，待实施

---

## 📋 问题验证

你的问题总结**完全准确**，代码验证结果：

### ✅ 问题 1：删除操作不同步
- **位置**：`IncrementalLearningQueue.removeItems()` (line 156-177)
- **问题**：只从本地 buffer 移除，没有调用 `removeRiffCards()` API
- **影响**：Card Browser 中删除 Riff 卡片后，刷新又出现

### ✅ 问题 2：时间调整被覆盖
- **位置**：`RiffDataSource.getAll()` (line 124-178)
- **问题**：直接使用 Riff API 返回的 `nextDues`，没有检查本地数据库
- **影响**：通过系统调整的复习时间被 Riff 数据覆盖

### ✅ 问题 3：架构不一致
- **RetrievalPracticeQueue**：已集成 SchedulerRouter (line 298-329)
- **IncrementalLearningQueue**：直接调用 `reviewRiffCard()` API (line 266-311)
- **影响**：无法使用本地调度器（FSRS/SM-15）

---

## 🎯 解决方案

### 核心思路

将 Riff 从**双重角色**（数据源 + 控制器）解耦为**单一角色**（仅数据源）：

```
Riff（仅数据源）→ SchedulerRouter（唯一控制器）→ StorageManager（唯一数据源）
```

### 关键改进

1. **统一调度**：所有卡片（本地 + Riff）都使用 SchedulerRouter
2. **本地优先**：nextDues 优先使用本地数据，Riff 数据作为备份
3. **删除同步**：调用 `removeRiffCards()` API + 黑名单机制
4. **性能优化**：使用 msgpack 格式（思源开发者建议）

---

## 🔧 技术要点

### 1. msgpack 存储格式（新增）

**思源开发者建议**：
- ✅ 使用 msgpack（性能更好）
- ✅ 避免数据库（同步冲突）
- ✅ 文件存储更适合插件

**实施**：
```typescript
// 安装依赖
npm install @msgpack/msgpack

// 使用 msgpack
import { encode, decode } from '@msgpack/msgpack';

// 保存
const buffer = encode(data);
await putFile(path, new Blob([buffer]));

// 加载
const content = await getFile(path);
const data = decode(new Uint8Array(await content.arrayBuffer()));
```

### 2. 黑名单机制

**目的**：防止删除的 Riff 卡片重新加载

**实施**：
```typescript
// 删除 Riff 卡片
await removeRiffCards(deckID, [blockID]);

// 添加到黑名单
storage.addToRiffBlacklist(blockID);

// 加载时过滤
items = items.filter(item => !blacklist.has(item.blockID));
```

### 3. 本地数据优先

**目的**：避免 Riff 数据覆盖本地修改

**实施**：
```typescript
// 批量查询本地卡片
const localCards = await batchGetCards(cardIds);

// 合并数据（本地优先）
items = items.map(item => {
  const localCard = localCards.get(item.cardID);
  if (localCard && localCard.due) {
    // 使用本地的 nextDues
    return { ...item, nextDues: extractNextDues(localCard) };
  }
  // 使用 Riff 的 nextDues
  return item;
});
```

### 4. 统一调度

**目的**：所有卡片使用相同的调度逻辑

**实施**：
```typescript
// IncrementalLearningQueue.onFeedback()
if (this.schedulerRouter && this.storage) {
  // 1. QueueItem 转 FSRSCard
  const fsrsCard = this.storage.getCard(cardID);
  
  // 2. 使用 SchedulerRouter 进行复习
  const updatedCard = await this.schedulerRouter.route(fsrsCard, rating);
  
  // 3. 可选：同步到 Riff
  if (config.enableRiffSync) {
    await reviewRiffCard(deckID, cardID, rating);
  }
}
```

---

## 📊 实施计划

### 总时间：7-11 天（66 个任务）

#### Phase 1: 基础设施（2-3 天）
- **1.0 迁移到 msgpack**（7 个任务）
  - 安装依赖、修改读写方法、数据迁移
- **1.1 黑名单管理**（8 个任务）
  - 添加黑名单方法、持久化、加载
- **1.2-1.3 RiffDataSource**（6 个任务）
  - 添加 storage 参数、实现 mergeLocalNextDues()

#### Phase 2: IncrementalLearningQueue 集成（2-3 天）
- **2.1 添加 schedulerRouter**（3 个任务）
- **2.2 修改 onFeedback()**（6 个任务）
- **2.3 修改 removeItems()**（4 个任务）
- **2.4 更新 RetrievalHybridDataSource**（3 个任务）

#### Phase 3: 测试和优化（2-3 天）
- **3.1 集成测试**（5 个任务）
- **3.2 性能优化**（4 个任务）
- **3.3 边界情况测试**（4 个任务）

#### Phase 4: 数据迁移和部署（1-2 天）
- **4.1 数据迁移工具**（4 个任务）
- **4.2 功能开关**（3 个任务）
- **4.3 文档更新**（4 个任务）
- **4.4 部署准备**（4 个任务）

---

## ✅ 验收标准

### 功能完整性
- ✅ IncrementalLearningQueue 使用 SchedulerRouter
- ✅ removeItems() 调用 Riff API
- ✅ RiffDataSource 优先使用本地 nextDues
- ✅ 黑名单功能正常
- ✅ msgpack 存储正常

### 性能指标
- ✅ msgpack 读写性能 > JSON（至少 2x）
- ✅ 批量查询时间 < 100ms
- ✅ 删除操作时间 < 50ms

### 质量指标
- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过率 100%
- ✅ 数据迁移成功率 100%

---

## 🚨 风险和缓解

### 高风险
- **数据迁移失败**：JSON → msgpack 转换错误
  - 缓解：提供数据备份、回滚机制

### 中风险
- **性能问题**：批量查询本地数据库
  - 缓解：使用缓存、批量查询优化

### 低风险
- **兼容性问题**：现有数据格式变化
  - 缓解：渐进式迁移、功能开关

---

## 📚 文档结构

```
.kiro/specs/riff-data-source-decoupling/
├── README.md           # 概述和快速参考
├── requirements.md     # 需求文档（用户故事、验收标准）
├── design.md          # 设计文档（架构设计、技术方案）
├── tasks.md           # 任务清单（66 个任务，7-11 天）
└── SUMMARY.md         # 本文档（总结和要点）
```

---

## 🎯 下一步行动

### 1. 阅读文档
- ✅ 已完成：问题验证和代码分析
- 📖 阅读 `requirements.md` 了解需求
- 📖 阅读 `design.md` 了解技术方案
- 📖 阅读 `tasks.md` 了解实施计划

### 2. 准备工作
- 📦 安装 `@msgpack/msgpack` 依赖
- 🧪 准备测试数据和测试环境
- 🔧 设置开发环境

### 3. 开始实施
- 🚀 从 Phase 1.0 开始（msgpack 迁移）
- ✅ 每个任务完成后更新 `tasks.md`
- 🔍 每个 Phase 完成后进行代码审查

---

## 💡 关键建议

### 对于实施者

1. **先迁移 msgpack**：这是基础，影响所有后续工作
2. **参考 RetrievalPracticeQueue**：它已经正确集成了 SchedulerRouter
3. **测试驱动**：先写测试，再写实现
4. **渐进式修改**：每次只修改一个组件
5. **功能开关**：使用功能开关控制新功能

### 对于测试

1. **性能对比**：测试 msgpack vs JSON 的性能差异
2. **数据迁移**：测试 JSON → msgpack 的迁移正确性
3. **边界情况**：测试空队列、大量卡片、网络错误
4. **兼容性**：测试现有数据的向后兼容性

---

## 📞 需要帮助？

- 查看 [requirements.md](./requirements.md) 了解需求
- 查看 [design.md](./design.md) 了解技术方案
- 查看 [tasks.md](./tasks.md) 了解实施计划
- 查看 [AI_HANDOFF_GUIDE.md](../../../siyuan-plugin-fsrs/docs/AI_HANDOFF_GUIDE.md) 了解项目架构

---

## 🎉 总结

规范文档已完成，包含：

1. ✅ **问题验证**：你的问题总结完全准确
2. ✅ **解决方案**：清晰的架构设计和技术方案
3. ✅ **msgpack 优化**：采纳思源开发者建议
4. ✅ **实施计划**：66 个任务，7-11 天
5. ✅ **测试策略**：完整的单元测试和集成测试
6. ✅ **风险缓解**：功能开关、数据备份、回滚机制

**可以开始实施了！** 🚀

---

**创建时间**: 2026-01-31  
**最后更新**: 2026-01-31  
**维护者**: AI Assistant
