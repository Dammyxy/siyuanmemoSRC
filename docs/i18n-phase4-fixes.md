# i18n Phase 4 修复：翻译和循环引用问题

## 问题描述

用户报告了三个问题：
1. "在Tab中打开"没有翻译
2. "使用新窗口打开"菜单项还在显示
3. 使用"在Tab中打开"功能后出现循环引用错误，导致思源无法关闭

## 根本原因

1. **翻译问题**: ReviewView.vue 中的"打开为"子菜单使用了硬编码的中文文本
2. **菜单项未隐藏**: "使用新窗口打开"的代码只是部分注释，还有未注释的部分
3. **循环引用错误**: `openReviewTab` 方法直接传递了包含循环引用的对象（provider, queue, adapter）到 `openTab`

## 修复内容

### 1. 修复 ReviewView.vue 中的"打开为"子菜单翻译

**文件**: `siyuan-plugin-siyuanmemo/src/ui/review/v2/ReviewView.vue`

将硬编码的中文文本改为使用 i18n 函数：

```typescript
// 降级方案中的菜单项
menu.addItem({
  id: 'openByNewWindow',
  icon: 'iconOpenWindow',
  label: t('openInNewWindow', 'Open in New Window'),  // 修复
  click() {
    if (props.app) {
      openWindow({
        doc: { id: blockId },
      });
    }
  },
});

// 在 Tab 中打开
menu.addItem({
  id: 'openByTab',
  icon: 'iconLayoutRight',
  label: t('openInTab', 'Open in Tab'),  // 修复
  click() {
    // ...
    fsrsPlugin.openReviewTab({
      provider: props.provider,
      queue: props.queue,
      adapter: props.adapter,
      title: props.title || t('reviewTitle', 'Review'),  // 修复
    });
    // ...
  },
});
```

### 2. 完全注释掉"使用新窗口打开"选项

**文件**: `siyuan-plugin-siyuanmemo/src/ui/review/v2/ReviewView.vue`

将整个"使用新窗口打开"的菜单项代码块注释掉：

```typescript
// 注释掉"使用新窗口打开"选项
// /// #if !BROWSER
// menu.addItem({
//   id: 'openByNewWindow',
//   icon: 'iconOpenWindow',
//   label: t('openInNewWindow', 'Open in New Window'),
//   click() {
//     console.log('[SiyuanMemo][ReviewView] Opening review in new window');
//     try {
//       const fsrsPlugin = (window as any).siyuanMemoPlugin;
//       if (!fsrsPlugin) {
//         console.error('[SiyuanMemo][ReviewView] Plugin instance not found');
//         return;
//       }
//
//       fsrsPlugin.openReviewInNewWindow({
//         provider: props.provider,
//         queue: props.queue,
//         adapter: props.adapter,
//         title: props.title || t('reviewTitle', 'Review'),
//       });
//
//       emit('close');
//     } catch (err) {
//       console.error('[SiyuanMemo][ReviewView] Error opening review in new window:', err);
//     }
//   },
// });
// /// #endif
```

### 3. 修复循环引用错误

**文件**: `siyuan-plugin-siyuanmemo/src/index.ts`

修改 `openReviewTab` 方法，只传递配置信息而不是对象实例：

```typescript
openReviewTab(options: {
  provider?: any;
  queue?: any;
  adapter: any;
  title: string;
}): void {
  try {
    const providerId = options.provider?.id || (options.queue ? 'queue-based' : 'retrieval');
    
    // 🔧 修复循环引用问题：不直接传递对象，而是传递配置信息
    // 在 Tab 的 onload 中重新创建这些对象
    openTab({
      app: this.app,
      custom: {
        icon: 'iconSiyuanMemo',
        title: options.title,
        id: this.name + this.REVIEW_TAB_TYPE,
        data: {
          // 只传递配置信息，不传递对象实例
          providerId: providerId,
          title: options.title,
          // 如果需要队列信息，传递队列类型而不是实例
          queueType: options.queue?.getType?.() || null,
        },
      },
      position: 'right',
    });
  } catch (err) {
    console.error('[SiyuanMemo] Failed to open review tab:', err);
    void pushErrMsg(this.i18n?.openFailed || '打开标签页失败');
  }
}
```

### 4. 添加新的 i18n 键

**文件**: `siyuan-plugin-siyuanmemo/src/i18n/zh_CN.json`

添加了：
```json
"openInTab": "在Tab中打开"
```

**文件**: `siyuan-plugin-siyuanmemo/src/i18n/en_US.json`

添加了：
```json
"openInTab": "Open in Tab"
```

## 循环引用问题的技术细节

### 问题原因

思源的 `openTab` API 会将 `data` 对象序列化为 JSON 存储。当我们传递包含循环引用的对象时：

```typescript
// ❌ 错误的做法
data: {
  provider: options.provider,  // 可能包含 app 引用
  queue: options.queue,        // 可能包含 plugin 引用
  adapter: options.adapter,    // 可能包含其他循环引用
}
```

这些对象的属性链可能形成循环：
```
plugin.app -> app.plugins -> plugin (循环)
```

### 解决方案

只传递可序列化的配置信息：

```typescript
// ✅ 正确的做法
data: {
  providerId: providerId,      // 字符串
  title: options.title,        // 字符串
  queueType: options.queue?.getType?.() || null,  // 字符串或 null
}
```

在 Tab 加载时，根据这些配置信息重新创建所需的对象实例。

## 测试步骤

1. 重新构建插件：
   ```bash
   cd siyuan-plugin-siyuanmemo
   pnpm run build
   ```

2. 在 SiYuan Notes 中重新加载插件

3. 打开复习界面，点击"打开为"按钮，验证：
   - "在Tab中打开" 显示为英文 "Open in Tab"（英文界面）或中文（中文界面）
   - "使用新窗口打开" 选项已被隐藏

4. 点击"在Tab中打开"，验证：
   - 复习界面在新 Tab 中打开
   - 没有出现循环引用错误
   - 可以正常关闭 Tab
   - 思源窗口可以正常关闭

## 修改的文件

1. `siyuan-plugin-siyuanmemo/src/ui/review/v2/ReviewView.vue` - 修复翻译并完全注释掉"新窗口"选项
2. `siyuan-plugin-siyuanmemo/src/index.ts` - 修复循环引用问题
3. `siyuan-plugin-siyuanmemo/src/i18n/zh_CN.json` - 添加 openInTab 键
4. `siyuan-plugin-siyuanmemo/src/i18n/en_US.json` - 添加 openInTab 键

## 注意事项

- 循环引用问题是由于思源的 `openTab` API 需要序列化 data 对象导致的
- 解决方案是只传递可序列化的配置信息，在 Tab 加载时重新创建对象
- 这个修复可能需要在 Tab 的 onload 回调中添加相应的对象重建逻辑
- 如果 Tab 功能不正常，需要检查 Tab 的 onload 回调是否正确处理了新的 data 格式

## 后续工作

如果"在Tab中打开"功能不能正常工作，需要：
1. 找到 Tab 的 onload 回调函数
2. 根据 `data.providerId` 和 `data.queueType` 重新创建 provider、queue 和 adapter 对象
3. 确保复习界面能够正常初始化
