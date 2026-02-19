# 菜单和对话框问题诊断指南

## 问题描述

DDD 化后出现两个问题：
1. 顶栏右键菜单打不开
2. 复习界面打不开

## 诊断步骤

### 1. 检查浏览器控制台

打开思源笔记的开发者工具（F12），查看控制台是否有错误信息。

**预期的正常日志**：
```
[SiYuanMemo] Plugin loading...
[ApplicationContext] ✅ All queues initialized
[ApplicationContext] ✅ XiuyuanService initialized
[ApplicationContext] ✅ Application services initialized
[ApplicationContext] ✅ ApplicationContext created successfully
[SiYuanMemo] Plugin loaded successfully
```

**可能的错误**：
- `MenuManager is not defined`
- `DialogManager is not defined`
- `getMenuManager is not a function`
- `getDialogManager is not a function`

### 2. 测试顶栏右键菜单

#### 操作步骤
1. 在思源笔记顶栏找到 FSRS 插件图标（卡片图标）
2. 右键点击图标
3. 观察是否弹出菜单

#### 预期结果
应该弹出包含以下选项的菜单：
- 提取练习 (Alt+R)
- 渐进学习 (Alt+I)
- 刻意练习 (Alt+D)
- 神经漫游 (Alt+N)
- 筛选复习 (Alt+G)
- SRS 浏览器 (Alt+B)
- 设置
- 统计信息（到期数/总数）

#### 可能的问题

**问题 1：MenuManager 未正确注册**

检查代码：
```typescript
// src/application/ApplicationContext.ts
this.registerServiceFactory('menuManager', (context) => {
  const dialogManager = context.getDialogManager();
  return new MenuManager(context, context.getPlugin(), context.getI18n(), dialogManager);
});
```

**问题 2：事件监听器未绑定**

检查代码：
```typescript
// src/index.ts
this.topBarContextMenuHandler = (ev: MouseEvent) => {
  ev.preventDefault();
  this.context.getMenuManager()?.openTopBarMenu(ev);
};
this.topBarElement?.addEventListener('contextmenu', this.topBarContextMenuHandler);
```

**问题 3：DialogManager 未传递给 MenuManager**

检查 MenuManager 构造函数是否正确接收 DialogManager：
```typescript
// src/application/managers/MenuManager.ts
constructor(
  private context: ApplicationContext,
  private plugin: Plugin,
  private i18n: Record<string, any>,
  private dialogManager: DialogManager  // 必须有这个参数
) {}
```

### 3. 测试复习界面

#### 操作步骤
1. 左键点击顶栏的 FSRS 插件图标
2. 或者右键点击图标，选择"提取练习"

#### 预期结果
应该打开复习对话框，显示待复习的卡片。

#### 可能的问题

**问题 1：DialogManager 未正确注册**

检查代码：
```typescript
// src/application/ApplicationContext.ts
this.registerServiceFactory('dialogManager', (context) => {
  return new DialogManager(context, context.getPlugin());
});
```

**问题 2：ReviewDialogManager 未找到**

检查控制台是否有错误：
```
[DialogManager] ReviewDialogManager not found
```

如果有这个错误，说明 ReviewDialogManager 未正确注册到 ApplicationContext。

**问题 3：插件未初始化完成**

检查代码：
```typescript
// src/index.ts
callback: () => {
  if (!this.isInitialized) { 
    pushMsg(this.i18n?.loading || '插件初始化中...'); 
    return; 
  }
  this.context.getDialogManager()?.openBrowserDialog();
},
```

### 4. 调试代码

#### 在浏览器控制台执行

```javascript
// 检查插件实例
const plugin = window.siyuanMemoPlugin;
console.log('Plugin:', plugin);

// 检查 ApplicationContext
console.log('Context:', plugin.context);

// 检查 MenuManager
const menuManager = plugin.context.getMenuManager();
console.log('MenuManager:', menuManager);

// 检查 DialogManager
const dialogManager = plugin.context.getDialogManager();
console.log('DialogManager:', dialogManager);

// 检查 ReviewDialogManager
const reviewDialogManager = plugin.context.getReviewDialogManager();
console.log('ReviewDialogManager:', reviewDialogManager);

// 测试打开菜单
if (menuManager) {
  const mockEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100
  });
  menuManager.openTopBarMenu(mockEvent);
}

// 测试打开对话框
if (dialogManager) {
  dialogManager.openReviewDialog();
}
```

### 5. 检查服务注册

在 ApplicationContext.ts 中，确保以下服务都已注册：

