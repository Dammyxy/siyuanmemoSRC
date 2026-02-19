# 完全统一架构计划（选项 B）

## 目标

将所有卡片创建、删除、更新操作统一到 DDD 架构，实现 100% 的架构一致性。

## 总体策略

采用**分阶段、可回滚、充分测试**的方式进行迁移：

1. **Phase 1**：扩展 DDD 架构支持所有卡片类型
2. **Phase 2**：迁移高频功能（概念卡）
3. **Phase 3**：迁移中频功能（自动制卡）
4. **Phase 4**：迁移低频功能（Card Builder）
5. **Phase 5**：清理旧代码
6. **Phase 6**：统一数据存储（可选）

## Phase 1: 扩展 DDD 架构（1-2 天）

### 1.1 创建内置模板

#### 任务 1.1.1：创建概念卡模板
**文件**：`src/core/xiuyuan/templates/builtin-concept.ts`

```typescript
import type { ICardTemplate } from '../types';

export const BUILTIN_CONCEPT_TEMPLATE: ICardTemplate = {
  id: 'builtin-concept-simple',
  name: '概念卡（简单）',
  description: '单块概念卡，用于记忆概念、术语、定义',
  version: '1.0.0',
  fields: [
    {
      name: 'concept',
      label: '概念',
      type: 'block',
      required: true,
      description: '概念的内容块',
    },
  ],
  cardRules: [
    {
      typeMarker: 'C',
      frontFields: ['concept'],
      backFields: ['concept'],
      cardType: 'concept',
    },
  ],
};
```

#### 任务 1.1.2：创建符号检测卡模板
**文件**：`src/core/xiuyuan/templates/builtin-symbol.ts`

```typescript
export const BUILTIN_SYMBOL_TEMPLATE: ICardTemplate = {
  id: 'builtin-symbol-qa',
  name: '符号问答卡',
  description: '通过 <> 符号标记的问答卡',
  version: '1.0.0',
  fields: [
    {
      name: 'question',
      label: '问题',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      label: '答案',
      type: 'text',
      required: true,
    },
  ],
  cardRules: [
    {
      typeMarker: 'Q',
      frontFields: ['question'],
      backFields: ['answer'],
      cardType: 'qa',
    },
  ],
};
```

#### 任务 1.1.3：创建快速制卡模板
**文件**：`src/core/xiuyuan/templates/builtin-quick.ts`

```typescript
export const BUILTIN_QUICK_TEMPLATE: ICardTemplate = {
  id: 'builtin-quick-card',
  name: '快速卡片',
  description: '快速创建的单块卡片',
  version: '1.0.0',
  fields: [
    {
      name: 'content',
      label: '内容',
      type: 'block',
      required: true,
    },
  ],
  cardRules: [
    {
      typeMarker: 'Q',
      frontFields: ['content'],
      backFields: ['content'],
      cardType: 'basic',
    },
  ],
};
```

#### 任务 1.1.4：注册所有内置模板
**文件**：`src/core/xiuyuan/templates/builtin.ts`

```typescript
import { BUILTIN_TEMPLATES as EXISTING_TEMPLATES } from './builtin';
import { BUILTIN_CONCEPT_TEMPLATE } from './builtin-concept';
import { BUILTIN_SYMBOL_TEMPLATE } from './builtin-symbol';
import { BUILTIN_QUICK_TEMPLATE } from './builtin-quick';

export const ALL_BUILTIN_TEMPLATES = [
  ...EXISTING_TEMPLATES,
  BUILTIN_CONCEPT_TEMPLATE,
  BUILTIN_SYMBOL_TEMPLATE,
  BUILTIN_QUICK_TEMPLATE,
];
```

**测试**：
- [ ] 验证所有模板可以正确加载
- [ ] 验证模板字段定义正确
- [ ] 验证卡片生成规则正确

### 1.2 扩展 CreateCardCommand

#### 任务 1.2.1：支持更多卡片类型
**文件**：`src/application/commands/card/CreateCardCommand.ts`

