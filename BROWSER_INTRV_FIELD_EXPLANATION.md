# 浏览器 Intrv 字段说明

## 问题

浏览器中的 `Intrv` 字段是什么意思？

## SuperMemo 的定义

根据 SuperMemo 帮助文档（`Browser - SuperMemo Help.md`）：

> **Intrv** - current **interval** of the element. This is the difference between _LastRep_ and _NextRep_ in days

翻译：
- **Intrv** = **Interval**（间隔）的缩写
- 表示元素的当前间隔
- 计算方式：`NextRep - LastRep`（以天为单位）

## 在我们的实现中

### 字段映射

在 `browserService.ts` 和 `browserService.v2.ts` 中：

```typescript
const sortFieldMap: Record<string, keyof FSRSCard> = {
  'intrv': 'interval',
  'interval': 'interval',
  // ...
};
```

### 列定义

在 `columnDefs.ts` 中：

```typescript
{
  field: 'interval',
  headerName: 'Intrv',  // 显示为 "Intrv"
  width: 55,
  sortable: true,
}
```

### 数据来源

`interval` 字段对应 FSRS 卡片的 `scheduledDays` 字段：

```typescript
// FSRSCard 类型
interface FSRSCard {
  scheduledDays: number;  // 当前间隔（天数）
  // ...
}
```

## 含义解释

### SuperMemo 的计算方式

```
Intrv = NextRep - LastRep
```

例如：
- LastRep（上次复习）：2025-01-01
- NextRep（下次复习）：2025-01-11
- Intrv（间隔）：10 天

### FSRS 的对应字段

在 FSRS 中，`scheduledDays` 就是这个间隔：

```typescript
// 评分后计算的间隔
const scheduledDays = Math.round(nextDue - now) / (24 * 60 * 60 * 1000);
```

## 用途

### 1. 排序

用户可以按 `Intrv` 排序，查看：
- 间隔最短的卡片（需要频繁复习）
- 间隔最长的卡片（已经记得很牢）

### 2. 筛选

可以筛选特定间隔范围的卡片：
- 短期记忆（< 7 天）
- 中期记忆（7-30 天）
- 长期记忆（> 30 天）

### 3. 分析

通过 `Intrv` 可以分析：
- 学习进度（间隔越长，记忆越牢固）
- 难度分布（间隔短的卡片可能更难）
- 复习负担（间隔短的卡片需要更频繁复习）

## 与 NextRep 的关系

### 设计理念

SuperMemo 的设计中，Intrv 和 NextRep 是互补的：

- **Intrv**：显示间隔天数（如 "10"）
  - 快速了解记忆强度
  - 间隔越长，记忆越牢固
  
- **NextRep**：显示具体日期（如 "2025年1月11日 10:00"）
  - 便于规划复习时间
  - 知道确切的复习日期

### 避免信息重复

如果 NextRep 也显示相对时间（"10天后"），就会与 Intrv 重复：

| Title | Intrv | NextRep（错误） |
|-------|-------|----------------|
| 卡片1 | 10    | 10天后         |

修复后，信息互补：

| Title | Intrv | NextRep（正确） |
|-------|-------|----------------|
| 卡片1 | 10    | 2025年1月11日 10:00 |

### 修复说明

在 `DeckDataSource.ts` 中，原本的 `formatDueDate` 方法使用了相对时间格式，已修复为显示具体日期。

详见：`BROWSER_NEXTREP_FORMAT_FIX.md`

## 与其他字段的关系

### LastRep（上次复习）

- SuperMemo：`lastReview` 时间戳
- FSRS：`lastReview` 时间戳

### NextRep（下次复习）

- SuperMemo：下次复习的日期
- FSRS：`due` 时间戳

### 计算关系

```typescript
// SuperMemo 的计算方式
intrv = (nextRep - lastRep) / (24 * 60 * 60 * 1000);  // 转换为天数

// FSRS 的存储方式
scheduledDays = intrv;  // 直接存储间隔天数
```

## 示例

### 新卡片

```typescript
{
  lastReview: 0,           // 从未复习
  due: 1704067200000,      // 2024-01-01
  scheduledDays: 0,        // 间隔 0 天
  // Intrv 显示：0
}
```

### 学习中的卡片

```typescript
{
  lastReview: 1704067200000,  // 2024-01-01
  due: 1704931200000,         // 2024-01-11
  scheduledDays: 10,          // 间隔 10 天
  // Intrv 显示：10
}
```

### 长期记忆卡片

```typescript
{
  lastReview: 1704067200000,  // 2024-01-01
  due: 1711929600000,         // 2024-04-01
  scheduledDays: 90,          // 间隔 90 天
  // Intrv 显示：90
}
```

## 总结

- **Intrv** = **Interval**（间隔）的缩写
- 表示当前复习间隔（天数）
- 在 FSRS 中对应 `scheduledDays` 字段
- 用于排序、筛选和分析学习进度
- 间隔越长，说明记忆越牢固

## 参考资料

- SuperMemo 帮助文档：`H:\project-F\flashcard\资料\supermemo\Browser - SuperMemo Help.md`
- 代码实现：
  - `src/ui/browser/browserService.ts`
  - `src/ui/browser/browserService.v2.ts`
  - `src/ui/browser/config/columnDefs.ts`
