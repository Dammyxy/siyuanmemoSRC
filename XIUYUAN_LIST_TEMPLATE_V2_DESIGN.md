# Xiuyuan 列表模板卡 V2 - 设计文档

## 功能概述

基于 RemNote 的多行卡片提示功能，实现渐进式列表卡片复习。

## 核心特性

### 1. 有序列表限制
- 只有有序列表（`1.` `2.` 等）才能创建列表模板卡
- 菜单项在点击时检查列表类型

### 2. 提示功能
- 使用 `→` 分隔提示和答案
- 格式：`提示 → 答案`
- 提示可选，如果没有 `→` 分隔符，整个文本作为答案

### 3. 渐进式显示
- 复习卡片 N 时：
  - 卡片 1 到 N-1：显示答案
  - 卡片 N：显示提示（`? 提示 - N`）
  - 卡片 N+1 及以后：不显示（或显示提示）

## 数据结构

### 制卡时

```markdown
1. 什么是京剧的四大行当？  ← 父列表项（段落块）
   1. ? 男性角色 :: 生
   2. ? 女性角色 :: 旦
   3. ? 花脸 :: 净
   4. ? 丑角 :: 丑
```

### 存储结构

```typescript
{
  xiuyuanID: "xy_xxx",
  frontBlockIDs: [parentParagraphId],  // 父列表项的段落块
  backBlockIDs: [childId],             // 当前子列表项
  cue: "男性角色",                      // 提示文本
  answer: "生",                         // 答案文本
  allChildren: [                        // 所有子列表项信息
    { id: "child1", cue: "男性角色", answer: "生", index: 0 },
    { id: "child2", cue: "女性角色", answer: "旦", index: 1 },
    { id: "child3", cue: "花脸", answer: "净", index: 2 },
    { id: "child4", cue: "丑角", answer: "丑", index: 3 }
  ],
  currentIndex: 0                       // 当前卡片索引
}
```

## 复习界面渲染

### 卡片 1 - 正面

```
1. 什么是京剧的四大行当？
   1. ? 男性角色 - 1
```

### 卡片 1 - 背面

```
1. 什么是京剧的四大行当？
   1. 生
```

### 卡片 2 - 正面

```
1. 什么是京剧的四大行当？
   1. 生                    ← 已学过，显示答案
   2. ? 女性角色 - 1        ← 当前卡片，显示提示
```

### 卡片 2 - 背面

```
1. 什么是京剧的四大行当？
   1. 生
   2. 旦
```

## 实现方案

### 方案 A：动态 HTML 渲染（推荐）

**优点**：
- 完全控制渲染内容
- 可以精确实现渐进式显示
- 性能好

**缺点**：
- 需要手动构建 HTML
- 失去 Protyle 的编辑功能

**实现**：
1. 获取父段落块的 HTML
2. 根据 `currentIndex` 和 `allChildren` 构建子列表项 HTML
3. 合并为完整的列表 HTML
4. 使用 `content.type = 'html'` 渲染

### 方案 B：CSS 隐藏（备选）

**优点**：
- 保留 Protyle 功能
- 实现简单

**缺点**：
- 无法修改文本内容（提示 vs 答案）
- 只能隐藏/显示整个子列表项

**实现**：
1. 渲染完整的父列表项块
2. 使用 CSS 隐藏部分子列表项
3. 使用 JavaScript 修改文本内容

### 最终选择：方案 A（动态 HTML）

## 实现步骤

### 阶段 1：基础功能（已完成）
- [x] 有序列表检测
- [x] 提示解析（`::` 分隔符）
- [x] 数据存储（meta 字段）

### 阶段 2：HTML 渲染
- [ ] 创建 HTML 生成函数
- [ ] 修改 `UnifiedReviewAdapter.ts`
- [ ] 修改 `ReviewContent.vue`

### 阶段 3：测试和优化
- [ ] 测试基本功能
- [ ] 测试边界情况
- [ ] 性能优化
- [ ] 文档更新

## HTML 生成逻辑

```typescript
function generateListHTML(
  parentHTML: string,
  allChildren: ChildInfo[],
  currentIndex: number,
  showAnswer: boolean
): string {
  // 1. 获取父段落块的 HTML
  const parentContent = parentHTML;
  
  // 2. 生成子列表项 HTML
  const childrenHTML = allChildren.map((child, index) => {
    if (index < currentIndex) {
      // 已学过的卡片：显示答案
      return `<li>${child.answer}</li>`;
    } else if (index === currentIndex) {
      // 当前卡片
      if (showAnswer) {
        // 背面：显示答案
        return `<li>${child.answer}</li>`;
      } else {
        // 正面：显示提示
        return `<li class="cue">? ${child.cue} - ${index + 1}</li>`;
      }
    } else {
      // 未学习的卡片：不显示
      return '';
    }
  }).filter(Boolean).join('');
  
  // 3. 合并为完整的列表 HTML
  return `
    <div class="list-template-card">
      <div class="parent-question">${parentContent}</div>
      <ol class="children-list">
        ${childrenHTML}
      </ol>
    </div>
  `;
}
```

## 样式设计

```css
.list-template-card {
  padding: 16px;
}

.parent-question {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 12px;
}

.children-list {
  list-style-type: decimal;
  padding-left: 24px;
}

.children-list li {
  margin: 8px 0;
  font-size: 16px;
}

.children-list li.cue {
  color: var(--b3-theme-primary);
  font-style: italic;
}
```

## 向后兼容

- 旧的列表模板卡（没有 `cue` 和 `allChildren` 字段）继续使用原来的渲染逻辑
- 新的列表模板卡使用动态 HTML 渲染

## 未来优化

1. **编辑功能**：点击卡片时跳转到源块进行编辑
2. **批量操作**：同时编辑同一 Xiuyuan 的所有卡片
3. **卡片关联**：在卡片浏览器中显示同源卡片
4. **更多提示格式**：支持多个提示、嵌套提示等

---

**状态**: 🚧 进行中  
**当前阶段**: 阶段 1 完成，开始阶段 2  
**日期**: 2026-02-14
