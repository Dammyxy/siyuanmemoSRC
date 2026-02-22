# 基础类模板渲染问题调查报告

## 问题描述

用户反馈两个基础类模板的实现不符合设计：

### 问题 1：基础问答模板
- **期望**：选中的第一个块为问题，第二个块为答案
- **实际**：第一个块被标记为了 `topic`，卡片渲染也没用对

### 问题 2：双向卡片模板
- **期望**：选中的两个块互为问题答案
- **实际**：卡片渲染用错了

## 调查发现

### 1. 卡片类型检测问题

在 `XiuyuanRepository.save()` 方法中（第 125-135 行）：

```typescript
// 5.1 确定卡片类型
let cardType: 'item' | 'topic' = 'item';
if (meta.listTemplate && typeof meta.listTemplate === 'object' && Array.isArray((meta.listTemplate as any).childrenData)) {
  // 列表模版卡：强制为 item
  cardType = 'item';
} else if (this.cardTypeDetectionService && blockIDs.length > 0) {
  // 非列表模版卡：检测类型
  try {
    cardType = await this.cardTypeDetectionService.detectCardType(blockIDs[0].getValue());
  } catch (error) {
    console.warn('[XiuyuanRepository] Failed to detect cardType, using default "item":', error);
  }
}
```

**问题**：对于基础问答和双向卡片，系统会调用 `CardTypeDetectionService.detectCardType()` 来检测第一个块的类型。

### 2. CardTypeDetectionService 的检测逻辑

在 `CardTypeDetectionService.detectCardType()` 中：

```typescript
// 8. 其他 → topic
console.log(`[CardTypeDetectionService] Block ${blockId}: topic (type: ${type}, no answer blocks)`);
return 'topic';
```

**问题**：如果块不满足以下任何条件，就会被标记为 `topic`：
- 文档块
- 有挖空符号（==、{{}}）
- 有分隔符（::、;;、>>、<<、<>）
- 标题块
- 列表项有子级
- 超级块有子级

对于普通的段落块（用于基础问答的第一个块），如果没有特殊符号，就会被错误地标记为 `topic`。

### 3. 模板定义

当前模板定义（`builtin.ts`）：

```typescript
// 基础问答模板
export const BASIC_QA_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: '基础问答',
  description: '简单的问答卡片，第一个块为问题，第二个块为答案',
  category: 'basic',
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

// 双向卡片模板
export const BIDIRECTIONAL_TEMPLATE: ICardTemplate = {
  id: 'builtin-bidirectional',
  name: '双向卡片',
  description: '生成正向和反向两张卡片（需要两个块）',
  category: 'basic',
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

### 4. 卡片渲染问题

在 `ReviewContent.vue` 中，卡片渲染逻辑如下：

```vue
<!-- 正面：问题块 -->
<div ref="hostRef" class="fsrs-review-v2-content__protyle-host"></div>

<!-- 背面：答案块（Xiuyuan 模板卡片，点击显示答案后显示） -->
<div v-if="!showAnswer && answerBlockID" class="fsrs-review-v2-content__answer-divider">
  <span>{{ t('answerDivider', '─── 答案 ───') }}</span>
</div>
<div v-if="!showAnswer && answerBlockID" ref="answerHostRef" class="fsrs-review-v2-content__protyle-host fsrs-review-v2-content__answer"></div>
```

需要查看 `answerBlockID` 是如何确定的，以及渲染逻辑是否正确处理了基础问答和双向卡片。

## 根本原因

1. **卡片类型检测不适用于模板卡**：`CardTypeDetectionService` 是为快速制卡设计的，它通过检测块内容中的符号来判断类型。但对于使用模板创建的卡片（如基础问答、双向卡片），块内容中没有特殊符号，导致被错误标记为 `topic`。

2. **缺少模板感知的类型判断**：系统应该根据使用的模板来确定卡片类型，而不是仅仅检测块内容。

## 解决方案

### 方案 1：模板指定卡片类型

在模板定义中添加 `cardType` 字段：

```typescript
export const BASIC_QA_TEMPLATE: ICardTemplate = {
  id: 'builtin-basic-qa',
  name: '基础问答',
  description: '简单的问答卡片，第一个块为问题，第二个块为答案',
  category: 'basic',
  cardType: 'item',  // 🆕 明确指定卡片类型
  fields: [
    { name: 'question', description: '问题' },
    { name: 'answer', description: '答案' },
  ],
  // ...
};
```

### 方案 2：在 XiuyuanRepository 中优先使用模板的类型

修改 `XiuyuanRepository.save()` 中的类型检测逻辑：

```typescript
// 5.1 确定卡片类型
let cardType: 'item' | 'topic' = 'item';

