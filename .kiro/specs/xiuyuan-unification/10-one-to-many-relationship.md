# 一对多关系：Xiuyuan 系统的核心价值

## 1. 核心概念

### 1.1 传统闪卡系统的限制

**一对一关系**：
```
Block (块) ←→ Card (卡片)
```

**问题**：
- ❌ 一个块只能有一张卡片
- ❌ 无法实现双向卡片（正向 + 反向）
- ❌ 无法实现列表模版卡（一个问题 + 多个答案）
- ❌ 块和卡片强耦合

### 1.2 Xiuyuan 系统的创新

**一对多关系**：
```
Block (块) ←→ Xiuyuan (修缘) ←→ Multiple Cards (多张卡片)
```

**优势**：
- ✅ 一个块可以有多张卡片
- ✅ 支持双向卡片
- ✅ 支持列表模版卡
- ✅ 块和卡片解耦
- ✅ 灵活的模板系统

## 2. 典型场景

### 2.1 双向卡片

**场景**：术语记忆

**输入**：
```markdown
- DDD
  - 领域驱动设计
```

**生成**：

```
1 个 Xiuyuan
├── 2 张卡片
│   ├── 卡片 1（正向）：DDD → 领域驱动设计
│   └── 卡片 2（反向）：领域驱动设计 → DDD
```

**数据结构**：

```typescript
// Xiuyuan
{
  id: 'xy_123',
  blockIDs: ['block-1', 'block-2'],
  templateID: 'builtin-bidirectional',
  fields: [
    { name: 'term', blockID: 'block-1' },
    { name: 'definition', blockID: 'block-2' },
  ],
}

// 卡片 1（正向）
{
  id: 'card-1',
  xiuyuanID: 'xy_123',
  blockId: 'block-1',  // 主块
  meta: {
    typeMarker: 'forward',
    frontBlockIDs: ['block-1'],
    backBlockIDs: ['block-2'],
  },
}

// 卡片 2（反向）
{
  id: 'card-2',
  xiuyuanID: 'xy_123',
  blockId: 'block-1',  // 主块（相同）
  meta: {
    typeMarker: 'reverse',
    frontBlockIDs: ['block-2'],
    backBlockIDs: ['block-1'],
  },
}
```

### 2.2 列表模版卡

**场景**：一个问题，多个答案

**输入**：
```markdown
- 什么是 FSRS？
  - FSRS 是一种间隔重复算法
  - 它基于记忆遗忘曲线
  - 可以优化复习时间
```

**生成**：

```
1 个 Xiuyuan
├── 3 张卡片
│   ├── 卡片 1：什么是 FSRS？ → FSRS 是一种间隔重复算法
│   ├── 卡片 2：什么是 FSRS？ → 它基于记忆遗忘曲线
│   └── 卡片 3：什么是 FSRS？ → 可以优化复习时间
```

**数据结构**：

```typescript
// Xiuyuan
{
  id: 'xy_456',
  blockIDs: ['block-parent', 'block-child-1', 'block-child-2', 'block-child-3'],
  templateID: 'builtin-list-item',
  fields: [
    { name: 'question', blockID: 'block-parent' },
    { name: 'answer-1', blockID: 'block-child-1' },
    { name: 'answer-2', blockID: 'block-child-2' },
    { name: 'answer-3', blockID: 'block-child-3' },
  ],
}

// 卡片 1
{
  id: 'card-1',
  xiuyuanID: 'xy_456',
  blockId: 'block-parent',
  meta: {
    typeMarker: 'list-qa',
    frontBlockIDs: ['block-parent'],
    backBlockIDs: ['block-child-1'],
    currentIndex: 0,
    allChildren: [
      { id: 'block-child-1', cue: '...', answer: '...', index: 0 },
      { id: 'block-child-2', cue: '...', answer: '...', index: 1 },
      { id: 'block-child-3', cue: '...', answer: '...', index: 2 },
    ],
  },
}

// 卡片 2、3 类似...
```

### 2.3 快速双向卡片

**场景**：单块生成双向卡片

**输入**：
```markdown
- DDD <> 领域驱动设计
```

**生成**：

```
1 个 Xiuyuan
├── 2 张卡片
│   ├── 卡片 1（正向）：DDD → 领域驱动设计
│   └── 卡片 2（反向）：领域驱动设计 → DDD
```

