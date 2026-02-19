# 卡片类型和模板

## 1. 卡片类型（CardType）

### 1.1 简化后的类型

```typescript
export enum CardType {
  Item = 'item',           // 基础卡片
  Topic = 'topic',         // 主题卡片
  Concept = 'concept',     // 概念卡
  Descriptor = 'descriptor', // 描述符卡
}
```

**移除的类型**：
- ❌ `Incremental` - 增量学习（不再需要）
- ❌ `Webpage` - 网页卡片（不再需要）

### 1.2 类型特征

| 类型 | 调度算法 | 使用场景 | 示例 |
|------|----------|----------|------|
| Item | FSRS v6 | 基础问答、填空 | 问答卡、填空卡 |
| Topic | A-Factor | 增量阅读、主题学习 | 长文本、主题卡 |
| Concept | FSRS v6 或 A-Factor | 概念记忆 | 术语、定义 |
| Descriptor | FSRS v6 | 概念+描述符 | 概念-定义对 |

### 1.3 类型与调度器的关系

```typescript
// 示例 1：概念卡 + FSRS（有描述符）
{
  type: 'concept',
  schedulerType: 'fsrs-v6',
  templateID: 'builtin-concept-descriptor',
}

// 示例 2：概念卡 + A-Factor（无描述符）
{
  type: 'concept',
  schedulerType: 'a-factor',
  templateID: 'builtin-concept-simple',
}

// 示例 3：主题卡 + A-Factor
{
  type: 'topic',
  schedulerType: 'a-factor',
  templateID: 'builtin-topic',
}
```

## 2. 内置模板

### 2.1 基础模板

#### 2.1.1 基础问答（builtin-basic-qa）

```typescript
export const BASIC_QA_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: '基础问答',
  description: '简单的问答卡片，第一个块为问题，第二个块为答案',
  fields: [
    { name: 'question', description: '问题' },
    { name: 'answer', description: '答案' },
  ],
  cardRules: [
    {
      typeMarker: 'qa',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};
```

**使用场景**：
- 两个块：问题块 + 答案块
- 标准问答复习

**示例**：
```markdown
- 什么是 DDD？
  - 领域驱动设计
```

#### 2.1.2 双向卡片（builtin-bidirectional）

```typescript
export const BIDIRECTIONAL_TEMPLATE: ICardTemplate = {
  id: 'builtin-bidirectional',
  name: '双向卡片',
  description: '生成正向和反向两张卡片（需要两个块）',
  fields: [
    { name: 'term', description: '术语' },
    { name: 'definition', description: '定义' },
  ],
  cardRules: [
    {
      typeMarker: 'forward',
      frontFields: ['term'],
      backFields: ['definition'],
    },
    {
      typeMarker: 'reverse',
      frontFields: ['definition'],
      backFields: ['term'],
    },
  ],
};
```

**使用场景**：
- 两个块：术语块 + 定义块
- 生成 2 张卡片（正向 + 反向）

**示例**：
```markdown
- DDD
  - 领域驱动设计
```
生成：
- 卡片 1：DDD → 领域驱动设计
- 卡片 2：领域驱动设计 → DDD

#### 2.1.3 填空卡片（builtin-cloze）

```typescript
export const CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-cloze',
  name: '填空卡片',
  description: '包含填空位置的卡片',
  fields: [
    { name: 'content', description: '包含填空的内容' },
  ],
  cardRules: [
    {
      typeMarker: 'cloze',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};
```

**使用场景**：
- 单个块，包含 `{{c1::...}}` 填空标记
- 支持多个填空

**示例**：
```markdown
- {{c1::DDD}} 是 {{c2::领域驱动设计}} 的缩写
```

### 2.2 概念卡模板

#### 2.2.1 概念卡（简单）（builtin-concept-simple）

