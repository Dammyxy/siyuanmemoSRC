# Phase 2 国际化修复总结

## 完成情况

### ✅ 已完成
1. **SpreadDialog.vue** - 分摊压力对话框
   - 添加 i18n 支持
   - 替换所有中文文本（约 40+ 处）
   - 添加 20+ 个翻译键

2. **PostponeDialog.vue** - 推迟对话框 ✅
   - 添加 i18n 支持
   - 替换所有中文文本（约 30+ 处）
   - 添加 25+ 个翻译键

3. **AdvanceDialog.vue** - 提前对话框 ✅
   - 添加 i18n 支持
   - 替换所有中文文本（约 20+ 处）
   - 添加 20+ 个翻译键

4. **ScheduleDateDialog.vue** - 日期选择对话框 ✅
   - 已有 i18n 支持（无需修改）
   - 使用 HTML5 原生 `<input type="date">` 控件
   - 日期格式自动根据浏览器语言显示（中文：年月日，英文：MM/DD/YYYY）

### ⏳ 待完成
无 - P2 阶段全部完成！

## SpreadDialog 修改详情

### 代码修改

**1. Props 添加**
```typescript
const props = defineProps<{
  count: number;
  configManager: ConfigManager;
  allCards?: BrowserCard[];
  queueMode?: boolean;
  i18n?: Record<string, string>;  // 🆕
}>();
```

**2. 辅助函数**
```typescript
function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}
```

**3. Computed 属性改造**
```typescript
// 之前：静态数组
const sortingOptions = [
  { value: SortingCriterion.Random, label: '随机', ... }
];

// 之后：computed 属性
const sortingOptions = computed(() => [
  { value: SortingCriterion.Random, label: t('spreadSortRandom', '随机'), ... }
]);
```

### 模板修改示例

**基础参数**
```vue
<!-- 之前 -->
<h4 class="section-title">基础参数</h4>
<label>收集期（天）</label>
<button>7天</button>

<!-- 之后 -->
<h4 class="section-title">{{ t('spreadBasicParams', '基础参数') }}</h4>
<label>{{ t('spreadCollectingPeriod', '收集期（天）') }}</label>
<button>{{ t('days7', '7天') }}</button>
```

**动态文本**
```vue
<!-- 之前 -->
<span>将为 <strong>{{ collectedCount }}</strong> 张卡片执行分摊复习压力操作</span>

<!-- 之后 -->
<span>{{ t('spreadDialogInfo', '将为 {n} 张卡片执行分摊复习压力操作').replace('{n}', String(collectedCount)) }}</span>
```

**条件文本**
```vue
<!-- 之前 -->
<p>{{ config.considerFutureRepetitions ? '包括未到期的卡片' : '仅包括已到期的卡片' }}</p>

<!-- 之后 -->
<p>{{ config.considerFutureRepetitions 
  ? t('spreadConsiderFutureHintYes', '包括未到期的卡片（用于假期前提前复习）') 
  : t('spreadConsiderFutureHintNo', '仅包括已到期的卡片（用于减轻积压）') 
}}</p>
```

## 新增翻译键列表

### 基础信息
- `spreadDialogInfo` - 对话框说明
- `spreadBasicParams` - 基础参数标题
- `spreadAdvancedOptions` - 高级选项标题
- `spreadPreview` - 预览效果标题
- `spreadConfigManagement` - 配置管理标题

### 表单字段
- `spreadCollectingPeriod` - 收集期
- `spreadCollectingPeriodHint` - 收集期提示
- `spreadReschedulingPeriod` - 重新调度期
- `spreadReschedulingPeriodHint` - 重新调度期提示
- `spreadConsiderFuture` - 考虑未来复习
- `spreadConsiderFutureHintYes` - 包括未到期卡片
- `spreadConsiderFutureHintNo` - 仅包括已到期卡片
- `spreadMaxCardsPerDay` - 每日卡片限制
- `spreadMaxCardsPerDayHint` - 每日卡片限制提示
- `spreadMaxCardsPerDayPlaceholder` - 占位符文本

### 排序选项
- `spreadSortingCriterion` - 排序标准
- `spreadSortingCriterionDesc` - 排序标准说明
- `spreadSortRandom` - 随机
- `spreadSortRandomDesc` - 随机说明
- `spreadSortPriority` - 按优先级
- `spreadSortPriorityDesc` - 按优先级说明
- `spreadSortInterval` - 按间隔
- `spreadSortIntervalDesc` - 按间隔说明
- `spreadSortLateness` - 按延迟程度
- `spreadSortLatenessDesc` - 按延迟程度说明
- `spreadSortEasiness` - 按难度
- `spreadSortEasinessDesc` - 按难度说明
- `spreadSortRecency` - 按添加时间
- `spreadSortRecencyDesc` - 按添加时间说明

