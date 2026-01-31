# 修复：卡片浏览器队列过滤 Topic 卡片

## 问题描述

用户报告：
- 在卡片浏览器中，可以将 Topic 类型的卡片加入【提取练习】队列
- 之前的修复只处理了右键菜单的"块练习"功能，但没有处理卡片浏览器的"加入队列"功能

## 根本原因

之前的修复（`FIX_RETRIEVAL_QUEUE_TOPIC_FILTER.md`）只修改了 `BlockMenuHandler.buildDrillCardsFromBlockIds()` 方法，该方法用于：
- 右键菜单的"块练习"功能
- 文档树的"块练习"功能

但是**卡片浏览器**使用的是不同的代码路径：
1. 数据源：`DeckDataSource`
2. 菜单动作：`MenuActions.addToQueue()`
3. 队列：`RetrievalPracticeQueue`

在 `MenuActions.addToQueue()` 方法中，**没有过滤 Topic 卡片**：

```typescript
// 旧代码
if (queueType === 'retrieval') {
  console.log('[MenuActions] 处理提取练习队列');
  if (queue?.addItems) {
    const added = await Promise.resolve(queue.addItems(items));
    return { added, message: `已加入 ${added} 张卡片到提取练习队列` };
  }
}
```

**问题**：
- 直接将所有选中的卡片加入队列
- 没有检查 `cardType` 属性
- 没有过滤 Topic 卡片

## 修复方案

### 修改 1：提取练习队列过滤

在 `MenuActions.addToQueue()` 中添加 Topic 卡片过滤：

```typescript
// 提取练习使用 addItems（批量）
if (queueType === 'retrieval') {
  console.log('[MenuActions] 处理提取练习队列');
  
  // 🆕 过滤 Topic 卡片：提取练习只接受 Item 卡片
  const filteredItems = items.filter((item) => {
    const row = selectedRows.find((r) => (r.fsrsCardId || r.id || r.blockId) === item.cardID);
    const cardType = (row as any)?.cardType;
    
    if (cardType === 'topic') {
      console.log(`[MenuActions] 过滤 Topic 卡片: ${item.blockID}`);
      return false;
    }
    return true;
  });
  
  console.log(`[MenuActions] 过滤后：${filteredItems.length}/${items.length} 张卡片`);
  
  if (filteredItems.length === 0) {
    return { added: 0, message: 'Topic 卡片不能加入提取练习队列' };
  }
  
  if (queue?.addItems) {
    const added = await Promise.resolve(queue.addItems(filteredItems));
    const skipped = items.length - filteredItems.length;
    const message = skipped > 0
      ? `已加入 ${added} 张卡片到提取练习队列（过滤了 ${skipped} 张 Topic 卡片）`
      : `已加入 ${added} 张卡片到提取练习队列`;
    return { added, message };
  }
}
```

**改进**：
- ✅ 过滤 `cardType === 'topic'` 的卡片
- ✅ 允许未标记类型的卡片（向后兼容）
- ✅ 提供详细的反馈消息（告知用户过滤了多少张 Topic 卡片）
- ✅ 添加日志记录过滤情况

### 修改 2：刻意练习队列过滤

同样为刻意练习队列添加过滤逻辑：

```typescript
// 刻意练习使用 addItems（批量）
if (queueType === 'final-drill') {
  console.log('[MenuActions] 处理刻意练习队列');
  
  // 🆕 过滤 Topic 卡片：刻意练习只接受 Item 卡片
  const filteredItems = items.filter((item) => {
    const row = selectedRows.find((r) => (r.fsrsCardId || r.id || r.blockId) === item.cardID);
    const cardType = (row as any)?.cardType;
    
    if (cardType === 'topic') {
      console.log(`[MenuActions] 过滤 Topic 卡片: ${item.blockID}`);
      return false;
    }
    return true;
  });
  
  console.log(`[MenuActions] 过滤后：${filteredItems.length}/${items.length} 张卡片`);
  
  if (filteredItems.length === 0) {
    return { added: 0, message: 'Topic 卡片不能加入刻意练习队列' };
  }
  
  if (queue?.addItems) {
    const added = await Promise.resolve(queue.addItems(filteredItems));
    const skipped = items.length - filteredItems.length;
    const message = skipped > 0
      ? `已加入 ${added} 张卡片到刻意练习队列（过滤了 ${skipped} 张 Topic 卡片）`
      : `已加入 ${added} 张卡片到刻意练习队列`;
    return { added, message };
  }
}
```

## 修复后的行为

### 场景 1：从浏览器添加 Item 卡片

1. 用户在卡片浏览器中选择 Item 卡片
2. 右键 → 加入队列 → 提取练习
3. 过滤逻辑检查 `cardType !== 'topic'`
4. **卡片被添加到队列**
5. 显示消息：`已加入 3 张卡片到提取练习队列`

### 场景 2：从浏览器添加 Topic 卡片

1. 用户在卡片浏览器中选择 Topic 卡片
2. 右键 → 加入队列 → 提取练习
3. 过滤逻辑检查 `cardType === 'topic'`
4. **卡片被过滤，不添加到队列**
5. 显示消息：`Topic 卡片不能加入提取练习队列`

