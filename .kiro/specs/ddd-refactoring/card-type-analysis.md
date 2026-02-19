# 卡片类型设计分析：为什么需要区分类型？

## 问题重述

在 Xiuyuan 统一化方案中，我建议"不再区分卡片类型"。但这个决策需要重新审视：

**核心问题**：卡片类型的存在是否有其必要性？

## 当前卡片类型体系

### 现有类型

```typescript
export enum CardType {
    Item = 'item',               // 普通闪卡（基于块）
    Topic = 'topic',             // 主题（增量阅读）
    Concept = 'concept',         // 概念卡（使用 FSRS 调度器）
    Descriptor = 'descriptor',   // 描述符卡
    Incremental = 'incremental', // 增量学习
    Webpage = 'webpage',         // 网页卡片
}
```

### 类型的实际用途

让我分析每种类型的**独特行为**：

#### 1. Item（普通闪卡）

**特征**：
- 基于单个块
- 内容直接从块读取
- 标准 FSRS 调度

**独特行为**：
- ❌ 无特殊行为
- ✅ 这是"默认"类型

**结论**：可以作为默认模板

#### 2. Topic（主题卡）

**特征**：
- 增量阅读
- 使用 A-Factor 调度
- 优先级驱动

**独特行为**：
- ✅ **特殊调度算法**：A-Factor 而不是标准 FSRS
- ✅ **优先级计算**：基于 A-Factor 动态调整
- ✅ **渐进式学习**：可以拆分成子卡片

**结论**：需要保留类型标识

#### 3. Concept（概念卡）

**特征**：
- 基于文档块
- 内容是文档标题
- 标准 FSRS 调度

**独特行为**：
- ✅ **内容来源不同**：从文档标题而不是块内容
- ❌ 调度算法相同

**结论**：可以通过模板处理，但需要类型标识内容来源

#### 4. Descriptor（描述符卡）

**特征**：
- 描述性内容
- 标准 FSRS 调度

**独特行为**：
- ❌ 无特殊行为
- ✅ 仅用于分类和筛选

**结论**：可以作为模板变体

#### 5. Incremental（增量学习）

**特征**：
- 长文本渐进式阅读
- 可以提取摘录

**独特行为**：
- ✅ **特殊交互**：可以提取、拆分
- ✅ **进度跟踪**：记录阅读位置

**结论**：需要保留类型标识

#### 6. Webpage（网页卡片）

**特征**：
- 来源于网页
- 包含 URL 元数据

**独特行为**：
- ✅ **元数据不同**：包含 sourceUrl
- ❌ 调度算法相同

**结论**：可以通过模板处理，但需要类型标识来源

## 深度分析：类型的三个维度

### 维度 1：调度算法（Scheduling Algorithm）

| 类型 | 调度算法 | 是否需要类型标识 |
|------|----------|------------------|
| Item | FSRS | ❌ 默认 |
| Topic | A-Factor | ✅ **必需** |
| Concept | FSRS | ❌ 默认 |
| Descriptor | FSRS | ❌ 默认 |
| Incremental | FSRS | ❌ 默认 |
| Webpage | FSRS | ❌ 默认 |

**结论**：只有 Topic 需要特殊调度算法

### 维度 2：内容来源（Content Source）

| 类型 | 内容来源 | 是否需要类型标识 |
|------|----------|------------------|
| Item | 块内容 | ❌ 默认 |
| Topic | 文档/块 | ⚠️ 可选 |
| Concept | 文档标题 | ✅ **需要** |
| Descriptor | 块内容 | ❌ 默认 |
| Incremental | 长文本 | ⚠️ 可选 |
| Webpage | 网页内容 | ⚠️ 可选 |

**结论**：Concept 需要特殊处理（文档标题）

### 维度 3：交互行为（Interaction Behavior）

| 类型 | 特殊交互 | 是否需要类型标识 |
|------|----------|------------------|
| Item | 标准复习 | ❌ 默认 |
| Topic | 拆分、优先级调整 | ✅ **需要** |
| Concept | 标准复习 | ❌ 默认 |
| Descriptor | 标准复习 | ❌ 默认 |
| Incremental | 提取、进度跟踪 | ✅ **需要** |
| Webpage | 跳转到源 | ⚠️ 可选 |

**结论**：Topic 和 Incremental 需要特殊交互

## 重新设计：类型 vs 模板

### 核心洞察

**类型和模板是两个不同的概念**：

1. **类型（Type）**：定义**行为**（调度算法、交互方式）
2. **模板（Template）**：定义**展示**（前端、后端、样式）

### 正确的关系

```
卡片 = 类型（行为） + 模板（展示）
```

**示例**：

```typescript
// ✅ 正确：类型定义行为，模板定义展示
{
  type: 'topic',              // 行为：A-Factor 调度
  template: 'incremental-qa', // 展示：问答格式
}

// ✅ 正确：同一类型，不同模板
{
  type: 'item',               // 行为：FSRS 调度
  template: 'cloze',          // 展示：填空格式
}

// ✅ 正确：同一模板，不同类型
{
  type: 'topic',              // 行为：A-Factor 调度
  template: 'basic-qa',       // 展示：基础问答
}
```

## 修正后的统一化方案

### 保留类型，统一模板

```typescript
interface XiuyuanCard {
  // === 核心标识 ===
  id: string;
  blockId: string;
  
  // === 类型（定义行为）===
  type: CardType;  // ✅ 保留！用于调度和交互
  
  // === 模板（定义展示）===
  template: XiuyuanTemplate;  // ✅ 统一使用模板
  
  // === FSRS 调度 ===
  due: number;
  stability: number;
  difficulty: number;
  
  // === Topic 特有 ===
  aFactor?: number;  // ✅ 保留！Topic 需要
}
```

