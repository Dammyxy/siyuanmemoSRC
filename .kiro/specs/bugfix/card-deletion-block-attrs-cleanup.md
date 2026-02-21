# 卡片删除时块属性残留问题分析

## 问题描述

用户反馈：
- 思源原生的【移除卡片】
- 插件的【取消闪卡】

两个功能都无法完全清理块属性，`custom-card-type` 等属性仍然残留。

## 根本原因

### 1. 思源原生 `removeRiffCards` API 的行为

查看 `/api/riff/removeRiffCards` 的实现：

```typescript
// src/core/siyuan/riff.ts
export async function removeRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return request('/riff/removeRiffCards', { deckID, blockIDs });
}
```

**关键发现**：
- 思源的 `removeRiffCards` API 会删除 `custom-riff-*` 属性（如 `custom-riff-decks`）
- **但不会删除插件自定义的属性**（如 `custom-card-type`, `custom-xiuyuan-id` 等）
- 这是思源的设计行为：只清理思源原生的闪卡属性

### 2. 插件的 `DeleteFSRSCardUseCase` 实现

```typescript
// src/application/usecases/card/DeleteFSRSCardUseCase.ts
async execute(command: DeleteFSRSCardCommand): Promise<Result<DeleteFSRSCardCommandResult>> {
  try {
    // 1. 检查卡片是否存在
    const card = this.storage.getCard(command.cardId);
    if (!card) {
      return ok({ deleted: false });
    }
    
    // 2. 删除本地卡片
    this.storage.deleteCard(command.cardId);
    await this.storage.saveCards();
    
    // 3. 可选：从 Riff 删除
    if (command.deleteFromRiff && card.blockId) {
      await removeRiffCards([card.blockId]);  // ❌ 参数错误！缺少 deckID
    }
    
    return ok({ deleted: true });
  } catch (error) {
    return err(error);
  }
}
```

**问题**：
1. ❌ `removeRiffCards` 调用参数错误：缺少 `deckID` 参数
2. ❌ `removeRiffCards` 只删除 `custom-riff-*` 属性
3. ❌ **没有删除插件自定义的块属性**（`custom-card-type`, `custom-xiuyuan-id` 等）

## 需要删除的块属性

根据代码分析，创建卡片时会设置以下块属性：

### 1. 思源原生属性（removeRiffCards 会自动删除）

```typescript
// Riff 卡包（思源原生）
'custom-riff-decks': '20230218211946-2kw8jgx'  // ✅ removeRiffCards 会删除
```

### 2. 插件自定义属性（需要手动删除）

```typescript
// 卡片类型
'custom-card-type': 'topic' | 'item' | 'concept' | 'descriptor'  // ❌ 需要手动删除

// 卡片类型标记（concept/descriptor）
'custom-fsrs-card-type': 'concept' | 'descriptor'  // ❌ 需要手动删除
```

### 3. Xiuyuan 卡片特有属性（需要手动删除）

```typescript
// Xiuyuan ID
'custom-xiuyuan-id': 'xy_xxx'  // ❌ 需要手动删除

// 模板 ID
'custom-template-id': 'template_xxx'  // ❌ 需要手动删除

// 列表模板标记
'custom-list-template': 'true'  // ❌ 需要手动删除
```

### 4. 其他可能的属性（需要手动删除）

```typescript
// 优先级
'custom-priority': '1' | '2' | '3'  // ❌ 需要手动删除

// A-Factor（已废弃，但可能存在旧数据）
'custom-fsrs-a-factor': 'xxx'  // ❌ 需要手动删除
```

## 解决方案

### 方案 1：在 DeleteFSRSCardUseCase 中删除块属性（推荐）

**优点**：
- 集中处理，逻辑清晰
- 符合 DDD 用例模式
- 易于测试和维护

**实现**：

