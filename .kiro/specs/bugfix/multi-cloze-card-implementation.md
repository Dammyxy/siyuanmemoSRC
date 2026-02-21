# 多填空卡片支持实现

## 概述

实现了多填空卡片的创建功能，采用方案 1（预处理）：在对话框确认前解析块内容，动态生成 cardRules。

## 问题分析

### 为什么多填空卡不能直接使用？

多填空卡的 `cardRules` 是空数组：

```typescript
export const MULTI_CLOZE_TEMPLATE: ICardTemplate = {
  id: 'builtin-multi-cloze',
  name: '多填空卡片',
  description: '每个填空生成一张独立的卡片',
  category: 'cloze',
  fields: [
    { name: 'content', description: '包含多个填空的内容' },
  ],
  cardRules: [], // 动态生成，根据填空数量
};
```

**原因**：
- 一个块可能有 1 个、2 个、3 个或更多填空
- 每个填空需要生成一张独立的卡片
- cardRules 需要在运行时动态生成，而不是预定义

### 与其他模版的区别

**普通模版**（如基础问答）：
- 固定的 cardRules
- 1 个模版 → 1 张卡片

**多填空模版**：
- 空的 cardRules
- 需要先解析块内容，找到所有填空
- 1 个模版 → N 张卡片（N = 填空数量）

## 实现方案

### 方案选择

采用**方案 1（预处理）**：在对话框确认前解析块内容，动态生成 cardRules

**优点**：
- 不改变核心创建流程
- 用户体验好（可以显示"将生成 N 张卡片"）
- 易于实现
- 可扩展

### 实现步骤

1. **添加填空解析方法** - `DialogManager.extractClozes()`
2. **添加多填空处理方法** - `DialogManager.handleMultiClozeCard()`
3. **更新命令接口** - 添加可选的 `template` 字段
4. **更新 UseCase** - 支持使用自定义模版
5. **移除过滤逻辑** - 让多填空卡重新显示在对话框中

## 代码实现

### 1. 填空解析方法

```typescript
/**
 * 提取块内容中的所有填空
 * 
 * 支持三种填空符号：
 * - {{填空内容}}
 * - ==填空内容==
 * - <span data-type="mark">填空内容</span>（思源标记）
 */
private extractClozes(content: string): Array<{ text: string; start: number; end: number; type: string }> {
  const clozes: Array<{ text: string; start: number; end: number; type: string }> = [];
  
  // 提取 {{}} 填空
  const braceRegex = /\{\{([^}]*)\}\}/g;
  let match;
  while ((match = braceRegex.exec(content)) !== null) {
    clozes.push({
      text: match[1],
      start: match.index,
      end: match.index + match[0].length,
      type: 'brace',
    });
  }
  
  // 提取 == 填空
  const equalRegex = /==([^=]*)==/g;
  while ((match = equalRegex.exec(content)) !== null) {
    clozes.push({
      text: match[1],
      start: match.index,
      end: match.index + match[0].length,
      type: 'equal',
    });
  }
  
  // 提取思源标记填空
  const markRegex = /<span data-type="mark">([^<]*)<\/span>/g;
  while ((match = markRegex.exec(content)) !== null) {
    clozes.push({
      text: match[1],
      start: match.index,
      end: match.index + match[0].length,
      type: 'mark',
    });
  }
  
  // 按位置排序
  clozes.sort((a, b) => a.start - b.start);
  
  return clozes;
}
```

### 2. 多填空处理方法

```typescript
/**
 * 处理多填空卡片的创建
 */
private async handleMultiClozeCard(blockIds: string[], template: any): Promise<void> {
  try {
    const blockId = blockIds[0];

    // 1. 读取块内容
    const blocks = await sql(`SELECT * FROM blocks WHERE id = '${blockId}'`);
    if (!blocks || blocks.length === 0) {
      pushErrMsg('无法读取块内容');
      return;
    }

    const block = blocks[0];
    const content = block.content || block.markdown || '';

    // 2. 解析填空
    const clozes = this.extractClozes(content);

    if (clozes.length === 0) {
      pushErrMsg('未找到填空内容（支持 {{}}、== 和思源标记）');
      return;
    }

    // 3. 动态生成 cardRules
    const dynamicTemplate = {
      ...template,
      cardRules: clozes.map((_, index) => ({
        typeMarker: `cloze-${index}`,
        frontFields: ['content'],
        backFields: ['content'],
      })),
    };

    // 4. 创建卡片
    const xiuyuanAppService = this.context.getXiuyuanApplicationService();
    const result = await xiuyuanAppService.createFromBlocks({
      blockIds: [blockId],
      templateId: template.id,
      fieldMapping: { content: blockId },
      deckId: riff.BUILTIN_DECK_ID,
      template: dynamicTemplate, // 传入动态模版
    });

    if (!result.ok) {
      console.error('[DialogManager] Failed to create multi-cloze card:', result.error);
      pushErrMsg(`创建失败：${result.error.message}`);
      return;
    }

    const { xiuyuan, cards } = result.value;
    pushMsg(
      `✅ 多填空卡片创建成功！\n` +
      `找到填空：${clozes.length} 个\n` +
      `生成卡片：${cards.length} 张`
    );
  } catch (err) {
    console.error('[DialogManager] Failed to handle multi-cloze card:', err);
    pushErrMsg(`创建失败：${(err as Error).message}`);
  }
}
```