```typescript
export const BUILTIN_CONCEPT_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-simple',
  name: '概念卡（简单）',
  description: '单块概念卡，用于记忆概念、术语、定义',
  fields: [
    { name: 'concept', description: '概念块' },
  ],
  cardRules: [
    {
      typeMarker: 'concept',
      frontFields: ['concept'],
      backFields: ['concept'],
    },
  ],
};
```

**使用场景**：
- 单个块
- 无明确答案，使用 A-Factor 调度
- 适合概念记忆、术语记忆

**示例**：
```markdown
- DDD（领域驱动设计）
```

#### 2.2.2 概念-描述符（builtin-concept-descriptor）

```typescript
export const CONCEPT_DESCRIPTOR_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-descriptor',
  name: '概念-描述符',
  description: '概念块 + 描述符块，用于有明确定义的概念',
  fields: [
    { name: 'concept', description: '概念块' },
    { name: 'descriptor', description: '描述符块' },
  ],
  cardRules: [
    {
      typeMarker: 'concept-descriptor',
      frontFields: ['concept'],
      backFields: ['descriptor'],
    },
  ],
};
```

**使用场景**：
- 两个块：概念块 + 描述符块
- 有明确答案，使用 FSRS v6 调度
- 适合概念-定义对

**示例**：
```markdown
- DDD
  - 领域驱动设计，一种软件开发方法论
```

### 2.3 快速制卡模板

#### 2.3.1 快速卡片（builtin-quick-card）

```typescript
export const BUILTIN_QUICK_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-card',
  name: '快速卡片',
  description: '快速创建的单块卡片',
  fields: [
    { name: 'content', description: '内容' },
  ],
  cardRules: [
    {
      typeMarker: 'quick',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};
```

**使用场景**：
- 单个块
- 快速制卡
- 默认模板

#### 2.3.2 符号检测（builtin-symbol-qa）

```typescript
export const BUILTIN_SYMBOL_TEMPLATE: ICardTemplate = {
  id: 'builtin-symbol-qa',
  name: '符号问答卡',
  description: '通过 <> 符号标记的问答卡',
  fields: [
    { name: 'question', description: '问题' },
    { name: 'answer', description: '答案' },
  ],
  cardRules: [
    {
      typeMarker: 'symbol-qa',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};
```

**使用场景**：
- 单个块，包含 `<>` 符号
- 自动检测并创建问答卡

**示例**：
```markdown
- DDD <> 领域驱动设计
```

#### 2.3.3 快速双向（builtin-quick-bidirectional）

```typescript
export const QUICK_BIDIRECTIONAL_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-bidirectional',
  name: '快速制卡双向',
  description: '单块生成正向和反向两张卡片（用于 <> 符号）',
  fields: [
    { name: 'content', description: '包含 <> 符号的块内容' },
  ],
  cardRules: [
    {
      typeMarker: 'forward',
      frontFields: ['content'],
      backFields: ['content'],
    },
    {
      typeMarker: 'reverse',
      frontFields: ['content'],
      backFields: ['content'],
    },
  ],
};
```

**使用场景**：
- 单个块，包含 `<>` 符号
- 生成 2 张卡片（正向 + 反向）

### 2.4 列表模板

#### 2.4.1 列表项模版（builtin-list-item）

```typescript
export const LIST_ITEM_TEMPLATE: ICardTemplate = {
  id: 'builtin-list-item',
  name: '列表项模版',
  description: '父列表项作为问题，每个子列表项作为独立答案',
  fields: [
    { name: 'question', description: '问题（父列表项）' },
    { name: 'answer', description: '答案（子列表项）' },
  ],
  cardRules: [
    {
      typeMarker: 'list-qa',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};
```

**使用场景**：
- 父列表项 + 多个子列表项
- 生成 N 张卡片（N = 子列表项数量）
- 每张卡片的正面相同（父列表项），背面不同（子列表项）

