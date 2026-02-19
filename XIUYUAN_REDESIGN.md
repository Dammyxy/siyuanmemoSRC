# Xiuyuan 层重新设计方案

## 问题分析

### 当前实现的问题

1. **违背 Xiuyuan 设计初衷**：
   - Xiuyuan 的目标是"一个来源生成多张卡片"（类似 Anki 的 Note → Cards）
   - 但当前实现只生成 1 张卡片，使用块 ID 作为卡片 ID
   - 这导致无法真正实现"一对多"的关系

2. **与思源系统的冲突**：
   - 思源的约束：一个块只能有一个 `custom-riff-card-id` 属性
   - 当前实现：卡片 ID = 块 ID，所以一个块只能对应一张卡片
   - 这使得列表模版卡无法正常工作

3. **复习界面的假设**：
   - 复习界面假设 `card.blockId` 是要显示的内容块
   - 但对于 Xiuyuan 卡片，应该根据字段映射来决定显示哪些块

## 设计目标

1. **真正实现一对多关系**：一个 Xiuyuan 可以生成多张 FSRSCard
2. **卡片 ID 独立于块 ID**：卡片使用自己的唯一 ID，不依赖块 ID
3. **复习界面支持字段映射**：根据 frontFields/backFields 渲染对应的块
4. **向后兼容**：不影响现有的普通卡片

## 核心设计

### 1. 卡片 ID 生成策略

```typescript
// 旧方案（错误）
cardID = blockID  // ❌ 一个块只能有一张卡片

// 新方案（正确）
cardID = `xy_card_${xiuyuanID}_${ruleIndex}_${timestamp}`  // ✅ 独立的卡片 ID

// 示例：
// xy_card_xy_123_0_1771057760027  (Xiuyuan xy_123 的第 0 个规则生成的卡片)
// xy_card_xy_123_1_1771057760028  (Xiuyuan xy_123 的第 1 个规则生成的卡片)
```

### 2. FSRSCard 的 meta 结构

```typescript
interface XiuyuanCardMeta {
  // Xiuyuan 相关
  xiuyuanID: string;           // 所属的 Xiuyuan ID
  templateID: string;          // 使用的模板 ID
  ruleIndex: number;           // 使用的规则索引
  
  // 字段映射
  frontFields: string[];       // 正面字段名列表 ['question']
  backFields: string[];        // 背面字段名列表 ['answer']
  fieldMapping: Record<string, string>;  // 字段名 → 块 ID 的映射
  
  // 渲染信息（从 fieldMapping 计算得出）
  frontBlockIDs: string[];     // 正面要显示的块 ID 列表
  backBlockIDs: string[];      // 背面要显示的块 ID 列表
}

// 示例：列表模版卡
{
  xiuyuanID: 'xy_123',
  templateID: 'builtin-list-item',
  ruleIndex: 0,
  frontFields: ['question'],
  backFields: ['answer'],
  fieldMapping: {
    question: '20260214161434-qn5ocn6',  // 父列表项
    answer: '20260214161434-5e0a954'      // 子列表项1
  },
  frontBlockIDs: ['20260214161434-qn5ocn6'],  // 先显示父列表项
  backBlockIDs: ['20260214161434-5e0a954']    // 后显示子列表项1
}
```

### 3. 数据流

```
创建流程：
1. 用户选择块 + 模板
2. XiuyuanService.createFromBlocks()
   ├─ 创建 1 个 IXiuyuan（存储字段映射）
   └─ 根据 template.cardRules 创建 N 个 FSRSCard
      ├─ 每个 FSRSCard 有独立的 ID
      ├─ meta 中存储字段映射和渲染信息
      └─ blockId 指向"主块"（用于浏览器显示）

复习流程：
1. 队列返回 FSRSCard
2. Adapter 读取 card.meta
3. 根据 frontBlockIDs 渲染正面
4. 点击"显示答案"后，根据 backBlockIDs 渲染背面
```

### 4. 列表模版卡的实现

