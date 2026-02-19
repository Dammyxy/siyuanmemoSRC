# 未 DDD 化代码分析报告

## 概述

本报告列出了插件中所有尚未完全 DDD 化的代码位置，按优先级和影响范围分类。

生成时间：2026-02-19

---

## 🔴 高优先级：核心功能未 DDD 化

### 1. MenuManager 缺少 DialogManager 注入

**位置**：`src/application/managers/MenuManager.ts`

**问题**：
- 构造函数声明需要 `dialogManager` 参数，但 ApplicationContext 中的工厂没有传递
- 导致 MenuManager 无法正常工作

**当前代码**：
```typescript
// ApplicationContext.ts
this.registerServiceFactory('menuManager', (context) => {
  return new MenuManager(context, context.getPlugin(), context.getI18n());
  // ❌ 缺少 dialogManager 参数
});
```

**应该是**：
```typescript
this.registerServiceFactory('menuManager', (context) => {
  return new MenuManager(
    context, 
    context.getPlugin(), 
    context.getI18n(),
    context.getDialogManager()  // ✅ 注入 DialogManager
  );
});
```

**影响**：
- 菜单功能完全不可用
- 用户无法通过菜单打开任何对话框

---

### 2. SrsEditorDialog 直接访问 plugin.storage 和 plugin.schedulerRouter

**位置**：`src/ui/srs/SrsEditorDialog.vue:545-548`

**问题**：
- 直接访问 `props.plugin.schedulerRouter` 和 `props.plugin.storage`
- 跳过了应用服务层

**当前代码**：
```typescript
if (options.mode === 'rating' && options.rating && props.plugin?.schedulerRouter) {
  const updatedCard = props.plugin.schedulerRouter.route(card, options.rating);
  updatedCard.due = dueTimestamp;
  updatedCard.updatedAt = Date.now();
  props.plugin.storage.setCard(updatedCard);
}
```

**建议方案**：
- 创建 `ReviewApplicationService` 或扩展 `CardApplicationService`
- 添加 `rescheduleCard(cardId, rating, dueDate)` 方法
- 通过 props 传递 service 而不是 plugin

---

### 3. 多个服务直接访问 plugin.storage

**位置**：
- `src/services/CardService.ts` (多处)
- `src/services/handlers/AutoCardHandler.ts` (多处)
- `src/services/ReviewService.ts`

**问题**：
- 这些服务应该在应用层，但直接访问基础设施层的 Storage
- 违反了 DDD 的分层原则

**影响范围**：
- CardService: 82, 136, 144, 174, 182 行
- AutoCardHandler: 178, 234, 271, 340, 357, 372, 556, 677-678, 732-733, 975-976, 1127-1128, 1236-1237, 1348, 1626-1627, 1819-1820 行
- ReviewService: 91, 93, 136 行

**建议方案**：
- 将这些服务移到 `src/application/services/` 目录
- 通过构造函数注入依赖（Repository 或 ApplicationService）
- 在 ApplicationContext 中注册这些服务

---

## 🟡 中优先级：UI 组件直接访问 plugin

### 4. 浏览器相关组件访问 plugin.app

**位置**：
- `src/ui/browser/composables/useContextMenu.ts:492-493`
- `src/ui/browser/composables/useGridInteractions.ts:103-104`

**问题**：
- 直接访问 `props.plugin.app` 来打开标签页
- 应该通过应用服务或管理器

**当前代码**：
```typescript
if (props.plugin?.app) {
  (props.plugin.app as any).openTab({
    app: props.plugin.app,
    doc: { id: blockId },
  });
}
```

**建议方案**：
- 创建 `TabApplicationService` 或扩展 `TabManager`
- 添加 `openDocumentTab(blockId)` 方法
- 通过 props 传递 service

---

### 5. DeckDataSource 直接访问 plugin.storage

**位置**：`src/ui/browser/datasource/DeckDataSource.ts:542, 546`

**问题**：
- DataSource 应该是纯数据层，不应该直接修改存储
- 违反了单一职责原则

