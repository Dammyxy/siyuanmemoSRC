# ADR-004: Xiuyuan 卡片来源抽象层

## 状态

已接受

## 背景

在 FSRS 插件的早期版本中，每张复习卡片（FSRSCard）直接对应一个思源块（Block）。这种一对一的映射关系在处理简单的问答卡片时工作良好，但存在以下限制：

### 问题 1: 无法支持多字段卡片

用户希望创建更复杂的卡片类型，例如：
- **词汇卡片**：单词、翻译、发音、例句
- **双向卡片**：英-中、中-英（从同一组内容生成两张卡片）
- **多面卡片**：问题、答案、提示、解释

在旧架构中，每张卡片只能关联一个块，无法表达多字段的概念。

### 问题 2: 卡片与内容耦合

FSRSCard 直接存储调度信息（due, stability, difficulty）和内容引用（blockID）。这导致：
- 修改卡片内容需要更新 FSRSCard
- 无法从同一组内容生成多张卡片
- 删除内容时需要手动清理所有相关卡片

### 问题 3: 缺少模板系统

用户无法定义自己的卡片类型和字段结构。每次创建新类型的卡片都需要修改代码。

### 问题 4: 与 Anki 的概念差异

Anki 使用 Note（笔记）和 Card（卡片）的分离设计：
- **Note**: 存储字段内容（如 Front, Back, Audio）
- **Card**: 存储调度信息，通过模板从 Note 生成

这种设计更灵活，但 FSRS 插件缺少类似的抽象层。

## 决策

我们决定引入 **Xiuyuan（修缘）** 作为卡片来源抽象层，对应 Anki 的 Note 概念。

### 核心设计

#### 1. 三层架构

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

#### 2. 数据模型

**IXiuyuan - 卡片来源**:
```typescript
interface IXiuyuan {
  id: XiuyuanID;                 // 唯一标识符（Branded Type）
  blockIDs: BlockID[];           // 关联的块 ID 列表
  fields: IXiuyuanField[];       // 字段定义
  templateID: string;            // 模板 ID
  createdAt: number;             // 创建时间戳
  updatedAt: number;             // 更新时间戳
  meta?: Record<string, unknown>; // 扩展元数据
}
```

**IXiuyuanField - 字段定义**:
```typescript
interface IXiuyuanField {
  name: string;      // 字段名称（如 'question', 'answer'）
  blockID: BlockID;  // 字段内容来源块 ID
  marker?: string;   // 字段角色标记
}
```

**ICardMapping - 卡片映射**:
```typescript
interface ICardMapping {
  xiuyuanID: XiuyuanID;      // 修缘 ID
  cardID: CardID;            // 卡片 ID（思源 Riff 卡片 ID）
  frontFields: string[];     // 正面字段列表
  backFields: string[];      // 反面字段列表
  typeMarker?: string;       // 卡片类型标记（如 'en-zh', 'zh-en'）
}
```

**ICardTemplate - 卡片模板**:
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

#### 3. 类型安全

使用 Branded Types 防止 ID 类型混淆：

```typescript
type XiuyuanID = string & { readonly __brand: 'XiuyuanID' };
type BlockID = string & { readonly __brand: 'BlockID' };
type CardID = string & { readonly __brand: 'CardID' };

// 编译时错误：不能将 BlockID 赋值给 XiuyuanID
const xiuyuanId: XiuyuanID = createBlockID('123'); // ❌ Type error
```

#### 4. 存储策略

**Phase 1 - JSON 文件**（当前实现）:
- 路径: `storage/petal/siyuan-plugin-fsrs/xiuyuan.json`
- 适用: 数据量 < 3万条
- 优点: 简单、同步友好

**Phase 2 - 内存索引**（未来）:
- 触发: 数据量 > 3万条
- 索引: `blockID → xiuyuanID[]`, `cardID → mappingID`
- 优点: 查询性能提升

**Phase 3 - sql.js 数据库**（未来）:
- 触发: 数据量 > 10万条
- 优点: 支持复杂查询、性能更好

### 实现示例

#### 创建双向卡片

```typescript
// 用户选择两个块：问题和答案
const blockIDs = [
  createBlockID('20230101120000-question'),
  createBlockID('20230101120001-answer')
];

// 使用 'bidirectional' 模板创建 Xiuyuan
const result = await xiuyuanService.createFromBlocks(
  blockIDs,
  'bidirectional',
  {
    front: '20230101120000-question',
    back: '20230101120001-answer'
  },
  'default-deck'
);

// 结果：创建 1 个 Xiuyuan，生成 2 张 Card
// Card 1: front → back (正向)
// Card 2: back → front (反向)
console.log('Created cards:', result.cards.length); // 2
```

#### 复习时渲染