```typescript
// src/application/usecases/card/DeleteFSRSCardUseCase.ts
import { setBlockAttrs } from '@/core/siyuan/api';

async execute(command: DeleteFSRSCardCommand): Promise<Result<DeleteFSRSCardCommandResult>> {
  try {
    // 1. 检查卡片是否存在
    const card = this.storage.getCard(command.cardId);
    if (!card) {
      return ok({ deleted: false });
    }
    
    // 2. 删除本地卡片
    this.storage.deleteCard(command.cardId);
    await this.storage.saveCards();
    
    // 3. 删除块属性
    if (card.blockId) {
      await this.removeCardBlockAttrs(card.blockId);
    }
    
    // 4. 可选：从 Riff 删除
    let deletedFromRiff: boolean | undefined;
    if (command.deleteFromRiff && card.blockId) {
      try {
        await removeRiffCards([card.blockId]);
        deletedFromRiff = true;
      } catch (error) {
        console.warn('[DeleteFSRSCardUseCase] Failed to delete from Riff:', error);
        deletedFromRiff = false;
      }
    }
    
    return ok({ deleted: true, deletedFromRiff });
  } catch (error) {
    return err(error);
  }
}

/**
 * 删除卡片相关的块属性
 */
private async removeCardBlockAttrs(blockId: string): Promise<void> {
  try {
    // 获取当前块属性
    const attrs = await getBlockAttrs(blockId);
    
    // 需要删除的属性列表
    const attrsToRemove = [
      'custom-card-type',
      'custom-riff-decks',
      'custom-fsrs-card-type',
      'custom-xiuyuan-id',
      'custom-template-id',
      'custom-list-template',
      'custom-priority',
      'custom-fsrs-a-factor',  // 旧属性，兼容清理
    ];
    
    // 构建新的属性对象（将要删除的属性设为空字符串）
    const newAttrs: Record<string, string> = {};
    for (const key of attrsToRemove) {
      if (key in attrs) {
        newAttrs[key] = '';  // 思源 API：空字符串表示删除属性
      }
    }
    
    // 如果有属性需要删除，调用 API
    if (Object.keys(newAttrs).length > 0) {
      await setBlockAttrs(blockId, newAttrs);
      console.log('[DeleteFSRSCardUseCase] Removed block attrs:', Object.keys(newAttrs));
    }
  } catch (error) {
    console.warn('[DeleteFSRSCardUseCase] Failed to remove block attrs:', error);
    // 不抛出异常，不影响卡片删除流程
  }
}
```

### 方案 2：创建独立的块属性清理服务

**优点**：
- 可复用
- 职责分离
- 支持批量清理

**实现**：

```typescript
// src/application/services/BlockAttrCleanupService.ts

/**
 * 块属性清理服务
 * 负责清理卡片相关的块属性
 */
export class BlockAttrCleanupService {
  /**
   * 清理单个块的卡片属性
   */
  async cleanupCardAttrs(blockId: string): Promise<void> {
    const attrs = await getBlockAttrs(blockId);
    
    const attrsToRemove = [
      'custom-card-type',
      'custom-riff-decks',
      'custom-fsrs-card-type',
      'custom-xiuyuan-id',
      'custom-template-id',
      'custom-list-template',
      'custom-priority',
      'custom-fsrs-a-factor',
    ];
    
    const newAttrs: Record<string, string> = {};
    for (const key of attrsToRemove) {
      if (key in attrs) {
        newAttrs[key] = '';
      }
    }
    
    if (Object.keys(newAttrs).length > 0) {
      await setBlockAttrs(blockId, newAttrs);
    }
  }
  
  /**
   * 批量清理块属性
   */
  async cleanupCardAttrsBatch(blockIds: string[]): Promise<void> {
    await Promise.all(blockIds.map(id => this.cleanupCardAttrs(id)));
  }
  
  /**
   * 清理 Xiuyuan 相关的所有块属性
   */
  async cleanupXiuyuanAttrs(xiuyuan: Xiuyuan): Promise<void> {
    const blockIds = xiuyuan.getBlockIDs().map(b => b.getValue());
    await this.cleanupCardAttrsBatch(blockIds);
  }
}
```

然后在 `DeleteFSRSCardUseCase` 中使用：

```typescript
export class DeleteFSRSCardUseCase {
  constructor(
    private readonly storage: StorageManager,
    private readonly attrCleanup: BlockAttrCleanupService  // 注入服务
  ) {}
  
  async execute(command: DeleteFSRSCardCommand): Promise<Result<DeleteFSRSCardCommandResult>> {
    // ...
    
    // 3. 删除块属性
    if (card.blockId) {
      await this.attrCleanup.cleanupCardAttrs(card.blockId);
    }
    
    // ...
  }
}
```

## 思源 API 删除属性的方式

根据思源 API 文档和实践：

