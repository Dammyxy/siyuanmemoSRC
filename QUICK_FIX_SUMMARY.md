# 快速修复总结

## 修复内容

### 1. "从队列移除"功能修复 ✅

**问题：** 渐进学习队列的"从队列移除"功能消失

**原因：** 数据源工厂函数传递了错误的参数类型
- `IncrementalLearningDataSource` 需要 `UnifiedDataSourceManager`
- 但工厂函数传递的是 `plugin` 对象

**修复：** 修改 `src/ui/browser/utils/dataSourceFactory.ts`
- 从 `plugin` 中获取 `unifiedDataSourceManager`
- 正确传递给 `IncrementalLearningDataSource`

**状态：** ✅ 已修复并编译

### 2. 幽灵卡片（丢失闪卡）取消闪卡状态方案

**问题：** 4张卡片对应的文档已删除，但 Riff 中仍有记录，无法删除

**解决方案：** 取消闪卡状态（而不是删除）

## 使用方法

### 步骤1：重新加载插件

1. 关闭并重新打开思源笔记
2. 或者：禁用 FSRS 插件后重新启用

### 步骤2：验证"从队列移除"功能

1. 打开浏览器
2. 点击左侧的"渐进学习"队列
3. 右键点击任意卡片
4. 应该能看到"从队列移除"选项（减号图标 ➖）

### 步骤3：取消幽灵卡片的闪卡状态

**方法A：浏览器控制台脚本（推荐）**

1. 在思源笔记中按 `F12` 打开开发者工具
2. 切换到 `Console`（控制台）标签
3. 复制粘贴以下脚本：

```javascript
const blockIds = ['20260203222457-raq2sfs', '20260203222510-lg626ip', '20260205105152-w57h904', '20260205110918-j7cej9r'];
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

if (!riff) {
  console.error('❌ 找不到 FSRS 插件');
} else {
  console.log('🔧 开始取消闪卡状态...');
  try {
    await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
    const remaining = await riff.getRiffCardsByBlockIDs(blockIds);
    if (remaining.length === 0) {
      console.log('✅ 成功取消闪卡状态！');
    } else {
      console.log('⚠️ 尝试重置后移除...');
      await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
      await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
      const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
      console.log(finalCheck.length === 0 ? '✅ 成功！' : '❌ 失败，需要使用方法B');
    }
  } catch (err) {
    console.error('❌ 失败:', err);
  }
}
```

**方法B：SQL 直接删除（如果方法A失败）**

1. 备份 `data/storage/riff/` 目录
2. 下载 DB Browser for SQLite：https://sqlitebrowser.org/
3. 打开 `data/storage/riff/riff.db`
4. 执行 SQL：

```sql
DELETE FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
```

5. 保存并重启思源笔记

### 步骤4：批量清理所有丢失卡片（可选）

如果有很多丢失的卡片，可以批量处理：

```javascript
// 批量取消所有丢失卡片的闪卡状态
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const sql = plugin?.sql;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

async function removeLostCards() {
  console.log('🔍 查找丢失的卡片...');
  
  // 获取所有 Riff 卡片
  let page = 1, allCards = [];
  while (true) {
    const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, 500);
    if (!data?.blocks || data.blocks.length === 0) break;
    allCards.push(...data.blocks);
    if (page >= data.pageCount) break;
    page++;
  }
  
  console.log(`📊 总卡片数: ${allCards.length}`);
  
  // 查询哪些块不存在
  const blockIds = allCards.map(c => c.id);
  const lostBlockIds = [];
  
  for (let i = 0; i < blockIds.length; i += 500) {
    const batch = blockIds.slice(i, i + 500);
    const inClause = batch.map(id => `'${id}'`).join(',');
    const existingBlocks = await sql(`SELECT id FROM blocks WHERE id IN (${inClause})`);
    const existingIds = new Set(existingBlocks.map((b) => b.id));
    lostBlockIds.push(...batch.filter(id => !existingIds.has(id)));
  }
  
  console.log(`⚠️ 发现 ${lostBlockIds.length} 张丢失的卡片`);
  
  if (lostBlockIds.length === 0) {
    console.log('✅ 没有丢失的卡片');
    return;
  }
  
  const confirmed = confirm(`发现 ${lostBlockIds.length} 张丢失的卡片，是否取消它们的闪卡状态？`);
  if (!confirmed) return;
  
  // 批量删除
  let removed = 0;
  for (let i = 0; i < lostBlockIds.length; i += 100) {
    const batch = lostBlockIds.slice(i, i + 100);
    try {
      await riff.removeRiffCards(BUILTIN_DECK_ID, batch);
      removed += batch.length;
      console.log(`✅ 已处理 ${removed}/${lostBlockIds.length}`);
    } catch (err) {
      console.error(`❌ 批次失败:`, err);
    }
  }
  
  console.log(`✅ 完成！成功取消 ${removed} 张卡片的闪卡状态`);
}

removeLostCards();
```

## 详细文档

- **`REMOVE_FROM_QUEUE_AND_UNCARD_SOLUTION.md`** - 完整的解决方案和技术细节
- **`GHOST_CARDS_FINAL_SOLUTION.md`** - 幽灵卡片快速解决方案
- **`FORCE_DELETE_AND_QUEUE_REMOVE_FIX.md`** - 强制删除功能实现总结

## 预防措施

### 1. 定期检查丢失卡片

```javascript
// 数据完整性检查
async function checkIntegrity() {
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
  const riff = plugin?.riff;
  const sql = plugin?.sql;
  const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
  
  let page = 1, allCards = [];
  while (true) {
    const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, 500);
    if (!data?.blocks || data.blocks.length === 0) break;
    allCards.push(...data.blocks);
    if (page >= data.pageCount) break;
    page++;
  }
  
  const blockIds = allCards.map(c => c.id);
  const existingBlocks = await sql(`SELECT id FROM blocks WHERE id IN (${blockIds.map(id => `'${id}'`).join(',')})`);
  const existingIds = new Set(existingBlocks.map((b) => b.id));
  const lostCards = blockIds.filter(id => !existingIds.has(id));
  
  console.log('📊 数据完整性检查:');
  console.log(`  总卡片: ${allCards.length}`);
  console.log(`  丢失卡片: ${lostCards.length}`);
  
  if (lostCards.length > 0) {
    console.warn('⚠️ 丢失的卡片:', lostCards);
  }
  
  return { total: allCards.length, lost: lostCards.length };
}

checkIntegrity();
```

### 2. 删除文档前检查

建议在删除包含闪卡的文档前，先取消这些卡片的闪卡状态。

## 总结

1. ✅ "从队列移除"功能已修复
2. ✅ 提供了取消幽灵卡片闪卡状态的方法
3. ✅ 提供了批量清理工具
4. ✅ 提供了预防措施

重新加载插件后即可使用！
