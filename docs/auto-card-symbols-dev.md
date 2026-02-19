# 快速制卡符号系统 - 开发文档

## 架构概述

快速制卡符号系统采用统一的 WebSocket 架构，通过单一连接监听块的编辑操作，并分发给不同的处理器。

### 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                         FSRSPlugin                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         TransactionWebSocketService（统一服务）          │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  WebSocket 连接层                                   │  │  │
│  │  │  - 连接管理（单一连接）                             │  │  │
│  │  │  - 自动重连                                         │  │  │
│  │  │  - 事件监听（transactions）                        │  │  │
│  │  │  - 事件分发（两种处理器）                           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  RiffSyncHandler（Riff 同步处理器）                │  │  │
│  │  │  - 检测 Riff 变化（addFlashcards/removeFlashcards）│  │  │
│  │  │  - 触发 HybridSyncService.incrementalSync()        │  │  │
│  │  │  - 防抖：300ms                                      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  AutoCardHandler（自动制卡处理器）                 │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │  │ 快速符号队列（300ms 防抖）                    │  │  │
│  │  │  │ - >> << <> （基础卡片）                       │  │  │
│  │  │  │ - :: （概念卡片）                             │  │  │
│  │  │  │ - ;; （描述符卡片）                           │  │  │
│  │  │  │ - {{}} （填空卡片）                           │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │  │ 列表模版队列（2000ms 防抖）                   │  │  │
│  │  │  │ - >>> + 子列表项（列表模版卡片）              │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 核心类

### 1. TransactionWebSocketService

**文件**：`src/services/TransactionWebSocketService.ts`

**职责**：
- 管理单一的 WebSocket 连接
- 监听 `transactions` 事件
- 分发事件给注册的处理器
- 自动重连机制

**关键方法**：

```typescript
class TransactionWebSocketService {
    // 注册处理器
    registerHandler(handler: ITransactionHandler): void
    
    // 取消注册处理器
    unregisterHandler(handler: ITransactionHandler): void
    
    // 启动服务
    start(): void
    
    // 停止服务
    stop(): void
    
    // 建立连接（私有）
    private connect(): void
    
    // 重新连接（私有）
    private reconnect(): void
    
    // 处理消息（私有）
    private handleMessage(event: MessageEvent): void
    
    // 处理 transactions 并分发（私有）
    private handleTransactions(data: Transaction[]): void
}
```

**配置**：
```typescript
private readonly WEBSOCKET_URL = 'ws://localhost:6806/ws';
private readonly RECONNECT_DELAY = 3000; // 3秒
```

### 2. AutoCardHandler

**文件**：`src/services/handlers/AutoCardHandler.ts`

**职责**：
- 检测块内容变化（insert/update）
- 管理两个独立的防抖队列
- 创建各种类型的卡片

**关键方法**：

```typescript
class AutoCardHandler implements ITransactionHandler {
    // 处理 transactions
    handle(transactions: Transaction[]): void
    
    // 快速符号检测队列
    private queueQuickCheck(blockId: string): void
    
    // 列表模版检测队列
    private queueListCheck(blockId: string): void
    
    // 处理快速符号队列
    private async processQuickQueue(): Promise<void>
    
    // 处理列表模版队列
    private async processListQueue(): Promise<void>
    
    // 检测快速符号
    private async checkQuickSymbols(blockId: string): Promise<void>
    
    // 检测列表模版
    private async checkListTemplate(blockId: string): Promise<void>
    
    // 创建基础卡片
    private async createBasicCard(blockId: string, direction: string, content: string): Promise<void>
    
    // 创建概念卡片
    private async createConceptCard(blockId: string, content: string): Promise<void>
    
    // 创建描述符卡片
    private async createDescriptorCard(blockId: string, content: string): Promise<void>
    
    // 创建填空卡片
    private async createClozeCard(blockId: string, content: string): Promise<void>
    
    // 创建列表模版卡片
    private async createListTemplateCards(blockId: string, children: any[]): Promise<void>
    
    // 清理资源
    dispose(): void
}
```

**符号正则表达式**：

```typescript
private patterns = {
    concept: /^(.+?)\s*::\s*(.+)$/,         // 概念 :: 定义
    descriptor: /^(.+?)\s*;;\s*(.+)$/,      // 属性 ;; 描述
    basicBoth: /^(.+?)\s*<>\s*(.+)$/,       // 问题 <> 答案
    basicForward: /^(.+?)\s*>>\s*(.+)$/,    // 问题 >> 答案
    basicBackward: /^(.+?)\s*<<\s*(.+)$/,   // 答案 << 问题
    cloze: /\{\{(.+?)\}\}/g,                // {{填空}}
    multiLine: /(.+?)\s*>>>\s*$/,           // 问题 >>>
    listCue: /^(.+?)\s*->\s*(.+)$/,         // 提示 -> 答案（列表模版子项）
};
```

