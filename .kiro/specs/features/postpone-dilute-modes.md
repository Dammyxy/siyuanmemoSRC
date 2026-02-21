# 推迟功能：Postpone vs Dilute 模式

## 功能说明

推迟功能有两种模式：

### 1. Postpone 模式（默认）

**行为**：只处理到期的卡片（Outstanding cards）

**适用场景**：
- 今天有太多到期卡片需要复习
- 想推迟部分到期卡片到未来
- 保持未到期卡片的原有计划

**配置**：
```typescript
{
  includeNonOutstanding: false  // 默认值
}
```

**示例**：
- 卡片 A：到期日 = 昨天 → ✅ 会被推迟
- 卡片 B：到期日 = 明天 → ❌ 跳过（not-outstanding）
- 卡片 C：到期日 = 今天 → ✅ 会被推迟

### 2. Dilute 模式

**行为**：处理所有选中的卡片，包括未到期的

**适用场景**：
- 长期旅行或休假，需要稀释所有卡片
- 想统一调整一批卡片的间隔
- 类似 SuperMemo 的 Dilute 操作

**配置**：
```typescript
{
  includeNonOutstanding: true  // 启用 Dilute 模式
}
```

**示例**：
- 卡片 A：到期日 = 昨天 → ✅ 会被推迟
- 卡片 B：到期日 = 明天 → ✅ 会被推迟
- 卡片 C：到期日 = 今天 → ✅ 会被推迟

## 用户报告的问题

### 问题描述

用户选择了 2 张卡片进行推迟，但都被跳过：

```
skippedReasons: {not-outstanding: 2}
```

### 原因分析

这两张卡片都还没到期，而用户使用的是默认的 Postpone 模式（`includeNonOutstanding: false`）。

### 解决方案

用户有两个选择：

#### 选项 1：启用 Dilute 模式（推荐）

在推迟对话框中勾选"包含未到期卡片 (Dilute 模式)"：

```
高级参数
☑ 包含未到期卡片 (Dilute 模式)
  启用后将处理所有选中的卡片，包括未到期的卡片（类似 SuperMemo 的 Dilute 操作）
```

#### 选项 2：等卡片到期后再推迟

如果只想推迟到期的卡片，等这些卡片到期后再执行推迟操作。

## UI 改进建议

### 当前 UI

对话框显示：
```
将为 2 张卡片执行推迟操作
```

但实际上可能有些卡片会被跳过。

### 改进建议 1：预检查并提示

在打开对话框前，检查选中的卡片：

```typescript
const outstandingCount = cards.filter(c => c.due <= Date.now()).length;
const nonOutstandingCount = cards.length - outstandingCount;

if (nonOutstandingCount > 0) {
  showMessage(
    `选中的 ${cards.length} 张卡片中，${outstandingCount} 张已到期，${nonOutstandingCount} 张未到期。` +
    `默认只会推迟已到期的卡片，如需推迟所有卡片，请启用 Dilute 模式。`,
    5000,
    'info'
  );
}
```

### 改进建议 2：动态显示统计

在对话框中显示：

```
将为 2 张卡片执行推迟操作
  - 已到期：0 张
  - 未到期：2 张

⚠️ 当前配置只会处理已到期的卡片。
   如需推迟未到期的卡片，请启用 Dilute 模式。
```

### 改进建议 3：智能默认值

如果所有选中的卡片都未到期，自动启用 Dilute 模式：

```typescript
const allNonOutstanding = cards.every(c => c.due > Date.now());
if (allNonOutstanding) {
  config.includeNonOutstanding = true;
  showMessage('所有选中的卡片都未到期，已自动启用 Dilute 模式', 3000, 'info');
}
```

## 实施计划

### Phase 1：文档和提示（立即）

1. ✅ 创建此文档说明两种模式的区别
2. 在对话框中添加更明显的提示
3. 在用户手册中说明

### Phase 2：UI 改进（短期）

1. 实施改进建议 1：预检查并提示
2. 实施改进建议 2：动态显示统计

### Phase 3：智能默认（中期）

1. 实施改进建议 3：智能默认值
2. 添加配置选项，让用户选择默认行为

## 技术细节

### PostponeEngine 的逻辑

```typescript
// src/core/scheduler/PostponeEngine.ts:106
if (!isDilute && !includeNonOutstanding && card.due > Date.now()) {
    skippedReasons['not-outstanding'] = (skippedReasons['not-outstanding'] || 0) + 1;
    continue;
}
```

### 默认配置

```typescript
// src/core/scheduler/ConfigManager.ts:112
includeNonOutstanding: false,  // 默认为 Postpone 模式（仅处理到期卡片）
```

## 参考资料

- SuperMemo 的 Postpone vs Dilute: https://help.supermemo.org/wiki/Postpone
- FSRS 的间隔调整策略
- 用户反馈和使用场景

## 总结

这不是 bug，而是按设计工作的功能：

- ✅ Postpone 模式默认只处理到期卡片（符合语义）
- ✅ Dilute 模式可以处理所有卡片（需要手动启用）
- ⚠️ UI 可以改进，提供更清晰的提示和反馈
- 📝 需要更好的文档和用户教育
