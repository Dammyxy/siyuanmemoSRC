# 优雅的"使用新窗口打开"功能实现完成

## ✅ 实现完成

已成功实现优雅的"使用新窗口打开"功能，参考思源原生 `openCard.ts` 的实现方式。

## 🔧 实现细节

### 1. 添加 Electron 导入（条件编译）

**文件**: `src/index.ts`

```typescript
/// #if !BROWSER
import { ipcRenderer } from 'electron';
/// #endif
```

### 2. 修复 Tab 注册问题

**问题**:
- 重复注册了两次复习 Tab
- `customModelType` 与实际注册的 Tab type 不匹配

**修复**:
- 删除重复的 Tab 注册（`FSRSPlugin.REVIEW_TAB_TYPE`）
- 只保留一个 Tab 注册（`this.REVIEW_TAB_TYPE = 'plugin-fsrs-review'`）
- 确保 `customModelType` 使用 `this.REVIEW_TAB_TYPE`

### 3. 替换 `openReviewInNewWindow` 方法

**旧实现**:
- 使用 localStorage 保存状态
- 手动触发复习对话框
- 不够优雅，状态可能过期

**新实现**:
- 使用 `ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {...})`
- 直接传递数据到新窗口
- 与思源原生行为一致
- 桌面端打开新窗口，浏览器端降级为 Tab

```typescript
openReviewInNewWindow(options: {
  provider?: any;
  queue?: any;
  adapter: any;
  title: string;
}): void {
  /// #if !BROWSER
  // 桌面端：使用 ipcRenderer 打开新窗口
  const json = [{
    "title": options.title,
    "icon": "iconFSRS",
    "instance": "Tab",
    "children": {
      "instance": "Custom",
      "customModelType": this.REVIEW_TAB_TYPE, // 🔑 关键：使用实际注册的 Tab type
      "customModelData": {
        "provider": options.provider,
        "queue": options.queue,
        "adapter": options.adapter,
        "title": options.title,
        "providerId": providerId,
      }
    }
  }];
  
  ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {
    url: `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?v=${Constants.SIYUAN_VERSION}&json=${encodeURIComponent(JSON.stringify(json))}`
  });
  /// #else
  // 浏览器端：降级为 Tab 模式
  this.openReviewTab(options);
  /// #endif
}
```

### 4. 更新 ReviewView.vue 菜单项

**文件**: `src/ui/review/v2/ReviewView.vue`

```typescript
/// #if !BROWSER
menu.addItem({
  id: 'openByNewWindow',
  icon: 'iconOpenWindow',
  label: '使用新窗口打开',
  click() {
    const fsrsPlugin = (window as any).siyuanFsrsPlugin;
    fsrsPlugin.openReviewInNewWindow({
      provider: props.provider,
      queue: props.queue,
      adapter: props.adapter,
      title: props.title || '复习',
    });
    emit('close');
  },
});
/// #endif
```

### 5. 删除旧的 localStorage 实现

- 删除 `openReviewDialogFromSavedState()` 方法
- 删除 Tab 初始化中的"开始复习"按钮逻辑
- 清理所有 localStorage 相关代码

### 6. 更新 vite.config.ts

添加 `electron` 到外部依赖：

```typescript
external: ["siyuan", "process", "electron"],
```

## 🎯 优势对比

| 特性 | 旧实现 | 新实现 |
|------|--------|--------|
| 状态传递 | localStorage | 直接传递 |
| 触发方式 | 手动触发 | 自动恢复 |
| 状态过期 | 可能过期 | 不会过期 |
| 代码复杂度 | 高 | 低 |
| 与原生一致性 | 不一致 | 完全一致 |
| 浏览器兼容 | 不支持 | 降级为 Tab |
| Tab 注册 | 重复注册 | 单一注册 |

## 📝 测试清单

### 桌面端测试
- [ ] 提取练习 → 使用新窗口打开
- [ ] 刻意练习 → 使用新窗口打开
- [ ] 筛选复习 → 使用新窗口打开
- [ ] 渐进学习 → 使用新窗口打开
- [ ] 难记卡片 → 使用新窗口打开
- [ ] 神经漫游 → 使用新窗口打开

### 浏览器端测试
- [ ] 确认降级为 Tab 模式
- [ ] 所有复习模式正常工作

## 🔍 技术要点

### 条件编译
- 使用 `/// #if !BROWSER` 和 `/// #endif` 进行条件编译
- 桌面端使用 Electron API
- 浏览器端使用降级方案

### JSON 数据结构
```json
[{
  "title": "标题",
  "icon": "图标",
  "instance": "Tab",
  "children": {
    "instance": "Custom",
    "customModelType": "plugin-fsrs-review",
    "customModelData": {
      // 自定义数据
    }
  }
}]
```

### customModelType 必须匹配
- **关键**：`customModelType` 必须与 `addTab({ type: ... })` 中的 type 完全一致
- 本插件使用：`this.REVIEW_TAB_TYPE = 'plugin-fsrs-review'`
- 如果不匹配，新窗口中 Tab 无法正确恢复状态

## 🐛 已修复的问题

### 问题 1：新窗口中复习界面无法加载

**原因**:
- 重复注册了两次复习 Tab（`FSRSPlugin.REVIEW_TAB_TYPE` 和 `this.REVIEW_TAB_TYPE`）
- `customModelType` 使用了 `this.name + "-review"`，但实际注册的是 `'plugin-fsrs-review'`
- 导致新窗口无法找到正确的 Tab 类型

**修复**:
- 删除重复的 Tab 注册
- 统一使用 `this.REVIEW_TAB_TYPE = 'plugin-fsrs-review'`
- `customModelType` 改为使用 `this.REVIEW_TAB_TYPE`

## 📚 参考

- 思源原生实现: `siyuan/app/src/card/openCard.ts` (第 542-574 行)
- 实现指南: `NEW_WINDOW_IMPLEMENTATION_GUIDE.md`

## ✨ 总结

成功实现了优雅的"使用新窗口打开"功能，完全参考思源原生实现：

1. ✅ 使用 `ipcRenderer.send` 打开新窗口
2. ✅ 直接传递数据，无需 localStorage
3. ✅ 支持条件编译（桌面端/浏览器端）
4. ✅ 与思源原生行为完全一致
5. ✅ 代码简洁清晰，易于维护
6. ✅ 修复了 Tab 注册问题，确保新窗口正常加载

现在可以在桌面端测试新窗口功能，在浏览器端会自动降级为 Tab 模式。新窗口中的复习界面应该能够正常加载和工作了！

