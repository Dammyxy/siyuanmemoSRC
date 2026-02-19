# Xiuyuan 模版卡与快速制卡集成方案

**文档创建时间**：2026-02-14  
**目的**：分析 Xiuyuan 模版卡如何应用于快速制卡，并设计新的模版类型

---

## 📋 现有 Xiuyuan 模版

### 当前模版

目前只有一个内置模版：

#### `builtin-list-item`（列表项模版）

**用途**：列表项渐进式复习

**字段**：
- `question`：父列表项（问题）
- `answer`：子列表项（答案）

**生成规则**：
- 1 个 Xiuyuan → N 张卡片（N = 子列表项数量）
- 每张卡片显示：问题 + 已学过的答案 + 当前答案的提示

**示例**：
```markdown
1. 什么是京剧的四大行当？  ← 父列表项
   1. ? 男性角色 :: 生
   2. ? 女性角色 :: 旦
   3. ? 花脸 :: 净
   4. ? 丑角 :: 丑
```

---

## 🎯 快速制卡类型与 Xiuyuan 模版的映射

### 1️⃣ Basic Cards（基础卡片）

#### 符号
```
问题 >> 答案
```

#### 是否需要 Xiuyuan？
❌ **不需要**

#### 原因
- Basic Card 只有两个字段（问题、答案）
- 使用单个块即可，不需要多块映射
- 直接使用 FSRS Card 即可

#### 实现方式
```typescript
// 直接创建 FSRS Card
const card = createDefaultCard(blockId);
card.type = 'item';
await markBlockAsCard(blockId, card.id, card.priority, 'item');
```

---

### 2️⃣ Concept Cards（概念卡片）

#### 符号
```
概念 :: 定义
```

#### 是否需要 Xiuyuan？
❌ **不需要**

#### 原因
- 与 Basic Card 类似，只有两个字段
- 单个块即可表达完整信息
- 特殊之处在于显示样式（加粗）和默认双向

#### 实现方式
```typescript
// 直接创建 FSRS Card，标记为双向
const card = createDefaultCard(blockId);
card.type = 'topic'; // 概念卡通常是 topic
card.direction = 'both'; // 默认双向
await markBlockAsCard(blockId, card.id, card.priority, 'topic');
```

---

### 3️⃣ Descriptor Cards（描述符卡片）

#### 符号
```
属性 ;; 描述
```

#### 是否需要 Xiuyuan？
⭐ **可选**（建议使用）

#### 原因
- Descriptor 必须作为 Concept 的子项
- 需要显示父级 Concept 作为上下文
- 使用 Xiuyuan 可以更好地管理 Concept-Descriptor 关系

#### 建议的 Xiuyuan 模版

##### `builtin-concept-descriptor`（概念-描述符模版）

**字段**：
- `concept`：父级概念块
- `descriptor`：描述符块

**生成规则**：
- 1 个 Xiuyuan → 1 张卡片
- 正面：概念名称 + 属性名称
- 反面：描述

**示例**：
```markdown
线粒体 :: 细胞的能量工厂  ← concept
  ├─ 起源 ;; 被认为是通过内共生起源的  ← descriptor
  └─ 功能 ;; 为细胞生成ATP  ← descriptor
```

**复习时显示**：
```
[正面]
线粒体
  起源

[背面]
线粒体
  起源 :: 被认为是通过内共生起源的
```

---

### 4️⃣ Cloze Cards（填空卡片）

#### 符号
```
文本{{填空1}}文本{{填空2}}文本
```

#### 是否需要 Xiuyuan？
❌ **不需要**

#### 原因
- Cloze 卡片的信息都在单个块内
- 填空位置通过标记实现
- 不需要多块映射

#### 实现方式
```typescript
// 直接创建 FSRS Card，标记填空位置
const card = createDefaultCard(blockId);
card.type = 'item';
card.meta.clozePositions = extractClozePositions(content);
await markBlockAsCard(blockId, card.id, card.priority, 'item');
```