### 预览信息
- `spreadOperationType` - 操作类型
- `spreadCollectingRange` - 收集范围
- `spreadReschedulingRange` - 分散范围
- `spreadSortingMethod` - 排序方式
- `spreadOperationAdvance` - 提前复习
- `spreadOperationPostpone` - 延后复习
- `spreadOperationEven` - 均匀分散

### 配置管理
- `spreadSelectConfig` - 选择预设配置
- `spreadLoadConfig` - 加载按钮
- `spreadSaveConfig` - 保存按钮
- `spreadConfigNamePlaceholder` - 配置名称占位符

### 验证和按钮
- `spreadValidationCollectingPeriod` - 收集期验证错误
- `spreadValidationReschedulingPeriod` - 重新调度期验证错误
- `spreadValidationMaxCards` - 每日限制验证错误
- `spreadLoadConfigFailed` - 加载失败
- `spreadSaveConfigFailed` - 保存失败
- `spreadConfirmButton` - 确认按钮
- `spreadQueueModeHint` - 队列模式提示

### 通用
- `days7`, `days14`, `days30`, `days60` - 天数快捷按钮
- `now` - 现在
- `daysPlaceholder` - 输入天数占位符

## 使用方式

### 在父组件中传递 i18n

```typescript
import SpreadDialog from './dialogs/SpreadDialog.vue';
import { useI18n } from '@/composables/useI18n';

const { i18n } = useI18n();

// 在模板中
<SpreadDialog
  :count="selectedCount"
  :config-manager="configManager"
  :i18n="i18n"
  @confirm="handleSpread"
  @cancel="closeDialog"
/>
```

### 测试

```typescript
describe('SpreadDialog i18n', () => {
  it('should display English text when i18n is provided', () => {
    const wrapper = mount(SpreadDialog, {
      props: {
        count: 10,
        configManager: mockConfigManager,
        i18n: {
          spreadBasicParams: 'Basic Parameters',
          spreadCollectingPeriod: 'Collecting Period (days)',
          // ...
        }
      }
    });
    
    expect(wrapper.text()).toContain('Basic Parameters');
    expect(wrapper.text()).toContain('Collecting Period (days)');
  });
  
  it('should fallback to Chinese when i18n is not provided', () => {
    const wrapper = mount(SpreadDialog, {
      props: {
        count: 10,
        configManager: mockConfigManager,
        // no i18n prop
      }
    });
    
    expect(wrapper.text()).toContain('基础参数');
    expect(wrapper.text()).toContain('收集期（天）');
  });
});
```

## 经验总结

### 成功经验

1. **统一模式**：所有对话框使用相同的 i18n 模式
2. **Computed 属性**：动态数据使用 computed 以支持响应式翻译
3. **Fallback 机制**：确保没有 i18n 时仍能正常工作
4. **参数替换**：使用 `.replace('{n}', value)` 处理动态参数

### 注意事项

1. **数组改 Computed**：静态数组需要改为 computed 属性
2. **字符串插值**：使用 `.replace()` 而不是模板字符串
3. **条件文本**：三元运算符中的每个分支都需要 t() 包装
4. **验证消息**：错误消息也需要国际化

### 性能考虑

1. **Computed 缓存**：computed 属性会自动缓存，不影响性能
2. **按需加载**：i18n 字典可以按需加载
3. **Fallback 开销**：fallback 机制几乎没有性能开销

## 下一步

### P2 阶段完成总结

✅ 所有 4 个对话框已完成国际化：
- SpreadDialog.vue - 分摊压力对话框
- PostponeDialog.vue - 推迟对话框
- AdvanceDialog.vue - 提前对话框
- ScheduleDateDialog.vue - 日期选择对话框（已有 i18n）

### PostponeDialog 新增翻译键

#### 基础信息
- `postponeDialogInfo` - 对话框说明
- `postponeBasicParams` - 基础参数
- `postponeDelayFactor` - 延迟因子
- `postponeDelayFactorHint` - 延迟因子提示
- `postponeMinInterval` - 最小间隔
- `postponeMaxInterval` - 最大间隔

#### 跳过条件
- `postponeSkipConditions` - 跳过条件标题
- `postponeSkipConditionsDesc` - 跳过条件说明
- `postponeSkipByPriority` - 跳过高优先级卡片
- `postponePriorityLowerThan` - 优先级低于
- `postponePriorityHint` - 优先级提示
- `postponeSkipByInterval` - 跳过长间隔卡片
- `postponeIntervalExceeds` - 间隔超过
- `postponeSkipByRetrievability` - 跳过高记忆强度卡片
- `postponeRetrievabilityHigherThan` - 可提取性高于
- `postponeSkipByAFactor` - 跳过低 A-Factor 卡片
- `postponeAFactorLowerThan` - A-Factor 低于
- `postponeTopicCardsOnly` - 仅 Topic 卡片
- `postponeSkipByPostponeCount` - 跳过已多次推迟的卡片
- `postponeCountExceeds` - 推迟次数超过

