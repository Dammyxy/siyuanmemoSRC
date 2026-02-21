# 插入队列功能修复

## 问题描述

插入队列功能失效，报错：`[SiYuanMemo][ReviewActions] No card ID found`

## 根本原因

在 `UnifiedReviewAdapter.ts` 中，`cardMeta` 使用的字段名是：
- `blockID` (大写)
- `cardID` (大写)

但在 `ReviewActions.vue` 的 `onInsertConfirm` 方法中，尝试获取的是：
- `id` (小写)
- `blockId` (小写)

```typescript
// ReviewActions.vue:193
const cardId = props.actions.cardMeta?.id || props.actions.cardMeta?.blockId;
```

这导致无法获取到卡片 ID。

## 解决方案

按照 DDD 架构原则，修复字段名不一致的问题。有两个选择：

### 方案 1：修改 ReviewActions.vue（推荐）

在 UI 层适配 Adapter 提供的字段名。

### 方案 2：修改 UnifiedReviewAdapter.ts

统一使用小写字段名，但这可能影响其他地方的兼容性。

## 实施计划

采用方案 1，修改 `ReviewActions.vue` 中的两处代码：

1. `onInsertConfirm` 方法（第 193 行）
2. `onScheduleConfirm` 方法（第 230 行）

统一使用 `blockID` 和 `cardID`（大写）来获取卡片 ID。

## 验证步骤

1. 点击"跳过"按钮的下拉菜单
2. 选择"插入到队列指定位置"
3. 输入位置并确认
4. 验证卡片成功插入到指定位置
5. 验证"安排复习日期"功能也正常工作

## DDD 架构合规性

- ✅ Adapter 层负责数据转换（UnifiedReviewAdapter）
- ✅ UI 层使用 Adapter 提供的数据结构（ReviewActions）
- ✅ 不破坏现有的兼容性逻辑
- ✅ 保持字段命名的一致性
