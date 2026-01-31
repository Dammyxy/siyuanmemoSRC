# 修复：提取练习队列过滤 Topic 卡片

## 问题描述

用户报告：
- 可以将 Topic 类型的卡片加入【提取练习】队列
- 提取练习队列应该只接受 Item 类型的卡片

## 根本原因

在 `BlockMenuHandler.buildDrillCardsFromBlockIds()` 方法中，**没有过滤卡片类型**：

```typescript
// 旧代码
const rows = await sql(
  `SELECT block_id, value FROM attributes 
   WHERE name = '${ATTR_CARD_ID}' 
   AND block_id IN (${idsStr}) 
   AND value != ''`
);

for (const row of rows) {
  // ❌ 直接添加所有卡片，没有检查类型
  result.push({
    cardID,
    blockID,
    // ...
  });
}
```

**问题**：
- SQL 查询只获取 `custom-fsrs-card-id` 属性
- 没有查询 `custom-fsrs-card-type` 属性
- 没有过滤 Topic 卡片

**影响**：
- ❌ Topic 卡片可以加入提取练习队列
- ❌ 违反了 Topic/Item 的设计原则
  - Topic = 纯阅读材料，不应该有问答练习
  - Item = 问答卡片，适合提取练习

## 设计原则

### Topic vs Item

**Topic（主题）**：
- 纯阅读材料
- 使用 A-Factor 算法
- 适合渐进阅读、神经漫游
- **不适合**提取练习（没有问答结构）

**Item（卡片）**：
- 问答卡片
- 使用 FSRS 算法
- 适合提取练习、刻意练习
- 有明确的问题和答案

### 队列类型限制

| 队列类型 | 接受 Topic | 接受 Item | 说明 |
|---------|-----------|----------|------|
| **提取练习** | ❌ | ✅ | 只接受 Item（问答卡片） |
| **刻意练习** | ❌ | ✅ | 只接受 Item（问答卡片） |
| **筛选复习** | ❌ | ✅ | 只接受 Item（问答卡片） |
| **神经漫游** | ✅ | ✅ | 接受所有类型 |
| **渐进学习** | ✅ | ❌ | 只接受 Topic（阅读材料） |

## 修复方案

### 修改：添加卡片类型过滤

在 `BlockMenuHandler.buildDrillCardsFromBlockIds()` 中：

```typescript
// 🆕 查询卡片属性，包括卡片类型
const rows = await sql(`
  SELECT 
    a1.block_id, 
    a1.value as card_id,
    a2.value as card_type
  FROM attributes a1
  LEFT JOIN attributes a2 ON a1.block_id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
  WHERE a1.name = '${ATTR_CARD_ID}' 
    AND a1.block_id IN (${idsStr}) 
    AND a1.value != ''
`);

for (const row of rows) {
  const blockID = row.block_id || row.blockID;
  const cardID = row.card_id || row.value || row.cardID;
  const cardType = row.card_type;
  
  if (!blockID || !cardID || seen.has(cardID)) {
    continue;
  }
  
  // 🆕 过滤：只接受 Item 类型的卡片（或未标记类型的卡片）
  // Topic 卡片不应该加入提取练习队列
  if (cardType === 'topic') {
    console.log(`[BlockMenuHandler] Skipping Topic card: ${blockID}`);
    continue;
  }
  
  seen.add(cardID);
  result.push({
    cardID,
    blockID,
    // ...
  });
}

console.log(`[BlockMenuHandler] Built ${result.length} Item cards from ${uniqueIds.length} blocks`);
```

**改进**：
- ✅ 使用 LEFT JOIN 查询卡片类型
- ✅ 过滤 Topic 卡片（`cardType === 'topic'`）
- ✅ 允许未标记类型的卡片（向后兼容）
- ✅ 添加日志记录过滤情况

## 修复后的行为

### 场景 1：添加 Item 卡片

1. 用户选择 Item 卡片（包含 `::` 或 `==...==`）
2. 右键 → 加入提取练习队列
3. SQL 查询返回 `card_type = 'item'`
4. **卡片被添加到队列**
5. 控制台显示：
   ```
   [BlockMenuHandler] Built 1 Item cards from 1 blocks
   ```

### 场景 2：添加 Topic 卡片

