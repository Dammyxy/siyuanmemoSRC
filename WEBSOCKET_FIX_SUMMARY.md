# WebSocket 实时同步修复总结

## 📋 问题描述

**症状**：WebSocket 监听器已注册（`wsListenerRegistered = true`），但在创建闪卡时没有触发任何事件。

**根本原因**：错误地使用了 `window.addEventListener('ws-main')` 来监听 WebSocket 事件，但思源并不会在 `window` 对象上广播这些事件。

---

## 🔍 关键发现

通过研究 SiReader 插件的源代码，发现了正确的实现方式：

### ❌ 错误的实现（V1）

```typescript
// 错误：监听 window 事件
window.addEventListener('ws-main', handleTransactions as EventListener);
```

**问题**：
- 思源不会在 `window` 对象上广播 WebSocket 事件
- 这种方式永远不会收到任何消息

### ✅ 正确的实现（V2）

```typescript
// 正确：创建 WebSocket 连接
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${location.host}/ws?app=siyuan-memo&type=main`;
this.ws = new WebSocket(wsUrl);

this.ws.onmessage = (e: MessageEvent) => {
  const msg = JSON.parse(e.data);
  if (msg.cmd !== 'transactions' || !Array.isArray(msg.data)) return;
  
  // 处理 transactions
  this.handleWebSocketTransactions(msg.data);
};
```

**关键点**：
1. 需要**主动创建 WebSocket 连接**到思源服务器
2. WebSocket URL 格式：`ws://localhost:6806/ws?app=插件名&type=main`
3. 消息格式：`{ cmd: 'transactions', data: [...] }`
4. `data` 是一个数组，每个元素是一个 transaction 对象

---

## 🔧 修复内容

### 1. 修改 WebSocket 连接方式

**文件**：`src/services/HybridSyncService.ts`

#### 修改前（错误）

```typescript
private wsListenerRegistered: boolean = false;

private registerWebSocketListener(): void {
  window.addEventListener('ws-main', handleTransactions as EventListener);
  this.wsListenerRegistered = true;
}
```

#### 修改后（正确）

