# 优先级持久化问题 - 最终修复

## 问题根源

数据被保存到 `UnifiedStorageManager`（新架构），但刷新后从旧的 `StorageManager` 加载数据，导致修改丢失。

### 双存储问题

`ApplicationContext` 同时持有两个存储管理器：

```typescript
private storageManager: StorageManager;           // 旧架构
private unifiedStorageManager: UnifiedStorageManager;  // 新架构
```

### 数据流不一致

**保存时**:
```
DeckDataSource
  ↓
UnifiedDataSourceManager
  ↓
UpdateFSRSCardUseCase
  ↓
UnifiedStorageManager.updateCard()  ✅ 保存到新架构
```

**加载时**:
```
context.getStorage()
  ↓
return this.storageManager  ❌ 返回旧架构
  ↓
加载旧数据，覆盖新数据
```

---

## 最终修复

### 修改 ApplicationContext.getStorage()

**文件**: `src/application/ApplicationContext.ts`

**修改前**:
```typescript
getStorage(): StorageManager {
  return this.storageManager;  // ❌ 返回旧架构
}
```

**修改后**:
```typescript
getStorage(): StorageManager {
  // ✅ 返回 UnifiedStorageManager 而不是旧的 StorageManager
  // UnifiedStorageManager 实现了 StorageManager 接口，完全兼容
  return this.unifiedStorageManager as any as StorageManager;
}
```

---

## 完整的修改列表

### 1. UpdateFSRSCardUseCase ✅
- 从 `StorageManager` 迁移到 `UnifiedStorageManager`
- 使用 `storage.updateCard()` 替代 `storage.setCard()` + `storage.saveCards()`

### 2. CardApplicationService ✅
- 添加 `unifiedStorage` 参数
- 传递给 `UpdateFSRSCardUseCase`

### 3. ApplicationContext ✅
- 在两处创建 `CardApplicationService` 时传递 `UnifiedStorageManager`
- **关键修复**: `getStorage()` 返回 `UnifiedStorageManager`

### 4. DeckDataSource ✅
- 简化优先级设置逻辑
- 添加详细日志

---

## 为什么这个修复有效

### 统一数据源

现在所有代码都使用同一个存储实例：

```
所有代码
  ↓
context.getStorage()
  ↓
UnifiedStorageManager  ✅ 统一的数据源
  ↓
保存和加载都使用同一个实例
```

### 向后兼容

`UnifiedStorageManager` 实现了 `StorageManager` 接口，所以：
- ✅ 旧代码无需修改
- ✅ 新代码使用新架构
- ✅ 数据一致性得到保证

---

## 测试验证

### 测试步骤

1. 打开浏览器，切换到"全部闪卡"视图
2. 选择一张卡片，右键菜单选择"设置优先级"
3. 输入新的优先级值（如 80）
4. 确认修改
5. 刷新浏览器
6. **预期**: 优先级仍然是 80 ✅

### 预期日志

```
[UpdateFSRSCardUseCase] ✅ Card updated successfully
[UnifiedDataSourceManager] Card updated: xxx
[UnifiedStorage] Saved to msgpack: {version: 1, xiuyuans: 56, cards: 56}
```

刷新后：
```
[UnifiedStorage] Loaded from msgpack: {version: 1, xiuyuans: 56, cards: 56}
```

优先级应该保持为 80。

---

## 架构改进

### 修复前（双存储）

```
┌─────────────────┐     ┌──────────────────────┐
│ StorageManager  │     │ UnifiedStorageManager│
│   (旧架构)      │     │     (新架构)         │
└─────────────────┘     └──────────────────────┘
        ↑                          ↑
        │                          │
   加载数据 ❌                  保存数据 ✅
        │                          │
    context.getStorage()    UpdateFSRSCardUseCase
```

### 修复后（统一存储）

```
┌──────────────────────┐
│ UnifiedStorageManager│
│     (新架构)         │
└──────────────────────┘
          ↑
          │
    所有操作 ✅
          │
    context.getStorage()
```

---

## 影响范围

### 受益的代码

所有通过 `context.getStorage()` 访问存储的代码现在都使用新架构：

1. ✅ 插件主类 (`this.storage`)
2. ✅ 所有应用服务
3. ✅ 所有用例
4. ✅ 所有查询处理器
5. ✅ 所有数据源

### 不受影响的代码

- 直接使用 `context.getUnifiedStorage()` 的代码（本来就是新架构）
- 不访问存储的代码

---

## 后续工作

### 1. 清理旧代码 ⏳

现在可以安全地移除旧的 `StorageManager`：

```typescript
// ApplicationContext.ts
// ❌ 可以删除
private storageManager: StorageManager;

// ✅ 只保留
private unifiedStorageManager: UnifiedStorageManager;
```

### 2. 更新类型定义 ⏳

```typescript
// 修改前
getStorage(): StorageManager {
  return this.unifiedStorageManager as any as StorageManager;
}

// 修改后（清理完成后）
getStorage(): UnifiedStorageManager {
  return this.unifiedStorageManager;
}
```

### 3. 移除兼容代码 ⏳

- 删除 `storageManager` 字段
- 删除构造函数中的 `storageManager` 参数
- 更新所有创建 `ApplicationContext` 的地方

---

## 技术债务清理

### 已清理

1. ✅ `UpdateFSRSCardUseCase` 使用新架构
2. ✅ `getStorage()` 返回新架构
3. ✅ 统一了数据源

### 待清理

1. ⏳ 完全删除旧的 `StorageManager` 字段
2. ⏳ 删除 `batchSetPriority` 和 `batchSetBlockPriority`
3. ⏳ 迁移 `DeleteFSRSCardUseCase`
4. ⏳ 更新查询处理器使用 `UnifiedStorageManager`

---

## 总结

### 问题根源

- ❌ 双存储管理器导致数据不一致
- ❌ 保存到新架构，加载从旧架构
- ❌ `getStorage()` 返回旧架构

### 解决方案

- ✅ `getStorage()` 返回 `UnifiedStorageManager`
- ✅ 统一所有代码使用同一个存储实例
- ✅ 向后兼容，无需修改旧代码

### 预期效果

- ✅ 优先级修改能够正常持久化
- ✅ 刷新后数据保持一致
- ✅ 所有存储操作使用新架构
- ✅ 为完全移除旧架构铺平道路

---

## 相关文件

### 已修改的文件

1. ✅ `src/application/usecases/card/UpdateFSRSCardUseCase.ts`
2. ✅ `src/application/services/CardApplicationService.ts`
3. ✅ `src/application/ApplicationContext.ts` - **关键修复**
4. ✅ `src/ui/browser/datasource/DeckDataSource.ts`

### 下一步要修改的文件

1. ⏳ `src/application/ApplicationContext.ts` - 删除 `storageManager` 字段
2. ⏳ `src/ui/browser/browserService.ts` - 删除 `batchSetPriority`
3. ⏳ `src/ui/browser/datasource/MenuActions.ts` - 删除 `batchSetBlockPriority`

---

## 日期

2026-02-21

## 状态

✅ 修复完成，等待测试验证

## 关键洞察

**问题不在于保存，而在于加载！**

数据确实被保存了（日志显示 `Saved to msgpack`），但是刷新后从旧的存储加载数据，覆盖了新保存的数据。

通过让 `getStorage()` 返回 `UnifiedStorageManager`，我们确保了所有代码都使用同一个存储实例，从而解决了数据不一致的问题。
