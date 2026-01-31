# Riff 数据源解耦 - 任务清单

## Phase 1: 基础设施（1-2 天）

### 1.0 迁移到 msgpack 存储格式
- [x] 1.0.1 安装 `@msgpack/msgpack` 依赖
- [x] 1.0.2 修改 `saveData()` 方法使用 msgpack 编码
- [x] 1.0.3 修改 `loadData()` 方法使用 msgpack 解码
- [x] 1.0.4 更新 `STORAGE_FILES` 常量（.msgpack 扩展名）
- [x] 1.0.5 实现 `migrateToMsgpack()` 数据迁移方法
- [x] 1.0.6 在 `init()` 中调用迁移方法（首次运行）
- [x] 1.0.7 测试 msgpack 读写性能

### 1.1 StorageManager 添加黑名单管理
- [x] 1.1.1 添加 `riffBlacklist` 属性
- [x] 1.1.2 实现 `getRiffBlacklist()` 方法
- [x] 1.1.3 实现 `addToRiffBlacklist()` 方法
- [x] 1.1.4 实现 `removeFromRiffBlacklist()` 方法
- [x] 1.1.5 实现 `clearRiffBlacklist()` 方法
- [x] 1.1.6 实现 `_persistRiffBlacklist()` 方法（msgpack 格式）
- [x] 1.1.7 实现 `_loadRiffBlacklist()` 方法（msgpack 格式）
- [x] 1.1.8 在 `init()` 中调用 `_loadRiffBlacklist()`

### 1.2 RiffDataSource 添加 storage 参数
- [x] 1.2.1 修改 `RiffDataSourceOptions` 类型定义
- [x] 1.2.2 在构造函数中接受 `storage` 参数
- [x] 1.2.3 添加 `storage` 属性

### 1.3 RiffDataSource 实现 mergeLocalNextDues()
- [x] 1.3.1 实现 `mergeLocalNextDues()` 方法
- [x] 1.3.2 实现 `extractNextDues()` 辅助方法
- [x] 1.3.3 在 `getAll()` 方法中调用 `mergeLocalNextDues()`
- [x] 1.3.4 添加日志输出

### 1.4 单元测试（Phase 1）
- [ ] 1.4.1 测试 msgpack 编码/解码
- [ ] 1.4.2 测试 JSON → msgpack 迁移
- [ ] 1.4.3 测试 StorageManager 黑名单功能
- [ ] 1.4.4 测试 RiffDataSource mergeLocalNextDues()
- [ ] 1.4.5 测试黑名单过滤功能
- [ ] 1.4.6 性能测试（msgpack vs JSON）

---

## Phase 2: IncrementalLearningQueue 集成（2-3 天）

### 2.1 添加 schedulerRouter 参数
- [x] 2.1.1 修改构造函数签名
- [x] 2.1.2 添加 `schedulerRouter` 属性
- [x] 2.1.3 添加 `config` 属性（包含 enableRiffSync）

### 2.2 修改 onFeedback() 方法
- [x] 2.2.1 添加 SchedulerRouter 调用逻辑
- [x] 2.2.2 实现 QueueItem → FSRSCard 转换
- [x] 2.2.3 实现 Riff 同步逻辑（可选）
- [x] 2.2.4 修改 skip 逻辑（添加黑名单）
- [x] 2.2.5 添加后备方案（兼容旧逻辑）
- [x] 2.2.6 添加详细日志

### 2.3 修改 removeItems() 方法
- [x] 2.3.1 添加 Riff API 删除调用
- [x] 2.3.2 实现错误处理（添加黑名单）
- [x] 2.3.3 添加日志输出
- [x] 2.3.4 保持本地队列持久化

### 2.4 更新 RetrievalHybridDataSource
- [x] 2.4.1 在 `remove()` 方法中添加 Riff API 调用
- [x] 2.4.2 实现黑名单添加逻辑
- [x] 2.4.3 添加错误处理

### 2.5 单元测试（Phase 2）
- [ ] 2.5.1 测试 IncrementalLearningQueue 使用 SchedulerRouter
- [ ] 2.5.2 测试 removeItems() 调用 Riff API
- [ ] 2.5.3 测试黑名单添加
- [ ] 2.5.4 测试 Riff 同步（可选）

---

## Phase 3: 测试和优化（2-3 天）

### 3.1 集成测试
- [ ] 3.1.1 测试完整复习流程（本地调度器）
- [ ] 3.1.2 测试 nextDues 持久化
- [ ] 3.1.3 测试删除操作（Riff + 本地）
- [ ] 3.1.4 测试黑名单过滤
- [ ] 3.1.5 测试 Riff 同步（可选）

### 3.2 性能优化
- [ ] 3.2.1 实现批量查询优化
- [ ] 3.2.2 实现缓存策略
- [ ] 3.2.3 性能测试（批量查询时间 < 100ms）
- [ ] 3.2.4 性能测试（删除操作时间 < 50ms）

