# 删除功能增强 - 修复总结

## 修复时间
2026-02-06

## 问题描述

1. **删除功能返回成功但卡片未删除**
   - 用户尝试删除4张空白卡片
   - 删除操作返回 4（表示成功）
   - 但卡片仍然显示在列表中

2. **"从当前队列移除"功能未显示**
   - 用户报告队列视图中没有"从队列移除"选项
   - 但日志显示测试的是"全部闪卡"视图（`DeckDataSource`），不是队列视图

## 实施的修复

### 1. 增强 batchDelete() 函数的错误处理和日志

**文件：** `src/ui/browser/browserService.ts`

**修改内容：**

```typescript
export async function batchDelete(blockIds: string[]): Promise<number> {
    if (blockIds.length === 0) return 0;

    console.log('[batchDelete] 开始删除卡片:', blockIds);

    try {
        // 🆕 先检查卡片是否存在
        const existingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        console.log('[batchDelete] Riff 中存在的卡片数量:', existingCards?.length);
        console.log('[batchDelete] Riff 中存在的卡片 ID:', existingCards?.map((c: any) => c.id));
        
        if (!existingCards || existingCards.length === 0) {
            console.warn('[batchDelete] 这些卡片不在 Riff 中，无法删除');
            return 0;
        }

        // 删除卡片
        console.log('[batchDelete] 调用 riff.removeRiffCards...');
        await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
        console.log('[batchDelete] ✅ Riff API 调用成功');

        // 🆕 验证删除结果
        const remainingCards = await riff.getRiffCardsByBlockIDs(blockIds);
        const actualDeleted = blockIds.length - (remainingCards?.length || 0);
        console.log('[batchDelete] 删除后剩余卡片数量:', remainingCards?.length);
        console.log('[batchDelete] 实际删除的卡片数量:', actualDeleted);

        // 增量更新缓存：移除卡片
        cardCache.removeCards(blockIds);
        console.log('[batchDelete] 缓存已更新');

        return actualDeleted;  // 🔧 返回实际删除的数量，而不是 blockIds.length
    } catch (err) {
        console.error('[batchDelete] 删除失败:', err);
        console.error('[batchDelete] 错误堆栈:', err instanceof Error ? err.stack : undefined);
        return 0;
    }
}
```

**关键变更：**
- 🆕 删除前检查卡片是否存在于 Riff 中
- 🆕 删除后验证删除结果
- 🆕 返回实际删除的数量，而不是请求删除的数量
- 🆕 添加详细的日志输出

---

### 2. 在 SRSBrowser.vue 中添加删除后强制刷新缓存

**文件：** `src/ui/browser/SRSBrowser.vue`

**修改内容：**

```typescript
if (
  actionId === 'remove-from-queue'
  || actionId === 'remove-from-current-queue'
  || actionId === 'dismiss'
  || actionId === 'delete-card'
  || actionId === 'insert-at'
  || actionId === 'auto-sort'
  || actionId === 'reset'
  || actionId === 'suspend'
) {
  // 🆕 删除卡片后强制清除缓存
  if (actionId === 'delete-card') {
    console.log('[CardBrowser] 删除卡片后清除缓存');
    invalidateCardCache();
  }
  
  await loadData(actionId === 'delete-card');  // 🔧 删除后强制刷新
} else {
  gridApi.value?.refreshCells({ force: true });
}
```

**关键变更：**
- 🆕 删除卡片后调用 `invalidateCardCache()` 清除缓存
- 🔧 删除卡片后调用 `loadData(true)` 强制刷新数据

---

## 诊断步骤

### 步骤1：重新加载插件并测试删除功能

1. 关闭并重新打开思源笔记
2. 打开"全部闪卡"视图
3. 右键点击这4张空白卡片
4. 点击"删除卡片"
5. 查看浏览器控制台日志

**预期日志：**
```
[batchDelete] 开始删除卡片: ['20260203222457-raq2sfs', ...]
[batchDelete] Riff 中存在的卡片数量: 4
[batchDelete] 调用 riff.removeRiffCards...
[batchDelete] ✅ Riff API 调用成功
[batchDelete] 删除后剩余卡片数量: 0
[batchDelete] 实际删除的卡片数量: 4
[batchDelete] 缓存已更新
[CardBrowser] 删除卡片后清除缓存
```