```typescript
// ✅ 正确：设置为空字符串
await setBlockAttrs(blockId, {
  'custom-card-type': '',
  'custom-xiuyuan-id': ''
});

// ❌ 错误：设置为 null 或 undefined（不会删除）
await setBlockAttrs(blockId, {
  'custom-card-type': null,  // 无效
  'custom-xiuyuan-id': undefined  // 无效
});
```

## 测试计划

### 1. 单元测试

```typescript
describe('DeleteFSRSCardUseCase', () => {
  it('should remove block attrs when deleting card', async () => {
    // Arrange
    const mockGetBlockAttrs = vi.fn().mockResolvedValue({
      'custom-card-type': 'topic',
      'custom-xiuyuan-id': 'xy_123'
    });
    const mockSetBlockAttrs = vi.fn();
    
    // Act
    await useCase.execute({ cardId: 'card-1', deleteFromRiff: false });
    
    // Assert
    expect(mockSetBlockAttrs).toHaveBeenCalledWith('block-1', {
      'custom-card-type': '',
      'custom-xiuyuan-id': ''
    });
  });
});
```

### 2. 集成测试

1. 创建一张卡片（验证块属性存在）
2. 删除卡片
3. 检查块属性是否已清理

### 3. 手动测试

1. 创建普通卡片 → 取消闪卡 → 检查块属性
2. 创建 Xiuyuan 卡片 → 取消闪卡 → 检查所有相关块的属性
3. 创建列表模板卡 → 取消闪卡 → 检查父列表和子列表项的属性

## 影响范围

### 需要修改的文件

1. `src/application/usecases/card/DeleteFSRSCardUseCase.ts`
   - 添加 `removeCardBlockAttrs` 方法
   - 在 `execute` 中调用

2. `src/core/siyuan/api.ts`（可选）
   - 添加 `getBlockAttrs` 导入（如果还没有）

3. 测试文件
   - `src/__tests__/application/usecases/card/__tests__/DeleteFSRSCardUseCase.test.ts`

### 不需要修改的文件

- ❌ `XiuyuanRepository`：删除 Xiuyuan 时会级联删除 Card，Card 删除时会清理属性
- ❌ `UnifiedStorageManager`：只负责内存和持久化，不涉及块属性

## 向后兼容性

### 旧数据清理

对于已经删除但属性残留的块，可以提供一个清理工具：

```typescript
/**
 * 清理所有孤立的卡片属性
 * （卡片已删除但块属性仍存在）
 */
async cleanupOrphanedCardAttrs(): Promise<number> {
  // 1. 查询所有带有 custom-card-type 的块
  const blocks = await getBlocksByAttr('custom-card-type');
  
  let cleaned = 0;
  for (const block of blocks) {
    // 2. 检查卡片是否存在
    const card = this.storage.getCardByBlockId(block.id);
    if (!card) {
      // 3. 卡片不存在，清理属性
      await this.attrCleanup.cleanupCardAttrs(block.id);
      cleaned++;
    }
  }
  
  return cleaned;
}
```

## 推荐实现顺序

1. ✅ 先实现方案 1（在 DeleteFSRSCardUseCase 中直接处理）
   - 简单直接
   - 快速解决问题

2. ⏳ 后续优化为方案 2（独立服务）
   - 如果需要在其他地方复用
   - 如果需要批量清理功能

3. ⏳ 添加清理工具
   - 清理历史遗留数据
   - 提供给用户手动触发

## 总结

### 问题根源

- 思源的 `removeRiffCards` API 不删除块属性（这是设计行为）
- 插件的删除逻辑没有清理块属性

### 解决方案

在 `DeleteFSRSCardUseCase` 中添加块属性清理逻辑：
1. 获取块属性
2. 将卡片相关属性设为空字符串
3. 调用 `setBlockAttrs` 更新

### 需要清理的属性

- `custom-card-type`
- `custom-riff-decks`
- `custom-fsrs-card-type`
- `custom-xiuyuan-id`
- `custom-template-id`
- `custom-list-template`
- `custom-priority`
- `custom-fsrs-a-factor`（旧属性）

### 实现优先级

1. 🔴 高优先级：修复 DeleteFSRSCardUseCase
2. 🟡 中优先级：添加单元测试
3. 🟢 低优先级：创建清理工具（清理历史数据）
