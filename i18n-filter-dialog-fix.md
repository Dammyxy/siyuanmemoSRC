# 筛选对话框 i18n 修复

## 问题描述

用户报告筛选复习的筛选按钮 UI 里有以下问题：
1. 字段标签显示为技术字段名（如 filterAFactor, filterForgettingIndex 等）而不是翻译后的文本
2. 状态选项（新卡/学习中/复习/重学）显示为中文而不是英文
3. i18n 参数没有传递给 FilterDialog 组件

## 根本原因

1. **字段标签键错误**: FilterDialog.vue 中的 `numericFields` 和 `dateFields` 配置使用了错误的 labelKey
2. **Fallback 值为中文**: Status 选项的 fallback 值硬编码为中文
3. **缺少 i18n 传递**: SRSBrowser.vue 没有将 i18n prop 传递给 FilterDialog 组件

## 修复内容

### 1. 修复 FilterDialog.vue 中的字段标签键

**文件**: `siyuan-plugin-siyuanmemo/src/ui/browser/dialogs/FilterDialog.vue`

修改了 `numericFields` 配置：
```typescript
const numericFields: NumericFieldConfig[] = [
  { key: 'priority', labelKey: 'filterPriority', range: { min: 0, max: 100 } },
  { key: 'repetitions', labelKey: 'filterRepetitions', range: { min: 0, max: 999 } },
  { key: 'lapses', labelKey: 'filterLapses', range: { min: 0, max: 999 } },
  { key: 'interval', labelKey: 'filterInterval', range: { min: 0, max: 9999 } },
  { key: 'difficulty', labelKey: 'filterDifficulty', range: { min: 0, max: 10 }, allowDecimal: true },      // 修复
  { key: 'stability', labelKey: 'filterStability', range: { min: 0, max: 9999 }, allowDecimal: true },      // 修复
  { key: 'retrievability', labelKey: 'filterRetrievability', range: { min: 0, max: 9999 } },                // 修复
  { key: 'postpones', labelKey: 'filterPostpones', range: { min: 0, max: 100 }, allowDecimal: true },       // 修复
];
```

修改了 `dateFields` 配置：
```typescript
const dateFields: DateFieldConfig[] = [
  { key: 'lastReview', labelKey: 'filterLastReview' },    // 修复
  { key: 'nextReview', labelKey: 'filterNextReview' },    // 修复
];
```

### 2. 修复 Status 选项的 Fallback 值

**文件**: `siyuan-plugin-siyuanmemo/src/ui/browser/dialogs/FilterDialog.vue`

将 Status 选项的 fallback 值从中文改为英文：
```vue
<span>{{ t('stateNew', 'New') }}</span>           <!-- 原: '新卡' -->
<span>{{ t('stateLearning', 'Learning') }}</span> <!-- 原: '学习中' -->
<span>{{ t('stateReview', 'Review') }}</span>     <!-- 原: '复习' -->
<span>{{ t('stateRelearning', 'Relearning') }}</span> <!-- 原: '重学' -->
```

### 3. 传递 i18n 参数到 FilterDialog

**文件**: `siyuan-plugin-siyuanmemo/src/ui/browser/SRSBrowser.vue`

在 FilterDialog 组件中添加 `:i18n="i18n"` prop：
```vue
<FilterDialog
  :is-open="showFilterDialog"
  :initial-filter="appliedFilter"
  :i18n="i18n"                    <!-- 新增 -->
  @apply="handleApplyFilter"
  @cancel="showFilterDialog = false"
  @clear="handleClearFilter"
  @rebuild="handleRebuildQueue"
/>
```

### 4. 添加缺失的 i18n 键

**文件**: `siyuan-plugin-siyuanmemo/src/i18n/zh_CN.json`

添加了：
```json
"filterPostpones": "推迟次数"
```

**文件**: `siyuan-plugin-siyuanmemo/src/i18n/en_US.json`

添加了：
```json
"filterPostpones": "Postpones"
```

## 已存在的 i18n 键

以下键已经在 i18n 文件中存在，无需添加：

### 中文 (zh_CN.json)
- `filterPriority`: "优先级"
- `filterRepetitions`: "复习次数"
- `filterLapses`: "遗忘次数"
- `filterInterval`: "间隔天数"
- `filterLastReview`: "上次复习日期"
- `filterNextReview`: "下次复习日期"
- `filterDifficulty`: "难度"
- `filterStability`: "稳定性"
- `filterRetrievability`: "可提取性"
- `stateNew`: "新卡"
- `stateLearning`: "学习中"
- `stateReview`: "复习"
- `stateRelearning`: "重学"

### 英文 (en_US.json)
- `filterPriority`: "Priority"
- `filterRepetitions`: "Repetitions"
- `filterLapses`: "Lapses"
- `filterInterval`: "Interval (days)"
- `filterLastReview`: "Last Review Date"
- `filterNextReview`: "Next Review Date"
- `filterDifficulty`: "Difficulty"
- `filterStability`: "Stability"
- `filterRetrievability`: "Retrievability"
- `stateNew`: "New"
- `stateLearning`: "Learning"
- `stateReview`: "Review"
- `stateRelearning`: "Relearning"

## 测试步骤

1. 重新构建插件：
   ```bash
   cd siyuan-plugin-siyuanmemo
   pnpm run build
   ```

2. 在 SiYuan Notes 中重新加载插件

3. 打开筛选复习对话框，验证：
   - 所有字段标签显示为正确的翻译文本（英文界面显示英文，中文界面显示中文）
   - 字段名称：
     - Priority（优先级）
     - Repetitions（复习次数）
     - Lapses（遗忘次数）
     - Interval (days)（间隔天数）
     - Difficulty（难度）
     - Stability（稳定性）
     - Retrievability（可提取性）
     - Postpones（推迟次数）
     - Last Review Date（上次复习日期）
     - Next Review Date（下次复习日期）
   - 状态选项：
     - New（新卡）
     - Learning（学习中）
     - Review（复习）
     - Relearning（重学）

## 修改的文件

1. `siyuan-plugin-siyuanmemo/src/ui/browser/dialogs/FilterDialog.vue` - 修复字段标签键和 fallback 值
2. `siyuan-plugin-siyuanmemo/src/ui/browser/SRSBrowser.vue` - 传递 i18n prop
3. `siyuan-plugin-siyuanmemo/src/i18n/zh_CN.json` - 添加 filterPostpones 键
4. `siyuan-plugin-siyuanmemo/src/i18n/en_US.json` - 添加 filterPostpones 键

## 注意事项

- 保留了旧的 labelKey（filterAFactor, filterForgettingIndex 等）在 i18n 文件中，以保持向后兼容性
- 所有修改都遵循了现有的 i18n 模式和命名约定
- Fallback 值统一使用英文，确保在没有 i18n 的情况下也能显示英文
- i18n 参数通过 props 正确传递，确保翻译功能正常工作
