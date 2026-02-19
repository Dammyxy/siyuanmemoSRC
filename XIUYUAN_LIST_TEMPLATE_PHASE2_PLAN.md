# Xiuyuan 列表模版卡 - 阶段 2 实现计划

## 当前状态

### 已完成（阶段 1）
- ✅ 有序列表检测
- ✅ 提示解析（`::` 分隔符）
- ✅ 数据存储（meta 字段包含 cue、answer、allChildren、currentIndex）
- ✅ 卡片浏览器显示同源卡片标记（`[1/3]`）
- ✅ 修复所有数据源的 meta 传递问题

### 已完成（阶段 2）✅
- ✅ 复习界面渐进式显示
  - ✅ 创建 `XiuyuanListTemplateCard.vue` 组件
  - ✅ 修改 `ReviewContent.vue` 检测并使用自定义组件
  - ✅ 正面：显示问题 + 已学答案 + 当前提示
  - ✅ 背面：显示问题 + 所有已学答案 + 剩余提示

## 阶段 2 实现总结

### 实现的文件

1. **新建文件**：
   - `src/ui/review/v2/components/XiuyuanListTemplateCard.vue` - 列表模版卡渲染组件

2. **修改文件**：
   - `src/ui/review/v2/ReviewContent.vue` - 添加 Xiuyuan 列表模版卡检测和渲染逻辑

### 数据流

```
UnifiedReviewAdapter.toUIState()
  ↓
  检测 isXiuyuanCard(card) && card.meta.templateID === 'builtin-list-item'
  ↓
  设置 content.isXiuyuanListTemplate = true
  设置 content.xiuyuanMeta = card.meta
  ↓
ReviewContent.vue
  ↓
  检测 content.isXiuyuanListTemplate
  ↓
  渲染 XiuyuanListTemplateCard 组件
  ↓
XiuyuanListTemplateCard.vue
  ↓
  加载问题块 HTML (getBlockDOM)
  渲染已学答案（灰色）
  渲染当前提示/答案（高亮）
  显示剩余提示
```

### 渲染逻辑

**正面（showAnswer = false）**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
问题内容
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ 1. 答案1（已学，灰色）
✓ 2. 答案2（已学，灰色）

┌─────────────────────────────────────┐
│ ? 3. 提示3（当前，高亮）              │
└─────────────────────────────────────┘
```

**背面（showAnswer = true）**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
问题内容
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ 1. 答案1
✓ 2. 答案2

┌─────────────────────────────────────┐
│ ✓ 3. 答案3（当前，高亮）              │
└─────────────────────────────────────┘

还有 2 个答案未学习
```

### 技术细节

1. **组件通信**：
   - `ReviewContent.vue` 通过 props 传递 `meta`、`showAnswer`、`questionBlockId`
   - `XiuyuanListTemplateCard.vue` 接收 props 并渲染

2. **数据加载**：
   - 使用 `getBlockDOM(questionBlockId)` 加载问题块的 HTML
   - 在 `onMounted` 钩子中异步加载

3. **样式设计**：
   - 已学答案：灰色显示，opacity 0.6
   - 当前提示：蓝色背景，左侧蓝色边框
   - 当前答案：绿色背景，左侧绿色边框
   - 剩余提示：灰色背景，居中显示

### 测试步骤

1. 创建一个有序列表模版卡：
   ```
   问题
   - 1. 提示1 → 答案1
   - 2. 提示2 → 答案2
   - 3. 提示3 → 答案3
   ```

2. 开始复习，验证：
   - 第一张卡片正面：显示问题 + 提示1
   - 第一张卡片背面：显示问题 + 答案1 + "还有 2 个答案未学习"
   - 第二张卡片正面：显示问题 + 答案1（灰色）+ 提示2
   - 第二张卡片背面：显示问题 + 答案1 + 答案2（高亮）+ "还有 1 个答案未学习"
   - 第三张卡片正面：显示问题 + 答案1（灰色）+ 答案2（灰色）+ 提示3
   - 第三张卡片背面：显示问题 + 答案1 + 答案2 + 答案3（高亮）

## 相关文件

- `src/strategies/UnifiedReviewAdapter.ts` - 适配器（已修改）
- `src/ui/review/v2/ReviewContent.vue` - 复习内容组件（已修改）
- `src/ui/review/v2/components/XiuyuanListTemplateCard.vue` - 列表模版卡组件（新建）
- `src/core/xiuyuan/renderListTemplate.ts` - HTML 生成函数（备用）
- `src/core/xiuyuan/cardMeta.ts` - 类型定义
- `src/core/xiuyuan/listTemplate.ts` - 创建逻辑
