# i18n Phase 3 完成总结

## 修复内容

### 1. 复习界面评分按钮 i18n

**问题**：所有队列的复习界面中，评分按钮（重来、困难、良好、简单）仍然是硬编码的中文。

**根本原因**：`UnifiedReviewAdapter` 实例化时没有传递 i18n 参数。

**修复位置**：
- `src/strategies/UnifiedReviewAdapter.ts` - 添加 i18n 支持
- `src/strategies/createUnifiedReviewDialog.ts` - 传递 i18n 到 adapter
- `src/services/ReviewDialogManager.ts` - 两处传递 i18n 到 adapter

**修复方案**：
1. 在 `UnifiedReviewAdapter.ts` 中：
   - 添加 `t()` 辅助函数用于 i18n 翻译
   - 在构造函数中接收 `i18n` 参数
   - 将评分按钮的 label 从硬编码改为使用 `t()` 函数

2. 在 `createUnifiedReviewDialog.ts` 中：
   ```typescript
   // 修复前
   const adapter = new UnifiedReviewAdapter();
   
   // 修复后
   const adapter = new UnifiedReviewAdapter({ i18n: plugin.i18n || {} });
   ```

3. 在 `ReviewDialogManager.ts` 中（2处）：
   ```typescript
   // 修复前
   const adapter = new UnifiedReviewAdapter();
   
   // 修复后
   const adapter = new UnifiedReviewAdapter({ i18n: this.deps.i18n || {} });
   ```

**使用的 i18n 键**（已存在于 zh_CN.json 和 en_US.json）：
- `cardRatingAgain`: "重来" / "Again"
- `cardRatingHard`: "困难" / "Hard"
- `cardRatingGood`: "良好" / "Good"
- `cardRatingEasy`: "简单" / "Easy"

### 2. 块菜单按钮 i18n

**问题**：块菜单中【插件】→【siyuanmemo】里的按钮都是硬编码的中文。

**根本原因**：
1. `BlockMenuHandler.ts` 中的按钮文本硬编码
2. 各个 `ReviewEntry` 类中的 `displayName` 硬编码
3. "到期"和"全部"模式的文本硬编码

**修复位置**：
- `src/services/BlockMenuHandler.ts` - 修复"到期"/"全部"文本
- `src/services/RetrievalPracticeEntry.ts` - 使用 i18n 获取 displayName
- `src/services/IncrementalLearningEntry.ts` - 使用 i18n 获取 displayName
- `src/services/FinalDrillEntry.ts` - 使用 i18n 获取 displayName
- `src/services/AddToFinalDrillEntry.ts` - 使用 i18n 获取 displayName

**修复的按钮**：
1. **制作为概念卡并加入队列**
   - 硬编码：`'📍 制作为概念卡并加入队列'`
   - 修复后：`this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列'`
   - 出现位置：3处（块菜单、文档树菜单、编辑器标题菜单）

2. **制作为概念卡并立即漫游**
   - 硬编码：`'🚀 制作为概念卡并立即漫游'`
   - 修复后：`this.deps.i18n?.makeConceptAndStartRoam || '🚀 制作为概念卡并立即漫游'`
   - 出现位置：3处（块菜单、文档树菜单、编辑器标题菜单）

3. **创建列表模版卡**
   - 硬编码：`'创建列表模版卡'`
   - 修复后：`this.deps.i18n?.createListTemplateCard || '创建列表模版卡'`
   - 出现位置：1处（块菜单）

4. **取消闪卡**
   - 硬编码：`'取消闪卡'`
   - 修复后：`this.deps.i18n?.deleteCard || '取消闪卡'`
   - 出现位置：1处（块菜单）
   - 注：使用已存在的 `deleteCard` 键

5. **编辑SRS数据**
   - 已经使用 i18n：`this.deps.i18n?.editSrsData || '编辑SRS数据'`
   - 无需修改