```typescript
private ws: WebSocket | null = null;
private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
private wsListenerRegistered: boolean = false;

private registerWebSocketListener(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws?app=siyuan-memo&type=main`;
  
  this.ws = new WebSocket(wsUrl);
  
  this.ws.onopen = () => {
    this.wsListenerRegistered = true;
    console.log('[HybridSync] ✅ WebSocket connected successfully');
  };
  
  this.ws.onmessage = (e: MessageEvent) => {
    const msg = JSON.parse(e.data);
    if (msg.cmd !== 'transactions' || !Array.isArray(msg.data)) return;
    this.handleWebSocketTransactions(msg.data);
  };
  
  this.ws.onerror = (err) => {
    console.error('[HybridSync] ❌ WebSocket error:', err);
    this.wsListenerRegistered = false;
  };
  
  this.ws.onclose = (ev) => {
    this.wsListenerRegistered = false;
    this.ws = null;
    
    // 自动重连（除非是正常关闭）
    if (ev.code !== 1000 && !ev.reason.includes('close websocket')) {
      this.wsReconnectTimer = setTimeout(() => {
        this.registerWebSocketListener();
      }, 3000);
    }
  };
}
```

### 2. 修改事件处理方法

#### 修改前（CustomEvent）

```typescript
private handleWebSocketTransactions(e: CustomEvent): void {
  const { cmd, data } = e.detail;
  if (cmd !== 'transactions') return;
  
  const hasFlashcardOp = data?.doOperations?.some((op: any) => 
    op.action === 'addFlashcards' || 
    op.action === 'removeFlashcards' ||
    (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks'])
  );
  
  // ...
}
```

#### 修改后（transactions 数组）

```typescript
private handleWebSocketTransactions(transactions: any[]): void {
  let hasFlashcardOp = false;
  
  for (const tx of transactions) {
    if (!tx.doOperations) continue;
    
    for (const op of tx.doOperations) {
      if (op.action === 'addFlashcards' || 
          op.action === 'removeFlashcards' ||
          (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks'])) {
        hasFlashcardOp = true;
        break;
      }
    }
    
    if (hasFlashcardOp) break;
  }
  
  if (!hasFlashcardOp) return;
  
  // 防抖 300ms 后触发增量同步
  // ...
}
```

### 3. 修改清理逻辑

#### 修改前

```typescript
private unregisterWebSocketListener(): void {
  window.removeEventListener('ws-main', handleTransactions as EventListener);
  this.wsListenerRegistered = false;
}
```

#### 修改后

```typescript
private unregisterWebSocketListener(): void {
  if (this.ws) {
    this.ws.close(1000, 'close websocket');
    this.ws = null;
  }
  
  if (this.wsReconnectTimer) {
    clearTimeout(this.wsReconnectTimer);
    this.wsReconnectTimer = null;
  }
  
  this.wsListenerRegistered = false;
}
```

---

## 📊 消息格式对比

### SiReader 的消息格式（正确）

```javascript
{
  cmd: 'transactions',
  data: [
    {
      doOperations: [
        {
          action: 'updateAttrs',
          id: '20240214123456-abcdefg',
          data: {
            old: { ... },
            new: {
              'custom-riff-decks': '20240214123456-deckid'
            }
          }
        }
      ]
    }
  ]
}
```

### 我们之前错误的假设

```javascript
// 错误：假设 window 事件的格式
{
  detail: {
    cmd: 'transactions',
    data: {
      doOperations: [...]
    }
  }
}
```

---

## ✅ 修复验证

### 测试步骤

1. 重新编译插件
2. 重启思源笔记
3. 打开浏览器控制台（F12）
4. 查看初始化日志：

```
[HybridSync] 🔍 Creating WebSocket connection: ws://localhost:6806/ws?app=siyuan-memo&type=main
[HybridSync] ✅ WebSocket connected successfully
[HybridSync] 🔍 Waiting for transactions events...
```

5. 在思源中使用原生快速制卡
6. 应该看到：

```
[HybridSync] 🔍 WebSocket message received: { cmd: 'transactions', ... }
[HybridSync] 🔍 Processing transactions: { count: 1, ... }
[HybridSync] 🔔 Detected flashcard operation: { action: 'updateAttrs', ... }
[HybridSync] 🔔 Detected flashcard changes via WebSocket
[HybridSync] ⚡ Triggering incremental sync due to WebSocket event...
[HybridSync] Starting incremental sync...
[HybridSync] ✅ WebSocket-triggered sync completed
```

---

## 🎯 关键要点

### 1. WebSocket 连接方式

- ❌ 不要使用 `window.addEventListener('ws-main')`
- ✅ 使用 `new WebSocket(wsUrl)` 创建连接

### 2. 消息格式

- `msg.cmd` - 命令类型（'transactions'）
- `msg.data` - 数组，每个元素是一个 transaction
- `tx.doOperations` - 操作数组
- `op.action` - 操作类型（'addFlashcards', 'removeFlashcards', 'updateAttrs'）

### 3. 自动重连

- 监听 `onclose` 事件
- 非正常关闭时自动重连（3 秒后）
- 正常关闭（code 1000）不重连

### 4. 防抖机制

- 使用 300ms 防抖（借鉴 SiReader）
- 避免频繁触发同步

---

## 📚 参考资料

### SiReader 源代码

- 文件：`siyuan-sireader/src/components/deck/siyuan-card.ts`
- 关键方法：`enableAutoSync()`
- WebSocket URL：`ws://localhost:6806/ws?app=siyuan-sireader&type=main`

### 思源 WebSocket API

- 端点：`/ws?app=<插件名>&type=main`
- 协议：`ws://` 或 `wss://`（HTTPS）
- 消息格式：JSON
- 命令类型：`transactions`, `reload`, `unmount` 等

---

## 🚀 后续优化

### 1. 错误处理

- 添加连接失败重试次数限制
- 添加连接状态指示器

### 2. 性能优化

- 批量处理多个 transactions
- 优化防抖延迟

### 3. 用户体验

- 显示 WebSocket 连接状态
- 提供手动重连按钮

---

**修复完成时间**：2026-02-14  
**修复人员**：Kiro AI Assistant  
**参考来源**：SiReader 插件源代码  
**关键发现**：需要主动创建 WebSocket 连接，而不是监听 window 事件