```typescript
export interface CreateCardCommand {
  // 现有字段
  blockIds: string[];
  templateId: string;
  deckId: string;
  fieldMapping?: Record<string, string>;
  
  // 新增字段
  cardType?: 'basic' | 'concept' | 'qa' | 'cloze' | 'bidirectional';
  priority?: 'normal' | 'high';
  metadata?: {
    autoCreated?: boolean;
    symbolDetected?: boolean;
    source?: 'manual' | 'auto' | 'symbol' | 'quick';
  };
}
```

**测试**：
- [ ] 验证命令验证逻辑
- [ ] 验证新字段的默认值

### 1.3 扩展 CreateCardUseCase

#### 任务 1.3.1：支持单块快速创建
**文件**：`src/application/usecases/card/CreateCardUseCase.ts`

```typescript
async execute(command: CreateCardCommand): Promise<Result<CreateCardResult>> {
  // 1. 验证命令
  const validationError = validateCreateCardCommand(command);
  if (validationError) {
    return err(new Error(`Invalid command: ${validationError}`));
  }

  // 2. 如果没有指定模板，根据卡片类型选择默认模板
  let templateId = command.templateId;
  if (!templateId) {
    templateId = this.getDefaultTemplateForType(command.cardType || 'basic');
  }

  // 3. 查找或创建 Xiuyuan
  // ... 现有逻辑
}

private getDefaultTemplateForType(cardType: string): string {
  const typeToTemplate: Record<string, string> = {
    'basic': 'builtin-quick-card',
    'concept': 'builtin-concept-simple',
    'qa': 'builtin-symbol-qa',
    'cloze': 'builtin-cloze',
    'bidirectional': 'builtin-bidirectional',
  };
  return typeToTemplate[cardType] || 'builtin-quick-card';
}
```

**测试**：
- [ ] 测试自动模板选择
- [ ] 测试单块快速创建
- [ ] 测试概念卡创建

## Phase 2: 迁移概念卡（1-2 天）

### 2.1 迁移 BlockMenuHandler

#### 任务 2.1.1：更新概念卡创建方法
**文件**：`src/services/BlockMenuHandler.ts`

**当前代码**（第 921 行）：
```typescript
const card = createDefaultCard(blockId);
card.type = 'concept';
this.deps.storage.setCard(card);
```

**新代码**：
```typescript
// 使用 CardApplicationService 创建概念卡
const cardService = this.getCardService();
if (cardService) {
  const result = await cardService.createCard({
    blockIds: [blockId],
    templateId: 'builtin-concept-simple',
    deckId: riff.BUILTIN_DECK_ID,
    cardType: 'concept',
    priority: priority,
    metadata: {
      source: 'manual',
    },
  });
  
  if (result.ok) {
    await pushMsg('✅ 概念卡创建成功！');
  } else {
    await pushErrMsg(`创建失败：${result.error.message}`);
  }
} else {
  // 降级：使用旧方法
  const card = createDefaultCard(blockId);
  card.type = 'concept';
  this.deps.storage.setCard(card);
}
```

**测试**：
- [ ] 测试手动创建概念卡
- [ ] 测试优先级设置
- [ ] 测试降级方案

### 2.2 迁移 AutoCardHandler

#### 任务 2.2.1：创建辅助方法
**文件**：`src/services/handlers/AutoCardHandler.ts`

```typescript
/**
 * 使用 CardApplicationService 创建概念卡
 */
private async createConceptCardViaDDD(
  blockId: string,
  options: {
    priority?: 'normal' | 'high';
    metadata?: Record<string, any>;
  } = {}
): Promise<boolean> {
  try {
    const cardService = this.getCardService();
    if (!cardService) {
      console.warn('[AutoCard] CardApplicationService not available, using fallback');
      return false;
    }

    const result = await cardService.createCard({
      blockIds: [blockId],
      templateId: 'builtin-concept-simple',
      deckId: (await import('@/core/siyuan/riff')).riff.BUILTIN_DECK_ID,
      cardType: 'concept',
      priority: options.priority || 'normal',
      metadata: {
        autoCreated: true,
        source: 'auto',
        ...options.metadata,
      },
    });

    if (result.ok) {
      console.log(`[AutoCard] Concept card created via DDD: ${blockId}`);
      return true;
    } else {
      console.error(`[AutoCard] Failed to create concept card: ${result.error.message}`);
      return false;
    }
  } catch (error) {
    console.error('[AutoCard] Error creating concept card via DDD:', error);
    return false;
  }
}

/**
 * 获取 CardApplicationService
 */
private getCardService(): any | null {
  try {
    const plugin = (this as any).plugin;
    if (plugin && plugin.context) {
      return plugin.context.getCardService();
    }
  } catch (error) {
    console.warn('[AutoCard] Failed to get CardApplicationService:', error);
  }
  return null;
}
```

