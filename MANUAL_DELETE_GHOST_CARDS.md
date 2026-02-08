# 手动删除幽灵卡片指南

## 问题卡片
- `20260203222457-raq2sfs`
- `20260203222510-lg626ip`
- `20260205105152-w57h904`
- `20260205110918-j7cej9r`

这些卡片即使使用强制删除（重置后删除）也无法删除，需要手动清理。

## 方案1：使用浏览器控制台脚本（推荐）

### 步骤1：打开浏览器控制台
1. 在思源笔记中按 `F12` 打开开发者工具
2. 切换到 `Console`（控制台）标签

### 步骤2：运行诊断脚本

先查看这些卡片的详细信息：

```javascript
// 诊断脚本：查看卡片详细信息
const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;

if (!riff) {
  console.error('❌ 找不到 FSRS 插件或 Riff API');
} else {
  console.log('✅ 找到 FSRS 插件');
  
  // 获取卡片详细信息
  const cards = await riff.getRiffCardsByBlockIDs(blockIds);
  
  console.log('📊 卡片数量:', cards.length);
  console.log('📋 卡片详细信息:');
  
  cards.forEach((card, index) => {
    console.log(`\n卡片 ${index + 1}:`, {
      id: card.id,
      blockId: card.id,
      deckID: card.riffCard?.deckID,
      type: card.riffCard?.type,
      state: card.riffCard?.state,
      due: card.riffCard?.due,
      reps: card.riffCard?.reps,
      lapses: card.riffCard?.lapses,
    });
  });
}
```

### 步骤3：尝试方法A - 使用 Riff 内部方法

```javascript
// 方法A：使用 Riff 的内部删除方法
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
        console.log('需要使用方法B（SQL直接删除）');
      }
    }
  } catch (err) {
    console.error('❌ 操作失败:', err);
  }
}
```

### 步骤4：如果方法A失败，使用方法B - SQL直接删除

```javascript
// 方法B：使用 SQL 直接删除 Riff 数据
const blockIds = [
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
];

const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');

// 注意：思源笔记的 Riff API 可能没有直接的 SQL 删除接口
// 我们需要检查 Riff 对象的可用方法
console.log('🔍 检查 Riff API 可用方法:');
console.log(Object.keys(plugin.riff).filter(k => typeof plugin.riff[k] === 'function'));

// 如果有 SQL 相关方法，尝试使用
// 否则需要使用方案2（手动清理数据库）
```

## 方案2：手动清理 Riff 数据库（终极方案）

如果浏览器控制台脚本都失败了，需要直接操作数据库。

### 步骤1：备份数据

**⚠️ 重要：在操作数据库前必须备份！**

1. 关闭思源笔记
2. 找到思源笔记的数据目录（通常是 `工作空间/data/`）
3. 备份整个 `data/storage/riff/` 目录
4. 建议同时备份整个工作空间

### 步骤2：找到 Riff 数据库文件

Riff 数据库通常位于：
```
工作空间/data/storage/riff/
```

可能的文件名：
- `riff.db`
- `riff.sqlite`
- 或其他 `.db` / `.sqlite` 文件

### 步骤3：使用 SQLite 工具打开数据库

推荐工具：
- **DB Browser for SQLite**（免费，跨平台）
  - 下载地址：https://sqlitebrowser.org/
- **SQLiteStudio**（免费，跨平台）
  - 下载地址：https://sqlitestudio.pl/

### 步骤4：查询卡片数据

在 SQLite 工具中执行查询：

```sql
-- 查看这些卡片的数据
SELECT * FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
```

### 步骤5：删除卡片数据

确认数据后，执行删除：

```sql
-- 删除这些卡片
DELETE FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
```

### 步骤6：验证删除结果

```sql
-- 验证是否删除成功
SELECT COUNT(*) FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
-- 应该返回 0
```

### 步骤7：保存并关闭数据库

1. 在 SQLite 工具中保存更改
2. 关闭数据库文件
3. 重新启动思源笔记

### 步骤8：验证插件功能

1. 打开 FSRS 插件的浏览器
2. 搜索这些卡片 ID
3. 确认它们不再出现

## 方案3：清除插件数据并重新初始化（最后手段）

如果上述方法都失败，可以考虑清除插件的所有数据并重新初始化。

**⚠️ 警告：这会删除所有 FSRS 学习记录！**

### 步骤1：导出重要数据

1. 导出所有卡片的学习记录（如果插件支持）
2. 记录当前的学习进度

### 步骤2：清除插件数据

1. 关闭思源笔记
2. 删除 `data/storage/riff/` 目录
3. 删除 `data/storage/petal/siyuan-plugin-fsrs/` 目录（如果存在）

### 步骤3：重新初始化

1. 重新启动思源笔记
2. FSRS 插件会自动重新初始化
3. 重新添加卡片到 Riff

## 预防措施

为了避免将来再次出现幽灵卡片：

### 1. 定期备份
- 定期备份 `data/storage/riff/` 目录
- 使用思源笔记的备份功能

### 2. 避免数据损坏
- 不要在插件运行时强制关闭思源笔记
- 不要手动编辑 Riff 数据库（除非必要）
- 确保磁盘空间充足

### 3. 使用数据完整性检查工具

可以创建一个定期检查脚本：

```javascript
// 数据完整性检查脚本
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

async function checkDataIntegrity() {
  console.log('🔍 开始数据完整性检查...');
  
  // 获取所有卡片
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
  
  // 检查损坏的卡片
  const brokenCards = allCards.filter(card => {
    const riffCard = card.riffCard || {};
    return (
      riffCard.type === null ||
      riffCard.type === undefined ||
      riffCard.state === null ||
      riffCard.state === undefined
    );
  });
  
  if (brokenCards.length > 0) {
    console.warn(`⚠️ 发现 ${brokenCards.length} 张损坏的卡片:`);
    brokenCards.forEach(card => {
      console.log(`  - ${card.id}`, {
        type: card.riffCard?.type,
        state: card.riffCard?.state,
      });
    });
  } else {
    console.log('✅ 所有卡片数据完整');
  }
  
  return brokenCards;
}

// 运行检查
checkDataIntegrity();
```

## 总结

1. **首选方案**：使用浏览器控制台脚本（方案1）
2. **备选方案**：手动清理数据库（方案2）
3. **最后手段**：清除插件数据并重新初始化（方案3）

**重要提醒：**
- 在操作数据库前一定要备份！
- 如果不确定，请先咨询技术支持
- 建议定期运行数据完整性检查脚本
