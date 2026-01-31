# Task 14: 修复新卡片自动检测功能 - 完成总结

## 问题描述

用户报告：
1. 创建新卡片"融发测试"时，没有被自动识别并添加到浏览器
2. 重启思源后，卡片出现在浏览器但 CardType 显示 `-`（未识别类型）

## 根本原因

经过深入调查，发现 `TransactionObserver` 类存在但**从未被实例化和启用**：

1. **代码存在但未使用**：
   - `src/core/box/TransactionObserver.ts` 包含完整的自动检测逻辑（153-170 行）
   - 但没有任何代码创建 `new TransactionObserver(plugin)` 实例

2. **未初始化**：
   - `src/index.ts` 没有实例化 TransactionObserver
   - `src/managers/LifecycleManager.ts` 也没有实例化

3. **默认禁用**：
   - `src/types/settings.ts` 中 `autoCardEnabled` 默认为 `false`

## 修复方案

### 1. 添加 TransactionObserver 导入和属性

**文件**：`src/index.ts`

```typescript
// 添加导入
import { TransactionObserver } from '@/core/box/TransactionObserver';

// 添加实例属性
export default class FSRSPlugin extends Plugin {
  // ...
  private transactionObserver!: TransactionObserver;
  // ...
}
```

### 2. 初始化 TransactionObserver

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

### 3. 添加清理逻辑

在 `onunload()` 方法中：

```typescript
// 卸载 TransactionObserver
if (this.transactionObserver) {
  this.transactionObserver.unload();
}
```

## TransactionObserver 工作原理

### 监听机制

1. **监听 WebSocket 事件**：监听思源的 `ws-main` 事件
2. **捕获操作**：捕获块的 `insert` 和 `update` 操作
3. **防抖处理**：使用 2 秒防抖，避免处理部分输入
4. **批量处理**：收集待处理的块 ID，批量检测

### 自动制卡流程

```
用户创建/编辑块
    ↓
WebSocket 事件 (ws-main)
    ↓
TransactionObserver.handleTransaction()
    ↓
queueBlockCheck() - 添加到待处理队列
    ↓
防抖 2 秒
    ↓
processQueue() - 批量处理
    ↓
checkAndCreateCard() - 逐个检测
    ↓
1. 获取块内容 (getBlockKramdown)
2. 匹配策略 (CardBuilderContext.matchStrategy)
3. 检查现有状态 (Riff DB, Riff Attr, FSRS Attr)
4. 同步卡片 (addRiffCards, markBlockAsCard)
5. 检测类型 (detectCardType)
6. 初始化 A-Factor (Topic 卡片)
7. 保存到存储 (storage.setCard)
```

### 类型检测

自动调用 `detectCardType()` 识别卡片类型：

- **Item 判断**：
  - 包含标记语法 `==...==`
  - 包含分隔符 `::`
  - 标题块 (`type='h'`)
  - 列表项有列表子级 (`type='i'` + 子级 `type='i'|'l'`)
  - 超级块有任何子级 (`type='s'` + 任何子级)

- **Topic 判断**：
  - 不符合以上任何 Item 条件的块

- **A-Factor 初始化**：
  - Topic 卡片自动初始化 A-Factor（从优先级推导）
  - 公式：`aFactor = 1.2 + (priority / 100) * 4.8`
  - 范围：1.2 - 6.0

## 如何启用自动制卡

用户需要在设置中手动启用：

1. 打开插件设置
2. 找到"增量阅读"选项卡
3. 启用"自动制卡（实时监听）"选项
4. 保存设置

启用后，TransactionObserver 会自动监听新卡片的创建和编辑。

## 测试验证

### 测试步骤

1. 启用自动制卡功能（设置 → 增量阅读 → 自动制卡）
2. 创建新的闪卡块（包含 `::` 分隔符或标记语法 `==...==`）
3. 等待 2 秒（防抖延迟）
4. 检查控制台日志

### 预期日志

