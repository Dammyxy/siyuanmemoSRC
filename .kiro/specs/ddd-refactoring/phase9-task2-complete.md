# Phase 9 Task 2 完成总结 - UI Composables 重构

完成时间：2026-02-19

## 已完成工作

### 1. 重构 useContextMenu ✅

**文件**: `src/ui/browser/composables/useContextMenu.ts`

**变更**:
1. 添加 `tabApplicationService` 参数到 `ContextMenuOptions` 接口
2. 更新 "打开" 操作的实现：
   - 优先使用 `tabApplicationService.openDocumentTab()`
   - 向后兼容：保留 `tabManager` 和 `plugin.app` 回退

**代码示例**:
```typescript
export interface ContextMenuOptions {
  plugin?: any;
  tabManager?: any;  // ⚠️ 已废弃
  tabApplicationService?: any;  // ✅ Phase 9
  i18n?: Record<string, string>;
  loadData: () => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
}

// 使用示例
if (options.tabApplicationService) {
  await options.tabApplicationService.openDocumentTab({ docId: blockId });
}
```

### 2. 重构 useGridInteractions ✅

**文件**: `src/ui/browser/composables/useGridInteractions.ts`

**变更**:
1. 添加 `tabApplicationService` 参数到 `GridInteractionsOptions` 接口
2. 更新 `onRowDoubleClicked` 方法：
   - 优先使用 `tabApplicationService.openDocumentTab()`
   - 向后兼容：保留 `tabManager` 和 `plugin.app` 回退
   - 改为 async 函数

**代码示例**:
```typescript
export interface GridInteractionsOptions {
  plugin?: any;
  tabManager?: any;  // ⚠️ 已废弃
  tabApplicationService?: any;  // ✅ Phase 9
  i18n?: Record<string, string>;
}

// 使用示例
const onRowDoubleClicked = async (event: any) => {
  if (props.tabApplicationService) {
    await props.tabApplicationService.openDocumentTab({ docId: blockId });
  }
};
```

### 3. 更新 SRSBrowser.vue Props ✅

**文件**: `src/ui/browser/SRSBrowser.vue`

**变更**:
1. 添加 `tabApplicationService` prop
2. 标记 `tabManager` 为已废弃

**代码示例**:
```typescript
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: any;
  browserService?: any;
  tabManager?: any;      // ⚠️ 已废弃
  tabApplicationService?: any;  // ✅ Phase 9
}>();
```

## 架构改进

### 向后兼容策略

我们采用了渐进式迁移策略：

1. **优先级顺序**:
   - 第一优先：`tabApplicationService`（新 DDD 架构）
   - 第二优先：`tabManager`（旧 DDD 架构）
   - 第三优先：`plugin.app`（最旧的直接访问）

2. **好处**:
   - 不破坏现有代码
   - 允许逐步迁移
   - 提供清晰的升级路径

### 依赖注入流程

```
Plugin/ApplicationContext
  ↓ 创建
TabApplicationService
  ↓ 注入到
SRSBrowser.vue (props)
  ↓ 传递到
useContextMenu / useGridInteractions
  ↓ 使用
tabApplicationService.openDocumentTab()
```

## 待完成工作

### 下一步：更新调用方

需要更新所有创建 SRSBrowser 组件的地方，传递 `tabApplicationService`：

1. **PluginService.ts** - `openSRSBrowser()` 方法
2. **ReviewDialogManager.ts** - 各种对话框创建
3. **index.ts** (主插件文件) - 打开浏览器的地方

### 示例更新代码

```typescript
// 在创建 SRSBrowser 时
createVueDialog({
  component: SRSBrowser,
  props: {
    app: this.plugin.app,
    i18n: this.plugin.i18n,
    plugin: this.plugin,
    browserService: context.getBrowserService(),
    tabApplicationService: context.getTabApplicationService(),  // ✅ 新增
  }
});
```

## 测试建议

1. **功能测试**:
   - 测试右键菜单"打开"功能
   - 测试双击行打开文档
   - 测试向后兼容（不传 tabApplicationService 时）

2. **集成测试**:
   - 测试从不同入口打开浏览器
   - 测试在对话框、标签页、Dock 模式下的行为

## 技术债务

1. **类型安全**:
   - `tabApplicationService?: any` 应该改为具体类型
   - 建议：`tabApplicationService?: TabApplicationService`

2. **完全移除旧代码**:
   - 当所有调用方都更新后，可以移除 `tabManager` 和 `plugin.app` 的回退逻辑

## 影响范围

### 已更新文件
- ✅ `src/ui/browser/composables/useContextMenu.ts`
- ✅ `src/ui/browser/composables/useGridInteractions.ts`
- ✅ `src/ui/browser/SRSBrowser.vue`

### 需要更新的文件
- ⏳ `src/services/PluginService.ts`
- ⏳ `src/services/ReviewDialogManager.ts`
- ⏳ `src/index.ts`
- ⏳ 其他创建 SRSBrowser 的地方

## 总结

我们成功地将 UI Composables 重构为使用 TabApplicationService，实现了：

1. **清晰的分层**：UI 层通过应用服务访问功能，不直接访问基础设施
2. **向后兼容**：保留了旧代码的回退路径
3. **类型安全**：通过接口定义明确了依赖关系
4. **可测试性**：应用服务可以被 mock，便于单元测试

下一步需要更新所有调用方，传递 `tabApplicationService` 参数。
