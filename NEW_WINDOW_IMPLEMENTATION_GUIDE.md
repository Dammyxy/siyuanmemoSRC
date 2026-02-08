# 复习界面"使用新窗口打开"功能 - 优雅实现方案

## 📋 问题分析

当前实现不够优雅，使用了 localStorage 和手动触发的方式。思源原生的 openCard.ts 提供了更优雅的方案。

## 🔍 思源原生实现分析

### 关键代码（openCard.ts 第 507-530 行）

```typescript
/// #if !BROWSER
stickMenu.addItem({
    id: "openByNewWindow",
    icon: "iconOpenWindow",
    label: window.siyuan.languages.openByNewWindow,
    click() {
        const json = [{
            "title": window.siyuan.languages.spaceRepetition,
            "icon": "iconRiffCard",
            "instance": "Tab",
            "children": {
                "instance": "Custom",
                "customModelType": "siyuan-card",
                "customModelData": {
                    "cardsData": options.cardsData,
                    "index": index,
                    "cardType": filterElement.getAttribute("data-cardtype"),
                    "id": docId,
                    "title": options.title
                }
            }
        }];
        ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {
            url: `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?v=${Constants.SIYUAN_VERSION}&json=${encodeURIComponent(JSON.stringify(json))}`
        });
        options.dialog.destroy();
    }
});
/// #endif
```

### 核心要点

1. **使用 ipcRenderer.send**：
   - 事件名：`Constants.SIYUAN_OPEN_WINDOW`
   - 参数：包含 URL 的对象

2. **URL 格式**：
   ```
   ${protocol}//${host}/stage/build/app/window.html?v=${version}&json=${encodedJSON}
   ```

3. **JSON 数据结构**：
   ```typescript
   [{
       "title": "标题",
       "icon": "图标",
       "instance": "Tab",
       "children": {
           "instance": "Custom",
           "customModelType": "自定义类型ID",
           "customModelData": {
               // 自定义数据
           }
       }
   }]
   ```

4. **自定义类型**：
   - 原生闪卡使用：`"siyuan-card"`
   - 我们应该使用：`"siyuan-plugin-fsrs-review"`

## ✅ 优雅实现方案

### 1. 检查环境

首先需要检查是否在 Electron 环境中（不是浏览器）：

```typescript
/// #if !BROWSER
import { ipcRenderer } from 'electron';
/// #endif
```

### 2. 修改 openReviewTab 方法

添加一个新的 `openReviewInNewWindow` 方法：

```typescript
/**
 * 在新窗口中打开复习界面（优雅实现）
 */
openReviewInNewWindow(options: {
  provider?: any;
  queue?: any;
  adapter: any;
  title: string;
}): void {
  /// #if !BROWSER
  try {
    const providerId = options.provider?.id || (options.queue ? 'queue-based' : 'retrieval');
    
    // 构建 JSON 数据
    const json = [{
      "title": options.title,
      "icon": "iconFSRS",
      "instance": "Tab",
      "children": {
        "instance": "Custom",
        "customModelType": this.name + "-review", // 例如："siyuan-plugin-fsrs-review"
        "customModelData": {
          "provider": options.provider,
          "queue": options.queue,
          "adapter": options.adapter,
          "title": options.title,
          "providerId": providerId,
        }
      }
    }];
    
    // 发送到主进程
    ipcRenderer.send(Constants.SIYUAN_OPEN_WINDOW, {
      url: `${window.location.protocol}//${window.location.host}/stage/build/app/window.html?v=${Constants.SIYUAN_VERSION}&json=${encodeURIComponent(JSON.stringify(json))}`
    });
    
    console.log('[FSRS] Opened review in new window');
  } catch (err) {
    console.error('[FSRS] Failed to open review in new window:', err);
    void pushErrMsg(this.i18n?.openFailed || '打开新窗口失败');
  }
  /// #else
  // 浏览器环境降级：使用 Tab 模式
  console.warn('[FSRS] New window not supported in browser, using tab instead');
  this.openReviewTab(options);
  /// #endif
}
```

### 3. 注册自定义 Tab 类型

在 `onload()` 方法中，需要注册自定义 Tab 类型（已经存在，只需确保 ID 正确）：

```typescript
this.addTab({
  type: this.REVIEW_TAB_TYPE, // 应该是 "plugin-fsrs-review"
  init() {
    // 从 data 中恢复状态
    const savedProvider = (this as any).data?.provider;
    const savedQueue = (this as any).data?.queue;
    // ... 现有的恢复逻辑
  },
  destroy() {
    // 清理逻辑
  },
});
```

### 4. 修改 ReviewView.vue 中的菜单项

```typescript
/// #if !BROWSER
menu.addItem({
  id: 'openByNewWindow',
  icon: 'iconOpenWindow',
  label: '使用新窗口打开',
  click() {
    console.log('[FSRS ReviewView] Opening review in new window');
    
    // 获取插件实例
    const fsrsPlugin = (window as any).siyuanFsrsPlugin;
    if (!fsrsPlugin) {
      console.error('[FSRS ReviewView] Plugin instance not found');
      return;
    }
    
    // 调用优雅的新窗口打开方法
    fsrsPlugin.openReviewInNewWindow({
      provider: props.provider,
      queue: props.queue,
      adapter: props.adapter,
      title: props.title,
    });
    
    // 关闭当前对话框
    emit('close');
  },
});
/// #endif
```

## 🎯 优势对比

### 当前实现（不优雅）
- ❌ 使用 localStorage 传递状态
- ❌ 需要手动触发复习对话框
- ❌ 状态可能过期
- ❌ 跨窗口通信复杂

### 优雅实现
- ✅ 使用思源原生 API
- ✅ 状态直接传递到新窗口
- ✅ 自动恢复复习界面
- ✅ 与原生闪卡行为一致
- ✅ 代码简洁清晰

## 📝 实现步骤

1. **添加 Electron 导入**（如果还没有）
   ```typescript
   /// #if !BROWSER
   import { ipcRenderer } from 'electron';
   /// #endif
   ```

2. **添加 Constants 导入**
   ```typescript
   import { Constants } from 'siyuan';
   ```

3. **实现 openReviewInNewWindow 方法**
   - 构建 JSON 数据结构
   - 使用 ipcRenderer.send 发送
   - 添加错误处理

4. **更新 ReviewView.vue 菜单项**
   - 使用条件编译 `/// #if !BROWSER`
   - 调用新方法
   - 关闭当前对话框

5. **测试**
   - 桌面端：应该打开新窗口
   - 浏览器端：应该降级为 Tab 模式

## 🔧 注意事项

1. **customModelType 必须唯一**
   - 使用 `this.name + "-review"` 确保唯一性
   - 例如：`"siyuan-plugin-fsrs-review"`

2. **数据序列化**
   - Provider 和 Queue 对象可能包含函数
   - 需要确保可以序列化（或者只传递必要的数据）

3. **条件编译**
   - 使用 `/// #if !BROWSER` 确保只在桌面端使用
   - 浏览器端提供降级方案

4. **对话框关闭**
   - 新窗口打开后应该关闭当前对话框
   - 使用 `emit('close')` 或直接销毁

## 🚀 下一步

1. 实现 `openReviewInNewWindow` 方法
2. 更新 ReviewView.vue 菜单项
3. 测试桌面端和浏览器端
4. 删除旧的 localStorage 实现

## 📚 参考

- 思源原生实现：`siyuan/app/src/card/openCard.ts` 第 507-530 行
- 自定义 Tab 注册：`siyuan/app/src/index.ts`
- IPC 通信：Electron 文档