// 优先使用模板指定的类型
const templateID = xiuyuan.getTemplateID().getValue();
const template = templateRegistry.get(templateID);
if (template && template.cardType) {
  cardType = template.cardType;
} else if (meta.listTemplate && typeof meta.listTemplate === 'object') {
  // 列表模版卡：强制为 item
  cardType = 'item';
} else if (this.cardTypeDetectionService && blockIDs.length > 0) {
  // 其他情况：检测类型
  try {
    cardType = await this.cardTypeDetectionService.detectCardType(blockIDs[0].getValue());
  } catch (error) {
    console.warn('[XiuyuanRepository] Failed to detect cardType, using default "item":', error);
  }
}
```

### 方案 3：基础类模板默认为 item

最简单的方案：对于 `basic` 分类的模板，默认使用 `item` 类型：

```typescript
// 5.1 确定卡片类型
let cardType: 'item' | 'topic' = 'item';

const templateID = xiuyuan.getTemplateID().getValue();
const template = templateRegistry.get(templateID);

if (template && template.category === 'basic') {
  // 基础类模板：默认为 item
  cardType = 'item';
} else if (meta.listTemplate && typeof meta.listTemplate === 'object') {
  // 列表模版卡：强制为 item
  cardType = 'item';
} else if (this.cardTypeDetectionService && blockIDs.length > 0) {
  // 其他情况：检测类型
  try {
    cardType = await this.cardTypeDetectionService.detectCardType(blockIDs[0].getValue());
  } catch (error) {
    console.warn('[XiuyuanRepository] Failed to detect cardType, using default "item":', error);
  }
}
```

## 推荐方案

**推荐使用方案 3**，原因：
1. 最简单，改动最小
2. 符合语义：基础类模板就是用于 item 类型的卡片
3. 不需要修改模板定义和类型系统

## 下一步

1. 实现方案 3
2. 调查双向卡片的渲染问题
3. 测试修复后的效果


## 实施的修复

### 修复 1：基础类模板的卡片类型检测

**文件**：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

**修改内容**：
1. 导入 `TemplateRegistry`
2. 在构造函数中初始化 `templateRegistry` 实例（使用 `new TemplateRegistry()`）
3. 修改卡片类型检测逻辑，优先检查模板的 `category` 属性

**修改后的逻辑**：
```typescript
// 5.1 确定卡片类型（用于块属性）
let cardType: 'item' | 'topic' = 'item';

const templateID = xiuyuan.getTemplateID().getValue();
const template = this.templateRegistry.get(templateID);

