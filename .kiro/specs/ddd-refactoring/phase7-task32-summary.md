# Phase 7 - Task 32 完成总结

## 任务概述

**任务 32**: 迁移 XiuyuanService 的调用方到 XiuyuanApplicationService

**目标**: 将所有直接使用 XiuyuanService 的代码迁移到使用 XiuyuanApplicationService，实现应用层的统一入口。

## 完成的工作

### 1. 在 ApplicationContext 中注册 XiuyuanApplicationService

**文件**: `src/application/ApplicationContext.ts`

**修改内容**:
- 导入 `XiuyuanApplicationService`
- 注册服务工厂 `xiuyuanService`（注意：服务名保持为 `xiuyuanService` 以保持向后兼容）
- 添加 `getXiuyuanApplicationService()` 访问方法

```typescript
// 注册 Xiuyuan 应用服务工厂
this.registerServiceFactory('xiuyuanService', (context) => {
  // 临时实现：委托给 XiuyuanService
  // 未来会创建独立的 UseCase 类
  return new XiuyuanApplicationService(
    context.getXiuyuanService()
  );
});
```

### 2. 迁移 AutoCardHandler

**文件**: `src/services/handlers/AutoCardHandler.ts`

**修改内容**:
- 添加 `getXiuyuanApplicationService()` 私有方法
- 替换所有 `xiuyuanService.createFromBlocks()` 调用为 `xiuyuanAppService.createFromBlocks()`
- 更新调用参数格式（从位置参数改为命名参数对象）

**迁移的方法**:
1. `createBidirectionalCard()` - 双向卡片创建
2. `createConceptCard()` - 概念定义卡片创建（多挖空）
3. `createConceptCard()` - 概念定义卡片创建（无挖空）
4. `createDescriptorCard()` - 描述符卡片创建
5. `createMultipleClozeCards()` - 多填空卡片创建
6. `createListTemplateCards()` - 列表模板卡片创建

**调用格式变化**:
```typescript
// 旧格式（XiuyuanService）
await xiuyuanService.createFromBlocks(
  [blockId],
  'builtin-quick-bidirectional',
  { content: blockId },
  BUILTIN_DECK_ID
);

// 新格式（XiuyuanApplicationService）
await xiuyuanAppService.createFromBlocks({
  blockIds: [blockId],
  templateId: 'builtin-quick-bidirectional',
  fieldMapping: { content: blockId },
  deckId: BUILTIN_DECK_ID
});
```

### 3. 迁移 DialogManager

**文件**: `src/application/managers/DialogManager.ts`

**修改内容**:
- 在 `openCreateTemplateCardDialog()` 方法中使用 `XiuyuanApplicationService`
- 通过 `context.getXiuyuanApplicationService()` 获取服务实例
- 更新 `createFromBlocks()` 调用格式

**注意事项**:
- 模板查询（`getAllTemplates()`, `getTemplate()`）仍然使用旧的 `XiuyuanService`
- 因为 `XiuyuanApplicationService` 暂时没有实现这些查询方法
- 未来会添加这些方法到应用服务

### 4. 修复编译错误

**问题 1**: `XiuyuanSyncService.ts` 导入语句错误
```typescript
// 错误
import type { Sync./XiuyuanSyncService.types SyncProgress } from './XiuyuanSyncService.types';

// 修复
import type { SyncProgress } from './XiuyuanSyncService.types';
```

**问题 2**: 领域事件导入路径错误
- `XiuyuanCreatedEvent.ts`
- `CardCreatedEvent.ts`
- `CardDeletedEvent.ts`

```typescript
// 错误
import { DomainEvent } from './DomainEvent';

// 修复
import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';
```

## 未迁移的部分

### MigrationService

**文件**: `src/services/MigrationService.ts`

**原因**: 
- 使用了 `getAllXiuyuans()` 和 `getMappingsByXiuyuanID()` 方法
- `XiuyuanApplicationService` 目前只实现了 `getAllXiuyuans()`
- `getMappingsByXiuyuanID()` 是内部方法，暂时保持使用旧的 `XiuyuanService`

**未来计划**:
- 在 `XiuyuanApplicationService` 中添加 `getMappingsByXiuyuanID()` 方法
- 或者将 `MigrationService` 重构为 UseCase

## 架构改进

### 调用链变化

**旧架构**:
```
AutoCardHandler → XiuyuanService → XiuyuanStorage
DialogManager → XiuyuanService → XiuyuanStorage
```

**新架构**:
```
AutoCardHandler → XiuyuanApplicationService → XiuyuanService → XiuyuanStorage
DialogManager → XiuyuanApplicationService → XiuyuanService → XiuyuanStorage
```

### 优势

1. **统一入口**: 所有 Xiuyuan 操作通过应用服务统一管理
2. **解耦**: 表现层不直接依赖领域服务
3. **可扩展**: 未来可以在应用服务层添加事务、权限控制等横切关注点
4. **可测试**: 应用服务可以独立测试，不依赖具体实现

## 编译结果

✅ 编译成功
- 无类型错误
- 无导入错误
- 构建产物正常生成

```
dist/index.css     73.59 kB │ gzip:  10.42 kB
dist/index.js   1,951.10 kB │ gzip: 542.05 kB
✓ built in 12.15s
```

## 下一步计划

### Phase 7 剩余任务

1. **Task 32 后续**:
   - 迁移 `MigrationService` 使用 `XiuyuanApplicationService`
   - 在 `XiuyuanApplicationService` 中添加模板查询方法
   - 在 `XiuyuanApplicationService` 中添加 `getMappingsByXiuyuanID()` 方法

2. **Task 33**: 标记旧的 XiuyuanService 为 @deprecated
   - 添加 @deprecated 注释
   - 说明迁移路径
   - 保留一段时间以确保兼容性

3. **Task 34**: 创建独立的 UseCase 类（可选）
   - `CreateXiuyuanFromBlocksUseCase`
   - `GetXiuyuanQueryHandler`
   - `DeleteXiuyuanUseCase`

### Phase 8 计划

完成 Phase 5 和 Phase 6 的剩余任务：
- 重构 `DataAccessFacade` 使用 `CardApplicationService`
- 创建 `UpdateFSRSCardCommand` 和 `DeleteFSRSCardCommand`

## 总结

Task 32 成功完成了主要调用方的迁移工作：
- ✅ ApplicationContext 注册 XiuyuanApplicationService
- ✅ AutoCardHandler 迁移（6 个方法）
- ✅ DialogManager 迁移（1 个方法）
- ✅ 修复所有编译错误
- ✅ 编译成功

架构层次更加清晰，为后续的 DDD 重构奠定了基础。
