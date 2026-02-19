# 国际化修复 Phase 1 完成总结

## 完成时间
2026-02-18

## 修复范围

### 1. 右键菜单国际化 ✅

**文件：** `src/ui/browser/datasource/MenuActions.ts`

**修改内容：**
- 重构 `BASE_ACTIONS` 为 `getBaseActions(t)` 函数，支持 i18n
- 更新 `buildAddToQueueAction()` 函数，添加 `t` 参数
- 更新 `buildQueueActions()` 函数，添加 `t` 参数
- 保留向后兼容的 `BASE_ACTIONS` 常量

**新增翻译键：**
```json
{
  "sortMenu": "Sort / 排序",
  "sortByPriority": "By Priority / 按优先级",
  "sortByDueDate": "By Due Date / 按到期日",
  "sortByCreatedTime": "By Created Time / 按创建时间",
  "cardTypeMenu": "Card Type / 卡片类型",
  "markAsTopic": "Mark as Topic / 标记为 Topic",
  "markAsItem": "Mark as Item / 标记为 Item",
  "markAsConcept": "Mark as Concept / 标记为 Concept",
  "markAsDescriptor": "Mark as Descriptor / 标记为 Descriptor",
  "deleteCard": "Remove Card / 取消闪卡",
  "addToQueueMenu": "Add to Queue / 加入队列",
  "addToRetrievalQueue": "Retrieval Practice / 提取练习",
  "addToIncrementalQueue": "Incremental Learning / 渐进学习",
  "addToFinalDrillQueue": "Deliberate Practice / 刻意练习",
  "addToFilterGroupQueue": "Filter Review / 筛选复习",
  "addToNeuralRoamQueue": "Neural Roam / 神经漫游"
}
```

### 2. 同步按钮国际化 ✅

**文件：** `src/ui/browser/SyncStatusIndicator.vue`

**已有实现：**
- 组件已经使用 `t('manualSync', 'Quick Sync')` 和 `t('fullSync', 'Full Sync')`
- fallback 值已经是英文

**新增翻译键：**
```json
{
  "manualSync": "Quick Sync / 快速同步",
  "manualSyncHint": "Trigger incremental sync manually / 手动触发增量同步",
  "fullSync": "Full Sync / 全量同步",
  "fullSyncHint": "Trigger full sync manually (detect bidirectional deletions) / 手动触发全量同步（检测双向删除）",
  "syncing": "Syncing... / 正在同步...",
  "lastSync": "Last sync: / 上次同步：",
  "syncFailed": "Sync failed: / 同步失败：",
  "retry": "Retry / 重试",
  "idle": "Not synced / 未同步",
  "never": "Never / 从未",
  "justNow": "Just now / 刚刚",
  "minutesAgo": " minutes ago / 分钟前",
  "hoursAgo": " hours ago / 小时前",
  "daysAgo": " days ago / 天前",
  "added": "Added / 新增",
  "deleted": "Deleted / 删除",
  "detected": "Detected / 检测",
  "cards": " cards / 张"
}
```

### 3. 对话框翻译键准备 ✅

**新增翻译键（用于未来的对话框国际化）：**

#### Spread Dialog
```json
{
  "spreadDialogTitle": "Spread Workload / 分摊压力",
  "spreadDialogInfo": "Spread {n} cards over the next few days / 将为 {n} 张卡片执行分摊复习压力操作",
  "spreadBasicParams": "Basic Parameters / 基础参数",
  "spreadCollectingPeriod": "Collecting Period (days) / 收集期（天）",
  "spreadReschedulingPeriod": "Rescheduling Period (days) / 重新调度期（天）",
  "spreadSortingCriterion": "Sorting Criterion / 排序标准",
  "spreadAdvancedOptions": "Advanced Options / 高级选项",
  "spreadMaxCardsPerDay": "Daily Card Limit (optional) / 每日卡片数量限制（可选）",
  "spreadPreview": "Preview Effect / 预览效果",
  "spreadConfigManagement": "Configuration Management / 配置管理",
  "spreadConfirmButton": "Confirm Spread / 确认分散"
}
```

