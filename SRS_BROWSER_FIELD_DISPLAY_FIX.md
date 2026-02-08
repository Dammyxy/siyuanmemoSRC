# SRS浏览器字段显示修复

## 修复内容

### 1. 新增日期格式化函数

在 `types.ts` 中新增了两个专用的日期格式化函数：

#### `formatDueDate` - 格式化到期时间
- 用于 **NextRep**（下次复习）字段
- 可以显示"已过期 X 天"（适用于过期的卡片）
- 逻辑：
  - 今天 → "今天 HH:MM"
  - 明天 → "明天 HH:MM"
  - 昨天 → "昨天"
  - 更早 → "已过期 X 天"
  - 未来 → "MM月DD日 HH:MM"

#### `formatHistoryDate` - 格式化历史时间
- 用于 **LastRep**（上次复习）和 **FirstRep**（首次复习）字段
- 显示具体日期，不显示"已过期"
- 逻辑：
  - 今天 → "今天 HH:MM"
  - 昨天 → "昨天 HH:MM"
  - 前天 → "前天 HH:MM"
  - 更早 → "YYYY年MM月DD日 HH:MM"（完整日期）

### 2. 修复 RetrievalDataSource 的字段映射

#### 修复点 1: 导入正确的格式化函数
```typescript
// 修改前
import { CardState, calculateRetrievability, formatDate, truncateContent } from '../types';

// 修改后
import { CardState, calculateRetrievability, formatDueDate, formatHistoryDate, truncateContent } from '../types';
```

#### 修复点 2: 正确处理时间戳
```typescript
// FSRSCard 的时间字段是 number 类型的时间戳（毫秒）
const dueDate = new Date(card.due);           // ✅ 正确
const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null; // ✅ 正确
```

#### 修复点 3: 修复 FirstRep 映射
```typescript
// 修改前（错误）
firstReview: lastReviewDate,  // ❌ 这是最后一次复习，不是首次复习

// 修改后（正确）
let firstReviewDate: Date | null = null;
if (card.reps > 0) {
  if (card.createdAt) {
    firstReviewDate = new Date(card.createdAt);  // ✅ 从创建时间获取
  } else if (lastReviewDate) {
    firstReviewDate = lastReviewDate;  // 降级方案
  }
}
firstReview: firstReviewDate,
```

#### 修复点 4: 使用正确的格式化函数
```typescript
// NextRep - 使用 formatDueDate（可以显示"已过期"）
due: dueDate,
dueFormatted: formatDueDate(dueDate),

// LastRep - 使用 formatHistoryDate（显示具体日期）
lastReview: lastReviewDate,
lastReviewFormatted: formatHistoryDate(lastReviewDate),

// FirstRep - 使用 formatHistoryDate（显示具体日期）
firstReview: firstReviewDate,
firstReviewFormatted: formatHistoryDate(firstReviewDate),
```

#### 修复点 5: 确保数值字段有默认值
```typescript
// 修改前
stability: card.stability,
difficulty: card.difficulty,
retrievability,
scheduledDays: card.scheduledDays,
interval: card.scheduledDays,

// 修改后（添加默认值 || 0）
stability: card.stability || 0,
difficulty: card.difficulty || 0,
retrievability: retrievability || 0,
scheduledDays: card.scheduledDays || 0,
interval: card.scheduledDays || 0,
```

### 3. 添加调试日志

在 `RetrievalDataSource.fetchRows` 中添加了详细的调试日志：

