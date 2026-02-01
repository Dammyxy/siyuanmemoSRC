# Xiuyuan (修缘) - 卡片来源抽象层

## 概述

Xiuyuan（修缘）是 FSRS 插件的卡片来源抽象层，对应 Anki 的 Note 概念。一个 Xiuyuan 可以生成多张 Card（如英-中、中-英、音-中）。

## 核心概念

### Xiuyuan 与 FSRSCard 的关系

```
┌─────────────────────────────────────────────────────────┐
│                    Xiuyuan (卡片来源)                    │
│  - 存储字段映射 (fields)                                 │
│  - 关联模板 (templateID)                                 │
│  - 关联块列表 (blockIDs)                                 │
└────────────────────┬────────────────────────────────────┘
                     │ 1:N
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  CardMapping (映射关系)                  │
│  - 定义正面字段 (frontFields)                            │
│  - 定义反面字段 (backFields)                             │
│  - 卡片类型标记 (typeMarker)                             │
└────────────────────┬────────────────────────────────────┘
                     │ 1:1
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  FSRSCard (复习卡片)                     │
│  - 调度信息 (due, stability, difficulty)                │
│  - 复习历史 (reps, lapses, lastReview)                  │
│  - 元数据 (meta.xiuyuanID, meta.answerBlockID)          │
└─────────────────────────────────────────────────────────┘
```

### 数据模型

#### IXiuyuan - 卡片来源

```typescript
interface IXiuyuan {
  id: string;                    // 唯一标识符
  blockIDs: string[];            // 关联的块 ID 列表
  fields: IXiuyuanField[];       // 字段定义
  templateID: string;            // 模板 ID
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
  meta?: Record<string, unknown>; // 扩展元数据
}
```

#### IXiuyuanField - 字段定义

```typescript
interface IXiuyuanField {
  name: string;      // 字段名称（如 'question', 'answer'）
  blockID: string;   // 字段内容来源块 ID
  marker?: string;   // 字段角色标记
}
```

#### ICardMapping - 卡片映射

```typescript
interface ICardMapping {
  xiuyuanID: string;      // 修缘 ID
  cardID: string;         // 卡片 ID（思源 Riff 卡片 ID）
  frontFields: string[];  // 正面字段列表
  backFields: string[];   // 反面字段列表
  typeMarker?: string;    // 卡片类型标记（如 'en-zh', 'zh-en'）
}
```

#### ICardTemplate - 卡片模板

```typescript
interface ICardTemplate {
  id: string;
  name: string;
  description?: string;
  fields: Array<{ name: string; description?: string }>;
  cardRules: Array<{
    typeMarker: string;
    frontFields: string[];
    backFields: string[];
  }>;
}
```

## 使用指南

### 1. 初始化

```typescript
import { XiuyuanStorage, XiuyuanService, BUILTIN_TEMPLATES } from '@/core/xiuyuan';

// 创建存储管理器
const storage = new XiuyuanStorage('siyuan-plugin-fsrs');

// 创建服务
const service = new XiuyuanService(storage, storageManager);

// 初始化（加载数据）
await service.init();

// 加载内置模板
BUILTIN_TEMPLATES.forEach(template => {
  service.createTemplate(template);
});
```

### 2. 创建卡片

```typescript
// 从两个块创建基础问答卡片
const result = await service.createFromBlocks(
  ['20230101120000-question', '20230101120001-answer'],
  'basic',
  {
    question: '20230101120000-question',
    answer: '20230101120001-answer'
  },
  'default-deck'
);

console.log('Created Xiuyuan:', result.xiuyuan.id);
console.log('Created cards:', result.cards.length);

// 查询创建的 FSRSCard
const fsrsCard = storageManager.getCard(result.cards[0].cardID);
console.log('Answer block:', fsrsCard?.meta?.answerBlockID);
```

### 3. 查询

```typescript
// 根据 ID 查询 Xiuyuan
const xiuyuan = service.getXiuyuan('xy_123');
if (xiuyuan) {
  console.log('Template:', xiuyuan.templateID);
  console.log('Fields:', xiuyuan.fields);
}

// 根据块 ID 查询关联的 Xiuyuan
const xiuyuans = service.getXiuyuansByBlockID('20230101120000-abc123');
xiuyuans.forEach(x => {
  console.log('Xiuyuan:', x.id);
  console.log('Template:', x.templateID);
});

// 根据卡片 ID 查询 CardMapping
const mapping = service.getMappingByCardID('20230101120000-question');
if (mapping) {
  const xiuyuan = service.getXiuyuan(mapping.xiuyuanID);
  console.log('Template:', xiuyuan?.templateID);
}

// 根据 Xiuyuan ID 查询所有关联的 CardMapping
const mappings = service.getMappingsByXiuyuanID('xy_123');
console.log(`Generated ${mappings.length} cards`);
mappings.forEach(m => {
  console.log('Type:', m.typeMarker);
  console.log('Front:', m.frontFields);
  console.log('Back:', m.backFields);
});
```