## 技术实现

### 函数签名变更

**之前：**
```typescript
export const BASE_ACTIONS = {
  open: { id: 'open', label: 'Open', icon: 'iconOpen' },
  // ...
};

export function buildAddToQueueAction(hasQueues: {...}): CardBrowserAction | null {
  // ...
}
```

**之后：**
```typescript
export function getBaseActions(t?: (key: string, fallback: string) => string) {
  const translate = t || ((key: string, fallback: string) => fallback);
  return {
    open: { id: 'open', label: translate('openInTab', 'Open'), icon: 'iconOpen' },
    // ...
  };
}

// 向后兼容
export const BASE_ACTIONS = getBaseActions();

export function buildAddToQueueAction(
  hasQueues: {...},
  t?: (key: string, fallback: string) => string
): CardBrowserAction | null {
  const translate = t || ((key: string, fallback: string) => fallback);
  // ...
}
```

### 使用方式

**DataSource 中使用（未来）：**
```typescript
import { getBaseActions, buildAddToQueueAction } from './MenuActions';

class MyDataSource {
  constructor(private i18n: Record<string, string>) {}
  
  getSupportedActions(): CardBrowserAction[] {
    const t = (key: string, fallback: string) => this.i18n[key] || fallback;
    const BASE = getBaseActions(t);
    const addToQueue = buildAddToQueueAction(hasQueues, t);
    
    return [BASE.open, BASE.deleteCard, addToQueue];
  }
}
```

## 文件修改清单

### 修改的文件
1. `src/ui/browser/datasource/MenuActions.ts` - 添加 i18n 支持
2. `src/i18n/en_US.json` - 添加英文翻译键
3. `src/i18n/zh_CN.json` - 添加中文翻译键
4. `i18n-fixes-needed.md` - 更新修复状态

### 新增的文件
1. `i18n-phase1-completed.md` - 本文档

## 测试建议

### 手动测试步骤

1. **切换到英文界面**
   - 打开思源笔记设置
   - 切换语言为 English
   - 重启插件

2. **测试右键菜单**
   - 打开 SRS 浏览器
   - 右键点击任意卡片
   - 验证所有菜单项显示为英文

3. **测试同步按钮**
   - 打开 SRS 浏览器
   - 查看同步状态指示器
   - 验证按钮文字为 "Quick Sync" 和 "Full Sync"

4. **切换回中文界面**
   - 切换语言为简体中文
   - 重启插件
   - 验证所有文本显示为中文

## 后续工作

### Phase 2: 对话框国际化（待完成）

需要修改以下文件：
1. `src/ui/browser/dialogs/SpreadDialog.vue`
2. `src/ui/browser/dialogs/PostponeDialog.vue`
3. `src/ui/browser/dialogs/AdvanceDialog.vue`
4. `src/ui/review/v2/dialogs/ScheduleDateDialog.vue`

**修改步骤：**
1. 在组件 props 中添加 `i18n?: Record<string, string>`
2. 创建 `t(key, fallback)` 辅助函数
3. 替换所有硬编码的中文文本为 `t(key, fallback)` 调用
4. 确保 fallback 值为英文

### Phase 3: 工具栏国际化（待完成）

需要修改：
1. `src/ui/browser/BrowserToolbar.vue` - 更多菜单

## 注意事项

1. **向后兼容**：保留了 `BASE_ACTIONS` 常量，确保现有代码不会破坏
2. **可选参数**：`t` 参数是可选的，如果不传递则使用 fallback 值
3. **默认行为**：如果 i18n 字典中没有对应的键，会自动使用 fallback 值
4. **一致性**：所有 fallback 值都使用英文，确保英文界面下的一致性

## 相关文档

- [i18n-fixes-needed.md](./i18n-fixes-needed.md) - 国际化修复清单
- [src/i18n/en_US.json](./src/i18n/en_US.json) - 英文翻译
- [src/i18n/zh_CN.json](./src/i18n/zh_CN.json) - 中文翻译
