# 优先级持久化问题诊断报告

## 问题描述

用户在"全部闪卡"视图中修改卡片优先级后，刷新浏览器，优先级没有持久化，又变回了原来的值。

## 日志分析

### 修改优先级时的日志

```
[SiYuanMemo][DeckDataSource] Got FSRSCard: {
  id: '20211020084142-v4m7d1n',
  blockId: '20211020084142-v4m7d1n',
  oldPriority: 11,  // ❌ 问题：修改前就是 11
  newPriority: 11   // ❌ 问题：修改后还是 11
}
[UpdateFSRSCardUseCase] ✅ Card updated successfully
[UnifiedStorage] Saved to msgpack: {version: 1, xiuyuans: 56, cards: 56}
```

### 关键发现

1. **修改前的优先级就是 11**：`oldPriority: 11`
2. **修改后的优先级还是 11**：`newPriority: 11`
3. **但是浏览器显示的是 50**

这说明：**浏览器显示的数据和存储中的数据不一致！**

---

## 根本原因

### 问题 1：浏览器刷新不会重新加载插件

**现象**：
- 用户点击浏览器刷新按钮（F5）
- 浏览器页面重新加载
- **但是思源插件不会重新加载！**

**原因**：
- 思源插件运行在思源笔记的主进程中
- 浏览器刷新只会重新加载前端页面
- 插件的 `onload()` 方法不会被调用
- `UnifiedStorageManager` 中的数据还是旧的

### 问题 2：浏览器视图使用内存中的旧数据

**数据流**：

```
浏览器刷新
  ↓
前端页面重新加载
  ↓
调用 browserService.getBrowserCards()
  ↓
GetBrowserCardsQueryHandler.execute()
  ↓
storageManager.getAllCards()  // ✅ 这里的 storageManager 是 UnifiedStorageManager
  ↓
返回内存中的数据  // ❌ 但是内存中的数据是旧的！
```

**关键点**：
- `UnifiedStorageManager` 在插件启动时加载数据到内存
- 修改优先级时，数据保存到文件 ✅
- 但是内存中的数据没有更新 ❌
- 浏览器刷新时，从内存读取旧数据 ❌

---

## 验证假设

### 假设 1：数据确实保存到文件了

**证据**：
```
[UnifiedStorage] Saved to msgpack: {version: 1, xiuyuans: 56, cards: 56}
```

这说明数据确实保存了。

### 假设 2：内存中的数据没有更新

**需要验证**：
1. 检查 `UnifiedStorageManager.updateCard()` 是否更新了内存中的数据
2. 检查 `CardMapper` 是否正确映射了 priority 字段

**验证结果**：

查看 `UnifiedStorageManager.updateCardDTO()` 代码：

```typescript
async updateCardDTO(dto: CardPersistenceDTO): Promise<Result<void>> {
  // ...
  
  // 更新 DTO
  this.cardDTOs.set(dto.id, dto);  // ✅ 更新了 DTO
  
  // 同时更新 FSRSCard（向后兼容）
  const fsrsCard = CardMapper.toDomain(dto);
  this.cards.set(dto.id, fsrsCard);  // ✅ 更新了 FSRSCard
  
  // ...
}
```

代码看起来是正确的！

### 假设 3：CardMapper 没有正确映射 priority

**验证结果**：

查看 `CardMapper.toPersistence()` 和 `CardMapper.toDomain()`：

```typescript
// toPersistence
priority: card.priority,  // ✅ 正确

// toDomain
priority: dto.priority,  // ✅ 正确
```

CardMapper 也是正确的！

---

## 真正的问题

### 问题定位

让我重新看日志：

```
[SiYuanMemo][DeckDataSource] Got FSRSCard: {
  id: '20211020084142-v4m7d1n',
  blockId: '20211020084142-v4m7d1n',
  oldPriority: 11,  // ❌ 这里就是 11
  newPriority: 11   // ❌ 这里还是 11
}
```

