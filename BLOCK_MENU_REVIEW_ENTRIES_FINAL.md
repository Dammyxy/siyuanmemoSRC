# 块菜单复习入口功能 - 最终实现

## 概述

块菜单复习入口功能已完成，使用**新架构**（统一数据源）实现了三种复习模式。

## 实现方案

### 1. 提取练习（RetrievalPracticeEntry）

**队列类型**: FilterGroup（筛选复习）

**实现方式**:
- 使用 `FilterGroup` 队列
- 通过 `setFilter()` 设置临时过滤条件：
  - `blockIds`: 当前块及子块的 ID 列表
  - `cardType: 'item'`: 只接受 Item 类型
  - `dueDate`: 可选，只显示到期卡片
- 使用 `UnifiedQueueStrategy` + `UnifiedReviewAdapter`
- 关闭对话框时清除过滤条件

**特点**:
- ✅ 只复习 Item 卡片（排除 Topic）
- ✅ 记录作答，影响排期
- ✅ 支持"到期/全部"两种模式

### 2. 渐进学习（IncrementalLearningEntry）

**队列类型**: FilterGroup（筛选复习）

**实现方式**:
- 使用 `FilterGroup` 队列
- 通过 `setFilter()` 设置临时过滤条件：
  - `blockIds`: 当前块及子块的 ID 列表
  - 接受所有卡片类型（Item + Topic）
  - `dueDate`: 可选，只显示到期卡片
- 使用 `UnifiedQueueStrategy` + `UnifiedReviewAdapter`
- 关闭对话框时清除过滤条件

**特点**:
- ✅ 复习所有类型的卡片（Item + Topic）
- ✅ 记录作答，影响排期
- ✅ 支持"到期/全部"两种模式

### 3. 刻意练习（FinalDrillEntry）

**队列类型**: FinalDrill

**实现方式**:
- 使用 `FinalDrill` 队列（静态队列）
- 清空队列，避免旧卡片干扰
- 将当前块及子块的所有卡片添加到队列（`addCard(cardId, 'manual')`）
- 调用 `openFinalDrill()` 打开对话框
- 使用新架构（不是旧的 openDrillWithCards）

**特点**:
- ✅ 复习所有类型的卡片
- ✅ 不记录作答，不影响排期
- ✅ 只支持"全部"模式（不区分到期/全部）

## 菜单结构

```
SiyuanMemo
  ├─ 提取练习 - 到期 (X/Y)
  ├─ 提取练习 - 全部 (Y)
  ├─ ──────────────
  ├─ 渐进学习 - 到期 (X/Y)
  ├─ 渐进学习 - 全部 (Y)
  ├─ ──────────────
  ├─ 刻意练习 (Y)
  ├─ ──────────────
  ├─ 神经漫游
  ├─ ──────────────
  ├─ 编辑SRS数据
  ├─ 选中制卡
  └─ 取消闪卡
```

## 文件清单

### 新增文件
- `src/services/ReviewEntryBase.ts` - 复习入口基类
- `src/services/RetrievalPracticeEntry.ts` - 提取练习入口
- `src/services/IncrementalLearningEntry.ts` - 渐进学习入口
- `src/services/FinalDrillEntry.ts` - 刻意练习入口

### 修改文件
- `src/types/unified-data-source.ts` - 扩展 CardFilter 接口（添加 blockIds）
- `src/routers/AdvancedDataRouter.ts` - 实现 blockIds 过滤逻辑
- `src/services/BlockMenuHandler.ts` - 使用复习入口生成菜单
- `src/services/ReviewDialogManager.ts` - 添加过滤方法

## 技术细节

### 1. FilterGroup 队列的使用

提取练习和渐进学习使用 FilterGroup 队列 + 临时过滤条件：

```typescript
// 获取 FilterGroup 队列
const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);

// 设置过滤条件
filterGroupQueue.setFilter({
  blockIds: ['block-1', 'block-2'],
  cardType: 'item',  // 可选
  dueDate: { lte: new Date() }  // 可选
});

// 创建对话框
const queue = new UnifiedQueueStrategy(QueueType.FilterGroup);
const adapter = new UnifiedReviewAdapter();

// 关闭时清除过滤条件
events: {
  close: () => {
    filterGroupQueue.setFilter({});
  }
}
```

### 2. FinalDrill 队列的使用

刻意练习使用 FinalDrill 队列 + 手动添加卡片：

```typescript
// 获取 FinalDrill 队列
const finalDrillQueue = manager.getQueue(QueueType.FinalDrill);

// 清空队列
await finalDrillQueue.clear();

// 添加卡片
for (const card of cards) {
  await finalDrillQueue.addCard(card.id, 'manual');
}

// 打开对话框
await reviewDialogManager.openFinalDrill();
```

### 3. 卡片收集

所有复习入口都使用 `ReviewEntryBase.collectCardsFromElements()` 收集卡片：

```typescript
protected collectCardsFromElements(blockElements: HTMLElement[]): FSRSCard[] {
  const seen = new Set<string>();
  const result: FSRSCard[] = [];
  
  // 获取当前块及所有子块
  for (const root of roots) {
    const nodes = [root, ...root.querySelectorAll('[data-node-id]')];
    
    for (const node of nodes) {
      const blockId = node.getAttribute('data-node-id');
      if (!blockId || seen.has(blockId)) continue;
      seen.add(blockId);
      
      // 从本地存储查询卡片
      const card = this.deps.storage.getCardByBlockId(blockId);
      if (card && this.filterCard(card)) {
        result.push(card);
      }
    }
  }
  
  return result;
}
```

## 关键区别

### 提取练习 vs 渐进学习

| 特性 | 提取练习 | 渐进学习 |
|------|---------|---------|
| 队列类型 | FilterGroup | FilterGroup |
| 卡片类型 | 只 Item | Item + Topic |
| 记录作答 | ✅ | ✅ |
| 到期模式 | ✅ | ✅ |

### 提取练习 vs 刻意练习

| 特性 | 提取练习 | 刻意练习 |
|------|---------|---------|
| 队列类型 | FilterGroup | FinalDrill |
| 卡片类型 | 只 Item | 所有类型 |
| 记录作答 | ✅ | ❌ |
| 到期模式 | ✅ | ❌ |
| 影响排期 | ✅ | ❌ |

## 优势

1. **使用新架构** - 所有入口都使用统一数据源架构
2. **代码复用** - 通过 ReviewEntryBase 基类复用公共逻辑
3. **易于扩展** - 添加新的复习模式只需继承基类
4. **性能优化** - 使用 Set 进行 O(1) 查找
5. **清晰的职责分离** - 每个入口类只负责一种复习模式

## 测试建议

### 1. 提取练习测试
- 右键点击文档块，选择"提取练习 - 到期"
- 验证只显示到期的 Item 卡片
- 验证 Topic 卡片被过滤

### 2. 渐进学习测试
- 右键点击文档块，选择"渐进学习 - 全部"
- 验证显示所有类型的卡片（Item + Topic）

### 3. 刻意练习测试
- 右键点击文档块，选择"刻意练习"
- 验证显示所有卡片
- 验证评分不影响排期（检查 due 时间不变）

## 总结

块菜单复习入口功能已完成，使用新架构实现了三种复习模式：

1. ✅ **提取练习** - FilterGroup 队列 + Item 过滤
2. ✅ **渐进学习** - FilterGroup 队列 + 所有类型
3. ✅ **刻意练习** - FinalDrill 队列 + 手动添加

所有功能都使用统一数据源架构，代码清晰、易于维护和扩展。