**示例**：
```markdown
- 什么是 FSRS？
  - FSRS 是一种间隔重复算法
  - 它基于记忆遗忘曲线
  - 可以优化复习时间
```
生成 3 张卡片：
- 卡片 1：什么是 FSRS？ → FSRS 是一种间隔重复算法
- 卡片 2：什么是 FSRS？ → 它基于记忆遗忘曲线
- 卡片 3：什么是 FSRS？ → 可以优化复习时间

## 3. 模板注册

### 3.1 内置模板列表

```typescript
// src/core/xiuyuan/templates/builtin.ts
export const ALL_BUILTIN_TEMPLATES: ICardTemplate[] = [
  // 基础模板
  BASIC_QA_TEMPLATE,
  BIDIRECTIONAL_TEMPLATE,
  CLOZE_TEMPLATE,
  
  // 概念卡模板
  BUILTIN_CONCEPT_TEMPLATE,
  CONCEPT_DESCRIPTOR_TEMPLATE,
  
  // 快速制卡模板
  BUILTIN_QUICK_TEMPLATE,
  BUILTIN_SYMBOL_TEMPLATE,
  QUICK_BIDIRECTIONAL_TEMPLATE,
  
  // 列表模板
  LIST_ITEM_TEMPLATE,
];
```

### 3.2 模板注册器

```typescript
// src/core/xiuyuan/templates/TemplateRegistry.ts
export class TemplateRegistry {
  private templates: Map<string, ICardTemplate> = new Map();
  
  constructor() {
    // 注册所有内置模板
    for (const template of ALL_BUILTIN_TEMPLATES) {
      this.register(template);
    }
  }
  
  register(template: ICardTemplate): void {
    this.templates.set(template.id, template);
  }
  
  get(templateId: string): ICardTemplate | undefined {
    return this.templates.get(templateId);
  }
  
  getAll(): ICardTemplate[] {
    return Array.from(this.templates.values());
  }
  
  getBuiltin(): ICardTemplate[] {
    return this.getAll().filter(t => t.id.startsWith('builtin-'));
  }
  
  getCustom(): ICardTemplate[] {
    return this.getAll().filter(t => !t.id.startsWith('builtin-'));
  }
}
```

## 4. 自动模板选择

### 4.1 选择逻辑

```typescript
function getDefaultTemplateForType(
  cardType: CardType,
  blockCount: number,
  hasSymbol: boolean,
  hasDescriptor: boolean
): string {
  // 1. 符号检测优先
  if (hasSymbol) {
    return blockCount === 1 
      ? 'builtin-symbol-qa' 
      : 'builtin-quick-bidirectional';
  }
  
  // 2. 根据类型选择
  switch (cardType) {
    case 'concept':
      return hasDescriptor 
        ? 'builtin-concept-descriptor' 
        : 'builtin-concept-simple';
    
    case 'descriptor':
      return 'builtin-concept-descriptor';
    
    case 'topic':
      return 'builtin-topic';
    
    case 'item':
    default:
      return blockCount === 1 
        ? 'builtin-quick-card' 
        : 'builtin-basic-qa';
  }
}
```

### 4.2 使用示例

```typescript
// 示例 1：自动选择（单块，无符号）
await cardService.createCard({
  blockIds: ['block-1'],
  cardType: 'item',
});
// → 使用 builtin-quick-card

// 示例 2：自动选择（两块，概念卡）
await cardService.createCard({
  blockIds: ['block-1', 'block-2'],
  cardType: 'concept',
});
// → 使用 builtin-concept-descriptor

// 示例 3：自动选择（单块，有符号）
await cardService.createCard({
  blockIds: ['block-1'],  // 内容：DDD <> 领域驱动设计
  cardType: 'item',
});
// → 使用 builtin-symbol-qa

// 示例 4：手动指定模板
await cardService.createCard({
  blockIds: ['block-1', 'block-2'],
  templateId: 'builtin-bidirectional',
});
// → 使用指定的模板
```

## 5. 自定义模板

### 5.1 模板编辑器 UI

