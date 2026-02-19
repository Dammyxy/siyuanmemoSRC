# i18n 修复清单

## 概述
本文档记录所有需要修复的国际化（i18n）问题，确保英文界面下所有文本都正确显示为英文。

## 修复原则
1. 所有用户可见的文本都应使用 `t(key, fallback)` 函数
2. fallback 值应该是英文，而不是中文
3. 中文翻译应该通过 i18n 配置文件提供
4. 保持代码的可维护性和一致性

---

## 1. 队列名称翻译 ✅

### 文件：`src/ui/browser/BrowserHierarchy.vue`

**状态：已完成**

```typescript
// 修改前
{ id: 'retrieval', label: t('queueExtract', '提取练习') }
{ id: 'incremental-learning', label: t('queueIncremental', '渐进学习') }

// 修改后
{ id: 'retrieval', label: t('queueExtract', 'Retrieval Practice') }
{ id: 'incremental-learning', label: t('queueIncremental', 'Incremental Learning') }
```

---

## 2. 同步按钮翻译 ✅

### 文件：`src/ui/browser/SyncStatusIndicator.vue`

**状态：已完成**

```typescript
// 修改前
{{ t('manualSync', '手动同步') }}
{{ t('fullSync', '全量同步') }}

// 修改后
{{ t('manualSync', 'Quick Sync') }}
{{ t('fullSync', 'Full Sync') }}
```

---

## 3. 右键菜单翻译 ✅

### 文件：`src/ui/browser/datasource/MenuActions.ts`

**状态：已完成**

已添加 i18n 支持到所有菜单动作函数：
- `getBaseActions(t)` - 基础动作（打开、删除、设置优先级等）
- `buildAddToQueueAction(hasQueues, t)` - 加入队列子菜单
- `buildQueueActions(options, t)` - 队列专用动作

所有菜单文本现在都通过 i18n 系统翻译，支持英文和中文。

---

## 4. 工具栏更多菜单 ⏳

### 文件：`src/ui/browser/BrowserToolbar.vue`

**问题：** 更多菜单被遮挡，无法正常弹出

**解决方案：** 注释隐藏被遮挡的菜单项

```vue
<!-- 临时隐藏被遮挡的菜单项 -->
<!-- <button class="b3-button b3-button--outline" @click="...">
  <svg><use xlink:href="#iconMore"></use></svg>
</button> -->
```

---

## 5. Spread Dialog 翻译 ✅

### 文件：`src/ui/browser/dialogs/SpreadDialog.vue`

**状态：已完成**

已添加完整的 i18n 支持：
- 添加 `i18n` prop 到组件
- 创建 `t(key, fallback)` 辅助函数
- 替换所有硬编码的中文文本
- 将 `sortingOptions` 改为 computed 属性以支持动态翻译

**新增翻译键：**
- `spreadDialogInfo`, `spreadBasicParams`, `spreadCollectingPeriod`
- `spreadReschedulingPeriod`, `spreadSortingCriterion`, `spreadAdvancedOptions`
- `spreadPreview`, `spreadConfigManagement`, `spreadConfirmButton`
- `days7`, `days14`, `days30`, `days60`, `now`
- 排序选项：`spreadSortRandom`, `spreadSortPriority`, `spreadSortInterval` 等

---

## 6. Postpone Dialog 翻译 ⏳

### 文件：`src/ui/browser/dialogs/SpreadDialog.vue`

**需要修复的内容：**

```vue
<!-- 标题 -->
<h3>分摊压力</h3>  <!-- → Spread Workload -->

<!-- 说明文本 -->
<p>将到期卡片分摊到未来几天</p>  <!-- → Spread due cards over the next few days -->

<!-- 按钮 -->
<button>应用</button>  <!-- → Apply -->
<button>取消</button>  <!-- → Cancel -->

<!-- 输入框标签 -->
<label>分摊天数</label>  <!-- → Days to spread -->
<label>每天最多</label>  <!-- → Max per day -->
```

**修复方法：**
1. 添加 i18n prop
2. 使用 `t(key, fallback)` 包装所有文本
3. 确保 fallback 值为英文

---

## 6. Postpone Dialog 翻译 ⏳

### 文件：`src/ui/browser/dialogs/PostponeDialog.vue`

**需要修复的内容：**