```typescript
// 🔍 调试：检查第一张卡片的原始数据
if (cards.length > 0) {
  console.log('[RetrievalDataSource] 📊 Sample FSRSCard data:', {
    id: cards[0].id,
    blockId: cards[0].blockId,
    scheduledDays: cards[0].scheduledDays,
    stability: cards[0].stability,
    difficulty: cards[0].difficulty,
    lastReview: cards[0].lastReview,
    lastReviewDate: cards[0].lastReview ? new Date(cards[0].lastReview) : null,
    due: cards[0].due,
    dueDate: new Date(cards[0].due),
    reps: cards[0].reps,
    lapses: cards[0].lapses,
    state: cards[0].state,
  });
}

// 🔍 调试：检查转换后的数据
if (browserCards.length > 0) {
  console.log('[RetrievalDataSource] 📊 Sample BrowserCard data:', {
    blockId: browserCards[0].blockId,
    interval: browserCards[0].interval,
    stability: browserCards[0].stability,
    difficulty: browserCards[0].difficulty,
    retrievability: browserCards[0].retrievability,
    lastReview: browserCards[0].lastReview,
    lastReviewFormatted: browserCards[0].lastReviewFormatted,
    due: browserCards[0].due,
    dueFormatted: browserCards[0].dueFormatted,
    firstReviewFormatted: browserCards[0].firstReviewFormatted,
  });
}
```

## 预期效果

### 修复前
- **Intrv**: 所有卡片都显示 `-`
- **LastRep**: 显示"已过期 14 天"
- **NextRep**: 显示"已过期 2 天"
- **FirstRep**: 显示"已过期 14 天"
- **Retr/Diff/Stab**: 显示 `0%` / `0.0` / `0.0d`

### 修复后
- **Intrv**: 显示实际间隔天数（如 `7d`、`14d`）
- **LastRep**: 显示具体日期（如 "2026年1月23日 14:30"）
- **NextRep**: 
  - 未过期：显示具体日期（如 "2月8日 14:30"）
  - 已过期：显示"已过期 2 天"（保持原有逻辑）
- **FirstRep**: 显示具体日期（如 "2026年1月23日 14:30"）
- **Retr/Diff/Stab**: 显示实际数值（如 `85%` / `5.2` / `12.5d`）

## 测试步骤

1. 打开 SRS 浏览器
2. 打开浏览器控制台（F12）
3. 查看调试日志：
   - `[RetrievalDataSource] 📊 Sample FSRSCard data:` - 检查原始数据
   - `[RetrievalDataSource] 📊 Sample BrowserCard data:` - 检查转换后的数据
4. 检查表格显示：
   - Intrv 列是否显示天数
   - LastRep/FirstRep 是否显示具体日期
   - Retr/Diff/Stab 是否显示数值

## 可能的问题

### 问题 1: Intrv 仍然显示 `-`

**原因**：FSRSCard 的 `scheduledDays` 字段为 0 或 undefined

**排查**：
1. 查看控制台日志中的 `scheduledDays` 值
2. 检查 UnifiedDataSourceManager 是否正确填充了该字段
3. 检查新卡片的默认值

### 问题 2: Retr/Diff/Stab 仍然显示 0

**原因**：FSRSCard 的这些字段为 0 或 undefined

**排查**：
1. 查看控制台日志中的 `stability`、`difficulty` 值
2. 检查卡片是否是新卡片（新卡片的这些值可能为 0）
3. 检查数据同步逻辑（Riff ↔ UnifiedDataSourceManager）

### 问题 3: FirstRep 显示 `-`

**原因**：FSRSCard 没有 `createdAt` 字段，且 `reps` 为 0

**解决**：
- 如果是新卡片（reps = 0），FirstRep 显示 `-` 是正常的
- 如果是已复习的卡片（reps > 0），需要检查 `createdAt` 字段是否存在

## 后续优化

1. **在 FSRSCard 中添加 `firstReview` 字段**
   - 在首次复习时记录时间戳
   - 避免依赖 `createdAt` 或 `lastReview`

2. **优化日期显示格式**
   - 支持用户自定义日期格式
   - 支持相对时间显示（如 "3 天前"）

3. **添加字段说明工具提示**
   - 在列标题添加 tooltip
   - 解释每个字段的含义

## 相关文件

- `siyuan-plugin-fsrs/src/ui/browser/types.ts` - 日期格式化函数
- `siyuan-plugin-fsrs/src/ui/browser/datasource/RetrievalDataSource.ts` - 数据转换逻辑
- `siyuan-plugin-fsrs/src/ui/browser/config/columnDefs.ts` - 列定义
- `siyuan-plugin-fsrs/src/types/card.ts` - FSRSCard 类型定义