#### 任务 2.2.2：迁移所有概念卡创建点

需要迁移的位置：
1. 第 857 行：`createConceptCardForSymbol`
2. 第 1018 行：`createForwardCard`
3. 第 1131 行：`createBackwardCard`
4. 第 1518 行：`createEmptyConceptCard`
5. 第 1711 行：`createConceptCardForReference`

**迁移模式**：
```typescript
// 旧代码
const card = createDefaultCard(blockId);
card.type = 'concept';
this.storage.setCard(card);

// 新代码
const success = await this.createConceptCardViaDDD(blockId, {
  priority: 'normal',
  metadata: { /* 特定元数据 */ },
});

if (!success) {
  // 降级：使用旧方法
  const card = createDefaultCard(blockId);
  card.type = 'concept';
  this.storage.setCard(card);
}
```

**测试**：
- [ ] 测试符号检测概念卡创建
- [ ] 测试引用概念卡创建
- [ ] 测试空概念卡创建
- [ ] 测试降级方案

## Phase 3: 迁移自动制卡（1 天）

### 3.1 迁移符号检测制卡

#### 任务 3.1.1：创建符号检测辅助方法
**文件**：`src/services/handlers/AutoCardHandler.ts`

```typescript
/**
 * 使用 CardApplicationService 创建符号检测卡
 */
private async createSymbolCardViaDDD(
  blockId: string,
  question: string,
  answer: string
): Promise<boolean> {
  try {
    const cardService = this.getCardService();
    if (!cardService) {
      return false;
    }

    // 创建临时块来存储问题和答案
    // 或者扩展 CreateCardCommand 支持文本字段
    const result = await cardService.createCard({
      blockIds: [blockId],
      templateId: 'builtin-symbol-qa',
      deckId: (await import('@/core/siyuan/riff')).riff.BUILTIN_DECK_ID,
      cardType: 'qa',
      metadata: {
        autoCreated: true,
        symbolDetected: true,
        source: 'symbol',
        question,
        answer,
      },
    });

    return result.ok;
  } catch (error) {
    console.error('[AutoCard] Error creating symbol card via DDD:', error);
    return false;
  }
}
```

#### 任务 3.1.2：迁移符号检测逻辑
**位置**：第 571 行

**测试**：
- [ ] 测试 `<>` 符号检测
- [ ] 测试问答卡创建
- [ ] 测试元数据保存

### 3.2 迁移双向卡片创建

#### 任务 3.2.1：扩展双向卡片模板
**文件**：`src/core/xiuyuan/templates/builtin.ts`

确保 `builtin-bidirectional` 模板存在并正确配置。

#### 任务 3.2.2：迁移双向卡片创建逻辑
**位置**：第 633 行（降级方案）

**测试**：
- [ ] 测试双向卡片创建
- [ ] 测试正向和反向卡片
- [ ] 测试字段映射

## Phase 4: 迁移 Card Builder（0.5 天）

### 4.1 废弃 Card Builder Strategies

#### 任务 4.1.1：标记为废弃
**文件**：
- `src/core/card-builder/strategies/DefaultStrategy.ts`
- `src/core/card-builder/strategies/QAStrategy.ts`
- `src/core/card-builder/strategies/ClozeStrategy.ts`

添加废弃注释：
```typescript
/**
 * @deprecated 使用 CardApplicationService 和 Xiuyuan 模板系统替代
 * 此策略将在下一个主版本中移除
 */
```

