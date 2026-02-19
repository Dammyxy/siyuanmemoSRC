# 架构设计

## 1. 整体架构

### 1.1 统一后的架构

```
┌─────────────────────────────────────────────────────────────┐
│                    统一的 Xiuyuan 系统                       │
│                    (完全 DDD 架构)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  所有卡片类型：                                              │
│  • Item (基础卡片)                                           │
│  • Topic (主题卡片 - A-Factor)                               │
│  • Concept (概念卡 - FSRS 或 A-Factor)                       │
│  • Descriptor (描述符卡 - FSRS)                              │
│                                                              │
│  统一创建流程：                                              │
│  CardApplicationService.createCard()                         │
│                                                              │
│  统一存储：                                                  │
│  UnifiedStorageManager (MessagePack + 内存索引)              │
│                                                              │
│  完整的领域事件：                                            │
│  CardCreated, CardDeleted, CardUpdated                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 DDD 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      表现层 (Presentation)                   │
│  • DialogManager (模板选择、模板编辑)                        │
│  • MenuManager (块菜单、右键菜单)                            │
│  • TabManager (浏览器、复习界面)                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      应用层 (Application)                    │
│  • CardApplicationService (统一入口)                         │
│  • CreateCardUseCase (创建卡片用例)                          │
│  • DeleteCardUseCase (删除卡片用例)                          │
│  • UpdateCardUseCase (更新卡片用例)                          │
│  • CardCreationHelper (创建辅助函数)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      领域层 (Domain)                         │
│  • Xiuyuan (聚合根)                                          │
│  • Card (实体)                                               │
│  • CardCreationService (领域服务)                            │
│  • CardDeletionService (领域服务)                            │
│  • IXiuyuanRepository (仓储接口)                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    基础设施层 (Infrastructure)               │
│  • UnifiedStorageManager (统一存储)                          │
│  • XiuyuanRepository (仓储实现)                              │
│  • EventBus (事件总线)                                       │
└─────────────────────────────────────────────────────────────┘
```

## 2. 核心概念

### 2.1 Xiuyuan（修缘）

**定义**：卡片来源，对应 Anki 的 Note 概念。

**职责**：
- 存储字段映射（blockID → 字段名）
- 关联模板
- 生成一张或多张卡片

**示例**：
```typescript
interface IXiuyuan {
  id: string;                    // xy_1234567890_abc123
  blockIDs: string[];            // ['block-1', 'block-2']
  templateID: string;            // 'builtin-basic-qa'
  fields: Array<{
    name: string;                // 'question'
    blockID: string;             // 'block-1'
  }>;
  createdAt: number;
  updatedAt: number;
}
```

### 2.2 Card（卡片）

**定义**：FSRS 卡片，包含调度数据。

**职责**：
- 存储 FSRS 调度数据
- 关联 Xiuyuan
- 定义类型和模板

**示例**：
```typescript
interface FSRSCard {
  // 身份
  id: string;
  xiuyuanID: string;             // ✅ 必需
  blockId: string;
  
  // FSRS 核心
  due: number;
  stability: number;
  difficulty: number;
  // ...
  
  // 类型和模板
  type: CardType;                // 'concept'
  templateID: string;            // 'builtin-concept-simple'
  schedulerType: string;         // 'fsrs-v6' 或 'a-factor'
  
  // 优先级
  priority: number;              // 0-100
  
  // 元数据
  meta: {
    xiuyuanID: string;
    templateID: string;
    frontBlockIDs: string[];
    backBlockIDs: string[];
    fieldMapping: Record<string, string>;
  };
}
```

### 2.3 Template（模板）

**定义**：定义卡片的字段结构和生成规则。

**职责**：
- 定义需要哪些字段
- 定义如何生成卡片（正面/背面）
- 支持生成多张卡片（如双向卡）

**示例**：
```typescript
interface ICardTemplate {
  id: string;                    // 'builtin-basic-qa'
  name: string;                  // '基础问答'
  description: string;
  fields: Array<{
    name: string;                // 'question'
    description: string;         // '问题'
  }>;
  cardRules: Array<{
    typeMarker: string;          // 'qa'
    frontFields: string[];       // ['question']
    backFields: string[];        // ['answer']
  }>;
}
```

## 3. 关键关系

### 3.1 Xiuyuan → Card（1:N）

一个 Xiuyuan 可以生成多张 Card：

```typescript
// 示例：双向卡片
Xiuyuan {
  id: 'xy_123',
  blockIDs: ['block-1', 'block-2'],
  templateID: 'builtin-bidirectional',
  fields: [
    { name: 'term', blockID: 'block-1' },
    { name: 'definition', blockID: 'block-2' },
  ],
}

// 生成 2 张卡片
Card {
  id: 'card-1',
  xiuyuanID: 'xy_123',
  meta: {
    typeMarker: 'forward',
    frontBlockIDs: ['block-1'],
    backBlockIDs: ['block-2'],
  },
}

Card {
  id: 'card-2',
  xiuyuanID: 'xy_123',
  meta: {
    typeMarker: 'reverse',
    frontBlockIDs: ['block-2'],
    backBlockIDs: ['block-1'],
  },
}
```

