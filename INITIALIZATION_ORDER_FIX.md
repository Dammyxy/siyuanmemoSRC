# 初始化顺序修复报告

## 🐛 问题描述

插件启动时报错：
```
ReferenceError: Cannot access 'unifiedManager' before initialization
at FSRSPlugin.onload (plugin:siyuan-plugin-fsrs:95340:31)
```

## 🔍 根本原因

在 `src/index.ts` 的 `onload()` 方法中，`unifiedManager` 变量在声明之前就被使用了：

**错误的顺序**：
```typescript
// 第 235 行：使用 unifiedManager（但还没声明）
this.incrementalQueue = unifiedManager.getQueue(QueueType.IncrementalLearning) as any;

// 第 246 行：才声明 unifiedManager
const unifiedManager = UnifiedDataSourceManager.getInstance();
```

这是一个典型的 JavaScript/TypeScript 变量作用域问题：
- `const` 声明的变量不会被提升（hoisting）
- 在声明之前访问会导致 `ReferenceError`

## ✅ 修复方案

将 `UnifiedDataSourceManager` 的初始化移到使用之前：

**正确的顺序**：
```typescript
// 1. 先初始化 UnifiedDataSourceManager
const unifiedManager = UnifiedDataSourceManager.getInstance();
const simpleRouter = new SimpleDataRouter();
const advancedRouter = new AdvancedDataRouter(this.storage);

unifiedManager.initializeRouters(simpleRouter, advancedRouter);
console.log('[FSRS] ✅ UnifiedDataSourceManager initialized');

// 2. 根据用户设置切换模式
const riffModeConfig = settings.riffIntegration || { mode: 'advanced' };
const targetMode = riffModeConfig.mode === 'advanced' ? OperationMode.Advanced : OperationMode.Simple;

if (targetMode !== unifiedManager.getCurrentMode()) {
  await unifiedManager.switchMode(targetMode);
}

// 3. 然后使用 unifiedManager 获取队列实例
this.incrementalQueue = unifiedManager.getQueue(QueueType.IncrementalLearning) as any;
this.queueContext.register('incremental-learning' as any, this.incrementalQueue as any);
```

## 📝 修改的文件

- `siyuan-plugin-fsrs/src/index.ts`
  - 将 `UnifiedDataSourceManager` 初始化代码块（第 246-265 行）移到渐进学习队列初始化之前（第 235 行之前）

## 🎯 初始化顺序（修复后）

```
1. StorageManager 初始化
2. SchedulerRouter 初始化
3. RetrievalPracticeQueue 初始化
4. FilterGroupQueue 初始化
5. FinalDrillQueue 初始化
6. LeechQueue 初始化
7. NeuralRoamQueue 初始化
8. ✅ UnifiedDataSourceManager 初始化（新位置）
9. ✅ 模式切换（如果需要）
10. ✅ IncrementalLearningQueue 初始化（使用 unifiedManager）
11. Services 初始化（DialogService, MenuService 等）
12. XiuyuanService 初始化
13. TransactionObserver 初始化
14. HybridSyncService 初始化（如果在 advanced 模式）
```

## ✅ 验证结果

- ✅ 代码编译通过，无语法错误
- ✅ 初始化顺序正确
- ✅ `unifiedManager` 在使用之前已声明和初始化

## 🎉 结论

修复了变量初始化顺序问题，插件现在应该可以正常启动。

**关键点**：
1. 在使用变量之前必须先声明和初始化
2. `const` 声明的变量不会被提升
3. 初始化顺序很重要，特别是在有依赖关系的情况下

---

**日期**: 2026-02-06  
**作者**: Kiro AI Assistant
