# 修复：自动卡片类型检测（V2）

## 问题描述

用户报告的问题：
1. 闪卡加入卡片浏览器有延迟，且不会自动识别类型
2. 重启思源后，闪卡进入了浏览器，但也没识别卡片类型

## 根本原因分析

### 原因 1：TransactionObserver 未初始化（已修复）

`TransactionObserver` 类存在但从未被实例化和启用。

**修复**：在 `index.ts` 中添加初始化代码（已完成）

### 原因 2：已有卡片跳过类型检测（本次修复）

在 `TransactionObserver.checkAndCreateCard()` 中，第 130 行有逻辑缺陷：

```typescript
if (isRiffInDb && hasRiffAttr && isFsrsAttr) {
    // Completely done and synced
    return;  // ← 直接返回，没有检查卡片类型！
}
```

**问题**：
- 如果卡片已经在 Riff DB 中（`isRiffInDb = true`）
- 并且有 Riff 属性（`hasRiffAttr = true`）
- 并且有 FSRS 属性（`isFsrsAttr = true`）
- 代码就直接返回，**不会检查和标记卡片类型**

**影响**：
- ❌ 重启后的卡片没有被识别类型
- ❌ 手动添加到 Riff 的卡片没有类型标记
- ❌ 编辑已有卡片时不会重新检测类型

## 修复方案

### 修改 1：检查卡片类型是否已标记

在返回之前，检查卡片是否已经有类型标记：

```typescript
// 检查卡片类型是否已标记
const { getBlockAttrs } = await import('@/core/siyuan/api');
const attrs = await getBlockAttrs(blockId);
const hasCardType = attrs && (attrs['custom-fsrs-card-type'] === 'topic' || attrs['custom-fsrs-card-type'] === 'item');

if (isRiffInDb && hasRiffAttr && isFsrsAttr && hasCardType) {
    // Completely done and synced (including card type)
    console.log(`[FSRS] Card ${blockId} already fully synced with type: ${attrs['custom-fsrs-card-type']}`);
    return;
}

console.log(`[FSRS] Syncing card for block ${blockId}... (hasCardType: ${hasCardType})`);
```

**改进**：
- ✅ 只有当卡片**完全同步**（包括类型标记）时才返回
- ✅ 如果卡片缺少类型标记，继续执行检测逻辑

### 修改 2：优化卡片构建逻辑

只在需要时构建卡片对象：

```typescript
// 4. Build card object (generate metadata) - only if needed
let card;
if (!isRiffInDb || !hasRiffAttr || !isFsrsAttr) {
    card = await strategy.build(blockId, kramdown);
}
```

**改进**：
- ✅ 避免不必要的卡片构建
- ✅ 提高性能

### 修改 3：总是检测类型（除非已有）

将类型检测逻辑改为条件执行：

```typescript
// 6.5. 标记卡片类型和初始化 A-Factor（总是执行，除非已有类型）
if (!hasCardType) {
    const { detectCardType, initializeAFactor } = await import('@/core/card-builder');
    const cardType = await detectCardType(blockId);

    const cardTypeAttrs: Record<string, string> = {
        'custom-fsrs-card-type': cardType,
    };

    // 如果是 Topic，初始化并存储 A-Factor
    if (cardType === 'topic') {
        // 获取优先级（从已有卡片或默认值）
        const priority = card?.priority || parseInt(attrs?.['custom-fsrs-priority'] || '50', 10);
        const aFactor = initializeAFactor(priority);
        cardTypeAttrs['custom-fsrs-a-factor'] = aFactor.toString();
        console.log(`[FSRS] Topic card detected: blockID=${blockId}, aFactor=${aFactor}`);
    } else {
        console.log(`[FSRS] Item card detected: blockID=${blockId}`);
    }

    const { setBlockAttrs } = await import('@/core/siyuan/api');
    await setBlockAttrs(blockId, cardTypeAttrs);
}
```

**改进**：
- ✅ 即使卡片已存在，也会检测并标记类型
- ✅ 支持从已有属性获取优先级
- ✅ 避免重复标记（如果已有类型）

### 修改 4：条件保存卡片

只在创建新卡片时保存：

```typescript
// 7. Save to Plugin Storage (only if card was created)
if (card) {
    this.plugin.storage.setCard(card);
}
```

