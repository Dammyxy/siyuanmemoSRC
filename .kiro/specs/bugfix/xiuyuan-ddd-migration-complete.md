# Xiuyuan DDD 架构迁移完成报告

## 执行时间
2024年（根据上下文推断）

## 目标
将 Xiuyuan 相关功能从旧架构迁移到符合 DDD（领域驱动设计）的新架构。

## 已完成的工作

### Phase 1: 文档和注释 ✅

#### 1.1 添加 Xiuyuan ID 命名规范文档
- **位置**: `src/core/xiuyuan/storage.ts` 和 `src/application/services/XiuyuanSyncService.ts`
- **内容**: 详细说明了两种 Xiuyuan ID 格式的用途和区别

**两种 ID 格式**：
| 来源 | 格式 | 示例 | 目的 |
|-----|------|------|------|
| 用户手动创建 | `xy_{timestamp}_{random}` | `xy_1234567890_abc123` | 时间戳 + 随机字符串，保证全局唯一 |
| Riff 同步 | `xy_riff_{blockId}` | `xy_riff_20230101120000-abc123` | 使用块 ID，保证幂等性（同一块多次同步生成相同 ID） |

#### 1.2 统一块属性命名
- **旧属性名**: `custom-fsrs-xiuyuan-id`, `custom-fsrs-template-id`
- **新属性名**: `custom-xiuyuan-id`, `custom-xiuyuan-template`
- **修改文件**:
  - `src/core/xiuyuan/listTemplate.ts` (第 149-156 行)
  - `src/core/xiuyuan/service.ts` (第 547-554 行, 847-852 行)
  - `src/application/services/XiuyuanSyncService.ts` (兼容新旧两种命名)

#### 1.3 防止重复创建 Xiuyuan
- **位置**: `src/application/services/XiuyuanSyncService.ts` (第 259-273 行)
- **逻辑**: 在 Riff 同步时检查块是否已有 Xiuyuan 属性，如果有则跳过创建
- **效果**: 避免用户用模板创建卡片后，Riff 同步再次创建重复的 Xiuyuan

### Phase 2: 重构 listTemplate.ts ✅

#### 2.1 创建应用服务层接口
- **新文件**: `src/application/commands/xiuyuan/CreateListTemplateCardsCommand.ts`
- **内容**: 定义了创建列表模板卡片的命令接口

#### 2.2 扩展 XiuyuanApplicationService
- **位置**: `src/application/services/XiuyuanApplicationService.ts`
- **新方法**: `createListTemplateCards(command: CreateListTemplateCardsCommand)`
- **特点**:
  - 符合 DDD 应用服务模式
  - 统一入口，便于添加事务、日志、权限等横切关注点
  - 当前实现委托给旧的 `listTemplate.ts` 函数（过渡方案）

#### 2.3 扩展 ApplicationContext
- **位置**: `src/application/ApplicationContext.ts`
- **新方法**: `getXiuyuanApplicationService(): XiuyuanApplicationService`
- **特点**: 懒加载，首次调用时创建实例

#### 2.4 标记旧代码为废弃
- **位置**: `src/core/xiuyuan/listTemplate.ts`
- **标记**: `@deprecated` 注释，说明 DDD 架构问题和迁移计划

### Phase 3: 迁移调用方 ✅

#### 3.1 BlockMenuHandler 迁移
- **文件**: `src/application/managers/BlockMenuHandler.ts`
- **修改**: 第 1181-1188 行
- **变更**:
  ```typescript
  // ❌ 旧方式
  const { createListTemplateCards } = await import('@/core/xiuyuan/listTemplate');
  const result = await createListTemplateCards(...);
  
  // ✅ 新方式
  const xiuyuanAppService = this.deps.applicationContext.getXiuyuanApplicationService();
  const result = await xiuyuanAppService.createListTemplateCards({
    parentBlockId,
    childBlockIds,
    templateId: 'builtin-list-item'
  });
  ```

