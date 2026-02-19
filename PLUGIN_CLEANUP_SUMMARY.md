# 插件收尾工作完成总结

## 完成的修改

### 1. 隐藏"难点攻坚"功能

#### 1.1 顶栏右键菜单
- **文件**: `src/ui/menu/TopBar.ts`
- **修改**: 注释掉"开始难点攻坚"菜单项
- **代码**:
```typescript
// 难点攻坚功能已隐藏
// menu.addItem({
//     icon: 'iconHot',
//     label: this.plugin.i18n?.startLeechPractice || '开始难点攻坚',
//     accelerator: 'Alt+L',
//     click: () => {
//         (this.plugin as any).openLeechPracticeDialog();
//     },
// });
```

#### 1.2 浏览器"开始练习"菜单
- **文件**: `src/ui/browser/SRSBrowser.vue`
- **修改**: 注释掉"难点攻坚"菜单项
- **代码**:
```typescript
// 6. 难点攻坚（已隐藏）
// menu.addItem({
//   icon: 'iconBug',
//   label: t('practiceLeech', '难点攻坚'),
//   click: () => {
//     void plugin.openLeechReviewDialog?.();
//   },
// });
```

### 2. 插件设置调整

#### 2.1 调度器设置
- **文件**: `src/ui/settings/SettingsPanel.vue`
- **修改内容**:
  - 锁定调度器选择，不允许调整到 SM-15
  - Item/描述符卡片调度器：固定使用 FSRS v6（禁用选择）
  - 概念/Topic 卡片调度器：固定使用 A-Factor v2（禁用选择）
  - 更新说明文本：明确说明 Item 和描述符卡用同一个调度器，概念卡和 Topic 用同一个调度器

#### 2.2 功能开关
- **实时自动制卡**:
  - 调整为"自动制卡（传统）"
  - 说明：启用传统的自动制卡功能（不包括快速符号制卡）
  - 这是之前的自动制卡功能，不是现在的监听系统

#### 2.3 快速符号制卡
- **修改**: 移除所有配置选项，默认全部启用
- **保留**: 仅显示说明文本
- **说明文本**: "快速制卡符号功能已默认启用，支持所有符号类型（>>, <<, <>, ::, ;;, {{}}, >>>）。"

#### 2.4 启用调试日志
- **状态**: 功能已实现，但需要重新测试
- **实现位置**: 
  - UI: `src/ui/settings/SettingsPanel.vue`
  - 逻辑: `src/utils/disableLogs.ts`
- **工作原理**: 通过设置 `window.FSRS_DISABLE_LOGS` 来控制日志输出
- **注意**: 需要刷新页面才能生效

#### 2.5 参数优化功能
- **修改**: 完全隐藏参数优化功能
- **删除内容**:
  - UI 界面（优化按钮、进度条、结果显示）
  - 相关函数（handleOptimizeParameters, applyOptimizedParams, discardOptimizedParams）
  - 相关样式（optimization-progress, optimization-result 等）

#### 2.6 数据同步页签
- **修改**: 删除"数据同步"页签
- **原因**: Riff 数据同步是插件必要功能，不应该让用户配置
- **实现**: 
  - 移除 UI 页签
  - 配置固定为默认启用状态
  - 在代码中硬编码配置，不从 props 加载

#### 2.7 练习模式页签
- **修改**: 删除"练习模式"页签
- **删除内容**:
  - 整个练习模式 UI
  - 相关的队列配置函数（handleQueuePreview, handleQueueAdd, handleQueueStart, handleQueueClear）
  - 相关的状态变量（queueFilterType, queueFilterValue, queuePreviewCount, queueCount, queueConfigError, filterGroupsJson）

### 3. 最终设置页签结构

现在插件设置只保留两个页签：
1. **参数设置**: 包含 FSRS 参数、调度器设置、功能开关、快速制卡符号、调试日志、每日刷新时间等
2. **关于**: 包含 FSRS 介绍、链接、版本信息、数据维护等

## 代码变更统计

### 修改的文件
1. `src/ui/menu/TopBar.ts` - 隐藏难点攻坚菜单
2. `src/ui/browser/SRSBrowser.vue` - 隐藏难点攻坚菜单
3. `src/ui/settings/SettingsPanel.vue` - 大量设置调整

### 删除的功能
- 难点攻坚入口（2处）
- 参数优化功能（完整）
- 数据同步配置页签
- 练习模式配置页签
- 快速符号制卡配置选项

### 锁定的配置
- 调度器选择（Item/描述符固定 FSRS v6，概念/Topic 固定 A-Factor v2）
- Riff 数据同步（固定启用，不可配置）
- 快速符号制卡（固定启用所有符号）

## 待测试项目

1. **调试日志功能**: 需要测试开关是否真正生效
2. **设置保存**: 确认所有修改后的设置能正确保存和加载
3. **UI 显示**: 确认所有隐藏的功能在 UI 上不可见
4. **功能完整性**: 确认隐藏的功能不影响其他功能的正常使用

## 注意事项

1. 难点攻坚功能只是隐藏了入口，后端代码仍然存在，如果需要完全移除需要进一步清理
2. Riff 数据同步配置虽然在 UI 中隐藏，但在代码中仍然保持默认配置
3. 调试日志功能需要刷新页面才能生效，这是设计行为
4. 快速符号制卡的配置虽然在 UI 中隐藏，但在代码中仍然保存完整配置结构

## 后续建议

1. 如果确认不再需要难点攻坚功能，可以考虑完全移除相关代码
2. 调试日志功能可以考虑改为实时生效，不需要刷新页面
3. 可以考虑添加一个"高级设置"开关，将一些不常用的配置隐藏起来