1. 用户选择 Topic 卡片（纯阅读材料）
2. 右键 → 加入提取练习队列
3. SQL 查询返回 `card_type = 'topic'`
4. **卡片被过滤，不添加到队列**
5. 控制台显示：
   ```
   [BlockMenuHandler] Skipping Topic card: <blockId>
   [BlockMenuHandler] Built 0 Item cards from 1 blocks
   ```

### 场景 3：混合添加

1. 用户选择 3 张卡片：2 张 Item + 1 张 Topic
2. 右键 → 加入提取练习队列
3. SQL 查询返回 3 行数据
4. **只有 2 张 Item 卡片被添加**
5. 控制台显示：
   ```
   [BlockMenuHandler] Skipping Topic card: <blockId>
   [BlockMenuHandler] Built 2 Item cards from 3 blocks
   ```

### 场景 4：未标记类型的卡片

1. 用户选择未标记类型的卡片（`card_type = null`）
2. 右键 → 加入提取练习队列
3. SQL 查询返回 `card_type = null`
4. **卡片被添加到队列**（向后兼容）
5. 控制台显示：
   ```
   [BlockMenuHandler] Built 1 Item cards from 1 blocks
   ```

## 测试验证

### 测试 1：Item 卡片

1. 创建 Item 卡片：`【 item 测试::答案】`
2. 右键 → 加入提取练习队列
3. 检查控制台，应该看到：
   ```
   [BlockMenuHandler] Built 1 Item cards from 1 blocks
   ```
4. 打开提取练习，卡片应该出现

### 测试 2：Topic 卡片

1. 创建 Topic 卡片：`【 topic 这是阅读材料】`
2. 右键 → 加入提取练习队列
3. 检查控制台，应该看到：
   ```
   [BlockMenuHandler] Skipping Topic card: <blockId>
   [BlockMenuHandler] Built 0 Item cards from 1 blocks
   ```
4. 打开提取练习，卡片不应该出现

### 测试 3：混合卡片

1. 创建 2 张 Item + 1 张 Topic
2. 全选 → 右键 → 加入提取练习队列
3. 检查控制台，应该看到：
   ```
   [BlockMenuHandler] Skipping Topic card: <blockId>
   [BlockMenuHandler] Built 2 Item cards from 3 blocks
   ```
4. 打开提取练习，只有 2 张 Item 卡片

## 其他队列的处理

### 需要类似过滤的队列

1. **刻意练习队列**（Final Drill）
   - 应该只接受 Item 卡片
   - 需要添加相同的过滤逻辑

2. **筛选复习队列**（Filter Group）
   - 应该只接受 Item 卡片
   - 需要添加相同的过滤逻辑

### 不需要过滤的队列

1. **神经漫游队列**（Neural Roam）
   - 接受所有类型的卡片
   - Topic 和 Item 都可以漫游

2. **渐进学习队列**（Incremental Learning）
   - 只接受 Topic 卡片
   - 需要**反向过滤**（只接受 Topic，拒绝 Item）

## 相关文件

### 修改的文件
- `siyuan-plugin-fsrs/src/services/BlockMenuHandler.ts` - 添加 Topic 卡片过滤

### 相关文档
- `siyuan-plugin-fsrs/docs/FIX_AUTO_CARD_TYPE_DETECTION_V2.md` - 卡片类型检测
- `siyuan-plugin-fsrs/docs/TOPIC_ITEM_DETECTION_TRIGGERS.md` - 类型检测触发方式

## 注意事项

1. **向后兼容**：未标记类型的卡片仍然可以加入队列
2. **性能优化**：使用 LEFT JOIN 一次查询，避免多次查询
3. **日志记录**：记录过滤的 Topic 卡片数量，方便调试
4. **用户反馈**：可以考虑添加提示消息，告知用户 Topic 卡片被过滤

## 未来改进

1. **用户提示**：
   - 当 Topic 卡片被过滤时，显示提示消息
   - 例如："已过滤 1 张 Topic 卡片，提取练习只接受 Item 卡片"

2. **UI 禁用**：
   - 在右键菜单中，对 Topic 卡片禁用"加入提取练习队列"选项
   - 显示灰色并提示"Topic 卡片不支持提取练习"

3. **批量过滤**：
   - 在其他队列（刻意练习、筛选复习）中应用相同的过滤逻辑
   - 统一过滤函数，避免重复代码

## 修复日期

- **2026-01-31**：添加 Topic 卡片过滤逻辑
