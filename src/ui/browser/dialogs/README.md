# Reschedule Dialog Components

本目录包含 SuperMemo 重新调度操作的 UI 对话框组件。

## 组件列表

### 1. PostponeDialog.vue
推迟操作对话框，用于收集推迟操作的参数。

**功能特性：**
- ✅ 基础参数输入（延迟因子、最小/最大间隔）
- ✅ 5 种跳过条件配置（优先级、间隔、可提取性、A-Factor、推迟次数）
- ✅ 高级参数配置（根据记忆强度和优先级动态调整）
- ✅ 配置保存/加载功能
- ✅ 实时输入验证和错误提示

**验证需求：** Requirements 12.1, 12.4, 12.5

### 2. AdvanceDialog.vue
提前操作对话框，用于收集提前操作的参数。

**功能特性：**
- ✅ 最大提前天数输入（快捷按钮 + 自定义输入）
- ✅ 随机分散选项
- ✅ 过期卡片特殊处理选项
- ✅ 预览效果显示
- ✅ 配置保存/加载功能
- ✅ 实时输入验证和错误提示

**验证需求：** Requirements 12.2, 12.4, 12.5

### 3. SpreadDialog.vue
分散操作对话框，用于收集分散操作的参数。

**功能特性：**
- ✅ 收集期和重新调度期输入（快捷按钮 + 自定义输入）
- ✅ 6 种排序标准选择（随机、优先级、间隔、延迟程度、难度、添加时间）
- ✅ 考虑未来复习选项
- ✅ 每日卡片数量限制（可选）
- ✅ 预览效果显示（操作类型、收集范围、分散范围）
- ✅ 配置保存/加载功能
- ✅ 实时输入验证和错误提示

**验证需求：** Requirements 12.3, 12.4, 12.5

### 4. RescheduleResultDialog.vue
操作结果显示对话框，用于展示重新调度操作的结果。

**功能特性：**
- ✅ 成功/失败状态显示
- ✅ 统计信息展示（成功更新、跳过、保持不变、过期处理、平均每天）
- ✅ 跳过原因详情统计
- ✅ 错误详情列表
- ✅ 友好的视觉反馈

**验证需求：** Requirements 12.7

## 使用示例

### PostponeDialog

```vue
<template>
  <PostponeDialog
    :count="selectedCards.length"
    :configManager="configManager"
    @confirm="handlePostponeConfirm"
    @cancel="handleCancel"
  />
</template>

<script setup lang="ts">
import { PostponeDialog } from '@/ui/browser/dialogs';
import type { PostponeConfig } from '@/types/reschedule';

function handlePostponeConfirm(config: PostponeConfig) {
  // 执行推迟操作
  await rescheduleService.postponeWithConfig(selectedCards, config, meta);
}
</script>
```

### AdvanceDialog

```vue
<template>
  <AdvanceDialog
    :count="selectedCards.length"
    :configManager="configManager"
    @confirm="handleAdvanceConfirm"
    @cancel="handleCancel"
  />
</template>

<script setup lang="ts">
import { AdvanceDialog } from '@/ui/browser/dialogs';
import type { AdvanceConfig } from '@/types/reschedule';

function handleAdvanceConfirm(config: AdvanceConfig) {
  // 执行提前操作
  await rescheduleService.advanceWithConfig(selectedCards, config, meta);
}
</script>
```

### SpreadDialog

```vue
<template>
  <SpreadDialog
    :count="selectedCards.length"
    :configManager="configManager"
    @confirm="handleSpreadConfirm"
    @cancel="handleCancel"
  />
</template>

<script setup lang="ts">
import { SpreadDialog } from '@/ui/browser/dialogs';
import type { SpreadConfig } from '@/types/reschedule';

function handleSpreadConfirm(config: SpreadConfig) {
  // 执行分散操作
  await rescheduleService.spreadWithConfig(selectedCards, config, meta);
}
</script>
```

### RescheduleResultDialog

```vue
<template>
  <RescheduleResultDialog
    :operationType="operationType"
    :result="result"
    @close="handleClose"
  />
</template>

<script setup lang="ts">
import { RescheduleResultDialog } from '@/ui/browser/dialogs';
import type { PostponeResult } from '@/types/reschedule';

const result = {
  success: true,
  updated: 150,
  skipped: 10,
  skippedReasons: {
    'priority': 5,
    'interval': 3,
    'postponeCount': 2
  }
};
</script>
```

## 设计特点

### 1. 一致的 UI 风格
- 使用 SiYuan 的设计系统变量（`--b3-*`）
- 统一的布局和间距
- 一致的交互模式

### 2. 完善的输入验证
- 实时验证用户输入
- 清晰的错误提示
- 禁用无效操作

### 3. 配置管理
- 保存常用配置为预设
- 快速加载预设配置
- 支持多个配置方案

### 4. 用户友好
- 快捷按钮提供常用值
- 实时预览效果
- 详细的提示信息
- 清晰的视觉反馈

### 5. 响应式设计
- 适配不同屏幕尺寸
- 滚动支持长内容
- 灵活的网格布局

## 技术栈

- **Vue 3**: Composition API
- **TypeScript**: 类型安全
- **CSS Variables**: 主题适配
- **ConfigManager**: 配置持久化

## 下一步

这些对话框组件已经完成，接下来需要：

1. 在浏览器右键菜单中集成这些对话框（Task 9）
2. 实现批量操作优化（Task 10）
3. 进行集成测试（Task 12）

## 相关文件

- 类型定义: `src/types/reschedule.ts`
- 配置管理: `src/core/scheduler/ConfigManager.ts`
- 核心引擎: `src/core/scheduler/PostponeEngine.ts`, `AdvanceEngine.ts`, `SpreadEngine.ts`
- 服务层: `src/core/scheduler/RescheduleService.ts`
