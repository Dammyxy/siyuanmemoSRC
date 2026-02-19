# 填空符号支持说明

## 概述

填空卡片现在支持两种符号：`{{}}` 和 `==`，并且可以在同一个块中混合使用。

## 支持的符号

### 1. `{{}}` 符号（原有）

```markdown
DDD 的核心是{{领域模型}}
```

**渲染效果**：
- 正面：`DDD 的核心是[...]`
- 反面：`DDD 的核心是<mark>领域模型</mark>`

### 2. `==` 符号（新增）

```markdown
DDD 的核心是==领域模型==
```

**渲染效果**：
- 正面：`DDD 的核心是[...]`
- 反面：`DDD 的核心是<mark>领域模型</mark>`

### 3. 混合使用

```markdown
{{DDD}}的核心是==领域模型==和{{通用语言}}
```

**渲染效果**：
- 正面：`[...]的核心是[...]和[...]`
- 反面：`<mark>DDD</mark>的核心是<mark>领域模型</mark>和<mark>通用语言</mark>`

## 实现细节

### ClozeCardStrategy

位置：`src/core/card/quick-card/domain/strategies/ClozeCardStrategy.ts`

```typescript
parse(blockContent: string, _metadata: QuickCardMetadata): {
  front: CardFaceData;
  back: CardFaceData;
} {
  const cleanContent = removeIAL(blockContent);
  
  // 正面：将 {{内容}} 和 ==内容== 替换为 [...]
  let frontHtml = cleanContent;
  frontHtml = frontHtml.replace(/\{\{[^}]*\}\}/g, '[...]');  // 处理 {{}}
  frontHtml = frontHtml.replace(/==[^=]*==/g, '[...]');      // 处理 ==
  
  // 反面：将 {{内容}} 和 ==内容== 替换为 <mark>内容</mark>
  let backHtml = cleanContent;
  backHtml = backHtml.replace(/\{\{([^}]*)\}\}/g, '<mark>$1</mark>');  // 处理 {{}}
  backHtml = backHtml.replace(/==([^=]*)==/g, '<mark>$1</mark>');      // 处理 ==
  
  return {
    front: {
      html: frontHtml,
      hiddenTypes: ['mark'],
    },
    back: {
      html: backHtml,
      hiddenTypes: [],
    },
  };
}
```

### 正则表达式说明

1. **`{{}}` 符号**：`/\{\{[^}]*\}\}/g`
   - `\{\{`：匹配左括号 `{{`
   - `[^}]*`：匹配任意非 `}` 字符（贪婪匹配）
   - `\}\}`：匹配右括号 `}}`
   - `g`：全局匹配

2. **`==` 符号**：`/==[^=]*==/g`
   - `==`：匹配左边的 `==`
   - `[^=]*`：匹配任意非 `=` 字符（贪婪匹配）
   - `==`：匹配右边的 `==`
   - `g`：全局匹配

## 使用示例

### 示例 1：单个填空

```markdown
线粒体是细胞的==能量工厂==
```

**复习时**：
- 正面显示：`线粒体是细胞的[...]`
- 反面显示：`线粒体是细胞的<mark>能量工厂</mark>`（高亮显示）

### 示例 2：多个填空

```markdown
==线粒体==是细胞的==能量工厂==，负责生成==ATP==
```

**复习时**：
- 正面显示：`[...]是细胞的[...]，负责生成[...]`
- 反面显示：`<mark>线粒体</mark>是细胞的<mark>能量工厂</mark>，负责生成<mark>ATP</mark>`

### 示例 3：混合使用

```markdown
{{FSRS}}算法基于==记忆曲线==，可以优化{{复习时间}}
```

**复习时**：
- 正面显示：`[...]算法基于[...]，可以优化[...]`
- 反面显示：`<mark>FSRS</mark>算法基于<mark>记忆曲线</mark>，可以优化<mark>复习时间</mark>`

## 多填空卡片

当一个块包含多个填空时，系统会使用 Xiuyuan 的 `builtin-multi-cloze` 模板创建多张卡片：

```markdown
==线粒体==是细胞的==能量工厂==，负责生成==ATP==
```

**生成 3 张卡片**：

1. **卡片 1**（隐藏第 1 个填空）
   - 正面：`[...]是细胞的能量工厂，负责生成ATP`
   - 反面：`<mark>线粒体</mark>是细胞的能量工厂，负责生成ATP`

2. **卡片 2**（隐藏第 2 个填空）
   - 正面：`线粒体是细胞的[...]，负责生成ATP`
   - 反面：`线粒体是细胞的<mark>能量工厂</mark>，负责生成ATP`

3. **卡片 3**（隐藏第 3 个填空）
   - 正面：`线粒体是细胞的能量工厂，负责生成[...]`
   - 反面：`线粒体是细胞的能量工厂，负责生成<mark>ATP</mark>`

## 注意事项

1. **符号优先级**：两种符号的优先级相同，按出现顺序处理

2. **嵌套不支持**：不支持嵌套填空，如 `{{外层{{内层}}}}`

3. **空填空**：支持空填空，如 `{{}}` 或 `====`

4. **特殊字符**：填空内容可以包含任意字符（除了对应的结束符号）

5. **HTML 标签**：填空内容可以包含 HTML 标签，会被保留

## 测试覆盖

所有功能都有完整的单元测试覆盖：

- ✅ 单个填空
- ✅ 多个填空
- ✅ 开头/结尾填空
- ✅ 连续填空
- ✅ 混合使用两种符号
- ✅ 边界情况（空内容、特殊字符等）

测试文件：`src/core/card/quick-card/domain/strategies/__tests__/ClozeCardStrategy.test.ts`

## 相关文档

- [多填空卡片实现](./multi-cloze-implementation.md)
- [快速制卡符号系统](./../.kiro/specs/quick-card-symbols/requirements.md)
- [快速制卡渲染方案](./快速制卡渲染方案-DDD架构.md)

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**作者**：Kiro AI Assistant