### 3.3 边界情况测试
- [ ] 3.3.1 测试空队列
- [ ] 3.3.2 测试大量卡片（1000+）
- [ ] 3.3.3 测试网络错误（Riff API 失败）
- [ ] 3.3.4 测试数据不一致（本地 vs Riff）

---

## Phase 4: 数据迁移和部署（1-2 天）

### 4.1 数据迁移工具
- [ ] 4.1.1 实现 `migrateRiffToLocal()` 方法
- [ ] 4.1.2 实现数据备份功能
- [ ] 4.1.3 实现迁移进度显示
- [ ] 4.1.4 实现迁移验证

### 4.2 功能开关
- [ ] 4.2.1 添加 `FeatureFlags` 配置
- [ ] 4.2.2 实现功能开关逻辑
- [ ] 4.2.3 添加 UI 配置界面

### 4.3 文档更新
- [ ] 4.3.1 更新 AI_HANDOFF_GUIDE.md
- [ ] 4.3.2 更新 API_REFERENCE.md
- [ ] 4.3.3 添加迁移指南
- [ ] 4.3.4 添加故障排除文档

### 4.4 部署准备
- [ ] 4.4.1 代码审查
- [ ] 4.4.2 性能测试
- [ ] 4.4.3 兼容性测试
- [ ] 4.4.4 发布说明

---

## 可选任务（P2）

### 5.1 高级功能
- [ ]* 5.1.1 实现自动同步检测
- [ ]* 5.1.2 实现冲突解决 UI
- [ ]* 5.1.3 实现数据一致性检查工具
- [ ]* 5.1.4 实现批量迁移工具

### 5.2 监控和日志
- [ ]* 5.2.1 添加性能监控
- [ ]* 5.2.2 添加错误追踪
- [ ]* 5.2.3 添加使用统计
- [ ]* 5.2.4 实现日志分析工具

---

## 任务依赖关系

```
Phase 1 (基础设施)
  ├─ 1.1 StorageManager 黑名单
  ├─ 1.2 RiffDataSource storage 参数
  └─ 1.3 RiffDataSource mergeLocalNextDues
      ↓
Phase 2 (IncrementalLearningQueue)
  ├─ 2.1 添加 schedulerRouter 参数
  ├─ 2.2 修改 onFeedback()
  ├─ 2.3 修改 removeItems()
  └─ 2.4 更新 RetrievalHybridDataSource
      ↓
Phase 3 (测试和优化)
  ├─ 3.1 集成测试
  ├─ 3.2 性能优化
  └─ 3.3 边界情况测试
      ↓
Phase 4 (数据迁移和部署)
  ├─ 4.1 数据迁移工具
  ├─ 4.2 功能开关
  ├─ 4.3 文档更新
  └─ 4.4 部署准备
```

---

## 估算时间

| Phase | 任务数 | 估算时间 | 优先级 |
|-------|--------|----------|--------|
| Phase 1 | 21 | 2-3 天 | P0 |
| Phase 2 | 14 | 2-3 天 | P0 |
| Phase 3 | 11 | 2-3 天 | P0 |
| Phase 4 | 12 | 1-2 天 | P0 |
| 可选任务 | 8 | 2-3 天 | P2 |
| **总计** | **66** | **7-11 天** | - |

---

## 验收标准

### Phase 1
- ✅ StorageManager 黑名单功能正常
- ✅ RiffDataSource 可以合并本地 nextDues
- ✅ 单元测试通过

### Phase 2
- ✅ IncrementalLearningQueue 使用 SchedulerRouter
- ✅ removeItems() 调用 Riff API
- ✅ 黑名单功能正常
- ✅ 单元测试通过

### Phase 3
- ✅ 集成测试通过
- ✅ 性能指标达标
- ✅ 边界情况测试通过

### Phase 4
- ✅ 数据迁移工具可用
- ✅ 功能开关正常
- ✅ 文档完整
- ✅ 部署成功

---

## 风险和缓解

### 高风险任务
- **2.2 修改 onFeedback()**：核心逻辑修改，需要充分测试
- **2.3 修改 removeItems()**：涉及 Riff API 调用，需要错误处理
- **4.1 数据迁移工具**：数据迁移风险高，需要备份和验证

### 缓解措施
- 充分的单元测试和集成测试
- 功能开关（可以快速回滚）
- 数据备份（迁移前备份）
- 渐进式部署（先小范围测试）

---

## 下一步行动

1. **立即开始**：Phase 1.1 - StorageManager 添加黑名单管理
2. **准备工作**：阅读相关代码，理解现有逻辑
3. **测试环境**：准备测试数据和测试环境
4. **代码审查**：每个 Phase 完成后进行代码审查

---

**注意**：
- 标记 `[ ]` 的任务为必须实现（P0）
- 标记 `[ ]*` 的任务为可选实现（P2）
- 每个任务完成后更新状态为 `[x]`