**数据结构**：

```typescript
// Xiuyuan
{
  id: 'xy_789',
  blockIDs: ['block-1'],  // 只有一个块
  templateID: 'builtin-quick-bidirectional',
  fields: [
    { name: 'content', blockID: 'block-1' },
  ],
}

// 卡片 1（正向）
{
  id: 'card-1',
  xiuyuanID: 'xy_789',
  blockId: 'block-1',
  meta: {
    typeMarker: 'forward',
    frontBlockIDs: ['block-1'],  // 渲染时解析 <> 左边
    backBlockIDs: ['block-1'],   // 渲染时解析 <> 右边
  },
}

// 卡片 2（反向）
{
  id: 'card-2',
  xiuyuanID: 'xy_789',
  blockId: 'block-1',
  meta: {
    typeMarker: 'reverse',
    frontBlockIDs: ['block-1'],  // 渲染时解析 <> 右边
    backBlockIDs: ['block-1'],   // 渲染时解析 <> 左边
  },
}
```

## 3. 数据模型

### 3.1 关系图

```
┌─────────────────────────────────────────────────────────────┐
│                         Block (块)                           │
│  - id: 'block-1'                                             │
│  - content: 'DDD <> 领域驱动设计'                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:1
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Xiuyuan (修缘)                          │
│  - id: 'xy_123'                                              │
│  - blockIDs: ['block-1']                                     │
│  - templateID: 'builtin-quick-bidirectional'                 │
│  - fields: [{ name: 'content', blockID: 'block-1' }]         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cards (卡片)                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Card 1 (正向)                                        │    │
│  │ - id: 'card-1'                                       │    │
│  │ - xiuyuanID: 'xy_123'                                │    │
│  │ - blockId: 'block-1'                                 │    │
│  │ - meta.typeMarker: 'forward'                         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Card 2 (反向)                                        │    │
│  │ - id: 'card-2'                                       │    │
│  │ - xiuyuanID: 'xy_123'                                │    │
│  │ - blockId: 'block-1'                                 │    │
│  │ - meta.typeMarker: 'reverse'                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 索引设计

```typescript
class UnifiedStorageManager {
  // 主数据
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  
  // 索引（支持一对多查询）
  private indexByBlockID: Map<string, string[]> = new Map();
  //     ↑ blockID → [cardID1, cardID2, ...]
  
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  //     ↑ xiuyuanID → [cardID1, cardID2, ...]
}
```

### 3.3 查询方法

```typescript
// 查询一个块的所有卡片
getCardsByBlockId(blockId: string): FSRSCard[] {
  const cardIds = this.indexByBlockID.get(blockId) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}

// 查询一个 Xiuyuan 的所有卡片
getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[] {
  const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}

// 查询一个块关联的 Xiuyuan
getXiuyuanByBlockId(blockId: string): IXiuyuan | undefined {
  // 1. 查询块的第一张卡片
  const cards = this.getCardsByBlockId(blockId);
  if (cards.length === 0) return undefined;
  
  // 2. 通过卡片的 xiuyuanID 查询 Xiuyuan
  return this.xiuyuans.get(cards[0].meta.xiuyuanID);
}
```

## 4. 创建流程

### 4.1 双向卡片创建

```typescript
// 用户操作：选择两个块，创建双向卡片
await cardService.createCard({
  blockIds: ['block-1', 'block-2'],
  templateId: 'builtin-bidirectional',
});

