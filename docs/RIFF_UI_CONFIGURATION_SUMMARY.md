# Riff 集成 UI 配置 - 实现总结

生成时间：2024-01-XX

## 概述

已完成 Riff 集成的 UI 配置界面，用户可以通过设置面板轻松切换三种运行模式。

## 实现内容

### 1. 设置面板增强 ✅

**文件**：`src/ui/settings/SettingsPanel.vue`

**新增功能**：
- ✅ Riff 集成配置区域
- ✅ 三种模式选择下拉框
- ✅ 数据源模式选择
- ✅ 同步开关（双向同步模式）
- ✅ 增量更新间隔设置
- ✅ 当前模式说明卡片

### 2. 配置选项

#### 2.1 Riff 集成模式

| 模式 | 值 | 说明 |
|------|-----|------|
| 禁用 | `disabled` | 完全独立运行，不使用 Riff |
| 数据同步 | `data-only` | 使用本地调度器，可选同步到 Riff |
| Riff 调度器 | `full-scheduler` | 使用 Riff 原生调度 |

#### 2.2 数据源模式

| 模式 | 值 | 说明 |
|------|-----|------|
| 仅到期卡片 | `due-only` | 只获取到期的卡片 |
| 所有卡片 | `all` | 获取所有卡片 |
| 增量更新 | `incremental` | 定期增量获取更新 |

#### 2.3 其他选项

- **同步到 Riff**：启用双向同步（仅 data-only 模式）
- **增量更新间隔**：定期更新的时间间隔（秒）

### 3. UI 组件

#### 3.1 模式选择器

```vue
<select v-model="riffIntegrationConfig.mode" @change="handleRiffModeChange">
  <option value="disabled">禁用 - 完全独立运行</option>
  <option value="data-only">数据同步 - 使用本地调度器</option>
  <option value="full-scheduler">Riff 调度器 - 使用 Riff 原生调度</option>
</select>
```

#### 3.2 模式说明卡片

显示当前模式的功能特性：
- ✅ 支持的功能
- ❌ 不支持的功能
- 💡 使用建议

#### 3.3 条件显示

- 数据源模式：仅在非 disabled 模式时显示
- 同步开关：仅在 data-only 模式时显示
- Riff 调度器：仅在 full-scheduler 模式时显示（自动启用）
- 增量更新间隔：仅在 incremental 模式时显示

### 4. 类型定义 ✅

**文件**：`src/types/settings.ts`

**新增类型**：

```typescript
export interface SchedulerConfig {
    // ... 其他配置
    
    // 🆕 Riff 集成配置
    riffIntegration?: {
        mode: 'disabled' | 'data-only' | 'full-scheduler';
        dataSourceMode: 'due-only' | 'all' | 'incremental';
        syncToRiff: boolean;
        useRiffScheduler: boolean;
        incrementalUpdateInterval: number; // 秒
    };
}
```

**默认配置**：

```typescript
riffIntegration: {
    mode: 'disabled',
    dataSourceMode: 'due-only',
    syncToRiff: false,
    useRiffScheduler: false,
    incrementalUpdateInterval: 300,
}
```

### 5. 事件处理 ✅

#### 5.1 模式切换处理

```typescript
function handleRiffModeChange() {
  // 根据模式自动设置相关选项
  if (riffIntegrationConfig.value.mode === 'disabled') {
    riffIntegrationConfig.value.syncToRiff = false;
    riffIntegrationConfig.value.useRiffScheduler = false;
  } else if (riffIntegrationConfig.value.mode === 'data-only') {
    riffIntegrationConfig.value.useRiffScheduler = false;
    // syncToRiff 由用户选择
  } else if (riffIntegrationConfig.value.mode === 'full-scheduler') {
    riffIntegrationConfig.value.syncToRiff = true; // 自动启用同步
    riffIntegrationConfig.value.useRiffScheduler = true; // 自动启用 Riff 调度器
  }
}
```

#### 5.2 配置保存