---

### 5️⃣ Multi-Line Cards（多行卡片）

#### 符号
```
问题 >>>
  - 答案项1
  - 答案项2
  - 答案项3
```

#### 是否需要 Xiuyuan？
✅ **需要**（已实现）

#### 原因
- 需要管理父块（问题）和多个子块（答案列表）的关系
- 需要渐进式显示（已学过的答案 + 当前提示）
- 完美适配 `builtin-list-item` 模版

#### 使用的 Xiuyuan 模版

##### `builtin-list-item`（列表项模版）

**已实现**，详见 `XIUYUAN_LIST_TEMPLATE_V2_DESIGN.md`

---

### 6️⃣ Multiple-Choice Cards（选择题卡片）

#### 符号
```
问题 >>A)
  A) 正确答案
  B) 错误答案1
  C) 错误答案2
  D) 错误答案3
```

#### 是否需要 Xiuyuan？
✅ **需要**（新模版）

#### 原因
- 需要管理问题块和多个选项块的关系
- 需要标记正确/错误答案
- 需要随机显示顺序

#### 建议的 Xiuyuan 模版

##### `builtin-multiple-choice`（选择题模版）

**字段**：
- `question`：问题块
- `options`：选项块列表（包含正确/错误标记）

**生成规则**：
- 1 个 Xiuyuan → 1 张卡片
- 正面：问题 + 随机顺序的选项
- 反面：问题 + 标记正确/错误的选项

**元数据**：
```typescript
meta: {
  correctOptions: ['A', 'C'],  // 正确答案的索引
  shuffleSeed: 12345,          // 随机种子（保证每次复习顺序一致）
}
```

**示例**：
```markdown
FSRS算法的核心参数是？ >>A)  ← question
  A) 记忆稳定性和记忆难度  ← option (correct)
  B) 遗忘曲线和学习曲线    ← option (incorrect)
  C) 复习次数和正确率      ← option (incorrect)
  D) 学习时间和记忆强度    ← option (incorrect)
```

---

## 🆕 新增 Xiuyuan 模版设计

### 1. `builtin-concept-descriptor`（概念-描述符模版）

#### 用途
管理 Concept 和 Descriptor 的关系

#### 字段定义
```typescript
{
  id: 'builtin-concept-descriptor',
  name: '概念-描述符',
  description: '用于概念及其属性的卡片',
  fields: [
    { name: 'concept', description: '概念块' },
    { name: 'descriptor', description: '描述符块' }
  ],
  cardRules: [
    {
      typeMarker: 'concept-descriptor',
      frontFields: ['concept', 'descriptor'],
      backFields: ['concept', 'descriptor']
    }
  ]
}
```

#### 创建逻辑
```typescript
// 检测 Descriptor 符号
if (content.match(/(.+?)\s*;;\s*(.+)/)) {
    const parentBlock = await getParentBlock(blockId);
    
    // 检查父块是否为 Concept
    if (parentBlock && parentBlock.content.match(/(.+?)\s*::\s*(.+)/)) {
        // 创建 Xiuyuan
        await xiuyuanService.createFromBlocks(
            [parentBlock.id, blockId],
            'builtin-concept-descriptor',
            {
                concept: parentBlock.id,
                descriptor: blockId
            },
            BUILTIN_DECK_ID
        );
    }
}
```

#### 渲染逻辑
```typescript
// 正面：显示概念名称 + 属性名称
const conceptName = extractConceptName(conceptBlock.content);
const descriptorName = extractDescriptorName(descriptorBlock.content);

frontHTML = `
  <div class="concept-name">${conceptName}</div>
  <div class="descriptor-name">${descriptorName}</div>
`;

// 反面：显示完整定义
backHTML = `
  <div class="concept-full">${conceptBlock.content}</div>
  <div class="descriptor-full">${descriptorBlock.content}</div>
`;
```

---

### 2. `builtin-multiple-choice`（选择题模版）

#### 用途
选择题卡片