### 类型的职责

#### 1. Topic 类型

```typescript
class TopicCard extends XiuyuanCard {
  type = CardType.Topic;
  
  // ✅ 特殊调度
  calculateNextReview(): Date {
    return this.calculateWithAFactor();
  }
  
  // ✅ 特殊交互
  split(): TopicCard[] {
    return this.splitIntoSubtopics();
  }
  
  // ✅ 优先级调整
  adjustPriority(factor: number): void {
    this.aFactor *= factor;
  }
}
```

#### 2. Incremental 类型

```typescript
class IncrementalCard extends XiuyuanCard {
  type = CardType.Incremental;
  
  // ✅ 进度跟踪
  readingProgress: number;
  
  // ✅ 提取摘录
  extract(range: Range): ItemCard {
    return this.createExcerpt(range);
  }
  
  // ✅ 标准调度（FSRS）
  calculateNextReview(): Date {
    return this.calculateWithFSRS();
  }
}
```

#### 3. Item 类型（默认）

```typescript
class ItemCard extends XiuyuanCard {
  type = CardType.Item;
  
  // ✅ 标准调度（FSRS）
  calculateNextReview(): Date {
    return this.calculateWithFSRS();
  }
  
  // ✅ 标准交互
  // 无特殊方法
}
```

### 模板的职责

```typescript
interface XiuyuanTemplate {
  id: string;
  name: string;
  
  // ✅ 定义展示
  front: string;  // 正面模板
  back: string;   // 背面模板
  style: string;  // 样式
  
  // ✅ 渲染
  render(card: XiuyuanCard): CardView;
}
```

**示例**：

```typescript
// Topic 卡片 + 基础问答模板
{
  type: 'topic',
  template: {
    id: 'basic-qa',
    front: '{{question}}',
    back: '{{answer}}',
  },
  aFactor: 2.5,
}

// Item 卡片 + 填空模板
{
  type: 'item',
  template: {
    id: 'cloze',
    front: '{{text_with_blanks}}',
    back: '{{text_with_answers}}',
  },
}
```

## 块属性设计

### 保留类型标识

```
custom-card-id: xxx
custom-card-type: topic              # ✅ 保留！用于调度
custom-xiuyuan-template: basic-qa    # ✅ 新增！用于展示
custom-priority: 50
custom-suspended: false
custom-a-factor: 2.5                 # ✅ 保留！Topic 需要
```

### 类型驱动的属性

```typescript
// Topic 卡片
{
  'custom-card-type': 'topic',
  'custom-a-factor': '2.5',  // Topic 特有
}

// Item 卡片
{
  'custom-card-type': 'item',
  // 无特殊属性
}

// Incremental 卡片
{
  'custom-card-type': 'incremental',
  'custom-reading-progress': '0.5',  // Incremental 特有
}
```

## DDD 架构设计

### 领域层：类型多态

```typescript
// ✅ 抽象基类
abstract class XiuyuanCard extends AggregateRoot {
  abstract type: CardType;
  protected template: XiuyuanTemplate;
  
  // 模板方法：子类可以覆盖
  abstract calculateNextReview(): Date;
  
  // 通用方法：所有卡片共享
  render(): CardView {
    return this.template.render(this);
  }
}

// ✅ 具体类型
class TopicCard extends XiuyuanCard {
  type = CardType.Topic;
  private aFactor: number;
  
  calculateNextReview(): Date {
    // A-Factor 调度
    return this.scheduleWithAFactor();
  }
  
  split(): TopicCard[] {
    // Topic 特有行为
  }
}

class ItemCard extends XiuyuanCard {
  type = CardType.Item;
  
  calculateNextReview(): Date {
    // FSRS 调度
    return this.scheduleWithFSRS();
  }
}
```

### 应用层：工厂模式

```typescript
class CardFactory {
  create(blockId: string, type: CardType, templateId: string): XiuyuanCard {
    const template = this.templateRepository.findById(templateId);
    
    switch (type) {
      case CardType.Topic:
        return new TopicCard(blockId, template);
      case CardType.Incremental:
        return new IncrementalCard(blockId, template);
      default:
        return new ItemCard(blockId, template);
    }
  }
}
```

## 结论

### ✅ 保留类型系统

**原因**：

1. **调度算法不同**：Topic 使用 A-Factor，其他使用 FSRS
2. **交互行为不同**：Topic 可以拆分，Incremental 可以提取
3. **元数据不同**：Topic 有 aFactor，Incremental 有 readingProgress
4. **符合 DDD**：类型是领域概念，反映了不同的业务规则

### ✅ 统一模板系统

**原因**：

1. **展示与行为分离**：模板只负责展示，类型负责行为
2. **灵活组合**：同一类型可以使用不同模板
3. **易于扩展**：新增模板不影响类型逻辑

### 修正后的统一化方案

**核心思想**：

```
统一化 ≠ 消除类型
统一化 = 统一模板系统 + 保留类型行为
```

**具体做法**：

1. ✅ **保留类型**：用于调度算法和交互行为
2. ✅ **统一模板**：所有卡片都使用 Xiuyuan 模板
3. ✅ **简化属性**：只保留类型相关的必要属性
4. ✅ **清晰职责**：类型定义行为，模板定义展示

这样既保留了类型系统的必要性，又实现了模板系统的统一化，符合 DDD 的领域建模原则。