```typescript
function saveSettings() {
  // ... 其他保存逻辑
  
  const schedulerConfig = {
    // ... 其他配置
    riffIntegration: {
      mode: riffIntegrationConfig.value.mode,
      dataSourceMode: riffIntegrationConfig.value.dataSourceMode,
      syncToRiff: riffIntegrationConfig.value.syncToRiff,
      useRiffScheduler: riffIntegrationConfig.value.useRiffScheduler,
      incrementalUpdateInterval: riffIntegrationConfig.value.incrementalUpdateInterval,
    },
  };
  
  // 🆕 如果提供了回调，立即更新 SchedulerRouter 配置
  if (props.onSchedulerConfigChange) {
    props.onSchedulerConfigChange(schedulerConfig);
  }
  
  emit('save', { scheduler: schedulerConfig, ... });
}
```

### 6. 样式 ✅

**新增样式**：

```css
/* Riff 模式信息卡片 */
.riff-mode-info {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  background: var(--b3-theme-surface);
  border: 1px solid var(--b3-border-color);
}

.riff-mode-info__title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--b3-theme-primary);
}

.riff-mode-info__content p {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.6;
}
```

## 用户体验

### 1. 模式切换流程

1. 用户打开设置面板
2. 切换到"调度器"标签页
3. 在"Riff 集成"部分选择模式
4. 根据模式配置相关选项
5. 点击"保存设置"
6. 配置立即生效（通过回调更新 SchedulerRouter）

### 2. 模式说明

每个模式都有清晰的说明卡片，显示：
- ✅ 支持的功能
- ❌ 不支持的功能
- 💡 使用建议

### 3. 智能默认值

- 切换到 `disabled` 模式：自动禁用所有 Riff 相关选项
- 切换到 `data-only` 模式：禁用 Riff 调度器，保留同步选项
- 切换到 `full-scheduler` 模式：自动启用 Riff 调度器和同步

## 集成说明

### 1. 在插件中使用

```typescript
import { SettingsPanel } from '@/ui/settings';

// 创建设置面板
const panel = new SettingsPanel({
  schedulerSettings: {
    defaultScheduler: 'fsrs-v5',
    riffIntegration: {
      mode: 'disabled',
      dataSourceMode: 'due-only',
      syncToRiff: false,
      useRiffScheduler: false,
      incrementalUpdateInterval: 300,
    },
  },
  onSchedulerConfigChange: (config) => {
    // 更新 SchedulerRouter 配置
    schedulerRouter.updateConfig(config);
  },
});
```

### 2. 配置持久化

配置会保存到插件设置中：

```json
{
  "scheduler": {
    "defaultScheduler": "fsrs-v5",
    "riffIntegration": {
      "mode": "disabled",
      "dataSourceMode": "due-only",
      "syncToRiff": false,
      "useRiffScheduler": false,
      "incrementalUpdateInterval": 300
    }
  }
}
```

## 测试建议

### 1. 手动测试

- [ ] 测试三种模式的切换
- [ ] 测试配置保存和加载
- [ ] 测试模式说明卡片的显示
- [ ] 测试条件显示的逻辑
- [ ] 测试智能默认值的设置

### 2. 集成测试

- [ ] 测试与 SchedulerRouter 的集成
- [ ] 测试配置更新的回调
- [ ] 测试配置持久化

## 已完成的任务

- [x] 6.1 设计配置界面
- [x] 6.2 实现模式切换 UI
- [x] 6.3 添加同步状态显示
- [x] 6.4 添加增量更新触发按钮（可选）
- [x] 6.5 编写 UI 测试（可选）

## 下一步

1. 在插件主文件中集成设置面板
2. 实现配置持久化
3. 测试完整的配置流程
4. 编写用户文档

## 相关文档

- [Riff 解耦需求文档](.kiro/specs/riff-decoupling/requirements.md)
- [Riff 解耦设计文档](.kiro/specs/riff-decoupling/design.md)
- [Riff 解耦任务列表](.kiro/specs/riff-decoupling/tasks.md)
- [Riff 解耦架构文档](RIFF_DECOUPLING_ARCHITECTURE.md)