```
[FSRS] TransactionObserver initialized, autoCardEnabled: true
[FSRS] WS Event: transactions
[FSRS] Transaction received: 1
[FSRS] Ops: insert <blockId>
[FSRS] Processing queue, blocks: 1
[FSRS] checkAndCreateCard called for <blockId>
[FSRS] Check block <blockId>, content: ...
[FSRS] Strategy match result for <blockId>: ...
[FSRS] Card Status for <blockId>: RiffDB=false, RiffAttr=false, FSRSAttr=false
[FSRS] Syncing card for block <blockId>...
[FSRS] Adding to Riff Deck: ...
[FSRS] Topic card created: blockID=<blockId>, aFactor=3.6
```

### 验证结果

1. 打开卡片浏览器
2. 新卡片应该已经出现
3. CardType 列应该显示 `Topic` 或 `Item`（不再是 `-`）
4. Topic 卡片应该有 A-Factor 值

## 现有触发方式总结

修复后，卡片类型检测有以下触发方式：

| 触发方式 | 时机 | 范围 | 用户交互 | 优点 | 缺点 |
|---------|------|------|---------|------|------|
| **自动触发（实时）** | 创建/编辑时 | 单张 | 无需交互（启用后） | 完全自动、实时、防抖 | 默认禁用，需手动启用 |
| **手动触发（浏览器）** | 手动点击 | 全量 | 需要确认 | 可控、可重复执行 | 需要手动操作 |
| **启动触发** | 启动后 2s | 全量 | 需要确认 | 自动检测、首次使用友好 | 只执行一次 |

## 相关文件

### 修改的文件
- `siyuan-plugin-fsrs/src/index.ts` - 添加 TransactionObserver 初始化

### 新增的文档
- `siyuan-plugin-fsrs/docs/FIX_AUTO_CARD_DETECTION.md` - 详细修复说明
- `siyuan-plugin-fsrs/docs/TASK_14_SUMMARY.md` - 本文档

### 更新的文档
- `siyuan-plugin-fsrs/docs/TOPIC_ITEM_DETECTION_TRIGGERS.md` - 更新触发方式说明

### 相关文件（未修改）
- `siyuan-plugin-fsrs/src/core/box/TransactionObserver.ts` - 自动制卡逻辑
- `siyuan-plugin-fsrs/src/types/settings.ts` - 设置类型定义
- `siyuan-plugin-fsrs/src/core/card-builder/detectCardType.ts` - 类型检测算法
- `siyuan-plugin-fsrs/src/scripts/migrateToTopicItem.ts` - 批量迁移脚本

## 注意事项

1. **默认禁用**：自动制卡功能默认禁用，需要用户在设置中手动启用
2. **防抖延迟**：新卡片创建后需要等待 2 秒才会被处理
3. **性能考虑**：批量处理时每批 10 个卡片，避免并发过多
4. **错误处理**：已删除的文档和正在索引的文档会被跳过，不会报错
5. **向后兼容**：不影响现有的手动触发和启动触发方式

## 下一步建议

1. **测试验证**：
   - 启用自动制卡功能
   - 创建新卡片测试自动检测
   - 检查控制台日志确认工作正常

2. **用户文档**：
   - 在用户手册中说明如何启用自动制卡
   - 说明 2 秒防抖延迟的原因

3. **可选改进**：
   - 考虑将 `autoCardEnabled` 默认改为 `true`（需要评估性能影响）
   - 添加设置项调整防抖延迟时间
   - 添加右键菜单"重新识别类型"选项（单张卡片）

## 完成状态

✅ **已完成**：
- TransactionObserver 正确初始化
- 根据设置启用/禁用
- 添加清理逻辑
- 更新相关文档

✅ **已测试**：
- 代码编译无错误
- 类型检查通过
- 逻辑流程正确

⏳ **待用户验证**：
- 实际运行测试
- 创建新卡片验证自动检测
- 检查控制台日志
