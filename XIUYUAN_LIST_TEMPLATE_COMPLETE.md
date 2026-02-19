# Xiuyuan 列表模板卡功能 - 完成文档

## 功能概述

列表模板卡功能允许用户从一个父列表项和多个子列表项自动创建多张闪卡：
- 父列表项内容作为问题（所有卡片共享）
- 每个子列表项作为一张独立卡片的答案

## 实现架构

### 核心设计原则

遵循 Xiuyuan 的设计理念：**一个源（Xiuyuan）→ 多张卡片（FSRSCard）**

```
父列表项（问题）
├─ 子列表项 1 → 卡片 1
├─ 子列表项 2 → 卡片 2
└─ 子列表项 3 → 卡片 3

1 个 Xiuyuan + 3 张 FSRSCard
```

### 关键文件

1. **模板定义**
   - `src/core/xiuyuan/templates/builtin.ts` - `LIST_ITEM_TEMPLATE`

2. **创建逻辑**
   - `src/core/xiuyuan/listTemplate.ts` - 专用创建函数
   - `src/core/xiuyuan/cardMeta.ts` - 类型定义和辅助函数

3. **菜单集成**
   - `src/services/BlockMenuHandler.ts` - "创建列表模版卡" 菜单项

4. **复习适配**
   - `src/strategies/UnifiedReviewAdapter.ts` - Xiuyuan 卡片支持
   - `src/ui/review/v2/ReviewContent.vue` - 双块渲染（问题+答案）

## 数据结构

### Xiuyuan 结构

```typescript
{
  id: "xy_1771059401526_re5m75",
  blockIDs: [parentBlockId, ...childBlockIds],
  fields: [
    { name: 'question', blockID: parentBlockId, marker: 'question' },
    { name: 'answer', blockID: '', marker: 'answer' }
  ],
  templateID: "builtin-list-item"
}
```

### FSRSCard 结构

每张卡片独立存储：

```typescript
{
  id: "xy_card_xy_1771059401526_re5m75_0_1771059401526_pyknjr",
  blockId: childBlockId,  // 主块 ID（用于卡片浏览器）
  meta: {
    xiuyuanID: "xy_1771059401526_re5m75",
    templateID: "builtin-list-item",
    ruleIndex: 0,
    frontFields: ["question"],
    backFields: ["answer"],
    fieldMapping: {
      question: parentBlockId,
      answer: childBlockId  // 每张卡片不同
    },
    frontBlockIDs: [parentBlockId],
    backBlockIDs: [childBlockId]
  }
}
```

## 使用方法

1. 创建列表结构：
   ```markdown
   - 什么是 FSRS？（父列表项）
     - FSRS 是一种间隔重复算法（子级1）
     - 它基于记忆遗忘曲线（子级2）
     - 可以优化复习时间（子级3）
   ```

2. 右键点击父列表项

3. 选择 "创建列表模版卡"

4. 自动创建 3 张卡片，每张卡片：
   - 问题：什么是 FSRS？
   - 答案：各自的子列表项内容

## 复习体验

### 显示逻辑

1. **初始状态**：显示问题（父列表项）
2. **点击"显示答案"**：在问题下方显示答案（子列表项）
3. **评分**：独立的 FSRS 调度

### 渲染实现

- 使用两个独立的 Protyle 实例
- 问题块：`frontBlockIDs[0]`
- 答案块：`backBlockIDs[0]`
- 答案分隔线：`─── 答案 ───`

## 技术亮点

### 1. 动态字段映射

每张卡片有独立的 `fieldMapping`，支持不同的答案块：

```typescript
// 卡片 1
fieldMapping: { question: parentBlockId, answer: childBlockId1 }

// 卡片 2
fieldMapping: { question: parentBlockId, answer: childBlockId2 }
```

### 2. 独立卡片 ID

格式：`xy_card_{xiuyuanID}_{index}_{timestamp}_{random}`

确保每张卡片有唯一标识，支持独立的复习调度。

### 3. 渲染信息预计算

在卡片创建时计算 `frontBlockIDs` 和 `backBlockIDs`，复习时直接使用，无需重新计算。

### 4. 向后兼容

支持旧的 Xiuyuan 卡片（使用 `answerBlockID` 字段）。

## 验证清单

- [x] 创建功能：从列表项创建多张卡片
- [x] 数据结构：1 个 Xiuyuan + N 张 FSRSCard
- [x] 复习界面：正确显示问题和答案
- [x] 独立调度：每张卡片独立的 FSRS 状态
- [x] 卡片浏览器：显示正确的主块
- [x] 向后兼容：支持旧的 Xiuyuan 卡片

## 未来优化方向

1. **批量编辑**：支持同时编辑同一 Xiuyuan 的所有卡片
2. **卡片关联**：在卡片浏览器中显示同源卡片
3. **模板扩展**：支持更多字段组合（如：问题+提示+答案）
4. **性能优化**：大量子列表项时的创建性能

## 相关文档

- `XIUYUAN_REDESIGN.md` - Xiuyuan 架构设计
- `XIUYUAN_LIST_TEMPLATE_IMPLEMENTATION.md` - 实现细节
- `XIUYUAN_LIST_TEMPLATE_DEBUG_GUIDE.md` - 调试指南

---

**状态**: ✅ 完成并测试通过  
**日期**: 2026-02-14  
**版本**: v1.0