### 3. RiffSyncHandler

**文件**：`src/services/handlers/RiffSyncHandler.ts`

**职责**：
- 检测 Riff 相关操作
- 触发 HybridSyncService 的增量同步
- 防抖处理（300ms）

**关键方法**：

```typescript
class RiffSyncHandler implements ITransactionHandler {
    // 处理 transactions
    handle(transactions: Transaction[]): void
    
    // 检测 Riff 变化（私有）
    private detectRiffChanges(transactions: Transaction[]): boolean
}
```

## 数据结构

### QuickCardSettings

**文件**：`src/types/settings.ts`

```typescript
interface QuickCardSettings {
    /** 启用快速制卡 */
    enabled: boolean;
    
    /** 启用的符号类型 */
    enabledSymbols: {
        basic: boolean;        // >> << <>
        concept: boolean;      // ::
        descriptor: boolean;   // ;;
        cloze: boolean;        // {{}}
        multiLine: boolean;    // >>>
    };
    
    /** 防抖时间（毫秒） */
    debounceDelay: {
        quick: number;         // 快速符号防抖时间（默认 300ms）
        list: number;          // 列表模版防抖时间（默认 2000ms）
    };
    
    /** Descriptor 是否使用 Xiuyuan */
    descriptorUseXiuyuan: boolean;
}
```

### Transaction

**文件**：`src/services/TransactionWebSocketService.ts`

```typescript
interface DoOperation {
    action: string;
    data: any;
    id: string;
    parentID?: string;
    previousID?: string;
    nextID?: string;
}

interface Transaction {
    doOperations: DoOperation[];
    undoOperations: DoOperation[] | null;
}
```

### ITransactionHandler

**文件**：`src/services/TransactionWebSocketService.ts`

```typescript
interface ITransactionHandler {
    /**
     * 处理 transactions
     * @param transactions 事务列表
     */
    handle(transactions: Transaction[]): void;
}
```

## 流程详解

### 1. WebSocket 连接流程

```
启动服务
    ↓
创建 WebSocket 连接
    ↓
ws://localhost:6806/ws?app=siyuanmemo&type=main
    ↓
连接成功
    ↓
监听 message 事件
    ↓
接收 transactions 命令
    ↓
分发给所有注册的处理器
```

### 2. 符号检测流程

```
接收 transactions 事件
    ↓
检查快速制卡是否启用
    ↓
提取 insert/update 操作
    ↓
加入待处理队列（两个队列）
    ↓
防抖等待（300ms / 2000ms）
    ↓
批量处理队列
    ↓
逐个检测块
    ↓
获取块内容（kramdown）
    ↓
符号检测（按优先级）
    ↓
检查符号类型是否启用
    ↓
路由到创建逻辑
```

### 3. 卡片创建流程

```
路由到创建逻辑
    ↓
检查是否已制卡
    ↓
判断卡片类型
    ↓
┌─────────────────────────────────┐
│ 简单卡片（Basic/Concept/Cloze）│
│  ↓                              │
│  创建 FSRS Card                 │
│  添加到 Riff                    │
│  标记 FSRS 属性                 │
│  保存到存储                     │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Xiuyuan 卡片（Descriptor/Multi）│
│  ↓                              │
│  检查前置条件                   │
│  创建 Xiuyuan                   │
│  生成 FSRSCard                  │
│  添加到 Riff                    │
│  保存到存储                     │
└─────────────────────────────────┘
    ↓
显示创建成功提示
```

## 性能优化

### 1. 防抖机制

```typescript
private queueQuickCheck(blockId: string): void {
    this.quickQueue.add(blockId);
    
    if (this.quickTimer) {
        clearTimeout(this.quickTimer);
    }
    
    // 从设置中获取防抖时间
    const quickCardSettings = this.plugin.data[STORAGE_NAME]?.quickCard;
    const debounceDelay = quickCardSettings?.debounceDelay?.quick || this.QUICK_DEBOUNCE;
    
    this.quickTimer = setTimeout(() => {
        this.processQuickQueue();
    }, debounceDelay);
}
```

### 2. 批量处理

```typescript
private async processQuickQueue(): Promise<void> {
    const blocks = Array.from(this.quickQueue);
    this.quickQueue.clear();
    
    for (const blockId of blocks) {
        if (this.processing.has(blockId)) continue;
        this.processing.add(blockId);
        
        try {
            await this.checkQuickSymbols(blockId);
        } finally {
            this.processing.delete(blockId);
        }
    }
}
```

### 3. 去重处理

```typescript
// 避免重复处理同一个块
if (this.processing.has(blockId)) {
    console.log('[AutoCard] Block already processing:', blockId);
    continue;
}
```

## 错误处理

### 1. WebSocket 错误