#### 字段定义
```typescript
{
  id: 'builtin-multiple-choice',
  name: '选择题',
  description: '用于选择题的卡片',
  fields: [
    { name: 'question', description: '问题块' },
    { name: 'options', description: '选项块列表' }
  ],
  cardRules: [
    {
      typeMarker: 'multiple-choice',
      frontFields: ['question', 'options'],
      backFields: ['question', 'options']
    }
  ]
}
```

#### 元数据结构
```typescript
interface MultipleChoiceMeta {
  // 选项信息
  options: Array<{
    blockID: string;
    label: string;      // A, B, C, D
    content: string;    // 选项内容
    isCorrect: boolean; // 是否正确
  }>;
  
  // 随机种子（保证每次复习顺序一致）
  shuffleSeed: number;
  
  // 正确答案索引
  correctIndices: number[];
}
```

#### 创建逻辑
```typescript
// 检测选择题符号
if (content.match(/(.+?)\s*>>A\)\s*$/)) {
    const children = await getChildBlocks(blockId);
    
    // 解析选项
    const options = children.map((child, index) => {
        const match = child.content.match(/^([A-Z])\)\s*(.+)/);
        if (!match) return null;
        
        return {
            blockID: child.id,
            label: match[1],
            content: match[2],
            isCorrect: index === 0 // 默认 A 为正确答案
        };
    }).filter(Boolean);
    
    // 创建 Xiuyuan
    const result = await xiuyuanService.createFromBlocks(
        [blockId, ...children.map(c => c.id)],
        'builtin-multiple-choice',
        {
            question: blockId,
            options: children.map(c => c.id)
        },
        BUILTIN_DECK_ID
    );
    
    // 保存元数据
    result.value.xiuyuan.meta = {
        options,
        shuffleSeed: Math.random(),
        correctIndices: [0]
    };
}
```

#### 渲染逻辑
```typescript
// 正面：显示问题 + 随机顺序的选项
const meta = xiuyuan.meta as MultipleChoiceMeta;
const shuffledOptions = shuffleWithSeed(meta.options, meta.shuffleSeed);

frontHTML = `
  <div class="mc-question">${questionBlock.content}</div>
  <div class="mc-options">
    ${shuffledOptions.map((opt, index) => `
      <div class="mc-option" data-index="${index}">
        <span class="mc-label">${opt.label})</span>
        <span class="mc-content">${opt.content}</span>
      </div>
    `).join('')}
  </div>
`;

// 反面：标记正确/错误
backHTML = `
  <div class="mc-question">${questionBlock.content}</div>
  <div class="mc-options">
    ${shuffledOptions.map((opt, index) => `
      <div class="mc-option ${opt.isCorrect ? 'correct' : 'incorrect'}">
        <span class="mc-label">${opt.label})</span>
        <span class="mc-content">${opt.content}</span>
        <span class="mc-mark">${opt.isCorrect ? '✓' : '✗'}</span>
      </div>
    `).join('')}
  </div>
`;
```

---

### 3. `builtin-cloze-enhanced`（增强填空模版）

#### 用途
支持多个填空的高级填空卡片

#### 为什么需要？
- 标准 Cloze 卡片只能在单个块内
- 增强版支持跨块的填空关系
- 支持填空之间的依赖关系

#### 字段定义
```typescript
{
  id: 'builtin-cloze-enhanced',
  name: '增强填空',
  description: '支持多块的填空卡片',
  fields: [
    { name: 'context', description: '上下文块' },
    { name: 'clozes', description: '填空块列表' }
  ],
  cardRules: [
    {
      typeMarker: 'cloze-enhanced',
      frontFields: ['context', 'clozes'],
      backFields: ['context', 'clozes']
    }
  ]
}
```

#### 示例
```markdown
细胞的结构  ← context
  - {{细胞膜}}：保护细胞  ← cloze 1
  - {{细胞质}}：进行代谢  ← cloze 2
  - {{细胞核}}：存储遗传信息  ← cloze 3
```

