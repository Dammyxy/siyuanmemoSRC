# FSRS v6 升级迁移指南

> 本文档说明如何从 FSRS v5 升级到 FSRS v6，以及升级过程中的注意事项。

## 概述

插件已升级到 FSRS v6 算法（使用 ts-fsrs 5.2.3），提供更准确的记忆预测和优化的复习计划。

**好消息**：升级过程完全自动化，无需手动操作！

## 主要变更

### 1. 算法升级

- ✅ **FSRS v5 → FSRS v6**：使用最新的 FSRS-6.0 算法
- ✅ **保留所有数据**：复习历史、调度参数完整保留
- ✅ **自动迁移**：配置和卡片数据自动迁移

### 2. 调度器简化

**可用调度器（Item 卡片）**：
- `FSRS v6` - 默认推荐
- `Riff` - 思源原生调度器
- `SM-15` - SuperMemo 15 算法

**已移除调度器**：
- ~~`FSRS v5`~~ → 自动迁移到 FSRS v6
- ~~`SM-2`~~ → 自动迁移到 FSRS v6

### 3. Topic 调度器固定

- **Topic 卡片**现在固定使用 `A-Factor v2` 调度器
- 设置面板中不再显示 Topic 调度器选择选项
- 这是为了简化配置，A-Factor v2 最适合增量阅读材料

## 自动迁移

### 配置迁移

插件启动时自动执行以下迁移：

```
defaultScheduler: 'fsrs-v5' → 'fsrs-v6'
defaultScheduler: 'sm2' → 'fsrs-v6'
itemScheduler: 'fsrs-v5' → 'fsrs-v6'
itemScheduler: 'sm2' → 'fsrs-v6'
topicScheduler: (任何值) → (删除字段)
```

### 卡片数据迁移

卡片的调度器类型自动迁移：

```
card.schedulerType: 'fsrs-v5' → 'fsrs-v6'
card.schedulerType: 'sm2' → 'fsrs-v6'
card.schedulerType: 'a-factor' → 'a-factor-v2'
```

**重要保证**：
- ✅ 所有复习历史完整保留
- ✅ 所有调度参数（stability, difficulty 等）保持不变
- ✅ 卡片元数据（tags, priority 等）不受影响
- ✅ 迁移失败时保持原数据不变

## 升级步骤

### 对于普通用户

**无需任何操作！**

1. 更新插件到最新版本
2. 重启思源笔记
3. 插件自动完成迁移
4. 继续正常使用

### 对于开发者

如果你基于本插件进行二次开发，需要注意以下变更：

#### 类型定义变更

```typescript
// ❌ 旧代码
interface SchedulerConfig {
  defaultScheduler: 'fsrs-v5' | 'riff' | 'sm2' | 'sm15';
  topicScheduler?: 'a-factor' | 'a-factor-v2';
  itemScheduler?: 'fsrs-v5' | 'riff' | 'sm2' | 'sm15';
}

// ✅ 新代码
interface SchedulerConfig {
  defaultScheduler: 'fsrs-v6' | 'riff' | 'sm15';
  // topicScheduler 字段已移除
  itemScheduler?: 'fsrs-v6' | 'riff' | 'sm15';
}
```

#### 调度器类型变更

```typescript
// ❌ 旧代码
type SchedulerType = 'fsrs-v5' | 'sm2' | 'sm15' | 'a-factor' | 'a-factor-v2' | 'riff';

// ✅ 新代码
type SchedulerType = 'fsrs-v6' | 'sm15' | 'a-factor-v2' | 'riff';
```

#### 调度器注册变更

```typescript
// ❌ 旧代码
this.schedulers.set('fsrs-v5', new SimpleFSRSScheduler(params));

// ✅ 新代码
this.schedulers.set('fsrs-v6', new SimpleFSRSScheduler(params));
```

**注意**：`SimpleFSRSScheduler` 类名保持不变，只是注册键改变。

## 功能兼容性

### ✅ 完全兼容

以下功能在升级后继续正常工作：

- **Riff 集成**：data-only 和 full-scheduler 模式
- **Xiuyuan 多卡片**：一个块包含多张卡片
- **所有复习模式**：提取练习、刻意练习、神经漫游、困难攻坚
- **卡片浏览器**：所有筛选和排序功能
- **数据同步**：与思源原生闪卡系统的双向同步

### ⚠️ 行为变更

- **Topic 卡片调度器**：不再可配置，固定使用 A-Factor v2
- **默认调度器**：新安装默认为 FSRS v6（旧版本为 FSRS v5）

## 验证升级

### 检查配置迁移

1. 打开插件设置面板
2. 查看"调度器"标签
3. 确认：
   - 默认调度器显示为 "FSRS v6"
   - Topic 调度器显示为 "A-Factor v2 (固定)"
   - Item 调度器选项只有：FSRS v6, Riff, SM-15

### 检查卡片数据

1. 打开卡片浏览器
2. 查看任意卡片的详细信息
3. 确认：
   - 复习历史完整
   - 调度参数正常
   - 下次复习时间合理