#### 3.2 其他调用方分析
- **TransactionObserver.ts**: 使用不同逻辑（为每个子项创建单独 Xiuyuan），无需迁移
- **AutoCardHandler.ts**: 使用 `createFromBlocks` 方法，无需迁移

## DDD 架构符合性分析

### ✅ 符合 DDD 的部分

1. **Repository 模式**
   - `XiuyuanRepository.save()` 正确实现了块属性写入
   - 所有持久化操作通过 Repository 统一管理

2. **应用服务模式**
   - `XiuyuanApplicationService` 作为统一入口
   - 协调用例执行，不包含业务逻辑

3. **领域实体和值对象**
   - 使用 `Xiuyuan`, `XiuyuanId`, `BlockId` 等领域对象
   - 值对象保证不变性和验证

### ⚠️ 仍需改进的部分

1. **XiuyuanService（旧架构）**
   - 标记为 `@deprecated`
   - 直接操作块属性（违反分层架构）
   - 应该通过 Repository 处理

2. **listTemplate.ts**
   - 标记为 `@deprecated`
   - 直接操作 `StorageManager` 和 `setBlockAttrs`
   - 应该迁移到 UseCase 模式

3. **过渡方案**
   - `XiuyuanApplicationService.createListTemplateCards` 当前委托给旧函数
   - 未来应该创建独立的 UseCase 类

## 架构改进效果

### 1. 统一的块属性命名
- ✅ 所有新代码使用 `custom-xiuyuan-id`
- ✅ 兼容旧属性名（向后兼容）
- ✅ 避免重复属性问题

### 2. 防止重复创建
- ✅ Riff 同步检查块属性
- ✅ 用户手动创建 + Riff 同步不会冲突
- ✅ 幂等性保证

### 3. 清晰的架构分层
```
表现层 (UI)
    ↓
应用层 (XiuyuanApplicationService)
    ↓
领域层 (Xiuyuan, XiuyuanId, etc.)
    ↓
基础设施层 (XiuyuanRepository, StorageManager)
```

### 4. 可追溯的 Xiuyuan ID
- 通过 ID 前缀可以识别来源
- `xy_` = 用户手动创建
- `xy_riff_` = Riff 同步创建

## 下一步计划（Phase 4）

### 长期目标：完全废弃 XiuyuanService

1. **创建 UseCase 类**
   - `CreateXiuyuanFromBlocksUseCase`
   - `CreateListTemplateCardsUseCase`
   - `DeleteXiuyuanUseCase`

2. **迁移所有调用方**
   - 将所有 `XiuyuanService` 的使用迁移到 `XiuyuanApplicationService`
   - 移除直接的块属性操作

3. **清理旧代码**
   - 删除 `XiuyuanService` 类
   - 删除 `listTemplate.ts` 文件
   - 更新相关测试

## 编译状态

✅ 所有修改已编译通过，无错误

## 测试建议

1. **单元测试**
   - 测试 `XiuyuanApplicationService.createListTemplateCards`
   - 测试块属性命名统一
   - 测试重复创建防护

2. **集成测试**
   - 测试用户手动创建 + Riff 同步场景
   - 测试跨设备同步场景
   - 测试块属性兼容性

3. **回归测试**
   - 测试现有的列表模板卡片功能
   - 测试 Riff 同步功能
   - 测试卡片删除功能

## 总结

本次迁移成功完成了 Phase 1-3 的所有任务：
- ✅ 统一了块属性命名规范
- ✅ 添加了详细的文档和注释
- ✅ 创建了符合 DDD 的应用服务层
- ✅ 迁移了主要调用方到新架构
- ✅ 防止了重复创建问题

虽然仍有部分旧代码（`XiuyuanService`, `listTemplate.ts`）需要在 Phase 4 中完全移除，但当前的架构已经为未来的完全迁移奠定了良好的基础。所有新功能都应该使用 `XiuyuanApplicationService`，逐步减少对旧架构的依赖。
