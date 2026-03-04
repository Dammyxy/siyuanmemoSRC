# 快速制卡重复触发测试

## 问题描述

用户担心在编辑器中制卡时，由于思源的编辑器、预览区和复习界面都使用同一个 Protyle 组件，可能会触发多次 transaction 事件，导致重复制卡。

## 测试场景

### 场景 1：单一编辑器
1. 在编辑器中输入：`测试 >> 答案`
2. 观察控制台日志
3. 检查是否只创建了一张卡片

### 场景 2：编辑器 + 预览
1. 打开文档的编辑器和预览（分屏）
2. 在编辑器中输入：`测试2 >> 答案2`
3. 观察控制台日志
4. 检查是否只创建了一张卡片

### 场景 3：编辑器 + 复习界面
1. 打开编辑器
2. 同时打开复习界面（如果复习界面中包含该文档的块）
3. 在编辑器中输入：`测试3 >> 答案3`
4. 观察控制台日志
5. 检查是否只创建了一张卡片

## 测试脚本

### 1. 监听 Transaction 事件

在控制台运行以下脚本，监听所有 transaction 事件：

```javascript
// 监听 transaction 事件
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const ws = plugin.transactionWebSocketService?.ws;

if (ws) {
    const originalOnMessage = ws.onmessage;
    let transactionCount = 0;
    
    ws.onmessage = function(event) {
        try {
            const message = JSON.parse(event.data);
            if (message.cmd === 'transactions') {
                transactionCount++;
                console.log(`[Transaction #${transactionCount}] 收到事件:`, {
                    count: message.data?.length || 0,
                    operations: message.data?.flatMap(tx => 
                        tx.doOperations?.map(op => ({
                            action: op.action,
                            id: op.id
                        }))
                    )
                });
            }
        } catch (e) {}
        
        if (originalOnMessage) {
            originalOnMessage.call(this, event);
        }
    };
    
    console.log('✅ Transaction 监听已启用');
    console.log('💡 现在可以在编辑器中输入测试内容');
} else {
    console.error('❌ WebSocket 未连接');
}
```

### 2. 检查重复卡片

在测试后运行以下脚本，检查是否有重复卡片：

```javascript
// 检查重复卡片
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const allCards = plugin.storage.getAllCards();

// 按 blockId 分组
const cardsByBlock = {};
allCards.forEach(card => {
    if (!cardsByBlock[card.blockId]) {
        cardsByBlock[card.blockId] = [];
    }
    cardsByBlock[card.blockId].push(card);
});

// 找出重复的
const duplicates = Object.entries(cardsByBlock)
    .filter(([blockId, cards]) => cards.length > 1);

console.log('=== 重复卡片检查 ===');
console.log('总卡片数:', allCards.length);
console.log('唯一块数:', Object.keys(cardsByBlock).length);
console.log('重复块数:', duplicates.length);

if (duplicates.length > 0) {
    console.warn('⚠️ 发现重复卡片:');
    duplicates.forEach(([blockId, cards]) => {
        console.log('  块 ID:', blockId);
        console.log('  卡片数量:', cards.length);
        console.log('  卡片 ID:', cards.map(c => c.id));
    });
} else {
    console.log('✅ 没有重复卡片');
}
```

## 防重复机制分析

### 当前机制

AutoCardHandler 有三层防重复机制：

1. **队列去重（Set）**
   ```typescript
   private quickQueue: Set<string> = new Set();
   ```
   - 同一个 blockId 在队列中只会保留一个
   - 即使多次触发 transaction，也只会处理一次

2. **处理中标记**
   ```typescript
   private processing: Set<string> = new Set();
   
   if (this.processing.has(blockId)) {
       console.log('[AutoCard] Block already processing:', blockId);
       continue;
   }
   ```
   - 防止同一个块同时被多个处理流程处理

3. **已制卡检测**
   ```typescript
   const existingCard = this.plugin.storage.getCardByBlockId(blockId);
   if (existingCard) {
       console.log('[AutoCard] Block already has card:', blockId);
       return;
   }
   ```
   - 最终防线：如果块已经有卡片，直接跳过

### 可能的问题场景

#### 场景 A：快速连续编辑
- 用户输入 `测试 >> 答案`
- 300ms 内又修改为 `测试修改 >> 答案修改`
- **结果**：只会处理最后一次编辑（防抖机制）

#### 场景 B：多个 Protyle 实例
- 编辑器和预览同时显示同一个块
- 用户在编辑器中输入 `测试 >> 答案`
- 两个 Protyle 实例都可能触发 transaction
- **结果**：
  - WebSocket 只有一个连接，只会收到一次 transaction 事件
  - 即使收到多次，Set 会去重
  - 即使 Set 没去重，`existingCard` 检测会阻止重复制卡

#### 场景 C：并发处理
- 两个不同的块同时触发制卡
- **结果**：正常，因为是不同的 blockId

## 测试结果

### 预期结果

无论哪种场景，都应该：
1. 每个块只创建一张卡片
2. 控制台日志清晰显示处理流程
3. 没有重复卡片

### 实际测试

请按照上述测试场景进行测试，并记录结果：

- [ ] 场景 1：单一编辑器 - 通过 / 失败
- [ ] 场景 2：编辑器 + 预览 - 通过 / 失败
- [ ] 场景 3：编辑器 + 复习界面 - 通过 / 失败

## 如果发现重复制卡

### 诊断步骤

1. 运行监听脚本，观察 transaction 事件触发次数
2. 检查控制台日志，查看 `[AutoCard]` 日志
3. 运行重复检查脚本，确认是否有重复卡片
4. 记录重复卡片的 blockId 和 cardId

### 可能的修复方案

如果确实发现重复制卡，可以考虑以下方案：

#### 方案 1：增加全局锁
```typescript
private globalProcessing: Set<string> = new Set();

async handle(transactions: Transaction[]): Promise<void> {
    for (const tx of transactions) {
        for (const op of tx.doOperations) {
            const blockId = op.id;
            
            // 全局锁检查
            if (this.globalProcessing.has(blockId)) {
                console.log('[AutoCard] Block locked:', blockId);
                continue;
            }
            
            this.globalProcessing.add(blockId);
            // ... 处理逻辑
            this.globalProcessing.delete(blockId);
        }
    }
}
```

#### 方案 2：增加时间戳检查
```typescript
private lastProcessed: Map<string, number> = new Map();
private readonly MIN_INTERVAL = 1000; // 1秒内不重复处理

async handle(transactions: Transaction[]): Promise<void> {
    const now = Date.now();
    
    for (const tx of transactions) {
        for (const op of tx.doOperations) {
            const blockId = op.id;
            const lastTime = this.lastProcessed.get(blockId) || 0;
            
            if (now - lastTime < this.MIN_INTERVAL) {
                console.log('[AutoCard] Block processed recently:', blockId);
                continue;
            }
            
            this.lastProcessed.set(blockId, now);
            // ... 处理逻辑
        }
    }
}
```

#### 方案 3：使用 Riff 卡组检查
```typescript
// 在创建卡片前，检查 Riff 卡组
const riffCards = await getRiffCardsByBlockIDs([blockId]);
if (riffCards.length > 0) {
    console.log('[AutoCard] Block already in Riff deck:', blockId);
    return;
}
```

## 结论

根据代码分析，当前的防重复机制应该足够强大，不太可能出现重复制卡的问题。但建议进行实际测试以确认。

如果测试中发现问题，请记录详细的日志和场景，以便进一步分析和修复。

---

**测试日期**: 2026-02-15  
**测试人员**: [待填写]  
**测试结果**: [待填写]
