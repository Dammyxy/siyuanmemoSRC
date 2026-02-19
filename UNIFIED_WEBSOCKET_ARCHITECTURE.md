# 统一 WebSocket 架构设计

**创建时间**：2026-02-15  
**版本**：v1.0  
**状态**：设计完成，待实现

---

## 1. 背景

### 1.1 现状问题

当前系统存在多个 WebSocket 连接和监听机制：

1. **HybridSyncService 的 WebSocket**
   - 用途：监听 Riff 卡片变化，触发增量同步
   - 连接方式：直接创建 WebSocket
   - 防抖：300ms

2. **TransactionObserver（eventBus）**
   - 用途：自动制卡（列表模版等）
   - 连接方式：通过 eventBus 间接监听
   - 防抖：2000ms
   - 问题：依赖插件 API，连接不稳定

3. **QuickCardWebSocketService（计划新增）**
   - 用途：快速制卡符号检测
   - 连接方式：直接创建 WebSocket
   - 防抖：300ms

### 1.2 问题分析

- ❌ 多个 WebSocket 连接，资源浪费
- ❌ 重复的连接管理和重连逻辑
- ❌ 职责不清晰，难以维护
- ❌ eventBus 方式不稳定

---

## 2. 解决方案：统一 WebSocket 服务（简化版）

### 2.1 核心思想

创建一个统一的 `TransactionWebSocketService`，管理单一的 WebSocket 连接，并将事件分发给两种处理器（而不是三种）。

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         FSRSPlugin                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │      TransactionWebSocketService（统一服务）              │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  WebSocket 连接层                                    │  │ │
│  │  │  - 单一连接：ws://localhost:6806/ws                 │  │ │
│  │  │  - 自动重连：3秒延迟                                 │  │ │
│  │  │  - 事件监听：transactions                           │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  事件分发层                                          │  │ │
│  │  │  - 解析 transactions                                 │  │ │
│  │  │  - 分发给两个处理器                                  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────┐          ┌──────────────────────────────┐  │
│  │ RiffSyncHandler│          │   AutoCardHandler            │  │
│  │                │          │   （统一版）                 │  │
│  │ - 检测 Riff 变化│          │                              │  │
│  │ - 触发增量同步  │          │  ┌────────────────────────┐ │  │
│  │ - 防抖: 300ms  │          │  │ 快速符号队列（300ms）  │ │  │
│  └────────────────┘          │  │ - >> << <>             │ │  │
│         ↓                    │  │ - ::                   │ │  │
│  ┌────────────────┐          │  │ - ;;                   │ │  │
│  │HybridSyncService│          │  │ - {{}}                 │ │  │
│  └────────────────┘          │  └────────────────────────┘ │  │
│                              │                              │  │
│                              │  ┌────────────────────────┐ │  │
│                              │  │ 列表模版队列（2000ms） │ │  │
│                              │  │ - >>> + 子列表项       │ │  │
│                              │  └────────────────────────┘ │  │
│                              └──────────────────────────────┘  │
│                                         ↓                       │
│                              ┌──────────────────────────────┐  │
│                              │   XiuyuanService             │  │
│                              │   - builtin-list-item        │  │
│                              │   - builtin-concept-descriptor│ │
│                              └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心组件

### 3.1 TransactionWebSocketService（统一服务）

**职责**：
- 管理单一的 WebSocket 连接
- 监听 `transactions` 事件
- 解析事件并分发给处理器
- 自动重连机制

**关键方法**：
```typescript
class TransactionWebSocketService {
    // 启动服务
    start(): void
    
    // 停止服务
    stop(): void
    
    // 注册处理器
    registerRiffSyncHandler(handler: RiffSyncHandler): void
    registerAutoCardHandler(handler: AutoCardHandler): void
    
    // 处理和分发事件
    private handleTransactions(transactions: Transaction[]): void
}
```

---

### 3.2 RiffSyncHandler（Riff 同步处理器）

**职责**：
- 检测 Riff 相关操作（addFlashcards/removeFlashcards/updateAttrs）
- 触发 HybridSyncService 的增量同步
- 防抖处理（300ms）