```vue
<!-- 标题 -->
<h3>延期复习</h3>  <!-- → Postpone Review -->

<!-- 说明文本 -->
<p>将选中的卡片延期到指定日期</p>  <!-- → Postpone selected cards to a specific date -->

<!-- 按钮 -->
<button>确定</button>  <!-- → Confirm -->
<button>取消</button>  <!-- → Cancel -->

<!-- 输入框标签 -->
<label>延期天数</label>  <!-- → Days to postpone -->
<label>延期到</label>  <!-- → Postpone to -->
```

---

## 7. Advance Dialog 翻译 ⏳

### 文件：`src/ui/browser/dialogs/AdvanceDialog.vue`

**需要修复的内容：**

```vue
<!-- 标题 -->
<h3>提前复习</h3>  <!-- → Advance Review -->

<!-- 说明文本 -->
<p>将选中的卡片提前到今天复习</p>  <!-- → Advance selected cards to review today -->

<!-- 按钮 -->
<button>确定</button>  <!-- → Confirm -->
<button>取消</button>  <!-- → Cancel -->
```

---

## 8. Schedule Date Dialog 翻译 ⏳

### 文件：`src/ui/review/v2/dialogs/ScheduleDateDialog.vue`

**需要修复的内容：**

```vue
<!-- 日期输入框占位符 -->
<input placeholder="年/月/日" />  <!-- → YYYY/MM/DD -->

<!-- 或者 -->
<label>年</label>  <!-- → Year -->
<label>月</label>  <!-- → Month -->
<label>日</label>  <!-- → Day -->
```

**修复方法：**
1. 检查日期选择器组件
2. 使用 `t(key, fallback)` 包装日期格式文本
3. 确保 fallback 值为英文格式

---

## 实施计划

### Phase 1: 高优先级（用户最常见）✅ 已完成
- [x] 队列名称（BrowserHierarchy.vue）
- [x] 同步按钮（SyncStatusIndicator.vue）
- [x] 右键菜单（MenuActions.ts）

### Phase 2: 中优先级（对话框）⏳ 进行中
- [x] Spread Dialog - 已完成
- [ ] Postpone Dialog - 待完成
- [ ] Advance Dialog - 待完成
- [ ] Schedule Date Dialog - 待完成

**进度：** 1/4 完成

**详细报告：** 见 [i18n-phase2-progress.md](./i18n-phase2-progress.md)

### Phase 3: 低优先级（工具栏）
- [ ] 工具栏更多菜单

---

## 测试清单

完成修复后，需要在英文界面下测试以下功能：

1. [ ] 打开 SRS 浏览器，检查队列名称
2. [ ] 点击同步按钮，检查按钮文字
3. [ ] 右键点击卡片，检查菜单项文字
4. [ ] 打开 Spread 对话框，检查所有文本
5. [ ] 打开 Postpone 对话框，检查所有文本
6. [ ] 打开 Advance 对话框，检查所有文本
7. [ ] 打开 Schedule Date 对话框，检查日期格式

---

## 总结

已完成 Phase 1 的所有高优先级国际化修复：

1. ✅ 队列名称翻译（BrowserHierarchy.vue）
2. ✅ 同步按钮翻译（SyncStatusIndicator.vue）  
3. ✅ 右键菜单翻译（MenuActions.ts）

已添加所有必要的 i18n 翻译键到 `en_US.json` 和 `zh_CN.json`：
- 菜单动作翻译（排序、卡片类型、加入队列等）
- 同步状态翻译（同步中、上次同步、失败等）
- 对话框翻译（Spread、Postpone、Advance 等）

Phase 2 的对话框国际化需要在各个 Vue 组件中添加 `props.i18n` 支持，这需要：
1. 在组件 props 中添加 `i18n` 参数
2. 创建 `t(key, fallback)` 辅助函数
3. 替换所有硬编码的中文文本

由于对话框文件较多且修改量大，建议分批次进行修复。当前已完成的 Phase 1 修复已经覆盖了用户最常见的界面元素。

---

## 相关文件

- `src/ui/browser/BrowserHierarchy.vue` - 队列列表
- `src/ui/browser/SyncStatusIndicator.vue` - 同步状态指示器
- `src/ui/browser/datasource/MenuActions.ts` - 右键菜单
- `src/ui/browser/BrowserToolbar.vue` - 工具栏
- `src/ui/browser/dialogs/SpreadDialog.vue` - 分摊对话框
- `src/ui/browser/dialogs/PostponeDialog.vue` - 延期对话框
- `src/ui/browser/dialogs/AdvanceDialog.vue` - 提前对话框
- `src/ui/review/v2/dialogs/ScheduleDateDialog.vue` - 日期选择对话框
