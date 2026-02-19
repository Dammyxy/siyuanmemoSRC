# 快速制卡 WebSocket 改进方案

## 📋 背景

基于 flash-enhance 插件的快速制卡功能，使用新学到的 WebSocket 直连机制进行改进。

---

## 🔍 原实现分析

### flash-enhance 的实现

```typescript
// 使用 eventBus 监听
this.eventBus.on("ws-main", this.wsEvent)

private wsEvent({detail}: any) {
    if (detail.cmd === "transactions" ){
        dyMakeCard(detail,this)
    }
}
```

**优点**：
- ✅ 简单直接
- ✅ 使用思源插件 API

**缺点**：
- ❌ 依赖 eventBus，可能不稳定
- ❌ 事件格式需要额外包装
- ❌ 无法独立运行
- ❌ 没有重连机制

---

## ✅ 改进方案

### 1. 创建独立的 WebSocket 服务

```typescript
/**
 * 快速制卡 WebSocket 服务
 * 
 * 监听思源的 transactions 事件，自动制卡/取消制卡
 */
export class QuickCardWebSocketService {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private isConnected: boolean = false;
    private plugin: any;
    
    // 配置
    private readonly DEBOUNCE_DELAY = 300; // 300ms 防抖
    private readonly RECONNECT_DELAY = 3000; // 3 秒重连
    
    constructor(plugin: any) {
        this.plugin = plugin;
    }
    
    /**
     * 启动 WebSocket 服务
     */
    start(): void {
        if (this.isConnected) {
            console.log('[QuickCard] WebSocket already connected');
            return;
        }
        
        try {
            // 创建 WebSocket 连接
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${location.host}/ws?app=flash-enhance&type=main`;
            
            console.log('[QuickCard] 🔍 Creating WebSocket connection:', wsUrl);
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.isConnected = true;
                console.log('[QuickCard] ✅ WebSocket connected');
                this.showMessage('快速制卡已启动', 2000);
            };
            
            this.ws.onmessage = (e: MessageEvent) => {
                try {
                    const msg = JSON.parse(e.data);
                    
                    if (msg.cmd !== 'transactions' || !Array.isArray(msg.data)) {
                        return;
                    }
                    
                    // 处理 transactions（带防抖）
                    this.handleTransactions(msg.data);
                } catch (err) {
                    console.error('[QuickCard] ❌ Failed to parse message:', err);
                }
            };
            
            this.ws.onerror = (err) => {
                console.error('[QuickCard] ❌ WebSocket error:', err);
                this.isConnected = false;
            };
            
            this.ws.onclose = (ev) => {
                console.log('[QuickCard] WebSocket closed:', ev.code);
                this.isConnected = false;
                this.ws = null;
                
                // 自动重连（除非是正常关闭）
                if (ev.code !== 1000 && !ev.reason.includes('close websocket')) {
                    console.log('[QuickCard] 🔄 Reconnecting in 3 seconds...');
                    this.reconnectTimer = setTimeout(() => {
                        this.start();
                    }, this.RECONNECT_DELAY);
                }
            };
        } catch (err) {
            console.error('[QuickCard] ❌ Failed to create WebSocket:', err);
            this.isConnected = false;
        }
    }
    
    /**
     * 停止 WebSocket 服务
     */
    stop(): void {
        if (this.ws) {
            this.ws.close(1000, 'close websocket');
            this.ws = null;
        }
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.isConnected = false;
        console.log('[QuickCard] WebSocket stopped');
    }
    
    /**
     * 处理 transactions 事件（带防抖）
     */
    private handleTransactions(transactions: any[]): void {
        // 清除之前的定时器
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // 防抖 300ms
        this.debounceTimer = setTimeout(() => {
            console.log('[QuickCard] 🔍 Processing transactions:', transactions.length);
            
            // 处理每个 transaction
            for (const tx of transactions) {
                if (!tx.doOperations) continue;
                
                for (const op of tx.doOperations) {
                    this.processOperation(op);
                }
            }
        }, this.DEBOUNCE_DELAY);
    }
    
    /**
     * 处理单个操作
     */
    private processOperation(op: any): void {
        // 检查是否需要制卡
        const needMakeCard = this.shouldMakeCard(op);
        const needRemoveCard = this.shouldRemoveCard(op);
        
        if (needMakeCard) {
            console.log('[QuickCard] 🔔 Making card:', op.id);
            this.addCard(op.id);
        }
        
        if (needRemoveCard) {
            console.log('[QuickCard] 🗑️ Removing card:', op.id);
            this.removeCard(op.id);
        }
    }
    
    /**
     * 判断是否需要制卡
     */
    private shouldMakeCard(op: any): boolean {
        const type = op.action;
        
        // 1. 插入或更新操作
        if (type !== 'insert' && type !== 'update' && type !== 'updateAttrs') {
            return false;
        }
        
        // 2. 检查是否已经制卡
        const carded = this.isCarded(op);
        if (carded) {
            return false;
        }
        
        // 3. 检查是否有标记（mark）
        const marked = this.isDoMark(op);
        if (marked) {
            return true;
        }
        
        // 4. 检查是否有图像遮挡
        const occlusioned = this.isDoImageOcclusion(op);
        if (occlusioned) {
            return true;
        }
        
        // 5. 检查是否有列表标记
        const listCarded = this.isDoListCard(op);
        if (listCarded) {
            return true;
        }
        
        // 6. 检查是否有超级块标记
        const superBlockCarded = this.isDosuperBlockCard(op);
        if (superBlockCarded) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 判断是否需要取消制卡
     */
    private shouldRemoveCard(op: any): boolean {
        const type = op.action;
        
        // 1. 删除操作
        if (type === 'delete') {
            return true;
        }
        
        // 2. 更新操作 + 已制卡 + 没有标记
        if (type === 'update') {
            const carded = this.isCarded(op);
            const marked = this.isDoMark(op);
            const occlusioned = this.isDoImageOcclusion(op);
            
            if (carded && !marked && !occlusioned) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 检查是否已经制卡
     */
    private isCarded(op: any): boolean {
        // 检查 custom-riff-decks 属性
        return !!op.data?.new?.['custom-riff-decks'] || 
               !!op.data?.old?.['custom-riff-decks'];
    }
    
    /**
     * 检查是否有标记（mark）
     */
    private isDoMark(op: any): boolean {
        // 检查 data 中是否包含 mark 标签
        const data = op.data;
        if (!data) return false;
        
        // 检查 HTML 内容中是否有 mark 标签
        return /data-type="[^"]*\bmark\b[^"]*"/.test(data) ||
               /<mark[^>]*>/.test(data);
    }
    
    /**
     * 检查是否有图像遮挡
     */
    private isDoImageOcclusion(op: any): boolean {
        // 检查是否有图像遮挡相关属性
        return !!op.data?.new?.['custom-image-occlusion'];
    }
    
    /**
     * 检查是否有列表标记
     */
    private isDoListCard(op: any): boolean {
        // 检查是否有列表标记
        const data = op.data;
        if (!data) return false;
        
        return /data-type="[^"]*\blist\b[^"]*"/.test(data) ||
               /<li[^>]*>/.test(data);
    }
    
    /**
     * 检查是否有超级块标记
     */
    private isDosuperBlockCard(op: any): boolean {
        // 检查是否有超级块标记
        return !!op.data?.new?.['custom-super-block'];
    }
    
    /**
     * 添加闪卡
     */
    private async addCard(blockId: string): Promise<void> {
        try {
            const deckId = this.plugin.data?.settingConfig?.deckId || '20230218211946-2kw8jgx';
            
            await fetchPost('/api/riff/addRiffCards', {
                deckID: deckId,
                blockIDs: [blockId]
            });
            
            console.log('[QuickCard] ✅ Card added:', blockId);
        } catch (err) {
            console.error('[QuickCard] ❌ Failed to add card:', err);
        }
    }
    
    /**
     * 移除闪卡
     */
    private async removeCard(blockId: string): Promise<void> {
        try {
            const deckId = this.plugin.data?.settingConfig?.deckId || '20230218211946-2kw8jgx';
            
            await fetchPost('/api/riff/removeRiffCards', {
                deckID: deckId,
                blockIDs: [blockId]
            });
            
            console.log('[QuickCard] ✅ Card removed:', blockId);
        } catch (err) {
            console.error('[QuickCard] ❌ Failed to remove card:', err);
        }
    }
    
    /**
     * 显示消息
     */
    private showMessage(msg: string, timeout: number = 3000): void {
        if (typeof showMessage === 'function') {
            showMessage(msg, timeout, 'info');
        }
    }
}
```

### 2. 在插件中使用

```typescript
import { QuickCardWebSocketService } from './services/QuickCardWebSocketService';

export default class PluginSample extends Plugin {
    private quickCardService: QuickCardWebSocketService | null = null;
    
    onload() {
        // ... 其他初始化代码 ...
        
        // 🆕 启动快速制卡服务
        this.quickCardService = new QuickCardWebSocketService(this);
        this.quickCardService.start();
        
        // ❌ 移除旧的 eventBus 监听
        // this.eventBus.on("ws-main", this.wsEvent)
    }
    
    onunload() {
        // 🆕 停止快速制卡服务
        if (this.quickCardService) {
            this.quickCardService.stop();
            this.quickCardService = null;
        }
        
        // ... 其他清理代码 ...
    }
}
```

---

## 📊 改进对比

| 特性 | 旧实现（eventBus） | 新实现（WebSocket） |
|------|-------------------|-------------------|
| **稳定性** | ⚠️ 依赖 eventBus | ✅ 直接连接 |
| **重连机制** | ❌ 无 | ✅ 自动重连 |
| **防抖机制** | ❌ 无 | ✅ 300ms 防抖 |
| **错误处理** | ⚠️ 简单 | ✅ 完善 |
| **日志调试** | ⚠️ 简单 | ✅ 详细 |
| **独立性** | ❌ 依赖插件 API | ✅ 独立运行 |
| **性能** | ⚠️ 一般 | ✅ 更好 |

---

## 🎯 核心改进点

### 1. 直接 WebSocket 连接

```typescript
// ❌ 旧方式：依赖 eventBus
this.eventBus.on("ws-main", this.wsEvent)

// ✅ 新方式：直接连接
const ws = new WebSocket(`${protocol}//${location.host}/ws?app=flash-enhance&type=main`);
```

### 2. 自动重连机制

```typescript
this.ws.onclose = (ev) => {
    if (ev.code !== 1000) {
        // 3 秒后自动重连
        setTimeout(() => this.start(), 3000);
    }
};
```

### 3. 防抖机制

```typescript
// 防抖 300ms，避免频繁触发
this.debounceTimer = setTimeout(() => {
    this.processTransactions(transactions);
}, 300);
```

### 4. 详细日志

```typescript
console.log('[QuickCard] 🔍 Processing transactions:', transactions.length);
console.log('[QuickCard] 🔔 Making card:', op.id);
console.log('[QuickCard] 🗑️ Removing card:', op.id);
```

---

## 🚀 使用建议

### 1. 渐进式迁移

不要一次性替换所有代码，可以先保留旧实现，新增 WebSocket 实现：

```typescript
onload() {
    // 保留旧实现（作为后备）
    this.eventBus.on("ws-main", this.wsEvent)
    
    // 新增 WebSocket 实现
    this.quickCardService = new QuickCardWebSocketService(this);
    this.quickCardService.start();
}
```

### 2. 添加开关

在设置中添加开关，让用户选择使用哪种方式：

```typescript
if (this.data.settingConfig.useWebSocket) {
    // 使用 WebSocket
    this.quickCardService.start();
} else {
    // 使用 eventBus
    this.eventBus.on("ws-main", this.wsEvent);
}
```

### 3. 性能监控

添加性能监控，对比两种方式的效果：

```typescript
const startTime = Date.now();
await this.addCard(blockId);
const duration = Date.now() - startTime;
console.log(`[QuickCard] Card added in ${duration}ms`);
```

---

## 🔍 调试技巧

### 1. 查看 WebSocket 连接状态

```typescript
// 在控制台运行
window.quickCardService?.isConnected
```

### 2. 手动触发制卡

```typescript
// 在控制台运行
window.quickCardService?.addCard('20240214123456-abcdefg')
```

### 3. 查看消息日志

```typescript
// 在 onmessage 中添加
console.log('[QuickCard] 📨 Message:', msg);
```

---

## 📚 参考资料

- **SiReader 源代码**：`siyuan-sireader/src/components/deck/siyuan-card.ts`
- **思源 WebSocket API**：`/ws?app=<插件名>&type=main`
- **flash-enhance 原实现**：`src/api/dyCard.ts`

---

## ✅ 总结

### 核心优势

1. ✅ **更稳定**：直接 WebSocket 连接，不依赖 eventBus
2. ✅ **更可靠**：自动重连机制，断线后自动恢复
3. ✅ **更高效**：防抖机制，避免频繁触发
4. ✅ **更易调试**：详细日志，方便排查问题
5. ✅ **更独立**：可以独立运行，不依赖插件生命周期

### 迁移建议

1. 先在测试环境验证新实现
2. 保留旧实现作为后备
3. 添加开关让用户选择
4. 收集用户反馈后再完全替换

---

**文档创建时间**：2026-02-14  
**作者**：Kiro AI Assistant  
**基于**：SiReader 和 flash-enhance 的实现经验