```typescript
// 创建列表模版卡
async function createListTemplateCards(parentBlockId: string, childBlockIds: string[]) {
  // 1. 创建 Xiuyuan（只创建一次）
  const xiuyuan = {
    id: 'xy_123',
    blockIDs: [parentBlockId, ...childBlockIds],
    fields: [
      { name: 'question', blockID: parentBlockId },
      { name: 'answer', blockID: '' }  // 答案字段会被每个子块覆盖
    ],
    templateID: 'builtin-list-item'
  };
  
  // 2. 为每个子块创建一张卡片
  for (let i = 0; i < childBlockIds.length; i++) {
    const childBlockId = childBlockIds[i];
    const cardID = `xy_card_${xiuyuan.id}_0_${Date.now()}_${i}`;
    
    const fsrsCard: FSRSCard = {
      id: cardID,  // ✅ 独立的卡片 ID
      blockId: childBlockId,  // 主块（用于浏览器显示）
      meta: {
        xiuyuanID: xiuyuan.id,
        templateID: 'builtin-list-item',
        ruleIndex: 0,
        frontFields: ['question'],
        backFields: ['answer'],
        fieldMapping: {
          question: parentBlockId,
          answer: childBlockId
        },
        frontBlockIDs: [parentBlockId],  // 先显示问题
        backBlockIDs: [childBlockId]     // 后显示答案
      }
    };
    
    // 保存卡片
    storageManager.setCard(fsrsCard);
  }
}
```

### 5. 复习界面的修改

```typescript
// ReviewContent.vue
// 当前实现（错误）
const mainBlockID = props.content.id;  // 直接使用 card.blockId
const answerBlockID = props.content.answerBlockID;

// 新实现（正确）
const meta = props.content.card?.meta;
const frontBlockIDs = meta?.frontBlockIDs || [props.content.id];
const backBlockIDs = meta?.backBlockIDs || [];

// 渲染正面：可能有多个块
for (const blockID of frontBlockIDs) {
  renderProtyle(blockID);
}

// 点击"显示答案"后，渲染背面
for (const blockID of backBlockIDs) {
  renderProtyle(blockID);
}
```

## 实现步骤

### Phase 1: 修改核心数据结构（不破坏现有功能）

1. ✅ 修改 `XiuyuanCardMeta` 类型定义
2. ✅ 修改 `XiuyuanService.createFromBlocks()` 生成独立的卡片 ID
3. ✅ 在 meta 中添加 `frontBlockIDs` 和 `backBlockIDs`
4. ✅ 保持向后兼容：如果没有 meta，使用 `card.blockId`

### Phase 2: 修改复习界面

1. ✅ 修改 `ReviewContent.vue` 支持多块渲染
2. ✅ 修改 Adapter 从 meta 中提取渲染信息
3. ✅ 删除 `xiuyuanHelper.ts`（不再需要 hack）

### Phase 3: 修改列表模版卡创建逻辑

1. ✅ 修改 `BlockMenuHandler.createListTemplateCards()`
2. ✅ 为每个子列表项创建独立的 FSRSCard
3. ✅ 测试：确保 3 张卡片都能正确创建和复习

### Phase 4: 清理和优化

1. ✅ 删除旧的 hack 代码
2. ✅ 更新文档
3. ✅ 添加单元测试

## 关键决策

### Q1: 卡片的 blockId 字段应该指向哪个块？

**决策**：指向"主块"，用于卡片浏览器显示。

- 对于列表模版卡：`blockId = childBlockId`（子列表项）
- 这样在卡片浏览器中，每张卡片显示不同的子列表项
- 但复习时，根据 `meta.frontBlockIDs` 先显示父列表项

### Q2: 是否需要在块上添加 `custom-riff-card-id` 属性？

**决策**：不需要。

- Xiuyuan 卡片的 ID 是独立生成的，不依赖块 ID
- 不需要在块上添加属性（避免与思源系统冲突）
- 通过 `meta.fieldMapping` 来关联块和卡片

