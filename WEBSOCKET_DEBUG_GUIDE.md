# WebSocket 监听器调试指南

## 📋 问题描述

WebSocket 监听器已注册（`wsListenerRegistered = true`），但在创建闪卡时没有触发事件。

---

## 🔍 调试步骤

### 步骤 1：验证监听器是否注册

1. 打开思源笔记
2. 打开浏览器控制台（F12）
3. 查找日志：

```
[HybridSync] ✅ WebSocket listener registered
[HybridSync] 🔍 Waiting for WebSocket events...
[HybridSync] 🔍 Please create a flashcard now to test
```

如果看到这些日志，说明监听器已成功注册。

---

### 步骤 2：测试 WebSocket 事件

1. 在思源中使用**原生快速制卡**功能：
   - 选中一个块
   - 右键菜单 → 闪卡 → 快速制卡
   
2. 观察控制台日志，应该看到以下几种情况之一：

#### 情况 A：收到全局事件（正常）

```
[HybridSync] 🔍 Global event captured: { type: 'ws-main', ... }
[HybridSync] 🔍 Raw WebSocket event: { ... }
[HybridSync] 🔍 WebSocket event received: { cmd: 'transactions', ... }
```

**说明**：监听器工作正常，继续步骤 3。

#### 情况 B：没有任何日志（异常）

**可能原因**：
1. WebSocket 事件名称不是 `ws-main`
2. 思源版本不支持 WebSocket 事件
3. 监听器注册时机不对

**解决方案**：查看步骤 3 的备选方案。

---

### 步骤 3：检查事件结构

如果收到了 WebSocket 事件，查看日志中的事件结构：

```javascript
[HybridSync] 🔍 Transactions event: {
  hasDoOperations: true,
  operationsCount: 1,
  operations: [
    {
      action: 'updateAttrs',  // ← 关键：操作类型
      id: '20240214123456-abcdefg',
      hasData: true,
      dataKeys: ['old', 'new'],
      hasNew: true,
      newKeys: ['custom-riff-decks'],  // ← 关键：是否有 custom-riff-decks
      hasCustomRiffDecks: true,
      customRiffDecksValue: '20240214123456-deckid'
    }
  ],
  allActions: ['updateAttrs']  // ← 关键：所有操作类型
}
```

#### 检查点 1：`action` 字段

预期值：
- `addFlashcards` - 添加闪卡
- `removeFlashcards` - 移除闪卡
- `updateAttrs` - 更新属性（配合 `custom-riff-decks`）

如果实际值不同，需要更新检测逻辑。

#### 检查点 2：`custom-riff-decks` 属性

对于 `updateAttrs` 操作，必须包含 `custom-riff-decks` 属性才会触发同步。

如果没有这个属性，说明：
1. 思源使用了不同的属性名
2. 需要监听其他操作类型

---

### 步骤 4：验证同步触发

如果检测到闪卡操作，应该看到：

```
[HybridSync] 🔔 Detected flashcard changes via WebSocket
[HybridSync] ⚡ Triggering incremental sync due to WebSocket event...
[HybridSync] Starting incremental sync...
[HybridSync] Fetched X new cards from Riff
[HybridSync] ✅ WebSocket-triggered sync completed: { ... }
```

如果没有看到这些日志，检查：
1. `hasFlashcardOp` 是否为 `true`
2. 防抖定时器是否正常工作

---

## 🔧 常见问题和解决方案

### 问题 1：没有收到任何 WebSocket 事件

**可能原因**：
1. 思源版本太旧，不支持 WebSocket 事件
2. WebSocket 事件名称不是 `ws-main`

**解决方案**：

#### 方案 A：检查思源版本

确保思源版本 >= 2.8.0（支持 WebSocket 事件）。

#### 方案 B：尝试其他事件名称

修改 `HybridSyncService.ts`：

