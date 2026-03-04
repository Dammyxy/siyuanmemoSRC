# 块菜单复习入口功能 - 实现总结

## 概述

本文档总结了块菜单复习入口功能的实现情况。该功能通过抽象基类 `ReviewEntryBase` 统一管理三种复习模式，提供了清晰的菜单结构和灵活的扩展能力。

## 已实现的功能

### 1. 核心架构

#### 1.1 ReviewEntryBase 基类
- **文件**: `src/services/ReviewEntryBase.ts`
- **功能**:
  - 从块元素收集闪卡（当前块及所有子块）
  - 按卡片类型过滤（item-only / all / 自定义函数）
  - 计算到期卡片数量
  - 生成菜单标签和菜单项
  - 定义抽象方法 `openReviewDialog()` 由子类实现

#### 1.2 CardFilter 扩展
- **文件**: `src/types/unified-data-source.ts`
- **新增字段**: `blockIds?: string[]`
- **用途**: 支持按块范围过滤卡片

#### 1.3 AdvancedDataRouter 过滤实现
- **文件**: `src/routers/AdvancedDataRouter.ts`
- **功能**: 在 `applyFilter()` 方法中实现 blockIds 过滤（使用 Set 进行 O(1) 查找优化）

### 2. 三种复习入口

#### 2.1 提取练习入口 (RetrievalPracticeEntry)
- **文件**: `src/services/RetrievalPracticeEntry.ts`
- **配置**:
  - `cardTypeFilter: 'item-only'` - 只接受 Item 卡片
  - `recordReview: true` - 记录作答，影响排期
  - `supportDueMode: true` - 支持"到期/全部"模式
- **菜单项**:
  - 提取练习 - 到期 (X/Y)
  - 提取练习 - 全部 (Y)

#### 2.2 渐进学习入口 (IncrementalLearningEntry)
- **文件**: `src/services/IncrementalLearningEntry.ts`
- **配置**:
  - `cardTypeFilter: 'all'` - 接受 Item + Topic 卡片
  - `recordReview: true` - 记录作答，影响排期
  - `supportDueMode: true` - 支持"到期/全部"模式
- **菜单项**:
  - 渐进学习 - 到期 (X/Y)
  - 渐进学习 - 全部 (Y)

#### 2.3 刻意练习入口 (DeliberatePracticeEntry)
- **文件**: `src/services/DeliberatePracticeEntry.ts`
- **配置**:
  - `cardTypeFilter: 'all'` - 接受所有类型
  - `recordReview: false` - 不记录作答，不影响排期
  - `supportDueMode: false` - 只支持"全部"模式
- **菜单项**:
  - 刻意练习 (Y)
- **特殊功能**:
  - 使用临时黑名单记录进度
  - 评分 4 的卡片加入黑名单（已掌握）
  - 评分 1/2/3 的卡片继续练习
  - 支持进度恢复和"从头开始"功能

### 3. 临时黑名单机制

#### 3.1 BlockPracticeBlacklistManager
- **文件**: `src/services/BlockPracticeBlacklistManager.ts`
- **功能**:
  - `getBlacklist(blockId)` - 获取黑名单
  - `getProgress(blockId)` - 获取进度信息（已完成数/总数）
  - `initBlacklist(blockId, totalCards)` - 初始化黑名单
  - `addToBlacklist(blockId, cardId)` - 添加到黑名单
  - `clearBlacklist(blockId)` - 清空黑名单（"从头开始"功能）
  - `cleanupExpired()` - 清理过期黑名单（24小时自动过期）

#### 3.2 进度提示对话框
- **触发条件**: 当用户再次打开刻意练习且有未完成的进度时
- **提示内容**: "你上次练习这个文档时，学习了 X/Y 张卡片。要继续上次的进度吗？"
- **选项**:
  - 【从头开始】- 清空黑名单，重新开始
  - 【继续】- 保留黑名单，继续上次进度

### 4. ReviewDialogManager 扩展

#### 4.1 新增方法
- **openRetrievalPracticeWithFilter(options)**
  - 接受 `blockIds` 和 `dueOnly` 参数
  - 过滤 Item 类型的卡片
  - 可选过滤到期卡片
  - 使用 `openDrillWithCards` 打开对话框

- **openIncrementalLearningWithFilter(options)**
  - 接受 `blockIds` 和 `dueOnly` 参数
  - 接受所有类型的卡片（Item + Topic）
  - 可选过滤到期卡片
  - 使用 `openDrillWithCards` 打开对话框

#### 4.2 openDrillWithCards 扩展
- **新增参数**: `options.onReview?: (cardId: string, rating: number) => void`
- **用途**: 支持刻意练习的黑名单回调

### 5. BlockMenuHandler 集成