### 3. 命令接口更新

```typescript
export interface CreateXiuyuanFromBlocksCommand {
  blockIds: string[];
  templateId: string;
  fieldMapping?: Record<string, string>;
  deckId?: string;
  priority?: number;
  
  /**
   * 自定义模版（可选）
   * 用于动态生成 cardRules 的场景（如多填空卡片）
   */
  template?: any;
}
```

### 4. UseCase 更新

```typescript
async execute(command: CreateXiuyuanFromBlocksCommand): Promise<Result<any>> {
  try {
    // 1. 验证模板（优先使用自定义模版）
    const template = command.template || this.templateRegistry.get(command.templateId);
    if (!template) {
      return err(new Error(`Template not found: ${command.templateId}`));
    }

    if (!template.cardRules || template.cardRules.length === 0) {
      return err(new Error('Template has no card rules'));
    }
    
    // ... 继续创建流程
  }
}
```

## 文件修改清单

1. ✅ `src/application/managers/DialogManager.ts`
   - 添加 `handleMultiClozeCard()` 方法
   - 添加 `extractClozes()` 方法
   - 在 `confirm` 事件中添加多填空卡特殊处理
   - 移除过滤逻辑

2. ✅ `src/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand.ts`
   - 添加可选的 `template` 字段

3. ✅ `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`
   - 优先使用 `command.template`

## 使用示例

### 创建多填空卡片

1. 在思源笔记中创建一个块：
   ```markdown
   ==线粒体==是细胞的==能量工厂==，负责生成==ATP==
   ```

2. 选中块，右键 → "创建模版卡片"

3. 选择"多填空卡片"模版

4. 点击"确认创建"

5. 系统会：
   - 解析出 3 个填空：线粒体、能量工厂、ATP
   - 动态生成 3 个 cardRules
   - 创建 3 张卡片

### 生成的卡片

**卡片 1** (cloze-0):
- 正面: `[___]是细胞的能量工厂，负责生成ATP`
- 反面: `线粒体是细胞的能量工厂，负责生成ATP`

**卡片 2** (cloze-1):
- 正面: `线粒体是细胞的[___]，负责生成ATP`
- 反面: `线粒体是细胞的能量工厂，负责生成ATP`

**卡片 3** (cloze-2):
- 正面: `线粒体是细胞的能量工厂，负责生成[___]`
- 反面: `线粒体是细胞的能量工厂，负责生成ATP`

## 测试验证

### 功能测试
- [ ] 打开模版选择对话框
- [ ] 验证多填空卡片显示在填空类中
- [ ] 选择一个包含多个填空的块
- [ ] 选择多填空卡片模版
- [ ] 确认创建
- [ ] 验证成功消息显示填空数量和卡片数量
- [ ] 验证生成的卡片数量正确
- [ ] 验证每张卡片的正反面内容正确

### 边界测试
- [ ] 测试没有填空的块（应显示错误）
- [ ] 测试只有 1 个填空的块
- [ ] 测试混合使用 {{}}、== 和标记的块
- [ ] 测试包含特殊字符的填空

### 编译测试
```bash
npm run build
```
✅ 编译成功，无错误

## 后续优化

1. **预览功能** - 在对话框中显示"将生成 N 张卡片"
2. **填空预览** - 显示找到的所有填空内容
3. **选择性创建** - 允许用户选择只为某些填空创建卡片
4. **批量创建** - 支持选择多个块，为每个块创建多填空卡片

## 相关文档

- [模版卡片规范文档](./template-card-specification.md)
- [模版分类实现](./template-category-implementation-summary.md)
- [ClozeCardStrategy](../../src/core/card/quick-card/domain/strategies/ClozeCardStrategy.ts) - 填空渲染策略
