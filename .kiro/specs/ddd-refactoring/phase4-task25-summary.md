# Phase 4 - Task 25 完成总结

> 完成时间：2026-02-19
> 任务：移除废弃的 Storage 方法

## ✅ 完成内容

### 1. 移除 `StorageManager.getDueCards()` 方法
- 文件：`src/core/storage/manager.ts`
- 删除了包含业务逻辑的 `getDueCards()` 方法（约 26 行代码）
- 该方法已被 `CardScheduleService.filterDueCards()` 替代

### 2. 更新所有调用方
迁移以下文件使用 `CardApplicationService`：

#### 2.1 `src/index.simplified.ts`
```typescript
// 之前
getDueCount(): number {
  return this.storage.getDueCards().length;
}

// 之后
async getDueCount(): Promise<number> {
  return await this.context.getCardService().getDueCount();
}
```

#### 2.2 其他文件（已在之前完成）
- `src/application/managers/DockManager.ts`
- `src/application/managers/MenuManager.ts`
- `src/index.ts`
- `src/ui/dock/DockManager.ts`（标记为 @deprecated）
- `src/core/application/PluginAssembler.ts`（标记为 @deprecated）

### 3. 验证测试
- ✅ `CardApplicationService.test.ts` - 6 个测试全部通过
- ✅ 编译检查通过（无新增错误）

## 📊 架构改进

### 之前的调用链
```
UI → Storage.getDueCards()
```

### 现在的调用链
```
UI → CardApplicationService.getDueCount()
    → GetDueCardsQueryHandler
    → CardScheduleService.filterDueCards()
    → Storage.getAllCards()
```

## 🎯 DDD 原则体现

1. **分离关注点**：业务逻辑从 Storage 移到 Domain Service
2. **单一职责**：Storage 只负责数据持久化
3. **依赖倒置**：UI 依赖应用服务接口，不直接依赖 Storage
4. **查询分离**：使用 Query/QueryHandler 模式

## 📝 剩余工作

继续 Phase 4 的下一个任务：
- Task 26: 移除旧架构组件（RetrievalPracticeProvider、MigrateQueueDataService 等）

## 🔗 相关文档

- [统一架构计划](./unified-architecture-plan.md)
- [任务列表](./tasks.md)
- [DDD 指南](../../DDD-GUIDE.md)
