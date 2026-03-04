# SiReader Riff 同步方案调研报告

## 📋 调研概述

**调研对象**：siyuan-sireader 插件（思阅）  
**GitHub 仓库**：本地 `siyuan-sireader` 目录  
**调研重点**：思源闪卡（Riff）数据同步机制  
**调研日期**：2026-02-14  
**调研人员**：Kiro AI Assistant

---

## 🎯 核心发现

经过代码分析，**SiReader 并没有实现独立的 Riff 数据同步机制**。它采用的是**直接调用思源 Riff API** 的方式，与我们的插件类似。

### 关键特点

1. **直接使用 Riff API**：所有闪卡操作都通过思源的 `/api/riff/*` 接口
2. **WebSocket 监听**：监听思源的 `transactions` 事件来感知数据变化
3. **防抖机制**：使用 300ms 防抖避免频繁同步
4. **自定义属性**：使用 `custom-riff-decks` 属性标记卡片所属卡组

---

## 🏗️ 架构设计

### 1. 数据流架构

```
┌─────────────────────────────────────────────────────────┐
│                    思源 Riff 数据库                      │
│  - 卡片内容（blocks 表）                                 │
│  - 卡片属性（attributes 表：custom-riff-decks）         │
│  - 学习进度（Riff 内部 FSRS 数据）                      │
└─────────────────────────────────────────────────────────┘
                            ↕
                    直接调用 Riff API
                            ↕
┌─────────────────────────────────────────────────────────┐
│                  SiReader 插件逻辑                       │
│  - 监听 WebSocket transactions 事件                     │
│  - 调用 Riff API 获取/更新卡片                          │
│  - 本地缓存卡组列表和统计信息                           │
└─────────────────────────────────────────────────────────┘
```

**关键点**：
- SiReader **不维护独立的学习进度数据库**
- 所有学习进度都存储在思源 Riff 系统中
- 插件只是 Riff API 的消费者，不是数据源

---

## 📡 WebSocket 监听机制

### 核心代码：`src/components/deck/siyuan-card.ts`

```typescript
// 监听思源 transactions 事件
window.addEventListener('ws-main', (e: CustomEvent) => {
  const { cmd, data } = e.detail
  if (cmd !== 'transactions') return
  
  // 防抖处理（300ms）
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    processPendingChanges()
  }, 300)
})
```

### 监听的操作类型

1. **updateAttrs**：卡片属性更新（`custom-riff-decks` 变化）
2. **removeFlashcards**：卡片删除
3. **update**：块内容更新

### 处理逻辑

```typescript
// 收集变更
for (const op of tx.doOperations) {
  if (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks']) {
    // 卡片添加到卡组
    adds.push({ id: op.id, deckIds: op.data.new['custom-riff-decks'] })
  } else if (op.action === 'removeFlashcards') {
    // 卡片从卡组移除
    removes.push(...(op.blockIDs || op.ids || []))
  }
}

// 批量处理（防抖后）
await Promise.all([
  ...adds.map(({ id, deckIds }) => 
    // 通知 UI 更新
    notifyDeckChange(deckIds)
  ),
  ...removes.map(id => 
    // 通知 UI 更新
    notifyCardRemoved(id)
  )
])
```

---

## 🔌 Riff API 使用方式

### 1. 获取卡组列表

```typescript
// src/api.ts
export async function getRiffDecks(): Promise<IRiffDeck[]> {
  return request("/api/riff/getRiffDecks", {});
}
```

### 2. 获取卡组中的卡片

```typescript
// 方式 1：通过卡组 ID 获取（分页）
export async function getRiffCards(
  deckID: string,
  page: number = 1,
  pageSize: number = 20
): Promise<IRiffCardsResult> {
  return request("/api/riff/getRiffCards", { id: deckID, page, pageSize });
}

// 方式 2：通过块 ID 批量获取（推荐）
export async function getRiffCardsByBlockIDs(blockIDs: string[]): Promise<{ blocks: any[] }> {
  return request("/api/riff/getRiffCardsByBlockIDs", { blockIDs });
}
```

