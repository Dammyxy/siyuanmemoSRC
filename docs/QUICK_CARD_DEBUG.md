# 快速制卡符号系统 - 调试指南

**问题**: 快速制卡功能不起作用  
**创建时间**: 2026-02-15

---

## 🔍 快速诊断步骤

### 步骤 1: 检查 WebSocket 服务是否启动

打开浏览器控制台 (F12),查找以下日志:

```
[SiyuanMemo] ✅ TransactionWebSocketService initialized and started
[SiyuanMemo] ✅ AutoCardHandler registered
[TransactionWS] Connected to ws://127.0.0.1:6806/ws
```

**如果没有看到这些日志**:
- 问题: WebSocket 服务未启动
- 原因: Riff 增量同步可能被禁用
- 解决方法: 见步骤 2

### 步骤 2: 启用 Riff 增量同步

1. 打开思源笔记设置
2. 找到 `SiYuan Memo` 插件设置
3. 找到 `Riff 集成` 部分
4. 确保以下选项已启用:
   - ✅ **使用本地调度器**
   - ✅ **启用增量同步**

5. 重启插件或重新加载思源

### 步骤 3: 检查快速制卡配置

在浏览器控制台中运行:

```javascript
// 获取插件实例
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

// ✅ 正确方式：通过 StorageManager 访问配置
const settings = plugin.storage.getSettings();
console.log('快速制卡配置:', settings.quickCard);
```

**预期输出**:
```javascript
{
  enabled: true,
  enabledSymbols: {
    basic: true,
    concept: true,
    descriptor: true,
    cloze: true,
    multiLine: true
  },
  debounceDelay: {
    quick: 300,
    list: 2000
  },
  descriptorUseXiuyuan: true
}
```

**如果 `enabled: false`**:
1. 打开插件设置
2. 找到 `快速制卡` 部分
3. 启用 `启用快速制卡`

### 步骤 4: 检查 AutoCardHandler 是否注册

在浏览器控制台中运行:

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
console.log('WebSocket 服务:', plugin.transactionWebSocketService);
console.log('处理器数量:', plugin.transactionWebSocketService?.handlers?.size || 0);
```

**预期输出**:
- 处理器数量应该 >= 2 (RiffSyncHandler + AutoCardHandler)

### 步骤 5: 测试符号检测

1. 在思源中创建一个新块
2. 输入: `测试 >> 答案`
3. 打开控制台,查找以下日志:

```
[AutoCard] Block queued: block-xxx action: insert
[AutoCard] Processing quick queue, count: 1
[AutoCard] Checking quick symbols: block-xxx content: 测试 >> 答案
[AutoCard] Detected basic forward symbol: block-xxx
[AutoCard] Creating basic card: block-xxx forward
```

**如果没有看到任何日志**:
- 问题: AutoCardHandler 未接收到事件
- 继续步骤 6

### 步骤 6: 检查 WebSocket 事件

在浏览器控制台中运行:

```javascript
// 监听 WebSocket 消息
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const ws = plugin.transactionWebSocketService?.ws;

if (ws) {
  const originalOnMessage = ws.onmessage;
  ws.onmessage = function(event) {
    console.log('[WS Debug] Received message:', event.data);
    if (originalOnMessage) {
      originalOnMessage.call(this, event);
    }
  };
  console.log('✅ WebSocket 消息监听已启用');
} else {
  console.error('❌ WebSocket 未连接');
}
```

然后输入测试内容,查看是否收到 `transactions` 消息。

---

## 🐛 常见问题和解决方法

### 问题 1: WebSocket 服务未启动

**症状**:
- 控制台没有 `[TransactionWS]` 日志
- 没有 `AutoCardHandler registered` 日志

**原因**:
- Riff 增量同步被禁用

**解决方法**:
1. 打开插件设置
2. 找到 `Riff 集成` → `增量同步`
3. 启用 `启用增量同步`
4. 重启插件

### 问题 2: 快速制卡功能被禁用

**症状**:
- WebSocket 连接正常
- 但没有 `[AutoCard]` 日志

**原因**:
- 快速制卡配置被禁用

**解决方法**:
1. 打开插件设置
2. 找到 `快速制卡`
3. 启用 `启用快速制卡`
4. 确保各符号类型也已启用

### 问题 3: 配置访问方式错误

**症状**:
- `plugin.data['fsrs-config']?.quickCard` 返回 `undefined`
- 但插件设置中快速制卡已启用

**原因**:
- 使用了错误的配置访问方式
- 应该使用 `plugin.storage.getSettings()` 而不是 `plugin.data[STORAGE_NAME]`

**解决方法**:

✅ 正确方式：
```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const settings = plugin.storage.getSettings();
console.log('快速制卡配置:', settings.quickCard);
```

❌ 错误方式（已废弃）：
```javascript
// 不要使用这种方式
const config = plugin.data['fsrs-config']?.quickCard;
```

### 问题 4: 防抖时间未到

**症状**:
- 有 `[AutoCard] Block queued` 日志
- 但没有 `Processing quick queue` 日志

**原因**:
- 防抖时间还未到 (默认 300ms)

**解决方法**:
- 等待 300ms
- 或者在控制台中手动触发:

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const handlers = Array.from(plugin.transactionWebSocketService.handlers);
const autoCardHandler = handlers.find(h => h.constructor.name === 'AutoCardHandler');

if (autoCardHandler) {
  // 手动触发处理
  autoCardHandler.processQuickQueue?.();
  console.log('✅ 手动触发快速队列处理');
} else {
  console.error('❌ 未找到 AutoCardHandler');
}
```

