# 快速制卡功能总览

**文档创建时间**：2026-02-14  
**目的**：梳理现有快速制卡功能，为 WebSocket 改进做准备

---

## 📋 现有实现概览

### 1. 核心组件

#### TransactionObserver（自动制卡监听器）
- **位置**：`src/core/box/TransactionObserver.ts`
- **功能**：监听思源的 `transactions` 事件，自动检测并创建闪卡
- **触发方式**：通过 `eventBus` 监听 `ws-main` 事件

#### 关键方法

```typescript
class TransactionObserver {
    // 初始化监听
    public init() {
        this.plugin.eventBus.on('ws-main', this.handleTransaction);
    }
    
    // 处理事务
    private handleTransaction = (event: any) => {
        if (!this.enabled) return;
        // 监听 insert 和 update 操作
        if (op.action === 'insert' || op.action === 'update') {
            this.queueBlockCheck(op.id);
        }
    }
    
    // 检查并创建卡片
    private async checkAndCreateCard(blockId: string) {
        // 1. 获取块内容
        // 2. 匹配策略（高亮、问答等）
        // 3. 检查是否已制卡
        // 4. 添加到 Riff 卡组
        // 5. 标记 FSRS 属性
        // 6. 检测卡片类型（Topic/Item）
        // 7. 保存到插件存储
    }
}
```

---

## 🎯 制卡触发条件

### 1. 内容匹配策略

通过 `CardBuilderContext.matchStrategy()` 检测：

- **高亮标记**：`<mark>` 标签
- **问答格式**：特定的问答模式
- **列表模版**：列表项 + 多个子项（≥2个）
- **其他策略**：由 `CardBuilderContext` 定义

### 2. 列表模版卡特殊处理

**条件**：
- 块类型必须是列表项（`type='i'`）
- 必须有至少 2 个子级列表项

**行为**：
- 父列表项作为问题（正面）
- 每个子级列表项作为答案（背面）
- 调用 `xiuyuanService.createFromBlocks()` 创建 Xiuyuan 卡片

---

## 🔄 制卡流程

### 完整流程图

```
用户编辑块
    ↓
思源触发 transactions 事件
    ↓
eventBus 接收 ws-main 事件
    ↓
TransactionObserver.handleTransaction()
    ↓
检测 insert/update 操作
    ↓
queueBlockCheck() - 加入队列
    ↓
防抖 2 秒
    ↓
processQueue() - 批量处理
    ↓
checkAndCreateCard() - 逐个检查
    ↓
┌─────────────────────────────────┐
│ 1. 获取块内容（kramdown）        │
│ 2. 匹配策略（排除 default）      │
│ 3. 检查是否已制卡                │
│    - Riff DB 中是否存在          │
│    - 是否有 Riff 属性            │
│    - 是否有 FSRS 属性            │
│    - 是否有卡片类型标记          │
│ 4. 添加到 Riff 卡组              │
│ 5. 检查是否为列表模版            │
│    - 是：创建 Xiuyuan 卡片       │
│    - 否：继续常规流程            │
│ 6. 标记 FSRS 属性                │
│ 7. 检测并标记卡片类型            │
│    - Topic：初始化 A-Factor      │
│    - Item：仅标记类型            │
│ 8. 保存到插件存储                │
└─────────────────────────────────┘
```

---

## 🔧 关键 API 调用

### 1. 思源 API

```typescript
// 获取块内容
await getBlockKramdown(blockId);

// 获取块属性
await getBlockAttrs(blockId);

// 设置块属性
await setBlockAttrs(blockId, attrs);

// SQL 查询
await sql(`SELECT * FROM blocks WHERE id = '${blockId}'`);
```

### 2. Riff API

```typescript
// 检查是否已制卡
await getRiffCardsByBlockIDs([blockId]);

// 添加到卡组
await addRiffCards(BUILTIN_DECK_ID, [blockId]);

// 检查是否有 Riff 属性
await hasRiffAttribute(blockId);
```

### 3. FSRS API

```typescript
// 检查是否为闪卡块
await isFlashcardBlock(blockId);

// 标记为闪卡
await markBlockAsCard(blockId, cardId, priority, type);

// 取消闪卡标记
await unmarkBlockAsCard(blockId);
```

### 4. Xiuyuan API

```typescript
// 创建 Xiuyuan 卡片（列表模版）
await xiuyuanService.createFromBlocks(
    blockIds,
    'builtin-list-item',
    fieldMapping,
    BUILTIN_DECK_ID
);
```

---

## ⚙️ 配置选项

### 设置面板

**位置**：`src/ui/settings/SettingsPanel.vue`

```vue
<!-- 自动制卡开关 -->
<div class="form-item">
  <label>实时自动制卡</label>
  <input type="checkbox" v-model="settings.autoCardEnabled">
  <p class="form-hint">监听编辑操作，当输入特定内容（如高亮、问答）时自动创建闪卡</p>
</div>
```

### 启用/禁用

```typescript
// 在插件初始化时
this.transactionObserver = new TransactionObserver(this);
this.transactionObserver.init();

// 根据设置启用/禁用
const autoCardEnabled = settings.incremental?.autoCardEnabled || false;
this.transactionObserver.setEnabled(autoCardEnabled);
```

