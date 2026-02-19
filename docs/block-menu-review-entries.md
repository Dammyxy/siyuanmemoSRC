# 块菜单复习入口功能使用指南

## 概述

块菜单复习入口功能为用户提供了三种不同的复习模式，可以直接从块菜单快速启动复习。每种模式都有其特定的用途和特点。

## 三种复习模式

### 1. 提取练习 (Retrieval Practice)

**用途**: 正式的间隔重复复习，只复习 Item 类型的卡片

**特点**:
- ✅ 只复习 Item 卡片（排除 Topic 卡片）
- ✅ 记录作答，影响排期
- ✅ 支持"到期"和"全部"两种模式

**使用场景**:
- 日常复习到期的卡片
- 快速复习某个文档或段落的知识点
- 准备考试或面试

**操作步骤**:
1. 右键点击文档块或段落块
2. 选择 `SiyuanMemo` → `提取练习 - 到期` 或 `提取练习 - 全部`
3. 开始复习，评分会影响卡片的下次复习时间

### 2. 渐进学习 (Incremental Learning)

**用途**: 系统性学习，复习 Item + Topic 类型的卡片

**特点**:
- ✅ 复习所有类型的卡片（Item + Topic）
- ✅ 记录作答，影响排期
- ✅ 支持"到期"和"全部"两种模式

**使用场景**:
- 学习新的知识领域
- 系统性复习某个主题
- 同时复习概念和具体知识点

**操作步骤**:
1. 右键点击文档块
2. 选择 `SiyuanMemo` → `渐进学习 - 到期` 或 `渐进学习 - 全部`
3. 开始复习，评分会影响卡片的下次复习时间

### 3. 刻意练习 (Deliberate Practice)

**用途**: 临时练习，不影响排期，支持进度保存

**特点**:
- ✅ 复习所有类型的卡片
- ✅ 不记录作答，不影响排期
- ✅ 只支持"全部"模式
- ✅ 使用 FinalDrill 队列管理进度
- ✅ 支持进度保存和恢复
- ✅ 可选择"继续上次进度"或"从头开始"

**使用场景**:
- 考前突击复习
- 测试自己的掌握程度
- 不想影响正式排期的临时练习

**操作步骤**:
1. 右键点击文档块
2. 选择 `SiyuanMemo` → `刻意练习`
3. 开始复习，复习后的卡片会从队列中移除
4. 下次打开时，会提示是否继续上次的进度

**进度保存机制**:
- 使用 FinalDrill 队列管理进度
- 复习后的卡片自动从队列移除
- 队列持久化到 localStorage
- 支持"继续上次进度"或"从头开始"

## 菜单结构

右键点击块图标后，会看到以下菜单结构：

```
SiyuanMemo
  ├─ 提取练习 - 到期 (3/10)      ← 只复习到期的 Item 卡片
  ├─ 提取练习 - 全部 (10)        ← 复习所有 Item 卡片
  ├─ ──────────────
  ├─ 渐进学习 - 到期 (5/15)      ← 只复习到期的所有卡片
  ├─ 渐进学习 - 全部 (15)        ← 复习所有卡片
  ├─ ──────────────
  ├─ 刻意练习 (15)               ← 临时练习，不影响排期
  ├─ ──────────────
  ├─ 神经漫游                    ← 知识图谱导航
  ├─ ──────────────
  ├─ 编辑SRS数据
  ├─ 选中制卡
  └─ 取消闪卡
```

## 卡片数量说明

- `(3/10)` - 表示 3 张到期，共 10 张卡片
- `(10)` - 表示共 10 张卡片

## 常见问题

### Q1: 提取练习和渐进学习有什么区别？

**A**: 主要区别在于卡片类型：
- **提取练习**: 只复习 Item 卡片（具体的知识点）
- **渐进学习**: 复习 Item + Topic 卡片（包括概念和知识点）

### Q2: 刻意练习的进度会保存多久？

**A**: 刻意练习的进度会持久化保存在 localStorage 中，直到你选择"从头开始"或手动清空队列。

### Q3: 如何重置刻意练习的进度？

**A**: 当你再次打开刻意练习时，如果有未完成的进度，会弹出提示对话框。点击【从头开始】按钮即可清空进度。

### Q4: 刻意练习如何管理进度？

**A**: 
- 使用 FinalDrill 队列管理进度
- 复习后的卡片自动从队列移除
- 队列持久化到 localStorage
- 下次打开时可以选择继续或从头开始

### Q5: 为什么我的菜单中没有显示卡片数量？

**A**: 可能的原因：
1. 当前块及其子块中没有闪卡
2. 所有卡片都被跳过（skipped）
3. 卡片类型不匹配（例如：提取练习只显示 Item 卡片）

### Q6: 如何选择合适的复习模式？

**A**: 根据你的需求选择：
- **日常复习** → 提取练习 - 到期
- **系统学习** → 渐进学习 - 到期
- **考前突击** → 刻意练习
- **测试掌握程度** → 刻意练习

## 技术细节

### 卡片收集范围

所有复习模式都会收集：
- 当前块的卡片
- 当前块的所有子块的卡片

### 过滤规则

1. **提取练习**:
   - 过滤 blockIds（只包含当前块及子块）
   - 过滤 cardType（只接受 Item）
   - 可选过滤 dueDate（到期模式）

2. **渐进学习**:
   - 过滤 blockIds（只包含当前块及子块）
   - 接受所有 cardType（Item + Topic）
   - 可选过滤 dueDate（到期模式）

3. **刻意练习**:
   - 过滤 blockIds（只包含当前块及子块）
   - 接受所有 cardType
   - 使用 FinalDrill 队列管理进度

### 性能优化

- 使用 Set 进行 O(1) 时间复杂度的查找
- 卡片收集时去重，避免重复处理
- FinalDrill 队列使用 localStorage 持久化

## 开发者指南

### 添加自定义复习入口

如果你想添加自定义的复习模式，可以继承 `ReviewEntryBase` 类：

```typescript
import { ReviewEntryBase, type ReviewEntryBaseDeps } from './ReviewEntryBase';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

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
  
  protected async openReviewDialog(
    cards: FSRSCard[], 
    mode: 'due' | 'all'
  ): Promise<void> {
    // 实现自定义对话框打开逻辑
  }
}
```

然后在 `BlockMenuHandler` 中添加：

```typescript
this.reviewEntries.push(new CustomReviewEntry({
  storage: deps.storage,
  reviewDialogManager: deps.reviewDialogManager,
  i18n: deps.i18n,
}));
```

## 更新日志

### v1.0.0 (2024-XX-XX)
- ✅ 实现 ReviewEntryBase 基类
- ✅ 实现提取练习入口
- ✅ 实现渐进学习入口
- ✅ 实现刻意练习入口
- ✅ 实现临时黑名单机制
- ✅ 集成到块菜单

## 反馈和建议

如果你在使用过程中遇到问题或有改进建议，欢迎：
- 提交 Issue
- 提交 Pull Request
- 在社区讨论

---

**祝你学习愉快！** 🎉