**关键方法**：
```typescript
class RiffSyncHandler {
    // 处理 transactions
    handle(transactions: Transaction[]): void
    
    // 检测 Riff 变化
    private detectRiffChanges(transactions: Transaction[]): boolean
}
```

**触发条件**：
- `action === 'addFlashcards'`
- `action === 'removeFlashcards'`
- `action === 'updateAttrs' && data.new['custom-riff-decks']`

---

### 3.3 AutoCardHandler（自动制卡处理器 - 统一版）

**职责**：
- 检测块内容变化（insert/update）
- 管理两个独立的防抖队列
- 创建各种类型的卡片

**两个队列**：
1. **快速符号队列（300ms 防抖）**
   - `>>` `<<` `<>` （基础卡片）
   - `::` （概念卡片）
   - `;;` （描述符卡片）
   - `{{}}` （填空卡片）

2. **列表模版队列（2000ms 防抖）**
   - `>>>` + 子列表项（列表模版卡片）
   - 子列表项使用 `->` 分隔提示和答案（例如：`提示 -> 答案`）

**关键方法**：
```typescript
class AutoCardHandler {
    // 处理 transactions
    handle(transactions: Transaction[]): void
    
    // 快速符号队列
    private queueQuickCheck(blockId: string): void
    private processQuickQueue(): Promise<void>
    private checkQuickSymbols(blockId: string): Promise<void>
    
    // 列表模版队列
    private queueListCheck(blockId: string): void
    private processListQueue(): Promise<void>
    private checkListTemplate(blockId: string): Promise<void>
    
    // 卡片创建方法
    private createBasicCard(...): Promise<void>
    private createConceptCard(...): Promise<void>
    private createDescriptorCard(...): Promise<void>
    private createClozeCard(...): Promise<void>
    private createListTemplateCards(...): Promise<void>
}
```

**替代**：TransactionObserver（将被废弃）

---

## 4. 数据流

### 4.1 事件流转

```
用户编辑块
    ↓
思源笔记发送 transactions 事件
    ↓
TransactionWebSocketService 接收
    ↓
解析 transactions
    ↓
┌─────────────────────────────────────────────────────┐
│ 分发给两个处理器（并行）                            │
│                                                      │
│  RiffSyncHandler                                    │
│  - 检测 Riff 变化                                   │
│  - 防抖 300ms                                       │
│  - 触发增量同步                                     │
│                                                      │
│  AutoCardHandler（统一版）                          │
│  ├─ 快速符号队列（300ms 防抖）                      │
│  │  - 检测 >>, ::, ;;, {{}}                        │
│  │  - 创建对应卡片                                  │
│  │                                                   │
│  └─ 列表模版队列（2000ms 防抖）                     │
│     - 检测 >>> + 子列表项                           │
│     - 子列表项使用 -> 分隔提示和答案                │
│     - 创建列表模版卡片                              │
└─────────────────────────────────────────────────────┘
```

### 4.2 防抖机制

AutoCardHandler 使用两个独立的防抖队列：

- **快速符号队列**: 300ms
  - 快速响应符号输入
  - 不打断写作流程
  - 处理：>>, ::, ;;, {{}}

- **列表模版队列**: 2000ms
  - 避免误触发
  - 等待用户完成列表编辑
  - 处理：>>> + 子列表项（子项使用 `->` 分隔提示和答案）

**关键点**：
- 同一个块会同时加入两个队列
- 两个队列独立防抖，互不影响
- 快速符号检测时会排除 >>> 符号
- 列表模版检测时只处理 >>> 符号

---

## 5. 配置管理

### 5.1 配置接口

```typescript
interface TransactionServiceConfig {
    // 启用 Riff 同步
    riffSyncEnabled: boolean;
    
    // 启用快速制卡
    quickCardEnabled: boolean;
    
    // 启用自动制卡
    autoCardEnabled: boolean;
    
    // 快速制卡符号配置
    quickCard: {
        enabledSymbols: {
            basic: boolean;        // >> << <>
            concept: boolean;      // ::
            descriptor: boolean;   // ;;
            cloze: boolean;        // {{}}
            multiLine: boolean;    // >>>
        };
        debounceDelay: number;     // 防抖时间（默认 300ms）
    };
}
```