#### 元数据结构
```typescript
interface ClozeEnhancedMeta {
  clozes: Array<{
    blockID: string;
    text: string;       // 填空文本
    position: number;   // 填空位置
  }>;
  
  // 显示模式
  mode: 'all-at-once' | 'one-by-one';
}
```

---

### 4. `builtin-bidirectional`（双向卡片模版）

#### 用途
自动生成正反两个方向的卡片

#### 字段定义
```typescript
{
  id: 'builtin-bidirectional',
  name: '双向卡片',
  description: '自动生成正反两个方向的卡片',
  fields: [
    { name: 'front', description: '正面块' },
    { name: 'back', description: '反面块' }
  ],
  cardRules: [
    {
      typeMarker: 'forward',
      frontFields: ['front'],
      backFields: ['back']
    },
    {
      typeMarker: 'backward',
      frontFields: ['back'],
      backFields: ['front']
    }
  ]
}
```

#### 用途
- Concept 卡片（默认双向）
- 词汇卡片（英-中、中-英）
- 任何需要双向记忆的内容

#### 示例
```markdown
Cell <> The basic structural unit of all living organisms
```

生成 2 张卡片：
1. Cell → The basic structural unit...
2. The basic structural unit... → Cell

---

### 5. `builtin-vocabulary`（词汇卡片模版）

#### 用途
专门用于词汇学习

#### 字段定义
```typescript
{
  id: 'builtin-vocabulary',
  name: '词汇卡片',
  description: '用于词汇学习的卡片',
  fields: [
    { name: 'word', description: '单词' },
    { name: 'pronunciation', description: '发音' },
    { name: 'translation', description: '翻译' },
    { name: 'example', description: '例句' }
  ],
  cardRules: [
    {
      typeMarker: 'word-to-meaning',
      frontFields: ['word', 'pronunciation'],
      backFields: ['translation', 'example']
    },
    {
      typeMarker: 'meaning-to-word',
      frontFields: ['translation'],
      backFields: ['word', 'pronunciation', 'example']
    }
  ]
}
```

#### 示例
```markdown
Cell  ← word
  - /sel/  ← pronunciation
  - 细胞  ← translation
  - The cell is the basic unit of life.  ← example
```

生成 2 张卡片：
1. Cell /sel/ → 细胞 + 例句
2. 细胞 → Cell /sel/ + 例句

---

## 📊 快速制卡类型与 Xiuyuan 模版映射表

| 快速制卡类型 | 符号 | 需要 Xiuyuan？ | 推荐模版 | 优先级 |
|------------|------|---------------|---------|--------|
| Basic Cards | `>>` `<<` `<>` | ❌ 不需要 | - | P0 |
| Concept Cards | `::` | ❌ 不需要 | - | P0 |
| Descriptor Cards | `;;` | ⭐ 可选 | `builtin-concept-descriptor` | P1 |
| Cloze Cards | `{{}}` | ❌ 不需要 | - | P0 |
| Multi-Line Cards | `>>>` | ✅ 需要 | `builtin-list-item` | P1 |
| Multiple-Choice | `>>A)` | ✅ 需要 | `builtin-multiple-choice` | P2 |

---

## 🚀 实现优先级

### P0（必须实现）

1. ✅ Basic Cards - 不需要 Xiuyuan
2. ✅ Concept Cards - 不需要 Xiuyuan
3. ✅ Cloze Cards - 不需要 Xiuyuan

### P1（重要功能）

4. ✅ Multi-Line Cards - 使用 `builtin-list-item`（已实现）
5. ⭐ Descriptor Cards - 实现 `builtin-concept-descriptor`
6. ⭐ Bidirectional Cards - 实现 `builtin-bidirectional`

### P2（增强功能）

7. ⭐ Multiple-Choice Cards - 实现 `builtin-multiple-choice`
8. ⭐ Vocabulary Cards - 实现 `builtin-vocabulary`
9. ⭐ Enhanced Cloze - 实现 `builtin-cloze-enhanced`

