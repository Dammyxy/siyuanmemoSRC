# 模版分类显示功能实现

## 概述

实现了模版卡片选择对话框的分类显示功能，将 11 个内置模版按照功能分为 5 大类，提升用户体验。

## 实现内容

### 1. 类型定义

**文件**: `src/core/xiuyuan/types.ts`

添加了模版分类类型：

```typescript
export type TemplateCategory = 'basic' | 'cloze' | 'list' | 'concept' | 'quick';
```

更新了 `ICardTemplate` 接口，添加可选的 `category` 字段：

```typescript
export interface ICardTemplate {
  id: string;
  name: string;
  description?: string;
  category?: TemplateCategory;  // 🆕 新增
  fields: Array<{ name: string; description?: string }>;
  cardRules: Array<{...}>;
}
```

### 2. 模版分类

为所有 11 个内置模版添加了分类标记：

#### 基础类 (basic)
- `builtin-basic-qa` - 基础问答
- `builtin-bidirectional` - 双向卡片

#### 填空类 (cloze)
- `builtin-cloze` - 填空卡片
- `builtin-multi-cloze` - 多填空卡片

#### 列表类 (list)
- `builtin-list-item` - 列表项模版

#### 概念类 (concept)
- `builtin-concept-descriptor` - 概念-描述符
- `builtin-concept-definition` - 概念定义
- `builtin-concept-simple` - 概念卡（简单）

#### 快速制卡类 (quick)
- `builtin-quick-bidirectional` - 快速制卡双向
- `builtin-symbol-qa` - 符号问答卡
- `builtin-quick-card` - 快速卡片

### 3. UI 组件更新

**文件**: `src/ui/xiuyuan/TemplateSelectDialog.vue`

#### 3.1 分类逻辑

添加了分类名称映射：

```typescript
const categoryNames: Record<TemplateCategory, string> = {
  basic: '基础类',
  cloze: '填空类',
  list: '列表类',
  concept: '概念类',
  quick: '快速制卡类',
};
```

实现了模版分组计算属性：

```typescript
const groupedTemplates = computed(() => {
  const groups: Record<TemplateCategory, ICardTemplate[]> = {
    basic: [],
    cloze: [],
    list: [],
    concept: [],
    quick: [],
  };

  props.templates.forEach(template => {
    const category = template.category || 'basic';
    groups[category].push(template);
  });

  // 只返回非空的分类
  return Object.entries(groups)
    .filter(([_, templates]) => templates.length > 0)
    .map(([category, templates]) => ({
      category: category as TemplateCategory,
      name: categoryNames[category as TemplateCategory],
      templates,
    }));
});
```

#### 3.2 UI 结构

更新了模版列表的渲染结构：

```vue
<div class="template-list">
  <div v-for="group in groupedTemplates" :key="group.category" class="template-group">
    <div class="group-title">{{ group.name }}</div>
    <div class="group-items">
      <div v-for="template in group.templates" :key="template.id" class="template-item">
        <!-- 模版项内容 -->
      </div>
    </div>
  </div>
</div>
```

#### 3.3 样式优化

添加了分类相关的样式：

- `.template-group` - 分类组容器
- `.group-title` - 分类标题（带左侧边框和背景色）
- `.group-items` - 分类内的模版列表（带左侧缩进）
- 优化了模版项的 hover 和选中状态

## 视觉效果

### 分类标题样式
- 主题色背景（浅色）
- 左侧 3px 主题色边框
- 加粗字体
- 圆角边框

### 模版项样式
- 左侧 8px 缩进
- hover 时边框变为主题色
- 选中时背景色变为主题色浅色，带外发光效果
- 平滑过渡动画

## 文件修改清单

1. ✅ `src/core/xiuyuan/types.ts` - 添加 TemplateCategory 类型
2. ✅ `src/core/xiuyuan/templates/builtin.ts` - 为 8 个模版添加 category
3. ✅ `src/core/xiuyuan/templates/builtin-concept.ts` - 添加 category
4. ✅ `src/core/xiuyuan/templates/builtin-symbol.ts` - 添加 category
5. ✅ `src/core/xiuyuan/templates/builtin-quick.ts` - 添加 category
6. ✅ `src/ui/xiuyuan/TemplateSelectDialog.vue` - 实现分类显示逻辑和 UI

## 测试验证

### 编译测试
```bash
npm run build
```
✅ 编译成功，无错误

### 功能测试清单

- [ ] 打开模版选择对话框
- [ ] 验证 5 个分类都正确显示
- [ ] 验证每个分类下的模版数量正确
- [ ] 验证分类标题样式正确
- [ ] 验证模版项可以正常选择
- [ ] 验证选中状态样式正确
- [ ] 验证 hover 效果正常
- [ ] 验证确认创建功能正常

## 后续优化建议

1. **搜索功能**: 添加模版搜索框，支持按名称或描述搜索
2. **常用标记**: 支持标记常用模版，在分类顶部显示
3. **块数量提示**: 为每个模版添加"需要块数量"的提示图标
4. **预览增强**: 显示模版生成的卡片示例
5. **分类折叠**: 支持折叠/展开分类，记住用户偏好
6. **快捷键**: 支持数字键快速选择模版

## 相关文档

- [模版卡片规范文档](./template-card-specification.md) - 所有模版的详细说明
- [Xiuyuan 类型定义](../../src/core/xiuyuan/types.ts) - 核心类型定义
- [内置模版定义](../../src/core/xiuyuan/templates/builtin.ts) - 模版实现