```typescript
// 尝试不同的事件名称
window.addEventListener('ws', handleTransactions as EventListener);
// 或
window.addEventListener('websocket', handleTransactions as EventListener);
```

#### 方案 C：使用轮询代替 WebSocket

如果 WebSocket 不可用，可以使用定时轮询：

```typescript
// 每 5 秒检查一次新卡片
setInterval(() => {
  void this.incrementalSync();
}, 5000);
```

---

### 问题 2：收到事件但 `action` 不匹配

**症状**：
```
[HybridSync] 🔍 Has flashcard operation: false
[HybridSync] 🔍 No flashcard operation detected, skipping sync
```

**解决方案**：

查看 `allActions` 日志，找到实际的操作类型，然后更新检测逻辑：

```typescript
const hasFlashcardOp = data?.doOperations?.some((op: any) => 
    op.action === 'addFlashcards' || 
    op.action === 'removeFlashcards' ||
    op.action === 'updateAttrs' ||  // ← 移除 custom-riff-decks 检查
    op.action === '实际的操作类型'   // ← 添加实际的操作类型
);
```

---

### 问题 3：检测到操作但同步失败

**症状**：
```
[HybridSync] 🔔 Detected flashcard changes via WebSocket
[HybridSync] ⚡ Triggering incremental sync due to WebSocket event...
[HybridSync] ❌ WebSocket-triggered sync failed: Error: ...
```

**解决方案**：

查看错误信息，可能的原因：
1. Riff API 调用失败
2. 网络错误
3. 权限问题

检查 `incrementalSync()` 方法的日志。

---

## 🧪 手动测试脚本

如果需要手动触发 WebSocket 事件进行测试，可以在控制台运行：

```javascript
// 模拟 WebSocket 事件
const event = new CustomEvent('ws-main', {
  detail: {
    cmd: 'transactions',
    data: {
      doOperations: [
        {
          action: 'updateAttrs',
          id: '20240214123456-test',
          data: {
            new: {
              'custom-riff-decks': '20240214123456-deckid'
            }
          }
        }
      ]
    }
  }
});

window.dispatchEvent(event);
```

如果这个脚本能触发同步，说明监听器工作正常，问题在于思源没有广播事件。

---

## 📊 诊断检查清单

- [ ] 监听器已注册（`wsListenerRegistered = true`）
- [ ] 收到全局事件（`Global event captured`）
- [ ] 收到 `transactions` 事件
- [ ] `doOperations` 不为空
- [ ] `action` 字段匹配预期值
- [ ] `custom-riff-decks` 属性存在（对于 `updateAttrs`）
- [ ] 检测到闪卡操作（`hasFlashcardOp = true`）
- [ ] 触发增量同步
- [ ] 同步成功完成

---

## 🎯 下一步行动

根据调试结果，选择对应的解决方案：

### 如果没有收到任何事件

→ 使用**轮询方案**代替 WebSocket

### 如果收到事件但 `action` 不匹配

→ 更新**检测逻辑**以匹配实际的操作类型

### 如果检测到操作但同步失败

→ 检查 **Riff API** 调用和错误日志

---

## 📝 反馈信息

请在控制台运行以下命令，并将输出发送给开发者：

```javascript
// 检查监听器状态
console.log('wsListenerRegistered:', window.siyuanMemoPlugin?.hybridSyncService?.wsListenerRegistered);

// 检查思源版本
console.log('SiYuan version:', window.siyuan?.config?.system?.version);

// 手动触发测试事件
const testEvent = new CustomEvent('ws-main', {
  detail: {
    cmd: 'transactions',
    data: {
      doOperations: [
        {
          action: 'updateAttrs',
          id: 'test-block-id',
          data: {
            new: {
              'custom-riff-decks': 'test-deck-id'
            }
          }
        }
      ]
    }
  }
});
window.dispatchEvent(testEvent);
```

---

**调试完成时间**：2026-02-14  
**文档版本**：V1.0  
**作者**：Kiro AI Assistant