### 3. 获取到期卡片

```typescript
// src/components/deck/stat.ts
export const getDueCard = (deckID: string, reviewedCards: { cardID: string }[] = []) =>
  fetchSyncPost('/api/riff/getRiffDueCards', { deckID, reviewedCards })
```

### 4. 复习卡片

```typescript
export const reviewRiffCard = (deckID: string, cardID: string, rating: Rating) =>
  fetchSyncPost('/api/riff/reviewRiffCard', { deckID, cardID, rating })
```

### 5. 跳过卡片

```typescript
export const skipRiffCard = (deckID: string, cardID: string) =>
  fetchSyncPost('/api/riff/skipReviewRiffCard', { deckID, cardID })
```

---

## 🔄 同步流程分析

### 场景 1：用户在思源中使用快速制卡

```
1. 用户在思源块菜单点击"快速制卡"
   ↓
2. 思源调用 addRiffCards API
   ↓
3. 思源更新 attributes 表（custom-riff-decks）
   ↓
4. 思源通过 WebSocket 广播 transactions 事件
   ↓
5. SiReader 监听到 updateAttrs 操作
   ↓
6. SiReader 防抖 300ms 后处理
   ↓
7. SiReader 通知 UI 刷新卡组统计
```

### 场景 2：用户在 SiReader 中复习卡片

```
1. 用户在 SiReader 中点击评分按钮
   ↓
2. SiReader 调用 reviewRiffCard API
   ↓
3. 思源 Riff 更新学习进度（FSRS 算法）
   ↓
4. 思源返回更新后的卡片状态
   ↓
5. SiReader 更新 UI 显示
```

**关键点**：
- SiReader **不需要主动同步学习进度**
- 所有学习进度都由思源 Riff 系统管理
- SiReader 只需要在需要时调用 API 获取最新数据

---

## 🆚 与我们插件的对比

### 相同点

1. **都使用 Riff API**：通过 `/api/riff/*` 接口操作卡片
2. **都监听 WebSocket**：感知数据变化
3. **都使用防抖**：避免频繁同步

### 不同点

| 特性 | SiReader | 我们的插件 |
|------|----------|-----------|
| **数据存储** | 完全依赖 Riff | 本地 + Riff 双存储 |
| **学习进度** | 存储在 Riff | 本地 + Riff 双存储 |
| **同步机制** | 被动监听 WebSocket | 主动增量/全量同步 |
| **离线支持** | 不支持 | 支持（本地数据） |
| **数据一致性** | 始终与 Riff 一致 | 需要同步保证一致性 |
| **复杂度** | 简单 | 复杂 |

---

## 💡 关键启示

### 1. SiReader 的简化策略

SiReader 采用了**最简单的方案**：
- ✅ 不维护独立的学习进度数据库
- ✅ 不实现复杂的同步逻辑
- ✅ 完全信任思源 Riff 系统
- ✅ 只在需要时调用 API 获取数据

**优点**：
- 代码简单，易于维护
- 不会出现数据不一致问题
- 不需要处理同步冲突

**缺点**：
- 不支持离线使用
- 每次操作都需要网络请求
- 无法实现自定义的学习算法

### 2. 我们插件的复杂性来源

我们的插件之所以复杂，是因为：
1. **双存储架构**：本地 + Riff 双存储
2. **自定义算法**：支持多种调度器（FSRS、Neural、Incremental Learning）
3. **离线支持**：需要本地数据库
4. **数据同步**：需要保证本地和 Riff 的一致性

### 3. 对我们问题的启示

**问题回顾**：使用思源原生快速制卡后，打开 SRS 浏览器没有自动获取新卡片

**SiReader 的处理方式**：
1. 监听 WebSocket `transactions` 事件
2. 检测到 `updateAttrs` 操作（`custom-riff-decks` 变化）
3. 防抖 300ms 后刷新 UI

