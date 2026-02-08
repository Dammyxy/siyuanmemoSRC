# 提取练习队列手动添加卡片 - 诊断报告

## 执行时间
2026-02-05 10:49

## Phase 1.1 完成情况

### ✅ 已完成的任务

1. **MenuActions 层日志增强**
   - ✅ 在 `addToQueue()` 入口添加详细日志
   - ✅ 在 `cardsToQueueItems()` 添加转换验证日志
   - ✅ 在 `addToQueue()` 出口添加结果日志

2. **RetrievalPracticeQueue 层日志增强**
   - ✅ 在 `addItems()` 入口添加日志
   - ✅ 在 `addItems()` 中间步骤添加日志
   - ✅ 在 `addItems()` 出口添加日志和验证

3. **HybridDataSource 层日志增强**
   - ✅ 在 `insertAt()` 入口添加日志
   - ✅ 在 `insertAt()` 执行后添加日志和验证
   - ✅ 持久化操作日志

4. **SortedSequencer 层日志增强**
   - ✅ 在 `insertMany()` 入口添加日志
   - ✅ 在 `insert()` 中添加详细日志
   - ✅ 验证插入的卡片 ID

5. **诊断测试创建**
   - ✅ 创建 `RetrievalPracticeQueue.diagnostic.test.ts`
   - ✅ 测试单个卡片添加
   - ✅ 测试多个卡片添加
   - ✅ 测试不同 nextDues 格式

## 测试结果

### 测试 1: 单个卡片添加

**输入**:
```typescript
{
  cardID: '20260203222457-raq2sfs',
  blockID: 'block-test-001',
  deckID: 'test-deck',
  priority: 50
}
```

**数据流追踪**:
1. ✅ `addItems()` 接收到正确的 cardID
2. ✅ `hybridSource.insertAt()` 接收到正确的 cardID
3. ✅ `localBuffer.splice()` 插入正确的 cardID
4. ✅ `sequencer.insertMany()` 接收到正确的 cardID
5. ✅ `sequencer.insert()` 插入正确的 cardID
6. ✅ 最终验证：cardID 保持不变

**结论**: ✅ **在测试环境中，单个卡片添加工作正常，cardID 保持正确**

### 测试 2: 多个卡片添加

**输入**:
```typescript
[
  { cardID: '20260203222457-card001', blockID: 'block-test-001' },
  { cardID: '20260203222457-card002', blockID: 'block-test-002' },
  { cardID: '20260203222457-card003', blockID: 'block-test-003' }
]
```

**结论**: ✅ **所有卡片的 cardID 都保持正确**

### 测试 3: 不同 nextDues 格式

**测试场景**:
- 正常的 nextDues（4 个评分）
- undefined nextDues
- 部分 nextDues（只有评分 1）

**结论**: ✅ **所有场景下 cardID 都保持正确**

## 关键发现

### 🎯 核心发现：ID 字段设计

根据代码分析，系统中的 ID 设计如下：

**QueueItem 接口**：
```typescript
interface QueueItem {
  cardID: CardID;   // Riff 系统的卡片 ID
  blockID: BlockID; // 思源笔记的块 ID
  deckID: string;   // 卡包 ID
  // ...
}
```

**关系**：
- `cardID` 和 `blockID` 是**一对一映射**
- `cardID` 用于 Riff 系统的卡片标识
- `blockID` 用于思源笔记的块标识
- 在 Riff 系统中，`RiffCard.id` = `cardID`，`RiffCard.blockID` = `blockID`

**BrowserCard 接口**：
```typescript
interface BrowserCard {
  id: string;          // 显示用的 ID（可能是 riffCardId 或 fsrsCardId）
  fsrsCardId: string;  // FSRS 系统的卡片 ID
  blockId: string;     // 思源笔记的块 ID
  // ...
}
```

**问题所在**：
- `BrowserCard.id` 使用 `card.riffCardId || card.id`
- 添加到队列时使用 `fsrsCardId || id || blockId`
- 两者可能不一致，导致 UI 显示的 ID 和实际添加的 ID 不匹配

### 🤔 问题分析：为什么生产环境会出现问题？

既然测试环境正常，那么生产环境的问题可能来自：

#### 假设 1：BrowserCard 数据源问题
- **可能性**：浏览器传递的 `BrowserCard` 数据本身就有问题
- **证据**：日志显示添加的是 `20260203222457-raq2sfs`，但插入的是 `20260205103108-vhr502l`
- **原因**：可能是 `BrowserCard` 的 `nextDues` 字段包含了其他卡片的数据