### 测试复习功能

1. 开始一次复习会话
2. 复习几张卡片
3. 确认：
   - 卡片正常显示
   - 评分功能正常
   - 调度计算正确

## 常见问题

### Q: 升级后我的复习历史会丢失吗？

**A**: 不会。所有复习历史和调度参数都会完整保留。

### Q: 我需要重新配置调度器吗？

**A**: 不需要。配置会自动迁移，无需手动修改。

### Q: Topic 卡片为什么不能选择调度器了？

**A**: 为了简化配置和避免错误配置，Topic 卡片固定使用最适合的 A-Factor v2 调度器。

### Q: 我可以继续使用 SM-2 调度器吗？

**A**: SM-2 调度器已被移除。使用 SM-2 的卡片会自动迁移到 FSRS v6，这是一个更先进的算法。

### Q: 升级后性能会受影响吗？

**A**: 不会。FSRS v6 的性能与 v5 相当，甚至在某些场景下更快。

### Q: 如果迁移失败怎么办？

**A**: 迁移失败时会保持原数据不变，并在控制台记录错误。请联系开发者报告问题。

### Q: 我可以回退到旧版本吗？

**A**: 可以，但不推荐。如果确实需要回退：
1. 备份当前数据
2. 卸载插件
3. 安装旧版本
4. 恢复备份数据

**注意**：回退后可能需要手动调整配置。

## 破坏性变更清单

### 配置层面

- ❌ 移除 `topicScheduler` 配置字段
- ❌ 移除 `'fsrs-v5'` 调度器选项
- ❌ 移除 `'sm2'` 调度器选项
- ✅ 添加 `'fsrs-v6'` 调度器选项

### 类型层面

- ❌ `SchedulerConfig.topicScheduler` 字段不存在
- ❌ `SchedulerType` 不包含 `'fsrs-v5'` 和 `'sm2'`
- ✅ `SchedulerType` 包含 `'fsrs-v6'`

### UI 层面

- ❌ 设置面板中没有 Topic 调度器选择下拉框
- ✅ 显示 Topic 调度器固定为 A-Factor v2 的说明

## 技术细节

### 迁移实现

配置迁移在 `StorageManager.loadSettings()` 中执行：

```typescript
function migrateSettings(settings: any): PluginSettings {
  const migrated = { ...settings };
  
  if (migrated.scheduler) {
    // 迁移 defaultScheduler
    if (migrated.scheduler.defaultScheduler === 'fsrs-v5') {
      migrated.scheduler.defaultScheduler = 'fsrs-v6';
    }
    if (migrated.scheduler.defaultScheduler === 'sm2') {
      migrated.scheduler.defaultScheduler = 'fsrs-v6';
    }
    
    // 迁移 itemScheduler
    if (migrated.scheduler.itemScheduler === 'fsrs-v5') {
      migrated.scheduler.itemScheduler = 'fsrs-v6';
    }
    if (migrated.scheduler.itemScheduler === 'sm2') {
      migrated.scheduler.itemScheduler = 'fsrs-v6';
    }
    
    // 移除 topicScheduler
    delete migrated.scheduler.topicScheduler;
  }
  
  return migrated;
}
```

卡片迁移在 `StorageManager.migrateCard()` 中执行：

```typescript
function migrateCard(card: FSRSCard): FSRSCard {
  const migrated = { ...card };
  
  // 迁移调度器类型
  if (migrated.schedulerType === 'fsrs-v5') {
    migrated.schedulerType = 'fsrs-v6';
  }
  if (migrated.schedulerType === 'sm2') {
    migrated.schedulerType = 'fsrs-v6';
  }
  if (migrated.schedulerType === 'a-factor') {
    migrated.schedulerType = 'a-factor-v2';
  }
  
  return migrated;
}
```

### 测试覆盖

升级功能经过全面测试：

- ✅ 配置迁移单元测试
- ✅ 卡片数据迁移单元测试
- ✅ 调度器路由集成测试
- ✅ 配置兼容性属性测试
- ✅ 端到端功能测试

测试文件：
- `src/core/storage/__tests__/card-migration.test.ts`
- `src/core/__tests__/config-compatibility.property.test.ts`
- `src/core/scheduler/__tests__/SchedulerRouter.integration.test.ts`

## 相关文档

- **架构文档**：`ARCHITECTURE.md` - 第 9 章：FSRS v6 升级
- **需求文档**：`.kiro/specs/fsrs-v6-upgrade-and-settings-optimization/requirements.md`
- **设计文档**：`.kiro/specs/fsrs-v6-upgrade-and-settings-optimization/design.md`
- **任务列表**：`.kiro/specs/fsrs-v6-upgrade-and-settings-optimization/tasks.md`

## 支持

如果在升级过程中遇到问题：

1. 查看控制台日志（F12 → Console）
2. 检查插件设置是否正确
3. 尝试重启思源笔记
4. 在 GitHub 提交 Issue

---

**最后更新**：2024年
**版本**：FSRS v6 升级