### 4. 复习界面集成

```typescript
// 在复习界面获取当前卡片的渲染数据
const currentCard = getCurrentCard();

// 查询 CardMapping
const mapping = service.getMappingByCardID(currentCard.id);
if (mapping) {
  // 查询 Xiuyuan
  const xiuyuan = service.getXiuyuan(mapping.xiuyuanID);
  
  if (xiuyuan) {
    // 获取正面块 ID 列表
    const frontBlockIDs = mapping.frontFields
      .map(field => xiuyuan.fields.find(f => f.name === field)?.blockID)
      .filter(Boolean);
    
    // 获取反面块 ID 列表
    const backBlockIDs = mapping.backFields
      .map(field => xiuyuan.fields.find(f => f.name === field)?.blockID)
      .filter(Boolean);
    
    // 渲染多字段卡片
    renderMultiFieldCard(frontBlockIDs, backBlockIDs);
  }
}
```

### 5. 删除

```typescript
// 删除 Xiuyuan 及其所有关联卡片
const success = await service.deleteXiuyuan('xy_123');
if (success) {
  console.log('Xiuyuan and all related cards deleted');
} else {
  console.log('Xiuyuan not found');
}
```

### 6. 模板管理

```typescript
// 获取所有模板
const templates = service.getAllTemplates();
templates.forEach(t => console.log(t.name));

// 创建自定义模板
service.createTemplate({
  id: 'vocabulary',
  name: '词汇卡片',
  description: '英语词汇学习',
  fields: [
    { name: 'word', description: '单词' },
    { name: 'translation', description: '翻译' },
    { name: 'pronunciation', description: '发音' }
  ],
  cardRules: [
    { typeMarker: 'en-zh', frontFields: ['word'], backFields: ['translation'] },
    { typeMarker: 'zh-en', frontFields: ['translation'], backFields: ['word'] },
    { typeMarker: 'sound-zh', frontFields: ['pronunciation'], backFields: ['translation'] }
  ]
});
```

## 数据流示例

### 创建流程

```typescript
// 1. 用户选择两个块创建卡片
const blockIDs = ['block-question', 'block-answer'];

// 2. 创建 Xiuyuan
const xiuyuan: IXiuyuan = {
  id: 'xy_123',
  blockIDs: ['block-question', 'block-answer'],
  fields: [
    { name: 'question', blockID: 'block-question' },
    { name: 'answer', blockID: 'block-answer' }
  ],
  templateID: 'basic',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// 3. 创建 CardMapping
const mapping: ICardMapping = {
  xiuyuanID: 'xy_123',
  cardID: 'block-question', // 使用第一个块作为卡片 ID
  frontFields: ['question'],
  backFields: ['answer'],
  typeMarker: 'basic'
};

// 4. 创建 FSRSCard
const fsrsCard: FSRSCard = {
  id: 'block-question',
  blockId: 'block-question',
  due: Date.now(),
  stability: 0,
  difficulty: 0,
  // ... 其他 FSRS 字段
  meta: {
    xiuyuanID: 'xy_123',
    answerBlockID: 'block-answer',
    templateID: 'basic'
  }
};
```

### 复习流程

```typescript
// 1. 获取当前复习的卡片
const fsrsCard = getCurrentCard();

// 2. 通过 CardMapping 查询 Xiuyuan
const mapping = storage.getMappingByCardID(fsrsCard.id);
const xiuyuan = storage.getXiuyuan(mapping.xiuyuanID);

// 3. 渲染卡片
const frontBlocks = mapping.frontFields.map(
  field => xiuyuan.fields.find(f => f.name === field)?.blockID
);
const backBlocks = mapping.backFields.map(
  field => xiuyuan.fields.find(f => f.name === field)?.blockID
);

renderCard(frontBlocks, backBlocks);
```

### 删除流程

```typescript
// 1. 查询所有关联的 CardMapping
const mappings = storage.getMappingsByXiuyuanID('xy_123');

// 2. 删除所有关联的 FSRSCard
mappings.forEach(mapping => {
  storageManager.removeCard(mapping.cardID);
});

// 3. 删除 Xiuyuan（会自动删除 CardMapping）
storage.deleteXiuyuan('xy_123');
```