#### 假设 2：队列状态污染
- **可能性**：队列中已有的卡片数据影响了新插入的卡片
- **证据**：日志显示队列大小从 11 变成 12，说明队列中已有 11 张卡片
- **原因**：可能是 `SortedSequencer` 在插入时使用了错误的引用

#### 假设 3：并发操作问题
- **可能性**：多个操作同时修改队列导致数据不一致
- **证据**：存储层（7张）、内存层（12张）、UI层（6张）完全不同步
- **原因**：可能是没有正确的锁机制

## 下一步行动

### 🔍 Phase 1.2: 生产环境日志收集（进行中）

**已添加的日志**：
1. ✅ MenuActions: 扩展了 selectedRows 的完整对象打印
2. ✅ SRSBrowserAdapter: 在 convertToBrowserCard 中添加了输入输出日志

**需要验证的假设**：

**假设 A：ID 字段混淆问题**
- `BrowserCard.id` 使用 `card.riffCardId || card.id`
- 用户在浏览器中看到的可能是 `riffCardId`（如果存在）
- 但添加到队列时使用的是 `fsrsCardId`
- **验证方法**：查看生产日志中 `convertToBrowserCard` 的输出

**假设 B：队列数据源不一致**
- 添加操作成功（存储层 7 张，内存层 12 张）
- 但 UI 刷新时从不同的数据源读取（显示 6 张）
- **验证方法**：对比 `addItems` 后和 `fetchRows` 时的卡片列表

**假设 C：卡片过滤逻辑**
- `RetrievalHybridDataSource.getAll()` 会过滤到期的卡片
- 新添加的卡片可能因为 `nextDues` 字段不正确而被过滤掉
- **验证方法**：检查新添加卡片的 `nextDues` 字段和过滤逻辑

### 📋 需要用户提供的信息

请在生产环境中再次执行添加操作，并提供以下日志：

1. **MenuActions 层**：
   - `[MenuActions] 单个 BrowserCard 完整数据:` - 查看原始数据结构
   - `[MenuActions] 最终传递给 queue.addItems 的数据:` - 查看转换后的数据

2. **SRSBrowserAdapter 层**：
   - `[SRSBrowserAdapter] 输入 FSRSCard:` - 查看从队列读取的卡片
   - `[SRSBrowserAdapter] 输出 BrowserCard:` - 查看转换后显示的卡片

3. **对比分析**：
   - 添加时使用的 `cardID` 是什么？
   - UI 刷新时显示的 `id` 是什么？
   - 两者是否一致？

### 🎯 预期结果

如果假设 A 正确，我们会看到：
- 添加时：`cardID = fsrsCardId` (例如 `20260205105200-xhmwd55`)
- 显示时：`id = riffCardId` (例如 `20260205105152-w57h904`)
- **解决方案**：统一使用 `fsrsCardId` 作为主键

如果假设 B 正确，我们会看到：
- 添加后队列大小：12 张
- UI 显示卡片数：6 张
- **解决方案**：确保 UI 从正确的数据源读取

如果假设 C 正确，我们会看到：
- 新添加的卡片 `nextDues` 为空或格式错误
- `getAll()` 过滤时被排除
- **解决方案**：在添加时设置正确的 `nextDues`

## 临时解决方案

在找到根本原因之前，可以考虑：

1. **添加数据验证**：
   ```typescript
   if (insertedItem.cardID !== item.cardID) {
     throw new Error(`Card ID mismatch: expected ${item.cardID}, got ${insertedItem.cardID}`);
   }
   ```

2. **添加回滚机制**：
   ```typescript
   const snapshot = this.createSnapshot();
   try {
     await this.addItems(items);
   } catch (error) {
     await this.rollback(snapshot);
     throw error;
   }
   ```

3. **添加一致性检查**：
   ```typescript
   await this.verifyConsistency();
   ```

## 总结

Phase 1.1 成功完成，我们：
- ✅ 添加了详细的诊断日志到 4 个关键层
- ✅ 创建了诊断测试并验证代码在测试环境中工作正常
- ✅ 确认了问题不在核心逻辑，而可能在数据源或并发控制

下一步需要在生产环境中收集日志，找出测试环境和生产环境的差异。