### 3.2 Type 与 Template 的独立关系

类型（Type）定义行为，模板（Template）定义展示：

```typescript
// 概念卡 + 简单模板 + A-Factor（无答案）
{
  type: 'concept',
  templateID: 'builtin-concept-simple',
  schedulerType: 'a-factor',
}

// 概念卡 + 描述符模板 + FSRS（有答案）
{
  type: 'concept',
  templateID: 'builtin-concept-descriptor',
  schedulerType: 'fsrs-v6',
}
```

## 4. 数据流

### 4.1 创建卡片流程

```
用户操作
    ↓
DialogManager / MenuManager
    ↓
CardApplicationService.createCard(CreateCardCommand)
    ↓
CreateCardUseCase.execute()
    ↓
1. 验证命令
2. 自动选择模板（如果未指定）
3. 创建 Xiuyuan 聚合根
    ↓
CardCreationService.createCard()
    ↓
4. 生成 Card 实体
5. 发布 CardCreated 事件
    ↓
XiuyuanRepository.save()
    ↓
UnifiedStorageManager.save()
    ↓
unified-cards.msgpack
```

### 4.2 查询卡片流程

```
查询请求
    ↓
UnifiedStorageManager.getDueCards()
    ↓
1. 查询内存索引（indexByDue）
2. 返回排序后的卡片列表
    ↓
O(1) 查询，< 100ms
```

### 4.3 删除卡片流程

```
删除请求
    ↓
CardApplicationService.deleteCard(DeleteCardCommand)
    ↓
DeleteCardUseCase.execute()
    ↓
1. 查找 Xiuyuan
2. 删除所有关联的 Card
3. 发布 CardDeleted 事件
    ↓
XiuyuanRepository.delete()
    ↓
UnifiedStorageManager.delete()
    ↓
1. 删除 Xiuyuan
2. 删除所有关联的 Card
3. 更新内存索引
```

## 5. 设计原则

### 5.1 单一职责

- **Xiuyuan**：管理字段映射和模板
- **Card**：管理调度数据
- **Template**：定义展示规则

### 5.2 开闭原则

- 新增模板：不修改现有代码
- 新增类型：扩展 CardType 枚举

### 5.3 依赖倒置

- 应用层依赖领域层接口（IXiuyuanRepository）
- 基础设施层实现领域层接口

### 5.4 领域事件

- CardCreated：卡片创建后发布
- CardDeleted：卡片删除后发布
- CardUpdated：卡片更新后发布

## 6. 与旧架构的对比

| 维度 | 旧架构 | 新架构 |
|------|--------|--------|
| 创建方式 | createDefaultCard() | CardApplicationService.createCard() |
| 存储 | cards.msgpack + xiuyuan.msgpack | unified-cards.msgpack |
| 查询 | 遍历所有卡片 | 内存索引 O(1) |
| 优先级 | 块属性 + FSRSCard.priority | FSRSCard.priority |
| 类型 | 6 种 | 4 种 |
| 模板 | 固定 | 可扩展 + UI 编辑器 |
| 领域事件 | 无 | 完整支持 |

## 7. 扩展性

### 7.1 新增模板

```typescript
// 1. 定义模板
const MY_TEMPLATE: ICardTemplate = {
  id: 'custom-my-template',
  name: '我的模板',
  fields: [...],
  cardRules: [...],
};

// 2. 注册模板
templateRegistry.register(MY_TEMPLATE);

// 3. 使用模板
await cardService.createCard({
  blockIds: [...],
  templateId: 'custom-my-template',
});
```

### 7.2 新增调度器

```typescript
// 1. 实现调度器接口
class MyScheduler implements IScheduler {
  schedule(card: FSRSCard, rating: Rating): FSRSCard {
    // 自定义调度逻辑
  }
}

// 2. 注册调度器
schedulerRegistry.register('my-scheduler', new MyScheduler());

// 3. 使用调度器
await cardService.createCard({
  blockIds: [...],
  schedulerType: 'my-scheduler',
});
```

## 8. 性能考虑

### 8.1 内存索引

- **indexByBlockID**：快速查找块关联的卡片
- **indexByXiuyuanID**：快速查找 Xiuyuan 的所有卡片
- **indexByType**：快速按类型过滤
- **indexByDue**：快速获取到期卡片

### 8.2 查询优化

- 到期卡片查询：O(1)
- 按类型查询：O(1)
- 按块 ID 查询：O(1)
- 跨 Xiuyuan 查询：O(n)（可接受）

### 8.3 性能目标

- 加载 10 万卡片：< 2s
- 查询到期卡片：< 100ms
- 创建卡片：< 50ms
- 删除卡片：< 50ms