### 5.2 配置界面

在设置面板中添加：

```
┌─────────────────────────────────────┐
│ 实时同步                            │
│ ☑ 启用 Riff 同步                    │
│   自动同步 Riff 卡片变化            │
│                                     │
│ 快速制卡                            │
│ ☑ 启用快速制卡符号                  │
│   ☑ 基础卡片 (>> << <>)             │
│   ☑ 概念卡片 (::)                   │
│   ☑ 描述符 (;;)                     │
│   ☑ 填空 ({{}})                     │
│   ☑ 多行 (>>>)                      │
│   防抖时间: [300] ms                │
│                                     │
│ 自动制卡                            │
│ ☑ 启用自动制卡                      │
│   自动检测列表模版并创建卡片        │
└─────────────────────────────────────┘
```

---

## 6. 迁移计划

### 6.1 Phase 1：创建统一服务（2-3天）

1. 创建 `TransactionWebSocketService`
2. 创建 `RiffSyncHandler`
3. 重构 `HybridSyncService`（移除 WebSocket 代码）
4. 集成到插件主类

### 6.2 Phase 2：自动制卡处理器（3-4天）

1. 创建 `AutoCardHandler`（统一版）
2. 实现快速符号队列（300ms 防抖）
3. 实现列表模版队列（2000ms 防抖）
4. 实现各种卡片创建方法
5. 注册到统一服务
6. 废弃 `TransactionObserver`

### 6.3 Phase 3：Xiuyuan 集成（3-4天）

1. 实现 `builtin-concept-descriptor` 模版
2. 实现 Descriptor Cards
3. 注册内置模版

### 6.4 Phase 4：优化和测试（2-3天）

1. 添加配置选项
2. 添加单元测试
3. 添加集成测试
4. 性能优化
5. 更新文档

---

## 7. 优势总结

### 7.1 架构优势

✅ **单一连接**：只有一个 WebSocket 连接，节省资源  
✅ **职责清晰**：每个处理器专注于一个功能  
✅ **易于扩展**：新增处理器只需实现接口并注册  
✅ **统一管理**：连接、重连、错误处理都在一个地方  

### 7.2 性能优势

✅ **独立防抖**：每个处理器独立防抖，互不影响  
✅ **并行处理**：三个处理器并行工作，不阻塞  
✅ **批量处理**：每个处理器内部批量处理，提高效率  

### 7.3 维护优势

✅ **代码复用**：WebSocket 连接逻辑只写一次  
✅ **易于测试**：每个处理器可以独立测试  
✅ **易于调试**：清晰的日志和错误处理  
✅ **易于配置**：统一的配置接口  

---

## 8. 风险评估

### 8.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| WebSocket 连接不稳定 | 高 | 中 | 自动重连机制 |
| 处理器冲突 | 中 | 低 | 独立防抖和队列 |
| 性能问题 | 中 | 低 | 批量处理、去重 |
| 迁移风险 | 高 | 中 | 保留旧代码，逐步迁移 |

### 8.2 迁移风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 功能缺失 | 高 | 中 | 完整测试，保留回滚能力 |
| 用户体验下降 | 中 | 低 | 保持相同的防抖时间 |
| 配置迁移 | 低 | 低 | 自动迁移旧配置 |

---

## 9. 后续计划

### 9.1 短期（1-2周）

- [ ] 完成 Phase 1：统一 WebSocket 服务
- [ ] 完成 Phase 2：快速制卡处理器
- [ ] 完成基础测试

### 9.2 中期（2-4周）

- [ ] 完成 Phase 3：Xiuyuan 集成
- [ ] 完成 Phase 4：优化和测试
- [ ] 完整的文档

### 9.3 长期（1-2月）

- [ ] 删除 TransactionObserver
- [ ] 删除 HybridSyncService 中的旧代码
- [ ] 性能监控和优化

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**状态**：设计完成，待实现
