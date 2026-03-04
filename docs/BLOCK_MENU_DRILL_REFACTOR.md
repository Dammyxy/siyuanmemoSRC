# 块菜单刻意练习功能重构

## 背景

原有的"刻意练习"功能存在设计问题：
1. 使用全局 FinalDrill 队列，导致块菜单的临时练习会清空全局队列
2. 用户期望的"只练习当前文档"与"全局困难卡片队列"混淆
3. 不符合 SuperMemo 的设计理念

## SuperMemo 的设计

### Final Drill（最终训练）
- **自动添加**：评分 < 4 的卡片自动进入
- **手动添加**：通过 "Add to drill" 追加到队列末尾
- **全局队列**：在学习日结束时统一练习
- **评分行为**：< 4 保留，≥ 4 移除

### Subset Review（子集复习）
- **Review all**：临时复习子集，评分影响调度（mid-interval repetition）
- **临时性质**：不持久化，复习完成后销毁

## 新设计

### 1. 临时练习（TemporaryDrillEntry）

**对应**：SuperMemo 的 "Review all"（但不影响调度）

**特点**：
- ✅ 只练习当前文档的卡片
- ✅ 不记录评分，不影响调度
- ✅ 使用 FilterGroup 实现（临时队列）
- ✅ 练习完成后自动销毁

**使用场景**：
- 快速预览当前文档的卡片
- 测试自己的掌握程度
- 不想影响正式排期的临时练习

**实现**：
```typescript
export class TemporaryDrillEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'temporary-drill',
      displayName: '临时练习',
      icon: 'iconEye',
      queueType: QueueType.FilterGroup,
      recordReview: false,  // 不记录评分
      cardTypeFilter: 'all',
      supportDueMode: false,
    }, deps);
  }
}
```

### 2. 添加到刻意练习（AddToFinalDrillEntry）

**对应**：SuperMemo 的 "Add to drill"

**特点**：
- ✅ 将当前文档的卡片添加到全局 FinalDrill 队列
- ✅ 支持三种模式：继续/替换/追加
- ✅ 持久化，与 auto-failed 卡片混合
- ✅ 反复练习直到掌握

**使用场景**：
- 标记困难卡片，加入全局队列
- 考前集中练习特定主题
- 与自动失败的卡片一起反复练习

**三种模式**：
1. **继续练习**：直接打开对话框，练习队列中已有的卡片
2. **替换队列**：清空队列，添加当前文档的卡片
3. **追加到队列**：保留队列中的卡片，将当前文档的卡片追加到末尾

**实现**：
```typescript
export class AddToFinalDrillEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'add-to-final-drill',
      displayName: '添加到刻意练习',
      icon: 'iconAdd',
      queueType: QueueType.FinalDrill,
      recordReview: false,
      cardTypeFilter: 'all',
      supportDueMode: false,
    }, deps);
  }
}
```

## 菜单结构

```
SiyuanMemo
  ├─ 提取练习 - 到期 (3/10)      ← 正式复习，只 Item，影响调度
  ├─ 提取练习 - 全部 (10)
  ├─ ──────────────
  ├─ 渐进学习 - 到期 (5/15)      ← 正式复习，全部类型，影响调度
  ├─ 渐进学习 - 全部 (15)
  ├─ ──────────────
  ├─ 临时练习 (15)               ← 🆕 临时预览，不影响调度
  ├─ 添加到刻意练习 (15)         ← 🆕 添加到全局队列
  ├─ ──────────────
  ├─ 神经漫游
  └─ ...
```

## 功能对比

| 功能 | 临时练习 | 添加到刻意练习 | 提取练习 | 渐进学习 |
|------|---------|---------------|---------|---------|
| 范围 | 当前文档 | 当前文档 → 全局队列 | 当前文档 | 当前文档 |
| 评分影响调度 | ❌ 否 | ❌ 否 | ✅ 是 | ✅ 是 |
| 持久化 | ❌ 否 | ✅ 是（全局队列） | ❌ 否 | ❌ 否 |
| 卡片类型 | 全部 | 全部 | 只 Item | 全部 |
| 队列类型 | FilterGroup | FinalDrill | FilterGroup | FilterGroup |
| 使用场景 | 快速预览 | 困难卡片集中练习 | 正式复习 | 系统学习 |

## 实现文件

### 新增文件
1. `src/services/TemporaryDrillEntry.ts` - 临时练习入口
2. `src/services/AddToFinalDrillEntry.ts` - 添加到刻意练习入口

### 修改文件
1. `src/services/BlockMenuHandler.ts` - 更新复习入口注册

### 废弃文件
1. `src/services/FinalDrillEntry.ts` - 被 AddToFinalDrillEntry 替代

## 用户体验

### 场景 1：快速预览当前文档

```
1. 右键点击文档块
2. 选择"临时练习"
3. 快速过一遍卡片（不影响调度）
4. 练习完成，队列自动销毁
```

### 场景 2：标记困难卡片

```
1. 右键点击文档块
2. 选择"添加到刻意练习"
3. 选择"追加到队列"（保留已有的困难卡片）
4. 选择"立即开始"或"稍后"
5. 在全局刻意练习队列中反复练习
```

### 场景 3：考前突击

```
1. 右键点击考试相关的文档
2. 选择"添加到刻意练习"
3. 选择"替换队列"（清空旧卡片）
4. 立即开始练习
5. 评分 < 3 的卡片会保留，继续练习
```

## 优势

1. ✅ **语义清晰**：临时练习 vs 全局队列，用户容易理解
2. ✅ **符合 SuperMemo**：参考成熟的间隔重复系统设计
3. ✅ **灵活性高**：支持多种使用场景
4. ✅ **不冲突**：临时练习不影响全局队列
5. ✅ **可追溯**：全局队列持久化，支持进度保存

## 参考资料

- SuperMemo 文档：`H:\project-F\flashcard\资料\supermemo\finaldrill.md`
- SuperMemo 文档：`H:\project-F\flashcard\资料\supermemo\Subset operations - SuperMemo Help.md`
- 原设计文档：`siyuan-plugin-siyuanmemo/docs/block-menu-review-entries.md`

## 修改日期

2026-02-14