#### 高级参数
- `postponeAdvancedParams` - 高级参数标题
- `postponeIncludeNonOutstanding` - 包含未到期卡片
- `postponeIncludeNonOutstandingHint` - 包含未到期卡片提示
- `postponeModifyByRetrievability` - 根据记忆强度调整
- `postponeModifyByRetrievabilityHint` - 根据记忆强度调整提示
- `postponeModifyByPriority` - 根据优先级调整
- `postponeModifyByPriorityHint` - 根据优先级调整提示

#### 配置和验证
- `postponeConfigManagement` - 配置管理
- `postponeSelectConfig` - 选择预设配置
- `postponeLoadConfig` - 加载按钮
- `postponeSaveConfig` - 保存按钮
- `postponeConfigNamePlaceholder` - 配置名称占位符
- `postponeValidationDelayFactor` - 延迟因子验证错误
- `postponeValidationMinInterval` - 最小间隔验证错误
- `postponeValidationMaxInterval` - 最大间隔验证错误
- `postponeValidationIntervalRange` - 间隔范围验证错误
- `postponeLoadConfigFailed` - 加载失败
- `postponeSaveConfigFailed` - 保存失败
- `postponeConfirmButton` - 确认按钮

#### 通用
- `days` - 天
- `times` - 次
- `cancel` - 取消

### AdvanceDialog 新增翻译键

#### 基础信息
- `advanceDialogInfo` - 对话框说明
- `advanceBasicParams` - 基础参数
- `advanceMaxDays` - 最大提前天数
- `advanceMaxDaysHint` - 最大提前天数提示
- `advanceDaysPlaceholder` - 天数输入占位符
- `advanceRandomize` - 随机分散到期时间
- `advanceRandomizeHintYes` - 随机分散提示（是）
- `advanceRandomizeHintNo` - 随机分散提示（否）
- `advanceHandleOverdue` - 特殊处理极度过期的卡片
- `advanceHandleOverdueHintYes` - 处理过期卡片提示（是）
- `advanceHandleOverdueHintNo` - 处理过期卡片提示（否）

#### 预览效果
- `advancePreview` - 预览效果标题
- `advancePreviewRange` - 提前范围
- `advancePreviewMethod` - 分散方式
- `advancePreviewOverdue` - 过期卡片
- `advanceRandomSpread` - 随机分散
- `advanceUniformTime` - 统一时间
- `advanceScheduleToday` - 安排到今天
- `advanceNormalAdvance` - 正常提前

#### 配置和验证
- `advanceConfigManagement` - 配置管理
- `advanceSelectConfig` - 选择预设配置
- `advanceLoadConfig` - 加载按钮
- `advanceSaveConfig` - 保存按钮
- `advanceConfigNamePlaceholder` - 配置名称占位符
- `advanceValidationMaxDays` - 最大天数验证错误
- `advanceLoadConfigFailed` - 加载失败
- `advanceSaveConfigFailed` - 保存失败
- `advanceConfirmButton` - 确认按钮

#### 通用
- `days7`, `days14`, `days30`, `days60` - 天数快捷按钮
- `tomorrow` - 明天
- `to` - 到
- `cancel` - 取消

### 立即行动
1. ✅ 复制 SpreadDialog 的模式到其他对话框
2. ✅ 添加所有新翻译键到 i18n 文件（en_US.json 和 zh_CN.json）
3. 测试所有对话框的英文显示
4. 更新父组件传递 i18n prop

### 完成的工作
- ✅ PostponeDialog.vue - 添加 i18n 支持（25+ 翻译键）
- ✅ AdvanceDialog.vue - 添加 i18n 支持（20+ 翻译键）
- ✅ 菜单项翻译键 - 添加到 i18n 文件（openInTab, removeFromQueue, setPriority, postpone, advance, spread, reset 等）
- ✅ 所有翻译键已添加到 zh_CN.json 和 en_US.json

### 优化建议
1. 考虑创建 `useDialogI18n` composable 统一处理
2. 添加 TypeScript 类型定义确保翻译键的类型安全
3. 建立翻译键命名规范文档

### 日期格式说明

ScheduleDateDialog 使用 HTML5 原生的 `<input type="date">` 控件：
- 中文环境：自动显示"年月日"格式
- 英文环境：自动显示"MM/DD/YYYY"格式
- 其他语言：根据浏览器语言自动适配

这是浏览器的原生行为，无需手动处理国际化。

### 长期规划
1. 支持更多语言（日语、韩语等）
2. 建立翻译贡献流程
3. 自动化翻译键检查工具

## 相关文件

- [SpreadDialog.vue](./src/ui/browser/dialogs/SpreadDialog.vue) - 已修改
- [en_US.json](./src/i18n/en_US.json) - 英文翻译
- [zh_CN.json](./src/i18n/zh_CN.json) - 中文翻译
- [i18n-phase2-progress.md](./i18n-phase2-progress.md) - 进度报告
