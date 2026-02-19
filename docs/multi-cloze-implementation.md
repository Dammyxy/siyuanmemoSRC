# 多填空卡片实现说明

## 概述

多填空卡片功能允许用户在一个块中使用多个填空符号（`{{}}` 或 `==`），系统会自动为每个填空生成一张独立的卡片。

## 实现方案

### 1. Xiuyuan 模板

使用 `builtin-multi-cloze` 模板，定义在 `src/core/xiuyuan/templates/builtin.ts`：

```typescript
export const MULTI_CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-multi-cloze',
  name: '多填空卡片',
  description: '每个填空生成一张独立的卡片',
  fields: [
    { name: 'content', description: '包含多个填空的内容' },
  ],
  cardRules: [], // 动态生成，根据填空数量
};
```

### 2. 动态生成 cardRules

在 `AutoCardHandler.createMultipleClozeCards()` 中：

```typescript
// 动态生成 cardRules（每个填空一张卡片）
const dynamicTemplate = {
    ...template,
    cardRules: clozes.map((_, index) => ({
        typeMarker: `cloze-${index}`,
        frontFields: ['content'],
        backFields: ['content'],
    })),
};
```

### 3. 临时模板注册

为了避免污染全局模板，使用临时模板：

```typescript
// 临时注册动态模板
const tempTemplateId = `builtin-multi-cloze-${blockId}`;
const tempTemplate = {
    ...dynamicTemplate,
    id: tempTemplateId,
};
xiuyuanService.createTemplate(tempTemplate);
```

### 4. 创建卡片

```typescript
const result = await xiuyuanService.createFromBlocks(
    [blockId],
    tempTemplateId,
    {
        content: blockId
    },
    BUILTIN_DECK_ID
);
```

## 使用示例

### 示例 1：使用 == 符号

```markdown
==线粒体==是细胞的==能量工厂==，负责生成==ATP==
```

生成 3 张卡片：
- 卡片 1：`[___]是细胞的能量工厂，负责生成ATP` → 答案：线粒体
- 卡片 2：`线粒体是细胞的[___]，负责生成ATP` → 答案：能量工厂
- 卡片 3：`线粒体是细胞的能量工厂，负责生成[___]` → 答案：ATP

### 示例 2：使用 {{}} 符号

```markdown
{{DDD}}是一种软件开发方法，强调{{领域模型}}的重要性
```

生成 2 张卡片：
- 卡片 1：`[___]是一种软件开发方法，强调领域模型的重要性` → 答案：DDD
- 卡片 2：`DDD是一种软件开发方法，强调[___]的重要性` → 答案：领域模型

### 示例 3：混合使用

```markdown
{{FSRS}}算法基于==记忆曲线==，可以优化==复习时间==
```

生成 3 张卡片（支持混合使用两种符号）

## 渲染逻辑

渲染时需要根据 `typeMarker` 确定当前是哪个填空：

```typescript
// 伪代码
const clozeIndex = parseInt(typeMarker.replace('cloze-', ''));
const clozes = extractClozes(content); // 提取所有填空
const currentCloze = clozes[clozeIndex];

// 渲染正面：隐藏当前填空，显示其他填空
const front = content.replace(currentCloze, '[___]');

// 渲染反面：显示所有内容
const back = content;
```

## 数据结构

### Xiuyuan 对象

```typescript
{
  id: 'xiuyuan-xxx',
  templateID: 'builtin-multi-cloze-block-id',
  blockIDs: ['block-id'],
  fieldMapping: {
    content: 'block-id'
  },
  representativeBlockID: 'block-id'
}
```

### CardMapping 对象

```typescript
[
  {
    cardID: 'card-1',
    xiuyuanID: 'xiuyuan-xxx',
    ruleIndex: 0, // 第一个填空
    typeMarker: 'cloze-0'
  },
  {
    cardID: 'card-2',
    xiuyuanID: 'xiuyuan-xxx',
    ruleIndex: 1, // 第二个填空
    typeMarker: 'cloze-1'
  },
  // ...
]
```

## 优势

✅ **灵活**：支持任意数量的填空

✅ **高效**：一次性创建所有卡片

✅ **统一**：使用 Xiuyuan 系统，与其他模板一致

✅ **可扩展**：易于添加新的填空符号

## 注意事项

1. **临时模板**：每次创建都会生成一个临时模板，不会污染全局模板列表

2. **填空顺序**：填空的顺序由正则表达式匹配顺序决定，从左到右

3. **符号混合**：支持在同一个块中混合使用 `{{}}` 和 `==`

4. **降级处理**：如果 Xiuyuan 服务不可用，会降级为单张卡片

## 未来改进

1. **智能填空**：自动识别关键词作为填空

2. **填空提示**：支持为填空添加提示信息

3. **填空分组**：支持将多个填空分组为一张卡片

4. **渐进式显示**：支持渐进式显示已学过的填空

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**作者**：Kiro AI Assistant
