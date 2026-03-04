# 诊断：4张空白卡片删除失败

## 问题描述

用户尝试删除4张空白卡片，但删除操作返回成功（返回值为4），卡片却没有被删除。

**卡片 ID：**
- `20260203222457-raq2sfs`
- `20260203222510-lg626ip`
- `20260205105152-w57h904`
- `20260205110918-j7cej9r`

## 日志分析

```
[DeckDataSource] actionId: delete-card
[DeckDataSource] selectedRows 数量: 4
[CardBrowser] performAction 返回结果: 4
```

**结论：**
- `batchDelete()` 函数返回了 4，表示删除了4张卡片
- 但用户报告卡片仍然存在

## 可能的原因

### 1. Riff API 删除失败但没有抛出错误
`batchDelete()` 函数调用 `riff.removeRiffCards()`，如果 API 调用失败但没有抛出错误，函数会返回 `blockIds.length` 而不是 0。

### 2. 卡片不在 Riff 中
这4张卡片可能不在 Riff 卡组中，所以 `removeRiffCards()` 无法删除它们。

### 3. 缓存问题
卡片可能已经从 Riff 中删除，但缓存没有正确更新，导致 UI 仍然显示这些卡片。

## 诊断步骤

### 步骤1：检查卡片是否在 Riff 中

在浏览器控制台中运行：

```javascript
// 获取这4张卡片的 Riff 数据
const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

const riff = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

// 尝试获取这些卡片
const cards = await riff.getRiffCardsByBlockIDs(blockIds);
console.log('Riff 中的卡片:', cards);
console.log('卡片数量:', cards?.length);
```

**预期结果：**
- 如果返回 0 张卡片，说明这些卡片不在 Riff 中
- 如果返回 4 张卡片，说明删除失败

### 步骤2：检查缓存状态

在浏览器控制台中运行：

```javascript
// 获取缓存统计
const browserService = await import('./src/ui/browser/browserService.js');
const stats = browserService.getCacheStats();
console.log('缓存统计:', stats);

// 清除缓存
browserService.invalidateCardCache();
console.log('缓存已清除');

// 重新加载数据
// 在 UI 中点击"强制刷新"按钮
```

### 步骤3：手动删除卡片

在浏览器控制台中运行：

```javascript
const riff = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

try {
  await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
  console.log('✅ 删除成功');
} catch (err) {
  console.error('❌ 删除失败:', err);
}
```

## 修复方案

### 方案1：增强错误处理

修改 `batchDelete()` 函数，添加更详细的日志和错误处理：

```typescript
export async function batchDelete(blockIds: string[]): Promise<number> {
    if (blockIds.length === 0) return 0;

    console.log('[batchDelete] 开始删除卡片:', blockIds);

    try {
        // 先检查卡片是否存在
        const existingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        console.log('[batchDelete] Riff 中存在的卡片数量:', existingCards?.length);
        
        if (!existingCards || existingCards.length === 0) {
            console.warn('[batchDelete] 这些卡片不在 Riff 中，无法删除');
            return 0;
        }

        // 删除卡片
        await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
        console.log('[batchDelete] ✅ Riff API 调用成功');

        // 验证删除结果
        const remainingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        const actualDeleted = blockIds.length - (remainingCards?.length || 0);
        console.log('[batchDelete] 实际删除的卡片数量:', actualDeleted);

        // 增量更新缓存：移除卡片
        cardCache.removeCards(blockIds);

        return actualDeleted;
    } catch (err) {
        console.error('[batchDelete] 删除失败:', err);
        console.error('[batchDelete] 错误堆栈:', err instanceof Error ? err.stack : undefined);
        return 0;
    }
}
```

### 方案2：清除缓存后重新加载

在删除操作后，强制清除缓存并重新加载：

```typescript
// 在 SRSBrowser.vue 的 handleAction() 中
if (actionId === 'delete-card') {
  // ... 执行删除
  
  // 清除缓存
  invalidateCardCache();
  
  // 重新加载
  await loadData(true);  // forceRefresh = true
}
```

## 临时解决方案

如果这4张卡片确实无法删除，可以尝试以下方法：

### 方法1：使用 SQL 直接删除

```sql
-- 查询这些卡片的 Riff 数据
SELECT * FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);

-- 如果存在，手动删除
DELETE FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
```

### 方法2：重置 Riff 数据库

如果问题严重，可以考虑重置 Riff 数据库（会丢失所有复习记录）：

1. 备份数据
2. 删除 Riff 数据库文件
3. 重新初始化

## 下一步行动

1. **运行诊断步骤1**，确认这4张卡片是否在 Riff 中
2. **运行诊断步骤2**，清除缓存并重新加载
3. **如果仍然失败**，运行诊断步骤3手动删除
4. **报告结果**，以便我们进一步分析

---

## 关于"从当前队列移除"功能

从日志来看，你测试的是"全部闪卡"视图（`DeckDataSource`），而不是队列视图。

**请在队列视图中测试：**
1. 打开"提取练习"队列
2. 右键点击任意卡片
3. 查看菜单中是否有"从队列移除"选项（减号图标 ➖）

**预期结果：**
- 队列视图应该有"从队列移除"选项
- "全部闪卡"视图不应该有"从队列移除"选项（因为它不是队列）

如果队列视图中仍然没有"从队列移除"选项，请提供队列视图的右键菜单日志。