// 内部流程：
// 1. 创建 Xiuyuan
const xiuyuan: IXiuyuan = {
  id: generateXiuyuanId(),
  blockIDs: ['block-1', 'block-2'],
  templateID: 'builtin-bidirectional',
  fields: [
    { name: 'term', blockID: 'block-1' },
    { name: 'definition', blockID: 'block-2' },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// 2. 根据模板的 cardRules 生成卡片
const template = templateRegistry.get('builtin-bidirectional');
for (const rule of template.cardRules) {
  const card: FSRSCard = {
    id: generateCardId(),
    xiuyuanID: xiuyuan.id,
    blockId: 'block-1',  // 主块
    
    // FSRS 数据
    due: Date.now(),
    stability: 0,
    difficulty: 0,
    // ...
    
    // 类型和模板
    type: 'item',
    templateID: 'builtin-bidirectional',
    
    // 元数据
    meta: {
      xiuyuanID: xiuyuan.id,
      templateID: 'builtin-bidirectional',
      typeMarker: rule.typeMarker,  // 'forward' 或 'reverse'
      frontBlockIDs: rule.frontFields.map(f => 
        xiuyuan.fields.find(field => field.name === f)!.blockID
      ),
      backBlockIDs: rule.backFields.map(f => 
        xiuyuan.fields.find(field => field.name === f)!.blockID
      ),
      fieldMapping: {
        term: 'block-1',
        definition: 'block-2',
      },
    },
    
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await storage.createCard(xiuyuan, card);
}
```

### 4.2 列表模版卡创建

```typescript
// 用户操作：选择父列表项，创建列表模版卡
await cardService.createCard({
  blockIds: ['block-parent'],
  templateId: 'builtin-list-item',
});

// 内部流程：
// 1. 检测子列表项
const children = await getChildBlocks('block-parent');

// 2. 创建 Xiuyuan
const xiuyuan: IXiuyuan = {
  id: generateXiuyuanId(),
  blockIDs: ['block-parent', ...children.map(c => c.id)],
  templateID: 'builtin-list-item',
  fields: [
    { name: 'question', blockID: 'block-parent' },
    ...children.map((child, i) => ({
      name: `answer-${i}`,
      blockID: child.id,
    })),
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// 3. 为每个子列表项生成一张卡片
for (let i = 0; i < children.length; i++) {
  const card: FSRSCard = {
    id: generateCardId(),
    xiuyuanID: xiuyuan.id,
    blockId: 'block-parent',  // 主块
    
    // ...
    
    meta: {
      xiuyuanID: xiuyuan.id,
      templateID: 'builtin-list-item',
      typeMarker: 'list-qa',
      frontBlockIDs: ['block-parent'],
      backBlockIDs: [children[i].id],
      currentIndex: i,
      allChildren: children.map((child, idx) => ({
        id: child.id,
        cue: child.content,
        answer: child.content,
        index: idx,
      })),
    },
  };
  
  await storage.createCard(xiuyuan, card);
}
```

## 5. 删除流程

### 5.1 删除单张卡片

```typescript
// 用户操作：删除一张卡片
await cardService.deleteCard({ cardId: 'card-1' });

// 内部流程：
// 1. 删除卡片
await storage.deleteCard('card-1');

// 2. 检查 Xiuyuan 是否还有其他卡片
const xiuyuanId = card.meta.xiuyuanID;
const remainingCards = storage.getCardsByXiuyuanId(xiuyuanId);

// 3. 如果没有其他卡片，删除 Xiuyuan
if (remainingCards.length === 0) {
  await storage.deleteXiuyuan(xiuyuanId);
}
```

### 5.2 删除 Xiuyuan（级联删除）

```typescript
// 用户操作：删除 Xiuyuan
await storage.deleteXiuyuan('xy_123');

// 内部流程：
// 1. 查找所有关联的卡片
const cards = storage.getCardsByXiuyuanId('xy_123');

// 2. 删除所有卡片
for (const card of cards) {
  await storage.deleteCard(card.id);
}

// 3. 删除 Xiuyuan
storage.xiuyuans.delete('xy_123');
```

### 5.3 删除块（级联删除）

```typescript
// 用户操作：删除块
await deleteBlock('block-1');

// 内部流程：
// 1. 查找所有关联的卡片
const cards = storage.getCardsByBlockId('block-1');

// 2. 删除所有卡片
for (const card of cards) {
  await cardService.deleteCard({ cardId: card.id });
}

// 3. Xiuyuan 会自动级联删除（如果没有其他卡片）
```

## 6. 复习流程

### 6.1 渲染卡片

```typescript
// 复习时，根据 meta 信息渲染卡片
function renderCard(card: FSRSCard): CardView {
  const xiuyuan = storage.getXiuyuan(card.meta.xiuyuanID);
  const template = templateRegistry.get(card.templateID);
  
  // 1. 获取正面块
  const frontBlocks = await Promise.all(
    card.meta.frontBlockIDs.map(id => getBlockContent(id))
  );
  
  // 2. 获取背面块
  const backBlocks = await Promise.all(
    card.meta.backBlockIDs.map(id => getBlockContent(id))
  );
  
  // 3. 渲染
  return {
    front: template.renderFront(frontBlocks),
    back: template.renderBack(backBlocks),
  };
}
```

### 6.2 列表模版卡的渐进式显示

```typescript
// 列表模版卡：逐步显示答案
function renderListTemplateCard(card: FSRSCard): CardView {
  const currentIndex = card.meta.currentIndex || 0;
  const allChildren = card.meta.allChildren || [];
  
  // 正面：问题
  const front = getBlockContent(card.meta.frontBlockIDs[0]);
  
  // 背面：当前答案 + 已显示的答案
  const visibleChildren = allChildren.slice(0, currentIndex + 1);
  const back = visibleChildren.map(child => child.answer).join('\n');
  
  return { front, back };
}
```

## 7. 统一化后的验证

### 7.1 验证清单

- [ ] 一个块可以有多张卡片
- [ ] 双向卡片正确生成
- [ ] 列表模版卡正确生成
- [ ] 查询方法正确（getCardsByBlockId）
- [ ] 删除级联正确
- [ ] 索引正确更新

### 7.2 测试场景

```typescript
describe('One-to-Many Relationship', () => {
  it('should create bidirectional cards', async () => {
    const result = await cardService.createCard({
      blockIds: ['block-1', 'block-2'],
      templateId: 'builtin-bidirectional',
    });
    
    expect(result.ok).toBe(true);
    
    // 验证生成了 2 张卡片
    const cards = storage.getCardsByBlockId('block-1');
    expect(cards.length).toBe(2);
    
    // 验证都关联到同一个 Xiuyuan
    const xiuyuanId = cards[0].meta.xiuyuanID;
    expect(cards[1].meta.xiuyuanID).toBe(xiuyuanId);
    
    // 验证正向和反向
    const forward = cards.find(c => c.meta.typeMarker === 'forward');
    const reverse = cards.find(c => c.meta.typeMarker === 'reverse');
    expect(forward).toBeDefined();
    expect(reverse).toBeDefined();
  });
  
  it('should create list template cards', async () => {
    const result = await cardService.createCard({
      blockIds: ['block-parent'],
      templateId: 'builtin-list-item',
    });
    
    expect(result.ok).toBe(true);
    
    // 验证生成了 N 张卡片（N = 子列表项数量）
    const cards = storage.getCardsByBlockId('block-parent');
    expect(cards.length).toBeGreaterThan(1);
    
    // 验证都关联到同一个 Xiuyuan
    const xiuyuanId = cards[0].meta.xiuyuanID;
    expect(cards.every(c => c.meta.xiuyuanID === xiuyuanId)).toBe(true);
  });
  
  it('should cascade delete when deleting xiuyuan', async () => {
    // 1. 创建双向卡片
    const result = await cardService.createCard({
      blockIds: ['block-1', 'block-2'],
      templateId: 'builtin-bidirectional',
    });
    
    const xiuyuanId = result.value.meta.xiuyuanID;
    
    // 2. 删除 Xiuyuan
    await storage.deleteXiuyuan(xiuyuanId);
    
    // 3. 验证所有卡片都被删除
    const cards = storage.getCardsByXiuyuanId(xiuyuanId);
    expect(cards.length).toBe(0);
  });
});
```

## 8. 总结

### 8.1 核心价值

- ✅ **解耦块和卡片**：块和卡片不再一对一绑定
- ✅ **一对多关系**：一个块可以有多张卡片
- ✅ **灵活的模板**：支持双向卡片、列表模版卡等
- ✅ **易于扩展**：新增模板不影响现有代码

### 8.2 关键设计

- ✅ **Xiuyuan 作为中间层**：解耦块和卡片
- ✅ **内存索引**：支持高效的一对多查询
- ✅ **级联删除**：自动清理孤儿数据
- ✅ **元数据驱动**：通过 meta 信息渲染卡片

### 8.3 统一化后的保证

- ✅ 所有卡片都有 xiuyuanID
- ✅ 一对多关系完整支持
- ✅ 查询和删除正确处理
- ✅ 性能优化（内存索引）