6. **复习入口菜单项**（动态生成）：
   - **提取练习**：`deps.i18n?.retrievalPractice || '提取练习'`
   - **渐进学习**：`deps.i18n?.incrementalLearning || '渐进学习'`
   - **刻意练习**：`deps.i18n?.finalDrill || '刻意练习'`
   - **添加到刻意练习**：`deps.i18n?.addToFinalDrillQueue || '添加到刻意练习'`
   - **到期模式**：`this.deps.i18n?.dueMode || '到期'`
   - **全部模式**：`this.deps.i18n?.allMode || '全部'`

### 3. 新增 i18n 键值

**中文（zh_CN.json）**：
```json
{
  "makeConceptAndAddToQueue": "📍 制作为概念卡并加入队列",
  "makeConceptAndStartRoam": "🚀 制作为概念卡并立即漫游",
  "createListTemplateCard": "创建列表模版卡",
  "addToFinalDrillQueue": "添加到刻意练习",
  "dueMode": "到期",
  "allMode": "全部"
}
```

**英文（en_US.json）**：
```json
{
  "makeConceptAndAddToQueue": "📍 Make Concept Card and Add to Queue",
  "makeConceptAndStartRoam": "🚀 Make Concept Card and Start Roaming",
  "createListTemplateCard": "Create List Template Card",
  "addToFinalDrillQueue": "Add to Deliberate Practice",
  "dueMode": "Due",
  "allMode": "All"
}
```

## 验证清单

- [x] 复习界面评分按钮使用 i18n
- [x] 块菜单中所有按钮使用 i18n
- [x] 新增的 i18n 键值已添加到中英文文件
- [x] 保留 fallback 值确保向后兼容

## 影响范围

### 修改的文件
1. `src/strategies/UnifiedReviewAdapter.ts` - 评分按钮 i18n 支持
2. `src/strategies/createUnifiedReviewDialog.ts` - 传递 i18n 到 adapter
3. `src/services/ReviewDialogManager.ts` - 两处传递 i18n 到 adapter（渐进学习和提取练习）
4. `src/services/BlockMenuHandler.ts` - 块菜单按钮 i18n + "到期"/"全部"文本 i18n
5. `src/services/RetrievalPracticeEntry.ts` - displayName 使用 i18n
6. `src/services/IncrementalLearningEntry.ts` - displayName 使用 i18n
7. `src/services/FinalDrillEntry.ts` - displayName 使用 i18n
8. `src/services/AddToFinalDrillEntry.ts` - displayName 使用 i18n
9. `src/i18n/zh_CN.json` - 新增6个中文键值
10. `src/i18n/en_US.json` - 新增6个英文键值

### 受益的功能
- 所有使用统一数据源队列的复习界面（提取练习、刻意练习、神经漫游、筛选复习等）
- 块菜单中的所有 SiyuanMemo 功能入口
- 文档树菜单中的概念卡制作功能
- 编辑器标题菜单中的概念卡制作功能

## 技术细节

### UnifiedReviewAdapter 的 i18n 支持

```typescript
// 添加 t() 辅助函数
function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

// 构造函数接收 i18n
export class UnifiedReviewAdapter implements IAdapter<any> {
    private readonly i18n?: Record<string, string>;

    constructor(options?: { i18n?: Record<string, string> }) {
        this.i18n = options?.i18n;
    }
    
    // 使用 t() 函数翻译
    { label: t(this.i18n, 'cardRatingAgain', '重来'), value: 1, ... }
}
```

### BlockMenuHandler 的 i18n 使用

```typescript
// 直接使用 this.deps.i18n 对象
label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列'
```

## 后续工作

所有主要的 UI 文本已完成 i18n 化。如果发现其他硬编码的中文文本，可以继续添加到 i18n 文件中。

## 相关文档

- [i18n Phase 1 完成总结](./i18n-phase1-completed.md) - 复习界面基础 i18n
- [i18n Phase 2 总结](./i18n-phase2-summary.md) - SRS 浏览器和设置面板 i18n
- [i18n 修复需求](./i18n-fixes-needed.md) - 原始需求文档
