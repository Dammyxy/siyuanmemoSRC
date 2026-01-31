# Phase 2 测试指南

## 测试目标

验证 IncrementalLearningQueue 是否正确使用 SchedulerRouter 进行统一调度。

## 测试步骤

### 1. 重新加载插件

1. 在思源笔记中，打开插件管理
2. 禁用 FSRS 插件
3. 启用 FSRS 插件
4. 打开浏览器控制台（F12）

### 2. 检查初始化日志

在控制台中查找以下日志：

```
[FSRS] ✅ Incremental learning queue initialized: {
  hasQueue: true,
  hasAddItems: true,
  queueName: "IncrementalLearningQueue",
  hasSchedulerRouter: true,  // ✅ 应该为 true
  enableRiffSync: false       // 根据设置可能为 true 或 false
}
```

**验证点**：
- `hasSchedulerRouter` 应该为 `true`
- `enableRiffSync` 显示是否启用 Riff 同步

### 3. 开始复习

1. 打开卡片浏览器
2. 选择一些卡片
3. 点击"开始练习"按钮
4. 选择"渐进学习"队列

### 4. 评分并检查日志

在控制台中查找以下关键日志：

#### 成功使用 SchedulerRouter 的日志：

```
[IncrementalLearningQueue] ✅ Used SchedulerRouter: {
  cardID: "20250404234439-d8iwebj",
  isLocal: false,
  cardType: "item",
  schedulerType: "fsrs-v5",
  syncedToRiff: false
}
```

**验证点**：
- 应该看到 `✅ Used SchedulerRouter` 日志
- `cardType` 显示卡片类型（item 或 topic）
- `schedulerType` 显示使用的调度器（fsrs-v5、sm15 或 sm2）
- `syncedToRiff` 显示是否同步到 Riff（取决于 enableRiffSync 设置）

#### 后备方案的日志（如果卡片不在 storage 中）：

```
[IncrementalLearningQueue] Card not found in storage, using Riff API: 20250404234439-d8iwebj
```

### 5. 测试 Skip 功能

1. 点击"跳过"按钮
2. 检查日志：

```
[IncrementalLearningQueue] ✅ Added to blacklist (skip): 20250404234437-4efn2it
```

**验证点**：
- Riff 卡片被跳过时，应该添加到黑名单
- 本地卡片被跳过时，应该移到队列末尾

### 6. 测试删除功能

1. 在卡片浏览器中选择一些卡片
2. 点击"删除"按钮
3. 检查日志：

```
[IncrementalLearningQueue] ✅ Removed from Riff: 2
[IncrementalLearningQueue] removeItems result: {
  total: 3,
  removed: 3,
  local: 1,
  riff: 2
}
```

**验证点**：
- 应该看到 Riff API 删除调用
- 如果删除失败，应该看到黑名单添加日志

## 常见问题

### Q1: 没有看到 "Used SchedulerRouter" 日志

**原因**：
- `schedulerRouter` 或 `storage` 为 undefined
- 卡片不在 storage 中

**解决方案**：
1. 检查初始化日志，确认 `hasSchedulerRouter: true`
2. 确保卡片已经被添加到 storage（通过复习或手动添加）

### Q2: 四个评分选项时间都一样

**这个问题已经修复！**

现在 RiffDataSource 使用 `SchedulerRouter.preview()` 来预测四个选项的时间：
- Topic 卡片使用 A因子V2 算法
- Item 卡片使用 SM-15 算法（或你设置的调度器）
- 每个评分选项会有不同的预测时间

如果你仍然看到四个选项时间都一样，可能的原因：
1. **卡片不在 storage 中**：需要先复习一次卡片，让它进入本地数据库
2. **schedulerRouter 未传入**：检查初始化日志，确认 `hasSchedulerRouter: true`
3. **卡片是新卡片**：新卡片可能还没有足够的数据来预测不同的时间

**解决方案**：
1. 重新加载插件
2. 复习几张卡片，让它们进入本地数据库
3. 再次查看，应该会看到不同的预测时间

### Q3: enableRiffSync 是什么？

`enableRiffSync` 控制是否将本地调度结果同步回 Riff 数据库。

- `true`：复习后会同时更新本地数据库和 Riff 数据库
- `false`（默认）：只更新本地数据库，不同步到 Riff

**推荐设置**：`false`（避免数据冲突）

## 测试清单

- [ ] 初始化日志显示 `hasSchedulerRouter: true`
- [ ] 评分时看到 "Used SchedulerRouter" 日志
- [ ] Skip 功能正常（添加到黑名单）
- [ ] 删除功能正常（调用 Riff API）
- [ ] 错误处理正常（失败时添加到黑名单）

## 下一步

如果所有测试通过，Phase 2 就完成了！可以继续进行：

- Phase 3: 集成测试和性能优化
- Phase 4: 数据迁移和部署