### 场景 3：从浏览器混合添加

1. 用户选择 3 张卡片：2 张 Item + 1 张 Topic
2. 右键 → 加入队列 → 提取练习
3. 过滤逻辑过滤掉 1 张 Topic 卡片
4. **只有 2 张 Item 卡片被添加**
5. 显示消息：`已加入 2 张卡片到提取练习队列（过滤了 1 张 Topic 卡片）`

### 场景 4：未标记类型的卡片

1. 用户选择未标记类型的卡片（`cardType = undefined`）
2. 右键 → 加入队列 → 提取练习
3. 过滤逻辑允许通过（向后兼容）
4. **卡片被添加到队列**
5. 显示消息：`已加入 1 张卡片到提取练习队列`

## 两个修复的对比

### 修复 1：BlockMenuHandler（右键菜单）

**文件**：`src/services/BlockMenuHandler.ts`

**方法**：`buildDrillCardsFromBlockIds()`

**使用场景**：
- 右键菜单的"块练习"功能
- 文档树的"块练习"功能
- 面包屑菜单的"块练习"功能

**过滤方式**：
- 在 SQL 查询中使用 LEFT JOIN 获取 `custom-fsrs-card-type` 属性
- 在构建卡片列表时过滤 `cardType === 'topic'`

### 修复 2：MenuActions（卡片浏览器）

**文件**：`src/ui/browser/datasource/MenuActions.ts`

**方法**：`addToQueue()`

**使用场景**：
- 卡片浏览器的"加入队列"功能
- 所有队列类型（提取练习、刻意练习、渐进学习等）

**过滤方式**：
- 从 `selectedRows` 中读取 `cardType` 属性
- 在加入队列前过滤 `cardType === 'topic'`

## 测试验证

### 测试 1：浏览器添加 Item 卡片

1. 打开卡片浏览器
2. 选择 Item 卡片（包含 `::` 或 `==...==`）
3. 右键 → 加入队列 → 提取练习
4. 检查控制台：
   ```
   [MenuActions] 处理提取练习队列
   [MenuActions] 过滤后：1/1 张卡片
   ```
5. 显示消息：`已加入 1 张卡片到提取练习队列`

### 测试 2：浏览器添加 Topic 卡片

1. 打开卡片浏览器
2. 选择 Topic 卡片（纯阅读材料）
3. 右键 → 加入队列 → 提取练习
4. 检查控制台：
   ```
   [MenuActions] 处理提取练习队列
   [MenuActions] 过滤 Topic 卡片: <blockId>
   [MenuActions] 过滤后：0/1 张卡片
   ```
5. 显示消息：`Topic 卡片不能加入提取练习队列`

### 测试 3：浏览器混合添加

1. 打开卡片浏览器
2. 选择 3 张卡片：2 张 Item + 1 张 Topic
3. 右键 → 加入队列 → 提取练习
4. 检查控制台：
   ```
   [MenuActions] 处理提取练习队列
   [MenuActions] 过滤 Topic 卡片: <blockId>
   [MenuActions] 过滤后：2/3 张卡片
   ```
5. 显示消息：`已加入 2 张卡片到提取练习队列（过滤了 1 张 Topic 卡片）`

### 测试 4：右键菜单仍然有效

1. 在文档中选择块
2. 右键 → 块练习
3. 应该仍然过滤 Topic 卡片（使用 BlockMenuHandler 的逻辑）

## 相关文件

### 修改的文件
- `siyuan-plugin-fsrs/src/ui/browser/datasource/MenuActions.ts` - 添加卡片浏览器的 Topic 过滤

### 相关文档
- `siyuan-plugin-fsrs/docs/FIX_RETRIEVAL_QUEUE_TOPIC_FILTER.md` - 右键菜单的 Topic 过滤（第一次修复）
- `siyuan-plugin-fsrs/docs/FIX_AUTO_CARD_TYPE_DETECTION_V2.md` - 卡片类型检测

## 注意事项

1. **两个入口**：现在有两个地方都实现了 Topic 过滤
   - 右键菜单：`BlockMenuHandler.buildDrillCardsFromBlockIds()`
   - 卡片浏览器：`MenuActions.addToQueue()`

2. **向后兼容**：未标记类型的卡片仍然可以加入队列

3. **用户反馈**：提供详细的消息，告知用户过滤了多少张 Topic 卡片

4. **日志记录**：记录过滤的 Topic 卡片，方便调试

## 未来改进

1. **统一过滤逻辑**：
   - 创建一个共享的过滤函数
   - 避免在两个地方重复相同的逻辑

2. **UI 禁用**：
   - 在卡片浏览器中，对 Topic 卡片禁用"加入提取练习队列"选项
   - 显示灰色并提示"Topic 卡片不支持提取练习"

3. **批量过滤**：
   - 在其他队列（筛选复习）中应用相同的过滤逻辑

## 修复日期

- **2026-01-31**：添加卡片浏览器的 Topic 卡片过滤逻辑

