# 强制删除和队列移除功能修复总结

## 修复时间
2026-02-06

## 问题描述

### 问题1：幽灵卡片无法删除
4张 `type: null` 的问题卡片无法通过常规 `riff.removeRiffCards()` API 删除：
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

### 问题2："从当前队列移除"功能缺失
用户报告在浏览器右键菜单中没有"从当前队列移除"选项。

**原因分析：**
- 用户测试的是"全部闪卡"视图（`DeckDataSource`），不是队列视图
- "全部闪卡"视图不应该有"从队列移除"选项（因为它不是队列）
- 队列视图（提取练习、渐进学习、刻意练习）中应该有该选项

## 实施的修复

### 1. 强制删除功能

#### 修改 `browserService.ts` 中的 `batchDelete()` 函数

**文件：** `src/ui/browser/browserService.ts`

**修改内容：**
1. 添加 `options?: { force?: boolean }` 参数
2. 在常规删除失败时，自动尝试强制删除：
   - 步骤1：重置卡片（清除损坏的数据）
   - 步骤2：再次尝试删除
   - 步骤3：验证结果
3. 增强日志输出，便于调试

**关键代码：**
```typescript
export async function batchDelete(blockIds: string[], options?: { force?: boolean }): Promise<number> {
    // ... 常规删除逻辑 ...
    
    // 🆕 如果删除失败且启用强制模式，尝试重置后再删除
    if (actualDeleted === 0 && options?.force && remainingCards?.length > 0) {
        console.warn('[batchDelete] ⚠️ 常规删除失败，尝试强制删除（重置后删除）...');
        
        try {
            // 步骤1: 重置卡片（清除损坏的数据）
            await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
            
            // 步骤2: 再次尝试删除
            await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
            
            // 步骤3: 验证结果
            const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
            actualDeleted = blockIds.length - (finalCheck?.length || 0);
            
            if (actualDeleted > 0) {
                console.log('[batchDelete] ✅ 强制删除成功');
            } else {
                console.error('[batchDelete] ❌ 强制删除仍然失败，这些卡片可能需要手动清理数据库');
            }
        } catch (forceErr) {
            console.error('[batchDelete] 强制删除过程中出错:', forceErr);
        }
    }
    
    return actualDeleted;
}
```

#### 更新所有数据源以支持强制删除