---

## 🔧 完整诊断脚本

将以下脚本复制到浏览器控制台中运行:

```javascript
(async function diagnose() {
  console.log('=== 快速制卡诊断开始 ===\n');
  
  // 1. 检查插件
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到');
    return;
  }
  console.log('✅ 插件已加载');
  
  // 2. 检查 WebSocket 服务
  if (!plugin.transactionWebSocketService) {
    console.error('❌ TransactionWebSocketService 未初始化');
    console.log('💡 解决方法: 启用 Riff 增量同步');
    return;
  }
  console.log('✅ TransactionWebSocketService 已初始化');
  
  // 3. 检查 WebSocket 连接
  const ws = plugin.transactionWebSocketService.ws;
  if (!ws || ws.readyState !== 1) {
    console.error('❌ WebSocket 未连接, readyState:', ws?.readyState);
    return;
  }
  console.log('✅ WebSocket 已连接');
  
  // 4. 检查处理器
  const handlers = plugin.transactionWebSocketService.handlers;
  console.log('✅ 已注册处理器数量:', handlers.size);
  
  const handlerNames = Array.from(handlers).map(h => h.constructor.name);
  console.log('   处理器列表:', handlerNames);
  
  const hasAutoCardHandler = handlerNames.includes('AutoCardHandler');
  if (!hasAutoCardHandler) {
    console.error('❌ AutoCardHandler 未注册');
    return;
  }
  console.log('✅ AutoCardHandler 已注册');
  
  // 5. 检查配置
  const settings = plugin.storage.getSettings();
  if (!settings) {
    console.error('❌ 配置不存在');
    return;
  }
  console.log('✅ 配置已加载');
  
  const quickCard = settings.quickCard;
  if (!quickCard) {
    console.error('❌ 快速制卡配置不存在');
    console.log('💡 解决方法: 在插件设置中配置快速制卡');
    return;
  }
  console.log('✅ 快速制卡配置存在');
  
  if (!quickCard.enabled) {
    console.error('❌ 快速制卡功能被禁用');
    console.log('💡 解决方法: 在插件设置中启用快速制卡');
    return;
  }
  console.log('✅ 快速制卡功能已启用');
  
  // 6. 显示配置详情
  console.log('\n📋 快速制卡配置:');
  console.log('   启用状态:', quickCard.enabled);
  console.log('   启用的符号:');
  console.log('     - 基础卡片 (>>, <<, <>):', quickCard.enabledSymbols.basic);
  console.log('     - 概念卡片 (::):', quickCard.enabledSymbols.concept);
  console.log('     - 描述符卡片 (;;):', quickCard.enabledSymbols.descriptor);
  console.log('     - 填空卡片 ({{}}）:', quickCard.enabledSymbols.cloze);
  console.log('     - 列表模版 (>>>):', quickCard.enabledSymbols.multiLine);
  console.log('   防抖时间:');
  console.log('     - 快速符号:', quickCard.debounceDelay.quick, 'ms');
  console.log('     - 列表模版:', quickCard.debounceDelay.list, 'ms');
  
  console.log('\n=== 诊断完成 ===');
  console.log('✅ 所有检查通过,快速制卡功能应该正常工作');
  console.log('💡 如果仍然不工作,请尝试:');
  console.log('   1. 输入测试内容: "测试 >> 答案"');
  console.log('   2. 等待 300ms');
  console.log('   3. 查看控制台是否有 [AutoCard] 日志');
})();
```

---

## 📝 收集调试信息

如果问题仍然存在,请运行以下脚本收集调试信息:

```javascript
(async function collectDebugInfo() {
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  const settings = plugin?.storage?.getSettings();
  
  const info = {
    pluginLoaded: !!plugin,
    wsServiceInitialized: !!plugin?.transactionWebSocketService,
    wsConnected: plugin?.transactionWebSocketService?.ws?.readyState === 1,
    handlersCount: plugin?.transactionWebSocketService?.handlers?.length || 0,
    handlerNames: plugin?.transactionWebSocketService?.handlers?.map(h => h.constructor.name) || [],
    configExists: !!settings,
    quickCardConfig: settings?.quickCard,
    siyuanVersion: window.siyuan.config.system.version,
    frontend: window.siyuan.config.system.container,
  };
  
  console.log('=== 调试信息 ===');
  console.log(JSON.stringify(info, null, 2));
  
  // 复制到剪贴板
  await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
  console.log('✅ 调试信息已复制到剪贴板');
})();
```

将输出的信息发送给开发者。

---

## 🎯 下一步

如果完成所有诊断步骤后问题仍然存在:

1. 收集调试信息 (使用上面的脚本)
2. 查看完整的控制台日志
3. 检查是否有 JavaScript 错误
4. 尝试重启思源笔记
5. 尝试重新构建插件: `npm run build`

---

**祝调试顺利!** 🔧
