# Riff Integration Configuration

## 概述

Riff 集成配置定义了插件如何与 Riff 系统交互。新版混合同步方案提供两种模式：

- **高阶模式（Advanced Mode）**：使用本地调度器 + 混合同步方案
- **简单模式（Simple Mode）**：直接使用 Riff 调度器

## 配置接口

### RiffIntegrationConfig

```typescript
interface RiffIntegrationConfig {
    /** 模式选择 */
    mode: 'advanced' | 'simple';
    
    /** 是否使用本地调度器（高阶模式） */
    useLocalScheduler: boolean;
    
    /** 增量同步配置 */
    incrementalSync: {
        /** 是否启用增量同步 */
        enabled: boolean;
        /** 触发时机 */
        triggers: Array<'plugin-start' | 'browser-open' | 'review-open'>;
        /** 是否使用黑名单过滤 */
        useBlacklist: boolean;
    };
    
    /** 全量同步配置 */
    fullSync: {
        /** 是否启用全量同步 */
        enabled: boolean;
        /** 同步间隔（毫秒） */
        interval: number;
        /** 是否清理黑名单 */
        cleanupBlacklist: boolean;
    };
    
    /** 删除同步配置 */
    deleteSync: {
        /** 是否启用删除同步 */
        enabled: boolean;
        /** 删除失败时是否使用黑名单作为后备 */
        useBlacklistFallback: boolean;
    };
}
```

## 默认配置

```typescript
const DEFAULT_RIFF_CONFIG: RiffIntegrationConfig = {
    mode: 'advanced',
    useLocalScheduler: true,
    
    incrementalSync: {
        enabled: true,
        triggers: ['plugin-start', 'browser-open', 'review-open'],
        useBlacklist: true
    },
    
    fullSync: {
        enabled: true,
        interval: 86400000,  // 24小时
        cleanupBlacklist: true
    },
    
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
};
```

## 模式说明

### 高阶模式（Advanced Mode）

**特点**：
- 使用本地调度器（FSRS/SM-15/A-Factor）
- 通过混合同步方案与 Riff 保持数据一致性
- 增量同步：快速获取新卡片（日常使用）
- 全量同步：每24小时检测双向删除（定期维护）
- 双向删除：插件删除 → Riff 删除，Riff 删除 → 本地删除

**适用场景**：
- 需要使用高级调度算法
- 需要离线使用
- 需要高性能
- 需要完全控制复习数据

**配置示例**：
```typescript
{
    mode: 'advanced',
    useLocalScheduler: true,
    incrementalSync: {
        enabled: true,
        triggers: ['plugin-start', 'browser-open', 'review-open'],
        useBlacklist: true
    },
    fullSync: {
        enabled: true,
        interval: 86400000,  // 24小时
        cleanupBlacklist: true
    },
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
}
```

### 简单模式（Simple Mode）

**特点**：
- 直接使用 Riff 调度器
- 不需要同步操作
- 开箱即用
- 与思源原生闪卡体验一致

**适用场景**：
- 不需要高级调度算法
- 希望简单易用
- 不需要离线使用

**配置示例**：
```typescript
{
    mode: 'simple',
    useLocalScheduler: false,
    incrementalSync: {
        enabled: false,
        triggers: [],
        useBlacklist: false
    },
    fullSync: {
        enabled: false,
        interval: 86400000,
        cleanupBlacklist: false
    },
    deleteSync: {
        enabled: false,
        useBlacklistFallback: false
    }
}
```

## 配置项详解

### incrementalSync（增量同步）

**enabled**：是否启用增量同步
- `true`：启用（推荐）
- `false`：禁用

**triggers**：触发时机
- `'plugin-start'`：插件启动时
- `'browser-open'`：SRS 浏览器打开时
- `'review-open'`：复习界面打开时

**useBlacklist**：是否使用黑名单过滤
- `true`：使用黑名单过滤已删除的卡片（推荐）
- `false`：不使用黑名单

### fullSync（全量同步）

**enabled**：是否启用全量同步
- `true`：启用（推荐）
- `false`：禁用

**interval**：同步间隔（毫秒）
- `43200000`：12小时
- `86400000`：24小时（推荐）
- `172800000`：48小时
- `604800000`：7天

**cleanupBlacklist**：是否清理黑名单
- `true`：全量同步后清理黑名单（推荐）
- `false`：不清理黑名单

### deleteSync（删除同步）

**enabled**：是否启用删除同步
- `true`：启用双向删除同步（推荐）
- `false`：禁用