**我们可以借鉴的点**：
- ✅ 使用 WebSocket 监听代替轮询
- ✅ 使用防抖机制避免频繁刷新
- ✅ 只在需要时调用 Riff API 获取最新数据

---

## 🔧 建议的改进方案

### 方案 1：借鉴 SiReader 的 WebSocket 监听（推荐）

```typescript
// 在 SRSBrowser.vue 中添加 WebSocket 监听
onMounted(() => {
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  
  const handleTransactions = (e: CustomEvent) => {
    const { cmd, data } = e.detail;
    if (cmd !== 'transactions') return;
    
    // 检查是否有闪卡相关操作
    const hasFlashcardOp = data.doOperations?.some((op: any) => 
      op.action === 'addFlashcards' || 
      op.action === 'removeFlashcards' ||
      (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks'])
    );
    
    if (!hasFlashcardOp) return;
    
    // 防抖刷新
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      console.log('[SRSBrowser] Detected flashcard changes, refreshing...');
      void loadData(true); // 强制刷新
    }, 300);
  };
  
  window.addEventListener('ws-main', handleTransactions);
  
  onBeforeUnmount(() => {
    window.removeEventListener('ws-main', handleTransactions);
    if (syncTimer) clearTimeout(syncTimer);
  });
});
```

### 方案 2：保持现有的全量同步方案

我们已经实现的方案：
- 浏览器打开时触发全量同步
- 同步完成后重新加载数据

**优点**：
- 简单可靠
- 确保数据完整性

**缺点**：
- 每次打开都要全量同步（较慢）
- 无法实时感知变化

### 方案 3：混合方案（最佳）

结合两种方案的优点：
1. **浏览器打开时**：触发增量同步（快速）
2. **运行时**：监听 WebSocket 事件（实时）
3. **手动刷新**：提供全量同步按钮（兜底）

```typescript
onMounted(() => {
  // 1. 初始加载：增量同步
  if (plugin?.hybridSyncService) {
    void plugin.hybridSyncService.incrementalSync()
      .then(() => loadData(true))
      .catch(() => loadData()); // 失败也加载
  } else {
    loadData();
  }
  
  // 2. 运行时：WebSocket 监听
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const handleTransactions = (e: CustomEvent) => {
    // ... 同方案 1
  };
  window.addEventListener('ws-main', handleTransactions);
  
  onBeforeUnmount(() => {
    window.removeEventListener('ws-main', handleTransactions);
    if (syncTimer) clearTimeout(syncTimer);
  });
});
```

---

## 📊 性能对比

| 方案 | 初始加载时间 | 实时性 | 复杂度 | 可靠性 |
|------|-------------|--------|--------|--------|
| **SiReader 方式**<br/>（WebSocket 监听） | 快（无同步） | 高（实时） | 低 | 高 |
| **我们现有方式**<br/>（全量同步） | 慢（全量同步） | 低（手动刷新） | 中 | 高 |
| **混合方案**<br/>（增量同步 + WebSocket） | 中（增量同步） | 高（实时） | 高 | 高 |

---

## 🎯 结论

### 核心发现

1. **SiReader 不实现独立同步**：完全依赖思源 Riff API
2. **WebSocket 是关键**：实时感知数据变化的最佳方式
3. **防抖是必要的**：避免频繁刷新导致性能问题

### 对我们的建议

**短期方案**（已实现）：
- ✅ 浏览器打开时触发全量同步
- ✅ 确保数据完整性

**长期优化**：
- 🔄 添加 WebSocket 监听（实时感知变化）
- 🔄 改为增量同步（提升速度）
- 🔄 添加防抖机制（优化性能）

### 最终建议

**推荐使用混合方案**：
1. 初始加载使用增量同步（快速）
2. 运行时使用 WebSocket 监听（实时）
3. 保留全量同步按钮（兜底）

这样可以兼顾**速度、实时性和可靠性**。

