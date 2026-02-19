# 概念卡菜单缺失问题 - 调试指南

## 问题描述

右键块菜单中没有显示"创建概念卡片"相关选项。

## 可能的原因

### 1. 插件未正确加载

**检查方法**：
1. 打开浏览器控制台（F12）
2. 查看是否有 `[SiYuanMemo] Plugin loaded successfully` 日志
3. 检查是否有错误信息

**预期输出**：
```
[SiYuanMemo] Plugin loading...
[ApplicationContext] ✅ ApplicationContext created successfully
[SiYuanMemo] Plugin loaded successfully
```

**如果没有看到**：
- 插件可能没有启用
- 插件加载失败
- 需要重新编译插件

### 2. 插件未编译或编译失败

**检查方法**：
```bash
# 检查 dist 目录是否存在
ls siyuan-plugin-siyuanmemo/dist/

# 检查 index.js 是否存在且是最新的
ls -la siyuan-plugin-siyuanmemo/dist/index.js
```

**解决方案**：
```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

### 3. 事件处理器未注册

**检查方法**：
在浏览器控制台执行：
```javascript
// 检查插件实例
const plugin = window.siyuanMemoPlugin;
console.log('Plugin:', plugin);

// 检查 ApplicationContext
console.log('Context:', plugin?.context);

// 检查 BlockMenuHandler
const handler = plugin?.context?.getBlockMenuHandler();
console.log('BlockMenuHandler:', handler);

// 检查事件监听器
console.log('EventBus:', plugin?.eventBus);
```

**预期输出**：
- Plugin: FSRSPlugin 实例
- Context: ApplicationContext 实例
- BlockMenuHandler: BlockMenuHandler 实例
- EventBus: 有 _eventBus 属性

### 4. 菜单项被条件隐藏

**检查方法**：
查看 BlockMenuHandler 的代码，确认菜单项没有被条件语句隐藏。

**当前代码**（第 146-162 行）：
```typescript
// 制作为概念卡并加入队列
submenu.push({
  icon: 'iconMark',
  label: this.deps.i18n?.makeConceptAndAddToQueue || '📍 制作为概念卡并加入队列',
  click: async () => {
    await this.makeConceptAndAddToRoam(blockIds[0], 'normal');
  },
});

// 制作为概念卡并立即漫游
submenu.push({
  icon: 'iconFocus',
  label: this.deps.i18n?.makeConceptAndStartRoam || '🚀 制作为概念卡并立即漫游',
  click: async () => {
    await this.makeConceptAndAddToRoam(blockIds[0], 'high');
  },
});
```

**结论**：菜单项没有条件判断，应该始终显示。

### 5. 菜单注册时机问题

**检查方法**：
在浏览器控制台执行：
```javascript
// 手动触发块菜单
const plugin = window.siyuanMemoPlugin;
const handler = plugin?.context?.getBlockMenuHandler();

// 模拟块菜单事件
const mockEvent = {
  detail: {
    menu: {
      addItem: (item) => console.log('Menu item:', item)
    },
    blockElements: [
      document.querySelector('[data-node-id]')
    ]
  }
};

handler?.handleBlockIconClick(mockEvent);
```

**预期输出**：
应该看到多个 `Menu item:` 日志，包括 SiyuanMemo 主菜单项。

## 调试步骤

### 步骤 1：确认插件已启用

1. 打开思源笔记
2. 进入 设置 → 集市 → 已下载 → 插件
3. 确认 SiyuanMemo 插件已启用（开关是打开状态）

### 步骤 2：重新编译插件

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

### 步骤 3：重启思源笔记

1. 完全关闭思源笔记
2. 重新打开思源笔记
3. 等待插件加载完成

### 步骤 4：检查控制台日志

1. 打开浏览器控制台（F12）
2. 查看是否有错误信息
3. 查看是否有 `[SiYuanMemo] Plugin loaded successfully` 日志

### 步骤 5：测试块菜单

1. 创建一个测试块
2. 右键点击块图标（块左侧的小圆点）
3. 查看是否有 "SiyuanMemo" 菜单项
4. 展开 "SiyuanMemo" 菜单，查看子菜单

### 步骤 6：手动测试菜单注册

在浏览器控制台执行：
```javascript
// 获取插件实例
const plugin = window.siyuanMemoPlugin;