#### 任务 4.1.2：查找所有使用点
```bash
grep -r "DefaultStrategy\|QAStrategy\|ClozeStrategy" src/
```

#### 任务 4.1.3：迁移到模板系统

**测试**：
- [ ] 验证所有使用点已迁移
- [ ] 验证功能等价性

## Phase 5: 废弃 CardService（0.5 天）

### 5.1 查找所有 CardService 使用点

```bash
grep -r "CardService" src/ --exclude-dir=__tests__
```

### 5.2 迁移到 CardApplicationService

#### 任务 5.2.1：更新所有调用点

**迁移模式**：
```typescript
// 旧代码
const cardService = new CardService(plugin);
await cardService.createCard(blockId);

// 新代码
const cardService = plugin.context.getCardService();
await cardService.createCard({
  blockIds: [blockId],
  templateId: 'builtin-quick-card',
  deckId: riff.BUILTIN_DECK_ID,
});
```

### 5.3 删除 CardService

**文件**：`src/services/CardService.ts`

**测试**：
- [ ] 验证所有功能已迁移
- [ ] 运行所有测试
- [ ] 手动测试核心功能

## Phase 6: 清理旧代码（0.5 天）

### 6.1 移除 createDefaultCard 调用

#### 任务 6.1.1：搜索所有使用点
```bash
grep -r "createDefaultCard" src/ --exclude-dir=__tests__
```

#### 任务 6.1.2：逐个移除或迁移

**保留**：
- 测试文件中的 mock
- 类型定义文件

**移除**：
- 所有生产代码中的调用

### 6.2 移除直接 StorageManager 操作

#### 任务 6.2.1：搜索所有 setCard/removeCard 调用
```bash
grep -r "\.setCard\|\.removeCard" src/ --exclude-dir=__tests__
```

#### 任务 6.2.2：替换为 CardApplicationService

**迁移模式**：
```typescript
// 旧代码
storage.setCard(card);

// 新代码
await cardService.createCard({ /* ... */ });

// 旧代码
storage.removeCard(cardId);

// 新代码
await cardService.deleteCard({ cardId });
```

### 6.3 标记废弃的函数

**文件**：`src/types/card.ts`

```typescript
/**
 * @deprecated 使用 CardApplicationService.createCard() 替代
 * 此函数将在 v2.0.0 中移除
 */
export function createDefaultCard(blockId: string): FSRSCard {
  // ... 现有实现
}
```

## Phase 7: 统一数据存储（可选，1-2 天）

### 7.1 设计统一存储模型

#### 任务 7.1.1：分析数据关系

**当前**：
- `xiuyuan.msgpack`：Xiuyuan 聚合根
- `cards.msgpack`：FSRS 卡片

**目标**：
- 选项 A：合并到单一文件
- 选项 B：保持分离但建立明确关系
- 选项 C：使用关系型存储（如 SQLite）

**推荐**：选项 B（保持分离但建立明确关系）

### 7.2 实现数据迁移工具

#### 任务 7.2.1：创建迁移脚本
**文件**：`src/utils/migration/unify-storage.ts`

```typescript
export async function migrateToUnifiedStorage(
  plugin: any
): Promise<{ success: boolean; migratedCount: number }> {
  // 1. 读取所有 FSRS 卡片
  // 2. 识别哪些是 Xiuyuan 卡片
  // 3. 建立关联关系
  // 4. 验证数据完整性
  // 5. 保存迁移结果
}
```

### 7.3 更新查询逻辑

#### 任务 7.3.1：统一查询接口

**测试**：
- [ ] 测试数据迁移
- [ ] 测试查询性能
- [ ] 测试数据完整性

## 测试策略

### 单元测试
- [ ] 所有新增的用例测试
- [ ] 所有新增的领域服务测试
- [ ] 所有新增的模板测试

### 集成测试
- [ ] CardApplicationService 集成测试
- [ ] 端到端卡片创建测试
- [ ] 端到端卡片删除测试

### 回归测试
- [ ] 所有现有功能测试
- [ ] 性能测试
- [ ] 数据完整性测试