---

## 📚 参考资料

### SiReader 相关文件

- `src/api.ts` - Riff API 封装
- `src/components/deck/siyuan-card.ts` - WebSocket 监听和同步逻辑
- `src/components/deck/stat.ts` - 卡片统计和复习逻辑

### 思源 Riff API 文档

- `/api/riff/getRiffDecks` - 获取卡组列表
- `/api/riff/getRiffCards` - 获取卡组中的卡片
- `/api/riff/getRiffCardsByBlockIDs` - 批量获取卡片信息
- `/api/riff/getRiffDueCards` - 获取到期卡片
- `/api/riff/reviewRiffCard` - 复习卡片
- `/api/riff/addRiffCards` - 添加卡片到卡组
- `/api/riff/removeRiffCards` - 从卡组移除卡片

---

**调研完成时间**：2026-02-14  
**调研人员**：Kiro AI Assistant


---

## 🔍 深度对比：SiReader vs 我们的插件

### 架构层面的根本差异

#### SiReader 的架构

```
用户操作
   ↓
SiReader UI
   ↓
直接调用 Riff API (/api/riff/*)
   ↓
思源 Riff 系统（唯一数据源）
```

**特点**：
- 单一数据源（Riff）
- 无本地存储
- 无同步逻辑
- 完全依赖 Riff API

#### 我们插件的架构

```
用户操作
   ↓
插件 UI
   ↓
UnifiedDataSourceManager（统一数据源管理器）
   ↓
AdvancedDataRouter（高级模式路由器）
   ↓
StorageManager（本地存储管理器）
   ↕ ← HybridSyncService（混合同步服务）
思源 Riff 系统
```

**特点**：
- 双数据源（本地 + Riff）
- 复杂的同步逻辑
- 支持离线使用
- 自定义调度算法

---

### 数据存储对比

| 维度 | SiReader | 我们的插件 |
|------|----------|-----------|
| **主数据源** | 思源 Riff | 本地 StorageManager |
| **学习进度** | Riff FSRS | 本地 + Riff 双存储 |
| **卡片内容** | 思源 blocks 表 | 本地缓存 + 思源 blocks |
| **卡片属性** | 思源 attributes 表 | 本地 + 思源 attributes |
| **离线支持** | ❌ 不支持 | ✅ 完全支持 |
| **数据持久化** | 依赖思源 | 独立 IndexedDB/LocalStorage |

---

### 同步机制对比

#### SiReader 的"同步"

```typescript
// SiReader 没有真正的同步，只有实时监听
window.addEventListener('ws-main', (e: CustomEvent) => {
  const { cmd, data } = e.detail;
  if (cmd !== 'transactions') return;
  
  // 检测到变化 → 通知 UI 刷新
  // 不需要同步数据，因为数据都在 Riff
  notifyUIRefresh();
});
```

**流程**：
1. 监听 WebSocket `transactions` 事件
2. 检测到闪卡相关操作
3. 通知 UI 刷新
4. UI 重新调用 Riff API 获取最新数据

**特点**：
- ✅ 简单直接
- ✅ 实时性好
- ✅ 无数据一致性问题
- ❌ 每次都要网络请求
- ❌ 不支持离线

#### 我们插件的同步

```typescript
// HybridSyncService - 复杂的双向同步
export class HybridSyncService {
  // 增量同步：获取 Riff 新卡片 → 添加到本地
  async incrementalSync(): Promise<SyncResult> {
    // 1. 从 Riff 获取新卡片（since lastSyncTime）
    const newCards = await getRiffNewCards(deckId, lastSyncTime);
    
    // 2. 过滤黑名单
    const filtered = newCards.filter(card => !blacklist.has(card.id));
    
    // 3. 添加到本地存储
    for (const card of filtered) {
      if (!storage.getCard(card.id)) {
        await storage.addCard(convertToFSRSCard(card));
      }
    }
    
    // 4. 更新 lastSyncTime
    this.lastSyncTime = Date.now();
  }
  
  // 全量同步：双向检测删除 + 清理黑名单
  async fullSync(): Promise<SyncResult> {
    // 1. 获取 Riff 所有卡片
    const riffCards = await getRiffCards(deckId);
    
    // 2. 获取本地所有卡片
    const localCards = storage.getAllCards();
    
    // 3. 检测双向删除
    // Riff 删除 → 本地删除
    // 本地删除 → Riff 删除
    
    // 4. 清理黑名单
    // 5. 同步新卡片
  }
}
```

