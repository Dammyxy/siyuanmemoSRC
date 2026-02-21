# 优先级持久化 Bug 修复：缓存未清除

## 问题

- 在"全部闪卡"视图修改优先级 50→32
- 刷新后显示 50（未持久化）
- 但在"队列视图"中显示 32（数据已保存）

## 根本原因

数据已经成功保存到 `UnifiedStorageManager`，但修改优先级后**没有清除 browserService 的缓存**，导致刷新时使用了缓存的旧数据。

## 修复

在 `DeckDataSource.performAction` 的 `set-priority` 操作中，添加缓存清除：

```typescript
// ✅ 清除缓存，确保刷新后显示最新数据
const { invalidateCardCache } = await import('../browserService');
invalidateCardCache();
console.log(`[SiYuanMemo][DeckDataSource] ✅ Cache invalidated after priority update`);
```

## 测试

1. ✅ 编译成功
2. 重启思源笔记
3. 在"全部闪卡"视图修改优先级
4. 刷新浏览器
5. 验证优先级是否正确显示

## 文件

- `src/ui/browser/datasource/DeckDataSource.ts` - 添加缓存清除
