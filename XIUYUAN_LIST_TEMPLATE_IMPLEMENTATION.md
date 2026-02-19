# Xiuyuan 列表项模版卡实现方案

## 需求描述

当用户对一个列表项块使用"快速制卡"功能时，如果该列表项块有多个子级列表项块，则自动识别为 Xiuyuan 模版卡，生成多张卡片：
- 父列表项块内容 = 问题（正面）
- 每个子级列表项块 = 一张独立卡片的答案（背面）

## 示例

```markdown
- 什么是 FSRS？（父列表项，blockId: parent-123）
  - FSRS 是一种间隔重复算法（子级1，blockId: child-1）
  - 它基于记忆遗忘曲线（子级2，blockId: child-2）
  - 可以优化复习时间（子级3，blockId: child-3）
```

生成结果：
- 3张卡片
- 卡片1：正面="什么是 FSRS？" 背面="FSRS 是一种间隔重复算法"
- 卡片2：正面="什么是 FSRS？" 背面="它基于记忆遗忘曲线"
- 卡片3：正面="什么是 FSRS？" 背面="可以优化复习时间"

## 技术实现

### 1. 创建默认列表项模版

在 `src/core/xiuyuan/templates.ts` 中添加：

```typescript
export const LIST_ITEM_TEMPLATE: ICardTemplate = {
  id: 'list-item',
  name: '列表项模版',
  description: '父列表项作为问题，每个子列表项作为独立答案',
  fields: [
    { name: 'question', description: '问题（父列表项）' },
    { name: 'answer', description: '答案（子列表项）' }
  ],
  cardRules: [
    {
      typeMarker: 'list-qa',
      frontFields: ['question'],
      backFields: ['answer']
    }
  ]
};
```

### 2. 修改 TransactionObserver

在 `src/core/box/TransactionObserver.ts` 的 `checkAndCreateCard` 方法中添加列表项检测逻辑：

```typescript
// 在添加到 Riff Deck 之后，检查是否为列表项模版卡
if (isRiffInDb || !hasRiffAttr) {
  // 检测是否为列表项块且有子级列表项
  const isListTemplate = await this.checkListTemplate(blockId);
  
  if (isListTemplate) {
    console.log(`[SiyuanMemo] Detected list template card: ${blockId}`);
    await this.createListTemplateCards(blockId);
    return; // 已处理，跳过常规流程
  }
}
```

### 3. 实现检测和创建方法

```typescript
/**
 * 检查块是否为列表项模版卡
 * - 块类型必须是列表项（type='i'）
 * - 必须有至少2个子级列表项块
 */
private async checkListTemplate(blockId: string): Promise<boolean> {
  try {
    // 1. 检查块类型
    const typeResult = await sql(`
      SELECT type FROM blocks
      WHERE id = '${blockId}'
      LIMIT 1
    `);
    
    if (!typeResult || typeResult.length === 0 || typeResult[0].type !== 'i') {
      return false;
    }
    
    // 2. 检查子级列表项数量
    const childrenResult = await sql(`
      SELECT id FROM blocks
      WHERE parent_id = '${blockId}'
      AND type = 'i'
      AND type != 'd'
    `);
    
    return childrenResult && childrenResult.length >= 2;
  } catch (err) {
    console.error(`[SiyuanMemo] Failed to check list template:`, err);
    return false;
  }
}

/**
 * 创建列表项模版卡
 */
private async createListTemplateCards(parentBlockId: string): Promise<void> {
  try {
    // 1. 获取所有子级列表项
    const childrenResult = await sql(`
      SELECT id FROM blocks
      WHERE parent_id = '${parentBlockId}'
      AND type = 'i'
      AND type != 'd'
      ORDER BY id ASC
    `);
    
    if (!childrenResult || childrenResult.length < 2) {
      console.warn(`[SiyuanMemo] Not enough children for list template: ${parentBlockId}`);
      return;
    }
    
    const childBlockIds = childrenResult.map((row: any) => row.id);
    
    // 2. 为每个子级创建 Xiuyuan 卡片
    for (const childBlockId of childBlockIds) {
      const blockIds = [parentBlockId, childBlockId];
      const fieldMapping = {
        question: parentBlockId,
        answer: childBlockId
      };
      
      const result = await this.plugin.xiuyuanService.createFromBlocks(
        blockIds,
        'list-item',
        fieldMapping,
        BUILTIN_DECK_ID
      );
      
      if (result.ok) {
        console.log(`[SiyuanMemo] Created list template card: ${result.value.xiuyuan.id}`);
      } else {
        console.error(`[SiyuanMemo] Failed to create list template card:`, result.error);
      }
    }
    
    console.log(`[SiyuanMemo] Created ${childBlockIds.length} list template cards for parent: ${parentBlockId}`);
  } catch (err) {
    console.error(`[SiyuanMemo] Failed to create list template cards:`, err);
  }
}
```

### 4. 修改 XiuyuanService.createFromBlocks

需要修改以支持生成多张卡片（目前只生成1张）：

```typescript
// 当前实现：只使用第一个块
const mainBlockID = blockIDs[0];
const rule = template.cardRules[0];

// 修改为：使用第一个块作为卡片ID（思源限制）
// 但在 meta 中存储完整的字段映射
```

### 5. 注册列表项模版

在插件初始化时注册模版：

```typescript
// src/index.ts
import { LIST_ITEM_TEMPLATE } from '@/core/xiuyuan/templates';

// 在 onload() 中
this.xiuyuanService.createTemplate(LIST_ITEM_TEMPLATE);
```

## 实现步骤

1. ✅ 创建 `src/core/xiuyuan/templates.ts` 文件，定义 LIST_ITEM_TEMPLATE
2. ✅ 在 TransactionObserver 中添加 checkListTemplate 和 createListTemplateCards 方法
3. ✅ 修改 checkAndCreateCard 方法，添加列表项检测逻辑
4. ✅ 在插件初始化时注册列表项模版
5. ✅ 测试功能

## 注意事项

1. 思源的限制：一个块只能对应一张 Riff 卡片，所以我们使用父列表项作为卡片ID
2. 子级列表项不会被标记为独立的 Riff 卡片，而是作为 Xiuyuan 的字段存储
3. 在复习界面需要特殊处理，根据 Xiuyuan 的 mapping 渲染正确的答案块

## 测试场景

1. 创建一个列表项块，添加2个子级列表项
2. 对父列表项使用"快速制卡"
3. 验证生成了2张卡片
4. 在复习界面验证每张卡片显示正确的问题和答案