**流程**：
1. **增量同步**（日常）：
   - 从 Riff 获取新卡片（since lastSyncTime）
   - 过滤黑名单
   - 添加到本地存储
   - 自动检测卡片类型（Topic/Item）
   
2. **全量同步**（定期）：
   - 获取 Riff 和本地的所有卡片
   - 检测双向删除
   - 清理黑名单
   - 同步新卡片

3. **删除同步**（实时）：
   - 插件删除 → 调用 Riff API 删除 + 加入黑名单
   - Riff 删除 → 全量同步时检测并删除本地卡片

**特点**：
- ✅ 支持离线使用
- ✅ 自定义调度算法
- ✅ 数据完整性保证
- ❌ 复杂度高
- ❌ 可能出现数据不一致
- ❌ 需要处理同步冲突

---

### 数据流对比

#### SiReader 的数据流（简单）

```
用户复习卡片
   ↓
调用 reviewRiffCard API
   ↓
Riff 更新学习进度
   ↓
返回更新后的卡片
   ↓
UI 显示
```

**关键点**：
- 单向数据流
- 无缓存
- 无同步
- 实时性好

#### 我们插件的数据流（复杂）

```
用户复习卡片
   ↓
调用 SchedulerRouter.review()
   ↓
更新本地 StorageManager
   ↓
触发 HybridSyncService.reviewSync()
   ↓
调用 Riff API 同步学习进度
   ↓
更新 lastSyncTime
   ↓
通知 UnifiedDataSourceManager
   ↓
触发观察者回调
   ↓
UI 刷新
```

**关键点**：
- 双向数据流
- 多层缓存
- 复杂同步
- 观察者模式

---

### 核心组件对比

#### SiReader 的核心组件

1. **API 封装** (`src/api.ts`)
   - 简单的 Riff API 封装
   - 无额外逻辑
   
2. **WebSocket 监听** (`src/components/deck/siyuan-card.ts`)
   - 监听 `transactions` 事件
   - 300ms 防抖
   - 通知 UI 刷新

3. **UI 组件**
   - 直接调用 API
   - 无状态管理
   - 简单的响应式更新

**总代码量**：约 500 行（Riff 相关）

#### 我们插件的核心组件

1. **UnifiedDataSourceManager** (统一数据源管理器)
   - 单例模式
   - 观察者模式
   - 数据路由
   - 队列工厂
   
2. **AdvancedDataRouter** (高级模式路由器)
   - 路由到本地存储
   - 支持 5 种队列类型
   
3. **StorageManager** (存储管理器)
   - IndexedDB/LocalStorage
   - 卡片 CRUD
   - 批量操作
   - 事务支持
   
4. **HybridSyncService** (混合同步服务)
   - 增量同步
   - 全量同步
   - 删除同步
   - 黑名单管理
   - 自动重试
   - 进度回调
   
5. **SchedulerRouter** (调度器路由)
   - 支持多种调度器（FSRS、Neural、Incremental Learning）
   - 自定义学习算法
   
6. **QueueFactory** (队列工厂)
   - 创建 5 种队列类型
   - 队列生命周期管理

**总代码量**：约 5000+ 行（核心架构）

---

### 为什么我们的插件这么复杂？

#### 1. 功能需求不同