**如果卡片不在 Riff 中：**
```
[batchDelete] 开始删除卡片: ['20260203222457-raq2sfs', ...]
[batchDelete] Riff 中存在的卡片数量: 0
[batchDelete] 这些卡片不在 Riff 中，无法删除
```

---

### 步骤2：测试队列视图中的"从队列移除"功能

1. 打开"提取练习"队列（或任意队列）
2. 右键点击任意卡片
3. 查看菜单中是否有"从队列移除"选项（减号图标 ➖）

**预期结果：**
- ✅ 队列视图应该有"从队列移除"选项
- ✅ "全部闪卡"视图不应该有"从队列移除"选项

**如果队列视图中没有"从队列移除"选项：**
- 请提供队列视图的右键菜单日志
- 日志应该包含 `[CardBrowser] 当前数据源:` 和 `[CardBrowser] getSupportedActions 返回的动作数量:`

---

## 可能的问题和解决方案

### 问题1：卡片不在 Riff 中

**症状：**
```
[batchDelete] Riff 中存在的卡片数量: 0
[batchDelete] 这些卡片不在 Riff 中，无法删除
```

**原因：**
- 这4张卡片可能从未添加到 Riff 中
- 或者已经被删除，但缓存没有更新

**解决方案：**
1. 清除缓存：在浏览器控制台运行
   ```javascript
   const browserService = await import('./src/ui/browser/browserService.js');
   browserService.invalidateCardCache();
   ```
2. 强制刷新：点击浏览器视图的"强制刷新"按钮
3. 如果卡片仍然显示，说明这些卡片是"幽灵卡片"，需要手动清理数据库

---

### 问题2：删除后卡片仍然显示

**症状：**
```
[batchDelete] 实际删除的卡片数量: 4
[CardBrowser] 删除卡片后清除缓存
```
但卡片仍然显示在列表中。

**原因：**
- 缓存清除失败
- 数据重新加载失败

**解决方案：**
1. 手动刷新页面（F5）
2. 重新打开浏览器视图
3. 检查浏览器控制台是否有错误日志

---

### 问题3：队列视图中没有"从队列移除"选项

**症状：**
队列视图的右键菜单中没有"从队列移除"选项。

**原因：**
- 数据源的 `getSupportedActions()` 没有返回 `remove-from-current-queue` 操作
- 或者菜单渲染逻辑有问题

**解决方案：**
1. 检查日志中的数据源类型：
   ```
   [CardBrowser] 当前数据源: ...
   [CardBrowser] 数据源 ID: ...
   ```
2. 如果数据源是 `DeckDataSource`，说明你在"全部闪卡"视图中，不是队列视图
3. 如果数据源是队列数据源（如 `RetrievalDataSource`），但没有"从队列移除"选项，请提供完整的日志

---

## 编译状态

✅ **编译成功**

```bash
npm run build
# ✓ 250 modules transformed.
# ✓ built in 7.30s
```

---

## 下一步行动

1. **重新加载插件**
   - 关闭并重新打开思源笔记
   - 或在插件管理中禁用后重新启用插件

2. **测试删除功能**
   - 尝试删除这4张空白卡片
   - 查看浏览器控制台日志
   - 确认卡片是否被删除

3. **测试队列视图**
   - 打开任意队列（提取练习、渐进学习、刻意练习）
   - 右键点击卡片
   - 确认是否有"从队列移除"选项（减号图标 ➖）

4. **报告结果**
   - 如果删除成功，问题解决
   - 如果删除失败，提供完整的控制台日志
   - 如果队列视图中没有"从队列移除"选项，提供队列视图的右键菜单日志

---

## 相关文档

- `BROWSER_DELETE_MENU_FIX_SUMMARY.md` - 删除功能实现总结
- `DIAGNOSE_MISSING_CARDS.md` - 4张空白卡片诊断指南
- `BROWSER_DELETE_MENU_ANALYSIS.md` - 删除功能分析报告
