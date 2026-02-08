# "从队列移除"功能消失和取消闪卡状态解决方案

## 问题1："从队列移除"功能消失

### 根本原因

渐进学习队列使用了新架构（`UnifiedDataSourceManager`），但数据源工厂函数传递的是 `plugin` 对象，导致：

1. `IncrementalLearningDataSource` 构造函数需要 `UnifiedDataSourceManager`
2. 但工厂函数传递的是 `plugin`
3. 类型不匹配，导致数据源无法正常工作
4. `getSupportedActions()` 可能返回空数组或出错

**问题代码位置：**
- `src/ui/browser/utils/dataSourceFactory.ts:77-82`
- `src/ui/browser/datasource/IncrementalLearningDataSource.ts:53`

### 解决方案

修改数据源工厂函数，正确传递 `UnifiedDataSourceManager`：

```typescript
// src/ui/browser/utils/dataSourceFactory.ts

export function createQueueDataSource(
  queueId: string,
  plugin: any,
  options: DataSourceOptionsWithDoc
): ICardDataSource | null {
  const { docId, preset, queryText, cardType } = options;

  switch (queueId) {
    // ... 其他队列 ...

    case 'incremental-learning':
      // ✅ 修复：传递 UnifiedDataSourceManager 而不是 plugin
      const manager = plugin?.unifiedDataSourceManager;
      if (!manager) {
        console.error('[dataSourceFactory] UnifiedDataSourceManager not found');
        return null;
      }
      return new IncrementalLearningDataSource(manager, {
        docId,
        preset,
        queryText,
        cardType,
      });

    default:
      return null;
  }
}

// 同样修复 createFocusDataSource 函数
export function createFocusDataSource(
  queueId: string | null,
  plugin: any,
  options: DataSourceOptions,
  getQueueItems?: () => any[]
): ICardDataSource | null {
  // ... 其他代码 ...

  if (queueId === 'incremental-learning') {
    // ✅ 修复：传递 UnifiedDataSourceManager
    const manager = plugin?.unifiedDataSourceManager;
    if (!manager) {
      console.error('[dataSourceFactory] UnifiedDataSourceManager not found');
      return null;
    }
    return new IncrementalLearningDataSource(manager, {
      preset,
      queryText,
      cardType,
    });
  }

  // ... 其他代码 ...
}
```

## 问题2：幽灵卡片（丢失/关闭的闪卡）取消闪卡状态

### 理解问题

这些"幽灵卡片"是：
- 对应的文档已被删除或移动
- 但 Riff 数据库中仍有记录
- 无法通过 Riff API 删除（数据损坏）
- **用户想要取消它们的闪卡状态，而不是删除**

### 解决方案：取消闪卡状态

#### 方案1：浏览器控制台脚本（推荐）

```javascript
// 取消闪卡状态脚本
const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

if (!riff) {
  console.error('❌ 找不到 FSRS 插件');
} else {
  console.log('🔧 开始取消闪卡状态...');
  
  try {
    // 方法1：从 Riff 中移除（取消闪卡状态）
    console.log('步骤1: 从 Riff 中移除卡片...');
    await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
    
    // 验证
    const remaining = await riff.getRiffCardsByBlockIDs(blockIds);
    console.log('移除后剩余:', remaining.length);
    
    if (remaining.length === 0) {
      console.log('✅ 成功取消闪卡状态！');
    } else {
      console.log('⚠️ 直接移除失败，尝试重置后移除...');
      
      // 方法2：先重置，再移除
      console.log('步骤2: 重置卡片...');
      await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
      console.log('✅ 重置成功');
      
      console.log('步骤3: 再次移除...');
      await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
      
      // 再次验证
      const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
      console.log('最终剩余:', finalCheck.length);
      
      if (finalCheck.length === 0) {
        console.log('✅ 成功取消闪卡状态！');
      } else {
        console.log('❌ 仍然失败，需要使用方案2（SQL直接删除）');
      }
    }
  } catch (err) {
    console.error('❌ 操作失败:', err);
  }
}
```