```typescript
// src/ui/dialogs/TemplateEditorDialog.svelte
<script lang="ts">
  let templateName = '';
  let templateDescription = '';
  let fields: Array<{ name: string; description: string }> = [];
  let cardRules: Array<{
    typeMarker: string;
    frontFields: string[];
    backFields: string[];
  }> = [];
  
  function addField() {
    fields = [...fields, { name: '', description: '' }];
  }
  
  function addCardRule() {
    cardRules = [...cardRules, {
      typeMarker: '',
      frontFields: [],
      backFields: [],
    }];
  }
  
  function save() {
    const template: ICardTemplate = {
      id: `custom-${Date.now()}`,
      name: templateName,
      description: templateDescription,
      fields,
      cardRules,
    };
    
    // 保存到注册器
    templateRegistry.register(template);
    
    // 持久化
    saveCustomTemplates();
  }
</script>

<div class="template-editor">
  <h2>创建自定义模板</h2>
  
  <div class="form-group">
    <label>模板名称</label>
    <input bind:value={templateName} />
  </div>
  
  <div class="form-group">
    <label>模板描述</label>
    <textarea bind:value={templateDescription} />
  </div>
  
  <div class="form-group">
    <label>字段定义</label>
    {#each fields as field, i}
      <div class="field-row">
        <input bind:value={field.name} placeholder="字段名" />
        <input bind:value={field.description} placeholder="描述" />
        <button on:click={() => fields.splice(i, 1)}>删除</button>
      </div>
    {/each}
    <button on:click={addField}>添加字段</button>
  </div>
  
  <div class="form-group">
    <label>卡片规则</label>
    {#each cardRules as rule, i}
      <div class="rule-row">
        <input bind:value={rule.typeMarker} placeholder="类型标记" />
        <select multiple bind:value={rule.frontFields}>
          {#each fields as field}
            <option value={field.name}>{field.name}</option>
          {/each}
        </select>
        <select multiple bind:value={rule.backFields}>
          {#each fields as field}
            <option value={field.name}>{field.name}</option>
          {/each}
        </select>
        <button on:click={() => cardRules.splice(i, 1)}>删除</button>
      </div>
    {/each}
    <button on:click={addCardRule}>添加规则</button>
  </div>
  
  <button on:click={save}>保存模板</button>
</div>
```

### 5.2 自定义模板存储

```typescript
// 存储在单独的文件
// data/custom-templates.json
{
  "templates": [
    {
      "id": "custom-1234567890",
      "name": "我的自定义模板",
      "description": "...",
      "fields": [...],
      "cardRules": [...]
    }
  ]
}
```

### 5.3 加载自定义模板

```typescript
async loadCustomTemplates(): Promise<void> {
  const data = await this.plugin.loadData('custom-templates.json');
  if (!data) return;
  
  const { templates } = JSON.parse(data);
  for (const template of templates) {
    this.templateRegistry.register(template);
  }
}
```

## 6. 模板验证

```typescript
function validateTemplate(template: ICardTemplate): string[] {
  const errors: string[] = [];
  
  // 1. 检查必需字段
  if (!template.id) errors.push('Missing template id');
  if (!template.name) errors.push('Missing template name');
  if (!template.fields || template.fields.length === 0) {
    errors.push('Template must have at least one field');
  }
  if (!template.cardRules || template.cardRules.length === 0) {
    errors.push('Template must have at least one card rule');
  }
  
  // 2. 检查字段名唯一性
  const fieldNames = new Set<string>();
  for (const field of template.fields) {
    if (fieldNames.has(field.name)) {
      errors.push(`Duplicate field name: ${field.name}`);
    }
    fieldNames.add(field.name);
  }
  
  // 3. 检查卡片规则引用的字段存在
  for (const rule of template.cardRules) {
    for (const fieldName of [...rule.frontFields, ...rule.backFields]) {
      if (!fieldNames.has(fieldName)) {
        errors.push(`Card rule references non-existent field: ${fieldName}`);
      }
    }
  }
  
  return errors;
}
```
