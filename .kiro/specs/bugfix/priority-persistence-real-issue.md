# 优先级持久化问题 - 真正的原因

## 问题分析

### 用户报告

1. 修改优先级：50 → 13
2. 数据保存成功（日志显示）
3. 刷新浏览器后显示 50 ❌

### 日志分析

```
[UnifiedStorageManager] updateCardDTO - Before update: {oldPriority: 12, newPriority: 13}
[UnifiedStorage] Saved to msgpack: {version: 1, xiuyuans: 56, cards: 56}
```

**关键发现**：
- 日志显示 `oldPriority: 12`，不是 50
- 说明用户多次修改了优先级：50 → 12 → 13
- 但是刷新后显示的是 50

## 真正的原因

### 防抖延迟导致数据未保存

**代码位置**：`src/core/storage/UnifiedStorageManager.ts`

```typescript
private readonly SAVE_DELAY = 1000; // 1 秒延迟

private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) {
        clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
        this.save().catch(error => {
            console.error('Failed to auto-save:', error);
        });
    }, this.SAVE_DELAY);
}
```

**问题**：
1. `updateCard()` 调用 `scheduleSave()`
2. `scheduleSave()` 设置 1 秒延迟
3. **如果用户在 1 秒内刷新浏览器，数据还没有保存到文件！**
4. 刷新浏览器时，插件不会重新启动
5. `UnifiedStorageManager` 中的内存数据还是旧的（50）

### 为什么日志显示"Saved to msgpack"？

**两种可能**：
1. **延迟保存**：1 秒后自动保存成功，但用户已经刷新了浏览器
2. **之前的保存**：日志显示的是之前某次操作的保存，不是这次修改优先级的保存

### 为什么队列视图有效？

**可能的原因**：
1. 队列视图的修改操作后，用户等待了足够长的时间（> 1 秒）
2. 或者队列视图有立即保存的机制

## 解决方案

### 方案 1：浏览器关闭前强制保存（推荐）

在浏览器 `beforeunload` 事件中，强制立即保存数据。

**实现位置**：`src/ui/browser/SRSBrowser.vue`

```typescript
onMounted(() => {
  // 监听浏览器关闭/刷新事件
  const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
    // 强制立即保存数据
    const context = props.plugin.getContext();
    const storage = context.getUnifiedStorage();
    await storage.save();
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });
});
```

**优点**：
- 确保数据在浏览器关闭前保存
- 不影响正常的防抖机制

**缺点**：
- `beforeunload` 事件中的异步操作可能不可靠
- 浏览器可能在保存完成前就关闭了

### 方案 2：修改优先级后立即保存

在 `DeckDataSource.performAction('set-priority')` 中，调用立即保存。

**实现位置**：`src/ui/browser/datasource/DeckDataSource.ts`

```typescript
case 'set-priority': {
  // ... 修改优先级的代码 ...
  
  // ✅ 立即保存（不使用防抖）
  const storage = this.manager.getAdvancedRouter().storage;
  await storage.save();  // 立即保存
  
  break;
}
```

**优点**：
- 确保优先级修改立即保存
- 简单直接

**缺点**：
- 绕过了防抖机制
- 频繁修改优先级会导致频繁 I/O

### 方案 3：减少防抖延迟

将 `SAVE_DELAY` 从 1000ms 减少到 100ms。

**实现位置**：`src/core/storage/UnifiedStorageManager.ts`

```typescript
private readonly SAVE_DELAY = 100; // 100ms 延迟（原来是 1000ms）
```

**优点**：
- 减少数据丢失的风险
- 保留防抖机制

**缺点**：
- 仍然有数据丢失的风险（虽然概率降低）
- 增加 I/O 频率

### 方案 4：组合方案（最佳）

1. **保留防抖机制**：正常情况下使用 1 秒延迟
2. **关键操作立即保存**：优先级修改、删除卡片等关键操作立即保存
3. **浏览器关闭前保存**：监听 `beforeunload` 事件

## 推荐实施方案

### 第一步：修改 `DeckDataSource.performAction('set-priority')`

在修改优先级后，立即保存数据。

```typescript
case 'set-priority': {
  // ... 修改优先级的代码 ...
  
  // ✅ 立即保存（不使用防抖）
  const context = this.plugin.getContext();
  const storage = context.getUnifiedStorage();
  await storage.save();
  
  console.log('[DeckDataSource] Priority changes saved immediately');
  
  break;
}
```

### 第二步：添加 `beforeunload` 监听（可选）

在 `SRSBrowser.vue` 中添加浏览器关闭前保存的逻辑。

```typescript
onMounted(() => {
  const handleBeforeUnload = () => {
    // 同步保存（beforeunload 中异步操作不可靠）
    const context = props.plugin.getContext();
    const storage = context.getUnifiedStorage();
    
    // 如果有未保存的数据，立即保存
    if (storage.dirty) {
      // 注意：这里只能使用同步操作
      // 异步操作可能在浏览器关闭前无法完成
      console.warn('[SRSBrowser] Unsaved data detected on page unload');
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });
});
```

## 验证方法

1. 修改优先级：50 → 13
2. **立即刷新浏览器**（不等待 1 秒）
3. 检查优先级是否保持为 13

## 日期

2026-02-21

## 状态

🔧 待修复