## 存储策略

### 当前实现（Phase 1）

- **存储方式**：JSON 文件
- **路径**：`storage/petal/siyuan-plugin-fsrs/xiuyuan.json`
- **适用场景**：数据量 < 3万条
- **优点**：简单、同步友好

### 内存索引（Phase 2）

- **触发条件**：数据量 > 3万条
- **索引类型**：
  - `indexByBlockID`: blockID → xiuyuanID[]
  - `indexByCardID`: cardID → mappingID
- **优点**：查询性能提升

### sql.js 数据库（Phase 3）

- **触发条件**：数据量 > 10万条
- **优点**：支持复杂查询、性能更好

## 最佳实践

### 1. 创建卡片

- 确保 blockIDs 至少包含一个块
- 如果有两个块，第二个块会作为答案块存储在 `FSRSCard.meta.answerBlockID`
- 创建后记得调用 `save()` 持久化数据

### 2. 查询优化

- 使用内存索引进行快速查询
- 避免频繁的全量扫描

### 3. 删除操作

- 删除 Xiuyuan 会自动删除关联的 CardMapping
- 需要手动删除关联的 FSRSCard（通过 StorageManager）
- 不会自动删除思源 Riff 卡片

### 4. 模板设计

- 字段名称应该语义化（如 'question', 'answer'）
- cardRules 定义了如何从字段生成卡片
- 一个模板可以生成多种类型的卡片

## 架构设计原则

### 单一职责

- **Xiuyuan**: 负责字段映射和模板信息
- **FSRSCard**: 负责调度信息（due, stability 等）
- **CardMapping**: 解耦 Xiuyuan 和 FSRSCard

### 松耦合

- 通过 CardMapping 解耦 Xiuyuan 和 FSRSCard
- Xiuyuan 可以独立于 FSRSCard 存在
- FSRSCard 可以不关联 Xiuyuan（向后兼容）

### 可扩展

- 支持自定义模板
- 支持扩展字段（meta）
- 支持未来的存储策略升级

## API 参考

### XiuyuanStorage

- `load()`: 加载数据
- `save()`: 保存数据
- `getXiuyuan(id)`: 获取 Xiuyuan
- `getAllXiuyuans()`: 获取所有 Xiuyuan
- `getXiuyuansByBlockID(blockID)`: 根据块 ID 查询
- `createXiuyuan(data)`: 创建 Xiuyuan
- `updateXiuyuan(id, updates)`: 更新 Xiuyuan
- `deleteXiuyuan(id)`: 删除 Xiuyuan
- `getMapping(id)`: 获取 CardMapping
- `getMappingByCardID(cardID)`: 根据卡片 ID 查询
- `getMappingsByXiuyuanID(xiuyuanID)`: 根据 Xiuyuan ID 查询
- `createMapping(mapping)`: 创建 CardMapping
- `deleteMapping(id)`: 删除 CardMapping
- `getTemplate(id)`: 获取模板
- `getAllTemplates()`: 获取所有模板
- `createTemplate(template)`: 创建模板
- `updateTemplate(id, updates)`: 更新模板
- `deleteTemplate(id)`: 删除模板
- `getStats()`: 获取统计信息

### XiuyuanService

- `init()`: 初始化服务
- `save()`: 保存数据
- `getTemplate(id)`: 获取模板
- `getAllTemplates()`: 获取所有模板
- `createTemplate(template)`: 创建模板
- `createFromBlocks(blockIDs, templateID, fieldMapping, deckID)`: 从块创建卡片
- `getXiuyuan(id)`: 获取 Xiuyuan
- `getXiuyuansByBlockID(blockID)`: 根据块 ID 查询
- `getMappingByCardID(cardID)`: 根据卡片 ID 查询
- `getMappingsByXiuyuanID(xiuyuanID)`: 根据 Xiuyuan ID 查询
- `getAllXiuyuans()`: 获取所有 Xiuyuan
- `deleteXiuyuan(id)`: 删除 Xiuyuan
- `getStats()`: 获取统计信息

## 相关文档

- [设计文档](../../../../../资料/design_docs/xiuyuan-cardsource-layer.md)
- [集成文档](../../../../../.kiro/specs/architecture-optimization/XIUYUAN_INTEGRATION.md)
- [架构优化规范](../../../../../.kiro/specs/architecture-optimization/design.md)
