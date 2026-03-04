# WebSocket 实时同步实现

## 📋 概述

**实现日期**：2026-02-14  
**借鉴来源**：SiReader 插件的 WebSocket 监听机制  
**实现目标**：为 SRS 浏览器添加实时同步功能，自动感知思源原生快速制卡操作

---

## 🎯 实现目标

### 问题回顾

使用思源原生快速制卡后，打开 SRS 浏览器没有自动获取新卡片，需要手动点击"全量同步"按钮。

### 解决方案

借鉴 SiReader 的 WebSocket 监听机制，在浏览器运行时实时监听思源的 `transactions` 事件，自动触发增量同步。

---

## 🏗️ 实现架构

### 三层同步机制

```
┌─────────────────────────────────────────────────────────┐
│                  1. 初始加载（全量同步）                 │
│  - 浏览器打开时触发                                      │
│  - 确保数据完整性                                        │
│  - 获取所有卡片                                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              2. 运行时监听（WebSocket + 增量同步）       │
│  - 监听 ws-main 事件                                     │
│  - 检测闪卡操作（addFlashcards/removeFlashcards）       │
│  - 300ms 防抖                                            │
│  - 触发增量同步                                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  3. 手动刷新（全量同步）                 │
│  - 用户点击刷新按钮                                      │
│  - 兜底方案                                              │
│  - 确保数据一致性                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 💻 核心实现

### 1. WebSocket 监听器

```typescript
// 🆕 WebSocket 监听（借鉴 SiReader）
// 监听思源的 transactions 事件，实时感知闪卡变化
let wsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const handleWebSocketTransactions = (e: CustomEvent) => {
  const { cmd, data } = e.detail;
  if (cmd !== 'transactions') return;
  
  // 检查是否有闪卡相关操作
  const hasFlashcardOp = data?.doOperations?.some((op: any) => 
    op.action === 'addFlashcards' || 
    op.action === 'removeFlashcards' ||
    (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks'])
  );
  
  if (!hasFlashcardOp) return;
  
  console.log('[SRSBrowser] 🔔 Detected flashcard changes via WebSocket');
  
  // 防抖 300ms（借鉴 SiReader）
  if (wsDebounceTimer) clearTimeout(wsDebounceTimer);
  wsDebounceTimer = setTimeout(() => {
    const plugin = props.plugin as any;
    if (plugin?.hybridSyncService) {
      console.log('[SRSBrowser] ⚡ Triggering incremental sync due to WebSocket event...');
      
      // 触发增量同步
      void plugin.hybridSyncService.incrementalSync()
        .then(() => {
          console.log('[SRSBrowser] ✅ WebSocket-triggered sync completed, reloading data...');
          return loadData(true); // 强制刷新缓存
        })
        .catch((err: Error) => {
          console.error('[SRSBrowser] ❌ WebSocket-triggered sync failed:', err);
          // 同步失败也刷新数据（使用缓存）
          void loadData();
        });
    } else {
      // 如果没有同步服务，直接刷新数据
      console.log('[SRSBrowser] ⚡ Reloading data due to WebSocket event (no sync service)...');
      void loadData(true);
    }
  }, 300);
};
```

### 2. 注册和清理

```typescript
// 注册 WebSocket 监听器
window.addEventListener('ws-main', handleWebSocketTransactions as EventListener);
console.log('[SRSBrowser] ✅ WebSocket listener registered');

// 清理函数中移除监听器
onBeforeUnmount(() => {
  window.removeEventListener('ws-main', handleWebSocketTransactions as EventListener);
  if (wsDebounceTimer) clearTimeout(wsDebounceTimer);
  console.log('[SRSBrowser] WebSocket listener removed');
});
```

---

## 🔍 监听的操作类型

### 1. addFlashcards

```typescript
{
  action: 'addFlashcards',
  blockIDs: ['block-id-1', 'block-id-2'],
  deckID: '20230218211946-2kw8jgx'
}
```

**触发场景**：
- 用户在思源块菜单点击"快速制卡"
- 用户通过 API 调用 `addRiffCards`

### 2. removeFlashcards

```typescript
{
  action: 'removeFlashcards',
  blockIDs: ['block-id-1', 'block-id-2'],
  deckID: '20230218211946-2kw8jgx'
}
```

**触发场景**：
- 用户在思源中删除闪卡
- 用户通过 API 调用 `removeRiffCards`

### 3. updateAttrs (custom-riff-decks)

```typescript
{
  action: 'updateAttrs',
  id: 'block-id',
  data: {
    new: {
      'custom-riff-decks': 'deck-id-1,deck-id-2'
    }
  }
}
```

**触发场景**：
- 用户修改块的 `custom-riff-decks` 属性
- 卡片被添加到自定义卡组

---

## ⚡ 防抖机制

### 为什么需要防抖？

1. **批量操作**：用户可能一次性添加多张卡片
2. **性能优化**：避免频繁触发同步和 UI 刷新
3. **网络优化**：减少 API 调用次数

### 防抖参数

```typescript
const DEBOUNCE_DELAY = 300; // 300ms（借鉴 SiReader）
```

### 防抖逻辑

```typescript
// 清除之前的定时器
if (wsDebounceTimer) clearTimeout(wsDebounceTimer);

// 设置新的定时器
wsDebounceTimer = setTimeout(() => {
  // 执行同步操作
}, 300);
```

---

## 🔄 同步流程

### 场景 1：用户使用思源原生快速制卡

```
1. 用户在思源块菜单点击"快速制卡"
   ↓
2. 思源调用 addRiffCards API
   ↓
3. 思源更新 Riff 数据库
   ↓
4. 思源通过 WebSocket 广播 transactions 事件
   ↓
5. SRS 浏览器监听到 addFlashcards 操作
   ↓
6. 防抖 300ms
   ↓
7. 触发 HybridSyncService.incrementalSync()
   ↓
8. 从 Riff 获取新卡片
   ↓
9. 添加到本地存储
   ↓
10. 刷新 UI（loadData(true)）
   ↓
11. 用户看到新卡片 ✅
```

### 场景 2：用户在思源中删除闪卡

```
1. 用户在思源中删除闪卡
   ↓
2. 思源调用 removeRiffCards API
   ↓
3. 思源更新 Riff 数据库
   ↓
4. 思源通过 WebSocket 广播 transactions 事件
   ↓
5. SRS 浏览器监听到 removeFlashcards 操作
   ↓
6. 防抖 300ms
   ↓
7. 触发 HybridSyncService.incrementalSync()
   ↓
8. 检测到卡片被删除
   ↓
9. 从本地存储删除
   ↓
10. 刷新 UI（loadData(true)）
   ↓
11. 用户看到卡片消失 ✅
```

---

## 🆚 与 SiReader 的对比

### 相同点

| 特性 | SiReader | 我们的实现 |
|------|----------|-----------|
| **WebSocket 监听** | ✅ | ✅ |
| **防抖机制** | ✅ (300ms) | ✅ (300ms) |
| **监听操作类型** | addFlashcards, removeFlashcards, updateAttrs | 相同 |
| **实时性** | 高 | 高 |

### 不同点

| 特性 | SiReader | 我们的实现 |
|------|----------|-----------|
| **触发动作** | 通知 UI 刷新 | 触发增量同步 + 刷新 UI |
| **数据源** | 直接调用 Riff API | 同步到本地存储 + 刷新 UI |
| **离线支持** | ❌ | ✅ |
| **复杂度** | 低 | 中 |

---

## 📊 性能优化

### 1. 防抖优化

```typescript
// 300ms 防抖，避免频繁触发
setTimeout(() => {
  // 执行同步
}, 300);
```

**效果**：
- 批量操作只触发一次同步
- 减少 API 调用次数
- 降低 CPU 使用率

### 2. 增量同步

```typescript
// 只同步新卡片，不是全量同步
await plugin.hybridSyncService.incrementalSync();
```

**效果**：
- 同步速度快（只获取新卡片）
- 网络流量小
- 用户体验好

### 3. 错误处理

```typescript
.catch((err: Error) => {
  console.error('[SRSBrowser] ❌ WebSocket-triggered sync failed:', err);
  // 同步失败也刷新数据（使用缓存）
  void loadData();
});
```

**效果**：
- 同步失败不影响 UI 显示
- 降级到缓存数据
- 提高可靠性

---

## 🧪 测试场景

### 测试 1：思源原生快速制卡

**步骤**：
1. 打开 SRS 浏览器
2. 在思源块菜单点击"快速制卡"
3. 观察浏览器是否自动刷新

**预期结果**：
- ✅ 控制台输出：`[SRSBrowser] 🔔 Detected flashcard changes via WebSocket`
- ✅ 控制台输出：`[SRSBrowser] ⚡ Triggering incremental sync due to WebSocket event...`
- ✅ 300ms 后自动刷新
- ✅ 新卡片自动显示

### 测试 2：批量添加卡片

**步骤**：
1. 打开 SRS 浏览器
2. 在思源中快速连续添加 5 张卡片
3. 观察浏览器刷新次数

**预期结果**：
- ✅ 只触发一次同步（防抖生效）
- ✅ 所有 5 张卡片都显示

### 测试 3：删除卡片

**步骤**：
1. 打开 SRS 浏览器
2. 在思源中删除一张闪卡
3. 观察浏览器是否自动刷新

**预期结果**：
- ✅ 控制台输出：`[SRSBrowser] 🔔 Detected flashcard changes via WebSocket`
- ✅ 300ms 后自动刷新
- ✅ 卡片自动消失

### 测试 4：同步失败降级

**步骤**：
1. 打开 SRS 浏览器
2. 断开网络
3. 在思源中添加卡片
4. 观察浏览器行为

**预期结果**：
- ✅ 控制台输出：`[SRSBrowser] ❌ WebSocket-triggered sync failed`
- ✅ 降级到缓存数据
- ✅ UI 不崩溃

---

## 🎯 优势

### 1. 实时性

- ✅ 无需手动刷新
- ✅ 自动感知变化
- ✅ 用户体验好

### 2. 性能

- ✅ 防抖机制（300ms）
- ✅ 增量同步（只获取新卡片）
- ✅ 批量处理

### 3. 可靠性

- ✅ 错误处理
- ✅ 降级方案
- ✅ 不影响现有功能

### 4. 兼容性

- ✅ 保留全量同步（初始加载）
- ✅ 保留手动刷新（兜底）
- ✅ 向后兼容

---

## 🔧 配置

### 启用条件

WebSocket 监听**始终启用**，无需配置。

### 同步服务

如果 `HybridSyncService` 可用：
- ✅ 触发增量同步
- ✅ 同步到本地存储

如果 `HybridSyncService` 不可用：
- ✅ 直接刷新数据（使用缓存）
- ✅ 降级方案

---

## 📝 日志输出

### 正常流程

```
[SRSBrowser] ✅ WebSocket listener registered
[SRSBrowser] 🔔 Detected flashcard changes via WebSocket
[SRSBrowser] ⚡ Triggering incremental sync due to WebSocket event...
[HybridSync] Starting incremental sync...
[HybridSync] Fetched 1 new cards from Riff
[SRSBrowser] ✅ WebSocket-triggered sync completed, reloading data...
```

### 错误流程

```
[SRSBrowser] ✅ WebSocket listener registered
[SRSBrowser] 🔔 Detected flashcard changes via WebSocket
[SRSBrowser] ⚡ Triggering incremental sync due to WebSocket event...
[HybridSync] Starting incremental sync...
[HybridSync] ❌ Sync failed: Network error
[SRSBrowser] ❌ WebSocket-triggered sync failed: Error: Network error
[SRSBrowser] ⚡ Reloading data due to WebSocket event (fallback)...
```

---

## 🚀 未来优化

### 1. 智能防抖

根据操作类型调整防抖时间：
- 单个操作：100ms
- 批量操作：300ms
- 大量操作：500ms

### 2. 增量 UI 更新

不刷新整个列表，只更新变化的卡片：
- 新增卡片：插入到列表
- 删除卡片：从列表移除
- 更新卡片：更新对应行

### 3. 离线队列

离线时缓存 WebSocket 事件，联网后批量处理。

---

## 📚 参考资料

### SiReader 实现

- 文件：`siyuan-sireader/src/components/deck/siyuan-card.ts`
- 防抖时间：300ms
- 监听事件：`ws-main`

### 思源 WebSocket API

- 事件名称：`ws-main`
- 命令类型：`transactions`
- 操作类型：`addFlashcards`, `removeFlashcards`, `updateAttrs`

---

## ✅ 实现总结

### 已完成

1. ✅ 添加 WebSocket 监听器
2. ✅ 实现 300ms 防抖机制
3. ✅ 监听闪卡相关操作
4. ✅ 触发增量同步
5. ✅ 错误处理和降级
6. ✅ 清理函数

### 效果

- ✅ 实时感知思源原生快速制卡
- ✅ 自动触发增量同步
- ✅ 无需手动刷新
- ✅ 用户体验显著提升

### 兼容性

- ✅ 保留全量同步（初始加载）
- ✅ 保留手动刷新（兜底）
- ✅ 不影响现有功能
- ✅ 向后兼容

---

**实现完成时间**：2026-02-14  
**实现人员**：Kiro AI Assistant  
**借鉴来源**：SiReader 插件
