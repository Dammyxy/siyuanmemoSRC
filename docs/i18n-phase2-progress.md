# 国际化修复 Phase 2 进度报告

## 完成时间
2026-02-18

## Phase 2 目标
修复对话框的国际化问题，确保所有对话框在英文界面下正确显示。

## 已完成

### 1. SpreadDialog.vue ✅

**修改内容：**
- 添加 `i18n` prop 到组件
- 创建 `t(key, fallback)` 辅助函数
- 替换所有硬编码的中文文本为 i18n 调用
- 将 `sortingOptions` 改为 computed 属性以支持动态翻译

**关键修改：**
```typescript
// Props
const props = defineProps<{
  count: number;
  configManager: ConfigManager;
  allCards?: BrowserCard[];
  queueMode?: boolean;
  i18n?: Record<string, string>;  // 🆕 i18n 字典
}>();

// 🆕 i18n 辅助函数
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 排序选项改为 computed
const sortingOptions = computed(() => [
  {
    value: SortingCriterion.Random,
    label: t('spreadSortRandom', '随机'),
    icon: '🎲',
    description: t('spreadSortRandomDesc', '随机打乱顺序')
  },
  // ...
]);
```

**模板修改示例：**
```vue
<!-- 之前 -->
<h4 class="section-title">基础参数</h4>
<span>将为 <strong>{{ collectedCount }}</strong> 张卡片执行分摊复习压力操作</span>

<!-- 之后 -->
<h4 class="section-title">{{ t('spreadBasicParams', '基础参数') }}</h4>
<span>{{ t('spreadDialogInfo', '将为 {n} 张卡片执行分摊复习压力操作').replace('{n}', String(collectedCount)) }}</span>
```

## 待完成

### 2. PostponeDialog.vue ⏳

**需要修改：**
- 添加 `i18n` prop
- 创建 `t()` 函数
- 替换所有中文文本（约 30+ 处）

**关键文本：**
- 基础参数：延迟因子、最小间隔、最大间隔
- 跳过条件：5 个跳过选项及其阈值
- 高级参数：3 个复选框选项
- 配置管理：加载/保存按钮
- 验证错误：4 个错误消息

### 3. AdvanceDialog.vue ⏳

**需要修复的内容：**
- 添加 `i18n` prop
- 创建 `t()` 函数
- 替换所有中文文本

**预计修改量：** 类似 PostponeDialog，约 20+ 处文本

### 4. ScheduleDateDialog.vue ⏳

**需要修复的内容：**
- 日期选择器的占位符和标签
- 年/月/日标签
- 确认/取消按钮

**预计修改量：** 较少，约 10 处文本

## 新增翻译键

### SpreadDialog 相关
```json
{
  "spreadDialogInfo": "Spread {n} cards over the next few days / 将为 {n} 张卡片执行分摊复习压力操作",
  "spreadBasicParams": "Basic Parameters / 基础参数",
  "spreadCollectingPeriod": "Collecting Period (days) / 收集期（天）",
  "spreadReschedulingPeriod": "Rescheduling Period (days) / 重新调度期（天）",
  "spreadSortingCriterion": "Sorting Criterion / 排序标准",
  "spreadAdvancedOptions": "Advanced Options / 高级选项",
  "spreadPreview": "Preview Effect / 预览效果",
  "spreadConfigManagement": "Configuration Management / 配置管理",
  "spreadConfirmButton": "Confirm Spread / 确认分散",
  "days7": "7 days / 7天",
  "days14": "14 days / 14天",
  "days30": "30 days / 30天",
  "days60": "60 days / 60天",
  "now": "Now / 现在"
}
```

### 待添加（PostponeDialog）
```json
{
  "postponeDialogInfo": "Postpone {n} cards / 将为 {n} 张卡片执行推迟操作",
  "postponeBasicParams": "Basic Parameters / 基础参数",
  "postponeDelayFactor": "Delay Factor / 延迟因子",
  "postponeMinInterval": "Min Interval (days) / 最小间隔（天）",
  "postponeMaxInterval": "Max Interval (days) / 最大间隔（天）",
  "postponeSkipConditions": "Skip Conditions / 跳过条件",
  "postponeAdvancedParams": "Advanced Parameters / 高级参数",
  "postponeConfirmButton": "Confirm Postpone / 确认推迟"
}
```

### 待添加（AdvanceDialog）
```json
{
  "advanceDialogInfo": "Advance {n} cards / 将为 {n} 张卡片执行提前操作",
  "advanceBasicParams": "Basic Parameters / 基础参数",
  "advanceMaxDays": "Max Days / 最大天数",
  "advanceConfirmButton": "Confirm Advance / 确认提前"
}
```

## 实施策略

由于对话框文件较长且修改量大，建议采用以下策略：

### 方案 A：分批修复（推荐）
1. 优先修复使用频率最高的对话框
2. 每个对话框单独测试
3. 逐步完善翻译键

### 方案 B：批量修复
1. 一次性添加所有翻译键
2. 批量修改所有对话框
3. 统一测试

### 方案 C：按需修复
1. 等待用户反馈
2. 根据实际使用情况决定优先级
3. 只修复用户常用的对话框

## 技术模式

所有对话框遵循统一的修改模式：

```typescript
// 1. 添加 i18n prop
const props = defineProps<{
  // ... 其他 props
  i18n?: Record<string, string>;
}>();

// 2. 创建 t 函数
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

// 3. 在模板中使用
<template>
  <h4>{{ t('key', 'Fallback Text') }}</h4>
</template>
```

## 测试建议

### 单元测试
```typescript
describe('SpreadDialog i18n', () => {
  it('should use i18n when provided', () => {
    const wrapper = mount(SpreadDialog, {
      props: {
        i18n: { spreadBasicParams: 'Basic Params' },
        // ... other props
      }
    });
    expect(wrapper.text()).toContain('Basic Params');
  });
  
  it('should fallback to default text', () => {
    const wrapper = mount(SpreadDialog, {
      props: {
        // no i18n prop
      }
    });
    expect(wrapper.text()).toContain('基础参数');
  });
});
```

### 手动测试
1. 切换到英文界面
2. 打开 SRS 浏览器
3. 触发各个对话框
4. 验证所有文本显示为英文

## 后续工作

### 短期（本周）
- [ ] 完成 PostponeDialog 修复
- [ ] 完成 AdvanceDialog 修复
- [ ] 完成 ScheduleDateDialog 修复

### 中期（下周）
- [ ] 添加单元测试
- [ ] 进行完整的手动测试
- [ ] 更新用户文档

### 长期
- [ ] 考虑添加更多语言支持
- [ ] 优化 i18n 系统性能
- [ ] 建立翻译贡献流程

## 相关文档

- [i18n-fixes-needed.md](./i18n-fixes-needed.md) - 国际化修复清单
- [i18n-phase1-completed.md](./i18n-phase1-completed.md) - Phase 1 完成总结
- [src/i18n/en_US.json](./src/i18n/en_US.json) - 英文翻译
- [src/i18n/zh_CN.json](./src/i18n/zh_CN.json) - 中文翻译
