# 设置面板清理和更新计划

## 当前状态分析

### 现有标签页
1. **参数设置** (params) - ✅ 保留并改进
2. **Riff 集成** (riff) - ✅ 保留但需清理（改名为"数据同步"）
3. **练习模式** (practice) - ✅ 保留
4. **关于** (about) - ✅ 保留并更新

## 清理计划

### 1. Riff 集成标签页 → 数据同步标签页

**保留的内容**（数据同步功能）：
- ✅ 增量同步配置
- ✅ 全量同步配置
- ✅ 删除同步配置
- ✅ 触发时机设置
- ✅ 黑名单管理

**需要删除的内容**（调度器相关）：
- ❌ 默认调度器选择器
- ❌ Topic 调度器选择器
- ❌ Item 调度器选择器
- ❌ `schedulerConfig` 相关代码
- ❌ 调度器说明文本

**建议改名**：
- 标签名：`Riff 集成` → `数据同步` 或 `Riff 同步`
- 标签 key：`riff` → `sync`（可选，保持 `riff` 也可以）

### 2. 参数设置标签页

**需要删除的内容**：
- 无（参数设置中没有过时内容）

**需要改进的内容**：
- ✅ 改进短期记忆模式说明
- ✅ 更新参数优化说明（添加 WASM 环境检测提示）

### 3. 关于标签页

**需要更新的内容**：
- ✅ 更新版本信息：`FSRS-5` → `FSRS v6`
- ✅ 添加 ts-fsrs 版本号
- ✅ 添加调度器清理说明

## 更新计划

### 1. 清理 Riff 标签页中的调度器配置

**删除以下代码块**：

```vue
<!-- 删除：调度器设置部分 -->
<h4>{{ t('schedulerSettingsTitle', '调度器设置') }}</h4>

<div class="form-item">
  <label>{{ t('defaultScheduler', '默认调度器') }}</label>
  <!-- ... 删除整个调度器选择器 ... -->
</div>

<div class="form-item">
  <label>{{ t('topicScheduler', 'Topic 卡片调度器') }}</label>
  <!-- ... 删除 ... -->
</div>

<div class="form-item">
  <label>{{ t('itemScheduler', 'Item 卡片调度器') }}</label>
  <!-- ... 删除 ... -->
</div>
```

**保留以下内容**：

```vue
<!-- 保留：数据同步配置 -->
<h3>{{ t('riffSyncTitle', 'Riff 数据同步') }}</h3>

<h4>{{ t('incrementalSyncConfig', '增量同步配置') }}</h4>
<!-- ... 保留所有同步相关配置 ... -->

<h4>{{ t('fullSyncConfig', '全量同步配置') }}</h4>
<!-- ... 保留 ... -->

<h4>{{ t('deleteSyncConfig', '删除同步配置') }}</h4>
<!-- ... 保留 ... -->
```

### 2. 改进短期记忆模式说明

**当前**：
```vue
<label>{{ t('enableShortTerm', '启用短期调度器') }}</label>
<p class="form-hint">{{ t('enableShortTermHint', '是否使用短期调度策略（学习阶段）') }}</p>
```

**改进为**：
```vue
<label>{{ t('enableShortTerm', '启用短期记忆模式') }}</label>
<div class="form-control">
  <input type="checkbox" v-model="settings.enableShortTerm">
  <span class="form-label-inline">为新卡片提供更密集的复习计划</span>
</div>
<p class="form-hint">
  {{ t('enableShortTermHint', '短期记忆模式会在学习阶段提供更多复习机会（如 10分钟、1小时、6小时），帮助快速建立记忆。推荐开启。') }}
</p>
<div class="form-example" v-if="settings.enableShortTerm">
  <span class="example-label">✓ 已启用</span>
  <span class="example-value">新卡片将获得更密集的复习计划</span>
</div>
```

### 3. 更新关于标签页

**当前**：
```vue
<h4>{{ t('version', '版本') }}</h4>
<p>FSRS-5 (ts-fsrs)</p>
```

