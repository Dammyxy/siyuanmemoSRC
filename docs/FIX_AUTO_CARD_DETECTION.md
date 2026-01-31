# 修复：新卡片自动检测功能

## 问题描述

用户创建新卡片时，卡片没有被自动识别并添加到浏览器中。重启思源后，卡片出现在浏览器但没有识别 Topic/Item 类型。

## 根本原因

`TransactionObserver` 类存在但从未被实例化和启用：

1. **代码存在但未使用**：`TransactionObserver.ts` 包含完整的自动检测逻辑（第 153-170 行），但没有任何代码创建实例
2. **未初始化**：`index.ts` 和 `LifecycleManager.ts` 都没有实例化 `TransactionObserver`
3. **默认禁用**：`settings.ts` 中 `autoCardEnabled` 默认为 `false`

## 修复方案

### 1. 添加 TransactionObserver 导入

```typescript
// src/index.ts
import { TransactionObserver } from '@/core/box/TransactionObserver';
```

### 2. 添加实例属性

```typescript
export default class FSRSPlugin extends Plugin {
  // ...
  private transactionObserver!: TransactionObserver;
  // ...
}
```

### 3. 初始化 TransactionObserver

在 `onload()` 方法中，XiuyuanService 初始化之后：

```typescript
// 🆕 初始化 TransactionObserver（自动制卡）
this.transactionObserver = new TransactionObserver(this);
this.transactionObserver.init();

// 根据设置启用/禁用自动制卡
const autoCardEnabled = settings.incremental?.autoCardEnabled || false;
this.transactionObserver.setEnabled(autoCardEnabled);
console.log('[FSRS] ✅ TransactionObserver initialized, autoCardEnabled:', autoCardEnabled);
```

### 4. 添加清理逻辑

在 `onunload()` 方法中：

```typescript
// 卸载 TransactionObserver
if (this.transactionObserver) {
  this.transactionObserver.unload();
}
```

## TransactionObserver 工作原理

### 监听事件

监听思源的 WebSocket 事件 `ws-main`，捕获块的插入和更新操作：

```typescript
private handleTransaction = (event: any) => {
  if (!this.enabled) return;
  
  const detail = event.detail as TransactionDetail;
  if (detail.cmd !== 'transactions') return;
  
  detail.data.forEach(data => {
    data.doOperations.forEach(op => {
      if (op.action === 'insert' || op.action === 'update') {
        this.queueBlockCheck(op.id);
      }
    });
  });
}
```

### 防抖处理

使用 2 秒防抖，避免处理部分输入：

```typescript
private queueBlockCheck(blockId: string) {
  this.pendingBlocks.add(blockId);
  if (this.debounceTimer) clearTimeout(this.debounceTimer);
  
  this.debounceTimer = setTimeout(() => {
    this.processQueue();
  }, 2000);
}
```

### 自动制卡流程

1. **获取块内容**：通过 `getBlockKramdown()` 获取 markdown 内容
2. **匹配策略**：使用 `CardBuilderContext.matchStrategy()` 检查是否符合制卡规则
3. **检查现有状态**：
   - 检查 Riff 数据库（`getRiffCardsByBlockIDs`）
   - 检查 Riff 属性（`hasRiffAttribute`）
   - 检查 FSRS 属性（`isFlashcardBlock`）
4. **同步卡片**：
   - 添加到 Riff Deck（`addRiffCards`）
   - 标记 FSRS 属性（`markBlockAsCard`）
   - 检测 Topic/Item 类型（`detectCardType`）
   - 初始化 A-Factor（Topic 卡片）
   - 保存到插件存储（`storage.setCard`）

### 类型检测

自动调用 `detectCardType()` 识别卡片类型：

```typescript
const cardType = await detectCardType(blockId);

const cardTypeAttrs: Record<string, string> = {
  'custom-fsrs-card-type': cardType,
};

// 如果是 Topic，初始化并存储 A-Factor
if (cardType === 'topic') {
  const aFactor = initializeAFactor(card.priority || 50);
  cardTypeAttrs['custom-fsrs-a-factor'] = aFactor.toString();
}

await setBlockAttrs(blockId, cardTypeAttrs);
```

## 启用自动制卡

用户可以在设置中启用自动制卡功能：

1. 打开插件设置
2. 找到"增量阅读"选项卡
3. 启用"自动制卡（实时监听）"选项
4. 保存设置

设置保存后，`TransactionObserver` 会自动启用，开始监听新卡片的创建。

## 现有触发方式

修复后，卡片类型检测有以下触发方式：

1. **自动触发（新增）**：通过 `TransactionObserver` 实时监听块的创建和更新
2. **手动触发**：浏览器中点击"识别 Topic/Item 类型"按钮
3. **启动触发**：插件启动时检查是否需要迁移，显示确认对话框
4. **批量触发**：通过 `migrateExistingCards()` 批量识别所有卡片

## 测试验证

1. 启用自动制卡功能
2. 创建新的闪卡块（包含 `::` 分隔符或标记语法）
3. 等待 2 秒（防抖延迟）
4. 检查控制台日志，应该看到：
   ```
   [FSRS] TransactionObserver initialized, autoCardEnabled: true
   [FSRS] Ops: insert <blockId>
   [FSRS] Processing queue, blocks: 1
   [FSRS] Topic card created: blockID=<blockId>, aFactor=3.6
   ```
5. 打开卡片浏览器，新卡片应该已经出现并标记了类型

## 相关文件

- `siyuan-plugin-fsrs/src/index.ts` - 插件入口，添加 TransactionObserver 初始化
- `siyuan-plugin-fsrs/src/core/box/TransactionObserver.ts` - 自动制卡逻辑
- `siyuan-plugin-fsrs/src/types/settings.ts` - 设置类型定义
- `siyuan-plugin-fsrs/src/core/card-builder/detectCardType.ts` - 类型检测算法
- `siyuan-plugin-fsrs/src/scripts/migrateToTopicItem.ts` - 批量迁移脚本

## 注意事项

1. **防抖延迟**：新卡片创建后需要等待 2 秒才会被处理，避免处理部分输入
2. **默认禁用**：自动制卡功能默认禁用，需要用户在设置中手动启用
3. **性能考虑**：批量处理时每批 10 个卡片，避免并发过多
4. **错误处理**：已删除的文档和正在索引的文档会被跳过，不会报错
