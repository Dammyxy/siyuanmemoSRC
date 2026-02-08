# 设置界面重组总结

## 变更概述

完成了设置界面的重组，将调度器配置整合到 Riff 集成页签中，并根据模式（简单/高级）动态显示相关配置。

## 主要变更

### 1. 删除独立的"调度器"标签页

**原因**：调度器配置只在高级模式（使用本地调度器）下有用，简单模式直接使用 Riff 调度器，不需要这些配置。

**变更**：
- 删除了 `scheduler` 标签页
- 标签页数量从 5 个减少到 4 个：参数设置、Riff 集成、练习模式、关于

### 2. 将调度器配置移至 Riff 集成页签

**位置**：Riff 集成 → 高阶模式 → 调度器设置

**包含配置**：
1. **默认调度器** - 选择 FSRS v5/SM-2/SM-15/A-Factor v2
   - 移除了 "Riff" 选项（高级模式不需要）
2. **Topic 卡片调度器** - A-Factor / A-Factor v2
3. **Item 卡片调度器** - FSRS v5 / SM-2 / SM-15
   - 移除了 "Riff" 选项（高级模式不需要）

### 3. 模式化显示逻辑

**简单模式**：
- 只显示模式选择卡片
- 隐藏所有调度器配置
- 隐藏所有同步配置

**高级模式**：
- 显示调度器设置（新增）
- 显示增量同步配置
- 显示全量同步配置
- 显示删除同步配置

## 用户体验改进

### 简化配置流程

**简单模式用户**：
1. 选择"简单模式"
2. 点击保存
3. 完成！（直接使用 Riff 调度器）

**高级模式用户**：
1. 选择"高阶模式"
2. 配置调度器（默认调度器、Topic/Item 调度器）
3. 配置同步策略（增量/全量/删除）
4. 点击保存

### 逻辑清晰

- **简单模式** = Riff 调度器 + 无需配置
- **高级模式** = 本地调度器 + 混合同步 + 需要配置

## 技术细节

### 文件变更

**siyuan-plugin-fsrs/src/ui/settings/SettingsPanel.vue**：
1. 删除 `scheduler` 标签页定义
2. 将调度器配置 UI 移至 `riff` 标签页的 `advanced-config` 区域
3. 使用 `v-if="riffIntegrationConfig.mode === 'advanced'"` 控制显示

### 配置保存逻辑

保持不变，仍然保存到 `settings.scheduler` 对象中：
```typescript
scheduler: {
  defaultScheduler: schedulerConfig.value.defaultScheduler,
  topicScheduler: schedulerConfig.value.topicScheduler,
  itemScheduler: schedulerConfig.value.itemScheduler,
}
```

### 向后兼容

- 旧配置会自动加载
- 不影响现有用户的设置
- 配置迁移器（ConfigMigrator）继续工作

## 测试建议

### 手动测试

1. **简单模式测试**：
   - 切换到简单模式
   - 确认调度器配置被隐藏
   - 保存设置
   - 重新打开设置，确认模式保持

2. **高级模式测试**：
   - 切换到高级模式
   - 确认调度器配置显示
   - 修改调度器配置
   - 保存设置
   - 重新打开设置，确认配置保持

3. **模式切换测试**：
   - 在简单模式和高级模式之间切换
   - 确认 UI 正确更新
   - 确认配置正确保存

## 构建状态

✅ 构建成功
- 无 TypeScript 错误
- 无 Vue 编译错误
- 打包大小：1,684.28 kB (gzip: 479.17 kB)

## 相关文件

- `siyuan-plugin-fsrs/src/ui/settings/SettingsPanel.vue` - 设置面板 UI
- `siyuan-plugin-fsrs/src/types/settings.ts` - 设置类型定义
- `siyuan-plugin-fsrs/src/utils/configMigrator.ts` - 配置迁移器

## 后续工作

无需额外工作，功能已完成。

---

**完成时间**：2026-02-06
**状态**：✅ 完成
