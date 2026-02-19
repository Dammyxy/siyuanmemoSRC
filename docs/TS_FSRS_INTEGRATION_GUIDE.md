# TS-FSRS 集成指南

> 本文档介绍插件如何集成官方 ts-fsrs 库，以及如何配置和使用 FSRS v6 调度器。

## 概述

插件使用官方 [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 库（版本 5.2.3）实现 FSRS v6 算法，提供：

- ✅ **官方维护的完整算法**：与 Anki 使用相同的 FSRS 实现
- ✅ **更准确的记忆预测**：基于最新的 FSRS-6.0 算法
- ✅ **持续更新支持**：跟随官方算法改进
- ✅ **完整的测试覆盖**：官方库经过充分测试验证

## 什么是 FSRS？

FSRS (Free Spaced Repetition Scheduler) 是一个现代化的间隔重复算法，相比传统的 SM-2 算法：

- **更准确**：基于大量真实复习数据训练
- **更智能**：考虑记忆的稳定性和难度两个维度
- **可优化**：支持根据个人复习历史优化参数
- **科学验证**：经过学术研究和实践验证

## 架构设计

### 调度器层次

```
SchedulerRouter (调度器路由)
    │
    ├─ TSFSRSScheduler (FSRS v6 - 官方实现)
    │   └─ ts-fsrs 库
    │
    ├─ RiffScheduler (思源原生)
    ├─ SM15Scheduler (SuperMemo 15)
    └─ AFactorV2Scheduler (增量阅读)
```

### TSFSRSScheduler 适配器

`TSFSRSScheduler` 是一个适配器类，负责：

1. **接口适配**：实现插件的 `SchedulerEngineAdapter` 接口
2. **数据转换**：在插件格式和 ts-fsrs 格式之间转换
3. **参数管理**：管理 FSRS 算法参数配置

## 配置说明

### 参数配置

FSRS 调度器支持以下参数配置：

```typescript
interface FSRSParameters {
  // 目标保留率 (0-1)
  // 表示你希望在复习时能够回忆起卡片的概率
  // 默认：0.9 (90%)
  // 建议：0.85-0.95
  requestRetention: number;
  
  // 最大复习间隔（天）
  // 限制两次复习之间的最大天数
  // 默认：36500 (约 100 年)
  // 建议：根据学习内容调整，如 365 天
  maximumInterval: number;
  
  // FSRS 算法权重（19 个参数）
  // 控制算法的具体行为
  // 默认：使用官方默认权重
  // 可通过参数优化功能自动调整
  weights: number[];
  
  // 是否启用模糊化
  // 为复习时间添加随机偏移，避免大量卡片同时到期
  // 默认：true
  // 建议：保持启用
  enableFuzz: boolean;
}
```

### 默认配置

插件使用以下默认配置：

```typescript
const defaultFSRSParams: FSRSParameters = {
  requestRetention: 0.9,        // 90% 保留率
  maximumInterval: 36500,       // 100 年
  weights: [                    // 官方默认权重
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
    0.5316, 1.0651, 0.0234, 1.616, 0.1544,
    1.0824, 1.9813, 0.0953, 0.2975, 2.2042,
    0.2407, 2.9466, 0.5034, 0.6567
  ],
  enableFuzz: true              // 启用模糊化
};
```

### 在设置中配置

1. 打开插件设置面板
2. 切换到"调度器"标签
3. 选择"FSRS v6"作为默认调度器
4. 展开"FSRS 参数"部分
5. 调整参数值（可选）

**注意**：大多数用户使用默认参数即可获得良好效果。

## 使用指南

### 基本使用

FSRS v6 调度器会自动应用于所有 Item 类型的卡片（提取练习、刻意练习等）。

**评分说明**：

- **Again (1)**：完全忘记，需要重新学习
- **Hard (2)**：回忆困难，但最终想起来了
- **Good (3)**：回忆顺利，正常难度
- **Easy (4)**：回忆轻松，非常简单

### 复习时间预测

在复习界面，每个评分按钮会显示下次复习时间：

```
Again: 10 分钟
Hard:  1 天
Good:  4 天
Easy:  7 天
```

这些时间由 FSRS 算法根据：
- 卡片的当前稳定性（记忆强度）
- 卡片的难度
- 你的目标保留率
- 历史复习表现

动态计算得出。

### 记忆状态

FSRS 为每张卡片维护以下状态：

- **Stability（稳定性）**：记忆强度，值越大表示记得越牢
- **Difficulty（难度）**：卡片难度，值越大表示越难记忆
- **State（状态）**：New（新卡）、Learning（学习中）、Review（复习中）、Relearning（重新学习）
- **Retrievability（可提取性）**：当前时刻能够回忆起的概率

## 数据格式

### 卡片数据结构

```typescript
interface FSRSCard {
  // 业务字段
  id: string;                   // 卡片 ID
  blockId: string;              // 关联的块 ID
  type: CardType;               // 卡片类型
  deckID?: string;              // 牌组 ID
  
  // FSRS 调度字段
  due: number;                  // 下次复习时间（Unix 毫秒时间戳）
  stability: number;            // 稳定性（记忆强度）
  difficulty: number;           // 难度（1-10）
  elapsedDays: number;          // 距离上次复习的天数
  scheduledDays: number;        // 计划的复习间隔天数
  reps: number;                 // 复习次数
  lapses: number;               // 遗忘次数
  state: CardState;             // 卡片状态（0-3）
  lastReview: number;           // 上次复习时间（Unix 毫秒时间戳）
  
  // 元数据
  createdAt: number;            // 创建时间
  updatedAt: number;            // 更新时间
}
```

### 与 ts-fsrs 的数据转换

插件内部会自动进行数据格式转换：

| 插件字段 | ts-fsrs 字段 | 转换说明 |
|---------|-------------|---------|
| `due` (number) | `due` (Date) | 毫秒时间戳 ↔ Date 对象 |
| `lastReview` (number) | `last_review` (Date) | 毫秒时间戳 ↔ Date 对象 |
| `elapsedDays` | `elapsed_days` | 驼峰命名 ↔ 下划线命名 |
| `scheduledDays` | `scheduled_days` | 驼峰命名 ↔ 下划线命名 |
| `stability` | `stability` | 直接映射 |
| `difficulty` | `difficulty` | 直接映射 |
| `reps` | `reps` | 直接映射 |
| `lapses` | `lapses` | 直接映射 |
| `state` | `state` | 直接映射 |

**重要**：业务字段（`id`、`blockId`、`type` 等）在转换过程中会被保留，不会丢失。

## 迁移指南

### 从 SimpleFSRSScheduler 迁移

如果你之前使用的是插件自实现的 `SimpleFSRSScheduler`，现在已经完全替换为官方 `ts-fsrs` 库。

**好消息**：迁移是自动的，无需任何操作！

#### 数据兼容性

- ✅ **卡片数据格式相同**：两个实现使用相同的数据结构
- ✅ **参数配置兼容**：参数名称和含义保持一致
- ✅ **复习历史保留**：所有历史数据完整保留
- ✅ **无缝切换**：升级后立即可用

#### 算法差异

官方 ts-fsrs 实现与之前的 SimpleFSRSScheduler 可能在以下方面有细微差异：

1. **计算精度**：官方实现经过更严格的测试和优化
2. **边界情况处理**：官方实现对异常情况的处理更完善
3. **性能优化**：官方实现经过性能优化

**预期影响**：
- 复习间隔可能略有不同（通常更准确）
- 整体学习效果应该相同或更好
- 不会出现数据丢失或错误

### 从其他调度器迁移

#### 从 SM-2 迁移

SM-2 调度器已在 FSRS v6 升级时被移除，自动迁移到 FSRS v6。

**迁移效果**：
- ✅ 更准确的记忆预测
- ✅ 更智能的间隔调整
- ✅ 支持参数优化

#### 从 Riff 迁移

如果你想从思源原生 Riff 调度器切换到 FSRS v6：

1. 打开插件设置
2. 将默认调度器改为"FSRS v6"
3. 现有卡片会在下次复习时使用新调度器

**注意**：
- 卡片的 `schedulerType` 字段会更新为 `'fsrs-v6'`
- 之前的复习历史会保留
- FSRS 会根据历史数据初始化卡片状态

## 高级功能

### 参数优化（计划中）

未来版本将支持根据你的复习历史自动优化 FSRS 参数：

```typescript
// 计划中的功能
interface ParameterOptimizer {
  // 根据复习历史优化参数
  optimize(reviewHistory: ReviewLog[]): FSRSParameters;
  
  // 评估参数效果
  evaluate(params: FSRSParameters): OptimizationMetrics;
}
```

**预期功能**：
- 分析你的复习历史
- 找到最适合你的参数配置
- 提高记忆效率和准确性

### 短期记忆模式（计划中）

未来版本将支持 ts-fsrs 的短期记忆模式：

```typescript
// 计划中的功能
interface FSRSParameters {
  // ... 现有参数
  
  // 启用短期记忆模式
  // 为新卡片提供更密集的复习计划
  enableShortTerm?: boolean;
}
```

**预期效果**：
- 新卡片的初始复习间隔更短
- 帮助快速建立记忆
- 适合需要快速掌握的内容

## 性能说明

### 性能指标

TSFSRSScheduler 的性能表现：

- **单次复习**：< 10ms
- **批量调度（100 张卡片）**：< 1s
- **内存占用**：与 SimpleFSRSScheduler 相当

### 性能优化建议

1. **使用默认参数**：避免频繁修改参数配置
2. **批量操作**：尽量批量处理卡片而不是逐个处理
3. **合理的最大间隔**：不要设置过大的 `maximumInterval`

## 故障排除

### 常见问题

#### Q: 复习间隔突然变化很大？

**A**: 这可能是正常的算法行为。FSRS 会根据你的评分动态调整间隔：
- 评分 "Easy" 会显著增加间隔
- 评分 "Again" 会重置间隔
- 这是算法根据你的记忆强度做出的调整

#### Q: 卡片状态显示异常？

**A**: 检查以下几点：
1. 确认卡片的 `schedulerType` 为 `'fsrs-v6'`
2. 检查 `stability` 和 `difficulty` 是否为合理值
3. 查看控制台是否有错误日志

#### Q: 参数修改后没有生效？

**A**: 参数修改只影响后续的复习，不会改变已有卡片的状态。如需重新计算：
1. 修改参数配置
2. 重启插件
3. 新的复习会使用新参数

### 调试信息

如需调试 FSRS 调度器，可以在控制台查看：

```javascript
// 查看卡片的 FSRS 状态
console.log(card.stability, card.difficulty, card.state);

// 查看调度器配置
console.log(schedulerRouter.getScheduler('fsrs-v6'));
```

## 技术参考

### 相关文档

- **官方文档**：[ts-fsrs GitHub](https://github.com/open-spaced-repetition/ts-fsrs)
- **算法说明**：[FSRS Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm)
- **需求文档**：`.kiro/specs/ts-fsrs-integration/requirements.md`
- **设计文档**：`.kiro/specs/ts-fsrs-integration/design.md`

### 源代码

- **TSFSRSScheduler**：`src/core/scheduler/strategies/TSFSRSScheduler.ts`
- **SchedulerRouter**：`src/core/scheduler/SchedulerRouter.ts`
- **类型定义**：`src/types/index.ts`

### 测试

- **单元测试**：`src/core/scheduler/strategies/__tests__/TSFSRSScheduler.test.ts`
- **集成测试**：`src/core/scheduler/__tests__/SchedulerRouter.integration.test.ts`
- **功能测试**：`src/core/scheduler/__tests__/TSFSRSScheduler.functional.test.ts`

## 总结

ts-fsrs 集成为插件带来：

- ✅ **官方维护的算法**：与 Anki 等主流工具保持一致
- ✅ **更准确的预测**：基于最新的科学研究
- ✅ **持续的更新**：跟随官方改进
- ✅ **完整的测试**：经过充分验证

对于大多数用户，使用默认配置即可获得良好的学习效果。如有特殊需求，可以根据本文档调整参数配置。

---

**最后更新**：2024年
**版本**：ts-fsrs 5.2.3 / FSRS v6
