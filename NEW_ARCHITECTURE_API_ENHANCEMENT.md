# 新架构 API 增强完成报告

## 📋 概述

本次更新为统一数据源架构补充了旧架构中存在的便利方法，完善了队列接口的功能性。

## ✅ 新增功能

### 1. 队列统计信息 (`getStats()`)

**接口定义**：
```typescript
interface QueueStats {
    total: number;      // 队列中的总卡片数
    due: number;        // 到期卡片数
    new: number;        // 新卡片数（从未复习过）
    learning: number;   // 学习中的卡片数
    reviewed: number;   // 已复习的卡片数（本次会话）
}

getStats(): Promise<QueueStats>
```

**实现位置**：
- `BaseReviewQueue.getStats()` - 默认实现，基于当前队列卡片计算统计
- 子类可以覆盖以提供更精确的统计

**使用场景**：
- UI 显示队列统计信息
- 监控队列状态
- 进度条显示

### 2. 跳过卡片 (`skip()`)

**接口定义**：
```typescript
skip(cardId: string): Promise<void>
```

**实现位置**：
- `BaseReviewQueue.skip()` - 默认实现，将卡片移到队列末尾
- 子类可以覆盖以提供自定义行为

**行为**：
- 将指定卡片移到队列末尾
- 不影响卡片的调度数据
- 通知观察者队列已变更

**使用场景**：
- 用户临时跳过某张卡片
- 稍后再复习该卡片

### 3. UI 配置 (`getUIConfig()`)

**接口定义**：
```typescript
interface QueueUIConfig {
    displayName: string;           // 队列显示名称
    buttons: ReviewButtonConfig[]; // 复习按钮配置
    showSkipButton: boolean;       // 是否显示跳过按钮
    showProgressBar: boolean;      // 是否显示进度条
    customClass?: string;          // 自定义 CSS 类名（可选）
}

getUIConfig(): QueueUIConfig
```

**实现位置**：
- `BaseReviewQueue.getUIConfig()` - 默认实现，返回标准 4 按钮配置
- `IncrementalLearningQueue.getUIConfig()` - 覆盖实现，返回自定义按钮配置

**默认按钮配置**：
```typescript
[
    { type: 'rating', label: 'Again', value: 1 },
    { type: 'rating', label: 'Hard', value: 2 },
    { type: 'rating', label: 'Good', value: 3 },
    { type: 'rating', label: 'Easy', value: 4 },
]
```

**渐进学习队列按钮配置**：
```typescript
[
    { type: 'rating', label: 'Again', value: 1 },
    { type: 'rating', label: 'Hard', value: 2 },
    { type: 'rating', label: 'Good', value: 3 },
    { type: 'rating', label: 'Easy', value: 4 },
    { type: 'action', label: 'Insert', action: 'insert' },
    { type: 'action', label: 'Next', action: 'next' },
]
```

**使用场景**：
- 复习界面动态生成按钮
- 不同队列类型显示不同的按钮
- 自定义队列 UI 样式

## 📝 修改的文件

### 1. `src/types/unified-data-source.ts`
- ✅ 新增 `QueueStats` 接口
- ✅ 新增 `QueueUIConfig` 接口
- ✅ 在 `IReviewQueue` 接口中添加三个方法签名：
  - `skip(cardId: string): Promise<void>`
  - `getStats(): Promise<QueueStats>`
  - `getUIConfig(): QueueUIConfig`

### 2. `src/queues/BaseReviewQueue.ts`
- ✅ 实现 `skip()` 方法（默认实现）
- ✅ 实现 `getStats()` 方法（默认实现）
- ✅ 实现 `getUIConfig()` 方法（默认实现）
- ✅ 新增 `getDefaultButtons()` 辅助方法

### 3. `src/queues/IncrementalLearningQueue.ts`
- ✅ 覆盖 `getUIConfig()` 方法（自定义按钮配置）
- ✅ 新增 `getIncrementalLearningButtons()` 辅助方法

### 4. `src/ui/review/v2/providers/IncrementalLearningProvider.ts`
- ✅ 更新 `skipReviewCard()` 方法，使用队列的 `skip()` 方法
- ✅ 更新 `getStats()` 方法，使用队列的 `getStats()` 方法
- ✅ 移除临时实现，改为调用队列方法

## 🎯 设计理念

### 职责分离

**旧架构**（队列中心模式）：
- 队列自包含所有功能
- 统计、跳过、UI 配置都在队列内部实现

**新架构**（数据源中心模式）：
- 队列专注于数据管理和复习逻辑
- 统计、跳过、UI 配置作为便利方法提供
- Provider 层可以直接使用队列方法，无需自己实现

### 默认实现 + 可覆盖

- `BaseReviewQueue` 提供默认实现（适用于大多数队列）
- 子类可以覆盖以提供自定义行为（如渐进学习队列的自定义按钮）

### 向后兼容

- 新增的方法不影响现有代码
- Provider 层可以逐步迁移到使用队列方法
- 旧的临时实现可以保留或移除

## ✅ 验证结果

- ✅ 所有文件编译通过，无语法错误
- ✅ 类型定义完整，无类型错误
- ✅ 接口实现完整，无缺失方法

## 📊 对比总结

| 功能 | 旧架构 | 新架构（之前） | 新架构（现在） |
|------|--------|----------------|----------------|
| `getStats()` | ✅ 队列内置 | ❌ 缺失 | ✅ 队列内置 |
| `skip()` | ✅ 队列内置 | ❌ 缺失 | ✅ 队列内置 |
| `getUIConfig()` | ✅ 队列内置 | ❌ 缺失 | ✅ 队列内置 |
| 职责分离 | ❌ 队列中心 | ✅ 数据源中心 | ✅ 数据源中心 |
| 可扩展性 | ❌ 低 | ✅ 高 | ✅ 高 |

## 🎉 结论

新架构现在已经完全补充了旧架构的便利方法，同时保持了数据源中心的设计理念。这不是设计错误，而是设计理念的转变和完善。

**核心优势**：
1. ✅ 功能完整性：所有旧架构的便利方法都已补充
2. ✅ 职责分离：队列专注于数据管理，便利方法作为辅助
3. ✅ 可扩展性：子类可以覆盖方法以提供自定义行为
4. ✅ 向后兼容：不影响现有代码，可以逐步迁移

---

**日期**: 2026-02-06  
**作者**: Kiro AI Assistant