**修改的文件：**
1. `src/ui/browser/datasource/DeckDataSource.ts`
2. `src/ui/browser/datasource/RetrievalDataSource.ts`
3. `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
4. `src/ui/browser/datasource/FinalDrillDataSource.ts`

**修改内容：**
在所有数据源的 `performAction()` 方法中，删除操作自动尝试强制删除：

```typescript
if (actionId === 'delete-card') {
  const blockIds = selectedRows.map(row => row.blockId);
  const { batchDelete } = await import('../browserService');
  
  // 第一次尝试：常规删除
  let deleted = await batchDelete(blockIds);
  
  // 如果删除失败，自动尝试强制删除
  if (deleted === 0 && blockIds.length > 0) {
    console.warn('[DataSource] 常规删除失败，自动尝试强制删除...');
    deleted = await batchDelete(blockIds, { force: true });
  }
  
  return deleted;
}
```

### 2. 验证"从队列移除"功能

#### 检查队列数据源

**已验证的数据源：**
1. ✅ `RetrievalDataSource` - 提取练习队列
2. ✅ `IncrementalLearningDataSource` - 渐进学习队列
3. ✅ `FinalDrillDataSource` - 刻意练习队列

**验证结果：**
所有队列数据源都正确返回了"从队列移除"操作：

```typescript
getSupportedActions(): CardBrowserAction[] {
  return [
    {
      id: 'remove-from-current-queue',
      label: '从队列移除',
      icon: 'iconMin',  // 减号图标 ➖
    },
    {
      id: 'delete-card',
      label: '删除卡片',
      icon: 'iconTrashcan',
      danger: true,
    },
    // ... 其他操作
  ];
}
```

#### 用户测试指南

**正确的测试方法：**
1. 打开浏览器
2. 点击左侧的队列视图（提取练习、渐进学习、刻意练习）
3. 右键点击任意卡片
4. 查看菜单中是否有"从队列移除"选项（减号图标 ➖）

**错误的测试方法：**
- ❌ 在"全部闪卡"视图中测试（这不是队列视图）
- ❌ 在"当前文档"视图中测试（这也不是队列视图）

## 编译状态

✅ 已成功编译（`npm run build` 完成）

**编译输出：**
```
✓ 250 modules transformed.
dist/index.css     28.44 kB │ gzip:   5.07 kB
dist/index.js   1,680.35 kB │ gzip: 479.38 kB
✓ built in 7.43s
```

## 验证结果

### 1. 强制删除功能 - ⚠️ 部分失败

**测试结果：**
- ✅ 强制删除逻辑已正确实现
- ✅ 自动尝试重置后删除
- ❌ 但这些幽灵卡片即使重置后也无法删除

**实际日志：**
```
[batchDelete] 开始删除卡片: ['20260203222457-raq2sfs']
[batchDelete] 强制删除模式: true
[batchDelete] ⚠️ 常规删除失败，尝试强制删除（重置后删除）...
[batchDelete] 步骤1: 重置卡片...
[batchDelete] ✅ 重置成功
[batchDelete] 步骤2: 再次尝试删除...
[batchDelete] 强制删除后实际删除数量: 0
[batchDelete] ❌ 强制删除仍然失败，这些卡片可能需要手动清理数据库
[batchDelete] 问题卡片 ID: ['20260203222457-raq2sfs']
```

**结论：**
这些卡片是真正的"幽灵卡片"，数据结构严重损坏，Riff API 完全无法识别它们。需要使用更底层的方法清理。

### 2. "从队列移除"功能
1. 打开浏览器
2. 点击左侧的"提取练习"队列（或其他队列）
3. 右键点击任意卡片
4. 查看菜单中是否有"从队列移除"选项（减号图标 ➖）
5. 点击该选项，验证卡片是否从队列中移除

## 临时解决方案（强制删除失败后）

由于这些幽灵卡片即使重置后也无法删除，需要使用更底层的方法。

**详细指南：** 请查看 `MANUAL_DELETE_GHOST_CARDS.md` 文件

### 快速方案：浏览器控制台脚本

1. 在思源笔记中按 `F12` 打开开发者工具
2. 切换到 `Console`（控制台）标签
3. 运行以下脚本：

```javascript
// 方法A：使用 Riff 内部方法强制删除
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
  console.error('❌ 找不到 FSRS 插件或 Riff API');
} else {
  console.log('🔧 开始删除卡片...');
  
  try {
    // 尝试1：直接删除
    console.log('尝试1: 直接删除...');
    await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
    
    // 验证
    const remaining = await riff.getRiffCardsByBlockIDs(blockIds);
    console.log('删除后剩余:', remaining.length);
    
    if (remaining.length === 0) {
      console.log('✅ 删除成功！');
    } else {
      console.log('⚠️ 直接删除失败，尝试重置后删除...');
      
      // 尝试2：重置后删除
      console.log('尝试2: 重置卡片...');
      await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
      console.log('✅ 重置成功');
      
      console.log('尝试2: 再次删除...');
      await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
      
      // 再次验证
      const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
      console.log('最终剩余:', finalCheck.length);
      
      if (finalCheck.length === 0) {
        console.log('✅ 重置后删除成功！');
      } else {
        console.log('❌ 重置后删除仍然失败');
        console.log('需要使用方法B（手动清理数据库）');
        console.log('详见 MANUAL_DELETE_GHOST_CARDS.md');
      }
    }
  } catch (err) {
    console.error('❌ 操作失败:', err);
  }
}
```

### 终极方案：手动清理数据库

如果浏览器控制台脚本也失败，需要直接操作 SQLite 数据库：

1. **备份数据**（⚠️ 必须！）
   - 关闭思源笔记
   - 备份 `data/storage/riff/` 目录

2. **使用 SQLite 工具**
   - 下载 DB Browser for SQLite：https://sqlitebrowser.org/
   - 打开 Riff 数据库文件

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

**详细步骤请参考：** `MANUAL_DELETE_GHOST_CARDS.md`

## 技术细节

### 强制删除的工作原理

1. **常规删除流程：**
   ```
   检查卡片存在 → 调用 removeRiffCards() → 验证删除结果
   ```

2. **强制删除流程：**
   ```
   常规删除失败 → 重置卡片（清除损坏数据） → 再次删除 → 验证结果
   ```

3. **为什么重置可以修复问题：**
   - 重置会清除卡片的所有 FSRS 数据
   - 将卡片恢复到"新卡"状态
   - 清除可能导致删除失败的损坏字段（如 `type: null`）
   - 重置后的卡片数据结构完整，可以被正常删除

### 缓存更新策略

删除成功后，自动更新缓存：
```typescript
if (actualDeleted > 0) {
    cardCache.removeCards(blockIds);
    console.log('[batchDelete] 缓存已更新，移除了', actualDeleted, '张卡片');
}
```

这确保了：
- UI 立即反映删除结果
- 不需要手动刷新浏览器
- 避免显示已删除的卡片

## 相关文档

- `GHOST_CARDS_DIAGNOSIS.md` - 幽灵卡片诊断报告
- `DELETE_FUNCTION_ENHANCED.md` - 删除功能增强文档
- `BROWSER_DELETE_MENU_FIX_SUMMARY.md` - 浏览器删除菜单修复总结
- `INCREMENTAL_LEARNING_TYPE_NULL_ROOT_CAUSE.md` - Type null 问题根源分析

## 下一步

### 1. 清理幽灵卡片

由于强制删除失败，需要使用手动方法：

**推荐步骤：**
1. 先尝试浏览器控制台脚本（见上方"快速方案"）
2. 如果脚本失败，使用 SQLite 工具手动清理数据库（见上方"终极方案"）
3. 详细指南请查看 `MANUAL_DELETE_GHOST_CARDS.md`

### 2. 验证"从队列移除"功能

在队列视图（非"全部闪卡"）中测试：
1. 打开浏览器
2. 点击左侧的"提取练习"队列（或其他队列）
3. 右键点击任意卡片
4. 查看菜单中是否有"从队列移除"选项（减号图标 ➖）

### 3. 预防将来出现幽灵卡片

1. **定期备份**
   - 定期备份 `data/storage/riff/` 目录
   - 使用思源笔记的备份功能

2. **数据完整性检查**
   - 定期运行数据完整性检查脚本（见 `MANUAL_DELETE_GHOST_CARDS.md`）
   - 及时发现和修复损坏的卡片

3. **避免数据损坏**
   - 不要在插件运行时强制关闭思源笔记
   - 确保磁盘空间充足