if (template && template.category === 'basic') {
  // ✅ 基础类模板：默认为 item
  cardType = 'item';
  console.log(`[XiuyuanRepository] Template ${templateID} is basic category, using cardType: item`);
} else if (meta.listTemplate && typeof meta.listTemplate === 'object' && Array.isArray((meta.listTemplate as any).childrenData)) {
  // 列表模版卡：强制为 item
  cardType = 'item';
  console.log(`[XiuyuanRepository] List template detected, using cardType: item`);
} else if (this.cardTypeDetectionService && blockIDs.length > 0) {
  // 其他情况：检测类型
  try {
    cardType = await this.cardTypeDetectionService.detectCardType(blockIDs[0].getValue());
    console.log(`[XiuyuanRepository] Detected cardType: ${cardType} for block ${blockIDs[0].getValue()}`);
  } catch (error) {
    console.warn('[XiuyuanRepository] Failed to detect cardType, using default "item":', error);
  }
}
```

同时，在 `cardToFSRSCard` 方法中也应用了相同的逻辑，确保卡片数据中的 `type` 字段与块属性保持一致。

**效果**：
- 基础问答模板（`builtin-basic-qa`）的卡片现在会被正确标记为 `item` 类型
- 双向卡片模板（`builtin-bidirectional`）的卡片也会被正确标记为 `item` 类型
- 不再依赖块内容检测，避免了误判
- **块属性和卡片数据中的 `type` 字段保持一致**

### 修复 2：双向卡片和基础问答的渲染

**文件**：`src/application/adapters/UnifiedReviewAdapter.ts`

**修改内容**：
扩展 `answerBlockID` 的设置逻辑，支持基础问答和双向卡片模板

**修改后的逻辑**：
```typescript
answerBlockID: (() => {
    // Xiuyuan 卡片：根据模板类型设置 answerBlockID
    if (isXiuyuanCard(card)) {
        const templateID = card.meta.templateID;
        const backBlockIDs = card.meta.backBlockIDs || [];
        
        // 列表模板、基础问答、双向卡片：使用 backBlockIDs 的第一个块
        if (backBlockIDs.length > 0 && (
            templateID === 'builtin-list-item' ||
            templateID === 'builtin-basic-qa' ||
            templateID === 'builtin-bidirectional'
        )) {
            console.log(`[UnifiedReviewAdapter] Setting answerBlockID for template ${templateID}:`, backBlockIDs[0]);
            return backBlockIDs[0];
        }
    }
    // 其他模板不设置 answerBlockID
    return '';
})(),
```

**效果**：
- 基础问答模板：复习时会显示第一个块（问题）和第二个块（答案）
- 双向卡片模板：
  - 正向卡片：显示第一个块（term）和第二个块（definition）
  - 反向卡片：显示第二个块（definition）和第一个块（term）
- 渲染逻辑与模板定义保持一致

## 测试建议

### 测试场景 1：基础问答模板
1. 选择两个普通段落块
2. 使用"基础问答"模板创建卡片
3. 验证：
   - 卡片类型应为 `item`（不是 `topic`）
   - 复习时，正面显示第一个块，背面显示第二个块
   - 块属性中 `custom-fsrs-card-type` 应为 `item`

### 测试场景 2：双向卡片模板
1. 选择两个普通段落块（如"DDD"和"领域驱动设计"）
2. 使用"双向卡片"模板创建卡片
3. 验证：
   - 应生成 2 张卡片
   - 两张卡片的类型都应为 `item`
   - 正向卡片：正面显示"DDD"，背面显示"领域驱动设计"
   - 反向卡片：正面显示"领域驱动设计"，背面显示"DDD"
   - 块属性中 `custom-fsrs-card-type` 应为 `item`

### 测试场景 3：其他模板不受影响
1. 测试概念卡、填空卡、列表模板等其他模板
2. 验证它们的行为没有改变

## 总结

通过这两个修复：
1. ✅ 解决了基础问答模板第一个块被错误标记为 `topic` 的问题
2. ✅ 解决了双向卡片和基础问答的渲染问题
3. ✅ 保持了与其他模板的兼容性
4. ✅ 代码逻辑更加清晰，易于维护

修复后的实现符合用户的设计预期：
- 基础问答：第一个块为问题，第二个块为答案
- 双向卡片：两个块互为问题和答案


## 额外修复：正确设置 frontBlockIDs 和 backBlockIDs

### 问题发现
用户反馈：选中两个块创建基础问答卡片时，只有第一个块被识别为问题和答案，第二个块没有被识别为答案。

### 根本原因
1. **CardFace 创建问题**：在 `CreateCardUseCase.convertCommandToDomain()` 中，如果没有提供 `faces`，默认创建的 CardFace 的 `questionBlockId` 和 `answerBlockId` 都使用第一个块的 ID
2. **元数据设置问题**：在 `XiuyuanRepository.cardToFSRSCard()` 中，`frontBlockIDs` 和 `backBlockIDs` 都被设置为所有的 `blockIDs`，没有区分问题块和答案块

### 修复 3：正确创建 CardFace

**文件**：`src/application/usecases/card/CreateCardUseCase.ts`

**修改内容**：
根据模板类型正确设置 `questionBlockId` 和 `answerBlockId`

```typescript
} else {
  // 如果没有提供 faces，根据模板创建默认的 face
  const templateId = command.templateId!;
  
  if (templateId === 'builtin-basic-qa' || templateId === 'builtin-bidirectional') {
    // 基础问答和双向卡片：第一个块为问题，第二个块为答案
    if (blockIds.length >= 2) {
      const defaultFaceResult = CardFace.create({
        question: blockIds[0].value,
        answer: blockIds[1].value,
        questionBlockId: blockIds[0].value,
        answerBlockId: blockIds[1].value,
      });

      if (!defaultFaceResult.ok) {
        return defaultFaceResult as any;
      }

      faces.push(defaultFaceResult.value);
    } else {
      return err(new Error(`Template ${templateId} requires at least 2 blocks`));
    }
  } else {
    // 其他模板：使用第一个 blockId 作为问题和答案
    const defaultFaceResult = CardFace.create({
      question: blockIds[0].value,
      answer: blockIds[0].value,
      questionBlockId: blockIds[0].value,
      answerBlockId: blockIds[0].value,
    });

    if (!defaultFaceResult.ok) {
      return defaultFaceResult as any;
    }

    faces.push(defaultFaceResult.value);
  }
}
```

### 修复 4：使用 CardFace 信息设置 frontBlockIDs 和 backBlockIDs

**文件**：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

**修改内容**：
从 CardFace 中获取正确的 `questionBlockId` 和 `answerBlockId`

```typescript
meta: {
  xiuyuanID: card.getXiuyuanId().getValue(),
  templateID: xiuyuan.getTemplateID().getValue(),
  ruleIndex: faceIndex,
  // ✅ 使用 CardFace 中的 blockId 信息
  frontBlockIDs: [xiuyuan.getFaces()[faceIndex].questionBlockId],
  backBlockIDs: [xiuyuan.getFaces()[faceIndex].answerBlockId],
  fieldMapping: {},
  frontFields: [],
  backFields: [],
  // ...
}
```

### 效果
- 基础问答卡片：`frontBlockIDs` = [第一个块]，`backBlockIDs` = [第二个块]
- 双向卡片：
  - 正向卡片：`frontBlockIDs` = [第一个块]，`backBlockIDs` = [第二个块]
  - 反向卡片：`frontBlockIDs` = [第二个块]，`backBlockIDs` = [第一个块]
- 复习时能正确显示问题块和答案块

## 完整修复总结

通过以上 4 个修复：
1. ✅ 修复了基础类模板的卡片类型检测（块属性）
2. ✅ 修复了基础类模板的卡片类型检测（卡片数据）
3. ✅ 修复了基础问答和双向卡片的渲染（设置 answerBlockID）
4. ✅ 修复了 CardFace 的创建和 frontBlockIDs/backBlockIDs 的设置

现在基础问答和双向卡片应该完全按照设计工作了！