**更新为**：
```vue
<h4>{{ t('version', '版本') }}</h4>
<div class="version-info">
  <p><strong>FSRS v6</strong></p>
  <p class="version-detail">使用官方 ts-fsrs 库 (v5.2.3)</p>
  <p class="form-hint">
    相比之前的实现，FSRS v6 提供：
  </p>
  <ul class="feature-list">
    <li>✓ 更准确的算法实现</li>
    <li>✓ 短期记忆模式支持</li>
    <li>✓ 参数优化功能</li>
    <li>✓ 官方维护，持续更新</li>
  </ul>
</div>

<h4>{{ t('recentChanges', '最近更新') }}</h4>
<div class="changelog">
  <p><strong>2025-02-14</strong></p>
  <ul>
    <li>✓ 集成官方 ts-fsrs 库（FSRS v6）</li>
    <li>✓ 移除旧的 SimpleFSRSScheduler</li>
    <li>✓ 移除 SM2 调度器</li>
    <li>✓ 修复无效日期问题</li>
  </ul>
</div>
```

### 4. 添加参数优化环境提示

在参数优化部分添加：

```vue
<div class="form-item">
  <label>{{ t('optimizeParameters', '优化 FSRS 参数') }}</label>
  
  <!-- 环境检测提示 -->
  <div v-if="!wasmSupported" class="form-warning">
    <p>⚠️ {{ t('wasmNotSupported', '参数优化功能需要 WASM 支持，当前环境暂不支持。') }}</p>
    <p class="form-hint">
      {{ t('wasmNotSupportedHint', '建议使用默认参数，或在支持 WASM 的环境中进行参数优化。') }}
    </p>
  </div>
  
  <p class="form-hint">
    {{ t('optimizeParametersHint', '根据你的复习历史数据自动优化 FSRS 参数，提高算法准确性。需要至少 100 条复习记录。') }}
  </p>
  
  <div class="form-control">
    <button 
      class="b3-button b3-button--outline" 
      @click="handleOptimizeParameters"
      :disabled="isOptimizing || !wasmSupported"
    >
      {{ isOptimizing ? t('optimizing', '优化中...') : t('startOptimization', '开始优化') }}
    </button>
  </div>
  
  <!-- ... 其余优化相关 UI ... -->
</div>
```

## 实施步骤

### 第一阶段：清理调度器配置（高优先级）
1. ✅ 从 Riff 标签页删除调度器选择器
2. ✅ 删除 `schedulerConfig` 相关代码
3. ✅ 删除 `schedulerDescriptions`
4. ✅ 更新标签名称（可选）

### 第二阶段：改进说明（中优先级）
1. ⏳ 改进短期记忆模式说明
2. ⏳ 更新 FSRS 版本信息
3. ⏳ 添加参数优化环境检测

### 第三阶段：优化（低优先级）
1. ⏳ 添加更新日志
2. ⏳ 改进 UI 布局
3. ⏳ 添加帮助文档链接

## 建议的最终配置

### 标签页结构
```
1. 参数设置 (params)
   - FSRS 参数（请求保留率、最大间隔）
   - 短期记忆模式 ⭐ 改进说明
   - 功能开关（自动制卡、调试日志）
   - 每日刷新时间
   - 参数优化 ⭐ 添加环境检测
   - 数据维护

2. 数据同步 (riff) ⭐ 改名
   - 增量同步配置
   - 全量同步配置
   - 删除同步配置
   ❌ 删除：调度器选择器

3. 练习模式 (practice)
   - 队列练习
   - 块练习

4. 关于 (about)
   - FSRS 介绍
   - 版本信息 ⭐ 更新为 v6
   - 最近更新 ⭐ 新增
   - 链接
```

## 总结

**删除**：
- Riff 标签页中的调度器选择器（默认、Topic、Item）
- `schedulerConfig` 相关代码
- `schedulerDescriptions` 对象

**保留**：
- Riff 标签页（改名为"数据同步"）
- 所有数据同步相关配置
- 参数设置标签页
- 练习模式标签页
- 关于标签页

**改进**：
- 短期记忆模式说明（更详细、更友好）
- FSRS 版本信息（v6 + 特性列表）
- 参数优化环境检测（WASM 支持提示）
- 添加更新日志

**可选**：
- 标签名：`Riff 集成` → `数据同步`
- 标签图标：`#iconCloud` 保持不变

## 更新计划