**useBlacklistFallback**：删除失败时是否使用黑名单作为后备
- `true`：使用黑名单作为后备（推荐）
- `false`：不使用黑名单

## 配置迁移

### 自动迁移

插件会自动检测旧版配置并迁移到新版：

| 旧版模式 | 新版模式 | 说明 |
|---------|---------|------|
| `disabled` | `simple` | 禁用 Riff 集成 → 简单模式 |
| `data-only` | `advanced` | 数据同步模式 → 高阶模式（混合同步） |
| `full-scheduler` | `simple` | 完全使用 Riff 调度器 → 简单模式 |

### 迁移示例

**旧版配置**：
```typescript
{
    mode: 'data-only',
    dataSourceMode: 'incremental',
    syncToRiff: false,
    useRiffScheduler: false,
    incrementalUpdateInterval: 300
}
```

**迁移后**：
```typescript
{
    mode: 'advanced',
    useLocalScheduler: true,
    incrementalSync: {
        enabled: true,
        triggers: ['plugin-start', 'browser-open', 'review-open'],
        useBlacklist: true
    },
    fullSync: {
        enabled: true,
        interval: 86400000,
        cleanupBlacklist: true
    },
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
}
```

## 使用示例

### 在插件中使用

```typescript
import { DEFAULT_RIFF_CONFIG, type RiffIntegrationConfig } from '@/types/settings';
import { ConfigMigrator } from '@/utils/configMigrator';

// 加载配置
let config = loadConfig();

// 检查是否需要迁移
if (ConfigMigrator.needsMigration(config)) {
    config = ConfigMigrator.migrate(config);
    saveConfig(config);
    
    // 显示迁移提示
    const message = ConfigMigrator.getMigrationMessage(oldConfig.mode);
    showMessage(message);
}

// 使用配置
if (config.mode === 'advanced') {
    // 初始化混合同步服务
    const syncService = new HybridSyncService({
        deckId: BUILTIN_DECK_ID,
        storage: storageManager,
        incrementalSync: config.incrementalSync,
        fullSync: config.fullSync,
        deleteSync: config.deleteSync
    });
    
    await syncService.start();
}
```

### 自定义配置

```typescript
// 自定义高阶模式配置
const customConfig: RiffIntegrationConfig = {
    mode: 'advanced',
    useLocalScheduler: true,
    
    // 只在插件启动时同步
    incrementalSync: {
        enabled: true,
        triggers: ['plugin-start'],
        useBlacklist: true
    },
    
    // 每12小时全量同步
    fullSync: {
        enabled: true,
        interval: 43200000,  // 12小时
        cleanupBlacklist: true
    },
    
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
};
```

## 最佳实践

### 高阶模式

1. **启用所有触发器**：确保数据及时同步
2. **使用黑名单**：防止已删除的卡片重新出现
3. **定期全量同步**：保持数据一致性
4. **启用删除同步**：实现真正的双向删除

### 简单模式

1. **禁用所有同步功能**：避免不必要的网络请求
2. **直接使用 Riff 调度器**：保持与思源原生体验一致

### 性能优化

1. **合理设置全量同步间隔**：
   - 卡片数量少（< 1000）：12-24小时
   - 卡片数量多（> 1000）：24-48小时
   
2. **选择合适的触发器**：
   - 频繁使用：启用所有触发器
   - 偶尔使用：只启用 `plugin-start`

3. **使用黑名单**：
   - 减少增量同步的数据量
   - 防止已删除的卡片重新出现

## 故障排除

### 同步失败

**问题**：增量同步或全量同步失败

**解决方案**：
1. 检查网络连接
2. 检查 Riff API 是否可用
3. 查看控制台日志
4. 尝试手动触发同步

### 删除同步失败

**问题**：删除卡片后 Riff 中仍然存在

**解决方案**：
1. 检查 `deleteSync.enabled` 是否为 `true`
2. 检查 `deleteSync.useBlacklistFallback` 是否为 `true`
3. 等待下次全量同步自动清理
4. 手动触发全量同步

### 黑名单无限增长

**问题**：黑名单中的 ID 越来越多

**解决方案**：
1. 检查 `fullSync.cleanupBlacklist` 是否为 `true`
2. 检查全量同步是否正常执行
3. 手动触发全量同步

## 参考资料

- [设计文档](../.kiro/specs/riff-bidirectional-sync/design.md)
- [需求文档](../.kiro/specs/riff-bidirectional-sync/requirements.md)
- [任务列表](../.kiro/specs/riff-bidirectional-sync/tasks.md)