#### 5.1 初始化
- 在构造函数中创建三个复习入口实例
- 按顺序：提取练习 → 渐进学习 → 刻意练习

#### 5.2 菜单生成
- 使用 `entry.createMenuItems(blockElements)` 生成菜单项
- 在每个入口之间添加分隔符
- 保持神经漫游和其他菜单项不变

## 当前菜单结构

```
SiyuanMemo
  ├─ 提取练习 - 到期 (3/10)
  ├─ 提取练习 - 全部 (10)
  ├─ ──────────────
  ├─ 渐进学习 - 到期 (5/15)
  ├─ 渐进学习 - 全部 (15)
  ├─ ──────────────
  ├─ 刻意练习 (15)
  ├─ ──────────────
  ├─ 神经漫游
  ├─ ──────────────
  ├─ 编辑SRS数据
  ├─ 选中制卡
  └─ 取消闪卡
```

## 技术亮点

### 1. 设计模式
- **模板方法模式**: ReviewEntryBase 定义算法骨架，子类实现具体步骤
- **策略模式**: 通过 cardTypeFilter 配置不同的过滤策略
- **观察者模式**: 黑名单机制通过回调通知卡片评分

### 2. 性能优化
- 使用 Set 进行 O(1) 时间复杂度的 blockIds 查找
- 使用 Set 存储黑名单，O(1) 查询时间
- 卡片收集时去重，避免重复处理

### 3. 用户体验
- 清晰的菜单标签，显示到期数量和总数量
- 进度提示对话框，支持继续或重新开始
- 自动过期机制，避免黑名单永久存在

## 待完成的任务

### P0（必须实现）
- [ ] 单元测试
- [ ] 集成测试
- [ ] 端到端测试

### P1（重要但可延后）
- [ ] 手动清空黑名单的功能（在菜单中添加"重置进度"选项）
- [ ] 优化菜单图标和样式
- [ ] 添加复习进度统计

### P2（可选）
- [ ] 支持自定义过滤函数
- [ ] 支持通过配置动态创建复习入口
- [ ] 添加复习历史记录

## 使用示例

### 1. 添加新的复习入口

```typescript
// 创建自定义复习入口
class CustomReviewEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'custom-review',
      displayName: '自定义复习',
      icon: 'iconStar',
      queueType: QueueType.FilterGroup,
      recordReview: true,
      cardTypeFilter: (card) => card.priority > 80, // 自定义过滤函数
      supportDueMode: true,
    }, deps);
  }
  
  protected async openReviewDialog(cards: FSRSCard[], mode: 'due' | 'all'): Promise<void> {
    // 实现自定义对话框打开逻辑
  }
}

// 在 BlockMenuHandler 中添加
this.reviewEntries.push(new CustomReviewEntry({
  storage: deps.storage,
  reviewDialogManager: deps.reviewDialogManager,
  i18n: deps.i18n,
}));
```

### 2. 使用临时黑名单

```typescript
// 初始化黑名单
BlockPracticeBlacklistManager.initBlacklist(blockId, totalCards);

// 检查进度
const progress = BlockPracticeBlacklistManager.getProgress(blockId);
if (progress.hasProgress) {
  console.log(`已完成 ${progress.completedCount}/${progress.totalCount} 张卡片`);
}

// 添加到黑名单
BlockPracticeBlacklistManager.addToBlacklist(blockId, cardId);

// 清空黑名单
BlockPracticeBlacklistManager.clearBlacklist(blockId);
```

## 文件清单

### 新增文件
- `src/services/ReviewEntryBase.ts` - 复习入口基类
- `src/services/RetrievalPracticeEntry.ts` - 提取练习入口
- `src/services/IncrementalLearningEntry.ts` - 渐进学习入口
- `src/services/DeliberatePracticeEntry.ts` - 刻意练习入口
- `src/services/BlockPracticeBlacklistManager.ts` - 临时黑名单管理器

### 修改文件
- `src/types/unified-data-source.ts` - 扩展 CardFilter 接口
- `src/routers/AdvancedDataRouter.ts` - 实现 blockIds 过滤
- `src/services/BlockMenuHandler.ts` - 使用复习入口生成菜单
- `src/services/ReviewDialogManager.ts` - 添加过滤方法
- `src/ui/review/v2/ReviewView.vue` - 添加 onReview prop
- `src/ui/review/v2/useReviewSession.ts` - 调用 onReview 回调

## 总结

块菜单复习入口功能已基本实现，提供了清晰的架构和灵活的扩展能力。通过抽象基类 `ReviewEntryBase`，可以轻松添加新的复习模式。临时黑名单机制为刻意练习提供了进度保存功能，提升了用户体验。

下一步需要完成单元测试和集成测试，确保功能的稳定性和正确性。
