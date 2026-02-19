# 浏览器 NextRep 格式修复

## 问题

用户发现 NextRep 字段显示的是相对时间（"x天后"），与 Intrv 字段（间隔天数）重复了。

根据 SuperMemo 的设计，NextRep 应该显示具体日期，而不是相对时间。

## SuperMemo 的设计

根据 SuperMemo 帮助文档：

- **Intrv**（间隔）：显示间隔天数，如 "10"（表示 10 天）
- **NextRep**（下次复习）：显示具体日期，如 "2025-01-11 10:00"

这样设计的好处：
1. **避免信息重复**：Intrv 已经显示了间隔天数，NextRep 不需要再显示"x天后"
2. **提供更多信息**：具体日期让用户知道确切的复习时间
3. **便于规划**：用户可以根据具体日期安排复习计划

## 问题原因

在 `DeckDataSource.ts` 中，有一个私有的 `formatDueDate` 方法使用了相对时间格式：

```typescript
// ❌ 错误的实现（相对时间）
private formatDueDate(date: Date): string {
  const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `已过期 ${-diffDays} 天`;
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  return `${diffDays} 天后`;  // ❌ 与 Intrv 重复
}
```

这导致：
- NextRep 显示："10天后"
- Intrv 显示："10"
- **信息重复**，用户无法看到具体日期

## 解决方案

修改 `DeckDataSource.ts` 的 `formatDueDate` 方法，使用具体日期格式：

```typescript
// ✅ 正确的实现（具体日期）
private formatDueDate(date: Date): string {
  if (!date || isNaN(date.getTime())) return '-';
  
  // 始终显示具体日期（包含年份）
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

这样：
- NextRep 显示："2025年1月11日 10:00"
- Intrv 显示："10"
- **信息互补**，用户可以同时看到间隔和具体日期

## 其他数据源

检查其他数据源，确认它们都使用了正确的格式：

### ✅ 已正确实现

以下数据源使用了 `types.ts` 中的 `formatDueDate` 函数（显示具体日期）：

- `RetrievalDataSource.ts`
- `IncrementalLearningDataSource.ts`
- `FinalDrillDataSource.ts`
- `FilterGroupDataSource.ts`
- `QueryDataSource.ts`
- `SRSBrowserAdapter.ts`
- `browserService.ts`
- `browserService.v2.ts`

### ❌ 已修复

- `DeckDataSource.ts` - 修改了私有的 `formatDueDate` 方法

## 对比示例

### 修复前

| Title | Intrv | NextRep |
|-------|-------|---------|
| 卡片1 | 10    | 10天后  |
| 卡片2 | 30    | 30天后  |
| 卡片3 | 90    | 90天后  |

**问题**：Intrv 和 NextRep 显示的信息重复

### 修复后

| Title | Intrv | NextRep |
|-------|-------|---------|
| 卡片1 | 10    | 2025年1月11日 10:00 |
| 卡片2 | 30    | 2025年2月10日 10:00 |
| 卡片3 | 90    | 2025年4月21日 10:00 |

**优势**：
- Intrv 显示间隔天数（快速了解记忆强度）
- NextRep 显示具体日期（便于规划复习时间）
- 信息互补，不重复

## 相关字段

### LastRep（上次复习）

也应该显示具体日期，使用 `formatHistoryDate` 函数：

```typescript
lastReviewFormatted: formatHistoryDate(lastReviewDate)
```

显示格式：`2025年1月1日 10:00`

### FirstRep（首次复习）

也应该显示具体日期，使用 `formatHistoryDate` 函数：

```typescript
firstReviewFormatted: formatHistoryDate(firstReviewDate)
```

显示格式：`2025年1月1日 10:00`

## 总结

- **Intrv**：显示间隔天数（如 "10"）
- **NextRep**：显示具体日期（如 "2025年1月11日 10:00"）
- **LastRep**：显示具体日期（如 "2025年1月1日 10:00"）
- **FirstRep**：显示具体日期（如 "2025年1月1日 10:00"）

这样设计符合 SuperMemo 的规范，避免信息重复，提供更多有用信息。

## 参考资料

- SuperMemo 帮助文档：`H:\project-F\flashcard\资料\supermemo\Browser - SuperMemo Help.md`
- 修复文件：`src/ui/browser/datasource/DeckDataSource.ts`
- 格式化函数：`src/ui/browser/types.ts`
