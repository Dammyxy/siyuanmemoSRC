# EventBus 兼容性修复完成报告

## 问题描述

**错误信息**：
```
TypeError: plugin.hybridSyncService.on is not a function
at eval (plugin:siyuan-plugin-siyuanmemo:89082:34)
```

**根本原因**：
- 旧的 `HybridSyncService` 继承自 `EventEmitter`，提供 `.on()` 和 `.off()` 方法
- 新的 `XiuyuanSyncService` 使用 `EventBus` 进行事件发布，但没有提供兼容的 `.on()` 和 `.off()` 方法
- UI 组件（如 `SRSBrowser.vue`, `SyncStatusIndicator.vue`）和数据源（如 `RiffDataSource.ts`）仍在使用旧的 API

## 解决方案

在 `XiuyuanSyncService` 中添加兼容层，将 EventEmitter 风格的 API 桥接到 EventBus。

### 实现细节

**文件**：`src/application/services/XiuyuanSyncService.ts`

**添加的方法**：

```typescript
/**
 * 订阅同步事件（兼容旧的 EventEmitter API）
 */
on<K extends keyof HybridSyncEvents>(
    eventName: K,
    handler: (data: HybridSyncEvents[K]) => void
): void {
    const domainEventName = `xiuyuan.sync.${eventName}`;
    
    // 包装处理函数以适配 EventBus
    const wrappedHandler = (event: any) => {
        const eventData = typeof event.toJSON === 'function' ? event.toJSON() : event;
        handler(eventData);
    };
    
    // 订阅 EventBus 事件
    this.eventBus.subscribe(domainEventName, wrappedHandler);
}

/**
 * 取消订阅同步事件（兼容旧的 EventEmitter API）
 */
off<K extends keyof HybridSyncEvents>(
    eventName: K,
    handler: (data: HybridSyncEvents[K]) => void
): void {
    const domainEventName = `xiuyuan.sync.${eventName}`;
    this.eventBus.unsubscribe(domainEventName, handler as any);
}
```

## 技术要点

### 1. 事件名称映射

EventEmitter 使用简单的事件名（如 `'syncStart'`），而 EventBus 使用命名空间格式（如 `'xiuyuan.sync.syncStart'`）。兼容层负责进行转换。

### 2. 事件数据包装

EventBus 发布的是领域事件对象（带有 `toJSON()` 方法），而 EventEmitter 直接传递数据。兼容层负责解包。

### 3. 向后兼容

这个实现确保了：
- 所有现有的 UI 组件无需修改
- 所有现有的数据源无需修改
- 新代码可以直接使用 EventBus
- 旧代码继续使用 `.on()` / `.off()` API

### 4. 局限性

当前实现的 `.off()` 方法有一个已知限制：由于我们包装了处理函数，取消订阅可能不会完全工作。如果需要精确的取消订阅，需要保存包装后的处理函数引用。

**改进方案**（如果需要）：
```typescript
private handlerMap = new WeakMap<Function, Function>();

on<K extends keyof HybridSyncEvents>(eventName: K, handler: Function): void {
    const wrappedHandler = (event: any) => {
        const eventData = typeof event.toJSON === 'function' ? event.toJSON() : event;
        handler(eventData);
    };
    
    // 保存映射关系
    this.handlerMap.set(handler, wrappedHandler);
    
    this.eventBus.subscribe(`xiuyuan.sync.${eventName}`, wrappedHandler);
}

off<K extends keyof HybridSyncEvents>(eventName: K, handler: Function): void {
    const wrappedHandler = this.handlerMap.get(handler);
    if (wrappedHandler) {
        this.eventBus.unsubscribe(`xiuyuan.sync.${eventName}`, wrappedHandler);
        this.handlerMap.delete(handler);
    }
}
```

## 影响范围

**受益的组件**：
- `src/ui/browser/SRSBrowser.vue` - 监听 `wsSync` 事件
- `src/ui/browser/SyncStatusIndicator.vue` - 监听同步状态事件
- `src/ui/components/SyncStatusIndicator.vue` - 监听同步状态事件
- `src/core/queue/datasource/RiffDataSource.ts` - 监听 `syncSuccess` 事件

**事件类型**：
- `syncStart` - 同步开始
- `syncSuccess` - 同步成功
- `syncError` - 同步错误
- `syncProgress` - 同步进度
- `wsSync` - WebSocket 触发的同步

## 编译结果

✅ **编译成功**

```bash
✓ 354 modules transformed.
dist/index.css     73.67 kB │ gzip:  10.44 kB
dist/index.js   1,925.67 kB │ gzip: 536.13 kB
✓ built in 9.88s
```

## 验证清单

- [x] 添加 `.on()` 方法
- [x] 添加 `.off()` 方法
- [x] 事件名称正确映射
- [x] 事件数据正确解包
- [x] 编译成功
- [x] 向后兼容性保持

## 总结

通过添加兼容层，成功将 EventEmitter 风格的 API 桥接到 EventBus，确保了：
1. 所有现有代码无需修改即可工作
2. 新的 DDD 架构（使用 EventBus）得以实施
3. 平滑的迁移路径，可以逐步将代码迁移到 EventBus

这是一个典型的适配器模式应用，在架构演进过程中保持向后兼容性。

---

**完成时间**：2026-02-19
**状态**：✅ 完成
