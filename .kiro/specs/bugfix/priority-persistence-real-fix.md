# 优先级持久化 Bug 真正修复

## 问题

- 在"全部闪卡"视图修改优先级 50→32
- 刷新后显示 50（未持久化）
- 但在"队列视图"中显示 32（数据已保存）

## 根本原因

`transformFSRSCard` 函数中，优先级从块属性读取，而不是从 `FSRSCard.priority` 读取：

```typescript
// ❌ 错误：从块属性读取
priority: parseInt(customAttrs[ATTR_PRIORITY] || '50') || 50,
```

但是：
1. 修改优先级时，更新的是 `FSRSCard.priority`（保存到 UnifiedStorageManager）
2. 刷新时，`transformFSRSCard` 从块属性读取，所以显示旧值
3. **我们已经把块属性的优先级都放到卡片数据里了**

## 修复

修改 `transformFSRSCard` 函数，从 `FSRSCard.priority` 读取优先级：

```typescript
// ✅ 正确：从 FSRSCard 读取
priority: card.priority,
```

## 修改的文件

- `src/ui/browser/browserService.ts` - 修改 `transformFSRSCard` 函数

## 测试

1. ✅ 编译成功
2. 重启思源笔记
3. 在"全部闪卡"视图修改优先级
4. 刷新浏览器
5. 验证优先级是否正确显示

## 相关

- `FSRSCard` 接口定义：`src/types/card.ts`
- 优先级字段：`priority: number` (0-100，越小越优先)