#### 方案2：SQL 直接删除 Riff 记录

如果方案1失败，使用 SQLite 工具直接删除 Riff 数据库中的记录：

**步骤：**

1. **备份数据**（⚠️ 必须！）
   ```bash
   # 关闭思源笔记
   # 备份 data/storage/riff/ 目录
   ```

2. **使用 DB Browser for SQLite 打开数据库**
   - 下载：https://sqlitebrowser.org/
   - 打开 `data/storage/riff/riff.db`

3. **执行删除 SQL**
   ```sql
   -- 删除 Riff 记录（取消闪卡状态）
   DELETE FROM riff_cards 
   WHERE block_id IN (
     '20260203222457-raq2sfs',
     '20260203222510-lg626ip',
     '20260205105152-w57h904',
     '20260205110918-j7cej9r'
   );
   ```

4. **验证**
   ```sql
   -- 应该返回 0
   SELECT COUNT(*) FROM riff_cards 
   WHERE block_id IN (
     '20260203222457-raq2sfs',
     '20260203222510-lg626ip',
     '20260205105152-w57h904',
     '20260205110918-j7cej9r'
   );
   ```

5. **保存并重启思源笔记**

### 方案3：批量取消所有丢失卡片的闪卡状态

如果有很多丢失的卡片，可以批量处理：

```javascript
// 批量取消丢失卡片的闪卡状态
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

async function removeLostCards() {
  console.log('🔍 开始查找丢失的卡片...');
  
  // 获取所有 Riff 卡片
  let page = 1;
  let allCards = [];
  
  while (true) {
    const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, 500);
    if (!data?.blocks || data.blocks.length === 0) break;
    allCards.push(...data.blocks);
    if (page >= data.pageCount) break;
    page++;
  }
  
  console.log(`📊 总卡片数: ${allCards.length}`);
  
  // 查询所有块是否存在
  const blockIds = allCards.map(c => c.id);
  const sql = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.sql;
  
  if (!sql) {
    console.error('❌ 找不到 SQL API');
    return;
  }
  
  // 分批查询（每批500个）
  const lostBlockIds = [];
  
  for (let i = 0; i < blockIds.length; i += 500) {
    const batch = blockIds.slice(i, i + 500);
    const inClause = batch.map(id => `'${id}'`).join(',');
    
    const existingBlocks = await sql(`
      SELECT id FROM blocks WHERE id IN (${inClause})
    `);
    
    const existingIds = new Set(existingBlocks.map((b: any) => b.id));
    const lostInBatch = batch.filter(id => !existingIds.has(id));
    lostBlockIds.push(...lostInBatch);
  }
  
  console.log(`⚠️ 发现 ${lostBlockIds.length} 张丢失的卡片`);
  
  if (lostBlockIds.length === 0) {
    console.log('✅ 没有丢失的卡片');
    return;
  }
  
  // 询问用户是否删除
  const confirmed = confirm(`发现 ${lostBlockIds.length} 张丢失的卡片，是否取消它们的闪卡状态？`);
  
  if (!confirmed) {
    console.log('❌ 用户取消操作');
    return;
  }
  
  // 批量删除（每批100个）
  let removed = 0;
  
  for (let i = 0; i < lostBlockIds.length; i += 100) {
    const batch = lostBlockIds.slice(i, i + 100);
    
    try {
      await riff.removeRiffCards(BUILTIN_DECK_ID, batch);
      removed += batch.length;
      console.log(`✅ 已处理 ${removed}/${lostBlockIds.length}`);
    } catch (err) {
      console.error(`❌ 批次 ${i}-${i + batch.length} 失败:`, err);
    }
  }
  
  console.log(`✅ 完成！成功取消 ${removed} 张卡片的闪卡状态`);
}

// 运行
removeLostCards();
```

## 实施步骤

### 步骤1：修复"从队列移除"功能

