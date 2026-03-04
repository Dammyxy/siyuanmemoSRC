# SRS浏览器日期格式修复 - 完整版

## 问题描述

用户反馈 SRS 浏览器中的日期字段显示异常：
- **LastRep**（上次复习）显示"已过期 14 天"而不是具体日期
- **FirstRep**（首次复习）显示"已过期 14 天"而不是具体日期
- **NextRep**（下次复习）显示"已过期 2 天"（这个是正确的）

## 根本原因

`formatDate` 函数的逻辑是为"到期时间"设计的，会将过去的日期显示为"已过期 X 天"。但这个逻辑不适用于历史时间（LastRep/FirstRep），历史时间应该显示具体日期。

## 修复方案

### 1. 新增两个专用的日期格式化函数

在 `types.ts` 中：

```typescript
/** 格式化到期时间（用于 NextRep，可以显示"已过期"） */
export function formatDueDate(date: Date | null | undefined): string {
    if (!date) return '-';
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `明天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === -1) {
        return `昨天`;
    } else if (diffDays < -1) {
        return `已过期 ${Math.abs(diffDays)} 天`;  // ✅ 适用于到期时间
    }

    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 格式化历史时间（用于 LastRep/FirstRep，显示具体日期） */
export function formatHistoryDate(date: Date | null | undefined): string {
    if (!date) return '-';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 2) {
        return `前天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // ✅ 显示具体日期（包含年份）
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
```

### 2. 修复所有数据源文件

修复了以下文件中的日期格式化调用：

#### 2.1 browserService.ts
```typescript
// 导入
import { formatDueDate, formatHistoryDate } from './types';

// transformRiffBlock 函数
dueFormatted: formatDueDate(due),
lastReviewFormatted: formatHistoryDate(lastReview),
firstReviewFormatted: formatHistoryDate(firstReview),
```

#### 2.2 RetrievalDataSource.ts
```typescript
// 导入
import { formatDueDate, formatHistoryDate } from '../types';

// convertToBrowserCard 方法
dueFormatted: formatDueDate(dueDate),
lastReviewFormatted: formatHistoryDate(lastReviewDate),
firstReviewFormatted: formatHistoryDate(firstReviewDate),
```

#### 2.3 FinalDrillDataSource.ts
```typescript
// 导入
import { formatDueDate, formatHistoryDate } from '../types';

// convertToBrowserCard 方法
dueFormatted: formatDueDate(dueDate),
lastReviewFormatted: formatHistoryDate(lastReviewDate),
firstReviewFormatted: formatHistoryDate(lastReviewDate),
```

#### 2.4 FilterGroupDataSource.ts
```typescript
// 导入
import { formatDueDate, formatHistoryDate } from '../types';

// convertToBrowserCard 方法
dueFormatted: formatDueDate(dueDate),
lastReviewFormatted: formatHistoryDate(lastReviewDate),
firstReviewFormatted: formatHistoryDate(lastReviewDate),
```

#### 2.5 IncrementalLearningDataSource.ts
```typescript
// 导入
import { formatDueDate, formatHistoryDate } from '../types';

// convertToBrowserCard 方法
dueFormatted: formatDueDate(dueDate),
lastReviewFormatted: formatHistoryDate(lastReviewDate),
firstReviewFormatted: formatHistoryDate(lastReviewDate),
```

#### 2.6 QueryDataSource.ts
```typescript
// 导入
import { formatDueDate, formatHistoryDate } from '../types';

// transformSqlRow 函数
dueFormatted: formatDueDate(due),
lastReviewFormatted: formatHistoryDate(null),
firstReviewFormatted: formatHistoryDate(null),
```

## 修复的文件列表

1. ✅ `siyuan-plugin-fsrs/src/ui/browser/types.ts` - 新增格式化函数
2. ✅ `siyuan-plugin-fsrs/src/ui/browser/browserService.ts` - 修复 transformRiffBlock
3. ✅ `siyuan-plugin-fsrs/src/ui/browser/datasource/RetrievalDataSource.ts` - 修复 convertToBrowserCard
4. ✅ `siyuan-plugin-fsrs/src/ui/browser/datasource/FinalDrillDataSource.ts` - 修复 convertToBrowserCard
5. ✅ `siyuan-plugin-fsrs/src/ui/browser/datasource/FilterGroupDataSource.ts` - 修复 convertToBrowserCard
6. ✅ `siyuan-plugin-fsrs/src/ui/browser/datasource/IncrementalLearningDataSource.ts` - 修复 convertToBrowserCard
7. ✅ `siyuan-plugin-fsrs/src/ui/browser/datasource/QueryDataSource.ts` - 修复 transformSqlRow
8. ✅ `siyuan-plugin-fsrs/src/diagnostics/type-guards.ts` - 修复 normalizeToFSRSCard（降级方案）

## 预期效果

### 修复前
- **LastRep**: "已过期 14 天"
- **FirstRep**: "已过期 14 天"
- **NextRep**: "已过期 2 天"

### 修复后
- **LastRep**: "2026年1月23日 14:30"（具体日期）
- **FirstRep**: "2026年1月23日 14:30"（具体日期）
- **NextRep**: "已过期 2 天"（保持不变，这是正确的）

## 测试步骤

1. 重新编译插件：`npm run build`
2. 重启思源笔记
3. 打开 SRS 浏览器
4. 检查表格中的日期字段：
   - LastRep 应该显示具体日期
   - FirstRep 应该显示具体日期
   - NextRep 对于过期卡片显示"已过期 X 天"，对于未过期卡片显示具体日期

## 日期显示规则

### formatDueDate（用于 NextRep）
- 今天 → "今天 HH:MM"
- 明天 → "明天 HH:MM"
- 昨天 → "昨天"
- 更早（已过期）→ "已过期 X 天"
- 未来 → "MM月DD日 HH:MM"

### formatHistoryDate（用于 LastRep/FirstRep）
- 今天 → "今天 HH:MM"
- 昨天 → "昨天 HH:MM"
- 前天 → "前天 HH:MM"
- 更早 → "YYYY年MM月DD日 HH:MM"（完整日期）

## 相关问题修复

同时修复了 `normalizeToFSRSCard` 函数的卡片类型转换问题：
- 添加了降级方案，处理缺少 `type` 字段的 Riff 卡片
- 避免"Unknown card type"错误导致浏览器无法打开

## 后续优化建议

1. **用户自定义日期格式**
   - 允许用户在设置中选择日期格式
   - 支持相对时间显示（如 "3 天前"）

2. **国际化支持**
   - 支持多语言日期格式
   - 根据用户语言设置自动切换

3. **时区处理**
   - 正确处理不同时区的日期显示
   - 避免时区转换导致的日期错误