| 功能 | SiReader | 我们的插件 |
|------|----------|-----------|
| **基础复习** | ✅ | ✅ |
| **离线使用** | ❌ | ✅ |
| **自定义算法** | ❌ | ✅ (FSRS, Neural, IL) |
| **多种队列** | ❌ | ✅ (5 种队列类型) |
| **渐进学习** | ❌ | ✅ |
| **神经网络调度** | ❌ | ✅ |
| **参数优化** | ❌ | ✅ |
| **批量操作** | ❌ | ✅ |
| **数据导入导出** | ❌ | ✅ |

#### 2. 设计理念不同

**SiReader**：
- 目标：提供基础的闪卡复习功能
- 理念：简单、依赖思源、实时性
- 权衡：牺牲离线支持和自定义能力，换取简单性

**我们的插件**：
- 目标：提供专业的间隔重复学习系统
- 理念：独立、可扩展、离线优先
- 权衡：牺牲简单性，换取功能完整性和灵活性

#### 3. 技术架构不同

**SiReader**：
- 架构：简单的 API 调用 + WebSocket 监听
- 模式：无状态、无缓存、无同步
- 复杂度：O(1) - 线性复杂度

**我们的插件**：
- 架构：分层架构 + 观察者模式 + 单例模式
- 模式：有状态、多层缓存、复杂同步
- 复杂度：O(n) - 多项式复杂度

---

### 我们的问题根源分析

#### 问题回顾

使用思源原生快速制卡后，打开 SRS 浏览器没有自动获取新卡片，需要手动点击"全量同步"。

#### 根本原因

我们的插件采用了**双存储架构**，导致：

1. **数据不同步**：
   - 思源原生快速制卡 → 数据写入 Riff
   - 插件本地存储 → 没有感知到变化
   - 需要通过同步机制来获取新卡片

2. **同步时机问题**：
   - 浏览器打开时触发增量同步
   - 但增量同步依赖 `lastSyncTime`
   - 如果 `lastSyncTime` 不准确，会漏掉新卡片

3. **时间戳不一致**：
   - 本地 `lastSyncTime` 使用本地时间
   - Riff `card.created` 使用服务器时间
   - 可能存在时间差，导致新卡片被过滤

#### SiReader 为什么没有这个问题？

因为 SiReader **没有本地存储**：
- 所有数据都在 Riff
- 每次都直接调用 Riff API 获取最新数据
- 不存在数据不同步的问题

---

### 解决方案对比

#### 方案 1：学习 SiReader（简化架构）

**彻底简化**：
- 移除本地存储
- 移除同步逻辑
- 直接使用 Riff API

**优点**：
- ✅ 简单可靠
- ✅ 无数据一致性问题
- ✅ 代码量减少 80%

**缺点**：
- ❌ 失去离线支持
- ❌ 失去自定义算法
- ❌ 失去所有高级功能
- ❌ 与项目目标不符

**结论**：❌ 不可行（与项目定位冲突）

#### 方案 2：添加 WebSocket 监听（推荐）

**借鉴 SiReader 的实时监听**：
```typescript
// 在 SRSBrowser.vue 中添加
window.addEventListener('ws-main', (e: CustomEvent) => {
  const { cmd, data } = e.detail;
  if (cmd !== 'transactions') return;
  
  // 检测闪卡操作
  const hasFlashcardOp = data.doOperations?.some((op: any) => 
    op.action === 'addFlashcards' || 
    op.action === 'removeFlashcards'
  );
  
  if (hasFlashcardOp) {
    // 防抖后触发增量同步
    debouncedSync();
  }
});
```

**优点**：
- ✅ 实时感知变化
- ✅ 保留现有架构
- ✅ 代码改动小
- ✅ 兼容离线模式

**缺点**：
- ⚠️ 增加一点复杂度
- ⚠️ 需要处理防抖

**结论**：✅ 推荐（最佳平衡）

#### 方案 3：改进同步逻辑（已实现）

**当前方案**：
- 浏览器打开时触发全量同步
- 确保数据完整性

