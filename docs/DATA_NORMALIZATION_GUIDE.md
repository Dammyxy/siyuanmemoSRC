# 数据规范化指南

## 问题：混合类型数据

你的插件数据中存在混合类型的卡片对象：

```json
{
  "id": "...",
  "blockId": "...",        // ← FSRSCard 字段（小写）
  "deckID": "...",         // ← QueueItem 字段（大写）
  "due": 1770174073426,
  // ...
}
```

这些混合类型数据是历史遗留问题，会导致：
- 类型检查混乱
- 数据不一致
- 潜在的 bug

## 解决方案：自动数据规范化

### 方案 1：自动规范化（已实现）✅

插件现在会在启动时自动规范化所有混合类型数据：

1. **加载数据时检测**：
   - 检测是否有 `deckID` 字段（QueueItem 特征）
   - 检测是否使用大写字段（`blockID`, `cardID`）
   - 检测是否缺少扩展字段（`priority`, `type`, `tags`）

2. **自动规范化**：
   - 移除 QueueItem 特有字段（`deckID`）
   - 统一使用小写字段（`blockId`, `cardId`）
   - 填充缺失的扩展字段

3. **自动保存**：
   - 如果有卡片被规范化，自动保存到磁盘
   - 下次启动时就是纯净的 FSRSCard 数据

### 使用方法

**只需重启思源笔记！**

1. **关闭思源笔记**
2. **重新打开思源笔记**
3. **查看控制台日志**：

```
[FSRS] Loaded 100 cards (msgpack)
[FSRS] 🔧 Normalized 15 mixed-type cards, saving...
[FSRS] Saved 100 cards (msgpack)
```

4. **完成！** 混合类型数据已被清理

### 验证数据已规范化

重启思源笔记后，再次查看控制台：

```
[FSRS] Loaded 100 cards (msgpack)
```

如果没有看到 "Normalized X mixed-type cards" 消息，说明数据已经完全规范化了！

## 方案 2：手动清理（备用）

如果自动规范化失败，可以手动清理：

### 步骤 1：备份数据

```bash
# 备份插件数据目录
cp -r "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs" "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs.backup"
```

### 步骤 2：删除旧数据文件

```bash
# 删除 msgpack 文件（会触发从 JSON 重新迁移）
rm "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs/cards.msgpack"
```

### 步骤 3：重启思源笔记

插件会从 `cards.json` 重新加载数据，并自动规范化。

## 规范化规则

### 移除的字段

- `deckID` - QueueItem 特有字段，FSRSCard 不需要

### 统一的字段命名

| 旧字段（大写） | 新字段（小写） |
|--------------|--------------|
| `blockID`    | `blockId`    |
| `cardID`     | `cardId`     |

### 填充的默认值

| 字段 | 默认值 | 说明 |
|-----|-------|-----|
| `priority` | `50` | 默认优先级 |
| `type` | `0` (Item) | 默认卡片类型 |
| `tags` | `[]` | 空标签数组 |
| `leechCount` | `0` | 难点计数 |
| `isLeech` | `false` | 不是难点 |
| `skipped` | `false` | 未跳过 |
| `createdAt` | `Date.now()` | 当前时间 |
| `updatedAt` | `Date.now()` | 当前时间 |

## 规范化后的数据格式

### 规范化前（混合类型）

```json
{
  "id": "20260203222457-raq2sfs",
  "blockId": "20260203222457-raq2sfs",
  "deckID": "20230218211946-2kw8jgx",  // ← 会被移除
  "due": 1770174073426,
  "stability": 0,
  "difficulty": 0,
  "state": 0,
  "reps": 0,
  "lapses": 0,
  "lastReview": -62135596800000,
  "elapsedDays": 0,
  "scheduledDays": 0
  // 缺少扩展字段
}
```

### 规范化后（纯 FSRSCard）

```json
{
  "id": "20260203222457-raq2sfs",
  "blockId": "20260203222457-raq2sfs",
  // deckID 已被移除 ✅
  "due": 1770174073426,
  "stability": 0,
  "difficulty": 0,
  "state": 0,
  "reps": 0,
  "lapses": 0,
  "lastReview": -62135596800000,
  "elapsedDays": 0,
  "scheduledDays": 0,
  // 扩展字段已填充 ✅
  "priority": 50,
  "type": 0,
  "tags": [],
  "leechCount": 0,
  "isLeech": false,
  "skipped": false,
  "createdAt": 1738771119286,
  "updatedAt": 1738771119286
}
```

## 常见问题

### Q: 规范化会丢失数据吗？

**A:** 不会。规范化只是：
- 移除不需要的字段（`deckID`）
- 统一字段命名（大写→小写）
- 填充缺失的字段（使用合理的默认值）

所有重要的 FSRS 数据（due, stability, difficulty 等）都会保留。

### Q: 规范化需要多长时间？

**A:** 非常快，通常在 1 秒内完成。即使有 1000 张卡片，也只需要几秒钟。

### Q: 规范化后可以回滚吗？

**A:** 可以。如果你备份了数据目录，可以随时恢复：

```bash
# 恢复备份
rm -rf "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs"
cp -r "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs.backup" "H:/SiYuanXY/data/plugins/siyuan-plugin-fsrs"
```

### Q: 规范化会影响复习记录吗？

**A:** 不会。复习记录存储在单独的日志文件中（`logs/` 目录），不受影响。

### Q: 为什么会出现混合类型数据？

**A:** 历史原因：
1. 旧版本插件使用 QueueItem 格式（大写字段）
2. 新版本使用 FSRSCard 格式（小写字段）
3. 数据迁移不完整，导致混合类型

现在的自动规范化功能会彻底解决这个问题。

## 技术细节

### 规范化逻辑

```typescript
private normalizeCard(card: any): FSRSCard {
    // 1. 处理大小写变体
    const id = card.id || card.cardID || card.cardId;
    const blockId = card.blockId || card.blockID;
    
    // 2. 构造纯 FSRSCard（移除 deckID）
    const normalized: FSRSCard = {
        id: String(id || blockId),
        blockId: String(blockId || id),
        // ... 其他字段
    };
    
    return normalized;
}
```

### 检测逻辑

```typescript
private wasCardNormalized(original: any, normalized: FSRSCard): boolean {
    // 检查是否有 QueueItem 特征
    const hadDeckID = 'deckID' in original;
    
    // 检查是否使用大写字段
    const hadUpperCase = ('blockID' in original) || ('cardID' in original);
    
    // 检查是否缺少扩展字段
    const lackedExtendedFields = 
        !('priority' in original) ||
        !('type' in original) ||
        !('tags' in original);
    
    return hadDeckID || hadUpperCase || lackedExtendedFields;
}
```

## 总结

混合类型数据现在会被自动清理：

1. ✅ **自动检测**：启动时自动检测混合类型数据
2. ✅ **自动规范化**：移除不需要的字段，填充缺失的字段
3. ✅ **自动保存**：规范化后自动保存到磁盘
4. ✅ **零配置**：无需手动操作，重启即可

**下次重启思源笔记，混合类型数据就会消失！**

---

**更新日期**：2026-02-05  
**相关文档**：
- `SRS_BROWSER_DATA_FIX_SUMMARY.md` - 字段缺失修复
- `SRS_BROWSER_MIXED_TYPE_FIX.md` - 混合类型修复
- `DATA_NORMALIZATION_GUIDE.md` - 数据规范化指南（本文档）
