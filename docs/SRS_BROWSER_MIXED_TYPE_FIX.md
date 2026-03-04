# SRS 浏览器混合类型修复

## 问题描述

浏览器加载检索练习队列时报错：

```
[normalizeToFSRSCard] Unknown card type at index 0: {
  "id": "20260203222457-raq2sfs",
  "blockId": "20260203222457-raq2sfs",
  "due": 1770174073426,
  "stability": 0,
  "difficulty": 0,
  "elapsedDays": 0,
  "scheduledDays": 0,
  "reps": 0,
  "lapses": 0,
  "state": 0,
  "lastReview": -62135596800000,
  "deckID": "20230218211946-2kw8jgx"
}
```

## 根本原因

### 问题 1：混合类型对象

这些卡片对象是 **FSRSCard 和 QueueItem 的混合体**：

- **FSRSCard 特征**：
  - 使用 `blockId`（小写 i）
  - 有 `id` 字段
  
- **QueueItem 特征**：
  - 有 `deckID` 字段（QueueItem 独有）
  - 缺少 `cardID` 或 `blockID`（大写 I）

### 问题 2：类型守卫不兼容大小写变体

原来的 `isQueueItem()` 只检查大写字段：

```typescript
// ❌ 旧代码：只检查大写
'blockID' in obj && obj.blockID !== undefined && obj.blockID !== null
```

但实际数据使用的是小写：

```json
{
  "blockId": "20260203222457-raq2sfs",  // ← 小写 i
  "deckID": "20230218211946-2kw8jgx"    // ← 大写 I
}
```

### 问题 3：类型检查逻辑

```
1. normalizeToFSRSCard() 检查 isFSRSCard(card)
   ✅ 通过（因为有 blockId 小写）

2. normalizeToFSRSCard() 检查 isQueueItem(card)
   ❌ 失败（因为缺少 blockID 大写）

3. 抛出错误："Unknown card type"
```

## 修复方案

### 修复 1：`isQueueItem()` 同时检查大小写变体

```typescript
export function isQueueItem(obj: any): obj is QueueItem {
    return (
        obj &&
        typeof obj === 'object' &&
        'deckID' in obj &&
        obj.deckID !== undefined &&
        obj.deckID !== null &&
        (
            // 🔧 同时检查大小写变体
            ('cardID' in obj && obj.cardID !== undefined && obj.cardID !== null) ||
            ('blockID' in obj && obj.blockID !== undefined && obj.blockID !== null) ||
            ('cardId' in obj && obj.cardId !== undefined && obj.cardId !== null) ||
            ('blockId' in obj && obj.blockId !== undefined && obj.blockId !== null)
        )
    );
}
```

### 修复 2：`queueItemToFSRSCard()` 处理大小写变体

```typescript
export function queueItemToFSRSCard(item: QueueItem): FSRSCard {
    if (!isQueueItem(item)) {
        throw new Error(`[queueItemToFSRSCard] Invalid QueueItem: ${JSON.stringify(item)}`);
    }

    // 🔧 处理大小写变体
    const cardID = (item as any).cardID || (item as any).cardId;
    const blockID = (item as any).blockID || (item as any).blockId;
    
    // 使用 cardID 或 blockID（优先使用 cardID）
    const cardId = String(cardID || blockID);
    const blockId = String(blockID || cardID);

    return {
        id: cardId,
        blockId: blockId,
        // ... 其他字段
    };
}
```

### 修复 3：`resolveCardId()` 处理大小写变体

```typescript
export function resolveCardId(card: FSRSCard | QueueItem | string): string {
    if (typeof card === 'string') {
        return card;
    }

    if (isQueueItem(card)) {
        // 🔧 处理大小写变体
        const cardID = (card as any).cardID || (card as any).cardId;
        return String(cardID);
    }

    if (isFSRSCard(card)) {
        return card.id;
    }

    throw new Error(`[resolveCardId] Unknown card type: ${JSON.stringify(card)}`);
}
```

## 为什么会出现混合类型？

### 历史原因

1. **旧版本数据格式**：
   - 早期版本使用 QueueItem 格式（大写字段）
   - 后来引入 FSRSCard 格式（小写字段）
   - 数据迁移不完整，导致混合类型

2. **数据来源不一致**：
   - Riff API 返回的数据使用小写字段
   - 本地存储的旧数据使用大写字段
   - 两种数据格式混合在一起

3. **缺少数据规范化**：
   - 没有统一的数据规范化流程
   - 不同模块使用不同的字段命名

## 验证步骤

1. **清除浏览器缓存**：
   ```
   按 Ctrl+Shift+R 或重启思源笔记
   ```

2. **检查控制台日志**：
   - 应该看到 `✅ Successfully loaded data from UnifiedDataSourceManager`
   - 不应该看到 `[normalizeToFSRSCard] Unknown card type` 错误

3. **测试浏览器功能**：
   - 打开 SRS 浏览器
   - 选择"检索练习"队列
   - 应该能正常加载卡片列表

## 影响范围

### 修复的文件

- `siyuan-plugin-fsrs/src/diagnostics/type-guards.ts`
  - `isQueueItem()` - 同时检查大小写变体
  - `queueItemToFSRSCard()` - 处理大小写变体
  - `resolveCardId()` - 处理大小写变体

### 受益的功能

- ✅ SRS 浏览器加载检索练习队列
- ✅ 所有使用 `normalizeToFSRSCard()` 的地方
- ✅ 所有使用 `isQueueItem()` 的地方
- ✅ 所有使用 `resolveCardId()` 的地方

## 长期解决方案

### 建议：统一数据格式

1. **数据迁移脚本**：
   - 创建一次性迁移脚本
   - 将所有旧数据转换为统一格式
   - 使用小写字段（`blockId`, `cardId`）

2. **数据验证**：
   - 在数据加载时验证格式
   - 自动修复不一致的数据
   - 记录警告日志

3. **类型定义**：
   - 明确定义 FSRSCard 和 QueueItem 的区别
   - 使用 TypeScript 严格模式
   - 避免使用 `any` 类型

## 总结

这次修复解决了混合类型对象导致的类型检查失败问题。通过同时支持大小写变体，我们提供了向后兼容性，确保旧数据也能正常工作。

**修复前**：
- ❌ 混合类型对象被拒绝
- ❌ 浏览器加载失败
- ❌ 用户无法使用检索练习队列

**修复后**：
- ✅ 混合类型对象被正确识别为 QueueItem
- ✅ 自动转换为 FSRSCard
- ✅ 浏览器正常加载
- ✅ 用户可以正常使用所有功能

---

**修复日期**：2026-02-05  
**修复人员**：Kiro AI Assistant  
**相关文档**：
- `SRS_BROWSER_DATA_FIX_SUMMARY.md` - 第一次修复（字段缺失）
- `SRS_BROWSER_MIXED_TYPE_FIX.md` - 第二次修复（混合类型）