**当前代码**：
```typescript
const fsrsCard = this.plugin.storage.getCard(card.id);
if (fsrsCard) {
  fsrsCard.meta = fsrsCard.meta || {};
  fsrsCard.meta.priority = priority;
  await this.plugin.storage.updateCard(fsrsCard);
}
```

**建议方案**：
- 将优先级更新逻辑移到 `CardApplicationService`
- DataSource 只负责读取数据，不负责写入

---

### 6. BlockMenuHandler 访问 plugin.unifiedDataSourceManager

**位置**：`src/services/BlockMenuHandler.ts:1006`

**问题**：
- 直接访问 `plugin.unifiedDataSourceManager`
- 应该通过依赖注入

**当前代码**：
```typescript
const neuralQueue = this.deps.plugin.unifiedDataSourceManager.getQueue(QueueType.NeuralRoam);
```

**建议方案**：
- 在 BlockMenuHandler 构造函数中注入 `UnifiedDataSourceManager`
- 或者通过 ApplicationContext 获取

---

## 🟢 低优先级：遗留代码

### 7. TopBar.ts 访问 plugin 属性

**位置**：`src/ui/menu/TopBar.ts:165`

**问题**：
- 这是旧的菜单实现，可能已被 MenuManager 替代
- 如果仍在使用，需要 DDD 化

**当前代码**：
```typescript
label: `${this.plugin.i18n?.dueCountLabel || 'Due'}: ${this.plugin.getDueCount()} / ${this.plugin.i18n?.totalCountLabel || 'Total'}: ${this.plugin.storage.getAllCards().length}`,
```

**建议方案**：
- 确认是否还在使用
- 如果使用，迁移到 MenuManager
- 如果不使用，删除文件

---

### 8. PluginService 传递 plugin.app

**位置**：`src/services/PluginService.ts:60, 84`

**问题**：
- 将 `plugin.app` 传递给组件
- 应该通过应用服务封装

**影响**：
- 这是旧的实现，可能已被 DialogManager 替代

---

## 📊 统计摘要

| 类别 | 文件数 | 问题数 | 优先级 |
|------|--------|--------|--------|
| 管理器依赖注入 | 1 | 1 | 🔴 高 |
| UI 组件直接访问 | 3 | 3 | 🔴 高 |
| 服务层架构 | 3 | 3 | 🔴 高 |
| 数据源层 | 1 | 1 | 🟡 中 |
| 遗留代码 | 2 | 2 | 🟢 低 |
| **总计** | **10** | **10** | - |

---

## 🎯 修复优先级建议

### 立即修复（阻塞功能）
1. ✅ **MenuManager 依赖注入** - 修复菜单功能
2. ✅ **浏览器 DDD 化** - 已完成

### 短期修复（1-2 天）
3. **SrsEditorDialog DDD 化** - 创建 ReviewApplicationService
4. **CardService/AutoCardHandler DDD 化** - 移到应用层
5. **TabManager 完善** - 添加 openDocumentTab 方法

### 中期修复（1 周）
6. **DeckDataSource 重构** - 分离读写职责
7. **BlockMenuHandler DDD 化** - 依赖注入
8. **清理遗留代码** - 删除或迁移 TopBar.ts 和 PluginService.ts

---

## 🔧 下一步行动

### 1. 立即修复 MenuManager（5 分钟）
```typescript
// src/application/ApplicationContext.ts
this.registerServiceFactory('menuManager', (context) => {
  return new MenuManager(
    context, 
    context.getPlugin(), 
    context.getI18n(),
    context.getDialogManager()  // ✅ 添加这一行
  );
});
```

### 2. 测试基本功能
- 编译插件
- 测试菜单是否可以打开
- 测试浏览器是否正常工作

### 3. 规划后续 DDD 化
- 创建详细的重构计划
- 按优先级逐个修复
- 每次修复后进行测试

---

## 📝 备注

- 本报告基于代码静态分析生成
- 某些"问题"可能是有意为之的临时方案
- 修复前请确认功能是否仍在使用
- 建议采用渐进式重构，避免一次性大改动