```typescript
ws.onerror = (error) => {
    console.error('[TransactionWS] ❌ WebSocket error:', error);
};

ws.onclose = (event) => {
    console.log('[TransactionWS] WebSocket closed:', event.code, event.reason);
    this.ws = null;
    
    // 非正常关闭，自动重连
    if (event.code !== 1000 && this.enabled) {
        console.log('[TransactionWS] Connection closed abnormally, reconnecting...');
        this.reconnect();
    }
};
```

### 2. 创建错误

```typescript
try {
    await this.createCard(blockId, symbolType, content);
} catch (error) {
    console.error(`[AutoCard] Failed to create card for ${blockId}:`, error);
    const { pushErrMsg } = await import('@/core/siyuan/api');
    await pushErrMsg(`创建卡片失败：${error.message}`);
}
```

### 3. 符号检测错误

```typescript
try {
    const symbolType = this.symbolDetector.detect(content);
    if (!symbolType) {
        return;
    }
} catch (error) {
    console.error(`[AutoCard] Symbol detection error:`, error);
}
```

## 测试

### 单元测试

**文件**：`src/services/__tests__/TransactionWebSocketService.test.ts`

测试用例：
- WebSocket 连接和断开
- 事件分发
- 自动重连
- 处理器注册和取消注册

**文件**：`src/services/handlers/__tests__/AutoCardHandler.test.ts`

测试用例：
- 符号检测
- 队列管理
- 防抖机制
- 卡片创建

### 集成测试

**文件**：`src/services/__tests__/TransactionWebSocketService.integration.test.ts`

测试用例：
- 端到端的卡片创建流程
- Riff 同步流程
- 错误处理和重连

## 配置

### 默认配置

```typescript
quickCard: {
    enabled: true,
    enabledSymbols: {
        basic: true,
        concept: true,
        descriptor: true,
        cloze: true,
        multiLine: true,
    },
    debounceDelay: {
        quick: 300,
        list: 2000,
    },
    descriptorUseXiuyuan: true,
}
```

### 配置访问

```typescript
// 在 AutoCardHandler 中访问配置
const quickCardSettings = this.plugin.data[STORAGE_NAME]?.quickCard;

if (!quickCardSettings?.enabled) {
    return;
}

if (quickCardSettings.enabledSymbols.basic) {
    // 处理基础卡片
}
```

## 扩展开发

### 添加新的符号类型

1. 在 `patterns` 中添加正则表达式：

```typescript
private patterns = {
    // ... 现有符号
    newSymbol: /^(.+?)\s*##\s*(.+)$/,  // 新符号 ##
};
```

2. 在 `checkQuickSymbols` 中添加检测逻辑：

```typescript
else if (quickCardSettings.enabledSymbols.newSymbol && this.patterns.newSymbol.test(kramdown)) {
    console.log('[AutoCard] Detected new symbol:', blockId);
    await this.createNewSymbolCard(blockId, kramdown);
}
```

3. 实现创建方法：

```typescript
private async createNewSymbolCard(blockId: string, content: string): Promise<void> {
    // 实现创建逻辑
}
```

4. 在设置中添加配置选项：

```typescript
interface QuickCardSettings {
    enabledSymbols: {
        // ... 现有符号
        newSymbol: boolean;  // 新符号
    };
}
```

### 添加新的处理器

1. 实现 `ITransactionHandler` 接口：

```typescript
class MyHandler implements ITransactionHandler {
    handle(transactions: Transaction[]): void {
        // 实现处理逻辑
    }
}
```

2. 注册处理器：

```typescript
const myHandler = new MyHandler(this);
this.transactionWebSocketService.registerHandler(myHandler);
```

## 调试

### 启用调试日志

在设置面板中启用"启用调试日志"选项，可以在浏览器控制台看到详细的调试信息。

### 日志格式

```
[TransactionWS] ✅ WebSocket connected
[AutoCard] Block queued: 20240215123456-abcdefg action: update
[AutoCard] Processing quick queue, count: 1
[AutoCard] Checking quick symbols: 20240215123456-abcdefg content: 问题 >> 答案
[AutoCard] Detected basic forward symbol: 20240215123456-abcdefg
[AutoCard] Creating basic card: 20240215123456-abcdefg forward
[AutoCard] Added to Riff deck: 20240215123456-abcdefg
[AutoCard] Marked block as card: 20240215123456-abcdefg
[AutoCard] Basic card created successfully: 20240215123456-abcdefg forward
```

## 性能指标

- 符号检测延迟：< 100ms
- 防抖延迟：300ms（快速符号）/ 2000ms（列表模版）
- 卡片创建时间：< 200ms
- WebSocket 重连：< 5秒
- 内存占用：< 10MB

## 相关文档

- [用户文档](./auto-card-symbols.md)
- [需求文档](../.kiro/specs/quick-card-symbols/requirements.md)
- [设计文档](../.kiro/specs/quick-card-symbols/design.md)
- [任务列表](../.kiro/specs/quick-card-symbols/tasks.md)

---

**文档版本**：v1.0  
**最后更新**：2026-02-15
