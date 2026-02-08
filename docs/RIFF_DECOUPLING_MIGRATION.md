# Riff 解耦迁移指南

## 概述

本指南帮助用户理解 Riff 解耦功能，并选择适合自己的运行模式。

## 三种运行模式

### 模式 1：完全独立模式（推荐）

**适用场景**：
- 不使用思源原生 Riff 闪卡系统
- 希望完全独立运行 FSRS 插件
- 需要使用 Xiuyuan 多卡片功能
- 追求最佳性能和稳定性

**配置**：
```typescript
{
  scheduler: {
    riffIntegration: {
      mode: 'disabled',
      syncToRiff: false,
      useRiffScheduler: false
    }
  }
}
```

**特点**：
- ✅ 完全本地运行，不依赖 Riff
- ✅ 支持 Xiuyuan 多卡片功能
- ✅ 性能最优
- ✅ 数据完全独立
- ❌ 不与 Riff 生态集成

**数据流**：
```
本地存储 → 本地调度器 → 本地存储
```

### 模式 2：双向同步模式

**适用场景**：
- 同时使用 FSRS 插件和 Riff 系统
- 希望将 FSRS 调度结果同步到 Riff 作为备份
- 需要使用 Xiuyuan 多卡片功能
- 希望在 Riff 中查看复习记录

**配置**：
```typescript
{
  scheduler: {
    riffIntegration: {
      mode: 'data-only',
      dataSourceMode: 'due-only',  // 或 'all' / 'incremental'
      syncToRiff: true,
      useRiffScheduler: false
    }
  }
}
```

**特点**：
- ✅ 使用本地 FSRS 调度器
- ✅ 支持 Xiuyuan 多卡片功能
- ✅ 同步结果到 Riff（作为备份）
- ✅ Riff 同步失败不影响本地数据
- ⚠️ 需要网络连接（同步时）
- ⚠️ Riff 只能存储部分调度参数（due 字段）

**数据流**：
```
Riff (数据源) → 本地调度器 → 本地存储
                              ↓
                         syncToRiff()
                              ↓
                         Riff (备份)
```

### 模式 3：Riff 调度器模式

**适用场景**：
- 主要使用 Riff 原生调度
- 不需要 Xiuyuan 多卡片功能
- 希望与 Riff 生态完全兼容
- 简单使用场景（一个块 = 一张卡片）

**配置**：
```typescript
{
  scheduler: {
    riffIntegration: {
      mode: 'full-scheduler',
      dataSourceMode: 'all',
      syncToRiff: true,
      useRiffScheduler: true
    }
  }
}
```

**特点**：
- ✅ 使用 Riff 原生调度算法
- ✅ 与 Riff 生态完全兼容
- ✅ 简单模式，易于理解
- ❌ 不支持 Xiuyuan 多卡片功能
- ❌ 不支持 FSRS 高级功能
- ⚠️ 依赖 Riff 系统

**数据流**：
```
Riff (数据源 + 调度器) → RiffSchedulerAdapter → Riff
```

## 数据源模式

当使用模式 2 或模式 3 时，可以选择数据源模式：

### due-only（仅到期）

**特点**：
- 只获取到期的卡片
- 性能最优
- 适合日常复习

**配置**：
```typescript
{
  dataSourceMode: 'due-only'
}
```

### all（所有卡片）

**特点**：
- 获取所有卡片（包括未到期）
- 数据完整
- 适合浏览和管理

**配置**：
```typescript
{
  dataSourceMode: 'all'
}
```

### incremental（增量更新）

**特点**：
- 只获取新增的卡片
- 定期同步
- 适合大量卡片场景

**配置**：
```typescript
{
  dataSourceMode: 'incremental',
  incrementalUpdateInterval: 3600000  // 1 小时
}
```

## 迁移步骤

### 从旧版本迁移

1. **备份数据**：
   ```bash
   # 备份插件数据目录
   cp -r workspace/data/storage/petal/siyuan-plugin-fsrs workspace/data/storage/petal/siyuan-plugin-fsrs.backup
   ```

2. **更新插件**：
   - 下载最新版本
   - 重启思源笔记

3. **选择运行模式**：
   - 打开插件设置面板
   - 在"Riff 集成"部分选择运行模式
   - 保存设置

4. **验证功能**：
   - 创建测试卡片
   - 进行复习测试
   - 检查数据同步状态

### 从 Riff 迁移到 FSRS

如果你之前使用 Riff 原生闪卡，现在想切换到 FSRS 插件：

1. **导出 Riff 数据**（可选）：
   - Riff 数据会自动作为数据源
   - 无需手动导出

2. **选择模式 2（双向同步）**：
   - 保留 Riff 数据作为备份
   - 使用 FSRS 调度器