---

## 🎨 卡片类型检测

### Topic vs Item

**检测逻辑**：`detectCardType(blockId)`

- **Topic**：主题型卡片，需要初始化 A-Factor
- **Item**：项目型卡片，仅标记类型

**A-Factor 初始化**：

```typescript
if (cardType === 'topic') {
    const priority = card?.priority || 50;
    const aFactor = initializeAFactor(priority);
    cardTypeAttrs['custom-fsrs-a-factor'] = aFactor.toString();
}
```

---

## 🔍 调试日志

### 关键日志点

```typescript
// 1. 事务接收
console.log('[SiyuanMemo] Transaction received:', detail.data.length);

// 2. 操作检测
console.log('[SiyuanMemo] Ops:', op.action, op.id);

// 3. 策略匹配
console.log('[SiyuanMemo] Strategy match result:', strategy?.strategyName);

// 4. 卡片状态
console.log('[SiyuanMemo] Card Status: RiffDB=${isRiffInDb}, RiffAttr=${hasRiffAttr}, FSRSAttr=${isFsrsAttr}');

// 5. 列表模版检测
console.log('[SiyuanMemo] 🔍 Checking if block is a list template...');

// 6. 卡片类型
console.log('[SiyuanMemo] Topic card detected: blockID=${blockId}, aFactor=${aFactor}');
```

---

## 🚀 性能优化

### 1. 防抖机制

```typescript
// 防抖 2 秒，避免频繁触发
this.debounceTimer = setTimeout(() => {
    this.processQueue();
}, 2000);
```

### 2. 批量处理

```typescript
// 批量处理队列中的块
for (const blockId of blocks) {
    await this.checkAndCreateCard(blockId);
}
// 统一保存
this.plugin.storage.saveCards();
```

### 3. 去重处理

```typescript
// 避免重复处理同一个块
if (this.processing.has(blockId)) return;
this.processing.add(blockId);
```

---

## 📊 与 WebSocket 改进的对比

| 特性 | 现有实现（eventBus） | 改进方案（WebSocket） |
|------|---------------------|---------------------|
| **连接方式** | eventBus 间接监听 | 直接 WebSocket 连接 |
| **稳定性** | ⚠️ 依赖 eventBus | ✅ 更稳定 |
| **重连机制** | ❌ 无 | ✅ 自动重连 |
| **防抖时间** | ✅ 2 秒 | ✅ 300ms（可调） |
| **错误处理** | ⚠️ 基础 | ✅ 完善 |
| **日志调试** | ✅ 详细 | ✅ 更详细 |
| **独立性** | ❌ 依赖插件 API | ✅ 独立运行 |

---

## 🔄 改进建议

### 1. 保留现有功能

- ✅ 保留 `TransactionObserver` 的核心逻辑
- ✅ 保留策略匹配机制
- ✅ 保留列表模版处理
- ✅ 保留卡片类型检测

### 2. 改进连接方式

```typescript
// ❌ 旧方式
this.plugin.eventBus.on('ws-main', this.handleTransaction);

// ✅ 新方式
const ws = new WebSocket(`${protocol}//${location.host}/ws?app=siyuanmemo&type=main`);
ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.cmd === 'transactions') {
        this.handleTransaction({ detail: msg });
    }
};
```

### 3. 添加重连机制

```typescript
ws.onclose = (ev) => {
    if (ev.code !== 1000) {
        setTimeout(() => this.reconnect(), 3000);
    }
};
```

### 4. 优化防抖时间

```typescript
// 可以根据场景调整
const DEBOUNCE_DELAY = 300; // 快速响应
// 或
const DEBOUNCE_DELAY = 2000; // 避免频繁触发
```

---

## 📚 相关文件

### 核心文件

- `src/core/box/TransactionObserver.ts` - 自动制卡监听器
- `src/core/card-builder/index.ts` - 卡片构建器
- `src/core/siyuan/block.ts` - 块操作 API
- `src/core/siyuan/riff.ts` - Riff API
- `src/core/xiuyuan/service.ts` - Xiuyuan 服务

### 配置文件

- `src/ui/settings/SettingsPanel.vue` - 设置面板
- `src/types/settings.ts` - 设置类型定义

### 测试文件

- `src/__tests__/plugin-queue-integration.test.ts`
- `src/services/__tests__/BlockMenuHandler.menu.test.ts`

---

## ✅ 总结

### 现有功能特点

1. ✅ **完整的制卡流程**：从检测到创建到存储
2. ✅ **多种策略支持**：高亮、问答、列表模版等
3. ✅ **智能去重**：避免重复制卡
4. ✅ **批量处理**：提高性能
5. ✅ **详细日志**：方便调试
6. ✅ **列表模版特殊处理**：支持 Xiuyuan 卡片

### 改进空间

1. 🔄 **连接方式**：从 eventBus 改为直接 WebSocket
2. 🔄 **重连机制**：添加自动重连
3. 🔄 **防抖优化**：可调整防抖时间
4. 🔄 **错误处理**：更完善的错误处理
5. 🔄 **独立性**：减少对插件 API 的依赖

---

**下一步**：基于现有实现，使用 WebSocket 直连机制进行改进

