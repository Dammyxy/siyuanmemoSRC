# StorageManager 使用情况调查报告

## 调查日期
2026-02-21

## 调查目标
找出所有还在使用旧架构 `StorageManager` 的地方，为完全迁移到新架构 `UnifiedStorageManager` 做准备。

---

## 调查结果总结

### ✅ 好消息：核心代码已完全迁移

经过全面搜索，**src 目录下的所有实际代码已经不再直接使用 `StorageManager` 类型声明**！

所有代码都通过 `ApplicationContext.getStorage()` 访问存储，而该方法已经返回 `UnifiedStorageManager`（伪装成 `StorageManager` 接口）。

---

## 详细发现

### 1. ApplicationContext.ts - 唯一的 StorageManager 使用点

**文件**: `src/application/ApplicationContext.ts`

#### 1.1 字段声明（第 91 行）
```typescript
private storageManager: StorageManager;  // ❌ 旧架构字段
private unifiedStorageManager: UnifiedStorageManager;  // ✅ 新架构字段
```

**状态**: 
- `storageManager` 字段仍然存在
- 但只在以下地方使用：
  1. 构造函数参数（第 179 行）
  2. 构造函数赋值（第 193 行）
  3. `dispose()` 方法中保存数据（第 1398 行）
  4. `create()` 工厂方法中创建实例（第 522 行）
  5. HybridSyncService 配置中传递（第 861 行）

#### 1.2 getStorage() 方法（第 936 行）
```typescript
getStorage(): StorageManager {
  // ✅ 返回 UnifiedStorageManager 而不是旧的 StorageManager
  // UnifiedStorageManager 实现了 StorageManager 接口，完全兼容
  return this.unifiedStorageManager as any as StorageManager;
}
```

**状态**: ✅ 已修复，返回新架构

#### 1.3 create() 工厂方法（第 522 行）
```typescript
const storageManager = new StorageManager(config.plugin.name);
await storageManager.init();
```

**状态**: 
- 仍然创建 `StorageManager` 实例
- 但只用于：
  1. 初始化旧数据（向后兼容）
  2. 传递给 HybridSyncService（第 861 行）
  3. 传递给 BlockMenuHandler（第 757 行）
  4. dispose() 时保存数据（第 1398 行）

#### 1.4 HybridSyncService 配置（第 861 行）
```typescript
hybridSyncService = new HybridSyncService(
  {
    deckId: riff.BUILTIN_DECK_ID,
    storage: storageManager,  // ❌ 传递旧架构
    riffBlacklistService: context.getRiffBlacklistService(),
    // ...
  },
  // ...
);
```

**状态**: ⚠️ 需要修复

#### 1.5 BlockMenuHandler 配置（第 757 行）
```typescript
const blockMenuHandler = new BlockMenuHandler({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: storageManager,  // ❌ 传递旧架构
  // ...
});
```

**状态**: ⚠️ 需要修复

#### 1.6 dispose() 方法（第 1398 行）
```typescript
await this.storageManager.saveCards();
```

**状态**: ⚠️ 需要修复

---

### 2. BlockMenuHandler.ts - 通过 ApplicationContext 访问

**文件**: `src/application/managers/BlockMenuHandler.ts`

#### 2.1 类型导入（第 20 行）
```typescript
import type { StorageManager } from '@/core/storage';
```

**状态**: ⚠️ 仅用于类型声明

#### 2.2 deps 接口（已删除）
```typescript
// 旧代码（已不存在）：
export interface BlockMenuHandlerDeps {
  storage: StorageManager;  // ❌
}
```

**状态**: ✅ 已删除，现在通过 `applicationContext` 访问

#### 2.3 getStorage() 方法（第 68 行）
```typescript
private getStorage(): StorageManager {
  return this.deps.applicationContext.getStorage();
}
```

**状态**: ✅ 通过 ApplicationContext 访问，实际返回 UnifiedStorageManager

---

### 3. 其他文件 - 无直接使用

搜索结果显示：
- ✅ 没有其他 src 文件直接使用 `StorageManager` 类型
- ✅ 没有其他文件创建 `new StorageManager()` 实例
- ✅ 所有存储访问都通过 `context.getStorage()` 或 `context.getUnifiedStorage()`

---

## 需要修复的地方

### 优先级 1：关键修复

#### 1. ApplicationContext.create() - HybridSyncService 配置
**位置**: `src/application/ApplicationContext.ts:861`

**当前代码**:
```typescript
hybridSyncService = new HybridSyncService(
  {
    deckId: riff.BUILTIN_DECK_ID,
    storage: storageManager,  // ❌ 旧架构
    // ...
  },
  // ...
);
```

**修复方案**:
```typescript
hybridSyncService = new HybridSyncService(
  {
    deckId: riff.BUILTIN_DECK_ID,
    storage: unifiedStorageManager as any,  // ✅ 新架构
    // ...
  },
  // ...
);
```

#### 2. ApplicationContext.create() - BlockMenuHandler 配置
**位置**: `src/application/ApplicationContext.ts:757`

**当前代码**:
```typescript
const blockMenuHandler = new BlockMenuHandler({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: storageManager,  // ❌ 旧架构
  // ...
});
```

**修复方案**:
```typescript
const blockMenuHandler = new BlockMenuHandler({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: unifiedStorageManager as any,  // ✅ 新架构
  // ...
});
```