---

## 🔧 实现方案

### Phase 1：符号检测与路由

```typescript
class QuickCardRouter {
    async route(blockId: string, content: string): Promise<void> {
        // 检测符号类型
        const symbolType = this.detectSymbol(content);
        
        switch (symbolType) {
            case 'basic':
            case 'concept':
            case 'cloze':
                // 不需要 Xiuyuan，直接创建 FSRS Card
                await this.createSimpleCard(blockId, symbolType, content);
                break;
                
            case 'descriptor':
                // 可选 Xiuyuan
                if (await this.hasConceptParent(blockId)) {
                    await this.createXiuyuanCard(blockId, 'builtin-concept-descriptor');
                } else {
                    await this.createSimpleCard(blockId, 'descriptor', content);
                }
                break;
                
            case 'multiLine':
                // 需要 Xiuyuan
                await this.createXiuyuanCard(blockId, 'builtin-list-item');
                break;
                
            case 'multipleChoice':
                // 需要 Xiuyuan
                await this.createXiuyuanCard(blockId, 'builtin-multiple-choice');
                break;
        }
    }
}
```

### Phase 2：模版注册

```typescript
class TemplateRegistry {
    private templates: Map<string, ICardTemplate> = new Map();
    
    registerBuiltinTemplates(): void {
        // 已有模版
        this.register(builtinListItemTemplate);
        
        // 新增模版
        this.register(builtinConceptDescriptorTemplate);
        this.register(builtinMultipleChoiceTemplate);
        this.register(builtinBidirectionalTemplate);
        this.register(builtinVocabularyTemplate);
        this.register(builtinClozeEnhancedTemplate);
    }
}
```

### Phase 3：渲染适配

```typescript
class XiuyuanRenderer {
    render(xiuyuan: IXiuyuan, showAnswer: boolean): string {
        const template = this.getTemplate(xiuyuan.templateID);
        
        switch (template.id) {
            case 'builtin-list-item':
                return this.renderListItem(xiuyuan, showAnswer);
                
            case 'builtin-concept-descriptor':
                return this.renderConceptDescriptor(xiuyuan, showAnswer);
                
            case 'builtin-multiple-choice':
                return this.renderMultipleChoice(xiuyuan, showAnswer);
                
            // ... 其他模版
        }
    }
}
```

---

## 📝 配置选项

### 设置面板

```typescript
interface XiuyuanQuickCardSettings {
    // 启用 Xiuyuan 模版
    enableXiuyuanTemplates: boolean;
    
    // Descriptor 是否使用 Xiuyuan
    descriptorUseXiuyuan: boolean;
    
    // 启用的模版
    enabledTemplates: {
        listItem: boolean;
        conceptDescriptor: boolean;
        multipleChoice: boolean;
        bidirectional: boolean;
        vocabulary: boolean;
        clozeEnhanced: boolean;
    };
}
```

---

## ✅ 总结

### 核心设计原则

1. **按需使用**：只在需要多块映射时使用 Xiuyuan
2. **渐进增强**：从简单卡片开始，逐步支持复杂模版
3. **灵活配置**：用户可以选择是否使用 Xiuyuan

### Xiuyuan 的优势

1. ✅ **多块管理**：统一管理多个块的关系
2. ✅ **模版复用**：一个模版可以生成多张卡片
3. ✅ **元数据存储**：存储额外的卡片信息
4. ✅ **批量操作**：可以批量修改同源卡片

### 实现路线图

1. **Phase 1**：实现 P0 功能（Basic, Concept, Cloze）
2. **Phase 2**：实现 `builtin-concept-descriptor` 模版
3. **Phase 3**：实现 `builtin-multiple-choice` 模版
4. **Phase 4**：实现其他增强模版

---

**文档创建时间**：2026-02-14  
**作者**：Kiro AI Assistant  
**状态**：设计完成，待实现