**优点**：
- ✅ 简单可靠
- ✅ 数据完整性好

**缺点**：
- ❌ 每次打开都要全量同步（慢）
- ❌ 无法实时感知变化

**结论**：✅ 可用（短期方案）

---

### 最终建议

#### 短期方案（已实现）

保持现有的全量同步方案：
- ✅ 浏览器打开时触发全量同步
- ✅ 确保数据完整性
- ✅ 用户可以手动刷新

#### 长期优化（推荐）

结合 SiReader 的优点，实现混合方案：

1. **添加 WebSocket 监听**（实时感知）
   ```typescript
   // 监听思源 transactions 事件
   window.addEventListener('ws-main', handleTransactions);
   ```

2. **改进同步策略**（快速同步）
   - 初始加载：增量同步（快）
   - 运行时：WebSocket 触发增量同步（实时）
   - 手动刷新：全量同步（兜底）

3. **优化防抖机制**（性能优化）
   - 300ms 防抖（借鉴 SiReader）
   - 批量处理变更
   - 避免频繁刷新

#### 实现优先级

1. **P0（立即）**：保持现有全量同步方案 ✅ 已完成
2. **P1（下个版本）**：添加 WebSocket 监听
3. **P2（未来）**：优化同步策略和防抖机制

---

### 总结

#### SiReader 的核心优势

1. **简单性**：无本地存储，无同步逻辑
2. **实时性**：WebSocket 监听，立即感知变化
3. **可靠性**：单一数据源，无一致性问题

#### 我们插件的核心优势

1. **功能完整性**：支持离线、自定义算法、多种队列
2. **可扩展性**：分层架构，易于添加新功能
3. **专业性**：专业的间隔重复学习系统

#### 可以借鉴的点

1. ✅ **WebSocket 监听**：实时感知数据变化
2. ✅ **防抖机制**：避免频繁刷新
3. ✅ **简化思维**：在不影响核心功能的前提下简化实现

#### 不应该借鉴的点

1. ❌ **移除本地存储**：会失去离线支持
2. ❌ **移除同步逻辑**：会失去数据完整性保证
3. ❌ **完全依赖 Riff**：会失去自定义能力

---

**调研结论**：

SiReader 和我们的插件是两种不同的设计理念：
- **SiReader**：简单、依赖思源、实时性优先
- **我们的插件**：完整、独立、功能性优先

我们应该**借鉴 SiReader 的实时监听机制**，但**保持现有的双存储架构**，以兼顾简单性和功能完整性。

---

**最终方案**：

```typescript
// 混合方案：全量同步 + WebSocket 监听
onMounted(() => {
  // 1. 初始加载：全量同步（确保数据完整）
  if (plugin?.hybridSyncService) {
    void plugin.hybridSyncService.fullSync()
      .then(() => loadData(true));
  } else {
    loadData();
  }
  
  // 2. 运行时：WebSocket 监听（实时感知变化）
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const handleTransactions = (e: CustomEvent) => {
    const { cmd, data } = e.detail;
    if (cmd !== 'transactions') return;
    
    const hasFlashcardOp = data.doOperations?.some((op: any) => 
      op.action === 'addFlashcards' || 
      op.action === 'removeFlashcards'
    );
    
    if (!hasFlashcardOp) return;
    
    // 防抖 300ms
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      console.log('[SRSBrowser] Detected flashcard changes, syncing...');
      void plugin.hybridSyncService.incrementalSync()
        .then(() => loadData(true));
    }, 300);
  };
  
  window.addEventListener('ws-main', handleTransactions);
  
  onBeforeUnmount(() => {
    window.removeEventListener('ws-main', handleTransactions);
    if (syncTimer) clearTimeout(syncTimer);
  });
});
```

这样可以兼顾：
- ✅ 数据完整性（全量同步）
- ✅ 实时性（WebSocket 监听）
- ✅ 性能（防抖机制）
- ✅ 功能完整性（保留双存储架构）