#### 3. ApplicationContext.dispose() - 保存数据
**位置**: `src/application/ApplicationContext.ts:1398`

**当前代码**:
```typescript
await this.storageManager.saveCards();
```

**修复方案**:
```typescript
await this.unifiedStorageManager.save();
```

---

### 优先级 2：清理工作

#### 4. 删除 storageManager 字段
**位置**: `src/application/ApplicationContext.ts:91`

**当前代码**:
```typescript
private storageManager: StorageManager;
private unifiedStorageManager: UnifiedStorageManager;
```

**修复方案**:
```typescript
// 删除 storageManager 字段
private unifiedStorageManager: UnifiedStorageManager;
```

#### 5. 删除构造函数中的 storageManager 参数
**位置**: `src/application/ApplicationContext.ts:179`

**当前代码**:
```typescript
private constructor(
  config: ApplicationConfig,
  services: {
    storageManager: StorageManager;  // ❌ 删除
    unifiedStorageManager: UnifiedStorageManager;
    // ...
  }
) {
  this.storageManager = services.storageManager;  // ❌ 删除
  this.unifiedStorageManager = services.unifiedStorageManager;
  // ...
}
```

**修复方案**:
```typescript
private constructor(
  config: ApplicationConfig,
  services: {
    // storageManager 已删除
    unifiedStorageManager: UnifiedStorageManager;
    // ...
  }
) {
  // this.storageManager 赋值已删除
  this.unifiedStorageManager = services.unifiedStorageManager;
  // ...
}
```

#### 6. 删除 create() 中的 storageManager 创建
**位置**: `src/application/ApplicationContext.ts:522`

**当前代码**:
```typescript
const storageManager = new StorageManager(config.plugin.name);
await storageManager.init();
```

**修复方案**:
```typescript
// 完全删除这两行
// 如果需要迁移旧数据，可以在 UnifiedStorageManager 初始化时处理
```

#### 7. 更新 getStorage() 返回类型
**位置**: `src/application/ApplicationContext.ts:936`

**当前代码**:
```typescript
getStorage(): StorageManager {
  return this.unifiedStorageManager as any as StorageManager;
}
```

**修复方案**:
```typescript
getStorage(): UnifiedStorageManager {
  return this.unifiedStorageManager;
}
```

#### 8. 删除 BlockMenuHandler 中的 StorageManager 导入
**位置**: `src/application/managers/BlockMenuHandler.ts:20`

**当前代码**:
```typescript
import type { StorageManager } from '@/core/storage';
```

**修复方案**:
```typescript
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
```

并更新 `getStorage()` 方法：
```typescript
private getStorage(): UnifiedStorageManager {
  return this.deps.applicationContext.getStorage();
}
```

---

## 迁移策略

### 阶段 1：修复关键使用点（立即执行）

1. ✅ 修复 HybridSyncService 配置（使用 unifiedStorageManager）
2. ✅ 修复 BlockMenuHandler 配置（使用 unifiedStorageManager）
3. ✅ 修复 dispose() 方法（使用 unifiedStorageManager.save()）

### 阶段 2：清理旧代码（测试通过后）

4. ⏳ 删除 storageManager 字段
5. ⏳ 删除构造函数中的 storageManager 参数
6. ⏳ 删除 create() 中的 storageManager 创建
7. ⏳ 更新 getStorage() 返回类型
8. ⏳ 更新 BlockMenuHandler 类型导入

### 阶段 3：验证和测试

- 运行所有测试
- 验证优先级修改持久化
- 验证 Riff 同步功能
- 验证卡片创建/删除功能

---

## 风险评估

### 低风险修改
- ✅ HybridSyncService 配置：UnifiedStorageManager 实现了 StorageManager 接口
- ✅ BlockMenuHandler 配置：同上
- ✅ dispose() 方法：save() 方法功能相同

### 中风险修改
- ⚠️ 删除 storageManager 字段：需要确保没有遗漏的引用
- ⚠️ 删除 create() 中的初始化：需要确保数据迁移逻辑完整

### 测试重点
1. 优先级修改持久化（已知问题）
2. Riff 同步功能（使用 HybridSyncService）
3. 卡片创建/删除（使用 BlockMenuHandler）
4. 插件重启后数据加载

---

## 相关文档

- [priority-fix-final.md](.kiro/specs/bugfix/priority-fix-final.md) - 优先级持久化修复
- [unified-storage-integration.md](.kiro/specs/bugfix/unified-storage-integration.md) - 统一存储集成
- [remove-storage-manager-complete.md](.kiro/specs/bugfix/remove-storage-manager-complete.md) - StorageManager 移除计划

---

## 结论

### 当前状态
- ✅ 核心代码已完全通过 ApplicationContext 访问存储
- ✅ getStorage() 已返回 UnifiedStorageManager
- ⚠️ 仍有 3 处直接使用 storageManager 字段

### 下一步行动
1. 立即修复 3 处关键使用点
2. 测试验证功能正常
3. 清理旧代码和类型声明
4. 更新文档

### 预期效果
- ✅ 完全移除旧架构 StorageManager
- ✅ 统一使用 UnifiedStorageManager
- ✅ 简化代码，减少维护成本
- ✅ 提高数据一致性