**改进**：
- ✅ 避免不必要的存储操作
- ✅ 提高性能

## 修复后的工作流程

### 场景 1：新卡片创建

1. 用户创建新卡片（包含 `::` 或 `==...==`）
2. TransactionObserver 监听到 `insert` 事件
3. 检查卡片状态：`isRiffInDb=false, hasRiffAttr=false, isFsrsAttr=false, hasCardType=false`
4. 构建卡片对象
5. 添加到 Riff Deck
6. 标记 FSRS 属性
7. **检测并标记卡片类型**
8. 保存到插件存储

**结果**：✅ 新卡片被完整创建并标记类型

### 场景 2：重启后的已有卡片

1. 用户重启思源，卡片已在 Riff DB 中
2. 用户编辑卡片内容
3. TransactionObserver 监听到 `update` 事件
4. 检查卡片状态：`isRiffInDb=true, hasRiffAttr=true, isFsrsAttr=true, hasCardType=false`
5. 跳过卡片构建（已存在）
6. 跳过添加到 Riff（已存在）
7. 跳过标记 FSRS 属性（已存在）
8. **检测并标记卡片类型**（缺少类型）
9. 跳过保存（卡片未创建）

**结果**：✅ 已有卡片被补充类型标记

### 场景 3：完全同步的卡片

1. 卡片已完全同步（包括类型）
2. 用户编辑卡片内容
3. TransactionObserver 监听到 `update` 事件
4. 检查卡片状态：`isRiffInDb=true, hasRiffAttr=true, isFsrsAttr=true, hasCardType=true`
5. **直接返回**（无需任何操作）

**结果**：✅ 避免不必要的操作，提高性能

## 测试验证

### 测试 1：新卡片创建

1. 启用自动制卡功能
2. 创建新卡片：`【 item 测试::答案】`
3. 等待 2 秒
4. 检查控制台日志：
   ```
   [FSRS] Ops: insert <blockId>
   [FSRS] Card Status for <blockId>: RiffDB=false, RiffAttr=false, FSRSAttr=false
   [FSRS] Syncing card for block <blockId>... (hasCardType: false)
   [FSRS] Item card detected: blockID=<blockId>
   ```
5. 打开卡片浏览器，CardType 应显示 `Item`

### 测试 2：重启后的卡片

1. 重启思源（卡片已在 Riff DB 中，但没有类型）
2. 编辑卡片内容
3. 等待 2 秒
4. 检查控制台日志：
   ```
   [FSRS] Ops: update <blockId>
   [FSRS] Card Status for <blockId>: RiffDB=true, RiffAttr=true, FSRSAttr=true
   [FSRS] Syncing card for block <blockId>... (hasCardType: false)
   [FSRS] Item card detected: blockID=<blockId>
   ```
5. 打开卡片浏览器，CardType 应显示 `Item`

### 测试 3：完全同步的卡片

1. 卡片已有类型标记
2. 编辑卡片内容
3. 等待 2 秒
4. 检查控制台日志：
   ```
   [FSRS] Ops: update <blockId>
   [FSRS] Card Status for <blockId>: RiffDB=true, RiffAttr=true, FSRSAttr=true
   [FSRS] Card <blockId> already fully synced with type: item
   ```
5. 无需任何操作

## 相关文件

### 修改的文件
- `siyuan-plugin-fsrs/src/core/box/TransactionObserver.ts` - 修复类型检测逻辑

### 相关文档
- `siyuan-plugin-fsrs/docs/FIX_AUTO_CARD_DETECTION.md` - 初次修复说明
- `siyuan-plugin-fsrs/docs/TOPIC_ITEM_DETECTION_TRIGGERS.md` - 触发方式说明
- `siyuan-plugin-fsrs/docs/AUTO_CARD_DETECTION_GUIDE.md` - 用户使用指南

## 注意事项

1. **防抖延迟**：编辑卡片后需要等待 2 秒才会触发检测
2. **默认禁用**：自动制卡功能默认禁用，需要在设置中手动启用
3. **性能优化**：已有卡片只在缺少类型时才会检测，避免重复操作
4. **向后兼容**：不影响现有的手动触发和启动触发方式

## 修复日期

- **初次修复**：2026-01-31（添加 TransactionObserver 初始化）
- **本次修复**：2026-01-31（修复已有卡片类型检测）