**关键发现**：
- 用户想把优先级从 50 改成 11
- 但是日志显示，修改前的优先级就是 11
- 这说明：**在调用 `manager.getCard()` 时，返回的卡片优先级就已经是 11 了！**

**可能的原因**：
1. 用户之前已经把优先级改成了 11
2. 数据已经保存到文件了
3. 但是浏览器显示的还是 50（缓存问题）

### 验证：浏览器缓存问题

**假设**：
- 浏览器视图在初始加载时，从存储读取了数据
- 数据被缓存在前端组件的状态中
- 修改优先级时，后端数据更新了
- 但是前端缓存没有更新
- 刷新浏览器时，前端重新从后端读取数据
- 但是后端返回的是内存中的旧数据

**需要检查**：
1. 浏览器视图是否有缓存机制
2. 修改优先级后，是否更新了前端缓存
3. 刷新浏览器时，是否清除了前端缓存

---

## 解决方案

### 方案 1：修改优先级后，立即更新前端显示

**位置**：`src/ui/browser/datasource/DeckDataSource.ts`

**当前代码**：
```typescript
// 更新内存中的值（用于 UI 显示）
card.priority = priority;
```

**问题**：
- 这只更新了传入的 `card` 对象
- 但是浏览器视图可能使用的是另一个对象

**解决方案**：
- 修改优先级后，触发浏览器视图刷新
- 或者返回更新后的卡片，让浏览器视图更新

### 方案 2：刷新浏览器时，强制重新加载数据

**位置**：浏览器视图组件

**当前行为**：
- 浏览器刷新时，前端页面重新加载
- 但是后端数据还是内存中的旧数据

**解决方案**：
- 浏览器刷新时，调用 `UnifiedStorageManager.load()` 重新加载数据
- 或者在浏览器视图初始化时，强制刷新数据

### 方案 3：检查是否有多个 UnifiedStorageManager 实例

**假设**：
- 可能有多个 `UnifiedStorageManager` 实例
- 修改优先级时，更新了一个实例
- 浏览器读取数据时，使用了另一个实例

**验证方法**：
- 在 `UnifiedStorageManager` 构造函数中添加日志
- 检查是否创建了多个实例

---

## 下一步行动

### 立即行动

1. **添加调试日志**：
   - 在 `DeckDataSource.performAction('set-priority')` 中，打印修改前后的完整卡片对象
   - 在 `UnifiedStorageManager.updateCard()` 中，打印更新前后的卡片对象
   - 在浏览器视图加载时，打印读取到的卡片对象

2. **验证数据一致性**：
   - 修改优先级后，立即调用 `manager.getCard()` 验证数据是否更新
   - 刷新浏览器后，调用 `manager.getCard()` 验证数据是否正确

3. **检查前端缓存**：
   - 查看浏览器视图组件的代码
   - 检查是否有缓存机制
   - 验证修改优先级后，前端缓存是否更新

### 长期改进

1. **实现响应式数据更新**：
   - 使用观察者模式
   - 数据更新时，自动通知所有订阅者
   - 前端视图自动刷新

2. **统一数据访问接口**：
   - 所有数据访问都通过 `UnifiedDataSourceManager`
   - 避免直接访问 `UnifiedStorageManager`
   - 确保数据一致性

---

## 总结

### 问题根源

**不是数据没有保存，而是浏览器显示的数据和存储中的数据不一致！**

可能的原因：
1. 前端缓存没有更新
2. 浏览器刷新时，后端返回的是内存中的旧数据
3. 有多个存储实例

### 关键洞察

日志显示：
```
oldPriority: 11, newPriority: 11
```

这说明在修改优先级时，存储中的数据就已经是 11 了。但是浏览器显示的是 50，说明**浏览器显示的数据来自缓存，而不是存储！**

### 建议

1. 添加详细的调试日志，追踪数据流
2. 验证前端缓存机制
3. 确保修改优先级后，前端立即刷新显示
4. 考虑实现响应式数据更新机制

---

## 日期

2026-02-21

## 状态

🔍 诊断中 - 需要更多日志来定位问题