### Q3: 如何处理卡片删除？

**决策**：删除 Xiuyuan 时，删除所有关联的 FSRSCard。

```typescript
async deleteXiuyuan(xiuyuanID: string) {
  // 1. 查找所有关联的卡片
  const cards = storageManager.getAllCards().filter(
    card => card.meta?.xiuyuanID === xiuyuanID
  );
  
  // 2. 删除所有卡片
  for (const card of cards) {
    storageManager.removeCard(card.id);
  }
  
  // 3. 删除 Xiuyuan
  xiuyuanStorage.deleteXiuyuan(xiuyuanID);
}
```

### Q4: 如何处理块被删除的情况？

**决策**：保持卡片，但标记为"孤儿卡片"。

- 复习时如果块不存在，显示错误提示
- 用户可以手动删除这些卡片
- 未来可以添加"清理孤儿卡片"功能

## 兼容性考虑

### 向后兼容

1. **现有的普通卡片**：
   - 没有 `meta.frontBlockIDs`，使用 `card.blockId`
   - 复习界面检查：`frontBlockIDs || [card.blockId]`

2. **现有的 Xiuyuan 卡片**（如果有）：
   - 可能只有 `meta.answerBlockID`，没有 `frontBlockIDs`
   - 需要迁移脚本或兼容逻辑

### 迁移策略

```typescript
// 在插件启动时，检查并迁移旧的 Xiuyuan 卡片
async function migrateOldXiuyuanCards() {
  const cards = storageManager.getAllCards();
  
  for (const card of cards) {
    if (card.meta?.xiuyuanID && !card.meta.frontBlockIDs) {
      // 旧的 Xiuyuan 卡片，需要迁移
      card.meta.frontBlockIDs = [card.blockId];
      card.meta.backBlockIDs = card.meta.answerBlockID 
        ? [card.meta.answerBlockID] 
        : [];
      
      storageManager.setCard(card);
    }
  }
  
  await storageManager.saveCards();
}
```

## 测试计划

### 单元测试

1. `XiuyuanService.createFromBlocks()` 生成正确数量的卡片
2. 卡片 ID 格式正确且唯一
3. meta 中的字段映射正确

### 集成测试

1. 创建列表模版卡，验证生成 3 张卡片
2. 复习列表模版卡，验证显示顺序正确
3. 删除 Xiuyuan，验证所有关联卡片被删除

### 手动测试

1. 创建列表模版卡
2. 在卡片浏览器中查看 3 张卡片
3. 复习每张卡片，验证问题和答案显示正确
4. 删除 Xiuyuan，验证卡片被删除

## 预期效果

### 创建后

```
卡片浏览器显示：
- 卡片 1: "可以优化复习时间（子级3）" [blockId = 子级3]
- 卡片 2: "FSRS 是一种间隔重复算法（子级1）" [blockId = 子级1]
- 卡片 3: "它基于记忆遗忘曲线（子级2）" [blockId = 子级2]
```

### 复习时

```
卡片 1 复习：
1. 显示正面：什么是 FSRS？（父列表项）
2. 点击"显示答案"
3. 显示背面：可以优化复习时间（子级3）
4. 评分

卡片 2 复习：
1. 显示正面：什么是 FSRS？（父列表项）
2. 点击"显示答案"
3. 显示背面：FSRS 是一种间隔重复算法（子级1）
4. 评分

卡片 3 复习：
1. 显示正面：什么是 FSRS？（父列表项）
2. 点击"显示答案"
3. 显示背面：它基于记忆遗忘曲线（子级2）
4. 评分
```

## 总结

这个重新设计方案：

1. ✅ 真正实现了 Xiuyuan 的"一对多"设计目标
2. ✅ 解决了与思源系统的冲突（卡片 ID 独立于块 ID）
3. ✅ 支持灵活的字段映射和多块渲染
4. ✅ 保持向后兼容
5. ✅ 为未来扩展打下基础（双向卡片、填空卡片等）

下一步：开始实现 Phase 1。