1. 修改 `src/ui/browser/utils/dataSourceFactory.ts`
2. 重新编译：`npm run build`
3. 重新加载插件

### 步骤2：取消幽灵卡片的闪卡状态

**选择方案：**

- **方案1**：浏览器控制台脚本（快速，推荐先尝试）
- **方案2**：SQL 直接删除（如果方案1失败）
- **方案3**：批量处理所有丢失卡片（如果有很多）

**推荐流程：**

1. 先尝试方案1（浏览器控制台脚本）
2. 如果失败，使用方案2（SQL 直接删除）
3. 如果有很多丢失卡片，使用方案3（批量处理）

## 预防措施

### 1. 定期清理丢失卡片

创建一个定期任务，自动检测并提示清理丢失的卡片：

```javascript
// 添加到插件的定期任务中
async function checkLostCards() {
  // ... 使用方案3的代码 ...
}

// 每周运行一次
setInterval(checkLostCards, 7 * 24 * 60 * 60 * 1000);
```

### 2. 删除文档前提示

在删除文档时，检查是否有闪卡，并提示用户：

```javascript
// 在删除文档的钩子中
async function beforeDeleteDoc(docId: string) {
  const cards = await getCardsInDoc(docId);
  
  if (cards.length > 0) {
    const confirmed = confirm(
      `该文档包含 ${cards.length} 张闪卡，删除后这些卡片将变成"丢失卡片"。\n\n` +
      `建议先取消这些卡片的闪卡状态。是否继续删除？`
    );
    
    return confirmed;
  }
  
  return true;
}
```

### 3. 数据完整性检查

定期运行数据完整性检查：

```javascript
// 检查数据完整性
async function checkDataIntegrity() {
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
  const riff = plugin?.riff;
  const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
  
  // 获取所有卡片
  let page = 1, allCards = [];
  while (true) {
    const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, 500);
    if (!data?.blocks || data.blocks.length === 0) break;
    allCards.push(...data.blocks);
    if (page >= data.pageCount) break;
    page++;
  }
  
  // 检查损坏的卡片
  const brokenCards = allCards.filter(c => {
    const r = c.riffCard || {};
    return r.type === null || r.type === undefined || r.state === null;
  });
  
  // 检查丢失的卡片
  const blockIds = allCards.map(c => c.id);
  const sql = plugin?.sql;
  const existingBlocks = await sql(`
    SELECT id FROM blocks WHERE id IN (${blockIds.map(id => `'${id}'`).join(',')})
  `);
  const existingIds = new Set(existingBlocks.map((b: any) => b.id));
  const lostCards = blockIds.filter(id => !existingIds.has(id));
  
  console.log('📊 数据完整性检查结果:');
  console.log(`  总卡片数: ${allCards.length}`);
  console.log(`  损坏卡片: ${brokenCards.length}`);
  console.log(`  丢失卡片: ${lostCards.length}`);
  
  if (brokenCards.length > 0) {
    console.warn('⚠️ 损坏的卡片:', brokenCards.map(c => c.id));
  }
  
  if (lostCards.length > 0) {
    console.warn('⚠️ 丢失的卡片:', lostCards);
  }
  
  return {
    total: allCards.length,
    broken: brokenCards.length,
    lost: lostCards.length,
  };
}

// 运行检查
checkDataIntegrity();
```

## 总结

1. **"从队列移除"功能消失**：修改数据源工厂函数，正确传递 `UnifiedDataSourceManager`
2. **取消幽灵卡片的闪卡状态**：使用浏览器控制台脚本或 SQL 直接删除
3. **预防措施**：定期清理、删除前提示、数据完整性检查

## 相关文档

- `FORCE_DELETE_AND_QUEUE_REMOVE_FIX.md` - 强制删除功能实现
- `GHOST_CARDS_FINAL_SOLUTION.md` - 幽灵卡片快速解决方案
- `MANUAL_DELETE_GHOST_CARDS.md` - 详细的手动删除指南