// 检查插件是否加载
if (!plugin) {
  console.error('❌ 插件未加载');
} else {
  console.log('✅ 插件已加载');
  
  // 检查 ApplicationContext
  if (!plugin.context) {
    console.error('❌ ApplicationContext 未初始化');
  } else {
    console.log('✅ ApplicationContext 已初始化');
    
    // 检查 BlockMenuHandler
    const handler = plugin.context.getBlockMenuHandler();
    if (!handler) {
      console.error('❌ BlockMenuHandler 未初始化');
    } else {
      console.log('✅ BlockMenuHandler 已初始化');
      
      // 检查方法是否存在
      if (typeof handler.handleBlockIconClick !== 'function') {
        console.error('❌ handleBlockIconClick 方法不存在');
      } else {
        console.log('✅ handleBlockIconClick 方法存在');
      }
      
      if (typeof handler.makeConceptAndAddToRoam !== 'function') {
        console.error('❌ makeConceptAndAddToRoam 方法不存在');
      } else {
        console.log('✅ makeConceptAndAddToRoam 方法存在');
      }
    }
  }
}
```

## 常见问题

### Q1：控制台显示 "Plugin loaded successfully" 但菜单仍然不显示

**可能原因**：
- 事件监听器未正确注册
- 菜单注册代码有错误

**解决方案**：
1. 检查 `registerEventHandlers()` 方法是否被调用
2. 在控制台执行步骤 6 的测试代码
3. 查看是否有 JavaScript 错误

### Q2：编译后仍然没有菜单

**可能原因**：
- 思源笔记缓存了旧版本的插件
- 插件文件没有正确复制到思源笔记的插件目录

**解决方案**：
1. 完全关闭思源笔记
2. 删除插件目录：`<思源笔记数据目录>/plugins/siyuan-plugin-siyuanmemo`
3. 重新复制编译后的插件文件
4. 重新打开思源笔记

### Q3：其他插件的菜单正常，只有 SiyuanMemo 的菜单不显示

**可能原因**：
- BlockMenuHandler 初始化失败
- 事件监听器注册失败

**解决方案**：
1. 查看控制台是否有错误信息
2. 执行步骤 6 的测试代码
3. 检查 ApplicationContext 的创建日志

## 快速修复

如果以上步骤都无法解决问题，尝试以下快速修复：

### 方法 1：清理并重新编译

```bash
cd siyuan-plugin-siyuanmemo
rm -rf dist node_modules
npm install
npm run build
```

### 方法 2：检查代码是否有语法错误

```bash
cd siyuan-plugin-siyuanmemo
npm run type-check
```

### 方法 3：使用开发模式

```bash
cd siyuan-plugin-siyuanmemo
npm run dev
```

然后查看控制台输出，看是否有编译错误。

## 临时解决方案

如果菜单仍然不显示，可以通过以下方式手动创建概念卡：

### 方法 1：使用控制台

```javascript
const plugin = window.siyuanMemoPlugin;
const handler = plugin.context.getBlockMenuHandler();

// 获取当前选中的块 ID
const blockId = document.querySelector('[data-node-id]')?.getAttribute('data-node-id');

// 创建概念卡
if (blockId) {
  handler.makeConceptAndAddToRoam(blockId, 'normal');
}
```

### 方法 2：使用快捷键（如果已配置）

检查插件设置中是否有快捷键配置。

## 需要提供的信息

如果问题仍然存在，请提供以下信息：

1. **控制台日志**：
   - 插件加载日志
   - 错误信息（如果有）

2. **测试结果**：
   - 步骤 6 的测试代码输出

3. **环境信息**：
   - 思源笔记版本
   - 操作系统
   - 浏览器版本（如果使用浏览器版）

4. **插件信息**：
   - 插件版本
   - 最后一次编译时间
   - dist/index.js 文件大小

## 下一步

如果确认菜单确实不显示，我们需要：

1. 检查代码是否有遗漏的修改
2. 确认 BlockMenuHandler 的初始化流程
3. 验证事件监听器的注册
4. 测试菜单注册的时机

---

**创建时间**：2026-02-19
**状态**：调试中
