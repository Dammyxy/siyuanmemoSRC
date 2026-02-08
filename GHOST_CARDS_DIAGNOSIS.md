# 幽灵卡片诊断和修复方案

## 问题描述

4张卡片无法通过 `riff.removeRiffCards()` API 删除：
- `20260203222457-raq2sfs`
- `20260203222510-lg626ip`
- `20260205105152-w57h904`
- `20260205110918-j7cej9r`

**症状：**
```
[batchDelete] Riff 中存在的卡片数量: 4
[batchDelete] 调用 riff.removeRiffCards...
[batchDelete] ✅ Riff API 调用成功
[batchDelete] 删除后剩余卡片数量: 4  ⚠️ 删除失败！
[batchDelete] 实际删除的卡片数量: 0
```

## 根本原因

这4张卡片之前就是那些 `type: null` 的问题卡片。它们可能：
1. 数据结构损坏
2. 缺少必要的字段
3. Riff API 无法识别它们

## 临时解决方案

### 方案1：使用 SQL 直接删除（推荐）

在浏览器控制台运行：

```javascript
// 1. 查询这些卡片的详细信息
const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

const riff = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.riff;
const cards = await riff.getRiffCardsByBlockIDs(blockIds);

console.log('卡片详细信息:');
cards.forEach((card, index) => {
  console.log(`卡片 ${index + 1}:`, {
    id: card.id,
    blockId: card.id,
    deckID: card.riffCard?.deckID,
    type: card.riffCard?.type,
    state: card.riffCard?.state,
    due: card.riffCard?.due,
  });
});

// 2. 使用 SQL 直接删除
const sql = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.sql;

// 查询 Riff 数据库中的记录
const query = `
  SELECT * FROM riff_cards 
  WHERE block_id IN (
    '20260203222457-raq2sfs',
    '20260203222510-lg626ip',
    '20260205105152-w57h904',
    '20260205110918-j7cej9r'
  )
`;

// 注意：思源笔记可能没有直接的 SQL 删除接口
// 需要使用 Riff 的内部方法
```

### 方案2：重置卡片数据

在浏览器控制台运行：

```javascript
const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

const riff = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

// 尝试重置卡片
try {
  await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
  console.log('✅ 重置成功，现在尝试删除...');
  
  // 重置后再尝试删除
  await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
  console.log('✅ 删除成功');
} catch (err) {
  console.error('❌ 操作失败:', err);
}
```

### 方案3：手动清理数据库

如果上述方法都失败，需要手动清理 Riff 数据库：

1. **备份数据**
   - 关闭思源笔记
   - 备份 `data/storage/riff/` 目录

2. **使用 SQLite 工具打开数据库**
   - 找到 Riff 数据库文件（通常在 `data/storage/riff/` 目录）
   - 使用 SQLite 工具（如 DB Browser for SQLite）打开

3. **执行删除 SQL**
   ```sql
   DELETE FROM riff_cards 
   WHERE block_id IN (
     '20260203222457-raq2sfs',
     '20260203222510-lg626ip',
     '20260205105152-w57h904',
     '20260205110918-j7cej9r'
   );
   ```

4. **重新启动思源笔记**

## 长期解决方案

### 修改 batchDelete() 函数，添加强制删除选项

```typescript
export async function batchDelete(blockIds: string[], options?: { force?: boolean }): Promise<number> {
    if (blockIds.length === 0) return 0;

    console.log('[batchDelete] 开始删除卡片:', blockIds);
    console.log('[batchDelete] 强制删除模式:', options?.force);

    try {
        // 先检查卡片是否存在
        const existingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        console.log('[batchDelete] Riff 中存在的卡片数量:', existingCards?.length);
        
        if (!existingCards || existingCards.length === 0) {
            console.warn('[batchDelete] 这些卡片不在 Riff 中，无法删除');
            return 0;
        }

        // 删除卡片
        console.log('[batchDelete] 调用 riff.removeRiffCards...');
        await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
        console.log('[batchDelete] ✅ Riff API 调用成功');

        // 验证删除结果
        const remainingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        let actualDeleted = blockIds.length - (remainingCards?.length || 0);
        
        console.log('[batchDelete] 删除后剩余卡片数量:', remainingCards?.length);
        console.log('[batchDelete] 实际删除的卡片数量:', actualDeleted);

        // 🆕 如果删除失败且启用强制模式，尝试重置后再删除
        if (actualDeleted === 0 && options?.force && remainingCards?.length > 0) {
            console.warn('[batchDelete] ⚠️ 常规删除失败，尝试强制删除...');
            
            try {
                // 先重置卡片
                console.log('[batchDelete] 步骤1: 重置卡片...');
                await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
                console.log('[batchDelete] ✅ 重置成功');
                
                // 再次尝试删除
                console.log('[batchDelete] 步骤2: 再次尝试删除...');
                await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
                
                // 验证结果
                const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
                actualDeleted = blockIds.length - (finalCheck?.length || 0);
                console.log('[batchDelete] 强制删除后实际删除数量:', actualDeleted);
                
                if (actualDeleted > 0) {
                    console.log('[batchDelete] ✅ 强制删除成功');
                } else {
                    console.error('[batchDelete] ❌ 强制删除仍然失败，这些卡片可能需要手动清理');
                }
            } catch (forceErr) {
                console.error('[batchDelete] 强制删除失败:', forceErr);
            }
        }

        // 增量更新缓存：移除卡片
        if (actualDeleted > 0) {
            cardCache.removeCards(blockIds);
            console.log('[batchDelete] 缓存已更新');
        }

        return actualDeleted;
    } catch (err) {
        console.error('[batchDelete] 删除失败:', err);
        console.error('[batchDelete] 错误堆栈:', err instanceof Error ? err.stack : undefined);
        return 0;
    }
}
```

### 在 UI 中添加"强制删除"选项

在 SRSBrowser.vue 中：

```typescript
// 删除卡片确认
if (actionId === 'delete-card') {
  const ok = await confirmDialog({
    title: t('deleteCard', '删除卡片'),
    content: t('confirmDelete', `确定要删除 ${targetCards.length} 张卡片吗？此操作不可撤销。\n\n如果常规删除失败，将自动尝试强制删除。`),
    confirmText: t('confirm', '确认'),
    cancelText: t('cancel', '取消'),
  });
  if (!ok) return;
}
```

在 DeckDataSource 中：

```typescript
// 删除卡片（支持强制删除）
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  const { batchDelete } = await import('../browserService');
  
  // 第一次尝试：常规删除
  let deleted = await batchDelete(blockIds);
  
  // 如果删除失败，尝试强制删除
  if (deleted === 0 && blockIds.length > 0) {
    console.warn('[DeckDataSource] 常规删除失败，尝试强制删除...');
    deleted = await batchDelete(blockIds, { force: true });
  }
  
  return deleted;
}
```

## 下一步行动

1. **立即尝试方案2（重置后删除）**
   - 在浏览器控制台运行方案2的代码
   - 查看是否成功删除

2. **如果方案2失败，使用方案3（手动清理数据库）**
   - 备份数据
   - 使用 SQLite 工具手动删除

3. **实施长期解决方案**
   - 修改 `batchDelete()` 函数，添加强制删除逻辑
   - 在 UI 中自动尝试强制删除

## 关于"从当前队列移除"功能

你测试的是"全部闪卡"视图（`DeckDataSource`），不是队列视图。

**请在队列视图中测试：**
1. 点击左侧的"提取练习"队列
2. 右键点击任意卡片
3. 查看菜单中是否有"从队列移除"选项（减号图标 ➖）

如果队列视图中仍然没有，请提供队列视图的右键菜单日志。