### 手动测试
- [ ] 概念卡创建和复习
- [ ] 符号检测制卡
- [ ] 双向卡片创建
- [ ] 快速制卡
- [ ] 模板卡片创建
- [ ] 卡片删除
- [ ] 卡片浏览器
- [ ] 复习功能

## 风险管理

### 高风险点
1. **数据丢失**：迁移过程中可能丢失卡片数据
   - 缓解：每步都备份数据
   - 缓解：实现回滚机制

2. **功能回归**：迁移后功能不工作
   - 缓解：充分的测试覆盖
   - 缓解：保留降级方案

3. **性能下降**：DDD 架构可能影响性能
   - 缓解：性能测试
   - 缓解：优化热点路径

### 回滚策略
每个 Phase 都应该：
1. 创建 Git 分支
2. 备份数据
3. 实现功能开关
4. 保留降级代码

## 时间估算

| Phase | 任务 | 估算时间 | 依赖 |
|-------|------|---------|------|
| Phase 1 | 扩展 DDD 架构 | 1-2 天 | - |
| Phase 2 | 迁移概念卡 | 1-2 天 | Phase 1 |
| Phase 3 | 迁移自动制卡 | 1 天 | Phase 1 |
| Phase 4 | 迁移 Card Builder | 0.5 天 | Phase 1 |
| Phase 5 | 废弃 CardService | 0.5 天 | Phase 2-4 |
| Phase 6 | 清理旧代码 | 0.5 天 | Phase 5 |
| Phase 7 | 统一数据存储（可选） | 1-2 天 | Phase 6 |
| **总计** | | **5-8 天** | |

## 里程碑

### Milestone 1: 架构扩展完成（Day 2）
- ✅ 所有内置模板创建完成
- ✅ CreateCardCommand 扩展完成
- ✅ CreateCardUseCase 扩展完成
- ✅ 单元测试通过

### Milestone 2: 概念卡迁移完成（Day 4）
- ✅ BlockMenuHandler 迁移完成
- ✅ AutoCardHandler 迁移完成
- ✅ 集成测试通过
- ✅ 手动测试通过

### Milestone 3: 自动制卡迁移完成（Day 5）
- ✅ 符号检测迁移完成
- ✅ 双向卡片迁移完成
- ✅ 测试通过

### Milestone 4: 旧代码清理完成（Day 6）
- ✅ CardService 废弃
- ✅ Card Builder 废弃
- ✅ createDefaultCard 标记废弃
- ✅ 所有测试通过

### Milestone 5: 完全统一（Day 8）
- ✅ 所有代码使用 DDD 架构
- ✅ 数据存储统一（可选）
- ✅ 文档更新完成
- ✅ 发布 v2.0.0

## 下一步行动

### 立即开始（今天）
1. 创建 Git 分支：`git checkout -b feature/complete-ddd-unification`
2. 备份当前数据
3. 开始 Phase 1.1：创建内置模板

### 本周目标
- 完成 Phase 1（扩展 DDD 架构）
- 完成 Phase 2（迁移概念卡）
- 达到 Milestone 2

### 下周目标
- 完成 Phase 3-6
- 达到 Milestone 4
- 准备发布

## 成功标准

### 功能标准
- [ ] 所有卡片创建使用 CardApplicationService
- [ ] 所有卡片删除使用 CardApplicationService
- [ ] 没有 createDefaultCard 调用（除了测试）
- [ ] 没有直接 StorageManager 操作（除了内部）

### 质量标准
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试覆盖率 > 60%
- [ ] 所有手动测试通过
- [ ] 性能无明显下降

### 文档标准
- [ ] 架构文档更新
- [ ] API 文档更新
- [ ] 迁移指南完成
- [ ] CHANGELOG 更新

## 总结

这是一个雄心勃勃的计划，需要 5-8 天的专注工作。但完成后，你将拥有：

✅ 完全统一的 DDD 架构
✅ 清晰的代码路径
✅ 更好的可维护性
✅ 完整的领域事件追踪
✅ 更容易扩展的系统

准备好开始了吗？我们从 Phase 1.1 开始！