### 1. 改进短期记忆模式说明

**当前**：
```vue
<label>{{ t('enableShortTerm', '启用短期调度器') }}</label>
<p class="form-hint">{{ t('enableShortTermHint', '是否使用短期调度策略（学习阶段）') }}</p>
```

**建议改为**：
```vue
<label>{{ t('enableShortTerm', '启用短期记忆模式') }}</label>
<p class="form-hint">
  {{ t('enableShortTermHint', '为新卡片提供更密集的复习计划，帮助快速建立记忆。推荐开启。') }}
</p>
<div class="form-example">
  <span class="example-label">效果：</span>
  <span class="example-value">新卡片会在学习阶段获得更多复习机会（如 10分钟、1小时、6小时）</span>
</div>
```

### 2. 添加 FSRS v6 说明

在"关于"标签页中更新：

**当前**：
```
<h4>{{ t('version', '版本') }}</h4>
<p>FSRS-5 (ts-fsrs)</p>
```

**建议改为**：
```vue
<h4>{{ t('version', '版本') }}</h4>
<p>FSRS v6 (ts-fsrs 5.2.3)</p>
<p class="form-hint">
  使用官方 ts-fsrs 库，提供最准确的 FSRS v6 算法实现。
  相比之前的 SimpleFSRSScheduler，算法更准确，支持短期记忆模式和参数优化。
</p>
```

### 3. 简化参数优化说明

**当前状态**：参数优化功能已实现，但 WASM 模块在思源环境中无法加载

**建议**：
1. 保留参数优化 UI
2. 添加环境检测和友好提示
3. 如果 WASM 加载失败，显示替代方案

```vue
<div v-if="!wasmSupported" class="form-warning">
  <p>⚠️ 参数优化功能需要 WASM 支持，当前环境不支持。</p>
  <p>建议：使用默认参数或手动调整参数。</p>
</div>
```

## 实施步骤

### 第一阶段：清理（高优先级）
1. ✅ 删除 Riff 集成标签页
2. ✅ 更新调度器选择器选项
3. ✅ 移除 `riffIntegrationConfig` 相关代码
4. ✅ 更新类型定义

### 第二阶段：改进（中优先级）
1. ⏳ 改进短期记忆模式说明
2. ⏳ 更新 FSRS 版本信息
3. ⏳ 添加参数优化环境检测

### 第三阶段：优化（低优先级）
1. ⏳ 简化练习模式说明
2. ⏳ 添加更多帮助文档链接
3. ⏳ 改进 UI 布局

## 用户影响评估

### 破坏性变更
- ❌ 删除 Riff 集成配置
  - 影响：使用 Riff 的用户（目前只有开发者）
  - 缓解：无需缓解，功能已不可用

- ❌ 删除 SM2 调度器选项
  - 影响：选择 SM2 的用户
  - 缓解：自动回退到 FSRS v6

### 非破坏性变更
- ✅ 改进短期记忆模式说明
- ✅ 更新版本信息
- ✅ 添加环境检测

## 建议的最终配置

### 标签页结构
```
1. 参数设置 (params)
   - FSRS 参数
   - 功能开关
   - 参数优化
   - 数据维护

2. 练习模式 (practice)
   - 队列练习
   - 块练习

3. 关于 (about)
   - FSRS 介绍
   - 版本信息
   - 链接
```

### 调度器选项
```
默认调度器：
- FSRS v6 (推荐) - 现代算法，准确预测遗忘曲线
- SM-15 - SuperMemo 15 算法，完整的遗忘曲线系统
- A-Factor v2 - 改进的 A-Factor，动态调整难度

Topic 卡片调度器：
- A-Factor v2 (推荐) - 动态难度调整
- A-Factor (原始) - 固定难度因子

Item 卡片调度器：
- FSRS v6 (推荐) - 精确间隔计算
- SM-15 - 传统算法
```

## 总结

**删除**：
- Riff 集成标签页及所有相关代码
- SM2 调度器选项

**保留**：
- 参数设置标签页
- 练习模式标签页（需确认）
- 关于标签页
- 短期记忆模式开关
- 参数优化功能（添加环境检测）

**改进**：
- 短期记忆模式说明
- FSRS 版本信息
- 调度器选项说明