```typescript
// 获取当前复习的卡片
const fsrsCard = getCurrentCard();

// 查询 CardMapping
const mapping = xiuyuanService.getMappingByCardID(fsrsCard.id);
if (mapping) {
  // 查询 Xiuyuan
  const xiuyuan = xiuyuanService.getXiuyuan(mapping.xiuyuanID);
  
  // 获取正面和反面的块 ID
  const frontBlockIDs = mapping.frontFields
    .map(field => xiuyuan.fields.find(f => f.name === field)?.blockID)
    .filter(Boolean);
  
  const backBlockIDs = mapping.backFields
    .map(field => xiuyuan.fields.find(f => f.name === field)?.blockID)
    .filter(Boolean);
  
  // 渲染多字段卡片
  renderMultiFieldCard(frontBlockIDs, backBlockIDs);
}
```

## 后果

### 正面影响

1. **支持多字段卡片**
   - 用户可以创建词汇卡片、双向卡片等复杂类型
   - 一个 Xiuyuan 可以生成多张 Card

2. **内容与调度分离**
   - Xiuyuan 存储字段映射
   - FSRSCard 存储调度信息
   - 修改内容不影响调度状态

3. **模板系统**
   - 用户可以定义自定义模板
   - 内置模板：basic, bidirectional, vocabulary
   - 支持扩展和自定义

4. **类型安全**
   - 使用 Branded Types 防止 ID 混淆
   - 编译时捕获类型错误

5. **向后兼容**
   - FSRSCard 可以不关联 Xiuyuan（旧卡片）
   - 通过 `meta.xiuyuanID` 可选关联

6. **与 Anki 概念对齐**
   - Xiuyuan ≈ Anki Note
   - CardMapping ≈ Anki Card Template
   - FSRSCard ≈ Anki Card

### 负面影响

1. **增加复杂度**
   - 引入三层架构（Xiuyuan → CardMapping → FSRSCard）
   - 需要维护额外的数据结构

2. **存储开销**
   - 需要存储 Xiuyuan 和 CardMapping 数据
   - JSON 文件大小增加

3. **查询性能**
   - 复习时需要额外查询 Xiuyuan 和 CardMapping
   - 大数据量时可能影响性能（通过索引缓解）

4. **学习成本**
   - 开发者需要理解三层架构
   - 用户需要理解模板概念

### 风险

1. **数据迁移**
   - 旧卡片需要迁移到新架构（可选）
   - 迁移失败可能导致数据丢失

2. **性能瓶颈**
   - 大数据量时 JSON 文件读写可能变慢
   - 缓解：Phase 2 引入内存索引，Phase 3 升级到 sql.js

3. **同步冲突**
   - 多设备同步时 xiuyuan.json 可能冲突
   - 缓解：使用 CRDT 或冲突解决策略

## 替代方案

### 方案 A: 扩展 FSRSCard 支持多字段

直接在 FSRSCard 中添加 `fields: { name: string, blockID: string }[]` 字段。

**优点**:
- 实现简单，不需要新的数据结构
- 查询性能好（无需额外查询）

**缺点**:
- 无法从同一组内容生成多张卡片
- 缺少模板系统
- 内容与调度耦合

**为什么没有选择**: 
无法支持双向卡片等高级功能，不符合长期架构目标。

### 方案 B: 使用思源数据库的自定义属性

利用思源的块属性系统存储字段映射。

**优点**:
- 不需要额外的存储文件
- 与思源原生功能集成

**缺点**:
- 块属性查询性能差
- 无法存储复杂的模板规则
- 依赖思源 API，不可控

**为什么没有选择**: 
性能和灵活性不足，无法满足复杂卡片类型的需求。

### 方案 C: 直接使用 sql.js 数据库

从一开始就使用 sql.js 存储 Xiuyuan 数据。

**优点**:
- 查询性能最好
- 支持复杂查询和索引

**缺点**:
- 实现复杂度高
- 同步困难（二进制文件）
- 过度设计（小数据量时不需要）

**为什么没有选择**: 
遵循渐进式优化原则，先用 JSON 实现，数据量大时再升级。

## 参考资料

- [Xiuyuan 模块文档](../../src/core/xiuyuan/README.md)
- [Xiuyuan 集成文档](../../../.kiro/specs/architecture-optimization/XIUYUAN_INTEGRATION.md)
- [Anki Manual - Notes & Fields](https://docs.ankiweb.net/getting-started.html#notes-fields)
- [ADR-001: Trait Pattern](./ADR-001-trait-pattern.md)
- [ADR-002: Observer Pattern](./ADR-002-observer-pattern.md)

## 元数据

- **作者**: FSRS Plugin Team
- **日期**: 2026-02-02
- **审阅者**: Architecture Team
- **相关 ADR**: ADR-001 (Trait Pattern), ADR-002 (Observer Pattern)
- **实现状态**: Phase 1 已完成（JSON 存储）
- **相关需求**: Requirement 3.6, 4.6, 8.1, 15.1
