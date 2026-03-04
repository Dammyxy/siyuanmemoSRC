# 幽灵卡片最终解决方案

## 问题总结

4张卡片无法通过任何 Riff API 删除，包括：
- 常规删除 ❌
- 强制删除（重置后删除）❌

**问题卡片：**
- `20260203222457-raq2sfs`
- `20260203222510-lg626ip`
- `20260205105152-w57h904`
- `20260205110918-j7cej9r`

## 解决方案

### 方案1：浏览器控制台脚本（推荐先尝试）

1. 在思源笔记中按 `F12` 打开开发者工具
2. 切换到 `Console`（控制台）标签
3. 复制粘贴以下脚本并回车：

```javascript
const blockIds = ['20260203222457-raq2sfs', '20260203222510-lg626ip', '20260205105152-w57h904', '20260205110918-j7cej9r'];
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

if (!riff) {
  console.error('❌ 找不到 FSRS 插件');
} else {
  console.log('🔧 开始删除...');
  try {
    await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
    const remaining = await riff.getRiffCardsByBlockIDs(blockIds);
    if (remaining.length === 0) {
      console.log('✅ 删除成功！');
    } else {
      console.log('⚠️ 尝试重置后删除...');
      await riff.resetRiffCards('deck', BUILTIN_DECK_ID, BUILTIN_DECK_ID, blockIds);
      await riff.removeRiffCards(BUILTIN_DECK_ID, blockIds);
      const finalCheck = await riff.getRiffCardsByBlockIDs(blockIds);
      console.log(finalCheck.length === 0 ? '✅ 成功！' : '❌ 失败，需要使用方案2');
    }
  } catch (err) {
    console.error('❌ 失败:', err);
  }
}
```

### 方案2：手动清理数据库（如果方案1失败）

#### 步骤1：备份数据（⚠️ 必须！）
1. 关闭思源笔记
2. 找到工作空间的 `data/storage/riff/` 目录
3. 复制整个目录作为备份

#### 步骤2：下载 SQLite 工具
- 下载 DB Browser for SQLite：https://sqlitebrowser.org/
- 安装并打开

#### 步骤3：打开数据库
1. 在 DB Browser 中点击 "Open Database"
2. 找到并打开 `data/storage/riff/` 目录中的数据库文件（通常是 `riff.db`）

#### 步骤4：执行删除
1. 点击 "Execute SQL" 标签
2. 输入以下 SQL：

```sql
DELETE FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
```

3. 点击执行按钮（▶️）
4. 点击 "Write Changes" 保存

#### 步骤5：验证
执行查询验证：

```sql
SELECT COUNT(*) FROM riff_cards 
WHERE block_id IN (
  '20260203222457-raq2sfs',
  '20260203222510-lg626ip',
  '20260205105152-w57h904',
  '20260205110918-j7cej9r'
);
```

应该返回 `0`

#### 步骤6：重启
1. 关闭 DB Browser
2. 重新启动思源笔记
3. 在 FSRS 浏览器中验证卡片已删除

## 预防措施

### 1. 定期备份
```bash
# 建议每周备份一次
cp -r data/storage/riff/ backups/riff_$(date +%Y%m%d)/
```

### 2. 数据完整性检查

定期在浏览器控制台运行：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const riff = plugin?.riff;
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';

async function checkIntegrity() {
  let page = 1, allCards = [];
  while (true) {
    const data = await riff.getRiffCards(BUILTIN_DECK_ID, page, 500);
    if (!data?.blocks || data.blocks.length === 0) break;
    allCards.push(...data.blocks);
    if (page >= data.pageCount) break;
    page++;
  }
  
  const broken = allCards.filter(c => {
    const r = c.riffCard || {};
    return r.type === null || r.type === undefined || r.state === null;
  });
  
  console.log(`📊 总卡片: ${allCards.length}, 损坏: ${broken.length}`);
  if (broken.length > 0) {
    console.warn('⚠️ 损坏的卡片:', broken.map(c => c.id));
  }
  return broken;
}

checkIntegrity();
```

### 3. 避免数据损坏
- ✅ 正常关闭思源笔记
- ✅ 确保磁盘空间充足
- ❌ 不要强制结束进程
- ❌ 不要手动编辑数据库（除非必要）

## 相关文档

- `MANUAL_DELETE_GHOST_CARDS.md` - 详细的手动删除指南
- `FORCE_DELETE_AND_QUEUE_REMOVE_FIX.md` - 强制删除功能实现总结
- `GHOST_CARDS_DIAGNOSIS.md` - 幽灵卡片诊断报告

## 需要帮助？

如果上述方法都失败，请：
1. 导出所有日志
2. 备份数据库文件
3. 联系技术支持