3. **逐步迁移**：
   - 先在小范围测试
   - 确认无误后全面使用

## 配置示例

### 示例 1：独立用户

```json
{
  "scheduler": {
    "defaultScheduler": "fsrs-v5",
    "riffIntegration": {
      "mode": "disabled",
      "syncToRiff": false,
      "useRiffScheduler": false
    }
  }
}
```

### 示例 2：双向同步用户

```json
{
  "scheduler": {
    "defaultScheduler": "fsrs-v5",
    "riffIntegration": {
      "mode": "data-only",
      "dataSourceMode": "due-only",
      "syncToRiff": true,
      "useRiffScheduler": false,
      "incrementalUpdateInterval": 3600000
    }
  }
}
```

### 示例 3：Riff 原生用户

```json
{
  "scheduler": {
    "defaultScheduler": "riff",
    "riffIntegration": {
      "mode": "full-scheduler",
      "dataSourceMode": "all",
      "syncToRiff": true,
      "useRiffScheduler": true
    }
  }
}
```

## Riff API 限制

### 当前限制

1. **只支持更新 due 字段**：
   - Riff API 目前只支持更新 `due`（到期时间）字段
   - 不支持更新 `state`、`reps`、`lapses` 等字段

2. **cardID 策略**：
   - 始终使用 blockID 作为 cardID
   - 简化查询和同步逻辑
   - 保持本地和 Riff 一致

3. **Topic 卡片过滤**：
   - 使用 Riff 调度器时，Topic 卡片会被过滤
   - Topic 卡片不适合 Riff 的简单模式

### 未来改进

- 支持更多字段的同步
- 支持批量操作优化
- 支持冲突解决策略

## Xiuyuan 多卡片支持

### 模式 1 和模式 2

- ✅ 完全支持 Xiuyuan 多卡片功能
- ✅ 一个块可以生成多张卡片
- ✅ 支持复杂的卡片模板

### 模式 3

- ❌ 不支持 Xiuyuan 多卡片功能
- ⚠️ 简单模式：一个块 = 一张卡片
- ⚠️ 如需多卡片功能，请使用模式 1 或模式 2

### cardID 策略

**所有模式**：
- 始终使用 blockID 作为 cardID
- 保持本地和 Riff 数据一致
- 简化查询和同步逻辑

**Xiuyuan 多卡片**（模式 1 和 2）：
- 每张卡片有独立的 cardID
- 通过 CardMapping 关联到 blockID
- 支持复杂的卡片关系

## 错误处理

### Riff 同步失败

**行为**：
- Riff 操作失败不影响本地数据
- 失败时只记录警告
- 用户可以继续正常使用

**日志示例**：
```
[WARN] Riff sync failed: Network error
[INFO] Local data saved successfully
```

### 本地存储失败

**行为**：
- 本地存储操作必须成功
- 失败时抛出异常
- 用户会收到错误提示

**处理建议**：
- 检查磁盘空间
- 检查文件权限
- 重启思源笔记

## 性能优化

### 模式选择

- **最优性能**：模式 1（完全独立）
- **平衡性能**：模式 2 + due-only 数据源
- **完整数据**：模式 2 + all 数据源
- **增量同步**：模式 2 + incremental 数据源

### 数据源模式

| 模式 | 性能 | 数据完整性 | 适用场景 |
|------|------|-----------|----------|
| due-only | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 日常复习 |
| all | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 浏览管理 |
| incremental | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 大量卡片 |

## 常见问题

### Q1: 如何选择运行模式？

A: 根据使用场景选择：
- 不使用 Riff → 模式 1
- 需要 Riff 备份 → 模式 2
- 主要使用 Riff → 模式 3

### Q2: 可以随时切换模式吗？

A: 可以。配置支持动态更新，无需重启插件。

### Q3: Riff 同步失败怎么办？

A: 不用担心，本地数据不受影响。检查网络连接后重试即可。

### Q4: 模式 3 为什么不支持 Xiuyuan？

A: Riff 原生调度采用简单模式（一个块 = 一张卡片），与 Xiuyuan 的多卡片设计不兼容。

### Q5: 如何查看同步状态？

A: 在复习界面可以看到同步状态指示器，显示最后同步时间和失败警告。

## 相关文档

- [Riff 解耦架构文档](RIFF_DECOUPLING_ARCHITECTURE.md)
- [Riff 数据流图](RIFF_DATA_FLOW_DIAGRAM.md)
- [Riff 集成用户指南](RIFF_INTEGRATION_USER_GUIDE.md)
- [架构文档](../ARCHITECTURE.md)

---

*文档版本: 1.0*
*最后更新: 2026-02-03*