```typescript
// 检查 registerServiceFactories 方法
private registerServiceFactories(): void {
  // ... 其他服务
  
  // ✅ DialogManager
  this.registerServiceFactory('dialogManager', (context) => {
    return new DialogManager(context, context.getPlugin());
  });
  
  // ✅ MenuManager（注入 DialogManager）
  this.registerServiceFactory('menuManager', (context) => {
    const dialogManager = context.getDialogManager();
    return new MenuManager(context, context.getPlugin(), context.getI18n(), dialogManager);
  });
  
  // ... 其他服务
}
```

### 6. 检查 getter 方法

在 ApplicationContext.ts 中，确保有以下 getter 方法：

```typescript
getMenuManager(): MenuManager {
  return this.getService('menuManager');
}

getDialogManager(): DialogManager {
  return this.getService('dialogManager');
}

getReviewDialogManager(): ReviewDialogManager {
  return this.serviceContainer.get('reviewDialogManager') as ReviewDialogManager;
}
```

## 常见问题和解决方案

### 问题 1：MenuManager 未定义

**症状**：控制台显示 `MenuManager is not defined`

**原因**：MenuManager 类未正确导入或导出

**解决方案**：
1. 检查 `src/application/managers/MenuManager.ts` 是否正确导出
2. 检查 `src/application/ApplicationContext.ts` 是否正确导入

```typescript
// MenuManager.ts
export class MenuManager { ... }

// ApplicationContext.ts
import { MenuManager } from './managers/MenuManager';
```

### 问题 2：DialogManager 未传递给 MenuManager

**症状**：MenuManager 中的 `this.dialogManager` 为 undefined

**原因**：MenuManager 创建时未传递 DialogManager

**解决方案**：
确保在 ApplicationContext 中正确传递：

```typescript
this.registerServiceFactory('menuManager', (context) => {
  const dialogManager = context.getDialogManager();  // 先获取 DialogManager
  return new MenuManager(context, context.getPlugin(), context.getI18n(), dialogManager);
});
```

### 问题 3：循环依赖

**症状**：MenuManager 和 DialogManager 互相依赖，导致初始化失败

**原因**：服务注册顺序不正确

**解决方案**：
确保 DialogManager 在 MenuManager 之前注册：

```typescript
// 先注册 DialogManager
this.registerServiceFactory('dialogManager', (context) => {
  return new DialogManager(context, context.getPlugin());
});

// 再注册 MenuManager
this.registerServiceFactory('menuManager', (context) => {
  const dialogManager = context.getDialogManager();
  return new MenuManager(context, context.getPlugin(), context.getI18n(), dialogManager);
});
```

### 问题 4：ReviewDialogManager 未找到

**症状**：控制台显示 `[DialogManager] ReviewDialogManager not found`

**原因**：ReviewDialogManager 未正确注册到 ApplicationContext

**解决方案**：
检查 ApplicationContext.create() 方法中是否正确创建和注册了 ReviewDialogManager：

```typescript
const reviewDialogManager = new ReviewDialogManager({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: storageManager,
  scheduler: scheduler,
  isInitialized: () => true,
  plugin: config.plugin as any,
  openReviewTab: (options) => {}, // 将在后面设置
});

// 在创建 ApplicationContext 时传递
const context = new ApplicationContext(config, {
  // ... 其他服务
  reviewDialogManager,
  // ...
});
```

## 下一步行动

根据诊断结果，选择相应的修复方案：

1. **如果是服务未注册**：检查 ApplicationContext 的 registerServiceFactories 方法
2. **如果是依赖注入失败**：检查服务创建顺序和参数传递
3. **如果是事件监听器未绑定**：检查 index.ts 中的事件监听器代码
4. **如果是其他问题**：提供控制台错误信息，进一步诊断

## 测试清单

完成修复后，按以下清单测试：

- [ ] 插件加载成功，无控制台错误
- [ ] 右键点击顶栏图标，菜单正常弹出
- [ ] 菜单中所有选项都可见
- [ ] 点击"提取练习"，复习对话框正常打开
- [ ] 点击"渐进学习"，对话框正常打开
- [ ] 点击"刻意练习"，对话框正常打开
- [ ] 点击"神经漫游"，对话框正常打开
- [ ] 点击"筛选复习"，对话框正常打开
- [ ] 点击"SRS 浏览器"，浏览器正常打开
- [ ] 点击"设置"，设置对话框正常打开
- [ ] 左键点击顶栏图标，SRS 浏览器正常打开

## 参考文档

- [menu-manager-improvement.md](./menu-manager-improvement.md) - MenuManager 改进方案
- [bug-fix-ddd-analysis.md](./bug-fix-ddd-analysis.md) - Bug 修复的 DDD 符合性分析
- [design.md](./design.md) - DDD 架构设计文档
